-- =============================================================================
-- COBRANÇA (planos e extras de IA), NEUTRA quanto ao fornecedor (Asaas hoje; Stripe possível). Decisões do dono de 2026-10-17:
--   * só Pix ou cartão de crédito, SEMPRE À VISTA (sem boleto, sem parcelamento): mensal ou trimestral;
--   * cartão: assinatura no fornecedor, cobrada no dia do vencimento; Pix: cobrança nova gerada 7 dias antes do vencimento;
--   * SEM tolerância: o acesso pago vale até o fim do dia do vencimento; sem pagamento confirmado, cai (a regra de acesso já
--     faz isso com status "active" e o fim do período no passado — esta migração nunca usa "past_due", que daria 3 dias);
--     volta sozinho quando o fornecedor confirma o pagamento;
--   * CPF pedido só na hora de pagar e enviado ao fornecedor (vai para a instituição de pagamento): o banco NÃO guarda CPF;
--   * só libera com o aviso conferido E a cobrança conferida na API do fornecedor (o servidor faz as duas coisas antes de
--     chamar ch_worker_billing_pago);
--   * um pedido aberto por vez (por tipo: plano ou extra) e chave de idempotência (o mesmo clique repetido não cria dois);
--   * preços vêm do banco (catálogo da etapa 1/2 do ramo planos-acesso: direitos_planos e carteira_pacotes);
--   * devolução: cálculo da carteira (ramo planos-acesso) quando instalado; sem ele, só a devolução integral em 7 dias.
--
-- DESLIGADA POR PADRÃO, em duas travas: (1) sem a chave do fornecedor no servidor as rotas respondem 503 e as telas somem;
-- (2) mesmo com a chave, billing_config.vendas_ligadas nasce FALSE (nenhum pedido novo é aberto até o dono ligar).
--
-- PONTOS DE LIGAÇÃO com o ramo planos-acesso (013640/013680/013690), sem duplicar nada dele:
--   * preço e "à venda": public.direitos_planos (preco_mensal_centavos, preco_trimestral_centavos, a_venda) e
--     public.carteira_pacotes (preco_centavos, creditos, voz_minutos, validade_dias). Sem essas tabelas: nada à venda.
--   * plano pago: grava public.subscriptions (plano, "active", fim do período); o gatilho direitos_por_fase_sincronia
--     (013640) atualiza as fases do aluno. O PRÁTICA não cabe no tipo plan_code: fica fora de venda até existir a gravação
--     por fase (ver billing_entregar_plano).
--   * extra pago: billing_entregar_extra cria a linha em public.carteira_extras (origem "compra", referência do pagamento).
--     Sem a carteira instalada, o pedido fica pago e "entrega pendente"; ch_worker_billing_entregar_pendentes entrega depois.
--   * devolução: carteira_calcular_devolucao_plano / carteira_calcular_devolucao_extra / carteira_devolucoes (abuso).
--
-- ADITIVA: só tabelas e funções novas (billing_*, ch_worker_billing_*, app_billing_*). Não recria nem altera nenhuma função ou
-- tabela que já existe (usa billing_events, de 000500, e subscriptions, de 000100, só por funções novas).
-- Pode ser colada de novo. Desfazer: supabase/desfazer/20261003013700_cobranca.desfazer.sql.
-- =============================================================================

-- ---------------------------------------------------------------- configuração (uma linha)
create table if not exists public.billing_config (
  id boolean primary key default true check (id),
  -- segunda trava: com a chave do fornecedor no servidor, ainda assim nada é vendido até o dono ligar
  vendas_ligadas boolean not null default false,
  -- quanto tempo um pedido fica aberto esperando o pagamento (cartão: página do fornecedor; Pix: QR Code da compra)
  pedido_validade_minutos integer not null default 60 check (pedido_validade_minutos between 5 and 4320),
  -- Pix da renovação: gerado N dias antes do vencimento (decisão do dono: 7)
  renovacao_pix_dias integer not null default 7 check (renovacao_pix_dias between 1 and 30),
  -- aceite na contratação (clickwrap): versão e SHA-256 do Contrato de Assinatura vigente (o jurídico preenche)
  contrato_versao text check (char_length(contrato_versao) <= 40),
  contrato_sha256 text check (contrato_sha256 is null or contrato_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.billing_config enable row level security;
revoke all on public.billing_config from public, anon, authenticated;
insert into public.billing_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- cliente no fornecedor (sem CPF: o CPF fica só no fornecedor)
create table if not exists public.billing_clientes (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 30),
  customer_id text not null check (char_length(customer_id) between 1 and 200),
  criado_em timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, customer_id)
);
alter table public.billing_clientes enable row level security;
revoke all on public.billing_clientes from public, anon, authenticated;

-- ---------------------------------------------------------------- pedidos (o que o aluno pediu para pagar)
create table if not exists public.billing_pedidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  tipo text not null check (tipo in ('plano', 'extra')),
  codigo text not null check (codigo ~ '^[a-z][a-z0-9_]{1,30}$'),
  ciclo text not null check (ciclo in ('mensal', 'trimestral', 'avulso')),
  metodo text not null check (metodo in ('pix', 'cartao')),
  motivo text not null default 'compra' check (motivo in ('compra', 'renovacao')),
  nome text not null check (char_length(nome) between 1 and 120),
  valor_centavos integer not null check (valor_centavos > 0),
  status text not null default 'aberto'
    check (status in ('aberto', 'pago', 'falhou', 'expirado', 'cancelado', 'devolvido', 'devolvido_parcial')),
  idem_chave text not null check (char_length(idem_chave) between 8 and 100),
  provider text,
  provider_customer_id text,
  provider_payment_id text,
  provider_subscription_id text,
  url text check (url is null or url ~ '^https://'),
  pix jsonb,
  vencimento date,
  -- para a renovação por Pix: o fim do período que ela renova (evita gerar duas para o mesmo vencimento)
  renova_ate timestamptz,
  expira_em timestamptz not null,
  pago_em timestamptz,
  periodo_fim timestamptz,
  entregue boolean not null default false,
  entrega jsonb not null default '{}'::jsonb,
  aceite jsonb,
  erro text check (char_length(erro) <= 300),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (tipo <> 'extra' or ciclo = 'avulso'),
  check (tipo <> 'plano' or ciclo in ('mensal', 'trimestral'))
);
create unique index if not exists billing_pedidos_idem_idx on public.billing_pedidos (user_id, idem_chave);
-- UM pedido aberto por vez, por tipo (ideia do Codex): não dá para abrir dois pagamentos do plano ao mesmo tempo
create unique index if not exists billing_pedidos_um_aberto_idx on public.billing_pedidos (user_id, tipo) where status = 'aberto';
create unique index if not exists billing_pedidos_pagamento_idx on public.billing_pedidos (provider, provider_payment_id) where provider_payment_id is not null;
create unique index if not exists billing_pedidos_renovacao_idx on public.billing_pedidos (user_id, renova_ate) where motivo = 'renovacao' and status in ('aberto', 'pago');
create index if not exists billing_pedidos_assinatura_idx on public.billing_pedidos (provider, provider_subscription_id) where provider_subscription_id is not null;
alter table public.billing_pedidos enable row level security;
revoke all on public.billing_pedidos from public, anon, authenticated;

