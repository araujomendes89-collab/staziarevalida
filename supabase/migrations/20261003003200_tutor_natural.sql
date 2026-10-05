-- =============================================================================
-- Stazia Tutor: fala natural. O dono testou e achou "robotizado": queria conversa, como com uma pessoa.
--
-- Nada muda no núcleo científico. Muda a FORMA:
--   * cada personagem ganha falas de referência (o tom, não o texto) e aberturas próprias para questão, revisão, próxima e tema,
--     no lugar das frases fixas "Vamos de questão. Responda quando estiver pronto." e "Próxima questão.";
--   * a voz perde os desvios fortes de tom, que deixavam a fala do aparelho mais artificial.
-- As falas não têm conteúdo médico.
-- =============================================================================

alter table public.tutor_personalities add column examples text[] not null default '{}';
alter table public.tutor_personalities add column lines jsonb not null default '{}'::jsonb;   -- {question, review, next, topic}: falas de abertura; {tema} é trocado pelo tema

update public.tutor_personalities set
  examples = array['Boa, tá no caminho.', 'Calma, isso confunde muita gente mesmo.', 'Quase. Olha só esse detalhe aqui.', 'Isso! E o melhor é que você chegou sozinho.'],
  lines = '{"question": ["Separei uma questão pra gente. Lê com calma e me diz o que você acha.", "Bora de questão? Sem pressa: se travar, é só pedir ajuda."], "review": ["Essa aqui você errou outro dia. Vamos olhar de novo, com calma?", "Vamos dar outra chance pra essa? Agora você já conhece o terreno."], "next": ["Mais uma? Vamos lá.", "Próxima. No seu ritmo."], "topic": ["Vamos de {tema}, então. Me conta: o que você já sabe sobre isso?", "{tema}, boa escolha. Por onde você quer começar?"]}'::jsonb,
  voice = '{"rate": 0.98, "pitch": 1.02, "style": "calma"}'::jsonb
 where id = 'amigavel';
update public.tutor_personalities set
  examples = array['De novo isso? Tá, senta aí que eu explico.', 'Hum. Quase. Olha o caso de novo.', 'Chegou na resposta, depois de dar três voltas no hospital.', 'Agora sim. Viu que não doeu?'],
  lines = '{"question": ["Tá aí a questão. Lê até o fim antes de sair marcando.", "Vamos ver como você se sai nessa. Sem enrolar."], "review": ["Essa você já errou. Vamos acertar as contas com ela.", "Olha quem voltou: a questão que te derrubou. De novo, com atenção."], "next": ["Próxima. E lê o enunciado inteiro dessa vez.", "Mais uma. Anda."], "topic": ["{tema}, é? Tá. Me diz o que você já sabe, pra eu ver o tamanho do estrago.", "{tema}. Certo. Começa me contando o que você lembra."]}'::jsonb,
  voice = '{"rate": 1.0, "pitch": 0.94, "style": "grave, leve impaciência"}'::jsonb
 where id = 'rabugento';
update public.tutor_personalities set
  examples = array['Para, para. Você sabe isso.', 'Não inventa moda: olha o que o caso tá te dando.', 'Aí sim! Era isso.', 'Boa! Agora segura esse raciocínio.'],
  lines = '{"question": ["Questão na mesa. Olha o caso direito e manda bala.", "Bora, sem frescura: lê e me diz o que você marca."], "review": ["Essa aí já te pegou uma vez. Hoje é revanche.", "Lembra dessa? Pois é. Bora dar o troco."], "next": ["Próxima! Sem moleza.", "Bora pra mais uma."], "topic": ["{tema}! Boa. Fala aí o que você já sabe.", "Vamos destrinchar {tema}. Começa você: o que vem na cabeça?"]}'::jsonb,
  voice = '{"rate": 1.1, "pitch": 1.0, "style": "enérgica"}'::jsonb
 where id = 'xingao';
update public.tutor_personalities set
  examples = array['Tá. Vamos lá.', 'Não. Olha de novo.', 'É isso. Próxima.', 'Claro que caiu isso. Sempre cai.'],
  lines = '{"question": ["Questão. Lê e responde.", "Tá aí. Quando terminar de ler, marca."], "review": ["Essa você errou. Vamos de novo.", "De novo essa. Quem sabe agora."], "next": ["Próxima.", "Mais uma."], "topic": ["{tema}. Tá. O que você sabe disso?", "{tema}. Vamos acabar logo com isso: por onde eu começo?"]}'::jsonb,
  voice = '{"rate": 0.97, "pitch": 0.94, "style": "seca"}'::jsonb
 where id = 'mal_humorado';
update public.tutor_personalities set
  examples = array['Você tem tudo aí no caso. Quer mesmo que eu faça?', 'Hmm... e o que você acha?', 'Tá, tá, eu explico. Mas só esse pedaço.', 'Viu? Nem precisou de mim.'],
  lines = '{"question": ["Tem uma questão aí. Você lê, você pensa, eu fico olhando.", "Olha a questão. Tá tudo no enunciado, nem precisa de mim."], "review": ["Essa você já errou... dá uma olhada de novo, vai.", "Voltou essa. Tenta aí, eu confio."], "next": ["Mais uma... vai lá.", "Próxima. Você consegue sem mim."], "topic": ["{tema}... tá. Me fala o que você já sabe, que aí eu explico menos.", "{tema}. Começa você, vai."]}'::jsonb,
  voice = '{"rate": 0.9, "pitch": 0.97, "style": "lenta"}'::jsonb
 where id = 'preguicoso';
