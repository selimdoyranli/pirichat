#!/usr/bin/env python3
"""Tek taraflı parçaları otomatik çözer: bizim taraf boşsa onlarınki, onlarınki boşsa bizimki; ikisi de doluysa
varsayılan taraf (--default ours|theirs) alınır ve dosya 'elle bak' listesine yazılır. Kullanım:
auto-resolve.py --default ours <dosya...>"""
import re, sys
args=sys.argv[1:]; default='ours'
if args and args[0]=='--default': default=args[1]; args=args[2:]
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n(.*?))?=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
review=[]
for p in args:
    s=open(p,encoding='utf-8').read(); both=0
    def pick(m):
        global both
        ours,theirs=m.group(1),m.group(3)
        if ours.strip()=='' : return theirs
        if theirs.strip()=='': return ours
        both+=1; return ours if default=='ours' else theirs
    s2=pat.sub(pick,s); open(p,'w',encoding='utf-8').write(s2)
    if both: review.append((p,both))
for p,n in review: print(f"ELLE BAK {n:2d} {p}")
print(f"{len(args)} dosya, {len(review)} dosyada çift taraflı parça ({default} alındı)")
