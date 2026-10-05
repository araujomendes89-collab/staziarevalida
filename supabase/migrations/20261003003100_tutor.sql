-- =============================================================================
-- Stazia Tutor: professor de IA com personalidade, memória e avaliação contínua.
--
-- Duas camadas que nunca se misturam:
--   NÚCLEO CIENTÍFICO (imutável, no servidor)  o que é fato, gabarito, fonte e segurança
--   PERSONALIDADE (dados desta migração)        só o jeito de falar: tom, humor, cobrança
--
-- Regras de banco:
--   * o Tutor nasce DESLIGADO (custa por mensagem): só administrador liga, com limite diário por aluno;
--   * mensagens só são gravadas pelo servidor (funções ch_worker_tutor_*); o aluno lê só as próprias;
--   * a resposta de uma questão é corrigida pelo banco (gabarito oficial), nunca pela IA;
--   * o que o aluno responde no Tutor conta no histórico normal (question_attempts), menos quando a resposta foi revelada antes.
-- =============================================================================

-- ---------------------------------------------------------------- personalidades (parâmetros, não prompts)
create table public.tutor_personalities (
  id text primary key check (id ~ '^[a-z_]{3,24}$'),
  name text not null,
  emoji text not null,
  tagline text not null,
  -- 0 a 100: humor, sarcasm, friendliness, strictness, profanity, patience, verbosity, socratic_level, motivation, clinical_pressure
  params jsonb not null,
  style_notes text not null,                 -- o jeito do personagem (nunca conteúdo médico)
  openings text[] not null check (cardinality(openings) > 0),
  voice jsonb not null default '{}'::jsonb,  -- voz: rate (velocidade) e pitch (tom) de 0.5 a 2, e o estilo em palavras
  position smallint not null default 0,
  active boolean not null default true
);
alter table public.tutor_personalities enable row level security;
create policy "personalidades do tutor: logados leem as ativas" on public.tutor_personalities for select to authenticated using (active or public.is_staff());

insert into public.tutor_personalities (id, name, emoji, tagline, params, style_notes, openings, voice, position) values
('amigavel', 'Professor Amigável', '🙂', 'Calmo, paciente e didático',
 '{"humor":35,"sarcasm":5,"friendliness":95,"strictness":30,"profanity":0,"patience":95,"verbosity":60,"socratic_level":50,"motivation":70,"clinical_pressure":20}',
 'Calmo, acolhedor e didático. Explica sem pressionar, reconhece progresso real e corrige com tranquilidade. Linguagem clara, perguntas progressivas. Reduz a ansiedade diante do erro.',
 array['Que bom te ver por aqui. O que você quer estudar hoje?', 'Vamos com calma e no seu ritmo. Por onde começamos?', 'Pronto para mais um pouco? Escolhe o tema que eu te acompanho.'],
 '{"rate":0.95,"pitch":1.05,"style":"calma"}', 1),
('rabugento', 'Professor Rabugento', '😠', 'Resmunga, mas ensina',
 '{"humor":65,"sarcasm":55,"friendliness":30,"strictness":80,"profanity":0,"patience":35,"verbosity":45,"socratic_level":70,"motivation":40,"clinical_pressure":60}',
 'Professor experiente, sempre levemente irritado com erro básico. Resmunga, cobra atenção, provoca com ironia leve e impaciência teatral, exige justificativa. O resmungo é contra o erro, nunca contra a pessoa.',
 array['Finalmente apareceu. Antes de começarmos: o que você quer estudar hoje?', 'Ah, você. Vamos logo, que a prova não espera. Qual é o tema?', 'Sentou? Ótimo. Diga o assunto antes que eu mude de ideia.'],
 '{"rate":1.0,"pitch":0.85,"style":"grave, leve impaciência"}', 2),
('xingao', 'Professor Xingão', '🤬', 'Irreverente, direto e intenso',
 '{"humor":80,"sarcasm":65,"friendliness":55,"strictness":75,"profanity":65,"patience":45,"verbosity":45,"socratic_level":60,"motivation":65,"clinical_pressure":70}',
 'Irreverente, direto e intenso, do tipo que torce pelo aluno aos berros. Linguagem bem coloquial. Quando o aluno liberar, usa palavrão como ênfase bem-humorada, nunca como agressão.',
 array['Bora, que hoje a gente resolve isso. Qual é o tema?', 'Chegou a hora de parar de enrolar. O que vamos estudar?', 'Senta aí e me diz: qual assunto está te dando trabalho?'],
 '{"rate":1.15,"pitch":1.0,"style":"enérgica"}', 3),
('mal_humorado', 'Professor Mal-Humorado', '😒', 'Parece não querer estar ali',
 '{"humor":45,"sarcasm":60,"friendliness":20,"strictness":65,"profanity":0,"patience":30,"verbosity":30,"socratic_level":45,"motivation":25,"clinical_pressure":45}',
 'Parece não querer estar ali, mas ensina muito bem. Respostas secas, comentário irônico, impaciência teatral e nível técnico alto.',
 array['Certo. Vamos lá. Qual é o tema de hoje?', 'Mais um dia, mais um assunto. Diga qual.', 'Estou aqui. Escolha o tema e vamos terminar com isso.'],
 '{"rate":0.95,"pitch":0.85,"style":"seca"}', 4),
