import { ClinicalAudioSummary, WeeklyReadinessBulletin, GroundedGuidelineAuditResult, UserProfile, MedicalArea } from "../types";

export class AudioSummaryService {
  private static synth: SpeechSynthesis | null = typeof window !== "undefined" ? window.speechSynthesis : null;
  private static currentUtterance: SpeechSynthesisUtterance | null = null;

  /**
   * Pre-curated high-yield audio flash summaries based on the most tested Revalida INEP themes
   */
  static getCuratedAudioSummaries(): ClinicalAudioSummary[] {
    return [
      {
        id: "audio-preeclampsia",
        theme: "Pré-Eclâmpsia e Eclâmpsia (DHEG)",
        area: "GINECOLOGIA_OBSTETRICIA",
        title: "Conduta Rápida: Esquema de Zuspan e Critérios de Gravidade",
        durationSeconds: 165,
        guidelineRef: "Ministério da Saúde / FEBRASGO 2026",
        highYieldDoseOrProtocol: "Sulfato de Mg 4g IV (ataque 20min) + 1g/h contínuo (manutenção)",
        keyPoints: [
          "Definição: PA ≥ 140x90 após 20 sem + proteinúria OU disfunção de órgão-alvo.",
          "Sinais de iminência: Cefaleia refratária, escotomas, dor em barra no epigástrio, hiper-reflexia.",
          "Sulfato de Magnésio é neuroproteção e profilaxia da convulsão, NÃO é anti-hipertensivo primário.",
          "Anti-hipertensivo de urgência se PA ≥ 160x110: Hidralazina IV ou Nifedipino oral.",
          "Vigilância do Sulfato: Reflexo patelar presente, diurese > 25 mL/h e FR > 16 irpm.",
        ],
        audioScript: `Resumo Clínico de Alto Rendimento para o Revalida INEP: Pré-eclâmpsia grave e Eclâmpsia.
Atenção à regra de ouro do Ministério da Saúde: diante de uma gestante após vinte semanas com pressão arterial acima de cento e sessenta por cento e dez, ou com sinais de iminência de eclâmpsia como cefaleia, escotomas e epigastralgia, a conduta prioritária e imediata é o início do Sulfato de Magnésio.
O esquema preferencial é o de Zuspan: quatro gramas endovenosos em vinte minutos no ataque, seguido de um grama por hora em infusão contínua na manutenção.
Lembre-se: o sulfato previne convulsões. Para baixar a pressão na urgência, utilize Hidralazina endovenosa ou Nifedipino oral de liberação rápida.
Durante a infusão do magnésio, monitore estritamente o reflexo patelar, a frequência respiratória acima de dezesseis incursões por minuto e a diurese horária. Se houver intoxicação com parada respiratória ou abolição de reflexos, o antídoto imediato é o Gluconato de Cálcio a dez por cento, um grama endovenoso lento.`,
      },
      {
        id: "audio-sepse",
        theme: "Sepse e Choque Séptico",
        area: "CLINICA_MEDICA",
        title: "Pacote da 1ª Hora e Ressuscitação Volêmica no SUS",
        durationSeconds: 150,
        guidelineRef: "ILAS / Protocolo de Sepse do Ministério da Saúde",
        highYieldDoseOrProtocol: "Cristaloide 30 mL/kg nas primeiras 3h + Noradrenalina se PAM < 65",
        keyPoints: [
          "Critério: Suspeita de infecção + disfunção orgânica aguda (aumento no SOFA ≥ 2 ou qSOFA positivo na triagem).",
          "1ª Hora: Dosar lactato, colher 2 pares de hemoculturas ANTES do antimicrobiano.",
          "Administrar antibiótico de amplo espectro na primeira hora.",
          "Volume de cristaloide: 30 mL/kg em caso de hipotensão (PAM < 65) ou lactato sérico ≥ 4 mmol/L.",
          "Vasopressor de primeira escolha: Noradrenalina IV precoce para manter PAM ≥ 65 mmHg.",
        ],
        audioScript: `Protocolo de Sepse no SUS: O pacote da primeira hora que você não pode errar na prova teórica ou no OSCE.
Primeiro passo: Identifique a disfunção orgânica com o qSOFA na triagem: frequência respiratória acima de vinte e duas, alteração do nível de consciência ou pressão sistólica menor ou igual a cem milímetros de mercúrio.
Segundo passo: Coleta imediata do lactato sérico e de dois pares de hemoculturas de sítios diferentes. Não atrase o antibiótico por mais de sessenta minutos!
Terceiro passo: Antibioticoterapia de amplo espectro venosa na primeira hora.
Quarto passo: Ressuscitação volêmica com solução cristaloide a trinta mililitros por quilo se houver hipotensão arterial ou lactato igual ou maior a quatro milimoles por litro.
Quinto passo: Se a pressão arterial média permanecer abaixo de sessenta e cinco milímetros de mercúrio após ou durante o volume inicial, inicie imediatamente o vasopressor, sendo a Noradrenalina a primeira escolha absoluta.`,
      },
      {
        id: "audio-has-dm",
        theme: "Hipertensão e Diabetes na Atenção Primária",
        area: "MEDICINA_FAMILIA_COMUNIDADE",
        title: "Estratificação Cardiovascular e Metas Terapêuticas na UBS",
        durationSeconds: 140,
        guidelineRef: "Diretrizes Brasileiras de Hipertensão (SBC 2026) e SBD",
        highYieldDoseOrProtocol: "Metas PA < 130x80 mmHg e HbA1c < 7% para a maioria dos adultos",
        keyPoints: [
          "Diagnóstico de HAS: MAPA, MRPA ou 2 medidas de consultório em consultas distintas ≥ 140x90.",
          "Tratamento estágio 1 com risco moderado/alto ou estágio 2: Associação inicial de 2 drogas (IECA/BRA + BCC ou Diurético Tiazídico).",
          "Diabetes Mellitus 2: Metformina é base; associar iSGLT2 ou análogo de GLP-1 em pacientes com doença aterosclerótica, insuficiência cardíaca ou DRC.",
          "Acompanhamento na ESF: Rastreio anual de microalbuminúria e retinopatia diabética.",
        ],
        audioScript: `Manejo Crônico na Atenção Primária à Saúde: Hipertensão e Diabetes segundo a SBC e Sociedade Brasileira de Diabetes.
No paciente hipertenso estágio dois, ou estágio um de alto risco cardiovascular, a diretriz atual recomenda o início imediato com combinação dupla de medicamentos em doses baixas. As associações padrão do SUS combinam um bloqueador do sistema renina-angiotensina, como Enalapril ou Losartana, com um bloqueador dos canais de cálcio, como Anlodipino, ou um diurético tiazídico, como Hidroclorotiazida ou Clortalidona.
No diabetes mellitus tipo dois, a Metformina permanece como alicerce inicial associada a mudanças no estilo de vida. No entanto, se o paciente apresentar insuficiência cardíaca ou doença renal crônica com albuminúria, o inibidor de SGLT2 como a Dapagliflozina tem indicação mandatória comprovada para reduzir desfechos e internações.`,
      },
      {
        id: "audio-atls",
        theme: "Atendimento Inicial ao Politraumatizado (ABCDE)",
        area: "CIRURGIA_GERAL",
        title: "Condutas Críticas no Trauma Torácico e Abdominal",
        durationSeconds: 160,
        guidelineRef: "ATLS 10ª/11ª Edição & Protocolo do SAMU 192",
        highYieldDoseOrProtocol: "Pneumotórax Hipertensivo: Descompressão por punção imediata no 4º/5º EIC",
        keyPoints: [
          "A: Vias aéreas com controle cervical estrito (colar cervical + prancha/coxins).",
          "B: Pneumotórax hipertensivo = diagnóstico clínico. NÃO pedir radiografia. Punção imediata no 4º ou 5º espaço intercostal anterior à linha axilar média, seguida de drenagem tubular em selo d'água no 5º EIC.",
          "C: Controle de hemorragia externa exanguinante (torniquete precoce) e protocolo de transfusão maciça 1:1:1.",
          "D: Avaliação neurológica pela Escala de Coma de Glasgow atualizada com reatividade pupilar.",
          "E: Exposição completa e prevenção rigorosa da hipotermia.",
        ],
        audioScript: `Cirurgia Geral no Revalida: Sequência sistematizada do ABCDE no Trauma.
Na letra A, garanta via aérea pérvia mantendo alinhamento e estabilização manual da coluna cervical.
Na letra B, se deparar com paciente hipotenso, taquipneico, com turgência jugular, desvio traqueal e murmúrio abolido unilateralmente, reconheça o Pneumotórax Hipertensivo. Jamais solicite radiografia de tórax nessa situação! A conduta imediata que salva vidas é a descompressão torácica por agulha calibrosa no quarto ou quinto espaço intercostal na linha axilar média ou anterior, procedendo logo em seguida com a toracostomia com drenagem pleural em selo d'água no quinto espaço.
Na letra C, priorize a contenção de sangramentos visíveis com torniquetes ou compressão direta, e institua ressuscitação hemostática balanceada com concentrado de hemácias, plasma fresco e plaquetas na proporção um para um para um, evitando a tríade letal da coagulopatia, acidose e hipotermia.`,
      },
    ];
  }

  /**
   * Text-to-Speech playback using Native Browser Web Speech API
   */
  static speak(
    text: string,
    options?: {
      rate?: number;
      pitch?: number;
      onEnd?: () => void;
      onError?: () => void;
    }
  ): void {
    if (!this.synth) {
      console.warn("Speech synthesis not supported in this browser environment.");
      return;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = options?.rate || 1.05; // Slightly brisk for medical efficiency
    utterance.pitch = options?.pitch || 1.0;

    // Pick best Portuguese voice available
    const voices = this.synth.getVoices();
    const ptVoice = voices.find((v) => v.lang.startsWith("pt") || v.lang.includes("BR"));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    if (options?.onEnd) utterance.onend = options.onEnd;
    if (options?.onError) utterance.onerror = options.onError;

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  static stop(): void {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
  }

  static pause(): void {
    if (this.synth) {
      this.synth.pause();
    }
  }

  static resume(): void {
    if (this.synth) {
      this.synth.resume();
    }
  }

  static isSpeaking(): boolean {
    return !!this.synth?.speaking;
  }
}
