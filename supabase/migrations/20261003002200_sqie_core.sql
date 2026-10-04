-- =============================================================================
-- Stazia Question Intelligence Engine (SQIE), fase 1.
-- Duas verdades separadas por questão: a HISTÓRICA (gabarito oficial, imutável, com histórico) e a
-- ATUAL (análise e comentário versionados, com revisão médica). Nada se altera em silêncio.
-- =============================================================================

-- ---------------------------------------------------------------- registro de fontes (amplia ch_sources, não cria outro)
alter table public.ch_sources add column country text not null default 'BR';
alter table public.ch_sources add column applies_to_sus boolean not null default false;
alter table public.ch_sources add column specialty text;
alter table public.ch_sources add column theme text;
alter table public.ch_sources add column effective_date date;               -- vigência (≠ data de publicação)
alter table public.ch_sources add column revision_date date;
alter table public.ch_sources add column update_in_progress boolean not null default false;   -- "em atualização": o vigente continua sendo o publicado
alter table public.ch_sources add column freshness_status text not null default 'UNKNOWN'
  check (freshness_status in ('FRESH', 'CHECK_DUE', 'CHECKING', 'SOURCE_CHANGED', 'REVIEW_REQUIRED', 'UNKNOWN'));

-- ---------------------------------------------------------------- gabarito oficial com histórico
create table public.question_official_answers (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  version integer not null,
  answer char(1) check (answer in ('A', 'B', 'C', 'D')),
  answer_status text not null check (answer_status in ('PRELIMINARY', 'FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED', 'UNKNOWN')),
  published_at date,
  source text,
  source_url text,
  is_current boolean not null default true,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  check (answer_status in ('ANNULLED', 'UNKNOWN') or answer is not null),
  unique (question_id, version)
);
create unique index question_official_answers_current_idx on public.question_official_answers (question_id) where is_current;
alter table public.question_official_answers enable row level security;
create policy "gabarito oficial: equipe lê" on public.question_official_answers for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

create function public.question_official_answers_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- gabarito preliminar nunca substitui um definitivo (ou anulação) que já exista
    if new.answer_status = 'PRELIMINARY' and exists (select 1 from public.question_official_answers o where o.question_id = new.question_id and o.answer_status in ('FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED')) then
      raise exception 'Já existe gabarito definitivo para esta questão: o preliminar não o substitui.' using errcode = '22023';
    end if;
    new.version := coalesce((select max(o.version) from public.question_official_answers o where o.question_id = new.question_id), 0) + 1;
    new.is_current := true;
    -- guarda o histórico: a versão anterior só deixa de ser "atual" (marca interna libera só esta atualização)
    perform set_config('sqie.internal', 'on', true);
    update public.question_official_answers set is_current = false where question_id = new.question_id and is_current;
    perform set_config('sqie.internal', 'off', true);
    return new;
  end if;
  raise exception 'O histórico do gabarito oficial não se altera nem se apaga: registre uma nova versão.' using errcode = '22023';
end
$$;
create trigger question_official_answers_ins before insert on public.question_official_answers for each row execute function public.question_official_answers_guard();
create trigger question_official_answers_upd before update or delete on public.question_official_answers for each row
  when (current_setting('sqie.internal', true) is distinct from 'on') execute function public.question_official_answers_guard();

-- ---------------------------------------------------------------- trilha de mudanças da questão (nada em silêncio)
create table public.question_change_log (
  id bigint generated always as identity primary key,
  question_id text not null references public.questions (id) on delete cascade,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  reason text,
  changes jsonb not null                     -- {campo: {de: ..., para: ...}}
);
create index question_change_log_q_idx on public.question_change_log (question_id, changed_at desc);
alter table public.question_change_log enable row level security;
create policy "trilha de questões: equipe lê" on public.question_change_log for select to authenticated using (public.is_staff());