('preguicoso', 'Professor Preguiçoso', '😴', 'Faz você pensar para não ter trabalho',
 '{"humor":55,"sarcasm":40,"friendliness":50,"strictness":35,"profanity":0,"patience":60,"verbosity":20,"socratic_level":85,"motivation":30,"clinical_pressure":15}',
 'Age como se explicar desse trabalho demais. Devolve a pergunta, brinca que o aluno consegue resolver sozinho e só explica por completo quando é preciso. Depois da provocação, conduz o raciocínio passo a passo.',
 array['Tá... vamos estudar. Escolhe um tema porque eu não vou escolher tudo por você.', 'Você escolhe o assunto, eu faço o mínimo necessário. Combinado?', 'Pode começar. Qual é o tema? Eu acompanho daqui.'],
 '{"rate":0.85,"pitch":0.95,"style":"lenta"}', 5),
('socratico', 'Professor Socrático', '🧠', 'Conduz por perguntas',
 '{"humor":20,"sarcasm":10,"friendliness":65,"strictness":55,"profanity":0,"patience":85,"verbosity":40,"socratic_level":100,"motivation":50,"clinical_pressure":30}',
 'Nunca entrega a resposta de imediato: conduz por perguntas curtas, uma de cada vez. Só revela quando o aluno responde, pede explicitamente, erra repetidas vezes ou está em revisão rápida.',
 array['Antes de eu dizer qualquer coisa: o que você quer entender hoje?', 'Qual tema vamos investigar juntos?', 'Comece me dizendo o assunto e o que você já sabe sobre ele.'],
 '{"rate":0.95,"pitch":1.0,"style":"pausada"}', 6),
('preceptor', 'Preceptor de Plantão', '🚑', 'Clínico, com pressão de tempo',
 '{"humor":20,"sarcasm":15,"friendliness":50,"strictness":80,"profanity":0,"patience":45,"verbosity":35,"socratic_level":60,"motivation":55,"clinical_pressure":95}',
 'Altamente clínico. Cobra prioridade e decisão: risco imediato, estabilização, investigação, tratamento, reavaliação. Fala como quem está no plantão, sem enrolar.',
 array['Plantão começou. Qual tema você quer treinar?', 'Sem tempo a perder: qual assunto vamos atender hoje?', 'Vamos ao que interessa. Diga a área e o tema.'],
 '{"rate":1.1,"pitch":0.95,"style":"objetiva"}', 7),
('examinador', 'Examinador do Revalida', '📋', 'Formal, neutro e objetivo',
 '{"humor":0,"sarcasm":0,"friendliness":35,"strictness":85,"profanity":0,"patience":60,"verbosity":20,"socratic_level":30,"motivation":10,"clinical_pressure":75}',
 'Tom formal, neutro e objetivo, como em banca. Não dá pista indevida. Avalia de forma estruturada.',
 array['Informe a área ou o tema para iniciar.', 'Bom dia. Indique o assunto que deseja treinar.', 'Podemos começar. Qual é o tema?'],
 '{"rate":1.0,"pitch":1.0,"style":"neutra"}', 8),
('militar', 'Professor Militar', '🪖', 'Disciplina, metas e precisão',
 '{"humor":10,"sarcasm":10,"friendliness":30,"strictness":95,"profanity":0,"patience":30,"verbosity":15,"socratic_level":40,"motivation":60,"clinical_pressure":80}',
 'Disciplinador. Respostas curtas, metas, cobrança, repetição e precisão. Sem humilhação.',
 array['Em posição. Qual é o tema de hoje?', 'Missão do dia: diga o assunto.', 'Atenção. Informe o tema e começamos.'],
 '{"rate":1.1,"pitch":0.9,"style":"firme"}', 9),
('ansioso', 'Professor Ansioso', '😰', 'Cômico, sempre de olho no calendário',
 '{"humor":70,"sarcasm":20,"friendliness":70,"strictness":55,"profanity":0,"patience":50,"verbosity":55,"socratic_level":45,"motivation":65,"clinical_pressure":60}',
 'Cômico, parece sempre preocupado com a proximidade da prova, mas logo se recompõe e resolve. O exagero é teatral: nunca alimenta ansiedade real do aluno.',
 array['Ai, que bom que você veio! Vamos, vamos: qual é o tema?', 'Certo, sem pânico. Respira. O que estudamos hoje?', 'A prova está chegando e nós vamos chegar antes. Qual assunto?'],
 '{"rate":1.2,"pitch":1.15,"style":"agitada"}', 10),
('sarcastico', 'Professor Sarcástico', '😏', 'Humor inteligente e ironia',
 '{"humor":75,"sarcasm":85,"friendliness":40,"strictness":60,"profanity":0,"patience":45,"verbosity":45,"socratic_level":55,"motivation":35,"clinical_pressure":45}',
 'Humor inteligente e ironia moderada, sempre apontada para o raciocínio torto, nunca para o aluno. O sarcasmo nunca vira hostilidade.',
 array['Olha quem resolveu estudar. Qual é a escolha de hoje?', 'Vamos fingir que isso vai ser fácil. Qual é o tema?', 'Surpreenda-me: que assunto você escolheu?'],
 '{"rate":1.0,"pitch":0.95,"style":"irônica"}', 11),
