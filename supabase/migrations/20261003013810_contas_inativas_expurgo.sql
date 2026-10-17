-- =============================================================================
-- 013810 — Contas inativas e expurgo dos registros de aceite (pedido do dono, 17/10/2026; ramo termo-funcoes)
--
-- TUDO NASCE DESLIGADO. Com as chaves desligadas, as rotinas só CONTAM o que fariam (modo ensaio) e guardam o relatório em
-- public.app_rotinas_conta_log. Nada é avisado, zerado ou apagado sem a chave ligada.
--
-- CHAVES (tabela de uma linha public.app_rotinas_conta_config; só pelo editor de SQL):
--   inativas_avisar  manda o aviso por e-mail às contas paradas há 11 meses (o e-mail sai pela fila da 013800, com SMTP no servidor)
--   inativas_agir    faz o que o aviso disse, depois do prazo e só para quem recebeu o aviso (e-mail "enviado") e não voltou
--   expurgo_ativo    apaga os registros de aceite 5 anos depois do fim do contrato
--   Ligar:    update public.app_rotinas_conta_config set inativas_avisar = true, updated_at = now();
--   Desligar: update public.app_rotinas_conta_config set inativas_avisar = false, updated_at = now();
--   Ver o que fariam: select ran_at, rotina, modo, resultado from public.app_rotinas_conta_log order by id desc limit 10;
--
-- 1) CONTA INATIVA (Política 3.0, seção 5: "contas gratuitas sem nenhum acesso por mais de 12 meses terão os dados de estudo
--    eliminados ou anonimizados, mediante aviso prévio ao seu e-mail com pelo menos 30 dias de antecedência"; Regulamento 1.0, 4.3:
--    "Se a conta ficar inativa (sem acesso) por 12 meses seguidos, o saldo de Coins e XP pode ser zerado, mediante aviso por e-mail
--    com 30 dias de antecedência"). Só ALUNOS (legal_is_student: nunca equipe nem revisor médico).
--      * último acesso = o mais recente entre: abertura do app (public.conta_acesso, gravada por app_marcar_acesso), último login,
--        criação da conta e último aceite. Quem já tinha conta quando esta migração entrou conta como visto AGORA (nenhuma conta é
--        dada como parada por falta de registro: a primeira rotina de verdade só acha alguém daqui a 11 meses);
--      * 11 meses sem acesso: aviso por e-mail. O prazo do e-mail é o maior entre 12 meses do último acesso e 31 dias depois do envio;
--        o e-mail diz "se você não entrar até <prazo>": a ação só acontece a partir do dia seguinte ao prazo (horário de Brasília);
--      * ação, depois do prazo, só se o e-mail foi ENVIADO e a pessoa não voltou:
--          - conta gratuita que NUNCA teve plano pago: a conta é apagada (como em "Excluir minha conta"; o registro do aceite fica,
--            sem a pessoa, pelos 5 anos da Política);
--          - quem já teve plano pago (pode haver dado de cobrança a guardar): não apaga; só zera os Coins (lançamento 'adjust' de
--            origem 'inatividade' no livro-razão, para a recontagem bater). XP não é zerado (decisão do dono);
--      * voltou a acessar antes do prazo: o aviso é fechado ("cancelado") e nada acontece;
--      * aviso que não saiu (falhou, incerto ou cancelado): é fechado e a rotina tenta um aviso novo; depois de 3 tentativas
--        sem entrega no mesmo período, desiste (nada é feito sem aviso entregue).
--
-- 2) EXPURGO DOS ACEITES (Política 3.0: "Registro do aceite do contrato (com IP): durante o contrato e 5 (cinco) anos depois do
--    término"). Fim do contrato = a conta apagada (o aceite fica sem a pessoa). A data fica em public.legal_contrato_fim (gatilho na
--    prova do aceite). Aceites de contas apagadas ANTES desta migração: a data conta a partir de agora (mais seguro). Com a chave
--    ligada, a rotina apaga ligando set_config('app.legal_expurgo', 'on') só na própria transação (a trava da 013740 libera só assim).
--    Contas que existem nunca têm o aceite apagado.
--
-- 3) app_marcar_acesso(): o app chama ao abrir (no máximo uma gravação por hora por conta).
--
-- Rotinas (só serviço): ch_worker_contas_inativas() e ch_worker_expurgo_aceites(), chamadas pela tarefa diária /api/legal/diaria.
-- ORDEM: depois da 013800. Pode ser colada duas vezes. Conferência no fim. Desfazer: supabase/desfazer/20261003013810_….desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- 0) o banco tem o que esta migração espera
do $confere$
begin
  if to_regclass('public.email_saida') is null or to_regprocedure('public.legal_is_student(uuid)') is null
     or to_regclass('public.user_gamification_stats') is null or to_regclass('public.coin_transactions') is null
     or to_regprocedure('public.legal_acceptances_imutavel()') is null then
    raise exception 'termo-funcoes 013810: aplique antes a 013740 e a 013800; nada foi mudado';
  end if;
