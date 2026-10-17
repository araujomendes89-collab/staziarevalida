-- =============================================================================
-- Tutor: dois personagens, quatro personalidades (decisão do dono, 17/10/2026). Aditiva; pode ser colada de novo.
--
--   Stazi (menino, 1 voz masculina):   Durão (id 'durao') e Tranquilo (id 'acolhedor', preservado)
--   Stazia (menina, 1 voz feminina):   Durona (id 'durona', preservado) e Tranquila (id 'tranquila')
--   O Direto sai: fica inativo. As conversas antigas dele passam a ser só leitura (legacy_persona, como na …5500) e
--   as preferências dele passam para o Tranquilo.
--
--   * tutor_personalities.character ('stazi' | 'stazia'): a que personagem cada personalidade pertence. A voz vem do personagem
--     (cedar / Zubenelgenubi para o Stazi; marin / Kore para a Stazia); a tela escolhe PRIMEIRO o personagem, depois uma das 2 personalidades.
--   * Durão herda da Durona os parâmetros, o motor (engine), as falas e a mecânica de nível: o N3 com gritos e palavrões vale por
--     padrão, o aluno baixa o nível ou desliga gritos/palavrões, e o N3/N4 continuam presos à declaração de 18+ e médico do Termo
--     (tutor_adult_declared, …11900; a escolha do aluno é por pessoa, não por personalidade, então vale para as duas).
--   * app_tutor_start e app_tutor_status passam a aceitar/listar os 4 (só trocam a lista de ids e o campo 'character';
--     o resto da função é a definição vigente, aplicada com pg_get_functiondef).
--   * Aprovação das vozes oficiais passa a ser por personagem ('stazi', 'stazia'); as linhas antigas ficam guardadas.
--   * As reações de voz (tutor_voice_reaction_rules) continuam por família: Durão usa as regras da Durona, Tranquila as do Tranquilo.
--
-- TEXTO A APROVAR PELO DONO: o style_notes, as aberturas, as falas e a frase (tagline) da TRANQUILA são texto novo, escrito
-- como versão feminina do Tranquilo com mais acolhimento e a mesma exigência. O texto do Durão é o da Durona no masculino.
-- Não há conteúdo médico aqui, só jeito de falar.
-- =============================================================================

-- ---------------------------------------------------------------- a que personagem cada personalidade pertence
alter table public.tutor_personalities add column if not exists "character" text;
alter table public.tutor_personalities drop constraint if exists tutor_personalities_character_check;
alter table public.tutor_personalities add constraint tutor_personalities_character_check check ("character" is null or "character" in ('stazi', 'stazia'));

-- ---------------------------------------------------------------- Direto: conversas antigas viram só leitura (nome e emoji originais)
update public.tutor_sessions as s
set legacy_persona = jsonb_build_object('name', t.name, 'emoji', t.emoji)
from public.tutor_personalities as t
where t.id = s.personality_id and s.personality_id = 'direto' and s.legacy_persona is null;

-- ---------------------------------------------------------------- Durão (Stazi): a Durona no masculino
insert into public.tutor_personalities (id, name, emoji, tagline, params, style_notes, openings, voice, position, active, examples, lines, examples_strong, lines_strong, engine)
select 'durao', 'Durão', '🔥', 'Provocador, escrachado e sem passar a mão na cabeça', d.params,
  'Você é um professor brasileiro escrachado e sem filtro, do tipo que todo residente já teve: exigente, impaciente, sarcástico, engraçado e muito expressivo. Fala como gente, não como livro: reage na hora, ri, bufa, resmunga, debocha, solta palavrão quando dá vontade (de raiva ou de alegria) e GRITA quando o aluno vacila feio ou quando acerta uma difícil. Não pede desculpa pelo jeito e não amacia: se a resposta foi péssima, diz que foi péssima. A bronca cresce com os erros e, quanto maior a raiva, maior a COBRANÇA: você para tudo e exige o raciocínio. Quando o aluno acerta logo depois de errar, você mostra alívio, com um palavrão sobre a situação ("Ufa, porra, até que enfim!"); num acerto sem erro antes, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai."). O alvo é sempre a resposta, a desatenção, o chute ou a preguiça; nunca a dignidade da pessoa.',
  d.openings,
  '{"rate":1.04,"pitch":0.96,"style":"provocador","acting":"professor durão e escrachado: rápido, irônico e provocador, com humor ácido; sobe o tom quando o aluno vacila","gemini":"Zubenelgenubi","openai":"cedar","realtime":"cedar"}'::jsonb,
  1, true, d.examples, d.lines, d.examples_strong, d.lines_strong, d.engine
