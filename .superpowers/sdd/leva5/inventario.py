#!/usr/bin/env python3
# Inventario de funcoes SQL redefinidas por mais de uma migracao da leva 5 (e contra a leva 4 / a base).
import re, os, sys, collections
W = sys.argv[1]; M = os.path.join(W, "supabase", "migrations")
L5 = ["009835","009840","009841","009842","009843","009844","009860","009861","009862","009863","009864","009870","009871","009872","009873","009890","009891","009892"]
files = sorted(os.listdir(M))
def pref(f): return f[8:14]
l5 = [f for f in files if pref(f) in L5]
assert len(l5) == len(L5), (len(l5), l5)
rx = re.compile(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?[A-Za-z0-9_]+"?)\s*\(', re.I)
def funcs(path):
    t = open(path, encoding="utf-8").read()
    t = re.sub(r'--[^\n]*', '', t)
    out = collections.Counter()
    for m in rx.finditer(t):
        # assinatura: ate o parenteses fechando
        i = m.end(); d = 1
        while d and i < len(t):
            d += (t[i] == '('); d -= (t[i] == ')'); i += 1
        args = re.sub(r'\s+', ' ', t[m.end():i-1]).strip().lower()
        # so tipos (descarta nomes/default) de forma aproximada
        out[(m.group(1).strip('"').lower(), args)] += 1
    return out
mapa = collections.defaultdict(list)
for f in l5:
    for (n, a) in funcs(os.path.join(M, f)):
        mapa[n].append((pref(f), a))
print("== funcoes (por nome) definidas em mais de uma migracao da leva 5")
for n, l in sorted(mapa.items()):
    if len({p for p, _ in l}) > 1:
        print(f"  {n}: {[p for p,_ in l]}")
print("== funcoes da leva 5 que ja existiam antes (base 5d659d1) - ultima versao anterior")
ant = collections.defaultdict(list)
for f in files:
    if pref(f) in L5: continue
    if f[:14] > "20261003009830" and f[:14] < "20261003009999" and False: continue
    for (n, a) in funcs(os.path.join(M, f)):
        ant[n].append(pref(f))
for n, l in sorted(mapa.items()):
    if n in ant:
        print(f"  {n}: leva5={sorted({p for p,_ in l})} anteriores(ultimas)={ant[n][-3:]}")
