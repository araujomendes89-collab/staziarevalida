# -*- coding: utf-8 -*-
"""Gera supabase/migrations/20261003009990_portao_atualidade.sql = base.sql + semente dos 100 dossiês (dossies-100.json) + permissões.
Uso: python3 gerar-migracao.py   (sem rede, sem IA)"""
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "../../supabase/migrations/20261003009990_portao_atualidade.sql")
q = lambda s: "'" + str(s if s is not None else "").replace("'", "''") + "'"
arr = lambda xs: "array[" + ", ".join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"
dos = json.load(open(os.path.join(AQUI, "dossies-100.json"), encoding="utf-8"))["temas"]
nos = json.load(open(os.path.join(AQUI, "nos-para-tema.json"), encoding="utf-8"))
AREA = {"cm": "Clínica Médica", "cir": "Cirurgia", "go": "Ginecologia e Obstetrícia", "ped": "Pediatria", "mfc": "Medicina de Família e Comunidade", "sc": "Saúde Coletiva", "sm": "Saúde Mental"}
# nomes que a Central já usa para o mesmo tema (dossiês antigos da 9960)
EXTRA = {"GR-001": ["Tuberculose"], "GR-043": ["Rotina do pré-natal de risco habitual"]}
linhas = []
for t in dos:
    nomes = [t["titulo"]] + EXTRA.get(t["tema"], []) + [n["nome"] for n in nos.get(t["tema"], [])]
    nomes = list(dict.fromkeys(nomes))[:60]
    linhas.append(f"  ({q(t['tema'])}, {q(t['titulo'])}, {q(AREA[t['area']])}, {q(t['subarea'])}, {arr(nomes)}, {arr(t['palavras'])})")
fontes = []
for t in dos:
    for f in t["fontes"]:
        if not f.get("url"):
            continue
        fontes.append(f"  ({q(t['tema'])}, {q(f['id'])}, {q(f['url'])}, {q(f['titulo'][:300])}, {q(f['orgao'])}, {q(f['ano'])}, {q(f['nivel'])}, {q(f['papel'])}, {q(json.dumps(f['evidencia'], ensure_ascii=False))}::jsonb, {q(f.get('ajuste'))})")
semente = f"""
-- ---------------------------------------------------------------- 7. semente: os 100 dossiês (PROPOSTA por correspondência de texto, com a evidência de cada vínculo)
-- Gerada por scripts/portao-atualidade/montar-dossies.py a partir do catálogo verificado (477 documentos) e da biblioteca local. Nada é "conferido"
-- até a equipe clicar em "Marcar conferido". Recolar não apaga o que a equipe fez (palavras-chave editadas, papéis, prazo, conferência).
insert into public.ch_gt_dossiers (tema_id, titulo, area, subarea, nomes, keywords) values
{",\n".join(linhas)}
on conflict (tema_id) do update set titulo = excluded.titulo, area = excluded.area, subarea = excluded.subarea, nomes = excluded.nomes,
  keywords = case when cardinality(ch_gt_dossiers.keywords) = 0 then excluded.keywords else ch_gt_dossiers.keywords end;

insert into public.ch_gt_fontes (tema_id, catalogo_id, url, titulo, orgao, ano, nivel, papel, evidencia, ajuste) values
{",\n".join(fontes)}
on conflict (tema_id, catalogo_id) do update set url = excluded.url, titulo = excluded.titulo, orgao = excluded.orgao, ano = excluded.ano,
  nivel = excluded.nivel, evidencia = excluded.evidencia, ajuste = excluded.ajuste, updated_at = now();

-- ---------------------------------------------------------------- 8. permissões
do $perm$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('ch_gt_source_of', 'ch_gt_freshness', 'ch_gt_match', 'ch_gt_gate_for', 'ch_topic_gate', 'ch_question_atualidade', 'ch_gt_card', 'ch_kw_hits',
                             'ch_worker_index_page_report', 'draft_approval_blockers_antes_atual', 'app_admin_question_comment_decide_antes_atual',
                             'app_admin_comment_review_approve_exam_antes_atual') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('app_admin_gt_list', 'app_admin_gt', 'app_admin_gt_verified', 'app_admin_gt_set_source', 'app_admin_gt_add_source', 'app_admin_gt_save',
                             'app_admin_comment_atualidade', 'app_admin_question_comment_decide', 'app_admin_comment_review_approve_exam', 'draft_approval_blockers') loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$perm$;
"""
open(SAIDA, "w", encoding="utf-8").write(open(os.path.join(AQUI, "base.sql"), encoding="utf-8").read() + semente)
print("ok", len(dos), "temas", len(fontes), "vínculos")
