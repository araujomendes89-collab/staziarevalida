import { OSCEStation } from "../types";

export const SEED_OSCE_STATIONS: OSCEStation[] = [
  {
    id: "osce-go-01",
    title: "Atendimento à Gestante com Pré-Eclâmpsia Grave",
    area: "GINECOLOGIA_OBSTETRICIA",
    difficulty: "Difícil",
    caseType: "Oficial INEP",
    competencies: ["Acolhimento & Anamnese", "Manejo da Crise Hipertensiva", "Sulfatação Imediata"],
    scenarioDescription: "Maternidade do SUS: gestante de 34 semanas chega com cefaleia intensa, escotomas e epigastralgia.",
    candidateInstructions: "Realize o acolhimento e anamnese focada, solicite e interprete os achados do exame físico e obstétrico, estabeleça a principal hipótese diagnóstica, indique a conduta farmacológica imediata e oriente a paciente quanto ao plano de parto. Você dispõe de 10 minutos.",
    timeLimitSeconds: 600,
    patient: {
      name: "Mariana de Souza",
      age: "28 anos",
      gender: "Feminino",
      personality: "Ansiosa e queixosa",
      personalityDescription: "A paciente está visivelmente preocupada com a saúde do bebê, queixa-se de dor na nuca e pergunta repetidamente se vai precisar de cesárea de emergência.",
      chiefComplaint: "Doutor(a), estou com uma dor de cabeça horrível que não passa com dipirona e comecei a enxergar uns pontinhos brilhantes.",
      hda: "Gestante G1P0, IG 34 semanas e 3 dias por DUM e USG de 8 semanas. Relata cefaleia holocraniana de forte intensidade há cerca de 6 horas, escotomas cintilantes e sensação de queimação no estômago ('estômago pesado'). Nega febre, nega sangramento vaginal ou perda de líquido amniótico. Movimentos fetais presentes.",
      history: "Nega hipertensão prévia à gestação, nega diabetes. Nega tabagismo ou etilismo. Sem cirurgias prévias. Faz uso regular de Sulfato Ferroso e Ácido Fólico. Nega alergia medicamentosa conhecida.",
      hiddenFindings: "Se o médico perguntar se tomou a medicação prescrita no pré-natal, relata que a pressão estava 130x80 na última consulta há 15 dias.",
      vitalSigns: {
        bp: "175x115 mmHg (confirmada em MSD e MSE)",
        hr: "94 bpm",
        rr: "18 irpm",
        temp: "36,6 °C",
        sat: "98% em ar ambiente"
      },
      physicalExamFindings: "Consciente, orientada, ansiosa. Fácies de dor. Edema de membros inferiores 3+/4+ simétrico. Altura Uterina: 32 cm. Batimentos Cardiofetais (BCF): 146 bpm, rítmicos, com boa variabilidade. Dinâmica uterina ausente. Toque vaginal: colo posterior, fechado, grosso. Reflexos patelares exacerbados (hiperreflexia 4+/4+ com clônus inesgotável bilateral).",
      labAndImagingResults: [
        {
          name: "Fita urinária rápida (Dipstick de Proteinúria)",
          result: "Proteinúria 3+ (+++/4+)",
          isAppropriate: true
        },
        {
          name: "Hemograma completo com plaquetas",
          result: "Hemoglobina 12,4 g/dL; Hematócrito 38%; Plaquetas: 145.000/mm³",
          isAppropriate: true
        },
        {
          name: "Enzimas hepáticas (TGO e TGP) e Bilirrubinas",
          result: "TGO (AST): 42 U/L (ref até 35); TGP (ALT): 38 U/L; Bilirrubina total: 0,8 mg/dL",
          isAppropriate: true
        },
        {
          name: "Creatinina e Ácido Úrico",
          result: "Creatinina: 0,9 mg/dL; Ácido Úrico: 6,2 mg/dL",
          isAppropriate: true
        },
        {
          name: "Cardiotocografia basal",
          result: "Padrão categoria 1 (feto reativo com acelerações transitórias, sem desacelerações)",
          isAppropriate: true
        },
        {
          name: "Tomografia Computadorizada de Crânio",
          result: "[Inadequado no momento] Não há indicação sem déficit focal ou após estabilização inicial.",
          isAppropriate: false
        }
      ]
    },
    checklist: [
      {
        id: "chk-1",
        category: "ACOLHIMENTO",
        description: "Apresentou-se com nome e função profissional, higienizou as mãos e acolheu a paciente e acompanhante com empatia.",
        points: 10,
        isCritical: false
      },
      {
        id: "chk-2",
        category: "ANAMNESE",
        description: "Investigou ativamente a tríade de iminência de eclâmpsia (cefaleia refratária, alterações visuais/escotomas e epigastralgia/dor no hipocôndrio direito).",
        points: 15,
        isCritical: true
      },
      {
        id: "chk-3",
        category: "ANAMNESE",
        description: "Investigou história obstétrica (IG, DUM, USG de 1º trimestre, movimentação fetal, perdas vaginais) e alergias medicamentosas.",
        points: 15,
        isCritical: false
      },
      {
        id: "chk-4",
        category: "EXAME_FISICO",
        description: "Solicitou dados vitais completos (com ênfase na verificação correta da PA com manguito adequado) e reflexos tendinosos profundos (pesquisa de clônus).",
        points: 15,
        isCritical: true
      },
      {
        id: "chk-5",
        category: "RACIOCINIO",
        description: "Formulou corretamente a hipótese diagnóstica de Pré-Eclâmpsia com Sinais de Gravidade / Iminência de Eclâmpsia.",
        points: 15,
        isCritical: true
      },
      {
        id: "chk-6",
        category: "CONDUTA",
        description: "Prescreveu imediatamente Sulfato de Magnésio (esquema Zuspan ou Pritchard) para prevenção de convulsões com controle de reflexos, diurese e FR.",
        points: 15,
        isCritical: true
      },
      {
        id: "chk-7",
        category: "CONDUTA",
        description: "Prescreveu anti-hipertensivo de ação rápida (Hidralazina IV ou Nifedipino oral) para manejo da crise hipertensiva (alvo PAS 140-150 / PAD 90-100 mmHg).",
        points: 10,
        isCritical: false
      },
      {
        id: "chk-8",
        category: "ORIENTACOES",
        description: "Explicou a necessidade de internação em UTI/leito de alto risco, corticoterapia para maturação pulmonar fetal e tranquilizou a gestante.",
        points: 5,
        isCritical: false
      }
    ],
    goldenConduct: "Sulfatação imediata com Sulfato de Magnésio 4g IV lento + Hidralazina 5mg IV se PA >= 160x110 + Sonda vesical de demora para débito urinário + Corticoterapia (Betametasona 12mg IM 2 doses) para IG < 37 sem.",
    brazilPublicHealthTip: "A mortalidade materna por hipertensão no Brasil ainda é a 1ª causa de óbito materno direto. O protocolo do Ministério da Saúde preconiza sulfatação no primeiro ponto de contato (mesmo em UBS/UPA antes da transferência via SAMU)."
  },
  {
    id: "osce-cm-02",
    title: "Dor Torácica Aguda e Síndrome Coronariana na UPA",
    area: "CLINICA_MEDICA",
    difficulty: "Média",
    caseType: "Oficial INEP",
    competencies: ["Porta-ECG < 10 min", "Terapia Anti-isquêmica", "Estratégia de Reperfusão"],
    scenarioDescription: "Sala Vermelha da UPA: paciente masculino de 60 anos com dor retroesternal em aperto iniciada há 40 minutos.",
    candidateInstructions: "Atenda o paciente na sala de emergência, execute o protocolo de dor torácica em até 10 minutos, interprete o ECG, defina o diagnóstico e institua a terapia anti-isquêmica e a estratégia de reperfusão adequada.",
    timeLimitSeconds: 600,
    patient: {
      name: "Antônio Ferreira",
      age: "60 anos",
      gender: "Masculino",
      personality: "Assustado e com sudorese fria",
      personalityDescription: "O paciente fala com voz fraca, coloca a mão espalmada sobre o esterno (Sinal de Levine) e diz que sente um peso insuportável no peito.",
      chiefComplaint: "Doutor, parece que tem um elefante sentado no meu peito... a dor está subindo para o meu queixo e para o braço esquerdo.",
      hda: "Início súbito de dor retroesternal em aperto/queimação de forte intensidade (10/10 na escala visual de dor) há cerca de 45 minutos enquanto assistia televisão. Acompanhada de náuseas, sudorese profusa e sensação de morte iminente.",
      history: "Hipertenso e diabético em uso irregular de Losartana e Metformina. Tabagista de 1 maço/dia há 40 anos. Nega sangramento recente, nega cirurgias ou AVC prévio.",
      hiddenFindings: "Se perguntado se usou remédio para disfunção erétil (Sildenafil/Tadalafil) nas últimas 48 horas: 'Não doutor, nunca usei isso'.",
      vitalSigns: {
        bp: "140x85 mmHg",
        hr: "76 bpm",
        rr: "20 irpm",
        temp: "36,4 °C",
        sat: "96% em ar ambiente"
      },
      physicalExamFindings: "Paciente pálido, sudoreico, orientado. Sem turgência jugular patológica. Ausculta cardíaca: RCR em 2 tempos, sem sopros audíveis. Ausculta pulmonar: MV presente bilateralmente sem estertores crepitantes. Pulsos periféricos simétricos e amplos.",
      labAndImagingResults: [
        {
          name: "Eletrocardiograma de 12 derivações (ECG)",
          result: "Supradesnivelamento do segmento ST de 3,5 mm em DII, DIII e aVF (Infarto Agudo do Miocárdio com Supra de ST em parede inferior), com imagem em espelho em DI e aVL.",
          isAppropriate: true
        },
        {
          name: "Derivações direitas (V3R, V4R) e posteriores (V7, V8)",
          result: "Sem supradesnivelamento em derivações direitas ou posteriores.",
          isAppropriate: true
        },
        {
          name: "Troponina e CK-MB",
          result: "Troponina ultrassensível: 1.250 ng/L (elevada)",
          isAppropriate: true
        }
      ]
    },
    checklist: [
      {
        id: "chk-cm-1",
        category: "ACOLHIMENTO",
        description: "Apresentou-se, colocou o paciente em monitorização contínua (ECG, oximetria e PA) e garantiu acesso venoso periférico calibroso.",
        points: 10,
        isCritical: true
      },
      {
        id: "chk-cm-2",
        category: "EXAME_FISICO",
        description: "Solicitou e interpretou o ECG de 12 derivações em menos de 10 minutos da admissão (tempo porta-ECG < 10 min).",
        points: 20,
        isCritical: true
      },
      {
        id: "chk-cm-3",
        category: "EXAME_FISICO",
        description: "Solicitou derivações direitas (V3R e V4R) para afastar acometimento do Ventrículo Direito no IAM de parede inferior.",
        points: 15,
        isCritical: false
      },
      {
        id: "chk-cm-4",
        category: "RACIOCINIO",
        description: "Diagnosticou Infarto Agudo do Miocárdio com Supradesnível de ST (IAMCSST) de parede inferior.",
        points: 15,
        isCritical: true
      },
      {
        id: "chk-cm-5",
        category: "CONDUTA",
        description: "Prescreveu AAS 300 mg mastigável + Segundo antiagregante (Ticagrelor 180 mg ou Clopidogrel 300-600 mg) + Anticoagulação plena (Enoxaparina).",
        points: 20,
        isCritical: true
      },
      {
        id: "chk-cm-6",
        category: "CONDUTA",
        description: "Definiu estratégia de reperfusão imediata: acionamento de Vaga Zero / SAMU para angioplastia primária se tempo porta-balão < 120 min ou trombólise química na UPA se tempo previsto > 120 min.",
        points: 20,
        isCritical: true
      }
    ],
    goldenConduct: "MONA adaptado (Oxigênio APENAS se Sat < 90%), AAS 300mg + Clopidogrel 300mg (ou 600mg se angioplastia) + Enoxaparina + Reperfusão imediata em tempo hábil.",
    brazilPublicHealthTip: "Na linha de cuidado do infarto do SUS, tempo é miocárdio. Se a UPA não tiver hemodinâmica e a transferência demorar mais de 2 horas, o trombolítico (Tenecteplase ou Alteplase) deve ser administrado na própria UPA com tempo porta-agulha < 30 min."
  }
];
