-- Conferência da 20261003013000_gamificacao_regras_1610.sql (regras novas da Arena de 16/10/2026). Só leitura.
-- Cole depois de aplicar. Tudo que é "ok_..." precisa vir true; os números ao lado ajudam a achar o que faltou.
select
  -- regras novas e valores com -20%
  (select count(*) from public.gamification_rules where key in ('repeat.lock_days', 'xp.guess_penalty', 'xp.guess_penalty_from', 'xp.simulation_min_questions',
     'fraud.guess_ms_per_char', 'fraud.guess_min_ms', 'fraud.guess_max_ms', 'fraud.flashcards_per_minute', 'fraud.max_ms_per_question',
     'coins.correct_every', 'league.promote_pct', 'league.relegate_pct') and enabled) = 12 as ok_regras_novas,
  (select jsonb_object_agg(key, value) from public.gamification_rules where key in ('xp.question_correct', 'xp.simulation_completed', 'xp.daily_goal', 'coins.daily_missions', 'coins.league_promoted'))
    = '{"xp.question_correct": 6, "xp.simulation_completed": 80, "xp.daily_goal": 20, "coins.daily_missions": 5, "coins.league_promoted": 25}'::jsonb as ok_valores,
  (select count(*) from public.gamification_rules where key in ('league.promote', 'league.relegate') and not enabled) = 2 as ok_ligas_antigas_desligadas,
  (select xp_reward = 12 and coins_reward = 1 from public.missions where slug = 'daily_correct') as ok_missoes,
  (select xp_reward = 800 and coins_reward = 250 from public.achievements where slug = 'streak_365') as ok_medalhas,
  -- registro do antes
  (select (result -> 'regras_antes' -> 'xp.question_correct' ->> 'value')::int from public.gamification_jobs where job = 'regras_1610') as xp_acerto_antes,
  -- motor e travas
  (select count(*) from pg_trigger where tgname = 'study_write_guard') = 5 as ok_trava_gravacao_direta,
  (select prosrc like '%repeat_lock%' and prosrc like '%GUESS_PENALTY%' and prosrc like '%coins.correct_every%' from pg_proc where proname = 'gam_process_attempt') as ok_motor_resposta,
  (select prosrc like '%simulation_min_questions%' from pg_proc where proname = 'gam_process_session_finish') as ok_simulado,
  (select prosrc like '%gam_today(new.user_id)%' from pg_proc where proname = 'gam_process_plan_task') as ok_plano_so_hoje,
  (select prosrc like '%owner_id is null%' from pg_proc where proname = 'gam_process_flashcard_review') as ok_flashcard_oficial,
  (select prosrc like '%v_gap%' from pg_proc where proname = 'app_answer_question') as ok_tempo_do_servidor,
  (select prosrc like '%league.promote_pct%' from pg_proc where proname = 'ch_worker_gamification_close_week') as ok_ligas_10,
  (select prosrc like '%guess_penalty%' from pg_proc where proname = 'gam_turn_summary') as ok_resumo,
  (select pg_get_constraintdef(oid) like '%repeat_lock%' from pg_constraint where conname = 'gamification_events_fraud_reason_check') as ok_motivos,
  -- nada retroativo: o livro-razão continua batendo com o saldo (XP e moedas)
  (select count(*) from public.user_gamification_stats s
     where s.total_xp <> coalesce((select sum(e.xp_awarded) from public.gamification_events e where e.user_id = s.user_id), 0)) = 0 as ok_razao_xp,
  (select count(*) from public.user_gamification_stats s
     where s.coins <> coalesce((select sum(t.amount) from public.coin_transactions t where t.user_id = s.user_id), 0)) = 0 as ok_razao_moedas;
