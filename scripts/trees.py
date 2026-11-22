#!/usr/bin/env python3
"""Build app/treedata.js and app/atlasdata.js from GGG's official tree exports.

Usage: python3 scripts/trees.py <skilltree-export folder> <atlastree-export folder> <skill version> <atlas version>
       (https://github.com/grindinggear/skilltree-export and .../atlastree-export, each with data.json)

Node positions follow GGG's documented orbit layout. Ascendancy nodes, cluster-jewel proxies and the sockets
inside cluster jewels are left out. Output: nodes [id, x, y, type, name, stats, group, orbit] with type
c(lass start) m(astery) j(ewel socket) k(eystone) n(otable) s(mall); edges [a, b, arc] by node index.
"""
import json, math, os, sys

A16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]
A40 = [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220,
       225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350]

def build(D):
    C = D["constants"]; R = C["orbitRadii"]; SPO = C["skillsPerOrbit"]
    def ang(o, i):
        n = SPO[o]
        return A16[i] if n == 16 else A40[i] if n == 40 else 360 * i / n
    def pos(nd):
        g = D["groups"][str(nd["group"])]; o = nd.get("orbit", 0); a = math.radians(ang(o, nd.get("orbitIndex", 0)))
        return round(g["x"] + R[o] * math.sin(a)), round(g["y"] - R[o] * math.cos(a))
    def ntype(nd):
        if "classStartIndex" in nd: return "c"
        if nd.get("isMastery"): return "m"
        if nd.get("isJewelSocket"): return "j"
        if nd.get("isKeystone"): return "k"
        if nd.get("isNotable"): return "n"
        return "s"
    keep = [(k, v) for k, v in D["nodes"].items()
            if k != "root" and "group" in v and not v.get("ascendancyName") and not v.get("isProxy")
            and not (v.get("expansionJewel") or {}).get("parent")]
    nodes, idx = [], {}
    for k, v in keep:
        x, y = pos(v); idx[k] = len(nodes)
        nodes.append([int(k), x, y, ntype(v), v.get("name", ""), "\n".join(v.get("stats", [])), v["group"], v.get("orbit", 0)])
    edges, seen = set(), set()
    for k, v in keep:
        for o in v.get("out", []):
            if o not in idx: continue
            w = D["nodes"][o]
            if ntype(v) == "m" or ntype(w) == "m" or ("classStartIndex" in v and "classStartIndex" in w): continue
            arc = 1 if v["group"] == w["group"] and v.get("orbit", 0) == w.get("orbit", 0) and v.get("orbit", 0) > 0 else 0
            a, b = sorted((idx[k], idx[o])); edges.add((a, b, arc))
    out = {"nodes": nodes, "edges": [list(e) for e in sorted(edges)],
           "groups": {k: [round(g["x"]), round(g["y"])] for k, g in D["groups"].items()},
           "radii": C["orbitRadii"], "bounds": [D["min_x"], D["min_y"], D["max_x"], D["max_y"]]}
    cs = {str(v["classStartIndex"]): int(k) for k, v in keep if "classStartIndex" in v}
    if cs: out["classStarts"] = cs
    return out

# Atlas nodes carry a mechanic category (the Atlas page colours and counts by it). It isn't in GGG's data:
# existing nodes keep the category they already had (node ids survive patches); new nodes get one by keyword.
ATLAS_WORDS = [("heretics", r"torment|heretic|exodus of souls"), ("rares", r"rare monster"), ("mercenaries", r"mercenar"),
    ("betrayal", r"betrayal|syndicate|jun\b|junnotable|safehouse"), ("divcards", r"divination"), ("expedition", r"expedition|logbook|kalguur|runic monster|gwennen|tujen|dannig|\brog\b"),
    ("threads", r"thread"), ("strongbox", r"strongbox"), ("essence", r"essence"), ("breach", r"breach"), ("ultimatum", r"ultimatum"),
    ("blight", r"blight"), ("ritual", r"ritual"), ("abyss", r"abyss"), ("shrine", r"shrine"), ("harvest", r"harvest|sacred grove|lifeforce|sacred flora"),
    ("legion", r"legion"), ("rogue", r"rogue exile"), ("incursion", r"incursion|alva|temple"), ("bestiary", r"bestiary|beast"),
    ("exarch", r"exarch|cleansing fire"), ("eater", r"eater of worlds|tangle"), ("delirium", r"delirium|delirious"), ("beyond", r"beyond"),
    ("eldershaper", r"elder|shaper"), ("azmeri", r"azmeri|wildwood|wisp"), ("sentinel", r"sentinel"), ("mirage", r"mirage"), ("monsters", r"monster"), ("maps", r"map")]
def atlas_categories(data, D, previous):
    import re
    for n in data["nodes"]:
        if n[0] in previous: n.append(previous[n[0]]); continue
        d = D["nodes"][str(n[0])]
        if n[3] == "m": n.append("general"); continue
        txt = " ".join([d.get("name", ""), " ".join(d.get("stats", [])), d.get("icon", "")]).lower()
        n.append(next((c for c, rx in ATLAS_WORDS if re.search(rx, txt)), "general"))

def write(path, var, label, data):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"/* From GGG's official {label}. Node positions follow GGG's documented orbit layout. */\n")
        f.write(f"window.{var}=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

if __name__ == "__main__":
    skill, atlas, sv, av = sys.argv[1:5]
    app = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
    s = build(json.load(open(os.path.join(skill, "data.json"), encoding="utf-8")))
    AD = json.load(open(os.path.join(atlas, "data.json"), encoding="utf-8"))
    a = build(AD)
    prev = {}
    try:
        old = open(os.path.join(app, "atlasdata.js"), encoding="utf-8").read()
        prev = {n[0]: n[8] for n in json.loads(old[old.index("{"):old.rindex("}") + 1])["nodes"] if len(n) > 8}
    except Exception:
        pass
    atlas_categories(a, AD, prev)
    s["v"] = sv; a["v"] = av
    write(os.path.join(app, "treedata.js"), "SKILLTREE", f"skilltree-export ({sv})", s)
    write(os.path.join(app, "atlasdata.js"), "ATLASTREE", f"atlastree-export ({av})", a)
    print(f"passive tree: {len(s['nodes'])} nodes, {len(s['edges'])} edges; atlas tree: {len(a['nodes'])} nodes, {len(a['edges'])} edges")
