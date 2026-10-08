-- =============================================================================
-- Tutor Nexus: a chamada da voz do professor (spec §16 "Chamada tts"; plano, Tarefa 4).
-- Uma linha em tutor_voice_calls com provider 'tts' marca que a Nexus está aberta. Ela:
--   * divide com a voz ao vivo a regra de uma chamada ativa por aluno (a voz ao vivo, ao abrir, encerra a tts sozinha);
--   * não depende nem gasta o tempo da voz ao vivo (tutor_voice_seconds a ignora; renovar, encerrar e varrer não gravam
--     segundos nem linha no registro de uso; o gasto dela são os caracteres, migração …5700);
--   * não cai entre turnos enquanto a Nexus renova;
--   * guarda a trava de turno (60 s) e o resultado do último turno (client_turn_id), para o mesmo pedido repetido não
--     rodar duas vezes.
-- =============================================================================

alter table public.tutor_voice_calls drop constraint tutor_voice_calls_provider_check;
alter table public.tutor_voice_calls add constraint tutor_voice_calls_provider_check check (provider in ('realtime', 'live', 'gemini', 'tts'));
alter table public.tutor_voice_calls
  add column turn_id text check (turn_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  add column turn_until timestamptz,
  add column turn_result jsonb;

-- Segundos de voz ao vivo que já contam (…3500): a chamada da voz do professor fica fora.
create or replace function public.tutor_voice_seconds(p_user uuid, p_day date, p_since timestamptz) returns integer
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case when v.status = 'active' then greatest(0, ceil(extract(epoch from (v.lease_until - v.started_at))))::int else v.consumed_seconds end), 0)::int
  from public.tutor_voice_calls v
  where v.user_id = p_user and v.provider <> 'tts' and (p_day is null or v.day = p_day) and (p_since is null or v.started_at >= p_since)
$$;

-- ---------------------------------------------------------------- abrir a Nexus
-- Mesma trava por aluno e mesma limpeza de reservas vencidas da voz ao vivo. Não olha o tempo da voz ao vivo: exige Tutor
-- ligado, direito ao Tutor e voz ligada; com p_spoken (a resposta vai sair falada), também caracteres do aluno e da conta.
-- Abrir não reserva caracteres (cada fala reserva os seus). Com p_force, encerra a chamada anterior como 'replaced'.
create function public.ch_worker_tutor_tts_open(p_user uuid, p_session_id uuid, p_force boolean, p_spoken boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.tutor_sessions;
  q jsonb;
  v_old public.tutor_voice_calls;
  v_reason text;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  select * into c from public.tutor_config;
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'session_closed'); end if;
  if s.legacy_persona is not null or not coalesce((select t.active from public.tutor_personalities t where t.id = s.personality_id), false) then
    return jsonb_build_object('ok', false, 'reason', 'read_only');
  end if;
  update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = coalesce(closing_reason, 'timeout'),
    consumed_seconds = case when provider = 'tts' then 0 else greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int end
  where user_id = p_user and status = 'active' and lease_until < now();
  select * into v_old from public.tutor_voice_calls where user_id = p_user and status = 'active';
  if found and not coalesce(p_force, false) then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  q := public.tutor_tts_quota(p_user);
  v_reason := case
    when not (q ->> 'enabled')::boolean then 'disabled'
    when q ->> 'mode' = 'blocked' then 'trial_expired'
    when not (q ->> 'voice_enabled')::boolean then 'voice_disabled'
    when coalesce(p_spoken, false) and (q ->> 'remaining_today')::integer <= 0 then 'student_limit'
    when coalesce(p_spoken, false) and (q ->> 'account_day_left')::integer <= 0 then 'account_day'
    when coalesce(p_spoken, false) and (q ->> 'account_month_left')::integer <= 0 then 'account_month' end;
  if v_reason is not null then return jsonb_build_object('ok', false, 'reason', v_reason); end if;
  if v_old.id is not null then
    if v_old.provider = 'tts' then
      update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'replaced', consumed_seconds = 0 where id = v_old.id;
    else
      -- a voz ao vivo substituída conta o tempo real, como na troca de aparelho da voz ao vivo
      update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'replaced',
        consumed_seconds = greatest(1, ceil(extract(epoch from (least(now(), lease_until) - started_at))))::int
      where id = v_old.id;
      insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
      select p_user, v_old.session_id, 'tutor_voice', v_old.model, v.consumed_seconds, jsonb_build_object('voice_call', v_old.id, 'provider', v_old.provider) from public.tutor_voice_calls v where v.id = v_old.id;
      update public.tutor_sessions set voice_seconds = voice_seconds + (select v.consumed_seconds from public.tutor_voice_calls v where v.id = v_old.id) where id = v_old.session_id;
    end if;
  end if;
  insert into public.tutor_voice_calls (user_id, session_id, model, provider, lease_until)
  values (p_user, s.id, 'tts', 'tts', now() + make_interval(secs => c.voice_lease_seconds)) returning id into v_id;
  perform public.tutor_begin_trial(p_user);
  return jsonb_build_object('ok', true, 'voice_call_id', v_id, 'lease_seconds', c.voice_lease_seconds,
                            'replaced_call_id', v_old.call_id, 'replaced_provider', v_old.provider);
