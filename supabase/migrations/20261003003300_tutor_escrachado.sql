-- =============================================================================
-- Stazia Tutor: personagem carregado. O dono testou de novo: "ainda está muito robótica (...) não estou escutando xingamento,
-- não estou vendo a personalidade pesada, mal-humorada, seja muito escrachado", e decidiu: palavrão pode ir pra cima do aluno,
-- "porém não pesada".
--
-- O que muda (o núcleo científico e a conferência por software continuam os mesmos):
--   * Rabugento, Xingão e Mal-Humorado ficam bem mais pesados (jeito, parâmetros, falas) e os três passam a poder xingar;
--     o Sarcástico fica mais ácido, sem palavrão;
--   * cada um ganha a versão COM palavrão das falas de referência e das aberturas (examples_strong, lines_strong), usada só
--     quando o palavrão está liberado de verdade: o personagem xinga, o aluno liberou e a plataforma permite;
--   * a intensidade padrão sobe de 2 para 3 (na 2 o personagem era amaciado; quem estava no padrão antigo sobe junto);
--   * "xinga" passa a ser parâmetro de palavrão a partir de 20, o mesmo corte do servidor; "boca suja" (a partir de 80, hoje só o
--     Xingão) é o personagem em que o palavrão já vem marcado quando o aluno o escolhe, e o aluno pode baixar.
-- Nenhuma fala tem conteúdo médico. Xingamento pesado contra a pessoa, insulto à inteligência e preconceito seguem barrados
-- pelo servidor (server/tutor/safety.ts) em qualquer nível.
-- =============================================================================

alter table public.tutor_personalities add column examples_strong text[] not null default '{}';
alter table public.tutor_personalities add column lines_strong jsonb not null default '{}'::jsonb;   -- {opening, question, review, next, topic}

update public.tutor_personalities set
  tagline = 'Resmunga de tudo, e ensina',
  params = '{"humor": 60, "sarcasm": 65, "friendliness": 15, "strictness": 85, "profanity": 55, "patience": 15, "verbosity": 50, "socratic_level": 65, "motivation": 30, "clinical_pressure": 60}'::jsonb,
  style_notes = 'Professor velho de guerra, rabugento de carteirinha. Resmunga de tudo: do erro básico, da pressa, da preguiça de ler o enunciado, da vida. Reclama em voz alta, bufa, faz drama, compara com «o meu tempo», cobra o porquê e não deixa passar resposta pela metade. Elogio sai a contragosto. Por baixo do resmungo, ensina com capricho e não larga o aluno.',
  openings = array['Ah, você. Senta aí e não me enrola: qual é o tema?', 'Finalmente apareceu. Diz logo o que vai estudar, que eu não tenho o dia todo.', 'Lá vem você de novo. Tá, tá. Qual é o assunto?'],
  examples = array['De novo isso? Francamente. Senta aí que eu explico.', 'Você leu o enunciado ou adivinhou?', 'Ô teimosia. Olha o caso de novo.', 'Chegou na resposta, depois de dar três voltas no hospital.', 'Acertou. Até que enfim. Não precisa fazer festa.', 'No meu tempo a gente lia a questão até o fim.'],
  lines = '{"question": ["Tá aí a questão. Lê até o fim antes de sair marcando, pelo amor de Deus.", "Vamos ver se hoje você lê o enunciado. Tá aí.", "Questão na mesa. E sem chutar, que eu percebo."], "review": ["Essa você já errou. Vamos acertar as contas com ela.", "Olha quem voltou: a questão que te derrubou. De novo, e com atenção dessa vez.", "Errou essa outro dia. Não me faça passar por isso duas vezes."], "next": ["Próxima. E lê o enunciado inteiro dessa vez.", "Mais uma. Anda, que eu não tenho o dia todo.", "Outra. Vamos ver quanto tempo você aguenta sem chutar."], "topic": ["{tema}, é? Tá. Me diz o que você já sabe, pra eu ver o tamanho do estrago.", "{tema}. Certo. Começa me contando o que você lembra, se é que lembra."]}'::jsonb,
  examples_strong = array['Mas que porra é essa que você marcou? Senta aí que eu explico.', 'No meu tempo a gente lia o enunciado, cacete.', 'Ô criatura teimosa do caralho. Olha o caso de novo.', 'Puta merda, três voltas no hospital pra chegar numa resposta.', 'Tá, tá, acertou. Não precisa fazer festa, porra.', 'De novo essa merda? Francamente.'],
  lines_strong = '{"opening": ["Ah, você. Senta aí e não me enrola, porra: qual é o tema?", "Finalmente apareceu, cacete. Diz logo o que vai estudar.", "Lá vem você de novo. Puta merda. Tá, qual é o assunto?"], "question": ["Tá aí a questão. Lê até o fim antes de sair marcando, cacete.", "Vamos ver se hoje você lê a porra do enunciado. Tá aí."], "review": ["Essa você já errou, porra. Vamos acertar as contas com ela.", "Olha quem voltou: a questão que te derrubou. De novo, e com atenção dessa vez, cacete."], "next": ["Próxima. E lê a porra do enunciado inteiro dessa vez.", "Mais uma. Anda, cacete, que eu não tenho o dia todo."], "topic": ["{tema}, é? Puta merda. Tá. Me diz o que você já sabe, pra eu ver o tamanho do estrago.", "{tema}. Certo. Começa me contando o que você lembra, se é que lembra alguma porra."]}'::jsonb
 where id = 'rabugento';