end
$confere$;

-- ---------------------------------------------------------------- 1) chaves (tudo desligado) e relatório
create table if not exists public.app_rotinas_conta_config (
  id boolean primary key default true check (id),
  inativas_avisar boolean not null default false,
  inativas_agir boolean not null default false,
  expurgo_ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.app_rotinas_conta_config is
  'Chaves das rotinas de conta inativa e de expurgo dos aceites (uma linha). Tudo desligado = modo ensaio (só relatório). '
  'criado_em: a partir de quando contam os 5 anos dos aceites de contas apagadas antes da migração 013810.';
insert into public.app_rotinas_conta_config (id) values (true) on conflict (id) do nothing;
alter table public.app_rotinas_conta_config enable row level security;
revoke all on table public.app_rotinas_conta_config from public, anon, authenticated;

create table if not exists public.app_rotinas_conta_log (
  id bigint generated always as identity primary key,
  rotina text not null check (rotina in ('contas_inativas', 'expurgo_aceites')),
  modo text not null check (modo in ('ensaio', 'ligada')),
  resultado jsonb not null,
  ran_at timestamptz not null default now()
);
comment on table public.app_rotinas_conta_log is 'Relatório de cada rodada das rotinas (o que fez ou, no ensaio, o que faria). Guardado por 400 dias.';
alter table public.app_rotinas_conta_log enable row level security;
revoke all on table public.app_rotinas_conta_log from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) último acesso
create table if not exists public.conta_acesso (
  user_id uuid primary key references auth.users (id) on delete cascade,
  visto_em timestamptz not null default now()
);
comment on table public.conta_acesso is 'Última abertura do app por conta (app_marcar_acesso; no máximo uma gravação por hora). Base da regra de conta inativa.';
alter table public.conta_acesso enable row level security;
revoke all on table public.conta_acesso from public, anon, authenticated;
-- quem já tem conta conta como visto agora (só na primeira vez: colar de novo não muda nada)
insert into public.conta_acesso (user_id, visto_em) select u.id, now() from auth.users u on conflict (user_id) do nothing;

create or replace function public.app_marcar_acesso() returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    return;
  end if;
  insert into public.conta_acesso (user_id, visto_em) values (v_user, now())
  on conflict (user_id) do update set visto_em = excluded.visto_em
  where public.conta_acesso.visto_em < now() - interval '1 hour';
end
$$;

create or replace function public.conta_ultimo_acesso(p_user uuid) returns timestamptz
  language sql stable security definer set search_path = ''
