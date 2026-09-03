import { GrandeTema } from "../../types/grandesTemas";

export const CLINICA_MEDICA_THEMES: GrandeTema[] = [
  {
    id: "cm-01",
    title: "Hipertensão Arterial e Emergências Hipertensivas",
    slug: "hipertensao-arterial-emergencias",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 1,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 22 questões em provas do Revalida INEP (2020-2026)",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 28,
    priority: "Crítica",
    summary: "Diagnóstico estratificado pela MAPA/MRPA, metas pressóricas no SUS, combinação inicial de anti-hipertensivos e manejo de emergências com nitroprussiato/labetalol.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Monoterapia inicial em hipertensão estágio 1 sem outros fatores de risco.",
      currentConduct: "Combinação precoce em dose fixa (IECA/BRA + BCC ou Tiazídico) para a maioria dos pacientes com risco cardiovascular moderado/alto.",
      previousDoc: "Diretriz Brasileira de Hipertensão 2020",
      currentDoc: "Diretrizes Brasileiras de Hipertensão Arterial 2024/2026 - SBC/MS",
      year: "2026",
      revalidaImpact: "A banca do INEP cobra a associação de duas drogas de classes distintas já na primeira consulta para pacientes com PA >= 140/90 com comorbidades.",
    },
    visualTreeMap: `HIPERTENSÃO ARTERIAL SISTÊMICA
├── Diagnóstico & Rastreio (PA Consultório, MAPA, MRPA)
├── Estratificação de Risco (LOA, DCV, DRC, DM)
├── Tratamento Ambulatorial (IECA/BRA, BCC, Tiazídico)
└── Crises Hipertensivas
    ├── Urgência (sem LOA aguda → Anti-hipertensivo VO)
    └── Emergência (com LOA aguda → Nitroprussiato/Labetalol EV em UTI)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 22,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1", "Revalida 2021"],
      patientProfiles: ["Paciente de 55 anos, tabagista, assintomático com PA 155x95 mmHg em consulta de rotina na UBS."],
      frequentTriggers: ["Identificação de lesão de órgão-alvo aguda no fundo de olho e ECG", "Diferenciação entre urgência e emergência hipertensiva."],
      mostTestedDiagnosis: "Hipertensão Primária Estágio 2 com indicação de terapia dupla combinada.",
      mostTestedConduct: "Associação de IECA/BRA + Anlodipino ou Hidroclorotiazida; em emergência, Nitroprussiato de Sódio EV.",
      recurringDistractors: ["Uso de Captopril sublingual na urgência hipertensiva (contraindicado)", "Iniciar monoterapia quando a PA está > 20/10 mmHg acima da meta."],
      cognitiveMatrixPattern: "A banca avalia se o médico generalista na Atenção Primária sabe estratificar o risco cardiovascular e evitar condutas iatrogênicas de redução abrupta da PA em pseudocrises.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / CONITEC",
        document: "PCDT de Hipertensão Arterial Sistêmica",
        year: "2024",
        sourceType: "oficial_sus",
      },
      {
        institution: "Sociedade Brasileira de Cardiologia (SBC)",
        document: "Diretrizes Brasileiras de Hipertensão Arterial",
        year: "2024/2026",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-02",
    title: "Diabetes Mellitus e Emergências Diabéticas",
    slug: "diabetes-mellitus-emergencias",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 2,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 26 questões analisadas",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 32,
    priority: "Crítica",
    summary: "Critérios diagnósticos de DM2, rastreamento de neuropatia e nefropatia, metas de HbA1c, e protocolo hospitalar de Cetoacidose Diabética (CAD) e Estado Hiperosmolar.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `DIABETES MELLITUS
├── Diagnóstico (Glicemia de Jejum >=126, HbA1c >=6.5%, TOTG >=200)
├── Manejo Ambulatorial (Metformina, iSGLT2, aGLP1, Insulinas)
├── Rastreamento de Complicações (Pé Diabético, Albuminúria, Fundo de Olho)
└── Complicações Agudas
    ├── Cetoacidose Diabética (CAD: Glicemia >250, pH <7.3, Cetonemia, Anion Gap aumentado)
    └── Estado Hiperosmolar Hiperglicêmico (EHH: Osmolaridade >320, Glicemia >600)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 26,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Jovem com DM1 apresentando dor abdominal, vômitos e respiração de Kussmaul."],
      frequentTriggers: ["Potássio sérico antes da insulinoterapia na CAD."],
      mostTestedDiagnosis: "Cetoacidose Diabética descompensada por infecção.",
      mostTestedConduct: "Hidratação venosa vigorosa com SF 0,9% + reposição de Potássio se K < 5.2 mEq/L antes da insulina.",
      recurringDistractors: ["Iniciar insulina regular EV em bolus com Potássio < 3.3 mEq/L."],
      cognitiveMatrixPattern: "Foco na segurança terapêutica no pronto-socorro e no escalonamento de antidiabéticos na APS.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Diabetes (SBD)",
        document: "Diretrizes da Sociedade Brasileira de Diabetes 2024/2025",
        year: "2025",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-03",
    title: "Síndrome Coronariana Aguda",
    slug: "sindrome-coronariana-aguda",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 3,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 19 questões em provas INEP",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 24,
    priority: "Crítica",
    summary: "Estratificação IAM com supra de ST vs sem supra de ST, tempo porta-agulha e porta-balão, terapia antiisquêmica e antitrombótica imediata.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SÍNDROME CORONARIANA AGUDA
├── ECG em até 10 minutos
├── IAM com Supra de ST
│   ├── Angioplastia Primária (<120 min)
│   └── Trombólise com Trombolítico se transferência >120 min (porta-agulha <30 min)
└── IAM sem Supra / Angina Instável
    └── Estratificação por Troponina e Escore HEART/TIMI/GRACE`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 19,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2020"],
      patientProfiles: ["Homem de 62 anos com dor retroesternal em aperto irradiada para mandíbula há 2 horas."],
      frequentTriggers: ["Identificação de supra de ST em derivações contíguas e conduta de reperfusão."],
      mostTestedDiagnosis: "IAM com supradesnivelamento do segmento ST em parede anterior/inferior.",
      mostTestedConduct: "Dupla antiagregação (AAS + Clopidogrel) + Heparina + Reperfusão imediata.",
      recurringDistractors: ["Aguardar curva enzimática de troponina antes de trombolisar paciente com supra evidente."],
      cognitiveMatrixPattern: "A banca cobra o reconhecimento do tempo-sensibilidade e as contraindicações formais aos trombolíticos.",
    },
    sources: [
      {
        institution: "SBC / Ministério da Saúde",
        document: "Diretriz de Síndrome Coronariana Aguda",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-04",
    title: "Insuficiência Cardíaca",
    slug: "insuficiencia-cardiaca",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 4,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 14 questões catalogadas",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 18,
    priority: "Alta",
    summary: "Critérios de Framingham, classificação NYHA/AHA, e os 4 pilares farmacológicos com impacto na mortalidade na IC com fração de ejeção reduzida (ICFEr).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `INSUFICIÊNCIA CARDÍACA
├── Diagnóstico Clínico (Critérios de Framingham + BNP/NT-proBNP)
├── Classificação Fenotípica (ICFEr FE<=40%, ICFElm 41-49%, ICFEp FE>=50%)
└── Quádrupla Terapia Padrão-Ouro na ICFEr
    ├── 1. Inibidor de SGLT2 (Dapagliflozina / Empagliflozina)
    ├── 2. Betabloqueador (Carvedilol, Succinato de Metoprolol, Bisoprolol)
    ├── 3. IECA/BRA ou Sacubitril-Valsartana (INRA)
    └── 4. Antagonista de Mineralocorticoide (Espironolactona)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 14,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.1"],
      patientProfiles: ["Paciente com dispneia paroxística noturna, turgência jugular a 45 graus e fração de ejeção de 32%."],
      frequentTriggers: ["Drogas que reduzem mortalidade vs drogas puramente sintomáticas (furosemida/digoxina)."],
      mostTestedDiagnosis: "IC descompensada perfil B (quente e úmido).",
      mostTestedConduct: "Furosemida venosa + vasodilatador se PA estável; introdução progressiva do quarteto fantástico.",
      recurringDistractors: ["Iniciar betabloqueador em dose alta durante a fase de congestão aguda descompensada."],
      cognitiveMatrixPattern: "Diferenciação clara entre manejo da fase aguda congestiva e terapia modificadora de prognóstico a longo prazo.",
    },
    sources: [
      {
        institution: "SBC",
        document: "Diretriz Brasileira de Insuficiência Cardíaca 2023/2025",
        year: "2025",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-05",
    title: "Arritmias e Fibrilação Atrial",
    slug: "arritmias-fibrilacao-atrial",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 5,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 12 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 16,
    priority: "Alta",
    summary: "Manejo da Fibrilação Atrial estável vs instável, estratificação de risco de AVC pelo escore CHA2DS2-VASc e HAS-BLED, anticoagulação oral e controle de frequência vs ritmo.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `FIBRILAÇÃO ATRIAL
├── Avaliação de Estabilidade Hemodinâmica
│   ├── Instável (Hipotensão, dor torácica, EAP, síncope) → Cardioversão Elétrica Sincronizada
│   └── Estável → Controle de Frequência ou Ritmo
└── Prevenção de Tromboembolismo
    ├── Escore CHA2DS2-VASc (>=2 em homens, >=3 em mulheres → Anticoagulação DOAC ou Warfarina)
    └── Escore HAS-BLED (Risco de sangramento)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 12,
      observedInExams: ["Revalida 2023.2", "Revalida 2021"],
      patientProfiles: ["Idosa com palpitações taquicárdicas irregulares sem onda P no eletrocardiograma."],
      frequentTriggers: ["Cálculo do CHA2DS2-VASc e indicação correta de anticoagulante oral direto (DOAC)."],
      mostTestedDiagnosis: "Fibrilação Atrial com alta resposta ventricular.",
      mostTestedConduct: "Controle de FC com betabloqueador/diltiazem e anticoagulação oral se escore positivo.",
      recurringDistractors: ["Prescrever apenas AAS para prevenção de AVC em paciente com CHA2DS2-VASc elevado."],
      cognitiveMatrixPattern: "A banca exige que o candidato domine a sincronização no cardioversor e a decisão de anticoagulação perene.",
    },
    sources: [
      {
        institution: "SBC",
        document: "Diretrizes de Fibrilação Atrial",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-06",
    title: "Acidente Vascular Cerebral",
    slug: "acidente-vascular-cerebral",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 6,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 18 questões nas provas oficiais",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 22,
    priority: "Crítica",
    summary: "Janela terapêutica de 4.5h para trombólise com rt-PA/alteplase, diferenciação isquêmico vs hemorrágico por TC de crânio, metas de PA permissiva e prevenção secundária.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `AVC AGUDO
├── Escala de Cincinnati e NIHSS
├── TC de Crânio Imediata sem Contraste (Descartar Sangramento)
├── AVC Isquêmico
│   ├── Janela <= 4.5h sem contraindicações → Trombólise com Alteplase EV (PA < 185x110)
│   ├── Trombectomia Mecânica (Oclusão de grande vaso até 24h)
│   └── PA permissiva (não baixar se < 220x120 em não candidatos a trombolítico)
└── AVC Hemorrágico (Controle rigoroso de PA < 140 mmHg e reversão de coagulopatia)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 18,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Paciente admitido com hemiparesia braquiofacial direita e afasia há 2h30min."],
      frequentTriggers: ["Manejo da pressão arterial antes de infundir o trombolítico."],
      mostTestedDiagnosis: "AVC Isquêmico em janela terapêutica.",
      mostTestedConduct: "TC de crânio imediata, redução de PA para < 185/110 mmHg e alteplase 0,9 mg/kg.",
      recurringDistractors: ["Prescrever AAS imediatamente antes das primeiras 24 horas pós-trombólise."],
      cognitiveMatrixPattern: "Atenção ao horário do último momento visto normal (ictus) e contraindicações formais ao trombolítico.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Linha de Cuidado do Acidente Vascular Cerebral no SUS",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-07",
    title: "Pneumonia e Infecções Respiratórias",
    slug: "pneumonia-infeccoes-respiratorias",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 7,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 21 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 26,
    priority: "Crítica",
    summary: "Estratificação de gravidade pelo escore CURB-65 / CRB-65, indicação de tratamento ambulatorial vs enfermaria vs UTI, e esquema antibiótico no SUS.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `PNEUMONIA ADQUIRIDA NA COMUNIDADE (PAC)
├── Diagnóstico Clínico-Radiológico (Sintomas respiratórios + Infiltrado na Rx)
├── Estratificação CURB-65 (Confusão, Ureia >50, FR >=30, PA <90/60, Idade >=65)
│   ├── CURB 0-1 → Ambulatório (Amoxicilina + Clavulanato ou Macrolídeo)
│   ├── CURB 2 → Internação em Enfermaria (Beta-lactâmico + Macrolídeo)
│   └── CURB >=3 → Considerar UTI (Ceftriaxona + Azitromicina ou Quinolona respiratória)
└── Derrame Pleural Parapneumônico (Critérios de Light e indicação de toracocentese)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 21,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Idoso de 72 anos com tosse produtiva, febre, FR 32 e PA normal na UBS."],
      frequentTriggers: ["Cálculo do CRB-65 na atenção primária sem necessidade de dosagem de ureia."],
      mostTestedDiagnosis: "PAC bacteriana com indicação de internação hospitalar por taquipneia e idade.",
      mostTestedConduct: "Prescrição de Amoxicilina + Clavulanato ou Ceftriaxona associada a Azitromicina.",
      recurringDistractors: ["Indicar tratamento domiciliar com CURB-65 >= 2."],
      cognitiveMatrixPattern: "Foco na decisão de internação segura e respeito aos protocolos de antibióticos da Atenção Básica.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Pneumologia e Tisiologia (SBPT)",
        document: "Diretrizes Brasileiras para Tratamento da PAC",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-08",
    title: "Asma e DPOC",
    slug: "asma-dpoc",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 8,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 16 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 20,
    priority: "Alta",
    summary: "Etapas do GINA para controle da asma (CI + formoterol de alívio e manutenção), classificação GOLD da DPOC e manejo das exacerbações infecciosas com corticoide e antibiótico.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `DOENÇAS OBSTRUTIVAS CRÔNICAS
├── ASMA (GINA 2024/2026)
│   ├── Diagnóstico: Espirometria com resposta broncodilatadora significativa (VEF1 >12% e >200mL)
│   └── Tratamento: Corticoide Inalatório (CI) + Formoterol como pilar fundamental
└── DPOC (GOLD 2024/2026)
    ├── Diagnóstico: VEF1/CVF < 0.70 pós-broncodilatador irreversível
    ├── Grupos A, B e E (LAMA + LABA para exarcerbadores)
    └── Exacerbação Aguda: Sinais de Anthonisen (Volume, Purulência, Dispneia)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 16,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.1"],
      patientProfiles: ["Tabagista de 60 anos com aumento da expectoração purulenta e piora da dispneia basal."],
      frequentTriggers: ["Tríade de Anthonisen indicando antibioticoterapia na exacerbação de DPOC."],
      mostTestedDiagnosis: "Exacerbação infecciosa de DPOC por Haemophilus/Pneumococo.",
      mostTestedConduct: "Broncodilatador de curta duração + Corticoide sistêmico oral por 5 dias + Amoxicilina/Clavulanato.",
      recurringDistractors: ["Uso de SABA isolado em monoterapia na asma (não recomendado pelo GINA)."],
      cognitiveMatrixPattern: "A banca pune o uso de broncodilatador isolado sem corticoide inalatório na asma crônica.",
    },
    sources: [
      {
        institution: "GINA / GOLD",
        document: "Global Initiative for Asthma & COPD Guidelines",
        year: "2025/2026",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-09",
    title: "Tuberculose",
    slug: "tuberculose",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 9,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 25 questões nas edições INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Diagnóstico pelo Teste Rápido Molecular (TRM-TB), esquema básico RIPE (2RHZE/4RH), manejo de hepatotoxicidade medicamentosa, investigação de contatos e tratamento da ILTB.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `TUBERCULOSE (MANUAL MS 2024/2026)
├── Sintomático Respiratório (Tosse >= 3 semanas na comunidade ou >= 2 sem em populações vulneráveis)
├── Diagnóstico: TRM-TB (detecta bacilo e resistência à Rifampicina) + Baciloscopia + Cultura
├── Tratamento: Esquema RIPE em dose fixa combinada (2 meses RHZE + 4 meses RH)
├── Efeitos Adversos Graves
│   ├── Icterícia / Transaminases > 5x LSN → Suspender RIPE e introduzir esquema alternativo (CEL)
│   └── Neurite Óptica (Etambutol) e Hiperuricemia (Pirazinamida)
└── Investigação de Contatos e Terapia Preventiva (ILTB com 3HP ou Isoniazida)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 25,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.2", "Revalida 2021"],
      patientProfiles: ["Paciente em tratamento com RIPE há 3 semanas retorna com icterícia e náuseas intensas."],
      frequentTriggers: ["Conduta na elevação de transaminases > 5x do limite superior com suspensão imediata."],
      mostTestedDiagnosis: "Hepatite medicamentosa induzida por Pirazinamida/Isoniazida/Rifampicina.",
      mostTestedConduct: "Suspensão temporária do esquema RIPE até normalização enzimática e reintrodução escalonada.",
      recurringDistractors: ["Manter medicação e apenas prescrever sintomáticos com transaminases elevadas."],
      cognitiveMatrixPattern: "A banca do INEP cobra repetidamente o manejo dos efeitos adversos no acompanhamento da UBS.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Manual de Recomendações para o Controle da Tuberculose no Brasil",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-10",
    title: "HIV/AIDS e Infecções Oportunistas",
    slug: "hiv-aids-infeccoes-oportunistas",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 10,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 20 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 24,
    priority: "Crítica",
    summary: "Profilaxia Pré-Exposição (PrEP) e Pós-Exposição (PEP), esquema TARV inicial de primeira linha (TDF + 3TC + DTG) e manejo de Neurotoxoplasmose, Pneumocistose e Criptococose.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    visualTreeMap: `HIV/AIDS (PCDT MS 2024/2026)
├── Prevenção Combinada (PEP até 72h por 28 dias; PrEP oral ou injetável)
├── Diagnóstico: Testes Rápidos 1 e 2 confirmatórios
├── Terapia Antirretroviral (TARV): Tenofovir + Lamivudina + Dolutegravir (TDF/3TC/DTG)
└── Infecções Oportunistas
    ├── Neurotoxoplasmose (CD4 <100, lesões com realce em anel → Sulfadiazina + Pirimetamina)
    ├── Pneumocistose (CD4 <200, hipoxemia e infiltrado intersticial perihilar → Sulfametoxazol-Trimetoprima)
    └── Meningite Criptocócica (CD4 <100, hipertensão intracraniana → Anfotericina B + Punção de alívio)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 20,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Paciente com HIV, contagem de CD4 de 65 céls/mm3, com cefaleia, febre e déficit focal."],
      frequentTriggers: ["Imagem de TC com lesões hipodensas múltiplas em núcleos da base com edema perilesional."],
      mostTestedDiagnosis: "Neurotoxoplasmose em paciente imunossuprimido.",
      mostTestedConduct: "Tratamento empírico imediato com Sulfadiazina + Pirimetamina + Ácido Folínico.",
      recurringDistractors: ["Indicar biópsia cerebral antes do teste terapêutico de 14 dias para toxoplasmose."],
      cognitiveMatrixPattern: "A banca exige correlação precisa da contagem de CD4 com os agentes oportunistas mais prováveis.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "PCDT para Manejo da Infecção pelo HIV em Adultos",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-11",
    title: "Sepse e Choque Séptico",
    slug: "sepse-choque-septico",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 11,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 17 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 20,
    priority: "Crítica",
    summary: "Critérios de SOFA e qSOFA, pacote da 1ª hora do Surviving Sepsis Campaign (coleta de lactato/hemoculturas, antibiótico de amplo espectro, cristaloides e noradrenalina precoce).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SEPSE E CHOQUE SÉPTICO (ILAS / SSC)
├── Triagem: qSOFA (FR >=22, Glasgow <15, PAS <=100) / Alerta Clínico
├── Sepse = Disfunção orgânica potencialmente fatal causada por resposta desregulada a infecção (Delta SOFA >=2)
└── Pacote da 1ª Hora (Bundle de Ouro)
    ├── 1. Dosar Lactato sérico
    ├── 2. Colher 2 pares de Hemoculturas antes do antibiótico
    ├── 3. Iniciar Antibiótico de amplo espectro na 1ª hora
    ├── 4. Cristaloides (30 mL/kg) se hipotensão ou lactato >= 4 mmol/L
    └── 5. Vasopressor (Noradrenalina) se PAM < 65 mmHg refratária a volume`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 17,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2"],
      patientProfiles: ["Idosa com infecção urinária admitida na UPA com sonolência, PA 80x50 mmHg e lactato elevado."],
      frequentTriggers: ["Administração de antibiótico na primeira hora sem atrasos por exames adicionais."],
      mostTestedDiagnosis: "Choque séptico refratário a expansão volêmica inicial.",
      mostTestedConduct: "Início imediato de Noradrenalina para manter PAM >= 65 mmHg.",
      recurringDistractors: ["Atrasar antibiótico enquanto aguarda resultados de culturas ou vaga em UTI."],
      cognitiveMatrixPattern: "A banca valoriza a agilidade no pacote da primeira hora como fator determinante de sobrevida.",
    },
    sources: [
      {
        institution: "Instituto Latino-Americano de Sepse (ILAS)",
        document: "Diretrizes Nacionais de Sepse e Choque Séptico",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-12",
    title: "Lesão Renal Aguda e Doença Renal Crônica",
    slug: "lesao-renal-aguda-cronica",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 12,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 15 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 18,
    priority: "Alta",
    summary: "Critérios KDIGO para LRA (débito urinário e creatinina), diferenciação entre LRA pré-renal e necrose tubular aguda (FeNa, cilindros granulosos), e indicações de diálise de urgência.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `LESÃO RENAL AGUDA (KDIGO)
├── Classificação: Pré-Renal (FeNa <1%, FeUreia <35%) vs Renal Intrínseca (NTA, FeNa >1%) vs Pós-Renal
├── Exame de Urina: Cilindros granulosos e células epiteliais tubulares na NTA
└── Indicações de Diálise de Urgência (Mnemônico AEIOU)
    ├── A: Acidose metabólica grave refratária (pH < 7.1)
    ├── E: Eletrólitos (Hipercalemia grave refratária K > 6.5 com alteração no ECG)
    ├── I: Intoxicações exógenas dialisáveis (Lítio, Metanol, Etilenoglicol, Salicilatos)
    ├── O: Overload / Hipervolemia com edema agudo de pulmão refratário a diurético
    └── U: Uremia franca (Encefalopatia ou Pericardite urêmica)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 15,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.2"],
      patientProfiles: ["Paciente com anúria pós-sepse apresentando onda T em tenda no ECG e K de 7.2 mEq/L."],
      frequentTriggers: ["Identificação de hipercalemia com alteração de ECG exigindo Gluconato de Cálcio e Diálise."],
      mostTestedDiagnosis: "LRA KDIGO 3 com hipercalemia grave ameaçadora à vida.",
      mostTestedConduct: "Gluconato de Cálcio a 10% para estabilização de membrana miocárdica + hemodiálise de urgência.",
      recurringDistractors: ["Aguardar diurético ou solução polarizante antes de administrar gluconato de cálcio com ECG alterado."],
      cognitiveMatrixPattern: "A banca exige rapidez na estabilização elétrica miocárdica frente à hipercalemia grave.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Nefrologia (SBN)",
        document: "Diretrizes de Injúria Renal Aguda",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-13",
    title: "Cirrose e Complicações da Hipertensão Portal",
    slug: "cirrose-hipertensao-portal",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 13,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 14 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 18,
    priority: "Alta",
    summary: "Escore de Child-Pugh e MELD, profilaxia e tratamento da Hemorragia Digestiva Alta Varicosa (Terlipressina + EDA com ligadura elástica), Peritonite Bacteriana Espontânea (PBE) e Encefalopatia Hepática.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `CIRROSE E HIPERTENSÃO PORTAL
├── Estadiamento (Child-Pugh: Bilirrubina, Albumina, INR, Ascite, Encefalopatia / MELD)
├── Ascite e GASA (GASA >= 1.1 g/dL = Hipertensão Portal)
├── Peritonite Bacteriana Espontânea (PBE: PMN no líquido ascítico >= 250/mm3 → Ceftriaxona + Albumina)
└── Hemorragia Varicosa
    ├── Terlipressina ou Octreotide EV precoce
    ├── Profilaxia de PBE com Ceftriaxona por 7 dias
    └── Endoscopia Digestiva Alta com Ligadura Elástica em até 12 horas`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 14,
      observedInExams: ["Revalida 2023.2", "Revalida 2021"],
      patientProfiles: ["Cirrótico com ascite volumosa apresentando febre baixa, dor abdominal difusa e piora da função renal."],
      frequentTriggers: ["Paracentese diagnóstica revelando 380 polimorfonucleares/mm3 no líquido ascítico."],
      mostTestedDiagnosis: "Peritonite Bacteriana Espontânea (PBE).",
      mostTestedConduct: "Ceftriaxona EV + Albumina Humana 1,5 g/kg no D1 e 1,0 g/kg no D3 para prevenção de síndrome hepatorrenal.",
      recurringDistractors: ["Esquecer a infusão de albumina na PBE com aumento de creatinina ou bilirrubina."],
      cognitiveMatrixPattern: "A banca cobra com frequência a associação mandatória de albumina humana para prevenir a síndrome hepatorrenal na PBE.",
    },
    sources: [
      {
        institution: "Sociedade Brasileira de Hepatologia (SBH)",
        document: "Diretrizes de Cirrose e Hipertensão Portal",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-14",
    title: "Distúrbios Hidroeletrolíticos e Ácido-Base",
    slug: "disturbios-hidroeletroliticos-acido-base",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 14,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 13 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 16,
    priority: "Alta",
    summary: "Manejo da Hiponatremia sintomática com Salina a 3% (evitando síndrome de desmielinização osmótica), Hipercalemia com alterações eletrocardiográficas e cálculo do Anion Gap e Fórmula de Winter na Acidose Metabólica.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `DISTÚRBIOS ELETROLÍTICOS E GASOMETRIA
├── Hiponatremia (Na < 135 mEq/L)
│   ├── Sintomática grave (convulsão/coma) → Salina 3% (elevação máxima de 8-10 mEq/L em 24h)
│   └── Avaliação de Osmolaridade e Volemia (SIADH, ICC, Cirrose)
├── Hipercalemia (K > 5.5 mEq/L)
│   └── Onda T apiculada / QRS alargado → Gluconato de Cálcio 10% imediato
└── Acidose Metabólica
    ├── Anion Gap = Na - (Cl + HCO3) [Normal 8-12]
    └── Compensação Respiratória: pCO2 esperada = (1.5 x HCO3) + 8 ± 2 (Fórmula de Winter)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 13,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.2"],
      patientProfiles: ["Paciente com vômitos e diarreia com gasometria mostrando pH 7.22, HCO3 12 e pCO2 26."],
      frequentTriggers: ["Aplicação da Fórmula de Winter para identificar distúrbio ácido-base misto associado."],
      mostTestedDiagnosis: "Acidose metabólica compensada pura vs distúrbio misto.",
      mostTestedConduct: "Correção da causa de base e reidratação com cristaloides isotônicos.",
      recurringDistractors: ["Corrigir sódio sérico muito rapidamente (> 12 mEq/L em 24h) gerando mielinólise pontina."],
      cognitiveMatrixPattern: "A banca exige rigor matemático no cálculo da pCO2 esperada e velocidade segura de correção do sódio.",
    },
    sources: [
      {
        institution: "SBN",
        document: "Guia de Distúrbios Hidroeletrolíticos e Ácido-Base",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "cm-15",
    title: "Anemias",
    slug: "anemias-investigacao-tratamento",
    areaId: "clinica-medica",
    areaName: "Clínica Médica",
    order: 15,
    recurrence: "recorrente",
    recurrenceBadgeLabel: "🟠 Recorrente",
    historicalFrequencyText: "DADO HISTÓRICO: 11 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–30 min",
    moduleCount: 16,
    relatedQuestionsCount: 15,
    priority: "Média",
    summary: "Abordagem algorítmica pelas contagens de reticulócitos e VCM (Microcítica, Normocítica e Macrocítica), diagnóstico diferencial de Anemia Ferropriva vs Traço Talassêmico vs Doença Crônica, e deficiência de B12.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `INVESTIGAÇÃO DAS ANEMIAS
├── Reticulócitos (Hipoproliferativa < 2% vs Hiperproliferativa >= 2% com Hemólise/Sangramento)
├── Microcítica (VCM < 80)
│   ├── Ferropriva (Ferritina baixa < 30 ng/mL, RDW elevado, IST baixo)
│   ├── Talassemia Menor (Ferritina normal, RDW normal, contagem de hemácias alta)
│   └── Doença Crônica (Ferritina normal/elevada, IST normal/baixo)
└── Macrocítica (VCM > 100)
    └── Megaloblástica (Deficiência de B12 com neutrófilos hipersegmentados e sintomas neurológicos vs Ácido Fólico)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 11,
      observedInExams: ["Revalida 2023.1", "Revalida 2020"],
      patientProfiles: ["Mulher jovem com fadiga, unhas quebradiças, VCM 70, ferritina 8 e RDW 18%."],
      frequentTriggers: ["Diferenciação laboratorial entre Anemia Ferropriva e Traço Talassêmico."],
      mostTestedDiagnosis: "Anemia Ferropriva carencial.",
      mostTestedConduct: "Sulfato Ferroso 3 a 5 mg/kg/dia de ferro elementar por via oral e investigação etiológica.",
      recurringDistractors: ["Prescrever ácido fólico isolado em deficiência de B12 piorando os sintomas neurológicos."],
      cognitiveMatrixPattern: "A banca exige leitura criteriosa do hemograma e perfil de ferro para evitar reposições desnecessárias.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "PCDT de Anemia por Deficiência de Ferro",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
];
