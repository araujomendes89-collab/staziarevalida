-- =============================================================================
-- StaziaMed — núcleo de usuários: perfil, papel e assinatura.
--
-- Princípios de segurança (valem para todas as migrações):
--  * RLS ligado em todas as tabelas do schema public.
--  * Papel (role) e plano NUNCA são escritos pelo cliente: ficam em tabelas
--    separadas que só o backend (service_role) altera.
--  * Funções auxiliares SECURITY DEFINER com search_path vazio.
-- =============================================================================

create type public.app_role as enum ('student', 'editor', 'admin');
create type public.plan_code as enum ('trial', 'pro', 'elite');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- ---------------------------------------------------------------- perfil
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  avatar_seed text check (char_length(avatar_seed) <= 64),
  -- 1 = 1ª fase (objetiva), 2 = 2ª fase (habilidades clínicas)
  phase smallint not null default 1 check (phase in (1, 2)),
  exam_type text not null default 'REVALIDA' check (exam_type in ('REVALIDA', 'ENAMED')),
  target_edition text check (target_edition ~ '^\d{4}(/[12])?$'),
  exam_date date,
  daily_minutes integer check (daily_minutes between 0 and 1440),
  study_days_per_week smallint check (study_days_per_week between 0 and 7),
  graduation_country text check (char_length(graduation_country) <= 80),
  graduation_university text check (char_length(graduation_university) <= 160),
  graduation_year smallint check (graduation_year between 1950 and 2100),
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  onboarding jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Dados do aluno editáveis por ele mesmo. Papel e plano ficam em user_roles e subscriptions.';

alter table public.profiles enable row level security;
create policy "perfil: ler o próprio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Sem INSERT/DELETE para o cliente: o perfil nasce no cadastro (trigger) e some com a conta.

-- ---------------------------------------------------------------- papel
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  updated_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
create policy "papel: ler o próprio" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));
-- Escrita só pelo backend (service_role ignora RLS).

-- ---------------------------------------------------------------- assinatura
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_code not null default 'trial',
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "assinatura: ler a própria" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
-- Escrita só pelo backend (webhook do provedor de pagamento).

-- ---------------------------------------------------------------- funções auxiliares
create function public.current_app_role() returns public.app_role
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select r.role from public.user_roles r where r.user_id = (select auth.uid())), 'student'::public.app_role)
$$;

create function public.is_staff() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.current_app_role() in ('editor', 'admin') $$;

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.current_app_role() = 'admin' $$;

-- Pode abrir conteúdo marcado como Pro? (PRO/Elite ativos ou admin)
create function public.has_pro() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.subscriptions s
    where s.user_id = (select auth.uid())
      and s.plan in ('pro', 'elite')
      and s.status in ('active', 'past_due')
  )
$$;

-- updated_at automático
create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- cadastro
-- Todo usuário novo ganha perfil, papel de aluno e 7 dias de teste.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120));
  insert into public.user_roles (user_id) values (new.id);
  insert into public.subscriptions (user_id, plan, status, trial_ends_at)
  values (new.id, 'trial', 'trialing', now() + interval '7 days');
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