create function public.questions_change_trail() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb := '{}'::jsonb;
begin
  if new.statement is distinct from old.statement then c := c || jsonb_build_object('statement', jsonb_build_object('de', old.statement, 'para', new.statement)); end if;
  if new.options is distinct from old.options then c := c || jsonb_build_object('options', jsonb_build_object('de', old.options, 'para', new.options)); end if;
  if new.correct_option is distinct from old.correct_option then c := c || jsonb_build_object('correct_option', jsonb_build_object('de', old.correct_option, 'para', new.correct_option)); end if;
  if new.status is distinct from old.status then c := c || jsonb_build_object('status', jsonb_build_object('de', old.status, 'para', new.status)); end if;
  if new.exam_id is distinct from old.exam_id or new.number is distinct from old.number then
    c := c || jsonb_build_object('prova', jsonb_build_object('de', old.exam_id || '#' || old.number, 'para', new.exam_id || '#' || new.number));
  end if;
  if c <> '{}'::jsonb then
    insert into public.question_change_log (question_id, changed_by, reason, changes) values (new.id, (select auth.uid()), nullif(current_setting('sqie.reason', true), ''), c);
  end if;
  return new;
end
$$;
create trigger questions_change_trail after update on public.questions for each row execute function public.questions_change_trail();

-- ---------------------------------------------------------------- análise da questão (camada ATUAL, versionada)
create table public.question_analysis (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  version integer not null,
  is_current boolean not null default true,
  question_core text not null,                                  -- o que a banca realmente quer saber
  key_data jsonb not null default '[]'::jsonb,                  -- [{text, role: CRITICAL|SUPPORTIVE|NEUTRAL|DISTRACTOR_INFORMATION}]
  reasoning_types text[] not null default '{}',
  difficulty smallint check (difficulty between 1 and 5),
  difficulty_components jsonb not null default '{}'::jsonb,
  trap text,
  golden_rule text,
  pedagogy jsonb not null default '{}'::jsonb,                  -- {teaches, why_important, cognitive_error, review_if_wrong}
  temporal_status text not null default 'REQUIRES_MEDICAL_REVIEW' check (temporal_status in (
    'CURRENT', 'UPDATED_BUT_SAME_ANSWER', 'PARTIALLY_OUTDATED', 'OUTDATED_EXPLANATION', 'OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT',
    'NO_CURRENT_VALID_OPTION', 'CURRENTLY_AMBIGUOUS', 'MAJOR_GUIDELINE_CHANGE', 'REQUIRES_MEDICAL_REVIEW')),
  current_best_answer char(1) check (current_best_answer in ('A', 'B', 'C', 'D')),     -- nulo até haver fonte vigente conferida
  answer_confidence smallint check (answer_confidence between 0 and 100),
  update_confidence smallint check (update_confidence between 0 and 100),
  citation_confidence smallint check (citation_confidence between 0 and 100),
  analysis_date date not null default current_date,
  last_source_check_at timestamptz,
  status text not null default 'ai_draft' check (status in ('ai_draft', 'checked', 'reviewed', 'published', 'rejected')),
  generated_by_model text,
  prompt_version text,
  official_answer_at_analysis char(1),                          -- gabarito oficial visto na hora da análise
  basis_hash text not null,                                     -- enunciado + alternativas + gabarito analisados
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);
create unique index question_analysis_current_idx on public.question_analysis (question_id) where is_current;
alter table public.question_analysis enable row level security;
create policy "análise de questão: equipe e revisores leem" on public.question_analysis for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

