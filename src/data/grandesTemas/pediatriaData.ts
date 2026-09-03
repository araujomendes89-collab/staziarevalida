import { GrandeTema } from "../../types/grandesTemas";

export const PEDIATRIA_THEMES: GrandeTema[] = [
  {
    id: "ped-01",
    title: "Crescimento e Desenvolvimento",
    slug: "crescimento-desenvolvimento-pediatrico",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 1,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 25 questões em provas do Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Curvas de crescimento da OMS (Z-escore de Peso/Idade, Estatura/Idade, IMC/Idade), marcos do desenvolvimento neuropsicomotor (motor grosso, motor fino, linguagem, social) e triagem de sinais de alerta no autismo (M-CHAT).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `CRESCIMENTO E DESENVOLVIMENTO
├── Curvas da OMS (Escore-Z e Percentis)
│   ├── Estatura/Idade: Z < -2 (Baixa Estatura para a Idade) / Z < -3 (Muito Baixa Estatura)
│   └── Peso/Estatura e IMC/Idade: Z > +2 (Sobrepeso), Z > +3 (Obesidade), Z < -2 (Magreza)
└── Marcos do DNPM por Faixa Etária
    ├── 2 meses: Sorriso social, eleva a cabeça em pronação
    ├── 4 meses: Segura objetos com as mãos, sustenta a cabeça completamente
    ├── 6 meses: Senta com apoio, transfere objetos entre as mãos, balbucio
    ├── 9 meses: Senta sem apoio, pinça polegar-dedo imperfeita, estranha desconhecidos
    ├── 12 meses: Primeiros passos com apoio, pinça perfeita, fala 1-2 palavras com significado
    └── 18 meses: Anda sozinho com firmeza, torre de 3 cubos, vocabulário em expansão`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 25,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Lactente de 9 meses que não sustenta o tronco ou não realiza pinça palmar."],
      frequentTriggers: ["Identificação de atraso nos marcos do desenvolvimento neuropsicomotor exigindo intervenção precoce."],
      mostTestedDiagnosis: "Atraso no desenvolvimento neuropsicomotor e Baixa Estatura com velocidade de crescimento normal vs diminuída.",
      mostTestedConduct: "Avaliação multiprofissional, estímulo ao desenvolvimento na APS e investigação se velocidade de crescimento alterada.",
      recurringDistractors: ["Classificar como normal um lactente de 10 meses que não senta sem apoio."],
      cognitiveMatrixPattern: "A banca exige memorização precisa dos marcos de 2, 4, 6, 9 e 12 meses segundo o Manual do Ministério da Saúde.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / SBP",
        document: "Caderneta da Criança e Manual de Crescimento e Desenvolvimento Infantil",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-02",
    title: "Puericultura",
    slug: "puericultura-atencao-basica",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 2,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 21 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 26,
    priority: "Crítica",
    summary: "Calendário de consultas de puericultura no 1º ano de vida (1ª semana, 1º, 2º, 4º, 6º, 9º e 12º mês), triagens neonatais (Teste do Pezinho ampliado, Olhinho, Orelhinha, Coraçãozinho e Linguinha), suplementação de ferro e vitamina D.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Suplementação profilática de ferro a partir do 6º mês para nascidos a termo com peso >= 2.500g em aleitamento materno exclusivo.",
      currentConduct: "Suplementação profilática de ferro elementar a partir dos 3 meses (1 mg/kg/dia até os 24 meses) para todas as crianças nascidas a termo sem fatores de risco.",
      previousDoc: "Recomendação SBP 2012",
      currentDoc: "Diretrizes SBP / Ministério da Saúde 2024/2026",
      year: "2026",
      revalidaImpact: "Questões atuais cobram o início do ferro aos 3 meses de vida, independentemente do tipo de aleitamento materno.",
    },
    visualTreeMap: `PUERICULTURA NA ATENÇÃO PRIMÁRIA
├── Cronograma de Consultas (1ª semana de vida, 1m, 2m, 4m, 6m, 9m, 12m, 18m e 24m)
├── Testes de Triagem Neonatal
│   ├── Teste do Pezinho (3º ao 5º dia de vida: Fenilcetonúria, Hipotireoidismo, Falciforme, Fibrose Cística, Hiperplasia Adrenal, Biotinidase)
│   ├── Teste do Olhinho (Reflexo Vermelho de Bruckner presente e simétrico para afastar Retinoblastoma e Catarata)
│   ├── Teste do Coraçãozinho (Oximetria em MSD e MI entre 24-48h: Sat >=95% e diferença <=3%)
│   └── Teste da Orelhinha (Emissões Otoacústicas Evocadas) e Teste da Linguinha
└── Suplementação de Micronutrientes
    ├── Vitamina D: 400 UI/dia na 1ª semana até 12 meses; 600 UI/dia dos 12 aos 24 meses
    └── Ferro Profilático: 1 mg/kg/dia a partir dos 3 meses até os 2 anos em RN a termo >=2.500g`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 21,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Recém-nascido trazido à UBS no 5º dia de vida para a primeira consulta da tríade mãe-bebê."],
      frequentTriggers: ["Realização do teste do pezinho no período ideal e início da suplementação de Vitamina D."],
      mostTestedDiagnosis: "Rotina de puericultura de recém-nascido hígido.",
      mostTestedConduct: "Realização imediata do Teste do Pezinho (3º ao 5º dia) e prescrição de Vitamina D 400 UI/dia.",
      recurringDistractors: ["Aguardar 6 meses de vida para iniciar suplementação de ferro em recém-nascidos."],
      cognitiveMatrixPattern: "A banca exige domínio absoluto das diretrizes brasileiras de puericultura e suplementação do SUS.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Pediatria (SBP) / MS",
        document: "Guia Prático de Puericultura e Suplementação Infantil",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-03",
    title: "Aleitamento Materno",
    slug: "aleitamento-materno-dificuldades",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 3,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 23 questões analisadas",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 27,
    priority: "Crítica",
    summary: "Aleitamento Materno Exclusivo até os 6 meses e complementado até 2 anos ou mais, técnica de pega e posicionamento corretos, manejo de fissuras mamárias, ingurgitamento e mastite, e contraindicações absolutas (HIV e HTLV).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ALEITAMENTO MATERNO
├── Definições OMS: Exclusivo (apenas leite materno sem água/chás), Predominante, Complementado
├── Técnica Correta de Pega (Boca bem aberta 'em peixinho', lábio inferior evertido, queixo tocando a mama, mais aréola visível acima da boca)
├── Manejo das Dificuldades
│   ├── Fissura Mamária: Correção da pega, ordenha de leite para hidratar a aréola, NÃO suspender a amamentação
│   ├── Ingurgitamento Mamário: Ordenha manual prévia da aréola para amaciamento, compressas frias após as mamadas
│   └── Mastite Lactacional: Esvaziamento mamário frequente mantendo a amamentação na mama afetada + Cefalexina / Oxacilina
└── Contraindicações Absolutas no Brasil: Infecção materna por HIV e HTLV 1/2 e Galactosemia clássica no lactente`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 23,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1", "Revalida 2021"],
      patientProfiles: ["Puérpera com dor intensa nos mamilos, fissura visível e queixa de que o leite é fraco."],
      frequentTriggers: ["Avaliação da mamada com correção da pega inadequada."],
      mostTestedDiagnosis: "Dificuldade na amamentação por pega incorreta gerando fissura.",
      mostTestedConduct: "Orientação e correção postural da pega; manter aleitamento exclusivo sob livre demanda sem introduzir fórmulas.",
      recurringDistractors: ["Recomendar suspensão temporária do aleitamento materno na presença de mastite bacteriana."],
      cognitiveMatrixPattern: "A regra de ouro do INEP: Mastite NÃO contraindica amamentação; o esvaziamento mamário é essencial.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Caderno de Atenção Básica nº 23 - Saúde da Criança: Nutrição e Aleitamento",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-04",
    title: "Alimentação Complementar",
    slug: "alimentacao-complementar-guia",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 4,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 16 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–30 min",
    moduleCount: 16,
    relatedQuestionsCount: 19,
    priority: "Alta",
    summary: "Diretrizes do Guia Alimentar para Crianças Brasileiras Menores de 2 Anos do Ministério da Saúde: introdução gradual aos 6 meses, evolução de consistência (amassado no garfo, nunca liquidificado), proibição de açúcar e mel antes dos 2 anos e método BLW.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ALIMENTAÇÃO COMPLEMENTAR (GUIA MS)
├── Idade de Início: Aos 6 meses completos com sinais de prontidão (Sustentação da cabeça/tronco, diminuição do reflexo de protrusão da língua)
├── Evolução de Consistência: Papa principal amassada no garfo com colher (NUNCA peneirada, liquidificada ou passada em mixer)
├── Grupos Alimentares Diários: Cereais/Tubérculos + Leguminosas (Feijão/Lentilha) + Proteína animal + Legumes/Verduras
├── Proibições Formais: Açúcar e alimentos ultraprocessados até os 2 anos; Mel contraindicado antes de 1 ano (risco de Botulismo infantil)
└── Oferta de Água: Iniciar água potável concomitantemente com a introdução alimentar aos 6 meses`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 16,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.2"],
      patientProfiles: ["Mãe traz bebê de 6 meses à UBS com dúvidas sobre como iniciar a papinha salgada."],
      frequentTriggers: ["Orientação de alimentos in natura, amassados com o garfo e sem adição de sal ou açúcar."],
      mostTestedDiagnosis: "Início adequado da alimentação complementar no lactente.",
      mostTestedConduct: "Orientar alimentos amassados no garfo com variedade de grupos alimentares, sem peneirar e sem mel.",
      recurringDistractors: ["Prescrever liquidificação das sopas ou adição de açúcar/achocolatado."],
      cognitiveMatrixPattern: "O INEP cobra literalmente as diretrizes do Guia Alimentar para Menores de 2 Anos do Ministério da Saúde.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Guia Alimentar para Crianças Brasileiras Menores de 2 Anos",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-05",
    title: "Imunização da Criança",
    slug: "imunizacao-da-crianca-pni",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 5,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 27 questões nas provas oficiais",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 32,
    priority: "Crítica",
    summary: "Calendário Nacional de Vacinação do PNI do Ministério da Saúde: BCG e Hepatite B ao nascer, Pentavalente, VIP (substituição total da VOP por VIP), Pneumo 10, Meningo C/ACWY, Rotavírus, Febre Amarela e Tríplice Viral com eventos adversos e falsas contraindicações.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Uso da vacina oral contra poliomielite (VOP - gotinha com vírus vivo atenuado) nos reforços aos 15 meses e 4 anos.",
      currentConduct: "Substituição completa da VOP pela Vacina Inativada Poliomielite (VIP - injetável com vírus inativado) em todas as doses do esquema básico e reforço de 15 meses.",
      previousDoc: "Calendário PNI 2023",
      currentDoc: "Informe Técnico PNI / Ministério da Saúde 2024/2026",
      year: "2026",
      revalidaImpact: "Candidatos devem saber que o esquema vacinal brasileiro agora é 100% VIP injetável, sem uso da vacina oral atenuada.",
    },
    visualTreeMap: `CALENDÁRIO NACIONAL DE VACINAÇÃO (PNI 2024/2026)
├── Ao Nascer: BCG (Dose única intradérmica) + Hepatite B (Nas primeiras 12h)
├── 2 meses: Penta (DTP+Hib+HepB) + VIP 1 + Pneumo 10 1ª dose + Rotavírus 1ª dose
├── 3 meses: Meningocócica C 1ª dose
├── 4 meses: Penta + VIP 2 + Pneumo 10 2ª dose + Rotavírus 2ª dose (limite 3m15d na 1ª e 7m29d na 2ª)
├── 5 meses: Meningocócica C 2ª dose
├── 6 meses: Penta + VIP 3 + Covid-19
├── 9 meses: Febre Amarela (Dose inicial em todo território nacional)
├── 12 meses: Tríplice Viral (Sarampo, Caxumba, Rubéola) + Pneumo 10 Reforço + Meningo C Reforço
└── 15 meses: DTP 1º Reforço + VIP 1º Reforço (injetável) + Hepatite A + Tetraviral (SCR + Varicela)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 27,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Lactente de 7 meses com atraso vacinal levado à sala de vacina da UBS com coriza leve sem febre."],
      frequentTriggers: ["Identificação de falsas contraindicações (resfriado leve, febre baixa pregressa) e atualização do esquema."],
      mostTestedDiagnosis: "Avaliação do status vacinal e aplicação do PNI.",
      mostTestedConduct: "Administração concomitante das vacinas em atraso sem necessidade de reiniciar esquemas prévios.",
      recurringDistractors: ["Adiar vacinação por causa de uso de antibióticos para otite ou resfriado comum."],
      cognitiveMatrixPattern: "A banca do INEP cobra rigorosamente o conhecimento do PNI e a recusa ativa de falsas contraindicações.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Manual de Normas e Procedimentos para Vacinação - PNI",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-06",
    title: "Assistência ao Recém-Nascido",
    slug: "assistencia-ao-recem-nascido-sala-parto",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 6,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 20 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 24,
    priority: "Crítica",
    summary: "Cuidados imediatos ao RN vigoroso a termo (clampeamento oportuno do cordão umbilical em 1-3 minutos, contato pele a pele imediato e amamentação na primeira hora), profilaxia da oftalmia neonatal (Nitrato de Prata 1% ou Pomada de Eritromicina) e prevenção de doença hemorrágica (Vitamina K1 1mg IM).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ASSISTÊNCIA AO RECÉM-NASCIDO VIGOROSO
├── As 3 Perguntas Iniciais: Gestação a termo? Respirando ou chorando? Tônus muscular em flexão?
│   ├── SIM para as 3: RN VIGOROSO
│   │   ├── Contato Pele a Pele imediato e contínuo com a mãe
│   │   ├── Clampeamento tardio do cordão umbilical (1 a 3 minutos pós-parto)
│   │   └── Estímulo à amamentação na primeira hora de vida ('Golden Hour')
└── Profilaxias Neonatais Obrigatórias
    ├── Prevenção da Doença Hemorrágica: Fitomenadiona (Vitamina K1) 1 mg por via intramuscular no vasto lateral
    └── Profilaxia da Oftalmia Neonatal: Nitrato de Prata a 1% ou Pomada de Eritromicina a 0,5% na 1ª hora`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 20,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2021"],
      patientProfiles: ["Parto vaginal a termo com nascimento de bebê chorando forte e com bom tônus muscular."],
      frequentTriggers: ["Conduta de não aspirar vias aéreas de rotina e priorizar o contato pele a pele com clampeamento tardio."],
      mostTestedDiagnosis: "Nascimento de recém-nascido a termo vigoroso.",
      mostTestedConduct: "Secar e manter sobre o tórax materno, clampear cordão após 1 a 3 minutos e incentivar amamentação.",
      recurringDistractors: ["Levar o bebê imediatamente ao berço aquecido para aspiração rotineira de vias aéreas e banho."],
      cognitiveMatrixPattern: "A banca enfatiza a humanização do parto e o combate a intervenções desnecessárias no RN saudável.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / SBP",
        document: "Diretrizes de Atenção à Saúde do Recém-Nascido",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-07",
    title: "Reanimação Neonatal",
    slug: "reanimacao-neonatal-diretrizes",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 7,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 26 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Diretrizes de Reanimação Neonatal da SBP (>=34 semanas e <34 semanas): Passo a passo no minuto de ouro (aquecer, posicionar, aspirar se necessário, secar), Ventilação com Pressão Positiva (VPP) em ar ambiente (FiO2 21%) como medida mais eficaz, massagem cardíaca (relação 3:1) e Adrenalina se FC < 60 bpm após VPP efetiva.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `ALGORITMO DE REANIMAÇÃO NEONATAL (SBP 2024/2026)
├── Minuto de Ouro (Primeiros 60 segundos)
│   ├── Prover Calor em berço aquecido + Posicionar cabeça em leve extensão
│   ├── Aspirar vias aéreas delicadamente APENAS se secreções obstrutivas
│   └── Secar e remover campos úmidos → Avaliar FC e Respiração
├── FC < 100 bpm, Apneia ou Respiração Irregular → Iniciar VPP em Ar Ambiente (FiO2 21% em >=34 sem)
│   ├── Ventilar na frequência de 40-60 movimentos/minuto com máscara facial
│   └── Se FC não subir: Checar passos de correção da ventilação (Ajustar máscara, reposicionar, aspirar)
└── FC < 60 bpm após 30 segundos de VPP EFETIVA com Cânula Orotraqueal + FiO2 100%
    ├── Iniciar Massagem Cardíaca (Técnica dos dois polegares, relação 3 compressões : 1 ventilação)
    └── Se mantiver FC < 60 após 60 seg de massagem coordenada → Adrenalina EV ou Cateter Umbilical (0,02 mg/kg)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 26,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1", "Revalida 2020"],
      patientProfiles: ["RN a termo não chora ao nascer, hipotônico e com FC de 75 bpm após passos iniciais."],
      frequentTriggers: ["Início imediato de VPP com máscara em ar ambiente antes do primeiro minuto de vida."],
      mostTestedDiagnosis: "Depressão respiratória neonatal ao nascimento.",
      mostTestedConduct: "Iniciar Ventilação com Pressão Positiva (VPP) com ar ambiente (FiO2 21%) por 30 segundos.",
      recurringDistractors: ["Iniciar massagem cardíaca em RN com FC de 75 bpm sem antes ventilar adequadamente."],
      cognitiveMatrixPattern: "Regra absoluta: A VPP é a intervenção isolada mais importante na reanimação do recém-nascido.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Pediatria (SBP)",
        document: "Programa de Reanimação Neonatal da SBP - Diretrizes para RN >= 34 semanas",
        year: "2024/2026",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-08",
    title: "Icterícia Neonatal",
    slug: "ictericia-neonatal-fototerapia",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 8,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 22 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 26,
    priority: "Crítica",
    summary: "Diferenciação entre Icterícia Fisiológica (surge após 24h, pico no 3º-4º dia) vs Patológica (surge nas primeiras 24h, elevação rápida de BT > 5 mg/dL/dia), Incompatibilidade Rh e ABO (Coombs Direto +), Icterícia do Aleitamento vs do Leite Materno, e indicações de Fototerapia e Exsanguinotransfusão para evitar Kernicterus.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ICTERÍCIA NEONATAL
├── Nas Primeiras 24 Horas de Vida = SEMPRE PATOLÓGICA
│   ├── Incompatibilidade Rh (Mãe Rh negativo / RN Rh positivo com Coombs Direto Positivo)
│   └── Incompatibilidade ABO (Mãe O / RN A ou B com Coombs Direto positivo ou fracamente positivo)
├── Após as Primeiras 24 Horas
│   ├── Icterícia Fisiológica: Pico no 3º ao 5º dia, BT raramente > 12 mg/dL
│   ├── Icterícia do Aleitamento Materno / Precoce: Baixa ingesta, perda de peso acentuada e aumento do ciclo entero-hepático
│   └── Icterícia do Leite Materno / Tardia: Substâncias no leite inibem a glicuroniltransferase, persiste por semanas com RN saudável
└── Colestase Neonatal (Bilirrubina Direta > 1.0 mg/dL): Atresia de Vias Biliares (Cirurgia de Kasai até 60 dias de vida)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 22,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Recém-nascido com 16 horas de vida apresentando icterícia visível até zona 3 de Kramer e mãe Rh negativo."],
      frequentTriggers: ["Icterícia com início precoce (<24h) exigindo dosagem urgente de bilirrubinas e Coombs direto."],
      mostTestedDiagnosis: "Doença hemolítica perinatal por incompatibilidade materno-fetal Rh.",
      mostTestedConduct: "Fototerapia de alta intensidade imediata e monitorização estrita da curva de bilirrubinas.",
      recurringDistractors: ["Aguardar 48 horas para reavaliar icterícia de início nas primeiras 24 horas de vida."],
      cognitiveMatrixPattern: "A banca pune atrasos na investigação da icterícia precoce pelo risco iminente de encefalopatia bilirrubínica.",
    },
    sources: [
      {
        institution: "SBP / Ministério da Saúde",
        document: "Diretrizes para o Manejo da Hiperbilirrubinemia no Recém-Nascido a Termo e Pré-Termo",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-09",
    title: "Prematuridade",
    slug: "prematuridade-complicacoes-cuidados",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 9,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 17 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 20,
    priority: "Alta",
    summary: "Cálculo da Idade Gestacional Corrigida (IGC), principais complicações do prematuro: Síndrome do Desconforto Respiratório (Doença da Membrana Hialina - deficiência de surfactante com imagem de vidro fosco/broncograma aéreo), Enterocolite Necrosante (pneumatose intestinal), Persistência do Canal Arterial (sopro contínuo em maquinária) e Método Canguru.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `COMPLICAÇÕES DA PREMATURIDADE (<37 SEMANAS)