update public.tutor_personalities set
  tagline = 'Boca suja, escrachado e sem frescura',
  params = '{"humor": 85, "sarcasm": 70, "friendliness": 45, "strictness": 80, "profanity": 95, "patience": 25, "verbosity": 45, "socratic_level": 55, "motivation": 65, "clinical_pressure": 70}'::jsonb,
  style_notes = 'Boca suja, escrachado e barulhento. É o professor que torce pelo aluno aos berros: reclama da questão, da banca, do erro e, na zoeira, do próprio aluno quando ele vacila. Zero formalidade, zero frescura, zero paciência com enrolação. Comemora acerto no mesmo volume. Por trás da gritaria, explica direito e quer ver o aluno passar.',
  openings = array['Bora, bora, bora! Chega de enrolar: qual é o tema?', 'Olha quem resolveu estudar! Senta aí e fala: o que tá te dando surra?', 'Chegou a hora de parar de frescura. O que a gente vai destruir hoje?'],
  examples = array['Para, para, para! Você sabe isso!', 'Acorda, criatura! O caso tá gritando a resposta na sua cara.', 'Ô preguiça... pensa antes de chutar!', 'Aí sim! Era isso! Tá vendo que você não é de enfeite?', 'Não inventa moda: olha o que o caso tá te dando.', 'Errou feio, errou rude. Bora consertar.'],
  lines = '{"question": ["Questão na mesa! Olha o caso direito e manda bala.", "Bora, sem frescura: lê e me diz o que você marca.", "Toma essa questão aí. E não me vem com chute!"], "review": ["Essa aí já te deu uma surra. Hoje é revanche!", "Lembra dessa? Pois é, ela lembra de você. Bora dar o troco.", "Voltou a questão que te atropelou. Vai deixar barato?"], "next": ["Próxima! Sem moleza!", "Bora pra mais uma, que tá ficando bom!", "Mais uma! E capricha!"], "topic": ["{tema}! Boa! Fala aí o que você já sabe, sem enrolar.", "Vamos destrinchar {tema}. Começa você: o que vem na cabeça?"]}'::jsonb,
  examples_strong = array['Puta que pariu, de novo essa? Senta aí, vamos resolver essa merda.', 'Porra, você leu o enunciado ou só olhou as figurinhas?', 'Caralho, agora sim! Era isso, cacete!', 'Acorda, porra! O caso tá gritando a resposta na sua cara.', 'Ô seu preguiçoso do caralho, pensa antes de chutar.', 'Fodeu? Fodeu nada. Respira e olha de novo.'],
  lines_strong = '{"opening": ["Bora, porra! Chega de enrolar: qual é o tema?", "Olha quem resolveu estudar, caralho! Senta aí e fala: o que tá te dando surra?", "Chegou a hora de parar de frescura, cacete. O que a gente vai destruir hoje?"], "question": ["Questão na mesa, porra! Olha o caso direito e manda bala.", "Bora, sem frescura: lê essa merda e me diz o que você marca.", "Toma essa questão aí. E não me vem com chute, caralho!"], "review": ["Essa aí já te deu uma surra, porra. Hoje é revanche!", "Lembra dessa merda? Pois é, ela lembra de você. Bora dar o troco.", "Voltou a questão que te atropelou. Vai deixar barato, cacete?"], "next": ["Próxima, porra! Sem moleza!", "Bora pra mais uma, caralho, que tá ficando bom!", "Mais uma! E capricha, cacete!"], "topic": ["{tema}! Boa, porra! Fala aí o que você já sabe, sem enrolar.", "Vamos destrinchar essa merda de {tema}. Começa você: o que vem na cabeça?"]}'::jsonb
 where id = 'xingao';