create table public.question_option_analysis (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.question_analysis (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  option_id char(1) not null check (option_id in ('A', 'B', 'C', 'D')),
  is_official_correct boolean not null,
  is_currently_correct boolean,                                 -- nulo até a conferência com fonte vigente
  distractor_kind text not null check (distractor_kind in ('CORRECT', 'WRONG', 'TRUE_BUT_NOT_BEST')),
  reasoning text not null,
  why_plausible text,
  why_wrong text,
  when_correct text,
  concept_difference text,
  error_types text[] not null default '{}' check (error_types <@ array[
    'DIAGNOSTIC_ERROR', 'WRONG_TREATMENT', 'WRONG_DRUG', 'WRONG_DOSE', 'WRONG_TIMING', 'WRONG_SEQUENCE', 'WRONG_TEST', 'WRONG_POPULATION',
    'WRONG_GESTATIONAL_AGE', 'WRONG_AGE_GROUP', 'WRONG_SEVERITY', 'OVERTREATMENT', 'UNDERTREATMENT', 'CONTRAINDICATION',
    'OUTDATED_RECOMMENDATION', 'PARTIALLY_CORRECT', 'TRUE_BUT_NOT_BEST', 'CORRECT_CONCEPT_WRONG_CONTEXT', 'UNNECESSARY_INTERVENTION', 'DELAYED_INTERVENTION']),
  trap text,
  quality smallint check (quality between 0 and 4),
  claims_used uuid[] not null default '{}',
  unique (analysis_id, option_id)
);
alter table public.question_option_analysis enable row level security;
create policy "análise de alternativa: equipe e revisores leem" on public.question_option_analysis for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- comentário versionado: nunca sobrescreve; o aluno só lê o publicado
create table public.question_comments (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  analysis_id uuid references public.question_analysis (id) on delete set null,
  version integer not null,
  level text not null check (level in ('quick', 'full', 'teacher')),
  content jsonb not null,
  content_hash text not null,
  status text not null default 'ai_draft' check (status in ('ai_draft', 'checked', 'reviewed', 'published', 'rejected')),
  generated_by_model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (question_id, version, level)
);
alter table public.question_comments enable row level security;
create policy "comentários: equipe e revisores leem" on public.question_comments for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- ligações com o Knowledge Core e atualizações detectadas (preenchidas nas fases 2 a 4)
create table public.question_claims (
  question_id text not null references public.questions (id) on delete cascade,
  claim_id uuid not null references public.ch_claims (id) on delete cascade,
  role text not null default 'solves' check (role in ('solves', 'distractor', 'context')),
  primary key (question_id, claim_id)
);
alter table public.question_claims enable row level security;
create policy "ligação questão–afirmação: equipe lê" on public.question_claims for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

create table public.question_updates (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  detected_at timestamptz not null default now(),
  effective_date date,
  change_type text not null,
  impact_level text not null check (impact_level in ('NO_IMPACT', 'COMMENT_ONLY', 'RATIONALE_CHANGED', 'DISTRACTOR_CHANGED', 'CURRENT_ANSWER_CHANGED', 'NO_VALID_ALTERNATIVE', 'MAJOR_CHANGE')),
  old_claim_id uuid references public.ch_claims (id) on delete set null,
  new_claim_id uuid references public.ch_claims (id) on delete set null,
  old_source_id uuid references public.ch_sources (id) on delete set null,
  new_source_id uuid references public.ch_sources (id) on delete set null,
  official_answer char(1),
  current_answer char(1),
  reason text,
  status text not null default 'queued' check (status in ('queued', 'analyzing', 'review_required', 'reviewed', 'dismissed'))
);
alter table public.question_updates enable row level security;
create policy "atualizações de questão: equipe lê" on public.question_updates for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- ---------------------------------------------------------------- gabarito oficial: único caminho de alteração
-- Registra nova versão (com fonte), mantém a anterior e acerta o que o app usa para corrigir.
create function public.app_admin_set_official_answer(p_question_id text, p_answer text, p_status text, p_source text, p_source_url text default null, p_published_at date default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_version integer;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_source, ''))) = 0 then raise exception 'Informe a fonte do gabarito (documento e data).' using errcode = '22023'; end if;
  perform set_config('sqie.reason', 'Gabarito oficial: ' || p_status || ' (' || btrim(p_source) || ')', true);
  insert into public.question_official_answers (question_id, answer, answer_status, published_at, source, source_url)
  values (p_question_id, nullif(p_answer, ''), p_status, p_published_at, btrim(p_source), nullif(btrim(p_source_url), '')) returning id, version into v_id, v_version;
  update public.questions set
    correct_option = case when p_status in ('FINAL', 'CHANGED_AFTER_APPEAL') then p_answer::char(1) else correct_option end,
    status = case p_status when 'ANNULLED' then 'annulled' when 'CHANGED_AFTER_APPEAL' then 'changed_after_appeal' when 'FINAL' then 'valid' else status end
  where id = p_question_id and p_status in ('FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED');
  perform public.ch_log('question.official_answer', p_question_id, jsonb_build_object('status', p_status, 'answer', p_answer, 'version', v_version));
  return jsonb_build_object('id', v_id, 'version', v_version);
end
$$;

