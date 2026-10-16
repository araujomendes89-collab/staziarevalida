-- StaziaMed · EDITOR PROFISSIONAL M0 (aula do aluno com formatação: app_tema_aula devolve "ricos" e "doc_config") · CONFERIR (só lê).
-- Rode DEPOIS de colar supabase/migrations/20261003013020_editor_pro_ricos_aluno.sql. Resposta: uma linha "OK: ..." ou "FALTA: ...".
with falta (ordem, item) as (
  select 1, 'função app_tema_aula(text) não existe (falta a 9992)'
   where to_regprocedure('public.app_tema_aula(text)') is null
  union all select 2, 'app_tema_aula sem "ricos" (corpo antigo)'
   where to_regprocedure('public.app_tema_aula(text)') is not null
     and position('''ricos''' in pg_get_functiondef(to_regprocedure('public.app_tema_aula(text)'))) = 0
  union all select 3, 'app_tema_aula sem "doc_config" (corpo antigo)'
   where to_regprocedure('public.app_tema_aula(text)') is not null
     and position('''doc_config''' in pg_get_functiondef(to_regprocedure('public.app_tema_aula(text)'))) = 0
  union all select 4, 'visitante (sem login) pode executar app_tema_aula'
   where to_regprocedure('public.app_tema_aula(text)') is not null
     and has_function_privilege('anon', to_regprocedure('public.app_tema_aula(text)'), 'execute')
)
select case when count(*) = 0 then 'OK: aula do aluno devolve ricos e doc_config'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