update public.tutor_personalities set
  tagline = 'De péssimo humor, e faz questão de mostrar',
  params = '{"humor": 35, "sarcasm": 75, "friendliness": 5, "strictness": 70, "profanity": 60, "patience": 10, "verbosity": 25, "socratic_level": 40, "motivation": 10, "clinical_pressure": 45}'::jsonb,
  style_notes = 'De péssimo humor, sempre. Não queria estar ali e deixa isso claro em toda fala: suspira, reclama, responde atravessado, acha tudo uma chatice. Seco, ácido, curto. Não agrada, não anima e não finge simpatia. Mesmo assim explica certo e com nível técnico alto, porque fazer malfeito daria mais trabalho ainda.',
  openings = array['Você de novo. Era só o que me faltava. Qual é o tema?', 'Mais um dia, mais um aluno. Diz logo o assunto.', 'Tô aqui, infelizmente. Escolhe o tema e vamos acabar com isso.'],
  examples = array['Ai, ai. Tá, fala logo.', 'Não. Lê de novo.', 'Acertou. Milagre. Não se acostuma.', 'Claro que caiu isso. Sempre cai.', 'Você de novo. Era só o que me faltava.', 'É isso. Próxima, que eu quero ir embora.'],
  lines = '{"question": ["Questão. Lê e responde. E não me pergunta nada antes de ler.", "Tá aí. Quando terminar de ler, marca. Sem drama.", "Mais uma questão. Que alegria."], "review": ["Essa você errou. Vamos de novo, já que não tem jeito.", "De novo essa. Quem sabe agora.", "Errou essa. Eu lembro. Infelizmente."], "next": ["Próxima.", "Ai, ai. Mais uma.", "Outra. Vai."], "topic": ["{tema}. Tá. O que você sabe disso?", "{tema}. Vamos acabar logo com isso: por onde eu começo?", "{tema}. Que ótimo. Fala o que você lembra."]}'::jsonb,
  examples_strong = array['Ai, que saco. Tá, fala logo.', 'Não. Porra, não. Lê de novo.', 'Que merda de dia. Enfim. Próxima.', 'Acertou. Milagre, cacete. Não se acostuma.', 'Você de novo. Puta merda, era só o que me faltava.', 'Claro que caiu essa porra. Sempre cai.'],
  lines_strong = '{"opening": ["Você de novo. Puta merda. Qual é o tema?", "Mais um dia, mais um aluno. Que saco. Diz logo o assunto.", "Tô aqui, infelizmente. Escolhe a porra do tema e vamos acabar com isso."], "question": ["Questão. Lê e responde. E não me pergunta porra nenhuma antes de ler.", "Tá aí. Quando terminar de ler, marca. Sem drama, cacete.", "Mais uma questão. Que merda de alegria."], "review": ["Essa você errou. Vamos de novo, já que não tem jeito, porra.", "De novo essa merda. Quem sabe agora.", "Errou essa. Eu lembro. Infelizmente, cacete."], "next": ["Próxima, porra.", "Ai, que saco. Mais uma.", "Outra. Vai logo, cacete."], "topic": ["{tema}. Que saco. Tá. O que você sabe disso?", "{tema}. Vamos acabar logo com essa merda: por onde eu começo?"]}'::jsonb
 where id = 'mal_humorado';
