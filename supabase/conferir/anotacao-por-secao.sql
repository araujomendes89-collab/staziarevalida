-- StaziaMed · ANOTAÇÃO POR SEÇÃO DA AULA · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar
-- supabase/migrations/20261003009994_anotacao_por_secao.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) tabela ' || t from unnest(array['lessons','lesson_notes']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'tabela desta migração lesson_section_notes' where to_regclass('public.lesson_section_notes') is null
  union all select 3, 'função desta migração ' || f from unnest(array['lesson_checks_validate(jsonb)','lesson_section_note_put(uuid,uuid,text,text)',
      'app_lesson_notes(uuid)','app_lesson_section_note_save(uuid,text,text)','app_lesson_checks_save(uuid,jsonb)','app_lesson_notes_save(uuid,text,jsonb)']) f
   where to_regprocedure('public.' || f) is null
  union all select 4, 'proteção (RLS) desligada em lesson_section_notes' where to_regclass('public.lesson_section_notes') is not null
     and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.lesson_section_notes'))
  union all select 5, 'aluno logado pode gravar direto em lesson_section_notes' where case when to_regclass('public.lesson_section_notes') is null then false
     else has_table_privilege('authenticated', 'public.lesson_section_notes', 'insert') or has_table_privilege('authenticated', 'public.lesson_section_notes', 'update')
          or has_table_privilege('authenticated', 'public.lesson_section_notes', 'delete') end
  union all select 6, 'visitante (sem login) executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('app_lesson_notes','app_lesson_section_note_save','app_lesson_checks_save','app_lesson_notes_save','lesson_section_note_put','lesson_checks_validate')
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 7, 'aluno logado executando a função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('lesson_section_note_put','lesson_checks_validate')
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all select 8, 'anotação antiga ainda não copiada para a chave geral (' || x.n || ')' from (
    select case when to_regclass('public.lesson_section_notes') is null or to_regclass('public.lesson_notes') is null then 0
      else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.lesson_notes n where n.note <> '''' and not exists (select 1 from public.lesson_section_notes s where s.user_id = n.user_id and s.lesson_id = n.lesson_id and s.section_key = ''geral'')', false, true, '')))[1]::text::int end as n
  ) x where x.n > 0
)
select case when count(*) = 0 then 'OK: anotação por seção pronta (cada aluno só vê as suas; anotações antigas na chave geral)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
