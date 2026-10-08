-- =============================================================================
-- Tutor Nexus (spec docs/superpowers/specs/2026-10-07-tutor-nexus-voz-design.md, §§4, 5, 8, 9, 16):
--   * começar a conversa já com o professor escolhido na entrada da Nexus (app_tutor_start ganha p_personality) e gravar a
--     última escolha junto, numa transação; sem p_personality, como antes (a preferência salva);
--   * conversa só leitura: marcada na troca dos professores (legacy_persona, …5500) ou de um professor desligado hoje. A
--     lista e a abertura dizem read_only e mostram o nome e o emoji originais; o servidor recusa turno e voz (409);
--   * o painel do Tutor ganha os limites e preços da voz do professor e o interruptor "só equipe";
--   * aprovação das vozes: cada voz sozinha, só pelo administrador, só depois de ouvir todos os cenários da mesma versão
--     nas últimas 24 h; revogar desliga só aquela voz. Tudo fica na auditoria. A amostra do "Ouvir" vai para um depósito privado.
-- As funções recriadas partem da última definição (…5400, …4900, …4400) e só acrescentam o que está descrito aqui.
-- =============================================================================

-- ---------------------------------------------------------------- painel: voz do professor
alter table public.tutor_config
  add column tts_team_only boolean not null default true,
  add column tts_trial_daily_chars integer not null default 4500 check (tts_trial_daily_chars between 0 and 100000),
  add column tts_paid_daily_chars integer not null default 4500 check (tts_paid_daily_chars between 0 and 100000),
  add column tts_account_daily_chars integer not null default 4500 check (tts_account_daily_chars between 0 and 10000000),
  add column tts_account_monthly_chars integer not null default 30000 check (tts_account_monthly_chars between 0 and 100000000),
  add column tts_price_per_1k_chars_usd numeric(10,6) not null default 0 check (tts_price_per_1k_chars_usd >= 0),
  add column stt_price_per_min_usd numeric(10,6) not null default 0 check (stt_price_per_min_usd >= 0);

-- ---------------------------------------------------------------- aprovação das vozes (só pelas funções do servidor)
create table public.tutor_voice_approvals (
  voice text primary key check (voice in ('tranquilo', 'durona', 'direto')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  sample_path text
);
alter table public.tutor_voice_approvals enable row level security;

create table public.tutor_voice_listen_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  voice text not null,
  fingerprint text not null,
  scenario text not null,
  heard_at timestamptz not null default now()
);
create index tutor_voice_listen_log_user_idx on public.tutor_voice_listen_log (user_id, voice, fingerprint, heard_at desc);
alter table public.tutor_voice_listen_log enable row level security;

-- ---------------------------------------------------------------- depósito das amostras (privado; no PGlite não há schema storage)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('tutor-voice-samples', 'tutor-voice-samples', false, 5242880, array['audio/mpeg'])
    on conflict (id) do update set public = false;
  end if;
end
$$;

-- ---------------------------------------------------------------- nova conversa (…5400)
-- Mais: p_personality (Nexus). Só Tranquilo (acolhedor), Durona e Direto ativos; o aceite pendente continua a primeira recusa.
drop function public.app_tutor_start(text, text, text, jsonb);
create function public.app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null, p_context jsonb default null, p_personality text default null) returns jsonb
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
  if p_personality is not null then
    -- Nexus: o professor escolhido na entrada; a última escolha é gravada junto (mesma regra de app_tutor_save_preferences)
    select * into t from public.tutor_personalities where id = p_personality and active and id in ('acolhedor', 'durona', 'direto');
    if not found then raise exception 'Professor não encontrado.' using errcode = '22023'; end if;
    insert into public.tutor_preferences (user_id, personality_id, intensity, profanity, updated_at)
    values (v_user, t.id, 3, case when (t.params ->> 'profanity')::int >= 20 then (select c.max_profanity from public.tutor_config c) else 'off' end, now())
    on conflict (user_id) do update set personality_id = excluded.personality_id, intensity = 3, profanity = excluded.profanity, updated_at = now()
    returning * into p;
  else
    select * into p from public.tutor_preferences where user_id = v_user;
    if not found or not exists (select 1 from public.tutor_personalities x where x.id = p.personality_id and x.active) then
      insert into public.tutor_preferences (user_id) values (v_user)
      on conflict (user_id) do update set personality_id = 'acolhedor', profanity = 'off', intensity = 3 returning * into p;
    end if;
    select * into t from public.tutor_personalities where id = p.personality_id;
  end if;
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

