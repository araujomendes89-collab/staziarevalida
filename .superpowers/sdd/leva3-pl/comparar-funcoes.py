import json,difflib,sys
a=json.load(open('antes.json')); d=json.load(open('depois.json'))
novas=[k for k in d if k not in a]; sumiu=[k for k in a if k not in d]
mud=[k for k in d if k in a and (a[k]['def']!=d[k]['def'] or a[k]['acl']!=d[k]['acl'])]
print('novas:',novas); print('removidas:',sumiu); print('mudam:',mud)
for k in mud:
    dl=list(difflib.unified_diff(a[k]['def'].splitlines(),d[k]['def'].splitlines(),'prod','novo',lineterm='',n=0))
    print('=====',k, f'{len(dl)} linhas de diff', '(acl mudou)' if a[k]['acl']!=d[k]['acl'] else '')
    print('\n'.join(dl))
print('ACL das novas:')
for k in novas: print(' ',k,d[k]['acl'])
