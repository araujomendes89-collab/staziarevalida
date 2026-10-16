-- StaziaMed · RESERVA DE RASCUNHOS REPETIDOS · CONFERIR (só lê). Rode ANTES e DEPOIS de colar supabase/migrations/20261003013010_reserva_repetidas.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude).
with falta (ordem, item) as (
  select 1, 'coluna draft_questions.reserve' where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'draft_questions' and column_name = 'reserve')
  union all select 2, 'situação "reserve" aceita na regra de situações' where not exists (
      select 1 from pg_constraint c where c.conrelid = 'public.draft_questions'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%reserve%')
  union all select 3, 'gatilho draft_questions_reserve_guard' where not exists (select 1 from pg_trigger where tgname = 'draft_questions_reserve_guard' and not tgisinternal)
  union all select 4, 'função ' || f from unnest(array['app_draft_reserve(jsonb,text)', 'app_draft_unreserve(uuid[])']) f where to_regprocedure('public.' || f) is null
  union all select 5, 'visitante (sem login) executando ' || p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('app_draft_reserve', 'app_draft_unreserve') and has_function_privilege('anon', p.oid, 'execute')
)
select case when count(*) = 0 then 'OK: reserva de rascunhos pronta (' || (select count(*) from public.draft_questions where status = 'reserve') || ' na reserva agora)'
            else 'FALTA: ' || string_agg(item, '; ' order by ordem) end as resultado
from falta;
