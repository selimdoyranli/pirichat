#!/usr/bin/env python3
"""3 yollu .po birleştirme: git merge çakışmasındaki bir katalog için base/ours/theirs aşamalarını okur, entry
düzeyinde birleştirir ve dosyayı yazar. Kullanım: po-3way.py <repo-içi-yol> [...]. Repo kökünden çalıştır.

Kural (msgid+msgctxt anahtarı):
- yalnız bir tarafta değişen entry o tarafın hali;
- iki tarafta aynı değişiklik: aynı;
- iki taraf farklı değiştirdi: bizim (pirichat markası) hali kalır, sayılır;
- bir tarafın sildiği, diğerinin değiştirmediği entry silinir;
- bir tarafın eklediği entry gelir.
"""
import subprocess, sys, polib, io

def stage(path, n):
    out = subprocess.run(["git", "show", f":{n}:{path}"], capture_output=True)
    if out.returncode != 0:
        return None
    return polib.pofile(out.stdout.decode("utf-8"))

def key(e):
    return (e.msgctxt or "", e.msgid, e.msgid_plural or "")

def same(a, b):
    return a is not None and b is not None and a.msgstr == b.msgstr and a.msgstr_plural == b.msgstr_plural and a.flags == b.flags

for path in sys.argv[1:]:
    base, ours, theirs = (stage(path, 1), stage(path, 2), stage(path, 3))
    if ours is None or theirs is None:
        print(f"{path}: aşama eksik", file=sys.stderr); sys.exit(1)
    b = {key(e): e for e in base} if base else {}
    o = {key(e): e for e in ours}
    t = {key(e): e for e in theirs}
    result = polib.POFile()
    result.metadata = theirs.metadata or ours.metadata
    result.header = ours.header
    kept = 0; conflicts = 0
    seen = set()
    # order: theirs' order first (upstream'in sırası), sonra yalnız bizde olanlar
    order = [key(e) for e in theirs] + [k for k in (key(e) for e in ours) if k not in t]
    for k in order:
        if k in seen: continue
        seen.add(k)
        eb, eo, et = b.get(k), o.get(k), t.get(k)
        if eo is None and et is None: continue
        if eo is None:            # biz silmişiz ya da hiç yoktu
            if eb is None: pick = et          # upstream ekledi
            elif same(eb, et): continue       # biz sildik, upstream dokunmadı
            else: pick = et                   # biz sildik, upstream değiştirdi: upstream kazanır
        elif et is None:
            if eb is None: pick = eo          # biz ekledik
            elif same(eb, eo): continue       # upstream sildi, biz dokunmadık
            else: pick = eo                   # upstream sildi, biz değiştirdik: bizimki kalır
        else:
            if same(eo, et): pick = et
            elif eb is not None and same(eb, eo): pick = et
            elif eb is not None and same(eb, et): pick = eo
            else: pick = eo; conflicts += 1
        result.append(pick); kept += 1
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(str(result))
    print(f"{path}: {kept} entry, {conflicts} çift taraflı (bizimki tutuldu)")