-- ---------------------------------------------------------------- histórico (…5400)
-- Mais: personality_id e read_only; o nome e o emoji vêm da marca da conversa antiga quando houver.
create or replace function public.app_tutor_sessions(p_limit integer default 20) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'mode', s.mode, 'status', s.status, 'last_message_at', s.last_message_at,
           'personality', coalesce(s.legacy_persona ->> 'emoji', (select t.emoji from public.tutor_personalities t where t.id = s.personality_id)),
           'persona', coalesce(s.legacy_persona ->> 'name', (select t.name from public.tutor_personalities t where t.id = s.personality_id)),
           'personality_id', s.personality_id,
           'read_only', s.legacy_persona is not null or not coalesce((select t.active from public.tutor_personalities t where t.id = s.personality_id), false),
           'minutes', greatest(1, round(coalesce(s.duration_seconds, extract(epoch from (s.last_message_at - s.created_at))::int) / 60.0))::int,
           'questions', (select count(*)::int from public.tutor_answers a where a.session_id = s.id)) order by s.last_message_at desc), '[]'::jsonb)
  from (select * from public.tutor_sessions
        where user_id = (select auth.uid()) and not (select public.tutor_consent_pending((select auth.uid())))
        order by last_message_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) s
$$;

-- ---------------------------------------------------------------- abrir conversa (…5400)
-- Mais: read_only e, na conversa marcada, o nome e o emoji originais.
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
    -- só leitura: conversa marcada na troca dos professores (…5500) ou de um professor que está desligado hoje
    'read_only', s.legacy_persona is not null or not coalesce((select t.active from public.tutor_personalities t where t.id = s.personality_id), false),
    'personality', (select jsonb_build_object('id', t.id, 'name', coalesce(s.legacy_persona ->> 'name', t.name), 'emoji', coalesce(s.legacy_persona ->> 'emoji', t.emoji), 'voice', t.voice)
                    from public.tutor_personalities t where t.id = s.personality_id),
    'question', case when s.question_id is not null then public.tutor_question_view(s.question_id, s.question_state) end,
    'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence, 'outcome', a.outcome, 'lucky_guess', a.lucky_guess, 'heavy_hints', a.heavy_hints)
                    from public.tutor_answers a where a.session_id = s.id and a.question_id = s.question_id order by a.answered_at desc limit 1),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'at', m.created_at,
                  'grounding', m.meta ->> 'grounding', 'sources', m.meta -> 'sources', 'hint_level', m.meta -> 'hint_level', 'suggested', m.meta -> 'suggested',
                  'notice', m.meta ->> 'notice', 'voice', coalesce((m.meta ->> 'realtime')::boolean, false)) order by m.id)
                from public.tutor_messages m where m.session_id = s.id), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- o que o servidor lê da conversa (…5400)
-- Mais: session.read_only (o servidor recusa turno e voz com 409).
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
                 'context', jsonb_build_object('type', s.context_type, 'id', s.context_id, 'label', s.context_label),
                 'read_only', s.legacy_persona is not null or not coalesce((select t.active from public.tutor_personalities t where t.id = s.personality_id), false)),
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