end
$$;

-- ---------------------------------------------------------------- trava de turno (60 s) e client_turn_id
-- Só na chamada tts ativa do próprio aluno. O mesmo turno já terminado devolve o resultado guardado (repeat); outro turno
-- dentro dos 60 s recebe busy. Trava vencida (servidor caiu no meio do turno) libera.
create function public.ch_worker_tutor_tts_turn_begin(p_user uuid, p_voice_call uuid, p_turn_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.tutor_voice_calls;
begin
  if p_turn_id is null or p_turn_id !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'Turno inválido.' using errcode = '22023'; end if;
  select * into v from public.tutor_voice_calls where id = p_voice_call for update;
  if not found or v.user_id <> p_user or v.status <> 'active' or v.provider <> 'tts' then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if v.turn_id = p_turn_id and v.turn_result is not null then return jsonb_build_object('ok', false, 'reason', 'repeat', 'result', v.turn_result); end if;
  if v.turn_until > now() then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  update public.tutor_voice_calls set turn_id = p_turn_id, turn_until = now() + interval '60 seconds', turn_result = null where id = v.id;
  return jsonb_build_object('ok', true);
end
$$;

-- Fim do turno: solta a trava e guarda o resultado (nulo na falha, para a nova tentativa rodar). Só o turno que está na trava.
create function public.ch_worker_tutor_tts_turn_end(p_user uuid, p_voice_call uuid, p_turn_id text, p_result jsonb) returns void
  language sql security definer set search_path = ''
as $$
  update public.tutor_voice_calls set turn_until = null, turn_result = case when jsonb_typeof(p_result) = 'object' then p_result end
   where id = p_voice_call and user_id = p_user and provider = 'tts' and turn_id = p_turn_id
$$;

-- ---------------------------------------------------------------- voz ao vivo (…4400): a chamada tts entra nas regras
-- Abrir: igual ao anterior (…4400); a chamada tts ativa do aluno é encerrada como 'replaced', sem p_force e sem segundos;
-- reserva tts vencida sai sem segundos.
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

-- Renovação: igual à anterior (…4400) para a voz ao vivo. Na tts, só estende a reserva por voice_lease_seconds (para com
-- stop se o Tutor estiver desligado, o teste tiver terminado ou a voz estiver desligada); vencida ou com a conversa
-- encerrada, termina sem segundos.
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

-- Fim da chamada: igual ao anterior (…4400); a tts termina com 0 segundos, sem registro e sem somar na conversa.
create or replace function public.ch_worker_tutor_voice_end(p_user uuid, p_voice_call uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.tutor_voice_calls;
  v_secs integer;
  v_reason text;
begin
  select * into v from public.tutor_voice_calls where id = p_voice_call and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false); end if;
  if v.status <> 'active' then return jsonb_build_object('ok', true, 'consumed_seconds', v.consumed_seconds, 'call_id', v.call_id, 'provider', v.provider, 'already', true); end if;
  -- chamada que nunca chegou a conectar (falha ao abrir a voz) não cobra; o resto conta o tempo real, nunca além da reserva
  v_secs := case when v.provider = 'tts' or (p_reason = 'error' and v.call_id is null) then 0 else greatest(1, ceil(extract(epoch from (least(now(), v.lease_until) - v.started_at))))::int end;
  v_reason := case when p_reason in ('student', 'timeout', 'quota', 'replaced', 'error', 'session_closed', 'session_limit') then p_reason else 'student' end;
  if v.closing_reason is not null and v_reason = 'student' then v_reason := v.closing_reason; end if;
  update public.tutor_voice_calls set status = 'ended', ended_at = now(), consumed_seconds = v_secs, termination_reason = v_reason where id = v.id;
  -- a voz do professor não grava segundos: o gasto dela está nos caracteres (tutor_tts)
  if v.provider <> 'tts' then
    insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
    values (p_user, v.session_id, 'tutor_voice', v.model, v_secs, jsonb_build_object('voice_call', v.id, 'reason', v_reason, 'provider', v.provider));
    update public.tutor_sessions set voice_seconds = voice_seconds + v_secs, last_message_at = greatest(last_message_at, now()) where id = v.session_id;
  end if;
  return jsonb_build_object('ok', true, 'consumed_seconds', v_secs, 'call_id', v.call_id, 'provider', v.provider, 'model', v.model, 'session_id', v.session_id);
end
$$;

-- Varredura: igual à anterior (…4400); a tts vencida sai com 0 segundos, sem registro e sem somar na conversa.
create or replace function public.ch_worker_tutor_voice_sweep() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  with gone as (
    update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = coalesce(closing_reason, 'timeout'),
      consumed_seconds = case when provider = 'tts' then 0 else greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int end
    where status = 'active' and lease_until < now() - interval '15 seconds'
    returning id, user_id, session_id, call_id, provider, model, consumed_seconds),
  led as (
    insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
    select user_id, session_id, 'tutor_voice', model, consumed_seconds, jsonb_build_object('voice_call', id, 'reason', 'timeout', 'provider', provider) from gone where provider <> 'tts' returning 1),
  ses as (
    update public.tutor_sessions s set voice_seconds = s.voice_seconds + g.n from (select session_id, sum(consumed_seconds)::int n from gone where provider <> 'tts' group by session_id) g where s.id = g.session_id returning 1)
  select coalesce(jsonb_agg(jsonb_build_object('voice_call', id, 'call_id', call_id, 'provider', provider, 'model', model, 'user_id', user_id, 'session_id', session_id, 'seconds', consumed_seconds)), '[]'::jsonb)
    into v_out from gone;
  return v_out;
end
$$;

-- Ligação aberta: igual ao anterior (…4900), aceitando também 'tts'.
create or replace function public.ch_worker_tutor_voice_attach(p_user uuid, p_voice_call uuid, p_call_id text, p_provider text) returns boolean
  language sql security definer set search_path = ''
as $$
  update public.tutor_voice_calls
     set call_id = case when p_call_id ~ '^[A-Za-z0-9_-]{4,120}$' then p_call_id else call_id end,
         provider = case when p_provider in ('realtime', 'live', 'gemini', 'tts') then p_provider else provider end
   where id = p_voice_call and user_id = p_user and status = 'active'
  returning true
$$;

-- Métricas: iguais às anteriores (…4400), mais os tempos de cada etapa da Nexus (transcrição, motor, voz, início do som).
create or replace function public.ch_worker_tutor_voice_metrics(p_user uuid, p_voice_call uuid, p_metrics jsonb) returns boolean
  language sql security definer set search_path = ''
as $$
  update public.tutor_voice_calls v set metrics = v.metrics || coalesce((
    select jsonb_object_agg(k, case when k in ('disconnect_reason', 'mic_permission', 'last_error', 'provider_used')
                                    then to_jsonb(left(regexp_replace(p_metrics ->> k, '[^a-z0-9_:-]', '', 'gi'), 40))
                                    else to_jsonb(least(greatest(round((p_metrics ->> k)::numeric), 0), 86400000)) end)
    from jsonb_object_keys(p_metrics) k
    where (k in ('connect_ms', 'first_audio_ms', 'turn_ms_avg', 'turns', 'reconnects', 'tool_ms_avg', 'tools', 'delegations', 'delegate_ms_avg',
                 'audio_errors', 'device_changes', 'interruptions', 'muted_ms', 'texts',
                 'stt_ms_avg', 'engine_ms_avg', 'tts_ms_avg', 'play_start_ms_avg') and jsonb_typeof(p_metrics -> k) = 'number')
       or (k in ('disconnect_reason', 'mic_permission', 'last_error', 'provider_used') and jsonb_typeof(p_metrics -> k) = 'string')
  ), '{}'::jsonb)
  where v.id = p_voice_call and v.user_id = p_user and jsonb_typeof(p_metrics) = 'object'
  returning true
$$;

-- ---------------------------------------------------------------- permissões
do $revoke$
begin
  revoke execute on function public.ch_worker_tutor_tts_open(uuid, uuid, boolean, boolean) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_tts_turn_begin(uuid, uuid, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_tts_turn_end(uuid, uuid, text, jsonb) from public, anon, authenticated;
end
$revoke$;
