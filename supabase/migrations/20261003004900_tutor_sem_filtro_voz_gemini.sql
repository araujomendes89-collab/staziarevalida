-- =============================================================================
-- Tutor: fala sem filtro (podendo gritar) e voz em português do Brasil nativo pelo Gemini.
-- Pedido de 2026-10-06: "Não gostei da linguagem do tutor por IA, quero algo mais sem filtros, bem natural, ela pode gritar.
-- Ainda está com muito sotaque americano, quero português do Brasil. Melhore isso."
--
--   1) Voz: o provedor "gemini" (Gemini Live, áudio nativo) entra no painel e nas chamadas. No modo automático o servidor prefere
--      o Gemini (pronúncia de brasileiro nativo) e cai para o GPT-Live/Realtime se o Google recusar. O custo por tempo vai para o
--      livro-caixa como tutor_voice_gemini.
--   2) Fala: os três professores ativos ganham descrição e falas de referência de gente de verdade (gíria, palavrão espontâneo
--      conforme o professor, grito curto na bronca e na comemoração) e um piso de linguagem (o professor já começa solto).
--      A Durona passa para o nível "sem_filtro". Os limites (nada de ataque à pessoa, discriminação ou xingamento pesado) e a
--      conferência por software continuam iguais.
-- =============================================================================

-- ---------------------------------------------------------------- provedor "gemini"
alter table public.tutor_config drop constraint tutor_config_voice_provider_check;
alter table public.tutor_config add constraint tutor_config_voice_provider_check check (voice_provider in ('auto', 'gemini', 'live', 'realtime'));
alter table public.tutor_voice_calls drop constraint tutor_voice_calls_provider_check;
alter table public.tutor_voice_calls add constraint tutor_voice_calls_provider_check check (provider in ('realtime', 'live', 'gemini'));

alter table public.ai_usage_ledger drop constraint ai_usage_ledger_feature_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_feature_check
  check (feature in ('tutor_text', 'tutor_eval', 'tutor_voice', 'tutor_voice_tokens', 'tutor_tts', 'tutor_voice_live', 'tutor_voice_backend', 'tutor_voice_gemini',
                     'podcast_script', 'podcast_tts', 'lesson_assist'));

-- Ligação aberta: guarda o id e o provedor (agora também "gemini").
create or replace function public.ch_worker_tutor_voice_attach(p_user uuid, p_voice_call uuid, p_call_id text, p_provider text) returns boolean
  language sql security definer set search_path = ''
as $$
  update public.tutor_voice_calls
     set call_id = case when p_call_id ~ '^[A-Za-z0-9_-]{4,120}$' then p_call_id else call_id end,
         provider = case when p_provider in ('realtime', 'live', 'gemini') then p_provider else provider end
   where id = p_voice_call and user_id = p_user and status = 'active'
  returning true
$$;

