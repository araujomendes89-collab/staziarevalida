-- =============================================================================
-- Voz ao vivo do Tutor para os ALUNOS: tetos de gasto, preço medido e limites (2026-10-16; vem da blindagem da Fase 0, antiga …9995,
-- que nunca foi aplicada, refeita sobre o banco de hoje). Pode ser colada de novo sem estragar nada. NÃO liga a voz aos alunos:
-- quem liga é a variável TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1 no servidor (e a voz ao vivo continua presa às travas do servidor).
--
--   * Limite de frequência por aluno NO BANCO (vale para todas as instâncias da Vercel ao mesmo tempo): ferramentas da voz
--     (/voice/tool), a avaliação do raciocínio (IA de texto, também por dia), a delegação do GPT-Live (/voice/delegate) e as falas
--     transcritas (/voice/transcript). Os números ficam em tutor_config.voice_rate_limits (padrões conservadores; o dono ajusta).
--   * Tetos da CONTA INTEIRA para a voz ao vivo (soma de todos os alunos e da equipe, dia e mês de Brasília):
--       - minutos por dia (live_account_daily_seconds, padrão 3600 s = 60 min);
--       - dinheiro por dia (live_account_daily_usd, padrão US$ 5);
--       - dinheiro por MÊS (live_account_monthly_usd, padrão US$ 50). Muda na Administração > Tutor, sem migração.
--     O gasto é o CUSTO REAL que a ponte de voz relata ao fim de cada ligação (tokens do Google, em ai_usage_ledger,
--     feature tutor_voice_gemini / tutor_voice_live). Ligação ainda aberta, ou cujo relatório ainda não chegou (ou nunca chegou),
--     conta por ESTIMATIVA: segundos × preço por minuto (live_price_per_min_usd, padrão US$ 0,039, o valor medido em
--     docs/voice-tutor/02-linha-de-base.md). Soma-se o custo da IA de texto que a voz usou (tutor_eval e tutor_voice_backend).
--     Conferidos ao abrir a voz (ch_worker_tutor_voice_start) e a cada renovação (ch_worker_tutor_voice_renew), com uma trava única
--     da conta: duas aberturas ao mesmo tempo não passam do teto. A reserva de tempo também não passa do que sobra.
--   * Limites por aluno NÃO mudam aqui (teste 10 min/dia e 40 min no total; plano pago 60 min/dia continuam como estão).
--
-- Funções recriadas partindo da versão MAIS NOVA de cada uma: ch_worker_tutor_voice_start e ch_worker_tutor_voice_renew (…5800),
-- ch_worker_tutor_settings e app_admin_tutor_save_config (…10600, com a dica do Tutor).
-- Para desfazer: supabase/desfazer/20261003012800_tutor_voz_alunos_tetos.desfazer.sql
-- =============================================================================

alter table public.tutor_config
  add column if not exists live_account_daily_seconds integer not null default 3600 check (live_account_daily_seconds between 0 and 864000),
  add column if not exists live_account_daily_usd numeric(10, 2) not null default 5 check (live_account_daily_usd >= 0),
  add column if not exists live_price_per_min_usd numeric(10, 4) not null default 0.039 check (live_price_per_min_usd > 0),
  add column if not exists live_account_monthly_usd numeric(10, 2) not null default 50 check (live_account_monthly_usd >= 0),
  add column if not exists voice_rate_limits jsonb not null default
    '{"voice_tool_per_minute": 30, "voice_tool_per_day": 600, "voice_eval_per_minute": 4, "voice_eval_per_day": 60,
      "voice_delegate_per_minute": 15, "voice_delegate_per_day": 600, "voice_transcript_per_minute": 40, "voice_transcript_per_day": 1500}'::jsonb
    check (jsonb_typeof(voice_rate_limits) = 'object');

create index if not exists tutor_voice_calls_day_idx on public.tutor_voice_calls (day) where provider <> 'tts';
create index if not exists ai_usage_ledger_day_feature_idx on public.ai_usage_ledger (day, feature);

-- ---------------------------------------------------------------- limite de frequência por aluno
-- Uma linha por aluno e por tipo: janela de 1 minuto e contador do dia (Brasília). Só as funções do servidor leem e gravam.
create table if not exists public.tutor_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket in ('voice_tool', 'voice_eval', 'voice_delegate', 'voice_transcript')),
  minute_start timestamptz not null default now(),
  minute_hits integer not null default 0 check (minute_hits >= 0),
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  day_hits integer not null default 0 check (day_hits >= 0),
  primary key (user_id, bucket)
);
alter table public.tutor_rate_limits enable row level security;
revoke all on public.tutor_rate_limits from public, anon, authenticated;