├── Síndrome do Desconforto Respiratório (Membrana Hialina)
│   ├── Fisiopatologia: Deficiência de surfactante alveolar em prematuros
│   ├── Radiografia: Infiltrado reticulogranular difuso ('vidro moído') + Broncograma aéreo
│   └── Tratamento: CPAP nasal precoce em sala de parto + Surfactante exógeno traqueal
├── Enterocolite Necrosante (ECN)
│   ├── Tríade: Distensão abdominal, resíduo gástrico bilioso e sangue nas fezes
│   └── Radiografia: Pneumatose intestinal (gás na parede da alça) e pneumoperitônio se perfuração
└── Persistência do Canal Arterial (PCA): Sopro contínuo em foco pulmonar e pulsos amplos → Ibuprofeno/Indometacina`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 17,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1", "Revalida 2021"],
      patientProfiles: ["Prematuro de 31 semanas com taquipneia progressiva, gemência e Rx com padrão de vidro fosco difuso."],
      frequentTriggers: ["Quadro clínico e radiológico clássico de Doença da Membrana Hialina."],
      mostTestedDiagnosis: "Síndrome do Desconforto Respiratório do Recém-Nascido (deficiência de surfactante).",
      mostTestedConduct: "CPAP nasal precoce e instilação endotraqueal de surfactante pulmonar.",
      recurringDistractors: ["Indicar antibioticoterapia prolongada sem instituir suporte pressórico e surfactante."],
      cognitiveMatrixPattern: "A banca avalia a compreensão da prevenção antenatal com corticoide materno e suporte respiratório neonatal.",
    },
    sources: [
      {
        institution: "SBP",
        document: "Manual de Cuidados e Diretrizes do Recém-Nascido Pré-Termo",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-10",
    title: "Infecções Respiratórias na Infância",
    slug: "infeccoes-respiratorias-infancia-iva",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 10,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 24 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 28,
    priority: "Crítica",
    summary: "Infecções de Vias Aéreas Superiores e Inferiores na infância: Resfriado Comum, Faringoamigdalite bacteriana por Streptococcus pyogenes (Centor Score e Penicilina Benzatina), Otite Média Aguda (indicações de Amoxicilina), Sinusite Aguda, Laringite Estridulosa (Crupe viral com estridor inspiratório e Dexametasona oral) e Pneumonia bacteriana comunitária no lactente.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `INFECÇÕES RESPIRATÓRIAS PEDIÁTRICAS
