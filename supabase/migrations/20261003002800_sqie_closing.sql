-- =============================================================================
-- SQIE, fechamento: lacunas da especificação que não dependem de acervo oficial nem de IA.
--   1. tipos de alteração clínica com valor antigo/novo (itens 34, 35, 97)
--   2. frescor da questão, selo só com conferência em dia e verificação ao servir (itens 31, 67, 68, 90)
--   3. eventos do sistema (item 66)
--   4. conflito entre fontes bloqueia "atual" (item 54)
--   5. painel "Questões atualizadas" (itens 87, 86)
--   6. motivos dos erros declarados pelo aluno (item 80)
-- =============================================================================

-- ---------------------------------------------------------------- 1. tipos de alteração
alter table public.ch_source_diff_items add column change_type text not null default 'MODIFIED_RECOMMENDATION' check (change_type in (
  'NEW_RECOMMENDATION', 'REMOVED_RECOMMENDATION', 'MODIFIED_RECOMMENDATION', 'DOSE_CHANGED', 'CUT_OFF_CHANGED', 'SCREENING_CHANGED', 'DIAGNOSTIC_CRITERIA_CHANGED',
  'TREATMENT_CHANGED', 'CONTRAINDICATION_CHANGED', 'TIMING_CHANGED', 'AGE_RANGE_CHANGED', 'GESTATIONAL_AGE_CHANGED', 'FOLLOW_UP_CHANGED', 'TERMINOLOGY_CHANGED', 'NO_CLINICAL_IMPACT'));
alter table public.ch_source_diff_items add column old_values jsonb not null default '[]'::jsonb;     -- números/unidades que só existiam na versão antiga
alter table public.ch_source_diff_items add column new_values jsonb not null default '[]'::jsonb;     -- números/unidades que só existem na versão nova

create or replace function public.ch_worker_record_source_diff(p_diff jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_diff uuid;
  i jsonb;
  v_item uuid;
  v_ids uuid[] := '{}';
  v_touched integer := 0;
  n integer;
begin
  insert into public.ch_source_diffs (source_id, new_source_id, origin, old_hash, new_hash, summary)
  values ((p_diff ->> 'source_id')::uuid, nullif(p_diff ->> 'new_source_id', '')::uuid, p_diff ->> 'origin', p_diff ->> 'old_hash', p_diff ->> 'new_hash', coalesce(p_diff -> 'summary', '{}'::jsonb))
  returning id into v_diff;
  for i in select * from jsonb_array_elements(coalesce(p_diff -> 'items', '[]'::jsonb)) loop
    insert into public.ch_source_diff_items (diff_id, idx, kind, change_type, old_values, new_values, section, old_text, new_text, similarity, critical)
    values (v_diff, coalesce(array_length(v_ids, 1), 0), i ->> 'kind', coalesce(i ->> 'change_type', 'MODIFIED_RECOMMENDATION'), coalesce(i -> 'old_values', '[]'::jsonb), coalesce(i -> 'new_values', '[]'::jsonb), i ->> 'section', i ->> 'old_text', i ->> 'new_text', nullif(i ->> 'similarity', '')::numeric, coalesce((i ->> 'critical')::boolean, false))
    returning id into v_item;
    v_ids := v_ids || v_item;
  end loop;
  for i in select * from jsonb_array_elements(coalesce(p_diff -> 'impacts', '[]'::jsonb)) loop
    -- a fila já existe (nasceu da mudança da fonte); aqui ela ganha triagem. Quem já foi decidido por pessoa não é tocado.
    update public.question_updates u set
      impact_level = i ->> 'level',
      status = 'review_required',
      critical = coalesce((i ->> 'critical')::boolean, false),
      triage_kind = i ->> 'kind',
      change_type = coalesce((select x.change_type from public.ch_source_diff_items x where x.id = case when nullif(i ->> 'item_index', '') is null then null else v_ids[(i ->> 'item_index')::int + 1] end), u.change_type),
      diff_id = v_diff,
      diff_item_id = case when nullif(i ->> 'item_index', '') is null then null else v_ids[(i ->> 'item_index')::int + 1] end,
      reason = left(coalesce(u.reason, '') || case when u.reason is null then '' else ' | ' end || 'Comparação de conteúdo: ' || (i ->> 'reason'), 1000)
    where u.old_claim_id = (i ->> 'claim_id')::uuid and u.old_source_id = (p_diff ->> 'source_id')::uuid and u.status in ('queued', 'review_required') and u.diff_id is null;
    get diagnostics n = row_count;
    v_touched := v_touched + n;
  end loop;
  return jsonb_build_object('diff_id', v_diff, 'items', coalesce(array_length(v_ids, 1), 0), 'updates_triaged', v_touched);
end
$$;


create or replace function public.app_source_diffs(p_source_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'origin', d.origin, 'created_at', d.created_at, 'summary', d.summary, 'new_source_id', d.new_source_id,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'change_type', x.change_type, 'old_values', x.old_values, 'new_values', x.new_values, 'section', x.section, 'old_text', x.old_text, 'new_text', x.new_text, 'similarity', x.similarity, 'critical', x.critical) order by x.idx)
                filter (where x.kind <> 'UNCHANGED'), '[]'::jsonb) from public.ch_source_diff_items x where x.diff_id = d.id)) order by d.created_at desc)
    from public.ch_source_diffs d where d.source_id = p_source_id or d.new_source_id = p_source_id), '[]'::jsonb);
