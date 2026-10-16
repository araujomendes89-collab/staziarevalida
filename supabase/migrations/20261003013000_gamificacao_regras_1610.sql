-- =============================================================================
-- Stazia Arena: regras novas de 16/10/2026 (decisões do dono depois da auditoria da gamificação).
-- Cole depois da 20261003012200 (e das demais do main). Pode colar mais de uma vez: valores absolutos, "create or replace",
-- "drop trigger if exists" e o registro do que mudou só é gravado na primeira vez.
-- Desfazer: supabase/desfazer/20261003013000_gamificacao_regras_1610.desfazer.sql. Conferir: supabase/conferir/gamificacao-regras-1610.sql.
--
-- O que muda (palavras do dono entre aspas):
--  1. "reduza em 20% geral a quantidade de xp": todo valor de XP das regras, das missões e das medalhas × 0,8, arredondado
--     para o inteiro mais perto (0,8 × um inteiro nunca dá meio exato). Ex.: acertar de primeira 15 → 12; difícil 19 → 15.
--  2. "quando um aluno nao acerta uma questao ou simulado, ele nao deve ganhar xp ou moedas": erro = 0 XP e 0 moedas, em
--     treino, simulado e Tutor. A resposta errada continua valendo para missão, sequência, precisão e caderno de erros.
--  3. "mesmo se ele refazer a mesma questao e acertar, trava por 3 dias a pontuacao": a mesma questão só volta a valer XP,
--     moeda, missão e sequência 3 dias depois da ÚLTIMA vez que foi respondida (certa ou errada). Leitura mais segura:
--     contar da última "vez que pontuou" deixaria errar de propósito e refazer na hora valendo.
--  4. Chute (decisão do dono): resposta abaixo do tempo mínimo de leitura (10 ms por caractere do enunciado e das alternativas,
--     entre 5 e 15 s) vale 0; do 3º chute detectado no dia em diante, -5 XP cada (evento GUESS_PENALTY, negativo, no histórico;
--     nunca deixa XP total/semana/mês/liga abaixo de zero). A multa de 5 não teve os -20% (é o número que o dono escolheu).
--  5. "desafios tambem nao devem ser repetidos no mesmo dia": missões já pagavam uma vez por período (dia/semana); agora os
--     bônus de 10 e 30 respostas numa sessão também valem uma vez por dia (antes, uma vez por sessão: dava para fatiar).
--  6. Moedas menores (o dono não quis mexer na loja; loja = 480 moedas): 1 moeda a cada 10 acertos que pontuam no dia
--     (antes: 1 por acerto), missão do dia 1 (antes 5), todas do dia 5 (antes 25), missão da semana 5 (antes 10 a 20),
--     medalhas pela metade (arredondado para cima), subir de liga 25 (antes 50). Simulação de 30 dias: aluno médio cerca de 250,
--     estudioso cerca de 420, muito ativo cerca de 710 moedas (antes: 1.448, 2.183 e 3.933).
--  7. Ligas: sobem 10% do grupo (para baixo, no mínimo 1: 30 alunos → 3; 9 → 1); descem 10% (idem), só em grupo de 10 ou mais.
--  8. As 5 brechas da auditoria:
--     G01 simulado só vale com 30+ questões, 80% respondidas sem chute, 1 por dia;
--     G02 plano do dia só vale no dia de hoje;
--     G04 o tempo que vale é o do navegador limitado ao medido pelo servidor (no treino, desde a resposta anterior ou o início
--         da sessão; no simulado, a soma das questões não passa do tempo da sessão aberta, sem as pausas);
--         sem tempo não vale; os minutos do dia têm teto de 10 min por resposta;
--     G05 gravação direta nas tabelas de estudo pela API é recusada (só funções app_*/tutor_*); horários sempre do servidor;
--     G06 flashcards: XP só de cartão oficial, "não lembrei" não vale, 40 por minuto no máximo, consolidado conferido pela
--         data da 1ª revisão; missão e fila contam só cartões OFICIAIS diferentes (cartão pessoal não conta).
--  9. Questão anulada ou gabarito trocado: o XP já ganho fica (decisão do dono). NADA é retroativo: XP, moedas e eventos antigos
--     não são recalculados.
-- O que mudou fica registrado em public.gamification_jobs (job 'regras_1610'), com os valores de antes.
-- Funções redefinidas e base (sempre a mais nova do main 55f837f6):
--   gam_award (3800) · gam_generate_missions (3800) · gam_facts (3900) · gam_process_attempt (8100) · gam_process_flashcard_review (8100)
--   gam_process_session_finish (8100) · gam_process_plan_task (8100) · gam_turn_summary (9573) · ch_worker_gamification_close_week (9630)
--   app_league_current (9630) · app_answer_question (4300). Nova: study_write_guard (+ gatilhos em question_attempts, practice_sessions, plan_tasks,
--   flashcard_reviews e flashcard_states).
-- =============================================================================

