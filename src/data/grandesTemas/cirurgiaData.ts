import { GrandeTema } from "../../types/grandesTemas";

export const CIRURGIA_THEMES: GrandeTema[] = [
  {
    id: "cir-01",
    title: "Atendimento Inicial ao Politraumatizado",
    slug: "atendimento-inicial-politraumatizado",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 1,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 28 questões no banco Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 34,
    priority: "Crítica",
    summary: "Sequência ABCDE do ATLS 10ª edição, via aérea definitiva com colar cervical, indicações de IOT e cricotireoidostomia, controle de hemorragias com ácido tranexâmico e reposição volêmica balanceada (1:1:1).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Infusão agressiva inicial de 2.000 mL de Ringer Lactato em bolus rápido no choque hemorrágico.",
      currentConduct: "Ressuscitação hemostática precoce: limitação de cristaloides a 1.000 mL, Ácido Tranexâmico nas primeiras 3h e protocolo de transfusão maciça 1:1:1 (Concentrado de Hemácias : Plasma Fresco : Plaquetas).",
      previousDoc: "ATLS 9ª Edição",
      currentDoc: "ATLS 10ª Edição / Diretrizes Brasileiras de Trauma 2024",
      year: "2026",
      revalidaImpact: "Questões atuais penalizam infusões maciças de cristaloides isolados em politraumatizados graves.",
    },
    visualTreeMap: `ATENDIMENTO AO POLITRAUMATIZADO (ATLS)
├── A: Vias Aéreas com Proteção da Coluna Cervical (Indicação de IOT / Cricotireoidostomia cirúrgica)
├── B: Respiração e Ventilação (Pneumotórax Hipertensivo, Aberto, Tórax Instável, Hemotórax Maciço)
├── C: Circulação e Controle de Hemorragia (Compressão direta, Torniquete, Ácido Tranexâmico, PTM 1:1:1)
├── D: Disfunção Neurológica (Escala de Coma de Glasgow com reatividade pupilar)
└── E: Exposição e Controle de Temperatura (Prevenção da Tríade Letal: Hipotermia, Acidose, Coagulopatia)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 28,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Vítima de colisão automobilística inconsciente, com hipotensão e cianose."],
      frequentTriggers: ["Identificação de pneumotórax hipertensivo que exige descompressão imediata antes de Rx."],
      mostTestedDiagnosis: "Pneumotórax hipertensivo e choque hemorrágico classe III/IV.",
      mostTestedConduct: "Toracocentese descompressiva com agulha no 4º/5º EIC anterior à linha axilar média, seguida de drenagem em selo d'água.",
      recurringDistractors: ["Solicitar radiografia de tórax para confirmar pneumotórax hipertensivo em paciente instável."],
      cognitiveMatrixPattern: "A banca pune severamente qualquer atraso em procedimentos que salvam vidas na avaliação primária.",
    },
    sources: [
      {
        institution: "American College of Surgeons / SBAIT",
        document: "Advanced Trauma Life Support (ATLS) - 10ª Edição",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-02",
    title: "Trauma Cranioencefálico",
    slug: "trauma-cranioencefalico",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 2,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 18 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 22,
    priority: "Crítica",
    summary: "Classificação pela ECG (Leve 13-15, Moderado 9-12, Grave <=8 com indicação de IOT), critérios de TC de crânio (Canadian CT Head Rule), Tríade de Cushing e hematoma epidural vs subdural.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `TRAUMA CRANIOENCEFÁLICO
├── Classificação: Leve (13-15), Moderado (9-12), Grave (<=8 → IOT Imediata para proteção de via aérea)
├── Hematoma Epidural (Artéria Meníngea Média, Intervalo Lúcido, Formato Biconvexo / Lente)
├── Hematoma Subdural (Veias Pontes, Idosos / Alcoólatras, Formato Crescente / Foice)
└── Hipertensão Intracraniana e Tríade de Cushing (Hipertensão + Bradicardia + Respiração Irregular)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 18,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2021"],
      patientProfiles: ["Jovem vítima de agressão que desmaiou, recuperou a consciência e 2 horas após entra em coma com midríase unilateral."],
      frequentTriggers: ["Intervalo lúcido clássico do hematoma extradural/epidural."],
      mostTestedDiagnosis: "Hematoma epidural agudo por lesão da artéria meníngea média.",
      mostTestedConduct: "Tomografia de crânio sem contraste e craniotomia descompressiva de urgência.",
      recurringDistractors: ["Confundir a imagem biconvexa do epidural com a forma semilunar do subdural."],
      cognitiveMatrixPattern: "A banca exige correlação radiológica com o mecanismo fisiopatológico vascular.",
    },
    sources: [
      {
        institution: "Brain Trauma Foundation / SBAIT",
        document: "Guidelines for the Management of Severe Traumatic Brain Injury",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-03",
    title: "Trauma Torácico",
    slug: "trauma-toracico",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 3,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 22 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 26,
    priority: "Crítica",
    summary: "As 6 lesões ameaçadoras da vida na avaliação primária: Pneumotórax Hipertensivo, Aberto (curativo de 3 pontas), Hemotórax Maciço (indicações de toracotomia), Tórax Instável e Tamponamento Cardíaco (Tríade de Beck).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `LESÕES TORÁCICAS AMEAÇADORAS À VIDA
├── Pneumotórax Hipertensivo → Descompressão por punção + Drenagem torácica tubular
├── Pneumotórax Aberto → Curativo de 3 pontas + Drenagem em local diferente
├── Hemotórax Maciço (>1500 mL na inserção ou >200 mL/h por 2-4h) → Toracotomia de Urgência
├── Tamponamento Cardíaco (Tríade de Beck: Hipotensão + Bulhas abafadas + Turgência jugular) → FAST / Janela pericárdica
└── Tórax Instável (Fratura de >= 2 costelas em >= 2 pontos) com Respiração Paradoxal`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 22,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Ferimento por arma branca paraesternal esquerdo com hipotensão, bulhas hipofonéticas e estase jugular."],
      frequentTriggers: ["Tríade de Beck e visualização de líquido no saco pericárdico pelo E-FAST."],
      mostTestedDiagnosis: "Tamponamento cardíaco traumático.",
      mostTestedConduct: "Janela pericárdica / toracotomia e reposição volêmica agressiva temporária.",
      recurringDistractors: ["Indicar drenagem torácica simples em selo d'água para tamponamento cardíaco."],
      cognitiveMatrixPattern: "A banca exige diferenciação clínica rigorosa entre pneumotórax hipertensivo e tamponamento cardíaco.",
    },
    sources: [
      {
        institution: "Colégio Brasileiro de Cirurgiões (CBC)",
        document: "Manual de Condutas no Trauma Torácico",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-04",
    title: "Trauma Abdominal",
    slug: "trauma-abdominal",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 4,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 24 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 28,
    priority: "Crítica",
    summary: "Abordagem no trauma contuso vs penetrante (arma de fogo vs arma branca), indicações de laparotomia imediata (peritonite, evisceração, choque com FAST+), e manejo não operatório de baço e fígado.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `TRAUMA ABDOMINAL
├── Trauma Penetrante
│   ├── PAF em abdome anterior/flanco → Laparotomia Exploradora mandatória
│   └── Arma Branca → Exploração digital da ferida sob anestesia local
├── Trauma Contuso (Baço e Fígado mais acometidos)
│   ├── Paciente Instável + FAST Positivo / LPD Positivo → Laparotomia Imediata
│   └── Paciente Estável → Tomografia Computadorizada de Abdome com Contraste
└── Cirurgia de Controle de Danos (Damage Control Surgery para controle de sangramento e contaminação)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 24,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Trauma contuso com hipotensão mantida e líquido livre no espaço de Morrison no FAST."],
      frequentTriggers: ["Instabilidade hemodinâmica associada a líquido livre na cavidade peritoneal."],
      mostTestedDiagnosis: "Choque hemorrágico intra-abdominal por rotura esplênica ou hepática.",
      mostTestedConduct: "Laparotomia exploradora de emergência.",
      recurringDistractors: ["Levar paciente instável para realizar Tomografia de Abdome."],
      cognitiveMatrixPattern: "Regra de ouro do INEP: Paciente instável NUNCA vai para a sala de tomografia.",
    },
    sources: [
      {
        institution: "SBAIT / CBC",
        document: "Diretrizes Nacionais no Trauma Abdominal",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-05",
    title: "Abdome Agudo",
    slug: "abdome-agudo-sindromes",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 5,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 20 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 24,
    priority: "Crítica",
    summary: "As 5 síndromes do abdome agudo: Inflamatório, Perfurativo (pneumoperitônio e sinal de Jobert), Obstrutivo, Hemorrágico e Vascular/Isquêmico (dor desproporcional ao exame físico).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SÍNDROMES DO ABDOME AGUDO
├── Inflamatório: Dor progressiva, febre, descompressão dolorosa (Apendicite, Colecistite, Diverticulite)
├── Perfurativo: Dor súbita 'em facada', abdome em tábua, Pneumoperitônio na Rx (Sinal de Jobert)
├── Obstrutivo: Dor em cólica, distensão, parada de eliminação de fezes/gases, níveis hidroaéreos
├── Hemorrágico: Sinais de choque hipovolêmico, palidez, dor peritoneal (Gravidez ectópica rota, Aneurisma roto)
└── Vascular / Isquêmico: Dor excruciante desproporcional ao exame físico em cardiopatas com FA`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 20,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2021"],
      patientProfiles: ["Idoso com fibrilação atrial admitido com dor periumbilical lancinante e abdome flácido sem irritação."],
      frequentTriggers: ["Dor intensa com exame abdominal inocente apontando para isquemia mesentérica aguda."],
      mostTestedDiagnosis: "Isquemia mesentérica aguda embólica.",
      mostTestedConduct: "Angiotomografia de abdome e laparotomia com embolectomia/revascularização.",
      recurringDistractors: ["Aguardar leucocitose ou sinais francos de peritonite para indicar angiotomografia."],
      cognitiveMatrixPattern: "A banca cobra o raciocínio sindrômico rápido para definir urgência cirúrgica.",
    },
    sources: [
      {
        institution: "CBC",
        document: "Manual de Diagnóstico e Conduta no Abdome Agudo",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-06",
    title: "Apendicite Aguda",
    slug: "apendicite-aguda",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 6,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 26 questões analisadas",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Cronologia de Murphy, sinais semiológicos clássicos (Blumberg, Rovsing, Obturador, Psoas, Lenander), escore de Alvarado, e apendicectomia videolaparoscópica.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `APENDICITE AGUDA
├── Cronologia de Murphy (Dor epigástrica/periumbilical → Fossa Ilíaca Direita no ponto de McBurney + Náuseas + Febre)
├── Sinais Semiológicos (Blumberg +, Rovsing +, Sinal do Psoas +, Sinal do Obturador +, Sinal de Lenander +)
├── Escore de Alvarado (Avaliação de probabilidade clínica)
├── Diagnóstico por Imagem: USG em crianças e gestantes; TC de abdome em homens adultos/idosos
└── Tratamento: Apendicectomia (Videolaparoscópica preferencial) + Antibioticoprofilaxia`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 26,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Jovem de 22 anos com dor periumbilical migrando para FID há 18h e descompressão positiva."],
      frequentTriggers: ["Quadro clínico clássico em homem jovem dispensando exames de imagem adicionais."],
      mostTestedDiagnosis: "Apendicite aguda não complicada.",
      mostTestedConduct: "Indicação de apendicectomia cirúrgica imediata e hidratação.",
      recurringDistractors: ["Solicitar colonoscopia ou barium enema na suspeita de apendicite aguda."],
      cognitiveMatrixPattern: "A banca valoriza a soberania da clínica clássica no homem jovem e o uso racional do ultrassom na gestante.",
    },
    sources: [
      {
        institution: "CBC / Colégio Brasileiro de Cirurgia Digestiva (CBCD)",
        document: "Diretrizes Nacionais de Apendicite Aguda",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-07",
    title: "Colecistite e Colangite",
    slug: "colecistite-colangite-coledocolitiase",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 7,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 21 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 25,
    priority: "Crítica",
    summary: "Diferenciação entre Cólica Biliar, Colecistite Aguda (Sinal de Murphy +, espessamento de parede > 4mm na USG), Coledocolitíase e Colangite Aguda Tóxica (Tríade de Charcot e Pêntade de Reynolds).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `DOENÇAS DA VIA BILIAR (TOKYO GUIDELINES)
├── Colecistite Aguda: Murphy +, febre, leucocitose → USG de abdome → Colecistectomia precoce (<72h)
├── Coledocolitíase: Icterícia obstrutiva flutuante, colúria, acolia sem febre → CPRE / ColangioRM
└── Colangite Aguda
    ├── Não Supurativa (Tríade de Charcot: Dor em HCD + Icterícia + Febre com calafrios)
    └── Tóxica / Supurativa (Pêntade de Reynolds: Charcot + Hipotensão + Rebaixamento sensorial → Descompressão biliar de urgência por CPRE)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 21,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2020"],
      patientProfiles: ["Mulher de 50 anos com icterícia, febre com calafrios, confusão mental e PA 80x50 mmHg."],
      frequentTriggers: ["Identificação da Pêntade de Reynolds exigindo descompressão biliar emergencial."],
      mostTestedDiagnosis: "Colangite aguda grave (supurativa).",
      mostTestedConduct: "Antibioticoterapia venosa + Descompressão biliar de urgência por CPRE.",
      recurringDistractors: ["Indicar colecistectomia aberta de emergência antes de drenar a via biliar na colangite grave."],
      cognitiveMatrixPattern: "A banca exige diferenciação clara entre patologia restrita à vesícula vs infecção obstrutiva da via biliar principal.",
    },
    sources: [
      {
        institution: "Tokyo Guidelines / CBCD",
        document: "Tokyo Guidelines for Management of Acute Cholecystitis and Cholangitis",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-08",
    title: "Pancreatite Aguda",
    slug: "pancreatite-aguda",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 8,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 17 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 20,
    priority: "Alta",
    summary: "Critérios de Atlanta (diagnóstico por dor típica, lípase/amilase > 3x LSN ou imagem), escores de Ranson e BISAP, hidratação parcimoniosa com Ringer Lactato e indicação de colecistectomia na mesma internação.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `PANCREATITE AGUDA (ATLANTA CLASSIFICATION)
├── Diagnóstico: Pelo menos 2 de 3 (Dor epigástrica em faixa, Lipase/Amilase >3x LSN, Imagem compatível)
├── Etiologias Principais: Biliar (Litiásica ~45%) e Alcoólica (~35%)
├── Manejo Inicial: Ressuscitação volêmica guiada por metas (Ringer Lactato), analgesia e realimentação oral precoce
└── Pancreatite Biliar Leve: Colecistectomia videolaparoscópica na mesma internação hospitalar para evitar recidiva`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 17,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.1"],
      patientProfiles: ["Paciente com dor em barra no andar superior do abdome e elevação de lipase de 1.400 U/L."],
      frequentTriggers: ["Indicação de colecistectomia antes da alta hospitalar na etiologia litiásica."],
      mostTestedDiagnosis: "Pancreatite aguda litiásica leve.",
      mostTestedConduct: "Jejum apenas até melhora da dor/náusea + hidratação venosa + colecistectomia antes da alta.",
      recurringDistractors: ["Prescrever antibioticoprofilaxia de rotina com ciprofloxacino ou imipenem em pancreatite leve."],
      cognitiveMatrixPattern: "A banca penaliza o uso indiscriminado de antibióticos e o adiamento da cirurgia da vesícula.",
    },
    sources: [
      {
        institution: "CBCD / Federação Brasileira de Gastroenterologia",
        document: "Diretrizes Nacionais de Pancreatite Aguda",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-09",
    title: "Obstrução Intestinal",
    slug: "obstrucao-intestinal",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 9,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 16 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 19,
    priority: "Alta",
    summary: "Diferenciação entre obstrução alta (delgado - bridas/aderências e hérnias) e baixa (cólon - neoplasia colorretal e vólvulo de sigmoide com imagem em grão de café), sinais de estrangulamento e conduta cirúrgica.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `OBSTRUÇÃO INTESTINAL
├── Obstrução de Delgado (Alta)
│   ├── Causas: Bridas / Aderências pós-operatórias (1ª causa), Hérnias encarceradas
│   └── Rx Abdome: Empilhamento de moedas, níveis hidroaéreos centrais
└── Obstrução Colônica (Baixa)
    ├── Causas: Neoplasia de Cólon (1ª causa), Vólvulo de Sigmoide (Sinal do Grão de Café / U invertido)
    └── Sinais de Alarme (Estrangulamento/Isquemia): Febre, leucocitose, peritonite, acidose → Laparotomia Imediata`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 16,
      observedInExams: ["Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Idoso institucionalizado com distensão abdominal maciça e Rx mostrando imagem em grão de café."],
      frequentTriggers: ["Reconhecimento do vólvulo de sigmoide sem sinais de necrose."],
      mostTestedDiagnosis: "Vólvulo de sigmoide não complicado.",
      mostTestedConduct: "Descompressão e distorção por retossigmoidoscopia ou colonoscopia, com programação cirúrgica posterior.",
      recurringDistractors: ["Indicar laparotomia imediata para vólvulo de sigmoide sem sinais de peritonite ou perfuração."],
      cognitiveMatrixPattern: "A banca testa se o médico sabe quando descompressão endoscópica é segura antes da colectomia.",
    },
    sources: [
      {
        institution: "CBC / Sociedade Brasileira de Coloproctologia",
        document: "Diretrizes de Obstrução Intestinal Aguda",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-10",
    title: "Hemorragia Digestiva",
    slug: "hemorragia-digestiva-alta-baixa",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 10,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 23 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 28,
    priority: "Crítica",
    summary: "Classificação anatômica pelo ângulo de Treitz: Hemorragia Digestiva Alta (HDA - Úlcera Péptica e Classificação de Forrest) vs Hemorragia Digestiva Baixa (HDB - Divertículo e Angiodisplasia), escore de Glasgow-Blatchford e conduta na EDA.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `HEMORRAGIA DIGESTIVA
├── Hemorragia Digestiva Alta (Acima do ângulo de Treitz: Hematêmese, Melena)
│   ├── Não Varicosa (Úlcera Péptica): Classificação de Forrest (Ia/Ib/IIa com alto risco de ressangramento → Terapia Dupla Endoscópica)
│   └── Varicosa (Varizes Esofagogástricas): Terlipressina EV + Ceftriaxona + Ligadura Elástica
└── Hemorragia Digestiva Baixa (Enterorragia / Hematoquezia)
    ├── Causas: Divertículo colônico (1ª causa de sangramento volumoso), Angiodisplasia, Câncer
    └── Colonoscopia após estabilização hemodinâmica e preparo adequado`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 23,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1", "Revalida 2021"],
      patientProfiles: ["Paciente com hematêmese e melena; EDA revela úlcera gástrica com vaso visível não sangrante (Forrest IIa)."],
      frequentTriggers: ["Classificação de Forrest IIa exigindo terapia endoscópica combinada + IBP venoso em dose alta."],
      mostTestedDiagnosis: "HDA por Úlcera Péptica com alto risco de ressangramento.",
      mostTestedConduct: "Terapia endoscópica combinada (Injeção de adrenalina + método térmico ou mecânico) + Omeprazol EV.",
      recurringDistractors: ["Indicar alta precoce em paciente com Forrest IIa ou IIb sem monitorização hospitalar."],
      cognitiveMatrixPattern: "A banca exige memorização da Classificação de Forrest e indicação precisa de terapia endoscópica.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Endoscopia Digestiva (SOBED)",
        document: "Consenso Nacional de Hemorragia Digestiva Alta",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-11",
    title: "Hérnias da Parede Abdominal",
    slug: "hernias-parede-abdominal",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 11,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 18 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 22,
    priority: "Alta",
    summary: "Classificação de Nyhus, diferenciação anatômica (Hérnia Inguinal Indireta pelo anel inguinal profundo vs Direta pelo Triângulo de Hesselbach vs Femoral/Crural no canal femoral com maior risco de estrangulamento), e técnicas cirúrgicas (Lichtenstein).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `HÉRNIAS DA REGIÃO INGUINOCRURAL
├── Hérnia Inguinal Indireta (Nyhus II): Passa pelo anel inguinal profundo, lateral aos vasos epigástricos inferiores (mais comum)
├── Hérnia Inguinal Direta (Nyhus IIIa): Fraqueza da fáscia transversalis no Triângulo de Hesselbach, medial aos vasos epigástricos
├── Hérnia Femoral / Crural (Nyhus IIIb): Abaixo do ligamento inguinal, mais frequente em mulheres, altíssimo risco de estrangulamento
└── Encarcerada (irredutível sem isquemia) vs Estrangulada (isquemia, dor intensa, sinais flogísticos → Cirurgia de Urgência)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 18,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Mulher de 68 anos com abaulamento doloroso e irredutível abaixo do ligamento inguinal direito."],
      frequentTriggers: ["Reconhecimento de hérnia femoral e indicação cirúrgica de urgência pelo risco de necrose."],
      mostTestedDiagnosis: "Hérnia femoral encarcerada/estrangulada.",
      mostTestedConduct: "Herniorrafia cirúrgica de urgência (evitar manobras de redução forçada sob risco de translocação).",
      recurringDistractors: ["Tentar redução forçada de hérnia com sinais de estrangulamento e sofrimento de alça."],
      cognitiveMatrixPattern: "A banca avalia anatomia do canal inguinal e a conduta de não tentar reduzir hérnia estrangulada.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Hérnia (SBH) / CBC",
        document: "Diretrizes Nacionais para Tratamento de Hérnias da Parede Abdominal",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-12",
    title: "Queimaduras",
    slug: "queimaduras-manejo-inicial",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 12,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 15 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 18,
    priority: "Alta",
    summary: "Regra dos Nove de Wallace para cálculo de Superfície Corpórea Queimada (SCQ), Fórmula de Parkland / Brooke modificada (2 a 4 mL x kg x %SCQ de Ringer Lactato), critérios de intubação precoce por lesão por inalação e escarotomia.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `ATENDIMENTO AO PACIENTE QUEIMADO
├── Avaliação de Vias Aéreas: Suspeita de Lesão por Inalação (Queimadura em ambiente fechado, vibrissas nasais chamuscadas, escarro carbonáceo, rouquidão → IOT Precoce)
├── Cálculo da SCQ (Regra dos Nove de Wallace em adultos: Cabeça 9%, Tronco Ant 18%, Tronco Post 18%, MMSS 9% cada, MMII 18% cada, Períneo 1%)
├── Reposição Volêmica (Parkland Modificada: 2 mL x Peso kg x % SCQ de Ringer Lactato nas primeiras 24h; metade nas primeiras 8h)
└── Queimaduras Circunferenciais de Tronco/Membros: Risco de Síndrome Compartimentar → Escarotomia de urgência`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 15,
      observedInExams: ["Revalida 2024.2", "Revalida 2022.2", "Revalida 2020"],
      patientProfiles: ["Paciente resgatado de incêndio domiciliar com rouquidão e fuligem na orofaringe."],
      frequentTriggers: ["Indicação mandatória de IOT antes da instalação de edema de glote obstrutivo."],
      mostTestedDiagnosis: "Lesão térmica de via aérea por inalação.",
      mostTestedConduct: "Intubação orotraqueal imediata com tubo de calibre adequado antes da progressão do edema.",
      recurringDistractors: ["Aguardar dessaturação na oximetria de pulso para intubar paciente com lesão por inalação evidente."],
      cognitiveMatrixPattern: "A oximetria de pulso superestima a saturação na intoxicação por monóxido de carbono (carboxihemoglobina).",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Queimaduras (SBQ) / Ministério da Saúde",
        document: "Cartilha para Tratamento de Emergência das Queimaduras",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-13",
    title: "Cuidados Pré e Pós-Operatórios",
    slug: "cuidados-pre-pos-operatorios",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 13,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 14 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 17,
    priority: "Alta",
    summary: "Estratificação de risco cirúrgico (Classificação ASA, Índice de Lee / RCRI), solicitação racional de exames pré-operatórios, manejo de anticoagulantes/antiagregantes e protocolo ERAS / ACERTO para jejum abreviado e realimentação precoce.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `PERIOPERATÓRIO (PROTOCOLO ACERTO / ERAS)
├── Avaliação Pré-Operatória
│   ├── ASA I a VI e Índice Cardíaco de Lee
│   └── Exames Complementares: Solicitados apenas com base em comorbidades e porte cirúrgico
├── Jejum Pré-Operatório Moderno: Líquidos claros com carboidratos até 2h antes da cirurgia; sólidos até 6-8h
└── Profilaxia de TEV (Escore de Caprini para indicação de Enoxaparina e meias pneumáticas intermitentes)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 14,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1"],
      patientProfiles: ["Paciente jovem hígido ASA I candidato a herniorrafia inguinal eletiva."],
      frequentTriggers: ["Solicitação de bateria de exames pré-operatórios desnecessários em pacientes jovens hígidos."],
      mostTestedDiagnosis: "Avaliação pré-operatória de baixo risco.",
      mostTestedConduct: "Liberação para cirurgia sem necessidade de ECG ou exames laboratoriais de rotina.",
      recurringDistractors: ["Exigir coagulograma, Rx de tórax e ureia/creatinina para todos os pacientes cirúrgicos indiscriminadamente."],
      cognitiveMatrixPattern: "A banca do INEP valoriza o uso racional de recursos e combate a solicitação de exames defensivos.",
    },
    sources: [
      {
        institution: "Colégio Brasileiro de Cirurgiões (CBC) / Projeto ACERTO",
        document: "Diretrizes Nacionais do Projeto ACERTO",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-14",
    title: "Infecção de Sítio Cirúrgico e Complicações Pós-operatórias",
    slug: "infeccao-sitio-cirurgico-complicacoes",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 14,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 13 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–30 min",
    moduleCount: 16,
    relatedQuestionsCount: 16,
    priority: "Alta",
    summary: "Febre no pós-operatório (Os 5 Ws: Wind/Atelectasia nas 24-48h, Water/ITU nas 48-72h, Wound/ISC após 72h, Walking/TVP e Wonder drugs), classificação e manejo de ISC superficial vs profunda com drenagem.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `COMPLICAÇÕES PÓS-OPERATÓRIAS
├── Linha do Tempo da Febre Pós-Operatória
│   ├── D1-D2: Atelectasia pulmonar (1ª causa de febre precoce → Fisioterapia respiratória / Deambulação)
│   ├── D3: Infecção do Trato Urinário associada a cateter vesical
│   ├── D4-D7: Infecção do Sítio Cirúrgico (Superficial, Profunda ou Espaço/Órgão)
│   └── > D7: Trombose Venosa Profunda / TEP ou Abscesso intra-abdominal
└── Infecção de Sítio Cirúrgico: Abertura dos pontos, drenagem de secreção purulenta e curativo secundário`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 13,
      observedInExams: ["Revalida 2023.2", "Revalida 2021"],
      patientProfiles: ["Paciente no 5º DPO de laparotomia com eritema, calor e flutuação na ferida operatória."],
      frequentTriggers: ["Conduta fundamental de remoção dos pontos e drenagem da coleção purulenta."],
      mostTestedDiagnosis: "Infecção de sítio cirúrgico incisional superficial.",
      mostTestedConduct: "Abertura de pontos na área de flutuação, drenagem purulenta e lavagem (antibiótico apenas se celulite extensa).",
      recurringDistractors: ["Prescrever antibiótico venoso sem abrir a ferida para drenar o abscesso subcutâneo."],
      cognitiveMatrixPattern: "A máxima cirúrgica: 'Ubi pus, ibi evacua' (onde há pus, drene).",
    },
    sources: [
      {
        institution: "ANVISA / CBC",
        document: "Critérios Diagnósticos de Infecções Relacionadas à Assistência à Saúde",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cir-15",
    title: "Câncer Colorretal",
    slug: "cancer-colorretal",
    areaId: "cirurgia",
    areaName: "Cirurgia Geral",
    order: 15,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 12 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 15,
    priority: "Alta",
    summary: "Rastreamento a partir dos 45-50 anos (pesquisa de sangue oculto nas fezes anual e colonoscopia a cada 10 anos), manifestações clínicas (cólon direito com anemia ferropriva vs cólon esquerdo com alteração do hábito intestinal e obstrução), e estadiamento TNM.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `CÂNCER COLORRETAL (INCA / MS)
├── Rastreamento: População de risco habitual a partir dos 45-50 anos (PSOF anual ou Colonoscopia cada 10 anos)
├── Apresentação Clínica por Topografia
│   ├── Cólon Direito (Ceco / Ascendente): Lesões vegetantes, sangramento oculto crônico, anemia microcítica e massa palpável
│   └── Cólon Esquerdo / Reto: Lesões estenosantes em anel, alteração do hábito intestinal (fezes em fita), hematoquezia e obstrução
└── Tratamento: Colectomia oncológica com linfadenectomia (mínimo de 12 linfonodos ressecados)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 12,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.2"],
      patientProfiles: ["Homem de 65 anos com anemia ferropriva sem causa alimentar e sangue oculto positivo nas fezes."],
      frequentTriggers: ["Investigação obrigatória de cólon com colonoscopia em qualquer idoso com anemia ferropriva sem causa aparente."],
      mostTestedDiagnosis: "Neoplasia de cólon direito (ceco/ascendente).",
      mostTestedConduct: "Colonoscopia total com biópsia das lesões suspeitas.",
      recurringDistractors: ["Tratar apenas com sulfato ferroso sem indicar colonoscopia em paciente idoso."],
      cognitiveMatrixPattern: "A banca considera negligência médica tratar anemia ferropriva em idosos sem investigar trato gastrointestinal.",
    },
    sources: [
      {
        institution: "INCA / Ministério da Saúde",
        document: "Diretrizes para o Rastreamento e Tratamento do Câncer Colorretal",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
];
