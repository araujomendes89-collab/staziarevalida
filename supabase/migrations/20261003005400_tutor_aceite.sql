-- =============================================================================
-- Tutores de IA só com o aceite do §34 do Termo (versão vigente de `tutor_ia` em legal_versions, ver …5300_termo_aceite).
-- Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seção 8).
--
-- Regra no banco, não só na tela. "Aluno" é o de legal_is_student (papel student e nenhuma área de revisão médica); administrador,
-- editor e revisor médico ficam dispensados. O banco lê o papel e a versão vigente a cada chamada. Aluno sem o aceite da versão
-- vigente não começa conversa, não abre conversa antiga, não responde e não pede a próxima questão (todos com a mesma mensagem,
-- 'Aceite do Tutor pendente.', logo depois de conferir o login) e a lista de conversas vem vazia.
--
--   * tutor_consent_pending(p_user): o apoio que decide (nasce fechado: só o servidor e as funções do Tutor, que rodam como o dono, o chamam);
--   * app_tutor_status: ganha consent_required e consent_version, para a tela mostrar o cartão do aceite no lugar do aviso de plano;
--   * app_tutor_start, app_tutor_session, tutor_next_for e tutor_answer_for recusam (app_tutor_answer, app_tutor_next_question e as
--     funções do servidor ch_worker_tutor_answer_as e ch_worker_tutor_next_as passam por estas duas últimas);
--   * app_tutor_sessions devolve [] enquanto o aceite estiver pendente (as conversas ficam guardadas e voltam depois do aceite);
--   * ch_worker_tutor_context e ch_worker_tutor_speech ganham consent_pending, para o servidor recusar antes de gastar IA ou voz.
--
-- Cada função abaixo é a última definição que existia, com a conferência a mais (nada mais mudou). Todas são recriadas com a mesma
-- assinatura, então as permissões de antes continuam como estão; só tutor_consent_pending é nova e nasce fechada.
-- =============================================================================

-- ---------------------------------------------------------------- apoio (só o servidor executa)
-- Verdadeiro para aluno que ainda não aceitou a versão vigente dos Tutores de IA. Falso para equipe, revisor médico e sem usuário.
-- Se a versão vigente faltar em legal_versions, ninguém tem o aceite dela: vale como pendente (nunca libera por engano).
create function public.tutor_consent_pending(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.legal_is_student(p_user)
     and not exists (
       select 1
       from public.legal_versions v
       join public.legal_acceptances a on a.document = v.document and a.version = v.version
       where v.document = 'tutor_ia' and a.user_id = p_user)
$$;

-- ---------------------------------------------------------------- status do Tutor (…3500_tutor_v2)
-- Mais: consent_required (aluno sem o aceite da versão vigente: a tela mostra o cartão do aceite, antes do aviso de plano) e
-- consent_version (a versão vigente, para todos). O resto, como era.
create or replace function public.app_tutor_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  c public.tutor_config;
  p public.tutor_preferences;
  e jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into c from public.tutor_config;
  select * into p from public.tutor_preferences where user_id = v_user;
  e := public.tutor_entitlement(v_user);
  return jsonb_build_object(
    'enabled', c.enabled, 'available', (e ->> 'can_use')::boolean, 'requires_pro', c.requires_pro,
    'entitlement', e,
    'daily_limit', (e #>> '{text,limit}')::int, 'used_today', (e #>> '{text,used}')::int,
    'max_profanity', c.max_profanity, 'voice_enabled', c.voice_enabled,
    'preferences', case when p.user_id is null or not exists (select 1 from public.tutor_personalities t where t.id = p.personality_id and t.active)
      then jsonb_build_object('personality_id', 'acolhedor', 'profanity', 'off', 'chosen', false)
      else jsonb_build_object('personality_id', p.personality_id, 'profanity', p.profanity, 'chosen', true) end,
    'personalities', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'swears', (t.params ->> 'profanity')::int >= 20, 'voice', t.voice) order by t.position)
                      from public.tutor_personalities t where t.active),
    'reviews_due', (select count(*)::int from public.tutor_reviews r where r.user_id = v_user and r.due_at <= now()),
    'consent_required', public.tutor_consent_pending(v_user),
    'consent_version', (select v.version from public.legal_versions v where v.document = 'tutor_ia'));