-- ---------------------------------------------------------------- painel do Tutor (…4900)
-- Mais: os limites e preços da voz do professor e o interruptor "só equipe".
create or replace function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_pron jsonb;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_config ? 'voice_provider' and p_config ->> 'voice_provider' not in ('auto', 'gemini', 'live', 'realtime') then
    raise exception 'Provedor de voz inválido.' using errcode = '22023';
  end if;
  if p_config ? 'durona_level' and p_config ->> 'durona_level' not in ('moderada', 'forte', 'sem_filtro') then
    raise exception 'Nível da Durona inválido.' using errcode = '22023';
  end if;
  if p_config ? 'voice_name' and nullif(btrim(coalesce(p_config ->> 'voice_name', '')), '') is not null
     and lower(btrim(p_config ->> 'voice_name')) !~ '^[a-z][a-z0-9_-]{1,30}$' then
    raise exception 'Nome de voz inválido (use só letras, como marin, cedar ou kore).' using errcode = '22023';
  end if;
  -- pronúncias: lista de {term, say}; o que vier fora disso é descartado
  if p_config ? 'pronunciations' then
    if jsonb_typeof(p_config -> 'pronunciations') <> 'array' then raise exception 'Pronúncias inválidas.' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('term', left(btrim(x ->> 'term'), 40), 'say', left(btrim(x ->> 'say'), 80))), '[]'::jsonb) into v_pron
    from jsonb_array_elements(p_config -> 'pronunciations') x
    where jsonb_typeof(x) = 'object' and char_length(btrim(coalesce(x ->> 'term', ''))) between 1 and 40 and char_length(btrim(coalesce(x ->> 'say', ''))) between 1 and 80;
    if jsonb_array_length(v_pron) > 60 then raise exception 'No máximo 60 pronúncias.' using errcode = '22023'; end if;
  end if;
  select to_jsonb(c) - 'id' - 'updated_at' - 'updated_by' into v_old from public.tutor_config c;
  update public.tutor_config set
    enabled = coalesce((p_config ->> 'enabled')::boolean, enabled),
    requires_pro = coalesce((p_config ->> 'requires_pro')::boolean, requires_pro),
    daily_message_limit = coalesce(nullif(p_config ->> 'daily_message_limit', '')::integer, daily_message_limit),
    max_profanity = coalesce(nullif(p_config ->> 'max_profanity', ''), max_profanity),
    voice_enabled = coalesce((p_config ->> 'voice_enabled')::boolean, voice_enabled),
    trial_voice_daily_seconds = coalesce(nullif(p_config ->> 'trial_voice_daily_seconds', '')::integer, trial_voice_daily_seconds),
    trial_voice_total_seconds = coalesce(nullif(p_config ->> 'trial_voice_total_seconds', '')::integer, trial_voice_total_seconds),
    trial_text_daily = coalesce(nullif(p_config ->> 'trial_text_daily', '')::integer, trial_text_daily),
    trial_questions_daily = coalesce(nullif(p_config ->> 'trial_questions_daily', '')::integer, trial_questions_daily),
    paid_voice_daily_seconds = coalesce(nullif(p_config ->> 'paid_voice_daily_seconds', '')::integer, paid_voice_daily_seconds),
    voice_lease_seconds = coalesce(nullif(p_config ->> 'voice_lease_seconds', '')::integer, voice_lease_seconds),
    voice_provider = coalesce(nullif(p_config ->> 'voice_provider', ''), voice_provider),
    voice_name = case when p_config ? 'voice_name' then nullif(lower(btrim(coalesce(p_config ->> 'voice_name', ''))), '') else voice_name end,
    voice_session_max_seconds = coalesce(nullif(p_config ->> 'voice_session_max_seconds', '')::integer, voice_session_max_seconds),
    save_transcripts = coalesce((p_config ->> 'save_transcripts')::boolean, save_transcripts),
    transcript_retention_days = coalesce(nullif(p_config ->> 'transcript_retention_days', '')::integer, transcript_retention_days),
    emotion_engine = coalesce((p_config ->> 'emotion_engine')::boolean, emotion_engine),
    inside_jokes = coalesce((p_config ->> 'inside_jokes')::boolean, inside_jokes),
    durona_level = coalesce(nullif(p_config ->> 'durona_level', ''), durona_level),
    pronunciations = coalesce(v_pron, pronunciations),
    tts_team_only = coalesce((p_config ->> 'tts_team_only')::boolean, tts_team_only),
    tts_trial_daily_chars = coalesce(nullif(p_config ->> 'tts_trial_daily_chars', '')::integer, tts_trial_daily_chars),
    tts_paid_daily_chars = coalesce(nullif(p_config ->> 'tts_paid_daily_chars', '')::integer, tts_paid_daily_chars),
    tts_account_daily_chars = coalesce(nullif(p_config ->> 'tts_account_daily_chars', '')::integer, tts_account_daily_chars),
    tts_account_monthly_chars = coalesce(nullif(p_config ->> 'tts_account_monthly_chars', '')::integer, tts_account_monthly_chars),
    tts_price_per_1k_chars_usd = coalesce(nullif(p_config ->> 'tts_price_per_1k_chars_usd', '')::numeric, tts_price_per_1k_chars_usd),
    stt_price_per_min_usd = coalesce(nullif(p_config ->> 'stt_price_per_min_usd', '')::numeric, stt_price_per_min_usd),
    updated_at = now(), updated_by = (select auth.uid());
  update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c
   where (case p.profanity when 'off' then 0 when 'mild' then 1 else 2 end) > (case c.max_profanity when 'off' then 0 when 'mild' then 1 else 2 end);
  perform public.admin_log('tutor.config', 'tutor', jsonb_build_object('from', v_old, 'to', p_config, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_config();
end
$$;

-- ---------------------------------------------------------------- configuração lida pelo servidor (…4400)
-- Mais: os mesmos sete campos.
create or replace function public.ch_worker_tutor_settings() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', c.enabled, 'voice_enabled', c.voice_enabled, 'voice_provider', c.voice_provider, 'voice_name', c.voice_name,
    'voice_session_max_seconds', c.voice_session_max_seconds, 'save_transcripts', c.save_transcripts,
    'transcript_retention_days', c.transcript_retention_days, 'emotion_engine', c.emotion_engine, 'inside_jokes', c.inside_jokes,
    'durona_level', c.durona_level, 'pronunciations', c.pronunciations, 'max_profanity', c.max_profanity,
    'tts_team_only', c.tts_team_only, 'tts_trial_daily_chars', c.tts_trial_daily_chars, 'tts_paid_daily_chars', c.tts_paid_daily_chars,
    'tts_account_daily_chars', c.tts_account_daily_chars, 'tts_account_monthly_chars', c.tts_account_monthly_chars,
    'tts_price_per_1k_chars_usd', c.tts_price_per_1k_chars_usd, 'stt_price_per_min_usd', c.stt_price_per_min_usd)
  from public.tutor_config c
$$;

-- ---------------------------------------------------------------- vozes do Nexus: audição e aprovação (servidor)
create function public.tutor_voice_panel_of(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'approvals', coalesce((select jsonb_object_agg(a.voice, jsonb_build_object('fingerprint', a.fingerprint, 'approved_at', a.approved_at, 'revoked_at', a.revoked_at, 'sample_path', a.sample_path))
                           from public.tutor_voice_approvals a), '{}'::jsonb),
    'heard', coalesce((select jsonb_agg(distinct jsonb_build_object('voice', l.voice, 'fingerprint', l.fingerprint, 'scenario', l.scenario))
                       from public.tutor_voice_listen_log l where l.user_id = p_user and l.heard_at > now() - interval '24 hours'), '[]'::jsonb))
$$;

create function public.tutor_voice_check(p_user uuid, p_voice text) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  if p_voice is null or p_voice not in ('tranquilo', 'durona', 'direto') then raise exception 'Voz inválida.' using errcode = '22023'; end if;
end
$$;

create function public.ch_worker_tutor_voice_panel(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  return public.tutor_voice_panel_of(p_user);
end
$$;

create function public.ch_worker_tutor_voice_listened(p_user uuid, p_voice text, p_fingerprint text, p_scenario text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.tutor_voice_check(p_user, p_voice);
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Versão da voz inválida.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_scenario, ''))) not between 1 and 60 then raise exception 'Cenário inválido.' using errcode = '22023'; end if;
  insert into public.tutor_voice_listen_log (user_id, voice, fingerprint, scenario) values (p_user, p_voice, p_fingerprint, btrim(p_scenario));