-- ---------------------------------------------------------------- funções do processamento (só a chave de serviço)
-- Questões ainda sem análise para o conteúdo atual (enunciado + alternativas + gabarito).
create function public.ch_worker_questions_for_analysis(p_limit integer default 20, p_exam text default null, p_only_missing boolean default true) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.exam_id, x.number), '[]'::jsonb) from (
    select q.id, q.exam_id, q.number, q.area, q.statement, q.status, q.correct_option, q.images,
           (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text', 'explanation', nullif(btrim(o ->> 'explanation'), '')) order by o ->> 'id') from jsonb_array_elements(q.options) o) as options,
           e.year as exam_year,
           (select jsonb_build_object('answer', a.answer, 'status', a.answer_status, 'source', a.source) from public.question_official_answers a where a.question_id = q.id and a.is_current) as official,
           (select jsonb_build_object('subarea', d.subarea, 'competency', d.competency, 'care_setting', d.care_setting, 'patient_group', d.patient_group,
                     'clinical_decision', d.detail ->> 'clinical_decision', 'concept', d.detail ->> 'correct_answer_concept', 'intent', d.detail ->> 'question_intent',
                     'distractor_patterns', d.detail -> 'distractor_patterns', 'protocol_topics', d.detail -> 'protocol_topics') from public.question_dna d where d.question_id = q.id) as dna,
           public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)) as basis_hash
    from public.questions q join public.exams e on e.id = q.exam_id
    where q.status <> 'annulled' and q.correct_option is not null
      and (p_exam is null or q.exam_id = p_exam)
      and (not coalesce(p_only_missing, true) or not exists (select 1 from public.question_analysis a where a.question_id = q.id and a.is_current
            and a.basis_hash = public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option))))
    order by q.exam_id, q.number
    limit least(greatest(coalesce(p_limit, 20), 1), 500)) x
$$;

create function public.ch_worker_save_question_analysis(p_question_id text, p_analysis jsonb, p_options jsonb, p_comments jsonb, p_meta jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_version integer;
  v_id uuid;
  v_basis text;
  o jsonb;
  cm jsonb;
begin
  select public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)) into v_basis from public.questions q where q.id = p_question_id;
  if v_basis is null then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.question_analysis where question_id = p_question_id;
  update public.question_analysis set is_current = false where question_id = p_question_id and is_current;
  insert into public.question_analysis (question_id, version, question_core, key_data, reasoning_types, difficulty, difficulty_components, trap, golden_rule, pedagogy,
                                        official_answer_at_analysis, basis_hash, generated_by_model, prompt_version, status)
  values (p_question_id, v_version, p_analysis ->> 'question_core', coalesce(p_analysis -> 'key_data', '[]'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p_analysis -> 'reasoning_types')), '{}'), nullif(p_analysis ->> 'difficulty', '')::smallint,
          coalesce(p_analysis -> 'difficulty_components', '{}'::jsonb), p_analysis ->> 'trap', p_analysis ->> 'golden_rule', coalesce(p_analysis -> 'pedagogy', '{}'::jsonb),
          (select correct_option from public.questions where id = p_question_id), v_basis, p_meta ->> 'model', p_meta ->> 'prompt_version', coalesce(p_meta ->> 'status', 'ai_draft'))
  returning id into v_id;
  for o in select value from jsonb_array_elements(p_options) loop
    insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning, why_plausible, why_wrong, when_correct,
                                                 concept_difference, error_types, trap, quality)
    values (v_id, p_question_id, (o ->> 'option_id')::char(1), (o ->> 'is_official_correct')::boolean, o ->> 'distractor_kind', o ->> 'reasoning', o ->> 'why_plausible', o ->> 'why_wrong',
            o ->> 'when_correct', o ->> 'concept_difference', coalesce(array(select jsonb_array_elements_text(o -> 'error_types')), '{}'), o ->> 'trap', nullif(o ->> 'quality', '')::smallint);
  end loop;
  for cm in select value from jsonb_array_elements(p_comments) loop
    insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, generated_by_model, prompt_version, status)
    values (p_question_id, v_id, v_version, cm ->> 'level', cm -> 'content', public.ch_hash(cm -> 'content'), p_meta ->> 'model', p_meta ->> 'prompt_version', coalesce(p_meta ->> 'status', 'ai_draft'));
  end loop;
  return jsonb_build_object('analysis_id', v_id, 'version', v_version);
end
$$;

-- ---------------------------------------------------------------- revisão médica e acesso do aluno
create function public.question_area_code(p_question_id text) returns text
  language sql stable security definer set search_path = ''
