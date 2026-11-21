#!/usr/bin/env python3
"""Build app/craftdata.js from a RePoE export (https://repoe-fork.github.io, MIT licence).

Usage:  python3 scripts/craftdata.py <folder with mods.json, base_items.json, essences.json,
                                       fossils.json, crafting_bench_options.json, item_classes.json>
                                      <exported-version, e.g. 3.30.0.4>

Keeps only what the Craft lab needs: equipment bases, the prefixes/suffixes that can roll on them
(with spawn weights per tag), essences, fossils and bench crafts.
"""
import json, os, sys

src, version = sys.argv[1], sys.argv[2]
load = lambda n: json.load(open(os.path.join(src, n + ".json"), encoding="utf-8"))
mods, bases, essences, fossils, bench, classes = (load(n) for n in
    ["mods", "base_items", "essences", "fossils", "crafting_bench_options", "item_classes"])

CLASSES = ["Amulet", "Ring", "Belt", "Helmet", "Body Armour", "Gloves", "Boots", "Shield", "Quiver",
           "Bow", "Claw", "Dagger", "Rune Dagger", "One Hand Axe", "One Hand Mace", "One Hand Sword",
           "Thrusting One Hand Sword", "Sceptre", "Wand", "Staff", "Warstaff", "Two Hand Axe",
           "Two Hand Mace", "Two Hand Sword", "Jewel", "AbyssJewel"]
DOMAINS = {"item", "abyss_jewel", "jewel"}

# ---- bases
out_bases, seen = [], set()
for key, b in bases.items():
    if b.get("release_state") != "released" or b.get("item_class") not in CLASSES or b.get("domain") not in DOMAINS:
        continue
    name = b.get("name")
    if not name or name in seen:
        continue
    seen.add(name)
    impl = [mods[i]["text"] for i in b.get("implicits", []) if i in mods and mods[i].get("text")]
    out_bases.append({"n": name, "c": b["item_class"], "t": b["tags"], "l": b.get("drop_level") or 1,
                      "d": b["domain"], "i": impl})
out_bases.sort(key=lambda x: (CLASSES.index(x["c"]), -x["l"], x["n"]))
base_tags = set(t for b in out_bases for t in b["t"])
for c in CLASSES:
    ic = classes.get(c) or {}
    base_tags.update(ic.get("influence_tags") or [])

# ---- rollable mods
def compact_weights(ws):
    return [[w["tag"], w["weight"]] for w in ws]

out_mods = {}
for mid, m in mods.items():
    if m.get("generation_type") not in ("prefix", "suffix") or m.get("domain") not in DOMAINS:
        continue
    if m.get("is_essence_only"):
        continue
    ws = m.get("spawn_weights") or []
    if not any(w["weight"] > 0 and w["tag"] in base_tags for w in ws):
        continue
    out_mods[mid] = {"g": "p" if m["generation_type"] == "prefix" else "s", "n": m.get("name") or "",
                     "grp": (m.get("groups") or [m.get("type")])[0], "ty": m.get("type"),
                     "l": m.get("required_level") or 1, "x": m.get("text") or mid, "w": compact_weights(ws),
                     "gw": compact_weights(m.get("generation_weights") or []), "tags": m.get("implicit_tags") or [],
                     "d": m["domain"]}

# ---- essence-only and bench mods are looked up by id
extra = {}
def add_extra(mid):
    if mid in out_mods or mid in extra or mid not in mods:
        return
    m = mods[mid]
    extra[mid] = {"g": "p" if m.get("generation_type") == "prefix" else "s", "n": m.get("name") or "",
                  "grp": (m.get("groups") or [m.get("type")])[0], "ty": m.get("type"), "l": m.get("required_level") or 1,
                  "x": m.get("text") or mid, "tags": m.get("implicit_tags") or [], "d": m.get("domain")}

name_of = lambda k: (bases.get(k) or {}).get("name") or k.split("/")[-1]

out_ess = []
for key, e in essences.items():
    if not e.get("mods"):
        continue
    nm = name_of(key)
    if not nm or "Remnant" in nm:
        continue
    ms = {c: mid for c, mid in e["mods"].items() if c in CLASSES}
    for mid in ms.values():
        add_extra(mid)
    out_ess.append({"n": nm, "lv": e.get("level"), "il": e.get("item_level_restriction"), "m": ms})
out_ess.sort(key=lambda x: (x["n"].split(" of ")[-1], x["lv"] or 0))

out_fos = []
for key, f in fossils.items():
    nm = f.get("name")
    if not nm:
        continue
    out_fos.append({"n": nm, "pos": compact_weights(f.get("positive_mod_weights") or []),
                    "neg": compact_weights(f.get("negative_mod_weights") or []),
                    "d": list((f.get("descriptions") or {}).values()), "lucky": bool(f.get("rolls_lucky"))})
out_fos.sort(key=lambda x: x["n"])

out_bench = []
for o in bench:
    mid = (o.get("actions") or {}).get("add_explicit_mod")
    if not mid or mid not in mods:
        continue
    add_extra(mid)
    cls = [c for c in o.get("item_classes") or [] if c in CLASSES]
    if not cls:
        continue
    out_bench.append({"m": mid, "c": cls, "cost": {name_of(k): v for k, v in (o.get("cost") or {}).items()}})

inf = {c: (classes.get(c) or {}).get("influence_tags") or [] for c in CLASSES}
data = {"v": version, "bases": out_bases, "mods": out_mods, "extra": extra, "essences": out_ess,
        "fossils": out_fos, "bench": out_bench, "influence": inf}
js = ("/* Crafting data for the Craft lab. Generated by scripts/craftdata.py from the RePoE export "
      f"(https://repoe-fork.github.io, MIT licence) of Path of Exile {version}. Game data (c) Grinding Gear Games. */\n"
      "window.CRAFTDATA=" + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n")
dest = os.path.join(os.path.dirname(__file__), "..", "app", "craftdata.js")
open(dest, "w", encoding="utf-8").write(js)
print(f"{len(out_bases)} bases, {len(out_mods)} mods, {len(extra)} extra, {len(out_ess)} essences, "
      f"{len(out_fos)} fossils, {len(out_bench)} bench crafts -> {len(js)/1e6:.2f} MB")