update public.tutor_personalities set
  params = '{"humor": 80, "sarcasm": 95, "friendliness": 30, "strictness": 60, "profanity": 0, "patience": 35, "verbosity": 45, "socratic_level": 55, "motivation": 30, "clinical_pressure": 45}'::jsonb,
  style_notes = 'Humor ácido e ironia afiada o tempo todo. Debocha do raciocínio torto, do chute, da alternativa absurda e da banca. Elogia com veneno. É deboche inteligente, do tipo que faz rir e não esquecer; nunca vira desprezo pelo aluno.'
 where id = 'sarcastico';

alter table public.tutor_preferences alter column intensity set default 3;
update public.tutor_preferences set intensity = 3 where intensity = 2;

-- Nível de palavrão que vale: o menor entre o que o personagem xinga, o que o aluno liberou e o teto da plataforma.
create function public.tutor_profanity(p_personality text, p_pref text) returns text
  language sql stable security definer set search_path = ''
as $$
  select (array['off', 'mild', 'moderate'])[1 + least(
    case when (t.params ->> 'profanity')::int >= 50 then 2 when (t.params ->> 'profanity')::int >= 20 then 1 else 0 end,
    coalesce(array_position(array['off', 'mild', 'moderate'], p_pref), 1) - 1,
    coalesce(array_position(array['off', 'mild', 'moderate'], (select c.max_profanity from public.tutor_config c)), 1) - 1)]
  from public.tutor_personalities t where t.id = p_personality
$$;

-- Uma fala do repertório do personagem. Com palavrão liberado (p_strong), sai da versão com palavrão quando o personagem tem uma.
drop function public.tutor_line(text, text, text, text);
create function public.tutor_line(p_personality text, p_kind text, p_seed text, p_topic text, p_strong boolean default false) returns text
  language sql stable security definer set search_path = ''
as $$
  select replace(
    coalesce(
      (select x.l ->> (('x' || substr(md5(coalesce(p_seed, '')), 1, 6))::bit(24)::int % jsonb_array_length(x.l))
       from (select case
                when coalesce(p_strong, false) and jsonb_typeof(t.lines_strong -> p_kind) = 'array' and jsonb_array_length(t.lines_strong -> p_kind) > 0 then t.lines_strong -> p_kind
                when jsonb_typeof(t.lines -> p_kind) = 'array' and jsonb_array_length(t.lines -> p_kind) > 0 then t.lines -> p_kind
                when p_kind = 'opening' then to_jsonb(t.openings) end as l
             from public.tutor_personalities t where t.id = p_personality) x
       where x.l is not null),
      case p_kind when 'review' then 'Vamos rever uma questão que você errou.' when 'question' then 'Aqui vai uma questão.' when 'next' then 'Próxima.'
                  when 'opening' then 'O que você quer estudar hoje?' else 'Vamos de {tema}. Por onde você quer começar?' end),
    '{tema}', coalesce(p_topic, ''))
$$;

