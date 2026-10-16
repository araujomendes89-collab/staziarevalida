-- =============================================================================
-- DESFAZER da migração 20261003013060_editor_pro_historico.sql:
-- Remove os gatilhos e funções de trava e histórico da tabela ch_unit_versions,
-- as funções de rascunho, trava e histórico do editor profissional (app_ch_doc_*),
-- e as tabelas de rascunhos, travas e histórico (ch_doc_drafts, ch_doc_locks, ch_doc_history).
--
-- Atenção: os rascunhos automáticos e o histórico de salvamentos guardados até aqui são apagados junto com as tabelas.
-- Nada de outra tabela é tocado; as aulas e aprovações continuam exatamente como estão.
-- Pode ser colado duas ou mais vezes (totalmente idempotente).
-- =============================================================================

-- 1. Gatilhos em ch_unit_versions
drop trigger if exists ch_doc_trava_antes_salvar on public.ch_unit_versions;
drop trigger if exists ch_doc_historico_depois_salvar on public.ch_unit_versions;

-- 2. Funções dos gatilhos
drop function if exists public.ch_doc_trava_antes_salvar();
drop function if exists public.ch_doc_historico_depois_salvar();

-- 3. Funções app_ch_doc_*
drop function if exists public.app_ch_doc_rascunho_salvar(uuid, jsonb, jsonb, text);
drop function if exists public.app_ch_doc_rascunho_ler(uuid);
drop function if exists public.app_ch_doc_rascunho_apagar(uuid);
drop function if exists public.app_ch_doc_trava(uuid, text, boolean);
drop function if exists public.app_ch_doc_trava_soltar(uuid);
drop function if exists public.app_ch_doc_historico(uuid);
drop function if exists public.app_ch_doc_historico_abrir(uuid, uuid, uuid);
drop function if exists public.app_ch_doc_restaurar(uuid, uuid, uuid);

-- 4. Tabelas criadas pela migração
drop table if exists public.ch_doc_drafts cascade;
drop table if exists public.ch_doc_locks cascade;
drop table if exists public.ch_doc_history cascade;
