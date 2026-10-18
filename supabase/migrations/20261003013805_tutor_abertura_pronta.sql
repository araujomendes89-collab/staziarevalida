-- =============================================================================
-- Tutor natural: ABERTURA PRONTA ANTES DE O ALUNO PRECISAR (pedido do dono de 17/10/2026). Aditiva; pode ser colada de novo.
--
--   Antes: a abertura era pedida à IA só depois de a conversa nascer (app_tutor_start), e a tela esperava no máximo 3 s
--   (TUTOR_ABERTURA_ESPERA_MS). A IA leva ~2,2 s (p50) e às vezes mais: só 62% das aberturas saíam da IA; o resto ficava na reserva.
--   Agora:
--   * Enquanto o aluno está na entrada do Tutor (Nexus: escolhendo o professor e o modo), o app pede ao servidor que PREPARE a
--     abertura daquela escolha (POST /api/tutor/opening/prepare). O servidor reserva a preparação aqui
--     (ch_worker_tutor_opening_prep_claim: mesmo limite 'tutor_opening' de 8/min e 300/dia, mais um teto próprio de preparações),
--     cria a fala com as mesmas conferências da abertura de sempre e guarda pronta (ch_worker_tutor_opening_prep_save).
--   * Quando a conversa nasce com a MESMA escolha (professor, modo, tema, contexto, área e questão), a fala pronta entra na hora no
--     lugar da reserva (ch_worker_tutor_use_ready_opening), sem nova chamada à IA. Ainda preparando: o servidor espera por ela dentro
--     do mesmo tempo de sempre. Escolha diferente, velha (10 min) ou barrada: segue o caminho de antes.
--   * A conversa adota o humor do dia sorteado na preparação (o mesmo sorteio de app_tutor_start), para a fala e o estado combinarem.
--   * Custo: cada preparação vai para o ai_usage_ledger (interactions = 0, meta.kind 'abertura_pronta', meta.casa = true): é custo da
--     casa, NÃO gasta a cota de interações nem crédito do aluno, usada ou não. Teto: 40 preparações por aluno por dia e no máximo 15
--     sem uso no dia (passou disso, não prepara mais: fica o caminho de antes).
--   Nada aqui tem conteúdo médico. A IA da abertura não recebe enunciado nem alternativas (o gabarito só serve à conferência).
--
-- Para desfazer: supabase/desfazer/20261003013805_tutor_abertura_pronta.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- aberturas preparadas
create table if not exists public.tutor_opening_ready (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  personality_id text not null,
  -- a escolha da entrada, já no formato que app_tutor_start grava na conversa (para comparar com ela)
  mode text not null,
  topic text,
  context_type text,
  context_label text,
  area text,
  -- questão escolhida pelo aluno; nula nos modos questão/erros = a questão é sorteada quando a conversa nasce
  question_id text,
  question_state text not null,
  -- humor do dia sorteado na preparação (a conversa nasce com ele quando usa esta fala)
  emotion jsonb not null default '{}'::jsonb,
  content text check (content is null or char_length(content) between 1 and 600),
  ledger_id bigint,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  claimed_at timestamptz not null default now(),
  -- ready_at nulo = preparando; ready_at com content nulo = não ficou pronta (barrada ou sem resposta)
  ready_at timestamptz,
  used_at timestamptz,
  used_session uuid references public.tutor_sessions (id) on delete set null
);
create index if not exists tutor_opening_ready_user_idx on public.tutor_opening_ready (user_id, personality_id, claimed_at desc);
create index if not exists tutor_opening_ready_day_idx on public.tutor_opening_ready (user_id, day);
alter table public.tutor_opening_ready enable row level security;
revoke all on table public.tutor_opening_ready from public, anon, authenticated;

