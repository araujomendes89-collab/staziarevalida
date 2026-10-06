-- =============================================================================
-- Stazia Tutor v2 (1ª fase): três professores, quatro modos, teste grátis com cotas, voz em tempo real com reserva de uso,
-- registro de uso (ledger), eventos de erro do aluno, estado emocional da sessão e resumo da sessão.
--
-- Reaproveita o que existe: tutor_* (conversa, respostas, revisões), subscriptions (plano e teste), app_settings.trial_days,
-- ai_usage (vira o agregado do dia, mantido pelo ledger), question_attempts (histórico) e a análise publicada do SQIE.
-- Novo só o que não tinha equivalente: ai_usage_ledger, student_error_events e tutor_voice_calls.
-- =============================================================================

-- ---------------------------------------------------------------- três professores públicos
-- Os 13 antigos ficam inativos (as conversas antigas continuam apontando para eles). A personalidade muda só o JEITO.
insert into public.tutor_personalities (id, name, emoji, tagline, params, style_notes, openings, voice, position, examples, lines, examples_strong, lines_strong) values
('acolhedor', 'Acolhedor', '🙂', 'Calmo, paciente e didático',
 '{"humor":35,"sarcasm":0,"friendliness":95,"strictness":45,"profanity":0,"patience":95,"verbosity":55,"socratic_level":60,"motivation":75,"clinical_pressure":25}',
 'Professor calmo, paciente e didático. Fala com respeito e sem pressa, encoraja de verdade e reduz a ansiedade diante do erro. Corrige sem constranger, mas não concorda com resposta errada só para ser gentil: diz com clareza que não é aquilo e mostra o caminho. Sem palavrão.',
 array['Oi! Que bom te ver. O que a gente estuda agora?', 'Vamos com calma e no seu ritmo. Por onde você quer começar?', 'Pronto pra mais um pouco? Escolhe o tema que eu te acompanho.'],
 '{"rate":0.98,"pitch":1.02,"style":"calma","realtime":"cedar","openai":"cedar","gemini":"Sulafat","acting":"professor calmo e caloroso, que fala sem pressa e sorri na voz"}', 1,
 array['Quase. Olha só esse detalhe aqui.', 'Não é essa, mas o seu raciocínio começou bem. Onde você acha que desviou?', 'Isso! E repara que você chegou lá sozinho.', 'Calma, essa confunde muita gente. Vamos isolar o que está pegando.'],
 '{"question": ["Separei uma questão pra gente. Lê com calma e me diz o que você acha.", "Bora de questão? Sem pressa: se travar, me chama."], "review": ["Essa aqui você errou outro dia. Vamos olhar de novo, com calma?", "Vamos dar outra chance pra essa? Agora você já conhece o terreno."], "next": ["Mais uma? Vamos lá.", "Próxima. No seu ritmo."], "topic": ["Vamos de {tema}, então. Me conta: o que você já sabe sobre isso?", "{tema}, boa escolha. Por onde você quer começar?"]}',
 '{}', '{}'),
('direto', 'Direto', '🎯', 'Objetivo, exigente e sem enrolação',
 '{"humor":15,"sarcasm":20,"friendliness":45,"strictness":85,"profanity":0,"patience":50,"verbosity":15,"socratic_level":50,"motivation":40,"clinical_pressure":70}',
 'Objetivo, conciso e exigente. Vai direto ao ponto, aponta o erro na hora e pressiona na medida certa. Prioriza eficiência: poucas frases quando poucas frases resolvem. Sem palavrão, sem rodeio e sem elogio vazio.',
 array['Vamos lá. Qual é o tema?', 'Diz o assunto e a gente começa.', 'Pronto. O que vamos treinar?'],
 '{"rate":1.05,"pitch":0.97,"style":"objetiva","realtime":"ash","openai":"ash","gemini":"Orus","acting":"professor objetivo e firme, ritmo rápido, frases curtas"}', 2,
 array['Não. Olha o comando.', 'Correto. Por quê?', 'Você pulou uma etapa. Qual?', 'Isso. Próxima.'],
 '{"question": ["Questão. Lê e me diz a sua resposta.", "Tá aí. Lê o comando com atenção e responde."], "review": ["Essa você errou. Vamos corrigir agora.", "De volta ao ponto fraco. Responde."], "next": ["Próxima.", "Mais uma. Foco."], "topic": ["{tema}. O que você sabe disso?", "{tema}. Começa me dizendo o essencial."]}',
 '{}', '{}'),
('durona', 'Durona', '🔥', 'Provocadora, escrachada e sem passar a mão na cabeça',
 '{"humor":85,"sarcasm":80,"friendliness":35,"strictness":85,"profanity":60,"patience":30,"verbosity":35,"socratic_level":60,"motivation":55,"clinical_pressure":70}',
 'Professora durona, provocadora e escrachada. Bem-humorada, irônica e impaciente quando o aluno vacila; não passa a mão na cabeça e pressiona de verdade. A bronca e a ironia vão para a resposta e para a conduta, nunca para a pessoa. Não começa gritando: a intensidade sobe com o contexto, quando o aluno repete o erro, chuta ou enrola.',
 array['Bora. Qual é o tema de hoje?', 'Chegou. Diz o assunto, que eu quero ver do que você é capaz.', 'Senta aí. O que vamos destrinchar?'],
 '{"rate":1.06,"pitch":1.0,"style":"provocadora","realtime":"marin","openai":"marin","gemini":"Kore","acting":"professora durona e escrachada: rápida, irônica e provocadora, com humor ácido; sobe o tom quando o aluno vacila"}', 3,
 array['Que conduta foi essa? Você pulou a estabilização inteira.', 'De novo? Para e lê o que a questão está pedindo.', 'Agora sim. Viu que dava?', 'Tem certeza? Porque o caso está dizendo outra coisa.', 'Olha o comando da questão de novo, com calma dessa vez.'],
 '{"question": ["Questão na mesa. Lê direito e me diz o que você marca.", "Bora: lê o caso inteiro antes de sair chutando."], "review": ["Essa aqui já te derrubou uma vez. Hoje é revanche.", "Lembra dessa? Pois é. Vamos ver se agora vai."], "next": ["Próxima. Sem moleza.", "Mais uma. Capricha."], "topic": ["{tema}. Fala aí o que você já sabe.", "Vamos destrinchar {tema}. Começa você."]}',
 array['Porra, você sabia essa. Olha o comando da questão de novo.', 'Que merda de conduta foi essa? Você pulou a estabilização inteira.', 'De novo, cacete? Você caiu exatamente na mesma porcaria. Para e lê o que a questão está pedindo.', 'Caralho, agora sim! Viu que dava?', 'Puta merda, três voltas pra chegar na resposta. Mas chegou.'],
 '{"review": ["Essa aqui já te derrubou uma vez, porra. Hoje é revanche.", "Lembra dessa merda? Pois é. Vamos ver se agora vai."], "next": ["Próxima, cacete. Sem moleza.", "Mais uma. E capricha, porra."]}');

update public.tutor_personalities set active = false, position = position + 100 where id not in ('acolhedor', 'direto', 'durona');
-- discutir uma questão que o aluno já respondeu ({tema} recebe a letra marcada)
update public.tutor_personalities set lines = lines || '{"discuss": ["Você marcou a {tema}. Me conta: o que te levou a ela?", "Vamos olhar essa juntos. Por que a {tema}?"]}'::jsonb where id = 'acolhedor';
update public.tutor_personalities set lines = lines || '{"discuss": ["Você marcou a {tema}. Por quê?", "{tema}. Justifica."]}'::jsonb where id = 'direto';
update public.tutor_personalities set lines = lines || '{"discuss": ["A {tema}, é? Me convence: por que essa?", "Você foi de {tema}. Defende aí a sua escolha."]}'::jsonb where id = 'durona';

