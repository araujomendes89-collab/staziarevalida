-- =============================================================================
-- SQIE, fase 5: diagnóstico do erro do aluno e reforço adaptativo.
--
-- Tudo é calculado das respostas do PRÓPRIO aluno e da análise PUBLICADA da questão (revisada por médico). Nada é
-- inventado: sem análise publicada não há "tipo de erro", e o sistema diz quanto do que o aluno errou já foi diagnosticado
-- (cobertura). Nada aqui chama IA e nenhuma questão nova é criada: o reforço usa só questões reais do banco.
-- =============================================================================

-- A alternativa que o aluno marcou, segundo a análise publicada e atual da questão (só questões que ele já respondeu).
create function public.student_chosen_option_analysis(p_user uuid, p_question_id text, p_option char(1))
  returns table (distractor_kind text, error_types text[], trap text, why_wrong text, concept_difference text)
  language sql stable security definer set search_path = ''
as $$
  select o.distractor_kind, o.error_types, o.trap, o.why_wrong, o.concept_difference
  from public.question_analysis a join public.question_option_analysis o on o.analysis_id = a.id
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and o.option_id = p_option
    and exists (select 1 from public.question_attempts t where t.user_id = p_user and t.question_id = p_question_id)
$$;

-- Diagnóstico de UMA questão (a última resposta errada do aluno).
create function public.app_attempt_diagnosis(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  t public.question_attempts;
  d record;
  v_n integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
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

-- Perfil de erros do aluno no período.
create function public.app_error_profile(p_days integer default 90) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_days constant integer := least(greatest(coalesce(p_days, 90), 1), 730);
  v_result jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  with att as (
    select t.question_id, t.selected_option, t.is_correct, t.confidence
    from public.question_attempts t join public.questions q on q.id = t.question_id and q.status <> 'annulled'
    where t.user_id = v_user and t.answered_at >= now() - make_interval(days => v_days)),
  wrong as (
    select a.question_id, a.selected_option, a.confidence, d.distractor_kind kind, d.error_types types, d.trap
    from att a left join lateral public.student_chosen_option_analysis(v_user, a.question_id, a.selected_option) d on true
    where not a.is_correct),
  pts as (
    select d.subarea, d.competency, count(*)::int n, count(*) filter (where not a.is_correct)::int w
    from att a join public.question_dna d on d.question_id = a.question_id
    where d.subarea is not null and d.competency is not null
    group by d.subarea, d.competency having count(*) >= 3 and count(*) filter (where not a.is_correct) * 10 >= count(*) * 4)
  select jsonb_build_object(
    'days', v_days,
    'attempts', (select count(*)::int from att), 'wrong', (select count(*)::int from wrong),
    -- quanto dos erros já tem diagnóstico: só questões com análise publicada por revisor médico entram nos tipos de erro
    'diagnosed', (select count(*)::int from wrong where kind is not null),
    'error_types', coalesce((select jsonb_agg(jsonb_build_object('type', x.t, 'count', x.n) order by x.n desc, x.t) from (select u.t, count(*)::int n from wrong w, unnest(w.types) u(t) group by u.t) x), '[]'::jsonb),
    'kinds', coalesce((select jsonb_object_agg(x.kind, x.n) from (select kind, count(*)::int n from wrong where kind is not null group by kind) x), '{}'::jsonb),
    'confidence', jsonb_build_object(
      'recorded', (select count(*)::int from wrong where confidence is not null),
      'wrong_but_sure', (select count(*)::int from wrong where confidence = 3),
      'wrong_and_guessing', (select count(*)::int from wrong where confidence = 1)),
    -- errar duas vezes ou mais escolhendo a MESMA alternativa sugere uma ideia fixa, não um deslize
    'fixed_ideas', (select count(*)::int from (select question_id, selected_option from wrong group by question_id, selected_option having count(*) >= 2) f),
    'traps', coalesce((select jsonb_agg(jsonb_build_object('trap', x.trap, 'count', x.n, 'question_id', x.q) order by x.n desc, x.trap) from (
                select trap, count(*)::int n, min(question_id) q from wrong where trap is not null and btrim(trap) <> '' group by trap order by count(*) desc, trap limit 5) x), '[]'::jsonb),
    -- pontos fracos: subárea + competência com pelo menos 3 respostas e 40% ou mais de erro
    'weak_points', coalesce((select jsonb_agg(jsonb_build_object('subarea', x.subarea, 'competency', x.competency, 'attempts', x.n, 'wrong', x.w, 'rate', round(x.w::numeric / x.n, 3)) order by x.w desc, x.w::numeric / x.n desc, x.subarea)
                from (select * from pts order by w desc, w::numeric / n desc, subarea limit 8) x), '[]'::jsonb))
  into v_result;
  return v_result;
end
$$;

-- Reforço: sessão de treino montada com questões REAIS ainda não dominadas do ponto fraco escolhido:
-- primeiro as que o aluno errou e não superou, depois as que ainda não respondeu. Equivalentes (mesma questão em outra
-- prova) contam como uma só, e nada que o aluno já acertou por último (nem seu equivalente) entra de novo.
create function public.app_start_reinforcement(p_subarea text, p_competency text, p_count integer default 10) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_count constant integer := least(greatest(coalesce(p_count, 10), 1), 50);
  v_filters constant jsonb := jsonb_build_object('subarea', p_subarea, 'competency', p_competency);
  v_ids text[];
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta para treinar.' using errcode = '28000'; end if;
  if nullif(btrim(coalesce(p_subarea, '')), '') is null or nullif(btrim(coalesce(p_competency, '')), '') is null then
    raise exception 'Escolha um ponto fraco (subárea e competência).' using errcode = '22023';
  end if;
  select array_agg(u.question_id order by u.prio, u.r) into v_ids from (
    select c.question_id, c.prio, c.r from (
      select pool.question_id, case when nb.status = 'para_revisar' then 0 else 1 end as prio, random() as r,
             row_number() over (partition by coalesce(e.group_id, pool.question_id) order by case when nb.status = 'para_revisar' then 0 else 1 end, random()) as dup
      from public.practice_pool(v_filters) pool
        left join public.my_error_notebook nb on nb.question_id = pool.question_id
        left join public.question_equivalents e on e.question_id = pool.question_id
      where (nb.status = 'para_revisar'
             or not exists (select 1 from public.question_attempts t where t.user_id = (select auth.uid()) and t.question_id = pool.question_id))
        -- o equivalente já foi acertado por último: não é novidade
        and not exists (select 1 from public.question_equivalents o
                        where e.group_id is not null and o.group_id = e.group_id and o.question_id <> pool.question_id
                          and exists (select 1 from public.question_attempts t2 where t2.user_id = (select auth.uid()) and t2.question_id = o.question_id and t2.is_correct)
                          and not exists (select 1 from public.my_error_notebook nb3 where nb3.question_id = o.question_id and nb3.status = 'para_revisar'))
    ) c where c.dup = 1 order by c.prio, c.r limit v_count) u;
  if v_ids is null then raise exception 'Nada novo para reforçar neste ponto: você já respondeu e superou as questões disponíveis.' using errcode = 'P0002'; end if;
  insert into public.practice_sessions (kind, config, question_ids)
  values ('questoes', jsonb_build_object('filters', v_filters, 'requested', v_count, 'reinforcement', true), v_ids) returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'count', cardinality(v_ids));
