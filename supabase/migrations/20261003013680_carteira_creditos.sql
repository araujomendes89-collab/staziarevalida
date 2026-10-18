-- =============================================================================
-- PLANOS · ETAPA 2 (decisões do dono de 2026-10-17): a CARTEIRA de créditos de IA e minutos de voz, em MODO SOMBRA.
--
-- O QUE É: o saldo de IA de cada aluno, por período (dia e mês), em CRÉDITOS (1 crédito = R$ 0,10 de custo de IA; cotação do
-- dólar R$ 5,08, revisada todo mês na Administração) e em MINUTOS de voz ao vivo (à parte). Gastam crédito: Tutor por texto,
-- janelinha do Tutor (mini tutor), dica do Tutor na questão e correção de estação por IA.
--   * reservar → confirmar pelo custo REAL (US$ → R$ → créditos, arredondando para cima em 0,1 crédito; mínimo 0,1) → devolver
--     se a IA falhar. Cada pedido tem um request_id: repetir o mesmo pedido nunca gasta duas vezes (idempotência);
--   * trava por aluno (a mesma trava do Tutor, "tutor:<aluno>"): 20 pedidos ao mesmo tempo não passam do saldo;
--   * ordem de consumo: a franquia do plano (dia e mês) primeiro, depois o EXTRA MAIS ANTIGO (IA Boost/Plus/Max ou cortesia),
--     cada extra com saldo e validade próprios (30 dias). O consumo fica registrado POR EXTRA (base do cálculo de devolução);
--   * avisos únicos de 80%, 90% e 100% da franquia (do dia, do mês e da voz), uma vez por período;
--   * teto global de custo por dia (US$, editável): passou dele, a IA dos alunos para até o dia seguinte;
--   * créditos de CORTESIA dados pela equipe (Administração, só administrador, com motivo e registro de ações);
--   * cálculo da devolução (só o cálculo, sem estorno) com a regra do dono de 17/10 noite.
--
-- MODO SOMBRA (o mais importante): com a chave "cadeados_ligados" DESLIGADA (como nasce), as cotas de HOJE continuam valendo
-- EXATAMENTE como hoje: quem decide o Tutor por texto continua sendo ch_worker_tutor_text_reserve (chamada por dentro, sem
-- nenhuma mudança) e a dica continua com o mesmo teto por dia (só que contado no banco, não mais na memória de cada servidor).
-- A carteira só REGISTRA (o custo real de cada pedido, quantos créditos teria gastado e se a regra nova teria barrado), para o
-- dono ver números reais na Administração antes de ligar. Os extras e as cortesias só passam a valer com a chave ligada.
-- Com a chave LIGADA, a carteira manda: tutor_entitlement passa a responder pelos créditos e minutos da regra nova (a regra
-- antiga continua guardada, intacta, como tutor_entitlement_regra_antiga e volta a valer ao desligar a chave).
--
-- O QUE MUDA EM FUNÇÃO QUE JÁ EXISTE (com cuidado, para não haver regressão):
--   * tutor_entitlement(uuid): a versão vigente (…9730) é RENOMEADA para tutor_entitlement_regra_antiga, sem tocar no corpo
--     (o texto é o mesmo, byte a byte); no lugar entra um "porteiro" com o mesmo nome e o mesmo formato de resposta que, com a
--     chave desligada (ou para a equipe), devolve exatamente a resposta antiga. ATENÇÃO para as próximas migrações: quem for
--     mudar a regra antiga do Tutor deve mudar tutor_entitlement_regra_antiga, nunca recriar tutor_entitlement.
--   * direitos_do_aluno e direitos_regra_atual (da 013640, deste mesmo ramo, ainda não aplicada em produção): recriadas a partir
--     da versão da 013640, mudando só a parte de créditos/voz (agora lida da carteira), as ofertas ("à venda" e "em breve") e o
--     alerta do teste; direitos_regra_atual passa a ler a regra antiga direto (para o painel comparar mesmo com a chave ligada).
--   * Nenhuma outra função, regra de acesso ou tabela antiga muda. Gatilho NOVO só em tutor_voice_calls (registra os minutos
--     que passaram da franquia e gasta o extra de voz, SÓ com a chave ligada; nunca impede a gravação).
--
-- Pontos de ligação no servidor: server/planos/carteira.ts (Tutor por texto em engine.ts e tools.ts; dica em questionHint.ts;
-- janelinha do ramo tutor-personagens: mandar "origem": "janela" no POST /api/tutor/turn; correção de estação do ramo
-- dupla-sozinho-ia: ver o comentário em server/planos/carteira.ts).
--
-- Pode ser colada de novo sem estragar nada. Desfazer: supabase/desfazer/20261003013680_carteira_creditos.desfazer.sql.
-- Conferir: supabase/conferir/carteira-creditos.sql. Depende da 013640 (direitos por fase).
-- =============================================================================

-- ---------------------------------------------------------------- configuração (na mesma linha da etapa 1)
alter table public.direitos_config
  -- teto de custo de IA por dia, para a conta inteira (US$; vazio = sem teto). Só barra com a chave ligada.
  add column if not exists teto_custo_dia_usd numeric(10, 2) default 20 check (teto_custo_dia_usd is null or teto_custo_dia_usd between 0 and 100000),
  -- devolução (decisão do dono 17/10 noite): desconto do trimestral depois de 7 dias e quantas devoluções em 7 dias
  -- (no período abaixo) marcam "abuso" (a devolução integral automática para e vai para a equipe decidir)
  add column if not exists devolucao_desconto_pct numeric(5, 2) not null default 10 check (devolucao_desconto_pct between 0 and 100),
  add column if not exists devolucao_abuso_qtd integer not null default 2 check (devolucao_abuso_qtd between 1 and 100),
  add column if not exists devolucao_abuso_dias integer not null default 180 check (devolucao_abuso_dias between 1 and 3650);
-- cotação do dono (17/10): R$ 5,08, revisada todo mês. Só preenche se ainda estiver vazia (não desfaz o que o dono editou).
update public.direitos_config set cotacao_dolar = 5.08 where cotacao_dolar is null;

-- quanto RESERVAR antes de chamar a IA, por recurso (o custo real é acertado na confirmação). Só nos recursos que gastam crédito.
alter table public.direitos_recursos
  add column if not exists reserva_creditos numeric(6, 1) check (reserva_creditos is null or reserva_creditos between 0.1 and 1000);
update public.direitos_recursos set reserva_creditos = v.n
from (values ('tutor_texto', 3.0), ('tutor_janela', 2.0), ('dica_questao', 1.0), ('correcao_estacao_ia', 5.0)) v(codigo, n)
where direitos_recursos.codigo = v.codigo and direitos_recursos.reserva_creditos is null;

-- à venda (decisão do dono 17/10 noite): até a 2ª fase abrir, SÓ o PRO fica à venda; PRÁTICA e ELITE aparecem "em breve".
-- A chave "2ª fase aberta" libera os planos com a prática. A cobrança continua desligada: "à venda" só vale quando ela existir.
alter table public.direitos_planos add column if not exists a_venda boolean not null default false;
update public.direitos_planos set a_venda = true where codigo = 'pro' and not a_venda
  and not exists (select 1 from public.direitos_planos where a_venda);

-- ---------------------------------------------------------------- pacotes extras (catálogo; nada é vendido nesta etapa)
create table if not exists public.carteira_pacotes (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]{1,30}$'),
  nome text not null check (char_length(nome) between 1 and 60),
  preco_centavos integer not null check (preco_centavos between 0 and 10000000),
  creditos numeric(10, 1) not null check (creditos between 0 and 1000000),
  voz_minutos integer not null check (voz_minutos between 0 and 100000),
  validade_dias integer not null default 30 check (validade_dias between 1 and 365),
  posicao smallint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.carteira_pacotes enable row level security;
revoke all on public.carteira_pacotes from public, anon, authenticated;
insert into public.carteira_pacotes (codigo, nome, preco_centavos, creditos, voz_minutos, validade_dias, posicao) values
  ('boost', 'IA Boost', 2490, 100, 10, 30, 1),
  ('plus', 'IA Plus', 5990, 300, 30, 30, 2),
  ('max', 'IA Max', 12990, 700, 70, 30, 3)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------- extras de cada aluno (compra ou cortesia)
-- Cada extra tem saldo e validade próprios. creditos_usados / voz_usados_s = o consumo registrado POR EXTRA (inclui reservas
-- em andamento). origem: compra (etapa 5, com a referência do pagamento) ou cortesia (dada pela equipe, com motivo).
create table if not exists public.carteira_extras (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pacote text references public.carteira_pacotes (codigo) on delete set null,
  origem text not null check (origem in ('compra', 'cortesia')),
  creditos numeric(10, 1) not null check (creditos >= 0),
  creditos_usados numeric(10, 1) not null default 0 check (creditos_usados >= 0),
  voz_segundos integer not null default 0 check (voz_segundos >= 0),
  voz_usados_s integer not null default 0 check (voz_usados_s >= 0),
  preco_pago_centavos integer not null default 0 check (preco_pago_centavos >= 0),
  valido_de timestamptz not null default now(),
  valido_ate timestamptz not null,
  referencia text unique check (char_length(referencia) <= 120),
  motivo text check (char_length(motivo) <= 300),
  dado_por uuid references auth.users (id) on delete set null,
  cancelado_em timestamptz,
  cancelado_motivo text check (char_length(cancelado_motivo) <= 300),
  criado_em timestamptz not null default now(),
  check (creditos_usados <= creditos),
  check (voz_usados_s <= voz_segundos),
  check (valido_ate > valido_de)
);
create index if not exists carteira_extras_user_idx on public.carteira_extras (user_id, criado_em, id);
alter table public.carteira_extras enable row level security;
drop policy if exists "extras: ler os próprios" on public.carteira_extras;
create policy "extras: ler os próprios" on public.carteira_extras
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.carteira_extras from public, anon, authenticated;
-- o aluno lê só o essencial dos próprios extras (sem o motivo escrito pela equipe nem quem deu)
grant select (id, user_id, pacote, origem, creditos, creditos_usados, voz_segundos, voz_usados_s, valido_de, valido_ate, cancelado_em, criado_em)
  on public.carteira_extras to authenticated;

