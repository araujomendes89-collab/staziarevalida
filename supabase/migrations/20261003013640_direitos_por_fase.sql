-- =============================================================================
-- PLANOS · ETAPA 1 (decisões do dono de 2026-10-17): "direitos do aluno" POR FASE, em MODO SOMBRA.
--
-- O QUE É: uma regra central, no banco, que diz para cada aluno e cada recurso do app se ele está "liberado", em "amostra" ou
-- "trancado" (com o motivo e as ofertas: testar ou assinar qual plano), seguindo o modelo novo do dono:
--   * duas chaves de acesso por FASE: "teoria" (1ª fase: Revalida + ENAMED) e "prática" (2ª fase). Cada uma pode estar em
--     teste (7 dias), paga, vencida (teste ou plano que acabou / cancelado) ou sem acesso;
--   * planos: PRO = teoria; PRÁTICA = prática; ELITE = as duas. Preços mensal e trimestral guardados aqui e editáveis na
--     Administração (nada fixo no código). Nenhum plano é vendido: a cobrança continua desligada;
--   * teste: começa no cadastro; o aluno escolhe 1ª fase, 2ª fase ou as duas ("as duas" = os dois testes juntos); só UM teste
--     por conta e por telefone; o teste da 2ª fase só existe quando a 2ª fase abrir aos alunos (chave desligada);
--   * amostra (no teste e quando vencida/cancelada): limite por dia (questões, simulado curto, Temas/aulas, flashcards do dia,
--     créditos de IA) e 2 minutos de voz no total do teste. Tudo editável;
--   * créditos de IA: 1 crédito = R$ 0,10 de custo de IA; franquias por dia e por mês de cada plano; voz ao vivo em minutos à
--     parte. AQUI SÓ SE MODELA E CALCULA o saldo (nada é consumido nem bloqueado; a carteira com reserva é a etapa 2).
--
-- MODO SOMBRA (o mais importante): a chave "cadeados_ligados" nasce DESLIGADA. Nesta etapa NENHUMA função, regra de acesso ou
-- tela que já existe passa a ler o que está aqui: quem decide tudo continua sendo o que já decidia (subscription_is_paid,
-- user_plan_lock, app_my_access, simulado_gate, has_pro, tutor_entitlement, limites das Inéditas etc.). A regra nova só
-- INFORMA (para a Administração conferir "o que o aluno X teria liberado/trancado" antes de ligar). Ligar a chave nesta
-- etapa também não tranca nada: só as próximas etapas (cadeados no banco e nas telas) vão obedecer a ela.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ, DE PROPÓSITO: não recria nem altera nenhuma função que já existe (sem "create or replace" de
-- função antiga), não muda o tipo plan_code (o plano PRÁTICA vive na tabela nova, sem mexer no tipo, que não se desfaz),
-- não muda tabela antiga (só ganha um gatilho NOVO em subscriptions, que só escreve nas tabelas novas e nunca impede a
-- gravação da assinatura).
--
-- CONVERSÃO DOS ALUNOS ATUAIS (sem perder nada; nada antigo é apagado ou alterado):
--   teste grátis atual → teste da teoria (mesmas datas);  Pro → teoria paga;  Elite → teoria e prática pagas;
--   plano vencido/cancelado → fase "vencida" (volta para a amostra);  cadastro sem teste → teoria "vencida" (amostra).
--   Depois, o gatilho mantém as fases em dia sempre que a assinatura mudar (Administração > Usuários, cadastro novo etc.).
--
-- Pode ser colada de novo no Supabase sem estragar nada: tabelas "if not exists", valores iniciais "on conflict do nothing"
-- (não desfaz o que o dono editou), funções novas "create or replace", gatilho e políticas recriados. Desfazer:
-- supabase/desfazer/20261003013640_direitos_por_fase.desfazer.sql. Conferir: supabase/conferir/direitos-por-fase.sql.
-- =============================================================================