-- Conta um pedido do aluno no tipo pedido. Passou do limite do minuto ou do dia: não conta e devolve ok = false com o motivo e
-- em quantos segundos tentar de novo. Chave ausente no painel usa o padrão daqui (nunca "sem limite").
create or replace function public.ch_worker_tutor_rate_hit(p_user uuid, p_bucket text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  r public.tutor_rate_limits;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_min integer;
  v_day integer;
begin
  if p_bucket is null or p_bucket not in ('voice_tool', 'voice_eval', 'voice_delegate', 'voice_transcript') then
    raise exception 'Limite desconhecido.' using errcode = '22023';
  end if;
  v_limits := '{"voice_tool_per_minute": 30, "voice_tool_per_day": 600, "voice_eval_per_minute": 4, "voice_eval_per_day": 60,
                "voice_delegate_per_minute": 15, "voice_delegate_per_day": 600, "voice_transcript_per_minute": 40, "voice_transcript_per_day": 1500}'::jsonb
              || coalesce((select c.voice_rate_limits from public.tutor_config c), '{}'::jsonb);
  v_min := greatest(0, (v_limits ->> (p_bucket || '_per_minute'))::integer);
  v_day := greatest(0, (v_limits ->> (p_bucket || '_per_day'))::integer);
  insert into public.tutor_rate_limits (user_id, bucket) values (p_user, p_bucket) on conflict (user_id, bucket) do nothing;
  select * into r from public.tutor_rate_limits where user_id = p_user and bucket = p_bucket for update;
  if r.minute_start <= now() - interval '60 seconds' then r.minute_start := now(); r.minute_hits := 0; end if;
  if r.day <> v_today then r.day := v_today; r.day_hits := 0; end if;
  if r.minute_hits >= v_min or r.day_hits >= v_day then
    update public.tutor_rate_limits set minute_start = r.minute_start, minute_hits = r.minute_hits, day = r.day, day_hits = r.day_hits
     where user_id = p_user and bucket = p_bucket;
    return jsonb_build_object('ok', false, 'reason', case when r.day_hits >= v_day then 'per_day' else 'per_minute' end,
      'retry_after_s', case when r.day_hits >= v_day then null
                            else greatest(1, ceil(extract(epoch from (r.minute_start + interval '60 seconds' - now()))))::int end);
  end if;
  update public.tutor_rate_limits set minute_start = r.minute_start, minute_hits = r.minute_hits + 1, day = r.day, day_hits = r.day_hits + 1
   where user_id = p_user and bucket = p_bucket;
  return jsonb_build_object('ok', true);