-- quem já tinha escolhido professor vai para o equivalente; a intensidade some da tela (vale a 3, e o estado da sessão faz o resto)
update public.tutor_preferences set
  personality_id = case when personality_id in ('rabugento', 'xingao', 'mal_humorado', 'sarcastico') then 'durona'
                        when personality_id in ('preceptor', 'examinador', 'militar') then 'direto' else 'acolhedor' end,
  profanity = case when personality_id in ('rabugento', 'xingao', 'mal_humorado', 'sarcastico') then (select c.max_profanity from public.tutor_config c) else 'off' end,
  intensity = 3, updated_at = now();
alter table public.tutor_preferences alter column personality_id set default 'acolhedor';

-- ---------------------------------------------------------------- sessão: contexto, estado emocional, resumo
alter table public.tutor_sessions
  add column context_type text check (context_type in ('question', 'error', 'theme', 'area', 'flashcard', 'weak_points', 'free')),
  add column context_id text check (char_length(context_id) <= 200),
  add column context_label text check (char_length(context_label) <= 160),
  -- estado interno (0–100); o aluno não vê os números, só o jeito do professor muda
  add column emotion jsonb not null default '{"frustration":15,"engagement":50,"patience":75,"enthusiasm":40}'::jsonb,
  add column summary jsonb,
  add column voice_seconds integer not null default 0,
  add column ended_at timestamptz,
  add column duration_seconds integer,
  add column termination_reason text check (termination_reason in ('student', 'timeout', 'quota', 'replaced', 'error'));

-- ---------------------------------------------------------------- teste grátis e limites (estende o que existe)
-- O teste do Tutor começa no PRIMEIRO USO REAL (primeira resposta da IA ou primeira voz), não na criação da conta.
alter table public.subscriptions add column tutor_trial_started_at timestamptz;

alter table public.tutor_config
  add column trial_voice_daily_seconds integer not null default 600 check (trial_voice_daily_seconds between 0 and 86400),
  add column trial_voice_total_seconds integer not null default 2400 check (trial_voice_total_seconds between 0 and 864000),
  add column trial_text_daily integer not null default 40 check (trial_text_daily between 0 and 500),
  add column trial_questions_daily integer not null default 30 check (trial_questions_daily between 0 and 500),
  add column paid_voice_daily_seconds integer not null default 3600 check (paid_voice_daily_seconds between 0 and 86400),
  add column voice_lease_seconds integer not null default 120 check (voice_lease_seconds between 30 and 600);

alter table public.ai_usage add column voice_seconds integer not null default 0;

-- ---------------------------------------------------------------- registro de uso de IA (só acrescenta)
-- Fonte de verdade de custo e telemetria. ai_usage continua sendo o resumo do dia (mantido por gatilho a partir daqui).
-- `interactions` é a cota de texto: +1 reserva uma interação antes da chamada; -1 devolve se a IA falhar.
create table public.ai_usage_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.tutor_sessions (id) on delete set null,
  feature text not null check (feature in ('tutor_text', 'tutor_eval', 'tutor_voice', 'tutor_voice_tokens', 'tutor_tts')),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  input_text_tokens integer not null default 0 check (input_text_tokens >= 0),
  output_text_tokens integer not null default 0 check (output_text_tokens >= 0),
  input_audio_tokens integer not null default 0 check (input_audio_tokens >= 0),
  output_audio_tokens integer not null default 0 check (output_audio_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  characters integer not null default 0 check (characters >= 0),
  interactions smallint not null default 0 check (interactions between -1 and 1),
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  persona text, mode text,
  meta jsonb not null default '{}'::jsonb,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_at timestamptz not null default now()
);
create index ai_usage_ledger_user_idx on public.ai_usage_ledger (user_id, created_at desc);
create index ai_usage_ledger_session_idx on public.ai_usage_ledger (session_id) where session_id is not null;
create index ai_usage_ledger_day_idx on public.ai_usage_ledger (day, feature);
alter table public.ai_usage_ledger enable row level security;
create policy "uso de IA (registro): ler o próprio" on public.ai_usage_ledger for select to authenticated using (user_id = (select auth.uid()));

create function public.ai_usage_ledger_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'O registro de uso só aceita novas linhas.' using errcode = '42501';
end
$$;
create trigger ai_usage_ledger_no_update before update on public.ai_usage_ledger for each row execute function public.ai_usage_ledger_guard();

create function public.ai_usage_ledger_rollup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ai_usage as u (user_id, day, requests, input_tokens, output_tokens, cost_usd, voice_chars, voice_seconds)
  values (new.user_id, new.day, greatest(new.interactions, 0), new.input_text_tokens + new.input_audio_tokens, new.output_text_tokens + new.output_audio_tokens,
          new.estimated_cost_usd, case when new.feature = 'tutor_tts' then new.characters else 0 end, case when new.feature = 'tutor_voice' then new.duration_seconds else 0 end)
  on conflict (user_id, day) do update set
    requests = greatest(u.requests + new.interactions, 0),
    input_tokens = u.input_tokens + excluded.input_tokens, output_tokens = u.output_tokens + excluded.output_tokens,
    cost_usd = u.cost_usd + excluded.cost_usd, voice_chars = u.voice_chars + excluded.voice_chars, voice_seconds = u.voice_seconds + excluded.voice_seconds;
  return new;
end
$$;
create trigger ai_usage_ledger_rollup after insert on public.ai_usage_ledger for each row execute function public.ai_usage_ledger_rollup();

-- ---------------------------------------------------------------- erros do aluno (eventos)
create table public.student_error_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text references public.questions (id) on delete set null,
  session_id uuid references public.tutor_sessions (id) on delete set null,
  area text, theme text, subtheme text,
  error_type text not null check (error_type in ('knowledge_gap', 'interpretation_error', 'command_word_error', 'distractor_trap', 'outdated_guideline', 'calculation_error',
                                                 'priority_of_management', 'diagnostic_reasoning', 'therapeutic_reasoning', 'memory_failure', 'attention_error',
                                                 'changed_correct_answer', 'unknown')),
  knowledge_gap text check (char_length(knowledge_gap) <= 160),
  source text not null check (source in ('tutor_text', 'tutor_voice')),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index student_error_events_user_idx on public.student_error_events (user_id, occurred_at desc);
create index student_error_events_question_idx on public.student_error_events (user_id, question_id) where resolved_at is null;
create index student_error_events_session_idx on public.student_error_events (session_id) where session_id is not null;
alter table public.student_error_events enable row level security;
create policy "erros do aluno: ler os próprios" on public.student_error_events for select to authenticated using (user_id = (select auth.uid()));

-- Acertar de novo a mesma questão (no Tutor ou no treino normal) resolve o erro registrado.
create function public.student_error_events_resolve() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_correct then
    update public.student_error_events set resolved_at = now() where user_id = new.user_id and question_id = new.question_id and resolved_at is null;
  end if;
  return new;
end
$$;
create trigger question_attempts_resolve_errors after insert on public.question_attempts for each row execute function public.student_error_events_resolve();