-- ---------------------------------------------------------------- configuração geral (uma linha só)
create table if not exists public.direitos_config (
  id boolean primary key default true check (id),
  -- MODO SOMBRA: desligado = a regra nova só informa. Só as próximas etapas obedecem a esta chave.
  cadeados_ligados boolean not null default false,
  -- 2ª fase aberta aos alunos? Desligada: recursos da prática ficam fechados na regra nova e o teste da 2ª fase não existe.
  fase2_aberta_alunos boolean not null default false,
  -- amostra (teste e vencida/cancelada): créditos de IA por dia e minutos de voz no TOTAL do teste
  amostra_creditos_dia integer not null default 5 check (amostra_creditos_dia between 0 and 1000),
  amostra_voz_minutos_total integer not null default 2 check (amostra_voz_minutos_total between 0 and 600),
  -- 1 crédito = R$ 0,10 de custo de IA (em centavos)
  credito_valor_centavos integer not null default 10 check (credito_valor_centavos between 1 and 10000),
  -- dólar em reais para converter o custo registrado (em US$) em créditos; vazio = conta 1 crédito por mensagem do Tutor
  cotacao_dolar numeric(8, 4) check (cotacao_dolar is null or cotacao_dolar between 0.5 and 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.direitos_config enable row level security;
revoke all on public.direitos_config from public, anon, authenticated;
insert into public.direitos_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- planos por fase (preços e franquias)
-- O plano PRÁTICA mora aqui (o tipo antigo plan_code só tem trial/pro/elite e não é tocado). "plano_antigo" liga ao plano da
-- tabela subscriptions (Pro e Elite); o PRÁTICA ainda não tem equivalente antigo e não pode ser dado a ninguém nesta etapa.
create table if not exists public.direitos_planos (
  codigo text primary key check (codigo in ('pro', 'pratica', 'elite')),
  nome text not null check (char_length(nome) between 1 and 60),
  descricao text check (char_length(descricao) <= 300),
  fases text[] not null check (fases <@ array['teoria', 'pratica']::text[] and cardinality(fases) between 1 and 2),
  plano_antigo text check (plano_antigo in ('pro', 'elite')),
  preco_mensal_centavos integer not null check (preco_mensal_centavos between 0 and 10000000),
  preco_trimestral_centavos integer not null check (preco_trimestral_centavos between 0 and 30000000),
  creditos_dia integer not null check (creditos_dia between 0 and 100000),
  creditos_mes integer not null check (creditos_mes between 0 and 1000000),
  voz_minutos_mes integer not null check (voz_minutos_mes between 0 and 100000),
  posicao smallint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.direitos_planos enable row level security;
revoke all on public.direitos_planos from public, anon, authenticated;
insert into public.direitos_planos (codigo, nome, descricao, fases, plano_antigo, preco_mensal_centavos, preco_trimestral_centavos, creditos_dia, creditos_mes, voz_minutos_mes, posicao) values
  ('pro', 'PRO', '1ª fase: Revalida e ENAMED. Teoria completa, simulados Revalida/ENAMED, flashcards e grupo teórico.', array['teoria'], 'pro', 9990, 26970, 8, 180, 10, 1),
  ('pratica', 'PRÁTICA', '2ª fase: estações, checklists, simulados práticos, Treino em Dupla e grupo prático.', array['pratica'], null, 16990, 45870, 12, 270, 20, 2),
  ('elite', 'ELITE', 'As duas fases, sem cadeado.', array['teoria', 'pratica'], 'elite', 19990, 53970, 20, 450, 40, 3)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------- recursos do app e a amostra de cada um
-- fase: teoria (só a 1ª fase), pratica (só a 2ª fase) ou comum (qualquer fase dá acesso).
-- amostra_modo (o que o aluno em teste ou vencido tem): por_dia (amostra_limite por dia), do_dia (só os do dia, ex.: flashcards
-- para revisar hoje), livre (sem limite na amostra), trancado (fora da amostra), creditos (gasta os créditos da amostra),
-- minutos_total (minutos de voz no total do teste).
-- decidido = false: proposta ainda não confirmada pelo dono (a Administração mostra "Proposta: confirme").
-- existe = false: o recurso ainda não está publicado no app (fica na matriz para quando estiver).
create table if not exists public.direitos_recursos (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]{1,40}$'),
  nome text not null check (char_length(nome) between 1 and 80),
  fase text not null check (fase in ('teoria', 'pratica', 'comum')),
  tipo text not null default 'conteudo' check (tipo in ('conteudo', 'credito', 'minutos')),
  amostra_modo text not null check (amostra_modo in ('por_dia', 'do_dia', 'livre', 'trancado', 'creditos', 'minutos_total')),
  amostra_limite integer check (amostra_limite is null or amostra_limite between 0 and 10000),
  unidade text check (char_length(unidade) <= 60),
  decidido boolean not null default true,
  existe boolean not null default true,
  posicao smallint not null default 0,
  updated_at timestamptz not null default now(),
  check ((amostra_modo = 'por_dia') = (amostra_limite is not null))
);
alter table public.direitos_recursos enable row level security;
revoke all on public.direitos_recursos from public, anon, authenticated;
insert into public.direitos_recursos (codigo, nome, fase, tipo, amostra_modo, amostra_limite, unidade, decidido, existe, posicao) values
  -- 1ª fase (PRÁTICA tranca)
  ('questoes', 'Questões teóricas (Inep e StaziaMed)', 'teoria', 'conteudo', 'por_dia', 20, 'questões por dia', true, true, 10),
  ('simulados_teoricos', 'Simulados Revalida e ENAMED', 'teoria', 'conteudo', 'por_dia', 1, 'simulado curto por dia', true, true, 20),
  ('flashcards', 'Flashcards', 'teoria', 'conteudo', 'do_dia', null, 'flashcards do dia', true, true, 30),
  ('grupo_teorico', 'Grupo teórico', 'teoria', 'conteudo', 'trancado', null, null, false, false, 40),
  ('dica_questao', 'Dica do Tutor na questão', 'teoria', 'credito', 'creditos', null, 'créditos de IA', true, true, 50),
  -- 2ª fase (PRO tranca)
  ('estacoes', 'Estações práticas', 'pratica', 'conteudo', 'por_dia', 1, 'estação por dia', false, true, 110),
  ('checklists', 'Checklists', 'pratica', 'conteudo', 'por_dia', 1, 'checklist por dia', false, true, 120),
  ('simulados_praticos', 'Simulados práticos', 'pratica', 'conteudo', 'por_dia', 1, 'simulado prático por dia', false, false, 130),
  ('treino_dupla', 'Treino em Dupla', 'pratica', 'conteudo', 'trancado', null, null, false, false, 140),
  ('grupo_pratico', 'Grupo prático', 'pratica', 'conteudo', 'trancado', null, null, false, false, 150),
  ('correcao_estacao_ia', 'Correção de estação por IA', 'pratica', 'credito', 'creditos', null, 'créditos de IA', true, false, 160),
  -- as duas fases (PRÁTICA mantém)
  ('aulas_temas', 'Aulas e Temas Essenciais', 'comum', 'conteudo', 'por_dia', 3, 'Temas ou aulas por dia', true, true, 210),
  ('mapas', 'Mapas mentais', 'comum', 'conteudo', 'livre', null, null, false, true, 220),
  ('podcasts', 'Podcasts', 'comum', 'conteudo', 'livre', null, null, false, true, 230),
  ('atualizacoes', 'Atualizações e Diretrizes', 'comum', 'conteudo', 'livre', null, null, false, true, 240),
  ('tutor_texto', 'Tutor por texto', 'comum', 'credito', 'creditos', null, 'créditos de IA', true, true, 250),
  ('tutor_janela', 'Janelinha do Tutor', 'comum', 'credito', 'creditos', null, 'créditos de IA', true, true, 260),
  ('voz_ao_vivo', 'Voz ao vivo do Tutor', 'comum', 'minutos', 'minutos_total', null, 'minutos no total do teste', true, true, 270)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------- o teste grátis de cada conta (um só por conta)
-- Uma linha por conta = "só um teste por conta". escolha: 1ª fase (teoria), 2ª fase (pratica) ou as duas.
-- origem: cadastro (o teste que o cadastro já dá), conversao (conta antiga com plano pago, marcada como "teste já usado").
-- escolhido_em: quando o aluno escolheu a fase do teste (vazio = ainda não escolheu; vale a 1ª fase, como hoje).
create table if not exists public.aluno_testes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  escolha text not null default 'teoria' check (escolha in ('teoria', 'pratica', 'as_duas')),
  fases text[] not null default array['teoria'] check (fases <@ array['teoria', 'pratica']::text[] and cardinality(fases) between 1 and 2),
  inicio timestamptz not null default now(),
  fim timestamptz,
  origem text not null default 'cadastro' check (origem in ('cadastro', 'conversao')),
  escolhido_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.aluno_testes enable row level security;
drop policy if exists "testes: ler o próprio" on public.aluno_testes;
create policy "testes: ler o próprio" on public.aluno_testes
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.aluno_testes from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.aluno_testes from authenticated;
grant select on public.aluno_testes to authenticated;

-- ---------------------------------------------------------------- a situação de cada fase de cada aluno
-- situacao: teste, paga, pagamento_pendente (vale até 3 dias depois do fim, igual à regra antiga) ou cancelada.
-- "vencida" não é gravada: é calculada na hora (fim no passado), como a regra antiga faz com o teste.
-- origem: assinatura (espelho da tabela subscriptions, mantido pelo gatilho), escolha_teste (o aluno escolheu testar a 2ª fase)
-- ou equipe (dada direto pela equipe, por exemplo o PRÁTICA, que o modelo antigo não tem: o gatilho nunca mexe nessas linhas).
create table if not exists public.aluno_fases (
  user_id uuid not null references auth.users (id) on delete cascade,
  fase text not null check (fase in ('teoria', 'pratica')),
  situacao text not null check (situacao in ('teste', 'paga', 'pagamento_pendente', 'cancelada')),
  plano text check (plano in ('pro', 'pratica', 'elite')),
  inicio timestamptz,
  fim timestamptz,
  origem text not null check (origem in ('assinatura', 'escolha_teste', 'equipe')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, fase)
);
alter table public.aluno_fases enable row level security;
drop policy if exists "fases: ler as próprias" on public.aluno_fases;
create policy "fases: ler as próprias" on public.aluno_fases
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.aluno_fases from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.aluno_fases from authenticated;
grant select on public.aluno_fases to authenticated;

-- ---------------------------------------------------------------- espelho da assinatura antiga → fases
-- Interna. Lê subscriptions (sem mudar nada lá) e grava as fases da conta. Regra (a mesma da conversão):
--   em teste (status trialing)             → teoria em teste até trial_ends_at;
--   Pro                                    → teoria paga / pagamento pendente / cancelada (até current_period_end);
--   Elite                                  → teoria e prática, idem;
--   teste que acabou, cancelado, sem teste → teoria cancelada (vira "vencida" = amostra).
-- A 2ª fase escolhida no teste (origem escolha_teste) acompanha a data do teste e nunca rebaixa uma 2ª fase paga.
create or replace function public.direitos_sincronizar_assinatura(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.subscriptions;
  v_criado timestamptz;
  v_teoria text;
  v_pratica text;
  v_plano text;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if p_user is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('direitos:' || p_user::text, 0));
  select * into s from public.subscriptions where user_id = p_user;
  if not found then
    delete from public.aluno_fases where user_id = p_user and origem = 'assinatura';
    return;
  end if;
  v_criado := coalesce((select u.created_at from auth.users u where u.id = p_user), now());

  -- o teste do cadastro (uma linha por conta); se a equipe muda a data do teste, a data acompanha
  if s.trial_ends_at is not null then
    insert into public.aluno_testes (user_id, escolha, fases, inicio, fim, origem)
    values (p_user, 'teoria', array['teoria'], least(v_criado, s.trial_ends_at), s.trial_ends_at, 'cadastro')
    on conflict (user_id) do update set fim = excluded.fim
      where public.aluno_testes.fim is distinct from excluded.fim;
  end if;

  if s.status = 'trialing' then
    v_teoria := 'teste'; v_plano := null; v_fim := s.trial_ends_at;
    v_inicio := coalesce((select t.inicio from public.aluno_testes t where t.user_id = p_user), v_criado);
  elsif s.plan in ('pro', 'elite') then
    v_teoria := case s.status when 'active' then 'paga' when 'past_due' then 'pagamento_pendente' else 'cancelada' end;
    v_plano := s.plan::text; v_fim := s.current_period_end; v_inicio := null;
    v_pratica := case when s.plan = 'elite' then v_teoria end;
  else
    v_teoria := 'cancelada'; v_plano := null; v_fim := s.trial_ends_at; v_inicio := null;
  end if;

  insert into public.aluno_fases as a (user_id, fase, situacao, plano, inicio, fim, origem, atualizado_em)
  values (p_user, 'teoria', v_teoria, v_plano, v_inicio, v_fim, 'assinatura', now())
  on conflict (user_id, fase) do update set situacao = excluded.situacao, plano = excluded.plano, inicio = excluded.inicio,
    fim = excluded.fim, origem = 'assinatura', atualizado_em = now()
  where a.origem <> 'equipe'
    and (a.situacao, a.plano, a.inicio, a.fim, a.origem) is distinct from (excluded.situacao, excluded.plano, excluded.inicio, excluded.fim, 'assinatura');

  if v_pratica is not null then
    insert into public.aluno_fases as a (user_id, fase, situacao, plano, inicio, fim, origem, atualizado_em)
    values (p_user, 'pratica', v_pratica, v_plano, null, v_fim, 'assinatura', now())
    on conflict (user_id, fase) do update set situacao = excluded.situacao, plano = excluded.plano, inicio = null,
      fim = excluded.fim, origem = 'assinatura', atualizado_em = now()
    where a.origem <> 'equipe'
      and (a.situacao, a.plano, a.inicio, a.fim, a.origem) is distinct from (excluded.situacao, excluded.plano, null::timestamptz, excluded.fim, 'assinatura');
  else
    delete from public.aluno_fases where user_id = p_user and fase = 'pratica' and origem = 'assinatura';
    -- a 2ª fase do teste segue a data do teste: em teste, a mesma data; teste encerrado, encerra junto (agora)
    update public.aluno_fases a set fim = n.fim, atualizado_em = now()
    from (select x.user_id, x.fase,
                 case when s.status = 'trialing' then s.trial_ends_at
                      when x.fim is not null and x.fim <= now() then x.fim
                      else least(coalesce(s.trial_ends_at, now()), now()) end as fim
          from public.aluno_fases x
          where x.user_id = p_user and x.fase = 'pratica' and x.origem = 'escolha_teste' and x.situacao = 'teste') n
    where a.user_id = n.user_id and a.fase = n.fase and a.fim is distinct from n.fim;
  end if;
end
$$;
revoke execute on function public.direitos_sincronizar_assinatura(uuid) from public, anon, authenticated;

-- Gatilho NOVO na assinatura: depois de gravar, atualiza as fases. Nunca impede a gravação da assinatura (qualquer erro vira só
-- um aviso no registro do banco), para não arriscar o cadastro nem a Administração > Usuários.
create or replace function public.direitos_assinatura_gatilho() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.direitos_sincronizar_assinatura(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  exception when others then
    raise warning 'direitos por fase: sincronia da assinatura não feita (%): %', sqlstate, sqlerrm;
  end;
  return null;
end
$$;
revoke execute on function public.direitos_assinatura_gatilho() from public, anon, authenticated;
drop trigger if exists direitos_por_fase_sincronia on public.subscriptions;
create trigger direitos_por_fase_sincronia after insert or update or delete on public.subscriptions
  for each row execute function public.direitos_assinatura_gatilho();

-- ---------------------------------------------------------------- antifraude: um teste por telefone
-- Interna. Verdadeiro quando OUTRA conta (de aluno) com o mesmo WhatsApp já tinha um teste antes deste.
create or replace function public.direitos_teste_repetido(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select exists (
      select 1
      from public.profiles me
      join public.aluno_testes t1 on t1.user_id = me.id
      join public.profiles o on o.phone = me.phone and o.id <> me.id
      join public.aluno_testes t2 on t2.user_id = o.id
      where me.id = p_user and me.phone is not null
        and (t2.inicio < t1.inicio or (t2.inicio = t1.inicio and t2.user_id < t1.user_id))
        and not public.user_has_full_access(o.id))), false)
$$;
revoke execute on function public.direitos_teste_repetido(uuid) from public, anon, authenticated;

-- Interna. A chave do modo sombra (as próximas etapas perguntam aqui antes de trancar).
create or replace function public.direitos_cadeados_ligados() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce((select c.cadeados_ligados from public.direitos_config c), false) $$;
revoke execute on function public.direitos_cadeados_ligados() from public, anon, authenticated;

-- ---------------------------------------------------------------- A REGRA CENTRAL
-- Interna (recebe qualquer aluno): os direitos de p_user pela regra nova. NÃO grava nada e NÃO tranca nada.
-- Devolve: modo (sombra/ligado), perfil (elite, pro, pratica, teste, vencido, sem_acesso, equipe), situação de cada fase,
-- cada recurso (acesso liberado/amostra/trancado, limite da amostra, motivo, mensagem e ofertas), créditos de IA e voz
-- (franquia e uso calculados) e o teste da conta. Nunca devolve preço (a cobrança está desligada).
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
      if a.fim + interval '3 days' > now() then v_sit := 'paga'; v_mot := 'pagamento_pendente'; else v_sit := 'vencida'; v_mot := 'plano_acabou'; end if;
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
                where p.fases && v_fases_alvo and (v_fase2 or v_equipe or 'teoria' = any (p.fases))
                order by p.posicao loop
        v_ofertas := v_ofertas || jsonb_build_array(jsonb_build_object('tipo', 'assinar', 'plano', pl.codigo, 'nome', pl.nome));
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

  -- créditos de IA e voz: franquia do perfil e uso calculado (nada é consumido nem bloqueado aqui)
  if v_perfil in ('elite', 'pro', 'pratica') then
    select * into v_plano_cred from public.direitos_planos where codigo = v_perfil;
    v_cred_dia := v_plano_cred.creditos_dia; v_cred_mes := v_plano_cred.creditos_mes;
    v_voz_lim := v_plano_cred.voz_minutos_mes * 60; v_voz_periodo := 'mes';
    v_voz_usado := public.tutor_voice_seconds(p_user, null, v_mes0);
  elsif v_perfil in ('teste', 'vencido') then
    v_cred_dia := cfg.amostra_creditos_dia; v_cred_mes := null;
    v_voz_lim := cfg.amostra_voz_minutos_total * 60; v_voz_periodo := 'teste_total';
    v_voz_usado := public.tutor_voice_seconds(p_user, null, coalesce(t.inicio, now()));
  elsif v_perfil = 'sem_acesso' then
    v_cred_dia := 0; v_cred_mes := 0; v_voz_lim := 0; v_voz_periodo := null; v_voz_usado := 0;
  end if;
  if cfg.cotacao_dolar is null then
    -- sem cotação: 1 crédito por mensagem do Tutor (provisório, até o dono informar a cotação)
    v_usado_dia := coalesce((select sum(l.interactions) from public.ai_usage_ledger l where l.user_id = p_user and l.feature = 'tutor_text' and l.day = v_today), 0);
    v_usado_mes := coalesce((select sum(l.interactions) from public.ai_usage_ledger l where l.user_id = p_user and l.feature = 'tutor_text' and l.day >= v_mes0_dia), 0);
  else
    v_usado_dia := ceil(coalesce((select sum(l.estimated_cost_usd) from public.ai_usage_ledger l
                                  where l.user_id = p_user and l.feature in ('tutor_text', 'tutor_eval') and l.day = v_today), 0)
                        * cfg.cotacao_dolar * 100 / cfg.credito_valor_centavos)::int;
    v_usado_mes := ceil(coalesce((select sum(l.estimated_cost_usd) from public.ai_usage_ledger l
                                  where l.user_id = p_user and l.feature in ('tutor_text', 'tutor_eval') and l.day >= v_mes0_dia), 0)
                        * cfg.cotacao_dolar * 100 / cfg.credito_valor_centavos)::int;
  end if;

  -- SALDO que vale de verdade AGORA (o chip do Início mostra este): em modo sombra, a cota de hoje do Tutor pela regra antiga
  -- (mensagens do dia e segundos de voz de tutor_entitlement, sem mudar nada); com a chave ligada, os créditos e a voz da regra nova.
  if v_staff then
    v_saldo := jsonb_build_object('fonte', 'equipe', 'ilimitado', true);
  elsif cfg.cadeados_ligados then
    v_saldo := jsonb_build_object('fonte', 'creditos', 'ilimitado', false,
      'creditos_hoje', greatest(0, least(v_cred_dia - v_usado_dia, coalesce(v_cred_mes - v_usado_mes, 2147483647))),
      'creditos_limite_hoje', v_cred_dia,
      'creditos_mes', case when v_cred_mes is not null then greatest(0, v_cred_mes - v_usado_mes) end,
      'creditos_limite_mes', v_cred_mes,
      'voz_restante_s', greatest(0, coalesce(v_voz_lim, 0) - coalesce(v_voz_usado, 0)), 'voz_limite_s', v_voz_lim, 'voz_periodo', v_voz_periodo);
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
    'creditos', case when v_staff then jsonb_build_object('ilimitado', true) else jsonb_build_object(
      'valor_credito_centavos', cfg.credito_valor_centavos,
      'base', case when cfg.cotacao_dolar is null then 'mensagens' else 'custo' end,
      'franquia_dia', v_cred_dia, 'franquia_mes', v_cred_mes,
      'usados_hoje', v_usado_dia, 'usados_mes', v_usado_mes,
      'saldo_hoje', greatest(0, least(v_cred_dia - v_usado_dia, coalesce(v_cred_mes - v_usado_mes, 2147483647)))) end,
    'voz', case when v_staff then jsonb_build_object('ilimitado', true) else jsonb_build_object(
      'periodo', v_voz_periodo, 'limite_s', v_voz_lim, 'usado_s', v_voz_usado, 'saldo_s', greatest(0, v_voz_lim - v_voz_usado)) end,
    'teste', jsonb_build_object(
      'usado', v_teste_usado, 'escolha', t.escolha, 'fases', to_jsonb(t.fases), 'inicio', t.inicio, 'fim', t.fim,
      'escolhido_em', t.escolhido_em, 'repetido_telefone', v_repetido, 'oferecido_no_cadastro', v_teste_oferecido,
      'pode_escolher', t.user_id is not null and t.escolhido_em is null and (t.fim is null or t.fim > now()) and not v_repetido
                       and v_teo = 'teste',
      'escolhas', case when v_fase2 then '["teoria", "pratica", "as_duas"]'::jsonb else '["teoria"]'::jsonb end),
    'calculado_em', now());
end
$$;
revoke execute on function public.direitos_do_aluno(uuid) from public, anon, authenticated;

-- Interna: o acesso de um aluno a UM recurso pela regra nova ('liberado', 'amostra' ou 'trancado'; null = recurso desconhecido).
-- Não olha a chave do modo sombra: quem chamar (próximas etapas) decide se obedece, com direitos_cadeados_ligados().
create or replace function public.user_has_access(p_user uuid, p_recurso text) returns text
  language sql stable security definer set search_path = ''
as $$ select public.direitos_do_aluno(p_user) #>> array['recursos', p_recurso, 'acesso'] $$;
revoke execute on function public.user_has_access(uuid, text) from public, anon, authenticated;

-- O aluno logado pergunta os próprios direitos (para as telas das próximas etapas). Só leitura.
create or replace function public.app_my_entitlements() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return public.direitos_do_aluno(v_user);
end
$$;
revoke execute on function public.app_my_entitlements() from public, anon;
grant execute on function public.app_my_entitlements() to authenticated;

-- O aluno escolhe a fase do seu teste grátis (1ª fase, 2ª fase ou as duas), UMA vez, dentro do teste do cadastro. Não
-- estende datas, não dá plano pago e não mexe em nada antigo (só nas tabelas novas). Será usado pelo onboarding (etapa 4).
create or replace function public.app_escolher_teste(p_escolha text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  t public.aluno_testes;
  v_fases text[];
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if public.user_has_full_access(v_user) then
    raise exception 'A equipe já tem acesso completo; o teste grátis é só para alunos.' using errcode = '22023';
  end if;
  if p_escolha is null or p_escolha not in ('teoria', 'pratica', 'as_duas') then
    raise exception 'Escolha 1ª fase, 2ª fase ou as duas.' using errcode = '22023';
  end if;
  if p_escolha <> 'teoria' and not coalesce((select c.fase2_aberta_alunos from public.direitos_config c), false) then
    raise exception 'A 2ª fase ainda não está aberta aos alunos. Por enquanto, escolha a 1ª fase.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('direitos:' || v_user::text, 0));
  select * into t from public.aluno_testes where user_id = v_user for update;
  if not found then
    raise exception 'Sua conta não tem teste grátis. Fale com a equipe.' using errcode = '22023';
  end if;
  if t.escolhido_em is not null then
    raise exception 'Você já escolheu o seu teste grátis. Só existe um teste por conta: para a outra fase, assine o plano.' using errcode = '22023';
  end if;
  if (t.fim is not null and t.fim <= now())
     or not exists (select 1 from public.subscriptions s where s.user_id = v_user and s.status = 'trialing'
                    and (s.trial_ends_at is null or s.trial_ends_at > now())) then
    raise exception 'Seu teste grátis já terminou. Só existe um teste por conta.' using errcode = '22023';
  end if;
  if public.direitos_teste_repetido(v_user) then
    raise exception 'Este WhatsApp já foi usado no teste grátis de outra conta. Só existe um teste por telefone.' using errcode = '22023';
  end if;
  v_fases := case p_escolha when 'teoria' then array['teoria'] when 'pratica' then array['pratica'] else array['teoria', 'pratica'] end;
  update public.aluno_testes set escolha = p_escolha, fases = v_fases, escolhido_em = now() where user_id = v_user;
  if 'pratica' = any (v_fases) then
    -- nunca rebaixa uma 2ª fase que já esteja paga
    insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem)
    values (v_user, 'pratica', 'teste', null, t.inicio, t.fim, 'escolha_teste')
    on conflict (user_id, fase) do nothing;
  end if;
  return public.direitos_do_aluno(v_user);
end
$$;
revoke execute on function public.app_escolher_teste(text) from public, anon;
grant execute on function public.app_escolher_teste(text) to authenticated;

-- ---------------------------------------------------------------- a regra de HOJE, recurso por recurso (só para comparar)
-- Interna. Lê as funções que decidem hoje (sem mudar nenhuma) e traduz para liberado/amostra/trancado; 'nao_existe' = o
-- recurso ainda não está no app; 'desligado' = o Tutor (ou a voz) está desligado para todos.
create or replace function public.direitos_regra_atual(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_full boolean := public.user_has_full_access(p_user);
  v_equipe boolean := public.user_is_staff(p_user);
  v_sem_pago boolean := public.user_without_paid_access(p_user);
  e jsonb := public.tutor_entitlement(p_user);
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

-- ---------------------------------------------------------------- Administração (só administrador)
-- O painel: chaves, amostra, créditos, planos por fase, a matriz de recursos e um resumo de quantos alunos mudariam.
create or replace function public.app_admin_direitos() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.direitos_config;
  u record;
  v_novo jsonb;
  v_atual jsonb;
  v_perfis jsonb := '{}'::jsonb;
  v_perdem integer := 0;
  v_ganham integer := 0;
  v_repetidos integer := 0;
  v_total integer := 0;
  v_perde boolean;
  v_ganha boolean;
  k text;
begin
  perform public.assert_admin();
  select * into c from public.direitos_config;
  -- resumo (alunos; equipe e revisores ficam de fora): quantos perderiam e quantos ganhariam algo se a regra nova valesse
  for u in select x.id from auth.users x
           where not public.user_has_full_access(x.id) order by x.created_at limit 5000 loop
    v_total := v_total + 1;
    v_novo := public.direitos_do_aluno(u.id);
    v_atual := public.direitos_regra_atual(u.id);
    v_perfis := v_perfis || jsonb_build_object(v_novo ->> 'perfil', coalesce((v_perfis ->> (v_novo ->> 'perfil'))::int, 0) + 1);
    if (v_novo #>> '{teste,repetido_telefone}')::boolean then v_repetidos := v_repetidos + 1; end if;
    v_perde := false; v_ganha := false;
    for k in select jsonb_object_keys(v_atual) loop
      if v_atual ->> k = 'liberado' and v_novo #>> array['recursos', k, 'acesso'] in ('amostra', 'trancado') then v_perde := true; end if;
      if v_atual ->> k = 'amostra' and v_novo #>> array['recursos', k, 'acesso'] = 'trancado' then v_perde := true; end if;
      if v_atual ->> k in ('trancado', 'amostra') and v_novo #>> array['recursos', k, 'acesso'] = 'liberado' then v_ganha := true; end if;
    end loop;
    if v_perde then v_perdem := v_perdem + 1; end if;
    if v_ganha then v_ganham := v_ganham + 1; end if;
  end loop;
  return jsonb_build_object(
    'config', jsonb_build_object(
      'cadeados_ligados', c.cadeados_ligados, 'fase2_aberta_alunos', c.fase2_aberta_alunos,
      'amostra_creditos_dia', c.amostra_creditos_dia, 'amostra_voz_minutos_total', c.amostra_voz_minutos_total,
      'credito_valor_centavos', c.credito_valor_centavos, 'cotacao_dolar', c.cotacao_dolar,
      'teste_dias', coalesce((select (x.value #>> '{}')::integer from public.app_settings x where x.key = 'trial_days'), 7),
      'teste_no_cadastro', coalesce((select p.active from public.plans p where p.code = 'trial'), true),
      'updated_at', c.updated_at),
    'planos', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', p.codigo, 'nome', p.nome, 'descricao', p.descricao, 'fases', to_jsonb(p.fases), 'plano_antigo', p.plano_antigo,
        'preco_mensal_centavos', p.preco_mensal_centavos, 'preco_trimestral_centavos', p.preco_trimestral_centavos,
        'creditos_dia', p.creditos_dia, 'creditos_mes', p.creditos_mes, 'voz_minutos_mes', p.voz_minutos_mes) order by p.posicao)
      from public.direitos_planos p), '[]'::jsonb),
    'recursos', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', r.codigo, 'nome', r.nome, 'fase', r.fase, 'tipo', r.tipo, 'amostra_modo', r.amostra_modo,
        'amostra_limite', r.amostra_limite, 'unidade', r.unidade, 'decidido', r.decidido, 'existe', r.existe) order by r.posicao, r.codigo)
      from public.direitos_recursos r), '[]'::jsonb),
    'resumo', jsonb_build_object('alunos', v_total, 'por_perfil', v_perfis, 'perderiam_algo', v_perdem, 'ganhariam_algo', v_ganham,
                                 'teste_repetido_telefone', v_repetidos));
