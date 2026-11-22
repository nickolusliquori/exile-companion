#!/usr/bin/env bash
# Fetches the latest game data sources and regenerates the app's data files:
#   GGG skilltree-export / atlastree-export -> app/treedata.js, app/atlasdata.js   (scripts/trees.py)
#   RePoE export (repoe-fork)                -> app/craftdata.js, app/mapmods.js     (scripts/craftdata.py, mapmods.py)
#   Path of Building Community               -> app/timelessdata.js, app/clusterdata.js (scripts/timeless.py, clusters.py)
# Writes data/sources.json with what was used. Files whose data didn't change (only their version label would)
# are left as they were, so a quiet week produces no diff. Usage: scripts/update-data.sh [work folder]
set -euo pipefail
cd "$(dirname "$0")/.."
W="${1:-$(mktemp -d)}"
clone() { rm -rf "$2"; git clone -q --depth 1 --filter=blob:none --sparse "$1" "$2"; }

echo "Fetching GGG tree exports"
clone https://github.com/grindinggear/skilltree-export "$W/skill"; git -C "$W/skill" sparse-checkout set --no-cone /data.json
clone https://github.com/grindinggear/atlastree-export "$W/atlas"; git -C "$W/atlas" sparse-checkout set --no-cone /data.json
ver() { git -C "$1" log -1 --format=%s | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[a-z]?' | head -1; }
SV="$(ver "$W/skill")"; AV="$(ver "$W/atlas")"; SV="${SV:-$(git -C "$W/skill" rev-parse --short HEAD)}"; AV="${AV:-$(git -C "$W/atlas" rev-parse --short HEAD)}"

echo "Fetching RePoE export"
clone https://github.com/repoe-fork/repoe-fork.github.io "$W/repoe"
git -C "$W/repoe" sparse-checkout set --no-cone /exported-version.txt /data/mods.json /data/base_items.json /data/essences.json /data/fossils.json /data/crafting_bench_options.json /data/item_classes.json
RV="$(tr -d '\r\n ' < "$W/repoe/exported-version.txt")"

echo "Fetching Path of Building data"
clone https://github.com/PathOfBuildingCommunity/PathOfBuilding "$W/pob"
TD="$(git -C "$W/pob" ls-tree -d --name-only HEAD src/TreeData/ | sed 's#.*/##' | grep -E '^[0-9]+_[0-9]+$' | sort -t_ -k1,1n -k2,2n | tail -1)"
git -C "$W/pob" sparse-checkout set --no-cone /LICENSE.md /src/Data/TimelessJewelData/ /src/Data/ClusterJewels.lua /src/Data/ModJewelCluster.lua "/src/TreeData/$TD/tree.lua"
PV="$(git -C "$W/pob" rev-parse --short HEAD)"

echo "Regenerating (trees $SV / $AV, RePoE $RV, PoB $PV)"
FILES="app/treedata.js app/atlasdata.js app/craftdata.js app/mapmods.js app/timelessdata.js app/clusterdata.js"
B="$W/before"; mkdir -p "$B"; for f in $FILES; do cp "$f" "$B/$(basename "$f")"; done
python3 scripts/trees.py "$W/skill" "$W/atlas" "$SV" "$AV"
python3 scripts/craftdata.py "$W/repoe/data" "$RV"
python3 scripts/mapmods.py "$W/repoe/data" "$RV"
python3 scripts/clusters.py "$W/pob" "$PV"
python3 scripts/timeless.py "$W/pob" "$PV"
python3 scripts/keep-if-same.py "$B" $FILES

python3 - "$SV" "$AV" "$RV" "$PV" "$TD" <<'PY'
import json, sys
sv, av, rv, pv, td = sys.argv[1:]
json.dump({"skilltree": sv, "atlastree": av, "repoe": rv, "pob": pv, "pobTree": td}, open("data/sources.json", "w"), indent=2)
open("data/sources.json", "a").write("\n")
PY
echo "Done."
