"""Builds app/timelessdata.js from Path of Building Community's MIT-licensed timeless jewel data
(src/Data/TimelessJewelData) and the app's own 3.30 tree (app/treedata.js).
Only notables within the timeless jewel radius of a main-tree jewel socket are kept.
Usage: python3 scripts/timeless.py <path to PoB repo>"""
import sys, re, json, zlib, base64, math, os
pob = sys.argv[1]; D = os.path.join(pob, "src/Data/TimelessJewelData")
here = os.path.dirname(os.path.abspath(__file__)); app = os.path.join(here, "..", "app")

def lua_to_py(src):
    src = re.sub(r"--[^\n]*", "", src)
    src = src[src.index("{"):src.rindex("}") + 1]
    src = re.sub(r'\["([^"]*)"\]\s*=', lambda m: json.dumps(m.group(1)) + ":", src)
    src = re.sub(r"\[(\d+)\]\s*=", r'"#\1":', src)
    src = re.sub(r",(\s*[}\]])", r"\1", src)
    o = json.loads(src)
    def fix(v):
        if isinstance(v, dict):
            if v and all(k.startswith("#") for k in v):
                return [fix(v[k]) for k in sorted(v, key=lambda k: int(k[1:]))]
            return {k: fix(x) for k, x in v.items()}
        if isinstance(v, list): return [fix(x) for x in v]
        return v
    return fix(o)

legion = lua_to_py(open(os.path.join(D, "LegionPassives.lua")).read())
# NodeIndexMapping is assignments, not one table
nim = {}; l2g = {}
for line in open(os.path.join(D, "NodeIndexMapping.lua")):
    m = re.match(r'nodeIDList\["size(Notable)?"\] = (\d+)', line)
    if m: nim["sizeNotable" if m.group(1) else "size"] = int(m.group(2)); continue
    m = re.match(r"nodeIDList\[(\d+)\] = \{ index = (\d+)", line)
    if m: nim[int(m.group(1))] = int(m.group(2)); continue
    m = re.match(r'nodeIDList\["localIdToGlobalId"\]\[(\d+)\]\[(\d+)\] = (\d+)', line)
    if m: l2g.setdefault(int(m.group(1)), {})[int(m.group(2))] = int(m.group(3))
ADD = 337
JEWELS = {2: ("Lethal Pride", 10000, 18000, "karui"), 3: ("Brutal Restraint", 500, 8000, "maraketh"),
          4: ("Militant Faith", 2000, 10000, "templar"), 5: ("Elegant Hubris", 2000, 160000, "eternal"),
          6: ("Heroic Tragedy", 100, 8000, "kalguur")}
CONQ = {"vaal": ["Xibaqua", "Zerphi", "Doryani", "Mazcotl"], "maraketh": ["Deshret", "Asenath", "Nasima", "Balbala"],
        "eternal": ["Cadiro", "Victario", "Chitus", "Caspiro"], "karui": ["Kaom", "Rakiata", "Kiloava", "Akoya"],
        "templar": ["Venarius", "Dominus", "Avarius", "Maxarius"], "kalguur": ["Vorana", "Uhtred", "Medved"]}
CID = {"Xibaqua": "1", "Zerphi": "2", "Doryani": "3", "Mazcotl": "2_v2", "Deshret": "1", "Asenath": "2", "Nasima": "3", "Balbala": "1_v2",
       "Cadiro": "1", "Victario": "2", "Chitus": "3", "Caspiro": "3_v2", "Kaom": "1", "Rakiata": "2", "Kiloava": "3", "Akoya": "3_v2",
       "Venarius": "1", "Dominus": "2", "Avarius": "3", "Maxarius": "1_v2", "Vorana": "1", "Uhtred": "2", "Medved": "3"}