from public.tutor_personalities d where d.id = 'durona'
on conflict (id) do nothing;

-- ---------------------------------------------------------------- Tranquila (Stazia): TEXTO A APROVAR PELO DONO
insert into public.tutor_personalities (id, name, emoji, tagline, params, style_notes, openings, voice, position, active, examples, lines, examples_strong, lines_strong, engine)
values (
  'tranquila', 'Tranquila', '😌', 'Calma, acolhedora e sem pressa; cobra com carinho',
  '{"humor":45,"sarcasm":15,"patience":80,"profanity":0,"verbosity":30,"motivation":60,"strictness":45,"friendliness":85,"socratic_level":75,"clinical_pressure":20}'::jsonb,
  'Você é uma professora brasileira calma, acolhedora e sem pressa, com jeito de quem cuida: fala devagar e com carinho, dá tempo para o aluno pensar e não deixa a ansiedade dele virar bloqueio. Acolhe o erro sem constranger, mas não baixa a exigência: aponta com precisão onde o raciocínio saiu do trilho e pede que o aluno tente de novo antes de você explicar tudo. Devolve a pergunta com leveza, faz uma pergunta menor quando ele trava e dá uma pista concreta. Quando acerta, você reconhece de verdade, sem exagero e sem discurso motivacional. Quando o erro se repete, fica mais firme, com preocupação e nunca com raiva ("Ei, vamos olhar isso de novo, com calma."). Não usa palavrão e não grita. O alvo é sempre a resposta e o raciocínio; nunca a dignidade da pessoa.',
  array['Oi! Que bom te ver. Sem pressa: qual tema a gente estuda hoje?', 'Vem, senta aqui comigo. Escolhe o assunto e a gente vai no seu ritmo.', 'Respira, está tudo certo. Por onde você quer começar?'],
  '{"rate":0.95,"pitch":1.02,"style":"calma","acting":"professora calma e acolhedora: fala sem pressa, com carinho na voz e pausas curtas","gemini":"Kore","openai":"marin","realtime":"marin"}'::jsonb,
  4, true,
  array['Quase lá. Olha com calma esse detalhe do caso.', 'Não é essa, mas o seu raciocínio começou bem. Onde você acha que se perdeu?', 'Isso! E repara que você chegou lá sozinho.', 'Calma, essa confunde muita gente. Vamos por partes.', 'Sem pressa. O que o enunciado está pedindo, de verdade?'],
  '{"next":["Vamos para a próxima, com calma.","Mais uma, no seu tempo."],"topic":["{tema}. Me conta o que você já sabe, e a gente continua dali.","Vamos com calma em {tema}. Por onde você quer começar?"],"review":["Essa aqui já te deu trabalho. Vamos olhar de novo, com calma.","Lembra dessa? Hoje a gente acerta o passo que ficou para trás."],"discuss":["Você marcou {tema}. O que te levou a essa escolha?","Me conta o seu raciocínio, sem pressa, antes de eu explicar."],"question":["Separei uma questão para a gente. Lê com calma e me diz o que você acha.","Questão na mesa. Sem pressa: se travar, me chama."]}'::jsonb,
  '{}', '{}'::jsonb,
  '{"frustration_multiplier":0.35,"sarcasm_max":20,"aggression_max":10,"patience_base":80,"warmth_base":80,"language_max":1,"language_base":1}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- quem pertence a quem, ordem na tela e voz de cada personagem
-- Stazi: voz masculina (Gemini ao vivo Zubenelgenubi, decisão do dono de 17/10; reserva OpenAI cedar). Stazia: voz feminina (Gemini ao
-- vivo Kore; reserva OpenAI marin). A atuação de desenho animado do Stazi vai nas instruções da voz ao vivo (servidor), não aqui.
update public.tutor_personalities set "character" = 'stazi', position = 1, active = true,
  voice = voice || '{"realtime":"cedar","openai":"cedar","gemini":"Zubenelgenubi"}'::jsonb where id = 'durao';
update public.tutor_personalities set "character" = 'stazi', position = 2, active = true,
  voice = voice || '{"realtime":"cedar","openai":"cedar","gemini":"Zubenelgenubi"}'::jsonb where id = 'acolhedor';
update public.tutor_personalities set "character" = 'stazia', position = 3, active = true,
  voice = voice || '{"realtime":"marin","openai":"marin","gemini":"Kore"}'::jsonb where id = 'durona';
update public.tutor_personalities set "character" = 'stazia', position = 4, active = true,
  voice = voice || '{"realtime":"marin","openai":"marin","gemini":"Kore"}'::jsonb where id = 'tranquila';

-- O Direto sai (fica guardado e inativo, para as conversas antigas continuarem mostrando o nome original)
update public.tutor_personalities set active = false, position = 5, "character" = null where id = 'direto';

-- Preferência é estado atual: quem estava no Direto passa para o Tranquilo, sem palavrão. As conversas antigas não mudam.
update public.tutor_preferences set personality_id = 'acolhedor', profanity = 'off', updated_at = now() where personality_id = 'direto';

-- ---------------------------------------------------------------- painel: lista e liga/desliga os 4
create or replace function public.app_admin_tutor_personalities() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'tagline', t.tagline, 'active', t.active,
                                        'character', t."character", 'voice', t.voice ->> 'realtime', 'default', t.id = 'acolhedor') order by t.position)
    from public.tutor_personalities t where t.id in ('durao', 'acolhedor', 'durona', 'tranquila')
  ), '[]'::jsonb);
