-- StaziaMed · EDITOR PROFISSIONAL M13 (resumo da aula com formatação, lessons.summary_rico) · CONFERIR (só lê; não altera nada).
-- Rode ANTES (mostra o que falta) e DEPOIS de colar supabase/migrations/20261003013040_editor_pro_resumo_rico.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) ' || f from unnest(array['ch_raw_lesson_view(lessons)','ch_scrub_json(jsonb)','ch_guard_complementar_save()','lesson_review_view(lessons)']) f
   where to_regprocedure('public.' || f) is null
  union all select 2, 'coluna lessons.summary_rico (jsonb)'
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lessons' and column_name = 'summary_rico' and data_type = 'jsonb')
  union all select 3, 'regra de forma lessons_summary_rico_forma'
   where not exists (select 1 from pg_constraint where conname = 'lessons_summary_rico_forma' and conrelid = 'public.lessons'::regclass)
  union all select 4, 'função lessons_summary_rico_guard()' where to_regprocedure('public.lessons_summary_rico_guard()') is null
  union all select 5, 'gatilho ' || g from unnest(array['lessons_summary_rico_guard_trg','lessons_guard_complementar_rico']) g
   where not exists (select 1 from pg_trigger where tgname = g and tgrelid = 'public.lessons'::regclass and not tgisinternal)
  union all select 6, 'lesson_view sem o resumo com formatação (corpo antigo)'
   where to_regprocedure('public.lesson_view(lessons)') is null or pg_get_functiondef(to_regprocedure('public.lesson_view(lessons)')) not like '%summary_rico%'
  union all select 7, 'app_admin_save_lesson sem o resumo com formatação (corpo antigo)'
   where to_regprocedure('public.app_admin_save_lesson(jsonb)') is null or pg_get_functiondef(to_regprocedure('public.app_admin_save_lesson(jsonb)')) not like '%v_rico%'
  union all select 8, 'aluno logado executando a função do gatilho lessons_summary_rico_guard()'
   where to_regprocedure('public.lessons_summary_rico_guard()') is not null and has_function_privilege('authenticated', 'public.lessons_summary_rico_guard()', 'execute')
  union all select 9, 'visitante (sem login) executando app_admin_save_lesson'
   where to_regprocedure('public.app_admin_save_lesson(jsonb)') is not null and has_function_privilege('anon', 'public.app_admin_save_lesson(jsonb)', 'execute')
  union all select 10, 'equipe sem permissão de salvar aula (app_admin_save_lesson)'
   where to_regprocedure('public.app_admin_save_lesson(jsonb)') is not null and not has_function_privilege('authenticated', 'public.app_admin_save_lesson(jsonb)', 'execute')
)
select case when count(*) = 0 then 'OK: resumo da aula com formatação pronto (aulas antigas iguais; aluno só recebe o rico quando o texto chega inteiro)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
