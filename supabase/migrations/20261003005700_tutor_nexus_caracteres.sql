-- =============================================================================
-- Tutor Nexus: caracteres da voz do professor (spec §8 e §16 "Limites"; plano, Tarefa 3).
--   * por aluno e por dia de Brasília: tts_trial_daily_chars (teste grátis) ou tts_paid_daily_chars (pago e equipe);
--   * tetos da conta inteira: tts_account_daily_chars (dia de Brasília) e tts_account_monthly_chars (mês do calendário em Brasília);
--   * reserva antes de gerar (sob trava, para dois pedidos ao mesmo tempo não estourarem o limite) e estorno se a voz não sair;
--     a fala gerada vira uma linha tutor_tts no registro de uso (o ai_usage_ledger só aceita linhas novas, por isso a reserva
--     tem tabela própria);
--   * audição do painel (tutor_tts_audicao) e transcrição (tutor_stt) entram no registro e não contam nos limites;
--   * a leitura da voz (ch_worker_tutor_speech) deixa a regra antiga "só assinante" e passa a seguir o direito do Tutor, e
--     cada fala vai com o estado com que foi escrita (meta.personality).
-- A voz do professor não depende nem gasta o tempo da voz ao vivo.
-- =============================================================================

alter table public.ai_usage_ledger drop constraint ai_usage_ledger_feature_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_feature_check
  check (feature in ('tutor_text', 'tutor_eval', 'tutor_voice', 'tutor_voice_tokens', 'tutor_tts', 'tutor_voice_live', 'tutor_voice_backend', 'tutor_voice_gemini',
                     'podcast_script', 'podcast_tts', 'lesson_assist', 'tutor_stt', 'tutor_tts_audicao'));

