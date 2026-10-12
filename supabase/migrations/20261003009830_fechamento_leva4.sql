-- =============================================================================
-- LEVA 4, FECHAMENTO: junta as regras que as migrações 9800/9801 (Questões StaziaMed), 9810 (Análise e conferência pedidas pela tela)
-- e 9820 (atualidade das fontes) definiram CADA UMA por conta própria para as mesmas funções. Colar 9800, 9801, 9810, 9820 e depois ESTA,
-- nessa ordem (a pasta do dono já vem assim). Pode ser colada quantas vezes quiser.
--
-- Por que existe: 9800 e 9810 redefinem as mesmas funções de rascunho (app_draft_questions, app_draft_question_decide) e a restrição
-- ch_jobs_step_check, partindo de versões antigas diferentes. Sem este arquivo, a última colada apagaria as regras da outra e ainda
-- ficariam DUAS versões de cada função com o mesmo nome (a de 9800 e a de 9810), o que confunde a chamada pela API.
--
-- O que fica valendo (corpo final):
--   * ch_jobs_step_check: união de tudo o que já existe + as etapas de todas as frentes (inclui question_analysis e draft_check);
--   * app_draft_question_decide(id, decisão, nota, hash, conferi_fontes): a da 9800 (revisor da área, texto visto, bloqueios, "conferi as
--     fontes", observação se a revisão adversarial reprovou) + a TRAVA DA LINHA (for update) e a EVIDÊNCIA POSITIVA de fonte oficial da 9810.
--     Só existe esta versão (a de 3 parâmetros da 9810 e a de 3 da 1800 saem);
--   * ch_draft_official_evidence: a da 9810 E, além disso, citação no formato novo apontando para trecho de fonte oficial vigente (9800).
--     Rascunho antigo (os 200 do gerador antigo, que citam apostila) fica sem poder aprovar até haver fonte oficial;
--   * app_draft_questions: filtros e contagens da 9800 (origem, tema, bloqueada, semelhança, publicadas, recolhidas, gabarito publicado,
--     acervo) + selo de triagem, filtro/ordem por selo e escopo por área do revisor da 9810. Só existe esta versão (11 parâmetros);
--   * app_draft_question_detail: o da 9800, e o revisor médico só abre rascunho das áreas dele (como já era na lista);
--   * ch_qa_pick e ch_worker_questions_for_analysis_ids (pedidos de análise da 9810): só questões OFICIAIS (regra da 9801: a Questão
--     StaziaMed nunca entra em análise de prova oficial).
-- Triagem (ch_draft_triage), escopo (ch_draft_scope) e o resto da 9810 ficam como estão.
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.draft_approval_blockers(uuid)') is null or to_regprocedure('public.draft_has_official_sources(public.draft_questions)') is null then
    raise exception 'Cole antes a migração 9800 (Questões StaziaMed).';
  end if;
  if to_regprocedure('public.ch_draft_triage(uuid)') is null or to_regprocedure('public.ch_draft_scope()') is null then
    raise exception 'Cole antes a migração 9810 (Análise e conferência pedidas pela tela).';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'origin') then
    raise exception 'Cole antes a migração 9801 (Questões StaziaMed: parte do aluno).';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- fila: etapas (união)
do $steps$
declare
  v_def text;
  v_steps text[] := array['extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index',
                          'visual_render', 'station_pages', 'station_segment', 'station_draft', 'question_generate', 'question_check',
                          'question_source', 'source_search', 'question_analysis', 'draft_check'];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.ch_jobs'::regclass and c.conname = 'ch_jobs_step_check';
  if v_def is not null then
    v_steps := v_steps || array(select m[1] from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m);
  end if;
  v_steps := array(select distinct s from unnest(v_steps) as s order by s);
  alter table public.ch_jobs drop constraint if exists ch_jobs_step_check;
  execute format('alter table public.ch_jobs add constraint ch_jobs_step_check check (step in (%s))',
                 (select string_agg(quote_literal(s), ', ') from unnest(v_steps) as s));
end
$steps$;

