-- =============================================================================
-- Stazia Voice Mode: conversa por voz em tela cheia com o Tutor (GPT-Live ou OpenAI Realtime).
-- Pedido de 2026-10-06 ("Tutor IA por voz em tempo real"); auditoria e mapa em docs/architecture/STAZIA_VOICE_MODE.md.
--
-- Reaproveita o que já existia (tutor_config, tutor_voice_calls, tutor_sessions, tutor_reviews, ai_usage_ledger,
-- tutor_learning_memory, tutor_session_summary). Novo só o que não tinha onde ficar:
--  - configuração da voz no painel: provedor, voz, limite por conversa, transcrição e retenção, motor emocional,
--    piadas internas, nível da Durona e pronúncias;
--  - tutor_voice_calls: provedor, métricas da ligação (latência, reconexões, motivo do fim) e o encerramento com
--    folga (o limite não corta o professor no meio da frase: ele termina o turno e só então a ligação cai);
--  - tutor_memories: lembranças que o professor decide guardar (piada interna, fato, preferência, meta, conquista);
--  - revisão pedida pelo professor (tutor_reviews.reason = 'tutor_request');
--  - custo da voz por tempo (GPT-Live) e das respostas do servidor na voz (ai_usage_ledger.feature).
-- Nenhum áudio é guardado: só transcrição (se ligada no painel), métricas, resumo e eventos pedagógicos.
-- Reversível: colunas novas com padrão, uma tabela nova e funções; o roteiro de volta está no fim (comentado).
-- =============================================================================

-- ---------------------------------------------------------------- configuração (painel → Stazia Tutor → Voz)
alter table public.tutor_config
  add column voice_provider text not null default 'auto' check (voice_provider in ('auto', 'live', 'realtime')),
  add column voice_name text check (voice_name ~ '^[a-z][a-z0-9_-]{1,30}$'),           -- nula = a voz de cada professor
  add column voice_session_max_seconds integer not null default 1800 check (voice_session_max_seconds between 60 and 14400),
  add column save_transcripts boolean not null default true,
  add column transcript_retention_days integer not null default 180 check (transcript_retention_days between 0 and 3650),  -- 0 = sem prazo
  add column emotion_engine boolean not null default true,
  add column inside_jokes boolean not null default true,
  add column durona_level text not null default 'forte' check (durona_level in ('moderada', 'forte', 'sem_filtro')),
  add column pronunciations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pronunciations) = 'array' and jsonb_array_length(pronunciations) <= 60);

-- ---------------------------------------------------------------- chamadas de voz
alter table public.tutor_voice_calls
  add column provider text not null default 'realtime' check (provider in ('realtime', 'live')),
  add column metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  add column closing_at timestamptz,                    -- limite atingido: a ligação termina o turno e cai (folga curta)
  add column closing_reason text check (closing_reason in ('quota', 'session_limit'));
alter table public.tutor_voice_calls drop constraint tutor_voice_calls_termination_reason_check;
alter table public.tutor_voice_calls add constraint tutor_voice_calls_termination_reason_check
  check (termination_reason in ('student', 'timeout', 'quota', 'replaced', 'error', 'session_closed', 'session_limit'));

alter table public.tutor_reviews drop constraint tutor_reviews_reason_check;
alter table public.tutor_reviews add constraint tutor_reviews_reason_check
  check (reason in ('wrong', 'wrong_confident', 'lucky_guess', 'heavy_hints', 'tutor_request'));

alter table public.ai_usage_ledger drop constraint ai_usage_ledger_feature_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_feature_check
  check (feature in ('tutor_text', 'tutor_eval', 'tutor_voice', 'tutor_voice_tokens', 'tutor_tts', 'tutor_voice_live', 'tutor_voice_backend'));

-- ---------------------------------------------------------------- lembranças que o professor guarda
create table public.tutor_memories (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('inside_joke', 'fact', 'preference', 'goal', 'milestone')),
  concept text not null check (char_length(btrim(concept)) between 2 and 120),
  note text check (char_length(note) <= 400),
  strength smallint not null default 1 check (strength between 1 and 5),
  session_id uuid references public.tutor_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tutor_memories_one_per_concept on public.tutor_memories (user_id, kind, lower(btrim(concept)));