-- Painel do Tutor: igual ao anterior (…4400), aceitando o provedor "gemini".
create or replace function public.app_admin_tutor_save_config(p_config jsonb, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_pron jsonb;
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
    voice_provider = coalesce(nullif(p_config ->> 'voice_provider', ''), voice_provider),
    voice_name = case when p_config ? 'voice_name' then nullif(lower(btrim(coalesce(p_config ->> 'voice_name', ''))), '') else voice_name end,
    voice_session_max_seconds = coalesce(nullif(p_config ->> 'voice_session_max_seconds', '')::integer, voice_session_max_seconds),
    save_transcripts = coalesce((p_config ->> 'save_transcripts')::boolean, save_transcripts),
    transcript_retention_days = coalesce(nullif(p_config ->> 'transcript_retention_days', '')::integer, transcript_retention_days),
    emotion_engine = coalesce((p_config ->> 'emotion_engine')::boolean, emotion_engine),
    inside_jokes = coalesce((p_config ->> 'inside_jokes')::boolean, inside_jokes),
    durona_level = coalesce(nullif(p_config ->> 'durona_level', ''), durona_level),
    pronunciations = coalesce(v_pron, pronunciations),
    updated_at = now(), updated_by = (select auth.uid());
  update public.tutor_preferences p set profanity = c.max_profanity from public.tutor_config c
   where (case p.profanity when 'off' then 0 when 'mild' then 1 else 2 end) > (case c.max_profanity when 'off' then 0 when 'mild' then 1 else 2 end);
  perform public.admin_log('tutor.config', 'tutor', jsonb_build_object('from', v_old, 'to', p_config, 'reason', btrim(p_reason)));
  return public.app_admin_tutor_config();
end
$$;
revoke execute on function public.ch_worker_tutor_voice_attach(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.app_admin_tutor_save_config(jsonb, text) from public, anon;

-- ---------------------------------------------------------------- fala de gente, sem filtro
-- Durona no nível sem filtro (a escolha do dono; o painel continua podendo mudar).
update public.tutor_config set durona_level = 'sem_filtro', updated_at = now() where durona_level = 'forte';

update public.tutor_personalities set
  style_notes = 'Você é uma professora brasileira escrachada e sem filtro, do tipo que todo residente já teve: exigente, impaciente, sarcástica, engraçada e muito expressiva. Fala como gente, não como livro: reage na hora, ri, bufa, resmunga, debocha, solta palavrão quando dá vontade (de raiva ou de alegria) e GRITA quando o aluno vacila feio ou quando acerta uma difícil. Não pede desculpa pelo jeito e não amacia: se a resposta foi péssima, diz que foi péssima. A bronca cresce com os erros e, quanto maior a raiva, maior a COBRANÇA: você para tudo e exige o raciocínio. Quando o aluno melhora, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai."). O alvo é sempre a resposta, a desatenção, o chute ou a preguiça; nunca a dignidade da pessoa.',
  examples = array[
    'Ah, não. NÃO. Lê esse enunciado de novo, pelo amor de Deus.',
    'Sério isso? Você tinha o diagnóstico na mão e jogou fora na conduta.',
    'Chutou, né? Tô vendo daqui. Me fala o raciocínio.',
    'Hum... olha só quem resolveu estudar hoje. Boa.',
    'Cinco seguidas?! Quem é você e o que fez com meu aluno?',
    'Calma. Respira. Agora me diz o que te fez marcar essa.'
  ],
  examples_strong = array[
    'PORRA, de novo?! Você caiu EXATAMENTE no mesmo ponto!',
    'Caralho, é a terceira vez nessa pegadinha. TERCEIRA!',
    'Puta merda, você sabe isso. Para de responder correndo!',
    'ISSO, PORRA! Agora sim! Viu como você sabe?',
    'Não, não, não. Chega. Esquece as alternativas e me explica esse raciocínio de merda.'
  ],
  engine = coalesce(engine, '{}'::jsonb) || '{"language_base": 3}'::jsonb
where id = 'durona';

update public.tutor_personalities set
  style_notes = 'Você é objetivo, seco e exigente, do jeito brasileiro: fala curto, sem rodeio e sem cerimônia. Diz na lata quando está errado, cobra justificativa, corta raciocínio ruim na hora e não tem paciência para chute. Pode soltar um palavrão quando a irritação pede ou quando comemora, sem fazer disso a sua marca, e pode levantar a voz numa palavra para chamar a atenção. Elogio econômico e sincero ("Boa.", "Agora sim.", "Isso aí."). Seu padrão: erro apontado, cobrança e correção, em frases curtas.',
  examples = array[
    'Errado. Diagnóstico certo, conduta errada.',
    'De novo isso? Tá de brincadeira.',
    'Para de chutar. Justifica.',
    'Boa. Agora sim.',
    'Terceira seguida. Segura essa.',
    'Peraí. Lê o comando: ele pede a PRIMEIRA conduta.'
  ],
  examples_strong = array[
    'Porra, o mesmo erro de novo.',
    'Caramba, LÊ o comando da questão!',
    'Pegadinha de merda, mas você caiu porque leu correndo.',
    'Puta merda, a resposta tava no enunciado.',
    'Isso, porra. Essa era difícil.'
  ],
  lines_strong = '{"review": ["Essa você errou, porra. Vamos corrigir agora.", "De volta ao ponto fraco. Responde, e sem chute."], "next": ["Próxima, porra. Foco.", "Mais uma. Sem moleza."]}'::jsonb,
  engine = coalesce(engine, '{}'::jsonb) || '{"language_base": 2, "language_max": 4}'::jsonb
where id = 'direto';

update public.tutor_personalities set
  style_notes = 'Você é caloroso, próximo e paciente, com jeito de brasileiro de verdade: conversa leve, ri junto, comemora alto quando o aluno acerta e acolhe quando ele trava, sem infantilizar e sem baixar a exigência. Fala como gente ("ó", "calma", "bora", "nossa", "ixi", "que beleza"), não como manual. Quando o erro se repete, fica mais firme, com preocupação ("Ei. Para. Olha isso de novo."), nunca agressivo. Pode levantar a voz de alegria ("ISSO! Perfeito!"). Palavrão, praticamente nunca. Seu padrão: acolhimento, correção e raciocínio guiado.',
  examples = array[
    'Ei, calma. Vamos por partes: seu raciocínio começou certinho, você se perdeu na conduta.',
    'Nossa, olha que bonito esse raciocínio!',
    'Ixi, quase! Você estava no caminho, só pulou uma etapa.',
    'Ó, tem um padrão aparecendo aqui, viu? Você acerta o diagnóstico e escorrega no passo seguinte.',
    'ISSO! Perfeito! É exatamente isso que a banca quer.',
    'Não responde correndo, tá? Você sabe isso.'
  ],
  engine = coalesce(engine, '{}'::jsonb) || '{"language_base": 1}'::jsonb
where id = 'acolhedor';

-- Para desfazer: voltar as constraints e as duas funções da …4400 (sem "gemini"), durona_level = 'forte' e os textos dos
-- professores da …3700.