as $$
  select greatest(
    (select c.visto_em from public.conta_acesso c where c.user_id = p_user),
    (select greatest(u.created_at, (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz) from auth.users u where u.id = p_user),
    (select max(a.accepted_at) from public.legal_acceptances a where a.user_id = p_user))
$$;

-- Pode apagar a conta? Só aluno, que nunca teve plano pago (a linha da assinatura só no teste, ou nenhuma).
create or replace function public.conta_pode_apagar(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.legal_is_student(p_user)
     and not exists (select 1 from public.subscriptions s where s.user_id = p_user and s.plan::text <> 'trial')
$$;

-- ---------------------------------------------------------------- 3) avisos de conta inativa
create table if not exists public.conta_inativa (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  ultimo_acesso timestamptz not null,
  acao text not null check (acao in ('apagar_conta', 'zerar_coins')),
  email_id bigint references public.email_saida (id) on delete set null,
  situacao text not null default 'avisando' check (situacao in ('avisando', 'feito', 'cancelado')),
  criado_em timestamptz not null default now(),
  aviso_enviado_em timestamptz,
  prazo date,
  fechado_em timestamptz,
  detalhe text check (char_length(detalhe) <= 300)
);
comment on table public.conta_inativa is
  'Avisos de conta inativa: quem foi avisado, quando o e-mail saiu, o prazo e o que foi feito. account_id fica depois de a conta '
  'ser apagada (prova do aviso); apagado pelo expurgo 5 anos depois.';
create unique index if not exists conta_inativa_aberta_idx on public.conta_inativa (account_id) where situacao = 'avisando';
create index if not exists conta_inativa_ciclo_idx on public.conta_inativa (account_id, ultimo_acesso);
alter table public.conta_inativa enable row level security;
revoke all on table public.conta_inativa from public, anon, authenticated;

create or replace function public.ch_worker_contas_inativas() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.app_rotinas_conta_config;
  r record;
  v_acao text;
  v_coins integer;
  v_id bigint;
  v_email bigint;
  v_lista jsonb := '[]'::jsonb;
  n_voltaram integer := 0;
  n_sem_entrega integer := 0;
  n_avisar integer := 0;
  n_avisados integer := 0;
  n_agir integer := 0;
  n_feitos integer := 0;
  n_falhas integer := 0;
  v_out jsonb;
begin
  select * into cfg from public.app_rotinas_conta_config where id;

  -- a) avisos abertos: quem voltou, quem apagou a conta sozinho e aviso que não saiu são fechados
  for r in
    select c.id, c.account_id, c.ultimo_acesso, c.email_id, e.status as email_status,
           exists (select 1 from auth.users u where u.id = c.account_id) as existe
    from public.conta_inativa c
    left join public.email_saida e on e.id = c.email_id
    where c.situacao = 'avisando'
  loop
    if not r.existe then
      update public.conta_inativa set situacao = 'cancelado', fechado_em = now(), detalhe = 'A conta foi apagada por outro caminho.' where id = r.id;
    elsif public.conta_ultimo_acesso(r.account_id) > r.ultimo_acesso then
      update public.conta_inativa set situacao = 'cancelado', fechado_em = now(), detalhe = 'A pessoa voltou a acessar.' where id = r.id;
      update public.email_saida set status = 'cancelado', erro = 'A pessoa voltou a acessar.' where id = r.email_id and status = 'pendente';
      n_voltaram := n_voltaram + 1;
    elsif r.email_id is null or r.email_status in ('falhou', 'incerto', 'cancelado') then
      update public.conta_inativa set situacao = 'cancelado', fechado_em = now(), detalhe = 'O aviso não foi entregue; nada foi feito.' where id = r.id;
      n_sem_entrega := n_sem_entrega + 1;
    end if;
  end loop;

  -- b) contas paradas há 11 meses ou mais, sem aviso aberto, ainda não tratadas neste período
  for r in
    select x.id, x.ultimo
    from (select u.id, public.conta_ultimo_acesso(u.id) as ultimo from auth.users u where public.legal_is_student(u.id)) x
    where x.ultimo < now() - interval '11 months'
      and not exists (select 1 from public.conta_inativa c where c.account_id = x.id and c.situacao = 'avisando')
      and not exists (select 1 from public.conta_inativa c where c.account_id = x.id and c.ultimo_acesso = x.ultimo and c.situacao = 'feito')
      and (select count(*) from public.conta_inativa c where c.account_id = x.id and c.ultimo_acesso = x.ultimo and c.situacao = 'cancelado') < 3
    order by x.ultimo
  loop
    v_acao := null;
    if public.conta_pode_apagar(r.id) then
      v_acao := 'apagar_conta';
    else
      select s.coins into v_coins from public.user_gamification_stats s where s.user_id = r.id;
      if coalesce(v_coins, 0) > 0 then
        v_acao := 'zerar_coins';
      end if;
    end if;
    continue when v_acao is null;
    n_avisar := n_avisar + 1;
    if jsonb_array_length(v_lista) < 50 then
      v_lista := v_lista || jsonb_build_object('conta', r.id, 'ultimo_acesso', r.ultimo, 'acao', v_acao, 'etapa', 'aviso');
    end if;
    if cfg.inativas_avisar then
      insert into public.conta_inativa (account_id, ultimo_acesso, acao) values (r.id, r.ultimo, v_acao) returning id into v_id;
      insert into public.email_saida (kind, user_id, chave, payload)
      values ('aviso_inatividade', r.id, 'inativa:' || v_id, jsonb_build_object('acao', v_acao, 'ultimo_acesso', r.ultimo))
      returning id into v_email;
      update public.conta_inativa set email_id = v_email where id = v_id;
      n_avisados := n_avisados + 1;
    end if;
  end loop;

  -- c) prazo vencido, aviso entregue, pessoa não voltou: faz o que o aviso disse
  for r in
    select c.id, c.account_id, c.acao, e.enviado_em, (e.payload ->> 'prazo')::date as prazo
    from public.conta_inativa c
    join public.email_saida e on e.id = c.email_id
    where c.situacao = 'avisando' and e.status = 'enviado'
      and now() >= (((e.payload ->> 'prazo')::date + 1)::timestamp at time zone 'America/Sao_Paulo')
  loop
    n_agir := n_agir + 1;
    if jsonb_array_length(v_lista) < 50 then
      v_lista := v_lista || jsonb_build_object('conta', r.account_id, 'acao', r.acao, 'prazo', r.prazo, 'etapa', 'acao');
    end if;
    continue when not cfg.inativas_agir;
    begin
      update public.conta_inativa set aviso_enviado_em = r.enviado_em, prazo = r.prazo where id = r.id;
      if r.acao = 'apagar_conta' then
        if not public.conta_pode_apagar(r.account_id) then
          update public.conta_inativa set situacao = 'cancelado', fechado_em = now(),
                 detalhe = 'Deixou de ser conta gratuita de aluno; não foi apagada.' where id = r.id;
          continue;
        end if;
        delete from auth.users where id = r.account_id;
      else
        select s.coins into v_coins from public.user_gamification_stats s where s.user_id = r.account_id for update;
        if coalesce(v_coins, 0) > 0 then
          insert into public.coin_transactions (user_id, amount, type, source_type, source_id, metadata)
          values (r.account_id, -v_coins, 'adjust', 'inatividade', r.id::text,
                  jsonb_build_object('motivo', 'Conta sem acesso por 12 meses (Regulamento 1.0, 4.3)', 'aviso_enviado_em', r.enviado_em));
          update public.user_gamification_stats set coins = 0 where user_id = r.account_id;
        end if;
      end if;
      update public.conta_inativa set situacao = 'feito', fechado_em = now(), detalhe = null where id = r.id;
      n_feitos := n_feitos + 1;
    exception when others then
      n_falhas := n_falhas + 1;
      update public.conta_inativa set detalhe = left('Falhou (tenta de novo amanhã): ' || sqlerrm, 300) where id = r.id;
    end;
  end loop;

  v_out := jsonb_build_object(
    'modo', case when cfg.inativas_avisar or cfg.inativas_agir then 'ligada' else 'ensaio' end,
    'avisar_ligado', cfg.inativas_avisar, 'agir_ligado', cfg.inativas_agir,
    'para_avisar', n_avisar, 'avisos_criados', n_avisados,
    'prazo_vencido', n_agir, 'feitos', n_feitos, 'falhas', n_falhas,
    'voltaram', n_voltaram, 'aviso_nao_entregue', n_sem_entrega,
    'contas', v_lista);
  insert into public.app_rotinas_conta_log (rotina, modo, resultado) values ('contas_inativas', v_out ->> 'modo', v_out);
  delete from public.app_rotinas_conta_log where ran_at < now() - interval '400 days';
  return v_out;