as $$
  select case q.area::text when 'CIRURGIA_GERAL' then 'CIRURGIA' when 'MEDICINA_FAMILIA_COMUNIDADE' then 'MFC' else q.area::text end from public.questions q where q.id = p_question_id
$$;

-- Decisão de uma PESSOA (revisor médico da área). Aprovar publica o comentário daquela versão.
create function public.app_question_analysis_decide(p_analysis_id uuid, p_decision text, p_note text default null) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare a public.question_analysis;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into a from public.question_analysis where id = p_analysis_id;
  if not found then raise exception 'Análise não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_is_reviewer(public.question_area_code(a.question_id)) then
    raise exception 'A revisão médica desta questão é de um revisor cadastrado na área %.', public.question_area_code(a.question_id) using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if p_decision = 'rejected' and char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'Explique o motivo da recusa.' using errcode = '22023'; end if;
  if p_decision = 'approved' and not a.is_current then raise exception 'Só a versão atual da análise pode ser aprovada.' using errcode = '22023'; end if;
  if p_decision = 'approved' and a.basis_hash <> (select public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)) from public.questions q where q.id = a.question_id) then
    raise exception 'A questão mudou depois desta análise: gere a análise de novo.' using errcode = '22023';
  end if;
  update public.question_analysis set status = case p_decision when 'approved' then 'published' else 'rejected' end, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_analysis_id;
  update public.question_comments set status = case p_decision when 'approved' then 'published' else 'rejected' end, published_at = case when p_decision = 'approved' then now() end where analysis_id = p_analysis_id;
  perform public.ch_log('question_analysis.' || p_decision, p_analysis_id::text, jsonb_build_object('question', a.question_id));
  return true;
end
$$;

-- O aluno só recebe análise PUBLICADA e só depois de responder a questão ou finalizar uma sessão com ela
-- (mesma regra da correção). O gabarito atual só aparece quando conferido; nunca se mostra o nome do modelo.
create function public.app_question_commentary(p_question_id text, p_level text default 'full') returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'question_id', a.question_id, 'version', a.version, 'reviewed_at', a.reviewed_at, 'analysis_date', a.analysis_date,
    'question_core', a.question_core, 'key_data', a.key_data, 'trap', a.trap, 'golden_rule', a.golden_rule,
    'official_answer', (select o.answer from public.question_official_answers o where o.question_id = a.question_id and o.is_current),
    'official_status', (select o.answer_status from public.question_official_answers o where o.question_id = a.question_id and o.is_current),
    'temporal_status', a.temporal_status, 'current_best_answer', a.current_best_answer,
    'options', (select jsonb_agg(jsonb_build_object('option_id', x.option_id, 'is_official_correct', x.is_official_correct, 'distractor_kind', x.distractor_kind, 'reasoning', x.reasoning,
                  'why_plausible', x.why_plausible, 'why_wrong', x.why_wrong, 'when_correct', x.when_correct, 'concept_difference', x.concept_difference, 'trap', x.trap) order by x.option_id)
                from public.question_option_analysis x where x.analysis_id = a.id),
    'comment', (select c.content from public.question_comments c where c.analysis_id = a.id and c.level = p_level and c.status = 'published'))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published'
    and (public.is_staff()
         or exists (select 1 from public.question_attempts t where t.user_id = (select auth.uid()) and t.question_id = a.question_id)
         or exists (select 1 from public.practice_sessions s where s.user_id = (select auth.uid()) and s.finished_at is not null and a.question_id = any (s.question_ids)))
$$;