-- ---------------------------------------------------------------- 0. registro do que muda (só na primeira vez) e motivos novos
insert into public.gamification_jobs (job, period_key, result)
select 'regras_1610', '2026-10-16', jsonb_build_object(
  'motivo', 'Decisões do dono de 16/10/2026: -20% de XP, erro sem XP, trava de 3 dias, multa por chute, moedas menores, ligas 10%, 5 brechas.',
  'regras_antes', (select jsonb_object_agg(r.key, jsonb_build_object('value', r.value, 'enabled', r.enabled)) from public.gamification_rules r),
  'missoes_antes', (select jsonb_object_agg(m.slug, jsonb_build_object('xp', m.xp_reward, 'coins', m.coins_reward)) from public.missions m),
  'medalhas_antes', (select jsonb_object_agg(a.slug, jsonb_build_object('xp', a.xp_reward, 'coins', a.coins_reward)) from public.achievements a))
on conflict (job, period_key) do nothing;

alter table public.gamification_events drop constraint if exists gamification_events_fraud_reason_check;
alter table public.gamification_events add constraint gamification_events_fraud_reason_check
  check (fraud_reason in ('too_fast', 'duplicate_event', 'invalid_attempt', 'rate_limit', 'repeated_question_farming', 'guess', 'repeat_lock', 'no_time'));

-- ---------------------------------------------------------------- 2. regras, missões e medalhas (valores absolutos)
insert into public.gamification_rules (key, value, description) values
  ('xp.question_answered', '2'::jsonb, 'Parte do XP do ACERTO por responder (erro não vale XP).'),
  ('xp.question_correct', '6'::jsonb, 'Acertar questão.'),
  ('xp.hard_bonus', '3'::jsonb, 'Acertar questão difícil.'),
  ('xp.first_attempt_bonus', '2'::jsonb, 'Primeira tentativa correta.'),
  ('xp.unseen_bonus', '2'::jsonb, 'Questão inédita (primeira vez), só no acerto.'),
  ('xp.review_wrong', '4'::jsonb, 'Acertar questão que errou antes (depois da trava de dias).'),
  ('xp.fix_wrong', '8'::jsonb, 'Erro anterior corrigido (acerto depois da trava de dias).'),
  ('xp.session_10', '12'::jsonb, '10 respostas válidas numa sessão (uma vez por dia).'),
  ('xp.session_30', '24'::jsonb, '30 respostas válidas numa sessão (uma vez por dia).'),
  ('xp.simulation_completed', '80'::jsonb, 'Simulado completo: mínimo de questões, 80% respondidas sem chute, uma vez por dia.'),
  ('xp.simulation_min_questions', '30'::jsonb, 'Questões mínimas no simulado para valer o XP de simulado completo.'),
  ('xp.flashcard_reviewed', '2'::jsonb, 'Revisar um flashcard oficial lembrando (uma vez por cartão por dia; "não lembrei" e cartão pessoal não valem XP).'),
  ('xp.flashcard_mastered', '4'::jsonb, 'Consolidar um flashcard oficial (intervalo de 21 dias ou mais, desde a 1ª revisão há 21 dias ou mais).'),
  ('xp.spaced_review_done', '12'::jsonb, 'Zerar a fila de flashcards do dia (mínimo de 5 cartões diferentes).'),
  ('xp.lesson_completed', '16'::jsonb, 'Aula concluída e assistida até o fim.'),
  ('xp.daily_goal', '20'::jsonb, 'Plano de hoje concluído (só o plano do dia de hoje).'),
  ('xp.daily_missions', '40'::jsonb, 'Todas as missões do dia.'),
  ('xp.guess_penalty', '5'::jsonb, 'Multa (XP tirado) por chute detectado, a partir do chute de número xp.guess_penalty_from no dia.'),
  ('xp.guess_penalty_from', '3'::jsonb, 'A partir de qual chute detectado no dia a multa começa.'),
  ('repeat.lock_days', '3'::jsonb, 'Dias de trava: a mesma questão só volta a valer XP depois desse tempo desde a última vez que foi respondida.'),
  ('fraud.guess_ms_per_char', '10'::jsonb, 'Chute: tempo mínimo de leitura por caractere do enunciado e das alternativas (ms).'),
  ('fraud.guess_min_ms', '5000'::jsonb, 'Chute: tempo mínimo de leitura de qualquer questão (ms).'),
  ('fraud.guess_max_ms', '15000'::jsonb, 'Chute: teto do tempo mínimo de leitura (ms), para questões muito longas.'),
  ('fraud.flashcards_per_minute', '40'::jsonb, 'Mais revisões de flashcard que isso em 60 s não valem XP.'),
  ('fraud.max_ms_per_question', '600000'::jsonb, 'Teto do tempo de uma resposta nos minutos de estudo do dia (ms).'),
  ('coins.per_correct', '1'::jsonb, 'Moedas dadas a cada coins.correct_every acertos que pontuam no dia.'),
  ('coins.correct_every', '10'::jsonb, 'A cada quantos acertos que pontuam no dia o aluno ganha coins.per_correct moedas.'),
  ('coins.daily_missions', '5'::jsonb, 'Moedas por completar todas as missões do dia.'),
  ('coins.league_promoted', '25'::jsonb, 'Moedas por subir de liga.'),
  ('league.promote_pct', '10'::jsonb, 'Parte do grupo (%) que sobe de liga: para baixo, no mínimo 1 (ex.: 30 alunos → 3).'),
  ('league.relegate_pct', '10'::jsonb, 'Parte do grupo (%) que desce de liga, só em grupo com league.min_group_for_relegation alunos ou mais: para baixo, no mínimo 1.')