end
$$;

-- ---------------------------------------------------------------- histórico (…3500_tutor_v2)
-- Com o aceite pendente a lista vem vazia (as conversas ficam guardadas e voltam à lista depois do aceite).
create or replace function public.app_tutor_sessions(p_limit integer default 20) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'mode', s.mode, 'status', s.status, 'last_message_at', s.last_message_at,
           'personality', (select t.emoji from public.tutor_personalities t where t.id = s.personality_id),
           'persona', (select t.name from public.tutor_personalities t where t.id = s.personality_id),
           'minutes', greatest(1, round(coalesce(s.duration_seconds, extract(epoch from (s.last_message_at - s.created_at))::int) / 60.0))::int,
           'questions', (select count(*)::int from public.tutor_answers a where a.session_id = s.id)) order by s.last_message_at desc), '[]'::jsonb)
  from (select * from public.tutor_sessions
        where user_id = (select auth.uid()) and not (select public.tutor_consent_pending((select auth.uid())))
        order by last_message_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) s
$$;

-- ---------------------------------------------------------------- nova conversa (…3700_tutor_motor_personalidade)
-- Mais: sem o aceite, recusa logo depois do login, antes do plano, do modo e de qualquer gravação (nenhuma conversa nasce antes do aceite).
create or replace function public.app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null, p_context jsonb default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  e jsonb;
  p public.tutor_preferences;
  t public.tutor_personalities;
  v_q text := nullif(p_question_id, '');
  v_ctype text := nullif(p_context ->> 'type', '');
  v_cid text := left(nullif(p_context ->> 'id', ''), 200);
  v_clabel text := left(nullif(btrim(p_context ->> 'label'), ''), 160);
  v_area text := nullif(p_context ->> 'area', '');
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
  v_id uuid;
  v_title text;
  v_open text;
  v_state text := 'none';
  v_strong boolean;
  v_mood text := (array['good', 'neutral', 'neutral', 'impatient'])[1 + floor(random() * 4)::int];
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if public.tutor_consent_pending(v_user) then raise exception 'Aceite do Tutor pendente.' using errcode = '42501'; end if;
  e := public.tutor_entitlement(v_user);
  if not (e ->> 'enabled')::boolean then raise exception 'O Tutor ainda não está ligado.' using errcode = '55000'; end if;
  if e ->> 'mode' = 'blocked' then raise exception 'Seu teste grátis do Tutor terminou. O Tutor continua nos planos pagos.' using errcode = '42501'; end if;
  if p_mode not in ('livre', 'aula', 'revisao', 'perguntas', 'questao', 'erros') then raise exception 'Modo inválido.' using errcode = '22023'; end if;
  if v_ctype is not null and v_ctype not in ('question', 'error', 'theme', 'area', 'flashcard', 'weak_points', 'free') then raise exception 'Contexto inválido.' using errcode = '22023'; end if;
  if v_area is not null and not exists (select 1 from unnest(enum_range(null::public.med_area)) a where a::text = v_area) then raise exception 'Área inválida.' using errcode = '22023'; end if;
  select * into p from public.tutor_preferences where user_id = v_user;
  if not found or not exists (select 1 from public.tutor_personalities x where x.id = p.personality_id and x.active) then
    insert into public.tutor_preferences (user_id) values (v_user)
    on conflict (user_id) do update set personality_id = 'acolhedor', profanity = 'off', intensity = 3 returning * into p;
  end if;
  select * into t from public.tutor_personalities where id = p.personality_id;
  v_strong := public.tutor_profanity(t.id, p.profanity) = 'moderate';

  if p_mode in ('questao', 'erros') then
    if (e #>> '{questions,remaining}') is not null and (e #>> '{questions,remaining}')::int <= 0 then
      raise exception 'Você chegou ao limite de % questões de hoje no teste grátis. Amanhã tem mais.', e #>> '{questions,limit}' using errcode = '54000';
    end if;
    v_q := coalesce(v_q, public.tutor_pick_question(v_user, p_mode, 3::smallint, '{}', v_area));
    if v_q is null then
      raise exception '%', case when p_mode = 'erros' then 'Você não tem erros para revisar agora.' else 'Não há questão disponível para treinar agora.' end using errcode = 'P0002';
    end if;
    v_state := 'open';
  elsif v_q is not null then
    -- conversar sobre uma questão específica só depois de respondê-la (mesma regra da correção)
    if not public.question_viewable(v_q) then raise exception 'Responda a questão antes de discuti-la com o Tutor.' using errcode = '42501'; end if;
    v_state := 'answered';
  end if;
  if v_q is not null and not exists (select 1 from public.questions where id = v_q and status <> 'annulled') then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if v_q is not null and v_ctype is null then v_ctype := 'question'; v_cid := v_q; end if;

  v_title := left(coalesce(
    case when v_ctype = 'weak_points' then 'Meus pontos fracos' end,
    case when p_mode = 'erros' and v_area is not null then 'Erros de ' || initcap(replace(lower(v_area), '_', ' ')) end,
    v_clabel, v_topic, (select q.topic from public.questions q where q.id = v_q),
    case when v_area is not null then initcap(replace(lower(v_area), '_', ' ')) end,
    case p_mode when 'livre' then 'Perguntar ao Tutor' when 'aula' then 'Aula' when 'revisao' then 'Revisão rápida' when 'perguntas' then 'Me teste'
                when 'questao' then 'Questões' else 'Meus erros' end), 120);
  insert into public.tutor_sessions (user_id, mode, title, topic, question_id, question_state, personality_id, intensity, settings, context_type, context_id, context_label, emotion)
  values (v_user, p_mode, v_title, coalesce(v_topic, case when v_ctype in ('theme', 'flashcard') then v_clabel end), v_q, v_state, t.id, 3,
          jsonb_build_object('profanity', p.profanity, 'adaptive', true, 'params', t.params, 'area', v_area),
          v_ctype, coalesce(v_cid, v_area), v_clabel,
          -- humor do dia: muda o jeito de começar, nunca o conteúdo (o resto do estado nasce no servidor, pelo motor do professor)
          jsonb_build_object('session_mood', v_mood, 'frustration', case v_mood when 'impatient' then 12 when 'good' then 0 else 5 end))
  returning id into v_id;
  -- abertura: na voz do personagem e variando entre conversas (sem IA e sem conteúdo médico)
  v_open := case
    when p_mode = 'erros' then public.tutor_line(t.id, 'review', v_id::text, null, v_strong)
    when p_mode = 'questao' then public.tutor_line(t.id, 'question', v_id::text, null, v_strong)
    when coalesce(v_topic, v_clabel) is not null and v_ctype is distinct from 'weak_points' then public.tutor_line(t.id, 'topic', v_id::text, coalesce(v_topic, v_clabel), v_strong)
    when t.lines ? ('opening_' || v_mood) then public.tutor_line(t.id, 'opening_' || v_mood, v_id::text, null, false)
    else public.tutor_line(t.id, 'opening', v_id::text, null, v_strong) end;
  -- discutir uma questão já respondida (no treino ou no Tutor): o professor pergunta o porquê da escolha
  if v_state = 'answered' then
    v_open := coalesce((select public.tutor_line(t.id, 'discuss', v_id::text, a.selected_option::text, false)
                        from public.question_attempts a where a.user_id = v_user and a.question_id = v_q order by a.answered_at desc, a.seq desc limit 1), v_open);
  end if;
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (v_id, v_user, 'tutor', v_open, jsonb_build_object('opening', true, 'grounding', 'none'));
  return public.app_tutor_session(v_id);
end
$$;

-- ---------------------------------------------------------------- próxima questão (…3700_tutor_motor_personalidade)
-- Mais: sem o aceite, recusa antes de procurar a conversa (o app e a voz do servidor passam por aqui).
create or replace function public.tutor_next_for(v_user uuid, p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  e jsonb;
  v_q text;
begin
  if public.tutor_consent_pending(v_user) then raise exception 'Aceite do Tutor pendente.' using errcode = '42501'; end if;
  select * into s from public.tutor_sessions where id = p_session_id and user_id = v_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.status <> 'active' then raise exception 'Esta conversa foi encerrada. Abra uma nova.' using errcode = '55000'; end if;
  if s.mode not in ('questao', 'erros') then raise exception 'Esta conversa não é de questões.' using errcode = '22023'; end if;
  if s.question_state = 'open' then raise exception 'Responda a questão atual antes de pedir a próxima.' using errcode = '22023'; end if;
  if s.emotion ->> 'gate' = 'explain' then raise exception 'Antes da próxima: explique ao professor o seu raciocínio nesta questão.' using errcode = '22023'; end if;
  e := public.tutor_entitlement(v_user);
  if e ->> 'mode' = 'blocked' then raise exception 'Seu teste grátis do Tutor terminou. O Tutor continua nos planos pagos.' using errcode = '42501'; end if;
  if (e #>> '{questions,remaining}') is not null and (e #>> '{questions,remaining}')::int <= 0 then
    raise exception 'Você chegou ao limite de % questões de hoje no teste grátis. Amanhã tem mais.', e #>> '{questions,limit}' using errcode = '54000';
  end if;
  v_q := public.tutor_pick_question(v_user, s.mode, s.difficulty_level,
           array(select distinct a.question_id from public.tutor_answers a where a.session_id = s.id) || coalesce(array[s.question_id], '{}'), s.settings ->> 'area');
  if v_q is null then raise exception '%', case when s.mode = 'erros' then 'Acabaram os erros para revisar agora.' else 'Não há mais questões disponíveis agora.' end using errcode = 'P0002'; end if;
  update public.tutor_sessions set question_id = v_q, question_state = 'open', hint_level = 0, last_message_at = now() where id = s.id;
  insert into public.tutor_messages (session_id, user_id, role, content, meta)
  values (s.id, v_user, 'tutor', public.tutor_line(s.personality_id, 'next', s.id::text || v_q, null, public.tutor_profanity(s.personality_id, s.settings ->> 'profanity') = 'moderate'),
          jsonb_build_object('opening', true, 'grounding', 'none'));
  return jsonb_build_object('session_id', s.id, 'question_id', v_q);
end
$$;

-- ---------------------------------------------------------------- resposta (…3700_tutor_motor_personalidade; a assinatura de 6 parâmetros)
-- Mais: sem o aceite, recusa logo depois do login, antes de travar o aluno e de procurar a conversa (o app e a voz do servidor passam por aqui).
create or replace function public.tutor_answer_for(v_user uuid, p_session_id uuid, p_option text, p_confidence integer, p_response_ms integer default null, p_first_pick text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  q public.questions;
  e jsonb;
  v_ok boolean;
  v_lucky boolean;
  v_heavy boolean;
  v_outcome text;
  v_clean boolean;
  v_sc smallint; v_sw smallint; v_level smallint;
  r public.tutor_reviews;
  v_reason text;
  v_steps constant integer[] := array[1, 3, 7, 14, 30];
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if public.tutor_consent_pending(v_user) then raise exception 'Aceite do Tutor pendente.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || v_user::text, 0));
  select * into s from public.tutor_sessions where id = p_session_id and user_id = v_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.question_id is null or s.question_state <> 'open' then raise exception 'Não há questão aberta nesta conversa.' using errcode = '22023'; end if;
  if p_option not in ('A', 'B', 'C', 'D') then raise exception 'Alternativa inválida.' using errcode = '22023'; end if;
  if p_confidence is not null and p_confidence not between 0 and 5 then raise exception 'Confiança de 0 a 5.' using errcode = '22023'; end if;
  if p_first_pick is not null and p_first_pick not in ('A', 'B', 'C', 'D') then raise exception 'Alternativa inválida.' using errcode = '22023'; end if;
  e := public.tutor_entitlement(v_user);
  if e ->> 'mode' = 'blocked' then raise exception 'Seu teste grátis do Tutor terminou. O Tutor continua nos planos pagos.' using errcode = '42501'; end if;
  if (e #>> '{questions,remaining}') is not null and (e #>> '{questions,remaining}')::int <= 0 then
    raise exception 'Você chegou ao limite de % questões de hoje no teste grátis. Amanhã tem mais.', e #>> '{questions,limit}' using errcode = '54000';
  end if;
  select * into q from public.questions where id = s.question_id;
  v_ok := q.correct_option = p_option::char(1);
  v_heavy := s.hint_level >= 3;
  v_lucky := v_ok and p_confidence is not null and p_confidence <= 1;
  v_outcome := case when p_confidence is null then 'normal'
                    when v_ok and p_confidence >= 4 then 'consolidated' when v_ok and p_confidence <= 2 then 'unstable'
                    when not v_ok and p_confidence >= 4 then 'priority' when not v_ok and p_confidence <= 2 then 'known_gap' else 'normal' end;
  insert into public.question_attempts (user_id, question_id, selected_option, confidence)
  values (v_user, q.id, p_option::char(1), case when p_confidence is null then null when p_confidence <= 1 then 1 when p_confidence <= 3 then 2 else 3 end);
  insert into public.tutor_answers (session_id, user_id, question_id, selected_option, is_correct, confidence, hints_used, outcome, lucky_guess, heavy_hints, response_ms, first_pick)
  values (s.id, v_user, q.id, p_option::char(1), v_ok, p_confidence, s.hint_level, v_outcome, v_lucky, v_heavy,
          case when p_response_ms between 0 and 86400000 then p_response_ms end, nullif(p_first_pick, '')::char(1));

  v_clean := v_ok and not v_lucky and not v_heavy;
  v_sc := case when v_clean then s.streak_correct + 1 else 0 end;
  v_sw := case when v_ok then 0 else s.streak_wrong + 1 end;
  v_level := s.difficulty_level;
  if v_sc >= 3 then v_level := least(v_level + 1, 10); v_sc := 0; end if;
  if v_sw >= 2 then v_level := greatest(v_level - 2, 1); v_sw := 0; end if;
  update public.tutor_sessions set question_state = 'answered', streak_correct = v_sc, streak_wrong = v_sw, difficulty_level = v_level, last_message_at = now() where id = s.id;

  select * into r from public.tutor_reviews where user_id = v_user and question_id = q.id;
  v_reason := case when not v_ok and coalesce(p_confidence, 0) >= 4 then 'wrong_confident' when not v_ok then 'wrong' when v_lucky then 'lucky_guess' when v_heavy then 'heavy_hints' end;
  if v_reason is not null then
    insert into public.tutor_reviews (user_id, question_id, step, due_at, reason) values (v_user, q.id, 0, now() + interval '1 day', v_reason)
    on conflict (user_id, question_id) do update set step = 0, due_at = now() + interval '1 day', reason = excluded.reason, updated_at = now();
  elsif r.user_id is not null then
    if r.step >= 4 then delete from public.tutor_reviews where user_id = v_user and question_id = q.id;
    else update public.tutor_reviews set step = r.step + 1, due_at = now() + make_interval(days => v_steps[r.step + 2]), updated_at = now() where user_id = v_user and question_id = q.id;
    end if;
  end if;

  return jsonb_build_object('is_correct', v_ok, 'correct_option', q.correct_option, 'selected', p_option, 'outcome', v_outcome, 'lucky_guess', v_lucky, 'heavy_hints', v_heavy,
    'difficulty_level', v_level, 'review_scheduled', v_reason is not null, 'question_id', q.id,
    'changed', case when p_first_pick is not null and p_first_pick <> p_option then
                 case when q.correct_option = p_first_pick::char(1) then 'correct_to_wrong' when v_ok then 'wrong_to_correct' else 'wrong_to_wrong' end end);
end
$$;

-- ---------------------------------------------------------------- abrir conversa (…3700_tutor_motor_personalidade)
-- Mais: sem o aceite, recusa antes de procurar a conversa (vale até para conversa antiga do próprio aluno e para id que nem existe).
create or replace function public.app_tutor_session(p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  s public.tutor_sessions;
begin
  if public.tutor_consent_pending(v_user) then raise exception 'Aceite do Tutor pendente.' using errcode = '42501'; end if;
  select * into s from public.tutor_sessions where id = p_session_id and user_id = v_user;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', s.id, 'mode', s.mode, 'title', s.title, 'topic', s.topic, 'status', s.status, 'question_state', s.question_state, 'hint_level', s.hint_level,
    'difficulty_level', s.difficulty_level, 'intensity', s.intensity,
    'context', jsonb_build_object('type', s.context_type, 'id', s.context_id, 'label', s.context_label),
    'summary', s.summary,
    'gate', s.emotion ->> 'gate', 'mood', s.emotion ->> 'mood',
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'voice', t.voice) from public.tutor_personalities t where t.id = s.personality_id),
    'question', case when s.question_id is not null then public.tutor_question_view(s.question_id, s.question_state) end,
    'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence, 'outcome', a.outcome, 'lucky_guess', a.lucky_guess, 'heavy_hints', a.heavy_hints)
                    from public.tutor_answers a where a.session_id = s.id and a.question_id = s.question_id order by a.answered_at desc limit 1),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'at', m.created_at,
                  'grounding', m.meta ->> 'grounding', 'sources', m.meta -> 'sources', 'hint_level', m.meta -> 'hint_level', 'suggested', m.meta -> 'suggested',
                  'notice', m.meta ->> 'notice', 'voice', coalesce((m.meta ->> 'realtime')::boolean, false)) order by m.id)
                from public.tutor_messages m where m.session_id = s.id), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- o que o servidor lê da conversa (…3700_tutor_motor_personalidade)