('nerd', 'Professor Nerd', '🤓', 'Ama fisiopatologia e o porquê de tudo',
 '{"humor":40,"sarcasm":15,"friendliness":70,"strictness":50,"profanity":0,"patience":80,"verbosity":90,"socratic_level":55,"motivation":55,"clinical_pressure":25}',
 'Ama mecanismos: fisiologia, fisiopatologia, farmacologia e a ligação entre os conceitos. Pergunta com frequência se o aluno quer saber por que aquilo acontece.',
 array['Ótimo, eu adoro esse momento. Qual tema vamos destrinchar?', 'Escolhe um assunto que eu te mostro por que ele funciona assim.', 'Pronto para ir até o mecanismo? Qual é o tema?'],
 '{"rate":1.05,"pitch":1.05,"style":"entusiasmada"}', 12),
('motivador', 'Professor Motivador', '🔥', 'Energia, metas e progresso real',
 '{"humor":45,"sarcasm":5,"friendliness":85,"strictness":55,"profanity":0,"patience":75,"verbosity":50,"socratic_level":50,"motivation":100,"clinical_pressure":45}',
 'Energético, estimula progressão e metas. Sem frase motivacional vazia: o elogio é sempre ligado a um desempenho concreto do aluno.',
 array['Vamos nessa. Qual tema você quer dominar hoje?', 'Mais um passo hoje. Qual é o assunto?', 'Bora construir isso. Me diz o tema.'],
 '{"rate":1.1,"pitch":1.1,"style":"animada"}', 13);

-- ---------------------------------------------------------------- configuração (uma linha)
create table public.tutor_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  requires_pro boolean not null default false,
  daily_message_limit integer not null default 40 check (daily_message_limit between 1 and 500),
  max_profanity text not null default 'moderate' check (max_profanity in ('off', 'mild', 'moderate')),
  voice_enabled boolean not null default true,            -- conversa por voz (fala do aluno e leitura da resposta no aparelho dele)
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.tutor_config (id) values (true);
alter table public.tutor_config enable row level security;
create policy "configuração do tutor: logados leem" on public.tutor_config for select to authenticated using (true);

-- ---------------------------------------------------------------- preferências do aluno
create table public.tutor_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  personality_id text not null default 'amigavel' references public.tutor_personalities (id),
  intensity smallint not null default 2 check (intensity between 1 and 5),
  humor smallint check (humor between 0 and 100),                                     -- nulo = o da personalidade
  explanation text not null default 'normal' check (explanation in ('short', 'normal', 'detailed', 'nerd')),
  strictness text not null default 'normal' check (strictness in ('low', 'normal', 'high', 'insane')),
  profanity text not null default 'off' check (profanity in ('off', 'mild', 'moderate')),
  adaptive boolean not null default true,                                              -- "Tutor Inteligente": ajusta a intensidade por um tempo, avisando
  updated_at timestamptz not null default now()
);
alter table public.tutor_preferences enable row level security;
create policy "preferências do tutor: ler as próprias" on public.tutor_preferences for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- conversas
create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('livre', 'aula', 'revisao', 'perguntas', 'questao', 'erros')),
  title text not null,
  topic text,
  question_id text references public.questions (id) on delete set null,
  question_state text not null default 'none' check (question_state in ('none', 'open', 'answered', 'revealed')),
  hint_level smallint not null default 0 check (hint_level between 0 and 5),
  personality_id text not null references public.tutor_personalities (id),
  intensity smallint not null check (intensity between 1 and 5),
  settings jsonb not null default '{}'::jsonb,           -- retrato das preferências no início (reprodutível)
  difficulty_level smallint not null default 3 check (difficulty_level between 1 and 10),
  streak_correct smallint not null default 0,
  streak_wrong smallint not null default 0,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index tutor_sessions_user_idx on public.tutor_sessions (user_id, last_message_at desc);
alter table public.tutor_sessions enable row level security;
create policy "conversas do tutor: ler as próprias" on public.tutor_sessions for select to authenticated using (user_id = (select auth.uid()));

create table public.tutor_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.tutor_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'tutor')),
  content text not null check (char_length(content) between 1 and 6000),
  meta jsonb not null default '{}'::jsonb,               -- base usada, citações, dica, tipo de erro, modelo, validação
  created_at timestamptz not null default now()
);
create index tutor_messages_session_idx on public.tutor_messages (session_id, id);
alter table public.tutor_messages enable row level security;
create policy "mensagens do tutor: ler as próprias" on public.tutor_messages for select to authenticated using (user_id = (select auth.uid()));