end
$$;
revoke execute on function public.app_admin_direitos() from public, anon;
grant execute on function public.app_admin_direitos() to authenticated;

-- Salvar o painel. Aceita só o que vier (config, planos, recursos); confere tudo; grava no registro de ações.
-- A estrutura (quais fases cada plano tem, a fase de cada recurso) não muda por aqui: é a decisão do dono de 17/10.
create or replace function public.app_admin_direitos_salvar(p_dados jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb := p_dados -> 'config';
  v_antes public.direitos_config;
  v_depois public.direitos_config;
  p jsonb;
  r jsonb;
  v_int constant text := '^\d{1,9}$';
begin
  perform public.assert_admin();
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Nada para salvar.' using errcode = '22023';
  end if;
  select * into v_antes from public.direitos_config for update;

  if v_cfg is not null then
    if jsonb_typeof(v_cfg) <> 'object' then raise exception 'Configuração inválida.' using errcode = '22023'; end if;
    if v_cfg ? 'amostra_creditos_dia' and coalesce(v_cfg ->> 'amostra_creditos_dia', '') !~ v_int then
      raise exception 'Créditos por dia da amostra: número inteiro, 0 ou mais.' using errcode = '22023'; end if;
    if v_cfg ? 'amostra_voz_minutos_total' and coalesce(v_cfg ->> 'amostra_voz_minutos_total', '') !~ v_int then
      raise exception 'Minutos de voz do teste: número inteiro, 0 ou mais.' using errcode = '22023'; end if;
    if v_cfg ? 'credito_valor_centavos' and (coalesce(v_cfg ->> 'credito_valor_centavos', '') !~ v_int or (v_cfg ->> 'credito_valor_centavos')::bigint < 1) then
      raise exception 'Valor do crédito: em centavos, 1 ou mais.' using errcode = '22023'; end if;
    if v_cfg ? 'cotacao_dolar' and nullif(v_cfg ->> 'cotacao_dolar', '') is not null
       and ((v_cfg ->> 'cotacao_dolar') !~ '^\d{1,2}(\.\d{1,4})?$' or (v_cfg ->> 'cotacao_dolar')::numeric not between 0.5 and 50) then
      raise exception 'Cotação do dólar: um valor entre 0,50 e 50 (ex.: 5,40).' using errcode = '22023'; end if;
    begin
      update public.direitos_config set
        cadeados_ligados = case when v_cfg ? 'cadeados_ligados' then (v_cfg ->> 'cadeados_ligados')::boolean else cadeados_ligados end,
        fase2_aberta_alunos = case when v_cfg ? 'fase2_aberta_alunos' then (v_cfg ->> 'fase2_aberta_alunos')::boolean else fase2_aberta_alunos end,
        amostra_creditos_dia = case when v_cfg ? 'amostra_creditos_dia' then (v_cfg ->> 'amostra_creditos_dia')::int else amostra_creditos_dia end,
        amostra_voz_minutos_total = case when v_cfg ? 'amostra_voz_minutos_total' then (v_cfg ->> 'amostra_voz_minutos_total')::int else amostra_voz_minutos_total end,
        credito_valor_centavos = case when v_cfg ? 'credito_valor_centavos' then (v_cfg ->> 'credito_valor_centavos')::int else credito_valor_centavos end,
        cotacao_dolar = case when v_cfg ? 'cotacao_dolar' then nullif(v_cfg ->> 'cotacao_dolar', '')::numeric else cotacao_dolar end,
        updated_at = now(), updated_by = (select auth.uid())
      where id;
    exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Algum número da configuração está fora do permitido.' using errcode = '22023';
    end;
  end if;

  if p_dados ? 'planos' then
    if jsonb_typeof(p_dados -> 'planos') <> 'array' then raise exception 'Planos inválidos.' using errcode = '22023'; end if;
    for p in select * from jsonb_array_elements(p_dados -> 'planos') loop
      if not exists (select 1 from public.direitos_planos x where x.codigo = p ->> 'codigo') then
        raise exception 'Plano inválido.' using errcode = '22023'; end if;
      if char_length(btrim(coalesce(p ->> 'nome', ''))) not between 1 and 60 then
        raise exception 'Informe o nome do plano (até 60 caracteres).' using errcode = '22023'; end if;
      if coalesce(p ->> 'preco_mensal_centavos', '') !~ v_int or coalesce(p ->> 'preco_trimestral_centavos', '') !~ v_int then
        raise exception 'Preço inválido no plano %. Use, por exemplo, 99,90.', p ->> 'nome' using errcode = '22023'; end if;
      if coalesce(p ->> 'creditos_dia', '') !~ v_int or coalesce(p ->> 'creditos_mes', '') !~ v_int or coalesce(p ->> 'voz_minutos_mes', '') !~ v_int then
        raise exception 'Créditos e minutos do plano %: números inteiros, 0 ou mais.', p ->> 'nome' using errcode = '22023'; end if;
      if (p ->> 'creditos_dia')::bigint > (p ->> 'creditos_mes')::bigint then
        raise exception 'No plano %, os créditos por dia não podem passar dos créditos por mês.', p ->> 'nome' using errcode = '22023'; end if;
      begin
        update public.direitos_planos set
          nome = btrim(p ->> 'nome'),
          descricao = nullif(btrim(coalesce(p ->> 'descricao', '')), ''),
          preco_mensal_centavos = (p ->> 'preco_mensal_centavos')::int,
          preco_trimestral_centavos = (p ->> 'preco_trimestral_centavos')::int,
          creditos_dia = (p ->> 'creditos_dia')::int,
          creditos_mes = (p ->> 'creditos_mes')::int,
          voz_minutos_mes = (p ->> 'voz_minutos_mes')::int,
          updated_at = now(), updated_by = (select auth.uid())
        where codigo = p ->> 'codigo';
      exception when check_violation or numeric_value_out_of_range then
        raise exception 'Algum número do plano % está fora do permitido.', p ->> 'nome' using errcode = '22023';
      end;
    end loop;
  end if;

  if p_dados ? 'recursos' then
    if jsonb_typeof(p_dados -> 'recursos') <> 'array' then raise exception 'Recursos inválidos.' using errcode = '22023'; end if;
    for r in select * from jsonb_array_elements(p_dados -> 'recursos') loop
      if not exists (select 1 from public.direitos_recursos x where x.codigo = r ->> 'codigo') then
        raise exception 'Recurso inválido.' using errcode = '22023'; end if;
      if coalesce(r ->> 'amostra_modo', '') not in ('por_dia', 'do_dia', 'livre', 'trancado', 'creditos', 'minutos_total') then
        raise exception 'Amostra inválida.' using errcode = '22023'; end if;
      -- créditos e minutos seguem o tipo do recurso (os números ficam na configuração)
      if (select x.tipo from public.direitos_recursos x where x.codigo = r ->> 'codigo') = 'credito' and r ->> 'amostra_modo' not in ('creditos', 'trancado')
         or (select x.tipo from public.direitos_recursos x where x.codigo = r ->> 'codigo') = 'minutos' and r ->> 'amostra_modo' not in ('minutos_total', 'trancado')
         or (select x.tipo from public.direitos_recursos x where x.codigo = r ->> 'codigo') = 'conteudo' and r ->> 'amostra_modo' in ('creditos', 'minutos_total') then
        raise exception 'Essa amostra não combina com o recurso.' using errcode = '22023'; end if;
      if r ->> 'amostra_modo' = 'por_dia' and coalesce(r ->> 'amostra_limite', '') !~ '^\d{1,4}$' then
        raise exception 'Informe quantos por dia na amostra (número inteiro).' using errcode = '22023'; end if;
      update public.direitos_recursos set
        amostra_modo = r ->> 'amostra_modo',
        amostra_limite = case when r ->> 'amostra_modo' = 'por_dia' then (r ->> 'amostra_limite')::int end,
        decidido = true,
        updated_at = now()
      where codigo = r ->> 'codigo'
        and (amostra_modo, amostra_limite, decidido) is distinct from (r ->> 'amostra_modo', case when r ->> 'amostra_modo' = 'por_dia' then (r ->> 'amostra_limite')::int end, true);
    end loop;
  end if;

  select * into v_depois from public.direitos_config;
  perform public.admin_log('direitos.save', null, p_dados);
  if v_depois.cadeados_ligados is distinct from v_antes.cadeados_ligados then
    perform public.admin_log('direitos.modo', case when v_depois.cadeados_ligados then 'ligado' else 'sombra' end,
                             jsonb_build_object('antes', v_antes.cadeados_ligados, 'depois', v_depois.cadeados_ligados));
  end if;
  if v_depois.fase2_aberta_alunos is distinct from v_antes.fase2_aberta_alunos then
    perform public.admin_log('direitos.segunda_fase', case when v_depois.fase2_aberta_alunos then 'aberta' else 'fechada' end,
                             jsonb_build_object('antes', v_antes.fase2_aberta_alunos, 'depois', v_depois.fase2_aberta_alunos));
  end if;
  return public.app_admin_direitos();
end
$$;
revoke execute on function public.app_admin_direitos_salvar(jsonb) from public, anon;
grant execute on function public.app_admin_direitos_salvar(jsonb) to authenticated;

-- Diagnóstico de UM aluno (por e-mail ou id): a regra de hoje × a regra nova, recurso por recurso. Só leitura.
create or replace function public.app_admin_direitos_aluno(p_busca text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_busca text := btrim(coalesce(p_busca, ''));
  v_id uuid;
  v_email text;
  v_novo jsonb;
  v_atual jsonb;
  v_dif jsonb := '[]'::jsonb;
  k text;
  s public.subscriptions;
begin
  perform public.assert_admin();
  if v_busca = '' then raise exception 'Informe o e-mail do aluno.' using errcode = '22023'; end if;
  if v_busca ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id, u.email into v_id, v_email from auth.users u where u.id = v_busca::uuid;
  else
    select u.id, u.email into v_id, v_email from auth.users u where lower(u.email) = lower(v_busca) limit 1;
  end if;
  if v_id is null then raise exception 'Nenhum usuário com esse e-mail.' using errcode = 'P0002'; end if;
  select * into s from public.subscriptions where user_id = v_id;
  v_novo := public.direitos_do_aluno(v_id);
  v_atual := public.direitos_regra_atual(v_id);
  for k in select jsonb_object_keys(v_atual) loop
    if v_atual ->> k not in ('nao_existe') and v_atual ->> k is distinct from v_novo #>> array['recursos', k, 'acesso'] then
      v_dif := v_dif || jsonb_build_array(jsonb_build_object('recurso', k, 'nome', v_novo #>> array['recursos', k, 'nome'],
                                                             'hoje', v_atual ->> k, 'regra_nova', v_novo #>> array['recursos', k, 'acesso']));
    end if;
  end loop;
  return jsonb_build_object(
    'aluno', jsonb_build_object('id', v_id, 'email', v_email,
      'nome', (select p.name from public.profiles p where p.id = v_id),
      'papel', coalesce((select r.role::text from public.user_roles r where r.user_id = v_id), 'student'),
      'assinatura', case when s.user_id is null then null else jsonb_build_object('plano', s.plan, 'situacao', s.status,
                      'teste_ate', s.trial_ends_at, 'pago_ate', s.current_period_end) end),
    'regra_nova', v_novo,
    'regra_atual', v_atual,
    'diferencas', v_dif);
end
$$;
revoke execute on function public.app_admin_direitos_aluno(text) from public, anon;
grant execute on function public.app_admin_direitos_aluno(text) to authenticated;

-- ---------------------------------------------------------------- CONVERSÃO dos alunos atuais
-- 1) cada assinatura existente vira fases (mesma regra do gatilho; colar de novo só reconfere);
-- 2) contas com Pro/Elite e sem teste registrado ficam com o teste marcado como "já usado" (só um teste por conta).
do $$
declare
  v_user uuid;
begin
  for v_user in select s.user_id from public.subscriptions s loop
    perform public.direitos_sincronizar_assinatura(v_user);
  end loop;
  insert into public.aluno_testes (user_id, escolha, fases, inicio, fim, origem)
  select s.user_id, 'teoria', array['teoria'], u.created_at, null, 'conversao'
  from public.subscriptions s join auth.users u on u.id = s.user_id
  where s.plan in ('pro', 'elite')
  on conflict (user_id) do nothing;
end $$;