end
$$;

-- Equipe: como os alunos responderam cada alternativa (mostra qual distrator mais atrai). Só com amostra mínima (5 alunos).
create function public.app_distractor_stats(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_users integer;
begin
  perform public.ch_assert_staff();
  select count(distinct user_id)::int into v_users from public.question_attempts where question_id = p_question_id;
  if v_users < 5 then return jsonb_build_object('students', v_users, 'enough', false, 'options', '[]'::jsonb); end if;
  return jsonb_build_object('students', v_users, 'enough', true, 'options', (
    select jsonb_agg(jsonb_build_object('option_id', x.selected_option, 'count', x.n, 'share', round(x.n::numeric / x.total, 3), 'correct', x.ok) order by x.selected_option)
    from (select selected_option, count(*)::int n, bool_or(is_correct) ok, sum(count(*)) over ()::numeric total from public.question_attempts where question_id = p_question_id group by selected_option) x));
end
$$;

do $revoke$
begin
  revoke execute on function public.student_chosen_option_analysis(uuid, text, char) from public, anon, authenticated;
  revoke execute on function public.app_attempt_diagnosis(text) from public, anon;
  revoke execute on function public.app_error_profile(integer) from public, anon;
  revoke execute on function public.app_start_reinforcement(text, text, integer) from public, anon;
  revoke execute on function public.app_distractor_stats(text) from public, anon;
end
$revoke$;
