-- =============================================================================
-- Stazia Play: correção e desempenho do motor (sobre a migração 3800, já aplicada).
--
--  * Simulado: as respostas são gravadas todas de uma vez ao finalizar. A regra de enxurrada
--    (30 respostas por minuto) marcava como inválidas as respostas depois da 30ª, sem XP e fora das
--    estatísticas. Agora o simulado não conta como enxurrada nem entra na conta dos treinos seguintes.
--  * Desempenho: missões, sequência, score e medalhas rodam uma vez por comando (gatilho por comando
--    com tabela de transição), não uma vez por resposta; um simulado de 100 questões fazia isso 100 vezes.
--  * Medalhas calculam cada agregado no máximo uma vez e só quando alguma medalha pendente precisa;
--    "fatos do período" usam o índice por aluno e horário; o score usa junções em vez de função por linha.
-- Mesmas regras e mesmos resultados; nada é apagado.
-- =============================================================================

create or replace function public.gam_facts(p_user uuid, p_from date, p_to date) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  -- intervalo em horário do aluno convertido para instantes (usa o índice por aluno e horário)
  with tz as (select public.gam_tz(p_user) as z),
  span as (select (p_from::timestamp at time zone (select z from tz)) as t0, ((p_to + 1)::timestamp at time zone (select z from tz)) as t1),
  bad as (select e.source_id from public.gamification_events e
          where e.user_id = p_user and e.source_type = 'question_attempt' and not e.is_valid),
  a as (
    select a.id, a.question_id, a.is_correct, coalesce(a.active_ms, 0) as ms, q.area,
           (a.answered_at at time zone (select z from tz))::date as day,
           exists (select 1 from public.question_attempts b
                   where b.user_id = a.user_id and b.question_id = a.question_id and b.seq < a.seq and not b.is_correct) as was_wrong
    from public.question_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = p_user and q.status <> 'annulled'
      and a.answered_at >= (select t0 from span) and a.answered_at < (select t1 from span)
      and a.id::text not in (select source_id from bad)
  )
  select jsonb_build_object(
    'questions', (select count(*)::int from a),
    'correct', (select count(*) filter (where is_correct)::int from a),
    'minutes', (select (coalesce(sum(ms), 0) / 60000)::int from a),
    'areas', (select count(distinct area)::int from a),
    'areas_list', (select coalesce(jsonb_agg(distinct area), '[]'::jsonb) from a),
    'review', (select count(*) filter (where was_wrong)::int from a),
    'fixed', (select count(*) filter (where was_wrong and is_correct)::int from a),
    'flashcards', (select count(*)::int from public.flashcard_reviews r
                   where r.user_id = p_user and r.reviewed_at >= (select t0 from span) and r.reviewed_at < (select t1 from span)),
    'simulados', (select count(*)::int from public.gamification_events e
                  where e.user_id = p_user and e.event_type = 'SIMULATION_COMPLETED'
                    and e.created_at >= (select t0 from span) and e.created_at < (select t1 from span)),
    'active_days', (select count(distinct day)::int from a)
  )
$$;