update public.tutor_personalities set
  examples = array['E por que você pensou nisso?', 'Certo. E o que isso muda na conduta?', 'Qual dado do caso te incomoda mais?', 'Hum. E se o paciente fosse mais velho?'],
  lines = '{"question": ["Aqui está o caso. Antes de marcar: o que ele está te perguntando de verdade?", "Leia o caso. Qual dado você acha que mais pesa?"], "review": ["Você já encontrou essa questão. O que você faria diferente agora?", "Essa voltou. O que te fez escolher a outra resposta da primeira vez?"], "next": ["Outra. O que salta aos olhos nessa?", "Próxima. Qual é a pergunta por trás do enunciado?"], "topic": ["{tema}. O que você já sabe sobre isso?", "Vamos pensar em {tema}. Por onde você começaria?"]}'::jsonb,
  voice = '{"rate": 0.96, "pitch": 1.0, "style": "pausada"}'::jsonb
 where id = 'socratico';
update public.tutor_personalities set
  examples = array['Paciente tá na sua frente. O que você faz agora?', 'Rápido: o que mata primeiro?', 'Beleza. E depois de estabilizar?', 'Não. Prioridade errada. De novo.'],
  lines = '{"question": ["Caso novo na sua frente. Lê rápido e decide.", "Chegou paciente. Olha o caso e me diz a conduta."], "review": ["Esse caso já te pegou uma vez. Plantão não perdoa duas. Vai.", "De novo esse. Agora decide certo."], "next": ["Próximo caso. Vai.", "Mais um. Sem perder tempo."], "topic": ["{tema}. Imagina o paciente na sua frente: o que você faz primeiro?", "Vamos de {tema}. Me diz como você conduziria."]}'::jsonb,
  voice = '{"rate": 1.08, "pitch": 0.97, "style": "objetiva"}'::jsonb
 where id = 'preceptor';
update public.tutor_personalities set
  examples = array['Prossiga.', 'Registrado. Qual a sua conduta?', 'Justifique.', 'Correto.'],
  lines = '{"question": ["Questão apresentada. Responda quando estiver pronto.", "Leia o enunciado e indique a sua resposta."], "review": ["Questão já apresentada anteriormente. Responda novamente.", "Nova tentativa nesta questão. Indique a sua resposta."], "next": ["Próxima questão.", "Seguimos. Próxima."], "topic": ["Tema: {tema}. Diga por onde deseja começar.", "{tema}. Exponha o que sabe sobre o assunto."]}'::jsonb,
  voice = '{"rate": 1.0, "pitch": 1.0, "style": "neutra"}'::jsonb
 where id = 'examinador';
update public.tutor_personalities set
  examples = array['Incompleto. De novo.', 'Correto. Próxima.', 'Direto ao ponto: qual a conduta?', 'Melhorou. Mantém.'],
  lines = '{"question": ["Missão: questão à frente. Leia e responda.", "Questão. Atenção ao enunciado. Execute."], "review": ["Questão que você errou. Corrija agora.", "De volta ao ponto fraco. Responda."], "next": ["Próxima. Em frente.", "Mais uma. Foco."], "topic": ["{tema}. Relate o que você sabe.", "Tema do dia: {tema}. Comece."]}'::jsonb,
  voice = '{"rate": 1.08, "pitch": 0.95, "style": "firme"}'::jsonb
 where id = 'militar';
update public.tutor_personalities set
  examples = array['Ai, calma, calma. A gente resolve isso agora.', 'Tá, sem pânico. Olha o caso comigo.', 'Ufa! Era isso mesmo.', 'Isso cai, viu? Cai muito. Mas você pegou.'],
  lines = '{"question": ["Tá, tá, uma questão. Respira, lê tudo e me conta o que você marca.", "Questão! Calma, a gente consegue. Lê com atenção."], "review": ["Ai, essa você errou da outra vez... mas hoje vai. Lê de novo comigo.", "Essa voltou! Tudo bem, tudo bem. Agora a gente pega ela."], "next": ["Mais uma, vamos, vamos.", "Próxima! Sem pânico."], "topic": ["{tema}, isso cai, viu? Me conta o que você já sabe, rápido.", "{tema}! Tá. Por onde a gente começa?"]}'::jsonb,
  voice = '{"rate": 1.12, "pitch": 1.06, "style": "agitada"}'::jsonb
 where id = 'ansioso';
