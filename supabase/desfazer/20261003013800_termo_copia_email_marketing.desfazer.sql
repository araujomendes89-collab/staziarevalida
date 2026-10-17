-- DESFAZER a cópia do contrato por e-mail e a caixa de marketing (supabase/migrations/20261003013800_termo_copia_email_marketing.sql).
-- Pode ser colado de novo. Antes, desfazer a 013810 (contas inativas e expurgo), se tiver sido colada: ela usa a fila daqui.
--
-- O que sai: os dois gatilhos (cópia na fila e marketing do cadastro), as funções e as tabelas novas.
-- ATENÇÃO: apaga a fila de e-mails e o histórico do consentimento de marketing. Se o dono quiser guardar o histórico antes, rodar:
--   select * from public.marketing_consent_log order by id;
-- O site continua funcionando sem estas funções: a chave de marketing some da Minha Conta e a caixa do cadastro passa a não gravar.
-- Nenhum aceite (legal_acceptances) é tocado.

drop trigger if exists legal_copia_na_fila on public.legal_acceptances;
drop trigger if exists on_auth_user_marketing on auth.users;

drop function if exists public.app_marketing_set(boolean, text);
drop function if exists public.app_marketing_get();
drop function if exists public.marketing_no_cadastro();
drop function if exists public.marketing_gravar(uuid, boolean, text);
drop function if exists public.marketing_texto(text);
drop function if exists public.ch_worker_email_marcar(bigint, text, text);
drop function if exists public.ch_worker_email_pegar(integer);
drop function if exists public.legal_copia_na_fila();
drop function if exists public.email_conta_confirmada(uuid);

drop table if exists public.marketing_consent_log;
drop table if exists public.marketing_consents;
drop table if exists public.email_saida;
