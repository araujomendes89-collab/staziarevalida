-- =============================================================================
-- Uso de IA (cota controlada pelo servidor) e eventos de pagamento (idempotência).
-- Escrita só pelo backend; o aluno lê apenas o próprio uso de IA.
-- =============================================================================

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "uso de IA: ler o próprio" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- Cada evento do provedor é processado uma única vez (event_id único).
create table public.billing_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.billing_events enable row level security;
-- Nenhuma política: só o backend (service_role) acessa.
