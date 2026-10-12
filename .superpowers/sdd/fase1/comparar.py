import json,difflib,sys
a=json.load(open(sys.argv[1]+'/antes.json')); d=json.load(open(sys.argv[1]+'/depois2.json'))
ver=len(sys.argv)>2
for s in ['funcoes','gatilhos','politicas','tabelas','colunas','restricoes','indices','enums','dados']:
    A,D=a[s],d[s]
    nov=[k for k in D if k not in A]; rem=[k for k in A if k not in D]
    mud=[k for k in D if k in A and A[k]!=D[k]]
    print(f'## {s}: antes={len(A)} depois={len(D)} novos={len(nov)} removidos={len(rem)} mudaram={len(mud)}')
    if s in('funcoes',):
        print('  novos:'); [print('    ',k,'acl=',D[k]['acl']) for k in nov]
        print('  removidos:',rem)
        print('  mudaram:')
        for k in mud:
            x=A[k];y=D[k]
            dl=[l for l in difflib.unified_diff(x['def'].splitlines(),y['def'].splitlines(),'prod','novo',lineterm='',n=0) if not l.startswith(('---','+++','@@'))]
            ch=[]
            if x['acl']!=y['acl']: ch.append(f"ACL {x['acl']} -> {y['acl']}")
            if x['secdef']!=y['secdef']: ch.append('secdef')
            if x['cfg']!=y['cfg']: ch.append('config')
            print(f'    {k}: {len(dl)} linhas de diff {ch}')
            if ver: print('\n'.join('        '+l for l in dl))
    else:
        for k in nov: print('  +',k, json.dumps(D[k])[:230])
        for k in rem: print('  -',k, json.dumps(A[k])[:230])
        for k in mud: print('  ~',k,'\n      antes:',json.dumps(A[k])[:300],'\n      depois:',json.dumps(D[k])[:300])