-- ---------------------------------------------------------------- evidência de fonte oficial (9810 + 9800)
create or replace function public.ch_draft_official_evidence(p_draft_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_src text;
  v_cite boolean;
  v_ok boolean;
begin
  select * into d from public.draft_questions where id = p_draft_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'Rascunho não encontrado.'); end if;
  select c.verdict into v_src from public.draft_checks c where c.draft_id = d.id and c.layer = 'sources' and c.content_hash = d.content_hash;
  v_cite := exists (select 1
                      from jsonb_array_elements(case when jsonb_typeof(d.source_citations) = 'array' then d.source_citations else '[]'::jsonb end) cit
                      join public.ch_sources s on s.title = cit ->> 'source_file'
                     where s.authority_level in ('A', 'B', 'C', 'D') and s.status = 'current' and s.kind = 'final');
  -- (9810) conferência "Fontes" sem problemas para o texto atual, ou sem essa conferência e citando fonte oficial vigente;
  -- (9800) E o rascunho cita trecho de fonte oficial vigente no formato novo, com a citação literal no trecho
  v_ok := (coalesce(v_src = 'pass', false) or (v_src is null and v_cite)) and public.draft_has_official_sources(d);
  return jsonb_build_object('ok', v_ok, 'source_check', v_src, 'cites_official', v_cite,
    'reason', case when v_ok then null
                   else 'Sem fonte oficial (nível A a D) comprovada para a afirmação central: a aprovação fica bloqueada até haver o documento oficial cadastrado e conferido.' end);
end
$$;
revoke execute on function public.ch_draft_official_evidence(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- decisão (9800 + 9810)
drop function if exists public.app_draft_question_decide(uuid, text, text);
create or replace function public.app_draft_question_decide(p_id uuid, p_decision text, p_note text default null, p_hash text default null, p_sources_checked boolean default false) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_block text[];
  v_ev jsonb;
  v_redteam text;
  v_currency text;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  -- linha travada durante a decisão: a conferência, o texto e o gravar valem para o mesmo conteúdo
  select * into d from public.draft_questions where id = p_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_is_reviewer(d.area) then
    raise exception 'A revisão médica desta questão é de um revisor cadastrado na área %.', d.area using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'needs_changes', 'rejected') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if p_decision <> 'approved' and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Explique o motivo para pedir ajustes ou recusar.' using errcode = '22023';
  end if;
  if (p_decision = 'approved' or p_hash is not null) and p_hash is distinct from d.content_hash then
    raise exception 'O texto mudou depois que você abriu: confira de novo.' using errcode = '40001';
  end if;
  if p_decision = 'approved' then
    v_block := public.draft_approval_blockers(d.id);
    if cardinality(v_block) > 0 then raise exception 'Não aprova: %', array_to_string(v_block, ' · ') using errcode = '22023'; end if;
    v_ev := public.ch_draft_official_evidence(d.id);
    if not (v_ev ->> 'ok')::boolean then
      raise exception 'Aprovação bloqueada: este rascunho não tem fonte oficial (nível A a D) comprovada para a afirmação central. Cadastre o documento oficial em Fontes oficiais e peça a conferência de novo, ou peça ajustes.' using errcode = '22023';
    end if;
    if not coalesce(p_sources_checked, false) then raise exception 'Marque "Conferi as fontes citadas".' using errcode = '22023'; end if;
    select verdict into v_redteam from public.draft_checks where draft_id = d.id and layer = 'redteam' and content_hash = d.content_hash;
    select verdict into v_currency from public.draft_checks where draft_id = d.id and layer = 'currency' and content_hash = d.content_hash;
    if (v_redteam = 'fail' or v_currency = 'inconclusive') and char_length(btrim(coalesce(p_note, ''))) = 0 then
      raise exception 'Explique na observação por que aprova apesar da revisão adversarial reprovada ou da atualidade inconclusiva.' using errcode = '22023';
    end if;
  end if;
  update public.draft_questions set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(),
         review_note = nullif(btrim(p_note), ''), reviewed_hash = d.content_hash where id = p_id;
  perform public.draft_event(d.id, 'decisao', nullif(btrim(p_note), ''), null, jsonb_build_object('decisao', p_decision));
  perform public.ch_log('draft_question.' || p_decision, p_id::text, jsonb_build_object('hash', d.content_hash));
  return true;
