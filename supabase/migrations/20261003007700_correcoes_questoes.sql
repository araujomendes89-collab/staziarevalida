-- =============================================================================
-- Correções da aba Questões da Administração (Q01 a Q05), decididas pelo dono como "Fazer agora".
-- Questão salva vai direto ao aluno: nada aqui apaga conteúdo gravado sem que a pessoa veja antes.
--
--   Q01  "Nova questão" com a mesma prova e número de uma já gravada é recusada ("Essa questão já existe: abra-a para
--        editar."); antes gravava por cima (texto, alternativas, gabarito e comentários).
--   Q02  Gabarito e situação de questão já gravada não mudam pelo salvar nem pela importação, para ninguém. O caminho é
--        o registro do gabarito oficial (app_admin_set_official_answer, só administrador), agora com fonte E motivo
--        obrigatórios. Quando a letra muda, as respostas antigas dos alunos daquela questão são recorrigidas
--        (question_attempts.is_correct). Quando o gabarito muda (outra letra, ou a questão é anulada ou deixa de ser):
--          - as explicações escritas para o gabarito antigo ficam marcadas para revisão (questions.explanations_review)
--            e o aluno não as vê, nem na correção nem no Tutor, até a equipe marcar como revisadas
--            (app_admin_question_review_done); anular marca todas as preenchidas;
--          - a análise publicada (SQIE) e o cartão de atualização feitos para o gabarito antigo saem do aluno (correção,
--            Tutor e diagnóstico do erro) até haver nova análise; em questão anulada, a análise não sai.
--   Q03  Importar com "atualizar as que já existem" só troca os campos que vieram preenchidos; nunca gabarito nem
--        situação (a linha com gabarito ou situação diferente não muda nada e é contada à parte; anulada dos dois lados
--        não é diferença); "cita figura" só troca com a coluna imagem preenchida no arquivo. A prévia
--        (app_admin_import_preview) diz antes quantas são novas, quantas perderiam comentário e quantas têm gabarito
--        diferente, sem gravar nada.
--   Q04  Questão anulada sem gabarito numa sessão em andamento não trava o simulado nem o treino: a resposta é aceita
--        (is_correct falso, como a coluna exige) e a anulada não conta como acerto nem erro no resultado.
--   Q05  A correção diz que a questão foi anulada ('annulled'): a tela mostra "Questão anulada pela banca".
--
-- Funções redefinidas (cada uma a partir da versão mais nova):
--   grade_question_attempt (…0300), practice_correction_view (…1900), practice_result e app_recent_sessions (…4300),
--   app_admin_questions, app_admin_question e app_admin_import_questions (…1300), app_admin_save_question (…6100),
--   app_admin_set_official_answer (…2200; ganha p_reason, por isso é apagada e criada de novo),
--   app_question_commentary (…2800), tutor_truth (…3500), student_chosen_option_analysis (…2700).
-- Novas: question_analysis_fits, admin_import_answer_differs, admin_import_answer_label, admin_import_comment_loss,
--   admin_import_merge_options, admin_import_merge_question (internas), app_admin_import_preview e
--   app_admin_question_review_done (equipe).
-- =============================================================================

-- ---------------------------------------------------------------- marca "explicações a revisar" (Q02)
-- Nulo = nada a revisar. Quando o gabarito oficial troca a letra: {de, para, campos, desde, por, motivo, fonte}.
-- campos: explanation_<letra> (a da antiga correta e a da nova), expected_conduct e analise (a análise publicada).
-- O aluno não lê esta coluna (as colunas liberadas ao aluno foram listadas na …1900).
alter table public.questions add column explanations_review jsonb;

-- ---------------------------------------------------------------- correção automática da resposta (Q04; corpo da …0300)
-- Questão anulada sem gabarito: a comparação dá nulo e a coluna não aceita nulo, o que travava o simulado e o treino.
-- Agora vale falso; a anulada fica fora dos números do aluno (Início, caderno de erros, desempenho) e do resultado da sessão.
create or replace function public.grade_question_attempt() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  select coalesce(q.correct_option = new.selected_option, false) into new.is_correct
  from public.questions q where q.id = new.question_id;
  new.is_correct := coalesce(new.is_correct, false);
  new.answered_at := clock_timestamp();  -- horário real de cada resposta (now() é fixo na transação)
  return new;
end
$$;

-- ---------------------------------------------------------------- correção para o aluno (Q02, Q04, Q05; corpo da …1900)
-- Mais três coisas:
--   annulled   a questão foi anulada pela banca; is_correct fica nulo (não é acerto nem erro);
--   in_review  há explicação marcada para revisão depois da troca de gabarito;
--   as explicações marcadas (e a conduta esperada, se marcada) não saem até a revisão.
create or replace function public.practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'is_correct', case when p_selected is null or q.status = 'annulled' then null else p_selected = q.correct_option::text end,
    'correct_option', q.correct_option,
    'annulled', q.status = 'annulled',
    'in_review', cardinality(h.campos) > 0,
    'topic', q.topic,
    'subtopic', q.subtopic,
    'explanation', (select nullif(btrim(o ->> 'explanation'), '')
                    from jsonb_array_elements(q.options) o
                    where o ->> 'id' = q.correct_option::text and not ('explanation_' || (o ->> 'id')) = any (h.campos)),
    'option_notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'explanation')) order by o ->> 'id')
      from jsonb_array_elements(q.options) o
      where o ->> 'id' <> q.correct_option::text and nullif(btrim(o ->> 'explanation'), '') is not null
        and not ('explanation_' || (o ->> 'id')) = any (h.campos)
    ), '[]'::jsonb),
    'expected_conduct', case when 'expected_conduct' = any (h.campos) then null else q.expected_conduct end,
    'inep_intent', q.inep_intent,
    'sources', q.sources
  )
  from public.questions q
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb))), '{}'::text[]) as campos
  ) h
  where q.id = p_question_id
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;

