-- Desfaz a 20261003013760_compra_avisos.sql (etapa 4: avisos de renovação/pagamento, troca da forma de pagamento, histórico,
-- aceite do contrato na compra, amostra de hoje). ATENÇÃO: apaga os avisos já gravados. Não mexe na cobrança (013700) nem nos planos.
drop trigger if exists avisos_da_cobranca on public.billing_cobrancas;
drop function if exists public.avisos_da_cobranca();
drop function if exists public.app_amostra_hoje();
drop function if exists public.ch_worker_billing_troca_cartao_abrir(uuid, text);
drop function if exists public.ch_worker_billing_para_pix(uuid, text);
drop function if exists public.ch_worker_billing_troca_situacao(uuid);
drop function if exists public.ch_worker_billing_aceite_registrar(uuid, text);
drop function if exists public.ch_worker_billing_contrato_doc();
drop function if exists public.ch_worker_billing_recibo_salvar(text, text, text);
drop function if exists public.app_billing_historico();
drop function if exists public.app_avisos_vistos(bigint[]);
drop function if exists public.app_meus_avisos();
drop function if exists public.ch_worker_aviso_email_marcar(bigint, boolean, text);
drop function if exists public.ch_worker_avisos_email_pegar(integer, integer);
drop function if exists public.ch_worker_avisos_cobranca();
drop function if exists public.avisos_criar(uuid, text, text, text, text, text);
drop function if exists public.avisos_dia(timestamptz);
drop function if exists public.avisos_brl(integer);
drop table if exists public.avisos_aluno;
alter table public.billing_config drop column if exists contrato_url;
alter table public.billing_cobrancas drop column if exists recibo_url;
