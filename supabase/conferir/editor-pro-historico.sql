-- StaziaMed · HISTÓRICO, RASCUNHO AUTOMÁTICO E TRAVA DO EDITOR PROFISSIONAL · CONFERIR (só lê; não altera nada).
-- Rode ANTES (mostra o que falta) e DEPOIS de colar 20261003013060_editor_pro_historico.sql.
-- Resposta: uma linha. "OK: ..." = tudo pronto no banco. "FALTA: ..." = o que não entrou. Funciona mesmo em banco incompleto.

with falta (ordem, item) as (
  -- 1. Tabelas da migração
  select 1, 'tabela ' || t
  from unnest(array['ch_doc_drafts', 'ch_doc_locks', 'ch_doc_history']) t
  where to_regclass('public.' || t) is null

  -- 2. Funções da migração
  union all
  select 2, 'função ' || f
  from unnest(array[
    'app_ch_doc_rascunho_salvar(uuid,jsonb,jsonb,text)',
    'app_ch_doc_rascunho_ler(uuid)',
    'app_ch_doc_rascunho_apagar(uuid)',
    'app_ch_doc_trava(uuid,text,boolean)',
    'app_ch_doc_trava_soltar(uuid)',
    'app_ch_doc_historico(uuid)',
    'app_ch_doc_historico_abrir(uuid,uuid,uuid)',
    'app_ch_doc_restaurar(uuid,uuid,uuid)',
    'ch_doc_trava_antes_salvar()',
    'ch_doc_historico_depois_salvar()'
  ]) f
  where to_regprocedure('public.' || f) is null

  -- 3. Gatilhos em ch_unit_versions
  union all
  select 3, 'gatilho ' || g || ' em ch_unit_versions'
  from unnest(array['ch_doc_trava_antes_salvar', 'ch_doc_historico_depois_salvar']) g
  where to_regclass('public.ch_unit_versions') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.ch_unit_versions'::regclass
         and tgname = g
         and not tgisinternal
     )

  -- 4. RLS desligada em alguma das 3 tabelas
  union all
  select 4, 'RLS desligada em ' || t
  from unnest(array['ch_doc_drafts', 'ch_doc_locks', 'ch_doc_history']) t
  where to_regclass('public.' || t) is not null
    and not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass)

  -- 5. anon executando alguma app_ch_doc_*
  union all
  select 5, 'visitante (sem login) executando ' || p.oid::regprocedure::text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and left(p.proname, 11) = 'app_ch_doc_'
    and has_function_privilege('anon', p.oid, 'execute')

  -- 6. authenticated sem execute em alguma app_ch_doc_*
  union all
  select 6, 'usuário autenticado sem execute em ' || f
  from unnest(array[
    'app_ch_doc_rascunho_salvar(uuid,jsonb,jsonb,text)',
    'app_ch_doc_rascunho_ler(uuid)',
    'app_ch_doc_rascunho_apagar(uuid)',
    'app_ch_doc_trava(uuid,text,boolean)',
    'app_ch_doc_trava_soltar(uuid)',
    'app_ch_doc_historico(uuid)',
    'app_ch_doc_historico_abrir(uuid,uuid,uuid)',
    'app_ch_doc_restaurar(uuid,uuid,uuid)'
  ]) f
  where to_regprocedure('public.' || f) is not null
    and not has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute')

  -- 7. anon/authenticated com select direto em alguma das 3 tabelas
  union all
  select 7, r || ' com select direto em ' || t
  from unnest(array['ch_doc_drafts', 'ch_doc_locks', 'ch_doc_history']) t
  cross join unnest(array['anon', 'authenticated']) r
  where to_regclass('public.' || t) is not null
    and has_table_privilege(r, 'public.' || t, 'select')
)
select case
  when count(*) = 0 then 'OK: histórico, rascunho automático e trava do editor prontos'
  else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item)
end as resultado
from falta;
