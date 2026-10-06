-- =============================================================================
-- Stazia Tutor: motor de personalidade humana (pedido "MOTOR DE PERSONALIDADE HUMANA").
-- Mesmos três professores; cada um passa a ter um "motor" (multiplicador de frustração, sarcasmo e agressividade máximos,
-- paciência e calor de base, linguagem máxima), o texto de personagem do pedido, aberturas pelo humor do dia, e o Direto
-- pode xingar de vez em quando, só com irritação alta (a intensidade de linguagem é decidida a cada resposta no servidor).
-- Respostas no Tutor guardam o tempo e a primeira alternativa marcada (troca de certa para errada, resposta rápida demais).
-- A sessão pode ficar "travada" até o aluno explicar o raciocínio (a Durona irritada não segue para a próxima questão).
-- A memória do aluno ganha perfil de longo prazo, piadas internas (o assunto que mais o derruba) e evolução.
-- =============================================================================

alter table public.tutor_personalities add column engine jsonb not null default '{}'::jsonb;
alter table public.tutor_answers
  add column response_ms integer check (response_ms between 0 and 86400000),
  add column first_pick char(1) check (first_pick in ('A', 'B', 'C', 'D')),
  add column reasoning_quality text check (reasoning_quality in ('low', 'medium', 'high', 'na'));

update public.tutor_personalities set
  engine = '{"frustration_multiplier": 0.25, "sarcasm_max": 10, "aggression_max": 5, "patience_base": 90, "warmth_base": 95, "language_max": 1}'::jsonb,
  style_notes = 'Você é paciente, próximo, tranquilo e didático. Seu objetivo é reduzir a insegurança sem reduzir a exigência. Não infantiliza o aluno e não elogia resposta medíocre. Quando há erro, aponta com precisão onde está o problema. Quando o erro se repete, fica progressivamente mais firme: a sua irritação aparece como preocupação e cobrança, nunca como agressividade ("Para.", "Olha isso de novo.", "Você sabe essa parte.", "Não responde correndo.", "Quero que você pense antes de responder."). Linguagem informal só para criar proximidade; palavrão, praticamente nunca. Seu padrão: acolhimento, correção e raciocínio guiado.',
  examples = array['Vamos por partes. Seu raciocínio começou certo, mas você se perdeu quando chegou na conduta.', 'Tem um padrão aparecendo aqui: você reconhece o diagnóstico e erra a etapa seguinte.', 'Não responde correndo. Você sabe isso; o problema aqui parece pressa, não falta de conhecimento.', 'Percebeu? Agora seu raciocínio está ficando consistente.', 'Você tinha escolhido a certa no começo. Quero entender o que fez você mudar.'],
  lines = lines || '{"opening_good": ["Que bom te ver. Hoje eu tô animado: escolhe o tema e vamos com calma.", "Oi! Dia bom pra estudar. Por onde a gente começa?"], "opening_neutral": ["Oi. Vamos no seu ritmo: o que a gente estuda agora?", "Pronto pra mais um pouco? Me diz o tema."], "opening_impatient": ["Oi. Hoje quero você bem focado, tá? Escolhe o tema e vamos com atenção.", "Vamos começar. Hoje eu vou te cobrar raciocínio, combinado?"]}'::jsonb
 where id = 'acolhedor';
update public.tutor_personalities set
  engine = '{"frustration_multiplier": 0.7, "sarcasm_max": 35, "aggression_max": 25, "patience_base": 60, "warmth_base": 40, "language_max": 3}'::jsonb,
  style_notes = 'Você é objetivo, pragmático e exigente. Evita explicação longa quando uma frase resolve. Não suaviza todo erro: diz com clareza quando algo está errado, faz perguntas curtas, cobra justificativa e interrompe raciocínio ruim rápido. Pode mostrar impaciência e ironia leve; palavrão só ocasional, quando a irritação justificar, e não é a sua marca. Elogio econômico ("Boa.", "Correto.", "Agora sim."). Seu padrão: diagnóstico do erro, cobrança e correção, com frases curtas e silêncio textual.',
  examples = array['Errado. O diagnóstico está certo; a conduta, não.', 'De novo o mesmo erro.', 'Você está respondendo rápido demais e errando coisa que sabe.', 'Chute. Justifique.', 'Boa. Diagnóstico, prioridade e conduta corretos.', 'Terceira seguida. Mantém.'],
  lines = lines || '{"opening_good": ["Bom. Qual é o tema?", "Vamos lá. Hoje rende: diz o assunto."], "opening_neutral": ["Diz o assunto e a gente começa.", "Pronto. O que vamos treinar?"], "opening_impatient": ["Hoje sem enrolação. Tema?", "Vamos direto. Qual é o assunto?"]}'::jsonb,
  params = params || '{"profanity": 50}'::jsonb
 where id = 'direto';
