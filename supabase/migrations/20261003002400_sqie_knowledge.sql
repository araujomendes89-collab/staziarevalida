-- =============================================================================
-- SQIE, fase 2: a questão deixa de ter "conhecimento próprio" e passa a apontar para as afirmações do
-- Knowledge Core (QUESTÃO → AFIRMAÇÃO → EVIDÊNCIA → FONTE). Mudou a fonte → só as questões ligadas às
-- afirmações afetadas entram na fila de reanálise, e o aluno só vê fonte oficial vigente e conferida.
-- =============================================================================

-- Afirmações que nascem das questões (decisão clínica da classificação do motor), sem documento de origem.
alter table public.ch_claims add column origin text not null default 'document' check (origin in ('document', 'question_dna', 'manual'));
create unique index ch_claims_question_dna_uidx on public.ch_claims (md5(lower(btrim(statement)))) where origin = 'question_dna';

-- "Ainda não sei o impacto": a mudança foi detectada e a reanálise decide.
alter table public.question_updates drop constraint question_updates_impact_level_check;
alter table public.question_updates add constraint question_updates_impact_level_check
  check (impact_level in ('UNDETERMINED', 'NO_IMPACT', 'COMMENT_ONLY', 'RATIONALE_CHANGED', 'DISTRACTOR_CHANGED', 'CURRENT_ANSWER_CHANGED', 'NO_VALID_ALTERNATIVE', 'MAJOR_CHANGE'));
create index question_updates_status_idx on public.question_updates (status, detected_at desc);
create index question_updates_q_idx on public.question_updates (question_id);

-- ---------------------------------------------------------------- impacto da mudança de fonte, agora também nas questões
alter function public.ch_flag_dependents(uuid, text) rename to ch_flag_dependents_units;

create function public.ch_flag_dependents(p_old_source uuid, p_reason text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  n := public.ch_flag_dependents_units(p_old_source, p_reason);        -- unidades, aulas e materiais (já existia)
  -- só as questões ligadas a afirmações que tinham evidência desta fonte entram na fila (uma por questão e afirmação)
  insert into public.question_updates (question_id, change_type, impact_level, old_claim_id, old_source_id, reason, status)
  select distinct qc.question_id, 'SOURCE_CHANGED', 'UNDETERMINED', qc.claim_id, p_old_source, p_reason, 'queued'
  from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.source_id = p_old_source
  where not exists (select 1 from public.question_updates u where u.question_id = qc.question_id and u.old_claim_id = qc.claim_id
                    and u.old_source_id = p_old_source and u.status in ('queued', 'analyzing', 'review_required'));
  -- a atualidade dessas análises deixa de estar conferida (nunca mais "atual" sem nova conferência)
  update public.question_analysis set temporal_status = 'REQUIRES_MEDICAL_REVIEW'
   where is_current and temporal_status <> 'REQUIRES_MEDICAL_REVIEW'
     and question_id in (select question_id from public.question_updates where old_source_id = p_old_source and status = 'queued');
  update public.ch_sources set freshness_status = 'SOURCE_CHANGED' where id = p_old_source;
  return n;
end
$$;
revoke execute on function public.ch_flag_dependents(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_flag_dependents_units(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- leitura: afirmações, evidências e fontes de uma questão
create function public.app_question_knowledge(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'question_id', p_question_id,
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'claim_id', c.id, 'role', qc.role, 'statement', c.statement, 'status', c.status, 'origin', c.origin, 'context', c.context,
        'shared_with', (select count(*)::int from public.question_claims o where o.claim_id = c.id and o.question_id <> p_question_id),
        'evidence', coalesce((select jsonb_agg(jsonb_build_object('source', s.title, 'organ', s.organ, 'authority_level', s.authority_level, 'version', e.source_version, 'page', e.page,
                       'section', e.section, 'quote', e.quote, 'verdict', e.verdict, 'stale', e.stale, 'source_status', s.status, 'source_kind', s.kind, 'url', s.url, 'published_on', s.published_on,
                       'valid_until', s.valid_until, 'official', s.authority_level in ('A', 'B', 'C', 'D')) order by e.created_at)
                     from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id), '[]'::jsonb)) order by qc.role, c.created_at)
      from public.question_claims qc join public.ch_claims c on c.id = qc.claim_id where qc.question_id = p_question_id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'detected_at', u.detected_at, 'change_type', u.change_type, 'impact_level', u.impact_level, 'status', u.status, 'reason', u.reason) order by u.detected_at desc)
      from public.question_updates u where u.question_id = p_question_id), '[]'::jsonb));
end
$$;

-- Painel de alertas (item 88): quantas questões estão impactadas e em que pé está cada uma.
create function public.app_question_update_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'questions_with_claims', (select count(distinct question_id)::int from public.question_claims),
    'claims', (select count(*)::int from public.ch_claims where origin = 'question_dna'),
    'claims_with_official_evidence', (select count(distinct c.id)::int from public.ch_claims c join public.question_claims qc on qc.claim_id = c.id
        join public.ch_evidence e on e.claim_id = c.id and e.verdict = 'compatible' and not e.stale join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D')),
    'by_status', coalesce((select jsonb_object_agg(x.status, x.n) from (select status, count(distinct question_id)::int n from public.question_updates group by status) x), '{}'::jsonb),
    'by_impact', coalesce((select jsonb_object_agg(x.impact_level, x.n) from (select impact_level, count(distinct question_id)::int n from public.question_updates where status in ('queued', 'analyzing', 'review_required') group by impact_level) x), '{}'::jsonb));
end
$$;

-- ---------------------------------------------------------------- o aluno: fontes OFICIAIS, vigentes e conferidas
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
    -- só evidência compatível, não substituída, de fonte oficial vigente (nível A–D, documento final)
    'sources', coalesce((select jsonb_agg(distinct jsonb_build_object('title', s.title, 'organ', s.organ, 'version', e.source_version, 'page', e.page, 'published_on', s.published_on, 'url', s.url))
                         from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                         join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'
                         where qc.question_id = a.question_id), '[]'::jsonb),
    'sources_checked_at', (select max(e.created_at) from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                           join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current' where qc.question_id = a.question_id))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published'
    and (public.is_staff()
         or exists (select 1 from public.question_attempts t where t.user_id = (select auth.uid()) and t.question_id = a.question_id)
         or exists (select 1 from public.practice_sessions s where s.user_id = (select auth.uid()) and s.finished_at is not null and a.question_id = any (s.question_ids)))
$$;

do $revoke$
begin
  revoke execute on function public.app_question_knowledge(text) from public, anon;
  revoke execute on function public.app_question_update_summary() from public, anon;
end
$revoke$;