end
$$;

-- ---------------------------------------------------------------- 4) fim do contrato e expurgo dos aceites
create table if not exists public.legal_contrato_fim (
  account_id uuid primary key,
  terminou_em timestamptz not null default now()
);
comment on table public.legal_contrato_fim is
  'Quando o contrato de cada conta terminou (conta apagada). Os registros de aceite dela podem ser apagados 5 anos depois (Política 3.0).';
alter table public.legal_contrato_fim enable row level security;
revoke all on table public.legal_contrato_fim from public, anon, authenticated;
-- contas apagadas antes desta migração: a data conta a partir de agora (só na primeira vez)
insert into public.legal_contrato_fim (account_id, terminou_em)
select distinct a.account_id, now() from public.legal_acceptances a where a.user_id is null and a.account_id is not null
on conflict (account_id) do nothing;

create or replace function public.legal_contrato_fim_marca() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is null then
    begin
      insert into public.legal_contrato_fim (account_id, terminou_em) values (coalesce(new.account_id, old.user_id), now())
      on conflict (account_id) do nothing;
    exception when others then
      raise warning 'fim do contrato não registrado (%): %', old.user_id, sqlerrm;
    end;
  end if;
  return null;
end
$$;
drop trigger if exists legal_contrato_fim_marca on public.legal_acceptances;
create trigger legal_contrato_fim_marca after update of user_id on public.legal_acceptances
  for each row execute function public.legal_contrato_fim_marca();