-- ---------------------------------------------------------------- voz em tempo real: chamadas e reserva de uso
-- Uma chamada ativa por aluno (celular, tablet, notebook ou outra aba não gastam o mesmo saldo ao mesmo tempo).
-- Enquanto ativa, a chamada já conta até o fim da reserva (lease_until); ao encerrar, conta o tempo real.
create table public.tutor_voice_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.tutor_sessions (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended', 'expired', 'failed')),
  call_id text check (call_id ~ '^[A-Za-z0-9_-]{4,120}$'),   -- id da chamada na OpenAI, para o servidor encerrar
  model text,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  started_at timestamptz not null default now(),
  lease_until timestamptz not null,
  consumed_seconds integer not null default 0 check (consumed_seconds >= 0),
  ended_at timestamptz,
  termination_reason text check (termination_reason in ('student', 'timeout', 'quota', 'replaced', 'error', 'session_closed'))
);
create unique index tutor_voice_calls_one_active on public.tutor_voice_calls (user_id) where status = 'active';
create index tutor_voice_calls_user_day_idx on public.tutor_voice_calls (user_id, day);
create index tutor_voice_calls_lease_idx on public.tutor_voice_calls (lease_until) where status = 'active';
alter table public.tutor_voice_calls enable row level security;
create policy "voz do tutor: ler as próprias" on public.tutor_voice_calls for select to authenticated using (user_id = (select auth.uid()));

-- Segundos de voz que já contam (ativas contam até o fim da reserva).
create function public.tutor_voice_seconds(p_user uuid, p_day date, p_since timestamptz) returns integer
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case when v.status = 'active' then greatest(0, ceil(extract(epoch from (v.lease_until - v.started_at))))::int else v.consumed_seconds end), 0)::int
  from public.tutor_voice_calls v
  where v.user_id = p_user and (p_day is null or v.day = p_day) and (p_since is null or v.started_at >= p_since)
$$;