-- ---------------------------------------------------------------- cobranças (cada pagamento do fornecedor, inclusive as renovações do cartão)
create table if not exists public.billing_cobrancas (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_payment_id text not null check (char_length(provider_payment_id) between 1 and 200),
  user_id uuid references auth.users (id) on delete set null,
  pedido_id uuid references public.billing_pedidos (id) on delete set null,
  provider_subscription_id text,
  tipo text not null check (tipo in ('plano', 'extra')),
  codigo text not null,
  ciclo text not null check (ciclo in ('mensal', 'trimestral', 'avulso')),
  metodo text not null check (metodo in ('pix', 'cartao')),
  valor_centavos integer not null check (valor_centavos >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'paga', 'falhou', 'devolvida', 'devolvida_parcial')),
  pago_em timestamptz,
  devolvido_centavos integer not null default 0 check (devolvido_centavos >= 0),
  periodo_fim timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provider, provider_payment_id),
  check (devolvido_centavos <= valor_centavos)
);
create index if not exists billing_cobrancas_user_idx on public.billing_cobrancas (user_id, criado_em desc);
alter table public.billing_cobrancas enable row level security;
revoke all on public.billing_cobrancas from public, anon, authenticated;

-- ---------------------------------------------------------------- contrato vigente do plano (um por aluno)
-- contratado_em = início do contrato atual (base do prazo de 7 dias e da devolução do trimestral); renovações não mudam.
create table if not exists public.billing_contratos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plano text not null check (plano in ('pro', 'pratica', 'elite')),
  ciclo text not null check (ciclo in ('mensal', 'trimestral')),
  metodo text not null check (metodo in ('pix', 'cartao')),
  valor_centavos integer not null check (valor_centavos > 0),
  renova boolean not null default true,
  provider text not null,
  provider_subscription_id text,
  contratado_em timestamptz not null,
  periodo_inicio timestamptz not null,
  periodo_fim timestamptz not null,
  ultima_cobranca_id bigint references public.billing_cobrancas (id) on delete set null,
  atualizado_em timestamptz not null default now()
);
alter table public.billing_contratos enable row level security;
revoke all on public.billing_contratos from public, anon, authenticated;

-- ---------------------------------------------------------------- devoluções pedidas ao fornecedor
create table if not exists public.billing_reembolsos (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  cobranca_id bigint not null references public.billing_cobrancas (id) on delete cascade,
  valor_centavos integer not null check (valor_centavos > 0),
  total boolean not null,
  regra jsonb not null default '{}'::jsonb,
  -- até onde vai o acesso depois da devolução (trimestral: fim do mês em curso; integral: agora)
  acesso_ate timestamptz,
  status text not null default 'solicitado' check (status in ('solicitado', 'feito', 'falhou', 'equipe')),
  erro text check (char_length(erro) <= 300),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists billing_reembolsos_aberto_idx on public.billing_reembolsos (cobranca_id) where status in ('solicitado', 'equipe');
alter table public.billing_reembolsos enable row level security;
revoke all on public.billing_reembolsos from public, anon, authenticated;

-- ---------------------------------------------------------------- ligação com o catálogo (ramo planos-acesso)
-- Preço e nome de uma oferta À VENDA. null = fora de venda (ou catálogo ainda não instalado). Lê por SQL dinâmico para esta
-- migração não depender da 013640/013680: sem elas, nada é vendido.
create or replace function public.billing_oferta(p_tipo text, p_codigo text, p_ciclo text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  if p_tipo = 'plano' then
    -- o PRÁTICA ainda não pode ser gravado (tipo plan_code só tem pro/elite): fora de venda até a gravação por fase
    if p_codigo not in ('pro', 'elite') or p_ciclo not in ('mensal', 'trimestral') then return null; end if;
    if to_regclass('public.direitos_planos') is null then return null; end if;
    begin
      execute $q$ select jsonb_build_object('nome', p.nome || case when $2 = 'trimestral' then ' trimestral' else ' mensal' end,
                                            'valor_centavos', case when $2 = 'trimestral' then p.preco_trimestral_centavos else p.preco_mensal_centavos end)
                  from public.direitos_planos p where p.codigo = $1 and p.a_venda $q$
        into r using p_codigo, p_ciclo;
    exception when undefined_column then return null;
    end;
  elsif p_tipo = 'extra' then
    if p_ciclo <> 'avulso' or to_regclass('public.carteira_pacotes') is null then return null; end if;
    execute $q$ select jsonb_build_object('nome', k.nome, 'valor_centavos', k.preco_centavos, 'creditos', k.creditos,
                                          'voz_minutos', k.voz_minutos, 'validade_dias', k.validade_dias)
                from public.carteira_pacotes k where k.codigo = $1 $q$
      into r using p_codigo;
  end if;
  if r is null or coalesce((r ->> 'valor_centavos')::int, 0) <= 0 then return null; end if;
  return r;
end
$$;
revoke execute on function public.billing_oferta(text, text, text) from public, anon, authenticated;

-- Vitrine: planos (à venda ou "em breve") e extras, com preço do banco.
create or replace function public.billing_vitrine() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_planos jsonb := '[]'::jsonb; v_extras jsonb := '[]'::jsonb;
begin
  if to_regclass('public.direitos_planos') is not null then
    begin
      execute $q$ select coalesce(jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', p.nome, 'descricao', p.descricao,
                     'mensal_centavos', p.preco_mensal_centavos, 'trimestral_centavos', p.preco_trimestral_centavos,
                     'a_venda', p.a_venda and p.codigo in ('pro', 'elite')) order by p.posicao), '[]'::jsonb)
                  from public.direitos_planos p $q$ into v_planos;
    exception when undefined_column then v_planos := '[]'::jsonb;
    end;
  end if;
  if to_regclass('public.carteira_pacotes') is not null then
    execute $q$ select coalesce(jsonb_agg(jsonb_build_object('codigo', k.codigo, 'nome', k.nome, 'valor_centavos', k.preco_centavos,
                   'creditos', k.creditos, 'voz_minutos', k.voz_minutos, 'validade_dias', k.validade_dias) order by k.posicao), '[]'::jsonb)
                from public.carteira_pacotes k where k.preco_centavos > 0 $q$ into v_extras;
  end if;
  return jsonb_build_object('planos', v_planos, 'extras', v_extras);