on conflict (key) do update set value = excluded.value, description = excluded.description, enabled = true, updated_at = now();

update public.gamification_rules r set enabled = false, description = v.d, updated_at = now()
from (values ('league.promote', 'Antiga (até 16/10/2026): quantos sobem por grupo. Trocada por league.promote_pct.'), ('league.relegate', 'Antiga (até 16/10/2026): quantos descem por grupo. Trocada por league.relegate_pct.')) as v (k, d)
where r.key = v.k and (r.enabled or r.description is distinct from v.d);

update public.missions m set xp_reward = v.xp, coins_reward = v.coins
from (values
  ('daily_correct', 12, 1),
  ('daily_areas', 8, 1),
  ('daily_review', 12, 1),
  ('daily_flashcards', 8, 1),
  ('daily_questions', 8, 1),
  ('weekly_questions', 48, 5),
  ('weekly_accuracy', 48, 5),
  ('weekly_areas', 24, 5),
  ('weekly_review', 32, 5),
  ('weekly_simulado', 40, 5)
) as v (slug, xp, coins)
where m.slug = v.slug and (m.xp_reward, m.coins_reward) is distinct from (v.xp, v.coins);

update public.achievements a set xp_reward = v.xp, coins_reward = v.coins
from (values
  ('cirurgia_geral_interno', 16, 5),
  ('ginecologia_obstetricia_interno', 16, 5),
  ('medicina_familia_comunidade_interno', 16, 5),
  ('clinica_medica_interno', 16, 5),
  ('pediatria_interno', 16, 5),
  ('medicina_familia_comunidade_residente', 32, 10),
  ('ginecologia_obstetricia_residente', 32, 10),
  ('clinica_medica_residente', 32, 10),
  ('cirurgia_geral_residente', 32, 10),
  ('pediatria_residente', 32, 10),
  ('clinica_medica_especialista', 64, 20),
  ('medicina_familia_comunidade_especialista', 64, 20),
  ('pediatria_especialista', 64, 20),
  ('ginecologia_obstetricia_especialista', 64, 20),
  ('cirurgia_geral_especialista', 64, 20),
  ('cirurgia_geral_mestre', 160, 50),
  ('ginecologia_obstetricia_mestre', 160, 50),
  ('pediatria_mestre', 160, 50),
  ('medicina_familia_comunidade_mestre', 160, 50),
  ('clinica_medica_mestre', 160, 50),
  ('top_10_semanal', 40, 13),
  ('corujao', 16, 5),
  ('cinco_da_manha', 16, 5),
  ('sobrevivente', 32, 10),
  ('imparavel', 80, 25),
  ('primeiros_passos', 8, 3),
  ('aquecendo_motores', 24, 8),
  ('maquina_de_questoes', 80, 25),
  ('insano', 240, 75),
  ('virada_de_jogo', 48, 15),
  ('aprendeu_mesmo', 48, 15),
  ('mira_boa', 24, 8),
  ('atirador_de_elite', 64, 20),
  ('quase_banca', 160, 50),
  ('streak_3', 8, 3),
  ('streak_7', 20, 5),
  ('streak_15', 40, 13),
  ('streak_30', 80, 25),
  ('streak_60', 160, 50),
  ('streak_100', 240, 75),
  ('streak_365', 800, 250)
) as v (slug, xp, coins)
where a.slug = v.slug and (a.xp_reward, a.coins_reward) is distinct from (v.xp, v.coins);

-- ---------------------------------------------------------------- 1. escrita só pelas funções do app (brecha G05)
-- O aluno só grava respostas, sessões, plano e flashcards pelas funções app_* (ou tutor_*) chamadas pela API (/rpc/...).
-- Gravação direta nas tabelas pela API (PostgREST: /question_attempts, /practice_sessions...) ou pelo GraphQL é recusada.
-- Também: o horário vem sempre do servidor (resposta, revisão, início da sessão, conclusão da tarefa), nunca do navegador.
-- Funções security definer (motor, Tutor, equipe) rodam com outro usuário e não passam por aqui.
create or replace function public.study_write_guard() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  v_path constant text := coalesce(current_setting('request.path', true), '');
begin
  if current_user in ('authenticated', 'anon') then
    if v_path <> '' and v_path !~ '^/rpc/(app_|tutor_)' then
      raise exception 'Gravação direta não é permitida: use o app.' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      if tg_table_name = 'question_attempts' then
        new.answered_at := clock_timestamp();   -- igual ao gatilho de correção: horário real de cada resposta
      elsif tg_table_name = 'flashcard_reviews' then
        new.reviewed_at := clock_timestamp();
      elsif tg_table_name = 'practice_sessions' then
        new.started_at := now();
        new.finished_at := null;
      end if;
    elsif tg_op = 'UPDATE' and tg_table_name = 'plan_tasks' then
      -- (campo lido só dentro do ramo da tabela certa: o registro das outras tabelas não tem done_at)
      if new.done_at is not null and old.done_at is null then
        new.done_at := now();
      end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke execute on function public.study_write_guard() from public, anon, authenticated;

drop trigger if exists study_write_guard on public.question_attempts;
create trigger study_write_guard before insert on public.question_attempts
  for each row execute function public.study_write_guard();