end
$$;
revoke execute on function public.app_draft_question_decide(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.app_draft_question_decide(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- lista (9800 + 9810)
drop function if exists public.app_draft_questions(text, text, text, integer, integer);
drop function if exists public.app_draft_questions(text, text, text, integer, integer, text, text);
drop function if exists public.app_draft_questions(text, text, text, integer, integer, text, text, boolean, numeric);
create or replace function public.app_draft_questions(
  p_batch text default null, p_status text default null, p_area text default null, p_limit integer default 30, p_offset integer default 0,
  p_origin text default null, p_topic text default null, p_blocked boolean default null, p_min_similarity numeric default null,
  p_triage text default null, p_order text default null
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f_all constant jsonb := jsonb_strip_nulls(jsonb_build_object('batch', p_batch, 'area', p_area, 'origin', p_origin, 'topic', p_topic, 'blocked', p_blocked, 'min_similarity', p_min_similarity));
  f jsonb := f_all || case when p_status is null then '{}'::jsonb else jsonb_build_object('status', p_status) end;
  v_scope text[];
begin
  perform public.ch_assert_staff();
  v_scope := public.ch_draft_scope(); -- nulo = equipe vê tudo; revisor médico só as áreas dele
  if p_triage is not null and p_triage not in ('nao_conferida', 'reprovada', 'sem_fonte', 'com_apontamentos', 'so_regras', 'sem_apontamentos') then
    raise exception 'Selo de triagem inválido.' using errcode = '22023';
  end if;
  if p_order is not null and p_order not in ('problematicos', 'limpos') then
    raise exception 'Ordem inválida.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'batches', (select coalesce(jsonb_agg(x order by x ->> 'batch'), '[]'::jsonb) from (
        select jsonb_build_object('batch', b.batch, 'total', count(*)::int,
          'awaiting', count(*) filter (where b.st = 'awaiting_medical_review')::int,
          'approved', count(*) filter (where b.st = 'approved')::int,
          'published', count(*) filter (where b.st = 'published')::int,
          'retired', count(*) filter (where b.st = 'retired')::int,
          'needs_changes', count(*) filter (where b.st = 'needs_changes')::int,
          'rejected', count(*) filter (where b.st = 'rejected')::int) as x
        from (select d.batch, public.draft_situation(d) as st from public.draft_questions d where v_scope is null or d.area = any (v_scope)) b group by b.batch) b),
    'checks', (select coalesce(jsonb_object_agg(layer, v), '{}'::jsonb) from (
        select c.layer, jsonb_object_agg(c.verdict, c.n) as v from (
          select c.layer, c.verdict, count(*)::int as n from public.draft_checks c
          join public.draft_questions d on d.id = c.draft_id and d.content_hash = c.content_hash
          where (p_batch is null or d.batch = p_batch) and (v_scope is null or d.area = any (v_scope)) group by c.layer, c.verdict) c group by c.layer) t),
    'triage_counts', (select coalesce(jsonb_object_agg(t.code, t.n), '{}'::jsonb) from (
        select tr ->> 'code' as code, count(*)::int as n
          from public.draft_questions d, lateral public.ch_draft_triage(d.id) tr
         where public.draft_matches_filters(d, f) and (v_scope is null or d.area = any (v_scope))
         group by tr ->> 'code') t),
    'total', (select count(*)::int from public.draft_questions d
              where public.draft_matches_filters(d, f) and (v_scope is null or d.area = any (v_scope))
                and (p_triage is null or public.ch_draft_triage(d.id) ->> 'code' = p_triage)),
    'counts', (select jsonb_build_object(
        'awaiting_medical_review', count(*) filter (where s = 'awaiting_medical_review')::int,
        'needs_changes', count(*) filter (where s = 'needs_changes')::int,
        'approved', count(*) filter (where s = 'approved')::int,
        'published', count(*) filter (where s = 'published')::int,
        'retired', count(*) filter (where s = 'retired')::int,
        'rejected', count(*) filter (where s = 'rejected')::int,
        'blocked', count(*) filter (where blocked)::int,
        'stale', count(*) filter (where stale)::int)
      from (select public.draft_situation(d) as s, not public.draft_has_official_sources(d) as blocked, cardinality(public.draft_stale_sources(d)) > 0 as stale
            from public.draft_questions d where public.draft_matches_filters(d, f_all) and (v_scope is null or d.area = any (v_scope))) z),
    'answer_distribution', (select jsonb_build_object('A', count(*) filter (where q.correct_option = 'A')::int, 'B', count(*) filter (where q.correct_option = 'B')::int,
                                                       'C', count(*) filter (where q.correct_option = 'C')::int, 'D', count(*) filter (where q.correct_option = 'D')::int)
                            from public.questions q where q.origin = 'staziamed' and q.retired_at is null),
    'acervo', public.staziamed_acervo(),
    'items', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object(
        'situacao', public.draft_situation(d),
        'can_review', public.ch_is_reviewer(d.area),
        'can_edit', public.is_staff(),
        'can_publish', public.is_admin(),
        'reviewer', (select email from auth.users where id = d.reviewed_by),
        'review_outdated', d.reviewed_hash is not null and d.reviewed_hash <> d.content_hash,
        'blocked_no_source', not public.draft_has_official_sources(d),
        'triage', tr ->> 'code',
        'triage_rank', (tr ->> 'rank')::int,
        'triage_blocked', (tr ->> 'blocked')::boolean,
        'triage_reason', tr ->> 'reason',
        'stale_sources', to_jsonb(public.draft_stale_sources(d)),
        'approval_blockers', to_jsonb(public.draft_approval_blockers(d.id)),
        'question', (select jsonb_build_object('id', q.id, 'code', q.code, 'number', q.number, 'retired_at', q.retired_at) from public.questions q where q.id = d.question_id),
        'checks', (select coalesce(jsonb_object_agg(c.layer, jsonb_build_object('verdict', c.verdict, 'findings', c.findings, 'model', c.model,
                     'checked_at', c.checked_at, 'current', c.content_hash = d.content_hash)), '{}'::jsonb)
                   from public.draft_checks c where c.draft_id = d.id))
        order by case p_order when 'problematicos' then (tr ->> 'rank')::int when 'limpos' then -(tr ->> 'rank')::int else 0 end, d.batch, d.slot)
      from (select * from public.draft_questions dq
             where public.draft_matches_filters(dq, f) and (v_scope is null or dq.area = any (v_scope))
               and (p_triage is null or public.ch_draft_triage(dq.id) ->> 'code' = p_triage)
             order by case p_order when 'problematicos' then (public.ch_draft_triage(dq.id) ->> 'rank')::int
                                   when 'limpos' then -(public.ch_draft_triage(dq.id) ->> 'rank')::int else 0 end, dq.batch, dq.slot
             limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) d,
           lateral public.ch_draft_triage(d.id) tr), '[]'::jsonb));
