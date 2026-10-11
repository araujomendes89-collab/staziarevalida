-- =============================================================================
-- Ajustes das correções da aba Questões (leva 2), por cima da …7700 (que precisa estar colada antes).
-- Pode ser colada duas vezes sem erro: só "create or replace" e "revoke".
--
--   1. Questão anulada pela banca fica fora de acerto e de erro em TODOS os números do aluno. Antes, mesmo com a …7700:
--        - Desempenho: a média dos simulados dividia pelo total de questões com as anuladas e contava a anulada que
--          guardou a letra marcada como acerto (app_performance, bloco "simulados");
--        - Perfil de erros: "questões erradas" e os motivos declarados contavam a anulada (app_error_reasons);
--        - o diagnóstico do erro respondia para a anulada (app_attempt_diagnosis);
--        - Administração → Usuários: respondidas, acertos e erros pendentes do aluno contavam a anulada
--          (admin_user_row e app_admin_user).
--   5. Gabarito que volta, antes da revisão, à letra de antes da primeira troca (por exemplo B → C → B): a marca
--      "explicações a revisar" não fica mais como "mudou de B para B" escondendo do aluno textos que voltaram a valer.
--      Na primeira troca, a marca guarda a impressão (md5) dos textos de antes (explicação de cada alternativa e conduta
--      esperada). Na volta, só continua marcado o texto que mudou durante a troca (pode ter sido reescrito para o outro
--      gabarito); sem nada mudado, a marca sai. Marca feita antes desta versão (sem a impressão) continua inteira, pelo
--      lado seguro.
--
-- Funções redefinidas (cada uma a partir da versão mais nova): app_performance (…0900), app_error_reasons (…2800),
--   app_attempt_diagnosis (…2700), admin_user_row e app_admin_user (…1300), app_admin_set_official_answer (…7700).
-- Nova (interna): question_review_snapshot.
-- =============================================================================

-- A …7700 tem de estar colada antes (coluna questions.explanations_review e o registro do gabarito com motivo).
do $guard$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'questions' and column_name = 'explanations_review') then
    raise exception 'Cole primeiro o arquivo correcoes_questoes_supabase.sql (leva 1) e depois este.';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- Desempenho (1; corpo da …0900)
-- Mais: no bloco "simulados", a anulada sai do total e dos acertos de cada simulado (como no resultado do simulado e na
-- lista "Seus simulados"); simulado só com anuladas fica fora da média.
create or replace function public.app_performance(p_days integer default 30) returns jsonb
  language sql stable set search_path = ''
as $$
  with span as (
    select least(greatest(coalesce(p_days, 30), 7), 365) as days
  ),
  my as (
    select a.question_id, a.is_correct, a.active_ms, q.area,
           (a.answered_at at time zone 'America/Sao_Paulo')::date as day
    from public.question_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = (select auth.uid()) and q.status <> 'annulled'
  ),
  recent as (
    select my.* from my, span where my.day > public.today_br() - span.days
  )
  select jsonb_build_object(
    'days', (select days from span),
    'attempts', (select count(*)::int from my),
    'correct', (select count(*) filter (where is_correct)::int from my),
    'questions', (select count(distinct question_id)::int from my),
    'avg_seconds', (select round(avg(active_ms) / 1000.0)::int from my where active_ms > 0),
    'streak_days', public.my_streak_days(),
    'period', (select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int) from recent),
    'previous', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int)
      from my, span
      where my.day > public.today_br() - 2 * span.days and my.day <= public.today_br() - span.days),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'attempts', d.attempts, 'correct', d.correct) order by d.day)
      from (select day, count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from recent group by day) d
    ), '[]'::jsonb),
    'areas', (
      select jsonb_agg(jsonb_build_object('area', e.area, 'attempts', coalesce(s.attempts, 0), 'correct', coalesce(s.correct, 0))
                       order by e.area)
      from unnest(enum_range(null::public.med_area)) as e (area)
      left join (
        select area, count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from my group by area
      ) s on s.area = e.area),
    'simulados', (
      select jsonb_build_object('count', count(*)::int, 'accuracy', round(avg(100.0 * r.correct / nullif(r.total, 0)))::int)
      from (
        select (select count(*) from unnest(s.question_ids) as u (question_id)
                join public.questions q on q.id = u.question_id
                where q.status <> 'annulled') as total,
               (select count(*) from public.question_attempts a
                join public.questions q on q.id = a.question_id
                where a.session_id = s.id and a.is_correct and q.status <> 'annulled') as correct
        from public.practice_sessions s
        where s.user_id = (select auth.uid()) and s.kind = 'simulado' and s.finished_at is not null
      ) r)
  )
$$;