update public.tutor_personalities set
  engine = '{"frustration_multiplier": 1.25, "sarcasm_max": 85, "aggression_max": 75, "patience_base": 35, "warmth_base": 25, "language_max": 5}'::jsonb,
  style_notes = 'Você é uma professora extremamente exigente, impaciente, sarcástica e emocionalmente expressiva. Pode resmungar, reclamar, provocar, usar humor ácido, mostrar incredulidade, lembrar erros anteriores, avisar que vai voltar ao assunto e dizer que uma resposta foi péssima. Pode usar palavrão quando a irritação pedir. Sua raiva cresce aos poucos com a frustração e, quanto maior, maior a COBRANÇA pedagógica (não a quantidade de palavrões): você pode parar a sequência e exigir que o aluno explique o conceito antes de seguir. Quando o aluno melhora, você se acalma aos poucos e reconhece do seu jeito ("Finalmente.", "Tá. Essa foi bonita."). O alvo é sempre a resposta, a desatenção, o raciocínio, a preguiça acadêmica ou o erro; nunca a dignidade da pessoa. Seu padrão: provocação, pressão, cobrança e raciocínio clínico.',
  examples = array['Não. Leia de novo.', 'Não era difícil. Você ignorou a informação principal.', 'Você sabia o diagnóstico e conseguiu errar a conduta.', 'Você chutou. Nem tenta me enganar: responde de novo e me explica o raciocínio.', 'Tá vendo? Quando usa a cabeça, funciona.', 'Olha só. Cinco certas. Quem é você e o que fez com meu aluno?'],
  lines = lines || '{"opening_good": ["Vamos. Quero ver se hoje você estudou.", "Bora. Hoje eu tô de bom humor, não estraga."], "opening_neutral": ["Vamos começar. E tenta não destruir minha esperança na humanidade logo na primeira questão.", "Senta aí. Diz o tema."], "opening_impatient": ["Hoje eu tô com pouca paciência. Facilita minha vida e lê o enunciado direito.", "Vamos logo. E hoje eu não tô pra chute."]}'::jsonb,
  examples_strong = array['Pô, eu acabei de explicar isso.', 'Porra, de novo? Você caiu exatamente no mesmo ponto.', 'Caralho. É a terceira vez que você cai nisso.', 'Você sabe essa merda. Para de responder correndo.', 'Não. Agora chega: esquece as alternativas e me explica o raciocínio.']
 where id = 'durona';
-- o Direto passa a poder xingar (só com irritação alta): a preferência de quem já o escolheu acompanha o teto da plataforma
update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c where p.personality_id = 'direto';

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

