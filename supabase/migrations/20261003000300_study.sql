-- =============================================================================
-- Estudo do aluno: sessões de questões, tentativas, revisão espaçada (FSRS),
-- plano do dia e caderno de erros. Tudo pertence ao próprio aluno (RLS por dono).
-- =============================================================================

-- ---------------------------------------------------------------- sessões de questões
create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('questoes', 'simulado', 'prova')),
  config jsonb not null default '{}'::jsonb,
  question_ids text[] not null check (cardinality(question_ids) between 1 and 200),
  time_limit_seconds integer check (time_limit_seconds > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index practice_sessions_user_idx on public.practice_sessions (user_id, started_at desc);
alter table public.practice_sessions enable row level security;
create policy "sessões: ler as próprias" on public.practice_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sessões: criar as próprias" on public.practice_sessions
  for insert to authenticated with check (user_id = (select auth.uid()) and finished_at is null);
create policy "sessões: encerrar as próprias" on public.practice_sessions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- tentativas
create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id),
  session_id uuid references public.practice_sessions (id) on delete set null,
  selected_option char(1) not null check (selected_option in ('A', 'B', 'C', 'D')),
  -- Calculado pelo banco a partir do gabarito; o valor enviado pelo cliente é ignorado.
  is_correct boolean not null default false,
  active_ms integer check (active_ms between 0 and 86400000),
  confidence smallint check (confidence between 1 and 3),
  answered_at timestamptz not null default now(),
  -- Ordem de gravação (desempata respostas no mesmo instante)
  seq bigint generated always as identity
);
create index question_attempts_user_idx on public.question_attempts (user_id, answered_at desc);
create index question_attempts_user_question_idx on public.question_attempts (user_id, question_id);
alter table public.question_attempts enable row level security;
create policy "tentativas: ler as próprias" on public.question_attempts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tentativas: registrar as próprias" on public.question_attempts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (session_id is null or exists (
      select 1 from public.practice_sessions s where s.id = session_id and s.user_id = (select auth.uid())
    ))
  );
-- Sem UPDATE/DELETE: tentativa é histórico imutável.

create function public.grade_question_attempt() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  select (q.correct_option = new.selected_option) into new.is_correct
  from public.questions q where q.id = new.question_id;
  new.answered_at := clock_timestamp();  -- horário real de cada resposta (now() é fixo na transação)
  return new;
end
$$;
create trigger question_attempts_grade before insert on public.question_attempts
  for each row execute function public.grade_question_attempt();

-- ---------------------------------------------------------------- revisão espaçada (FSRS)
create table public.flashcard_states (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3), -- 0 novo, 1 aprendendo, 2 revisão, 3 reaprendendo
  last_review timestamptz,
  primary key (user_id, card_id)
);
create index flashcard_states_due_idx on public.flashcard_states (user_id, due);
alter table public.flashcard_states enable row level security;
create policy "fsrs: ler o próprio" on public.flashcard_states
  for select to authenticated using (user_id = (select auth.uid()));
create policy "fsrs: criar o próprio" on public.flashcard_states
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "fsrs: atualizar o próprio" on public.flashcard_states
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "fsrs: apagar o próprio" on public.flashcard_states
  for delete to authenticated using (user_id = (select auth.uid()));

create table public.flashcard_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4), -- 1 errei, 2 difícil, 3 bom, 4 fácil
  state_before smallint check (state_before between 0 and 3),
  reviewed_at timestamptz not null default now()
);
create index flashcard_reviews_user_idx on public.flashcard_reviews (user_id, reviewed_at desc);
alter table public.flashcard_reviews enable row level security;
create policy "revisões: ler as próprias" on public.flashcard_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy "revisões: registrar as próprias" on public.flashcard_reviews
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- plano do dia
create table public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  position smallint not null default 0,
  kind text not null check (kind in ('estudar', 'praticar', 'revisar')),
  title text not null check (char_length(title) <= 200),
  ref jsonb not null default '{}'::jsonb,   -- ex.: {"area":"GINECOLOGIA_OBSTETRICIA","count":20}
  minutes smallint not null default 0 check (minutes between 0 and 600),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index plan_tasks_user_day_idx on public.plan_tasks (user_id, day);
