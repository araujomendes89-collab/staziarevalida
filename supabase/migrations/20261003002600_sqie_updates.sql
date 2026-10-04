-- =============================================================================
-- SQIE, fase 4: reanálise só do que mudou, decisão do revisor médico, cartão "gabarito da prova × conduta atual"
-- para o aluno e linha do tempo da questão.
--
-- Regra 102: nunca apagar o passado, nunca apresentar conduta antiga como atual e nunca apresentar a conduta
-- nova como se fosse o gabarito original. A IA só PROPÕE (coluna proposal); quem publica é o revisor da área,
-- e só com evidência conferida por pessoa em fonte oficial vigente.
-- =============================================================================

-- ---------------------------------------------------------------- proposta da reanálise e decisão do revisor
alter table public.question_updates add column proposal jsonb;                 -- proposta da IA (nada vale ao aluno)
alter table public.question_updates add column proposal_checks jsonb;          -- conferência por software da proposta
alter table public.question_updates add column proposal_model text;
alter table public.question_updates add column proposal_at timestamptz;
alter table public.question_updates add column decision text check (decision in ('no_change', 'publish_update', 'reject_proposal'));
alter table public.question_updates add column decided_by uuid references auth.users (id) on delete set null;
alter table public.question_updates add column decided_at timestamptz;
alter table public.question_updates add column decision_note text;

-- Cartão de atualização publicado: versionado, nunca sobrescrito. Guarda o gabarito OFICIAL da prova (como era)
-- ao lado da conduta ATUAL conferida (com fonte, versão e data).
create table public.question_update_cards (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  update_id uuid references public.question_updates (id) on delete set null,
  version integer not null,
  status text not null default 'published' check (status in ('published', 'superseded')),
  temporal_status text not null check (temporal_status in (
    'UPDATED_BUT_SAME_ANSWER', 'PARTIALLY_OUTDATED', 'OUTDATED_EXPLANATION', 'OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT',
    'NO_CURRENT_VALID_OPTION', 'CURRENTLY_AMBIGUOUS', 'MAJOR_GUIDELINE_CHANGE')),
  impact_level text not null check (impact_level in ('COMMENT_ONLY', 'RATIONALE_CHANGED', 'DISTRACTOR_CHANGED', 'CURRENT_ANSWER_CHANGED', 'NO_VALID_ALTERNATIVE', 'MAJOR_CHANGE')),
  official_answer char(1) check (official_answer in ('A', 'B', 'C', 'D')),
  official_status text,
  official_source text,
  current_answer char(1) check (current_answer in ('A', 'B', 'C', 'D')),
  what_changed text not null check (char_length(btrim(what_changed)) >= 20),
  why_it_matters text,
  options_affected jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,                                  -- [{title, organ, version, page, published_on, url}] da evidência conferida
  effective_date date,
  verified_at timestamptz not null default now(),
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  unique (question_id, version),
  check (current_answer is null or temporal_status <> 'UPDATED_BUT_SAME_ANSWER' or current_answer = official_answer),
  check (temporal_status <> 'OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT' or (current_answer is not null and current_answer is distinct from official_answer))
);
create unique index question_update_cards_current_idx on public.question_update_cards (question_id) where status = 'published';
alter table public.question_update_cards enable row level security;
create policy "cartões de atualização: equipe lê" on public.question_update_cards for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- só o status pode mudar (publicado → substituído): o conteúdo do cartão é histórico
create function public.question_update_cards_guard() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Cartões de atualização não são apagados.' using errcode = '42501'; end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'O conteúdo de um cartão publicado não muda: publique uma nova versão.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger question_update_cards_guard before update or delete on public.question_update_cards for each row execute function public.question_update_cards_guard();