end
$$;
revoke execute on function public.billing_vitrine() from public, anon, authenticated;

-- Entrega do extra pago na carteira (013680). Sem a carteira: devolve null (o pedido fica "entrega pendente").
create or replace function public.billing_entregar_extra(p_user uuid, p_codigo text, p_referencia text, p_preco integer, p_pago_em timestamptz)
  returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare v_id bigint;
begin
  if to_regclass('public.carteira_extras') is null or to_regclass('public.carteira_pacotes') is null then return null; end if;
  execute $q$
    insert into public.carteira_extras (user_id, pacote, origem, creditos, voz_segundos, preco_pago_centavos, valido_de, valido_ate, referencia)
    select $1, k.codigo, 'compra', k.creditos, k.voz_minutos * 60, $4, $5, $5 + make_interval(days => k.validade_dias), $3
    from public.carteira_pacotes k where k.codigo = $2
    on conflict (referencia) do update set referencia = excluded.referencia
    returning id $q$
    into v_id using p_user, p_codigo, p_referencia, p_preco, p_pago_em;
  return v_id;
end
$$;
revoke execute on function public.billing_entregar_extra(uuid, text, text, integer, timestamptz) from public, anon, authenticated;

-- Grava o plano pago na assinatura (o gatilho da 013640, quando instalado, atualiza as fases). Só pro/elite (plan_code).
create or replace function public.billing_entregar_plano(p_user uuid, p_plano text, p_fim timestamptz, p_provider text, p_customer text, p_subscription text)
  returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_plano not in ('pro', 'elite') then raise exception 'Plano % ainda não pode ser gravado na assinatura.', p_plano using errcode = '22023'; end if;
  insert into public.subscriptions (user_id, plan, status, current_period_end, provider, provider_customer_id, provider_subscription_id, updated_at)
  values (p_user, p_plano::public.plan_code, 'active', p_fim, p_provider, p_customer, nullif(p_subscription, ''), now())
  on conflict (user_id) do update set plan = excluded.plan, status = 'active', current_period_end = excluded.current_period_end,
    provider = excluded.provider,
    provider_customer_id = coalesce(excluded.provider_customer_id, public.subscriptions.provider_customer_id),
    provider_subscription_id = case when p_subscription = '' then null
                                    else coalesce(excluded.provider_subscription_id, public.subscriptions.provider_subscription_id) end,
    updated_at = now();