-- ---------------------------------------------------------------- Perfil de erros: motivos declarados (1; corpo da …2800)
-- Mais: a anulada não conta em "questões erradas" nem nos motivos declarados.
create or replace function public.app_error_reasons(p_days integer default 90) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'wrong_questions', (select count(distinct t.question_id)::int from public.question_attempts t
                        join public.questions q on q.id = t.question_id and q.status <> 'annulled'
                        where t.user_id = v_user and not t.is_correct and t.answered_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 730))),
    'declared', coalesce((select jsonb_object_agg(x.reason, x.n) from (
        select n.reason, count(*)::int n from public.error_notes n
        where n.user_id = v_user and n.reason is not null
          and exists (select 1 from public.question_attempts t join public.questions q on q.id = t.question_id and q.status <> 'annulled'
                      where t.user_id = v_user and t.question_id = n.question_id and not t.is_correct and t.answered_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 730)))
        group by n.reason) x), '{}'::jsonb));
end
$$;
revoke execute on function public.app_error_reasons(integer) from public, anon;

-- ---------------------------------------------------------------- diagnóstico do erro (1; corpo da …2700)
-- Mais: questão anulada não tem erro a diagnosticar (nulo, como quando não há resposta errada).
create or replace function public.app_attempt_diagnosis(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  t public.question_attempts;
  d record;
  v_n integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if exists (select 1 from public.questions q where q.id = p_question_id and q.status = 'annulled') then return null; end if;
  select * into t from public.question_attempts where user_id = v_user and question_id = p_question_id and not is_correct order by answered_at desc, seq desc limit 1;
  if not found then return null; end if;
  select * into d from public.student_chosen_option_analysis(v_user, p_question_id, t.selected_option);
  select count(*)::int into v_n from public.question_attempts where user_id = v_user and question_id = p_question_id and not is_correct and selected_option = t.selected_option;
  return jsonb_build_object(
    'selected', t.selected_option,
    'distractor_kind', d.distractor_kind, 'error_types', coalesce(d.error_types, '{}'),
    'trap', d.trap, 'concept_difference', d.concept_difference,
    'diagnosed', d.distractor_kind is not null,
    'confidence', t.confidence,
    'same_option_times', v_n,
    -- errar duas vezes ou mais escolhendo a MESMA alternativa sugere uma ideia fixa, não um deslize
    'repeated_same_option', v_n >= 2);
end
$$;
revoke execute on function public.app_attempt_diagnosis(text) from public, anon;

-- ---------------------------------------------------------------- Administração → Usuários (1; corpo da …1300)
-- Mais: respondidas e acertos do aluno sem as anuladas (como no Início dele). A última atividade continua contando tudo.
create or replace function public.admin_user_row(p_user_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at,
    'name', p.name, 'phase', p.phase, 'exam_type', p.exam_type, 'target_edition', p.target_edition,
    'role', coalesce(r.role, 'student'),
    'plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'answered', (select count(*)::int from public.question_attempts a join public.questions q on q.id = a.question_id
                 where a.user_id = u.id and q.status <> 'annulled'),
    'correct', (select count(*)::int from public.question_attempts a join public.questions q on q.id = a.question_id
                where a.user_id = u.id and a.is_correct and q.status <> 'annulled'),
    'last_activity', greatest(
      (select max(a.answered_at) from public.question_attempts a where a.user_id = u.id),
      (select max(f.reviewed_at) from public.flashcard_reviews f where f.user_id = u.id))
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles r on r.user_id = u.id
  left join public.subscriptions s on s.user_id = u.id
  where u.id = p_user_id
$$;
revoke execute on function public.admin_user_row(uuid) from public, anon, authenticated;

-- Mais: erros pendentes sem as anuladas (como o caderno de erros do aluno).
create or replace function public.app_admin_user(p_user_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform public.assert_admin();
  v_row := public.admin_user_row(p_user_id);
  if v_row is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  return v_row || jsonb_build_object(
    'sessions', (select count(*)::int from public.practice_sessions s where s.user_id = p_user_id),
    'simulados', (select count(*)::int from public.practice_sessions s where s.user_id = p_user_id and s.kind = 'simulado' and s.finished_at is not null),
    'flashcards', (select count(*)::int from public.flashcards f where f.owner_id = p_user_id),
    'flashcard_reviews', (select count(*)::int from public.flashcard_reviews f where f.user_id = p_user_id),
    'pending_errors', (select count(*)::int from (
        select a.question_id, (array_agg(a.is_correct order by a.answered_at desc, a.seq desc))[1] as last_correct
        from public.question_attempts a join public.questions q on q.id = a.question_id
        where a.user_id = p_user_id and q.status <> 'annulled' group by a.question_id) e
      where not e.last_correct)
  );
end
$$;

-- ---------------------------------------------------------------- impressão dos textos (5)
-- md5 de cada texto que uma troca de gabarito pode contradizer: explicação de cada alternativa (A a D, vazia também) e
-- conduta esperada. Guardada na marca na primeira troca; na volta ao gabarito de antes, diz o que mudou durante a troca.
create or replace function public.question_review_snapshot(p_options jsonb, p_conduct text) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_object_agg(x.campo, md5(x.texto))
  from (
    select 'explanation_' || l.id as campo,
           coalesce(btrim((select o ->> 'explanation' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o
                           where o ->> 'id' = l.id limit 1)), '') as texto
    from unnest(array['A', 'B', 'C', 'D']) as l (id)
    union all
    select 'expected_conduct', coalesce(btrim(p_conduct), '')
  ) x
$$;
revoke execute on function public.question_review_snapshot(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- registro do gabarito oficial (5; corpo da …7700)
-- Mais:
--   primeira troca (sem marca): a marca guarda em "textos" a impressão dos textos de antes (question_review_snapshot);
--   outra troca antes da revisão: soma os campos como antes, e a impressão continua a da primeira troca;
--   volta ao gabarito de antes da primeira troca ("de" da marca), antes da revisão: a marca fica só com os textos que
--   mudaram desde a primeira troca; sem nenhum, a marca sai (o aluno volta a ver o que voltou a valer). A análise
--   publicada não entra nessa conta: a feita para o gabarito de antes volta a valer, e a feita durante a troca não vale
--   para ele (question_analysis_fits). Marca sem impressão (feita antes desta versão): continua inteira, com os campos
--   desta troca somados.
create or replace function public.app_admin_set_official_answer(
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
  v_flag jsonb;  -- a marca como estava antes deste registro
  v_cleared boolean := false;
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
  select q.correct_option::text as correct_option, q.status, q.options, q.expected_conduct, q.explanations_review into v_old
  from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  v_flag := v_old.explanations_review;

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
    if v_old_key = 'ANULADA' then
      -- deixou de ser anulada: todas as explicações preenchidas
      v_fields := v_fields || array(select 'explanation_' || (o ->> 'id') from jsonb_array_elements(v_old.options) o
                                    where nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null order by o ->> 'id');
    elsif v_new_key = 'ANULADA' then
      null;  -- anulada agora: as explicações de alternativa já não saem ao aluno (nada a marcar)
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

    if v_flag is not null and v_new_key is not distinct from (v_flag ->> 'de') then
      -- voltou ao gabarito de antes da primeira troca, antes da revisão: fica marcado só o texto que mudou durante a troca
      if jsonb_typeof(v_flag -> 'textos') = 'object' then
        v_fields := array(select n.campo from jsonb_each_text(public.question_review_snapshot(v_old.options, v_old.expected_conduct)) as n (campo, impressao)
                          where (v_flag -> 'textos' ->> n.campo) is distinct from n.impressao order by n.campo);
      else
        -- marca sem a impressão dos textos (feita antes desta versão): nada prova que não mudaram
        v_fields := array(select x.c from (select jsonb_array_elements_text(coalesce(v_flag -> 'campos', '[]'::jsonb)) union select unnest(v_fields)) as x (c)
                          where x.c <> 'analise' order by x.c);
      end if;
      if cardinality(v_fields) = 0 then
        update public.questions set explanations_review = null where id = p_question_id;
        v_cleared := true;
      else
        update public.questions q set explanations_review = v_flag || jsonb_build_object(
            'para', v_new_key, 'campos', to_jsonb(v_fields),
            'desde', now(), 'por', (select auth.uid()), 'motivo', btrim(p_reason), 'fonte', btrim(p_source))
        where q.id = p_question_id
        returning q.explanations_review into v_review;
      end if;
    elsif cardinality(v_fields) > 0 then
      -- outra troca antes da revisão: soma os campos e guarda o gabarito e a impressão dos textos de antes da primeira troca
      update public.questions q set explanations_review = jsonb_build_object(
          'de', coalesce(q.explanations_review -> 'de', to_jsonb(v_old_key)),
          'para', v_new_key,
          'campos', (select jsonb_agg(c order by c) from (
                       select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb)) as c
                       union select unnest(v_fields)) x),
          'textos', case when q.explanations_review is null then public.question_review_snapshot(v_old.options, v_old.expected_conduct)
                         else q.explanations_review -> 'textos' end,
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
    'reason', btrim(p_reason), 'recorrected', v_recorrected, 'review_cleared', v_cleared));
  return jsonb_build_object('id', v_id, 'version', v_version, 'recorrected', v_recorrected, 'review', v_review);
end
$$;
revoke execute on function public.app_admin_set_official_answer(text, text, text, text, text, date, text) from public, anon;

-- Para desfazer: recriar as funções acima a partir das migrações citadas no topo e apagar question_review_snapshot. As
-- marcas gravadas com "textos" continuam válidas para a …7700 (ela só lê de, para e campos).