-- ---------------------------------------------------------------- reservas de caracteres (só o servidor grava)
create table public.tutor_tts_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.tutor_sessions (id) on delete set null,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  month date not null default date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
  chars integer not null check (chars between 1 and 4000),
  status text not null default 'reserved' check (status in ('reserved', 'spent', 'refunded')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index tutor_tts_usage_user_day_idx on public.tutor_tts_usage (user_id, day);
create index tutor_tts_usage_day_idx on public.tutor_tts_usage (day);
create index tutor_tts_usage_month_idx on public.tutor_tts_usage (month);
alter table public.tutor_tts_usage enable row level security;

-- ---------------------------------------------------------------- quanto ainda dá para falar
-- Contam as reservas em aberto e as gastas (o estorno devolve). O modo vem do direito do Tutor (a equipe conta como pago).
create function public.tutor_tts_quota(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  e jsonb;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_limit integer;
  v_used integer;
  v_aday integer;
  v_amonth integer;
begin
  select * into c from public.tutor_config;
  e := public.tutor_entitlement(p_user);
  v_limit := case e ->> 'mode' when 'blocked' then 0 when 'trial' then c.tts_trial_daily_chars else c.tts_paid_daily_chars end;
  v_used := coalesce((select sum(u.chars) from public.tutor_tts_usage u where u.user_id = p_user and u.day = v_day and u.status in ('reserved', 'spent')), 0);
  v_aday := coalesce((select sum(u.chars) from public.tutor_tts_usage u where u.day = v_day and u.status in ('reserved', 'spent')), 0);
  v_amonth := coalesce((select sum(u.chars) from public.tutor_tts_usage u where u.month = v_month and u.status in ('reserved', 'spent')), 0);
  return jsonb_build_object(
    'consent_pending', public.tutor_consent_pending(p_user),
    'enabled', coalesce((e ->> 'enabled')::boolean, false), 'mode', e ->> 'mode', 'staff', coalesce((e ->> 'staff')::boolean, false),
    'voice_enabled', c.voice_enabled, 'team_only', c.tts_team_only,
    'limit_today', v_limit, 'used_today', v_used, 'remaining_today', greatest(0, v_limit - v_used),
    'account_day_left', greatest(0, c.tts_account_daily_chars - v_aday), 'account_month_left', greatest(0, c.tts_account_monthly_chars - v_amonth),
    'reserve_can', coalesce((e ->> 'can_voice')::boolean, false), 'reserve_remaining_s', coalesce((e #>> '{voice,remaining_s}')::integer, 0),
    'approvals', coalesce((select jsonb_object_agg(a.voice, jsonb_build_object('fingerprint', a.fingerprint, 'approved_at', a.approved_at, 'sample_path', a.sample_path))
                           from public.tutor_voice_approvals a where a.revoked_at is null), '{}'::jsonb));
end
$$;

create function public.ch_worker_tutor_tts_quota(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.tutor_tts_quota(p_user)
$$;

-- Reserva antes de gerar a voz. Travas: primeiro a do aluno no dia, depois a da conta (sempre nessa ordem: sem impasse).
create function public.ch_worker_tutor_tts_reserve(p_user uuid, p_session_id uuid, p_chars integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  q jsonb;
  v_reason text;
  v_id bigint;
begin
  if p_chars is null or p_chars < 1 or p_chars > 4000 then raise exception 'Texto de voz inválido.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tutor-tts:' || p_user::text || ':' || v_day::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('tutor-tts-conta', 0));
  q := public.tutor_tts_quota(p_user);
  v_reason := case
    when not (q ->> 'enabled')::boolean then 'disabled'
    when q ->> 'mode' = 'blocked' then 'trial_expired'
    when not (q ->> 'voice_enabled')::boolean then 'voice_disabled'
    when (q ->> 'remaining_today')::integer < p_chars then 'student_limit'
    when (q ->> 'account_day_left')::integer < p_chars then 'account_day'
    when (q ->> 'account_month_left')::integer < p_chars then 'account_month' end;
  if v_reason is not null then return jsonb_build_object('ok', false, 'reason', v_reason, 'quota', q); end if;
  insert into public.tutor_tts_usage (user_id, session_id, chars) values (p_user, p_session_id, p_chars) returning id into v_id;
  return jsonb_build_object('ok', true, 'reservation', v_id, 'quota', public.tutor_tts_quota(p_user));
end
$$;

-- Acerto da reserva: gasta (vira uma linha tutor_tts no registro de uso) ou estorna. Só mexe em reserva aberta do próprio aluno.
create function public.ch_worker_tutor_tts_settle(p_user uuid, p_reservation bigint, p_spent boolean, p_entry jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  u public.tutor_tts_usage;
begin
  update public.tutor_tts_usage set status = case when p_spent then 'spent' else 'refunded' end, settled_at = now()
   where id = p_reservation and user_id = p_user and status = 'reserved'
  returning * into u;
  if not found or not coalesce(p_spent, false) then return; end if;
  insert into public.ai_usage_ledger (user_id, session_id, feature, provider, model, characters, estimated_cost_usd, persona, mode, meta)
  values (p_user, u.session_id, 'tutor_tts', left(p_entry ->> 'provider', 40), left(p_entry ->> 'model', 80), u.chars,
          greatest(0, coalesce((p_entry ->> 'estimated_cost_usd')::numeric, 0)),
          (select s.personality_id from public.tutor_sessions s where s.id = u.session_id), (select s.mode from public.tutor_sessions s where s.id = u.session_id),
          coalesce(p_entry -> 'meta', '{}'::jsonb) || jsonb_build_object('reservation', u.id));
end
$$;

-- ---------------------------------------------------------------- o que pode virar voz (…5400)
-- Mais: sai "só assinante" (requires_pro/is_pro) e o contador antigo (used_chars); entram quota (direito do Tutor e limites
-- da voz do professor), session_id e direction (o estado com que a fala foi escrita; nulo em frase fixa e questão).
create or replace function public.ch_worker_tutor_speech(p_user uuid, p_session_id uuid, p_kind text, p_message_id bigint, p_personality text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.tutor_sessions;
  t public.tutor_personalities;
  v_text text;
  v_dir jsonb;
  v_pending constant boolean := public.tutor_consent_pending(p_user);
begin
  select * into c from public.tutor_config;
  if p_kind in ('message', 'question') then
    select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
    if not found then return jsonb_build_object('found', false, 'consent_pending', v_pending); end if;
    select * into t from public.tutor_personalities where id = s.personality_id;
    if p_kind = 'message' then
      -- a fala vai com o estado com que foi escrita (meta.personality), não com o humor atual da conversa
      select m.content, m.meta -> 'personality' into v_text, v_dir from public.tutor_messages m where m.id = p_message_id and m.session_id = s.id and m.role = 'tutor';
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
    'config', jsonb_build_object('enabled', c.enabled, 'voice_enabled', c.voice_enabled),
    'quota', public.tutor_tts_quota(p_user),
    'session_id', s.id,
    'direction', case when p_kind = 'message' then v_dir end,
    'personality', t.id, 'voice', t.voice, 'sample', t.openings[1], 'text', v_text);
end
$$;

-- ---------------------------------------------------------------- permissões
do $revoke$
begin
  revoke execute on function public.tutor_tts_quota(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_tts_quota(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_tts_reserve(uuid, uuid, integer) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_tts_settle(uuid, bigint, boolean, jsonb) from public, anon, authenticated;
end
$revoke$;