alter table public.tutor_memories enable row level security;
create policy "memórias do tutor: ler as próprias" on public.tutor_memories for select to authenticated using (user_id = (select auth.uid()));
-- escrita só pelo servidor (ch_worker_tutor_save_memory)

-- ---------------------------------------------------------------- funções do servidor (chave de serviço)
-- Configuração da voz e do motor (sem segredos: modelos e chaves ficam no ambiente do servidor).
create function public.ch_worker_tutor_settings() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', c.enabled, 'voice_enabled', c.voice_enabled, 'voice_provider', c.voice_provider, 'voice_name', c.voice_name,
    'voice_session_max_seconds', c.voice_session_max_seconds, 'save_transcripts', c.save_transcripts,
    'transcript_retention_days', c.transcript_retention_days, 'emotion_engine', c.emotion_engine, 'inside_jokes', c.inside_jokes,
    'durona_level', c.durona_level, 'pronunciations', c.pronunciations, 'max_profanity', c.max_profanity)
  from public.tutor_config c
$$;

-- GPT-Live: o servidor já conhece o id da sessão na OpenAI ao abrir (Realtime continua chegando pela renovação).
create function public.ch_worker_tutor_voice_attach(p_user uuid, p_voice_call uuid, p_call_id text, p_provider text) returns boolean
  language sql security definer set search_path = ''
as $$
  update public.tutor_voice_calls
     set call_id = case when p_call_id ~ '^[A-Za-z0-9_-]{4,120}$' then p_call_id else call_id end,
         provider = case when p_provider in ('realtime', 'live') then p_provider else provider end
   where id = p_voice_call and user_id = p_user and status = 'active'
  returning true
$$;

-- Abrir: igual ao anterior (…3500); devolve também o provedor da chamada substituída (para o servidor saber como desligá-la).
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
    consumed_seconds = greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int
  where user_id = p_user and status = 'active' and lease_until < now();
  select * into v_old from public.tutor_voice_calls where user_id = p_user and status = 'active';
  if found then
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

-- Renovação: igual à anterior (…3500), mais o limite por conversa e a folga para terminar o turno.
-- Saldo acabou ou a conversa chegou ao limite: a primeira vez marca "encerrando" e dá 20 s de reserva (o professor
-- termina a frase e o aplicativo encerra); renovar de novo não estende. Sem encerramento, a varredura derruba depois.
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

-- Fim da chamada: igual ao anterior (…3500); aceita "session_limit" e guarda o provedor no registro de uso.
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
  v_secs := case when p_reason = 'error' and v.call_id is null then 0 else greatest(1, ceil(extract(epoch from (least(now(), v.lease_until) - v.started_at))))::int end;
  v_reason := case when p_reason in ('student', 'timeout', 'quota', 'replaced', 'error', 'session_closed', 'session_limit') then p_reason else 'student' end;
  if v.closing_reason is not null and v_reason = 'student' then v_reason := v.closing_reason; end if;
  update public.tutor_voice_calls set status = 'ended', ended_at = now(), consumed_seconds = v_secs, termination_reason = v_reason where id = v.id;
  insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
  values (p_user, v.session_id, 'tutor_voice', v.model, v_secs, jsonb_build_object('voice_call', v.id, 'reason', v_reason, 'provider', v.provider));
  update public.tutor_sessions set voice_seconds = voice_seconds + v_secs, last_message_at = greatest(last_message_at, now()) where id = v.session_id;
  return jsonb_build_object('ok', true, 'consumed_seconds', v_secs, 'call_id', v.call_id, 'provider', v.provider, 'model', v.model, 'session_id', v.session_id);
end
$$;

-- Varredura (versão com o provedor, para o servidor saber como desligar cada uma). A anterior continua existindo.
create function public.ch_worker_tutor_voice_sweep() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  with gone as (
    update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = coalesce(closing_reason, 'timeout'),
      consumed_seconds = greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int
    where status = 'active' and lease_until < now() - interval '15 seconds'
    returning id, user_id, session_id, call_id, provider, model, consumed_seconds),
  led as (
    insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
    select user_id, session_id, 'tutor_voice', model, consumed_seconds, jsonb_build_object('voice_call', id, 'reason', 'timeout', 'provider', provider) from gone returning 1),
  ses as (
    update public.tutor_sessions s set voice_seconds = s.voice_seconds + g.n from (select session_id, sum(consumed_seconds)::int n from gone group by session_id) g where s.id = g.session_id returning 1)
  select coalesce(jsonb_agg(jsonb_build_object('voice_call', id, 'call_id', call_id, 'provider', provider, 'model', model, 'user_id', user_id, 'session_id', session_id, 'seconds', consumed_seconds)), '[]'::jsonb)
    into v_out from gone;
  return v_out;