drop trigger if exists study_write_guard on public.practice_sessions;
create trigger study_write_guard before insert or update on public.practice_sessions
  for each row execute function public.study_write_guard();
drop trigger if exists study_write_guard on public.plan_tasks;
create trigger study_write_guard before insert or update or delete on public.plan_tasks
  for each row execute function public.study_write_guard();
drop trigger if exists study_write_guard on public.flashcard_reviews;
create trigger study_write_guard before insert on public.flashcard_reviews
  for each row execute function public.study_write_guard();
drop trigger if exists study_write_guard on public.flashcard_states;
create trigger study_write_guard before insert or update or delete on public.flashcard_states
  for each row execute function public.study_write_guard();

-- ---------------------------------------------------------------- 3. tempo medido pelo servidor (base: 20261003004300; brecha G04)
-- O tempo de cada resposta é o que o navegador manda, mas nunca mais que o tempo que o servidor viu passar desde a resposta
-- anterior da sessão (ou do início). No simulado (dá para ir e voltar), a soma das questões não passa do tempo da sessão aberta.
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
  v_client constant integer := least(greatest(coalesce(p_active_ms, 0), 0), 86400000);
  v_ms integer;          -- 16/10: tempo que vale = o do navegador, mas nunca mais que o medido pelo servidor
  v_ref timestamptz;
  v_gap bigint;
  v_others bigint;
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
    -- o simulado deixa ir e voltar entre as questões: a soma dos tempos de todas as questões nunca passa do tempo que o
    -- servidor viu a sessão aberta (sem as pausas); a desta questão fica com no máximo o que sobra das outras
    v_gap := greatest(floor(extract(epoch from (now() - s.started_at)) * 1000) - coalesce(s.paused_ms, 0), 0)::bigint;
    select coalesce(sum((d.value ->> 'ms')::bigint), 0) into v_others from jsonb_each(s.answers) d where d.key <> p_question_id;
    v_ms := least(case when v_client > 0 then v_client else 86400000 end, greatest(v_gap - v_others, 0), 86400000)::integer;
    update public.practice_sessions
      set answers = answers || jsonb_build_object(p_question_id, jsonb_build_object('option', p_option, 'ms', v_ms, 'at', now()))
      where id = s.id;
    return jsonb_build_object('saved', true);
  end if;

  select a.selected_option::text, a.id into v_selected, v_attempt
  from public.question_attempts a
  where a.session_id = s.id and a.question_id = p_question_id;
  if not found then
    -- tempo do servidor desde a resposta anterior desta sessão (ou do início da sessão)
    select greatest(s.started_at, max(a.answered_at)) into v_ref from public.question_attempts a where a.session_id = s.id;
    v_gap := greatest(floor(extract(epoch from (now() - coalesce(v_ref, s.started_at))) * 1000), 0)::bigint;
    v_ms := least(case when v_client > 0 then v_client else 86400000 end, v_gap, 86400000)::integer;
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

-- ---------------------------------------------------------------- gam_award (base: 20261003003800): grau de suspeita dos motivos novos
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
          case when p_valid then 0 when p_reason = 'rate_limit' then 80 when p_reason = 'guess' then 60
               when p_reason in ('repeat_lock', 'no_time') then 0 else 50 end)
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

-- ---------------------------------------------------------------- 4. XP de cada resposta (base: 20261003008100)
-- Mudanças de 16/10 (decisões do dono):
--  * erro = 0 XP e 0 moedas (treino, simulado, Tutor); a resposta errada continua contando em missão, sequência e precisão;
--  * trava de dias: a mesma questão só vale de novo depois de repeat.lock_days (3) dias da ÚLTIMA vez que foi respondida
--    (certa ou errada); dentro da trava a resposta é gravada, mas não vale XP, moeda, missão, sequência nem precisão;
--  * tempo: sem tempo medido não vale (no_time); abaixo do tempo mínimo de leitura é chute (guess): 0 XP e, do 3º chute
--    detectado no dia em diante (contando os "rápido demais"), multa de xp.guess_penalty (5) XP, lançada no histórico como
--    evento GUESS_PENALTY negativo, sem deixar XP total, da semana, do mês ou da liga abaixo de zero;
--  * moedas: coins.per_correct (1) a cada coins.correct_every (10) acertos que pontuam no dia;
--  * bônus de 10 e de 30 respostas numa sessão: uma vez por dia cada, contando só respostas válidas.
-- Resposta do Tutor (sem sessão, questão aberta na conversa do Tutor) não tem cronômetro: não passa pelas regras de tempo.
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
  v_total int := 0; v_coins int := 0; v_in_session int;
  v_kind text;
  v_tutor boolean := false;
  v_ms integer;
  v_chars integer; v_guess_ms integer;
  v_last timestamptz;
  v_today date; v_t0 timestamptz;
  v_chutes int; v_nth int; v_every int;
  v_pen int; v_ev bigint; v_league_xp int;
  st public.user_gamification_stats;