end
$$;
revoke execute on function public.ch_worker_tutor_rate_hit(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- gasto da conta inteira (voz ao vivo)
-- Segundos de voz ao vivo de hoje de todos (a reserva ativa conta inteira; a voz do professor, 'tts', fica fora) e o gasto em US$
-- de hoje e do mês. Custo de cada ligação: o que a ponte relatou no livro-caixa (ai_usage_ledger, tutor_voice_gemini ou
-- tutor_voice_live, ligado pela chamada em meta.voice_call), quando for maior que zero; senão, a estimativa segundos × preço por
-- minuto do painel (cobre a ligação aberta, o relatório que ainda não chegou e o que nunca chega). Mais o custo registrado da IA
-- de texto que a voz usou (tutor_eval e tutor_voice_backend).
create or replace function public.tutor_live_account_today() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with t as (select (now() at time zone 'America/Sao_Paulo')::date as day,
                    date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as m0),
  calls as (
    select v.day,
           case when v.status = 'active' then greatest(0, ceil(extract(epoch from (v.lease_until - v.started_at))))::int
                else v.consumed_seconds end as secs,
           r.usd as real_usd
      from public.tutor_voice_calls v
      cross join t
      left join lateral (select sum(x.estimated_cost_usd) as usd from public.ai_usage_ledger x
                          where x.day >= t.m0 and x.feature in ('tutor_voice_gemini', 'tutor_voice_live') and x.meta ->> 'voice_call' = v.id::text) r on true
     where v.day >= t.m0 and v.provider <> 'tts'),
  priced as (
    select calls.day, calls.secs,
           case when coalesce(calls.real_usd, 0) > 0 then calls.real_usd else calls.secs * c.live_price_per_min_usd / 60.0 end as usd
      from calls cross join public.tutor_config c),
  txt as (
    select coalesce(sum(l.estimated_cost_usd) filter (where l.day = t.day), 0) as day_usd, coalesce(sum(l.estimated_cost_usd), 0) as month_usd
      from public.ai_usage_ledger l, t
     where l.day >= t.m0 and l.feature in ('tutor_eval', 'tutor_voice_backend'))
  select jsonb_build_object(
    'seconds', coalesce((select sum(p.secs) from priced p, t where p.day = t.day), 0)::int,
    'usd', round(coalesce((select sum(p.usd) from priced p, t where p.day = t.day), 0) + (select day_usd from txt), 4),
    'usd_month', round(coalesce((select sum(p.usd) from priced p), 0) + (select month_usd from txt), 4))
$$;
revoke execute on function public.tutor_live_account_today() from public, anon, authenticated;

-- ---------------------------------------------------------------- abrir a voz ao vivo
-- Igual a …5800, mais os tetos da conta inteira (minutos do dia e US$ do dia e do mês): sem saldo, recusa com account_minutes ou
-- account_budget; a reserva nunca passa do que sobra.
create or replace function public.ch_worker_tutor_voice_start(p_user uuid, p_session_id uuid, p_force boolean, p_model text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.tutor_sessions;
  e jsonb;
  a jsonb;
  v_old public.tutor_voice_calls;
  v_left integer;
  v_lease integer;
  v_account_left integer;
  v_budget_left integer;
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
  -- Tetos da conta inteira. A trava única vem depois da trava do aluno (mesma ordem na renovação: sem impasse).
  perform pg_advisory_xact_lock(hashtextextended('tutor:live-account', 0));
  a := public.tutor_live_account_today();
  v_account_left := c.live_account_daily_seconds - (a ->> 'seconds')::int;
  v_budget_left := floor(greatest(0, least(c.live_account_daily_usd - (a ->> 'usd')::numeric, c.live_account_monthly_usd - (a ->> 'usd_month')::numeric))
                         / c.live_price_per_min_usd * 60)::int;
  if v_budget_left < 15 then return jsonb_build_object('ok', false, 'reason', 'account_budget', 'entitlement', e); end if;
  if v_account_left < 15 then return jsonb_build_object('ok', false, 'reason', 'account_minutes', 'entitlement', e); end if;
  v_lease := least(c.voice_lease_seconds, v_left, c.voice_session_max_seconds, v_account_left, v_budget_left);
  insert into public.tutor_voice_calls (user_id, session_id, model, lease_until) values (p_user, s.id, left(p_model, 80), now() + make_interval(secs => v_lease)) returning id into v_id;
  perform public.tutor_begin_trial(p_user);
  return jsonb_build_object('ok', true, 'voice_call_id', v_id, 'lease_seconds', v_lease, 'replaced_call_id', v_old.call_id, 'replaced_provider', v_old.provider,
                            'entitlement', public.tutor_entitlement(p_user));
end
$$;

-- ---------------------------------------------------------------- renovar a voz ao vivo
-- Igual a …5800, mais os tetos da conta inteira: sem saldo, a ligação encerra com folga de 20 s (motivo
-- account_limit; gravado como 'quota', que é o que a tabela aceita) e a reserva nunca passa do que sobra.
create or replace function public.ch_worker_tutor_voice_renew(p_user uuid, p_voice_call uuid, p_call_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  v public.tutor_voice_calls;
  e jsonb;
  a jsonb;
  v_left integer;
  v_lease integer;
  v_session_left integer;
  v_account_left integer;
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
  -- tetos da conta inteira (minutos do dia; US$ do dia e do mês), com a mesma trava única da abertura
  perform pg_advisory_xact_lock(hashtextextended('tutor:live-account', 0));
  a := public.tutor_live_account_today();
  v_account_left := least(c.live_account_daily_seconds - (a ->> 'seconds')::int,
                          floor(greatest(0, least(c.live_account_daily_usd - (a ->> 'usd')::numeric, c.live_account_monthly_usd - (a ->> 'usd_month')::numeric))
                                / c.live_price_per_min_usd * 60)::int);
  v_reason := case when not (e ->> 'can_voice')::boolean or v_left <= 0 then 'quota' when v_session_left <= 0 then 'session_limit'
                   when v_account_left <= 0 then 'account_limit' end;
  if v_reason is not null then
    update public.tutor_voice_calls set closing_at = now(), closing_reason = case when v_reason = 'account_limit' then 'quota' else v_reason end,
      lease_until = now() + interval '20 seconds' where id = v.id;
    return jsonb_build_object('ok', false, 'stop', true, 'reason', v_reason, 'grace_seconds', 20, 'call_id', coalesce(v.call_id, p_call_id),
                              'provider', v.provider, 'entitlement', public.tutor_entitlement(p_user));
  end if;
  v_lease := least(c.voice_lease_seconds, v_left, v_session_left, v_account_left);
  update public.tutor_voice_calls set lease_until = now() + make_interval(secs => v_lease) where id = v.id;
  e := public.tutor_entitlement(p_user);
  return jsonb_build_object('ok', true, 'lease_seconds', v_lease, 'remaining_s', v_left, 'warn', v_left <= 120,
                            'session_left_s', v_session_left, 'entitlement', e);
end
$$;

-- ---------------------------------------------------------------- painel (administrador)
-- Igual a …10600 (com a dica do Tutor), mais os campos novos (tetos da conta inteira, preço por minuto e limites de frequência).
create or replace function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_pron jsonb;
  v_rate jsonb;
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
  -- limites de frequência (só as chaves conhecidas; cada uma de 1 a 100000) e tetos da conta inteira
  if p_config ? 'voice_rate_limits' then
    if jsonb_typeof(p_config -> 'voice_rate_limits') <> 'object' then raise exception 'Limites de frequência inválidos.' using errcode = '22023'; end if;
    select coalesce(jsonb_object_agg(k, p_config -> 'voice_rate_limits' -> k), '{}'::jsonb) into v_rate
    from jsonb_object_keys(p_config -> 'voice_rate_limits') k
    where k in ('voice_tool_per_minute', 'voice_tool_per_day', 'voice_eval_per_minute', 'voice_eval_per_day',
                'voice_delegate_per_minute', 'voice_delegate_per_day', 'voice_transcript_per_minute', 'voice_transcript_per_day');
    if exists (select 1 from jsonb_each_text(v_rate) x
                where case when x.value ~ '^\d{1,6}$' then x.value::integer not between 1 and 100000 else true end) then
      raise exception 'Limites de frequência: números de 1 a 100000.' using errcode = '22023';
    end if;
    select coalesce(jsonb_object_agg(x.key, x.value::integer), '{}'::jsonb) into v_rate from jsonb_each_text(v_rate) x;
  end if;
  if p_config ? 'live_account_daily_seconds' and coalesce(p_config ->> 'live_account_daily_seconds', '') !~ '^\d{1,6}$' then
    raise exception 'Teto da plataforma (voz ao vivo): minutos por dia, em segundos (0 a 864000).' using errcode = '22023';
  end if;
  if p_config ? 'live_account_daily_usd' and coalesce(p_config ->> 'live_account_daily_usd', '') !~ '^\d{1,6}(\.\d{1,2})?$' then
    raise exception 'Teto da plataforma (voz ao vivo): valor em US$ por dia, como 5 ou 12.50.' using errcode = '22023';
  end if;
  if p_config ? 'live_account_monthly_usd' and coalesce(p_config ->> 'live_account_monthly_usd', '') !~ '^\d{1,6}(\.\d{1,2})?$' then
    raise exception 'Teto da plataforma (voz ao vivo): valor em US$ por mês, como 50 ou 120.50.' using errcode = '22023';
  end if;
  if p_config ? 'live_price_per_min_usd' and (case when coalesce(p_config ->> 'live_price_per_min_usd', '') ~ '^\d{1,3}(\.\d{1,4})?$'
                                                   then (p_config ->> 'live_price_per_min_usd')::numeric <= 0 else true end) then
    raise exception 'Preço por minuto da voz ao vivo: maior que zero, como 0.05.' using errcode = '22023';
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
    live_account_daily_seconds = coalesce(nullif(p_config ->> 'live_account_daily_seconds', '')::integer, live_account_daily_seconds),
    live_account_daily_usd = coalesce(nullif(p_config ->> 'live_account_daily_usd', '')::numeric, live_account_daily_usd),
    live_account_monthly_usd = coalesce(nullif(p_config ->> 'live_account_monthly_usd', '')::numeric, live_account_monthly_usd),
    live_price_per_min_usd = coalesce(nullif(p_config ->> 'live_price_per_min_usd', '')::numeric, live_price_per_min_usd),
    voice_rate_limits = voice_rate_limits || coalesce(v_rate, '{}'::jsonb),
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
-- Igual a …10600 (com a dica do Tutor), mais os tetos da conta inteira, o preço por minuto e os limites de frequência.
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
    'stt_account_daily_seconds', c.stt_account_daily_seconds, 'question_hint_enabled', c.question_hint_enabled,
    'live_account_daily_seconds', c.live_account_daily_seconds, 'live_account_daily_usd', c.live_account_daily_usd,
    'live_account_monthly_usd', c.live_account_monthly_usd, 'live_price_per_min_usd', c.live_price_per_min_usd, 'voice_rate_limits', c.voice_rate_limits)
  from public.tutor_config c
$$;

revoke execute on function public.ch_worker_tutor_settings() from public, anon, authenticated;

-- ---------------------------------------------------------------- permissões (as recriadas mantêm as de antes; reforço)
do $revoke$
begin
  revoke execute on function public.ch_worker_tutor_voice_start(uuid, uuid, boolean, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_renew(uuid, uuid, text) from public, anon, authenticated;
end
$revoke$;