-- Respostas dadas dentro do Tutor (com confiança 0–5, dicas usadas e leitura do resultado).
create table public.tutor_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tutor_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id),
  selected_option char(1) not null check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean not null,
  confidence smallint check (confidence between 0 and 5),
  hints_used smallint not null default 0,
  -- consolidated: acerto com confiança alta · unstable: acerto com confiança baixa · priority: erro com confiança alta · known_gap: erro com confiança baixa
  outcome text not null check (outcome in ('consolidated', 'unstable', 'priority', 'known_gap', 'normal')),
  lucky_guess boolean not null default false,           -- acertou sem saber explicar / com confiança mínima
  heavy_hints boolean not null default false,           -- precisou de 3 dicas ou mais
  error_class text,                                     -- classificação do tutor (IA), só informativa
  justification text check (justification in ('OK', 'INSUFFICIENT')),
  answered_at timestamptz not null default now()
);
create index tutor_answers_user_idx on public.tutor_answers (user_id, answered_at desc);
alter table public.tutor_answers enable row level security;
create policy "respostas no tutor: ler as próprias" on public.tutor_answers for select to authenticated using (user_id = (select auth.uid()));

-- Revisão espaçada do que o aluno errou ou acertou sem firmeza: 1, 3, 7, 14 e 30 dias.
create table public.tutor_reviews (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  step smallint not null default 0 check (step between 0 and 4),
  due_at timestamptz not null,
  reason text not null check (reason in ('wrong', 'wrong_confident', 'lucky_guess', 'heavy_hints')),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index tutor_reviews_due_idx on public.tutor_reviews (user_id, due_at);
alter table public.tutor_reviews enable row level security;
create policy "revisões do tutor: ler as próprias" on public.tutor_reviews for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- apoio
create function public.tutor_is_pro(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin')
      or exists (select 1 from public.subscriptions s where s.user_id = p_user and s.plan in ('pro', 'elite') and s.status in ('active', 'past_due'))
$$;

create function public.tutor_usage_today(p_user uuid) returns integer
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select requests from public.ai_usage where user_id = p_user and day = (now() at time zone 'America/Sao_Paulo')::date), 0)
$$;

-- Domínio por grande área e por subárea, pelas respostas do aluno (menos de 5 respostas = sem dados).
create function public.tutor_mastery(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with att as (
    select q.area::text area, d.subarea, t.is_correct
    from public.question_attempts t join public.questions q on q.id = t.question_id and q.status <> 'annulled'
      left join public.question_dna d on d.question_id = q.id
    where t.user_id = p_user)
  select jsonb_build_object(
    'areas', coalesce((select jsonb_agg(jsonb_build_object('area', x.area, 'attempts', x.n, 'correct', x.c, 'accuracy', case when x.n > 0 then round(100.0 * x.c / x.n) end,
        'level', case when x.n < 5 then 'SEM_DADOS' when 100.0 * x.c / x.n >= 85 then 'DOMINADO' when 100.0 * x.c / x.n >= 70 then 'BOM'
                      when 100.0 * x.c / x.n >= 55 then 'INTERMEDIARIO' when 100.0 * x.c / x.n >= 40 then 'FRACO' else 'CRITICO' end) order by x.area)
      from (select a.area, count(t.is_correct)::int n, count(*) filter (where t.is_correct)::int c
            from (select unnest(enum_range(null::public.med_area))::text area) a left join att t on t.area = a.area group by a.area) x), '[]'::jsonb),
    'subareas', coalesce((select jsonb_agg(jsonb_build_object('area', x.area, 'subarea', x.subarea, 'attempts', x.n, 'accuracy', round(100.0 * x.c / x.n),
        'level', case when 100.0 * x.c / x.n >= 85 then 'DOMINADO' when 100.0 * x.c / x.n >= 70 then 'BOM' when 100.0 * x.c / x.n >= 55 then 'INTERMEDIARIO'
                      when 100.0 * x.c / x.n >= 40 then 'FRACO' else 'CRITICO' end) order by 100.0 * x.c / x.n, x.n desc)
      from (select area, subarea, count(*)::int n, count(*) filter (where is_correct)::int c from att where subarea is not null group by area, subarea having count(*) >= 5) x), '[]'::jsonb))
$$;

-- Próxima questão: revisão vencida primeiro (modo erros), depois o que o aluno errou e não superou, depois ponto fraco e, por fim, o que ainda não respondeu.
-- A dificuldade segue o nível da conversa (1–3 baixa, 4–6 moderada, 7–10 alta). Questões com figura ficam de fora do chat.
create function public.tutor_pick_question(p_user uuid, p_mode text, p_level smallint, p_exclude text[] default '{}') returns text
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

-- A questão como o aluno pode ver agora: sem gabarito enquanto estiver aberta; com a correção depois.
create function public.tutor_question_view(p_question_id text, p_state text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'number', q.number, 'area', q.area, 'topic', q.topic,
    'exam', (select jsonb_build_object('kind', x.kind, 'year', x.year, 'semester', x.semester) from public.exams x where x.id = q.exam_id),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'state', p_state,
    'correct_option', case when p_state in ('answered', 'revealed') then q.correct_option end)
  from public.questions q where q.id = p_question_id
$$;

-- ---------------------------------------------------------------- o aluno
create function public.app_tutor_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  c public.tutor_config;
  p public.tutor_preferences;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into c from public.tutor_config;
  select * into p from public.tutor_preferences where user_id = v_user;
  return jsonb_build_object(
    'enabled', c.enabled,
    'available', c.enabled and (not c.requires_pro or public.tutor_is_pro(v_user)),
    'requires_pro', c.requires_pro,
    'daily_limit', c.daily_message_limit, 'used_today', public.tutor_usage_today(v_user),
    'max_profanity', c.max_profanity, 'voice_enabled', c.voice_enabled,
    'preferences', case when p.user_id is null
      then jsonb_build_object('personality_id', 'amigavel', 'intensity', 2, 'humor', null, 'explanation', 'normal', 'strictness', 'normal', 'profanity', 'off', 'adaptive', true, 'chosen', false)
      else to_jsonb(p) - 'user_id' || jsonb_build_object('chosen', true) end,
    'personalities', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'swears', (t.params ->> 'profanity')::int > 0, 'voice', t.voice) order by t.position)
                      from public.tutor_personalities t where t.active),
    'reviews_due', (select count(*)::int from public.tutor_reviews r where r.user_id = v_user and r.due_at <= now()));
