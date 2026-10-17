/** Catálogo público de audição. Não contém chaves, IDs de provedor nem regras do Tutor Engine. */
export const OFFICIAL_VOICES = {
  stazi: {
    label: "Stazi", speed: 0.98,
    description: "Voz masculina do Stazi, usada pelo Durão e pelo Tranquilo. Natural, próxima, firme quando precisa e calma quando dá.",
    design: "Voz masculina adulta original, nativa do Brasil, falando português brasileiro padrão contemporâneo. Professor jovem e próximo, de timbre médio e presença firme. Ampla variação de entonação: calma e sem pressa nas explicações, com humor seco; firme, impaciente e irônica nas cobranças, sempre inteligível e sem gritos. Pequenos suspiros e brincadeiras sutis sem soar desinteressado nem arrastado. Deve soar humano em uma conversa individual, não como narrador. Sotaque brasileiro neutro, sem caricatura regional nem influência de português europeu, inglês ou espanhol. Áudio limpo de estúdio, sem música.",
    sample: "Ah, você por aqui. Eu sou o Nexus. Eu até podia entregar a resposta pronta, mas aí você ia me deixar fazendo todo o trabalho, né? Vamos combinar assim: você me dá uma hipótese, e eu ajudo a testar.",
  },
  stazia: {
    label: "Stazia", speed: 1.0,
    description: "Voz feminina da Stazia, usada pela Durona e pela Tranquila. Expressiva: firme e irônica quando cobra, calma e acolhedora quando dá.",
    design: "Voz feminina adulta original, nativa do Brasil, falando português brasileiro padrão contemporâneo. Professora jovem e próxima, de timbre médio e presença marcante. Ampla variação de entonação: calma, acolhedora e sem pressa nas explicações; firme, impaciente e irônica nas cobranças, com raiva controlada, sempre inteligível e sem gritos. Reações e ênfases naturais, sem teatralidade excessiva. Conversa próxima, não locução. Sotaque brasileiro neutro, sem caricatura regional nem influência de português europeu, inglês ou espanhol. Áudio limpo de estúdio, sem música.",
    sample: "Eu sou o Nexus. Pera aí. Você escolheu essa resposta com base em quê? Vamos olhar de novo: repetir o chute não resolve. Quero ouvir o seu raciocínio, passo a passo. Você consegue fazer melhor essa análise.",
  },
} as const;

export type OfficialVoice = keyof typeof OFFICIAL_VOICES;
export const VOICE_SCENARIOS = {
  apresentacao: { label: "Apresentação", emotion: "neutral", intensity: 0.2, text: null },
  erro: { label: "Erro e correção", emotion: "impatient", intensity: 0.4, text: "Essa alternativa não fecha com o enunciado. Vamos voltar ao ponto que ficou de fora: qual informação faria você mudar de ideia? O erro está nessa ligação entre os dados, não em você." },
  repeticao: { label: "Erro repetido", emotion: "irritated", intensity: 0.65, text: "De novo o mesmo caminho? Para um instante. Você está repetindo a resposta sem conferir o dado principal. Explica essa escolha antes de seguir. Vamos corrigir o raciocínio, uma etapa de cada vez." },
  acerto: { label: "Acerto e recuperação", emotion: "encouraged", intensity: 0.6, text: "Agora sim, você explicou a escolha com clareza. Percebe a diferença? Dessa vez você usou a informação do enunciado para sustentar a resposta. Guarda esse caminho e tenta aplicar na próxima questão." },
  pronuncia: { label: "Pronúncia brasileira", emotion: "neutral", intensity: 0.2, text: "Vamos conferir a pronúncia: atenção básica, hipertensão arterial, raciocínio clínico, insuficiência cardíaca e saúde da família. Agora os números: vinte e cinco, cento e vinte e oitenta. Português do Brasil, em uma conversa natural." },
  // Nexus: o Durão e a Durona firmes no 1º erro e aliviados no acerto depois de errar (as duas vozes têm uma personalidade assim)
  firme: { label: "1º erro firme", emotion: "firm", intensity: 0.3, text: "Sério isso? Você tinha o diagnóstico na mão e jogou fora na conduta." },
  alivio: { label: "Alívio com palavrão", emotion: "relieved", intensity: 0.35, text: "Ufa, porra, até que enfim! Dessa vez você usou a informação do enunciado para sustentar a resposta." },
} as const;
export type VoiceScenario = keyof typeof VOICE_SCENARIOS;

/** Cenários de audição de uma voz: os cinco comuns, na ordem de sempre, e depois os só dela. */
export function scenariosFor(id: OfficialVoice): VoiceScenario[] {
  return (Object.keys(VOICE_SCENARIOS) as VoiceScenario[]).filter((k) => {
    const only = (VOICE_SCENARIOS[k] as { only?: OfficialVoice }).only;
    return !only || only === id;
  });
}
