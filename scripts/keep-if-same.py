#!/usr/bin/env python3
"""Put a regenerated data file back to its previous copy when only its version label changed.
Usage: keep-if-same.py <folder with previous copies> <file>..."""
import json, os, re, shutil, sys

def body(path):
    s = open(path, encoding="utf-8").read()
    s = s[s.index("=") + 1:s.rindex(";")] if "=" in s else s
    d = json.loads(s)
    if isinstance(d, dict): d.pop("v", None)
    return d

before = sys.argv[1]
for f in sys.argv[2:]:
    old = os.path.join(before, os.path.basename(f))
    try:
        if os.path.exists(old) and body(old) == body(f):
            shutil.copyfile(old, f); print(f"{f}: unchanged")
        else:
            print(f"{f}: updated")
    except Exception as e:
        print(f"{f}: compared as changed ({e})")