end
$$;

create function public.ch_worker_tutor_voice_approve(p_user uuid, p_voice text, p_fingerprint text, p_scenarios text[], p_sample_path text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.tutor_voice_check(p_user, p_voice);
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Versão da voz inválida.' using errcode = '22023'; end if;
  -- todos os cenários desta mesma versão da voz, ouvidos por quem aprova, nas últimas 24 h
  if coalesce(cardinality(p_scenarios), 0) = 0 or exists (
       select 1 from unnest(p_scenarios) sc
       where not exists (select 1 from public.tutor_voice_listen_log l
                         where l.user_id = p_user and l.voice = p_voice and l.fingerprint = p_fingerprint and l.scenario = sc and l.heard_at > now() - interval '24 hours')) then
    raise exception 'Ouça todos os cenários desta voz antes de aprovar.' using errcode = '22023';
  end if;
  insert into public.tutor_voice_approvals (voice, fingerprint, approved_by, approved_at, revoked_at, revoked_by, sample_path)
  values (p_voice, p_fingerprint, p_user, now(), null, null, nullif(btrim(coalesce(p_sample_path, '')), ''))
  on conflict (voice) do update set fingerprint = excluded.fingerprint, approved_by = excluded.approved_by, approved_at = excluded.approved_at,
    revoked_at = null, revoked_by = null, sample_path = excluded.sample_path;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_user, 'tutor.voice.approve', 'tutor', jsonb_build_object('voice', p_voice, 'fingerprint', p_fingerprint, 'scenarios', to_jsonb(p_scenarios)));
  return public.tutor_voice_panel_of(p_user);