-- ---------------------------------------------------------------- acesso do aluno (mesma regra do comentário)
create function public.question_viewable(p_question_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_staff() or public.ch_is_reviewer()
      or exists (select 1 from public.question_attempts t where t.user_id = (select auth.uid()) and t.question_id = p_question_id)
      or exists (select 1 from public.practice_sessions s where s.user_id = (select auth.uid()) and s.finished_at is not null and p_question_id = any (s.question_ids))
$$;

-- Evidência pronta: toda afirmação que a questão exige tem evidência COMPATÍVEL, não substituída, conferida por PESSOA,
-- em fonte oficial (A–D) vigente e documento final. Sem isso, nada é declarado "atual".
create function public.question_evidence_ready(p_question_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.question_claims where question_id = p_question_id and role = 'solves')
     and not exists (
       select 1 from public.question_claims qc
       where qc.question_id = p_question_id and qc.role = 'solves'
         and not exists (select 1 from public.ch_evidence e join public.ch_sources s on s.id = e.source_id
                         where e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale and e.checked_by is not null
                           and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'))
$$;

-- ---------------------------------------------------------------- reanálise (worker, só chave de serviço)
-- Só entra o que a comparação de conteúdo apontou como mudança relevante e ainda não tem proposta.
create function public.ch_worker_updates_for_reanalysis(p_limit integer default 10) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.q), '[]'::jsonb) from (
    select q.id as q, jsonb_build_object(
      'question_id', q.id, 'exam_id', q.exam_id, 'number', q.number, 'area', q.area, 'statement', q.statement, 'correct_option', q.correct_option,
      'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
      'official', (select jsonb_build_object('answer', a.answer, 'status', a.answer_status, 'source', a.source) from public.question_official_answers a where a.question_id = q.id and a.is_current),
      'analysis', (select jsonb_build_object('analysis_id', a.id, 'trap', a.trap, 'golden_rule', a.golden_rule,
                      'options', (select jsonb_agg(jsonb_build_object('option_id', oa.option_id, 'reasoning', oa.reasoning) order by oa.option_id) from public.question_option_analysis oa where oa.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current),
      'changes', (select jsonb_agg(jsonb_build_object(
                    'update_id', u.id, 'claim', c.statement, 'kind', u.triage_kind, 'critical', u.critical,
                    'old_source', (select jsonb_build_object('title', s.title, 'organ', s.organ, 'version', s.version, 'published_on', s.published_on) from public.ch_sources s where s.id = u.old_source_id),
                    'new_source', (select jsonb_build_object('title', s.title, 'organ', s.organ, 'version', s.version, 'published_on', s.published_on)
                                   from public.ch_source_diffs d join public.ch_sources s on s.id = coalesce(d.new_source_id, d.source_id) where d.id = u.diff_id),
                    'old_text', i.old_text, 'new_text', i.new_text) order by u.detected_at)
                  from public.question_updates u join public.ch_claims c on c.id = u.old_claim_id join public.ch_source_diff_items i on i.id = u.diff_item_id
                  where u.question_id = q.id and u.proposal is null and u.status in ('queued', 'review_required') and u.impact_level = 'UNDETERMINED'
                    and u.triage_kind in ('NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED'))) as item
    from public.questions q
    where q.correct_option is not null and q.status <> 'annulled'
      and exists (select 1 from public.question_updates u where u.question_id = q.id and u.proposal is null and u.status in ('queued', 'review_required')
                  and u.impact_level = 'UNDETERMINED' and u.diff_item_id is not null and u.triage_kind in ('NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED'))
    order by q.exam_id, q.number
    limit least(greatest(coalesce(p_limit, 10), 1), 100)) x
$$;

-- Guarda a PROPOSTA nas atualizações da questão. Não muda impacto, status de análise nem o que o aluno vê.
create function public.ch_worker_save_reanalysis(p_question_id text, p_update_ids uuid[], p_proposal jsonb, p_checks jsonb, p_meta jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.question_updates set proposal = p_proposal, proposal_checks = p_checks, proposal_model = p_meta ->> 'model', proposal_at = now(), status = 'review_required'
   where question_id = p_question_id and id = any (p_update_ids) and status in ('queued', 'review_required');
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- fila de revisão das atualizações
create function public.app_question_updates_queue(p_status text default 'review_required', p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(x.item order by x.crit desc, x.detected_at) from (
    select u.critical as crit, u.detected_at, jsonb_build_object(
      'id', u.id, 'question_id', u.question_id, 'exam_id', q.exam_id, 'number', q.number, 'area', public.question_area_code(q.id),
      'detected_at', u.detected_at, 'status', u.status, 'impact_level', u.impact_level, 'critical', u.critical, 'triage_kind', u.triage_kind, 'reason', u.reason,
      'claim', c.statement,
      'official_answer', (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current),
      'old_text', i.old_text, 'new_text', i.new_text,
      'proposal', u.proposal, 'proposal_checks', u.proposal_checks, 'proposal_model', u.proposal_model,
      'evidence_ready', public.question_evidence_ready(q.id),
      'decision', u.decision, 'decision_note', u.decision_note) as item
    from public.question_updates u join public.questions q on q.id = u.question_id
      left join public.ch_claims c on c.id = u.old_claim_id left join public.ch_source_diff_items i on i.id = u.diff_item_id
    where (p_status is null or u.status = p_status)
    order by u.critical desc, u.detected_at
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- decisão do revisor médico
--   no_change         a nova versão da fonte confirma a mesma conduta (exige evidência pronta)
--   publish_update    publica o cartão (p_card: temporal_status, impact_level, current_answer, what_changed, why_it_matters, options_affected, effective_date)
--   reject_proposal   descarta a proposta da IA (com motivo); a atualização volta para a fila de reanálise
create function public.app_question_update_decide(p_update_id uuid, p_decision text, p_note text default null, p_card jsonb default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  u public.question_updates;
  v_area text;
  v_official public.question_official_answers;
  v_version integer;
  v_card uuid;
  v_sources jsonb;
  v_temporal text;
  v_current char(1);
  v_open integer;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into u from public.question_updates where id = p_update_id for update;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  v_area := public.question_area_code(u.question_id);
  if not public.ch_is_reviewer(v_area) then
    raise exception 'A revisão médica desta questão é de um revisor cadastrado na área %.', v_area using errcode = '42501';
  end if;
  if u.status in ('reviewed', 'dismissed') then raise exception 'Esta atualização já foi decidida.' using errcode = '22023'; end if;
  if p_decision not in ('no_change', 'publish_update', 'reject_proposal') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Registre o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;

  if p_decision = 'reject_proposal' then
    update public.question_updates set proposal = null, proposal_checks = null, proposal_model = null, proposal_at = null, status = 'queued',
           decision_note = btrim(p_note), decided_by = (select auth.uid()), decided_at = now(), decision = 'reject_proposal' where id = p_update_id;
    perform public.ch_log('question_update.reject_proposal', p_update_id::text, jsonb_build_object('question', u.question_id, 'note', btrim(p_note)));
    return jsonb_build_object('status', 'queued');
  end if;

  -- daqui para a frente algo será declarado conferido: precisa de evidência oficial vigente conferida por pessoa
  if not public.question_evidence_ready(u.question_id) then
    raise exception 'Confira primeiro as evidências na nova versão da fonte (documento final oficial vigente, conferido por pessoa) para todas as afirmações desta questão.' using errcode = '22023';
  end if;
  select * into v_official from public.question_official_answers where question_id = u.question_id and is_current;
  select coalesce(jsonb_agg(distinct jsonb_build_object('title', s.title, 'organ', s.organ, 'version', e.source_version, 'page', e.page, 'published_on', s.published_on, 'url', s.url)), '[]'::jsonb) into v_sources
    from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale and e.checked_by is not null
    join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'
    where qc.question_id = u.question_id and qc.role = 'solves';

  if p_decision = 'no_change' then
    update public.question_updates set status = 'reviewed', impact_level = 'NO_IMPACT', decision = 'no_change', decision_note = btrim(p_note), decided_by = (select auth.uid()), decided_at = now(),
           official_answer = v_official.answer where id = p_update_id;
    v_temporal := 'UPDATED_BUT_SAME_ANSWER';
  else
    if p_card is null then raise exception 'Informe o cartão de atualização.' using errcode = '22023'; end if;
    v_temporal := p_card ->> 'temporal_status';
    v_current := nullif(p_card ->> 'current_answer', '')::char(1);
    if v_temporal not in ('UPDATED_BUT_SAME_ANSWER', 'PARTIALLY_OUTDATED', 'OUTDATED_EXPLANATION', 'OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT', 'NO_CURRENT_VALID_OPTION', 'CURRENTLY_AMBIGUOUS', 'MAJOR_GUIDELINE_CHANGE') then
      raise exception 'Situação temporal inválida.' using errcode = '22023';
    end if;
    if coalesce(p_card ->> 'impact_level', '') not in ('COMMENT_ONLY', 'RATIONALE_CHANGED', 'DISTRACTOR_CHANGED', 'CURRENT_ANSWER_CHANGED', 'NO_VALID_ALTERNATIVE', 'MAJOR_CHANGE') then
      raise exception 'Nível de impacto inválido.' using errcode = '22023';
    end if;
    if v_temporal = 'OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT' and (v_current is null or v_current is not distinct from v_official.answer) then
      raise exception 'Para "gabarito oficial difere da conduta atual", informe a alternativa atual, diferente da oficial (%).', v_official.answer using errcode = '22023';
    end if;
    if v_temporal = 'UPDATED_BUT_SAME_ANSWER' and v_current is not null and v_current is distinct from v_official.answer then
      raise exception 'Mesma resposta: a alternativa atual precisa ser igual à oficial.' using errcode = '22023';
    end if;
    if v_temporal in ('NO_CURRENT_VALID_OPTION', 'CURRENTLY_AMBIGUOUS') and v_current is not null then
      raise exception 'Sem alternativa válida ou ambígua: não informe alternativa atual.' using errcode = '22023';
    end if;
    select coalesce(max(version), 0) + 1 into v_version from public.question_update_cards where question_id = u.question_id;
    update public.question_update_cards set status = 'superseded' where question_id = u.question_id and status = 'published';
    insert into public.question_update_cards (question_id, update_id, version, temporal_status, impact_level, official_answer, official_status, official_source, current_answer, what_changed, why_it_matters,
                                              options_affected, sources, effective_date, reviewed_by)
    values (u.question_id, u.id, v_version, v_temporal, p_card ->> 'impact_level', v_official.answer, v_official.answer_status, v_official.source, v_current, btrim(p_card ->> 'what_changed'),
            nullif(btrim(coalesce(p_card ->> 'why_it_matters', '')), ''), coalesce(p_card -> 'options_affected', '[]'::jsonb), v_sources, nullif(p_card ->> 'effective_date', '')::date, (select auth.uid()))
    returning id into v_card;
    update public.question_updates set status = 'reviewed', impact_level = p_card ->> 'impact_level', decision = 'publish_update', decision_note = btrim(p_note), decided_by = (select auth.uid()), decided_at = now(),
           official_answer = v_official.answer, current_answer = v_current where id = p_update_id;
  end if;

  -- a análise só volta a ter atualidade conferida quando NÃO sobra atualização aberta da questão
  select count(*) into v_open from public.question_updates where question_id = u.question_id and status in ('queued', 'analyzing', 'review_required');
  if v_open = 0 then
    update public.question_analysis set temporal_status = v_temporal, current_best_answer = case when p_decision = 'publish_update' then v_current else null end, last_source_check_at = now()
     where question_id = u.question_id and is_current;
  end if;
  perform public.ch_log('question_update.' || p_decision, p_update_id::text, jsonb_build_object('question', u.question_id, 'temporal', v_temporal, 'card', v_card, 'note', btrim(p_note)));
  return jsonb_build_object('status', 'reviewed', 'temporal_status', v_temporal, 'card_id', v_card, 'open_updates', v_open);
end
$$;

-- Primeira conferência de atualidade (sem mudança de fonte): o revisor confirma a análise contra a evidência oficial vigente.
create function public.app_question_confirm_currency(p_question_id text, p_note text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_area text;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  v_area := public.question_area_code(p_question_id);
  if v_area is null then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_is_reviewer(v_area) then raise exception 'A revisão médica desta questão é de um revisor cadastrado na área %.', v_area using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Registre o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if exists (select 1 from public.question_updates where question_id = p_question_id and status in ('queued', 'analyzing', 'review_required')) then
    raise exception 'Há atualização aberta nesta questão: decida-a primeiro.' using errcode = '22023';
  end if;
  if not public.question_evidence_ready(p_question_id) then
    raise exception 'Faltam evidências conferidas por pessoa em fonte oficial vigente para todas as afirmações desta questão.' using errcode = '22023';
  end if;
  update public.question_analysis set temporal_status = 'CURRENT', last_source_check_at = now() where question_id = p_question_id and is_current;
  if not found then raise exception 'A questão ainda não tem análise.' using errcode = 'P0002'; end if;
  perform public.ch_log('question.confirm_currency', p_question_id, jsonb_build_object('note', btrim(p_note)));
  return true;
end
$$;

-- ---------------------------------------------------------------- o aluno: selo, cartão e linha do tempo
-- Selo "Atualizada": só com atualidade conferida por revisor E fonte oficial vigente com evidência conferida por pessoa agora.
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
    'seal', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and a.last_source_check_at is not null and public.question_evidence_ready(a.question_id) then 'UPDATED' end,
    'seal_checked_at', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and public.question_evidence_ready(a.question_id) then a.last_source_check_at end,
    -- nova atualização em revisão: a conduta mostrada segue a última versão revisada
    'update_in_review', exists (select 1 from public.question_updates u where u.question_id = a.question_id and u.status in ('queued', 'analyzing', 'review_required')),
    'update_card', (select jsonb_build_object('version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level, 'official_answer', k.official_answer, 'official_status', k.official_status,
                      'official_source', k.official_source, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'why_it_matters', k.why_it_matters, 'options_affected', k.options_affected,
                      'sources', k.sources, 'effective_date', k.effective_date, 'verified_at', k.verified_at)
                    from public.question_update_cards k where k.question_id = a.question_id and k.status = 'published'))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and public.question_viewable(a.question_id)
$$;

-- Linha do tempo: o aluno vê só o que é público (gabarito oficial, análise publicada, cartões); a equipe vê também edições e alertas.
create function public.app_question_timeline(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_staff boolean := public.is_staff() or public.ch_is_reviewer();
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.question_viewable(p_question_id) then return '[]'::jsonb; end if;
  if not exists (select 1 from public.question_analysis where question_id = p_question_id and status = 'published') and not v_staff then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(e.ev order by e.at, e.ord) from (
    select o.recorded_at as at, 1 as ord, jsonb_build_object('type', 'OFFICIAL_ANSWER', 'at', o.recorded_at, 'version', o.version, 'answer', o.answer, 'status', o.answer_status, 'source', o.source, 'published_at', o.published_at) as ev
      from public.question_official_answers o where o.question_id = p_question_id
    union all
    select a.reviewed_at, 2, jsonb_build_object('type', 'ANALYSIS_PUBLISHED', 'at', a.reviewed_at, 'version', a.version)
      from public.question_analysis a where a.question_id = p_question_id and a.status = 'published' and a.reviewed_at is not null
    union all
    select k.verified_at, 3, jsonb_build_object('type', 'UPDATE_CARD', 'at', k.verified_at, 'version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level,
             'official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'superseded', k.status = 'superseded')
      from public.question_update_cards k where k.question_id = p_question_id
    union all
    select u.detected_at, 4, jsonb_build_object('type', 'SOURCE_CHANGE_DETECTED', 'at', u.detected_at, 'impact_level', u.impact_level, 'status', u.status, 'critical', u.critical, 'triage_kind', u.triage_kind, 'reason', u.reason)
      from public.question_updates u where v_staff and u.question_id = p_question_id
    union all
    select l.changed_at, 5, jsonb_build_object('type', 'QUESTION_EDITED', 'at', l.changed_at, 'reason', l.reason, 'fields', (select jsonb_agg(k) from jsonb_object_keys(l.changes) k))
      from public.question_change_log l where v_staff and l.question_id = p_question_id) e), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- painel: acrescenta propostas aguardando revisão
create or replace function public.app_question_update_summary() returns jsonb
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
    'by_impact', coalesce((select jsonb_object_agg(x.impact_level, x.n) from (select impact_level, count(distinct question_id)::int n from public.question_updates where status in ('queued', 'analyzing', 'review_required') group by impact_level) x), '{}'::jsonb),
    'critical_open', (select count(distinct question_id)::int from public.question_updates where critical and status in ('queued', 'analyzing', 'review_required')),
    'with_content_diff', (select count(distinct question_id)::int from public.question_updates where diff_id is not null),
    'with_proposal', (select count(distinct question_id)::int from public.question_updates where proposal is not null and status = 'review_required'),
    'cards_published', (select count(*)::int from public.question_update_cards where status = 'published'));
end
$$;

do $revoke$
begin
  revoke execute on function public.question_viewable(text) from public, anon, authenticated;
  revoke execute on function public.question_evidence_ready(text) from public, anon, authenticated;
  revoke execute on function public.question_update_cards_guard() from public, anon, authenticated;
  revoke execute on function public.ch_worker_updates_for_reanalysis(integer) from public, anon, authenticated;
  revoke execute on function public.ch_worker_save_reanalysis(text, uuid[], jsonb, jsonb, jsonb) from public, anon, authenticated;
  revoke execute on function public.app_question_updates_queue(text, integer, integer) from public, anon;
  revoke execute on function public.app_question_update_decide(uuid, text, text, jsonb) from public, anon;
  revoke execute on function public.app_question_confirm_currency(text, text) from public, anon;
  revoke execute on function public.app_question_timeline(text) from public, anon;
  revoke execute on function public.app_question_update_summary() from public, anon;
  revoke execute on function public.app_question_commentary(text, text) from public, anon;
end
$revoke$;
