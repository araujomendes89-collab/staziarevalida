import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2024_2_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2024-2-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Um homem de 46 anos vai ao pronto-socorro com queixa de dor em cólica de forte intensidade na região lombar direita, com irradiação para flanco e fossa ilíaca direita há 12 horas, levando-o à incapacidade laboral. Ele refere que já apresentou alguns episódios semelhantes, com várias ocorrências de vômitos, e que fez uso de chás caseiros para tratamento. Ele nega disúria e polaciúria. Ao exame físico, apresenta-se em regular estado geral com fácies de dor, sudorese profusa, mucosas desidratadas (1+/4+), temperatura de 36,5°C, frequência cardíaca de 100 batimentos por minuto, pressão arterial de 130 × 80 mmHg, pulmões limpos e bulhas rítmicas e normofonéticas. Ao exame físico do abdome, apresenta dor à palpação de flanco direito e sinal de Giordano positivo à direita. Nos exames complementares, tem-se hemograma sem alterações. Em rotina de urina, constata-se urina turva, ausência de nitritos, presença de leucócitos, 10.000/mL, e presença de hemácias, de 50.000/mL.\nCom base nessas informações, assinale a alternativa que apresenta, respectivamente, o diagnóstico da doença e o tratamento adequado para esse paciente.",
    alternatives: {
      "A": "Litíase renal; cirurgia de urgência.",
      "B": "Infecção urinária; antibioticoterapia.",
      "C": "Litíase renal; analgesia e hidratação.",
      "D": "Infecção urinária; analgesia e urocultura."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Uma paciente de 45 anos, multípara, é atendida na unidade básica de saúde relatando dores e aparecimento de edema em membros inferiores, no período vespertino, há 3 anos. Ao exame físico, o médico observa dermatite ocre no terço inferior dos membros inferiores associada a uma lesão circular de 2 cm, superficial, com bordas elevadas e com tecido de granulação, localizada na região maleolar interna da perna direita.\nCom base nessas informações, a conduta médica adequada para o caso é indicar",
    alternatives: {
      "A": "a deambulação e o uso de meias de baixa compressão.",
      "B": "o uso de meias de média compressão e a elevação das pernas.",
      "C": "a utilização de bota de Unna e a realização de atividade física intensa.",
      "D": "a realização de desbridamento e o repouso em Trendelemburg."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-03",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 3,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um adolescente não identificado, encontrado desacordado numa festa Rave, é atendido pelo SAMU. Há relatos de que consumiu drogas de abuso e álcool minutos antes de ser encontrado. À avaliação está sem respiração e sem pulso, segundo relatos há pelo menos 10 minutos. Dois socorristas iniciam a realização das compressões e das ventilações. São colocados eletrodos no paciente, identificando-se atividade elétrica sem pulso (AESP). A partir desse diagnóstico, é realizado acesso venoso de urgência.\nAssinale a alternativa que apresenta as próximas condutas imediatas.",
    alternatives: {
      "A": "Pausar massagem cardíaca e obter via aérea segura.",
      "B": "Obter via aérea segura e iniciar administração de drogas.",
      "C": "Prosseguir com compressões e insuflações coordenadas.",
      "D": "Realizar desfibrilação e, depois, retornar com as compressões."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Um médico de uma unidade básica de saúde realiza consulta pré-natal em gestante com idade gestacional de 30 semanas. Ao realizar o terceiro tempo da manobra de Leopold, na região suprapúbica, identifica estrutura fetal óssea arredondada, regular e compatível com calota craniana.\nNesse caso, é correto afirmar que a situação e a apresentação fetais são, respectivamente,",
    alternatives: {
      "A": "transversal e cefálica.",
      "B": "longitudinal e pélvica.",
      "C": "transversal e córmica.",
      "D": "longitudinal e cefálica."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-08",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 8,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Um recém-nascido a termo, com 6 horas de vida, com peso de nascimento de 4.200 gramas, é internado em alojamento conjunto. Sabe-se que sua mãe possui diagnóstico de diabetes gestacional.\nConsiderando-se o risco do recém-nascido desenvolver um quadro de hipoglicemia neonatal, a conduta inicial correta deve ser",
    alternatives: {
      "A": "monitorar a glicemia capilar para avaliar se o paciente apresentará esse quadro.",
      "B": "administrar fórmula infantil de forma complementar ao aleitamento materno para evitar esse quadro.",
      "C": "realizar reposição de glicose venosa, caso a glicemia capilar seja menor ou igual 60 mg/dL.",
      "D": "iniciar reposição de glicose venosa, caso o paciente apresente letargia ou crise convulsiva."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 3,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-35",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 35,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Um paciente de 70 anos, vítima de acidente vascular cerebral, sem sequelas, vai a uma consulta de retorno após receber alta hospitalar. O médico da unidade básica de saúde, ao analisar o caso do paciente, prescreve aspirina 100 mg para uso diário.\nNesse caso, o médico prescreveu esse medicamento a fim de evitar um novo evento cardiovascular, realizando, então, uma prevenção",
    alternatives: {
      "A": "primária.",
      "B": "terciária.",
      "C": "secundária.",
      "D": "quaternária."
    },
    correct_answer: "C",
    status: "válida",
    answer_changed: true,
    official_answer: "C",
    has_image: false,
    source_question_page: 9,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-73",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 73,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Na maternidade, um recém-nascido (RN) de 30 horas de vida, evolui com icterícia zona 3 de Kramer. Nasceu com 36 semanas de idade gestacional (IG), de parto vaginal, tendo algumas equimoses durante o parto. A tipagem sanguínea da mãe é O- e do RN é B+. Os exames laboratoriais, realizados quando a criança estava com 32 horas de vida, revelam: bilirrubina total 13 mg/dL, Coombs direto positivo, antígeno-D positivo, hemoglobina 13,0 g/dL. O pediatra iniciou fototerapia de alta intensidade. Após 4 horas de fototerapia (com 36 horas de vida) obteve-se bilirrubina total de 15 mg/dL.\nConsiderando-se o caso e a tabela de referência de níveis de bilirrubina apresentados na prova, a conduta médica adequada é",
    alternatives: {
      "A": "indicar imunoglobulina standard dose única ao paciente e contraindicar a EST.",
      "B": "intensificar a fototerapia e reavaliar nova dosagem de bilirrubinas em 4 horas.",
      "C": "indicar a EST ao paciente e solicitar sangue tipo B- para realização do procedimento.",
      "D": "contraindicar a EST ao paciente, considerando-se o aumento da bilirrubina total 0,5 mg/dL/hora."
    },
    correct_answer: "C",
    status: "válida",
    has_image: true,
    image_reference: "Tabela de referência para fototerapia e exsanguineotransfusão (EST) da Academia Americana de Pediatria (AAP).",
    source_question_page: 21,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-89",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 89,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma mulher de 65 anos, doadora de sangue frequente, vai à consulta ginecológica de rotina referindo ter apresentado lesão endurecida em vulva, sem secreção, não dolorosa, com nódulo inguinal, que regrediu após 15 dias sem nenhum tratamento. No momento da consulta, o teste rápido para sífilis mostrou-se positivo.\nNesse caso, a conduta mais adequada para essa paciente é",
    alternatives: {
      "A": "solicitar imediatamente o teste de VDRL, para confirmar a doença.",
      "B": "solicitar imediatamente o teste de FTA-ABS, para confirmar a doença.",
      "C": "realizar tratamento com 2,4 milhões de unidades de penicilina benzatina em dose única e fazer controle de cura com VDRL.",
      "D": "realizar tratamento com 2,4 milhões de unidades de penicilina benzatina 1 vez, por semana por 3 semanas, e fazer controle de cura com VDRL."
    },
    correct_answer: "A",
    status: "válida",
    answer_changed: true,
    official_answer: "A",
    has_image: false,
    source_question_page: 26,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-90",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 90,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Um homem de 23 anos, residente em zona urbana de capital de estado da região Sudeste, procura atendimento em unidade básica de saúde. Relata ter apresentado quadro de febre alta (39 °C) de início abrupto, com duração de 3 dias, acompanhada por dor de cabeça, mialgia e poliartralgia leve sem rigidez articular, astenia, dor atrás dos olhos sem conjuntivite, associada a manchas eritematosas na pele. Afirma que a febre cessou há 4 dias. Nega ter feito viagens nos últimos meses.\nA partir dos dados desse paciente, é correto afirmar que a principal hipótese epidemiológica é",
    alternatives: {
      "A": "Zika.",
      "B": "dengue.",
      "C": "chikungunya.",
      "D": "febre amarela."
    },
    correct_answer: "B",
    status: "válida",
    answer_changed: true,
    official_answer: "B",
    has_image: false,
    source_question_page: 26,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-93",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 93,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Ao atender um recém-nascido de sexo masculino, admitido em alojamento conjunto, um pediatra observa, ao exame físico, diversas características fenotípicas de síndrome de Down. Ele discute essas características com a família da criança e opta por solicitar um cariótipo desse paciente.\nA respeito da indicação da realização de cariótipo nesse caso, assinale a alternativa correta.",
    alternatives: {
      "A": "O cariótipo pode ser dispensado caso haja presença de características fenotípicas muito sugestivas da síndrome, especialmente se a mãe tiver 35 anos ou mais, visto ser um exame dispendioso e que não acrescentará novas informações.",
      "B": "O cariótipo está indicado para confirmação diagnóstica, para avaliação de possível mosaicismo e para diagnóstico de translocações do cromossomo 21, que podem representar translocação balanceada em um dos pais.",
      "C": "O cariótipo pode ser solicitado para confirmação diagnóstica, no entanto seu resultado não terá impacto nas orientações sobre prognóstico do paciente nem no aconselhamento genético para o casal.",
      "D": "O cariótipo deve ser solicitado quando os pais são jovens e há suspeita de translocação balanceada em um dos pais, devendo-se esperar, nesse caso, pelo resultado do exame para programar a alta da criança."
    },
    correct_answer: "B",
    status: "válida",
    answer_changed: true,
    official_answer: "B",
    has_image: false,
    source_question_page: 27,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-2-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "O tabaco, em seus múltiplos usos, configura-se como a principal causa evitável de morte no Brasil e no mundo. Estima-se que o tabagismo seja a causa para cerca de 40% das mortes por câncer; de 70 a 95% das mortes devido a câncer de pulmão e 75% dos óbitos decorrentes de doença pulmonar obstrutiva crônica. Para apoiar o seu enfrentamento pode-se adotar, isoladamente ou de forma combinada, diversos tipos de abordagens.\nSobre o tratamento a pessoa tabagista, é correto afirmar que",
    alternatives: {
      "A": "esquemas de aconselhamentos de maior intensidade e de intervenções breves apresentam probabilidade semelhante de ajudar o paciente a cessar o hábito de fumar.",
      "B": "o aconselhamento e a medicação são efetivos quando usados conjuntamente, mas ineficazes na promoção da abstinência ao tabagismo quando utilizados de forma isolada.",
      "C": "pacientes com elevada, ou muito elevada, dependência física devem iniciar tratamento medicamentoso com a associação de terapia de reposição de nicotina a bupropiona.",
      "D": "intervenções em grupo promovem a abstinência ao tabagismo pela interação e apoio mútuo entre os participantes e pela participação ativa do fumante e do profissional de saúde."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 28,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20242ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2024/2 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2024/2 no Firestore
  const editionDoc = {
    id: "rev-2024-2",
    year: 2024,
    editionLabel: "Revalida INEP 2024/2 — 2ª Edição Semestral",
    officialNotice: "Edital nº 58/2024 - INEP/MEC",
    examDate: "2024-08-25",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [3, 22, 30, 37, 46, 60, 67],
    alteredQuestions: [
      { questionNumber: 35, officialAnswer: "C" },
      { questionNumber: 89, officialAnswer: "A" },
      { questionNumber: 90, officialAnswer: "B" },
      { questionNumber: 93, officialAnswer: "B" }
    ],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2024_2/gabarito_preliminar_revalida_2024_2.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2024_2/gabarito_definitivo_revalida_2024_2.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2024-2"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2024-2 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2024_2_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2024_2"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2024/2 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2024_2_to_firestore"));
if (isDirectExecution) {
  sync20242ToFirestore().catch((err) => {
  console.error("Erro na importação 2024/2:", err);
  process.exit(1);
});
}