├── Crupe Viral / Laringotraqueobronquite (Vírus Parainfluenza)
│   ├── Clínica: Tosse ladrante ('tosse de cachorro'), rouquidão, estridor inspiratório e sinal da torre na Rx
│   └── Conduta: Dexametasona dose única VO (0,6 mg/kg) + Nebulização com Adrenalina se estridor em repouso
├── Otite Média Aguda (OMA)
│   ├── Abaulamento da membrana timpânica, hiperemia e otalgia intensa
│   └── Tratamento: Amoxicilina 50 mg/kg/dia (ou 90 mg/kg/dia em menores de 2 anos ou creche)
└── Faringite Estreptocócica (>3 anos de idade): Exsudato amigdaliano, petéquias no palato, febre sem tosse/coriza → Penicilina Benzatina`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 24,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Criança de 2 anos com tosse ladrante súbita à noite, estridor inspiratório ao chorar e febre baixa."],
      frequentTriggers: ["Diagnóstico de laringite viral aguda com indicação de corticoide sistêmico dose única."],
      mostTestedDiagnosis: "Crupe Viral (Laringotraqueíte viral aguda).",
      mostTestedConduct: "Dexametasona oral 0,6 mg/kg em dose única e orientação aos pais.",
      recurringDistractors: ["Prescrever antibiótico ou xarope antitussígeno para laringite viral aguda."],
      cognitiveMatrixPattern: "A banca exige diferenciação rápida entre crupe viral, epiglotite bacteriana e aspiração de corpo estranho.",
    },
    sources: [
      {
        institution: "SBP",
        document: "Tratado de Pediatria - Doenças das Vias Aéreas na Infância",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-11",
    title: "Bronquiolite",
    slug: "bronquiolite-viral-aguda-vrs",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 11,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 21 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 25,
    priority: "Crítica",
    summary: "Bronquiolite Viral Aguda (BVA) por Vírus Sincicial Respiratório (VSR) em menores de 2 anos (pico aos 2-6 meses): primeiro episódio de sibilos precedido por pródromo gripal, critérios clínicos de gravidade, suporte com oxigenoterapia e lavagem nasal, e a recomendação formal contra broncodilatadores, corticoides e antibióticos de rotina.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Teste terapêutico rotineiro com salbutamol inalatório ou corticoide sistêmico em todo primeiro episódio de sibilância.",
      currentConduct: "Não realização rotineira de beta-2-agonistas, corticoides orais ou fisioterapia respiratória. O tratamento padrão-ouro é suporte: lavagem nasal com SF 0,9%, hidratação e oxigênio se SatO2 < 90-92% (ou cânula de alto fluxo). Profilaxia com Palivizumabe/Nirsevimabe para grupos de alto risco.",
      previousDoc: "Diretrizes SBP 2017",
      currentDoc: "Diretrizes de Bronquiolite Viral Aguda SBP / AAP 2024/2026",
      year: "2026",
      revalidaImpact: "O INEP penaliza fortemente a prescrição de corticoides ou antibióticos em quadros típicos de bronquiolite viral.",
    },
    visualTreeMap: `BRONQUIOLITE VIRAL AGUDA (BVA)
