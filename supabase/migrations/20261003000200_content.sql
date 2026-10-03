-- =============================================================================
-- Conteúdo: provas, questões oficiais e flashcards.
-- Leitura para qualquer aluno logado; escrita só pelo backend/admin.
-- =============================================================================

create type public.med_area as enum (
  'CLINICA_MEDICA', 'CIRURGIA_GERAL', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MEDICINA_FAMILIA_COMUNIDADE'
);

-- ---------------------------------------------------------------- provas
create table public.exams (
  id text primary key check (id ~ '^[a-z0-9-]+$'),          -- ex.: revalida-2024-1, enamed-2025
  kind text not null check (kind in ('REVALIDA', 'ENAMED')),
  year smallint not null check (year between 2000 and 2100),
  semester smallint check (semester in (1, 2)),
  title text not null,
  question_count integer not null default 0,
  source_url text,
  created_at timestamptz not null default now()
);
alter table public.exams enable row level security;
create policy "provas: leitura para logados" on public.exams for select to authenticated using (true);

-- ---------------------------------------------------------------- questões
create table public.questions (
  id text primary key,                                   -- ex.: revalida_2021_q051
  code text not null unique,                             -- ex.: REV-2021-Q051
  exam_id text not null references public.exams (id),
  number smallint not null check (number > 0),
  booklet text,
  area public.med_area not null,
  specialty text,
  topic text not null,
  subtopic text,
  statement text not null,
  -- [{id:"A", text, explanation}] — o gabarito fica em correct_option
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_option char(1) not null check (correct_option in ('A', 'B', 'C', 'D')),
  status text not null default 'valid' check (status in ('valid', 'annulled', 'changed_after_appeal')),
  key_finding text,
  expected_conduct text,
  inep_intent text,
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  search tsvector generated always as (
    to_tsvector('portuguese', coalesce(topic, '') || ' ' || coalesce(subtopic, '') || ' ' || statement)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, number)
);
create index questions_area_idx on public.questions (area);
create index questions_exam_idx on public.questions (exam_id);
create index questions_topic_idx on public.questions (topic);
create index questions_search_idx on public.questions using gin (search);

alter table public.questions enable row level security;
create policy "questões: leitura para logados" on public.questions for select to authenticated using (true);
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- flashcards
-- owner_id nulo = baralho oficial (publicado após revisão); owner_id = cartão pessoal do aluno.
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  area public.med_area not null,
  topic text not null,
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  mnemonic text,
  source_question_id text references public.questions (id) on delete set null,
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'medical_reviewed', 'approved')),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create index flashcards_owner_idx on public.flashcards (owner_id);
alter table public.flashcards enable row level security;
create policy "flashcards: ler oficiais publicados e os próprios" on public.flashcards
  for select to authenticated
  using ((owner_id is null and published) or owner_id = (select auth.uid()) or public.is_staff());
create policy "flashcards: criar cartão pessoal" on public.flashcards
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and not published and review_status = 'unreviewed');
create policy "flashcards: editar/apagar cartão pessoal" on public.flashcards
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not published and review_status = 'unreviewed');
create policy "flashcards: apagar cartão pessoal" on public.flashcards
  for delete to authenticated using (owner_id = (select auth.uid()));