-- ---------------------------------------------------------------- o que o aluno pode usar (tudo decidido aqui, no banco)
create function public.tutor_entitlement(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.subscriptions;
  v_paid boolean;
  v_days integer := coalesce((select (x.value #>> '{}')::integer from public.app_settings x where x.key = 'trial_days'), 7);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mode text;
  v_trial text := 'none';
  v_ends timestamptz;
  v_text_limit integer; v_text_used integer;
  v_vday integer; v_vday_used integer; v_vtotal integer; v_vtotal_used integer := 0; v_vleft integer;
  v_qlimit integer; v_qused integer;
  v_block text;
begin
  select * into c from public.tutor_config;
  select * into s from public.subscriptions where user_id = p_user;
  v_paid := exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin')
            or coalesce(s.plan in ('pro', 'elite') and s.status in ('active', 'past_due'), false);
  if v_paid or not c.requires_pro then
    v_mode := 'paid';
  elsif s.tutor_trial_started_at is null then
    v_mode := 'trial'; v_trial := 'available';
  elsif now() < s.tutor_trial_started_at + make_interval(days => v_days) then
    v_mode := 'trial'; v_trial := 'active'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  else
    v_mode := 'blocked'; v_trial := 'expired'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  end if;

  v_text_used := coalesce((select u.requests from public.ai_usage u where u.user_id = p_user and u.day = v_today), 0);
  v_text_limit := case v_mode when 'paid' then c.daily_message_limit when 'trial' then c.trial_text_daily else 0 end;
  v_vday := case when not c.voice_enabled then 0 when v_mode = 'paid' then c.paid_voice_daily_seconds when v_mode = 'trial' then c.trial_voice_daily_seconds else 0 end;
  v_vday_used := public.tutor_voice_seconds(p_user, v_today, null);
  if v_mode = 'trial' then
    v_vtotal := c.trial_voice_total_seconds;
    if s.tutor_trial_started_at is not null then v_vtotal_used := public.tutor_voice_seconds(p_user, null, s.tutor_trial_started_at); end if;
  end if;
  v_vleft := greatest(0, least(v_vday - v_vday_used, coalesce(v_vtotal - v_vtotal_used, 2147483647)));
  v_qlimit := case when v_mode = 'trial' then c.trial_questions_daily end;
  v_qused := (select count(*)::int from public.tutor_answers a where a.user_id = p_user and (a.answered_at at time zone 'America/Sao_Paulo')::date = v_today);
  v_block := case when not c.enabled then 'disabled' when v_mode = 'blocked' then 'trial_expired' end;

  return jsonb_build_object(
    'enabled', c.enabled, 'mode', v_mode, 'plan', coalesce(s.plan::text, 'trial'), 'is_paid', v_paid,
    'trial', jsonb_build_object('state', v_trial, 'days', v_days, 'started_at', s.tutor_trial_started_at, 'ends_at', v_ends,
                                'day', case when v_trial = 'active' then least(v_days, floor(extract(epoch from (now() - s.tutor_trial_started_at)) / 86400)::int + 1) end),
    'text', jsonb_build_object('used', v_text_used, 'limit', v_text_limit, 'remaining', greatest(0, v_text_limit - v_text_used)),
    'voice', jsonb_build_object('enabled', c.voice_enabled, 'limit_today_s', v_vday, 'used_today_s', v_vday_used, 'remaining_today_s', greatest(0, v_vday - v_vday_used),
                                'limit_total_s', v_vtotal, 'used_total_s', case when v_vtotal is not null then v_vtotal_used end,
                                'remaining_total_s', case when v_vtotal is not null then greatest(0, v_vtotal - v_vtotal_used) end, 'remaining_s', v_vleft),
    'questions', jsonb_build_object('used', v_qused, 'limit', v_qlimit, 'remaining', case when v_qlimit is not null then greatest(0, v_qlimit - v_qused) end),
    'can_use', c.enabled and v_mode <> 'blocked',
    'can_text', c.enabled and v_mode <> 'blocked' and v_text_used < v_text_limit,
    'can_voice', c.enabled and v_mode <> 'blocked' and c.voice_enabled and v_vleft > 0,
    'block_reason', v_block);
end
$$;

-- Primeiro uso real: começa o teste (uma vez por conta, nunca para quem paga).
create function public.tutor_begin_trial(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if (public.tutor_entitlement(p_user) ->> 'mode') <> 'trial' then return; end if;
  insert into public.subscriptions (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.subscriptions set tutor_trial_started_at = now() where user_id = p_user and tutor_trial_started_at is null;
end
$$;

-- ---------------------------------------------------------------- Truth Engine: o que se sabe de verdade sobre uma questão
-- p_level: 'open' (só enunciado e alternativas), 'hint' (+ gabarito e explicações oficiais) ou 'full' (+ análise revisada e atualização).
create function public.tutor_truth(p_question_id text, p_level text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'area', q.area, 'topic', q.topic, 'subtopic', q.subtopic, 'statement', q.statement,
    'exam', (select x.kind || ' ' || x.year from public.exams x where x.id = q.exam_id), 'number', q.number,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text',
                  'explanation', case when p_level in ('hint', 'full') then nullif(btrim(o ->> 'explanation'), '') end) order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'official_answer', case when p_level in ('hint', 'full') then q.correct_option end,
    'expected_conduct', case when p_level in ('hint', 'full') then q.expected_conduct end,
    'inep_intent', case when p_level in ('hint', 'full') then q.inep_intent end,
    'sources', case when p_level = 'full' and jsonb_array_length(q.sources) > 0 then q.sources end,
    'analysis', case when p_level = 'full' then (select jsonb_build_object('question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
                     'options', (select jsonb_agg(jsonb_build_object('option_id', o.option_id, 'reasoning', o.reasoning, 'why_wrong', o.why_wrong, 'trap', o.trap) order by o.option_id) from public.question_option_analysis o where o.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published') end,
    'update_card', case when p_level = 'full' then (select jsonb_build_object('official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'sources', k.sources)
                   from public.question_update_cards k where k.question_id = q.id and k.status = 'published') end)
  from public.questions q where q.id = p_question_id
$$;

-- ---------------------------------------------------------------- memória pedagógica (derivada; sem tabela nova)
create function public.tutor_learning_memory(p_user uuid, p_area text default null, p_theme text default null) returns jsonb
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
                               from (select * from public.tutor_sessions where user_id = p_user and summary is not null order by ended_at desc nulls last limit 3) s), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- resumo estruturado da sessão (sem IA: só dados)
create function public.tutor_session_summary(p_session_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with s as (select * from public.tutor_sessions where id = p_session_id),
  ans as (select a.*, q.topic, q.area::text area from public.tutor_answers a join public.questions q on q.id = a.question_id where a.session_id = p_session_id),
  ev as (select * from public.student_error_events where session_id = p_session_id)
  select jsonb_build_object(
    'topics_reviewed', coalesce((select jsonb_agg(distinct t) from (select topic t from ans union select topic from s where topic is not null) x), '[]'::jsonb),
    'questions_answered', (select count(*)::int from ans),
    'correct', (select count(*)::int from ans where is_correct),
    'concepts_mastered', coalesce((select jsonb_agg(distinct topic) from ans where is_correct and not lucky_guess and not heavy_hints), '[]'::jsonb),
    'errors_detected', coalesce((select jsonb_agg(jsonb_build_object('error_type', error_type, 'knowledge_gap', knowledge_gap, 'theme', theme)) from ev), '[]'::jsonb),
    'recurrent_errors', coalesce((select jsonb_agg(distinct e.error_type) from ev e
                                  where (select count(*) from public.student_error_events o where o.user_id = e.user_id and o.error_type = e.error_type and o.resolved_at is null) >= 2), '[]'::jsonb),
    'needs_review', coalesce((select jsonb_agg(distinct a.topic) from ans a join public.tutor_reviews r on r.user_id = a.user_id and r.question_id = a.question_id), '[]'::jsonb),
    'next_recommended_topics', coalesce((select jsonb_agg(x ->> 'subarea') from (select x from s, jsonb_array_elements(public.tutor_mastery(s.user_id) -> 'subareas') x
                                         where x ->> 'level' in ('FRACO', 'CRITICO') limit 3) y), '[]'::jsonb),
    'voice_minutes', (select round(voice_seconds / 60.0, 1) from s))
$$;

-- ---------------------------------------------------------------- próxima questão, agora com área
drop function public.tutor_pick_question(uuid, text, smallint, text[]);
create function public.tutor_pick_question(p_user uuid, p_mode text, p_level smallint, p_exclude text[] default '{}', p_area text default null) returns text
  language sql stable security definer set search_path = ''
as $$
  with last as (
    select distinct on (t.question_id) t.question_id, t.is_correct from public.question_attempts t where t.user_id = p_user order by t.question_id, t.answered_at desc, t.seq desc),
  weak as (
    select d.subarea, d.competency from public.question_attempts t join public.question_dna d on d.question_id = t.question_id
    where t.user_id = p_user and d.subarea is not null and d.competency is not null
    group by d.subarea, d.competency having count(*) >= 3 and count(*) filter (where not t.is_correct) * 10 >= count(*) * 4),
  band as (select case when p_level <= 3 then 'LOW' when p_level <= 6 then 'MODERATE' else 'HIGH' end b)
  select q.id
  from public.questions q
    left join public.question_dna d on d.question_id = q.id
    left join last l on l.question_id = q.id
    left join public.tutor_reviews r on r.user_id = p_user and r.question_id = q.id
  where q.status <> 'annulled' and q.correct_option is not null and jsonb_array_length(q.images) = 0 and not q.needs_image
    and not (q.id = any (coalesce(p_exclude, '{}')))
    and (p_area is null or q.area::text = p_area)
    and case when p_mode = 'erros' then (r.question_id is not null or l.is_correct = false)
             else (l.question_id is null or l.is_correct = false) end
  order by
    case when r.due_at <= now() then 0 else 1 end,
    case when l.is_correct = false then 0 else 1 end,
    case when p_mode = 'erros' then 0 when exists (select 1 from weak w where w.subarea = d.subarea and w.competency = d.competency) then 0 else 1 end,
    case when p_mode = 'erros' then 0 when coalesce(d.difficulty_estimate, 'MODERATE') = (select b from band) then 0 else 1 end,
    coalesce(r.due_at, 'infinity'::timestamptz),
    md5(q.id || p_user::text || current_date::text)
  limit 1
$$;

-- ---------------------------------------------------------------- telas do aluno
create or replace function public.app_tutor_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  c public.tutor_config;
  p public.tutor_preferences;
  e jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into c from public.tutor_config;
  select * into p from public.tutor_preferences where user_id = v_user;
  e := public.tutor_entitlement(v_user);
  return jsonb_build_object(
    'enabled', c.enabled, 'available', (e ->> 'can_use')::boolean, 'requires_pro', c.requires_pro,
    'entitlement', e,
    'daily_limit', (e #>> '{text,limit}')::int, 'used_today', (e #>> '{text,used}')::int,
    'max_profanity', c.max_profanity, 'voice_enabled', c.voice_enabled,
    'preferences', case when p.user_id is null or not exists (select 1 from public.tutor_personalities t where t.id = p.personality_id and t.active)
      then jsonb_build_object('personality_id', 'acolhedor', 'profanity', 'off', 'chosen', false)
      else jsonb_build_object('personality_id', p.personality_id, 'profanity', p.profanity, 'chosen', true) end,
    'personalities', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'swears', (t.params ->> 'profanity')::int >= 20, 'voice', t.voice) order by t.position)
                      from public.tutor_personalities t where t.active),
    'reviews_due', (select count(*)::int from public.tutor_reviews r where r.user_id = v_user and r.due_at <= now()));
end
$$;

-- O aluno escolhe só o professor. Palavrão é da Durona (até o teto da plataforma); os outros não xingam.
create or replace function public.app_tutor_save_preferences(p_prefs jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  t public.tutor_personalities;
  v_prof text;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into t from public.tutor_personalities where id = p_prefs ->> 'personality_id' and active;
  if not found then raise exception 'Professor não encontrado.' using errcode = '22023'; end if;
  v_prof := case when (t.params ->> 'profanity')::int >= 20 then (select c.max_profanity from public.tutor_config c) else 'off' end;
  insert into public.tutor_preferences (user_id, personality_id, intensity, profanity, updated_at) values (v_user, t.id, 3, v_prof, now())
  on conflict (user_id) do update set personality_id = excluded.personality_id, intensity = 3, profanity = excluded.profanity, updated_at = now();
  return jsonb_build_object('personality_id', t.id, 'profanity', v_prof, 'chosen', true);
end
$$;

-- Nova sessão de estudo. O contexto (questão, erro, tema, área, flashcard, pontos fracos) vem da tela que abriu o Tutor.
drop function public.app_tutor_start(text, text, text);
create function public.app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null, p_context jsonb default null) returns jsonb
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
  insert into public.tutor_sessions (user_id, mode, title, topic, question_id, question_state, personality_id, intensity, settings, context_type, context_id, context_label)
  values (v_user, p_mode, v_title, coalesce(v_topic, case when v_ctype in ('theme', 'flashcard') then v_clabel end), v_q, v_state, t.id, 3,
          jsonb_build_object('profanity', p.profanity, 'adaptive', true, 'params', t.params, 'area', v_area),
          v_ctype, coalesce(v_cid, v_area), v_clabel)
  returning id into v_id;
  -- abertura: na voz do personagem e variando entre conversas (sem IA e sem conteúdo médico)
  v_open := case
    when p_mode = 'erros' then public.tutor_line(t.id, 'review', v_id::text, null, v_strong)
    when p_mode = 'questao' then public.tutor_line(t.id, 'question', v_id::text, null, v_strong)
    when coalesce(v_topic, v_clabel) is not null and v_ctype is distinct from 'weak_points' then public.tutor_line(t.id, 'topic', v_id::text, coalesce(v_topic, v_clabel), v_strong)
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

create function public.tutor_next_for(v_user uuid, p_session_id uuid) returns jsonb
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

create or replace function public.app_tutor_next_question(p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  perform public.tutor_next_for(v_user, p_session_id);
  return public.app_tutor_session(p_session_id);
end
$$;

-- Resposta dentro do Tutor: o banco corrige. Limite de questões do teste e trava por aluno (dois aparelhos não passam do limite).
create function public.tutor_answer_for(v_user uuid, p_session_id uuid, p_option text, p_confidence integer) returns jsonb
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
  insert into public.tutor_answers (session_id, user_id, question_id, selected_option, is_correct, confidence, hints_used, outcome, lucky_guess, heavy_hints)
  values (s.id, v_user, q.id, p_option::char(1), v_ok, p_confidence, s.hint_level, v_outcome, v_lucky, v_heavy);

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
    'difficulty_level', v_level, 'review_scheduled', v_reason is not null, 'question_id', q.id);
end
$$;

create or replace function public.app_tutor_answer(p_session_id uuid, p_option text, p_confidence integer default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v jsonb;
begin
  v := public.tutor_answer_for(v_user, p_session_id, p_option, p_confidence);
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

-- Histórico: sessões de estudo com título do contexto, duração ou questões, e o professor.
create or replace function public.app_tutor_sessions(p_limit integer default 20) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'mode', s.mode, 'status', s.status, 'last_message_at', s.last_message_at,
           'personality', (select t.emoji from public.tutor_personalities t where t.id = s.personality_id),
           'persona', (select t.name from public.tutor_personalities t where t.id = s.personality_id),
           'minutes', greatest(1, round(coalesce(s.duration_seconds, extract(epoch from (s.last_message_at - s.created_at))::int) / 60.0))::int,
           'questions', (select count(*)::int from public.tutor_answers a where a.session_id = s.id)) order by s.last_message_at desc), '[]'::jsonb)
  from (select * from public.tutor_sessions where user_id = (select auth.uid()) order by last_message_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) s
$$;

-- Encerrar: guarda o resumo pedagógico (sem IA) e a duração; uma voz aberta nesta sessão perde a reserva e o servidor a desliga.
create or replace function public.app_tutor_close(p_session_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.status = 'closed' then return true; end if;
  update public.tutor_voice_calls set lease_until = least(lease_until, now()) where session_id = s.id and status = 'active';
  update public.tutor_sessions set status = 'closed', ended_at = now(), termination_reason = coalesce(termination_reason, 'student'),
    duration_seconds = greatest(0, extract(epoch from (last_message_at - created_at))::int),
    summary = public.tutor_session_summary(s.id)
  where id = s.id;
  return true;
end
$$;

-- Relatório pedagógico: o que já existia + sessões, tipos de erro, erros recorrentes e o que o Tutor percebeu (só com amostra suficiente).
create or replace function public.app_tutor_report() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  m jsonb;
  v_err jsonb;
  v_total integer;
  v_insights jsonb := '[]'::jsonb;
  v_conduct integer; v_dx integer; v_cmd integer; v_trap integer; v_old integer; v_att integer; v_sure integer;
  w record;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  m := public.tutor_mastery(v_user);
  select coalesce(jsonb_object_agg(x.error_type, x.n), '{}'::jsonb), coalesce(sum(x.n), 0)::int into v_err, v_total
  from (select error_type, count(*)::int n from public.student_error_events where user_id = v_user and occurred_at >= now() - interval '90 days' group by error_type) x;
  v_conduct := coalesce((v_err ->> 'priority_of_management')::int, 0) + coalesce((v_err ->> 'therapeutic_reasoning')::int, 0);
  v_dx := coalesce((v_err ->> 'diagnostic_reasoning')::int, 0);
  v_cmd := coalesce((v_err ->> 'command_word_error')::int, 0) + coalesce((v_err ->> 'interpretation_error')::int, 0);
  v_trap := coalesce((v_err ->> 'distractor_trap')::int, 0);
  v_old := coalesce((v_err ->> 'outdated_guideline')::int, 0);
  v_att := coalesce((v_err ->> 'attention_error')::int, 0);
  v_sure := (select count(*)::int from public.tutor_answers a where a.user_id = v_user and a.outcome = 'priority' and a.answered_at >= now() - interval '90 days');
  -- cada frase só aparece com amostra mínima; o número de casos vai junto
  if v_total >= 5 and v_conduct >= 3 and v_conduct * 10 >= v_total * 4 and v_dx <= 1 then
    v_insights := v_insights || jsonb_build_object('text', 'Você identifica o diagnóstico, mas tem perdido questões quando o comando pede a conduta.', 'evidence', v_conduct);
  end if;
  if v_total >= 5 and v_cmd >= 3 and v_cmd * 10 >= v_total * 3 then
    v_insights := v_insights || jsonb_build_object('text', 'Parte grande dos seus erros vem da leitura do comando: a questão pede uma coisa e a resposta vai para outra.', 'evidence', v_cmd);
  end if;
  if v_trap >= 3 then
    v_insights := v_insights || jsonb_build_object('text', 'As alternativas-armadilha têm te pegado: a que parece certa à primeira vista.', 'evidence', v_trap);
  end if;
  if v_old >= 2 then
    v_insights := v_insights || jsonb_build_object('text', 'Você tem respondido com condutas que já mudaram. Vale revisar as atualizações dos temas que caem.', 'evidence', v_old);
  end if;
  if v_att >= 3 then
    v_insights := v_insights || jsonb_build_object('text', 'Vários erros foram de atenção: você sabia o conteúdo, mas passou por um detalhe do caso.', 'evidence', v_att);
  end if;
  if v_sure >= 3 then
    v_insights := v_insights || jsonb_build_object('text', 'Você errou com muita certeza algumas vezes. São os pontos que mais valem uma revisão agora.', 'evidence', v_sure);
  end if;
  select a ->> 'area' area, (a ->> 'accuracy')::int acc, (a ->> 'attempts')::int n into w
  from jsonb_array_elements(m -> 'areas') a where (a ->> 'attempts')::int >= 20 order by (a ->> 'accuracy')::int limit 1;
  if w.area is not null and w.acc < 60 then
    v_insights := v_insights || jsonb_build_object('text', format('Seu ponto mais fraco hoje é %s: %s%% de acerto em %s questões.', initcap(replace(lower(w.area), '_', ' ')), w.acc, w.n), 'evidence', w.n);
  end if;

  return jsonb_build_object(
    'mastery', m,
    'strengths', coalesce((select jsonb_agg(a) from jsonb_array_elements(m -> 'areas') a where a ->> 'level' in ('DOMINADO', 'BOM')), '[]'::jsonb),
    'weaknesses', coalesce((select jsonb_agg(a) from jsonb_array_elements(m -> 'areas') a where a ->> 'level' in ('FRACO', 'CRITICO')), '[]'::jsonb),
    'critical_topics', coalesce((select jsonb_agg(s) from (select s from jsonb_array_elements(m -> 'subareas') s where s ->> 'level' in ('FRACO', 'CRITICO') limit 8) x), '[]'::jsonb),
    'highest_risk_area', (select a ->> 'area' from jsonb_array_elements(m -> 'areas') a where a ->> 'level' <> 'SEM_DADOS' order by (a ->> 'accuracy')::numeric limit 1),
    'evolution', (select jsonb_build_object(
        'last_30', jsonb_build_object('attempts', count(*) filter (where t.answered_at >= now() - interval '30 days')::int, 'correct', count(*) filter (where t.answered_at >= now() - interval '30 days' and t.is_correct)::int),
        'previous_30', jsonb_build_object('attempts', count(*) filter (where t.answered_at < now() - interval '30 days')::int, 'correct', count(*) filter (where t.answered_at < now() - interval '30 days' and t.is_correct)::int))
      from public.question_attempts t join public.questions q on q.id = t.question_id and q.status <> 'annulled'
      where t.user_id = v_user and t.answered_at >= now() - interval '60 days'),
    'reviews', jsonb_build_object('due', (select count(*)::int from public.tutor_reviews r where r.user_id = v_user and r.due_at <= now()),
                                  'scheduled', (select count(*)::int from public.tutor_reviews r where r.user_id = v_user)),
    'tutor', (select jsonb_build_object(
        'answers', count(*)::int, 'correct', count(*) filter (where a.is_correct)::int,
        'lucky_guesses', count(*) filter (where a.lucky_guess)::int, 'with_heavy_hints', count(*) filter (where a.heavy_hints)::int,
        'wrong_but_sure', count(*) filter (where a.outcome = 'priority')::int, 'avg_hints', round(coalesce(avg(a.hints_used), 0), 1),
        'error_classes', v_err)
      from public.tutor_answers a where a.user_id = v_user),
    'sessions', (select jsonb_build_object('count', count(*)::int,
        'minutes', coalesce(round(sum(coalesce(s.duration_seconds, extract(epoch from (s.last_message_at - s.created_at))::int)) / 60.0), 0)::int,
        'voice_minutes', coalesce(round(sum(s.voice_seconds) / 60.0), 0)::int,
        'questions_discussed', (select count(distinct a.question_id)::int from public.tutor_answers a where a.user_id = v_user))
      from public.tutor_sessions s where s.user_id = v_user),
    'error_types', v_err,
    'recurrent_errors', coalesce((select jsonb_agg(jsonb_build_object('error_type', r.error_type, 'knowledge_gap', r.gap, 'times', r.n) order by r.n desc)
        from (select error_type, max(knowledge_gap) gap, count(*)::int n from public.student_error_events where user_id = v_user and resolved_at is null
              group by error_type, coalesce(knowledge_gap, '') having count(*) >= 2 order by count(*) desc limit 6) r), '[]'::jsonb),
    'recent_errors', coalesce((select jsonb_agg(jsonb_build_object('error_type', e.error_type, 'knowledge_gap', e.knowledge_gap, 'theme', e.theme, 'question_id', e.question_id, 'at', e.occurred_at, 'resolved', e.resolved_at is not null) order by e.occurred_at desc)
        from (select * from public.student_error_events where user_id = v_user order by occurred_at desc limit 8) e), '[]'::jsonb),
    'insights', v_insights);
end
$$;

-- ---------------------------------------------------------------- servidor (só chave de serviço)
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
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'params', t.params, 'style_notes', t.style_notes, 'examples', to_jsonb(t.examples), 'examples_strong', to_jsonb(t.examples_strong), 'voice', t.voice)
                    from public.tutor_personalities t where t.id = s.personality_id),
    'student', (select jsonb_build_object('first_name', nullif(split_part(btrim(p.name), ' ', 1), ''), 'phase', p.phase, 'days_to_exam', case when p.exam_date is not null then p.exam_date - current_date end)
                from public.profiles p where p.id = p_user),
    'mastery', public.tutor_mastery(p_user),
    'memory', public.tutor_learning_memory(p_user, s.settings ->> 'area', null),
    'recent_results', coalesce((select jsonb_agg(x.ok order by x.answered_at) from (
        select a.is_correct and not a.lucky_guess and not a.heavy_hints as ok, a.answered_at from public.tutor_answers a where a.session_id = s.id order by a.answered_at desc limit 3) x), '[]'::jsonb),
    'session_errors', coalesce((select jsonb_agg(jsonb_build_object('error_type', e.error_type, 'question_id', e.question_id) order by e.id) from public.student_error_events e where e.session_id = s.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', h.role, 'content', h.content) order by h.id)
                 from (select * from public.tutor_messages m where m.session_id = s.id order by m.id desc limit 12) h), '[]'::jsonb),
    'question', case when s.question_id is not null then
        public.tutor_truth(s.question_id, case when v_answered then 'full' else 'hint' end) || jsonb_build_object(
          'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence, 'outcome', a.outcome, 'lucky_guess', a.lucky_guess, 'heavy_hints', a.heavy_hints, 'hints_used', a.hints_used, 'justification', a.justification)
                          from public.tutor_answers a where a.session_id = s.id and a.question_id = s.question_id order by a.answered_at desc limit 1),
          -- a última resposta do aluno a esta questão fora do Tutor (treino, simulado), só se a questão já está respondida/revelada aqui
          'practice_answer', case when v_answered then (select jsonb_build_object('selected', t.selected_option, 'is_correct', t.is_correct)
                          from public.question_attempts t where t.user_id = p_user and t.question_id = s.question_id order by t.answered_at desc, t.seq desc limit 1) end) end);
end
$$;

-- Reserva de uma interação de texto (antes de chamar a IA). Trava por aluno: dois aparelhos não passam do limite juntos.
create function public.ch_worker_tutor_text_reserve(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  e jsonb;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  e := public.tutor_entitlement(p_user);
  if not (e ->> 'can_text')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(e ->> 'block_reason', 'text_limit'), 'entitlement', e);
  end if;
  insert into public.ai_usage_ledger (user_id, session_id, feature, interactions, meta) values (p_user, p_session_id, 'tutor_text', 1, '{"reservation": true}') returning id into v_id;
  return jsonb_build_object('ok', true, 'reservation', v_id);
end
$$;

-- Devolve a interação reservada quando a IA falhou (o aluno não perde cota por erro do provedor).
create function public.ch_worker_tutor_text_release(p_user uuid, p_reservation bigint) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.ai_usage_ledger where id = p_reservation and user_id = p_user and interactions = 1)
     and not exists (select 1 from public.ai_usage_ledger where user_id = p_user and interactions = -1 and meta ->> 'releases' = p_reservation::text) then
    insert into public.ai_usage_ledger (user_id, session_id, feature, interactions, meta)
    select p_user, session_id, 'tutor_text', -1, jsonb_build_object('releases', p_reservation::text) from public.ai_usage_ledger where id = p_reservation;
  end if;
end
$$;

-- Registro de uso genérico (tokens de voz, avaliação, voz neural). Só o servidor escreve.
create function public.ch_worker_tutor_ledger(p_user uuid, p_session_id uuid, p_entry jsonb) returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare v_id bigint;
begin
  insert into public.ai_usage_ledger (user_id, session_id, feature, provider, model, input_text_tokens, output_text_tokens, input_audio_tokens, output_audio_tokens, cached_tokens,
                                      duration_seconds, characters, estimated_cost_usd, persona, mode, meta)
  values (p_user, p_session_id, p_entry ->> 'feature', left(p_entry ->> 'provider', 40), left(p_entry ->> 'model', 80),
          greatest(0, coalesce((p_entry ->> 'input_text_tokens')::int, 0)), greatest(0, coalesce((p_entry ->> 'output_text_tokens')::int, 0)),
          greatest(0, coalesce((p_entry ->> 'input_audio_tokens')::int, 0)), greatest(0, coalesce((p_entry ->> 'output_audio_tokens')::int, 0)),
          greatest(0, coalesce((p_entry ->> 'cached_tokens')::int, 0)), greatest(0, coalesce((p_entry ->> 'duration_seconds')::int, 0)),
          greatest(0, coalesce((p_entry ->> 'characters')::int, 0)), greatest(0, coalesce((p_entry ->> 'estimated_cost_usd')::numeric, 0)),
          (select s.personality_id from public.tutor_sessions s where s.id = p_session_id), (select s.mode from public.tutor_sessions s where s.id = p_session_id),
          coalesce(p_entry -> 'meta', '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$$;

-- Evento pedagógico: erro (vira student_error_events), acerto ou autocorreção. Devolve quantas vezes o mesmo erro já apareceu.
create function public.ch_worker_tutor_learning_event(p_user uuid, p_session_id uuid, p_event jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  q public.questions;
  v_q text;
  v_type text := p_event ->> 'error_type';
  v_gap text := left(nullif(btrim(p_event ->> 'knowledge_gap'), ''), 160);
  v_times integer := 0;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  v_q := coalesce(nullif(p_event ->> 'question_id', ''), s.question_id);
  if v_q is not null then select * into q from public.questions where id = v_q; end if;
  if p_event ->> 'kind' = 'error' and v_type is not null and v_type <> 'none' then
    insert into public.student_error_events (user_id, question_id, session_id, area, theme, subtheme, error_type, knowledge_gap, source, metadata)
    values (p_user, q.id, s.id, coalesce(q.area::text, s.settings ->> 'area'), coalesce(q.topic, s.topic, s.context_label), q.subtopic,
            case when v_type in ('knowledge_gap', 'interpretation_error', 'command_word_error', 'distractor_trap', 'outdated_guideline', 'calculation_error', 'priority_of_management',
                                 'diagnostic_reasoning', 'therapeutic_reasoning', 'memory_failure', 'attention_error', 'changed_correct_answer') then v_type else 'unknown' end,
            v_gap, case when p_event ->> 'source' = 'tutor_voice' then 'tutor_voice' else 'tutor_text' end,
            coalesce(p_event -> 'metadata', '{}'::jsonb));
    -- a classificação também fica na última resposta da questão (a tela antiga de relatório lê dali)
    if q.id is not null then
      update public.tutor_answers a set error_class = v_type
      where a.id = (select x.id from public.tutor_answers x where x.session_id = s.id and x.question_id = q.id order by x.answered_at desc limit 1) and not a.is_correct;
    end if;
    select count(*)::int into v_times from public.student_error_events
    where user_id = p_user and error_type = v_type and coalesce(knowledge_gap, '') = coalesce(v_gap, '') and resolved_at is null;
  elsif p_event ->> 'kind' = 'correct' and q.id is not null then
    update public.student_error_events set resolved_at = now() where user_id = p_user and question_id = q.id and resolved_at is null;
  end if;
  return jsonb_build_object('times', v_times);
end
$$;

-- Troca do turno de texto: grava as falas, o uso real (tokens e custo), o estado emocional e, no primeiro uso, começa o teste.
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
    insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, p_user, 'tutor', left(p_tutor, 6000), coalesce(p_meta, '{}'::jsonb) - 'emotion' - 'evaluation' - 'learning_event') returning id into v_id;
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

-- A voz neural (TTS) agora registra no ledger; ai_usage segue somando pelo gatilho.
create or replace function public.ch_worker_tutor_voice_charge(p_user uuid, p_chars integer, p_cost numeric) returns integer
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ai_usage_ledger (user_id, feature, characters, estimated_cost_usd) values (p_user, 'tutor_tts', greatest(p_chars, 0), greatest(coalesce(p_cost, 0), 0));
  return coalesce((select u.voice_chars from public.ai_usage u where u.user_id = p_user and u.day = (now() at time zone 'America/Sao_Paulo')::date), 0);
end
$$;

-- ---------------------------------------------------------------- voz em tempo real: reserva, renovação, fim e expiração
-- Começa uma chamada: confere o direito, o saldo e se não há outra voz aberta; reserva uma janela curta de uso.
create function public.ch_worker_tutor_voice_start(p_user uuid, p_session_id uuid, p_force boolean, p_model text) returns jsonb
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
  update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = 'timeout',
    consumed_seconds = greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int
  where user_id = p_user and status = 'active' and lease_until < now();
  select * into v_old from public.tutor_voice_calls where user_id = p_user and status = 'active';
  if found then
    if not coalesce(p_force, false) then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
    update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'replaced',
      consumed_seconds = greatest(1, ceil(extract(epoch from (least(now(), lease_until) - started_at))))::int
    where id = v_old.id;
    insert into public.ai_usage_ledger (user_id, session_id, feature, duration_seconds, meta)
    select p_user, v_old.session_id, 'tutor_voice', v.consumed_seconds, jsonb_build_object('voice_call', v_old.id) from public.tutor_voice_calls v where v.id = v_old.id;
    update public.tutor_sessions set voice_seconds = voice_seconds + (select v.consumed_seconds from public.tutor_voice_calls v where v.id = v_old.id) where id = v_old.session_id;
  end if;
  e := public.tutor_entitlement(p_user);
  if not (e ->> 'can_voice')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(e ->> 'block_reason', case when not c.voice_enabled then 'voice_disabled' else 'voice_quota' end), 'entitlement', e);
  end if;
  v_left := (e #>> '{voice,remaining_s}')::int;
  if v_left < 15 then return jsonb_build_object('ok', false, 'reason', 'voice_quota', 'entitlement', e); end if;
  v_lease := least(c.voice_lease_seconds, v_left);
  insert into public.tutor_voice_calls (user_id, session_id, model, lease_until) values (p_user, s.id, left(p_model, 80), now() + make_interval(secs => v_lease)) returning id into v_id;
  perform public.tutor_begin_trial(p_user);
  return jsonb_build_object('ok', true, 'voice_call_id', v_id, 'lease_seconds', v_lease, 'replaced_call_id', v_old.call_id,
                            'entitlement', public.tutor_entitlement(p_user));
end
$$;

-- Renovação (o aplicativo pede a cada ~minuto): conta o tempo real até agora e reserva mais uma janela se houver saldo.
create function public.ch_worker_tutor_voice_renew(p_user uuid, p_voice_call uuid, p_call_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  v public.tutor_voice_calls;
  e jsonb;
  v_left integer;
  v_lease integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || p_user::text, 0));
  select * into c from public.tutor_config;
  select * into v from public.tutor_voice_calls where id = p_voice_call and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'stop', true, 'reason', 'not_found'); end if;
  if v.status <> 'active' then return jsonb_build_object('ok', false, 'stop', true, 'reason', coalesce(v.termination_reason, v.status), 'call_id', v.call_id); end if;
  if v.lease_until < now() - interval '15 seconds' then
    update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = 'timeout',
      consumed_seconds = greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int where id = v.id;
    insert into public.ai_usage_ledger (user_id, session_id, feature, duration_seconds, meta)
    values (p_user, v.session_id, 'tutor_voice', greatest(0, ceil(extract(epoch from (v.lease_until - v.started_at))))::int, jsonb_build_object('voice_call', v.id));
    return jsonb_build_object('ok', false, 'stop', true, 'reason', 'timeout', 'call_id', coalesce(v.call_id, p_call_id));
  end if;
  -- por um instante, a reserva desta chamada vale só até agora: o saldo calculado é o real
  update public.tutor_voice_calls set lease_until = now(), call_id = coalesce(call_id, case when p_call_id ~ '^[A-Za-z0-9_-]{4,120}$' then p_call_id end) where id = v.id;
  e := public.tutor_entitlement(p_user);
  v_left := (e #>> '{voice,remaining_s}')::int;
  if not (e ->> 'can_voice')::boolean or v_left <= 0 then
    perform public.ch_worker_tutor_voice_end(p_user, v.id, 'quota');
    return jsonb_build_object('ok', false, 'stop', true, 'reason', 'quota', 'call_id', coalesce(v.call_id, p_call_id), 'entitlement', public.tutor_entitlement(p_user));
  end if;
  v_lease := least(c.voice_lease_seconds, v_left);
  update public.tutor_voice_calls set lease_until = now() + make_interval(secs => v_lease) where id = v.id;
  e := public.tutor_entitlement(p_user);
  return jsonb_build_object('ok', true, 'lease_seconds', v_lease, 'remaining_s', v_left, 'warn', v_left <= 120, 'entitlement', e);
end
$$;

-- Fim da chamada: conta o tempo real (nunca além da reserva), registra no ledger e soma na sessão.
create function public.ch_worker_tutor_voice_end(p_user uuid, p_voice_call uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.tutor_voice_calls;
  v_secs integer;
begin
  select * into v from public.tutor_voice_calls where id = p_voice_call and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false); end if;
  if v.status <> 'active' then return jsonb_build_object('ok', true, 'consumed_seconds', v.consumed_seconds, 'call_id', v.call_id, 'already', true); end if;
  -- chamada que nunca chegou a conectar (falha ao abrir a voz) não cobra; o resto conta o tempo real, nunca além da reserva
  v_secs := case when p_reason = 'error' and v.call_id is null then 0 else greatest(1, ceil(extract(epoch from (least(now(), v.lease_until) - v.started_at))))::int end;
  update public.tutor_voice_calls set status = 'ended', ended_at = now(), consumed_seconds = v_secs,
    termination_reason = case when p_reason in ('student', 'timeout', 'quota', 'replaced', 'error', 'session_closed') then p_reason else 'student' end
  where id = v.id;
  insert into public.ai_usage_ledger (user_id, session_id, feature, model, duration_seconds, meta)
  values (p_user, v.session_id, 'tutor_voice', v.model, v_secs, jsonb_build_object('voice_call', v.id, 'reason', p_reason));
  update public.tutor_sessions set voice_seconds = voice_seconds + v_secs, last_message_at = greatest(last_message_at, now()) where id = v.session_id;
  return jsonb_build_object('ok', true, 'consumed_seconds', v_secs, 'call_id', v.call_id);
end
$$;

-- Varredura do servidor: chamadas sem renovação passam a "expiradas" (contam até o fim da reserva) e o servidor as desliga.
create function public.ch_worker_tutor_voice_expire() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  with gone as (
    update public.tutor_voice_calls set status = 'expired', ended_at = lease_until, termination_reason = 'timeout',
      consumed_seconds = greatest(0, ceil(extract(epoch from (lease_until - started_at))))::int
    where status = 'active' and lease_until < now() - interval '15 seconds'
    returning id, user_id, session_id, call_id, consumed_seconds),
  led as (
    insert into public.ai_usage_ledger (user_id, session_id, feature, duration_seconds, meta)
    select user_id, session_id, 'tutor_voice', consumed_seconds, jsonb_build_object('voice_call', id, 'reason', 'timeout') from gone returning 1),
  ses as (
    update public.tutor_sessions s set voice_seconds = s.voice_seconds + g.n from (select session_id, sum(consumed_seconds)::int n from gone group by session_id) g where s.id = g.session_id returning 1)
  select coalesce(jsonb_agg(call_id) filter (where call_id is not null), '[]'::jsonb) into v_out from gone;
  return v_out;
end
$$;

-- O que a voz pode consultar (ferramentas): a questão da sessão, no nível que o estado dela permite.
create function public.ch_worker_tutor_tool_question(p_user uuid, p_session_id uuid, p_reveal boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.question_id is null then return null; end if;
  if coalesce(p_reveal, false) and s.question_state = 'open' then
    -- o aluno pediu a resolução: a questão sai como "revelada" (não conta no histórico como acerto)
    update public.tutor_sessions set question_state = 'revealed', hint_level = 5, last_message_at = now() where id = s.id;
    s.question_state := 'revealed';
  end if;
  return public.tutor_truth(s.question_id, case when s.question_state in ('answered', 'revealed') then 'full' else 'open' end)
         || jsonb_build_object('state', s.question_state,
              'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence)
                              from public.tutor_answers a where a.session_id = s.id and a.question_id = s.question_id order by a.answered_at desc limit 1));
end
$$;

create function public.ch_worker_tutor_voice_call(p_user uuid, p_voice_call uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', v.id, 'session_id', v.session_id, 'status', v.status, 'model', v.model, 'call_id', v.call_id, 'lease_until', v.lease_until)
  from public.tutor_voice_calls v where v.id = p_voice_call and v.user_id = p_user
$$;

create function public.ch_worker_tutor_set_emotion(p_user uuid, p_session_id uuid, p_emotion jsonb) returns void
  language sql security definer set search_path = ''
as $$
  update public.tutor_sessions set emotion = p_emotion where id = p_session_id and user_id = p_user and jsonb_typeof(p_emotion) = 'object'
$$;

create function public.ch_worker_tutor_memory(p_user uuid, p_area text, p_theme text) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select public.tutor_learning_memory(p_user, p_area, p_theme) $$;

-- Responder pela voz: o servidor chama a mesma correção do banco, como o aluno.
create function public.ch_worker_tutor_answer_as(p_user uuid, p_session_id uuid, p_option text, p_confidence integer) returns jsonb
  language sql security definer set search_path = ''
as $$ select public.tutor_answer_for(p_user, p_session_id, p_option, p_confidence) $$;

create function public.ch_worker_tutor_next_as(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  v := public.tutor_next_for(p_user, p_session_id);
  return jsonb_build_object('question', public.tutor_truth(v ->> 'question_id', 'open'),
                            'opening', (select m.content from public.tutor_messages m where m.session_id = p_session_id order by m.id desc limit 1));
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
    'sessions', (select count(*)::int from public.tutor_sessions));
end
$$;

create or replace function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_old jsonb;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
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
    updated_at = now(), updated_by = (select auth.uid());
  update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c
   where (case p.profanity when 'off' then 0 when 'mild' then 1 else 2 end) > (case c.max_profanity when 'off' then 0 when 'mild' then 1 else 2 end);
  perform public.admin_log('tutor.config', 'tutor', jsonb_build_object('from', v_old, 'to', p_config, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_config();
end
$$;

do $revoke$
begin
  revoke execute on function public.ai_usage_ledger_guard() from public, anon, authenticated;
  revoke execute on function public.ai_usage_ledger_rollup() from public, anon, authenticated;
  revoke execute on function public.student_error_events_resolve() from public, anon, authenticated;
  revoke execute on function public.tutor_voice_seconds(uuid, date, timestamptz) from public, anon, authenticated;
  revoke execute on function public.tutor_entitlement(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_begin_trial(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_truth(text, text) from public, anon, authenticated;
  revoke execute on function public.tutor_learning_memory(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.tutor_session_summary(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_pick_question(uuid, text, smallint, text[], text) from public, anon, authenticated;
  revoke execute on function public.tutor_next_for(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_answer_for(uuid, uuid, text, integer) from public, anon, authenticated;
  revoke execute on function public.app_tutor_status() from public, anon;
  revoke execute on function public.app_tutor_save_preferences(jsonb) from public, anon;
  revoke execute on function public.app_tutor_start(text, text, text, jsonb) from public, anon;
  revoke execute on function public.app_tutor_next_question(uuid) from public, anon;
  revoke execute on function public.app_tutor_answer(uuid, text, integer) from public, anon;
  revoke execute on function public.app_tutor_session(uuid) from public, anon;
  revoke execute on function public.app_tutor_sessions(integer) from public, anon;
  revoke execute on function public.app_tutor_close(uuid) from public, anon;
  revoke execute on function public.app_tutor_report() from public, anon;
  revoke execute on function public.app_admin_tutor_config() from public, anon;
  revoke execute on function public.app_admin_tutor_save_config(jsonb, text) from public, anon;
  revoke execute on function public.ch_worker_tutor_context(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_text_reserve(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_text_release(uuid, bigint) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_ledger(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_learning_event(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_append(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_charge(uuid, integer, numeric) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_start(uuid, uuid, boolean, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_renew(uuid, uuid, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_end(uuid, uuid, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_expire() from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_tool_question(uuid, uuid, boolean) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_memory(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_call(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_set_emotion(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_answer_as(uuid, uuid, text, integer) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_next_as(uuid, uuid) from public, anon, authenticated;
end
$revoke$;
