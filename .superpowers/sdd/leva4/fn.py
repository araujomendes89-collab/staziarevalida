import re, os, subprocess, sys, json
HDR = re.compile(r'^create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?[\w]+"?)\s*\(', re.I | re.M)
def split_args(s, i):
    # s[i] is just after '(' ; return args text and index after ')'
    d = 1; j = i
    while d:
        c = s[j]
        if c == '(': d += 1
        elif c == ')': d -= 1
        j += 1
    return s[i:j-1], j
def norm_args(a):
    parts = []; d = 0; cur = ''
    for ch in a:
        if ch == '(' : d += 1
        if ch == ')': d -= 1
        if ch == ',' and d == 0: parts.append(cur); cur = ''
        else: cur += ch
    if cur.strip(): parts.append(cur)
    out = []
    for p in parts:
        p = re.sub(r'\s+', ' ', p.strip().lower())
        p = re.sub(r'\s+default\s.*$', '', p)
        toks = p.split(' ')
        # drop param name (first token) if more than one token and first isn't a type keyword
        if len(toks) > 1 and toks[0] not in ('in','out','inout','variadic'): toks = toks[1:]
        out.append(' '.join(toks).replace('public.', ''))
    return ','.join(out)
def defs(text):
    res = {}
    for m in HDR.finditer(text):
        name = m.group(1).strip('"').lower()
        args, j = split_args(text, m.end())
        # find dollar quote open
        dq = re.compile(r'\$(\w*)\$').search(text, j)
        tag = dq.group(0)
        close = text.index(tag, dq.end())
        end = text.index(';', close + len(tag))
        res[(name, norm_args(args))] = text[m.start():end+1]
    return res