create or replace function public.ch_worker_expurgo_aceites() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.app_rotinas_conta_config;
  v_ids bigint[];
  v_contas integer;
  v_mais_antigo timestamptz;
  v_apagados integer := 0;
  v_avisos integer := 0;
  v_out jsonb;
begin
  select * into cfg from public.app_rotinas_conta_config where id;

  select array_agg(a.id), count(distinct coalesce(a.account_id::text, 'sem-conta-' || a.id)), min(a.accepted_at)
    into v_ids, v_contas, v_mais_antigo
  from public.legal_acceptances a
  left join public.legal_contrato_fim f on f.account_id = a.account_id
  where a.user_id is null
    and not exists (select 1 from auth.users u where u.id = a.account_id)
    and ((a.account_id is not null and f.terminou_em < now() - interval '5 years')
         or (a.account_id is null and cfg.criado_em < now() - interval '5 years'));

  if cfg.expurgo_ativo and v_ids is not null then
    perform set_config('app.legal_expurgo', 'on', true);
    delete from public.legal_acceptances a where a.id = any (v_ids);
    get diagnostics v_apagados = row_count;
    perform set_config('app.legal_expurgo', '', true);
    delete from public.legal_contrato_fim f
    where f.terminou_em < now() - interval '5 years'
      and not exists (select 1 from public.legal_acceptances a where a.account_id = f.account_id);
  end if;
  -- prova dos avisos de conta inativa: mesmo prazo (5 anos depois de fechado, conta que não existe mais)
  if cfg.expurgo_ativo then
    delete from public.conta_inativa c
    where c.fechado_em < now() - interval '5 years' and not exists (select 1 from auth.users u where u.id = c.account_id);
    get diagnostics v_avisos = row_count;
  end if;

  v_out := jsonb_build_object(
    'modo', case when cfg.expurgo_ativo then 'ligada' else 'ensaio' end,
    'aceites_vencidos', coalesce(array_length(v_ids, 1), 0), 'contas', coalesce(v_contas, 0),
    'aceite_mais_antigo', v_mais_antigo, 'aceites_apagados', v_apagados, 'avisos_apagados', v_avisos);
  insert into public.app_rotinas_conta_log (rotina, modo, resultado) values ('expurgo_aceites', v_out ->> 'modo', v_out);
  return v_out;
end
$$;

-- ---------------------------------------------------------------- 5) permissões
revoke execute on function public.conta_ultimo_acesso(uuid) from public, anon, authenticated;
revoke execute on function public.conta_pode_apagar(uuid) from public, anon, authenticated;
revoke execute on function public.legal_contrato_fim_marca() from public, anon, authenticated;
revoke execute on function public.ch_worker_contas_inativas() from public, anon, authenticated;
revoke execute on function public.ch_worker_expurgo_aceites() from public, anon, authenticated;
revoke execute on function public.app_marcar_acesso() from public, anon;
grant execute on function public.app_marcar_acesso() to authenticated;
grant execute on function public.ch_worker_contas_inativas() to service_role;
grant execute on function public.ch_worker_expurgo_aceites() to service_role;

-- ---------------------------------------------------------------- 6) conferência final (se algo não bater, PARA com erro)
do $confere_fim$
begin
  if not exists (select 1 from public.app_rotinas_conta_config where id) then
    raise exception 'termo-funcoes 013810: faltou a linha das chaves';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'legal_contrato_fim_marca' and tgrelid = 'public.legal_acceptances'::regclass) then
    raise exception 'termo-funcoes 013810: gatilho do fim do contrato não ficou no lugar';
  end if;
  if position('app.legal_expurgo' in pg_get_functiondef('public.legal_acceptances_imutavel()'::regprocedure)) = 0 then
    raise exception 'termo-funcoes 013810: a trava da prova do aceite (013740) não tem a chave do expurgo';
  end if;
  if has_function_privilege('anon', 'public.ch_worker_contas_inativas()', 'execute')
     or has_function_privilege('authenticated', 'public.ch_worker_contas_inativas()', 'execute')
     or has_function_privilege('authenticated', 'public.ch_worker_expurgo_aceites()', 'execute')
     or has_function_privilege('anon', 'public.app_marcar_acesso()', 'execute')
     or has_table_privilege('authenticated', 'public.app_rotinas_conta_config', 'update')
     or has_table_privilege('authenticated', 'public.conta_acesso', 'insert') then
    raise exception 'termo-funcoes 013810: permissão aberta demais';
  end if;
end
$confere_fim$;
