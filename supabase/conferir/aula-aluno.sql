-- StaziaMed · AULA DO ALUNO NO GRANDE TEMA · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar 1-Aula-do-aluno.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) tabela ' || t from unnest(array['lessons','ch_units','ch_unit_versions','ch_unit_materials','ch_materials','ch_publications','grande_temas','lesson_notes']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'requisito (migrações anteriores) função ' || f from unnest(array['ch_unit_code(uuid)','ch_unit_materials_sync(uuid)','app_lesson_notes(uuid)','app_lesson_notes_save(uuid,text,jsonb)']) f
   where to_regprocedure('public.' || f) is null
  union all select 3, 'função desta migração ' || f from unnest(array['ch_tema_aula_aberta(text)','app_temas_com_aula()','app_tema_aula(text)','ch_worker_aula_aluno_arquivo(text,text,integer)']) f
   where to_regprocedure('public.' || f) is null
  union all select 4, 'visitante (sem login) executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('ch_tema_aula_aberta','app_temas_com_aula','app_tema_aula','ch_worker_aula_aluno_arquivo')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 5, 'aluno logado executando a função só do servidor ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('ch_tema_aula_aberta','ch_worker_aula_aluno_arquivo')
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all select 6, 'o aluno NÃO executa app_tema_aula / app_temas_com_aula (deveria)' where to_regprocedure('public.app_tema_aula(text)') is not null
     and not has_function_privilege('authenticated', 'public.app_tema_aula(text)', 'execute')
)
select case when count(*) = 0 then 'OK: aula do aluno pronta (só aparece ao aluno a unidade PUBLICADA pela Central)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