-- ---------------------------------------------------------------- placar da sessão (Q04; corpo da …4300)
-- Questão anulada não entra em total, respondidas, acertos nem por área; vem à parte em "annulled".
-- O tempo respondendo continua contando todas (o aluno gastou aquele tempo).
create or replace function public.practice_result(p_session_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  with s as (
    select * from public.practice_sessions where id = p_session_id
  ),
  every_question as (
    select q.area, q.status = 'annulled' as annulled, a.id is not null as answered, coalesce(a.is_correct, false) as correct, coalesce(a.active_ms, 0) as ms
    from s
    cross join lateral unnest(s.question_ids) as u (question_id)
    join public.questions q on q.id = u.question_id
    left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
  ),
  answered as (
    select * from every_question where not annulled
  )
  select jsonb_build_object(
    'total', (select count(*)::int from answered),
    'answered', (select count(*)::int from answered where answered),
    'correct', (select count(*)::int from answered where correct),
    'annulled', (select count(*)::int from every_question where annulled),
    'active_seconds', (select (coalesce(sum(ms), 0) / 1000)::int from every_question),
    'elapsed_seconds', (select greatest(extract(epoch from (coalesce(s.finished_at, now()) - s.started_at))
                                        - s.paused_ms / 1000.0
                                        - case when s.paused_at is null then 0
                                               else extract(epoch from (coalesce(s.finished_at, now()) - s.paused_at)) end, 0)::int
                        from s),
    'paused_seconds', (select (s.paused_ms / 1000)::int from s),
    'by_area', coalesce((
      select jsonb_agg(jsonb_build_object('area', x.area, 'total', x.total, 'answered', x.answered, 'correct', x.correct) order by x.area)
      from (
        select area, count(*)::int as total, count(*) filter (where answered)::int as answered,
               count(*) filter (where correct)::int as correct
        from answered group by area
      ) x
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------- histórico de sessões (Q04; corpo da …4300)
-- Sessão encerrada: "respondidas" não conta as anuladas, e "annulled" diz quantas anuladas a sessão tem (a tela tira
-- essas do total do simulado). Sessão em aberto: igual a antes (é o andamento do aluno).
create or replace function public.app_recent_sessions(p_kind text default null, p_limit integer default 5) returns jsonb
  language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.started_at desc), '[]'::jsonb)
  from (
    select s.started_at,
           jsonb_build_object(
             'id', s.id,
             'kind', s.kind,
             'started_at', s.started_at,
             'finished_at', s.finished_at,
             'time_limit_seconds', s.time_limit_seconds,
             'paused', s.finished_at is null and s.paused_at is not null,
             'expired', s.finished_at is null and s.time_limit_seconds is not null and s.paused_at is null
                        and now() > public.practice_deadline(s),
             'remaining_seconds', case when s.finished_at is null and s.time_limit_seconds is not null
                                       then greatest(ceil(extract(epoch from public.practice_deadline(s) - now())), 0)::int end,
             'total', cardinality(s.question_ids),
             'answered', n.answered,
             'correct', case when s.finished_at is null and s.kind = 'simulado' then null else n.correct end,
             'annulled', n.annulled,
             'filters', s.config -> 'filters'
           ) as item
    from public.practice_sessions s
    cross join lateral (
      select case when s.finished_at is null and s.kind = 'simulado'
                  then (select count(*)::int from jsonb_object_keys(s.answers))
                  when s.finished_at is null
                  then (select count(*)::int from public.question_attempts a where a.session_id = s.id)
                  else (select count(*)::int from public.question_attempts a join public.questions q on q.id = a.question_id
                        where a.session_id = s.id and q.status <> 'annulled') end as answered,
             (select count(*)::int from public.question_attempts a join public.questions q on q.id = a.question_id
              where a.session_id = s.id and a.is_correct and q.status <> 'annulled') as correct,
             (select count(*)::int from unnest(s.question_ids) u (question_id) join public.questions q on q.id = u.question_id
              where q.status = 'annulled') as annulled,
             exists (select 1 from public.question_attempts a where a.session_id = s.id) as attempted
    ) n
    where s.user_id = (select auth.uid())
      and (p_kind is null or s.kind = p_kind)
      and (s.finished_at is null or n.attempted)
    order by s.started_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
  ) x
$$;

-- ---------------------------------------------------------------- análise que ainda vale para o aluno (Q02)
-- A análise publicada (e o cartão de atualização, que repete o gabarito oficial da prova) só chega ao aluno — correção,
-- Tutor e diagnóstico do erro — quando:
--   - foi feita para o gabarito gravado agora (p_answer = official_answer_at_analysis ou official_answer do cartão; nulo =
--     registro antigo sem o gabarito anotado);
--   - a questão não está anulada (a análise aponta uma alternativa como a correta; o processamento não analisa anulada);
--   - a questão não está marcada com a análise a revisar depois de troca de gabarito (campo "analise").
create function public.question_analysis_fits(p_question_id text, p_answer char(1)) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.questions q
                 where q.id = p_question_id and q.status <> 'annulled'
                   and (p_answer is null or q.correct_option is not distinct from p_answer)
                   and not coalesce(q.explanations_review -> 'campos', '[]'::jsonb) ? 'analise')
$$;
revoke execute on function public.question_analysis_fits(text, char) from public, anon, authenticated;

-- ---------------------------------------------------------------- análise publicada (Q02; corpo da …2800)
-- Mais: só sai a análise que ainda vale para o gabarito atual (question_analysis_fits, acima); ela volta quando houver
-- nova análise aprovada para o gabarito atual. O cartão de atualização feito para outro gabarito também não sai.
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
                    from public.question_update_cards k where k.question_id = a.question_id and k.status = 'published'
                      and public.question_analysis_fits(k.question_id, k.official_answer)))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and public.question_viewable(a.question_id)
    and public.question_analysis_fits(a.question_id, a.official_answer_at_analysis)