-- ---------------------------------------------------------------- movimentos (cada pedido de IA, e cada ligação de voz que passou da franquia)
-- situacao: reservado (antes da IA) → confirmado (custo real) | devolvido (a IA falhou) | expirado (reserva esquecida > 10 min).
-- modo: sombra (só registrou; a regra antiga decidiu), ligado (a carteira decidiu e gastou), equipe (sem limite; só o custo).
-- creditos = o que está gasto agora (a reserva, enquanto reservado); creditos_franquia + soma de extras = creditos.
-- excedente = custo real que passou do saldo (não é cobrado; o saldo nunca fica negativo).
create table if not exists public.carteira_movimentos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9_.:-]{8,100}$'),
  recurso text not null check (recurso in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia', 'voz_ao_vivo')),
  modo text not null check (modo in ('sombra', 'ligado', 'equipe')),
  situacao text not null check (situacao in ('reservado', 'confirmado', 'devolvido', 'expirado')),
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  creditos_reservados numeric(10, 1) not null default 0 check (creditos_reservados >= 0),
  creditos numeric(10, 1) not null default 0 check (creditos >= 0),
  creditos_franquia numeric(10, 1) not null default 0 check (creditos_franquia >= 0),
  extras jsonb not null default '[]'::jsonb,
  excedente numeric(10, 1) not null default 0 check (excedente >= 0),
  voz_segundos integer not null default 0 check (voz_segundos >= 0),
  voz_franquia_s integer not null default 0 check (voz_franquia_s >= 0),
  voz_extras_s integer not null default 0 check (voz_extras_s >= 0),
  custo_usd numeric(12, 6) check (custo_usd is null or custo_usd >= 0),
  cotacao numeric(8, 4),
  teria_bloqueado boolean not null default false,
  motivo_bloqueio text,
  reserva_antiga bigint,
  session_id uuid,
  meta jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists carteira_movimentos_user_dia_idx on public.carteira_movimentos (user_id, dia);
create index if not exists carteira_movimentos_dia_idx on public.carteira_movimentos (dia, recurso);
create index if not exists carteira_movimentos_reservas_idx on public.carteira_movimentos (user_id, criado_em) where situacao = 'reservado';
alter table public.carteira_movimentos enable row level security;
drop policy if exists "carteira: ler os próprios" on public.carteira_movimentos;
create policy "carteira: ler os próprios" on public.carteira_movimentos
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.carteira_movimentos from public, anon, authenticated;
-- o aluno lê só o essencial dos próprios pedidos (sem custo em dólar nem os campos internos)
grant select (id, user_id, recurso, situacao, dia, creditos, voz_segundos, criado_em) on public.carteira_movimentos to authenticated;

-- ---------------------------------------------------------------- avisos ao aluno (um por período e nível)
-- creditos_dia / creditos_mes / voz: 80, 90 e 100% da franquia. renovacao: 7, 3 e 1 dia antes do fim do período pago (decisão do
-- dono 17/10 noite: pop-up em "Avisos" no app e, quando houver envio, e-mail; email_enviado_em fica para o serviço de e-mail).
create table if not exists public.carteira_avisos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('creditos_dia', 'creditos_mes', 'voz', 'renovacao')),
  periodo text not null check (char_length(periodo) <= 40),
  nivel smallint not null check (nivel in (80, 90, 100, 7, 3, 1)),
  detalhes jsonb not null default '{}'::jsonb,
  email_enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  visto_em timestamptz,
  unique (user_id, tipo, periodo, nivel)
);
alter table public.carteira_avisos enable row level security;
drop policy if exists "avisos da carteira: ler os próprios" on public.carteira_avisos;
create policy "avisos da carteira: ler os próprios" on public.carteira_avisos
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.carteira_avisos from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.carteira_avisos from authenticated;
grant select on public.carteira_avisos to authenticated;

-- ---------------------------------------------------------------- devoluções registradas (base do "abuso"; o estorno é da etapa 5)
create table if not exists public.carteira_devolucoes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plano text check (plano in ('pro', 'pratica', 'elite', 'extra')),
  ciclo text check (ciclo in ('mensal', 'trimestral', 'avulso')),
  integral_7_dias boolean not null default false,
  valor_centavos integer not null default 0 check (valor_centavos >= 0),
  calculo jsonb not null default '{}'::jsonb,
  referencia text check (char_length(referencia) <= 120),
  criado_em timestamptz not null default now()
);
create index if not exists carteira_devolucoes_user_idx on public.carteira_devolucoes (user_id, criado_em);
alter table public.carteira_devolucoes enable row level security;
revoke all on public.carteira_devolucoes from public, anon, authenticated;

-- ---------------------------------------------------------------- contas internas da carteira
-- Custo real (US$) → créditos: US$ × cotação (R$) ÷ valor do crédito (R$ 0,10), arredondado PARA CIMA em 0,1; mínimo 0,1.
-- Sem cotação informada: 1 crédito por pedido (provisório). Custo desconhecido (null): devolve null (vale a reserva).
create or replace function public.carteira_creditos_do_custo(p_custo_usd numeric) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select case when p_custo_usd is null then null
              when c.cotacao_dolar is null then 1.0
              else greatest(0.1, ceil(greatest(0, p_custo_usd) * c.cotacao_dolar * 100 / c.credito_valor_centavos * 10) / 10) end
  from (select coalesce((select x.cotacao_dolar from public.direitos_config x), 5.08) as cotacao_dolar,
               coalesce((select x.credito_valor_centavos from public.direitos_config x), 10) as credito_valor_centavos) c
$$;
revoke execute on function public.carteira_creditos_do_custo(numeric) from public, anon, authenticated;

-- Os números da carteira de UM aluno, para um perfil (o perfil vem de direitos_do_aluno). Só leitura.
-- Franquia: PRO/PRÁTICA/ELITE = créditos por dia e por mês do plano e minutos de voz por mês; teste e vencido = a amostra
-- (créditos por dia; minutos de voz no TOTAL desde o início do teste ou, sem teste, desde o cadastro); sem acesso = zero.
-- Uso da franquia: reservas em andamento (até 10 min) e confirmações, nos dois modos. Extras: válidos e não cancelados.
-- Voz: segundos usados no período (tutor_voice_seconds); o que passou da franquia sai dos extras de voz (gatilho da ligação);
-- "pendente" = o que já passou da franquia numa ligação ainda aberta e ainda não saiu dos extras.
create or replace function public.carteira_numeros(p_user uuid, p_perfil text, p_teste_inicio timestamptz) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  pl public.direitos_planos;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes0 date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_dia numeric; v_mes numeric;
  v_usado_dia numeric; v_usado_mes numeric; v_disp_fr numeric;
  v_extras numeric; v_extras_voz integer; v_lista jsonb;
  v_voz_fr integer; v_voz_inicio timestamptz; v_voz_periodo text; v_voz_usado integer; v_voz_alocado integer; v_voz_pend integer;
begin
  select * into cfg from public.direitos_config;
  if p_perfil in ('elite', 'pro', 'pratica') then
    select * into pl from public.direitos_planos where codigo = p_perfil;
    v_dia := pl.creditos_dia; v_mes := pl.creditos_mes;
    v_voz_fr := pl.voz_minutos_mes * 60; v_voz_periodo := 'mes'; v_voz_inicio := (v_mes0::timestamp at time zone 'America/Sao_Paulo');
  elsif p_perfil in ('teste', 'vencido') then
    v_dia := coalesce(cfg.amostra_creditos_dia, 5); v_mes := null;
    v_voz_fr := coalesce(cfg.amostra_voz_minutos_total, 2) * 60; v_voz_periodo := 'teste_total';
    v_voz_inicio := coalesce(p_teste_inicio, (select u.created_at from auth.users u where u.id = p_user), '2026-01-01'::timestamptz);
  else
    v_dia := 0; v_mes := 0;
    v_voz_fr := 0; v_voz_periodo := 'mes'; v_voz_inicio := (v_mes0::timestamp at time zone 'America/Sao_Paulo');
  end if;

  select coalesce(sum(m.creditos_franquia) filter (where m.dia = v_today), 0), coalesce(sum(m.creditos_franquia), 0)
    into v_usado_dia, v_usado_mes
  from public.carteira_movimentos m
  where m.user_id = p_user and m.dia >= v_mes0 and m.recurso <> 'voz_ao_vivo'
    and (m.situacao = 'confirmado' or (m.situacao = 'reservado' and m.criado_em > now() - interval '10 minutes'));
  v_disp_fr := greatest(0, least(v_dia - v_usado_dia, coalesce(v_mes - v_usado_mes, 1000000000)));

  select coalesce(sum(x.creditos - x.creditos_usados), 0), coalesce(sum(x.voz_segundos - x.voz_usados_s), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'pacote', x.pacote, 'origem', x.origem, 'creditos', x.creditos - x.creditos_usados,
                                               'voz_s', x.voz_segundos - x.voz_usados_s, 'valido_ate', x.valido_ate) order by x.criado_em, x.id), '[]'::jsonb)
    into v_extras, v_extras_voz, v_lista
  from public.carteira_extras x
  where x.user_id = p_user and x.cancelado_em is null and x.valido_de <= now() and x.valido_ate > now()
    and (x.creditos_usados < x.creditos or x.voz_usados_s < x.voz_segundos);

  v_voz_usado := public.tutor_voice_seconds(p_user, null, v_voz_inicio);
  v_voz_alocado := coalesce((select sum(m.voz_extras_s) from public.carteira_movimentos m
                             where m.user_id = p_user and m.recurso = 'voz_ao_vivo' and m.situacao = 'confirmado' and m.criado_em >= v_voz_inicio), 0);
  v_voz_pend := greatest(0, greatest(0, v_voz_usado - v_voz_fr) - v_voz_alocado);

  return jsonb_build_object(
    'creditos', jsonb_build_object(
      'franquia_dia', v_dia, 'franquia_mes', v_mes, 'usado_dia', v_usado_dia, 'usado_mes', v_usado_mes,
      'disponivel_franquia', v_disp_fr, 'extras', v_extras, 'disponivel', v_disp_fr + v_extras, 'extras_lista', v_lista),
    'voz', jsonb_build_object(
      'periodo', v_voz_periodo, 'inicio', v_voz_inicio, 'franquia_s', v_voz_fr, 'usado_s', v_voz_usado,
      'extras_s', greatest(0, v_extras_voz - v_voz_pend),
      'restante_s', greatest(0, v_voz_fr - v_voz_usado) + greatest(0, v_extras_voz - v_voz_pend)));
end
$$;
revoke execute on function public.carteira_numeros(uuid, text, timestamptz) from public, anon, authenticated;

-- Alerta do início do teste (IP): a etapa 3 (migração 013690) cria a conta de verdade. Aqui, só se ainda não existir, uma versão
-- "sem alerta" (colar esta migração de novo depois da 013690 não desfaz a da 013690).
do $do$
begin
  if to_regprocedure('public.direitos_teste_alerta(uuid)') is null then
    execute $f$create function public.direitos_teste_alerta(p_user uuid) returns jsonb
      language sql stable security definer set search_path = '' as $b$ select null::jsonb $b$$f$;
  end if;
