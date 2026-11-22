"""Builds app/clusterdata.js from Path of Building Community's MIT-licensed data:
src/Data/ClusterJewels.lua (enchants), src/Data/ModJewelCluster.lua (notables and weights)
and the newest src/TreeData/<version>/tree.lua (notable stats). Usage: python3 scripts/clusters.py <path to PoB repo>"""
import sys, re, json, os
pob = sys.argv[1]; here = os.path.dirname(os.path.abspath(__file__))
cj = open(os.path.join(pob, "src/Data/ClusterJewels.lua")).read()
sizes = {}
for size, start in (("Small", "Small Cluster Jewel"), ("Medium", "Medium Cluster Jewel"), ("Large", "Large Cluster Jewel")):
    i = cj.index('["%s"]' % start); j = cj.find('["', cj.index("skills", i))
    block = cj[i:cj.index("notableSortOrder") if size == "Large" else cj.index('["', cj.index("totalIndicies", cj.index('["', i + 5)) ) ]
    m = re.search(r"minNodes = (\d+),\s*maxNodes = (\d+)", block)
    skills = []
    for sm in re.finditer(r'\["(affliction_[a-z_0-9]+)"\] = \{\s*name = "([^"]+)".*?tag = "([^"]+)",\s*stats = \{ (.*?) \},', block, re.S):
        skills.append({"tag": sm.group(3), "name": sm.group(2), "stats": re.findall(r'"([^"]*)"', sm.group(4))})
    sizes[size] = {"min": int(m.group(1)), "max": int(m.group(2)), "skills": skills}
# the newest non-Ruthless tree folder, e.g. src/TreeData/3_31
def _ver(d):
    try: return tuple(int(x) for x in d.split("_"))
    except ValueError: return None
TREE_DIR = max((d for d in os.listdir(os.path.join(pob, "src/TreeData")) if _ver(d)), key=_ver)
tree = open(os.path.join(pob, "src/TreeData", TREE_DIR, "tree.lua")).read()
def stats_for(name):
    k = tree.find('["name"] = %s,' % json.dumps(name))
    if k < 0: return []
    s = tree.find('["stats"] = {', k)
    if s < 0 or 0 <= tree.find('["name"]', k + 10) < s: return []
    e = tree.index("}", s)
    return [x.replace("\\\n", " ") for x in re.findall(r'"((?:[^"\\]|\\.)*)"', tree[s + 13:e], re.S)]
notables = []
for line in open(os.path.join(pob, "src/Data/ModJewelCluster.lua")):
    m = re.search(r'type = "(Prefix|Suffix)", affix = "Notable", "1 Added Passive Skill is ([^"]+)".*?level = (\d+).*?weightKey = \{ (.*?) \}, weightVal = \{ (.*?) \}, weightMultiplierKey = \{ (.*?) \}, weightMultiplierVal = \{ (.*?) \}', line)
    if not m: continue
    wk = re.findall(r'"([^"]+)"', m.group(4)); wv = [int(x) for x in re.findall(r"-?\d+", m.group(5))]
    mk = re.findall(r'"([^"]+)"', m.group(6)); mv = [int(x) for x in re.findall(r"-?\d+", m.group(7))]
    w = {k: v for k, v in zip(wk, wv) if k != "default" and v > 0}
    if not w: continue
    mult = dict(zip(mk, mv))
    sz = [s for s, k in (("Large", "expansion_jewel_large"), ("Medium", "expansion_jewel_medium"), ("Small", "expansion_jewel_small")) if mult.get(k, mult.get("default", 100)) > 0]
    notables.append({"n": m.group(2), "t": m.group(1)[0], "lv": int(m.group(3)), "w": w, "s": stats_for(m.group(2))})
out = {"v": "PoB " + (sys.argv[2] if len(sys.argv) > 2 else ""), "sizes": sizes, "notables": notables}
js = "/* Cluster jewel data from Path of Building Community (MIT). Built by scripts/clusters.py. */\nwindow.CLUSTERDATA=" + json.dumps(out, separators=(",", ":")) + ";\n"
open(os.path.join(here, "..", "app", "clusterdata.js"), "w").write(js)
print({k: len(v["skills"]) for k, v in sizes.items()}, "notables", len(notables), "no stats", [n["n"] for n in notables if not n["s"]][:8], len(js) // 1024, "KB")
