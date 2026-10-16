-- =============================================================================
-- DESFAZER da 20261003013000_gamificacao_regras_1610.sql (regras novas da Arena de 16/10/2026).
-- Volta: as funções às versões de antes (cada uma copiada da sua migração-base), tira a trava de gravação direta, devolve os
-- valores de regras, missões e medalhas guardados em public.gamification_jobs (job 'regras_1610') e apaga as regras novas.
-- NÃO desfaz (de propósito): o XP, as moedas e os eventos já lançados com as regras novas, inclusive as multas por chute
-- (GUESS_PENALTY): o histórico é imutável; se precisar devolver multas, faça lançamentos contrários. A lista de motivos
-- aceitos em gamification_events.fraud_reason fica com os 3 novos (guess, repeat_lock, no_time), porque já pode haver
-- eventos com eles; isso não muda nada no cálculo.
-- Pode colar mais de uma vez.
-- =============================================================================

do $$
declare
  j jsonb := (select result from public.gamification_jobs where job = 'regras_1610' and period_key = '2026-10-16');
begin
  if j is null then
    raise notice 'Sem o registro regras_1610: valores de regras, missões e medalhas não foram devolvidos.';
    return;
  end if;
  -- regras: devolve valor e liga/desliga de antes; regra que não existia antes sai
  update public.gamification_rules r set value = x.value -> 'value', enabled = (x.value ->> 'enabled')::boolean, updated_at = now()
    from jsonb_each(j -> 'regras_antes') x where r.key = x.key;
  delete from public.gamification_rules r where not (j -> 'regras_antes') ? r.key;
  update public.missions m set xp_reward = (x.value ->> 'xp')::int, coins_reward = (x.value ->> 'coins')::int
    from jsonb_each(j -> 'missoes_antes') x where m.slug = x.key;
  update public.achievements a set xp_reward = (x.value ->> 'xp')::int, coins_reward = (x.value ->> 'coins')::int
    from jsonb_each(j -> 'medalhas_antes') x where a.slug = x.key;
end
$$;

-- descrições de antes das regras que mudaram de texto (as que não existiam antes já saíram acima)
update public.gamification_rules r set description = v.d from (values
  ('xp.question_answered', 'Responder questão.'), ('xp.question_correct', 'Acertar questão.'), ('xp.hard_bonus', 'Acertar questão difícil.'),
  ('xp.first_attempt_bonus', 'Primeira tentativa correta.'), ('xp.unseen_bonus', 'Questão inédita.'), ('xp.review_wrong', 'Revisar questão previamente errada.'),
  ('xp.fix_wrong', 'Corrigir erro anterior.'), ('xp.session_10', 'Completar 10 questões numa sessão.'), ('xp.session_30', 'Completar 30 questões numa sessão.'),
  ('xp.simulation_completed', 'Simulado completo (≥ 80% das questões respondidas).'), ('xp.flashcard_reviewed', 'Revisar um flashcard (uma vez por cartão por dia).'),
  ('xp.flashcard_mastered', 'Consolidar um flashcard (intervalo ≥ 21 dias).'), ('xp.spaced_review_done', 'Zerar a fila de flashcards do dia (mínimo de 5 revisões).'),
  ('xp.lesson_completed', 'Aula concluída (quando as aulas forem ligadas).'), ('xp.daily_goal', 'Plano de hoje concluído.'), ('xp.daily_missions', 'Todas as missões do dia.'),
  ('coins.per_correct', 'Moedas por acerto válido.'), ('coins.daily_missions', 'Moedas por completar todas as missões do dia.'),
  ('coins.league_promoted', 'Moedas por subir de liga.'), ('league.promote', 'Quantos sobem por grupo.'), ('league.relegate', 'Quantos descem por grupo.')
) as v (k, d) where r.key = v.k;