-- ---------------------------------------------------------------- a fala pronta que serve a esta conversa
-- A preparação mais recente do aluno com a MESMA escolha da conversa, ainda não usada, de até 10 minutos, pronta ou em preparo
-- (há menos de 20 s). Só para a abertura: a última fala da conversa tem de ser a reserva, ainda não trocada nem reservada.
create or replace function public.tutor_opening_ready_for(p_user uuid, p_session_id uuid) returns public.tutor_opening_ready
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  m public.tutor_messages;
  r public.tutor_opening_ready;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found or s.status <> 'active' then return null; end if;
  select * into m from public.tutor_messages where session_id = s.id order by id desc limit 1;
  if not found or m.role <> 'tutor' or not coalesce((m.meta ->> 'opening')::boolean, false) or coalesce((m.meta ->> 'generated')::boolean, false)
     or coalesce((m.meta ->> 'natural_tried')::boolean, false) or coalesce((m.meta ->> 'natural_claimed')::boolean, false)
     or m.created_at < now() - interval '15 minutes'
     or exists (select 1 from public.tutor_messages x where x.session_id = s.id and x.id < m.id) then
    return null;
  end if;
  select * into r from public.tutor_opening_ready o
  where o.user_id = p_user and o.personality_id = s.personality_id and o.mode = s.mode and o.used_at is null
    and o.topic is not distinct from s.topic and o.context_type is not distinct from s.context_type
    and o.context_label is not distinct from s.context_label and o.area is not distinct from (s.settings ->> 'area')
    and o.question_state = s.question_state
    and (o.question_id is not distinct from s.question_id or (o.question_id is null and s.mode in ('questao', 'erros')))
    and o.claimed_at >= now() - interval '10 minutes'
    and ((o.content is not null and o.ready_at is not null) or (o.ready_at is null and o.claimed_at >= now() - interval '20 seconds'))
  order by (o.content is not null) desc, o.claimed_at desc limit 1;
  if not found then return null; end if;
  return r;