alter table public.plan_tasks enable row level security;
create policy "plano: ler o próprio" on public.plan_tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "plano: criar o próprio" on public.plan_tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "plano: atualizar o próprio" on public.plan_tasks
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "plano: apagar o próprio" on public.plan_tasks
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- caderno de erros
-- Anotação e status do aluno sobre uma questão que ele errou.
create table public.error_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id),
  note text check (char_length(note) <= 2000),
  reason text check (reason in ('conhecimento', 'interpretacao', 'atencao', 'chute', 'outro')),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.error_notes enable row level security;
create policy "anotações: ler as próprias" on public.error_notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "anotações: criar as próprias" on public.error_notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "anotações: editar as próprias" on public.error_notes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "anotações: apagar as próprias" on public.error_notes
  for delete to authenticated using (user_id = (select auth.uid()));
create trigger error_notes_touch before update on public.error_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- visões de desempenho
-- security_invoker: a visão respeita o RLS de quem consulta (cada aluno vê só os próprios números).
-- Questões anuladas ficam fora das métricas.

create view public.my_area_stats with (security_invoker = true) as
select q.area,
       count(*)::int as attempts,
       count(*) filter (where a.is_correct)::int as correct,
       round(100.0 * count(*) filter (where a.is_correct) / nullif(count(*), 0), 1) as accuracy
from public.question_attempts a
join public.questions q on q.id = a.question_id
where a.user_id = (select auth.uid()) and q.status <> 'annulled'
group by q.area;

create view public.my_topic_stats with (security_invoker = true) as
select q.area, q.topic,
       count(*)::int as attempts,
       count(*) filter (where a.is_correct)::int as correct,
       round(100.0 * count(*) filter (where a.is_correct) / nullif(count(*), 0), 1) as accuracy,
       max(a.answered_at) as last_attempt_at
from public.question_attempts a
join public.questions q on q.id = a.question_id
where a.user_id = (select auth.uid()) and q.status <> 'annulled'
group by q.area, q.topic;

create view public.my_daily_activity with (security_invoker = true) as
select day, sum(questions)::int as questions, sum(correct)::int as correct, sum(flashcards)::int as flashcards
from (
  select (a.answered_at at time zone 'America/Sao_Paulo')::date as day, 1 as questions,
         (case when a.is_correct then 1 else 0 end) as correct, 0 as flashcards
  from public.question_attempts a where a.user_id = (select auth.uid())
  union all
  select (r.reviewed_at at time zone 'America/Sao_Paulo')::date, 0, 0, 1
  from public.flashcard_reviews r where r.user_id = (select auth.uid())
) x
group by day;

-- Caderno de erros: questões cuja tentativa mais recente foi errada ("para revisar")
-- ou que já foram erradas e depois acertadas ("superadas").
create view public.my_error_notebook with (security_invoker = true) as
with per_question as (
  select a.question_id,
         count(*) filter (where not a.is_correct)::int as wrong_count,
         (array_agg(a.is_correct order by a.answered_at desc, a.seq desc))[1] as last_correct,
         (array_agg(a.selected_option order by a.answered_at desc, a.seq desc) filter (where not a.is_correct))[1] as last_wrong_option,
         max(a.answered_at) as last_attempt_at
  from public.question_attempts a
  where a.user_id = (select auth.uid())
  group by a.question_id
)
select p.question_id, q.area, q.topic, p.wrong_count, p.last_wrong_option, p.last_attempt_at,
       case when p.last_correct then 'superada' else 'para_revisar' end as status,
       n.note, n.reason
from per_question p
join public.questions q on q.id = p.question_id
left join public.error_notes n on n.user_id = (select auth.uid()) and n.question_id = p.question_id
where p.wrong_count > 0 and q.status <> 'annulled';
