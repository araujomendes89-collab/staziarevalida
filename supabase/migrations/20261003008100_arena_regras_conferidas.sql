-- =============================================================================
-- Stazia Arena: regras conferidas e XP que nunca cancela o que o aluno fez (correção AR01, 2026-10-10).
--
-- Antes: o campo das regras aceitava qualquer valor e o banco salvava sem conferir. Uma regra de número com
-- texto (ex.: "dez") fazia o cálculo de XP dar erro a cada resposta, e o erro cancelava a gravação da resposta
-- de todos os alunos.
--
-- Agora:
--  1. O banco confere o tipo de cada regra ao salvar (pela tela ou direto no banco), com mensagem em português:
--     flags.*  → ligar e desligar (true/false);
--     names.*  → texto entre aspas, não vazio;
--     repeat.multipliers → lista de números entre 0 e 1;
--     as demais (xp, moedas, antifraude, score, ranking, sequência, ligas, missões, trilha) → número de 0 a 1.000.000
--     (o limite evita o estouro dos inteiros do motor).
--  2. Os gatilhos do motor (resposta, depois da resposta, simulado finalizado, flashcard, tarefa do plano e aula)
--     rodam protegidos: se o cálculo falhar, o que o aluno fez é gravado, o XP daquela ação fica de fora e a falha
--     fica registrada em gamification_failures (só administradores leem). O resumo da resposta (gam_turn_summary)
--     também não derruba a resposta.
--  3. A Administração (app_admin_gamification) passa a mostrar as falhas dos últimos 7 dias e as regras com problema.
--
-- Os corpos dos gatilhos são os das versões mais novas (…3900 para a resposta e depois da resposta, …3800 para
-- flashcard, simulado e plano, …4000 para a aula), só envolvidos pela proteção. Nada é apagado.
-- =============================================================================

-- ---------------------------------------------------------------- tipo de cada regra
create function public.gam_rule_kind(p_key text) returns text
  language sql immutable set search_path = ''
as $$
  select case
    when p_key like 'flags.%' then 'flag'
    when p_key like 'names.%' then 'name'
    when p_key = 'repeat.multipliers' then 'list'
    else 'number' end
$$;

-- Devolve o problema do valor (mensagem em português) ou nulo se o valor serve para a regra.
create function public.gam_rule_problem(p_key text, p_value jsonb) returns text
  language plpgsql stable set search_path = ''
as $$
declare
  v_kind constant text := public.gam_rule_kind(p_key);
  v_type constant text := jsonb_typeof(p_value);