end
$$;

create function public.app_tutor_save_preferences(p_prefs jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_max text;
  v_prof text := coalesce(p_prefs ->> 'profanity', 'off');
  v_rank constant jsonb := '{"off":0,"mild":1,"moderate":2}';
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.tutor_personalities where id = p_prefs ->> 'personality_id' and active) then raise exception 'Professor não encontrado.' using errcode = '22023'; end if;
  select max_profanity into v_max from public.tutor_config;
  if not (v_rank ? v_prof) then raise exception 'Opção de palavrões inválida.' using errcode = '22023'; end if;
  if (v_rank ->> v_prof)::int > (v_rank ->> v_max)::int then raise exception 'Esse nível de palavrões não está liberado nesta plataforma.' using errcode = '22023'; end if;
  insert into public.tutor_preferences (user_id, personality_id, intensity, humor, explanation, strictness, profanity, adaptive, updated_at)
  values (v_user, p_prefs ->> 'personality_id', coalesce((p_prefs ->> 'intensity')::smallint, 2), nullif(p_prefs ->> 'humor', '')::smallint,
          coalesce(p_prefs ->> 'explanation', 'normal'), coalesce(p_prefs ->> 'strictness', 'normal'), v_prof, coalesce((p_prefs ->> 'adaptive')::boolean, true), now())
  on conflict (user_id) do update set personality_id = excluded.personality_id, intensity = excluded.intensity, humor = excluded.humor, explanation = excluded.explanation,
    strictness = excluded.strictness, profanity = excluded.profanity, adaptive = excluded.adaptive, updated_at = now();
  return (select to_jsonb(p) - 'user_id' from public.tutor_preferences p where p.user_id = v_user);
end
$$;

-- Nova conversa. A primeira fala é do repertório da personalidade (sem IA e sem conteúdo médico).
create function public.app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  c public.tutor_config;
  p public.tutor_preferences;
  t public.tutor_personalities;
  v_q text := nullif(p_question_id, '');
  v_id uuid;
  v_title text;
  v_open text;
  v_state text := 'none';
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into c from public.tutor_config;
  if not c.enabled then raise exception 'O Tutor ainda não está ligado.' using errcode = '55000'; end if;
  if c.requires_pro and not public.tutor_is_pro(v_user) then raise exception 'O Tutor faz parte dos planos pagos.' using errcode = '42501'; end if;
  if p_mode not in ('livre', 'aula', 'revisao', 'perguntas', 'questao', 'erros') then raise exception 'Modo inválido.' using errcode = '22023'; end if;
  select * into p from public.tutor_preferences where user_id = v_user;
  if not found then
    insert into public.tutor_preferences (user_id) values (v_user) returning * into p;
  end if;
  select * into t from public.tutor_personalities where id = p.personality_id;

  if p_mode in ('questao', 'erros') then
    v_q := coalesce(v_q, public.tutor_pick_question(v_user, p_mode, 3::smallint));
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

  v_title := left(coalesce(nullif(btrim(p_topic), ''), (select q.topic from public.questions q where q.id = v_q),
                  case p_mode when 'livre' then 'Conversa livre' when 'aula' then 'Aula' when 'revisao' then 'Revisão rápida' when 'perguntas' then 'Perguntas' when 'questao' then 'Questões' else 'Revisão de erros' end), 120);
  insert into public.tutor_sessions (user_id, mode, title, topic, question_id, question_state, personality_id, intensity, settings)
  values (v_user, p_mode, v_title, nullif(btrim(p_topic), ''), v_q, v_state, t.id, p.intensity,
          jsonb_build_object('humor', p.humor, 'explanation', p.explanation, 'strictness', p.strictness, 'profanity', p.profanity, 'adaptive', p.adaptive, 'params', t.params))
  returning id into v_id;
  -- abertura: escolhida de forma estável pela conversa (varia entre conversas, sem bordão fixo)
  v_open := t.openings[1 + (('x' || substr(md5(v_id::text), 1, 6))::bit(24)::int % cardinality(t.openings))];
  if p_mode in ('questao', 'erros') then
    v_open := case p_mode when 'erros' then 'Vamos rever uma questão que você errou.' else 'Vamos de questão.' end || ' Responda quando estiver pronto; se travar, peça uma dica.';
  elsif nullif(btrim(p_topic), '') is not null then
    v_open := 'Tema: ' || btrim(p_topic) || '. Por onde você quer começar?';
  end if;
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (v_id, v_user, 'tutor', v_open, jsonb_build_object('opening', true, 'grounding', 'none'));
  return public.app_tutor_session(v_id);