end
$$;

create function public.ch_worker_tutor_voice_revoke(p_user uuid, p_voice text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.tutor_voice_check(p_user, p_voice);
  update public.tutor_voice_approvals set revoked_at = now(), revoked_by = p_user where voice = p_voice and revoked_at is null;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_user, 'tutor.voice.revoke', 'tutor', jsonb_build_object('voice', p_voice));
  return public.tutor_voice_panel_of(p_user);
end
$$;

-- ---------------------------------------------------------------- permissões
-- Funções novas nascem executáveis por todos: as do servidor e os apoios ficam fechados; app_tutor_start fica para quem está logado.
do $revoke$
begin
  revoke execute on function public.app_tutor_start(text, text, text, jsonb, text) from public, anon;
  revoke execute on function public.tutor_voice_panel_of(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_voice_check(uuid, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_panel(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_listened(uuid, text, text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_approve(uuid, text, text, text[], text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_revoke(uuid, text) from public, anon, authenticated;
end
$revoke$;

-- ---------------------------------------------------------------- jeito da Durona (Tarefa 5 do plano)
-- Acerto logo depois de errar: alívio, com um palavrão sobre a situação; acerto sem erro antes: reconhece do jeito dela.
update public.tutor_personalities set style_notes = replace(style_notes, 'Quando o aluno melhora, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai.").', 'Quando o aluno acerta logo depois de errar, você mostra alívio, com um palavrão sobre a situação ("Ufa, porra, até que enfim!"); num acerto sem erro antes, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai.").') where id = 'durona';