├── Definição: 1º episódio de sibilância e desconforto respiratório em < 2 anos (VSR ~70-80%)
├── História Natural: Pródromo de coriza/obstrução nasal por 2-3 dias → Tosse, taquipneia, tiragem subcostal e sibilos/estertores
├── Sinais de Alarme para Internação: Gemência, cianose, SatO2 < 90-92%, pausas de apneia, inapetência (<50% da ingesta habitual)
└── Conduta Padrão-Ouro (MEDIDAS DE SUPORTE)
    ├── Lavagem nasal frequente com soro fisiológico 0,9%
    ├── Fracionamento da dieta / Hidratação
    ├── Oxigenoterapia se SatO2 < 90-92% (Cânula nasal, Cateter de Alto Fluxo)
    └── NÃO FAZER DE ROTINA: Corticoide, Salbutamol, Fisioterapia motora vigorosa ou Antibióticos`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 21,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Lactente de 3 meses com coriza há 3 dias que evoluiu com taquipneia, tiragem intercostal e sibilos difusos."],
      frequentTriggers: ["Identificação do primeiro episódio de sibilância em lactente jovem sem história de atopia."],
      mostTestedDiagnosis: "Bronquiolite Viral Aguda por VSR.",
      mostTestedConduct: "Lavagem nasal com soro fisiológico, oferta de líquidos e oxigenoterapia se necessário (evitar corticoides).",
      recurringDistractors: ["Prescrever corticoide oral ou antibiótico para bronquiolite viral típica."],
      cognitiveMatrixPattern: "A banca testa rigorosamente se o médico sabe 'o que NÃO fazer' na bronquiolite.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Pediatria (SBP) / AAP",
        document: "Diretrizes para o Manejo da Bronquiolite Viral Aguda",
        year: "2024/2026",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-12",
    title: "Asma na Infância",
    slug: "asma-na-infancia-manejo",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 12,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 16 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 20,
    priority: "Alta",
    summary: "Índice Preditivo de Asma (IPA / API modificado em lactentes sibilantes recorrentes), etapas de tratamento profilático pelo GINA Pediátrico (<5 anos e 6-11 anos com Corticoide Inalatório em dose baixa) e manejo da crise asmática aguda com espaçador valvulado e corticoide oral.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ASMA NA INFÂNCIA (GINA PEDIÁTRICO)
├── Lactente Sibilante e IPA (Critérios Maiores: História parental de asma, dermatite atópica; Menores: Rinite alérgica, sibilância sem infecção, eosinofilia >=4%)
├── Tratamento de Manutenção Crônica
│   ├── 0 a 5 anos: Corticoide Inalatório (Budesonida/Beclometasona com espaçador e máscara)
│   └── 6 a 11 anos: Corticoide Inalatório em dose baixa diário ou CI + Formoterol
└── Manejo da Crise Aguda no Pronto Atendimento
    ├── Salbutamol spray via espaçador valvulado (4 a 8 jatos a cada 20 minutos na 1ª hora)
    ├── Prednisolona oral (1 a 2 mg/kg/dia por 3 a 5 dias)
    └── Brometo de Ipratrópio e Sulfato de Magnésio EV nos casos moderados a graves`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 16,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1"],
      patientProfiles: ["Criança de 4 anos com tosse seca noturna, episódios recorrentes de chiado no peito e mãe asmática."],
      frequentTriggers: ["Indicação de corticoide inalatório de uso contínuo via inalador dosimetrado acoplado a espaçador valvulado."],
      mostTestedDiagnosis: "Asma persistente na infância.",
      mostTestedConduct: "Iniciar corticoide inalatório de manutenção e orientar técnica de uso correto do espaçador.",
      recurringDistractors: ["Utilizar nebulizador comum ou inalador dosimetrado sem espaçador em crianças menores de 6 anos."],
      cognitiveMatrixPattern: "A banca exige domínio da técnica de inalação com espaçador com máscara facial bem adaptada.",
    },
    sources: [
      {
        institution: "GINA / SBP",
        document: "Global Strategy for Asthma Management and Prevention in Children",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-13",
    title: "Diarreia e Desidratação",
    slug: "diarreia-aguda-desidratacao-pediatrica",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 13,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 28 questões no banco Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 34,
    priority: "Crítica",
    summary: "Protocolo do Ministério da Saúde para Diarreia Aguda: Planos A (domiciliar com SRO e Zinco por 10-14 dias), B (na UBS com SRO supervisionado 50-100 mL/kg em 4h e gastróclise se vômitos persistentes) e C (Desidratação Grave com expansão venosa rápida por SF 0,9% ou Ringer Lactato). Disenteria e indicações de Ciprofloxacino/Ceftriaxona.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Esquema antigo do Plano C com múltiplas fases de reidratação e manutenção com soluções hipotônicas.",
      currentConduct: "Plano C Moderno do Ministério da Saúde: Expansão venosa rápida com Soro Fisiológico 0,9% (ou Ringer Lactato) em 100 mL/kg: menores de 1 ano (30 mL/kg em 30 min + 70 mL/kg em 2h30min); maiores de 1 ano (30 mL/kg em 30 min + 70 mL/kg em 2h30min). Manutenção do aleitamento materno e Zinco oral obrigatório.",
      previousDoc: "Manual de Doenças Diarreicas MS 2010",
      currentDoc: "Manejo do Paciente com Diarreia Aguda - Ministério da Saúde 2024",
      year: "2026",
      revalidaImpact: "Questão quase certa em todas as edições do Revalida INEP, tanto na prova teórica quanto na estação prática de habilidades clínicas.",
    },
    visualTreeMap: `MANEJO DA DIARREIA AGUDA (MINISTÉRIO DA SAÚDE)
├── PLANO A: Sem Desidratação (Prevenção no domicílio)
│   ├── Aumentar oferta de líquidos caseiros e Soro de Reidratação Oral (SRO) após cada evacuação
│   ├── Manter alimentação habitual e aleitamento materno
│   └── Prescrever Zinco elementar oral (10 mg/dia em <6m e 20 mg/dia em >=6m por 10 a 14 dias)
├── PLANO B: Com Desidratação Leve/Moderada (Tratamento na UBS)
│   ├── Administrar SRO na unidade de saúde (50 a 100 mL/kg em 4 a 6 horas sob supervisão)
│   └── Se vômitos persistentes (>=3 em 1h) ou recusa → Sondagem Nasogástrica (Gastróclise) antes da via venosa
└── PLANO C: Desidratação Grave / Choque (Tratamento Hospitalar Imediato)
    └── Expansão Venosa com SF 0,9% ou Ringer Lactato (100 mL/kg) com reavaliações frequentes do pulso e enchimento capilar`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 28,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Lactente com diarreia líquida há 2 dias, olhos encovados, saliva espessa e sinal da prega que desaparece lentamente."],
      frequentTriggers: ["Classificação correta no Plano B e início imediato de Terapia de Reidratação Oral (TRO) na UBS."],
      mostTestedDiagnosis: "Doença Diarreica Aguda com Desidratação (Plano B).",
      mostTestedConduct: "Administrar Solução de Reidratação Oral (SRO) supervisionada na UBS e suspender alimentos sólidos durante as 4 horas de TRO.",
      recurringDistractors: ["Indicar hidratação venosa (Plano C) para paciente alerta que aceita via oral, ou prescrever antidiarreicos/loperamida."],
      cognitiveMatrixPattern: "A banca pune severamente a prescrição de loperamida, antiespasmódicos ou antibióticos em diarreia aquosa simples.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Manejo da Criança com Diarreia Aguda - Linha de Cuidado",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-14",
    title: "Febre, Sepse e Infecções Graves",
    slug: "febre-sem-sinais-localizatorios-sepse-pediatrica",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 14,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 19 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 23,
    priority: "Crítica",
    summary: "Manejo da Febre sem Sinais Localizatórios (FSSL) estratificada por faixa etária (<28 dias: internação e rastreio infeccioso completo com punção lombar; 29-90 dias: Critérios de Rochester/Filadélfia; 3-36 meses: avaliação do estado geral e vacinas pneumo/meningo) e Sepse Pediátrica (Phoenix Sepsis Score 2024).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Critérios de SRIS pediátrica para definição de sepse.",
      currentConduct: "Critérios do Phoenix Sepsis Score (2024): Sepse pediátrica diagnosticada pela presença de suspeita de infecção com disfunção orgânica com risco de vida (pontuação >= 2 no escore Phoenix cardiovascular, respiratório, neurológico ou de coagulação).",
      previousDoc: "Consenso Internacional de Sepse Pediátrica 2005",
      currentDoc: "Phoenix Sepsis Score / SCCM 2024/2026",
      year: "2026",
      revalidaImpact: "Questões modernas focam no reconhecimento rápido de hipoperfusão (tempo de enchimento capilar > 2s) e antibioticoterapia na 1ª hora.",
    },
    visualTreeMap: `FEBRE SEM SINAIS LOCALIZATÓRIOS (FSSL)
├── Neonato (< 28 dias de vida): SEMPRE ALTO RISCO
│   ├── Conduta: Internação hospitalar obrigatória
│   ├── Rastreio Completo: Hemoculturas, Urocultura por cateterismo, Punção Lombar (LCR) e Rx Tórax
│   └── Antibioticoterapia Empírica EV: Ampicilina + Gentamicina (ou Cefotaxima)
├── Lactente de 1 a 3 meses (29 a 90 dias): Estratificação pelos Critérios de Rochester
│   ├── Baixo Risco (Previamente hígido, leucócitos 5.000-15.000, urina normal) → Acompanhamento ambulatorial rigoroso em 24h
│   └── Alto Risco → Internação e antibiótico parenteral
└── 3 a 36 meses: Avaliação da vacinação completa (Pneumo 10 e Meningo C); pesquisar Infecção Urinária (principal infecção oculta)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 19,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Neonato de 18 dias trazido com febre de 38,5ºC sem outros achados ao exame físico."],
      frequentTriggers: ["Conduta mandatória de rastreio infeccioso completo e internação imediata no período neonatal."],
      mostTestedDiagnosis: "Sepse neonatal tardia / FSSL de alto risco.",
      mostTestedConduct: "Colher exames completos (incluindo LCR e urina por cateterismo vesical), internar e iniciar Ampicilina + Cefotaxima/Gentamicina.",
      recurringDistractors: ["Liberar recém-nascido febril para casa apenas com antitérmico e reavaliação em 48 horas."],
      cognitiveMatrixPattern: "A banca considera erro inaceitável subestimar febre em recém-nascidos e lactentes jovens.",
    },
    sources: [
      {
        institution: "SBP",
        document: "Diretrizes de Febre sem Foco no Lactente e Criança Pequena",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "ped-15",
    title: "Desnutrição e Avaliação Nutricional",
    slug: "desnutricao-infantil-kwashiorkor-marasmo",
    areaId: "pediatria",
    areaName: "Pediatria",
    order: 15,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 15 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 18,
    priority: "Alta",
    summary: "Desnutrição Proteico-Calórica Grave: Marasmo (deficiência calórica global, emaciação, fácies senil, sem edema) vs Kwashiorkor (deficiência proteica, edema de extremidades, esteatose hepática, dermatite em placas) e os 10 passos do tratamento da OMS (Fase de Estabilização sem ferro inicial para evitar estresse oxidativo, Fase de Reabilitação e Acompanhamento).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `DESNUTRIÇÃO GRAVE INFANTIL (OMS / MS)