tsrc = open(os.path.join(app, "treedata.js")).read()
tree = json.loads(tsrc[tsrc.index("{"):tsrc.rindex("}") + 1])
nodes = {n[0]: n for n in tree["nodes"]}
sockets = [n for n in tree["nodes"] if n[3] == "j"]
R2 = 1800 ** 2
inrad = {}
for s in sockets:
    inrad[s[0]] = [n[0] for n in tree["nodes"] if n[0] != s[0] and n[3] in "nsk" and (n[1]-s[1])**2 + (n[2]-s[2])**2 <= R2]
keep = sorted({i for l in inrad.values() for i in l if nodes[i][3] == "n" and i in nim and nim[i] < nim["sizeNotable"]})

used = set(); out = {"v": "PoB " + sys.argv[2] if len(sys.argv) > 2 else "PoB", "notables": keep, "jewels": {}}
for jt, (name, lo, hi, ctype) in JEWELS.items():
    raw = zlib.decompress(open(os.path.join(D, name.replace(" ", "") + ".zip"), "rb").read())
    size = (hi - lo) // (20 if jt == 5 else 1) + 1
    assert len(raw) == nim["sizeNotable"] * size, (name, len(raw), size)
    buf = bytearray()
    for nid in keep:
        idx = nim[nid]
        row = raw[idx * size:(idx + 1) * size]
        assert len(row) == size, (name, nid)
        buf += row
        used.update(l2g.get(jt, {}).get(b, b) for b in row)
    out["jewels"][name] = {"id": jt, "min": lo, "max": hi, "step": 20 if jt == 5 else 1, "type": ctype,
        "conq": CONQ[ctype], "l2g": l2g.get(jt, {}), "data": base64.b64encode(zlib.compress(bytes(buf), 9)).decode()}
def slim(e): return {"n": e.get("dn"), "s": e.get("sd") if isinstance(e.get("sd"), list) else [], "id": e.get("id")}
out["nodes"] = [slim(e) for e in legion["nodes"]]
out["additions"] = [slim(e) for e in legion["additions"]]
out["sockets"] = {str(s[0]): [i for i in inrad[s[0]]] for s in sockets}
out["tree"] = {str(i): [nodes[i][3], nodes[i][4], nodes[i][5]] for s in sockets for i in inrad[s[0]]}
def label(sk):
    best = sorted((n for n in tree["nodes"] if n[3] in "nk" and n[0] in inrad[sk[0]]), key=lambda n: ((n[3] != "k"), (n[1]-sk[1])**2 + (n[2]-sk[2])**2))
    return best[0][4] if best else "socket %d" % sk[0]
out["labels"] = {str(sk[0]): label(sk) for sk in sockets}
TRADE = {"Lethal Pride": ["kaom", "rakiata", "akoya"], "Brutal Restraint": ["asenath", "nasima", "balbala"], "Militant Faith": ["avarius", "dominus", "maxarius"],
         "Elegant Hubris": ["cadiro", "victario", "caspiro"], "Heroic Tragedy": ["vorana", "uhtred", "medved"]}
for k, v in TRADE.items(): out["jewels"][k]["trade"] = ["explicit.pseudo_timeless_jewel_" + x for x in v]
out["small"] = {"templar": next(i for i, n in enumerate(out["nodes"]) if n["id"] == "templar_devotion_node"),
                "eternal": next(i for i, n in enumerate(out["nodes"]) if n["id"] == "eternal_small_blank")}
out["keystones"] = {f"{t}_{c}": next((n for n in out["nodes"] if n["id"] == f"{t}_keystone_{CID[c]}"), None) for t, cs in CONQ.items() for c in cs}
js = "/* Timeless jewel data from Path of Building Community (MIT, src/Data/TimelessJewelData), cut to notables near jewel sockets. Built by scripts/timeless.py. */\nwindow.TIMELESS=" + json.dumps(out, separators=(",", ":")) + ";\n"
open(os.path.join(app, "timelessdata.js"), "w").write(js)
print("notables kept", len(keep), "of", nim["sizeNotable"], "| sockets", len(sockets), "| size", len(js) // 1024, "KB", "| keystones missing", [k for k, v in out["keystones"].items() if not v])