end
$$;

create function public.app_tutor_session(p_session_id uuid) returns jsonb
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
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'voice', t.voice) from public.tutor_personalities t where t.id = s.personality_id),
    'question', case when s.question_id is not null then public.tutor_question_view(s.question_id, s.question_state) end,
    'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence, 'outcome', a.outcome, 'lucky_guess', a.lucky_guess, 'heavy_hints', a.heavy_hints)
                    from public.tutor_answers a where a.session_id = s.id and a.question_id = s.question_id order by a.answered_at desc limit 1),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'at', m.created_at,
                  'grounding', m.meta ->> 'grounding', 'sources', m.meta -> 'sources', 'hint_level', m.meta -> 'hint_level', 'suggested', m.meta -> 'suggested', 'notice', m.meta ->> 'notice') order by m.id)
                from public.tutor_messages m where m.session_id = s.id), '[]'::jsonb));
end
$$;

create function public.app_tutor_sessions(p_limit integer default 20) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'mode', s.mode, 'status', s.status, 'last_message_at', s.last_message_at,
           'personality', (select t.emoji from public.tutor_personalities t where t.id = s.personality_id)) order by s.last_message_at desc), '[]'::jsonb)
  from (select * from public.tutor_sessions where user_id = (select auth.uid()) order by last_message_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) s
$$;

-- Resposta a uma questão dentro do Tutor. Quem corrige é o banco. Conta no histórico normal do aluno.
create function public.app_tutor_answer(p_session_id uuid, p_option text, p_confidence integer default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  s public.tutor_sessions;
  q public.questions;
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
  select * into s from public.tutor_sessions where id = p_session_id and user_id = v_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.question_id is null or s.question_state <> 'open' then raise exception 'Não há questão aberta nesta conversa.' using errcode = '22023'; end if;
  if p_option not in ('A', 'B', 'C', 'D') then raise exception 'Alternativa inválida.' using errcode = '22023'; end if;
  if p_confidence is not null and p_confidence not between 0 and 5 then raise exception 'Confiança de 0 a 5.' using errcode = '22023'; end if;
  select * into q from public.questions where id = s.question_id;
  v_ok := q.correct_option = p_option::char(1);
  v_heavy := s.hint_level >= 3;
  v_lucky := v_ok and p_confidence is not null and p_confidence <= 1;
  v_outcome := case when p_confidence is null then 'normal'
                    when v_ok and p_confidence >= 4 then 'consolidated' when v_ok and p_confidence <= 2 then 'unstable'
                    when not v_ok and p_confidence >= 4 then 'priority' when not v_ok and p_confidence <= 2 then 'known_gap' else 'normal' end;
  -- histórico normal do aluno (o gatilho do banco corrige; a confiança 0–5 vira a escala 1–3 daquela tabela)
  insert into public.question_attempts (user_id, question_id, selected_option, confidence)
  values (v_user, q.id, p_option::char(1), case when p_confidence is null then null when p_confidence <= 1 then 1 when p_confidence <= 3 then 2 else 3 end);
  insert into public.tutor_answers (session_id, user_id, question_id, selected_option, is_correct, confidence, hints_used, outcome, lucky_guess, heavy_hints)
  values (s.id, v_user, q.id, p_option::char(1), v_ok, p_confidence, s.hint_level, v_outcome, v_lucky, v_heavy);

  -- sequência e nível: só acerto limpo (sem chute e sem muita dica) sobe; dois erros seguidos descem dois níveis
  v_clean := v_ok and not v_lucky and not v_heavy;
  v_sc := case when v_clean then s.streak_correct + 1 else 0 end;
  v_sw := case when v_ok then 0 else s.streak_wrong + 1 end;
  v_level := s.difficulty_level;
  if v_sc >= 3 then v_level := least(v_level + 1, 10); v_sc := 0; end if;
  if v_sw >= 2 then v_level := greatest(v_level - 2, 1); v_sw := 0; end if;
  update public.tutor_sessions set question_state = 'answered', streak_correct = v_sc, streak_wrong = v_sw, difficulty_level = v_level, last_message_at = now() where id = s.id;

  -- revisão espaçada
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
    'difficulty_level', v_level, 'review_scheduled', v_reason is not null, 'correction', public.practice_correction_view(q.id, p_option));
end
$$;

-- Próxima questão da conversa (modos questão e erros).
create function public.app_tutor_next_question(p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  s public.tutor_sessions;
  v_q text;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = v_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.mode not in ('questao', 'erros') then raise exception 'Esta conversa não é de questões.' using errcode = '22023'; end if;
  if s.question_state = 'open' then raise exception 'Responda a questão atual antes de pedir a próxima.' using errcode = '22023'; end if;
  v_q := public.tutor_pick_question(v_user, s.mode, s.difficulty_level,
           array(select distinct a.question_id from public.tutor_answers a where a.session_id = s.id) || coalesce(array[s.question_id], '{}'));
  if v_q is null then raise exception '%', case when s.mode = 'erros' then 'Acabaram os erros para revisar agora.' else 'Não há mais questões disponíveis agora.' end using errcode = 'P0002'; end if;
  update public.tutor_sessions set question_id = v_q, question_state = 'open', hint_level = 0, last_message_at = now() where id = s.id;
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, v_user, 'tutor', 'Próxima questão.', jsonb_build_object('opening', true, 'grounding', 'none'));
  return public.app_tutor_session(s.id);
