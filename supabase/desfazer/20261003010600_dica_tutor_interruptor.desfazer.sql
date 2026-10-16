-- DESFAZER da 20261003010600_dica_tutor_interruptor.sql: volta as duas funções ao corpo da …9891 e apaga a coluna (perde o estado do interruptor).
-- Rode antes de apagar a coluna, pois as funções novas a usam.

-- ---------------------------------------------------------------- painel (administrador)
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

revoke execute on function public.app_admin_tutor_save_config(jsonb, text) from public, anon;

-- ---------------------------------------------------------------- configuração lida pelo servidor
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
    'stt_account_daily_seconds', c.stt_account_daily_seconds)
  from public.tutor_config c
$$;

revoke execute on function public.ch_worker_tutor_settings() from public, anon, authenticated;


alter table public.tutor_config drop column if exists question_hint_enabled;