end
$$;

create or replace function public.ch_worker_tutor_voice_call(p_user uuid, p_voice_call uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', v.id, 'session_id', v.session_id, 'status', v.status, 'model', v.model, 'call_id', v.call_id, 'lease_until', v.lease_until,
                            'provider', v.provider, 'closing_at', v.closing_at, 'started_at', v.started_at)
  from public.tutor_voice_calls v where v.id = p_voice_call and v.user_id = p_user
$$;

-- Métricas da ligação (o aplicativo manda ao encerrar): só números e rótulos curtos conhecidos; nada de conteúdo.
create function public.ch_worker_tutor_voice_metrics(p_user uuid, p_voice_call uuid, p_metrics jsonb) returns boolean
  language sql security definer set search_path = ''
as $$
  update public.tutor_voice_calls v set metrics = v.metrics || coalesce((
    select jsonb_object_agg(k, case when k in ('disconnect_reason', 'mic_permission', 'last_error', 'provider_used')
                                    then to_jsonb(left(regexp_replace(p_metrics ->> k, '[^a-z0-9_:-]', '', 'gi'), 40))
                                    else to_jsonb(least(greatest(round((p_metrics ->> k)::numeric), 0), 86400000)) end)
    from jsonb_object_keys(p_metrics) k
    where (k in ('connect_ms', 'first_audio_ms', 'turn_ms_avg', 'turns', 'reconnects', 'tool_ms_avg', 'tools', 'delegations', 'delegate_ms_avg',
                 'audio_errors', 'device_changes', 'interruptions', 'muted_ms', 'texts') and jsonb_typeof(p_metrics -> k) = 'number')
       or (k in ('disconnect_reason', 'mic_permission', 'last_error', 'provider_used') and jsonb_typeof(p_metrics -> k) = 'string')
  ), '{}'::jsonb)
  where v.id = p_voice_call and v.user_id = p_user and jsonb_typeof(p_metrics) = 'object'
  returning true
$$;