begin
  begin
    if not public.gam_flag('flags.gamification_enabled') then return null; end if;
    select * into q from public.questions where id = new.question_id;
    if q.status = 'annulled' then return null; end if;
    perform public.gam_ensure(new.user_id);
    perform pg_advisory_xact_lock(hashtextextended('gam:' || new.user_id::text, 0));
    select s.kind into v_kind from public.practice_sessions s where s.id = new.session_id;
    v_today := public.gam_today(new.user_id);
    v_t0 := v_today::timestamp at time zone public.gam_tz(new.user_id);

    select count(*)::int, max(a.answered_at) into v_prior, v_last from public.question_attempts a
      where a.user_id = new.user_id and a.question_id = new.question_id and a.seq < new.seq;
    select not a.is_correct into v_prev_wrong from public.question_attempts a
      where a.user_id = new.user_id and a.question_id = new.question_id and a.seq < new.seq order by a.seq desc limit 1;
    v_prev_wrong := coalesce(v_prev_wrong, false);
    v_attempt := v_prior + 1;
    v_mults := coalesce(public.gam_rule('repeat.multipliers'), '[1, 0.3, 0.1, 0]'::jsonb);
    v_mult := coalesce((v_mults ->> least(v_prior, jsonb_array_length(v_mults) - 1))::numeric, 0);

    -- resposta do Tutor: sem sessão, com a questão aberta na conversa do Tutor (a função do Tutor grava antes de fechar a questão)
    if new.session_id is null then
      v_tutor := exists (select 1 from public.tutor_sessions t
                         where t.user_id = new.user_id and t.question_id = new.question_id and t.question_state = 'open');
    end if;

    -- tempo mínimo de leitura (chute): caracteres do enunciado e das alternativas × ms por caractere, entre o mínimo e o teto
    v_ms := new.active_ms;
    v_chars := coalesce(length(q.statement), 0)
             + coalesce((select sum(length(coalesce(o ->> 'text', ''))) from jsonb_array_elements(q.options) o), 0)::int;
    v_guess_ms := least(greatest(v_chars * public.gam_num('fraud.guess_ms_per_char', 10), public.gam_num('fraud.guess_min_ms', 5000)),
                        public.gam_num('fraud.guess_max_ms', 15000))::int;

    if not v_tutor and (v_ms is null or v_ms <= 0) then
      v_reason := 'no_time';
    elsif not v_tutor and v_ms < public.gam_num('fraud.too_fast_ms', 3000) then
      v_reason := 'too_fast';
    -- o simulado grava todas as respostas de uma vez ao finalizar: não conta como enxurrada, nem entra na conta dos treinos
    elsif coalesce(v_kind, '') <> 'simulado'
          and (select count(*) from public.question_attempts a
               left join public.practice_sessions s2 on s2.id = a.session_id
               where a.user_id = new.user_id and a.seq < new.seq
                 and a.answered_at > clock_timestamp() - interval '60 seconds'
                 and coalesce(s2.kind, '') <> 'simulado') >= public.gam_num('fraud.rate_limit_per_minute', 30) then
      v_reason := 'rate_limit';
    elsif not v_tutor and v_ms < v_guess_ms then
      v_reason := 'guess';
    elsif v_last is not null and v_last > new.answered_at - make_interval(days => public.gam_num('repeat.lock_days', 3)::int) then
      v_reason := 'repeat_lock';
    elsif v_mult <= 0 then
      v_reason := 'repeated_question_farming';
    end if;
    v_valid := v_reason is null;

    v_diff := public.gam_difficulty(q.id);
    v_hard := v_diff >= 0.6;
    -- erro não vale XP nem moeda (decisão do dono, 16/10)
    if new.is_correct then
      b_base := public.gam_num('xp.question_answered', 2)::int;
      b_correct := public.gam_num('xp.question_correct', 6)::int;
      if v_hard then b_hard := public.gam_num('xp.hard_bonus', 3)::int; end if;
      if v_attempt = 1 then
        b_first := public.gam_num('xp.first_attempt_bonus', 2)::int;
        b_unseen := public.gam_num('xp.unseen_bonus', 2)::int;
      end if;
      if v_prev_wrong and v_attempt <= 3 then
        b_review := public.gam_num('xp.review_wrong', 4)::int;
        b_fix := public.gam_num('xp.fix_wrong', 8)::int;
      end if;
      v_total := round((b_base + b_correct + b_hard + b_first + b_unseen) * v_mult)::int + b_review + b_fix;
    end if;

    -- moedas: 1 a cada N acertos que pontuam no dia (conta este)
    if v_valid and new.is_correct and v_total > 0 then
      v_every := greatest(public.gam_num('coins.correct_every', 10)::int, 1);
      select count(*)::int + 1 into v_nth from public.gamification_events e
        where e.user_id = new.user_id and e.event_type = 'QUESTION_CORRECT' and e.is_valid and e.xp_awarded > 0 and e.created_at >= v_t0;
      if v_nth % v_every = 0 then v_coins := public.gam_num('coins.per_correct', 1)::int; end if;
    end if;

    perform public.gam_award(new.user_id, case when new.is_correct then 'QUESTION_CORRECT' else 'QUESTION_WRONG' end,
      'question_attempt', new.id::text, v_total, v_coins,
      jsonb_build_object('question_id', q.id, 'area', q.area, 'topic', q.topic, 'difficulty', v_diff, 'hard', v_hard,
                         'attempt_number', v_attempt, 'first_attempt', v_attempt = 1, 'previously_wrong', v_prev_wrong,
                         'response_time_ms', new.active_ms, 'min_read_ms', v_guess_ms, 'tutor', v_tutor,
                         'session_id', new.session_id, 'session_kind', v_kind, 'multiplier', v_mult,
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
      -- bônus de sessão: só respostas válidas contam, e cada bônus vale uma vez por dia
      if new.session_id is not null then
        select count(*)::int into v_in_session from public.question_attempts a
          where a.session_id = new.session_id and a.seq <= new.seq and not public.gam_invalid_attempt(new.user_id, a.id);
        if v_in_session = 10 then
          perform public.gam_award(new.user_id, 'SESSION_10', 'day', v_today::text, public.gam_num('xp.session_10', 12)::int, 0,
                                   jsonb_build_object('session_id', new.session_id));
        elsif v_in_session = 30 then
          perform public.gam_award(new.user_id, 'SESSION_30', 'day', v_today::text, public.gam_num('xp.session_30', 24)::int, 0,
                                   jsonb_build_object('session_id', new.session_id));
        end if;
      end if;
    end if;

    -- multa do chute: do N-ésimo chute detectado no dia em diante (os "rápido demais" contam como chute)
    if v_reason in ('guess', 'too_fast') then
      select count(*)::int into v_chutes from public.gamification_events e
        where e.user_id = new.user_id and e.source_type = 'question_attempt' and not e.is_valid
          and e.fraud_reason in ('guess', 'too_fast') and e.created_at >= v_t0;
      if v_chutes >= public.gam_num('xp.guess_penalty_from', 3)::int then
        select * into st from public.user_gamification_stats where user_id = new.user_id for update;
        select m.weekly_xp into v_league_xp from public.league_memberships m join public.league_seasons se on se.id = m.season_id
          where m.user_id = new.user_id and se.status = 'open' limit 1;
        -- nunca deixa nenhum contador abaixo de zero: tira o que der, até a multa
        v_pen := greatest(least(public.gam_num('xp.guess_penalty', 5)::int, st.total_xp, st.weekly_xp, st.monthly_xp, coalesce(v_league_xp, st.total_xp)), 0);
        insert into public.gamification_events (user_id, event_type, source_type, source_id, xp_awarded, coins_awarded, metadata, is_valid)
        values (new.user_id, 'GUESS_PENALTY', 'guess_penalty', new.id::text, -v_pen, 0,   -- origem própria: não se mistura com o evento da resposta
                jsonb_build_object('question_id', q.id, 'chutes_hoje', v_chutes, 'multa', public.gam_num('xp.guess_penalty', 5)::int, 'aplicada', v_pen,
                                   'response_time_ms', new.active_ms, 'min_read_ms', v_guess_ms), true)
        on conflict do nothing
        returning id into v_ev;
        if v_ev is not null and v_pen > 0 then
          update public.user_gamification_stats s
            set total_xp = s.total_xp - v_pen, weekly_xp = s.weekly_xp - v_pen, monthly_xp = s.monthly_xp - v_pen
            where s.user_id = new.user_id;
          update public.league_memberships m set weekly_xp = m.weekly_xp - v_pen
            from public.league_seasons se where se.id = m.season_id and se.status = 'open' and m.user_id = new.user_id;
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

-- ---------------------------------------------------------------- 5. flashcards (base: 20261003008100; brecha G06)
--  * XP só para cartão OFICIAL (o pessoal, criado pelo aluno, não vale XP: era ilimitado);
--  * "não lembrei" (nota 1) não vale XP (mesma regra do erro em questão);
--  * mais de fraud.flashcards_per_minute (40) revisões em 60 s: sem XP;
--  * "consolidado" exige, além do intervalo de 21 dias ou mais, a 1ª revisão do cartão pelo aluno há 21 dias ou mais
--    (a agenda vem do navegador; a data da 1ª revisão é do servidor);
--  * fila zerada: 5 cartões DIFERENTES ou mais revisados hoje.
create or replace function public.gam_process_flashcard_review() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_day text;
  v_state public.flashcard_states;
  v_official boolean;
  v_recent int;
  v_reviews int;
  v_first timestamptz;
  v_cons constant int := public.flashcard_consolidated_days();
begin
  begin
    v_day := public.gam_today(new.user_id)::text;
    if not public.gam_flag('flags.gamification_enabled') then return null; end if;
    perform public.gam_ensure(new.user_id);
    perform pg_advisory_xact_lock(hashtextextended('gam:' || new.user_id::text, 0));
    select c.owner_id is null into v_official from public.flashcards c where c.id = new.card_id;
    select count(*)::int into v_recent from public.flashcard_reviews r
      where r.user_id = new.user_id and r.id < new.id and r.reviewed_at > clock_timestamp() - interval '60 seconds';
    if coalesce(v_official, false) and new.rating > 1 and v_recent < public.gam_num('fraud.flashcards_per_minute', 40) then
      perform public.gam_award(new.user_id, 'FLASHCARD_REVIEWED', 'flashcard_day', new.card_id::text || ':' || v_day,
        public.gam_num('xp.flashcard_reviewed', 2)::int, 0, jsonb_build_object('rating', new.rating));
      select * into v_state from public.flashcard_states s where s.user_id = new.user_id and s.card_id = new.card_id;
      select min(r.reviewed_at) into v_first from public.flashcard_reviews r where r.user_id = new.user_id and r.card_id = new.card_id;
      if v_state.card_id is not null and v_state.state > 0 and v_state.scheduled_days >= v_cons and v_first <= now() - make_interval(days => v_cons) then
        perform public.gam_award(new.user_id, 'FLASHCARD_MASTERED', 'flashcard', new.card_id::text, public.gam_num('xp.flashcard_mastered', 4)::int, 0, '{}'::jsonb);
      end if;
    end if;
    -- fila do dia zerada (com pelo menos 5 cartões OFICIAIS diferentes hoje; cartão pessoal não conta)
    select count(distinct r.card_id)::int into v_reviews from public.flashcard_reviews r
      join public.flashcards c on c.id = r.card_id and c.owner_id is null
      where r.user_id = new.user_id and (r.reviewed_at at time zone public.gam_tz(new.user_id))::date = v_day::date;
    if v_reviews >= 5 and not exists (select 1 from public.flashcard_states s where s.user_id = new.user_id and s.state > 0 and s.due <= now() and s.card_id <> new.card_id) then
      perform public.gam_award(new.user_id, 'SPACED_REVIEW_DONE', 'day', v_day, public.gam_num('xp.spaced_review_done', 12)::int, 0, jsonb_build_object('reviews', v_reviews));
    end if;
    update public.user_gamification_stats set last_qualified_activity_at = clock_timestamp() where user_id = new.user_id;
    perform public.gam_after_activity(new.user_id);
  exception when others then
    perform public.gam_log_failure(new.user_id, 'flashcard_review', new.card_id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- ---------------------------------------------------------------- 6. simulado completo (base: 20261003008100; brecha G01)
-- Vale XP de simulado completo só se: o simulado tem xp.simulation_min_questions (30) questões ou mais; 80% delas ou mais
-- foram respondidas SEM chute (respostas "chute", "rápido demais", "sem tempo" e "enxurrada" não contam); e uma vez por dia.
create or replace function public.gam_process_session_finish() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_total int;
  v_answered int;
begin
  begin
    if not public.gam_flag('flags.gamification_enabled') or new.kind <> 'simulado' or new.finished_at is null or old.finished_at is not null then return null; end if;
    v_total := cardinality(new.question_ids);
    if v_total < public.gam_num('xp.simulation_min_questions', 30)::int then return null; end if;
    select count(*)::int into v_answered from public.question_attempts a
      where a.session_id = new.id
        and not exists (select 1 from public.gamification_events e
                        where e.user_id = new.user_id and e.source_type = 'question_attempt' and e.source_id = a.id::text
                          and not e.is_valid and e.fraud_reason in ('guess', 'too_fast', 'no_time', 'rate_limit'));
    if v_answered >= ceil(0.8 * v_total) then
      perform public.gam_ensure(new.user_id);
      perform public.gam_award(new.user_id, 'SIMULATION_COMPLETED', 'day', public.gam_today(new.user_id)::text,
                               public.gam_num('xp.simulation_completed', 80)::int, 0,
                               jsonb_build_object('session_id', new.id, 'total', v_total, 'answered', v_answered));
      perform public.gam_after_activity(new.user_id);
    end if;
  exception when others then
    perform public.gam_log_failure(new.user_id, 'session_finish', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- ---------------------------------------------------------------- 7. plano do dia (base: 20261003008100; brecha G02)
create or replace function public.gam_process_plan_task() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if new.done_at is null or old.done_at is not null or not public.gam_flag('flags.gamification_enabled') then return null; end if;
    -- 16/10: só o plano de HOJE (no fuso do aluno) vale XP; tarefa de outro dia não pontua
    if new.day is distinct from public.gam_today(new.user_id) then return null; end if;
    if not exists (select 1 from public.plan_tasks t where t.user_id = new.user_id and t.day = new.day and t.done_at is null) then
      perform public.gam_ensure(new.user_id);
      perform public.gam_award(new.user_id, 'DAILY_GOAL_COMPLETED', 'day', new.day::text, public.gam_num('xp.daily_goal', 20)::int, 0, '{}'::jsonb);
    end if;
  exception when others then
    perform public.gam_log_failure(new.user_id, 'plan_task', new.id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;

-- ---------------------------------------------------------------- 8. fatos do dia (base: 20261003003900): flashcards = cartões diferentes; teto por resposta nos minutos
create or replace function public.gam_facts(p_user uuid, p_from date, p_to date) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  -- intervalo em horário do aluno convertido para instantes (usa o índice por aluno e horário)
  with tz as (select public.gam_tz(p_user) as z),
  span as (select (p_from::timestamp at time zone (select z from tz)) as t0, ((p_to + 1)::timestamp at time zone (select z from tz)) as t1),
  bad as (select e.source_id from public.gamification_events e
          where e.user_id = p_user and e.source_type = 'question_attempt' and not e.is_valid),
  a as (
    select a.id, a.question_id, a.is_correct, least(coalesce(a.active_ms, 0), public.gam_num('fraud.max_ms_per_question', 600000)::int) as ms, q.area,
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
    'flashcards', (select count(distinct r.card_id)::int from public.flashcard_reviews r join public.flashcards c on c.id = r.card_id and c.owner_id is null
                   where r.user_id = p_user and r.reviewed_at >= (select t0 from span) and r.reviewed_at < (select t1 from span)),
    'simulados', (select count(*)::int from public.gamification_events e
                  where e.user_id = p_user and e.event_type = 'SIMULATION_COMPLETED'
                    and e.created_at >= (select t0 from span) and e.created_at < (select t1 from span)),
    'active_days', (select count(distinct day)::int from a)
  )
$$;

-- ---------------------------------------------------------------- 9. missão de revisão só com erro fora da trava (base: 20261003003800)
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
    -- 16/10: só conta o erro que já pode valer de novo (fora da trava de dias), senão a missão de revisão seria impossível hoje
    select count(*)::int into v_wrong from public.my_error_notebook_of(p_user) e
    where e.status = 'para_revisar'
      and not exists (select 1 from public.question_attempts a where a.user_id = p_user and a.question_id = e.question_id
                      and a.answered_at > now() - make_interval(days => public.gam_num('repeat.lock_days', 3)::int));
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

-- ---------------------------------------------------------------- 10. ligas: 10% sobem e 10% descem (base: 20261003009630)
create or replace function public.ch_worker_gamification_close_week() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  se public.league_seasons;
  nx public.league_seasons;
  v_size constant int := greatest(public.gam_num('league.group_size', 30)::int, 2);
  v_promote_pct constant numeric := public.gam_num('league.promote_pct', 10);   -- 16/10: parte do grupo, não número fixo
  v_relegate_pct constant numeric := public.gam_num('league.relegate_pct', 10);
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
      -- 16/10: sobem 10% do grupo (para baixo, no mínimo 1); descem 10% (idem), só em grupo grande o bastante
      when x.pos <= greatest(1, floor(x.n * v_promote_pct / 100))::int and m.weekly_xp > 0 and l.position < (select max(position) from public.leagues) then 'promoted'
      when x.n >= v_min_group and x.pos > x.n - greatest(1, floor(x.n * v_relegate_pct / 100))::int and l.position > 1 then 'relegated'
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
      perform public.gam_award(r.user_id, 'LEAGUE_PROMOTED', 'season', se.id::text, 0, public.gam_num('coins.league_promoted', 25)::int,
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

-- ---------------------------------------------------------------- 11. resumo da resposta (base: 20261003009573): multa, acerto e trava
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
    -- 16/10: multa por chute (XP tirado) e se a resposta estava certa (erro não vale XP)
    'penalty', (select coalesce(-sum(e.xp_awarded), 0)::int from public.gamification_events e
                where e.user_id = p_user and e.event_type = 'GUESS_PENALTY' and e.source_type = 'guess_penalty' and e.source_id = p_attempt::text),
    'correct', (select a.is_correct from public.question_attempts a where a.id = p_attempt and a.user_id = p_user),
    'lock_days', public.gam_num('repeat.lock_days', 3)::int,
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

-- ---------------------------------------------------------------- 12. tela da liga (base: 20261003009630): quantos sobem e descem no grupo (10%)
create or replace function public.app_league_current() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  se public.league_seasons;
  m public.league_memberships;
  v_size constant int := public.gam_num('league.group_size', 30)::int;
  v_up_pct constant numeric := public.gam_num('league.promote_pct', 10);     -- 16/10: 10% do grupo, para baixo, no mínimo 1
  v_down_pct constant numeric := public.gam_num('league.relegate_pct', 10);
  v_n int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.leagues_enabled') then return jsonb_build_object('enabled', false); end if;
  select * into se from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  if se.id is null then return jsonb_build_object('enabled', true, 'joined', false); end if;
  select * into m from public.league_memberships where season_id = se.id and user_id = v_uid;
  -- AR05: a equipe não participa de liga (mesmo que ainda haja uma inscrição antiga, ela some da tela)
  if not found or public.user_is_staff(v_uid) then
    return jsonb_build_object('enabled', true, 'joined', false, 'ends_on', se.ends_on, 'group_size', v_size,
      'promote', greatest(1, floor(v_size * v_up_pct / 100))::int, 'relegate', greatest(1, floor(v_size * v_down_pct / 100))::int,
      'promote_pct', v_up_pct, 'relegate_pct', v_down_pct,
      'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l));
  end if;
  select count(*)::int into v_n from public.league_memberships o
    where o.season_id = se.id and o.league_slug = m.league_slug and o.group_no = m.group_no and not public.user_is_staff(o.user_id);
  return jsonb_build_object(
    'enabled', true, 'joined', true, 'season', jsonb_build_object('starts_on', se.starts_on, 'ends_on', se.ends_on),
    'league', (select to_jsonb(l) from public.leagues l where l.slug = m.league_slug),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'group_no', m.group_no, 'promote', greatest(1, floor(v_n * v_up_pct / 100))::int, 'relegate', greatest(1, floor(v_n * v_down_pct / 100))::int,
    'promote_pct', v_up_pct, 'relegate_pct', v_down_pct,
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

-- ---------------------------------------------------------------- permissões (create or replace mantém as antigas; reforço)
revoke execute on function public.gam_process_attempt() from public, anon, authenticated;
revoke execute on function public.gam_process_flashcard_review() from public, anon, authenticated;
revoke execute on function public.gam_process_session_finish() from public, anon, authenticated;
revoke execute on function public.gam_process_plan_task() from public, anon, authenticated;
revoke execute on function public.ch_worker_gamification_close_week() from public, anon, authenticated;