$$;

-- ---------------------------------------------------------------- o que o Tutor do aluno recebe da questão (Q02; corpo da …3500)
-- O mesmo cuidado da correção: as explicações e a conduta esperada marcadas para revisão depois da troca de gabarito não
-- vão para o Tutor, nem a análise e o cartão de atualização que não valem mais para o gabarito atual.
create or replace function public.tutor_truth(p_question_id text, p_level text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'area', q.area, 'topic', q.topic, 'subtopic', q.subtopic, 'statement', q.statement,
    'exam', (select x.kind || ' ' || x.year from public.exams x where x.id = q.exam_id), 'number', q.number,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text',
                  'explanation', case when p_level in ('hint', 'full') and not ('explanation_' || (o ->> 'id')) = any (h.campos)
                                      then nullif(btrim(o ->> 'explanation'), '') end) order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'official_answer', case when p_level in ('hint', 'full') then q.correct_option end,
    'expected_conduct', case when p_level in ('hint', 'full') and not 'expected_conduct' = any (h.campos) then q.expected_conduct end,
    'inep_intent', case when p_level in ('hint', 'full') then q.inep_intent end,
    'sources', case when p_level = 'full' and jsonb_array_length(q.sources) > 0 then q.sources end,
    'analysis', case when p_level = 'full' then (select jsonb_build_object('question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
                     'options', (select jsonb_agg(jsonb_build_object('option_id', o.option_id, 'reasoning', o.reasoning, 'why_wrong', o.why_wrong, 'trap', o.trap) order by o.option_id) from public.question_option_analysis o where o.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published'
                     and public.question_analysis_fits(q.id, a.official_answer_at_analysis)) end,
    'update_card', case when p_level = 'full' then (select jsonb_build_object('official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'sources', k.sources)
                   from public.question_update_cards k where k.question_id = q.id and k.status = 'published'
                     and public.question_analysis_fits(q.id, k.official_answer)) end)
  from public.questions q
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb))), '{}'::text[]) as campos
  ) h
  where q.id = p_question_id
