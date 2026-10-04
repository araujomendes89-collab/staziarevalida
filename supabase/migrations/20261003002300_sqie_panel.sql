-- Painel do revisor: a lista de análises passa a trazer o enunciado e as alternativas da questão
-- (só equipe e revisores acessam esta função; o aluno nunca a chama).
create or replace function public.app_question_analyses(p_status text default null, p_exam text default null, p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
        'questions', (select count(*)::int from public.questions where status <> 'annulled'),
        'analyzed', (select count(*)::int from public.question_analysis where is_current),
        'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*)::int n from public.question_analysis where is_current group by status) s), '{}'::jsonb))),
    'total', (select count(*)::int from public.question_analysis a2 where a2.is_current and (p_status is null or a2.status = p_status)
              and (p_exam is null or exists (select 1 from public.questions q2 where q2.id = a2.question_id and q2.exam_id = p_exam))),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.year, e.semester) from public.exams e), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('analysis_id', a.id, 'question_id', a.question_id, 'code', q.code, 'exam_id', q.exam_id, 'number', q.number, 'area', public.question_area_code(q.id),
          'statement', q.statement, 'question_options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
          'images', q.images,
          'version', a.version, 'status', a.status, 'temporal_status', a.temporal_status, 'difficulty', a.difficulty, 'question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
          'key_data', a.key_data, 'pedagogy', a.pedagogy, 'official_answer', (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current),
          'official_status', (select o.answer_status from public.question_official_answers o where o.question_id = q.id and o.is_current),
          'model', a.generated_by_model, 'analysis_date', a.analysis_date, 'reviewed_at', a.reviewed_at, 'review_note', a.review_note,
          'can_review', public.ch_is_reviewer(public.question_area_code(q.id)),
          'stale', a.basis_hash <> public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)),
          'options', (select jsonb_agg(to_jsonb(x) - 'analysis_id' - 'id' order by x.option_id) from public.question_option_analysis x where x.analysis_id = a.id),
          'checks', coalesce((select jsonb_agg(jsonb_build_object('layer', c.layer, 'verdict', c.verdict, 'findings', c.findings, 'model', c.model)) from public.question_analysis_checks c where c.analysis_id = a.id), '[]'::jsonb))
        order by q.exam_id, q.number)
      from (select * from public.question_analysis a2 where a2.is_current and (p_status is null or a2.status = p_status)
              and (p_exam is null or exists (select 1 from public.questions q2 where q2.id = a2.question_id and q2.exam_id = p_exam))
            order by a2.question_id limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) a
      join public.questions q on q.id = a.question_id), '[]'::jsonb));
end
$$;

-- A simulação de IA (só desenvolvimento e testes) nunca pode chegar ao aluno.
create or replace function public.app_question_analysis_decide(p_analysis_id uuid, p_decision text, p_note text default null) returns boolean
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
  if p_decision = 'approved' then
    if not a.is_current then raise exception 'Só a versão atual da análise pode ser aprovada.' using errcode = '22023'; end if;
    if coalesce(a.generated_by_model, '') like 'mock%' then
      raise exception 'Análise criada pela simulação de desenvolvimento (não é IA nem revisão): não pode ser publicada.' using errcode = '22023';
    end if;
    if a.basis_hash <> (select public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)) from public.questions q where q.id = a.question_id) then
      raise exception 'A questão mudou depois desta análise: gere a análise de novo.' using errcode = '22023';
    end if;
    if exists (select 1 from public.question_analysis_checks c where c.analysis_id = a.id and c.verdict = 'fail') then
      raise exception 'A análise foi reprovada em uma conferência: corrija ou gere de novo antes de aprovar.' using errcode = '22023';
    end if;
  end if;
  update public.question_analysis set status = case p_decision when 'approved' then 'published' else 'rejected' end, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_analysis_id;
  update public.question_comments set status = case p_decision when 'approved' then 'published' else 'rejected' end, published_at = case when p_decision = 'approved' then now() end where analysis_id = p_analysis_id;
  perform public.ch_log('question_analysis.' || p_decision, p_analysis_id::text, jsonb_build_object('question', a.question_id));
  return true;
end
$$;