-- O professor guarda uma lembrança (pela ferramenta da voz ou pelo servidor). Repetir o mesmo assunto fortalece a lembrança.
create function public.ch_worker_tutor_save_memory(p_user uuid, p_session_id uuid, p_memory jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text := p_memory ->> 'kind';
  v_concept text := left(btrim(regexp_replace(coalesce(p_memory ->> 'concept', ''), '\s+', ' ', 'g')), 120);
  v_note text := nullif(left(btrim(regexp_replace(coalesce(p_memory ->> 'note', ''), '\s+', ' ', 'g')), 400), '');
  v_row public.tutor_memories;
begin
  if not exists (select 1 from public.tutor_sessions s where s.id = p_session_id and s.user_id = p_user) then
    raise exception 'Conversa não encontrada.' using errcode = 'P0002';
  end if;
  if v_kind is null or v_kind not in ('inside_joke', 'fact', 'preference', 'goal', 'milestone') then
    raise exception 'Tipo de lembrança inválido.' using errcode = '22023';
  end if;
  if char_length(v_concept) < 2 then raise exception 'Diga sobre o que é a lembrança.' using errcode = '22023'; end if;
  if v_kind = 'inside_joke' and not (select c.inside_jokes from public.tutor_config c) then
    return jsonb_build_object('saved', false, 'reason', 'Piadas internas estão desligadas.');
  end if;
  insert into public.tutor_memories as m (user_id, kind, concept, note, session_id)
  values (p_user, v_kind, v_concept, v_note, p_session_id)
  on conflict (user_id, kind, lower(btrim(concept))) do update
    set strength = least(5, m.strength + 1), note = coalesce(excluded.note, m.note), session_id = excluded.session_id, updated_at = now()
  returning * into v_row;
  -- no máximo 100 lembranças por aluno: saem as mais fracas e mais antigas
  delete from public.tutor_memories where id in (
    select x.id from public.tutor_memories x where x.user_id = p_user order by x.strength desc, x.updated_at desc offset 100);
  return jsonb_build_object('saved', true, 'kind', v_row.kind, 'concept', v_row.concept, 'strength', v_row.strength);
end
$$;

-- O que a voz precisa para abrir a conversa: lembranças fortes, a última conversa (para continuidade) e a configuração.
create function public.ch_worker_tutor_voice_context(p_user uuid, p_session_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'memories', coalesce((
      select jsonb_agg(jsonb_build_object('kind', m.kind, 'concept', m.concept, 'note', m.note, 'strength', m.strength) order by m.strength desc, m.updated_at desc)
      from (select * from public.tutor_memories x
            where x.user_id = p_user and (x.kind <> 'inside_joke' or (select c.inside_jokes from public.tutor_config c))
            order by x.strength desc, x.updated_at desc limit 8) m), '[]'::jsonb),
    'last_session', (
      select jsonb_build_object('id', s.id, 'title', s.title, 'topic', coalesce(s.topic, s.context_label), 'mode', s.mode,
                                'days_ago', greatest(0, (now() at time zone 'America/Sao_Paulo')::date - (coalesce(s.ended_at, s.last_message_at) at time zone 'America/Sao_Paulo')::date),
                                'summary', s.summary)
      from public.tutor_sessions s
      where s.user_id = p_user and s.id <> p_session_id
        and exists (select 1 from public.tutor_messages x where x.session_id = s.id)
      order by coalesce(s.ended_at, s.last_message_at) desc limit 1),
    'settings', public.ch_worker_tutor_settings())
$$;

-- O professor manda a questão desta conversa para a revisão espaçada (no máximo em 60 dias; mantém a data mais próxima).
create function public.ch_worker_tutor_schedule_review(p_user uuid, p_session_id uuid, p_days integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  v_days integer := least(greatest(coalesce(p_days, 3), 1), 60);
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.question_id is null then return jsonb_build_object('scheduled', false, 'reason', 'Esta conversa não tem questão para revisar.'); end if;
  insert into public.tutor_reviews (user_id, question_id, step, due_at, reason)
  values (p_user, s.question_id, 0, now() + make_interval(days => v_days), 'tutor_request')
  on conflict (user_id, question_id) do update set due_at = least(public.tutor_reviews.due_at, excluded.due_at), updated_at = now();
  return jsonb_build_object('scheduled', true, 'days', v_days);
end
$$;

-- Retenção das transcrições da voz (painel): apaga as falas transcritas mais antigas que o prazo. 0 = sem prazo.
create function public.ch_worker_tutor_purge_transcripts() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_days integer;
  v_n integer;
begin
  select c.transcript_retention_days into v_days from public.tutor_config c;
  if coalesce(v_days, 0) = 0 then return 0; end if;
  delete from public.tutor_messages m
   where coalesce((m.meta ->> 'realtime')::boolean, false) and m.created_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Memória para as ferramentas da voz: a de antes (…3500) mais as lembranças guardadas; sem piadas internas se desligadas.
create or replace function public.ch_worker_tutor_memory(p_user uuid, p_area text, p_theme text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select (case when (select c.inside_jokes from public.tutor_config c) then m else m - 'inside_jokes' end)
         || jsonb_build_object('saved_memories', coalesce((
              select jsonb_agg(jsonb_build_object('kind', x.kind, 'concept', x.concept, 'note', x.note, 'strength', x.strength) order by x.strength desc, x.updated_at desc)
              from (select * from public.tutor_memories t
                    where t.user_id = p_user and (t.kind <> 'inside_joke' or (select c.inside_jokes from public.tutor_config c))
                    order by t.strength desc, t.updated_at desc limit 12) x), '[]'::jsonb))
  from (select coalesce(public.tutor_learning_memory(p_user, p_area, p_theme), '{}'::jsonb) as m) base
$$;

-- Gravar um turno: igual ao anterior (…3700), mais:
--  - transcrição da voz só se a configuração mandar guardar (sem ela, a conversa segue com o histórico que o app manda);
--  - o custo das respostas do servidor na voz (GPT-Live) entra como "tutor_voice_backend".
create or replace function public.ch_worker_tutor_append(p_user uuid, p_session_id uuid, p_student text, p_tutor text, p_meta jsonb, p_usage jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  v_id bigint;
  v_voice boolean := coalesce((p_meta ->> 'realtime')::boolean, false);
  v_keep boolean := not v_voice or coalesce((select c.save_transcripts from public.tutor_config c), true);
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if v_keep and nullif(btrim(coalesce(p_student, '')), '') is not null then
    insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, p_user, 'student', left(btrim(p_student), 6000),
      case when v_voice then '{"realtime": true}'::jsonb else '{}'::jsonb end);
  end if;
  if v_keep and nullif(btrim(coalesce(p_tutor, '')), '') is not null then
    insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, p_user, 'tutor', left(p_tutor, 6000), coalesce(p_meta, '{}'::jsonb) - 'emotion' - 'evaluation' - 'learning_event' - 'answer_reasoning_quality') returning id into v_id;
  end if;
  update public.tutor_sessions set last_message_at = now(),
    hint_level = coalesce(nullif(p_meta ->> 'hint_level', '')::smallint, hint_level),
    question_state = case when coalesce((p_meta ->> 'reveals_answer')::boolean, false) and question_state = 'open' then 'revealed' else question_state end,
    emotion = coalesce(p_meta -> 'emotion', emotion),
    difficulty_level = coalesce(nullif(p_meta ->> 'difficulty_level', '')::smallint, difficulty_level),
    -- "Perguntar ao Tutor": a primeira pergunta vira o título da sessão
    title = case when s.title = 'Perguntar ao Tutor' and nullif(btrim(coalesce(p_student, '')), '') is not null and not coalesce((p_meta ->> 'synthetic_student')::boolean, false)
                 then left(regexp_replace(btrim(p_student), '\s+', ' ', 'g'), 60) else title end
   where id = s.id;
  if p_meta ? 'error_class' or p_meta ? 'justification' then
    update public.tutor_answers a set
      error_class = coalesce(nullif(p_meta ->> 'error_class', ''), a.error_class),
      justification = case when p_meta ->> 'justification' in ('OK', 'INSUFFICIENT') then p_meta ->> 'justification' else a.justification end,
      lucky_guess = case when p_meta ->> 'justification' = 'OK' then false when p_meta ->> 'justification' = 'INSUFFICIENT' and a.is_correct then true else a.lucky_guess end
    where a.id = (select x.id from public.tutor_answers x where x.session_id = s.id and x.question_id = s.question_id order by x.answered_at desc limit 1);
    if p_meta ->> 'justification' = 'OK' then
      delete from public.tutor_reviews where user_id = p_user and question_id = s.question_id and reason = 'lucky_guess';
    elsif p_meta ->> 'justification' = 'INSUFFICIENT' then
      insert into public.tutor_reviews (user_id, question_id, step, due_at, reason)
      select p_user, s.question_id, 0, now() + interval '1 day', 'lucky_guess'
      where exists (select 1 from public.tutor_answers x where x.session_id = s.id and x.question_id = s.question_id and x.is_correct)
      on conflict (user_id, question_id) do nothing;
    end if;
  end if;
  if p_meta ->> 'answer_reasoning_quality' in ('low', 'medium', 'high') then
    update public.tutor_answers a set reasoning_quality = p_meta ->> 'answer_reasoning_quality'
    where a.id = (select x.id from public.tutor_answers x where x.session_id = s.id and x.question_id = s.question_id order by x.answered_at desc limit 1);
  end if;
  if p_meta ? 'learning_event' then
    perform public.ch_worker_tutor_learning_event(p_user, s.id, p_meta -> 'learning_event');
  end if;
  if coalesce((p_usage ->> 'calls')::int, 0) > 0 then
    insert into public.ai_usage_ledger (user_id, session_id, feature, provider, model, input_text_tokens, output_text_tokens, estimated_cost_usd, persona, mode, meta)
    values (p_user, s.id, case when p_usage ->> 'feature' = 'tutor_voice_backend' then 'tutor_voice_backend' else 'tutor_text' end,
            left(p_usage ->> 'provider', 40), left(p_usage ->> 'model', 80),
            greatest(0, coalesce((p_usage ->> 'input_tokens')::int, 0)), greatest(0, coalesce((p_usage ->> 'output_tokens')::int, 0)),
            greatest(0, coalesce((p_usage ->> 'cost_usd')::numeric, 0)), s.personality_id, s.mode, jsonb_build_object('calls', (p_usage ->> 'calls')::int));
    perform public.tutor_begin_trial(p_user);
  end if;
  return jsonb_build_object('id', v_id, 'used_today', public.tutor_usage_today(p_user));
end
$$;

-- ---------------------------------------------------------------- administração
create or replace function public.app_admin_tutor_config() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select to_jsonb(c) - 'id' from public.tutor_config c) || jsonb_build_object(
    'usage_30d', (select jsonb_build_object('students', count(distinct user_id)::int, 'requests', coalesce(sum(requests), 0)::int, 'input_tokens', coalesce(sum(input_tokens), 0)::bigint,
                         'output_tokens', coalesce(sum(output_tokens), 0)::bigint, 'cost_usd', coalesce(sum(cost_usd), 0), 'voice_minutes', round(coalesce(sum(voice_seconds), 0) / 60.0))
                  from public.ai_usage where day >= current_date - 30),
    'cost_by_feature', coalesce((select jsonb_object_agg(feature, cost) from (select feature, round(sum(estimated_cost_usd), 4) cost from public.ai_usage_ledger where day >= current_date - 30 group by feature) x), '{}'::jsonb),
    'cost_by_persona', coalesce((select jsonb_object_agg(coalesce(persona, '-'), cost) from (select persona, round(sum(estimated_cost_usd), 4) cost from public.ai_usage_ledger where day >= current_date - 30 group by persona) x), '{}'::jsonb),
    'trials', (select jsonb_build_object('started', count(*) filter (where tutor_trial_started_at is not null)::int,
                                         'converted', count(*) filter (where tutor_trial_started_at is not null and plan in ('pro', 'elite') and status in ('active', 'past_due'))::int)
               from public.subscriptions),
    'sessions', (select count(*)::int from public.tutor_sessions),
    -- voz nos últimos 30 dias: ligações, minutos, custo por ligação e qualidade (latências médias, reconexões, como terminaram)
    'voice_30d', (select jsonb_build_object(
        'calls', count(*)::int,
        'minutes', round(coalesce(sum(v.consumed_seconds), 0) / 60.0, 1),
        'avg_minutes', round(coalesce(avg(v.consumed_seconds) filter (where v.status <> 'active'), 0) / 60.0, 1),
        'connect_ms', round(avg((v.metrics ->> 'connect_ms')::numeric) filter (where jsonb_typeof(v.metrics -> 'connect_ms') = 'number')),
        'first_audio_ms', round(avg((v.metrics ->> 'first_audio_ms')::numeric) filter (where jsonb_typeof(v.metrics -> 'first_audio_ms') = 'number')),
        'turn_ms', round(avg((v.metrics ->> 'turn_ms_avg')::numeric) filter (where jsonb_typeof(v.metrics -> 'turn_ms_avg') = 'number')),
        'reconnects', coalesce(sum((v.metrics ->> 'reconnects')::numeric) filter (where jsonb_typeof(v.metrics -> 'reconnects') = 'number'), 0)::int,
        'by_provider', coalesce((select jsonb_object_agg(p.provider, p.n) from (select provider, count(*)::int n from public.tutor_voice_calls where started_at >= now() - interval '30 days' group by provider) p), '{}'::jsonb),
        'ended_by', coalesce((select jsonb_object_agg(coalesce(r.termination_reason, 'ativa'), r.n) from (select termination_reason, count(*)::int n from public.tutor_voice_calls where started_at >= now() - interval '30 days' group by termination_reason) r), '{}'::jsonb),
        'cost_usd', (select round(coalesce(sum(l.estimated_cost_usd), 0), 4) from public.ai_usage_ledger l
                     where l.day >= current_date - 30 and l.feature in ('tutor_voice', 'tutor_voice_tokens', 'tutor_voice_live', 'tutor_voice_backend')))
      from public.tutor_voice_calls v where v.started_at >= now() - interval '30 days'),
    'memories', (select count(*)::int from public.tutor_memories));
end
$$;

create or replace function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_pron jsonb;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_config ? 'voice_provider' and p_config ->> 'voice_provider' not in ('auto', 'live', 'realtime') then
    raise exception 'Provedor de voz inválido.' using errcode = '22023';
  end if;
  if p_config ? 'durona_level' and p_config ->> 'durona_level' not in ('moderada', 'forte', 'sem_filtro') then
    raise exception 'Nível da Durona inválido.' using errcode = '22023';
  end if;
  if p_config ? 'voice_name' and nullif(btrim(coalesce(p_config ->> 'voice_name', '')), '') is not null
     and lower(btrim(p_config ->> 'voice_name')) !~ '^[a-z][a-z0-9_-]{1,30}$' then
    raise exception 'Nome de voz inválido (use só letras minúsculas, como marin ou cedar).' using errcode = '22023';
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
    updated_at = now(), updated_by = (select auth.uid());
  update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c
   where (case p.profanity when 'off' then 0 when 'mild' then 1 else 2 end) > (case c.max_profanity when 'off' then 0 when 'mild' then 1 else 2 end);
  perform public.admin_log('tutor.config', 'tutor', jsonb_build_object('from', v_old, 'to', p_config, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_config();
end
$$;

-- Professores disponíveis para os alunos (painel). Os 13 antigos continuam fora; o Acolhedor é o padrão e não sai.
create function public.app_admin_tutor_personalities() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'active', t.active,
                                        'voice', t.voice ->> 'realtime', 'default', t.id = 'acolhedor') order by t.position)
    from public.tutor_personalities t where t.active or t.engine <> '{}'::jsonb), '[]'::jsonb);