-- trava de gravação direta
drop trigger if exists study_write_guard on public.question_attempts;
drop trigger if exists study_write_guard on public.practice_sessions;
drop trigger if exists study_write_guard on public.plan_tasks;
drop trigger if exists study_write_guard on public.flashcard_reviews;
drop trigger if exists study_write_guard on public.flashcard_states;
drop function if exists public.study_write_guard();

-- Tutor: marca de abertura da questão (só servia para medir o tempo da resposta)
drop trigger if exists tutor_question_opened_at on public.tutor_sessions;
drop function if exists public.tutor_question_opened_at();
alter table public.tutor_sessions drop column if exists question_opened_at;

-- funções: versões de antes (copiadas das migrações-base)

-- gam_award: base 20261003003800_stazia_play.sql
create or replace function public.gam_award(
  p_user uuid, p_type text, p_source_type text, p_source_id text,
  p_xp integer, p_coins integer, p_meta jsonb default '{}'::jsonb, p_valid boolean default true, p_reason text default null
) returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_xp constant integer := case when p_valid then greatest(coalesce(p_xp, 0), 0) else 0 end;
  v_coins constant integer := case when p_valid and public.gam_flag('flags.coins_enabled') then greatest(coalesce(p_coins, 0), 0) else 0 end;
begin
  perform public.gam_ensure(p_user);
  insert into public.gamification_events (user_id, event_type, source_type, source_id, xp_awarded, coins_awarded, metadata, is_valid, fraud_reason, fraud_score)
  values (p_user, p_type, p_source_type, p_source_id, v_xp, v_coins, coalesce(p_meta, '{}'::jsonb), p_valid, p_reason,
          case when p_valid then 0 when p_reason = 'rate_limit' then 80 else 50 end)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  if v_xp > 0 or v_coins > 0 then
    update public.user_gamification_stats s
      set total_xp = s.total_xp + v_xp, weekly_xp = s.weekly_xp + v_xp, monthly_xp = s.monthly_xp + v_xp, coins = s.coins + v_coins
      where s.user_id = p_user;
    if v_coins > 0 then
      insert into public.coin_transactions (user_id, amount, type, source_type, source_id, metadata)
      values (p_user, v_coins, 'earn', p_type, p_source_id, jsonb_build_object('event_id', v_id));
    end if;
    if v_xp > 0 and public.gam_flag('flags.leagues_enabled') then
      perform public.gam_join_league(p_user);
      update public.league_memberships m set weekly_xp = m.weekly_xp + v_xp
        from public.league_seasons se where se.id = m.season_id and se.status = 'open' and m.user_id = p_user;
    end if;
  end if;
  return v_id;
end
$$;