-- Painel: o que há por questão (staff e revisores).
create function public.app_question_analyses(p_status text default null, p_exam text default null, p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
        'questions', (select count(*)::int from public.questions where status <> 'annulled'),
        'analyzed', (select count(*)::int from public.question_analysis where is_current),
        'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*)::int n from public.question_analysis where is_current group by status) s), '{}'::jsonb))),
    'items', coalesce((select jsonb_agg(jsonb_build_object('analysis_id', a.id, 'question_id', a.question_id, 'code', q.code, 'exam_id', q.exam_id, 'number', q.number, 'area', public.question_area_code(q.id),
          'version', a.version, 'status', a.status, 'temporal_status', a.temporal_status, 'difficulty', a.difficulty, 'question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
          'key_data', a.key_data, 'pedagogy', a.pedagogy, 'official_answer', (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current),
          'model', a.generated_by_model, 'analysis_date', a.analysis_date, 'can_review', public.ch_is_reviewer(public.question_area_code(q.id)), 'stale', a.basis_hash <> public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)),
          'options', (select jsonb_agg(to_jsonb(x) - 'analysis_id' - 'id' order by x.option_id) from public.question_option_analysis x where x.analysis_id = a.id),
          'checks', coalesce((select jsonb_agg(jsonb_build_object('layer', c.layer, 'verdict', c.verdict, 'findings', c.findings)) from public.question_analysis_checks c where c.analysis_id = a.id), '[]'::jsonb))
        order by q.exam_id, q.number)
      from (select * from public.question_analysis a2 where a2.is_current and (p_status is null or a2.status = p_status)
              and (p_exam is null or exists (select 1 from public.questions q2 where q2.id = a2.question_id and q2.exam_id = p_exam))
            order by a2.question_id limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) a
      join public.questions q on q.id = a.question_id), '[]'::jsonb));
end
$$;

-- Resultado das conferências (software, independente) por análise.
create table public.question_analysis_checks (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.question_analysis (id) on delete cascade,
  layer text not null check (layer in ('software', 'verifier')),
  verdict text not null check (verdict in ('pass', 'issues', 'fail', 'inconclusive')),
  findings jsonb not null default '[]'::jsonb,
  provider text, model text, prompt_version text, cost_usd numeric(10, 5),
  checked_at timestamptz not null default now(),
  unique (analysis_id, layer)
);
alter table public.question_analysis_checks enable row level security;
create policy "conferências de análise: equipe e revisores leem" on public.question_analysis_checks for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

create function public.ch_worker_save_analysis_check(p_analysis_id uuid, p_layer text, p_verdict text, p_findings jsonb, p_meta jsonb default '{}'::jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.question_analysis_checks (analysis_id, layer, verdict, findings, provider, model, prompt_version, cost_usd)
  values (p_analysis_id, p_layer, p_verdict, coalesce(p_findings, '[]'::jsonb), p_meta ->> 'provider', p_meta ->> 'model', p_meta ->> 'prompt_version', nullif(p_meta ->> 'cost_usd', '')::numeric)
  on conflict (analysis_id, layer) do update set verdict = excluded.verdict, findings = excluded.findings, provider = excluded.provider, model = excluded.model,
    prompt_version = excluded.prompt_version, cost_usd = excluded.cost_usd, checked_at = now()
  returning id into v_id;
  -- quem passou nas conferências sobe de "rascunho" para "conferida"; nunca para publicada
  update public.question_analysis a set status = 'checked'
   where a.id = p_analysis_id and a.status = 'ai_draft'
     and not exists (select 1 from public.question_analysis_checks c where c.analysis_id = a.id and c.verdict in ('fail'))
     and exists (select 1 from public.question_analysis_checks c where c.analysis_id = a.id and c.layer = 'software');
  return v_id;
end
$$;

-- Análises (com alternativas e conferências) ainda sem a camada pedida.
create function public.ch_worker_analyses_for_check(p_layer text, p_limit integer default 50) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.question_id), '[]'::jsonb) from (
    select a.id as analysis_id, a.question_id, a.question_core, a.key_data, a.difficulty, a.trap, a.golden_rule, a.generated_by_model, a.official_answer_at_analysis,
           q.statement, q.exam_id, q.number, q.correct_option,
           (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o) as options,
           (select jsonb_agg(to_jsonb(x2) - 'analysis_id' - 'id' order by x2.option_id) from public.question_option_analysis x2 where x2.analysis_id = a.id) as option_analysis,
           (select c.content from public.question_comments c where c.analysis_id = a.id and c.level = 'full') as comment_full
    from public.question_analysis a join public.questions q on q.id = a.question_id
    where a.is_current and a.status in ('ai_draft', 'checked')
      and not exists (select 1 from public.question_analysis_checks c where c.analysis_id = a.id and c.layer = p_layer)
    order by a.question_id limit least(greatest(coalesce(p_limit, 50), 1), 500)) x
$$;

do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ch\_worker\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- funções internas dos gatilhos: ninguém as chama pela API
  revoke execute on function public.question_official_answers_guard() from public, anon, authenticated;
  revoke execute on function public.questions_change_trail() from public, anon, authenticated;
end
$revoke$;
