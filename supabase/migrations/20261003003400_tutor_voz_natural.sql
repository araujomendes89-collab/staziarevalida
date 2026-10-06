-- =============================================================================
-- Stazia Tutor: voz natural pelo servidor. O dono: "ainda está muito robótica". A voz do navegador é a do aparelho; a voz natural é
-- gerada no servidor por um serviço de voz neural (OpenAI ou Google Gemini), pago à parte e desligado até haver chave e consentimento.
--
-- Regra que não muda: só vira voz o texto que o servidor já validou (resposta gravada do professor, a questão da conversa ou uma frase
-- fixa do aplicativo). O navegador nunca manda texto livre para virar voz, então a rota não serve de "gerador de voz" grátis.
--   * cada professor ganha a voz de cada serviço e a direção de atuação (como falar), sem conteúdo médico;
--   * ai_usage.voice_chars conta os caracteres falados no dia (teto por aluno no servidor); o custo estimado soma no cost_usd do dia,
--     sem contar como mensagem.
-- =============================================================================

alter table public.ai_usage add column voice_chars integer not null default 0;

update public.tutor_personalities set voice = voice || '{"openai": "marin", "gemini": "Sulafat", "acting": "professor calmo e caloroso, que sorri enquanto fala, sem pressa"}'::jsonb where id = 'amigavel';
update public.tutor_personalities set voice = voice || '{"openai": "cedar", "gemini": "Algenib", "acting": "professor velho e rabugento: voz grave e áspera, resmungando, com suspiros de impaciência e irritação teatral, mas no fundo atencioso"}'::jsonb where id = 'rabugento';
update public.tutor_personalities set voice = voice || '{"openai": "verse", "gemini": "Fenrir", "acting": "professor barulhento, escrachado e empolgado: fala rápido, alto, rindo, quase gritando quando comemora ou dá bronca"}'::jsonb where id = 'xingao';
update public.tutor_personalities set voice = voice || '{"openai": "onyx", "gemini": "Gacrux", "acting": "professor de péssimo humor: entediado, de má vontade, arrastando as palavras, suspirando, seco e atravessado"}'::jsonb where id = 'mal_humorado';
update public.tutor_personalities set voice = voice || '{"openai": "ballad", "gemini": "Enceladus", "acting": "professor preguiçoso: lento, sonolento, com bocejos e pausas longas"}'::jsonb where id = 'preguicoso';
update public.tutor_personalities set voice = voice || '{"openai": "sage", "gemini": "Iapetus", "acting": "professor calmo e curioso, que pergunta devagar, com pausas para o aluno pensar"}'::jsonb where id = 'socratico';
update public.tutor_personalities set voice = voice || '{"openai": "ash", "gemini": "Orus", "acting": "preceptor de plantão: objetivo, firme, com urgência de pronto-socorro"}'::jsonb where id = 'preceptor';
update public.tutor_personalities set voice = voice || '{"openai": "alloy", "gemini": "Schedar", "acting": "examinador de banca: neutro, formal e pausado"}'::jsonb where id = 'examinador';
update public.tutor_personalities set voice = voice || '{"openai": "echo", "gemini": "Alnilam", "acting": "instrutor militar: firme, curto, em tom de comando"}'::jsonb where id = 'militar';
update public.tutor_personalities set voice = voice || '{"openai": "nova", "gemini": "Laomedeia", "acting": "professor ansioso e cômico: fala rápido, aflito, atropelando as palavras, e depois se recompõe"}'::jsonb where id = 'ansioso';
update public.tutor_personalities set voice = voice || '{"openai": "fable", "gemini": "Zubenelgenubi", "acting": "professor sarcástico: irônico, debochado, com desdém divertido e pausas de efeito"}'::jsonb where id = 'sarcastico';
update public.tutor_personalities set voice = voice || '{"openai": "coral", "gemini": "Sadaltager", "acting": "professor nerd: entusiasmado, empolgado com cada detalhe do mecanismo"}'::jsonb where id = 'nerd';
update public.tutor_personalities set voice = voice || '{"openai": "shimmer", "gemini": "Sadachbia", "acting": "professor motivador: animado, enérgico e encorajador"}'::jsonb where id = 'motivador';

-- O que pode virar voz, para quem, e quanto o aluno já falou hoje. Só o servidor chama.
--   p_kind = 'message'  : uma fala do professor gravada nesta conversa do aluno
--   p_kind = 'question' : a questão atual desta conversa (enunciado e alternativas; o gabarito nunca entra)
--   p_kind = 'phrase'   : frase fixa do aplicativo (o texto é montado no servidor), na voz de p_personality
create function public.ch_worker_tutor_speech(p_user uuid, p_session_id uuid, p_kind text, p_message_id bigint, p_personality text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.tutor_sessions;
  t public.tutor_personalities;
  v_text text;
begin
  select * into c from public.tutor_config;
  if p_kind in ('message', 'question') then
    select * into s from public.tutor_sessions where id = p_session_id and user_id = p_user;
    if not found then return jsonb_build_object('found', false); end if;
    select * into t from public.tutor_personalities where id = s.personality_id;
    if p_kind = 'message' then
      select m.content into v_text from public.tutor_messages m where m.id = p_message_id and m.session_id = s.id and m.role = 'tutor';
    elsif s.question_id is not null then
      select q.statement || ' ' || coalesce((select string_agg('Alternativa ' || (o ->> 'id') || ': ' || (o ->> 'text'), ' ' order by o ->> 'id') from jsonb_array_elements(q.options) o), '')
        into v_text from public.questions q where q.id = s.question_id;
    end if;
    if v_text is null then return jsonb_build_object('found', false); end if;
  else
    select * into t from public.tutor_personalities where id = p_personality and active;
    if not found then return jsonb_build_object('found', false); end if;
  end if;
  return jsonb_build_object(
    'found', true,
    'config', jsonb_build_object('enabled', c.enabled, 'voice_enabled', c.voice_enabled, 'requires_pro', c.requires_pro),
    'is_pro', public.tutor_is_pro(p_user),
    'used_chars', coalesce((select u.voice_chars from public.ai_usage u where u.user_id = p_user and u.day = (now() at time zone 'America/Sao_Paulo')::date), 0),
    'personality', t.id, 'voice', t.voice, 'sample', t.openings[1], 'text', v_text);
end
$$;

-- Registra a voz gerada: caracteres do dia e custo estimado. Não conta como mensagem (requests fica igual).
create function public.ch_worker_tutor_voice_charge(p_user uuid, p_chars integer, p_cost numeric) returns integer
  language sql security definer set search_path = ''
as $$
  insert into public.ai_usage as u (user_id, day, voice_chars, cost_usd)
  values (p_user, (now() at time zone 'America/Sao_Paulo')::date, greatest(p_chars, 0), greatest(coalesce(p_cost, 0), 0))
  on conflict (user_id, day) do update set voice_chars = u.voice_chars + excluded.voice_chars, cost_usd = u.cost_usd + excluded.cost_usd
  returning voice_chars
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_tutor_speech(uuid, uuid, text, bigint, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_tutor_voice_charge(uuid, integer, numeric) from public, anon, authenticated;
end
$revoke$;