$$;
revoke execute on function public.tutor_truth(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- diagnóstico do erro do aluno (Q02; corpo da …2700)
-- A alternativa marcada, segundo a análise publicada e atual: só a análise que ainda vale para o gabarito atual (a
-- "Armadilha" de uma análise feita para o gabarito antigo não sai). Alimenta app_attempt_diagnosis e app_error_profile.
create or replace function public.student_chosen_option_analysis(p_user uuid, p_question_id text, p_option char(1))
  returns table (distractor_kind text, error_types text[], trap text, why_wrong text, concept_difference text)
  language sql stable security definer set search_path = ''
as $$
  select o.distractor_kind, o.error_types, o.trap, o.why_wrong, o.concept_difference
  from public.question_analysis a join public.question_option_analysis o on o.analysis_id = a.id
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and o.option_id = p_option
    and public.question_analysis_fits(a.question_id, a.official_answer_at_analysis)
    and exists (select 1 from public.question_attempts t where t.user_id = p_user and t.question_id = p_question_id)
$$;
revoke execute on function public.student_chosen_option_analysis(uuid, text, char) from public, anon, authenticated;

-- ---------------------------------------------------------------- lista do admin (Q02; corpo da …1300)
-- Mais: cada item diz se tem explicação a revisar, e o filtro "review" mostra só essas.
create or replace function public.app_admin_questions(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_search constant text := nullif(btrim(coalesce(f ->> 'search', '')), '');
begin
  perform public.assert_staff();
  return (
    with matched as (
      select q.* from public.questions q
      where (v_search is null
             or q.code ilike '%' || v_search || '%'
             or q.search @@ websearch_to_tsquery('portuguese', v_search)
             or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, '')) like '%' || public.fold_text(v_search) || '%')
        and (nullif(f ->> 'exam_id', '') is null or q.exam_id = f ->> 'exam_id')
        and (nullif(f ->> 'area', '') is null or q.area::text = f ->> 'area')
        and (nullif(f ->> 'status', '') is null or q.status = f ->> 'status')
        and (coalesce((f ->> 'needs_image')::boolean, false) = false or (q.needs_image and jsonb_array_length(q.images) = 0))
        and (coalesce((f ->> 'review')::boolean, false) = false or q.explanations_review is not null)
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matched),
      'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'question_count', e.question_count)
                                          order by e.year desc, e.semester desc nulls last, e.kind), '[]'::jsonb)
                from public.exams e),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'exam_id', m.exam_id, 'number', m.number, 'area', m.area, 'topic', m.topic,
          'status', m.status, 'needs_image', m.needs_image, 'images', jsonb_array_length(m.images),
          'correct_option', m.correct_option, 'excerpt', left(m.statement, 160), 'updated_at', m.updated_at,
          'explanations_review', m.explanations_review is not null)
          order by m.exam_id desc, m.number)
        from (select * from matched order by exam_id desc, number
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;

-- ---------------------------------------------------------------- questão para o editor (Q02; corpo da …1300)
-- Mais o gabarito oficial atual (versão, situação, fonte), para a tela do registro do gabarito oficial.
create or replace function public.app_admin_question(p_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_staff();
  select to_jsonb(q) - 'search' || jsonb_build_object(
           'exam', (select to_jsonb(e) from public.exams e where e.id = q.exam_id),
           'attempts', (select count(*)::int from public.question_attempts a where a.question_id = q.id),
           'official', (select jsonb_build_object('answer', o.answer, 'answer_status', o.answer_status, 'version', o.version, 'source', o.source,
                                                  'source_url', o.source_url, 'published_at', o.published_at, 'recorded_at', o.recorded_at)
                        from public.question_official_answers o where o.question_id = q.id and o.is_current))
    into v
  from public.questions q where q.id = p_id;
  if v is null then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------- salvar a questão (Q01, Q02; corpo da …6100)
create or replace function public.app_admin_save_question(p_question jsonb, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_problem text;
  v_result text;
  v_id text;
  v_reason text;
  v_old record;
  v_exam text;
begin
  perform public.assert_staff();
  -- B1: o único motivo aceito é o do assistente; nulo ou só espaços = sem motivo
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    v_reason := null;
  elsif p_reason = 'assistente de IA' then
    v_reason := p_reason;
  else
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;
  v_problem := public.admin_question_problem(p_question);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  v_exam := public.admin_exam_id(p_question ->> 'kind', (p_question ->> 'year')::int, nullif(p_question ->> 'semester', '')::int);
  -- trocar prova/número de uma questão existente não é permitido (mudaria o código e o histórico)
  if nullif(p_question ->> 'id', '') is not null then
    select q.id into v_id from public.questions q
    where q.id = p_question ->> 'id' and q.exam_id = v_exam and q.number = (p_question ->> 'number')::int;
    if v_id is null then
      raise exception 'Prova e número de uma questão existente não podem ser alterados.' using errcode = '22023';
    end if;
  end if;
  -- a questão que já existe com essa prova e número (como o admin_upsert_question a acha)
  select q.id, q.correct_option::text as correct_option, q.status into v_old
  from public.questions q where q.exam_id = v_exam and q.number = (p_question ->> 'number')::int
  for update;
  if found then
    -- Q01: "Nova questão" (sem id) nunca grava por cima de uma que já existe
    if nullif(p_question ->> 'id', '') is null then
      raise exception 'Essa questão já existe: abra-a para editar.' using errcode = '22023';
    end if;
    -- Q02: gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial (administrador, com fonte
    -- e motivo); vale para todos, com ou sem o motivo do assistente (substitui a regra B2 da …6100)
    if v_old.correct_option is distinct from nullif(p_question ->> 'correct_option', '')
       or v_old.status is distinct from coalesce(nullif(p_question ->> 'status', ''), 'valid') then
      raise exception 'Gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial (administrador, com fonte e motivo).' using errcode = '22023';
    end if;
  end if;
  -- B3: a trilha (questions_change_trail) lê o motivo de sqie.reason, que vale para a transação inteira; por isso ele é
  -- definido em todo salvamento (vazio quando não há motivo) e não passa de um salvamento para o seguinte
  perform set_config('sqie.reason', coalesce(v_reason, ''), true);
  v_result := public.admin_upsert_question(p_question, true);
  perform public.admin_refresh_exam_counts();
  select q.id into v_id from public.questions q
  where q.exam_id = v_exam and q.number = (p_question ->> 'number')::int;
  -- B4: o gatilho da trilha só roda em atualização; a questão nova salva com o motivo ganha aqui a linha de criação
  if v_result = 'inserted' and v_reason is not null then
    insert into public.question_change_log (question_id, changed_by, reason, changes)
    select q.id, (select auth.uid()), v_reason, jsonb_build_object('criacao', jsonb_build_object('de', null, 'para', q.exam_id || '#' || q.number))
    from public.questions q where q.id = v_id;
  end if;
  perform public.admin_log('question.' || v_result, v_id,
    jsonb_build_object('status', coalesce(nullif(p_question ->> 'status', ''), 'valid'))
      || case when v_reason is null then '{}'::jsonb else jsonb_build_object('reason', v_reason) end);
  return public.app_admin_question(v_id);
end
$$;
-- create or replace mantém os privilégios (…6100 tirou de public e anon); repetido para quem ler só esta migração
revoke execute on function public.app_admin_save_question(jsonb, text) from public, anon;

-- ---------------------------------------------------------------- importação: peças internas (Q03)
-- A linha do arquivo traz gabarito ou situação diferente do gravado (essa linha não muda nada). Anulada dos dois lados
-- não é diferença quando o arquivo não traz outra letra: anular pelo registro oficial guarda a letra antiga, e o arquivo
-- com "ANULADA" vem sem letra.
create function public.admin_import_answer_differs(p_old public.questions, q jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select case when p_old.status = 'annulled' and coalesce(nullif(q ->> 'status', ''), 'valid') = 'annulled'
              then nullif(q ->> 'correct_option', '') is not null and p_old.correct_option::text is distinct from nullif(q ->> 'correct_option', '')
              else p_old.correct_option::text is distinct from nullif(q ->> 'correct_option', '')
                   or p_old.status is distinct from coalesce(nullif(q ->> 'status', ''), 'valid') end
$$;

-- Gabarito e situação como a prévia mostra: "ANULADA", "C (alterada após recurso)" ou só a letra.
create function public.admin_import_answer_label(p_answer text, p_status text) returns text
  language sql immutable set search_path = ''
as $$
  select case when p_status = 'annulled' then 'ANULADA'
              when p_status = 'changed_after_appeal' then coalesce(p_answer, 'sem gabarito') || ' (alterada após recurso)'
              else p_answer end
$$;

-- Atualizar trocaria um comentário gravado (explicação de alternativa, conduta esperada ou o que a questão avalia) por
-- outro texto do arquivo: o texto gravado se perde. Campo vazio no arquivo não conta (não troca nada).
create function public.admin_import_comment_loss(p_old public.questions, q jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select exists (
           select 1 from jsonb_array_elements(q -> 'options') n
           join jsonb_array_elements(p_old.options) o on o ->> 'id' = n ->> 'id'
           where nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null
             and nullif(btrim(coalesce(n ->> 'explanation', '')), '') is not null
             and btrim(o ->> 'explanation') <> btrim(n ->> 'explanation'))
      or (nullif(btrim(coalesce(p_old.expected_conduct, '')), '') is not null
          and nullif(btrim(coalesce(q ->> 'expected_conduct', '')), '') is not null
          and btrim(p_old.expected_conduct) <> btrim(q ->> 'expected_conduct'))
      or (nullif(btrim(coalesce(p_old.inep_intent, '')), '') is not null
          and nullif(btrim(coalesce(q ->> 'inep_intent', '')), '') is not null
          and btrim(p_old.inep_intent) <> btrim(q ->> 'inep_intent'))
$$;

-- Alternativas: o texto vem do arquivo (é obrigatório); a explicação só troca se veio preenchida. O resto da
-- alternativa gravada (se houver outras chaves) fica.
create function public.admin_import_merge_options(p_old jsonb, p_new jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_agg(
           coalesce((select o from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) o where o ->> 'id' = n ->> 'id' limit 1), '{}'::jsonb)
           || jsonb_build_object(
                'id', n ->> 'id',
                'text', btrim(n ->> 'text'),
                'explanation', coalesce(nullif(btrim(coalesce(n ->> 'explanation', '')), ''),
                                        (select o ->> 'explanation' from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) o where o ->> 'id' = n ->> 'id' limit 1),
                                        ''))
           order by n ->> 'id')
  from jsonb_array_elements(p_new) n
$$;

-- Atualiza uma questão que já existe com o que o arquivo trouxe preenchido. Nunca toca gabarito nem situação.
-- "Cita figura" (needs_image) só troca quando o arquivo trouxe a coluna imagem preenchida (needs_image_declared): sem ela,
-- o leitor da planilha manda um palpite tirado do enunciado, que desfaria a marca posta ou tirada à mão pela equipe.
create function public.admin_import_merge_question(p_id text, q jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.questions set
    area = (q ->> 'area')::public.med_area,
    topic = btrim(q ->> 'topic'),
    subtopic = coalesce(nullif(btrim(coalesce(q ->> 'subtopic', '')), ''), subtopic),
    specialty = coalesce(nullif(btrim(coalesce(q ->> 'specialty', '')), ''), specialty),
    statement = btrim(q ->> 'statement'),
    options = public.admin_import_merge_options(options, q -> 'options'),
    expected_conduct = coalesce(nullif(btrim(coalesce(q ->> 'expected_conduct', '')), ''), expected_conduct),
    inep_intent = coalesce(nullif(btrim(coalesce(q ->> 'inep_intent', '')), ''), inep_intent),
    needs_image = case when q ->> 'needs_image_declared' = 'true' then coalesce((q ->> 'needs_image')::boolean, needs_image) else needs_image end,
    sources = case when jsonb_typeof(q -> 'sources') = 'array' and jsonb_array_length(q -> 'sources') > 0 then q -> 'sources' else sources end
  where id = p_id;
end
$$;

-- ---------------------------------------------------------------- importação (Q02, Q03; corpo da …1300)
-- Tudo ou nada, como antes. Para as que já existem: puladas (padrão) ou atualizadas só no que veio preenchido; a linha
-- com gabarito ou situação diferente do gravado não muda nada e conta em "answer_differs".
create or replace function public.app_admin_import_questions(p_questions jsonb, p_update_existing boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_result text;
  v_counts jsonb := jsonb_build_object('inserted', 0, 'updated', 0, 'skipped', 0, 'answer_differs', 0);
  v_item jsonb;
  v_index integer := 0;
  v_problem text;
  v_old public.questions;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'Nenhuma questão para importar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) > 1000 then
    raise exception 'Importe no máximo 1.000 questões por vez.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_index := v_index + 1;
    v_problem := public.admin_question_problem(v_item);
    if v_problem is not null then
      v_errors := v_errors || jsonb_build_object('index', v_index, 'number', v_item ->> 'number', 'message', v_problem);
    end if;
  end loop;
  -- mesma prova + número repetidos no arquivo
  v_errors := v_errors || coalesce((
    select jsonb_agg(jsonb_build_object('index', d.idx, 'number', d.number, 'message', 'Questão repetida no arquivo.'))
    from (
      select min(t.ordinality)::int as idx, t.value ->> 'number' as number
      from jsonb_array_elements(p_questions) with ordinality t
      group by t.value ->> 'kind', t.value ->> 'year', coalesce(t.value ->> 'semester', ''), t.value ->> 'number'
      having count(*) > 1
    ) d
  ), '[]'::jsonb);
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    select * into v_old from public.questions x
    where x.exam_id = public.admin_exam_id(v_item ->> 'kind', (v_item ->> 'year')::int, nullif(v_item ->> 'semester', '')::int)
      and x.number = (v_item ->> 'number')::int
    for update;
    if not found then
      v_result := public.admin_upsert_question(v_item, false);
    elsif not coalesce(p_update_existing, false) then
      v_result := 'skipped';
    elsif public.admin_import_answer_differs(v_old, v_item) then
      v_result := 'answer_differs';
    else
      perform public.admin_import_merge_question(v_old.id, v_item);
      v_result := 'updated';
    end if;
    v_counts := jsonb_set(v_counts, array[v_result], to_jsonb((v_counts ->> v_result)::int + 1));
  end loop;
  perform public.admin_refresh_exam_counts();
  perform public.admin_log('questions.import', null, v_counts || jsonb_build_object('update_existing', coalesce(p_update_existing, false)));
  return jsonb_build_object('ok', true) || v_counts;
end
$$;

-- ---------------------------------------------------------------- prévia da importação (Q03)
-- Não grava nada. Itens com problema ficam fora da conta (a importação os recusa e a tela já os lista).
--   new             quantas seriam criadas
--   existing        quantas já existem (mesma prova e número)
--   lose_comment    [{index, code}]: com "atualizar", o comentário gravado seria trocado pelo do arquivo
--   answer_differs  [{index, code, stored, file}]: gabarito ou situação diferente; com "atualizar", não mudam nada
create function public.app_admin_import_preview(p_questions jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_old public.questions;
  v_new integer := 0;
  v_existing integer := 0;
  v_loss jsonb := '[]'::jsonb;
  v_differs jsonb := '[]'::jsonb;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Nenhuma questão para conferir.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) > 1000 then
    raise exception 'Importe no máximo 1.000 questões por vez.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_index := v_index + 1;
    continue when public.admin_question_problem(v_item) is not null;
    select * into v_old from public.questions x
    where x.exam_id = public.admin_exam_id(v_item ->> 'kind', (v_item ->> 'year')::int, nullif(v_item ->> 'semester', '')::int)
      and x.number = (v_item ->> 'number')::int;
    if not found then
      v_new := v_new + 1;
      continue;
    end if;
    v_existing := v_existing + 1;
    if public.admin_import_answer_differs(v_old, v_item) then
      v_differs := v_differs || jsonb_build_object('index', v_index, 'code', v_old.code,
        'stored', public.admin_import_answer_label(v_old.correct_option::text, v_old.status),
        'file', public.admin_import_answer_label(nullif(v_item ->> 'correct_option', ''), coalesce(nullif(v_item ->> 'status', ''), 'valid')));
    elsif public.admin_import_comment_loss(v_old, v_item) then
      v_loss := v_loss || jsonb_build_object('index', v_index, 'code', v_old.code);
    end if;
  end loop;
  return jsonb_build_object('new', v_new, 'existing', v_existing, 'lose_comment', v_loss, 'answer_differs', v_differs);
end
$$;
revoke execute on function public.app_admin_import_preview(jsonb) from public, anon;

-- ---------------------------------------------------------------- registro do gabarito oficial (Q02; corpo da …2200)
-- Muda a lista de parâmetros (ganha p_reason), então a função é apagada e criada de novo. Regras:
--   só administrador; fonte e motivo obrigatórios; situação e letra conferidas;
--   a letra mudou: recorrige as respostas antigas;
--   o gabarito mudou (outra letra, ou a questão foi anulada ou deixou de ser): marca as explicações a revisar, e o aluno
--   (correção e Tutor) não as vê até a revisão. Anular guarda a letra antiga, mas muda o sentido de todas as explicações
--   (cada uma foi escrita supondo uma única correta): por isso anular, ou desfazer a anulação, marca todas as preenchidas.
drop function public.app_admin_set_official_answer(text, text, text, text, text, date);
create function public.app_admin_set_official_answer(
  p_question_id text, p_answer text, p_status text, p_source text,
  p_source_url text default null, p_published_at date default null, p_reason text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_old record;
  v_answer constant text := nullif(upper(btrim(coalesce(p_answer, ''))), '');
  v_new_answer text;
  v_old_key text;  -- o gabarito como o aluno o vê: a letra, ou 'ANULADA'
  v_new_key text;
  v_recorrected integer := 0;
  v_fields text[] := '{}';
  v_review jsonb;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_source, ''))) = 0 then raise exception 'Informe a fonte do gabarito (documento e data).' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo da mudança.' using errcode = '22023'; end if;
  if p_status is null or p_status not in ('PRELIMINARY', 'FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED', 'UNKNOWN') then
    raise exception 'Situação do gabarito inválida.' using errcode = '22023';
  end if;
  if v_answer is not null and v_answer not in ('A', 'B', 'C', 'D') then raise exception 'Gabarito deve ser A, B, C ou D.' using errcode = '22023'; end if;
  if p_status in ('PRELIMINARY', 'FINAL', 'CHANGED_AFTER_APPEAL') and v_answer is null then
    raise exception 'Informe a letra do gabarito (A, B, C ou D).' using errcode = '22023';
  end if;
  select q.correct_option::text as correct_option, q.status, q.options, q.expected_conduct into v_old
  from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;

  perform set_config('sqie.reason', 'Gabarito oficial: ' || p_status || ' (' || btrim(p_source) || '). Motivo: ' || btrim(p_reason), true);
  insert into public.question_official_answers (question_id, answer, answer_status, published_at, source, source_url)
  values (p_question_id, v_answer, p_status, p_published_at, btrim(p_source), nullif(btrim(p_source_url), '')) returning id, version into v_id, v_version;
  update public.questions set
    correct_option = case when p_status in ('FINAL', 'CHANGED_AFTER_APPEAL') then v_answer::char(1) else correct_option end,
    status = case p_status when 'ANNULLED' then 'annulled' when 'CHANGED_AFTER_APPEAL' then 'changed_after_appeal' when 'FINAL' then 'valid' else status end
  where id = p_question_id and p_status in ('FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED');
  select q.correct_option::text, case when q.status = 'annulled' then 'ANULADA' else q.correct_option::text end
    into v_new_answer, v_new_key
  from public.questions q where q.id = p_question_id;
  v_old_key := case when v_old.status = 'annulled' then 'ANULADA' else v_old.correct_option end;

  if v_new_answer is distinct from v_old.correct_option then
    -- as respostas antigas dos alunos, corrigidas de novo pelo gabarito novo (mesma regra do grade_question_attempt)
    update public.question_attempts set is_correct = coalesce(selected_option::text = v_new_answer, false)
    where question_id = p_question_id and is_correct is distinct from coalesce(selected_option::text = v_new_answer, false);
    get diagnostics v_recorrected = row_count;
  end if;

  if v_new_key is distinct from v_old_key then
    -- o que foi escrito para o gabarito antigo e agora contradiz o novo
    if 'ANULADA' in (v_old_key, v_new_key) then
      -- anulada de um lado: todas as explicações preenchidas
      v_fields := v_fields || array(select 'explanation_' || (o ->> 'id') from jsonb_array_elements(v_old.options) o
                                    where nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null order by o ->> 'id');
    else
      -- outra letra: a explicação da antiga correta e a da nova
      if exists (select 1 from jsonb_array_elements(v_old.options) o
          where o ->> 'id' = v_old.correct_option and nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null) then
        v_fields := v_fields || ('explanation_' || v_old.correct_option);
      end if;
      if exists (select 1 from jsonb_array_elements(v_old.options) o
          where o ->> 'id' = v_new_answer and nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null) then
        v_fields := v_fields || ('explanation_' || v_new_answer);
      end if;
    end if;
    if nullif(btrim(coalesce(v_old.expected_conduct, '')), '') is not null then
      v_fields := v_fields || 'expected_conduct'::text;
    end if;
    if exists (select 1 from public.question_analysis a where a.question_id = p_question_id and a.is_current) then
      v_fields := v_fields || 'analise'::text;
    end if;
    if cardinality(v_fields) > 0 then
      -- outra troca antes da revisão: soma os campos e guarda o gabarito de antes da primeira troca
      update public.questions q set explanations_review = jsonb_build_object(
          'de', coalesce(q.explanations_review -> 'de', to_jsonb(v_old_key)),
          'para', v_new_key,
          'campos', (select jsonb_agg(c order by c) from (
                       select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb)) as c
                       union select unnest(v_fields)) x),
          'desde', now(), 'por', (select auth.uid()), 'motivo', btrim(p_reason), 'fonte', btrim(p_source))
      where q.id = p_question_id
      returning q.explanations_review into v_review;
    end if;
  end if;
  if v_review is null then
    select q.explanations_review into v_review from public.questions q where q.id = p_question_id;
  end if;

  perform public.ch_log('question.official_answer', p_question_id, jsonb_build_object('status', p_status, 'answer', v_answer, 'version', v_version, 'reason', btrim(p_reason)));
  perform public.admin_log('question.official_answer', p_question_id, jsonb_build_object(
    'status', p_status, 'answer', v_answer, 'from', v_old.correct_option, 'version', v_version, 'source', btrim(p_source),
    'reason', btrim(p_reason), 'recorrected', v_recorrected));
  return jsonb_build_object('id', v_id, 'version', v_version, 'recorrected', v_recorrected, 'review', v_review);
end
$$;
revoke execute on function public.app_admin_set_official_answer(text, text, text, text, text, date, text) from public, anon;

-- ---------------------------------------------------------------- explicações revisadas (Q02)
-- A equipe (quem cuida do conteúdo) confirma que revisou as explicações depois da troca de gabarito: a marca sai e o
-- aluno volta a ver as explicações e a conduta esperada. A análise publicada só volta com nova análise aprovada.
create function public.app_admin_question_review_done(p_question_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_flag jsonb;
begin
  perform public.assert_staff();
  select q.explanations_review into v_flag from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if v_flag is not null then
    update public.questions set explanations_review = null where id = p_question_id;
    perform public.admin_log('question.explanations_reviewed', p_question_id, jsonb_build_object('review', v_flag));
  end if;
  return public.app_admin_question(p_question_id);
end
$$;
revoke execute on function public.app_admin_question_review_done(text) from public, anon;

-- funções internas: ninguém as chama pela API
revoke execute on function public.admin_import_answer_differs(public.questions, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_import_answer_label(text, text) from public, anon, authenticated;
revoke execute on function public.admin_import_comment_loss(public.questions, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_import_merge_options(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_import_merge_question(text, jsonb) from public, anon, authenticated;

-- Para desfazer: recriar as funções acima a partir das migrações citadas no topo (app_admin_set_official_answer: apagar a
-- de 7 parâmetros e recriar a de 6 da …2200), apagar as oito novas e a coluna questions.explanations_review.