create or replace function public.gam_check_achievements(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  st public.user_gamification_stats;
  a record;
  cr jsonb;
  v_tz constant text := public.gam_tz(p_user);
  v_today constant date := (now() at time zone public.gam_tz(p_user))::date;
  ok boolean;
  -- cada agregado é calculado no máximo uma vez, e só se alguma medalha pendente precisar dele
  v_areas jsonb; v_totals jsonb; v_learned int; v_day int; v_hours int[]; v_last text;
  x jsonb;
begin
  select * into st from public.user_gamification_stats where user_id = p_user;
  if not found then return; end if;
  for a in
    select m.slug, m.criteria from public.achievements m
    where m.is_active and not exists (select 1 from public.user_achievements u where u.user_id = p_user and u.achievement_slug = m.slug)
    order by m.position
  loop
    cr := a.criteria; ok := false;
    case cr ->> 'type'
      when 'questions_total' then ok := st.questions_answered >= (cr ->> 'n')::int;
      when 'accuracy' then ok := st.questions_answered >= (cr ->> 'min_questions')::int and st.accuracy >= (cr ->> 'pct')::numeric;
      when 'streak' then ok := st.longest_streak >= (cr ->> 'days')::int;
      when 'comeback' then ok := st.evolution_pts is not null and st.evolution_pts >= (cr ->> 'pts')::numeric;
      when 'learned' then
        if v_learned is null then
          select count(*) filter (where e.status = 'superada')::int into v_learned from public.my_error_notebook_of(p_user) e;
        end if;
        ok := v_learned >= (cr ->> 'n')::int;
      when 'day_volume' then
        if v_day is null then v_day := (public.gam_facts(p_user, v_today, v_today) ->> 'questions')::int; end if;
        ok := v_day >= (cr ->> 'n')::int;
      when 'hour_window' then
        -- olha só as últimas 48 h: a verificação roda a cada atividade
        if v_hours is null then
          select coalesce(array_agg(distinct extract(hour from t.answered_at at time zone v_tz)::int), '{}') into v_hours
          from public.question_attempts t
          where t.user_id = p_user and t.answered_at > now() - interval '48 hours'
            and t.id::text not in (select e.source_id from public.gamification_events e
                                   where e.user_id = p_user and e.source_type = 'question_attempt' and not e.is_valid);
        end if;
        ok := exists (select 1 from unnest(v_hours) h where h >= (cr ->> 'from')::int and h < (cr ->> 'to')::int);
      when 'survivor' then
        if v_last is null then
          select coalesce(string_agg(case when t.is_correct then 'C' else 'E' end, '' order by t.answered_at, t.seq), '') into v_last
          from (select is_correct, answered_at, seq from public.question_attempts where user_id = p_user order by answered_at desc, seq desc limit 10) t;
        end if;
        ok := v_last = 'EEEEECCCCC';
      when 'area' then
        if v_areas is null then
          select coalesce(jsonb_object_agg(y.area, jsonb_build_object('n', y.n, 'c', y.c, 'topics', y.topics)), '{}'::jsonb) into v_areas
          from (select q.area::text as area, count(*)::int as n, count(*) filter (where t.is_correct)::int as c, count(distinct q.topic)::int as topics
                from public.question_attempts t join public.questions q on q.id = t.question_id
                where t.user_id = p_user and q.status <> 'annulled'
                  and t.id::text not in (select e.source_id from public.gamification_events e
                                         where e.user_id = p_user and e.source_type = 'question_attempt' and not e.is_valid)
                group by q.area) y;
          select coalesce(jsonb_object_agg(z.area, z.n), '{}'::jsonb) into v_totals
          from (select q.area::text as area, count(distinct q.topic)::int as n from public.questions q where q.status <> 'annulled' group by q.area) z;
        end if;
        x := v_areas -> (cr ->> 'area');
        ok := x is not null
              and (x ->> 'n')::int >= (cr ->> 'questions')::int
              and 100.0 * (x ->> 'c')::int / greatest((x ->> 'n')::int, 1) >= (cr ->> 'accuracy')::numeric
              and 100.0 * (x ->> 'topics')::int / greatest(coalesce((v_totals ->> (cr ->> 'area'))::int, 0), 1) >= (cr ->> 'coverage')::numeric;
      else ok := false;
    end case;
    if ok then perform public.gam_unlock(p_user, a.slug); end if;
  end loop;
end
$$;

create or replace function public.gam_compute_score(p_user uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tz constant text := public.gam_tz(p_user);
  v_today constant date := (now() at time zone public.gam_tz(p_user))::date;
  v_window constant integer := greatest(public.gam_num('score.window_days', 90)::int, 14);
  v_min_q constant integer := public.gam_num('score.min_questions', 50)::int;
  v_min_evo constant integer := public.gam_num('ranking.evolution_min_questions', 20)::int;
  n int; c int; n_all int; n_rec int; c_rec int; n_prev int; c_prev int;
  perf numeric; diff numeric; diff_c numeric; cons numeric; cov numeric; evo numeric; rev numeric;
  v_days int; v_days_target int; v_topics int; v_topics_total int; v_sup int; v_err int;
  v_evo_pts numeric; v_score int;
begin
  create temp table if not exists pg_temp.gam_tmp_attempts (question_id text, is_correct boolean, day date, topic text, difficulty numeric) on commit drop;
  truncate pg_temp.gam_tmp_attempts;
  -- dificuldade e tentativas invalidadas por junção (uma passada), sem chamar função por linha
  insert into pg_temp.gam_tmp_attempts
  select a.question_id, a.is_correct, (a.answered_at at time zone v_tz)::date, q.topic,
         coalesce(case when d.attempts >= 20 then d.difficulty end,
                  case upper(x.difficulty_estimate) when 'HIGH' then 0.75 when 'LOW' then 0.3 else 0.5 end)
  from public.question_attempts a
  join public.questions q on q.id = a.question_id
  left join public.question_difficulty d on d.question_id = a.question_id
  left join public.question_dna x on x.question_id = a.question_id
  where a.user_id = p_user and q.status <> 'annulled'
    and a.id::text not in (select e.source_id from public.gamification_events e
                           where e.user_id = p_user and e.source_type = 'question_attempt' and not e.is_valid);

  select count(*), count(*) filter (where is_correct) into n, c from pg_temp.gam_tmp_attempts where day > v_today - v_window;
  select count(*) into n_all from pg_temp.gam_tmp_attempts;
  perf := (c + 5.0) / (n + 10.0);                                   -- encolhe para 50% com pouca amostra
  select coalesce(avg(difficulty), 0.5) into diff from pg_temp.gam_tmp_attempts where day > v_today - v_window;
  diff_c := least(greatest((diff - 0.25) / 0.5, 0), 1);
  select count(distinct day) into v_days from pg_temp.gam_tmp_attempts where day > v_today - 28;
  select least(28, greatest(8, coalesce(p.study_days_per_week, 5) * 4)) into v_days_target from public.profiles p where p.id = p_user;
  cons := least(v_days::numeric / coalesce(v_days_target, 20), 1);
  select count(distinct topic) into v_topics from pg_temp.gam_tmp_attempts;
  select count(distinct q.topic) into v_topics_total from public.questions q where q.status <> 'annulled';
  cov := least(v_topics::numeric / greatest(v_topics_total * 0.6, 1), 1);
  select count(*), count(*) filter (where is_correct) into n_rec, c_rec from pg_temp.gam_tmp_attempts where day > v_today - 14;
  select count(*), count(*) filter (where is_correct) into n_prev, c_prev from pg_temp.gam_tmp_attempts where day > v_today - 28 and day <= v_today - 14;
  if n_rec >= v_min_evo and n_prev >= v_min_evo then
    v_evo_pts := round(100.0 * (c_rec::numeric / n_rec - c_prev::numeric / n_prev), 1);
    evo := least(greatest(0.5 + (v_evo_pts / 100) / 0.4, 0), 1);
  else
    v_evo_pts := null; evo := 0.5;
  end if;
  select count(*) filter (where status = 'superada'), count(*) into v_sup, v_err from public.my_error_notebook_of(p_user);
  rev := case when v_err = 0 then 0.5 else v_sup::numeric / v_err end;
  v_score := round(1000 * (0.40 * perf + 0.20 * diff_c + 0.15 * cons + 0.10 * cov + 0.10 * evo + 0.05 * rev))::int;
  return jsonb_build_object(
    'score', least(greatest(v_score, 0), 1000), 'provisional', n_all < v_min_q, 'questions', n_all, 'window_questions', n,
    'evolution_pts', v_evo_pts, 'avg_difficulty', round(diff, 3), 'active_days_28', v_days,
    'components', jsonb_build_object('performance', round(perf, 3), 'difficulty', round(diff_c, 3), 'consistency', round(cons, 3),
                                     'coverage', round(cov, 3), 'evolution', round(evo, 3), 'review', round(rev, 3)));
end
$$;

create or replace function public.gam_process_attempt() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  q public.questions;
  v_prior integer; v_prev_wrong boolean; v_attempt integer;
  v_mults jsonb; v_mult numeric;
  v_reason text; v_valid boolean;
  v_diff numeric; v_hard boolean;
  b_base int := 0; b_correct int := 0; b_hard int := 0; b_first int := 0; b_unseen int := 0; b_review int := 0; b_fix int := 0;
  v_total int; v_coins int; v_in_session int;
  v_kind text;
begin
  if not public.gam_flag('flags.gamification_enabled') then return null; end if;
  select * into q from public.questions where id = new.question_id;
  if q.status = 'annulled' then return null; end if;
  perform public.gam_ensure(new.user_id);
  perform pg_advisory_xact_lock(hashtextextended('gam:' || new.user_id::text, 0));
  select s.kind into v_kind from public.practice_sessions s where s.id = new.session_id;

  select count(*)::int into v_prior from public.question_attempts a
    where a.user_id = new.user_id and a.question_id = new.question_id and a.seq < new.seq;
  select not a.is_correct into v_prev_wrong from public.question_attempts a
    where a.user_id = new.user_id and a.question_id = new.question_id and a.seq < new.seq order by a.seq desc limit 1;
  v_prev_wrong := coalesce(v_prev_wrong, false);
  v_attempt := v_prior + 1;
  v_mults := coalesce(public.gam_rule('repeat.multipliers'), '[1, 0.3, 0.1, 0]'::jsonb);
  v_mult := coalesce((v_mults ->> least(v_prior, jsonb_array_length(v_mults) - 1))::numeric, 0);

  -- antifraude: rápido demais, enxurrada, repetição para farmar
  if new.active_ms is not null and new.active_ms > 0 and new.active_ms < public.gam_num('fraud.too_fast_ms', 3000) then
    v_reason := 'too_fast';
  -- o simulado grava todas as respostas de uma vez ao finalizar: não conta como enxurrada, nem entra na conta dos treinos
  elsif coalesce(v_kind, '') <> 'simulado'
        and (select count(*) from public.question_attempts a
             left join public.practice_sessions s2 on s2.id = a.session_id
             where a.user_id = new.user_id and a.seq < new.seq
               and a.answered_at > clock_timestamp() - interval '60 seconds'
               and coalesce(s2.kind, '') <> 'simulado') >= public.gam_num('fraud.rate_limit_per_minute', 30) then
    v_reason := 'rate_limit';
  elsif v_mult <= 0 then
    v_reason := 'repeated_question_farming';
  end if;
  v_valid := v_reason is null;

  v_diff := public.gam_difficulty(q.id);
  v_hard := v_diff >= 0.6;
  b_base := public.gam_num('xp.question_answered', 2)::int;
  if new.is_correct then b_correct := public.gam_num('xp.question_correct', 8)::int; end if;
  if new.is_correct and v_hard then b_hard := public.gam_num('xp.hard_bonus', 4)::int; end if;
  if new.is_correct and v_attempt = 1 then b_first := public.gam_num('xp.first_attempt_bonus', 3)::int; end if;
  if v_attempt = 1 then b_unseen := public.gam_num('xp.unseen_bonus', 2)::int; end if;
  if v_prev_wrong and v_attempt <= 3 then
    b_review := public.gam_num('xp.review_wrong', 5)::int;
    if new.is_correct then b_fix := public.gam_num('xp.fix_wrong', 10)::int; end if;
  end if;
  v_total := round((b_base + b_correct + b_hard + b_first + b_unseen) * v_mult)::int + b_review + b_fix;
  v_coins := case when new.is_correct then public.gam_num('coins.per_correct', 1)::int else 0 end;

  perform public.gam_award(new.user_id, case when new.is_correct then 'QUESTION_CORRECT' else 'QUESTION_WRONG' end,
    'question_attempt', new.id::text, v_total, v_coins,
    jsonb_build_object('question_id', q.id, 'area', q.area, 'topic', q.topic, 'difficulty', v_diff, 'hard', v_hard,
                       'attempt_number', v_attempt, 'first_attempt', v_attempt = 1, 'previously_wrong', v_prev_wrong,
                       'response_time_ms', new.active_ms, 'session_id', new.session_id, 'session_kind', v_kind, 'multiplier', v_mult,
                       'breakdown', jsonb_strip_nulls(jsonb_build_object('base', nullif(b_base, 0), 'correct', nullif(b_correct, 0), 'difficulty_bonus', nullif(b_hard, 0),
                                                       'first_attempt_bonus', nullif(b_first, 0), 'unseen_bonus', nullif(b_unseen, 0),
                                                       'review_bonus', nullif(b_review, 0), 'fix_bonus', nullif(b_fix, 0)))),
    v_valid, v_reason);

  if v_valid then
    update public.user_gamification_stats s set
      questions_answered = s.questions_answered + 1,
      correct_answers = s.correct_answers + case when new.is_correct then 1 else 0 end,
      wrong_answers = s.wrong_answers + case when new.is_correct then 0 else 1 end,
      accuracy = round(100.0 * (s.correct_answers + case when new.is_correct then 1 else 0 end) / (s.questions_answered + 1), 2),
      last_qualified_activity_at = clock_timestamp()
      where s.user_id = new.user_id;
    if new.session_id is not null then
      select count(*)::int into v_in_session from public.question_attempts a where a.session_id = new.session_id and a.seq <= new.seq;
      if v_in_session = 10 then
        perform public.gam_award(new.user_id, 'SESSION_10', 'practice_session', new.session_id::text, public.gam_num('xp.session_10', 15)::int, 0, '{}'::jsonb);
      elsif v_in_session = 30 then
        perform public.gam_award(new.user_id, 'SESSION_30', 'practice_session', new.session_id::text, public.gam_num('xp.session_30', 30)::int, 0, '{}'::jsonb);
      end if;
    end if;
  end if;
  -- missões, sequência, score e medalhas rodam uma vez por comando (gam_process_attempts_done), não por linha
  return null;
end
$$;

-- Depois de cada comando de inserção (uma resposta no treino ou todas as do simulado): uma rodada por aluno.
create function public.gam_process_attempts_done() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  u uuid;
begin
  if not public.gam_flag('flags.gamification_enabled') then return null; end if;
  for u in select distinct n.user_id from new_attempts n loop
    perform public.gam_after_activity(u);
  end loop;
  return null;
end
$$;
create trigger question_attempts_play_done after insert on public.question_attempts
  referencing new table as new_attempts
  for each statement execute function public.gam_process_attempts_done();

revoke execute on function public.gam_process_attempts_done() from public, anon, authenticated;
revoke execute on function public.gam_facts(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.gam_check_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.gam_compute_score(uuid) from public, anon, authenticated;
revoke execute on function public.gam_process_attempt() from public, anon, authenticated;