-- Mais: consent_pending (true quando o aluno ainda não aceitou a versão vigente). O servidor confere antes de gastar IA e recusa.
-- Conversa que não existe continua dando nulo.
create or replace function public.ch_worker_tutor_context(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  c public.tutor_config;
  v_answered boolean;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then return null; end if;
  select * into c from public.tutor_config;
  v_answered := s.question_state in ('answered', 'revealed');
  return jsonb_build_object(
    'consent_pending', public.tutor_consent_pending(p_user),
    'config', jsonb_build_object('enabled', c.enabled, 'requires_pro', c.requires_pro, 'daily_limit', c.daily_message_limit, 'max_profanity', c.max_profanity),
    'entitlement', public.tutor_entitlement(p_user),
    'is_pro', public.tutor_is_pro(p_user), 'used_today', public.tutor_usage_today(p_user),
    'session', jsonb_build_object('id', s.id, 'mode', s.mode, 'topic', s.topic, 'title', s.title, 'status', s.status, 'question_state', s.question_state, 'hint_level', s.hint_level, 'intensity', s.intensity,
                 'settings', s.settings, 'difficulty_level', s.difficulty_level, 'streak_correct', s.streak_correct, 'streak_wrong', s.streak_wrong, 'emotion', s.emotion,
                 'context', jsonb_build_object('type', s.context_type, 'id', s.context_id, 'label', s.context_label)),
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'params', t.params, 'style_notes', t.style_notes, 'examples', to_jsonb(t.examples), 'examples_strong', to_jsonb(t.examples_strong), 'voice', t.voice, 'engine', t.engine)
                    from public.tutor_personalities t where t.id = s.personality_id),
    'student', (select jsonb_build_object('first_name', nullif(split_part(btrim(p.name), ' ', 1), ''), 'phase', p.phase, 'days_to_exam', case when p.exam_date is not null then p.exam_date - current_date end)
                from public.profiles p where p.id = p_user),
    'mastery', public.tutor_mastery(p_user),
    'memory', public.tutor_learning_memory(p_user, s.settings ->> 'area', null),
    'recent_results', coalesce((select jsonb_agg(x.ok order by x.answered_at) from (
        select a.is_correct and not a.lucky_guess and not a.heavy_hints as ok, a.answered_at from public.tutor_answers a where a.session_id = s.id order by a.answered_at desc limit 3) x), '[]'::jsonb),
    'session_errors', coalesce((select jsonb_agg(jsonb_build_object('error_type', e.error_type, 'question_id', e.question_id, 'knowledge_gap', e.knowledge_gap, 'theme', e.theme) order by e.id) from public.student_error_events e where e.session_id = s.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', h.role, 'content', h.content) order by h.id)
                 from (select * from public.tutor_messages m where m.session_id = s.id order by m.id desc limit 12) h), '[]'::jsonb),
    'question', case when s.question_id is not null then
        public.tutor_truth(s.question_id, case when v_answered then 'full' else 'hint' end) || jsonb_build_object(
          'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence, 'outcome', a.outcome, 'lucky_guess', a.lucky_guess, 'heavy_hints', a.heavy_hints, 'hints_used', a.hints_used, 'justification', a.justification, 'response_ms', a.response_ms, 'first_pick', a.first_pick)
                          from public.tutor_answers a where a.session_id = s.id and a.question_id = s.question_id order by a.answered_at desc limit 1),
          -- a última resposta do aluno a esta questão fora do Tutor (treino, simulado), só se a questão já está respondida/revelada aqui
          'practice_answer', case when v_answered then (select jsonb_build_object('selected', t.selected_option, 'is_correct', t.is_correct)
                          from public.question_attempts t where t.user_id = p_user and t.question_id = s.question_id order by t.answered_at desc, t.seq desc limit 1) end) end);
