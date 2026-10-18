-- DESFAZER contas inativas e expurgo dos aceites (supabase/migrations/20261003013810_contas_inativas_expurgo.sql). Pode ser colado de novo.
--
-- O que sai: as chaves, o relatório, o registro do último acesso, os avisos de conta inativa, a data de fim do contrato, as duas
-- rotinas e o gatilho. Os e-mails de aviso ainda na fila (013800) são cancelados.
-- O que NÃO volta: o que a rotina já fez com a chave ligada (conta apagada, Coins zerados, aceite expurgado) não tem volta.
-- A prova dos avisos (conta_inativa) e as datas de fim de contrato (legal_contrato_fim) NÃO são apagadas: ficam guardadas como
-- public.conta_inativa_desfeito e public.legal_contrato_fim_desfeito (sem acesso do navegador); apagar à mão só se o dono decidir.
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

do $guarda$
declare
  t text;
  i text;
begin
  foreach t in array array['conta_inativa', 'legal_contrato_fim'] loop
    if to_regclass('public.' || t) is not null then
      if to_regclass('public.' || t || '_desfeito') is null then
        if t = 'conta_inativa' then
          alter table public.conta_inativa drop constraint if exists conta_inativa_email_id_fkey;
        end if;
        execute format('alter table public.%I rename to %I', t, t || '_desfeito');
        -- índices e chave com outro nome, para a migração poder voltar com os dela
        for i in select indexname from pg_indexes where schemaname = 'public' and tablename = t || '_desfeito' loop
          execute format('alter index public.%I rename to %I', i, left(i, 50) || '_desfeito');
        end loop;
      else
        execute format('insert into public.%I overriding system value select * from public.%I on conflict do nothing', t || '_desfeito', t);
        execute format('drop table public.%I', t);
      end if;
    end if;
  end loop;
end
$guarda$;
drop table if exists public.conta_acesso;
drop table if exists public.app_rotinas_conta_log;
drop table if exists public.app_rotinas_conta_config;
