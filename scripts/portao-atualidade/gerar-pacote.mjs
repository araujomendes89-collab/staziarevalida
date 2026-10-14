// Vigilância científica por tema + PORTÃO DE ATUALIDADE (9990): gera o pacote SQL do dono a partir das migrações do ramo (9940, 9941, 9960 e 9990), sem mudar nada nelas.
// Uso: node gerar-pacote.mjs <worktree> <pasta-de-saída>
import fs from "node:fs"; import path from "node:path";
const [WT, OUT] = process.argv.slice(2);
const MIG = ["20261003009940_vigilancia_cientifica.sql", "20261003009941_vigilancia_painel.sql", "20261003009960_vigilancia_por_tema.sql", "20261003009990_portao_atualidade.sql"];
fs.mkdirSync(OUT, { recursive: true });
const corpo = MIG.map((f) => `-- ======================== ${f} ========================\n` + fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8")).join("\n\n");

const CONFERIR = `-- StaziaMed · VIGILÂNCIA CIENTÍFICA POR TEMA · CONFERIR (só lê; não altera nada). Rode antes (diz o que falta) e DEPOIS de colar 1-Vigilancia.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude).
with falta (ordem, item) as (
  select 1, 'tabela ' || t from unnest(array['ch_auto_change_policy','ch_source_vigilance','ch_vigilance_config','ch_vigilance_items','ch_topic_dossiers','ch_topic_sources','ch_index_pages']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'RLS ligado em ' || c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname in ('ch_auto_change_policy','ch_source_vigilance','ch_vigilance_config','ch_vigilance_items','ch_topic_dossiers','ch_topic_sources','ch_index_pages') and not c.relrowsecurity
  union all select 3, 'função ' || f from unnest(array['app_admin_vigilance_summary()','app_admin_vigilance_queue(text,integer,integer)','app_admin_vigilance_mark(uuid,text,text)',
      'app_admin_vigilance_set_interval(text,integer)','app_admin_source_quality(uuid)','app_admin_source_quality_override(uuid,boolean,text)','app_admin_vigilance_request_analysis(uuid)',
      'app_admin_topics()','app_admin_topic(uuid)','app_admin_unit_topic(uuid)','app_admin_vigilance_set_gate(text)','ch_topic_freshness(uuid)','ch_worker_watch_report(uuid,jsonb)',
      'ch_worker_watch_due(integer)','ch_worker_identifier_report(uuid,jsonb)','ch_worker_index_page_report(uuid,jsonb)','ch_publish_problems_antes_tema(uuid)','app_ch_import_lesson_package_antes_tema(jsonb)']) f
   where to_regprocedure('public.' || f) is null
  union all select 4, 'visitante executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'app_admin_vigilance%' or p.proname like 'app_admin_topic%' or p.proname like 'ch_worker_watch%' or p.proname like 'ch_worker_index%')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 5, 'regra: gabarito oficial e clínico nunca automáticos'
   where to_regclass('public.ch_auto_change_policy') is not null
     and (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.ch_auto_change_policy where category in (''clinico'',''gabarito'') and automatic', false, true, '')))[1]::text <> '0'
  union all select 6, 'trava do gabarito oficial (gatilho em question_official_answers)'
   where not exists (select 1 from pg_trigger where tgname = 'ch_auto_guard_gabarito' and tgrelid = 'public.question_official_answers'::regclass)
  union all select 9, 'tabela ' || t from unnest(array['ch_gt_dossiers','ch_gt_fontes']) t where to_regclass('public.' || t) is null
  union all select 9, 'função do portão de atualidade ' || f from unnest(array['ch_gt_freshness(text)','ch_gt_match(text[])','ch_gt_gate_for(uuid,text[])','ch_question_atualidade(text)',
      'app_admin_gt_list()','app_admin_gt(text)','app_admin_gt_verified(text,text,text)','app_admin_gt_set_source(text,text,text)','app_admin_gt_add_source(text,uuid,text)',
      'app_admin_gt_save(text,text[],integer,boolean)','app_admin_comment_atualidade(text)','draft_approval_blockers_antes_atual(uuid)',
      'app_admin_question_comment_decide_antes_atual(text,text,text,jsonb)','app_admin_comment_review_approve_exam_antes_atual(text,text,text)']) f
   where to_regprocedure('public.' || f) is null
  union all select 9, 'portão de atualidade desligado do encaixe (cole 1-Vigilancia.sql de novo): ' || x from (values
      ('draft_approval_blockers', 'draft_approval_blockers(uuid)'), ('decisão da Fila de revisão', 'app_admin_question_comment_decide(text,text,text,jsonb)'),
      ('aprovar prova inteira', 'app_admin_comment_review_approve_exam(text,text,text)')) v(x, f)
   where to_regprocedure('public.' || v.f) is not null and position('_antes_atual' in (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.' || v.f))) = 0
  union all select 9, 'o portão da Central não conhece os 100 temas (cole 1-Vigilancia.sql de novo)'
   where to_regprocedure('public.ch_topic_gate(uuid)') is not null and position('ch_gt_gate_for' in (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.ch_topic_gate(uuid)'))) = 0
  union all select 9, 'visitante executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'app_admin_gt%' or p.proname like 'ch_gt_%' or p.proname = 'ch_question_atualidade' or p.proname = 'app_admin_comment_atualidade')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 9, 'aluno executando função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'ch_gt_%' or p.proname = 'ch_question_atualidade') and has_function_privilege('authenticated', p.oid, 'execute')
  union all select 9, 'dossiês dos 100 Grandes Temas incompletos (' || (select count(*) from public.ch_gt_dossiers) || ' de 100)'
   where to_regclass('public.ch_gt_dossiers') is not null and (select count(*) from public.ch_gt_dossiers) < 100
  union all select 8, 'função de IA "Análise do que mudou" na Central de IAs (desligada)'
   where not exists (select 1 from pg_constraint where conname = 'ai_functions_key_check' and pg_get_constraintdef(oid) like '%analise_mudancas%')
)
select case when not exists (select 1 from falta) then
  (xpath('/row/m/text()', query_to_xml($m$select 'OK: Vigilância científica no banco: ' || (select count(*) from public.ch_source_watch where domain_id is not null) || ' fontes vigiadas (' ||
  (select count(*) from public.ch_source_watch where interval_days = 1 and domain_id is not null) || ' todo dia), ' ||
  (select count(*) from public.ch_sources where doi is not null) || ' com DOI para o Crossref, ' ||
  (select count(*) from public.ch_index_pages where active) || ' páginas-índice oficiais, ' ||
  (select count(*) from public.ch_topic_dossiers) || ' temas com dossiê (' ||
  coalesce((select string_agg(n.name || ': ' || (select count(*) from public.ch_topic_sources t where t.theme_node_id = d.theme_node_id) || ' fontes, ' || (public.ch_topic_freshness(d.theme_node_id) ->> 'status'), '; ' order by n.name)
            from public.ch_topic_dossiers d join public.ch_taxonomy_nodes n on n.id = d.theme_node_id), 'nenhum') || '); ' ||
  (select count(*) from public.ch_vigilance_items where status in ('pendente','vista')) || ' avisos abertos na fila; ' ||
  (select count(*) from public.ch_gt_dossiers) || ' dossiês dos 100 temas (' || (select count(*) from public.ch_gt_dossiers d where public.ch_gt_freshness(d.tema_id) ->> 'nivel' = 'em_dia') || ' em dia, ' ||
  (select count(*) from public.ch_gt_dossiers d where public.ch_gt_freshness(d.tema_id) ->> 'nivel' = 'atencao') || ' com atenção, ' ||
  (select count(*) from public.ch_gt_dossiers d where public.ch_gt_freshness(d.tema_id) ->> 'nivel' = 'desatualizado') || ' desatualizados, ' ||
  (select count(*) from public.ch_gt_dossiers d where public.ch_gt_freshness(d.tema_id) ->> 'nivel' = 'sem_dossie') || ' sem dossiê); portão ' ||
  (select topic_gate from public.ch_vigilance_config where id) || '; análise do que mudou ' || case when public.ch_vigilance_analysis_on() then 'LIGADA' else 'desligada' end || '.' as m$m$, false, true, '')))[1]::text
else 'FALTA: ' || (select string_agg(item, '; ' order by ordem) from falta) end as conferencia;
`;

const INICIO = `-- =============================================================================
-- StaziaMed · VIGILÂNCIA CIENTÍFICA POR TEMA (13/10/2026) · cole este arquivo INTEIRO no editor SQL do Supabase e clique em Run.
-- Ordem: DEPOIS do pacote da rodada 2 e DEPOIS do pacote da aula GR-001 (publicacao-staziamed-2026-10-13-aula-gr001).
-- Junta as migrações 20261003009940, 9941 e 9960 do ramo vigilancia-tema. Pode ser colado de novo sem mudar nada.
-- No fim aparece uma linha "OK: ...". Depois rode o 0-CONFERIR.sql desta pasta.
-- =============================================================================
`;
const FIM = `\n-- ======================== fim ========================\nselect 'OK: Vigilância científica por tema e portão de atualidade colados (' || (select count(*) from public.ch_gt_dossiers) || ' dossiês dos 100 temas, ' || (select count(*) from public.ch_topic_dossiers) || ' temas com dossiê antigo, ' || (select count(*) from public.ch_index_pages) || ' páginas-índice, portão ' || (select topic_gate from public.ch_vigilance_config where id) || ')' as resultado;\n`;
fs.writeFileSync(path.join(OUT, "1-Vigilancia.sql"), INICIO + corpo + FIM);
fs.writeFileSync(path.join(OUT, "0-CONFERIR.sql"), CONFERIR);
console.log("pacote:", fs.readdirSync(OUT).join(", "));
