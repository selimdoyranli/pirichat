#!/usr/bin/env python3
"""3 yollu JSON katalog birleştirme (weblate locales, messages.json). Anahtar bazında, iç içe sözlüklerde özyinelemeli.
Kullanım: json-3way.py <repo-içi-yol> [...]. Repo kökünden çalıştır. Kural po-3way.py ile aynı."""
import subprocess, sys, json

def stage(path, n):
    out = subprocess.run(["git", "show", f":{n}:{path}"], capture_output=True)
    return json.loads(out.stdout.decode("utf-8")) if out.returncode == 0 else None

stats = {"conflicts": 0}

def merge(b, o, t):
    if isinstance(o, dict) and isinstance(t, dict):
        b = b if isinstance(b, dict) else {}
        out = {}
        for k in list(t.keys()) + [k for k in o.keys() if k not in t]:
            vb, vo, vt = b.get(k), o.get(k), t.get(k)
            if k not in o and k not in t: continue
            if k not in o:
                if k not in b: out[k] = vt
                elif vb == vt: continue
                else: out[k] = vt
            elif k not in t:
                if k not in b: out[k] = vo
                elif vb == vo: continue
                else: out[k] = vo
            else:
                out[k] = merge(vb, vo, vt)
        return out
    if o == t: return t
    if b is not None and b == o: return t
    if b is not None and b == t: return o
    stats["conflicts"] += 1
    return o

for path in sys.argv[1:]:
    base, ours, theirs = stage(path, 1), stage(path, 2), stage(path, 3)
    if ours is None or theirs is None:
        print(f"{path}: aşama eksik", file=sys.stderr); sys.exit(1)
    stats["conflicts"] = 0
    result = merge(base, ours, theirs)
    raw = subprocess.run(["git", "show", f":3:{path}"], capture_output=True).stdout.decode("utf-8")
    indent = "\t" if raw.startswith("{\n\t") else 2
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=indent)
        f.write("\n")
    print(f"{path}: {stats['conflicts']} çift taraflı (bizimki tutuldu)")
