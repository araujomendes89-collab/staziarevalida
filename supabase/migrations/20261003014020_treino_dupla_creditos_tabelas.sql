-- =============================================================================
-- JUNÇÃO DA ETAPA 2 (fase2-etapa2, 19/10/2026): renumerada de 013490 para 014020, para ficar DEPOIS da 013980 (a ordem dos
-- arquivos passa a ser a mesma da produção, onde a 2ª fase base já está gravada). Ordem: 013990 (3ª leva), radar 014000/014010,
-- Stazia Match 014020–014070, convite por link 014080, treino sozinho 014090–014120.
-- Stazia Match, Etapa M1a: o livro de créditos único (tabelas, regras de acesso e chave de configuração). DESLIGADO.
-- (Plano de 12/10: "migração 9960"; este arquivo usa 014020, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013300 (app_settings com lista de chaves, checklist_rooms) e da 013370 (última lista de chaves de app_settings).
-- Pode ser colada duas vezes: "create table if not exists", "drop policy/trigger if exists", "create or replace function" e permissões.
-- Não grava dado de aluno. Nenhuma IA. Nenhum pagamento (a Stripe segue parada). NÃO cria função de crédito: as funções
-- ficam na 014030. Nada muda para ninguém: a chave "creditos" nasce com "ativa": false e sem número.
--
-- O QUE FAZ
--  1) app_settings: a lista de chaves aceitas passa a ser a UNIÃO das chaves que já existem no sistema
--     (trial_days, announcement, simulado_ineditas_pct, treino_dupla, treino_dupla_chat) + as que já estão gravadas na tabela
--     + "creditos". Assim colar esta migração nunca recusa uma chave que já esteja gravada. Linha "creditos" nasce desligada:
--       { "ativa": false, "match": { "cobra_rodada_extra": true }, "ia": {} }   (limites por plano: vazios = sem crédito).
--  2) credit_wallets (user_id, pool): saldo de BÔNUS e de COMPRADOS (vazios até haver concessão ou compra). Sem acesso direto.
--  3) credit_daily (user_id, pool, day): uso do dia (dia de São Paulo). O aluno lê só a própria linha.
--  4) credit_ledger: o LIVRO. Só acrescenta (gatilho recusa update, delete e truncate). idem_key única = a mesma operação
--     nunca vale duas vezes. O aluno lê só os próprios lançamentos e SÓ as colunas liberadas (sem idem_key e sem created_by).
--  5) study_room_charges (room_id, user_id, round): uma cobrança por sala, aluno e rodada. A chave primária é a segunda
--     garantia no banco contra débito repetido. bucket 'unlimited' = equipe (sem lançamento no livro).
--  6) checklist_rooms.charged_at: quando houve débito (nulo se a cota estava desligada ou os dois são da equipe).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - study_room_charges ganha a coluna "round" (padrão 1) e a chave (room_id, user_id, round): o plano tinha (room_id, user_id),
--    mas "Treinar outra estação" (013380) abre outra rodada na MESMA sala; se o dono mandar cobrar a rodada extra
--    (creditos.match.cobra_rodada_extra, que é VERDADEIRO por padrão: decisão do dono de 17/10), cada rodada precisa da sua linha. Com a
--    chave desligada à mão só a rodada 1 cobra.
--  - Amount do livro é sempre positivo (a direção vem do tipo), exceto "adjust", que pode ser negativo. O balde diário só aceita
--    consumo e estorno (concessão e compra só existem nos baldes bonus e purchased).
--  - Na leitura do aluno ficam de fora: idem_key (chave interna) e created_by (quem da equipe lançou).
--  - A chave "creditos" (limites por plano) só a equipe lê: a política "leitura para logados" de app_settings foi retirada na
--    …9600 (configuração só equipe). O aluno vê o próprio estado por app_credit_state (014030), nunca a tabela de limites.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: nenhuma (só app_settings_key_check, que é constraint). Gatilho novo
-- credit_ledger_guard, função nova credit_ledger_guard().
--
-- COMO DESFAZER: drop das tabelas study_room_charges, credit_ledger, credit_daily e credit_wallets (nessa ordem), da função
--   credit_ledger_guard(), da coluna checklist_rooms.charged_at e da linha "creditos" de app_settings; refazer app_settings_key_check
--   sem 'creditos'. (Livro com lançamentos não deve ser apagado sem decisão do dono: é registro de dinheiro/crédito.)
-- =============================================================================

-- ---------------------------------------------------------------- 1) chave de configuração
do $$
declare
  v_keys text[];
begin
  select coalesce(array_agg(distinct k order by k), '{}') into v_keys
    from (
      select unnest(array['trial_days', 'announcement', 'simulado_ineditas_pct', 'treino_dupla', 'treino_dupla_chat', 'creditos']) as k
      union
      select key from public.app_settings
    ) x;
  alter table public.app_settings drop constraint if exists app_settings_key_check;
  execute format('alter table public.app_settings add constraint app_settings_key_check check (key in (%s))',
                 (select string_agg(quote_literal(k), ', ') from unnest(v_keys) k));