end
$$;

create function public.app_tutor_close(p_session_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.tutor_sessions set status = 'closed' where id = p_session_id and user_id = (select auth.uid());
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  return true;
end
$$;

-- Relatório do aluno. Sem "previsão de aprovação": não existe base para isso.
create function public.app_tutor_report() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  m jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  m := public.tutor_mastery(v_user);
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
        -- classificação feita pelo tutor (IA): serve de pista, não é diagnóstico revisado
        'error_classes', coalesce((select jsonb_object_agg(e.error_class, e.n) from (select error_class, count(*)::int n from public.tutor_answers where user_id = v_user and error_class is not null and error_class <> 'NONE' group by error_class) e), '{}'::jsonb))
      from public.tutor_answers a where a.user_id = v_user));
end
$$;

-- ---------------------------------------------------------------- servidor (só chave de serviço)
-- Tudo o que o Tutor precisa para montar a resposta: configuração, uso do dia, conversa, aluno, questão e base conferida.
create function public.ch_worker_tutor_context(p_user uuid, p_session_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  c public.tutor_config;
  q public.questions;
  v_answered boolean;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
  if not found then return null; end if;
  select * into c from public.tutor_config;
  if s.question_id is not null then select * into q from public.questions where id = s.question_id; end if;
  v_answered := s.question_state in ('answered', 'revealed');
  return jsonb_build_object(
    'config', jsonb_build_object('enabled', c.enabled, 'requires_pro', c.requires_pro, 'daily_limit', c.daily_message_limit, 'max_profanity', c.max_profanity),
    'is_pro', public.tutor_is_pro(p_user), 'used_today', public.tutor_usage_today(p_user),
    'session', jsonb_build_object('id', s.id, 'mode', s.mode, 'topic', s.topic, 'status', s.status, 'question_state', s.question_state, 'hint_level', s.hint_level, 'intensity', s.intensity,
                 'settings', s.settings, 'difficulty_level', s.difficulty_level, 'streak_correct', s.streak_correct, 'streak_wrong', s.streak_wrong),
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'params', t.params, 'style_notes', t.style_notes) from public.tutor_personalities t where t.id = s.personality_id),
    'student', (select jsonb_build_object('first_name', nullif(split_part(btrim(p.name), ' ', 1), ''), 'phase', p.phase, 'days_to_exam', case when p.exam_date is not null then p.exam_date - current_date end)
                from public.profiles p where p.id = p_user),
    'mastery', public.tutor_mastery(p_user),
    -- últimos resultados "limpos" desta conversa (acerto sem chute e sem muita dica), do mais antigo para o mais novo
    'recent_results', coalesce((select jsonb_agg(x.ok order by x.answered_at) from (
        select a.is_correct and not a.lucky_guess and not a.heavy_hints as ok, a.answered_at from public.tutor_answers a where a.session_id = s.id order by a.answered_at desc limit 3) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', h.role, 'content', h.content) order by h.id)
                 from (select * from public.tutor_messages m where m.session_id = s.id order by m.id desc limit 12) h), '[]'::jsonb),
    'question', case when q.id is not null then jsonb_build_object(
        'id', q.id, 'area', q.area, 'topic', q.topic, 'subtopic', q.subtopic, 'statement', q.statement,
        'exam', (select x.kind || ' ' || x.year from public.exams x where x.id = q.exam_id), 'number', q.number,
        'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text', 'explanation', nullif(btrim(o ->> 'explanation'), '')) order by o ->> 'id') from jsonb_array_elements(q.options) o),
        'official_answer', q.correct_option, 'expected_conduct', q.expected_conduct, 'inep_intent', q.inep_intent,
        'last_answer', (select jsonb_build_object('selected', a.selected_option, 'is_correct', a.is_correct, 'confidence', a.confidence, 'outcome', a.outcome, 'lucky_guess', a.lucky_guess, 'heavy_hints', a.heavy_hints, 'hints_used', a.hints_used, 'justification', a.justification)
                        from public.tutor_answers a where a.session_id = s.id and a.question_id = q.id order by a.answered_at desc limit 1),
        -- análise revisada por médico e cartão de atualização publicado (só entram depois de o aluno responder)
        'analysis', case when v_answered then (select jsonb_build_object('question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
                         'options', (select jsonb_agg(jsonb_build_object('option_id', o.option_id, 'reasoning', o.reasoning, 'why_wrong', o.why_wrong, 'trap', o.trap) order by o.option_id) from public.question_option_analysis o where o.analysis_id = a.id))
                       from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published') end,
        'update_card', case when v_answered then (select jsonb_build_object('official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'sources', k.sources)
                       from public.question_update_cards k where k.question_id = q.id and k.status = 'published') end) end);
end
$$;

