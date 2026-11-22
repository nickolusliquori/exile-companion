#!/usr/bin/env python3
"""Put a regenerated data file back to its previous copy when only its version label changed.
Usage: keep-if-same.py <folder with previous copies> <file>..."""
import base64, hashlib, json, os, re, shutil, sys, zlib

def unpack(x, key=None):
    # compressed tables (timeless jewels) are compared by their decompressed bytes: zlib builds differ between
    # machines, so the same table can compress to different bytes
    if key == "data" and isinstance(x, str):
        try: return "raw:" + hashlib.sha256(zlib.decompress(base64.b64decode(x))).hexdigest()
        except Exception: return x
    if isinstance(x, dict): return {k: unpack(v, k) for k, v in x.items()}
    if isinstance(x, list): return [unpack(v) for v in x]
    return x

def body(path):
    s = open(path, encoding="utf-8").read()
    s = s[s.index("=") + 1:s.rindex(";")] if "=" in s else s
    d = json.loads(s)
    if isinstance(d, dict): d.pop("v", None)
    return unpack(d)

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