end
$$;

insert into public.app_settings (key, value)
values ('creditos', '{"ativa": false, "match": {"cobra_rodada_extra": true}, "ia": {}}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2) carteira (bônus e comprados)
create table if not exists public.credit_wallets (
  user_id uuid not null references auth.users (id) on delete cascade,
  pool text not null check (pool in ('match', 'ia')),
  purchased_balance integer not null default 0 check (purchased_balance >= 0),
  bonus_balance integer not null default 0 check (bonus_balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pool)
);
alter table public.credit_wallets enable row level security;
revoke all on public.credit_wallets from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) uso do dia
create table if not exists public.credit_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  pool text not null check (pool in ('match', 'ia')),
  day date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pool, day)
);
alter table public.credit_daily enable row level security;
drop policy if exists "uso do dia: ler o próprio" on public.credit_daily;
create policy "uso do dia: ler o próprio" on public.credit_daily
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.credit_daily from public, anon, authenticated;
grant select on public.credit_daily to authenticated;

-- ---------------------------------------------------------------- 4) o livro (só acrescenta)
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pool text not null check (pool in ('match', 'ia')),
  day date not null,                                   -- dia (São Paulo) a que o lançamento pertence; o estorno usa o dia do consumo
  kind text not null check (kind in ('consume', 'refund', 'grant', 'purchase', 'revoke', 'adjust')),
  bucket text not null check (bucket in ('daily', 'bonus', 'purchased')),
  amount integer not null check (amount <> 0),
  ref_type text,
  ref_id uuid,
  idem_key text not null unique check (char_length(idem_key) between 1 and 200),
  reverses_id bigint references public.credit_ledger (id),
  reason text check (reason is null or char_length(reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'adjust' or amount > 0),
  check (bucket <> 'daily' or kind in ('consume', 'refund')),
  check (kind <> 'grant' or bucket = 'bonus'),
  check (kind <> 'purchase' or bucket = 'purchased')
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, pool, day);
create index if not exists credit_ledger_ref_idx on public.credit_ledger (ref_type, ref_id);
create index if not exists credit_ledger_reverses_idx on public.credit_ledger (reverses_id) where reverses_id is not null;

-- Recusa update, delete e truncate. DUAS exceções, ambas efeito da exclusão de uma conta (não alteram o que foi lançado):
--  1) apagar as linhas de uma conta que já foi excluída (o extrato some junto, por "on delete cascade"; nesse instante o dono do
--     lançamento já não existe em auth.users);
--  2) zerar created_by quando a conta de QUEM lançou (administrador, ou o aluno que iniciou a sala) foi excluída ("on delete set
--     null"): só essa coluna muda, e só de uma conta que já não existe.
create or replace function public.credit_ledger_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.created_by is not null and new.created_by is null
     and not exists (select 1 from auth.users u where u.id = old.created_by)
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new;
  end if;
  raise exception 'O livro de créditos só aceita novas linhas.' using errcode = '42501';
end
$$;
revoke execute on function public.credit_ledger_guard() from public, anon, authenticated;

drop trigger if exists credit_ledger_no_change on public.credit_ledger;
create trigger credit_ledger_no_change before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_guard();
drop trigger if exists credit_ledger_no_truncate on public.credit_ledger;
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function public.credit_ledger_guard();

alter table public.credit_ledger enable row level security;
drop policy if exists "livro: ler os próprios lançamentos" on public.credit_ledger;
create policy "livro: ler os próprios lançamentos" on public.credit_ledger
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.credit_ledger from public, anon, authenticated;
-- Só as colunas liberadas: sem idem_key (chave interna) e sem created_by (quem da equipe lançou).
grant select (id, user_id, pool, day, kind, bucket, amount, ref_type, ref_id, reverses_id, reason, created_at)
  on public.credit_ledger to authenticated;

-- ---------------------------------------------------------------- 5) cobrança por sala, aluno e rodada
alter table public.checklist_rooms add column if not exists charged_at timestamptz;

create table if not exists public.study_room_charges (
  room_id uuid not null references public.checklist_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  round integer not null default 1 check (round >= 1),
  bucket text not null check (bucket in ('daily', 'bonus', 'purchased', 'unlimited')),
  usage_date date not null,
  ledger_id bigint references public.credit_ledger (id) on delete cascade,   -- só some junto com a conta (gatilho do livro)
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, round),
  check ((bucket = 'unlimited') = (ledger_id is null))
);
create index if not exists study_room_charges_user_idx on public.study_room_charges (user_id, usage_date);
alter table public.study_room_charges enable row level security;
drop policy if exists "cobranças da sala: ler as próprias" on public.study_room_charges;
create policy "cobranças da sala: ler as próprias" on public.study_room_charges
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.study_room_charges from public, anon, authenticated;
grant select on public.study_room_charges to authenticated;