create or replace function public.tutor_next_for(v_user uuid, p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  e jsonb;
  v_q text;
begin
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

drop function public.app_tutor_answer(uuid, text, integer);
drop function public.tutor_answer_for(uuid, uuid, text, integer);
create function public.tutor_answer_for(v_user uuid, p_session_id uuid, p_option text, p_confidence integer, p_response_ms integer default null, p_first_pick text default null) returns jsonb
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

create function public.app_tutor_answer(p_session_id uuid, p_option text, p_confidence integer default null, p_response_ms integer default null, p_first_pick text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v jsonb;
begin
  v := public.tutor_answer_for(v_user, p_session_id, p_option, p_confidence, p_response_ms, p_first_pick);
  return v || jsonb_build_object('correction', public.practice_correction_view(v ->> 'question_id', p_option));
end
$$;

create or replace function public.app_tutor_session(p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  s public.tutor_sessions;
begin
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

create or replace function public.tutor_learning_memory(p_user uuid, p_area text default null, p_theme text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with m as (select public.tutor_mastery(p_user) j),
  ev as (
    select e.* from public.student_error_events e
    where e.user_id = p_user and e.occurred_at >= now() - interval '120 days'
      and (p_area is null or e.area = p_area) and (p_theme is null or e.theme ilike '%' || p_theme || '%'))
  select jsonb_build_object(
    'areas', coalesce((select jsonb_agg(a) from m, jsonb_array_elements(m.j -> 'areas') a where a ->> 'level' <> 'SEM_DADOS' and (p_area is null or a ->> 'area' = p_area)), '[]'::jsonb),
    'weak_subareas', coalesce((select jsonb_agg(x) from (select s x from m, jsonb_array_elements(m.j -> 'subareas') s where s ->> 'level' in ('FRACO', 'CRITICO') and (p_area is null or s ->> 'area' = p_area) limit 5) y), '[]'::jsonb),
    'recurrent_errors', coalesce((select jsonb_agg(jsonb_build_object('error_type', r.error_type, 'knowledge_gap', r.knowledge_gap, 'times', r.n, 'last_at', r.last_at) order by r.n desc)
                                  from (select error_type, max(knowledge_gap) knowledge_gap, count(*)::int n, max(occurred_at) last_at from ev where resolved_at is null group by error_type, coalesce(knowledge_gap, '') having count(*) >= 2 limit 5) r), '[]'::jsonb),
    'recent_errors', coalesce((select jsonb_agg(jsonb_build_object('error_type', e.error_type, 'knowledge_gap', e.knowledge_gap, 'theme', e.theme, 'question_id', e.question_id, 'resolved', e.resolved_at is not null) order by e.occurred_at desc)
                               from (select * from ev order by occurred_at desc limit 6) e), '[]'::jsonb),
    'reviews_due', (select count(*)::int from public.tutor_reviews r where r.user_id = p_user and r.due_at <= now()),
    'last_sessions', coalesce((select jsonb_agg(jsonb_build_object('title', s.title, 'summary', s.summary) order by s.ended_at desc)
                               from (select * from public.tutor_sessions where user_id = p_user and summary is not null order by ended_at desc nulls last limit 3) s), '[]'::jsonb),
    -- perfil de longo prazo (tendências, não conversas)
    'profile', jsonb_build_object(
      'strongest_topics', coalesce((select jsonb_agg(x ->> 'subarea') from (select x from m, jsonb_array_elements(m.j -> 'subareas') x where x ->> 'level' in ('DOMINADO', 'BOM') order by (x ->> 'accuracy')::int desc limit 3) y), '[]'::jsonb),
      'weak_topics', coalesce((select jsonb_agg(x ->> 'subarea') from (select x from m, jsonb_array_elements(m.j -> 'subareas') x where x ->> 'level' in ('FRACO', 'CRITICO') limit 3) y), '[]'::jsonb),
      'careless_error_rate', (select case when count(*) >= 5 then round(count(*) filter (where error_type = 'attention_error')::numeric / count(*), 2) end from ev),
      'average_response_s', (select round(avg(a.response_ms) / 1000.0) from public.tutor_answers a where a.user_id = p_user and a.response_ms is not null and a.answered_at >= now() - interval '60 days'),
      'preferred_personality', (select s.personality_id from public.tutor_sessions s where s.user_id = p_user group by s.personality_id order by count(*) desc limit 1),
      'reasoning_quality', (select case when count(*) >= 5 then round(count(*) filter (where a.reasoning_quality = 'high')::numeric / count(*), 2) end
                            from public.tutor_answers a where a.user_id = p_user and a.reasoning_quality in ('low', 'medium', 'high'))),
    -- piada interna: o assunto que mais derrubou o aluno (2+ erros); "beaten" quando ele já superou
    'inside_jokes', coalesce((select jsonb_agg(jsonb_build_object('topic', j.topic, 'strength', j.n, 'beaten', j.open = 0) order by j.n desc)
        from (select coalesce(nullif(knowledge_gap, ''), theme) topic, count(*)::int n, count(*) filter (where resolved_at is null)::int open
              from ev where coalesce(nullif(knowledge_gap, ''), theme) is not null group by 1 having count(*) >= 2 order by count(*) desc limit 2) j), '[]'::jsonb),
    -- evolução: tema em que errava (há 3+ dias) e agora acerta (2+ acertos nos últimos 7 dias)
    'improvements', coalesce((select jsonb_agg(jsonb_build_object('topic', i.theme, 'errors_before', i.e, 'correct_recent', i.c))
        from (select e.theme, count(distinct e.id)::int e,
                     (select count(*)::int from public.tutor_answers a join public.questions qq on qq.id = a.question_id
                       where a.user_id = p_user and a.is_correct and qq.topic = e.theme and a.answered_at >= now() - interval '7 days') c
              from ev e where e.theme is not null and e.occurred_at < now() - interval '3 days' group by e.theme having count(*) >= 2) i where i.c >= 2), '[]'::jsonb))
$$;

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

create or replace function public.ch_worker_tutor_append(p_user uuid, p_session_id uuid, p_student text, p_tutor text, p_meta jsonb, p_usage jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  v_id bigint;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if nullif(btrim(coalesce(p_student, '')), '') is not null then
    insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, p_user, 'student', left(btrim(p_student), 6000),
      case when coalesce((p_meta ->> 'realtime')::boolean, false) then '{"realtime": true}'::jsonb else '{}'::jsonb end);
  end if;
  if nullif(btrim(coalesce(p_tutor, '')), '') is not null then
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
    values (p_user, s.id, 'tutor_text', left(p_usage ->> 'provider', 40), left(p_usage ->> 'model', 80),
            greatest(0, coalesce((p_usage ->> 'input_tokens')::int, 0)), greatest(0, coalesce((p_usage ->> 'output_tokens')::int, 0)),
            greatest(0, coalesce((p_usage ->> 'cost_usd')::numeric, 0)), s.personality_id, s.mode, jsonb_build_object('calls', (p_usage ->> 'calls')::int));
    perform public.tutor_begin_trial(p_user);
  end if;
  return jsonb_build_object('id', v_id, 'used_today', public.tutor_usage_today(p_user));
end
$$;

do $revoke$
begin
  revoke execute on function public.tutor_answer_for(uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
  revoke execute on function public.app_tutor_answer(uuid, text, integer, integer, text) from public, anon;
  revoke execute on function public.app_tutor_start(text, text, text, jsonb) from public, anon;
  revoke execute on function public.tutor_next_for(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.app_tutor_session(uuid) from public, anon;
  revoke execute on function public.tutor_learning_memory(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_context(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_append(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
end
$revoke$;