-- Grava a troca (fala do aluno + resposta do tutor), o uso do dia e o que a resposta mudou na conversa.
create function public.ch_worker_tutor_append(p_user uuid, p_session_id uuid, p_student text, p_tutor text, p_meta jsonb, p_usage jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  v_id bigint;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if nullif(btrim(coalesce(p_student, '')), '') is not null then
    insert into public.tutor_messages (session_id, user_id, role, content) values (s.id, p_user, 'student', left(btrim(p_student), 6000));
  end if;
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, p_user, 'tutor', left(p_tutor, 6000), coalesce(p_meta, '{}'::jsonb)) returning id into v_id;
  update public.tutor_sessions set last_message_at = now(),
    hint_level = coalesce(nullif(p_meta ->> 'hint_level', '')::smallint, hint_level),
    question_state = case when coalesce((p_meta ->> 'reveals_answer')::boolean, false) and question_state = 'open' then 'revealed' else question_state end
   where id = s.id;
  -- a classificação do erro e a justificativa (opinião da IA) ficam na última resposta da questão
  if p_meta ? 'error_class' or p_meta ? 'justification' then
    update public.tutor_answers a set
      error_class = coalesce(nullif(p_meta ->> 'error_class', ''), a.error_class),
      justification = case when p_meta ->> 'justification' in ('OK', 'INSUFFICIENT') then p_meta ->> 'justification' else a.justification end,
      lucky_guess = case when p_meta ->> 'justification' = 'OK' then false when p_meta ->> 'justification' = 'INSUFFICIENT' and a.is_correct then true else a.lucky_guess end
    where a.id = (select x.id from public.tutor_answers x where x.session_id = s.id and x.question_id = s.question_id order by x.answered_at desc limit 1);
    -- explicou bem um acerto que parecia chute: a revisão marcada por chute sai
    if p_meta ->> 'justification' = 'OK' then
      delete from public.tutor_reviews where user_id = p_user and question_id = s.question_id and reason = 'lucky_guess';
    elsif p_meta ->> 'justification' = 'INSUFFICIENT' then
      insert into public.tutor_reviews (user_id, question_id, step, due_at, reason)
      select p_user, s.question_id, 0, now() + interval '1 day', 'lucky_guess'
      where exists (select 1 from public.tutor_answers x where x.session_id = s.id and x.question_id = s.question_id and x.is_correct)
      on conflict (user_id, question_id) do nothing;
    end if;
  end if;
  if coalesce((p_usage ->> 'calls')::int, 0) > 0 then
    insert into public.ai_usage (user_id, day, requests, input_tokens, output_tokens, cost_usd)
    values (p_user, v_day, 1, coalesce((p_usage ->> 'input_tokens')::bigint, 0), coalesce((p_usage ->> 'output_tokens')::bigint, 0), coalesce((p_usage ->> 'cost_usd')::numeric, 0))
    on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1, input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage.output_tokens + excluded.output_tokens, cost_usd = public.ai_usage.cost_usd + excluded.cost_usd;
  end if;
  return jsonb_build_object('id', v_id, 'used_today', public.tutor_usage_today(p_user));
end
$$;

-- ---------------------------------------------------------------- administrador
create function public.app_admin_tutor_config() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select to_jsonb(c) - 'id' from public.tutor_config c) || jsonb_build_object(
    'usage_30d', (select jsonb_build_object('students', count(distinct user_id)::int, 'requests', coalesce(sum(requests), 0)::int, 'input_tokens', coalesce(sum(input_tokens), 0)::bigint,
                         'output_tokens', coalesce(sum(output_tokens), 0)::bigint, 'cost_usd', coalesce(sum(cost_usd), 0))
                  from public.ai_usage where day >= current_date - 30),
    'sessions', (select count(*)::int from public.tutor_sessions));
end
$$;

create function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
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
    updated_at = now(), updated_by = (select auth.uid());
  -- quem tinha escolhido um nível acima do novo teto desce para o teto
  update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c
   where (case p.profanity when 'off' then 0 when 'mild' then 1 else 2 end) > (case c.max_profanity when 'off' then 0 when 'mild' then 1 else 2 end);
  perform public.admin_log('tutor.config', 'tutor', jsonb_build_object('from', v_old, 'to', p_config, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_config();
end
$$;

do $revoke$
begin
  revoke execute on function public.tutor_is_pro(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_usage_today(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_mastery(uuid) from public, anon, authenticated;
  revoke execute on function public.tutor_pick_question(uuid, text, smallint, text[]) from public, anon, authenticated;
  revoke execute on function public.tutor_question_view(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_context(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_append(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
  revoke execute on function public.app_tutor_status() from public, anon;
  revoke execute on function public.app_tutor_save_preferences(jsonb) from public, anon;
  revoke execute on function public.app_tutor_start(text, text, text) from public, anon;
  revoke execute on function public.app_tutor_session(uuid) from public, anon;
  revoke execute on function public.app_tutor_sessions(integer) from public, anon;
  revoke execute on function public.app_tutor_answer(uuid, text, integer) from public, anon;
  revoke execute on function public.app_tutor_next_question(uuid) from public, anon;
  revoke execute on function public.app_tutor_close(uuid) from public, anon;
  revoke execute on function public.app_tutor_report() from public, anon;
  revoke execute on function public.app_admin_tutor_config() from public, anon;
  revoke execute on function public.app_admin_tutor_save_config(jsonb, text) from public, anon;
end
$revoke$;