-- gam_generate_missions: base 20261003003800_stazia_play.sql
create or replace function public.gam_generate_missions(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_today constant date := public.gam_today(p_user);
  v_week constant date := public.gam_week_start(v_today);
  v_third text;
  v_wrong integer;
  m public.missions;
begin
  if not exists (select 1 from public.user_missions where user_id = p_user and period = 'daily' and period_start = v_today) then
    select count(*)::int into v_wrong from public.my_error_notebook_of(p_user) e where e.status = 'para_revisar';
    v_third := case
      when v_wrong >= 3 then 'daily_review'
      when exists (select 1 from public.flashcards c where (c.owner_id is null and c.published) or c.owner_id = p_user) then 'daily_flashcards'
      else 'daily_questions' end;
    for m in select * from public.missions where active and period = 'daily' and (slug = v_third or not (params ? 'alternative')) order by position loop
      insert into public.user_missions (user_id, mission_slug, period, period_start, target)
      values (p_user, m.slug, 'daily', v_today,
              case when m.slug = 'daily_review' then least(v_wrong, public.gam_num(m.target_rule, m.target_default)::int)
                   else public.gam_num(m.target_rule, m.target_default)::int end)
      on conflict do nothing;
    end loop;
  end if;
  if not exists (select 1 from public.user_missions where user_id = p_user and period = 'weekly' and period_start = v_week) then
    for m in select * from public.missions where active and period = 'weekly' order by position loop
      insert into public.user_missions (user_id, mission_slug, period, period_start, target)
      values (p_user, m.slug, 'weekly', v_week, public.gam_num(m.target_rule, m.target_default)::int)
      on conflict do nothing;
    end loop;
  end if;
end
$$;

-- gam_facts: base 20261003003900_stazia_play_desempenho.sql
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

-- gam_process_attempt: base 20261003008100_arena_regras_conferidas.sql
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
  exception when others then
    -- a resposta já está gravada: o XP desta resposta fica de fora, com registro
    perform public.gam_log_failure(new.user_id, 'question_attempt', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- gam_process_flashcard_review: base 20261003008100_arena_regras_conferidas.sql
create or replace function public.gam_process_flashcard_review() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_day text;
  v_state public.flashcard_states;
  v_reviews int;
begin
  begin
    v_day := public.gam_today(new.user_id)::text;
    if not public.gam_flag('flags.gamification_enabled') then return null; end if;
    perform public.gam_ensure(new.user_id);
    perform pg_advisory_xact_lock(hashtextextended('gam:' || new.user_id::text, 0));
    perform public.gam_award(new.user_id, 'FLASHCARD_REVIEWED', 'flashcard_day', new.card_id::text || ':' || v_day,
      public.gam_num('xp.flashcard_reviewed', 2)::int, 0, jsonb_build_object('rating', new.rating));
    select * into v_state from public.flashcard_states s where s.user_id = new.user_id and s.card_id = new.card_id;
    if found and v_state.state > 0 and v_state.scheduled_days >= public.flashcard_consolidated_days() then
      perform public.gam_award(new.user_id, 'FLASHCARD_MASTERED', 'flashcard', new.card_id::text, public.gam_num('xp.flashcard_mastered', 5)::int, 0, '{}'::jsonb);
    end if;
    -- fila do dia zerada (com pelo menos 5 revisões hoje)
    select count(*)::int into v_reviews from public.flashcard_reviews r
      where r.user_id = new.user_id and (r.reviewed_at at time zone public.gam_tz(new.user_id))::date = v_day::date;
    if v_reviews >= 5 and not exists (select 1 from public.flashcard_states s where s.user_id = new.user_id and s.state > 0 and s.due <= now() and s.card_id <> new.card_id) then
      perform public.gam_award(new.user_id, 'SPACED_REVIEW_DONE', 'day', v_day, public.gam_num('xp.spaced_review_done', 15)::int, 0, jsonb_build_object('reviews', v_reviews));
    end if;
    update public.user_gamification_stats set last_qualified_activity_at = clock_timestamp() where user_id = new.user_id;
    perform public.gam_after_activity(new.user_id);
  exception when others then
    perform public.gam_log_failure(new.user_id, 'flashcard_review', new.card_id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- gam_process_session_finish: base 20261003008100_arena_regras_conferidas.sql
create or replace function public.gam_process_session_finish() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_answered int;
begin
  begin
    if not public.gam_flag('flags.gamification_enabled') or new.kind <> 'simulado' or new.finished_at is null or old.finished_at is not null then return null; end if;
    select count(*)::int into v_answered from public.question_attempts a where a.session_id = new.id;
    if v_answered >= ceil(0.8 * cardinality(new.question_ids)) then
      perform public.gam_ensure(new.user_id);
      perform public.gam_award(new.user_id, 'SIMULATION_COMPLETED', 'practice_session', new.id::text, public.gam_num('xp.simulation_completed', 100)::int, 0,
                               jsonb_build_object('total', cardinality(new.question_ids), 'answered', v_answered));
      perform public.gam_after_activity(new.user_id);
    end if;
  exception when others then
    perform public.gam_log_failure(new.user_id, 'session_finish', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- gam_process_plan_task: base 20261003008100_arena_regras_conferidas.sql
create or replace function public.gam_process_plan_task() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if new.done_at is null or old.done_at is not null or not public.gam_flag('flags.gamification_enabled') then return null; end if;
    if not exists (select 1 from public.plan_tasks t where t.user_id = new.user_id and t.day = new.day and t.done_at is null) then
      perform public.gam_ensure(new.user_id);
      perform public.gam_award(new.user_id, 'DAILY_GOAL_COMPLETED', 'day', new.day::text, public.gam_num('xp.daily_goal', 25)::int, 0, '{}'::jsonb);
    end if;
  exception when others then
    perform public.gam_log_failure(new.user_id, 'plan_task', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- gam_turn_summary: base 20261003009573_arena_regras_funcoes_fechadas.sql
create or replace function public.gam_turn_summary(p_user uuid, p_attempt uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  -- security definer: só devolve o resumo do próprio aluno (antes isso vinha do RLS, que a função não tinha como burlar)
  if p_user is distinct from (select auth.uid()) then return null; end if;
  return (
  select case when not public.gam_flag('flags.gamification_enabled') then null else jsonb_build_object(
    'xp', (select jsonb_build_object('total', e.xp_awarded, 'valid', e.is_valid, 'reason', e.fraud_reason, 'multiplier', e.metadata -> 'multiplier') || coalesce(e.metadata -> 'breakdown', '{}'::jsonb)
           from public.gamification_events e where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text),
    'bonus', coalesce((select jsonb_agg(jsonb_build_object('type', e.event_type, 'xp', e.xp_awarded, 'coins', e.coins_awarded, 'meta', e.metadata))
                       from public.gamification_events e where e.user_id = p_user and e.created_at >= now() and e.xp_awarded > 0
                         and e.event_type in ('SESSION_10', 'SESSION_30', 'MISSION_COMPLETED', 'DAILY_MISSIONS_COMPLETED', 'DAILY_GOAL_COMPLETED')), '[]'::jsonb),
    'coins', (select e.coins_awarded from public.gamification_events e where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text),
    'stats', (select jsonb_build_object('total_xp', s.total_xp, 'weekly_xp', s.weekly_xp, 'coins', s.coins, 'score', s.stazia_score, 'provisional', s.provisional,
                                        'level', s.current_level, 'streak', s.current_streak, 'streak_today', s.last_qualified_date = public.gam_today(p_user))
              from public.user_gamification_stats s where s.user_id = p_user),
    'streak_incremented', exists (select 1 from public.gamification_events e where e.user_id = p_user and e.event_type = 'STREAK_INCREMENTED' and e.created_at >= now()),
    'level_up', (select jsonb_build_object('from', e.metadata ->> 'from', 'to', e.metadata ->> 'to') from public.gamification_events e
                 where e.user_id = p_user and e.event_type = 'LEVEL_UP' and e.created_at >= now() order by e.id desc limit 1),
    'achievements_unlocked', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'description', a.description, 'icon', a.icon, 'rarity', a.rarity, 'xp', a.xp_reward, 'coins', a.coins_reward))
                                       from public.user_achievements u join public.achievements a on a.slug = u.achievement_slug
                                       where u.user_id = p_user and u.unlocked_at >= now()), '[]'::jsonb),
    'missions', (select jsonb_build_object('done', count(*) filter (where u.completed_at is not null), 'total', count(*))
                 from public.user_missions u where u.user_id = p_user and u.period = 'daily' and u.period_start = public.gam_today(p_user))) end
  );
exception when others then
  return null;
end
$$;

-- ch_worker_gamification_close_week: base 20261003009630_arena_sem_equipe.sql
create or replace function public.ch_worker_gamification_close_week() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  se public.league_seasons;
  nx public.league_seasons;
  v_size constant int := greatest(public.gam_num('league.group_size', 30)::int, 2);
  v_promote constant int := public.gam_num('league.promote', 5)::int;
  v_relegate constant int := public.gam_num('league.relegate', 5)::int;
  v_min_group constant int := public.gam_num('league.min_group_for_relegation', 10)::int;
  v_active constant int := public.gam_num('league.active_days', 14)::int;
  v_today constant date := public.today_br();
  v_leagues constant boolean := public.gam_flag('flags.leagues_enabled');
  v_closed int := 0; v_promoted int := 0; v_relegated int := 0; v_staff_out int := 0;
  r record;
begin
  -- AR06: Arena desligada, a semana não vira
  if not public.gam_flag('flags.gamification_enabled') then
    return jsonb_build_object('closed', false, 'skipped', 'arena_desligada');
  end if;
  select * into se from public.league_seasons where status = 'open' and ends_on < v_today order by starts_on limit 1 for update;
  if not found then return jsonb_build_object('closed', false); end if;
  if exists (select 1 from public.gamification_jobs j where j.job = 'close_week' and j.period_key = se.id::text) then
    return jsonb_build_object('closed', false, 'already', true);
  end if;

  -- AR05: quem virou equipe depois de entrar na liga sai da temporada que fecha (só a inscrição; XP, moedas e histórico ficam).
  -- Assim a equipe nunca ocupa posição, sobe, desce nem ganha medalha de top 10, e os alunos contam só entre alunos.
  with fora as (
    delete from public.league_memberships m where m.season_id = se.id and public.user_is_staff(m.user_id) returning m.*
  ), reg as (
    insert into public.gamification_jobs (job, period_key, result)
    select 'arena_sem_equipe', 'semana-' || se.id::text, jsonb_build_object('season', se.id, 'removed', count(*), 'memberships', jsonb_agg(to_jsonb(f)))
    from fora f having count(*) > 0
    on conflict (job, period_key) do nothing
  )
  select count(*) into v_staff_out from fora;

  -- posições e desfechos
  update public.league_memberships m set position = x.pos,
    outcome = case
      -- AR06: com as ligas desligadas ninguém sobe nem desce
      when not v_leagues then 'stayed'
      -- AR02: só sobe quem estudou na semana (XP semanal maior que zero)
      when x.pos <= v_promote and m.weekly_xp > 0 and l.position < (select max(position) from public.leagues) then 'promoted'
      when x.n >= v_min_group and x.pos > x.n - v_relegate and l.position > 1 then 'relegated'
      else 'stayed' end
  from (select o.user_id, row_number() over (partition by o.league_slug, o.group_no order by o.weekly_xp desc,
          (select count(*) from public.gamification_events e where e.user_id = o.user_id and e.event_type = 'QUESTION_CORRECT'
             -- AR03: a semana vai da meia-noite de segunda à meia-noite de domingo em Brasília (e não do horário universal)
             and e.created_at >= (se.starts_on::timestamp at time zone 'America/Sao_Paulo')
             and e.created_at < ((se.ends_on + 1)::timestamp at time zone 'America/Sao_Paulo')) desc,
          o.joined_at, o.user_id) as pos,
        count(*) over (partition by o.league_slug, o.group_no) as n
        from public.league_memberships o where o.season_id = se.id) x,
       public.leagues l
  where m.season_id = se.id and m.user_id = x.user_id and l.slug = m.league_slug;

  for r in select m.user_id, m.league_slug, m.outcome, m.position, m.weekly_xp, l.position as lpos
           from public.league_memberships m join public.leagues l on l.slug = m.league_slug where m.season_id = se.id loop
    v_closed := v_closed + 1;
    if r.outcome = 'promoted' then
      v_promoted := v_promoted + 1;
      update public.user_gamification_stats set current_league = (select slug from public.leagues where position = r.lpos + 1) where user_id = r.user_id;
      perform public.gam_award(r.user_id, 'LEAGUE_PROMOTED', 'season', se.id::text, 0, public.gam_num('coins.league_promoted', 50)::int,
                               jsonb_build_object('from', r.league_slug, 'position', r.position));
    elsif r.outcome = 'relegated' then
      v_relegated := v_relegated + 1;
      update public.user_gamification_stats set current_league = (select slug from public.leagues where position = r.lpos - 1) where user_id = r.user_id;
      perform public.gam_award(r.user_id, 'LEAGUE_RELEGATED', 'season', se.id::text, 0, 0, jsonb_build_object('from', r.league_slug, 'position', r.position));
    end if;
    -- a medalha do top 10 também exige ter estudado na semana
    if v_leagues and r.position <= 10 and r.weekly_xp > 0 and (select count(*) from public.league_memberships o where o.season_id = se.id and o.league_slug = r.league_slug
                             and o.group_no = (select group_no from public.league_memberships where season_id = se.id and user_id = r.user_id)) >= 10 then
      perform public.gam_unlock(r.user_id, 'top_10_semanal');
    end if;
  end loop;

  -- foto da semana (ranking geral) e zera o XP semanal
  insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
  select s.user_id, 'week', se.starts_on, se.ends_on, b.rank, b.total, s.stazia_score, s.weekly_xp, s.accuracy
  from public.user_gamification_stats s left join public.gam_board('geral') b on b.user_id = s.user_id
  on conflict do nothing;
  update public.user_gamification_stats set weekly_xp = 0 where weekly_xp <> 0;
  update public.league_seasons set status = 'closed', closed_at = now() where id = se.id;

  -- nova temporada com os ativos, grupos equilibrados por score (determinístico)
  insert into public.league_seasons (starts_on, ends_on) values (greatest(se.ends_on + 1, public.gam_week_start(v_today)), greatest(se.ends_on + 1, public.gam_week_start(v_today)) + 6)
  on conflict (starts_on) do update set status = 'open', closed_at = null returning * into nx;
  if v_leagues then
    insert into public.league_memberships (season_id, user_id, league_slug, group_no)
    select nx.id, x.user_id, x.league, ceil(x.rn::numeric / v_size)::int
    from (select s.user_id, coalesce(s.current_league, 'bronze') as league,
                 row_number() over (partition by coalesce(s.current_league, 'bronze') order by s.stazia_score desc, s.user_id) as rn
          from public.user_gamification_stats s
          -- AR05: a equipe não é inscrita na temporada nova
          where not public.user_is_staff(s.user_id)
            and s.last_qualified_activity_at >= now() - make_interval(days => v_active)) x
    on conflict do nothing;
  end if;

  insert into public.gamification_jobs (job, period_key, result) values ('close_week', se.id::text,
    jsonb_build_object('closed', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id, 'leagues', v_leagues, 'staff_removed', v_staff_out));
  return jsonb_build_object('closed', true, 'season', se.id, 'members', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id, 'leagues', v_leagues, 'staff_removed', v_staff_out);
end
$$;

-- app_league_current: base 20261003009630_arena_sem_equipe.sql
create or replace function public.app_league_current() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  se public.league_seasons;
  m public.league_memberships;
  v_size constant int := public.gam_num('league.group_size', 30)::int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.leagues_enabled') then return jsonb_build_object('enabled', false); end if;
  select * into se from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  if se.id is null then return jsonb_build_object('enabled', true, 'joined', false); end if;
  select * into m from public.league_memberships where season_id = se.id and user_id = v_uid;
  -- AR05: a equipe não participa de liga (mesmo que ainda haja uma inscrição antiga, ela some da tela)
  if not found or public.user_is_staff(v_uid) then
    return jsonb_build_object('enabled', true, 'joined', false, 'ends_on', se.ends_on,
      'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l));
  end if;
  return jsonb_build_object(
    'enabled', true, 'joined', true, 'season', jsonb_build_object('starts_on', se.starts_on, 'ends_on', se.ends_on),
    'league', (select to_jsonb(l) from public.leagues l where l.slug = m.league_slug),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'group_no', m.group_no, 'promote', public.gam_num('league.promote', 5)::int, 'relegate', public.gam_num('league.relegate', 5)::int,
    'min_group_for_relegation', public.gam_num('league.min_group_for_relegation', 10)::int, 'group_size', v_size,
    'rows', coalesce((select jsonb_agg(public.gam_board_row(x.user_id, v_uid) || jsonb_build_object('position', x.pos, 'weekly_xp', x.weekly_xp) order by x.pos)
                      from (select o.user_id, o.weekly_xp, row_number() over (order by o.weekly_xp desc, o.joined_at, o.user_id) as pos
                            from public.league_memberships o where o.season_id = se.id and o.league_slug = m.league_slug and o.group_no = m.group_no
                              and not public.user_is_staff(o.user_id)) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('starts_on', s2.starts_on, 'league', h.league_slug, 'position', h.position, 'outcome', h.outcome, 'weekly_xp', h.weekly_xp) order by s2.starts_on desc)
                         from public.league_memberships h join public.league_seasons s2 on s2.id = h.season_id
                         where h.user_id = v_uid and s2.status = 'closed'), '[]'::jsonb));
end
$$;

-- app_answer_question: base 20261003004300_simulado_cronometro.sql
create or replace function public.app_answer_question(
  p_session_id uuid,
  p_question_id text,
  p_option text,
  p_active_ms integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_selected text;
  v_attempt uuid;
  v_ms constant integer := least(greatest(coalesce(p_active_ms, 0), 0), 86400000);
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if s.finished_at is not null then
    raise exception 'Esta sessão já foi finalizada.' using errcode = '22023';
  end if;
  if p_question_id is null or not (p_question_id = any (s.question_ids)) then
    raise exception 'Questão fora desta sessão.' using errcode = '22023';
  end if;
  if p_option is null or p_option not in ('A', 'B', 'C', 'D') then
    raise exception 'Alternativa inválida.' using errcode = '22023';
  end if;
  if s.paused_at is not null then
    raise exception 'O simulado está pausado. Continue para responder.' using errcode = '22023';
  end if;
  -- 15 s de tolerância para a resposta que saiu do navegador no último segundo; as pausas não contam.
  if s.time_limit_seconds is not null
     and clock_timestamp() > public.practice_deadline(s, clock_timestamp()) + interval '15 seconds' then
    raise exception 'O tempo do simulado acabou.' using errcode = '22023';
  end if;

  if s.kind = 'simulado' then
    update public.practice_sessions
      set answers = answers || jsonb_build_object(p_question_id, jsonb_build_object('option', p_option, 'ms', v_ms))
      where id = s.id;
    return jsonb_build_object('saved', true);
  end if;

  select a.selected_option::text, a.id into v_selected, v_attempt
  from public.question_attempts a
  where a.session_id = s.id and a.question_id = p_question_id;
  if not found then
    insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
    values (p_question_id, s.id, p_option, v_ms)
    returning id into v_attempt;
    v_selected := p_option;
  else
    v_attempt := null;   -- resposta repetida: devolve a correção, sem "play" (nada foi concedido agora)
  end if;

  return public.practice_correction_view(p_question_id, v_selected)
    || jsonb_build_object('selected', v_selected, 'play', case when v_attempt is null then null else public.gam_turn_summary((select auth.uid()), v_attempt) end);
end
$$;

revoke execute on function public.gam_process_attempt() from public, anon, authenticated;
revoke execute on function public.gam_process_flashcard_review() from public, anon, authenticated;
revoke execute on function public.gam_process_session_finish() from public, anon, authenticated;
revoke execute on function public.gam_process_plan_task() from public, anon, authenticated;
revoke execute on function public.ch_worker_gamification_close_week() from public, anon, authenticated;
