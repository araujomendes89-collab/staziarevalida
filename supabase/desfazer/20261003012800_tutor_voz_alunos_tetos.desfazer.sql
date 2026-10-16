-- DESFAZER da 20261003012800_tutor_voz_alunos_tetos.sql: volta as quatro funções ao corpo de antes (voz_start e voz_renew da …5800;
-- settings e save_config da …10600), apaga a função do gasto, a do limite de frequência, a tabela do limite e as colunas novas de
-- tutor_config (perde os tetos, o preço e os limites gravados). Rode as funções ANTES de apagar as colunas, pois as novas as usam.
-- Antes de rodar, desligue a voz dos alunos (TUTOR_LIVE_VOICE_ALLOW_EXTERNAL fora do ar): sem os tetos, a voz ao vivo ficaria sem teto de gasto.

create or replace function public.ch_worker_tutor_voice_start(p_user uuid, p_session_id uuid, p_force boolean, p_model text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.tutor_sessions;
  e jsonb;
  v_old public.tutor_voice_calls;
  v_left integer;
  v_lease integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  select * into c from public.tutor_config;
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'session_closed'); end if;
  -- reservas vencidas deste aluno saem antes da conta
  update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = coalesce(closing_reason, 'timeout'),
    consumed_seconds = case when provider = 'tts' then 0 else greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int end
  where user_id = p_user and status = 'active' and lease_until < now();
  select * into v_old from public.tutor_voice_calls where user_id = p_user and status = 'active';
  if found and v_old.provider = 'tts' then
    -- a voz do professor dá lugar à voz ao vivo (reserva) sem pedir confirmação e sem segundos
    update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'replaced', consumed_seconds = 0 where id = v_old.id;
  elsif found then
    if not coalesce(p_force, false) then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
    update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'replaced',
      consumed_seconds = greatest(1, ceil(extract(epoch from (least(now(), lease_until) - started_at))))::int
    where id = v_old.id;
    insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
    select p_user, v_old.session_id, 'tutor_voice', v_old.model, v.consumed_seconds, jsonb_build_object('voice_call', v_old.id, 'provider', v_old.provider) from public.tutor_voice_calls v where v.id = v_old.id;
    update public.tutor_sessions set voice_seconds = voice_seconds + (select v.consumed_seconds from public.tutor_voice_calls v where v.id = v_old.id) where id = v_old.session_id;
  end if;
  e := public.tutor_entitlement(p_user);
  if not (e ->> 'can_voice')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(e ->> 'block_reason', case when not c.voice_enabled then 'voice_disabled' else 'voice_quota' end), 'entitlement', e);
  end if;
  v_left := (e #>> '{voice,remaining_s}')::int;
  if v_left < 15 then return jsonb_build_object('ok', false, 'reason', 'voice_quota', 'entitlement', e); end if;
  v_lease := least(c.voice_lease_seconds, v_left, c.voice_session_max_seconds);
  insert into public.tutor_voice_calls (user_id, session_id, model, lease_until) values (p_user, s.id, left(p_model, 80), now() + make_interval(secs => v_lease)) returning id into v_id;
  perform public.tutor_begin_trial(p_user);
  return jsonb_build_object('ok', true, 'voice_call_id', v_id, 'lease_seconds', v_lease, 'replaced_call_id', v_old.call_id, 'replaced_provider', v_old.provider,
                            'entitlement', public.tutor_entitlement(p_user));
end
$$;

create or replace function public.ch_worker_tutor_voice_renew(p_user uuid, p_voice_call uuid, p_call_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  v public.tutor_voice_calls;
  e jsonb;
  v_left integer;
  v_lease integer;
  v_session_left integer;
  v_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  select * into c from public.tutor_config;
  select * into v from public.tutor_voice_calls where id = p_voice_call and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'stop', true, 'reason', 'not_found'); end if;
  if v.status <> 'active' then
    return jsonb_build_object('ok', false, 'stop', true, 'reason', coalesce(v.termination_reason, v.status), 'call_id', v.call_id, 'provider', v.provider);
  end if;
  if v.provider = 'tts' then
    -- voz do professor: não gasta o tempo da voz ao vivo nem tem limite por conversa; só renova enquanto a Nexus está aberta
    if v.lease_until < now() - interval '15 seconds' then
      update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = 'timeout', consumed_seconds = 0 where id = v.id;
      return jsonb_build_object('ok', false, 'stop', true, 'reason', 'timeout', 'call_id', v.call_id, 'provider', v.provider);
    end if;
    if (select ts.status from public.tutor_sessions ts where ts.id = v.session_id) is distinct from 'active' then
      update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'session_closed', consumed_seconds = 0 where id = v.id;
      return jsonb_build_object('ok', false, 'stop', true, 'reason', 'session_closed', 'call_id', v.call_id, 'provider', v.provider);
    end if;
    e := public.tutor_entitlement(p_user);
    v_reason := case when not c.enabled then 'disabled' when e ->> 'mode' = 'blocked' then 'trial_expired' when not c.voice_enabled then 'voice_disabled' end;
    if v_reason is not null then
      return jsonb_build_object('ok', false, 'stop', true, 'reason', v_reason, 'call_id', v.call_id, 'provider', v.provider);
    end if;
    update public.tutor_voice_calls set lease_until = now() + make_interval(secs => c.voice_lease_seconds) where id = v.id;
    return jsonb_build_object('ok', true, 'lease_seconds', c.voice_lease_seconds, 'provider', v.provider, 'entitlement', e);
  end if;
  if v.lease_until < now() - interval '15 seconds' then
    update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = coalesce(closing_reason, 'timeout'),
      consumed_seconds = greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int where id = v.id;
    insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
    values (p_user, v.session_id, 'tutor_voice', v.model, greatest(0, ceil(extract(epoch from (v.lease_until - v.started_at))))::int,
            jsonb_build_object('voice_call', v.id, 'provider', v.provider));
    update public.tutor_sessions set voice_seconds = voice_seconds + greatest(0, ceil(extract(epoch from (v.lease_until - v.started_at))))::int where id = v.session_id;
    return jsonb_build_object('ok', false, 'stop', true, 'reason', 'timeout', 'call_id', coalesce(v.call_id, p_call_id), 'provider', v.provider);
  end if;
  if v.closing_at is not null then
    -- já encerrando: não estende a reserva
    return jsonb_build_object('ok', false, 'stop', true, 'reason', v.closing_reason, 'grace_seconds',
                              greatest(0, ceil(extract(epoch from (v.lease_until - now()))))::int, 'call_id', coalesce(v.call_id, p_call_id), 'provider', v.provider);
  end if;
  -- por um instante, a reserva desta chamada vale só até agora: o saldo calculado é o real
  update public.tutor_voice_calls set lease_until = now(), call_id = coalesce(call_id, case when p_call_id ~ '^[A-Za-z0-9_-]{4,120}$' then p_call_id end) where id = v.id;
  e := public.tutor_entitlement(p_user);
  v_left := (e #>> '{voice,remaining_s}')::int;
  v_session_left := c.voice_session_max_seconds - ceil(extract(epoch from (now() - v.started_at)))::int;
  v_reason := case when not (e ->> 'can_voice')::boolean or v_left <= 0 then 'quota' when v_session_left <= 0 then 'session_limit' end;
  if v_reason is not null then
    update public.tutor_voice_calls set closing_at = now(), closing_reason = v_reason, lease_until = now() + interval '20 seconds' where id = v.id;
    return jsonb_build_object('ok', false, 'stop', true, 'reason', v_reason, 'grace_seconds', 20, 'call_id', coalesce(v.call_id, p_call_id),
                              'provider', v.provider, 'entitlement', public.tutor_entitlement(p_user));
  end if;
  v_lease := least(c.voice_lease_seconds, v_left, v_session_left);
  update public.tutor_voice_calls set lease_until = now() + make_interval(secs => v_lease) where id = v.id;
  e := public.tutor_entitlement(p_user);
  return jsonb_build_object('ok', true, 'lease_seconds', v_lease, 'remaining_s', v_left, 'warn', v_left <= 120,
                            'session_left_s', v_session_left, 'entitlement', e);
end
$$;

create or replace function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_pron jsonb;
  v_was_tts_team boolean;
  v_cfg public.tutor_config;
  v_key text;
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
  -- CF02: os tetos diários da transcrição são opcionais (vazio = sem valor); quando vêm, são segundos de 1 a 86400
  foreach v_key in array array['stt_trial_daily_seconds', 'stt_paid_daily_seconds', 'stt_account_daily_seconds'] loop
    if p_config ? v_key and nullif(btrim(coalesce(p_config ->> v_key, '')), '') is not null
       and ((p_config ->> v_key) !~ '^\d{1,6}$' or (p_config ->> v_key)::integer not between 1 and 86400) then
      raise exception 'Teto diário da transcrição: de 1 a 1440 minutos, ou deixe vazio.' using errcode = '22023';
    end if;
  end loop;
  if p_config ? 'question_hint_enabled' and jsonb_typeof(p_config -> 'question_hint_enabled') not in ('boolean', 'null') then
    raise exception 'Dica do Tutor nas questões: ligada ou desligada.' using errcode = '22023';
  end if;
  if p_config ? 'stt_team_only' and jsonb_typeof(p_config -> 'stt_team_only') not in ('boolean', 'null') then
    raise exception 'Microfone só para a equipe: ligado ou desligado.' using errcode = '22023';
  end if;
  select to_jsonb(c) - 'id' - 'updated_at' - 'updated_by', c.tts_team_only into v_old, v_was_tts_team from public.tutor_config c;
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
    stt_team_only = coalesce((p_config ->> 'stt_team_only')::boolean, stt_team_only),
    question_hint_enabled = coalesce((p_config ->> 'question_hint_enabled')::boolean, question_hint_enabled),
    stt_trial_daily_seconds = case when p_config ? 'stt_trial_daily_seconds' then nullif(btrim(coalesce(p_config ->> 'stt_trial_daily_seconds', '')), '')::integer else stt_trial_daily_seconds end,
    stt_paid_daily_seconds = case when p_config ? 'stt_paid_daily_seconds' then nullif(btrim(coalesce(p_config ->> 'stt_paid_daily_seconds', '')), '')::integer else stt_paid_daily_seconds end,
    stt_account_daily_seconds = case when p_config ? 'stt_account_daily_seconds' then nullif(btrim(coalesce(p_config ->> 'stt_account_daily_seconds', '')), '')::integer else stt_account_daily_seconds end,
    updated_at = now(), updated_by = (select auth.uid());
  select * into v_cfg from public.tutor_config;
  -- VZ03: a voz do professor só passa a falar com os alunos depois que o preço dela está preenchido (só vale na hora de liberar;
  -- quem já estava liberado antes desta trava não fica preso)
  if v_was_tts_team and not v_cfg.tts_team_only and v_cfg.tts_price_per_1k_chars_usd <= 0 then
    raise exception 'Para liberar a voz do professor aos alunos, preencha antes o preço da voz (US$ por mil caracteres). Sem o preço, o gasto aparece como zero.' using errcode = '22023';
  end if;
  -- CF02: o microfone só abre para os alunos com os três tetos diários da transcrição e o preço dela preenchidos (vale sempre)
  if not v_cfg.stt_team_only and (v_cfg.stt_trial_daily_seconds is null or v_cfg.stt_paid_daily_seconds is null or v_cfg.stt_account_daily_seconds is null or v_cfg.stt_price_per_min_usd <= 0) then
    raise exception 'Para liberar o microfone aos alunos, preencha antes o teto diário de transcrição (teste grátis, plano pago e a plataforma toda) e o preço da transcrição.' using errcode = '22023';
  end if;
  update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c
   where (case p.profanity when 'off' then 0 when 'mild' then 1 else 2 end) > (case c.max_profanity when 'off' then 0 when 'mild' then 1 else 2 end);
  perform public.admin_log('tutor.config', 'tutor', jsonb_build_object('from', v_old, 'to', p_config, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_config();
end
$$;

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
    'tts_price_per_1k_chars_usd', c.tts_price_per_1k_chars_usd, 'stt_price_per_min_usd', c.stt_price_per_min_usd,
    'stt_team_only', c.stt_team_only, 'stt_trial_daily_seconds', c.stt_trial_daily_seconds, 'stt_paid_daily_seconds', c.stt_paid_daily_seconds,
    'stt_account_daily_seconds', c.stt_account_daily_seconds, 'question_hint_enabled', c.question_hint_enabled)
  from public.tutor_config c
$$;

revoke execute on function public.ch_worker_tutor_voice_start(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_tutor_voice_renew(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.app_admin_tutor_save_config(jsonb, text) from public, anon;
revoke execute on function public.ch_worker_tutor_settings() from public, anon, authenticated;

drop function if exists public.tutor_live_account_today();
drop function if exists public.ch_worker_tutor_rate_hit(uuid, text);
drop table if exists public.tutor_rate_limits;
drop index if exists public.tutor_voice_calls_day_idx;
drop index if exists public.ai_usage_ledger_day_feature_idx;
alter table public.tutor_config
  drop column if exists live_account_daily_seconds,
  drop column if exists live_account_daily_usd,
  drop column if exists live_account_monthly_usd,
  drop column if exists live_price_per_min_usd,
  drop column if exists voice_rate_limits;
