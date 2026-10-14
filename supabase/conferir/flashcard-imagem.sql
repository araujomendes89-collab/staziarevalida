-- StaziaMed · FLASHCARD ILUSTRADO NO BARALHO · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de colar 1-Flashcard-imagem.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) tabela ' || t from unnest(array['flashcards','ch_materials','ch_unit_materials','lessons','ch_publications']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'requisito (migrações anteriores) função ' || f from unnest(array['ch_hash(jsonb)','ch_unit_code(uuid)','ch_unit_materials_sync(uuid)','ch_tema_aula_aberta(text)','app_tema_aula(text)']) f
   where to_regprocedure('public.' || f) is null
  union all select 3, 'função desta migração ' || f from unnest(array['ch_card_images(uuid)','app_flashcards_ilustrados(uuid[])']) f
   where to_regprocedure('public.' || f) is null
  union all select 4, 'visitante (sem login) executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('ch_card_images','app_flashcards_ilustrados') and has_function_privilege('anon', p.oid, 'execute')
  union all select 5, 'aluno logado executando a função interna ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'ch_card_images' and has_function_privilege('authenticated', p.oid, 'execute')
)
select case when count(*) = 0 then 'OK: flashcard ilustrado no baralho pronto (só cartão de unidade PUBLICADA ganha imagem)'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