end
$$;
revoke execute on function public.billing_entregar_plano(uuid, text, timestamptz, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- funções do servidor (só a chave de serviço)

-- Situação da pessoa para comprar.
create or replace function public.ch_worker_billing_contexto(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email text;
  v_sub public.subscriptions%rowtype;
  v_terms boolean;
  c public.billing_contratos%rowtype;
begin
  select email into v_email from auth.users where id = p_user;
  if v_email is null then return null; end if;
  select * into v_sub from public.subscriptions where user_id = p_user;
  select * into c from public.billing_contratos where user_id = p_user;
  v_terms := not public.legal_is_student(p_user) or exists (
    select 1 from public.legal_acceptances a join public.legal_versions v on v.document = a.document and v.version = a.version
    where a.user_id = p_user and a.document = 'termo_uso');
  return jsonb_build_object(
    'email', v_email,
    'full_access', public.user_has_full_access(p_user),
    'terms_ok', v_terms,
    'vendas_ligadas', (select b.vendas_ligadas from public.billing_config b),
    'plan', v_sub.plan, 'status', v_sub.status, 'period_end', v_sub.current_period_end,
    'paid_now', coalesce(v_sub.user_id is not null and public.subscription_is_paid(v_sub.plan, v_sub.status, v_sub.current_period_end), false),
    'clientes', coalesce((select jsonb_object_agg(k.provider, k.customer_id) from public.billing_clientes k where k.user_id = p_user), '{}'::jsonb),
    'contrato', case when c.user_id is null then null else jsonb_build_object('plano', c.plano, 'ciclo', c.ciclo, 'metodo', c.metodo,
                  'valor_centavos', c.valor_centavos, 'renova', c.renova, 'provider', c.provider, 'subscription_id', c.provider_subscription_id,
                  'contratado_em', c.contratado_em, 'periodo_fim', c.periodo_fim) end);
end
$$;

create or replace function public.ch_worker_billing_cliente_salvar(p_user uuid, p_provider text, p_customer text) returns void
  language sql security definer set search_path = ''
as $$
  insert into public.billing_clientes (user_id, provider, customer_id) values (p_user, p_provider, p_customer)
  on conflict (user_id, provider) do update set customer_id = excluded.customer_id
$$;

-- Abre um pedido (idempotente pela chave). Erros com código para a tela: P0001 + mensagem começando com a etiqueta.
create or replace function public.ch_worker_billing_pedido_abrir(p_user uuid, p_tipo text, p_codigo text, p_ciclo text, p_metodo text,
                                                                 p_motivo text, p_idem text, p_aceite jsonb, p_renova_ate timestamptz default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.billing_config;
  o jsonb;
  p public.billing_pedidos;
  v_aberto public.billing_pedidos;
begin
  select * into cfg from public.billing_config;
  if p_motivo = 'compra' and not coalesce(cfg.vendas_ligadas, false) then
    raise exception 'vendas_desligadas: As vendas ainda não estão abertas.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  select * into p from public.billing_pedidos where user_id = p_user and idem_chave = p_idem;
  if found then return to_jsonb(p) || jsonb_build_object('repetido', true); end if;
  -- pedido aberto vencido sai da frente (a tarefa agendada cancela a cobrança no fornecedor)
  update public.billing_pedidos set status = 'expirado', atualizado_em = now()
  where user_id = p_user and tipo = p_tipo and status = 'aberto' and expira_em <= now();
  select * into v_aberto from public.billing_pedidos where user_id = p_user and tipo = p_tipo and status = 'aberto';
  if found then
    if v_aberto.codigo = p_codigo and v_aberto.ciclo = p_ciclo and v_aberto.metodo = p_metodo and v_aberto.url is not null then
      return to_jsonb(v_aberto) || jsonb_build_object('reaproveitado', true);
    end if;
    raise exception 'pedido_aberto: Você já tem um pagamento em aberto (%). Conclua ou cancele antes de abrir outro.', v_aberto.nome;
  end if;
  if p_motivo = 'renovacao' then
    -- renovação: o preço do CONTRATO (quem já assina mantém o preço), mesmo que o catálogo tenha mudado ou saído de venda
    select jsonb_build_object('nome', initcap(c.plano) || case when c.ciclo = 'trimestral' then ' trimestral' else ' mensal' end || ' (renovação)',
                              'valor_centavos', c.valor_centavos)
      into o from public.billing_contratos c
      where c.user_id = p_user and c.plano = p_codigo and c.ciclo = p_ciclo and c.renova;
  else
    o := public.billing_oferta(p_tipo, p_codigo, p_ciclo);
  end if;
  if o is null then raise exception 'fora_de_venda: Esta opção não está à venda.'; end if;
  if p_tipo = 'plano' and p_motivo = 'compra' and public.ch_worker_billing_renovacao_pendente(p_user) is not null then
    raise exception 'renovacao_pendente: A renovação do seu cartão não passou. Pague essa mesma cobrança por Pix para voltar na hora.';
  end if;
  if p_tipo = 'plano' and p_motivo = 'compra' and exists (
       select 1 from public.billing_contratos c where c.user_id = p_user and c.periodo_fim > now()) then
    raise exception 'ja_assinante: Você já tem um plano ativo. A troca de plano ainda não está disponível pelo app.';
  end if;
  insert into public.billing_pedidos (user_id, tipo, codigo, ciclo, metodo, motivo, nome, valor_centavos, idem_chave, expira_em, aceite, renova_ate)
  values (p_user, p_tipo, p_codigo, p_ciclo, p_metodo, p_motivo, o ->> 'nome', (o ->> 'valor_centavos')::int, p_idem,
          -- renovação por Pix: fica pagável até 30 dias depois do vencimento (pagou atrasado = o acesso volta na hora)
          case when p_motivo = 'renovacao' then coalesce(p_renova_ate, now()) + interval '30 days'
               else now() + make_interval(mins => cfg.pedido_validade_minutos) end,
          -- aceite na contratação: o servidor carimba a versão do contrato, a hora do banco e o retrato da oferta
          case when p_aceite is null then null else p_aceite || jsonb_build_object('contrato_versao', cfg.contrato_versao,
               'contrato_sha256', cfg.contrato_sha256, 'registrado_em', now(), 'oferta', o) end,
          p_renova_ate)
  returning * into p;
  return to_jsonb(p);
end
$$;

create or replace function public.ch_worker_billing_pedido_anexar(p_pedido uuid, p_provider text, p_customer text, p_payment text,
                                                                  p_subscription text, p_url text, p_pix jsonb, p_vencimento date)
  returns void
  language sql security definer set search_path = ''
as $$
  update public.billing_pedidos set provider = p_provider, provider_customer_id = p_customer, provider_payment_id = p_payment,
    provider_subscription_id = p_subscription, url = p_url, pix = p_pix, vencimento = p_vencimento, atualizado_em = now()
  where id = p_pedido and status = 'aberto'
$$;

-- Encerra um pedido ainda aberto (falhou, cancelado pelo aluno, expirado). Devolve o pedido (para cancelar no fornecedor).
create or replace function public.ch_worker_billing_pedido_encerrar(p_pedido uuid, p_status text, p_erro text, p_user uuid default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare p public.billing_pedidos;
begin
  if p_status not in ('falhou', 'cancelado', 'expirado') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  update public.billing_pedidos set status = p_status, erro = left(p_erro, 300), atualizado_em = now()
  where id = p_pedido and status = 'aberto' and (p_user is null or user_id = p_user)
  returning * into p;
  return case when p.id is null then null else to_jsonb(p) end;
end
$$;

-- Pedido (do próprio aluno, se p_user vier).
create or replace function public.ch_worker_billing_pedido(p_pedido uuid, p_user uuid default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select to_jsonb(p) from public.billing_pedidos p where p.id = p_pedido and (p_user is null or p.user_id = p_user) $$;

-- Pedidos abertos que venceram (para cancelar a cobrança no fornecedor e encerrar).
create or replace function public.ch_worker_billing_pedidos_vencidos() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'provider', p.provider, 'payment_id', p.provider_payment_id,
                                               'subscription_id', p.provider_subscription_id) order by p.expira_em), '[]'::jsonb)
  from public.billing_pedidos p where p.status = 'aberto' and p.expira_em <= now()
$$;

-- Aviso do fornecedor contado uma vez (tabela billing_events, de 000500). true = ainda não processado.
create or replace function public.ch_worker_billing_evento(p_provider text, p_event_id text, p_type text, p_payload jsonb) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_done timestamptz;
begin
  insert into public.billing_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, p_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing;
  select processed_at into v_done from public.billing_events where provider = p_provider and event_id = p_event_id;
  return v_done is null;
end
$$;

create or replace function public.ch_worker_billing_evento_feito(p_provider text, p_event_id text, p_user uuid) returns void
  language sql security definer set search_path = ''
as $$ update public.billing_events set processed_at = now(), user_id = coalesce(p_user, user_id) where provider = p_provider and event_id = p_event_id $$;

-- A quem pertence uma cobrança do fornecedor: pelo pedido (id da cobrança ou referência "smp:<pedido>") ou, para as
-- renovações automáticas do cartão, pelo contrato (id da assinatura).
create or replace function public.ch_worker_billing_achar(p_provider text, p_payment text, p_subscription text, p_ref text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare p public.billing_pedidos; c public.billing_contratos; v_ref uuid;
begin
  select * into p from public.billing_pedidos where provider = p_provider and provider_payment_id = p_payment;
  if not found and p_ref ~ '^smp:[0-9a-f-]{36}$' then
    v_ref := substr(p_ref, 5)::uuid;
    select * into p from public.billing_pedidos where id = v_ref;
  end if;
  if not found and p_subscription is not null then
    select * into p from public.billing_pedidos where provider = p_provider and provider_subscription_id = p_subscription
    order by criado_em limit 1;
  end if;
  if p_subscription is not null then
    select * into c from public.billing_contratos where provider = p_provider and provider_subscription_id = p_subscription;
  end if;
  return jsonb_build_object('pedido', case when p.id is null then null else to_jsonb(p) end,
                            'contrato', case when c.user_id is null then null else to_jsonb(c) end,
                            'cobranca', (select to_jsonb(x) from public.billing_cobrancas x where x.provider = p_provider and x.provider_payment_id = p_payment));
end
$$;

-- PAGAMENTO CONFIRMADO (o servidor já conferiu o aviso e a cobrança na API, e o valor). Repetir não duplica.
-- p_periodo_fim: calculado no servidor (cartão: vencimento + ciclo; Pix: vencimento ou dia do pagamento, o que for maior, + ciclo).
create or replace function public.ch_worker_billing_pago(p_provider text, p_payment text, p_pedido uuid, p_user uuid, p_subscription text,
                                                         p_customer text, p_tipo text, p_codigo text, p_ciclo text, p_metodo text,
                                                         p_valor integer, p_pago_em timestamptz, p_periodo_fim timestamptz)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  p public.billing_pedidos;
  c public.billing_contratos;
  v_extra bigint;
  v_full boolean;
begin
  if p_user is null then raise exception 'Pagamento sem aluno.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  select * into x from public.billing_cobrancas where provider = p_provider and provider_payment_id = p_payment;
  if found and x.status in ('paga', 'devolvida', 'devolvida_parcial') then
    return jsonb_build_object('repetido', true, 'status', x.status);
  end if;
  if p_pedido is not null then
    select * into p from public.billing_pedidos where id = p_pedido;
    if p.user_id is distinct from p_user then raise exception 'Pedido de outra pessoa.'; end if;
    -- conferência do valor: o fornecedor tem de ter cobrado exatamente o preço do pedido
    if p.valor_centavos <> p_valor then raise exception 'valor_diferente: pedido % centavos, cobrado % centavos.', p.valor_centavos, p_valor; end if;
  elsif p_tipo = 'plano' then
    -- renovação automática sem pedido achado: confere com o valor do contrato
    select * into c from public.billing_contratos where user_id = p_user;
    if c.user_id is null or c.valor_centavos <> p_valor then
      raise exception 'valor_diferente: contrato % centavos, cobrado % centavos.', c.valor_centavos, p_valor;
    end if;
  else
    raise exception 'Pagamento de extra sem pedido.';
  end if;
  insert into public.billing_cobrancas (provider, provider_payment_id, user_id, pedido_id, provider_subscription_id, tipo, codigo, ciclo, metodo,
                                        valor_centavos, status, pago_em, periodo_fim)
  values (p_provider, p_payment, p_user, p_pedido, p_subscription, p_tipo, p_codigo, p_ciclo, p_metodo, p_valor, 'paga', p_pago_em,
          case when p_tipo = 'plano' then p_periodo_fim end)
  on conflict (provider, provider_payment_id) do update set status = 'paga', pago_em = excluded.pago_em,
    periodo_fim = excluded.periodo_fim, pedido_id = coalesce(public.billing_cobrancas.pedido_id, excluded.pedido_id), atualizado_em = now()
  returning * into x;
  update public.billing_pedidos set status = 'pago', pago_em = p_pago_em, periodo_fim = x.periodo_fim, atualizado_em = now()
  where id = p_pedido and status in ('aberto', 'expirado', 'cancelado', 'falhou');
  if p_customer is not null then
    insert into public.billing_clientes (user_id, provider, customer_id) values (p_user, p_provider, p_customer)
    on conflict do nothing;
  end if;
  v_full := public.user_has_full_access(p_user);

  if p_tipo = 'extra' then
    v_extra := public.billing_entregar_extra(p_user, p_codigo, p_provider || ':' || p_payment, p_valor, p_pago_em);
    update public.billing_pedidos set entregue = v_extra is not null,
      entrega = jsonb_build_object('carteira_extra_id', v_extra), atualizado_em = now() where id = p_pedido;
    return jsonb_build_object('status', 'paga', 'tipo', 'extra', 'entregue', v_extra is not null, 'cobranca_id', x.id);
  end if;

  -- plano: contrato vigente (renovação mantém a data de contratação; plano novo começa um contrato novo)
  select * into c from public.billing_contratos where user_id = p_user;
  insert into public.billing_contratos as k (user_id, plano, ciclo, metodo, valor_centavos, renova, provider, provider_subscription_id,
                                             contratado_em, periodo_inicio, periodo_fim, ultima_cobranca_id)
  -- cobrança de uma assinatura do cartão paga por Pix (renovação que falhou): o contrato continua "cartão" (senão o Pix de
  -- renovação também seria gerado e o aluno pagaria duas vezes)
  values (p_user, p_codigo, p_ciclo, case when p_subscription is not null then 'cartao' else p_metodo end, p_valor, true, p_provider, p_subscription,
          p_pago_em, p_pago_em, p_periodo_fim, x.id)
  on conflict (user_id) do update set
    contratado_em = case when k.plano = excluded.plano and k.ciclo = excluded.ciclo and k.periodo_fim > excluded.periodo_inicio - interval '45 days'
                         then k.contratado_em else excluded.contratado_em end,
    plano = excluded.plano, ciclo = excluded.ciclo, metodo = excluded.metodo, valor_centavos = excluded.valor_centavos,
    renova = case when excluded.provider_subscription_id is null and excluded.metodo = 'cartao' then false else true end,
    provider = excluded.provider, provider_subscription_id = coalesce(excluded.provider_subscription_id,
                 case when excluded.metodo = 'cartao' then k.provider_subscription_id end),
    periodo_inicio = excluded.periodo_inicio,
    periodo_fim = greatest(excluded.periodo_fim, case when k.plano = excluded.plano then k.periodo_fim else excluded.periodo_fim end),
    ultima_cobranca_id = excluded.ultima_cobranca_id, atualizado_em = now()
  returning * into c;
  if not v_full then
    perform public.billing_entregar_plano(p_user, p_codigo, c.periodo_fim, p_provider, p_customer, coalesce(c.provider_subscription_id, ''));
  end if;
  return jsonb_build_object('status', 'paga', 'tipo', 'plano', 'periodo_fim', c.periodo_fim, 'cobranca_id', x.id, 'equipe', v_full);
end
$$;

-- COBRANÇA RECUSADA / VENCIDA SEM PAGAMENTO (decisão do dono 17/10: BLOQUEIO NO MESMO DIA, sem tolerância enquanto o fornecedor
-- tenta de novo). Se esta cobrança era a renovação do período que está acabando (o acesso vai até p_venc_fim, o fim do dia do
-- vencimento dela), o acesso pago cai AGORA. Volta sozinho quando qualquer pagamento for confirmado (a mesma cobrança paga
-- depois, ou paga por Pix pelo app). O pedido NÃO é fechado: no cartão o aluno ainda pode tentar de novo na mesma página.
create or replace function public.ch_worker_billing_falhou(p_provider text, p_payment text, p_pedido uuid, p_user uuid, p_subscription text,
                                                           p_tipo text, p_codigo text, p_ciclo text, p_metodo text, p_valor integer, p_motivo text,
                                                           p_venc_fim timestamptz default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare x public.billing_cobrancas; v_cortou boolean := false;
begin
  insert into public.billing_cobrancas (provider, provider_payment_id, user_id, pedido_id, provider_subscription_id, tipo, codigo, ciclo, metodo, valor_centavos, status)
  values (p_provider, p_payment, p_user, p_pedido, p_subscription, p_tipo, p_codigo, p_ciclo, p_metodo, p_valor, 'falhou')
  on conflict (provider, provider_payment_id) do update set status = 'falhou', atualizado_em = now()
    where public.billing_cobrancas.status = 'pendente'
  returning * into x;
  if p_tipo = 'plano' and p_user is not null and p_venc_fim is not null and not public.user_has_full_access(p_user) then
    -- só corta o período que esta cobrança deveria renovar (nunca um período já pago por outra cobrança mais nova)
    update public.subscriptions set current_period_end = now(), updated_at = now()
    where user_id = p_user and plan::text = p_codigo and current_period_end > now() and current_period_end <= p_venc_fim + interval '1 hour';
    v_cortou := found;
  end if;
  return jsonb_build_object('registrado', x.id is not null, 'acesso_pausado', v_cortou);
end
$$;

-- Renovação do CARTÃO que falhou e ainda não foi paga (para o aluno pagar a MESMA cobrança por Pix e voltar na hora, sem risco
-- de cobrança em dobro: a cobrança deixa de ser de cartão, o fornecedor não tenta mais o cartão).
create or replace function public.ch_worker_billing_renovacao_pendente(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('cobranca_id', x.id, 'provider', x.provider, 'payment_id', x.provider_payment_id, 'valor_centavos', x.valor_centavos,
                            'plano', c.plano, 'ciclo', c.ciclo, 'periodo_fim', c.periodo_fim,
                            'pedido_pix', (select p.id from public.billing_pedidos p where p.provider = x.provider and p.provider_payment_id = x.provider_payment_id and p.status = 'aberto'))
  from public.billing_cobrancas x
  join public.billing_contratos c on c.user_id = x.user_id and c.provider_subscription_id = x.provider_subscription_id
  where x.user_id = p_user and x.tipo = 'plano' and x.status = 'falhou' and c.renova and x.criado_em > now() - interval '35 days'
  order by x.criado_em desc limit 1
$$;

-- DEVOLUÇÃO CONFIRMADA pelo fornecedor. p_devolvido = total devolvido até agora (centavos). Corta ou encurta o acesso conforme a
-- devolução pedida (billing_reembolsos.acesso_ate); devolução feita direto no painel do fornecedor (sem pedido nosso): total = corta.
create or replace function public.ch_worker_billing_devolvido(p_provider text, p_payment text, p_devolvido integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  r public.billing_reembolsos;
  v_total boolean;
  v_ate timestamptz;
begin
  select * into x from public.billing_cobrancas where provider = p_provider and provider_payment_id = p_payment for update;
  if not found then return jsonb_build_object('conhecida', false); end if;
  v_total := p_devolvido >= x.valor_centavos;
  update public.billing_cobrancas set devolvido_centavos = least(valor_centavos, greatest(devolvido_centavos, p_devolvido)),
    status = case when v_total then 'devolvida' else 'devolvida_parcial' end, atualizado_em = now()
  where id = x.id;
  update public.billing_pedidos set status = case when v_total then 'devolvido' else 'devolvido_parcial' end, atualizado_em = now()
  where id = x.pedido_id;
  update public.billing_reembolsos set status = 'feito', atualizado_em = now()
  where cobranca_id = x.id and status in ('solicitado', 'equipe')
  returning * into r;
  v_ate := case when r.id is not null then r.acesso_ate when v_total then now() else null end;
  if x.tipo = 'plano' and v_ate is not null and x.user_id is not null then
    update public.billing_contratos set periodo_fim = least(periodo_fim, v_ate), renova = false, atualizado_em = now()
    where user_id = x.user_id and ultima_cobranca_id = x.id;
    if not public.user_has_full_access(x.user_id) then
      update public.subscriptions set current_period_end = least(current_period_end, v_ate),
        status = case when v_ate <= now() then 'canceled'::public.subscription_status else status end, updated_at = now()
      where user_id = x.user_id and plan::text = x.codigo;
    end if;
  elsif x.tipo = 'extra' and v_total and to_regclass('public.carteira_extras') is not null then
    execute $q$ update public.carteira_extras set cancelado_em = coalesce(cancelado_em, now()), cancelado_motivo = 'Devolução do pagamento'
                where referencia = $1 $q$ using p_provider || ':' || p_payment;
  end if;
  return jsonb_build_object('conhecida', true, 'total', v_total, 'acesso_ate', v_ate, 'user_id', x.user_id);
end
$$;

-- Assinatura (renovação do cartão) encerrada no fornecedor: o acesso vai até o fim do período já pago, sem renovar.
create or replace function public.ch_worker_billing_assinatura_fim(p_provider text, p_subscription text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare c public.billing_contratos;
begin
  update public.billing_contratos set renova = false, provider_subscription_id = null, atualizado_em = now()
  where provider = p_provider and provider_subscription_id = p_subscription
  returning * into c;
  if c.user_id is not null then
    update public.subscriptions set provider_subscription_id = null, updated_at = now()
    where user_id = c.user_id and provider_subscription_id = p_subscription;
  end if;
  return jsonb_build_object('user_id', c.user_id);
end
$$;

-- Cancelar a renovação pedido pelo aluno: devolve o que cancelar no fornecedor; o acesso segue até o fim do período.
create or replace function public.ch_worker_billing_cancelar_renovacao(p_user uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare c public.billing_contratos; v_abertos jsonb;
begin
  select * into c from public.billing_contratos where user_id = p_user and renova and periodo_fim > now();
  if not found then return null; end if;
  update public.billing_contratos set renova = false, atualizado_em = now() where user_id = p_user;
  -- Pix de renovação já gerado e não pago: cancelar também
  with x as (
    update public.billing_pedidos set status = 'cancelado', erro = 'Renovação cancelada pelo aluno', atualizado_em = now()
    where user_id = p_user and motivo = 'renovacao' and status = 'aberto'
    returning provider, provider_payment_id
  ) select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'payment_id', provider_payment_id)), '[]'::jsonb) into v_abertos from x;
  return jsonb_build_object('provider', c.provider, 'subscription_id', c.provider_subscription_id, 'periodo_fim', c.periodo_fim, 'pix_abertos', v_abertos);
end
$$;

-- Renovações por Pix a gerar: contrato Pix que renova, vencendo em até N dias, sem Pix de renovação aberto/pago para esse fim.
create or replace function public.ch_worker_billing_renovacoes_pix() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'plano', c.plano, 'ciclo', c.ciclo, 'periodo_fim', c.periodo_fim,
                                               'provider', c.provider, 'customer_id', k.customer_id) order by c.periodo_fim), '[]'::jsonb)
  from public.billing_contratos c
  join public.billing_clientes k on k.user_id = c.user_id and k.provider = c.provider
  where c.metodo = 'pix' and c.renova
    and c.periodo_fim > now() - interval '1 day'
    -- conta em DIAS de Brasília (o período acaba às 23:59 do vencimento; comparar horas daria um dia a menos)
    and (c.periodo_fim at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date
        <= (select b.renovacao_pix_dias from public.billing_config b)
    and not exists (select 1 from public.billing_pedidos p where p.user_id = c.user_id and p.motivo = 'renovacao'
                    and p.renova_ate = c.periodo_fim and p.status in ('aberto', 'pago'))
$$;

-- Entrega os extras pagos que ficaram pendentes (carteira instalada depois do pagamento).
create or replace function public.ch_worker_billing_entregar_pendentes() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare p record; v_id bigint; n integer := 0;
begin
  for p in select b.id, b.user_id, b.codigo, b.provider, b.provider_payment_id, b.valor_centavos, b.pago_em
           from public.billing_pedidos b where b.tipo = 'extra' and b.status = 'pago' and not b.entregue and b.user_id is not null loop
    v_id := public.billing_entregar_extra(p.user_id, p.codigo, p.provider || ':' || p.provider_payment_id, p.valor_centavos, p.pago_em);
    if v_id is not null then
      update public.billing_pedidos set entregue = true, entrega = jsonb_build_object('carteira_extra_id', v_id), atualizado_em = now() where id = p.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- DEVOLUÇÃO: o que o aluno pode receber de volta agora, por cobrança (plano vigente e extras), pela regra do dono.
-- Usa o cálculo da carteira (013680) quando instalado; sem ele, só a devolução integral em até 7 dias.
create or replace function public.billing_devolucao_calculo(p_cobranca bigint, p_agora timestamptz default now()) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  c public.billing_contratos;
  v_ant integer := 0;
  v_calc jsonb;
  v_usados numeric := 0;
  v_creditos numeric;
  v_base timestamptz;
  v_meses integer;
  v_renov boolean := false;
begin
  select * into x from public.billing_cobrancas where id = p_cobranca;
  if not found or x.status <> 'paga' or x.devolvido_centavos > 0 then return null; end if;
  if to_regprocedure('public.carteira_devolucoes_recentes(uuid)') is not null then
    execute 'select public.carteira_devolucoes_recentes($1)' into v_ant using x.user_id;
  end if;
  if x.tipo = 'plano' then
    select * into c from public.billing_contratos where user_id = x.user_id and ultima_cobranca_id = x.id;
    if c.user_id is null then return null; end if;   -- só a cobrança do período vigente
    v_base := c.contratado_em;
    -- os 7 dias de devolução integral (arrependimento, CDC art. 49) contam da CONTRATAÇÃO, não de cada renovação: numa
    -- renovação, o cálculo é feito como se já tivessem passado os 7 dias (a contagem dos meses do trimestral não muda)
    v_renov := c.contratado_em < x.pago_em - interval '1 day';
    if to_regprocedure('public.carteira_calcular_devolucao_plano(text,integer,timestamp with time zone,timestamp with time zone,integer)') is not null then
      execute 'select public.carteira_calcular_devolucao_plano($1, $2, $3, $4, $5)' into v_calc
        using x.ciclo, x.valor_centavos, x.pago_em,
              case when v_renov then greatest(p_agora, x.pago_em + interval '7 days 1 second') else p_agora end, v_ant;
    elsif p_agora - x.pago_em <= interval '7 days' and not v_renov then
      v_calc := jsonb_build_object('regra', 'integral_7_dias', 'valor_centavos', x.valor_centavos, 'abuso', false, 'automatica', true);
    else
      v_calc := jsonb_build_object('regra', 'sem_calculo', 'valor_centavos', 0, 'automatica', false);
    end if;
    -- até onde vai o acesso: integral = agora; trimestral depois de 7 dias = fim do mês em curso
    if v_calc ->> 'regra' = 'trimestral_meses_nao_iniciados' then
      v_meses := 3 - coalesce((v_calc ->> 'meses_nao_iniciados')::int, 0);
      v_calc := v_calc || jsonb_build_object('acesso_ate', x.pago_em + make_interval(months => v_meses));
    elsif v_calc ->> 'regra' = 'integral_7_dias' then
      v_calc := v_calc || jsonb_build_object('acesso_ate', p_agora);
    end if;
  else
    if to_regclass('public.carteira_extras') is not null then
      execute $q$ select creditos, creditos_usados from public.carteira_extras where referencia = $1 $q$
        into v_creditos, v_usados using x.provider || ':' || x.provider_payment_id;
    end if;
    if v_creditos is not null and to_regprocedure('public.carteira_calcular_devolucao_extra(integer,numeric,numeric,timestamp with time zone,timestamp with time zone,integer)') is not null then
      execute 'select public.carteira_calcular_devolucao_extra($1, $2, $3, $4, $5, $6)' into v_calc
        using x.valor_centavos, v_creditos, coalesce(v_usados, 0), x.pago_em, p_agora, v_ant;
    elsif p_agora - x.pago_em <= interval '7 days' then
      v_calc := jsonb_build_object('regra', 'integral_7_dias', 'valor_centavos', x.valor_centavos, 'abuso', false, 'automatica', true);
    else
      v_calc := jsonb_build_object('regra', 'sem_calculo', 'valor_centavos', 0, 'automatica', false);
    end if;
  end if;
  return v_calc || jsonb_build_object('cobranca_id', x.id, 'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo,
                                      'pago_centavos', x.valor_centavos, 'pago_em', x.pago_em, 'provider', x.provider,
                                      'payment_id', x.provider_payment_id, 'contratado_em', v_base);
end
$$;
revoke execute on function public.billing_devolucao_calculo(bigint, timestamptz) from public, anon, authenticated;

-- Devoluções possíveis do aluno (plano vigente + extras pagos), com valor de cada uma.
create or replace function public.ch_worker_billing_devolucoes(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(d order by (d ->> 'pago_em') desc), '[]'::jsonb)
  from (select public.billing_devolucao_calculo(x.id) d from public.billing_cobrancas x
        where x.user_id = p_user and x.status = 'paga' and x.devolvido_centavos = 0) s
  where d is not null and coalesce((d ->> 'valor_centavos')::int, 0) > 0
$$;

-- Registra a devolução pedida (antes de chamar o fornecedor). Abuso ou cálculo manual: fica para a equipe (status "equipe").
create or replace function public.ch_worker_billing_devolucao_pedir(p_user uuid, p_cobranca bigint) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare d jsonb; r public.billing_reembolsos;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  if not exists (select 1 from public.billing_cobrancas where id = p_cobranca and user_id = p_user) then
    raise exception 'sem_devolucao: Não há o que devolver nesta compra.';
  end if;
  if exists (select 1 from public.billing_reembolsos where cobranca_id = p_cobranca and status in ('solicitado', 'equipe')) then
    raise exception 'devolucao_em_andamento: Esta devolução já foi pedida.';
  end if;
  d := public.billing_devolucao_calculo(p_cobranca);
  if d is null or coalesce((d ->> 'valor_centavos')::int, 0) <= 0 then
    raise exception 'sem_devolucao: Não há valor a devolver nesta compra pela regra de devolução.';
  end if;
  insert into public.billing_reembolsos (user_id, cobranca_id, valor_centavos, total, regra, acesso_ate, status)
  values (p_user, p_cobranca, (d ->> 'valor_centavos')::int, (d ->> 'valor_centavos')::int >= (d ->> 'pago_centavos')::int, d,
          (d ->> 'acesso_ate')::timestamptz,
          case when coalesce((d ->> 'automatica')::boolean, false) then 'solicitado' else 'equipe' end)
  returning * into r;
  -- registro para a regra de abuso da carteira (013680), quando instalada
  if to_regclass('public.carteira_devolucoes') is not null then
    execute $q$ insert into public.carteira_devolucoes (user_id, plano, ciclo, integral_7_dias, valor_centavos, calculo, referencia)
                values ($1, case when $2 = 'extra' then 'extra' else $3 end, case when $2 = 'extra' then 'avulso' else $4 end,
                        $5 ->> 'regra' = 'integral_7_dias', $6, $5, $7) $q$
      using p_user, d ->> 'tipo', d ->> 'codigo', d ->> 'ciclo', d, r.valor_centavos, (d ->> 'provider') || ':' || (d ->> 'payment_id');
  end if;
  return to_jsonb(r) || jsonb_build_object('provider', d ->> 'provider', 'payment_id', d ->> 'payment_id', 'metodo', d ->> 'metodo');
end
$$;

create or replace function public.ch_worker_billing_devolucao_falhou(p_reembolso bigint, p_erro text) returns void
  language sql security definer set search_path = ''
as $$ update public.billing_reembolsos set status = 'equipe', erro = left(p_erro, 300), atualizado_em = now() where id = p_reembolso and status = 'solicitado' $$;

-- ---------------------------------------------------------------- o que o aluno vê (Meu plano / Extras)
create or replace function public.app_billing_resumo() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  c public.billing_contratos;
begin
  if v_user is null then return null; end if;
  select * into c from public.billing_contratos where user_id = v_user;
  return jsonb_build_object(
    'vendas_ligadas', (select b.vendas_ligadas from public.billing_config b),
    'vitrine', public.billing_vitrine(),
    'contrato', case when c.user_id is null then null else jsonb_build_object('plano', c.plano, 'ciclo', c.ciclo, 'metodo', c.metodo,
                  'valor_centavos', c.valor_centavos, 'renova', c.renova, 'periodo_fim', c.periodo_fim, 'contratado_em', c.contratado_em) end,
    'pedidos_abertos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'nome', p.nome, 'metodo', p.metodo,
                         'valor_centavos', p.valor_centavos, 'url', p.url, 'pix', p.pix, 'vencimento', p.vencimento, 'expira_em', p.expira_em,
                         'motivo', p.motivo) order by p.criado_em desc)
                       from public.billing_pedidos p where p.user_id = v_user and p.status = 'aberto' and p.expira_em > now()), '[]'::jsonb),
    'cobrancas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo,
                         'valor_centavos', x.valor_centavos, 'status', x.status, 'pago_em', x.pago_em, 'devolvido_centavos', x.devolvido_centavos)
                         order by x.criado_em desc)
                       from (select * from public.billing_cobrancas where user_id = v_user order by criado_em desc limit 12) x), '[]'::jsonb),
    'renovacao_pendente', (select r - 'provider' - 'payment_id' from public.ch_worker_billing_renovacao_pendente(v_user) r),
    'devolucoes', public.ch_worker_billing_devolucoes(v_user),
    'reembolsos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'valor_centavos', r.valor_centavos, 'status', r.status, 'em', r.criado_em)
                         order by r.criado_em desc)
                       from public.billing_reembolsos r where r.user_id = v_user), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- permissões
do $grants$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'ch\_worker\_billing\_%' or p.proname like 'billing\_%') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $grants$;
revoke execute on function public.app_billing_resumo() from public, anon;
grant execute on function public.app_billing_resumo() to authenticated;