end
$$;

create or replace function public.app_admin_tutor_set_personality(p_id text, p_active boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_char text;
begin
  perform public.assert_admin();
  if p_id is null or p_id not in ('durao', 'acolhedor', 'durona', 'tranquila') then raise exception 'Professor não encontrado.' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_id = 'acolhedor' and not coalesce(p_active, true) then
    raise exception 'Tranquilo é o professor padrão e fica sempre disponível.' using errcode = '22023';
  end if;
  select t."character" into v_char from public.tutor_personalities t where t.id = p_id;
  -- cada personagem precisa de pelo menos uma personalidade ligada, senão o aluno que o escolhe ficaria sem professor
  if not coalesce(p_active, true) and not exists (
       select 1 from public.tutor_personalities t where t."character" = v_char and t.id <> p_id and t.active) then
    raise exception 'Cada personagem precisa de pelo menos uma personalidade ligada.' using errcode = '22023';
  end if;
  update public.tutor_personalities set active = coalesce(p_active, active) where id = p_id;
  perform public.admin_log('tutor.personality', 'tutor', jsonb_build_object('id', p_id, 'active', p_active, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_personalities();
end
$$;

-- ---------------------------------------------------------------- aprovação das vozes: uma por personagem
alter table public.tutor_voice_approvals drop constraint if exists tutor_voice_approvals_voice_check;
alter table public.tutor_voice_approvals add constraint tutor_voice_approvals_voice_check
  check (voice in ('stazi', 'stazia', 'tranquilo', 'durona', 'direto'));

create or replace function public.tutor_voice_check(p_user uuid, p_voice text) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  if p_voice is null or p_voice not in ('stazi', 'stazia') then raise exception 'Voz inválida.' using errcode = '22023'; end if;
end
$$;
revoke execute on function public.tutor_voice_check(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- app_tutor_start / app_tutor_status: só a lista de ids e o campo 'character'
-- Aplicado sobre a definição vigente (pg_get_functiondef), para não copiar de novo a função inteira. Falha alto se a definição
-- vigente não tiver o trecho esperado (nem o já trocado).
do $patch$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_start(text, text, text, jsonb, text)'::regprocedure) into v_def;
  v_new := replace(v_def, $$id in ('acolhedor', 'durona', 'direto')$$, $$id in ('acolhedor', 'durao', 'durona', 'tranquila')$$);
  if v_new = v_def and position($$'tranquila'$$ in v_def) = 0 then
    raise exception 'app_tutor_start: trecho com os ids dos professores não encontrado.';
  end if;
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('public.app_tutor_status()'::regprocedure) into v_def;
  v_new := replace(v_def, $$'voice', t.voice) order by t.position)$$, $$'voice', t.voice, 'character', t."character") order by t.position)$$);
  if v_new = v_def and position($$'character'$$ in v_def) = 0 then
    raise exception 'app_tutor_status: trecho da lista de professores não encontrado.';
  end if;
  if v_new <> v_def then execute v_new; end if;
end
$patch$;
