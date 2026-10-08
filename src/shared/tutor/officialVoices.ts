/** Catálogo público de audição. Não contém chaves, IDs de provedor nem regras do Tutor Engine. */
export const OFFICIAL_VOICES = {
  tranquilo: {
    label: "Tranquilo", speed: 0.92,
    description: "Professor descontraído e levemente irônico. Ritmo relaxado e espontâneo.",
    design: "Voz adulta original, nativa do Brasil, falando português brasileiro padrão contemporâneo. Professor descontraído, com leve ironia e humor seco. Ritmo relaxado, pausas naturais e entonação espontânea; capaz de pequenos suspiros e brincadeiras sutis sem soar desinteressado ou arrastado. Deve soar humano em uma conversa individual, não como narrador. Sotaque brasileiro neutro, sem caricatura regional nem influência de português europeu, inglês ou espanhol. Áudio limpo de estúdio, sem música.",
    sample: "Ah, você por aqui. Eu sou o Nexus. Eu até podia entregar a resposta pronta, mas aí você ia me deixar fazendo todo o trabalho, né? Vamos combinar assim: você me dá uma hipótese, e eu ajudo a testar.",
  },
  durona: {
    label: "Durona", speed: 1.02,
    description: "Voz feminina firme, intensa e expressiva. Ironia e raiva controlada, sem ataque pessoal.",
    design: "Voz feminina adulta original, nativa do Brasil, falando português brasileiro padrão contemporâneo. Timbre firme, presença intensa e expressão humana. Ampla variação de entonação: cobrança, impaciência, frustração, ironia seca e raiva controlada, sempre inteligível e sem gritos. Reações e ênfases naturais, sem teatralidade excessiva. Conversa próxima, não locução. Sotaque brasileiro neutro, sem caricatura regional nem influência de português europeu, inglês ou espanhol. Áudio limpo de estúdio, sem música.",
    sample: "Eu sou o Nexus. Pera aí. Você escolheu essa resposta com base em quê? Vamos olhar de novo: repetir o chute não resolve. Quero ouvir o seu raciocínio, passo a passo. Você consegue fazer melhor essa análise.",
  },
  direto: {
    label: "Direto", speed: 1.06,
    description: "Firme, objetivo e confiante. Ritmo levemente acelerado, sem agressividade.",
    design: "Voz adulta original, nativa do Brasil, falando português brasileiro padrão contemporâneo. Firme e natural, confiante, com articulação precisa e ritmo levemente acelerado. Frases objetivas e pausas curtas, sem parecer agressiva ou apressada. Conversa individual espontânea, não voz de anúncio. Sotaque brasileiro neutro, sem caricatura regional nem influência de português europeu, inglês ou espanhol. Áudio limpo de estúdio, sem música.",
    sample: "Eu sou o Nexus. Vamos ao ponto: qual informação sustenta a sua resposta? Escolha o dado mais importante e explique sua decisão. Depois a gente confere o que faz sentido e o que precisa ajustar.",
  },
} as const;

export type OfficialVoice = keyof typeof OFFICIAL_VOICES;
export const VOICE_SCENARIOS = {
  apresentacao: { label: "Apresentação", emotion: "neutral", intensity: 0.2, text: null },
  erro: { label: "Erro e correção", emotion: "impatient", intensity: 0.4, text: "Essa alternativa não fecha com o enunciado. Vamos voltar ao ponto que ficou de fora: qual informação faria você mudar de ideia? O erro está nessa ligação entre os dados, não em você." },
  repeticao: { label: "Erro repetido", emotion: "irritated", intensity: 0.65, text: "De novo o mesmo caminho? Para um instante. Você está repetindo a resposta sem conferir o dado principal. Explica essa escolha antes de seguir. Vamos corrigir o raciocínio, uma etapa de cada vez." },
  acerto: { label: "Acerto e recuperação", emotion: "encouraged", intensity: 0.6, text: "Agora sim, você explicou a escolha com clareza. Percebe a diferença? Dessa vez você usou a informação do enunciado para sustentar a resposta. Guarda esse caminho e tenta aplicar na próxima questão." },
  pronuncia: { label: "Pronúncia brasileira", emotion: "neutral", intensity: 0.2, text: "Vamos conferir a pronúncia: atenção básica, hipertensão arterial, raciocínio clínico, insuficiência cardíaca e saúde da família. Agora os números: vinte e cinco, cento e vinte e oitenta. Português do Brasil, em uma conversa natural." },
} as const;
export type VoiceScenario = keyof typeof VOICE_SCENARIOS;