end
$do$;
revoke execute on function public.direitos_teste_alerta(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- a regra central, recriada a partir da 013640 (muda só créditos/voz,
-- ofertas "à venda"/"em breve" e o alerta do teste; o resto é idêntico)
create or replace function public.direitos_do_aluno(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  t public.aluno_testes;
  a public.aluno_fases;
  r public.direitos_recursos;
  pl public.direitos_planos;
  v_staff boolean;
  v_equipe boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes0 timestamptz;
  v_mes0_dia date;
  v_fase2 boolean;
  v_repetido boolean := false;
  v_teste_oferecido boolean := coalesce((select p.active from public.plans p where p.code = 'trial'), true);
  v_fase text;
  v_sit text;
  v_mot text;
  v_estado jsonb := '{}'::jsonb;
  v_rank jsonb := '{"paga": 3, "teste": 2, "vencida": 1, "sem_acesso": 0}'::jsonb;
  v_fases_alvo text[];
  v_melhor text;
  v_acesso text;
  v_motivo text;
  v_msg text;
  v_ofertas jsonb;
  v_recursos jsonb := '{}'::jsonb;
  v_perfil text;
  v_plano_cred public.direitos_planos;
  v_cred_dia integer; v_cred_mes integer;
  v_usado_dia integer; v_usado_mes integer;
  v_voz_lim integer; v_voz_usado integer; v_voz_periodo text;
  v_teste_usado boolean;
  v_teo text; v_pra text;
  e jsonb;
  v_saldo jsonb;
  v_cart jsonb;
begin
  select * into cfg from public.direitos_config;
  if cfg.id is null then cfg.cadeados_ligados := false; cfg.fase2_aberta_alunos := false; cfg.amostra_creditos_dia := 5;
    cfg.amostra_voz_minutos_total := 2; cfg.credito_valor_centavos := 10; end if;
  v_fase2 := cfg.fase2_aberta_alunos;
  v_mes0_dia := date_trunc('month', v_today::timestamp)::date;
  v_mes0 := (v_mes0_dia::timestamp at time zone 'America/Sao_Paulo');
  v_staff := p_user is not null and public.user_has_full_access(p_user);
  v_equipe := p_user is not null and public.user_is_staff(p_user);
  select * into t from public.aluno_testes where user_id = p_user;
  v_teste_usado := t.user_id is not null;
  if v_teste_usado and not v_staff then v_repetido := public.direitos_teste_repetido(p_user); end if;

  -- situação de cada fase
  foreach v_fase in array array['teoria', 'pratica'] loop
    select * into a from public.aluno_fases where user_id = p_user and fase = v_fase;
    if a.user_id is null then
      v_sit := 'sem_acesso'; v_mot := 'sem_acesso';
    elsif a.situacao = 'teste' then
      if t.user_id is not null and not (v_fase = any (t.fases)) then
        v_sit := 'sem_acesso'; v_mot := 'fora_da_escolha_do_teste';
      elsif v_repetido then
        v_sit := 'vencida'; v_mot := 'teste_repetido_telefone';
      elsif a.fim is null or a.fim > now() then
        v_sit := 'teste'; v_mot := 'teste';
      else
        v_sit := 'vencida'; v_mot := 'teste_acabou';
      end if;
    elsif a.situacao = 'paga' then
      if a.fim > now() then v_sit := 'paga'; v_mot := 'paga'; else v_sit := 'vencida'; v_mot := 'plano_acabou'; end if;
    elsif a.situacao = 'pagamento_pendente' then
      -- SEM tolerância na regra nova (decisão do dono 17/10 noite): no dia da renovação sem pagamento confirmado, cai para a amostra
      -- na hora (dados guardados) e volta sozinho quando o pagamento for confirmado. A regra ANTIGA (subscription_is_paid, 3 dias)
      -- não muda e continua valendo enquanto a chave estiver desligada.
      if a.fim > now() then v_sit := 'paga'; v_mot := 'pagamento_pendente'; else v_sit := 'vencida'; v_mot := 'pagamento_nao_confirmado'; end if;
    else
      v_sit := 'vencida';
      v_mot := case when a.plano is null and a.fim is null then 'sem_teste' when a.plano is null then 'teste_acabou' else 'plano_cancelado' end;
    end if;
    if v_staff then v_sit := 'paga'; v_mot := 'equipe'; end if;
    v_estado := v_estado || jsonb_build_object(v_fase, jsonb_build_object(
      'situacao', v_sit, 'motivo', v_mot, 'plano', a.plano, 'inicio', a.inicio, 'fim', a.fim, 'origem', a.origem,
      -- a 2ª fase fechada vale para todos, menos administrador e editor (igual à trava de hoje nas telas)
      'aberta', v_fase = 'teoria' or v_fase2 or v_equipe));
  end loop;

  -- quem paga uma fase e não tem a outra (só um teste antigo que acabou): a outra fica FORA DO PLANO (trancada com convite),
  -- não em amostra. Ex.: PRÁTICA tranca as questões teóricas; PRO tranca as estações. A amostra de vencido é para quem não paga nada.
  if not v_staff and 'paga' in (v_estado #>> '{teoria,situacao}', v_estado #>> '{pratica,situacao}') then
    foreach v_fase in array array['teoria', 'pratica'] loop
      if v_estado #>> array[v_fase, 'situacao'] = 'vencida' then
        v_estado := jsonb_set(v_estado, array[v_fase], (v_estado -> v_fase) || '{"situacao": "sem_acesso", "motivo": "fora_do_plano"}'::jsonb);
      end if;
    end loop;
  end if;

  v_teo := v_estado #>> '{teoria,situacao}';
  v_pra := case when (v_estado #>> '{pratica,aberta}')::boolean then v_estado #>> '{pratica,situacao}' else 'sem_acesso' end;
  v_perfil := case
    when v_staff then 'equipe'
    when v_teo = 'paga' and (v_estado #>> '{pratica,situacao}') = 'paga' then 'elite'
    when v_teo = 'paga' then 'pro'
    when (v_estado #>> '{pratica,situacao}') = 'paga' then 'pratica'
    when 'teste' in (v_teo, v_pra) then 'teste'
    when 'vencida' in (v_teo, v_pra) then 'vencido'
    else 'sem_acesso' end;

  -- cada recurso
  for r in select * from public.direitos_recursos order by posicao, codigo loop
    v_fases_alvo := case r.fase when 'comum' then array['teoria', 'pratica'] else array[r.fase] end;
    -- melhor situação entre as fases que dão acesso a este recurso (a 2ª fase só conta aberta)
    select x into v_melhor from unnest(v_fases_alvo) f, lateral (select v_estado #>> array[f, 'situacao'] as x) s
      where (v_estado #>> array[f, 'aberta'])::boolean
      order by (v_rank ->> x)::int desc limit 1;
    v_melhor := coalesce(v_melhor, 'sem_acesso');
    v_ofertas := '[]'::jsonb; v_msg := null;
    if r.fase = 'pratica' and not (v_estado #>> '{pratica,aberta}')::boolean then
      v_acesso := 'trancado'; v_motivo := 'fase2_fechada';
      v_msg := 'A 2ª fase ainda não está aberta aos alunos.';
    elsif v_melhor = 'paga' then
      v_acesso := 'liberado'; v_motivo := null;
    elsif v_melhor in ('teste', 'vencida') and r.amostra_modo <> 'trancado' then
      v_acesso := 'amostra'; v_motivo := case v_melhor when 'teste' then 'amostra_do_teste' else 'amostra_vencida' end;
      v_msg := case v_melhor when 'teste' then 'Teste grátis: você usa uma amostra deste recurso.'
                 else 'Seu teste ou plano terminou: você continua com a amostra do dia. Seus dados ficam guardados.' end;
    elsif v_melhor in ('teste', 'vencida') then
      v_acesso := 'trancado'; v_motivo := 'fora_da_amostra';
      v_msg := 'Não faz parte da amostra do teste grátis.';
    else
      v_acesso := 'trancado'; v_motivo := 'fase_nao_incluida';
      v_msg := case r.fase when 'teoria' then 'Faz parte da 1ª fase (Revalida e ENAMED), que não está no seu acesso.'
                           when 'pratica' then 'Faz parte da 2ª fase (prova prática), que não está no seu acesso.'
                           else 'Faz parte dos planos do StaziaMed.' end;
    end if;
    if v_acesso <> 'liberado' and v_motivo <> 'fase2_fechada' then
      -- testar: só se a conta nunca teve teste, o cadastro oferece teste e a fase está aberta
      if not v_teste_usado and v_teste_oferecido and not v_staff then
        v_ofertas := v_ofertas || jsonb_build_array(jsonb_build_object('tipo', 'testar', 'fase', case when r.fase = 'pratica' then 'pratica' else 'teoria' end));
      end if;
      -- assinar: os planos que trazem a fase deste recurso (com a 2ª fase fechada, os planos só de prática ficam de fora)
      for pl in select * from public.direitos_planos p
                where p.fases && v_fases_alvo
                order by p.posicao loop
        -- à venda (decisão do dono 17/10 noite): até a 2ª fase abrir, só o PRO; os outros aparecem "em breve" (não contratáveis)
        v_ofertas := v_ofertas || jsonb_build_array(jsonb_build_object('tipo', 'assinar', 'plano', pl.codigo, 'nome', pl.nome,
          'a_venda', pl.a_venda and (v_fase2 or not ('pratica' = any (pl.fases))),
          'em_breve', not (pl.a_venda and (v_fase2 or not ('pratica' = any (pl.fases))))));
      end loop;
    end if;
    v_recursos := v_recursos || jsonb_build_object(r.codigo, jsonb_build_object(
      'nome', r.nome, 'fase', r.fase, 'tipo', r.tipo, 'existe', r.existe, 'acesso', v_acesso, 'motivo', v_motivo, 'mensagem', v_msg,
      'amostra', case when v_acesso = 'amostra' then jsonb_build_object('modo', r.amostra_modo,
                   'limite', case r.amostra_modo when 'por_dia' then r.amostra_limite when 'creditos' then cfg.amostra_creditos_dia
                                                 when 'minutos_total' then cfg.amostra_voz_minutos_total end,
                   'unidade', r.unidade) end,
      'ofertas', v_ofertas));
  end loop;

  -- créditos de IA e voz: a CARTEIRA (etapa 2, migração 013680): franquia do perfil, uso registrado pela carteira (reservas e
  -- confirmações, em sombra e ligada), extras válidos e minutos de voz. Nada é consumido aqui.
  if not v_staff then
    v_cart := public.carteira_numeros(p_user, v_perfil, t.inicio);
  end if;

  -- SALDO que vale de verdade AGORA (o chip do Início mostra este): em modo sombra, a cota de hoje do Tutor pela regra antiga
  -- (mensagens do dia e segundos de voz de tutor_entitlement, sem mudar nada); com a chave ligada, a CARTEIRA (créditos da
  -- franquia + extras válidos, e os minutos de voz da franquia + extras).
  if v_staff then
    v_saldo := jsonb_build_object('fonte', 'equipe', 'ilimitado', true);
  elsif cfg.cadeados_ligados then
    v_saldo := jsonb_build_object('fonte', 'creditos', 'ilimitado', false,
      'creditos_hoje', v_cart #> '{creditos,disponivel}',
      'creditos_limite_hoje', v_cart #> '{creditos,franquia_dia}',
      'creditos_mes', case when v_cart #> '{creditos,franquia_mes}' <> 'null'::jsonb
                           then to_jsonb(greatest(0, (v_cart #>> '{creditos,franquia_mes}')::numeric - (v_cart #>> '{creditos,usado_mes}')::numeric)) end,
      'creditos_limite_mes', v_cart #> '{creditos,franquia_mes}',
      'extras_creditos', v_cart #> '{creditos,extras}',
      'voz_restante_s', v_cart #> '{voz,restante_s}', 'voz_limite_s', v_cart #> '{voz,franquia_s}', 'voz_periodo', v_cart #> '{voz,periodo}');
  else
    e := public.tutor_entitlement(p_user);
    v_saldo := jsonb_build_object('fonte', 'tutor_atual', 'ilimitado', false,
      'tutor_ligado', coalesce((e ->> 'enabled')::boolean, false) and coalesce((e ->> 'can_use')::boolean, false),
      'mensagens_hoje', coalesce((e #>> '{text,remaining}')::int, 0), 'mensagens_limite_hoje', coalesce((e #>> '{text,limit}')::int, 0),
      'voz_ligada', coalesce((e #>> '{voice,enabled}')::boolean, false),
      'voz_restante_s', coalesce((e #>> '{voice,remaining_s}')::int, 0),
      'voz_periodo', case when (e #>> '{voice,limit_total_s}') is not null then 'teste_total' else 'dia' end);
  end if;

  return jsonb_build_object(
    'saldo', v_saldo,
    'modo', case when cfg.cadeados_ligados then 'ligado' else 'sombra' end,
    'cadeados_ligados', cfg.cadeados_ligados,
    'fase2_aberta', v_fase2,
    'venda_ligada', false,
    'perfil', v_perfil,
    'equipe', v_staff,
    'fases', v_estado,
    'recursos', v_recursos,
    'creditos', case when v_staff then jsonb_build_object('ilimitado', true) else (v_cart -> 'creditos') || jsonb_build_object(
      'valor_credito_centavos', cfg.credito_valor_centavos, 'cotacao_dolar', cfg.cotacao_dolar,
      'base', case when cfg.cotacao_dolar is null then 'mensagens' else 'custo' end,
      'extras_valem', cfg.cadeados_ligados,
      -- nomes da etapa 1 (painel e diagnóstico): continuam iguais
      'usados_hoje', v_cart #> '{creditos,usado_dia}', 'usados_mes', v_cart #> '{creditos,usado_mes}',
      'saldo_hoje', v_cart #> '{creditos,disponivel_franquia}') end,
    'voz', case when v_staff then jsonb_build_object('ilimitado', true) else (v_cart -> 'voz') || jsonb_build_object(
      'limite_s', v_cart #> '{voz,franquia_s}', 'saldo_s', v_cart #> '{voz,restante_s}') end,
    'teste', jsonb_build_object(
      'usado', v_teste_usado, 'escolha', t.escolha, 'fases', to_jsonb(t.fases), 'inicio', t.inicio, 'fim', t.fim,
      'escolhido_em', t.escolhido_em, 'repetido_telefone', v_repetido, 'oferecido_no_cadastro', v_teste_oferecido,
      'pode_escolher', t.user_id is not null and t.escolhido_em is null and (t.fim is null or t.fim > now()) and not v_repetido
                       and v_teo = 'teste',
      'escolhas', case when v_fase2 then '["teoria", "pratica", "as_duas"]'::jsonb else '["teoria"]'::jsonb end,
      -- alerta de IP no início do teste (etapa 3): pede verificação a mais, nunca bloqueia
      'verificacao', public.direitos_teste_alerta(p_user)),
    'calculado_em', now());
end
$$;
revoke execute on function public.direitos_do_aluno(uuid) from public, anon, authenticated;

-- A regra de HOJE (para o painel comparar), recriada a partir da 013640: lê a regra antiga do Tutor direto, mesmo com a chave ligada.
create or replace function public.direitos_regra_atual(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_full boolean := public.user_has_full_access(p_user);
  v_equipe boolean := public.user_is_staff(p_user);
  v_sem_pago boolean := public.user_without_paid_access(p_user);
  e jsonb := public.tutor_entitlement_regra_antiga(p_user); -- a regra de HOJE, mesmo com a chave ligada (etapa 2)
  v_tutor text;
  v_voz text;
  v_pratica text;
begin
  v_tutor := case when not coalesce((e ->> 'enabled')::boolean, false) then 'desligado'
                  when e ->> 'mode' = 'paid' then 'liberado' when e ->> 'mode' = 'trial' then 'amostra' else 'trancado' end;
  v_voz := case when v_tutor = 'desligado' or not coalesce((e #>> '{voice,enabled}')::boolean, false) then 'desligado' else v_tutor end;
  -- 2ª fase: hoje só administrador e editor entram (trava das telas, isPhase2Locked)
  v_pratica := case when v_equipe then 'liberado' else 'trancado' end;
  return jsonb_build_object(
    'questoes', 'liberado',
    'simulados_teoricos', case when v_full or not v_sem_pago then 'liberado' else 'trancado' end,
    'flashcards', 'liberado',
    'grupo_teorico', 'nao_existe',
    'dica_questao', v_tutor,
    'estacoes', v_pratica,
    'checklists', v_pratica,
    'simulados_praticos', 'nao_existe',
    'treino_dupla', 'nao_existe',
    'grupo_pratico', 'nao_existe',
    'correcao_estacao_ia', 'nao_existe',
    'aulas_temas', 'liberado',
    'mapas', 'liberado',
    'podcasts', 'liberado',
    'atualizacoes', 'liberado',
    'tutor_texto', v_tutor,
    'tutor_janela', v_tutor,
    'voz_ao_vivo', v_voz);
end
$$;
revoke execute on function public.direitos_regra_atual(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- o Tutor passa pela carteira (só com a chave ligada)
-- 1) A versão vigente de tutor_entitlement (…9730) vira tutor_entitlement_regra_antiga, sem mudar uma letra do corpo.
--    Só na primeira vez (colar de novo não renomeia o porteiro por engano).
do $do$
begin
  if to_regprocedure('public.tutor_entitlement_regra_antiga(uuid)') is null then
    alter function public.tutor_entitlement(uuid) rename to tutor_entitlement_regra_antiga;
  end if;
end
$do$;
revoke execute on function public.tutor_entitlement_regra_antiga(uuid) from public, anon, authenticated;

-- 2) O porteiro, com o mesmo nome e o mesmo formato de resposta. Chave desligada (ou equipe/revisor): devolve EXATAMENTE a
--    resposta antiga. Chave ligada: o modo e os saldos vêm da regra nova (perfil por fase, créditos da franquia + extras, minutos
--    de voz da franquia + extras). "text" passa a contar CRÉDITOS (text.unit = "creditos"); o resto do formato fica igual, e
--    quem já lê "can_text", "can_voice", "voice.remaining_s" e "block_reason" (servidor, voz ao vivo, telas) continua lendo.
create or replace function public.tutor_entitlement(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_old jsonb;
  c public.tutor_config;
  d jsonb;
  v_perfil text;
  v_mode text;
  v_disp numeric;
  v_vleft integer;
  v_acesso text;
begin
  v_old := public.tutor_entitlement_regra_antiga(p_user);
  if not public.direitos_cadeados_ligados() or coalesce((v_old ->> 'staff')::boolean, false) then
    return v_old;
  end if;
  select * into c from public.tutor_config;
  d := public.direitos_do_aluno(p_user);
  v_perfil := d ->> 'perfil';
  v_disp := coalesce((d #>> '{creditos,disponivel}')::numeric, 0);
  v_vleft := case when c.voice_enabled then coalesce((d #>> '{voz,restante_s}')::int, 0) else 0 end;
  -- sem plano e sem teste nenhum (conta sem assinatura): sem Tutor, mesmo com extra (extra precisa de plano, teste ou amostra)
  v_mode := case when v_perfil in ('elite', 'pro', 'pratica') then 'paid'
                 when v_perfil in ('teste', 'vencido') then 'trial'
                 else 'blocked' end;
  v_acesso := d #>> '{recursos,tutor_texto,acesso}';
  return v_old || jsonb_build_object(
    'regra', 'carteira',
    'perfil', v_perfil,
    'mode', v_mode,
    'is_paid', v_perfil in ('elite', 'pro', 'pratica'),
    'plan_locked', v_mode = 'blocked',
    'text', jsonb_build_object('unit', 'creditos', 'used', d #> '{creditos,usado_dia}', 'limit', d #> '{creditos,franquia_dia}',
                               'remaining', to_jsonb(v_disp), 'month_used', d #> '{creditos,usado_mes}', 'month_limit', d #> '{creditos,franquia_mes}',
                               'extras', d #> '{creditos,extras}'),
    'voice', jsonb_build_object('enabled', c.voice_enabled, 'period', d #>> '{voz,periodo}',
                                'limit_today_s', d #> '{voz,franquia_s}', 'used_today_s', d #> '{voz,usado_s}', 'remaining_today_s', v_vleft,
                                'limit_total_s', null, 'used_total_s', null, 'remaining_total_s', null,
                                'extras_s', d #> '{voz,extras_s}', 'remaining_s', v_vleft),
    'can_use', c.enabled and v_mode <> 'blocked',
    'can_text', c.enabled and v_mode <> 'blocked' and v_disp >= 0.1 and v_acesso is distinct from 'trancado',
    'can_voice', c.enabled and v_mode <> 'blocked' and c.voice_enabled and v_vleft > 0
                 and (d #>> '{recursos,voz_ao_vivo,acesso}') is distinct from 'trancado',
    'block_reason', case when not c.enabled then 'disabled' when v_mode = 'blocked' then 'trial_expired' end);
end
$$;
revoke execute on function public.tutor_entitlement(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- pegar e devolver créditos (internas; sempre dentro da trava do aluno)
-- Pega p_qtd: primeiro da franquia (até p_disp_franquia), depois do EXTRA MAIS ANTIGO válido. Devolve quanto saiu de cada um.
create or replace function public.carteira_alocar(p_user uuid, p_qtd numeric, p_disp_franquia numeric) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_qtd numeric := greatest(0, round(coalesce(p_qtd, 0), 1));
  v_fr numeric;
  v_resto numeric;
  v_ext jsonb := '[]'::jsonb;
  x record;
  v_take numeric;
begin
  v_fr := least(v_qtd, greatest(0, round(coalesce(p_disp_franquia, 0), 1)));
  v_resto := v_qtd - v_fr;
  if v_resto > 0 then
    for x in select e.id, e.creditos - e.creditos_usados as livre from public.carteira_extras e
             where e.user_id = p_user and e.cancelado_em is null and e.valido_de <= now() and e.valido_ate > now() and e.creditos_usados < e.creditos
             order by e.criado_em, e.id for update loop
      exit when v_resto <= 0;
      v_take := least(v_resto, x.livre);
      update public.carteira_extras set creditos_usados = creditos_usados + v_take where id = x.id;
      v_ext := v_ext || jsonb_build_array(jsonb_build_object('id', x.id, 'creditos', v_take));
      v_resto := v_resto - v_take;
    end loop;
  end if;
  return jsonb_build_object('franquia', v_fr, 'extras', v_ext, 'total', v_qtd - v_resto, 'faltou', v_resto);
end
$$;
revoke execute on function public.carteira_alocar(uuid, numeric, numeric) from public, anon, authenticated;

-- Devolve p_qtd de uma alocação: primeiro aos extras (do último pego para o primeiro), depois à franquia. Devolve o que sobrou.
create or replace function public.carteira_devolver_parte(p_extras jsonb, p_franquia numeric, p_qtd numeric) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_resto numeric := greatest(0, coalesce(p_qtd, 0));
  v_out jsonb := '[]'::jsonb;
  el jsonb;
  v_c numeric;
  v_back numeric;
  i integer;
begin
  for i in reverse coalesce(jsonb_array_length(p_extras), 0) - 1 .. 0 loop
    el := p_extras -> i;
    v_c := (el ->> 'creditos')::numeric;
    v_back := least(v_resto, v_c);
    if v_back > 0 then
      update public.carteira_extras set creditos_usados = greatest(0, creditos_usados - v_back) where id = (el ->> 'id')::bigint;
      v_resto := v_resto - v_back;
    end if;
    if v_c - v_back > 0 then
      v_out := jsonb_build_array(jsonb_build_object('id', (el ->> 'id')::bigint, 'creditos', v_c - v_back)) || v_out;
    end if;
  end loop;
  return jsonb_build_object('extras', v_out, 'franquia', greatest(0, coalesce(p_franquia, 0) - v_resto));
end
$$;
revoke execute on function public.carteira_devolver_parte(jsonb, numeric, numeric) from public, anon, authenticated;

-- Junta duas listas de extras [{id, creditos}] somando por extra.
create or replace function public.carteira_extras_somar(a jsonb, b jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'creditos', x.s) order by x.id), '[]'::jsonb)
  from (select (e ->> 'id')::bigint as id, sum((e ->> 'creditos')::numeric) as s
        from jsonb_array_elements(coalesce(a, '[]'::jsonb) || coalesce(b, '[]'::jsonb)) e group by 1 having sum((e ->> 'creditos')::numeric) > 0) x
$$;
revoke execute on function public.carteira_extras_somar(jsonb, jsonb) from public, anon, authenticated;

-- Reservas esquecidas (servidor caiu no meio): depois de 10 minutos voltam (a franquia e o extra ficam livres de novo).
create or replace function public.carteira_varrer_reservas(p_user uuid) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  m public.carteira_movimentos;
  n integer := 0;
begin
  for m in select * from public.carteira_movimentos
           where user_id = p_user and situacao = 'reservado' and criado_em < now() - interval '10 minutes' for update loop
    if m.modo = 'ligado' then perform public.carteira_devolver_parte(m.extras, 0, m.creditos); end if;
    update public.carteira_movimentos set situacao = 'expirado', creditos = 0, creditos_franquia = 0, extras = '[]'::jsonb, atualizado_em = now()
    where id = m.id;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.carteira_varrer_reservas(uuid) from public, anon, authenticated;

-- Custo de IA de HOJE da conta inteira (US$): recursos da carteira (confirmados pelo custo real; sem custo informado, pelos
-- créditos cobrados; reservas em andamento pela reserva) + a voz ao vivo do dia (a mesma conta dos tetos de voz da …12800).
create or replace function public.carteira_gasto_hoje_usd() returns numeric
  language sql stable security definer set search_path = ''
as $$
  select (coalesce(sum(case when m.situacao = 'confirmado' and m.custo_usd is not null then m.custo_usd
                           else m.creditos * c.credito_valor_centavos / 100.0 / coalesce(c.cotacao_dolar, 5.08) end), 0)
          + coalesce((public.tutor_live_account_today() ->> 'usd')::numeric, 0))::numeric(12, 6)
  from public.carteira_movimentos m
  cross join (select coalesce(x.credito_valor_centavos, 10) as credito_valor_centavos, x.cotacao_dolar from public.direitos_config x) c
  where m.dia = (now() at time zone 'America/Sao_Paulo')::date and m.recurso <> 'voz_ao_vivo'
    and (m.situacao = 'confirmado' or (m.situacao = 'reservado' and m.criado_em > now() - interval '10 minutes'))
$$;
revoke execute on function public.carteira_gasto_hoje_usd() from public, anon, authenticated;

-- Avisos únicos de 80/90/100% da franquia de créditos (dia e mês). Só com a chave ligada.
create or replace function public.carteira_avisar(p_user uuid, p_d jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fr numeric; v_us numeric; n integer;
begin
  v_fr := (p_d #>> '{creditos,franquia_dia}')::numeric; v_us := coalesce((p_d #>> '{creditos,usado_dia}')::numeric, 0);
  if v_fr > 0 then
    foreach n in array array[80, 90, 100] loop
      if v_us * 100 >= v_fr * n then
        insert into public.carteira_avisos (user_id, tipo, periodo, nivel) values (p_user, 'creditos_dia', 'dia:' || v_today::text, n)
        on conflict (user_id, tipo, periodo, nivel) do nothing;
      end if;
    end loop;
  end if;
  v_fr := (p_d #>> '{creditos,franquia_mes}')::numeric; v_us := coalesce((p_d #>> '{creditos,usado_mes}')::numeric, 0);
  if v_fr > 0 then
    foreach n in array array[80, 90, 100] loop
      if v_us * 100 >= v_fr * n then
        insert into public.carteira_avisos (user_id, tipo, periodo, nivel) values (p_user, 'creditos_mes', 'mes:' || to_char(v_today, 'YYYY-MM'), n)
        on conflict (user_id, tipo, periodo, nivel) do nothing;
      end if;
    end loop;
  end if;
end
$$;
revoke execute on function public.carteira_avisar(uuid, jsonb) from public, anon, authenticated;

-- Frase para o aluno quando a carteira recusa.
create or replace function public.carteira_mensagem(p_motivo text, p_d jsonb, p_recurso text) returns text
  language sql stable set search_path = ''
as $$
  select case p_motivo
    when 'sem_creditos' then case when p_d ->> 'perfil' in ('elite', 'pro', 'pratica')
                                       and coalesce((p_d #>> '{creditos,franquia_mes}')::numeric, 0) > 0
                                       and coalesce((p_d #>> '{creditos,usado_mes}')::numeric, 0) >= (p_d #>> '{creditos,franquia_mes}')::numeric
                                  then 'Seus créditos de IA deste mês acabaram. Um pacote extra libera mais.'
                                  else 'Seus créditos de IA de hoje acabaram. Amanhã tem mais.' end
    when 'trancado' then coalesce(p_d #>> array['recursos', p_recurso, 'mensagem'], 'Este recurso não faz parte do seu plano.')
    when 'teto_global' then 'A IA está muito procurada agora. Tente de novo mais tarde.'
    when 'disabled' then 'O Tutor ainda não está ligado.'
    else 'Não foi possível usar a IA agora.' end
$$;
revoke execute on function public.carteira_mensagem(text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- RESERVAR (servidor, antes de chamar a IA)
-- p_recurso: tutor_texto, tutor_janela, dica_questao ou correcao_estacao_ia. p_request_id: um código único por pedido.
-- p_limite_antigo: só para a dica no modo sombra (o teto por dia de hoje, que vem do servidor).
-- MODO SOMBRA: decide a regra de HOJE (Tutor por texto/janelinha = ch_worker_tutor_text_reserve, sem mudança; dica = o teto por
-- dia, agora contado no banco; correção de estação = a cota própria dela, fora daqui) e só ANOTA o que a regra nova faria.
-- LIGADO: a carteira decide (recurso trancado, sem saldo ou teto global = recusa com a frase para o aluno).
-- Mesmo request_id de novo: devolve o mesmo resultado, sem reservar de novo.
create or replace function public.ch_worker_carteira_reservar(p_user uuid, p_recurso text, p_request_id text, p_session_id uuid default null,
                                                             p_limite_antigo integer default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  m public.carteira_movimentos;
  v_est numeric;
  d jsonb;
  e jsonb;
  v_ligado boolean;
  v_staff boolean;
  v_tutor boolean := p_recurso in ('tutor_texto', 'tutor_janela');
  v_old jsonb;
  v_old_res bigint;
  v_acesso text;
  v_disp numeric;
  v_disp_fr numeric;
  v_teria boolean := false;
  v_motivo text;
  v_n integer;
  v_aloc jsonb;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_user is null then raise exception 'Aluno não informado.' using errcode = '22023'; end if;
  if p_recurso is null or p_recurso not in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia') then
    raise exception 'Recurso inválido.' using errcode = '22023';
  end if;
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_.:-]{8,100}$' then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  -- a MESMA trava do Tutor (reserva antiga, voz ao vivo): uma fila só por aluno, sem impasse entre elas
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));

  select * into m from public.carteira_movimentos where user_id = p_user and request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', m.situacao in ('reservado', 'confirmado'), 'repetido', true, 'modo', m.modo, 'situacao', m.situacao,
                              'reservation', m.reserva_antiga, 'request_id', m.request_id, 'creditos', m.creditos,
                              'reason', case when m.situacao not in ('reservado', 'confirmado') then 'pedido_encerrado' end);
  end if;
  perform public.carteira_varrer_reservas(p_user);

  select * into cfg from public.direitos_config;
  v_ligado := coalesce(cfg.cadeados_ligados, false);
  v_staff := public.user_has_full_access(p_user);
  v_est := coalesce((select r.reserva_creditos from public.direitos_recursos r where r.codigo = p_recurso), 1.0);
  -- o que a regra nova diria (direitos do aluno e gasto do dia). Com a chave DESLIGADA isso é só anotação: se der erro, fica
  -- registrado no movimento (motivo 'erro_sombra') e a regra de hoje segue decidindo, sem derrubar a mensagem do Tutor.
  -- Com a chave LIGADA a carteira precisa desses números: o erro sobe (a IA não é chamada).
  begin
    d := public.direitos_do_aluno(p_user);
    v_acesso := d #>> array['recursos', p_recurso, 'acesso'];
    v_disp_fr := coalesce((d #>> '{creditos,disponivel_franquia}')::numeric, 0);
    v_disp := coalesce((d #>> '{creditos,disponivel}')::numeric, 0);
    if not v_staff then
      if v_acesso = 'trancado' then v_teria := true; v_motivo := 'trancado';
      elsif v_disp < 0.1 then v_teria := true; v_motivo := 'sem_creditos';
      elsif cfg.teto_custo_dia_usd is not null and public.carteira_gasto_hoje_usd() >= cfg.teto_custo_dia_usd then v_teria := true; v_motivo := 'teto_global';
      end if;
    end if;
  exception when others then
    if v_ligado then raise; end if;
    raise warning 'carteira (modo sombra): cálculo da regra nova falhou para %: % (a regra de hoje segue)', p_user, sqlerrm;
    d := null; v_acesso := null; v_disp := 0; v_disp_fr := 0; v_teria := false; v_motivo := 'erro_sombra';
  end;

  if not v_ligado then
    -- ===== MODO SOMBRA: a regra de hoje decide, exatamente como antes
    if v_tutor then
      v_old := public.ch_worker_tutor_text_reserve(p_user, p_session_id);
      if not coalesce((v_old ->> 'ok')::boolean, false) then
        return v_old || jsonb_build_object('modo', 'sombra');
      end if;
      v_old_res := (v_old ->> 'reservation')::bigint;
    elsif p_recurso = 'dica_questao' and p_limite_antigo is not null then
      select count(*) into v_n from public.carteira_movimentos
      where user_id = p_user and recurso = 'dica_questao' and dia = v_today and situacao in ('reservado', 'confirmado');
      if v_n >= p_limite_antigo then
        return jsonb_build_object('ok', false, 'reason', 'hint_limit', 'modo', 'sombra');
      end if;
    end if;
    insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, creditos_reservados, creditos, creditos_franquia,
                                            teria_bloqueado, motivo_bloqueio, reserva_antiga, session_id)
    values (p_user, p_request_id, p_recurso, case when v_staff then 'equipe' else 'sombra' end, 'reservado', v_est, v_est,
            case when v_staff then 0 else v_est end, v_teria, v_motivo, v_old_res, p_session_id);
    return coalesce(v_old, '{}'::jsonb) || jsonb_build_object('ok', true, 'modo', 'sombra', 'request_id', p_request_id,
                                                               'reservation', v_old_res, 'teria_bloqueado', v_teria);
  end if;

  -- ===== CHAVE LIGADA: a carteira decide
  if v_tutor or p_recurso = 'dica_questao' then
    e := public.tutor_entitlement(p_user);
    if not coalesce((e ->> 'enabled')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', 'disabled', 'modo', 'ligado', 'mensagem', public.carteira_mensagem('disabled', d, p_recurso), 'entitlement', e);
    end if;
  end if;
  if v_staff then
    insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, creditos_reservados, creditos, session_id)
    values (p_user, p_request_id, p_recurso, 'equipe', 'reservado', v_est, v_est, p_session_id);
    return jsonb_build_object('ok', true, 'modo', 'ligado', 'request_id', p_request_id, 'reservation', null, 'equipe', true);
  end if;
  if v_teria then
    return jsonb_build_object('ok', false, 'reason', v_motivo, 'modo', 'ligado', 'mensagem', public.carteira_mensagem(v_motivo, d, p_recurso),
                              'creditos', d -> 'creditos', 'ofertas', d #> array['recursos', p_recurso, 'ofertas'], 'entitlement', e);
  end if;
  v_aloc := public.carteira_alocar(p_user, least(v_est, v_disp), v_disp_fr);
  insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, creditos_reservados, creditos, creditos_franquia, extras, session_id)
  values (p_user, p_request_id, p_recurso, 'ligado', 'reservado', (v_aloc ->> 'total')::numeric, (v_aloc ->> 'total')::numeric,
          (v_aloc ->> 'franquia')::numeric, v_aloc -> 'extras', p_session_id);
  return jsonb_build_object('ok', true, 'modo', 'ligado', 'request_id', p_request_id, 'reservation', null, 'creditos_reservados', (v_aloc ->> 'total')::numeric);
end
$$;
revoke execute on function public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- CONFIRMAR (servidor, depois que a IA respondeu)
-- Acerta pelo custo REAL: devolve o que a reserva pegou a mais (primeiro aos extras) ou pega o que faltou (franquia e depois
-- extras). Se o saldo não cobre o custo real, o resto fica como "excedente" (não cobrado: o saldo nunca fica negativo).
-- Confirmar de novo o mesmo pedido não muda nada.
create or replace function public.ch_worker_carteira_confirmar(p_user uuid, p_request_id text, p_custo_usd numeric, p_meta jsonb default '{}'::jsonb)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m public.carteira_movimentos;
  v_real numeric;
  v_res numeric;
  v_fr numeric;
  v_ext jsonb;
  v_parte jsonb;
  v_aloc jsonb;
  v_exced numeric := 0;
  d jsonb;
  v_cot numeric := (select c.cotacao_dolar from public.direitos_config c);
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  select * into m from public.carteira_movimentos where user_id = p_user and request_id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nao_encontrado'); end if;
  if m.situacao = 'confirmado' then
    return jsonb_build_object('ok', true, 'repetido', true, 'modo', m.modo, 'creditos', m.creditos);
  end if;
  if m.situacao = 'devolvido' then
    -- já devolvido (a IA tinha falhado): não cobra depois
    return jsonb_build_object('ok', false, 'reason', 'devolvido');
  end if;
  v_real := coalesce(public.carteira_creditos_do_custo(p_custo_usd), m.creditos_reservados);
  if m.modo in ('sombra', 'equipe') then
    update public.carteira_movimentos set situacao = 'confirmado', creditos = v_real,
      creditos_franquia = case when m.modo = 'sombra' then v_real else 0 end, custo_usd = p_custo_usd, cotacao = v_cot,
      meta = m.meta || coalesce(p_meta, '{}'::jsonb), atualizado_em = now()
    where id = m.id;
    return jsonb_build_object('ok', true, 'modo', case when m.modo = 'equipe' and public.direitos_cadeados_ligados() then 'ligado' else 'sombra' end,
                              'creditos', v_real);
  end if;

  -- chave ligada: acerta a diferença
  if m.situacao = 'reservado' then
    v_res := m.creditos; v_fr := m.creditos_franquia; v_ext := m.extras;
  else
    v_res := 0; v_fr := 0; v_ext := '[]'::jsonb; -- reserva expirou: o que ela pegou já voltou
  end if;
  if v_real < v_res then
    v_parte := public.carteira_devolver_parte(v_ext, v_fr, v_res - v_real);
    v_ext := v_parte -> 'extras'; v_fr := (v_parte ->> 'franquia')::numeric;
  elsif v_real > v_res then
    d := public.direitos_do_aluno(p_user);
    v_aloc := public.carteira_alocar(p_user, least(v_real - v_res, coalesce((d #>> '{creditos,disponivel}')::numeric, 0)),
                                     coalesce((d #>> '{creditos,disponivel_franquia}')::numeric, 0));
    v_fr := v_fr + (v_aloc ->> 'franquia')::numeric;
    v_ext := public.carteira_extras_somar(v_ext, v_aloc -> 'extras');
    v_exced := v_real - v_res - (v_aloc ->> 'total')::numeric;
  end if;
  update public.carteira_movimentos set situacao = 'confirmado', creditos = v_real - v_exced, creditos_franquia = v_fr, extras = v_ext,
    excedente = v_exced, custo_usd = p_custo_usd, cotacao = v_cot, meta = m.meta || coalesce(p_meta, '{}'::jsonb), atualizado_em = now()
  where id = m.id;
  d := public.direitos_do_aluno(p_user);
  perform public.carteira_avisar(p_user, d);
  return jsonb_build_object('ok', true, 'modo', 'ligado', 'creditos', v_real - v_exced, 'excedente', v_exced,
                            'usado_hoje', d #> '{creditos,usado_dia}', 'limite_hoje', d #> '{creditos,franquia_dia}',
                            'disponivel', d #> '{creditos,disponivel}');
end
$$;
revoke execute on function public.ch_worker_carteira_confirmar(uuid, text, numeric, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- DEVOLVER (servidor, a IA falhou)
-- Só devolve reserva em aberto (nunca o que já foi confirmado). No modo sombra, devolve também a reserva antiga do Tutor
-- (ch_worker_tutor_text_release, sem mudança). Devolver de novo não dá crédito a mais.
create or replace function public.ch_worker_carteira_devolver(p_user uuid, p_request_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m public.carteira_movimentos;
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  select * into m from public.carteira_movimentos where user_id = p_user and request_id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nao_encontrado'); end if;
  if m.situacao <> 'reservado' then return jsonb_build_object('ok', true, 'repetido', true, 'situacao', m.situacao); end if;
  if m.modo = 'ligado' then perform public.carteira_devolver_parte(m.extras, 0, m.creditos); end if;
  update public.carteira_movimentos set situacao = 'devolvido', creditos = 0, creditos_franquia = 0, extras = '[]'::jsonb, atualizado_em = now()
  where id = m.id;
  if m.reserva_antiga is not null then
    perform public.ch_worker_tutor_text_release(p_user, m.reserva_antiga);
  end if;
  return jsonb_build_object('ok', true, 'situacao', 'devolvido');
end
$$;
revoke execute on function public.ch_worker_carteira_devolver(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- voz ao vivo: o que passou da franquia sai dos extras de voz
-- Interna. Chamada pelo gatilho quando uma ligação termina (só com a chave ligada; nunca para a equipe nem para a voz do professor).
create or replace function public.carteira_voz_fechar(p_user uuid, p_call uuid, p_segundos integer) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  d jsonb;
  v_fr integer; v_usado integer; v_livre integer; v_exc integer; v_resto integer; v_take integer;
  v_ext jsonb := '[]'::jsonb;
  x record;
  n integer;
  v_per text;
begin
  if exists (select 1 from public.carteira_movimentos where user_id = p_user and request_id = 'voz:' || p_call::text) then return; end if;
  d := public.direitos_do_aluno(p_user);
  if coalesce((d ->> 'equipe')::boolean, false) then return; end if;
  v_fr := coalesce((d #>> '{voz,franquia_s}')::int, 0);
  v_usado := coalesce((d #>> '{voz,usado_s}')::int, 0);
  v_livre := greatest(0, v_fr - greatest(0, v_usado - coalesce(p_segundos, 0)));
  v_exc := greatest(0, coalesce(p_segundos, 0) - v_livre);
  v_resto := v_exc;
  if v_resto > 0 then
    for x in select e.id, e.voz_segundos - e.voz_usados_s as livre from public.carteira_extras e
             where e.user_id = p_user and e.cancelado_em is null and e.valido_de <= now() and e.valido_ate > now() and e.voz_usados_s < e.voz_segundos
             order by e.criado_em, e.id for update loop
      exit when v_resto <= 0;
      v_take := least(v_resto, x.livre);
      update public.carteira_extras set voz_usados_s = voz_usados_s + v_take where id = x.id;
      v_ext := v_ext || jsonb_build_array(jsonb_build_object('id', x.id, 'segundos', v_take));
      v_resto := v_resto - v_take;
    end loop;
  end if;
  insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, voz_segundos, voz_franquia_s, voz_extras_s, extras)
  values (p_user, 'voz:' || p_call::text, 'voz_ao_vivo', 'ligado', 'confirmado', coalesce(p_segundos, 0), coalesce(p_segundos, 0) - v_exc,
          v_exc - v_resto, v_ext)
  on conflict (user_id, request_id) do nothing;
  -- avisos de 80/90/100% dos minutos de voz da franquia (uma vez por período)
  if v_fr > 0 then
    v_per := (d #>> '{voz,periodo}') || ':' || case when d #>> '{voz,periodo}' = 'mes' then to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM') else 'teste' end;
    foreach n in array array[80, 90, 100] loop
      if v_usado * 100 >= v_fr * n then
        insert into public.carteira_avisos (user_id, tipo, periodo, nivel) values (p_user, 'voz', v_per, n) on conflict (user_id, tipo, periodo, nivel) do nothing;
      end if;
    end loop;
  end if;
end
$$;
revoke execute on function public.carteira_voz_fechar(uuid, uuid, integer) from public, anon, authenticated;

-- Gatilho NOVO: nunca impede o fim da ligação (qualquer erro vira só um aviso no registro do banco).
create or replace function public.carteira_voz_gatilho() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if public.direitos_cadeados_ligados() and new.provider is distinct from 'tts' and not public.user_has_full_access(new.user_id) then
      perform public.carteira_voz_fechar(new.user_id, new.id, new.consumed_seconds);
    end if;
  exception when others then
    raise warning 'carteira: minutos de voz não registrados (%): %', sqlstate, sqlerrm;
  end;
  return null;
end
$$;
revoke execute on function public.carteira_voz_gatilho() from public, anon, authenticated;
drop trigger if exists carteira_voz_fechamento on public.tutor_voice_calls;
create trigger carteira_voz_fechamento after update of status on public.tutor_voice_calls
  for each row when (old.status = 'active' and new.status is distinct from 'active')
  execute function public.carteira_voz_gatilho();

-- ---------------------------------------------------------------- avisos de renovação (7, 3 e 1 dia antes)
-- Para a tarefa agendada (servidor, uma vez por dia). Só com a chave ligada (sem venda não há renovação). Um aviso por fase paga,
-- por data de fim e por nível; nunca repete. Devolve quantos avisos novos saíram. O e-mail fica para quando houver envio.
create or replace function public.ch_worker_avisos_renovacao() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer := 0;
  k integer;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  x record;
begin
  if not public.direitos_cadeados_ligados() then return 0; end if;
  for x in select f.user_id, f.fase, f.plano, f.fim, (f.fim at time zone 'America/Sao_Paulo')::date as dia_fim
           from public.aluno_fases f
           where f.situacao in ('paga', 'pagamento_pendente') and f.fim > now() and f.fim <= now() + interval '8 days' loop
    foreach k in array array[7, 3, 1] loop
      if x.dia_fim - v_today <= k then
        insert into public.carteira_avisos (user_id, tipo, periodo, nivel, detalhes)
        values (x.user_id, 'renovacao', x.fase || ':' || x.dia_fim::text, k, jsonb_build_object('fase', x.fase, 'plano', x.plano, 'fim', x.fim))
        on conflict (user_id, tipo, periodo, nivel) do nothing;
        if found then n := n + 1; end if;
      end if;
    end loop;
  end loop;
  return n;
end
$$;
revoke execute on function public.ch_worker_avisos_renovacao() from public, anon, authenticated;

-- ---------------------------------------------------------------- o aluno: a própria carteira (só leitura) e "vi o aviso"
create or replace function public.app_minha_carteira() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  d jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  d := public.direitos_do_aluno(v_user);
  return jsonb_build_object(
    'modo', d ->> 'modo', 'perfil', d ->> 'perfil', 'saldo', d -> 'saldo', 'creditos', d -> 'creditos', 'voz', d -> 'voz',
    -- os avisos só existem com a chave ligada
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'periodo', a.periodo, 'nivel', a.nivel, 'detalhes', a.detalhes, 'em', a.criado_em)
                                         order by a.criado_em desc)
                        from public.carteira_avisos a where a.user_id = v_user and a.visto_em is null), '[]'::jsonb),
    'movimentos', case when d ->> 'modo' = 'ligado' then coalesce((select jsonb_agg(x.j order by x.criado_em desc) from (
                    select m.criado_em, jsonb_build_object('recurso', m.recurso, 'creditos', m.creditos, 'voz_s', m.voz_segundos, 'dia', m.dia, 'em', m.criado_em) j
                    from public.carteira_movimentos m where m.user_id = v_user and m.situacao = 'confirmado' and m.modo = 'ligado'
                    order by m.criado_em desc limit 20) x), '[]'::jsonb) else '[]'::jsonb end);
end
$$;
revoke execute on function public.app_minha_carteira() from public, anon;
grant execute on function public.app_minha_carteira() to authenticated;

create or replace function public.app_carteira_avisos_vistos(p_ids bigint[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  n integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  update public.carteira_avisos set visto_em = now() where user_id = v_user and id = any (coalesce(p_ids, '{}')) and visto_em is null;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.app_carteira_avisos_vistos(bigint[]) from public, anon;
grant execute on function public.app_carteira_avisos_vistos(bigint[]) to authenticated;

-- ---------------------------------------------------------------- DEVOLUÇÃO: só o cálculo (o estorno é da etapa 5)
-- Regra final do dono (17/10 noite): plano e extras SEPARADOS.
--   * em até 7 dias da contratação (ou da compra do extra): devolução INTEGRAL (inclusive extras usados), salvo "abuso"
--     (quem já teve devolução integral em 7 dias "devolucao_abuso_qtd" vezes nos últimos "devolucao_abuso_dias" dias):
--     o cálculo marca "abuso" e a devolução automática para (a equipe decide);
--   * plano MENSAL depois de 7 dias: sem devolução;
--   * plano TRIMESTRAL depois de 7 dias: meses inteiros ainda NÃO iniciados × (preço ÷ 3) − 10% (sem descontar extras);
--   * EXTRA depois de 7 dias: créditos NÃO usados × (preço do pacote ÷ créditos do pacote) − 10%.
-- Valores em centavos, arredondados ao centavo; nunca negativos.
create or replace function public.carteira_calcular_devolucao_plano(p_ciclo text, p_preco_centavos integer, p_contratado_em timestamptz,
                                                                    p_cancelado_em timestamptz, p_devolucoes_anteriores integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  v_idade interval;
  v_iniciados integer;
  v_nao integer;
  v_valor numeric;
  v_abuso boolean;
begin
  select * into cfg from public.direitos_config;
  if p_ciclo is null or p_ciclo not in ('mensal', 'trimestral') then raise exception 'Ciclo inválido (mensal ou trimestral).' using errcode = '22023'; end if;
  if p_preco_centavos is null or p_preco_centavos < 0 then raise exception 'Preço inválido.' using errcode = '22023'; end if;
  if p_contratado_em is null or p_cancelado_em is null or p_cancelado_em < p_contratado_em then
    raise exception 'Datas inválidas.' using errcode = '22023';
  end if;
  v_abuso := coalesce(p_devolucoes_anteriores, 0) >= coalesce(cfg.devolucao_abuso_qtd, 2);
  if p_cancelado_em - p_contratado_em <= interval '7 days' then
    return jsonb_build_object('regra', 'integral_7_dias', 'valor_centavos', p_preco_centavos, 'abuso', v_abuso, 'automatica', not v_abuso);
  end if;
  if p_ciclo = 'mensal' then
    return jsonb_build_object('regra', 'mensal_sem_devolucao', 'valor_centavos', 0, 'abuso', false, 'automatica', true);
  end if;
  v_idade := age(p_cancelado_em, p_contratado_em);
  v_iniciados := (extract(year from v_idade) * 12 + extract(month from v_idade))::int + 1; -- o mês em curso já começou
  v_nao := greatest(0, 3 - v_iniciados);
  v_valor := round(p_preco_centavos::numeric * v_nao / 3 * (100 - coalesce(cfg.devolucao_desconto_pct, 10)) / 100);
  return jsonb_build_object('regra', 'trimestral_meses_nao_iniciados', 'meses_nao_iniciados', v_nao, 'desconto_pct', coalesce(cfg.devolucao_desconto_pct, 10),
                            'valor_centavos', greatest(0, v_valor)::int, 'abuso', false, 'automatica', true);
end
$$;
revoke execute on function public.carteira_calcular_devolucao_plano(text, integer, timestamptz, timestamptz, integer) from public, anon, authenticated;

create or replace function public.carteira_calcular_devolucao_extra(p_preco_centavos integer, p_creditos numeric, p_creditos_usados numeric,
                                                                    p_comprado_em timestamptz, p_cancelado_em timestamptz,
                                                                    p_devolucoes_anteriores integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  v_abuso boolean;
  v_nao numeric;
  v_valor numeric;
begin
  select * into cfg from public.direitos_config;
  if p_preco_centavos is null or p_preco_centavos < 0 or p_creditos is null or p_creditos <= 0 or coalesce(p_creditos_usados, 0) < 0 then
    raise exception 'Pacote inválido.' using errcode = '22023';
  end if;
  if p_comprado_em is null or p_cancelado_em is null or p_cancelado_em < p_comprado_em then
    raise exception 'Datas inválidas.' using errcode = '22023';
  end if;
  v_abuso := coalesce(p_devolucoes_anteriores, 0) >= coalesce(cfg.devolucao_abuso_qtd, 2);
  if p_cancelado_em - p_comprado_em <= interval '7 days' then
    return jsonb_build_object('regra', 'integral_7_dias', 'valor_centavos', p_preco_centavos, 'abuso', v_abuso, 'automatica', not v_abuso);
  end if;
  v_nao := greatest(0, p_creditos - coalesce(p_creditos_usados, 0));
  v_valor := round(p_preco_centavos::numeric * v_nao / p_creditos * (100 - coalesce(cfg.devolucao_desconto_pct, 10)) / 100);
  return jsonb_build_object('regra', 'extra_creditos_nao_usados', 'creditos_nao_usados', v_nao, 'desconto_pct', coalesce(cfg.devolucao_desconto_pct, 10),
                            'valor_centavos', greatest(0, v_valor)::int, 'abuso', false, 'automatica', true);
end
$$;
revoke execute on function public.carteira_calcular_devolucao_extra(integer, numeric, numeric, timestamptz, timestamptz, integer) from public, anon, authenticated;

-- Interna: quantas devoluções integrais em 7 dias o aluno já teve no período do "abuso".
create or replace function public.carteira_devolucoes_recentes(p_user uuid) returns integer
  language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.carteira_devolucoes d
  where d.user_id = p_user and d.integral_7_dias
    and d.criado_em > now() - make_interval(days => coalesce((select c.devolucao_abuso_dias from public.direitos_config c), 180))
$$;
revoke execute on function public.carteira_devolucoes_recentes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Administração (só administrador)
-- O painel da carteira: números REAIS de hoje e do mês (nos dois modos), quem teria sido barrado, teto global, extras e cortesias.
create or replace function public.app_admin_carteira() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.direitos_config;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes0 date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_resumo jsonb := '{}'::jsonb;
  v_ini date;
  k text;
begin
  perform public.assert_admin();
  select * into c from public.direitos_config;
  foreach k in array array['hoje', 'mes'] loop
    v_ini := case k when 'hoje' then v_today else v_mes0 end;
    v_resumo := v_resumo || jsonb_build_object(k, (
      select jsonb_build_object(
        'pedidos', count(*) filter (where m.situacao = 'confirmado'),
        'creditos', coalesce(sum(m.creditos) filter (where m.situacao = 'confirmado'), 0),
        'custo_usd', round(coalesce(sum(m.custo_usd) filter (where m.situacao = 'confirmado'), 0), 4),
        'custo_brl', round(coalesce(sum(m.custo_usd) filter (where m.situacao = 'confirmado'), 0) * coalesce(c.cotacao_dolar, 5.08), 2),
        'devolvidos', count(*) filter (where m.situacao in ('devolvido', 'expirado')),
        'alunos', count(distinct m.user_id) filter (where m.modo <> 'equipe'),
        'teriam_sido_barrados', count(*) filter (where m.teria_bloqueado),
        'alunos_que_seriam_barrados', count(distinct m.user_id) filter (where m.teria_bloqueado),
        'por_recurso', coalesce((select jsonb_object_agg(x.recurso, jsonb_build_object('pedidos', x.n, 'creditos', x.cr, 'custo_usd', x.usd)) from (
            select m2.recurso, count(*) n, coalesce(sum(m2.creditos), 0) cr, round(coalesce(sum(m2.custo_usd), 0), 4) usd
            from public.carteira_movimentos m2 where m2.dia >= v_ini and m2.situacao = 'confirmado' and m2.recurso <> 'voz_ao_vivo' group by 1) x), '{}'::jsonb),
        'por_modo', coalesce((select jsonb_object_agg(x.modo, x.n) from (
            select m3.modo, count(*) n from public.carteira_movimentos m3 where m3.dia >= v_ini and m3.situacao = 'confirmado' group by 1) x), '{}'::jsonb),
        'voz_extras_min', round(coalesce(sum(m.voz_extras_s), 0) / 60.0, 1))
      from public.carteira_movimentos m where m.dia >= v_ini));
  end loop;
  return jsonb_build_object(
    'modo', case when c.cadeados_ligados then 'ligado' else 'sombra' end,
    'config', jsonb_build_object('teto_custo_dia_usd', c.teto_custo_dia_usd, 'cotacao_dolar', c.cotacao_dolar, 'credito_valor_centavos', c.credito_valor_centavos,
                                 'devolucao_desconto_pct', c.devolucao_desconto_pct, 'devolucao_abuso_qtd', c.devolucao_abuso_qtd,
                                 'devolucao_abuso_dias', c.devolucao_abuso_dias),
    'teto', jsonb_build_object('teto_usd', c.teto_custo_dia_usd, 'gasto_hoje_usd', round(public.carteira_gasto_hoje_usd(), 4),
                               'estourado', c.teto_custo_dia_usd is not null and public.carteira_gasto_hoje_usd() >= c.teto_custo_dia_usd),
    'resumo', v_resumo,
    'top_alunos_mes', coalesce((select jsonb_agg(x.j order by x.cr desc) from (
        select coalesce(sum(m.creditos) filter (where m.situacao = 'confirmado'), 0) cr,
               jsonb_build_object('email', u.email, 'creditos', coalesce(sum(m.creditos) filter (where m.situacao = 'confirmado'), 0),
                                  'custo_usd', round(coalesce(sum(m.custo_usd), 0), 4), 'pedidos', count(*) filter (where m.situacao = 'confirmado'),
                                  'teriam_sido_barrados', count(*) filter (where m.teria_bloqueado)) j
        from public.carteira_movimentos m join auth.users u on u.id = m.user_id
        where m.dia >= v_mes0 and m.modo <> 'equipe' and m.recurso <> 'voz_ao_vivo'
        group by u.email order by 1 desc limit 15) x), '[]'::jsonb),
    'recursos', coalesce((select jsonb_agg(jsonb_build_object('codigo', r.codigo, 'nome', r.nome, 'reserva_creditos', r.reserva_creditos, 'existe', r.existe) order by r.posicao)
                          from public.direitos_recursos r where r.tipo = 'credito'), '[]'::jsonb),
    'pacotes', coalesce((select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', p.nome, 'preco_centavos', p.preco_centavos, 'creditos', p.creditos,
                                                            'voz_minutos', p.voz_minutos, 'validade_dias', p.validade_dias) order by p.posicao)
                         from public.carteira_pacotes p), '[]'::jsonb),
    'planos_a_venda', coalesce((select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', p.nome, 'a_venda', p.a_venda, 'fases', to_jsonb(p.fases),
                                                                   'vale_agora', p.a_venda and (c.fase2_aberta_alunos or not ('pratica' = any (p.fases)))) order by p.posicao)
                                from public.direitos_planos p), '[]'::jsonb),
    'extras', jsonb_build_object(
      'ativos', (select count(*) from public.carteira_extras x where x.cancelado_em is null and x.valido_ate > now()),
      'creditos_restantes', coalesce((select sum(x.creditos - x.creditos_usados) from public.carteira_extras x where x.cancelado_em is null and x.valido_ate > now()), 0)),
    'cortesias_recentes', coalesce((select jsonb_agg(x.j order by x.criado_em desc) from (
        select e.criado_em, jsonb_build_object('id', e.id, 'email', u.email, 'creditos', e.creditos, 'creditos_usados', e.creditos_usados,
                                               'voz_minutos', round(e.voz_segundos / 60.0, 1), 'valido_ate', e.valido_ate, 'motivo', e.motivo,
                                               'dado_por', (select a.email from auth.users a where a.id = e.dado_por), 'cancelado_em', e.cancelado_em, 'em', e.criado_em) j
        from public.carteira_extras e join auth.users u on u.id = e.user_id
        where e.origem = 'cortesia' order by e.criado_em desc limit 20) x), '[]'::jsonb));
end
$$;
revoke execute on function public.app_admin_carteira() from public, anon;
grant execute on function public.app_admin_carteira() to authenticated;

-- Salvar: teto e regras de devolução, reserva por recurso, pacotes e "à venda" por plano. Confere tudo e registra.
create or replace function public.app_admin_carteira_salvar(p_dados jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb := p_dados -> 'config';
  x jsonb;
begin
  perform public.assert_admin();
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Nada para salvar.' using errcode = '22023'; end if;
  begin
    if v_cfg is not null then
      if jsonb_typeof(v_cfg) <> 'object' then raise exception 'Configuração inválida.' using errcode = '22023'; end if;
      if v_cfg ? 'teto_custo_dia_usd' and nullif(v_cfg ->> 'teto_custo_dia_usd', '') is not null and (v_cfg ->> 'teto_custo_dia_usd') !~ '^\d{1,5}(\.\d{1,2})?$' then
        raise exception 'Teto do dia: um valor em dólar (ex.: 20 ou 12,50), ou vazio para sem teto.' using errcode = '22023'; end if;
      if v_cfg ? 'devolucao_desconto_pct' and coalesce(v_cfg ->> 'devolucao_desconto_pct', '') !~ '^\d{1,3}(\.\d{1,2})?$' then
        raise exception 'Desconto da devolução: de 0 a 100.' using errcode = '22023'; end if;
      if (v_cfg ? 'devolucao_abuso_qtd' and coalesce(v_cfg ->> 'devolucao_abuso_qtd', '') !~ '^\d{1,3}$')
         or (v_cfg ? 'devolucao_abuso_dias' and coalesce(v_cfg ->> 'devolucao_abuso_dias', '') !~ '^\d{1,4}$') then
        raise exception 'Regra de abuso: números inteiros.' using errcode = '22023'; end if;
      update public.direitos_config set
        teto_custo_dia_usd = case when v_cfg ? 'teto_custo_dia_usd' then nullif(v_cfg ->> 'teto_custo_dia_usd', '')::numeric else teto_custo_dia_usd end,
        devolucao_desconto_pct = case when v_cfg ? 'devolucao_desconto_pct' then (v_cfg ->> 'devolucao_desconto_pct')::numeric else devolucao_desconto_pct end,
        devolucao_abuso_qtd = case when v_cfg ? 'devolucao_abuso_qtd' then (v_cfg ->> 'devolucao_abuso_qtd')::int else devolucao_abuso_qtd end,
        devolucao_abuso_dias = case when v_cfg ? 'devolucao_abuso_dias' then (v_cfg ->> 'devolucao_abuso_dias')::int else devolucao_abuso_dias end,
        updated_at = now(), updated_by = (select auth.uid())
      where id;
    end if;
    if p_dados ? 'recursos' then
      for x in select * from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'recursos') = 'array' then p_dados -> 'recursos' else '[]'::jsonb end) loop
        if not exists (select 1 from public.direitos_recursos r where r.codigo = x ->> 'codigo' and r.tipo = 'credito') then
          raise exception 'Recurso inválido.' using errcode = '22023'; end if;
        if coalesce(x ->> 'reserva_creditos', '') !~ '^\d{1,3}(\.\d)?$' then
          raise exception 'Reserva: créditos com até uma casa (ex.: 3 ou 1,5).' using errcode = '22023'; end if;
        update public.direitos_recursos set reserva_creditos = (x ->> 'reserva_creditos')::numeric, updated_at = now() where codigo = x ->> 'codigo';
      end loop;
    end if;
    if p_dados ? 'pacotes' then
      for x in select * from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'pacotes') = 'array' then p_dados -> 'pacotes' else '[]'::jsonb end) loop
        if not exists (select 1 from public.carteira_pacotes p where p.codigo = x ->> 'codigo') then raise exception 'Pacote inválido.' using errcode = '22023'; end if;
        if char_length(btrim(coalesce(x ->> 'nome', ''))) not between 1 and 60 then raise exception 'Informe o nome do pacote.' using errcode = '22023'; end if;
        if coalesce(x ->> 'preco_centavos', '') !~ '^\d{1,8}$' or coalesce(x ->> 'creditos', '') !~ '^\d{1,6}(\.\d)?$'
           or coalesce(x ->> 'voz_minutos', '') !~ '^\d{1,5}$' or coalesce(x ->> 'validade_dias', '') !~ '^\d{1,3}$' then
          raise exception 'Números do pacote % inválidos.', x ->> 'nome' using errcode = '22023'; end if;
        update public.carteira_pacotes set nome = btrim(x ->> 'nome'), preco_centavos = (x ->> 'preco_centavos')::int, creditos = (x ->> 'creditos')::numeric,
          voz_minutos = (x ->> 'voz_minutos')::int, validade_dias = (x ->> 'validade_dias')::int, updated_at = now(), updated_by = (select auth.uid())
        where codigo = x ->> 'codigo';
      end loop;
    end if;
    if p_dados ? 'planos_a_venda' then
      for x in select * from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'planos_a_venda') = 'array' then p_dados -> 'planos_a_venda' else '[]'::jsonb end) loop
        if not exists (select 1 from public.direitos_planos p where p.codigo = x ->> 'codigo') or jsonb_typeof(x -> 'a_venda') <> 'boolean' then
          raise exception 'Plano inválido.' using errcode = '22023'; end if;
        update public.direitos_planos set a_venda = (x ->> 'a_venda')::boolean, updated_at = now(), updated_by = (select auth.uid()) where codigo = x ->> 'codigo';
      end loop;
    end if;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Algum número está fora do permitido.' using errcode = '22023';
  end;
  perform public.admin_log('carteira.save', null, p_dados);
  return public.app_admin_carteira();
end
$$;
revoke execute on function public.app_admin_carteira_salvar(jsonb) from public, anon;
grant execute on function public.app_admin_carteira_salvar(jsonb) to authenticated;

-- Interna: acha um usuário por e-mail ou id.
create or replace function public.carteira_achar_usuario(p_busca text) returns uuid
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_busca text := btrim(coalesce(p_busca, ''));
  v_id uuid;
begin
  if v_busca = '' then raise exception 'Informe o e-mail do aluno.' using errcode = '22023'; end if;
  if v_busca ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into v_id from auth.users u where u.id = v_busca::uuid;
  else
    select u.id into v_id from auth.users u where lower(u.email) = lower(v_busca) limit 1;
  end if;
  if v_id is null then raise exception 'Nenhum usuário com esse e-mail.' using errcode = 'P0002'; end if;
  return v_id;
end
$$;
revoke execute on function public.carteira_achar_usuario(text) from public, anon, authenticated;

-- Cortesia: créditos e/ou minutos de voz dados pela equipe, com validade e motivo (registro de ações). Só valem com a chave ligada.
create or replace function public.app_admin_carteira_cortesia(p_busca text, p_creditos numeric, p_voz_minutos integer, p_validade_dias integer, p_motivo text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_id bigint;
begin
  perform public.assert_admin();
  v_user := public.carteira_achar_usuario(p_busca);
  if p_creditos is null or p_creditos < 0 or p_creditos > 10000 or p_creditos <> round(p_creditos, 1) then
    raise exception 'Créditos: de 0 a 10.000 (até uma casa decimal).' using errcode = '22023'; end if;
  if p_voz_minutos is null or p_voz_minutos < 0 or p_voz_minutos > 600 then raise exception 'Minutos de voz: de 0 a 600.' using errcode = '22023'; end if;
  if p_creditos = 0 and p_voz_minutos = 0 then raise exception 'Informe créditos ou minutos.' using errcode = '22023'; end if;
  if p_validade_dias is null or p_validade_dias not between 1 and 365 then raise exception 'Validade: de 1 a 365 dias.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 300 then raise exception 'Escreva o motivo da cortesia.' using errcode = '22023'; end if;
  insert into public.carteira_extras (user_id, pacote, origem, creditos, voz_segundos, valido_ate, motivo, dado_por)
  values (v_user, null, 'cortesia', p_creditos, p_voz_minutos * 60, now() + make_interval(days => p_validade_dias), btrim(p_motivo), (select auth.uid()))
  returning id into v_id;
  perform public.admin_log('carteira.cortesia', v_user::text, jsonb_build_object('extra', v_id, 'creditos', p_creditos, 'voz_minutos', p_voz_minutos,
                                                                                  'validade_dias', p_validade_dias, 'motivo', btrim(p_motivo)));
  return public.app_admin_carteira_aluno(v_user::text);
end
$$;
revoke execute on function public.app_admin_carteira_cortesia(text, numeric, integer, integer, text) from public, anon;
grant execute on function public.app_admin_carteira_cortesia(text, numeric, integer, integer, text) to authenticated;

create or replace function public.app_admin_carteira_cortesia_cancelar(p_id bigint, p_motivo text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  e public.carteira_extras;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 300 then raise exception 'Escreva o motivo.' using errcode = '22023'; end if;
  select * into e from public.carteira_extras where id = p_id for update;
  if not found or e.origem <> 'cortesia' then raise exception 'Cortesia não encontrada.' using errcode = 'P0002'; end if;
  if e.cancelado_em is null then
    update public.carteira_extras set cancelado_em = now(), cancelado_motivo = btrim(p_motivo) where id = p_id;
    perform public.admin_log('carteira.cortesia_cancelada', e.user_id::text, jsonb_build_object('extra', p_id, 'motivo', btrim(p_motivo)));
  end if;
  return public.app_admin_carteira_aluno(e.user_id::text);
end
$$;
revoke execute on function public.app_admin_carteira_cortesia_cancelar(bigint, text) from public, anon;
grant execute on function public.app_admin_carteira_cortesia_cancelar(bigint, text) to authenticated;

-- A carteira de UM aluno: saldo, extras (todos), últimos pedidos e avisos. Só leitura.
create or replace function public.app_admin_carteira_aluno(p_busca text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid;
  d jsonb;
begin
  perform public.assert_admin();
  v_user := public.carteira_achar_usuario(p_busca);
  d := public.direitos_do_aluno(v_user);
  return jsonb_build_object(
    'aluno', jsonb_build_object('id', v_user, 'email', (select u.email from auth.users u where u.id = v_user)),
    'modo', d ->> 'modo', 'perfil', d ->> 'perfil', 'saldo', d -> 'saldo', 'creditos', d -> 'creditos', 'voz', d -> 'voz',
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'pacote', e.pacote, 'origem', e.origem, 'creditos', e.creditos, 'creditos_usados', e.creditos_usados,
                                                            'voz_minutos', round(e.voz_segundos / 60.0, 1), 'voz_usados_min', round(e.voz_usados_s / 60.0, 1),
                                                            'valido_ate', e.valido_ate, 'motivo', e.motivo, 'cancelado_em', e.cancelado_em, 'em', e.criado_em)
                                         order by e.criado_em desc)
                        from public.carteira_extras e where e.user_id = v_user), '[]'::jsonb),
    'movimentos', coalesce((select jsonb_agg(x.j order by x.criado_em desc) from (
        select m.criado_em, jsonb_build_object('recurso', m.recurso, 'modo', m.modo, 'situacao', m.situacao, 'creditos', m.creditos,
                                               'franquia', m.creditos_franquia, 'extras', m.extras, 'excedente', m.excedente, 'custo_usd', m.custo_usd,
                                               'voz_s', m.voz_segundos, 'teria_bloqueado', m.teria_bloqueado, 'motivo', m.motivo_bloqueio, 'em', m.criado_em) j
        from public.carteira_movimentos m where m.user_id = v_user order by m.criado_em desc limit 50) x), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('tipo', a.tipo, 'periodo', a.periodo, 'nivel', a.nivel, 'em', a.criado_em, 'visto_em', a.visto_em)
                                         order by a.criado_em desc)
                        from (select * from public.carteira_avisos where user_id = v_user order by criado_em desc limit 20) a), '[]'::jsonb),
    'devolucoes_integrais_recentes', public.carteira_devolucoes_recentes(v_user));
end
$$;
revoke execute on function public.app_admin_carteira_aluno(text) from public, anon;
grant execute on function public.app_admin_carteira_aluno(text) to authenticated;

-- Simular a devolução (só cálculo) para a equipe: de um plano (preço e datas informados) ou de um extra do aluno (pelo id).
create or replace function public.app_admin_carteira_devolucao(p_dados jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid;
  e public.carteira_extras;
  v_canc timestamptz;
  v_ant integer := 0;
begin
  perform public.assert_admin();
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados inválidos.' using errcode = '22023'; end if;
  v_canc := coalesce(nullif(p_dados ->> 'cancelado_em', '')::timestamptz, now());
  if nullif(p_dados ->> 'aluno', '') is not null then
    v_user := public.carteira_achar_usuario(p_dados ->> 'aluno');
    v_ant := public.carteira_devolucoes_recentes(v_user);
  end if;
  if p_dados ? 'extra_id' then
    select * into e from public.carteira_extras where id = (p_dados ->> 'extra_id')::bigint and (v_user is null or user_id = v_user);
    if not found then raise exception 'Extra não encontrado.' using errcode = 'P0002'; end if;
    return public.carteira_calcular_devolucao_extra(e.preco_pago_centavos, e.creditos, e.creditos_usados, e.criado_em, v_canc, v_ant);
  end if;
  return public.carteira_calcular_devolucao_plano(p_dados ->> 'ciclo', (p_dados ->> 'preco_centavos')::int, (p_dados ->> 'contratado_em')::timestamptz, v_canc, v_ant);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
  raise exception 'Dados inválidos.' using errcode = '22023';
end
$$;
revoke execute on function public.app_admin_carteira_devolucao(jsonb) from public, anon;
grant execute on function public.app_admin_carteira_devolucao(jsonb) to authenticated;
