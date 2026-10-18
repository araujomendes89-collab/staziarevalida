-- Desfaz a 20261003013960_lista_interesse.sql (lista de interesse da 2ª fase). Volta a fila de e-mails (ch_worker_email_pegar) à versão
-- da 013950 (corpo copiado sem mudança). A 013950 e as anteriores continuam inteiras.
-- ATENÇÃO, antes de colar:
--   * a lista de interesse é APAGADA (WhatsApp, e-mails, nomes, provas de consentimento, cliques) e o link do grupo sai. Se quiser guardar, exporte o CSV antes em
--     Administração → Lista de interesse;
--   * os e-mails da lista que ainda não saíram não saem mais (saem da fila); links de confirmar e de sair de e-mails já enviados
--     deixam de funcionar (a página diz "link inválido");
--   * publique antes o site SEM a rota /api/interesse (ou ela responde "não deu certo agora").
-- Pode ser colado de novo sem erro.

-- 1) e-mails da lista saem da fila; a fila volta a exigir a conta
do $e$
begin
  if to_regclass('public.email_saida') is not null then
    execute 'drop trigger if exists lista_interesse_aviso_enviado on public.email_saida';
    execute 'delete from public.email_saida where kind in (''interesse_confirmar'', ''interesse_aviso'') or user_id is null';
    execute 'alter table public.email_saida drop constraint if exists email_saida_destino_check';
    execute 'drop index if exists public.email_saida_interessado_idx';
    execute 'alter table public.email_saida drop column if exists interessado_id';
    execute 'alter table public.email_saida alter column user_id set not null';
    execute 'alter table public.email_saida drop constraint if exists email_saida_kind_check';
    execute 'alter table public.email_saida add constraint email_saida_kind_check check (kind in (''aviso_inatividade'', ''comunicado''))';
  end if;
end
$e$;

-- 2) funções da lista saem (as de validação do WhatsApp e do e-mail só depois das tabelas, que as usam), depois as tabelas
do $f$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace
             and (p.proname like 'lista_interesse_%' or p.proname like 'ch_worker_interesse_%' or p.proname like 'app_admin_interesse_%')
             and p.proname not in ('lista_interesse_whatsapp', 'lista_interesse_email') loop
    execute format('drop function if exists %s', f);
  end loop;
end
$f$;

-- 3) tabelas da lista saem
drop table if exists public.lista_interesse_tentativas;
drop table if exists public.lista_interesse_config;
drop table if exists public.lista_interesse;
drop function if exists public.lista_interesse_whatsapp(text);
drop function if exists public.lista_interesse_email(text);

-- 4) fila de e-mails: a versão da 013950 (sem a lista de interesse)
-- Fila (só serviço): a da 013800 com o comunicado, a ordem (aviso de conta inativa primeiro) e o limite do dia.
create or replace function public.ch_worker_email_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio_dia constant timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_restante integer;
begin
  update public.email_saida
     set status = 'incerto', erro = 'O envio parou no meio; não foi repetido para não mandar duas vezes.'
   where status = 'enviando' and pego_em < now() - interval '15 minutes';

  update public.email_saida e
     set status = 'cancelado', erro = 'E-mail da conta não confirmado em 30 dias.'
   where e.status = 'pendente' and e.created_at < now() - interval '30 days' and not public.email_conta_confirmada(e.user_id);

  -- comunicado apagado, ou a pessoa retirou o consentimento: o e-mail que ainda não saiu não sai mais
  update public.email_saida e
     set status = 'cancelado', erro = 'Comunicado apagado.'
   where e.status = 'pendente' and e.kind = 'comunicado'
     and not exists (select 1 from public.comunicados_equipe c where c.id = (e.payload ->> 'comunicado_id')::bigint and c.apagado_em is null);
  update public.email_saida e
     set status = 'cancelado', erro = 'A pessoa não quer mais receber e-mails de novidades.'
   where e.status = 'pendente' and e.kind = 'comunicado'
     and not exists (select 1 from public.marketing_consents m where m.user_id = e.user_id and m.opt_in);

  -- limite do dia (Google Workspace): conta o que já foi pego hoje
  v_restante := public.email_saida_teto_dia() - (select count(*) from public.email_saida where pego_em >= v_inicio_dia)::integer;
  if v_restante <= 0 then
    return '[]'::jsonb;
  end if;

  select array_agg(x.id) into v_ids
  from (
    select e.id
    from public.email_saida e
    where e.status = 'pendente' and e.kind in ('aviso_inatividade', 'comunicado') and e.proxima_em <= now() and public.email_conta_confirmada(e.user_id)
    order by (e.kind <> 'aviso_inatividade'), e.proxima_em, e.id
    limit least(greatest(1, least(coalesce(p_limite, 20), 100)), v_restante)
    for update of e skip locked
  ) x;
  if v_ids is null then
    return '[]'::jsonb;
  end if;

  update public.email_saida e
     set status = 'enviando', pego_em = now(), tentativas = e.tentativas + 1,
         payload = case
                     when e.kind = 'aviso_inatividade' then e.payload || jsonb_build_object('prazo',
                       to_char(greatest(((e.payload ->> 'ultimo_acesso')::timestamptz at time zone 'America/Sao_Paulo')::date + interval '12 months' + interval '1 day',
                                        v_hoje + 31), 'YYYY-MM-DD'))
                     when e.kind = 'comunicado' then e.payload || coalesce((
                       select jsonb_build_object('titulo', c.titulo, 'texto', c.texto, 'rico', c.rico, 'link', c.link, 'versao', c.versao,
                                                 'descadastro', public.marketing_token(e.user_id))
                       from public.comunicados_equipe c where c.id = (e.payload ->> 'comunicado_id')::bigint), '{}'::jsonb)
                     else e.payload end
   where e.id = any (v_ids);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'kind', e.kind, 'tentativas', e.tentativas, 'email', u.email,
             'nome', nullif(btrim(p.name), ''), 'payload', e.payload)
           order by e.id)
    from public.email_saida e
    join auth.users u on u.id = e.user_id
    left join public.profiles p on p.id = e.user_id
    where e.id = any (v_ids)), '[]'::jsonb);
end
$$;
revoke execute on function public.ch_worker_email_pegar(integer) from public, anon, authenticated;
grant execute on function public.ch_worker_email_pegar(integer) to service_role;
