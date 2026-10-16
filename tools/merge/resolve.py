#!/usr/bin/env python3
"""Çakışma parçalarını sırayla seçerek çözer. Kullanım: resolve.py <dosya> <seçimler>
seçimler: parça başına virgülle ayrılmış ours|theirs|both|both-rev (both = önce bizimki sonra upstream).
Tek seçim verilirse bütün parçalara uygulanır. diff3 'base' bölümü varsa atlanır."""
import sys, re
path, spec = sys.argv[1], sys.argv[2]
choices = spec.split(',')
lines = open(path, encoding='utf-8').read().split('\n')
out, i, n = [], 0, 0
while i < len(lines):
    if lines[i].startswith('<<<<<<< '):
        ours, base, theirs, mode = [], [], [], 'ours'
        i += 1
        while not lines[i].startswith('>>>>>>> '):
            if lines[i].startswith('||||||| '): mode = 'base'
            elif lines[i] == '=======': mode = 'theirs'
            else: {'ours': ours, 'base': base, 'theirs': theirs}[mode].append(lines[i])
            i += 1
        c = choices[n] if n < len(choices) else choices[-1]
        out += {'ours': ours, 'theirs': theirs, 'both': ours + theirs, 'both-rev': theirs + ours}[c]
        n += 1
    else:
        out.append(lines[i])
    i += 1
open(path, 'w', encoding='utf-8').write('\n'.join(out))
print(f"{path}: {n} parça çözüldü ({spec})")