begin
  if v_kind = 'flag' then
    if v_type = 'boolean' then return null; end if;
    return format('A regra %s é de ligar e desligar: use true (ligado) ou false (desligado).', p_key);
  elsif v_kind = 'name' then
    if v_type = 'string' and btrim(p_value #>> '{}') <> '' then return null; end if;
    return format('A regra %s é um nome: escreva o texto entre aspas, por exemplo "Stazia Score".', p_key);
  elsif v_kind = 'list' then
    if v_type = 'array' and jsonb_array_length(p_value) > 0
       and not exists (select 1 from jsonb_array_elements(p_value) e
                       where not (case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric between 0 and 1 else false end)) then
      return null;
    end if;
    return format('A regra %s precisa ser uma lista de números entre 0 e 1, por exemplo [1, 0.3, 0.1, 0].', p_key);
  end if;
  if v_type is distinct from 'number' then
    return format('A regra %s precisa ser um número, sem aspas (por exemplo: 8).', p_key);
  end if;
  if (p_value #>> '{}')::numeric not between 0 and 1000000 then
    return format('A regra %s precisa ser um número entre 0 e 1.000.000.', p_key);
  end if;
  return null;
end
$$;

-- Confere ao salvar (vale para a tela da Administração e para qualquer gravação direta no banco).
create function public.gam_rules_check() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_problem text;
begin
  v_problem := public.gam_rule_problem(new.key, new.value);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger gamification_rules_check before insert or update of key, value on public.gamification_rules
  for each row execute function public.gam_rules_check();

-- ---------------------------------------------------------------- registro das falhas do cálculo
create table public.gamification_failures (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  step text not null,              -- question_attempt, after_activity, session_finish, flashcard_review, plan_task, lesson
  source_id text,
  sqlstate text,
  detail text not null,
  bad_rules text[] not null default '{}',   -- regras ligadas com valor inválido no momento da falha
  created_at timestamptz not null default now()
);
create index gamification_failures_created_idx on public.gamification_failures (created_at desc);
alter table public.gamification_failures enable row level security;
create policy "falhas do play: só administradores" on public.gamification_failures
  for select to authenticated using (public.is_admin());

-- Registra a falha sem nunca derrubar quem chamou.
create function public.gam_log_failure(p_user uuid, p_step text, p_source_id text, p_sqlstate text, p_detail text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    insert into public.gamification_failures (user_id, step, source_id, sqlstate, detail, bad_rules)
    values (p_user, p_step, p_source_id, p_sqlstate, left(coalesce(p_detail, ''), 1000),
            coalesce((select array_agg(r.key order by r.key) from public.gamification_rules r
                      where r.enabled and public.gam_rule_problem(r.key, r.value) is not null), '{}'));
  exception when others then
    raise warning 'Stazia Arena: falha no cálculo de XP (%) não registrada: %', p_step, sqlerrm;
  end;
end
$$;

-- =============================================================================
-- GATILHOS PROTEGIDOS
-- =============================================================================

-- Resposta (…3900), protegida.
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

-- Depois de cada comando de inserção (…3900): uma rodada por aluno, cada uma protegida.
create or replace function public.gam_process_attempts_done() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  u uuid;
begin
  for u in select distinct n.user_id from new_attempts n loop
    begin
      if public.gam_flag('flags.gamification_enabled') then
        perform public.gam_after_activity(u);
      end if;
    exception when others then
      perform public.gam_log_failure(u, 'after_activity', null, sqlstate, sqlerrm);
    end;
  end loop;
  return null;
end
$$;

-- Flashcard revisado (…3800), protegido.
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

-- Simulado finalizado com pelo menos 80% das questões respondidas (…3800), protegido.
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

-- Plano de hoje concluído (…3800), protegido.
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

-- Aula concluída (…4000), protegida.
create or replace function public.gam_process_lesson() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if new.completed_at is null or (tg_op = 'UPDATE' and old.completed_at is not null) then return null; end if;
    if not public.gam_flag('flags.gamification_enabled') then return null; end if;
    perform public.gam_ensure(new.user_id);
    perform public.gam_award(new.user_id, 'LESSON_COMPLETED', 'lesson', new.lesson_id::text, public.gam_num('xp.lesson_completed', 20)::int, 0,
                             (select jsonb_build_object('area', l.area, 'topic', l.topic, 'title', l.title) from public.lessons l where l.id = new.lesson_id));
    update public.user_gamification_stats set last_qualified_activity_at = clock_timestamp() where user_id = new.user_id;
    perform public.gam_after_activity(new.user_id);
  exception when others then
    perform public.gam_log_failure(new.user_id, 'lesson', new.lesson_id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- O que a resposta rendeu (…3800), agora sem derrubar a resposta: se não der para montar o resumo, volta nulo.
create or replace function public.gam_turn_summary(p_user uuid, p_attempt uuid) returns jsonb
  language plpgsql stable set search_path = ''
as $$
begin
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

-- =============================================================================
-- ADMINISTRAÇÃO (…3800): igual, mais as falhas do cálculo (7 dias) e as regras com valor inválido.
-- =============================================================================
create or replace function public.app_admin_gamification() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'rules', (select jsonb_agg(to_jsonb(r) order by r.key) from public.gamification_rules r),
    'rule_problems', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'problem', public.gam_rule_problem(r.key, r.value)) order by r.key)
                               from public.gamification_rules r where public.gam_rule_problem(r.key, r.value) is not null), '[]'::jsonb),
    'levels', (select jsonb_agg(to_jsonb(l) order by l.position) from public.levels l),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'achievements', (select jsonb_agg(to_jsonb(a) order by a.category, a.position) from public.achievements a),
    'missions', (select jsonb_agg(to_jsonb(m) order by m.period, m.position) from public.missions m),
    'rewards', (select jsonb_agg(to_jsonb(x) order by x.position) from public.rewards x),
    'metrics', jsonb_build_object(
      'users_active', (select count(*) from public.user_gamification_stats where last_qualified_activity_at > now() - interval '7 days'),
      'users_total', (select count(*) from public.user_gamification_stats),
      'xp_today', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at >= public.today_br()::timestamptz),
      'xp_7d', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at > now() - interval '7 days'),
      'coins_issued', (select coalesce(sum(amount), 0) from public.coin_transactions where amount > 0),
      'missions_completed_7d', (select count(*) from public.user_missions where completed_at > now() - interval '7 days'),
      'achievements_7d', (select count(*) from public.user_achievements where unlocked_at > now() - interval '7 days'),
      'avg_streak', (select round(avg(current_streak), 1) from public.user_gamification_stats where current_streak > 0),
      'suspicious_7d', (select count(*) from public.gamification_events where not is_valid and created_at > now() - interval '7 days'),
      'suspicious_by_reason', (select coalesce(jsonb_object_agg(x.r, x.n), '{}'::jsonb) from (select fraud_reason as r, count(*) as n from public.gamification_events where not is_valid group by 1) x),
      'by_league', (select coalesce(jsonb_object_agg(x.l, x.n), '{}'::jsonb) from (select coalesce(current_league, 'sem liga') as l, count(*) as n from public.user_gamification_stats group by 1) x),
      'top10', coalesce((select jsonb_agg(public.gam_board_row(b.user_id, null) || jsonb_build_object('rank', b.rank, 'user_id', b.user_id) order by b.rank)
                         from public.gam_board('geral') b where b.rank <= 10), '[]'::jsonb),
      'events_24h', (select count(*) from public.gamification_events where created_at > now() - interval '24 hours'),
      'season', (select to_jsonb(s) from public.league_seasons s where s.status = 'open' order by s.starts_on desc limit 1),
      'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.ran_at desc) from (select * from public.gamification_jobs order by ran_at desc limit 10) j), '[]'::jsonb),
      'xp_failures_7d', (select count(*) from public.gamification_failures where created_at > now() - interval '7 days'),
      'xp_failures_recent', coalesce((select jsonb_agg(jsonb_build_object('created_at', f.created_at, 'step', f.step, 'bad_rules', f.bad_rules, 'detail', f.detail) order by f.id desc)
                                      from (select * from public.gamification_failures order by id desc limit 5) f), '[]'::jsonb)));