end
$$;
revoke execute on function public.app_draft_questions(text, text, text, integer, integer, text, text, boolean, numeric, text, text) from public, anon;
grant execute on function public.app_draft_questions(text, text, text, integer, integer, text, text, boolean, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------- rascunho aberto (9800 + escopo da 9810)
create or replace function public.app_draft_question_detail(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_scope text[];
begin
  perform public.ch_assert_staff();
  v_scope := public.ch_draft_scope();
  select * into d from public.draft_questions where id = p_id;
  if not found or (v_scope is not null and not (d.area = any (v_scope))) then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'draft', to_jsonb(d),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at, 'actor_email', (select u.email from auth.users u where u.id = e.actor_id),
                          'content_hash', e.content_hash, 'note', e.note, 'previous', e.previous, 'details', e.details) order by e.at, e.id)
                        from public.draft_question_events e where e.draft_id = d.id), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'created_at', s.created_at, 'state', s.state, 'complete', s.complete, 'claims', s.claims,
                          'current', s.content_hash = d.content_hash) order by s.created_at desc, s.id)
                           from public.draft_source_proposals s where s.draft_id = d.id), '[]'::jsonb),
    'similar_question', (select jsonb_build_object('id', q.id, 'code', q.code, 'exam_label', e.title, 'statement', q.statement,
                           'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o))
                         from public.questions q join public.exams e on e.id = q.exam_id where q.id = d.similar_question_id),
    'request', (select to_jsonb(r) - 'slots' from public.staziamed_requests r where r.id = d.request_id));
end
$$;
revoke execute on function public.app_draft_question_detail(uuid) from public, anon;
grant execute on function public.app_draft_question_detail(uuid) to authenticated;

-- ---------------------------------------------------------------- pedidos de análise: só questões oficiais (regra da 9801)
create or replace function public.ch_qa_pick(p_exam text, p_area text, p_areas text[], p_only_missing boolean, p_limit integer)
  returns table (id text, exam_id text, number integer, area text, chars integer)
  language sql stable security definer set search_path = ''
as $$
  select q.id, q.exam_id, q.number::int, public.question_area_code(q.id),
         (char_length(q.statement) + char_length(q.options::text) + 300)::int
    from public.questions q
   where q.origin = 'official' and q.status <> 'annulled' and q.correct_option is not null
     and (p_exam is null or q.exam_id = p_exam)
     and (p_area is null or public.question_area_code(q.id) = p_area)
     and (p_areas is null or public.question_area_code(q.id) = any (p_areas))
     and not exists (select 1 from public.question_analysis a
                      where a.question_id = q.id and a.is_current and a.status in ('published', 'reviewed'))
     and (not coalesce(p_only_missing, true)
          or not exists (select 1 from public.question_analysis a
                          where a.question_id = q.id and a.is_current
                            and a.basis_hash = public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option))))
   order by q.exam_id, q.number
   limit p_limit
$$;
revoke execute on function public.ch_qa_pick(text, text, text[], boolean, integer) from public, anon, authenticated;

create or replace function public.ch_worker_questions_for_analysis_ids(p_ids text[], p_only_missing boolean default true) returns jsonb
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
    where q.id = any (p_ids) and q.origin = 'official' and q.status <> 'annulled' and q.correct_option is not null
      and not exists (select 1 from public.question_analysis a where a.question_id = q.id and a.is_current and a.status in ('published', 'reviewed'))
      and (not coalesce(p_only_missing, true)
           or not exists (select 1 from public.question_analysis a where a.question_id = q.id and a.is_current
                            and a.basis_hash = public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option))))
    order by q.exam_id, q.number) x
$$;
revoke execute on function public.ch_worker_questions_for_analysis_ids(text[], boolean) from public, anon, authenticated;