end
$$;


-- ---------------------------------------------------------------- 2. frescor
-- A conferência pedida por quem abre a questão (verificar ao servir): o worker atende na rodada seguinte.
alter table public.ch_source_watch add column requested_at timestamptz;

create or replace function public.ch_source_freshness(p_source_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when s.status <> 'current' then s.freshness_status
    when exists (select 1 from public.ch_source_changes c where c.source_id = s.id and c.resolved_at is null) then 'SOURCE_CHANGED'
    when exists (select 1 from public.ch_evidence e where e.source_id = s.id and e.stale
                 and not exists (select 1 from public.ch_evidence f where f.claim_id = e.claim_id and f.source_id = s.id and not f.stale)) then 'REVIEW_REQUIRED'
    when w.source_id is null then 'UNKNOWN'
    when w.requested_at is not null then 'CHECKING'
    when w.last_checked_at is null or w.next_check_at < now() or w.last_status = 'unreachable' then 'CHECK_DUE'
    else 'FRESH' end
  from public.ch_sources s left join public.ch_source_watch w on w.source_id = s.id
  where s.id = p_source_id
$$;

-- o resultado de uma conferência encerra o pedido
create or replace function public.ch_worker_watch_result(p_source_id uuid, p_hash text, p_status text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  w public.ch_source_watch;
  n integer := 0;
  v_changed boolean;
begin
  select * into w from public.ch_source_watch where source_id = p_source_id;
  if not found then return null; end if;
  v_changed := p_status = 'ok' and w.last_hash is not null and p_hash is distinct from w.last_hash;
  if v_changed then
    n := public.ch_flag_dependents(p_source_id, 'A publicação monitorada mudou (conteúdo diferente do conferido): rever as afirmações.');
    insert into public.ch_source_changes (source_id, old_hash, new_hash, candidate_versions) values (p_source_id, w.last_hash, p_hash, n);
  end if;
  update public.ch_source_watch set last_status = case when v_changed then 'changed' else p_status end, last_checked_at = now(), requested_at = null,
         last_hash = case when p_status = 'ok' then p_hash else last_hash end, next_check_at = now() + make_interval(days => interval_days)
   where source_id = p_source_id;
  update public.ch_sources set freshness_status = public.ch_source_freshness(p_source_id) where id = p_source_id;
  return jsonb_build_object('changed', v_changed, 'candidate_versions', n);
end
$$;

create or replace function public.ch_worker_watch_due() returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('source_id', w.source_id, 'url', w.url, 'last_hash', w.last_hash)), '[]'::jsonb)
  from public.ch_source_watch w where w.next_check_at <= now() or w.requested_at is not null