end
$$;

-- ---------------------------------------------------------------- o que pode virar voz (…3400_tutor_voz_natural)
-- Mais: consent_pending em todas as respostas (também quando não acha a fala ou a conversa), para o servidor conferir o aceite
-- primeiro e recusar antes de gastar voz.
create or replace function public.ch_worker_tutor_speech(p_user uuid, p_session_id uuid, p_kind text, p_message_id bigint, p_personality text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.tutor_sessions;
  t public.tutor_personalities;
  v_text text;
  v_pending constant boolean := public.tutor_consent_pending(p_user);
begin
  select * into c from public.tutor_config;
  if p_kind in ('message', 'question') then
    select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
    if not found then return jsonb_build_object('found', false, 'consent_pending', v_pending); end if;
    select * into t from public.tutor_personalities where id = s.personality_id;
    if p_kind = 'message' then
      select m.content into v_text from public.tutor_messages m where m.id = p_message_id and m.session_id = s.id and m.role = 'tutor';
    elsif s.question_id is not null then
      select q.statement || ' ' || coalesce((select string_agg('Alternativa ' || (o ->> 'id') || ': ' || (o ->> 'text'), ' ' order by o ->> 'id') from jsonb_array_elements(q.options) o), '')
        into v_text from public.questions q where q.id = s.question_id;
    end if;
    if v_text is null then return jsonb_build_object('found', false, 'consent_pending', v_pending); end if;
  else
    select * into t from public.tutor_personalities where id = p_personality and active;
    if not found then return jsonb_build_object('found', false, 'consent_pending', v_pending); end if;
  end if;
  return jsonb_build_object(
    'found', true,
    'consent_pending', v_pending,
    'config', jsonb_build_object('enabled', c.enabled, 'voice_enabled', c.voice_enabled, 'requires_pro', c.requires_pro),
    'is_pro', public.tutor_is_pro(p_user),
    'used_chars', coalesce((select u.voice_chars from public.ai_usage u where u.user_id = p_user and u.day = (now() at time zone 'America/Sao_Paulo')::date), 0),
    'personality', t.id, 'voice', t.voice, 'sample', t.openings[1], 'text', v_text);
end
$$;

-- ---------------------------------------------------------------- permissões
-- Funções novas nascem executáveis por todos: o apoio só roda dentro das funções do Tutor (security definer) e no servidor.
-- As funções recriadas acima mantêm as permissões que já tinham (create or replace não mexe nelas).
revoke execute on function public.tutor_consent_pending(uuid) from public, anon, authenticated;