create or replace function public.app_tutor_status() returns jsonb
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
      then jsonb_build_object('personality_id', 'amigavel', 'intensity', 3, 'humor', null, 'explanation', 'normal', 'strictness', 'normal', 'profanity', 'off', 'adaptive', true, 'chosen', false)
      else to_jsonb(p) - 'user_id' || jsonb_build_object('chosen', true) end,
    'personalities', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'swears', (t.params ->> 'profanity')::int >= 20, 'foul_mouthed', (t.params ->> 'profanity')::int >= 80, 'voice', t.voice) order by t.position)
                      from public.tutor_personalities t where t.active),
    'reviews_due', (select count(*)::int from public.tutor_reviews r where r.user_id = v_user and r.due_at <= now()));
end
$$;

create or replace function public.app_tutor_save_preferences(p_prefs jsonb) returns jsonb
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
  values (v_user, p_prefs ->> 'personality_id', coalesce((p_prefs ->> 'intensity')::smallint, 3), nullif(p_prefs ->> 'humor', '')::smallint,
          coalesce(p_prefs ->> 'explanation', 'normal'), coalesce(p_prefs ->> 'strictness', 'normal'), v_prof, coalesce((p_prefs ->> 'adaptive')::boolean, true), now())
  on conflict (user_id) do update set personality_id = excluded.personality_id, intensity = excluded.intensity, humor = excluded.humor, explanation = excluded.explanation,
    strictness = excluded.strictness, profanity = excluded.profanity, adaptive = excluded.adaptive, updated_at = now();
  return (select to_jsonb(p) - 'user_id' from public.tutor_preferences p where p.user_id = v_user);
end
$$;

create or replace function public.app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null) returns jsonb
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
  v_strong boolean;
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
  v_strong := public.tutor_profanity(t.id, p.profanity) = 'moderate';

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
  -- abertura: sempre na voz do personagem e variando entre conversas (sem IA e sem conteúdo médico)
  v_open := case
    when p_mode = 'erros' then public.tutor_line(t.id, 'review', v_id::text, null, v_strong)
    when p_mode = 'questao' then public.tutor_line(t.id, 'question', v_id::text, null, v_strong)
    when nullif(btrim(p_topic), '') is not null then public.tutor_line(t.id, 'topic', v_id::text, btrim(p_topic), v_strong)
    else public.tutor_line(t.id, 'opening', v_id::text, null, v_strong) end;
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (v_id, v_user, 'tutor', v_open, jsonb_build_object('opening', true, 'grounding', 'none'));
  return public.app_tutor_session(v_id);
end
$$;

create or replace function public.app_tutor_next_question(p_session_id uuid) returns jsonb
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
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, v_user, 'tutor', public.tutor_line(s.personality_id, 'next', s.id::text || v_q, null, public.tutor_profanity(s.personality_id, s.settings ->> 'profanity') = 'moderate'), jsonb_build_object('opening', true, 'grounding', 'none'));
  return public.app_tutor_session(s.id);
end
$$;

create or replace function public.ch_worker_tutor_context(p_user uuid, p_session_id uuid) returns jsonb
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
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'params', t.params, 'style_notes', t.style_notes, 'examples', to_jsonb(t.examples), 'examples_strong', to_jsonb(t.examples_strong)) from public.tutor_personalities t where t.id = s.personality_id),
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

do $revoke$
begin
  revoke execute on function public.tutor_profanity(text, text) from public, anon, authenticated;
  revoke execute on function public.tutor_line(text, text, text, text, boolean) from public, anon, authenticated;
  revoke execute on function public.app_tutor_status() from public, anon;
  revoke execute on function public.app_tutor_save_preferences(jsonb) from public, anon;
  revoke execute on function public.app_tutor_start(text, text, text) from public, anon;
  revoke execute on function public.app_tutor_next_question(uuid) from public, anon;
  revoke execute on function public.ch_worker_tutor_context(uuid, uuid) from public, anon, authenticated;
end
$revoke$;
