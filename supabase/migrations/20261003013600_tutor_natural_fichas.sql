-- =============================================================================
-- Tutor natural, sem textos prontos (decisão do dono, 17/10/2026, para as 4 personalidades). Aditiva; pode ser colada de novo.
--
--   Antes: a abertura da conversa e a passagem para a próxima questão eram sorteadas em SQL de tutor_personalities.openings /
--   lines (3 aberturas e 2 frases por tipo): o aluno ouvia as mesmas falas, palavra por palavra.
--   Agora:
--   * app_tutor_start e tutor_next_for continuam gravando a fala sorteada, mas ela passa a ser só a RESERVA: logo em seguida o
--     servidor pede à IA uma fala nova, criada com o contexto (tema, o que o aluno errou da última vez, se voltou depois de dias,
--     horário, nome) e a ficha do personagem (server/tutor/fichas.ts), e troca o texto. Se a IA estiver fora do ar, demorar ou a
--     fala for barrada pela conferência, a reserva fica.
--   * public.tutor_recent_openings: as últimas falas de abertura e de passagem que cada aluno ouviu de cada personalidade
--     (guarda 10, o servidor usa as 5 últimas) para a próxima ser diferente. Só o servidor lê e grava (RLS sem política;
--     sem acesso para anon/authenticated). Apagada junto com a conta (on delete cascade).
--   * ch_worker_tutor_opening_state(p_user, p_session_id): a fala de reserva que ainda pode ser trocada (a última da conversa,
--     marcada como abertura/passagem, ainda não trocada nem tentada, com menos de 15 minutos e sem fala do aluno depois) e o contexto dela.
--   * ch_worker_tutor_set_opening(p_user, p_session_id, p_message_id, p_text, p_meta, p_usage): troca o texto da reserva pela fala
--     da IA (guardando a reserva em meta.reserve), grava na memória das últimas falas e registra o custo no ai_usage_ledger
--     (interactions = 0: não gasta a cota de interações do aluno). p_text nulo = a fala foi barrada: registra o custo e marca a
--     reserva como tentada (meta.natural_tried), para ninguém pedir a IA de novo para a mesma fala.
--   Nada aqui tem conteúdo médico. A questão aberta nunca vai para a IA da abertura com gabarito.
--
-- Para desfazer: supabase/desfazer/20261003013600_tutor_natural_fichas.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- memória das últimas falas de abertura e de passagem
create table if not exists public.tutor_recent_openings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  personality_id text not null,
  session_id uuid references public.tutor_sessions (id) on delete set null,
  kind text not null check (kind in ('abertura', 'passagem')),
  content text not null check (char_length(content) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists tutor_recent_openings_user_idx on public.tutor_recent_openings (user_id, personality_id, kind, created_at desc);
alter table public.tutor_recent_openings enable row level security;
revoke all on table public.tutor_recent_openings from public, anon, authenticated;

-- ---------------------------------------------------------------- a fala de reserva que ainda pode ser trocada, e o contexto dela
create or replace function public.ch_worker_tutor_opening_state(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  m public.tutor_messages;
  v_kind text;
  v_prev public.tutor_sessions;
  v_letter text;
  v_last_correct boolean;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then return null; end if;
  select * into m from public.tutor_messages where session_id = s.id order by id desc limit 1;
  -- só a última fala da conversa, se for a reserva (abertura ou passagem) ainda não trocada, recente e sem resposta do aluno depois
  if not found or m.role <> 'tutor' or not coalesce((m.meta ->> 'opening')::boolean, false) or coalesce((m.meta ->> 'generated')::boolean, false)
     or coalesce((m.meta ->> 'natural_tried')::boolean, false) or m.created_at < now() - interval '15 minutes' or s.status <> 'active' then
    return jsonb_build_object('message', null);
  end if;
  v_kind := case when exists (select 1 from public.tutor_messages x where x.session_id = s.id and x.id < m.id) then 'passagem' else 'abertura' end;
  -- conversa sobre questão já respondida: a letra que o aluno marcou (o professor pergunta o porquê, sem dizer se acertou)
  if v_kind = 'abertura' and s.question_state = 'answered' and s.question_id is not null then
    select a.selected_option::text into v_letter from public.question_attempts a
    where a.user_id = p_user and a.question_id = s.question_id order by a.answered_at desc, a.seq desc limit 1;
  end if;
  -- passagem: como foi a questão anterior nesta conversa
  if v_kind = 'passagem' then
    select a.is_correct into v_last_correct from public.tutor_answers a
    where a.session_id = s.id and a.question_id is distinct from s.question_id order by a.answered_at desc limit 1;
  end if;
  -- a conversa anterior do aluno (qualquer professor): para saber se ele sumiu por dias
  select * into v_prev from public.tutor_sessions x
  where x.user_id = p_user and x.id <> s.id and x.created_at < s.created_at
  order by coalesce(x.last_message_at, x.created_at) desc limit 1;
  return jsonb_build_object(
    'message', jsonb_build_object('id', m.id, 'content', m.content, 'kind', v_kind),
    'session', jsonb_build_object('mode', s.mode, 'topic', s.topic, 'title', s.title, 'context_type', s.context_type, 'context_label', s.context_label,
                                  'area', s.settings ->> 'area', 'question_state', s.question_state, 'personality_id', s.personality_id,
                                  'session_mood', s.emotion ->> 'session_mood', 'discuss_letter', v_letter, 'previous_correct', v_last_correct),
    'recent', coalesce((select jsonb_agg(r.content order by r.created_at desc, r.id desc) from (
                select o.id, o.content, o.created_at from public.tutor_recent_openings o
                where o.user_id = p_user and o.personality_id = s.personality_id and o.kind = v_kind
                order by o.created_at desc, o.id desc limit 5) r), '[]'::jsonb),
    'previous_session', case when v_prev.id is null then null else jsonb_build_object(
                'days', floor(extract(epoch from (s.created_at - coalesce(v_prev.last_message_at, v_prev.created_at))) / 86400)::int,
                'topic', coalesce(v_prev.topic, v_prev.context_label, v_prev.title)) end,
    'local_hour', extract(hour from (now() at time zone 'America/Sao_Paulo'))::int
  );
end
$$;
revoke execute on function public.ch_worker_tutor_opening_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- troca a reserva pela fala da IA (ou só registra o custo)
create or replace function public.ch_worker_tutor_set_opening(p_user uuid, p_session_id uuid, p_message_id bigint, p_text text, p_meta jsonb, p_usage jsonb)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  m public.tutor_messages;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_kind text;
  v_ok boolean := false;
  v_meta jsonb := jsonb_strip_nulls(jsonb_build_object(
    'model', left(p_meta ->> 'model', 80), 'provider', left(p_meta ->> 'provider', 40), 'prompt_version', left(p_meta ->> 'prompt_version', 20)));
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if v_text is not null and char_length(v_text) > 600 then raise exception 'Fala longa demais.' using errcode = '22023'; end if;
  select * into m from public.tutor_messages where session_id = s.id order by id desc limit 1;
  -- a mesma regra de ch_worker_tutor_opening_state, conferida de novo com a conversa travada (o aluno pode ter falado no meio)
  if found and m.id = p_message_id and m.role = 'tutor' and coalesce((m.meta ->> 'opening')::boolean, false)
     and not coalesce((m.meta ->> 'generated')::boolean, false) and not coalesce((m.meta ->> 'natural_tried')::boolean, false)
     and m.created_at >= now() - interval '15 minutes' and s.status = 'active' then
    if v_text is null then
      -- a IA tentou e a fala foi barrada (ou não veio): a reserva fica e não se tenta de novo (cada tentativa custa)
      update public.tutor_messages set meta = meta || jsonb_build_object('natural_tried', true) where id = m.id;
    else
      v_kind := case when exists (select 1 from public.tutor_messages x where x.session_id = s.id and x.id < m.id) then 'passagem' else 'abertura' end;
      update public.tutor_messages set content = v_text,
        meta = meta || v_meta || jsonb_build_object('generated', true, 'reserve', left(m.content, 600))
      where id = m.id;
      insert into public.tutor_recent_openings (user_id, personality_id, session_id, kind, content) values (p_user, s.personality_id, s.id, v_kind, v_text);
      -- guarda só as 10 últimas por aluno, personalidade e tipo
      delete from public.tutor_recent_openings o
      where o.user_id = p_user and o.personality_id = s.personality_id and o.kind = v_kind
        and o.id not in (select k.id from public.tutor_recent_openings k where k.user_id = p_user and k.personality_id = s.personality_id and k.kind = v_kind
                         order by k.created_at desc, k.id desc limit 10);
      v_ok := true;
    end if;
  end if;
  -- o custo da IA fica registrado mesmo quando a fala não entrou; não gasta a cota de interações (interactions = 0)
  if coalesce((p_usage ->> 'calls')::int, 0) > 0 then
    insert into public.ai_usage_ledger (user_id, session_id, feature, provider, model, input_text_tokens, output_text_tokens, estimated_cost_usd, persona, mode, meta)
    values (p_user, s.id, 'tutor_text', left(p_usage ->> 'provider', 40), left(p_usage ->> 'model', 80),
            greatest(0, coalesce((p_usage ->> 'input_tokens')::int, 0)), greatest(0, coalesce((p_usage ->> 'output_tokens')::int, 0)),
            greatest(0, coalesce((p_usage ->> 'cost_usd')::numeric, 0)), s.personality_id, s.mode,
            jsonb_build_object('calls', (p_usage ->> 'calls')::int, 'kind', 'abertura_natural', 'used', v_ok));
  end if;
  return jsonb_build_object('ok', v_ok, 'id', case when v_ok then m.id end, 'content', case when v_ok then v_text end);
end
$$;
revoke execute on function public.ch_worker_tutor_set_opening(uuid, uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;

-- =============================================================================
-- VOZ AO VIVO (parte 2 do "Tutor natural", 17/10/2026): na voz ao vivo a abertura é criada na hora pelo próprio modelo de voz.
--   * ch_worker_tutor_voice_openings(p_user, p_session_id): as 5 últimas aberturas que o aluno ouviu desta personalidade (as mesmas da
--     abertura por texto) e a hora de Brasília, para o servidor mandar nas instruções da ligação ("não repita, não comece igual").
--   * ch_worker_tutor_voice_opening_save(p_user, p_voice_call, p_text): guarda a PRIMEIRA fala do professor de cada ligação na mesma
--     memória (uma por ligação: tutor_recent_openings.voice_call_id único); as outras falas da ligação não entram. Devolve se gravou.
-- =============================================================================
alter table public.tutor_recent_openings add column if not exists voice_call_id uuid references public.tutor_voice_calls (id) on delete set null;
create unique index if not exists tutor_recent_openings_voice_call_uq on public.tutor_recent_openings (voice_call_id) where voice_call_id is not null;

create or replace function public.ch_worker_tutor_voice_openings(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then return null; end if;
  return jsonb_build_object(
    'recent', coalesce((select jsonb_agg(r.content order by r.created_at desc, r.id desc) from (
                select o.id, o.content, o.created_at from public.tutor_recent_openings o
                where o.user_id = p_user and o.personality_id = s.personality_id and o.kind = 'abertura'
                order by o.created_at desc, o.id desc limit 5) r), '[]'::jsonb),
    'local_hour', extract(hour from (now() at time zone 'America/Sao_Paulo'))::int
  );
end
$$;
revoke execute on function public.ch_worker_tutor_voice_openings(uuid, uuid) from public, anon, authenticated;

create or replace function public.ch_worker_tutor_voice_opening_save(p_user uuid, p_voice_call uuid, p_text text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.tutor_voice_calls;
  s public.tutor_sessions;
  v_text text := left(nullif(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), ''), 600);
  v_n int;
begin
  if v_text is null then return false; end if;
  select * into v from public.tutor_voice_calls where id = p_voice_call and user_id = p_user;
  if not found then return false; end if;
  select * into s from public.tutor_sessions where id = v.session_id and user_id = p_user;
  if not found then return false; end if;
  insert into public.tutor_recent_openings (user_id, personality_id, session_id, kind, content, voice_call_id)
  values (p_user, s.personality_id, s.id, 'abertura', v_text, v.id)
  on conflict (voice_call_id) where voice_call_id is not null do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  -- guarda só as 10 últimas por aluno, personalidade e tipo (a mesma regra da abertura por texto)
  delete from public.tutor_recent_openings o
  where o.user_id = p_user and o.personality_id = s.personality_id and o.kind = 'abertura'
    and o.id not in (select k.id from public.tutor_recent_openings k where k.user_id = p_user and k.personality_id = s.personality_id and k.kind = 'abertura'
                     order by k.created_at desc, k.id desc limit 10);
  return true;
end
$$;
revoke execute on function public.ch_worker_tutor_voice_opening_save(uuid, uuid, text) from public, anon, authenticated;
