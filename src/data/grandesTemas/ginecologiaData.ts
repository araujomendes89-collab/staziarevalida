import { GrandeTema } from "../../types/grandesTemas";

export const GINECOLOGIA_THEMES: GrandeTema[] = [
  {
    id: "go-01",
    title: "Assistência Pré-Natal",
    slug: "assistencia-pre-natal-sus",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetrícia",
    order: 1,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 32 questões em provas do Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 38,
    priority: "Crítica",
    summary: "Caderno de Atenção Básica nº 32 do MS: mínimo de 6 consultas de pré-natal (idealmente mensal até 28 sem, quinzenal até 36 sem, semanal até o parto), cálculo da DPP (Regra de Nägele) e IG, exames de rotina no 1º, 2º e 3º trimestres, vacinação da gestante (dTpa, dT, Hepatite B, Influenza e Covid-19) e suplementação de ácido fólico e sulfato ferroso.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Aplicação da vacina dTpa a partir da 27ª semana gestacional.",
      currentConduct: "Aplicação da vacina dTpa a partir da 20ª semana gestacional a cada gestação para transferência de anticorpos contra coqueluche ao feto. Rastreamento universal de estreptococo do grupo B (GBS) com swab anovaginal entre 35 e 37 semanas.",
      previousDoc: "Manual de Pré-Natal MS 2012",
      currentDoc: "Manual Técnico de Pré-Natal e Puerpério - Ministério da Saúde / FEBRASGO 2024/2026",
      year: "2026",
      revalidaImpact: "Candidato deve saber calcular a DPP pela Regra de Nägele e aplicar a rotina laboratorial trimestral do SUS.",
    },
    visualTreeMap: `ASSISTÊNCIA PRÉ-NATAL NO SUS
├── Cálculo da DPP (Regra de Nägele: Dia da DUM + 7 / Mês: Se jan-mar +9, se abr-dez -3 + 1 ano)
├── Rotina de Exames no 1º Trimestre
│   ├── Tipagem Sanguínea e Fator Rh + Coombs Indireto se Rh negativo
│   ├── Hemograma completo + Glicemia de jejum (<92 mg/dL)
│   ├── VDRL / Teste Rápido de Sífilis + Teste Rápido HIV + HBsAg + Toxoplasmose IgM/IgG
│   └── Urina Tipo 1 + Urocultura com antibiograma + Parasitológico de fezes
├── Vacinação da Gestante: dTpa (a partir da 20ª semana a cada gestação) + dT + Hepatite B + Influenza
└── Rastreio de Streptococcus agalactiae (GBS): Swab vaginorretal entre 35 e 37 semanas de gestação`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 32,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Primigesta na 8ª semana de gestação com DUM em 15/05/2025 para cálculo de IG e solicitação de rotina."],
      frequentTriggers: ["Cálculo correto da Regra de Nägele e indicação da vacina dTpa a partir da 20ª semana."],
      mostTestedDiagnosis: "Rotina de pré-natal de risco habitual na Estratégia Saúde da Família.",
      mostTestedConduct: "Solicitação dos exames do 1º trimestre, prescrição de Sulfato Ferroso (40 mg de ferro elementar) e Ácido Fólico (400 mcg).",
      recurringDistractors: ["Indicar vacinação contra tríplice viral ou febre amarela com vírus vivo em gestantes sem indicação estrita."],
      cognitiveMatrixPattern: "A banca exige precisão cirúrgica na rotina de exames preconizada pelo Ministério da Saúde.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / FEBRASGO",
        document: "Manual de Atenção ao Pré-Natal de Baixo Risco",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-02",
    title: "Síndromes Hipertensivas da Gestação",
    slug: "sindromes-hipertensivas-da-gestacao",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 2,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 34 questões no banco Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 40,
    priority: "Crítica",
    summary: "Classificação das 4 formas clínicas: Hipertensão Arterial Crônica (antes de 20 sem), Hipertensão Gestacional, Pré-eclâmpsia (após 20 sem com proteinúria ou LOA: plaquetopenia, creatinina > 1.1, transaminases 2x, EAP, sintomas visuais/cerebrais) e Pré-eclâmpsia sobreposta. Protocolo de Sulfato de Magnésio (Pritchard ou Zuspan) com controle de reflexo patelar/diurese e anti-hipertensivos de crise (Hidralazina EV, Labetalol e Nifedipino).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Proteinúria de 24h >= 300 mg obrigatória para o diagnóstico de pré-eclâmpsia.",
      currentConduct: "Diagnóstico de Pré-eclâmpsia NÃO exige proteinúria se houver sinais de disfunção de órgãos-alvo (critérios de gravidade da FEBRASGO/ACOG). Prevenção com AAS 100-150 mg à noite + Carbonato de Cálcio 1,5 g/dia a partir de 12-16 semanas para gestantes de alto risco.",
      previousDoc: "Manual de Gestação de Alto Risco MS 2012",
      currentDoc: "Diretrizes de Síndromes Hipertensivas na Gestação - FEBRASGO / MS 2024/2026",
      year: "2026",
      revalidaImpact: "Tema obrigatório em provas práticas de OSCE e questões teóricas com o protocolo de Sulfato de Magnésio.",
    },
    visualTreeMap: `SÍNDROMES HIPERTENSIVAS NA GESTAÇÃO
├── Hipertensão Crônica: PA >= 140/90 antes de 20 semanas de gestação
├── Pré-eclâmpsia: PA >= 140/90 após 20 semanas + Proteinúria (>=300mg) OU Sinais de Gravidade
│   ├── Critérios de Gravidade: PA >= 160/110, Plaquetas < 100.000, Creatinina > 1.1, TGO/TGP > 2x, Edema Agudo de Pulmão, Escotomas/Cefaleia
│   └── Síndrome HELLP: Hemólise (Esquizócitos, LDH >600, Bilirrubina >1.2) + Enzimas hepáticas elevadas + Plaquetopenia (<100.000)
├── Eclâmpsia: Convulsões tônico-clônicas generalizadas em paciente com pré-eclâmpsia
└── Terapia Farmacológica de Emergência
    ├── Prevenção / Tratamento de Convulsões: Sulfato de Magnésio (Esquema de Zuspan EV ou Pritchard IM)
    │   └── Antídoto do Sulfato de Magnésio: Gluconato de Cálcio 10% se Hiporreflexia patelar ou Bradipneia (<16 irpm)
    └── Crise Hipertensiva (PA >= 160/110 mmHg): Hidralazina EV 5mg ou Nifedipino oral 10-20mg de ação rápida`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 34,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Gestante de 34 semanas com PA 170x110 mmHg, cefaleia intensa, turvação visual e hiperreflexia."],
      frequentTriggers: ["Prescrição imediata de Sulfato de Magnésio antes de qualquer outra conduta obstétrica."],
      mostTestedDiagnosis: "Pré-eclâmpsia com sinais de gravidade / Iminência de Eclâmpsia.",
      mostTestedConduct: "Iniciar Sulfato de Magnésio (dose de ataque 4g EV + manutenção 1g/h) e Hidralazina EV para controle pressórico.",
      recurringDistractors: ["Indicar cesariana de emergência antes de estabilizar a paciente com sulfato de magnésio e anti-hipertensivo."],
      cognitiveMatrixPattern: "A regra de ouro do INEP: Primeiro sulfatar e controlar a pressão, depois planejar a interrupção da gestação.",
    },
    sources: [
      {
        institution: "FEBRASGO / Ministério da Saúde",
        document: "Protocolo Clínico e Diretrizes Terapêuticas - Hipertensão na Gestação",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-03",
    title: "Diabetes Gestacional",
    slug: "diabetes-mellitus-gestacional-dmg",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetrícia",
    order: 3,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 24 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 28,
    priority: "Crítica",
    summary: "Critérios IADPSG / Ministério da Saúde: Glicemia de jejum no 1º trimestre (92 a 125 mg/dL = DMG; >= 126 mg/dL = DM Pré-gestacional / Overt Diabetes) e TOTG 75g entre 24-28 semanas (jejum >= 92, 1h >= 180, 2h >= 153 mg/dL - 1 valor alterado fecha diagnóstico). Manejo com MEV e indicação de Insulina se metas não atingidas.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `DIABETES MELLITUS GESTACIONAL (DMG)
├── Rastreamento no 1º Trimestre (Glicemia de Jejum)
│   ├── < 92 mg/dL: Normal → Realizar TOTG 75g entre 24 e 28 semanas
│   ├── 92 a 125 mg/dL: Diagnóstico de DIABETES GESTACIONAL (DMG)
│   └── >= 126 mg/dL (ou HbA1c >=6.5%): DIABETES PRÉ-GESTACIONAL (Overt Diabetes)
├── Teste Oral de Tolerância à Glicose (TOTG 75g) entre 24 e 28 semanas
│   └── Pontos de Corte (1 valor alterado confirma DMG): Jejum >= 92 mg/dL | 1 hora >= 180 mg/dL | 2 horas >= 153 mg/dL
└── Tratamento e Metas Glicêmicas
    ├── Dieta fracionada e atividade física por 2 semanas
    ├── Metas: Jejum < 95 mg/dL e 1h pós-prandial < 140 mg/dL (ou 2h < 120 mg/dL)
    └── Se não atingir metas em 30% das medidas → Insulinoterapia (NPH + Regular/Lispro)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 24,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Gestante na 10ª semana de gestação com glicemia de jejum de 96 mg/dL."],
      frequentTriggers: ["Diagnóstico imediato de DMG no primeiro trimestre com um único valor de glicemia de jejum entre 92 e 125 mg/dL."],
      mostTestedDiagnosis: "Diabetes Mellitus Gestacional.",
      mostTestedConduct: "Orientar mudanças no estilo de vida (dieta + exercícios), automonitorização glicêmica e NÃO solicitar TOTG.",
      recurringDistractors: ["Solicitar TOTG 75g para confirmar diagnóstico quando a glicemia de jejum inicial já foi >= 92 mg/dL."],
      cognitiveMatrixPattern: "A banca avalia se o candidato sabe que basta uma glicemia de jejum >= 92 mg/dL no 1º trimestre para fechar o diagnóstico.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / Sociedade Brasileira de Diabetes / FEBRASGO",
        document: "Rastreamento e Diagnóstico de Diabetes Mellitus Gestacional no Brasil",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-04",
    title: "Sangramento na Primeira Metade da Gestação",
    slug: "sangramentos-primeira-metade-gestacao",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 4,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 26 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Diagnóstico diferencial das 4 causas principais: Abortamento (Ameaça, Incompleto, Completo, Retido, Infectado com febre/secreção fétida e Inevitável), Gravidez Ectópica (trompa/ampola, critérios para Metotrexato sistêmico vs cirurgia laparoscópica), Doença Trofoblástica Gestacional / Mola Hidatiforme (vesículas em cachos de uva, beta-hCG desproporcionalmente alto) e Incompetência Istmocervical (cerclagem de McDonald).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SANGRAMENTOS DA 1ª METADE (< 20 SEMANAS)
├── Abortamento (<20-22 semanas / <500g)
│   ├── Ameaça de Aborto: Colo FECHADO, BCF presente, sangramento discreto → Repouso relativo
│   ├── Abortamento Incompleto: Colo ABERTO, restos ovulares na cavidade → AMIU ou Curetagem uterina
│   ├── Abortamento Retido: Colo FECHADO, embrião sem BCF (CCN >7mm sem BCF) → Esvaziamento uterino
│   └── Abortamento Infectado: Colo ABERTO, febre, dor à palpação, secreção fétida → Clindamicina + Gentamicina + Esvaziamento
├── Gravidez Ectópica: Dor pélvica unilateral + Atraso menstrual + Sangramento escuro ('borra de café')
│   ├── Tratamento Clínico com Metotrexato: Massa < 3,5-4,0 cm, beta-hCG < 5.000 mUI/mL, sem BCF e paciente estável
│   └── Tratamento Cirúrgico: Instabilidade hemodinâmica ou rotura tubária → Laparotomia / Salpingectomia
└── Doença Trofoblástica Gestacional (Mola Hidatiforme): Imagem em 'tempestade de neve' na USG + Vácuo-aspiração`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 26,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Gestante de 8 semanas com sangramento genital e dor cólica; exame especular com colo impérvio e USG com embrião vivo."],
      frequentTriggers: ["Identificação de Ameaça de Abortamento com colo fechado e vitalidade preservada."],
      mostTestedDiagnosis: "Ameaça de abortamento.",
      mostTestedConduct: "Conduta expectante, repouso, analgesia se dor e imunoglobulina anti-D se mãe Rh negativo.",
      recurringDistractors: ["Indicar curetagem uterina ou aspiração manual intrauterina em ameaça de aborto com feto vivo."],
      cognitiveMatrixPattern: "A banca exige diferenciação do estado do colo uterino (aberto vs fechado) e visualização ecográfica dos restos.",
    },
    sources: [
      {
        institution: "FEBRASGO",
        document: "Manual de Sangramento na Primeira Metade da Gestação",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-05",
    title: "Sangramento na Segunda Metade da Gestação",
    slug: "sangramentos-segunda-metade-gestacao",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 5,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 24 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 28,
    priority: "Crítica",
    summary: "Descolamento Prematuro de Placenta (DPP: dor abdominal súbita intensa, hipertonia uterina 'útero em madeira', sofrimento fetal e cesariana imediata) vs Placenta Prévia (sangramento indolor, vermelho vivo, recidivante, útero relaxado e PROIBIÇÃO do toque vaginal antes da USG) vs Rotura Uterina (Sinais de Bandl-Frommel e subida da apresentação) vs Vasa Prévia.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SANGRAMENTOS DA 2ª METADE (>= 20 SEMANAS)
├── Descolamento Prematuro de Placenta (DPP)
│   ├── Fatores de Risco: Hipertensão arterial (principal), trauma, uso de cocaína
│   ├── Quadro Clínico: Dor abdominal súbita, Sangramento escuro com coágulos, Hipertonia uterina ('útero lenhoso'), Sofrimento fetal agudo
│   └── Conduta: Parto pela via mais rápida (Cesariana na maioria / Amniotomia precoce)
├── Placenta Prévia (PP)
│   ├── Quadro Clínico: Sangramento indolor, Espontâneo, Vermelho-rutilante, Recidivante, Tônus uterino NORMAL
│   └── REGRA DE OURO: TOQUE VAGINAL ESTÁ ESTRITAMENTE PROIBIDO até confirmação por USG
└── Rotura Uterina: Dor intensa durante trabalho de parto com cessação súbita das contrações e palpação fácil de partes fetais`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 24,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Gestante de 35 semanas com hipertensão apresentando dor em cólica contínua, abdome rígido e bradicardia fetal."],
      frequentTriggers: ["Hipertonia uterina e sangramento escuro indicando DPP com necessidade de resolução imediata."],
      mostTestedDiagnosis: "Descolamento Prematuro de Placenta com sofrimento fetal agudo.",
      mostTestedConduct: "Amniotomia imediata e cesariana de urgência para salvar a vida fetal e materna.",
      recurringDistractors: ["Realizar toque vaginal em paciente com suspeita de placenta prévia sem antes fazer ultrassonografia."],
      cognitiveMatrixPattern: "A banca pune com nota zero qualquer indicação de toque vaginal às cegas em hemorragias da 2ª metade.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / FEBRASGO",
        document: "Urgências e Emergências Obstétricas - Hemorragias da Segunda Metade",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-06",
    title: "Trabalho de Parto",
    slug: "trabalho-de-parto-mecanismo-fases",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 6,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 18 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 22,
    priority: "Alta",
    summary: "Diagnóstico de Trabalho de Parto (>=2 contrações em 10 minutos rítmicas e dolorosas + apagamento e dilatação cervical >= 4-5 cm), os 4 períodos clínicos do parto (Dilatação, Expulsivo, Dequitação e Período de Greenberg) e mecanismo do parto cefálico de vértice (Insiduação, Descida, Flexão, Rotação interna, Desprendimento e Rotação externa).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `PERÍODOS CLÍNICOS DO TRABALHO DE PARTO
├── 1º Período: DILATAÇÃO (Fase latente até 4-5cm; Fase ativa a partir de 5cm com evolução de ~1cm/hora)
├── 2º Período: EXPULSIVO (Da dilatação total de 10cm até o nascimento do bebê - máximo 2-3h com analgesia)
├── 3º Período: DEQUITAÇÃO / SECUNDAMENTO (Do nascimento até a saída da placenta - Manobra ativa com Ocitocina 10 UI IM)
└── 4º Período: GREENBERG (Primeira hora pós-parto: Miotamponamento, Trombotamponamento, Indiferença miocárdica e Contratilidade)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 18,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1"],
      patientProfiles: ["Parturiente na fase ativa de trabalho de parto com dilatação de 6 cm e dinâmica uterina regular."],
      frequentTriggers: ["Diferenciação entre fase latente (falso trabalho de parto) e fase ativa verdadeira."],
      mostTestedDiagnosis: "Fase ativa do primeiro período do trabalho de parto.",
      mostTestedConduct: "Internação hospitalar, estímulo à deambulação, métodos não farmacológicos de alívio da dor e partograma.",
      recurringDistractors: ["Internar parturiente na fase latente com 2 cm de dilatação sem fatores de risco adicionais."],
      cognitiveMatrixPattern: "A banca apoia as diretrizes de desmedicalização e internação apenas na fase ativa franca.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / OMS",
        document: "Diretriz Nacional de Assistência ao Parto Normal",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-07",
    title: "Assistência ao Parto",
    slug: "assistencia-ao-parto-humanizado-boas-praticas",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 7,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 21 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 25,
    priority: "Crítica",
    summary: "Diretrizes Nacionais de Assistência ao Parto Normal do Ministério da Saúde: Boas práticas obstétricas (direito a acompanhante de livre escolha, dieta líquida, liberdade de posição, banho morno, massagens, ausculta intermitente do BCF), condutas PROIBIDAS ou não recomendadas de rotina (Manobra de Kristeller PROIBIDA, tricotomia, enema e episiotomia de rotina).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Realização rotineira de episiotomia mediolateral em primíparas para prevenir lacerações graves.",
      currentConduct: "Episiotomia de rotina formalmente CONTRAINDICADA. Manobra de Kristeller (pressão no fundo uterino) considerada VIOLÊNCIA OBSTÉTRICA e proscrita pelo Ministério da Saúde e OMS.",
      previousDoc: "Práticas Tradicionais Obstétricas",
      currentDoc: "Diretrizes Nacionais de Assistência ao Parto Normal - MS / FEBRASGO 2024",
      year: "2026",
      revalidaImpact: "Questão clássica em estações de OSCE e questões objetivas sobre humanização e direitos da parturiente.",
    },
    visualTreeMap: `BOAS PRÁTICAS NA ASSISTÊNCIA AO PARTO (MINISTÉRIO DA SAÚDE)
├── DIREITOS E PRÁTICAS RECOMENDADAS
│   ├── Presença de acompanhante de livre escolha garantida por lei (Lei nº 11.108/2005)
│   ├── Oferta de líquidos por via oral durante o trabalho de parto
│   ├── Liberdade de movimentação e posições verticais/cócoras no período expulsivo
│   ├── Métodos não farmacológicos de alívio da dor (Banho de chuveiro morno, bola de bobath, massagem lombossacral)
│   └── Ausculta intermitente do BCF a cada 15-30 min na fase ativa e a cada 5 min no expulsivo
└── PRÁTICAS PROSCRITAS / CONDENADAS
    ├── Manobra de Kristeller (Pressão no fundo uterino) → PROIBIDA
    ├── Tricotomia pubiana e Enema evacuador de rotina → NÃO REALIZAR
    ├── Episiotomia rotineira → NÃO RECOMENDADA
    └── Amniotomia precoce de rotina sem indicação médica clara`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 21,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Parturiente no período expulsivo com evolução fisiológica normal."],
      frequentTriggers: ["Recusa e condenação formal da Manobra de Kristeller e da episiotomia profilática."],
      mostTestedDiagnosis: "Assistência ao parto normal humanizado.",
      mostTestedConduct: "Garantir acompanhante, permitir posição de escolha e aguardar desprendimento espontâneo protegendo o períneo (Hands-on/Hands-poised).",
      recurringDistractors: ["Executar manobra de Kristeller para acelerar o desprendimento do polo cefálico."],
      cognitiveMatrixPattern: "A banca do INEP pune severamente qualquer prática que configure violência obstétrica.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Diretrizes Nacionais de Assistência ao Parto Normal",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-08",
    title: "Indução do Trabalho de Parto",
    slug: "inducao-trabalho-de-parto-bishop",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 8,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 15 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 18,
    priority: "Alta",
    summary: "Avaliação do colo uterino pelo Índice de Bishop (Dilatação, Apagamento, Consistência, Posição e Altura de De Lee): Colo Favorável (Bishop > 6 → Ocitocina EV) vs Colo Desfavorável (Bishop <= 6 → Preparo cervical com Misoprostol vaginal ou Método mecânico de Krause com sonda de Foley se cesariana anterior). Contraindicação formal de misoprostol em cicatriz uterina prévia.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `INDUÇÃO DO TRABALHO DE PARTO
├── Cálculo do Índice de Bishop (Dilatação 0-3cm, Apagamento 0-80%, Posição Posterior/Média/Anterior, Consistência Firme/Média/Amolecida, Altura De Lee -3 a +1)
├── Bishop > 6 (Colo Favorável / Maduro)
│   └── Indução com OCITOCINA EV em bomba de infusão contínua + Amniotomia
└── Bishop <= 6 (Colo Desfavorável / Imaturo)
    ├── Sem Cicatriz Uterina Prévia → MISOPROSTOL 25 mcg em fundo de saco de 6 em 6 horas
    └── Com Cicatriz Uterina Prévia (Cesárea anterior) → PROIBIDO MISOPROSTOL (Risco de rotura uterina) → Método Mecânico de Krause (Cateter de Foley transcervical)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 15,
      observedInExams: ["Revalida 2024.2", "Revalida 2022.2"],
      patientProfiles: ["Gestante de 41 semanas com colo posterior, fechado e grosso (Bishop 2) e cesárea prévia."],
      frequentTriggers: ["Contraindicação absoluta de Misoprostol em pacientes com cicatriz uterina prévia."],
      mostTestedDiagnosis: "Gestação pós-termo / prolongada com colo desfavorável e cicatriz de cesariana anterior.",
      mostTestedConduct: "Preparo de colo com método mecânico de Foley (Método de Krause) para evitar rotura uterina.",
      recurringDistractors: ["Prescrever misoprostol vaginal para gestante com cesariana anterior."],
      cognitiveMatrixPattern: "A banca testa rigorosamente a segurança materna contra o risco de rotura uterina por prostaglandinas.",
    },
    sources: [
      {
        institution: "FEBRASGO / Ministério da Saúde",
        document: "Indução do Trabalho de Parto e Métodos de Preparo Cervical",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-09",
    title: "Distócias",
    slug: "distocias-partograma-parada-secundaria",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 9,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 25 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 29,
    priority: "Crítica",
    summary: "Interpretação do Partograma da OMS (Linha de Alerta e Linha de Ação): Fase Ativa Prolongada, Parada Secundária da Dilatação (dilatação estagnada por >=2h com dinâmica adequada), Parada Secundária da Descida, Período Pélvico Prolongado e Distócia de Espáduas (Manobras de McRoberts, Pressão Suprapúbica de Rubin I, Woods e Gaskin).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ANÁLISE DE DISTÓCIAS NO PARTOGRAMA
├── Padrões Anormais do Partograma
│   ├── Fase Ativa Prolongada: Dilatação lenta (< 1 cm/h) ultrapassando a Linha de Alerta → Corrigir hipodinamia com Ocitocina/Amniotomia
│   ├── Parada Secundária da Dilatação: Mesma dilatação em 2 toques consecutivos com intervalo de 2 horas em fase ativa → Desproporção Cefalopélvica (DCP)
│   ├── Parada Secundária da Descida: Dilatação total com polo cefálico estagnado na mesma altura de De Lee por >= 1 hora
│   └── Parto Precipitado / Taquitócico: Dilatação e expulsão ocorrendo em menos de 2 a 3 horas
└── Distócia de Espáduas (Emergência Obstétrica)
    ├── Sinal da Tartaruga (Retração do polo cefálico contra o períneo após desprendimento)
    └── Algoritmo de Manobras: 1. Manobra de McRoberts (Hiperflexão das coxas) + 2. Pressão Suprapúbica (Rubin I) (PROIBIDO FUNDO UTERINO)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 25,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1", "Revalida 2021"],
      patientProfiles: ["Parturiente com feto macrossômico; após o desprendimento do polo cefálico, os ombros não se desprendem."],
      frequentTriggers: ["Reconhecimento imediato de Distócia de Espáduas e execução da Manobra de McRoberts."],
      mostTestedDiagnosis: "Distócia de Ombros / Distócia de Espáduas.",
      mostTestedConduct: "Interromper puxos, realizar Manobra de McRoberts associada a pressão suprapúbica para desimpactar o ombro anterior.",
      recurringDistractors: ["Realizar pressão no fundo uterino (Kristeller) durante uma distócia de ombros (agrava a impactação)."],
      cognitiveMatrixPattern: "A banca exige memorização da sequência de manobras não invasivas antes de procedimentos invasivos.",
    },
    sources: [
      {
        institution: "FEBRASGO",
        document: "Manual de Partograma e Manejo das Distócias no Trabalho de Parto",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-10",
    title: "Rotura Prematura de Membranas",
    slug: "rotura-prematura-membranas-ovulares-rpmo",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 10,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 22 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 26,
    priority: "Crítica",
    summary: "Rotura Prematura de Membranas Ovulares (RPMO): Diagnóstico por história de perda líquida em jato, exame especular com visualização de líquido amniótico saindo pelo orifício cervical externo, Teste de Cristalização em folha de samambaia e pH com fita de nitrazina. Conduta por idade gestacional: Termo (>=37 sem → Indução do parto); Pré-termo (24 a 34 sem → Corticoterapia com Betametasona, Antibioticoterapia de latência com Ampicilina + Azitromicina e Sulfato de Magnésio para neuroproteção fetal se < 32 sem). Diagnóstico de Corioamnionite (Critérios de Gibbs).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ROTURA PREMATURA DE MEMBRANAS (RPMO)
├── Diagnóstico Clínico: Exame especular estéril (líquido saindo pelo colo) + Teste de cristalização + Nitrazina (pH > 6.5) (EVITAR TOQUE VAGINAL)
├── Termo (>= 37 semanas)
│   └── Indução do parto e antibioticoprofilaxia para GBS se trabalho de parto > 18 horas
├── Pré-Termo (24 a 34 semanas) SEM SINAIS DE CORIOAMNIONITE
│   ├── Corticoterapia Antenatal (Betametasona 12 mg IM 2 doses com intervalo de 24h) para maturação pulmonar
│   ├── Antibioticoterapia de Latência (Esquema com Ampicilina EV + Azitromicina oral por 7 dias)
│   └── Sulfato de Magnésio para Neuroproteção Fetal se parto iminente com < 32 semanas
└── Corioamnionite (Critérios de Gibbs: Febre materna >= 38ºC + Leucocitose, Taquicardia materna/fetal, Líquido fétido) → Parto Imediato + Ampicilina + Gentamicina`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 22,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Gestante de 31 semanas com perda líquida clara abundante há 4 horas sem dor ou contrações."],
      frequentTriggers: ["Conduta conservadora de RPMO pré-termo com corticoide e antibiótico de latência sem toque vaginal."],
      mostTestedDiagnosis: "RPMO pré-termo sem corioamnionite.",
      mostTestedConduct: "Internação, repouso, Betametasona IM, Ampicilina + Azitromicina e monitorização materna/fetal.",
      recurringDistractors: ["Realizar toques vaginais repetidos para avaliar dilatação em paciente com RPMO pré-termo."],
      cognitiveMatrixPattern: "A banca cobra o conhecimento estrito do esquema de antibióticos para prolongar a latência sem corioamnionite.",
    },
    sources: [
      {
        institution: "FEBRASGO / Ministério da Saúde",
        document: "Protocolo de Rotura Prematura de Membranas e Prematuridade",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-11",
    title: "Hemorragia Pós-Parto",
    slug: "hemorragia-pos-parto-os-4ts",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 11,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 29 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 34,
    priority: "Crítica",
    summary: "Definição de HPP (Perda sanguínea > 500 mL em parto vaginal ou > 1000 mL em cesárea nas primeiras 24h com sinais de instabilidade hemodinâmica). Etiologia pelos 4 Ts: Tônus (Atonia Uterina ~70% das causas), Trauma (Lacerações de canal de parto / Hematomas), Tecido (Restos placentários / Acretismo) e Trombina (Coagulopatias). Manejo sequencial: Massagem uterina bimanual (Manobra de Hamilton) + Ocitocina EV/IM + Ácido Tranexâmico EV + Ergometrina / Misoprostol retal + Balão de Tamponamento Intrauterino (Bakri) + Sutura de B-Lynch / Ligadura vascular / Histerectomia.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Tratamento empírico da HPP focado apenas em ocitocina e massagem uterina isoladas.",
      currentConduct: "Estratégia Zero Morte Materna por Hemorragia da OPAS/MS: Ácido Tranexâmico 1g EV nos primeiros 60 minutos de sangramento, Traje Antichoque Não Pneumático (TANP) para transporte/estabilização e Balão de Tamponamento intrauterino antes da cirurgia radical.",
      previousDoc: "Manual de HPP MS 2015",
      currentDoc: "Recomendações para Prevenção e Manejo da Hemorragia Pós-Parto - OPAS / Ministério da Saúde / FEBRASGO 2024/2026",
      year: "2026",
      revalidaImpact: "Tema com altíssima probabilidade de estação no OSCE de Habilidades Clínicas e questões discursivas.",
    },
    visualTreeMap: `HEMORRAGIA PÓS-PARTO E OS 4 Ts (OPAS / MS)
├── Prevenção Universal: Ocitocina 10 UI IM após a saída do ombro anterior / expulsão fetal no 3º período
├── ETIOLOGIA DOS 4 Ts
│   ├── TÔNUS (~70%): Atonia Uterina (Útero amolecido e aumentado acima da cicatriz umbilical)
│   ├── TRAUMA (~20%): Laceração de colo/vagina/períneo, hematomas ou inversão uterina
│   ├── TECIDO (~10%): Restos placentários, coágulos retidos ou acretismo placentário
│   └── TROMBINA (<1%): Coagulopatias congênitas ou adquiridas (CIVD pós-DPP/HELLP)
└── SEQUÊNCIA DE AÇÃO NA ATONIA UTERINA
    ├── 1. Massagem Uterina Bimanual Externa e Compressão Aorta Abdominal (Manobra de Hamilton)
    ├── 2. Ocitocina EV em infusão rápida + Ácido Tranexâmico 1g EV nos primeiros 60 minutos
    ├── 3. Metilergonovina (Ergotrate) 0,2mg IM (se não hipertensa) + Misoprostol 800mcg retal
    ├── 4. Balão de Tamponamento Intrauterino (Balão de Bakri) + Traje Antichoque Não Pneumático (TANP)
    └── 5. Cirurgia Hemostática (Sutura compressiva de B-Lynch, Ligadura de artérias uterinas/hipogástricas, Histerectomia)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 29,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Puérpera imediata de parto vaginal com sangramento abundante, útero hipotônico amolecido e palidez."],
      frequentTriggers: ["Início imediato da manobra de compressão bimanual associada a ocitocina e ácido tranexâmico."],
      mostTestedDiagnosis: "Hemorragia Pós-Parto precoce por Atonia Uterina.",
      mostTestedConduct: "Realizar massagem uterina bimanual imediata, infundir Ocitocina venosa e administrar Ácido Tranexâmico 1g EV.",
      recurringDistractors: ["Indicar histerectomia puerperal imediata sem antes esgotar as medidas clínicas e balão de tamponamento."],
      cognitiveMatrixPattern: "A banca exige aplicação estrita do algoritmo progressivo em escada da OPAS/Ministério da Saúde.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / OPAS / FEBRASGO",
        document: "Recomendações para a Prevenção e o Manejo da Hemorragia Pós-Parto",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-12",
    title: "Infecções na Gestação",
    slug: "infeccoes-congenitas-torch-sifilis-toxoplasmose",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 12,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 28 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 33,
    priority: "Crítica",
    summary: "Sífilis na Gestação (critérios de tratamento adequado com Penicilina Benzatina, controle de cura mensal pelo VDRL, reação de Jarisch-Herxheimer) e Toxoplasmose Gestacional (Sorologia: IgM+ e IgG+ com Teste de Avidez de IgG antes de 16 semanas; Espiramicina se infecção aguda materna e Sulfadiazina + Pirimetamina + Ácido Folínico se infecção fetal confirmada por PCR no líquido amniótico).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Exigência de tratamento do parceiro sexual concomitante para considerar a gestante adequadamente tratada contra sífilis.",
      currentConduct: "Ministério da Saúde: O tratamento adequado da gestante com sífilis para fins de prevenção da sífilis congênita depende EXCLUSIVAMENTE do uso de Penicilina Benzatina no esquema correto conforme o estágio clínico, finalizado pelo menos 30 dias antes do parto, independentemente do tratamento do parceiro (embora o parceiro deva ser convocado e tratado para evitar reinfecção).",
      previousDoc: "Manual de Sífilis MS 2015",
      currentDoc: "PCDT para Prevenção da Transmissão Vertical de HIV, Sífilis e Hepatites Virais - Ministério da Saúde 2024/2026",
      year: "2026",
      revalidaImpact: "Pegadinha extremamente recorrente: o não tratamento do parceiro não invalida o tratamento materno para critérios de sífilis congênita.",
    },
    visualTreeMap: `INFECÇÕES NA GESTAÇÃO (SÍFILIS E TOXOPLASMOSE)
├── SÍFILIS NA GESTAÇÃO (PCDT MS 2024/2026)
│   ├── Diagnóstico: Teste Rápido positivo → Iniciar tratamento IMEDIATAMENTE (sem esperar VDRL)
│   ├── Esquemas com Penicilina Benzatina IM
│   │   ├── Primária, Secundária ou Latente Recente (<1 ano): 2,4 milhões UI (1,2 milhão em cada glúteo) dose única
│   │   └── Terciária, Latente Tardia (>1 ano) ou Duração Ignorada: 7,2 milhões UI (3 doses de 2,4 mi com intervalo de 7 dias)
│   └── Tratamento Adequado: Feito com Penicilina, dose correta pelo estágio e finalizado até 30 dias antes do parto
└── TOXOPLASMOSE NA GESTAÇÃO
    ├── IgM (+) e IgG (+): Solicitar Teste de Avidez de IgG se < 16 semanas (Alta Avidez > 60% = Infecção antiga pré-gestacional)
    ├── Infecção Aguda Materna: Iniciar ESPIRAMICINA 1g de 8 em 8 horas imediatamente
    └── Amniocentese com PCR positiva no Líquido Amniótico (Infecção fetal confirmada): Trocar para Sulfadiazina + Pirimetamina + Ácido Folínico a partir de 18 sem`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 28,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Gestante na 1ª consulta com teste rápido de sífilis reagente e VDRL 1:32 sem lesões ou histórico conhecido."],
      frequentTriggers: ["Tratamento como sífilis de duração indeterminada com 3 doses semanais de Penicilina Benzatina."],
      mostTestedDiagnosis: "Sífilis na gestação de duração ignorada / latente tardia.",
      mostTestedConduct: "Prescrever Penicilina Benzatina 2,4 milhões UI IM semanalmente por 3 semanas consecutivas e controle mensal de VDRL.",
      recurringDistractors: ["Prescrever ceftriaxona ou eritromicina para tratamento de sífilis materna (não cruzam a barreira placentária eficazmente)."],
      cognitiveMatrixPattern: "A única droga comprovadamente eficaz para tratar o feto e prevenir a sífilis congênita é a Penicilina Benzatina.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "PCDT para Prevenção da Transmissão Vertical do HIV, Sífilis e Hepatites Virais",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-13",
    title: "Planejamento Reprodutivo e Contracepção",
    slug: "planejamento-reprodutivo-contracepcao-criterios-oms",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 13,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 22 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 26,
    priority: "Crítica",
    summary: "Critérios de Elegibilidade Médica da OMS para uso de Métodos Contraceptivos (Categorias 1 a 4: Categoria 4 = Contraindicação Absoluta; Categoria 3 = Riscos superam benefícios). Contraindicações formais ao Estrogênio (Tabagismo >=35 anos com >=15 cigarros/dia, Enxaqueca com aura, HAS não controlada, TVP/TEP prévio, Câncer de mama atual). DIU de Cobre, DIU de Levonorgestrel e Implante subdérmico de Etonogestrel (LARC). Nova Lei do Planejamento Familiar no Brasil (Lei nº 14.443/2022: idade mínima de 21 anos ou com pelo menos 2 filhos vivos, sem necessidade de consentimento do cônjuge).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Exigência de 25 anos ou 2 filhos vivos e consentimento expresso do cônjuge para realização de laqueadura tubária ou vasectomia.",
      currentConduct: "Nova Legislação Brasileira (Lei nº 14.443/2022): Idade reduzida para 21 anos (OU pelo menos 2 filhos vivos), NÃO exige autorização/consentimento do cônjuge, e permissão expressa para realização de laqueadura durante o período de parto/cesariana com solicitação prévia formal de 60 dias.",
      previousDoc: "Lei do Planejamento Familiar 1996",
      currentDoc: "Lei Federal nº 14.443/2022 / Portarias do Ministério da Saúde 2024",
      year: "2026",
      revalidaImpact: "Tema com alto potencial de cobrança interdisciplinar com Medicina Preventiva e Bioética.",
    },
    visualTreeMap: `CONTRACEPÇÃO E CRITÉRIOS DE ELEGIBILIDADE DA OMS
├── Categorias da OMS: Categoria 1 (Sem restrição), Cat 2 (Vantagens > Riscos), Cat 3 (Riscos > Benefícios), Cat 4 (Contraindicação Absoluta)
├── CONTRAINDICAÇÕES ABSOLUTAS AO ESTROGÊNIO (CATEGORIA 4 DA OMS)
│   ├── Tabagista com idade >= 35 anos que fuma >= 15 cigarros por dia
│   ├── Enxaqueca COM AURA em qualquer idade (Risco de AVC isquêmico)
│   ├── Hipertensão Arterial grave não controlada (PAS >= 160 ou PAD >= 100 mmHg)
│   ├── Histórico pessoal de Trombose Venosa Profunda (TVP) ou Tromboembolismo Pulmonar (TEP)
│   ├── Câncer de Mama atual (Receptores hormonais positivos)
│   └── Pós-parto imediato em lactantes (< 6 semanas pós-parto)
├── Métodos Contraceptivos Reversíveis de Longa Duração (LARC)
│   ├── DIU de Cobre (Duração 10 anos, não hormonal, opção de emergência até 5 dias)
│   ├── DIU de Levonorgestrel / Mirena (Duração 5-8 anos, reduz fluxo menstrual e dor da endometriose)
│   └── Implante Subdérmico de Etonogestrel (Duração 3 anos, alta eficácia)
└── LEGISLAÇÃO BRASILEIRA DE ESTERILIZAÇÃO CIRÚRGICA (LEI 14.443/2022)
    ├── Idade mínima: 21 anos OU com pelo menos 2 filhos vivos
    ├── Prazo de 60 dias entre a manifestação da vontade e o procedimento cirúrgico
    └── DISPENSA TOTAL de autorização ou assinatura do cônjuge`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 22,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Mulher de 36 anos, tabagista de 20 cigarros/dia, solicitando anticoncepcional oral combinado na UBS."],
      frequentTriggers: ["Identificação de Categoria 4 da OMS para métodos combinados com estrogênio."],
      mostTestedDiagnosis: "Contraindicação formal a contraceptivo oral combinado por alto risco cardiovascular.",
      mostTestedConduct: "Contraindicar pílula combinada e oferecer métodos livres de estrogênio (DIU de Cobre, DIU de Levonorgestrel ou Progestágeno isolado).",
      recurringDistractors: ["Prescrever anticoncepcional combinado de baixa dosagem de estrogênio para tabagista de 36 anos."],
      cognitiveMatrixPattern: "A banca exige aplicação rigorosa dos critérios de elegibilidade da OMS para segurança da paciente.",
    },
    sources: [
      {
        institution: "Organização Mundial da Saúde (OMS) / FEBRASGO / Ministério da Saúde",
        document: "Critérios Médicos de Elegibilidade para Uso de Métodos Anticoncepcionais",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-14",
    title: "Rastreamento e Câncer do Colo do Útero",
    slug: "rastreamento-cancer-colo-do-utero-inca",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 14,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 27 questões nas provas oficiais",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 31,
    priority: "Crítica",
    summary: "Diretrizes Brasileiras para o Rastreamento do Câncer do Colo do Útero (INCA / Ministério da Saúde): População-alvo (mulheres de 25 a 64 anos que já iniciaram atividade sexual), Periodicidade (anual; após 2 exames anuais normais consecutivos, a cada 3 anos), Conduta diante dos resultados citopatológicos: ASC-US (<25 anos: repetir em 3 anos; 25-29 anos: repetir em 12 meses; >=30 anos: repetir em 6 meses), LIE-BG / LSIL (<25 anos: repetir em 3 anos; >=25 anos: repetir em 6 meses), ASC-H, LIE-AG / HSIL e AGC (Colposcopia imediata).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Realização de colposcopia imediata para lesões de baixo grau (LSIL) em mulheres jovens.",
      currentConduct: "Diretrizes INCA: Mulheres com menos de 25 anos com LSIL ou ASC-US devem apenas seguir a rotina de rastreamento aos 25 anos ou repetir citologia em 3 anos, devido à altíssima taxa de regressão espontânea do HPV nessa faixa etária, evitando biópsias e conizações iatrogênicas.",
      previousDoc: "Diretrizes Antigas de Rastreamento",
      currentDoc: "Diretrizes Brasileiras para o Rastreamento do Câncer do Colo do Útero - INCA / Ministério da Saúde 2024/2026",
      year: "2026",
      revalidaImpact: "Tabela de condutas citopatológicas do INCA é uma das mais cobradas em todo o histórico do Revalida INEP.",
    },
    visualTreeMap: `RASTREAMENTO DO CÂNCER DE COLO DE ÚTERO (INCA / MS)
├── População-Alvo: Mulheres ou pessoas com colo de útero dos 25 aos 64 anos com atividade sexual prévia
├── Periodicidade: Anual inicial → Após 2 exames anuais negativos consecutivos, realizar a cada 3 ANOS
├── CONDUTAS DIANTE DE RESULTADOS CITOPATOLÓGICOS ALTERADOS
│   ├── ASC-US (Células Escamosas Atípicas de Significado Indeterminado)
│   │   ├── < 25 anos: Seguir rotina de rastreamento (Repetir aos 25 anos ou em 3 anos)
│   │   ├── 25 a 29 anos: Repetir Citologia em 12 MESES
│   │   └── >= 30 anos: Repetir Citologia em 6 MESES
│   ├── LIE-BG / LSIL (Lesão Intraepitelial de Baixo Grau)
│   │   ├── < 25 anos: Seguir rotina de rastreamento (Repetir em 3 anos)
│   │   └── >= 25 anos: Repetir Citologia em 6 MESES
│   └── COLPOSCOPIA IMEDIATA (Sem repetição de citologia prévia)
│       ├── ASC-H (Atipias em células escamosas não podendo afastar lesão de alto grau)
│       ├── LIE-AG / HSIL (Lesão Intraepitelial de Alto Grau / NIC II e III)
│       ├── AGC / AGUS (Células Glandulares Atípicas de significado indeterminado)
│       └── Suspeita de Carcinoma Epidermoide Invasor`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 27,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Mulher de 32 anos com resultado preventivo acusando LIE-AG (HSIL) ou mulher de 28 anos com ASC-US."],
      frequentTriggers: ["Indicação imediata de colposcopia para HSIL e repetição em 12 meses para ASC-US em mulher de 28 anos."],
      mostTestedDiagnosis: "Alteração citopatológica cervical segundo o sistema Bethesda.",
      mostTestedConduct: "Encaminhar para Colposcopia diagnóstica imediata na presença de LIE-AG / HSIL.",
      recurringDistractors: ["Solicitar colposcopia para mulher de 22 anos com resultado citopatológico de LIE-BG."],
      cognitiveMatrixPattern: "A banca pune o excesso de intervenções em menores de 25 anos e atrasos em lesões de alto grau.",
    },
    sources: [
      {
        institution: "Instituto Nacional de Câncer (INCA) / Ministério da Saúde",
        document: "Diretrizes Brasileiras para o Rastreamento do Câncer do Colo do Útero",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "go-15",
    title: "Infecções Sexualmente Transmissíveis e Doença Inflamatória Pélvica",
    slug: "ist-doenca-inflamatoria-pelvica-dip",
    areaId: "ginecologia-obstetricia",
    areaName: "Ginecologia e Obstetricia",
    order: 15,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 26 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Abordagem Sindrômica das ISTs (Úlceras genitais: Cancro Duro / Sífilis Primária vs Cancro Mole / Haemophilus ducreyi vs Herpes Genital vs Linfogranuloma Venéreo; Corrimentos Vaginais: Vaginose Bacteriana / Gardnerella com Critérios de Amsel e Clue cells, Candidíase Vulvovaginal e Tricomoníase) e Doença Inflamatória Pélvica (DIP: Critérios Maiores e Menores de Gainesville, Classificação de Monif e esquemas de tratamento ambulatorial com Ceftriaxona + Doxiciclina + Metronidazol vs hospitalar).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Tratamento empírico da DIP ambulatorial sem cobertura obrigatória de anaeróbios.",
      currentConduct: "PCDT IST Ministério da Saúde: Tratamento ambulatorial da DIP exige a associação tríplice: Ceftriaxona 500 mg IM dose única + Doxiciclina 100 mg VO 12/12h por 14 dias + Metronidazol 500 mg VO 12/12h por 14 dias (cobertura contra gonococo, clamídia e anaeróbios).",
      previousDoc: "PCDT IST 2015",
      currentDoc: "PCDT para Atenção Integral às Pessoas com IST - Ministério da Saúde 2024/2026",
      year: "2026",
      revalidaImpact: "Esquema tríplice da DIP ambulatorial e diferenciação das úlceras genitais são cobrados com altíssima frequência.",
    },
    visualTreeMap: `IST E DOENÇA INFLAMATÓRIA PÉLVICA (PCDT MS 2024/2026)
├── ÚLCERAS GENITAIS
│   ├── Sífilis Primária (Cancro Duro): Úlcera ÚNICA, Indolor, Base limpa e endurecida, linfonodomegalia não supurativa → Penicilina Benzatina
│   ├── Cancro Mole (Haemophilus ducreyi): Úlceras MÚLTIPLAS, Muito dolorosas, Fundo purulento, 'Bubão' inguinal fistulizante por orifício único → Azitromicina ou Ceftriaxona
│   ├── Herpes Genital: Vesículas agrupadas em base eritematosa, muito dolorosas com queimação → Aciclovir
│   └── Linfogranuloma Venéreo (Chlamydia L1-L3): Pápula transitória indolor com linfonodomegalia fistulizante em bico de regador → Doxiciclina
├── CORRIMENTOS VAGINAIS
│   ├── Vaginose Bacteriana: Corrimento acinzentado com odor fétido (Whiff test + com KOH 10%), pH > 4.5, 'Clue Cells' → Metronidazol
│   ├── Candidíase: Prurido vulvar intenso, corrimento grumoso em nata de leite, pH < 4.5, hifas ao exame a fresco → Fluconazol ou Miconazol
│   └── Tricomoníase: Corrimento amarelo-esverdeado bolhoso, colo em framboesa/morango, protozoários móveis → Metronidazol (Tratar parceiro)
└── DOENÇA INFLAMATÓRIA PÉLVICA (DIP)
    ├── Critérios de Gainesville: Dor à palpação abdominal + Dor à palpação anexial + Dor à mobilização do colo uterino
    └── Esquema Ambulatorial Obrigatório: Ceftriaxona 500mg IM + Doxiciclina 100mg VO 12/12h 14d + Metronidazol 500mg VO 12/12h 14d`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 26,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Mulher jovem com febre baixa, dor pélvica e dor intensa à mobilização do colo uterino ao toque bimanual."],
      frequentTriggers: ["Tríade de critérios maiores de Gainesville caracterizando DIP aguda."],
      mostTestedDiagnosis: "Doença Inflamatória Pélvica (DIP) Estágio I de Monif (não complicada).",
      mostTestedConduct: "Iniciar esquema tríplice ambulatorial com Ceftriaxona IM + Doxiciclina VO + Metronidazol VO por 14 dias e convocar parceiro.",
      recurringDistractors: ["Prescrever apenas ciprofloxacino isolado para tratamento de DIP."],
      cognitiveMatrixPattern: "A banca exige prescrição completa cobrindo Neisseria gonorrhoeae, Chlamydia trachomatis e germes anaeróbios.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Protocolo Clínico e Diretrizes Terapêuticas para Atenção Integral às Pessoas com Infecções Sexualmente Transmissíveis (IST)",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
];