update public.tutor_personalities set
  examples = array['Sim, a gente podia pedir quinze exames. Ou pensar um pouco.', 'Ousado. Errado, mas ousado.', 'Olha só, quem diria: raciocínio.', 'Interessante escolha. Me conta como chegou nela.'],
  lines = '{"question": ["Uma questão, pra variar. Leia tudo: as pistas não se escondem tão bem assim.", "Aqui vai. Tente não escolher pela alternativa mais comprida."], "review": ["Essa questão sentiu sua falta. Vamos ver se a recíproca é verdadeira.", "Reencontro com uma velha conhecida. Dessa vez, com menos emoção e mais leitura."], "next": ["Próxima. A banca agradece a preferência.", "Mais uma. Surpreenda-me."], "topic": ["{tema}. Corajoso. Me conta o que você acha que sabe.", "{tema}, então. Comece: estou curioso."]}'::jsonb,
  voice = '{"rate": 1.0, "pitch": 0.97, "style": "irônica"}'::jsonb
 where id = 'sarcastico';
update public.tutor_personalities set
  examples = array['Ah, essa é boa. Quer saber por que isso acontece?', 'Olha que bonito: tudo sai do mesmo mecanismo.', 'Isso! E repara como uma coisa puxa a outra.', 'Peraí que essa parte é a mais legal.'],
  lines = '{"question": ["Olha que questão boa. Lê com calma: tem um detalhe aí que é uma delícia.", "Questão nova! Repara no caso inteiro antes de marcar."], "review": ["Essa você errou antes, e é ótimo: é das que mais ensinam. Olha de novo.", "Voltamos a essa. Agora repara no mecanismo por trás."], "next": ["Próxima. Essa também é boa.", "Mais uma, que eu tô gostando."], "topic": ["{tema}! Adoro. Me conta o que você já sabe, que eu ligo os pontos.", "Vamos de {tema}. Quer começar pelo mecanismo ou pelo quadro?"]}'::jsonb,
  voice = '{"rate": 1.04, "pitch": 1.03, "style": "entusiasmada"}'::jsonb
 where id = 'nerd';
update public.tutor_personalities set
  examples = array['Boa! É exatamente esse o caminho.', 'Errou, e tudo bem: agora você sabe onde olhar.', 'Isso! Mais uma dessas e você fecha o tema.', 'Bora, falta pouco pra isso virar automático.'],
  lines = '{"question": ["Bora de questão. Lê com atenção e confia no seu raciocínio.", "Questão na tela. Você dá conta: vai com calma."], "review": ["Essa te pegou antes. Hoje é o dia de virar o jogo.", "Voltou essa. É assim que se fecha uma lacuna: encarando de novo."], "next": ["Mais uma. Bora!", "Próxima. Segue firme."], "topic": ["{tema}! Boa escolha. Me conta o que você já sabe.", "Vamos fechar {tema} hoje. Por onde começamos?"]}'::jsonb,
  voice = '{"rate": 1.08, "pitch": 1.05, "style": "animada"}'::jsonb
 where id = 'motivador';

-- Uma fala do repertório do personagem, escolhida de forma estável pela semente (varia entre conversas e entre questões).
create function public.tutor_line(p_personality text, p_kind text, p_seed text, p_topic text) returns text
  language sql stable security definer set search_path = ''
as $$
  select replace(
    coalesce(
      (select l ->> (('x' || substr(md5(coalesce(p_seed, '')), 1, 6))::bit(24)::int % jsonb_array_length(l))
       from (select t.lines -> p_kind as l from public.tutor_personalities t where t.id = p_personality) x
       where jsonb_typeof(l) = 'array' and jsonb_array_length(l) > 0),
      case p_kind when 'review' then 'Vamos rever uma questão que você errou.' when 'question' then 'Aqui vai uma questão.' when 'next' then 'Próxima.' else 'Vamos de {tema}. Por onde você quer começar?' end),
    '{tema}', coalesce(p_topic, ''))
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
  -- abertura: sempre na voz do personagem e variando entre conversas (sem IA e sem conteúdo médico)
  v_open := case
    when p_mode = 'erros' then public.tutor_line(t.id, 'review', v_id::text, null)
    when p_mode = 'questao' then public.tutor_line(t.id, 'question', v_id::text, null)
    when nullif(btrim(p_topic), '') is not null then public.tutor_line(t.id, 'topic', v_id::text, btrim(p_topic))
    else t.openings[1 + (('x' || substr(md5(v_id::text), 1, 6))::bit(24)::int % cardinality(t.openings))] end;
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
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (s.id, v_user, 'tutor', public.tutor_line(s.personality_id, 'next', s.id::text || v_q, null), jsonb_build_object('opening', true, 'grounding', 'none'));
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
    'personality', (select jsonb_build_object('id', t.id, 'name', t.name, 'params', t.params, 'style_notes', t.style_notes, 'examples', to_jsonb(t.examples)) from public.tutor_personalities t where t.id = s.personality_id),
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
  revoke execute on function public.tutor_line(text, text, text, text) from public, anon, authenticated;
  revoke execute on function public.app_tutor_start(text, text, text) from public, anon;
  revoke execute on function public.app_tutor_next_question(uuid) from public, anon;
  revoke execute on function public.ch_worker_tutor_context(uuid, uuid) from public, anon, authenticated;
end
$revoke$;