end
$$;
revoke execute on function public.tutor_opening_ready_for(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- reserva da preparação (na entrada do Tutor)
-- Devolve { id, state, ctx } no formato de ch_worker_tutor_opening_state / ch_worker_tutor_context, ou null quando não há o que
-- preparar: aceite pendente, Tutor bloqueado, escolha inválida, já pronta ou em preparo para a mesma escolha, teto do dia, limite.
create or replace function public.ch_worker_tutor_opening_prep_claim(p_user uuid, p_personality text, p_mode text, p_topic text, p_question_id text, p_context jsonb)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  e jsonb;
  c public.tutor_config;
  t public.tutor_personalities;
  v_q text := nullif(p_question_id, '');
  v_ctype text := nullif(p_context ->> 'type', '');
  v_clabel text := left(nullif(btrim(p_context ->> 'label'), ''), 160);
  v_area text := nullif(p_context ->> 'area', '');
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
  v_topic_col text;
  v_state text := 'none';
  v_letter text;
  v_mood text := (array['good', 'neutral', 'neutral', 'impatient'])[1 + floor(random() * 4)::int];
  v_emotion jsonb;
  v_profanity text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_rate jsonb;
  v_prev public.tutor_sessions;
  v_id bigint;
begin
  if p_user is null or public.tutor_consent_pending(p_user) then return null; end if;
  e := public.tutor_entitlement(p_user);
  if not coalesce((e ->> 'enabled')::boolean, false) or e ->> 'mode' = 'blocked' then return null; end if;
  if p_mode is null or p_mode not in ('livre', 'aula', 'revisao', 'perguntas', 'questao', 'erros') then return null; end if;
  if v_ctype is not null and v_ctype not in ('question', 'error', 'theme', 'area', 'flashcard', 'weak_points', 'free') then return null; end if;
  if v_area is not null and not exists (select 1 from unnest(enum_range(null::public.med_area)) a where a::text = v_area) then return null; end if;
  select * into t from public.tutor_personalities where id = p_personality and active and id in ('acolhedor', 'durao', 'durona', 'tranquila');
  if not found then return null; end if;
  -- a mesma escolha que app_tutor_start faria (questão, estado, tema, contexto)
  if p_mode in ('questao', 'erros') then
    if (e #>> '{questions,remaining}') is not null and (e #>> '{questions,remaining}')::int <= 0 then return null; end if;
    v_state := 'open';
  elsif v_q is not null then
    -- conversar sobre uma questão: só a que o aluno já respondeu (a letra dele entra na abertura)
    select a.selected_option::text into v_letter from public.question_attempts a
    where a.user_id = p_user and a.question_id = v_q order by a.answered_at desc, a.seq desc limit 1;
    if v_letter is null then return null; end if;
    v_state := 'answered';
  end if;
  if v_q is not null and not exists (select 1 from public.questions where id = v_q and status <> 'annulled' and origin = 'official') then return null; end if;
  -- como app_tutor_start: conversa com questão (escolhida ou sorteada no início, nos modos questão/erros) tem o contexto 'question'
  if v_ctype is null and (v_q is not null or p_mode in ('questao', 'erros')) then v_ctype := 'question'; end if;
  v_topic_col := coalesce(v_topic, case when v_ctype in ('theme', 'flashcard') then v_clabel end);

  -- um pedido por vez por aluno (toques seguidos na entrada)
  perform pg_advisory_xact_lock(hashtextextended('tutor_opening_ready:' || p_user::text, 0));
  -- a mesma escolha já pronta (ainda valendo) ou em preparo: nada a fazer
  if exists (select 1 from public.tutor_opening_ready o
             where o.user_id = p_user and o.personality_id = t.id and o.mode = p_mode and o.used_at is null
               and o.topic is not distinct from v_topic_col and o.context_type is not distinct from v_ctype
               and o.context_label is not distinct from v_clabel and o.area is not distinct from v_area
               and o.question_id is not distinct from v_q and o.question_state = v_state
               and ((o.content is not null and o.claimed_at >= now() - interval '8 minutes') or (o.ready_at is null and o.claimed_at >= now() - interval '20 seconds'))) then
    return null;
  end if;
  -- teto do dia: 40 preparações e no máximo 15 sem uso (custo da casa limitado por aluno)
  if (select count(*) from public.tutor_opening_ready o where o.user_id = p_user and o.day = v_today) >= 40
     or (select count(*) from public.tutor_opening_ready o where o.user_id = p_user and o.day = v_today and o.used_at is null) >= 15 then
    return null;
  end if;
  -- o mesmo limite de frequência da abertura de sempre
  v_rate := public.ch_worker_tutor_rate_hit(p_user, 'tutor_opening');
  if not coalesce((v_rate ->> 'ok')::boolean, false) then return null; end if;
  -- só guarda dois dias de preparações
  delete from public.tutor_opening_ready o where o.user_id = p_user and o.claimed_at < now() - interval '2 days';

  select * into c from public.tutor_config;
  -- palavrão da fala preparada: a ESCOLHA DO ALUNO (revisão do Pacote 1, M5), nunca acima do teto do painel. Vale a preferência gravada
  -- para este professor; palavrão desligado nas preferências da Durona/Durão vale sempre; sem escolha gravada para ele, sem palavrão.
  v_profanity := case
    when coalesce((t.params ->> 'profanity')::int, 0) < 20 then 'off'
    when exists (select 1 from public.tutor_explosiva_preferences xp where xp.user_id = p_user and xp.profanity is false) then 'off'
    else coalesce(public.tutor_profanity(t.id, coalesce((select tp.profanity from public.tutor_preferences tp
                                                          where tp.user_id = p_user and tp.personality_id = t.id), 'off')), 'off') end;
  v_emotion := jsonb_build_object('session_mood', v_mood, 'frustration', case v_mood when 'impatient' then 12 when 'good' then 0 else 5 end);
  insert into public.tutor_opening_ready (user_id, personality_id, mode, topic, context_type, context_label, area, question_id, question_state, emotion)
  values (p_user, t.id, p_mode, v_topic_col, v_ctype, v_clabel, v_area, v_q, v_state, v_emotion)
  returning id into v_id;

  select * into v_prev from public.tutor_sessions x where x.user_id = p_user order by coalesce(x.last_message_at, x.created_at) desc limit 1;
  return jsonb_build_object(
    'id', v_id,
    'state', jsonb_build_object(
      'message', jsonb_build_object('id', 0, 'content', '', 'kind', 'abertura'),
      'session', jsonb_build_object('mode', p_mode, 'topic', v_topic_col, 'title', null, 'context_type', v_ctype, 'context_label', v_clabel,
                                    'area', v_area, 'question_state', v_state, 'personality_id', t.id,
                                    'session_mood', v_mood, 'discuss_letter', v_letter, 'previous_correct', null),
      'recent', coalesce((select jsonb_agg(r.content order by r.created_at desc, r.id desc) from (
                  select o.id, o.content, o.created_at from public.tutor_recent_openings o
                  where o.user_id = p_user and o.personality_id = t.id and o.kind = 'abertura'
                  order by o.created_at desc, o.id desc limit 5) r), '[]'::jsonb),
      'previous_session', case when v_prev.id is null then null else jsonb_build_object(
                  'days', floor(extract(epoch from (now() - coalesce(v_prev.last_message_at, v_prev.created_at))) / 86400)::int,
                  'topic', coalesce(v_prev.topic, v_prev.context_label, v_prev.title)) end,
      'local_hour', extract(hour from (now() at time zone 'America/Sao_Paulo'))::int,
      'prepared', null,
      -- as falas de reserva que app_tutor_start pode sortear para esta escolha (qualquer humor): a fala preparada não pode copiá-las
      -- (na conversa, a reserva sorteada conta como "já ouvida"; sem isto a fala pronta era barrada lá)
      'reservas', coalesce((select jsonb_agg(distinct replace(x.l, '{tema}', coalesce(v_topic_col, v_clabel, ''))) from (
                  select jsonb_array_elements_text(case when jsonb_typeof(src -> k) = 'array' then src -> k else '[]'::jsonb end) as l
                  from (select t.lines as src union all select t.lines_strong) fontes,
                       unnest(case when p_mode = 'erros' then array['review'] when p_mode = 'questao' then array['question']
                                   when v_state = 'answered' then array['discuss']
                                   when v_topic_col is not null or (v_clabel is not null and v_ctype is distinct from 'weak_points') then array['topic']
                                   else array['opening_good', 'opening_neutral', 'opening_impatient', 'opening'] end) k
                  union all
                  select o from unnest(case when p_mode in ('livre', 'aula', 'revisao', 'perguntas') and v_state <> 'answered' then t.openings else '{}'::text[] end) o) x
                  where x.l is not null and x.l <> ''), '[]'::jsonb)),
    'ctx', jsonb_build_object(
      'consent_pending', false,
      'config', jsonb_build_object('max_profanity', c.max_profanity),
      'session', jsonb_build_object('read_only', false, 'emotion', v_emotion,
                                    'settings', jsonb_build_object('profanity', v_profanity, 'adaptive', true, 'params', t.params, 'area', v_area)),
      'personality', jsonb_build_object('id', t.id, 'name', t.name, 'params', t.params, 'style_notes', t.style_notes, 'examples', to_jsonb(t.examples),
                                        'examples_strong', to_jsonb(t.examples_strong), 'voice', t.voice, 'engine', t.engine),
      'student', (select jsonb_build_object('first_name', nullif(split_part(btrim(p.name), ' ', 1), ''), 'days_to_exam', case when p.exam_date is not null then p.exam_date - current_date end)
                  from public.profiles p where p.id = p_user),
      'memory', public.tutor_learning_memory(p_user, v_area, null),
      'question', case when v_q is not null then public.tutor_truth(v_q, case when v_state = 'answered' then 'full' else 'hint' end) end,
      'history', '[]'::jsonb)
  );
end
$$;
revoke execute on function public.ch_worker_tutor_opening_prep_claim(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- guarda a fala preparada e o custo (da casa)
-- p_text nulo = barrada ou sem resposta: a preparação fica marcada como encerrada sem fala. O custo vai para o registro com
-- interactions = 0 (não gasta a cota nem crédito do aluno) e meta.casa = true. Devolve se ficou pronta.
create or replace function public.ch_worker_tutor_opening_prep_save(p_user uuid, p_id bigint, p_text text, p_usage jsonb) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.tutor_opening_ready;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_ledger bigint;
begin
  select * into r from public.tutor_opening_ready where id = p_id and user_id = p_user for update;
  if not found then return false; end if;
  if v_text is not null and char_length(v_text) > 600 then raise exception 'Fala longa demais.' using errcode = '22023'; end if;
  if coalesce((p_usage ->> 'calls')::int, 0) > 0 then
    insert into public.ai_usage_ledger (user_id, session_id, feature, provider, model, input_text_tokens, output_text_tokens, cached_tokens, estimated_cost_usd, persona, mode, meta)
    values (p_user, null, 'tutor_text', left(p_usage ->> 'provider', 40), left(p_usage ->> 'model', 80),
            greatest(0, coalesce((p_usage ->> 'input_tokens')::int, 0)), greatest(0, coalesce((p_usage ->> 'output_tokens')::int, 0)),
            greatest(0, coalesce((p_usage ->> 'cached_tokens')::int, 0)),
            greatest(0, coalesce((p_usage ->> 'cost_usd')::numeric, 0)), r.personality_id, r.mode,
            jsonb_build_object('calls', (p_usage ->> 'calls')::int, 'kind', 'abertura_pronta', 'casa', true, 'ready_id', r.id, 'ok', v_text is not null))
    returning id into v_ledger;
  end if;
  if r.ready_at is not null or r.used_at is not null then return false; end if;
  update public.tutor_opening_ready set content = v_text, ready_at = now(), ledger_id = coalesce(v_ledger, ledger_id) where id = r.id;
  return v_text is not null;
end
$$;
revoke execute on function public.ch_worker_tutor_opening_prep_save(uuid, bigint, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- a fala pronta desta conversa (só leitura)
-- { id, status: 'pronta' | 'preparando', content, emotion } ou null.
create or replace function public.ch_worker_tutor_ready_opening(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.tutor_opening_ready;
begin
  r := public.tutor_opening_ready_for(p_user, p_session_id);
  if r.id is null then return null; end if;
  return jsonb_build_object('id', r.id, 'status', case when r.content is not null then 'pronta' else 'preparando' end, 'content', r.content,
                            'emotion', r.emotion, 'ms_desde_o_pedido', floor(extract(epoch from (now() - r.claimed_at)) * 1000)::int);
end
$$;
revoke execute on function public.ch_worker_tutor_ready_opening(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- usa a fala pronta no lugar da reserva
-- Conversa travada; a fala pronta tem de ser a mesma que o servidor conferiu (p_ready_id e o texto) e ainda servir a esta conversa.
-- Troca a reserva (guardada em meta.reserve), grava na memória das aberturas, marca a preparação como usada e a conversa adota o
-- humor do dia da preparação. Sem custo novo (já registrado na preparação). Devolve { ok, id, content }.
create or replace function public.ch_worker_tutor_use_ready_opening(p_user uuid, p_session_id uuid, p_message_id bigint, p_ready_id bigint, p_meta jsonb)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  m public.tutor_messages;
  r public.tutor_opening_ready;
  v_meta jsonb := jsonb_strip_nulls(jsonb_build_object(
    'model', left(p_meta ->> 'model', 80), 'provider', left(p_meta ->> 'provider', 40), 'prompt_version', left(p_meta ->> 'prompt_version', 20),
    'ms', case when coalesce(p_meta ->> 'ms', '') ~ '^\d{1,6}$' then (p_meta ->> 'ms')::int end, 'origem', 'pronta'));
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'id', null, 'content', null); end if;
  r := public.tutor_opening_ready_for(p_user, p_session_id);
  if r.id is null or r.id <> p_ready_id or r.content is null then return jsonb_build_object('ok', false, 'id', null, 'content', null); end if;
  select * into m from public.tutor_messages where session_id = s.id order by id desc limit 1;
  if m.id <> p_message_id then return jsonb_build_object('ok', false, 'id', null, 'content', null); end if;
  update public.tutor_opening_ready set used_at = now(), used_session = s.id where id = r.id and used_at is null;
  if not found then return jsonb_build_object('ok', false, 'id', null, 'content', null); end if;
  update public.tutor_messages set content = r.content,
    meta = meta || v_meta || jsonb_build_object('generated', true, 'reserve', left(m.content, 600), 'ready_id', r.id)
  where id = m.id;
  -- a conversa acabou de nascer (a abertura é a única fala): o humor do dia passa a ser o da preparação
  update public.tutor_sessions set emotion = coalesce(emotion, '{}'::jsonb) || r.emotion where id = s.id;
  insert into public.tutor_recent_openings (user_id, personality_id, session_id, kind, content) values (p_user, s.personality_id, s.id, 'abertura', r.content);
  delete from public.tutor_recent_openings o
  where o.user_id = p_user and o.personality_id = s.personality_id and o.kind = 'abertura'
    and o.id not in (select k.id from public.tutor_recent_openings k where k.user_id = p_user and k.personality_id = s.personality_id and k.kind = 'abertura'
                     order by k.created_at desc, k.id desc limit 10);
  return jsonb_build_object('ok', true, 'id', m.id, 'content', r.content);
end
$$;
revoke execute on function public.ch_worker_tutor_use_ready_opening(uuid, uuid, bigint, bigint, jsonb) from public, anon, authenticated;
