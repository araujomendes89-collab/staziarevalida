import hashlib, json, sys, os
root=sys.argv[1]
T=os.path.join(root,'src/novo/app/legal/textos')
tpl=open(os.path.join(os.path.dirname(__file__),'migracao.sql.tpl'),encoding='utf-8').read()
def rd(n): return open(os.path.join(T,n),encoding='utf-8').read()
c,p,r=rd('contrato-v3.0.md'),rd('politica-privacidade-v3.0.md'),rd('regulamento-v1.0.md')
mud=json.load(open(os.path.join(T,'mudancas-v3.0.json'),encoding='utf-8'))
for body,tag in ((c,'$contrato_v3$'),(p,'$politica_v3$'),(r,'$regulamento_v1$')):
    assert tag not in body
sha=lambda b: hashlib.sha256(b.encode('utf-8')).hexdigest()
out=(tpl.replace('{{CONTRATO}}',c).replace('{{POLITICA}}',p).replace('{{REGULAMENTO}}',r)
  .replace('{{MUDANCAS}}','$mudancas$'+json.dumps(mud,ensure_ascii=False)+'$mudancas$')
  .replace('{{SHA_CONTRATO}}',sha(c)).replace('{{SHA_POLITICA}}',sha(p)).replace('{{SHA_REGULAMENTO}}',sha(r)))
assert '{{' not in out
open(os.path.join(root,'supabase/migrations/20261003013740_termo_v3.sql'),'w',encoding='utf-8').write(out)
print('ok',sha(c),sha(p),sha(r))