$$;

create function public.ch_worker_watch_requested() returns integer
  language sql stable security definer set search_path = ''
as $$ select count(*)::int from public.ch_source_watch where requested_at is not null $$;

-- Frescor da questão (0 a 100): o pior entre as fontes oficiais que sustentam as afirmações dela.
--   100 conferida no prazo (ainda na primeira metade do intervalo) · 80 em dia, revisão próxima · 60 conferência vencida/em andamento
--   40 fonte não monitorada · 20 publicação mudou ou evidência a reconferir · 0 sem evidência oficial conferida por pessoa
-- Abaixo de 80 o selo "Atualizada" não aparece.
create function public.question_freshness(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_score integer := null;
  v_sources integer := 0;
  v_last timestamptz;
  v_next timestamptz;
  r record;
  s integer;
begin
  if not public.question_evidence_ready(p_question_id) then
    return jsonb_build_object('score', 0, 'sources', 0, 'last_source_check_at', null, 'next_source_check_at', null, 'reason', 'sem evidência oficial conferida por pessoa');
  end if;
  for r in
    select distinct src.id, public.ch_source_freshness(src.id) f, w.last_checked_at, w.next_check_at, w.interval_days
    from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale and e.checked_by is not null
      join public.ch_sources src on src.id = e.source_id and src.authority_level in ('A', 'B', 'C', 'D') and src.kind = 'final' and src.status = 'current'
      left join public.ch_source_watch w on w.source_id = src.id
    where qc.question_id = p_question_id and qc.role = 'solves' loop
    v_sources := v_sources + 1;
    s := case r.f
      when 'FRESH' then case when r.next_check_at - now() > make_interval(days => r.interval_days) / 2 then 100 else 80 end
      when 'CHECK_DUE' then 60 when 'CHECKING' then 60 when 'UNKNOWN' then 40 else 20 end;
    v_score := least(coalesce(v_score, 100), s);
    v_last := least(coalesce(v_last, r.last_checked_at), r.last_checked_at);
    v_next := least(coalesce(v_next, r.next_check_at), r.next_check_at);
  end loop;
  return jsonb_build_object('score', coalesce(v_score, 0), 'sources', v_sources, 'last_source_check_at', v_last, 'next_source_check_at', v_next);
end
$$;

-- Verificar ao servir: quem abre a questão com a conferência vencida pede a verificação das fontes dela.
-- Não confirma nada sozinho: só antecipa o worker. Devolve quantas fontes foram pedidas.
create function public.app_question_verify_on_serve(p_question_id text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.question_viewable(p_question_id) then return 0; end if;
  update public.ch_source_watch w set requested_at = now()
   where w.requested_at is null and (w.last_checked_at is null or w.next_check_at < now() or w.last_status = 'unreachable')
     and w.source_id in (select e.source_id from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and not e.stale
                           join public.ch_sources s on s.id = e.source_id and s.status = 'current' and s.authority_level in ('A', 'B', 'C', 'D')
                         where qc.question_id = p_question_id);
  get diagnostics n = row_count;
  if n > 0 then
    update public.ch_sources set freshness_status = 'CHECKING' where status = 'current' and id in (select source_id from public.ch_source_watch where requested_at is not null);
  end if;
  return n;
end
$$;

-- o selo e o frescor passam a valer também na leitura do aluno
create or replace function public.app_question_commentary(p_question_id text, p_level text default 'full') returns jsonb
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
    'comment', (select c.content from public.question_comments c where c.analysis_id = a.id and c.level = p_level and c.status = 'published'),
    'sources', coalesce((select jsonb_agg(distinct jsonb_build_object('title', s.title, 'organ', s.organ, 'version', e.source_version, 'page', e.page, 'published_on', s.published_on, 'url', s.url))
                         from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                         join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'
                         where qc.question_id = a.question_id), '[]'::jsonb),
    'sources_checked_at', (select max(e.created_at) from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                           join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current' where qc.question_id = a.question_id),
    -- selo: atualidade conferida por revisor E fontes oficiais monitoradas, com a conferência em dia (frescor >= 80)
    'seal', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and a.last_source_check_at is not null and (public.question_freshness(a.question_id) ->> 'score')::int >= 80 then 'UPDATED' end,
    'seal_checked_at', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and (public.question_freshness(a.question_id) ->> 'score')::int >= 80 then a.last_source_check_at end,
    'freshness', public.question_freshness(a.question_id),
    -- nova atualização em revisão: a conduta mostrada segue a última versão revisada
    'update_in_review', exists (select 1 from public.question_updates u where u.question_id = a.question_id and u.status in ('queued', 'analyzing', 'review_required')),
    'update_card', (select jsonb_build_object('version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level, 'official_answer', k.official_answer, 'official_status', k.official_status,
                      'official_source', k.official_source, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'why_it_matters', k.why_it_matters, 'options_affected', k.options_affected,
                      'sources', k.sources, 'effective_date', k.effective_date, 'verified_at', k.verified_at)
                    from public.question_update_cards k where k.question_id = a.question_id and k.status = 'published'))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and public.question_viewable(a.question_id)
$$;


-- ---------------------------------------------------------------- 3. eventos
create table public.sqie_events (
  id bigint generated always as identity primary key,
  type text not null check (type in ('guideline.updated', 'guideline.diff_ready', 'claim.updated', 'question.impacted', 'question.reanalysis_started', 'question.reanalysis_completed',
                                     'question.review_required', 'question.published')),
  question_id text,
  source_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sqie_events_type_idx on public.sqie_events (type, created_at desc);
create index sqie_events_q_idx on public.sqie_events (question_id, created_at desc);
alter table public.sqie_events enable row level security;
create policy "eventos SQIE: equipe lê" on public.sqie_events for select to authenticated using (public.is_staff());

create function public.sqie_emit() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'ch_source_changes' then
    insert into public.sqie_events (type, source_id, payload) values ('guideline.updated', new.source_id, jsonb_build_object('old_hash', new.old_hash, 'new_hash', new.new_hash));
  elsif tg_table_name = 'ch_source_diffs' then
    insert into public.sqie_events (type, source_id, payload) values ('guideline.diff_ready', new.source_id, jsonb_build_object('diff_id', new.id, 'origin', new.origin, 'summary', new.summary));
  elsif tg_table_name = 'ch_claims' then
    insert into public.sqie_events (type, payload) values ('claim.updated', jsonb_build_object('claim_id', new.id, 'status', new.status));
  elsif tg_table_name = 'question_update_cards' then
    insert into public.sqie_events (type, question_id, payload) values ('question.published', new.question_id, jsonb_build_object('card_version', new.version, 'temporal_status', new.temporal_status));
  elsif tg_table_name = 'question_updates' and tg_op = 'INSERT' then
    insert into public.sqie_events (type, question_id, source_id, payload) values ('question.impacted', new.question_id, new.old_source_id, jsonb_build_object('update_id', new.id, 'claim_id', new.old_claim_id));
  elsif tg_table_name = 'question_updates' and tg_op = 'UPDATE' then
    if new.proposal is not null and old.proposal is null then
      insert into public.sqie_events (type, question_id, payload) values ('question.reanalysis_completed', new.question_id, jsonb_build_object('update_id', new.id, 'model', new.proposal_model));
    end if;
    if new.status = 'review_required' and old.status is distinct from 'review_required' then
      insert into public.sqie_events (type, question_id, payload) values ('question.review_required', new.question_id, jsonb_build_object('update_id', new.id, 'critical', new.critical));
    end if;
  end if;
  return null;
end
$$;
create trigger sqie_emit_changes after insert on public.ch_source_changes for each row execute function public.sqie_emit();
create trigger sqie_emit_diffs after insert on public.ch_source_diffs for each row execute function public.sqie_emit();
create trigger sqie_emit_cards after insert on public.question_update_cards for each row execute function public.sqie_emit();
create trigger sqie_emit_updates_ins after insert on public.question_updates for each row execute function public.sqie_emit();
create trigger sqie_emit_updates_upd after update on public.question_updates for each row execute function public.sqie_emit();
create trigger sqie_emit_claims after update of status on public.ch_claims for each row when (old.status is distinct from new.status) execute function public.sqie_emit();

-- a reanálise começou: o worker registra ao pegar a questão
create function public.ch_worker_reanalysis_started(p_question_id text) returns void
  language sql security definer set search_path = ''
as $$ insert into public.sqie_events (type, question_id) values ('question.reanalysis_started', p_question_id) $$;

create function public.app_sqie_events(p_type text default null, p_limit integer default 50) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (
    select id, type, question_id, source_id, payload, created_at from public.sqie_events where (p_type is null or type = p_type) order by id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) e), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 4. conflito entre fontes
-- "Pronta" agora também exige que NENHUMA fonte oficial vigente discorde (evidência conflitante ou desatualizada).
create or replace function public.question_evidence_ready(p_question_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.question_claims where question_id = p_question_id and role = 'solves')
     and not exists (
       select 1 from public.question_claims qc
       where qc.question_id = p_question_id and qc.role = 'solves'
         and (not exists (select 1 from public.ch_evidence e join public.ch_sources s on s.id = e.source_id
                          where e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale and e.checked_by is not null
                            and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current')
              or exists (select 1 from public.ch_evidence c join public.ch_sources s2 on s2.id = c.source_id
                         where c.claim_id = qc.claim_id and c.verdict in ('conflicting', 'outdated') and not c.stale
                           and s2.authority_level in ('A', 'B', 'C', 'D') and s2.kind = 'final' and s2.status = 'current')))
$$;

-- Conflitos abertos (CONFLICT_DETECTED): afirmações com uma fonte oficial vigente que sustenta e outra que discorda.
create function public.app_question_conflicts() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('claim_id', c.id, 'statement', c.statement,
      'questions', (select jsonb_agg(distinct qc.question_id) from public.question_claims qc where qc.claim_id = c.id),
      'sources', (select jsonb_agg(jsonb_build_object('title', s.title, 'organ', s.organ, 'version', s.version, 'verdict', e.verdict, 'quote', e.quote))
                  from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id and not e.stale and s.status = 'current')))
    from public.ch_claims c
    where exists (select 1 from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id and not e.stale and s.status = 'current' and s.authority_level in ('A','B','C','D') and e.verdict in ('conflicting', 'outdated'))
      and exists (select 1 from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id and not e.stale and s.status = 'current' and s.authority_level in ('A','B','C','D') and e.verdict = 'compatible')), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 5. painel de questões atualizadas
-- Filtros: area, status (da atualização), differs (true = gabarito oficial diferente da conduta atual), search (tema).
create function public.app_updated_questions(p_filters jsonb default '{}'::jsonb, p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_total integer; v_items jsonb;
begin
  perform public.ch_assert_staff();
  with base as (
    select q.id, q.exam_id, q.number, q.topic, public.question_area_code(q.id) area, e.year,
           (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current) official,
           (select k.current_answer from public.question_update_cards k where k.question_id = q.id and k.status = 'published') card_answer,
           (select a.current_best_answer from public.question_analysis a where a.question_id = q.id and a.is_current) analysis_answer,
           (select a.temporal_status from public.question_analysis a where a.question_id = q.id and a.is_current) temporal,
           u.id update_id, u.change_type, u.status ustatus, u.detected_at, u.impact_level, u.critical,
           (select k.effective_date from public.question_update_cards k where k.question_id = q.id and k.status = 'published') effective_date,
           coalesce((select k.sources -> 0 ->> 'title' from public.question_update_cards k where k.question_id = q.id and k.status = 'published'),
                    (select s.title from public.ch_sources s where s.id = u.old_source_id)) source_title
    from public.question_updates u join public.questions q on q.id = u.question_id join public.exams e on e.id = q.exam_id
    where u.id = (select u2.id from public.question_updates u2 where u2.question_id = q.id order by u2.detected_at desc limit 1)),
  filtered as (
    select * from base b
    where (nullif(p_filters ->> 'area', '') is null or b.area = p_filters ->> 'area')
      and (nullif(p_filters ->> 'status', '') is null or b.ustatus = p_filters ->> 'status')
      and (nullif(p_filters ->> 'search', '') is null or public.fold_text(b.topic) like '%' || public.fold_text(p_filters ->> 'search') || '%')
      and (coalesce((p_filters ->> 'differs')::boolean, false) = false or (coalesce(b.card_answer, b.analysis_answer) is not null and coalesce(b.card_answer, b.analysis_answer) <> b.official)))
  select (select count(*)::int from filtered),
         coalesce((select jsonb_agg(jsonb_build_object('question_id', f.id, 'exam_id', f.exam_id, 'year', f.year, 'number', f.number, 'topic', f.topic, 'area', f.area,
                    'official_answer', f.official, 'current_answer', coalesce(f.card_answer, f.analysis_answer), 'temporal_status', f.temporal, 'change_type', f.change_type,
                    'detected_at', f.detected_at, 'effective_date', f.effective_date, 'source', f.source_title, 'status', f.ustatus, 'impact_level', f.impact_level, 'critical', f.critical)
                    order by f.critical desc, f.detected_at desc)
                  from (select * from filtered order by critical desc, detected_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) f), '[]'::jsonb)
  into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end
$$;

-- ---------------------------------------------------------------- 6. motivos declarados pelo aluno
-- O aluno já marca por que errou (caderno de erros). Aqui só se conta o que ele mesmo declarou: não é diagnóstico automático.
create function public.app_error_reasons(p_days integer default 90) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'wrong_questions', (select count(distinct t.question_id)::int from public.question_attempts t where t.user_id = v_user and not t.is_correct and t.answered_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 730))),
    'declared', coalesce((select jsonb_object_agg(x.reason, x.n) from (
        select n.reason, count(*)::int n from public.error_notes n
        where n.user_id = v_user and n.reason is not null
          and exists (select 1 from public.question_attempts t where t.user_id = v_user and t.question_id = n.question_id and not t.is_correct and t.answered_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 730)))
        group by n.reason) x), '{}'::jsonb));
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_watch_due() from public, anon, authenticated;
  revoke execute on function public.ch_worker_watch_requested() from public, anon, authenticated;
  revoke execute on function public.ch_worker_reanalysis_started(text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_watch_result(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_record_source_diff(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_source_freshness(uuid) from public, anon, authenticated;
  revoke execute on function public.question_freshness(text) from public, anon, authenticated;
  revoke execute on function public.question_evidence_ready(text) from public, anon, authenticated;
  revoke execute on function public.sqie_emit() from public, anon, authenticated;
  revoke execute on function public.app_question_verify_on_serve(text) from public, anon;
  revoke execute on function public.app_sqie_events(text, integer) from public, anon;
  revoke execute on function public.app_question_conflicts() from public, anon;
  revoke execute on function public.app_updated_questions(jsonb, integer, integer) from public, anon;
  revoke execute on function public.app_error_reasons(integer) from public, anon;
  revoke execute on function public.app_source_diffs(uuid) from public, anon;
  revoke execute on function public.app_question_commentary(text, text) from public, anon;
end
$revoke$;