├── Formas Clínicas Graves
│   ├── Marasmo: Privação calórica total, emagrecimento acentuado ('pele e osso'), perda de gordura da bola de Bichat (fácies de velhinho)
│   └── Kwashiorkor: Privação proteica relativa, Edema simétrico de MMII/face, hepatomegalia por esteatose, alterações de pele e cabelo
└── Fases do Manejo da Desnutrição Grave (10 Passos da OMS)
    ├── 1. Fase de Estabilização (Dias 1 a 7): Tratar hipoglicemia, prevenir hipotermia, tratar desidratação (com ReSoMal), iniciar F-75 (NÃO DAR FERRO nesta fase)
    ├── 2. Fase de Reabilitação (Semanas 2 a 6): Ganho ponderal rápido com fórmula F-100, introduzir Ferro elementar e estímulo sensorial
    └── 3. Fase de Acompanhamento e Alta: Preparação para alta com apoio da Atenção Básica e Estratégia Saúde da Família`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 15,
      observedInExams: ["Revalida 2023.2", "Revalida 2021", "Revalida 2020"],
      patientProfiles: ["Criança de 2 anos com edema importante de membros inferiores, ascite, lesões cutâneas e anasarca."],
      frequentTriggers: ["Identificação do Kwashiorkor e regra de NÃO administrar ferro na fase de estabilização."],
      mostTestedDiagnosis: "Desnutrição grave tipo Kwashiorkor.",
      mostTestedConduct: "Aquecimento, correção de hipoglicemia, dieta com fórmula inicial F-75 e PROIBIÇÃO de ferro oral nos primeiros dias.",
      recurringDistractors: ["Prescrever sulfato ferroso em altas doses na admissão de criança com Kwashiorkor descompensado."],
      cognitiveMatrixPattern: "A banca testa o conhecimento dos 10 passos da OMS e o mecanismo de toxicidade do ferro livre na fase aguda.",
    },
    sources: [
      {
        institution: "Organização Mundial da Saúde (OMS) / Ministério da Saúde",
        document: "Manual para o Tratamento da Desnutrição Grave em Crianças",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
];
