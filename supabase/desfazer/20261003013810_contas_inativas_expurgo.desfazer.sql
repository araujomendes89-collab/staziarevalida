-- DESFAZER contas inativas e expurgo dos aceites (supabase/migrations/20261003013810_contas_inativas_expurgo.sql). Pode ser colado de novo.
--
-- O que sai: as chaves, o relatório, o registro do último acesso, os avisos de conta inativa, a data de fim do contrato, as duas
-- rotinas e o gatilho. Os e-mails de aviso ainda na fila (013800) são cancelados.
-- O que NÃO volta: o que a rotina já fez com a chave ligada (conta apagada, Coins zerados, aceite expurgado) não tem volta.
-- ATENÇÃO: sai junto a prova dos avisos (conta_inativa) e as datas de fim de contrato (legal_contrato_fim). Para guardar antes:
--   select * from public.conta_inativa order by id;  select * from public.legal_contrato_fim;
-- O site continua funcionando: app_marcar_acesso some e o app ignora a falha.

do $cancela$
begin
  if to_regclass('public.email_saida') is not null then
    update public.email_saida set status = 'cancelado', erro = 'Rotina de conta inativa desfeita.'
    where kind = 'aviso_inatividade' and status = 'pendente';
  end if;
end
$cancela$;

drop trigger if exists legal_contrato_fim_marca on public.legal_acceptances;

drop function if exists public.ch_worker_expurgo_aceites();
drop function if exists public.ch_worker_contas_inativas();
drop function if exists public.legal_contrato_fim_marca();
drop function if exists public.conta_pode_apagar(uuid);
drop function if exists public.conta_ultimo_acesso(uuid);
drop function if exists public.app_marcar_acesso();

drop table if exists public.conta_inativa;
drop table if exists public.legal_contrato_fim;
drop table if exists public.conta_acesso;
drop table if exists public.app_rotinas_conta_log;
drop table if exists public.app_rotinas_conta_config;