end
$$;

create function public.app_admin_tutor_set_personality(p_id text, p_active boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if not exists (select 1 from public.tutor_personalities t where t.id = p_id and (t.active or t.engine <> '{}'::jsonb)) then
    raise exception 'Professor não encontrado.' using errcode = 'P0002';
  end if;
  if p_id = 'acolhedor' and not coalesce(p_active, true) then
    raise exception 'O Acolhedor é o professor padrão e fica sempre disponível.' using errcode = '22023';
  end if;
  update public.tutor_personalities set active = coalesce(p_active, active) where id = p_id;
  perform public.admin_log('tutor.personality', 'tutor', jsonb_build_object('id', p_id, 'active', p_active, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_personalities();
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_tutor_settings() from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_attach(uuid, uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_start(uuid, uuid, boolean, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_renew(uuid, uuid, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_end(uuid, uuid, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_sweep() from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_call(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_metrics(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_save_memory(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_context(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_schedule_review(uuid, uuid, integer) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_purge_transcripts() from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_memory(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_append(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
  revoke execute on function public.app_admin_tutor_config() from public, anon;
  revoke execute on function public.app_admin_tutor_save_config(jsonb, text) from public, anon;
  revoke execute on function public.app_admin_tutor_personalities() from public, anon;
  revoke execute on function public.app_admin_tutor_set_personality(text, boolean, text) from public, anon;
end
$revoke$;

-- ---------------------------------------------------------------- roteiro de volta (não roda; para desfazer à mão)
-- As funções ch_worker_tutor_voice_start/renew/end/call, ch_worker_tutor_memory, ch_worker_tutor_append e
-- app_admin_tutor_config/save_config voltam à versão anterior reaplicando o texto delas de …3500/…3700.
-- drop function public.app_admin_tutor_set_personality(text, boolean, text); drop function public.app_admin_tutor_personalities();
-- drop function public.ch_worker_tutor_purge_transcripts(); drop function public.ch_worker_tutor_schedule_review(uuid, uuid, integer);
-- drop function public.ch_worker_tutor_voice_context(uuid, uuid); drop function public.ch_worker_tutor_save_memory(uuid, uuid, jsonb);
-- drop function public.ch_worker_tutor_voice_metrics(uuid, uuid, jsonb); drop function public.ch_worker_tutor_voice_sweep();
-- drop function public.ch_worker_tutor_voice_attach(uuid, uuid, text, text); drop function public.ch_worker_tutor_settings();
-- drop table public.tutor_memories;
-- alter table public.tutor_voice_calls drop column provider, drop column metrics, drop column closing_at, drop column closing_reason;
-- alter table public.tutor_config drop column voice_provider, drop column voice_name, drop column voice_session_max_seconds,
--   drop column save_transcripts, drop column transcript_retention_days, drop column emotion_engine, drop column inside_jokes,
--   drop column durona_level, drop column pronunciations;
-- (as restrições de termination_reason, tutor_reviews.reason e ai_usage_ledger.feature voltam às listas anteriores
--  depois de apagar as linhas com os valores novos)