end
$$;

-- ---------------------------------------------------------------- permissões: o motor não é executável pelo cliente
revoke execute on function public.gam_rule_kind(text) from public, anon, authenticated;
revoke execute on function public.gam_rule_problem(text, jsonb) from public, anon, authenticated;
revoke execute on function public.gam_rules_check() from public, anon, authenticated;
revoke execute on function public.gam_log_failure(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.gam_process_attempt() from public, anon, authenticated;
revoke execute on function public.gam_process_attempts_done() from public, anon, authenticated;
revoke execute on function public.gam_process_flashcard_review() from public, anon, authenticated;
revoke execute on function public.gam_process_session_finish() from public, anon, authenticated;
revoke execute on function public.gam_process_plan_task() from public, anon, authenticated;
revoke execute on function public.gam_process_lesson() from public, anon, authenticated;
revoke execute on function public.app_admin_gamification() from anon;

-- ---------------------------------------------------------------- conferência do que já está gravado
-- No editor do Supabase, o resultado abaixo lista as regras que JÁ estavam com valor inválido antes desta correção
-- (vazio = tudo certo). Se aparecer alguma, corrija na Administração > Stazia Arena > Regras.
select r.key as regra, r.value as valor_gravado, public.gam_rule_problem(r.key, r.value) as problema
from public.gamification_rules r
where public.gam_rule_problem(r.key, r.value) is not null
order by r.key;
