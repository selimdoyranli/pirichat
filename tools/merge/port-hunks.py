#!/usr/bin/env python3
"""Bir dosyanın base..theirs farkından yalnız anahtar kelimeye değen parçaları alıp 3 yollu uygular.
Kullanım: port-hunks.py <base-ref> <theirs-ref> <regex> <dosya...>. Repo kökünden çalıştır.
Parça seçimi: '+' ya da '-' satırlarından en az biri regex'e uyan hunk'lar. Çıktı: dosya başına durum."""
import re, subprocess, sys, tempfile, os
base, theirs, rx = sys.argv[1], sys.argv[2], re.compile(sys.argv[3])
for path in sys.argv[4:]:
    d = subprocess.run(['git','diff',base,theirs,'--',path], capture_output=True).stdout.decode('utf-8','replace')
    if not d.strip(): print(f"{path}: fark yok"); continue
    header, *hunks = re.split(r'(?m)^(?=@@ )', d)
    keep = [h for h in hunks if any(rx.search(l) for l in h.split('\n') if l[:1] in '+-' and not l.startswith(('+++','---')))]
    if not keep: print(f"{path}: anahtar kelimeye değen parça yok ({len(hunks)} parça atlandı)"); continue
    patch = header + ''.join(keep)
    with tempfile.NamedTemporaryFile('w', suffix='.patch', delete=False) as f: f.write(patch); tmp=f.name
    r = subprocess.run(['git','apply','--3way','--recount', tmp], capture_output=True, text=True)
    os.unlink(tmp)
    status = 'OK' if r.returncode == 0 else 'ÇAKIŞMA/HATA'
    print(f"{path}: {status} ({len(keep)}/{len(hunks)} parça)"); 
    if r.returncode: print('   ' + (r.stderr.strip().splitlines()[-1] if r.stderr.strip() else ''))
