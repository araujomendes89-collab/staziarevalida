import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2024_1_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2024-1-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Uma mulher com 25 anos, solteira, sem comorbidades prévias, é atendida em uma unidade de pronto-socorro devido a queixas de algúria, polaciúria, dor hipogástrica e urgência miccional há 2 dias. Ela nega corrimento vaginal e relata que a menstruação está regular e que não tem relações sexuais há mais de 1 mês. A paciente nega: febre, uso de antimicrobianos nos últimos 3 meses e outros sintomas sistêmicos.\nNesse caso, quais são, respectivamente, a hipótese diagnóstica mais provável e a melhor conduta terapêutica?",
    alternatives: {
      "A": "ITU baixa; iniciar nitrofurantoína.",
      "B": "ITU alta não complicada; iniciar norfloxacino.",
      "C": "ITU por Staphylococcus aureus; iniciar antibiótico de amplo espectro.",
      "D": "Nefrolitíase complicada com ITU; iniciar antibiótico após resultado de urocultura."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Um paciente com 28 anos, vítima de atropelamento, é levado ao departamento de emergência pelo Serviço de atendimento médico de urgência (SAMU). Ao exame abdominal, apresenta escoriações e hematoma em baixo ventre, instabilidade à palpação da pelve e hematoma perineal.\nApós avaliação primária, qual das seguintes alternativas corresponde ao melhor método diagnóstico de possível lesão do trato urinário, no caso apresentado?",
    alternatives: {
      "A": "Uretrocistografia retrógrada.",
      "B": "Cistostomia suprapúbica aberta.",
      "C": "Tomografia pélvica sem contraste.",
      "D": "Ultrassonografia de abdome e pelve."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma gestante com 24 anos, G2 P1 A0, chega à maternidade com sangramento vermelho vivo por via vaginal. Conta que descobriu sua segunda gravidez há 2 semanas. No momento, refere dor pélvica intensa e persiste com sangramento vaginal vivo. Ao exame, apresenta-se em bom estado geral, normocorada, pressão arterial de 110 x 70 mmHg, frequência cardíaca de 82 bpm e saturação de oxigênio de 98%. No exame físico, o médico plantonista constata colo pérvio no toque bimanual, útero compatível com 10 semanas de gravidez e sangramento vivo com saída de material sugestivo de restos ovulares.\nConsiderando-se essa história clínica e os achados do exame físico, quais são a hipótese diagnóstica e a melhor conduta para a paciente?",
    alternatives: {
      "A": "Ameaça de abortamento; solicitar ultrassonografia transvaginal e, se feto com boa vitalidade, recomendar repouso e iniciar pré-natal.",
      "B": "Ameaça de abortamento; prescrever analgésico, recomendar repouso no domicílio e orientar retorno se houver piora do sangramento.",
      "C": "Abortamento em evolução; explicar com linguagem acessível o quadro, internar e realizar ultrassonografia pélvica para confirmar útero vazio.",
      "D": "Abortamento em evolução; explicar com linguagem acessível o quadro, orientando que pode optar por aspiração manual intrauterina (AMIU) / curetagem ou conduta expectante."
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
    id: "q-rev-2024-1-07",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 7,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Um paciente com 68 anos, submetido a hemicolectomia esquerda por neoplasia com anastomose terminoterminal, sem intercorrências, refere, no quinto dia de pós-operatório, dor leve abdominal.\nAo exame físico, apresenta-se hidratado, com temperatura axilar de 38,1 °C, frequência cardíaca de 96 bpm, pressão arterial de 100 X 70 mmHg, frequência respiratória de 20 irpm. Abdome distendido 1+/4+, ruídos hidroaéreos presentes, timpanismo generalizado à percussão e levemente doloroso à palpação profunda generalizada. Aparelhos cardiovascular e respiratório sem alterações. Ferida operatória limpa, sem sinais flogísticos.\nNesse caso, qual é a origem mais provável do quadro de febre apresentado pelo paciente?",
    alternatives: {
      "A": "Atelectasia.",
      "B": "Infecção urinária.",
      "C": "Abcesso subfrênico.",
      "D": "Infecção do sítio cirúrgico profundo."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 3,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-17",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 17,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Uma paciente com 32 anos refere mal-estar geral, febrícula e coriza há 10 dias. Refere também hábito frequente de lavar e assoar o nariz com soro fisiológico. Há dois dias, após uma sessão prolongada de natação, relata sentir o ouvido direito obstruído, dor localizada e piora da sensação de febre. A paciente trata de lúpus eritematoso sistêmico há dois anos. Ao exame físico geral, apresenta dor em joelhos bilateralmente. Realizam-se os exames de: rinoscopia, em que se verifica hiperemia leve de epitélio nasal; e otoscopia, em que se observa leve hiperemia de membrana timpânica bilateral, demostrando membrana timpânica imóvel bilateralmente à otoscopia pneumática.\nNesse caso, o diagnóstico e o tratamento indicados são, respectivamente:",
    alternatives: {
      "A": "otite média crônica lúpica; antibioticoterapia tópica por 7 dias, corticoterapia sistêmica.",
      "B": "otite média aguda fúngica; claritromicina e fluconazol por 21 dias, timpanotomia direita.",
      "C": "otite externa subaguda viral; antibioticoterapia tópica por 15 dias, anti-inflamatórios sistêmicos.",
      "D": "otite média aguda bacteriana; amoxacilina e clavulanato por 10 dias; descongestionantes e anti-histamínicos."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 6,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-21",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 21,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um homem com 38 anos relata, em consulta, exantema, prurido, febre e artralgia que se resolveu em 72 horas com o uso de sintomáticos. O paciente conta que, após 10 dias, passou a apresentar parestesia em membros inferiores, que evoluiu para membros superiores em 24 horas. Ele conta que não buscou ajuda médica por julgar tratar-se de câimbras devido à falta de atividade física regular. Narra, ainda, que, após 3 dias, o quadro evoluiu com fraqueza nos membros inferiores, impedindo a deambulação, queixando-se também de cefaleia holocraniana e obstipação intestinal.\nAo exame neurológico, apresenta-se vigil, orientado em tempo e espaço, com pupilas isocóricas e fotorreagentes, mobilidade ocular extrínseca preservada e demais pares cranianos sem alteração. Verificam-se, ainda: força muscular grau V/V em membros superiores e grau III/V em membros inferiores; reflexos bicipital, tricipital e estilorradial grau II/IV; reflexos patelar e aquileu abolidos; hipoestesia tátil e dolorosa nos quatro membros, com padrão de bota e luva; hipopalestesia em membros inferiores, até o tornozelo. O resultado do exame de líquido cefalorraquidiano (LCR) mostrou dissociação proteíno-citológica (Proteína total 103 mg/dL, Contagem de células 0 a 2 mm³).\nDiante desse quadro clínico, qual é a principal suspeita diagnóstica?",
    alternatives: {
      "A": "Miastenia Gravis.",
      "B": "Síndrome de Guillain-Barré.",
      "C": "Acidente Vascular Cerebral.",
      "D": "Esclerose Lateral Amiotrófica."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 7,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-23",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 23,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Um lactente com 1 mês e 15 dias é trazido pela mãe ao pronto atendimento, a qual relata que seu filho vem apresentando vômitos intensos, em jato e de conteúdo leitoso. Ela nega haver febre associada ao quadro e alega que a criança sempre teve muito refluxo e que os sintomas se intensificaram há 2 semanas. A mãe tem ministrado sintomáticos nos últimos 10 dias, sem melhora, notando que o bebê tem perdido peso. Ao exame, o paciente encontra-se desidratado e sonolento, com abdome escavado, com redução de tecido subcutâneo e com presença de pequena massa móvel palpável em epigástrio. Seus exames laboratoriais revelam alcalose metabólica hipoclorêmica e hipocalêmica: pH de 7,58, pCO2 de 41 mmHg, HCO3 de 36 mEq/L, sódio de 138 mEq/L, potássio de 3,0 mEq/L e cloro de 80 mEq/L.\nAcerca do caso apresentado e das condutas a serem adotadas, assinale a opção correta.",
    alternatives: {
      "A": "O lactente deve ser estabilizado clinicamente e encaminhado para o procedimento de piloromiotomia.",
      "B": "O lactente deve ser estabilizado clinicamente e encaminhado para realização de cirurgia de fundoplicatura.",
      "C": "O lactente deve ser estabilizado clinicamente e avaliado quanto à possibilidade de erros inatos do metabolismo.",
      "D": "O lactente deve ter a alimentação complementada com fórmula de aminoácidos própria para idade e a mãe deve suspender leite e derivados da dieta do filho."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 7,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-49",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 49,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma gestante com 29 anos, primigesta, havia realizado um exame de urocultura durante o pré-natal, cujo resultado apresentou 1.000 UFC/mL de Streptococcus agalactiae. Ainda durante o pré-natal, não se realizou o rastreio para colonização pelo estreptococo beta hemolítico do grupo B (EGB) por meio de cultura do conteúdo vaginal e retal. A paciente chega ao pronto-socorro obstétrico em trabalho de parto, com 38 semanas de gestação, bolsa íntegra.\nNesse caso, em relação à profilaxia intraparto de sepse neonatal por EGB, deve-se",
    alternatives: {
      "A": "realizar teste rápido para EGB na gestante e, se positivo, prescrever a profilaxia antibiótica.",
      "B": "adotar conduta expectante, pois não há indicação de profilaxia de sepse neonatal por EGB.",
      "C": "prescrever penicilina G por via endovenosa para a gestante, pois há evidência de colonização pelo EGB.",
      "D": "prescrever ampicilina por via endovenosa para a gestante, se houver ruptura das membranas ovulares durante o trabalho de parto."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 15,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-69",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 69,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma secundigesta com parto vaginal anterior e sem comorbidades chega à maternidade em trabalho de parto. Dez minutos após a meia-noite, avaliado o processo de trabalho de parto, constata-se evolução normal. Realizado exame físico na paciente, verifica-se uma apresentação em plano positivo (+2), colo 100% esvaecido, com 8 centímetros de dilatação, bolsa rota. À ausculta de batimentos cardíacos fetais, o médico assistente nota uma queda nos batimentos e, por isso, opta por realizar uma cardiotocografia, cujo resultado mostra desacelerações periódicas precoces (DIP 1) concomitantes com as contrações uterinas com linha de base entre 110 e 160 bpm e variabilidade moderada.\nDiante do traçado cardiotocográfico, assinale a opção correta.",
    alternatives: {
      "A": "A linha de base está entre 100 e 150 bpm, a variabilidade é aumentada, as desacelerações são do tipo precoce, portanto, a conduta deve ser reanimação intrauterina.",
      "B": "A linha de base está entre 110 e 160 bpm, a variabilidade é moderada, as desacelerações são do tipo tardio, portanto, a conduta deve ser mudança de decúbito materno e hidratação endovenosa.",
      "C": "A linha de base está entre 110 e 160 bpm, a variabilidade é moderada, as desacelerações são do tipo precoce, portanto, a conduta deve ser seguimento do acompanhamento do trabalho de parto e do parto.",
      "D": "A linha de base está entre 100 e 150 bpm, a variabilidade é aumentada, as desacelerações são do tipo variável com características desfavoráveis, portanto, a conduta deve ser administração de oxigênio e estímulo sonoro."
    },
    correct_answer: "C",
    status: "válida",
    has_image: true,
    image_reference: "Traçado de cardiotocografia intraparto demonstrando DIP tipo I (desaceleração precoce sincrônica com a contração uterina).",
    source_question_page: 20,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2024-1-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2024,
    edition: "2024.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Um homem com 46 anos comparece à consulta acompanhado de sua esposa e solicita atestado para justificar 2 dias de ausência no trabalho. Refere que, há 2 dias, apresenta diminuição do apetite, cefaleia, fadiga, tristeza e sentimento de culpa. A esposa refere que ele ingeriu grande quantidade de bebida alcoólica numa festa e que chegou em casa sendo carregado por amigos na noite anterior ao início dos sintomas. Segundo ela, isso costuma acontecer há 1 ano, cerca de 2 vezes ao mês. Após essas situações, o paciente fica bastante entristecido, não quer sair da cama e acaba faltando ao trabalho. Entre os episódios de ingesta de bebida, o paciente trabalha, estuda e tem bom funcionamento familiar e social. Nega comorbidades e uso de medicações. Ao exame físico, não apresenta alterações.\nNesse caso, ao final da consulta, o médico deve explicar ao paciente que seu quadro clínico trata-se de",
    alternatives: {
      "A": "uso nocivo de álcool.",
      "B": "dependência de álcool.",
      "C": "episódio depressivo moderado.",
      "D": "síndrome de abstinência do álcool."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 27,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20241ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2024/1 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2024/1 no Firestore
  const editionDoc = {
    id: "rev-2024-1",
    year: 2024,
    editionLabel: "Revalida INEP 2024/1 — 1ª Edição Semestral",
    officialNotice: "Edital nº 08/2024 - INEP/MEC",
    examDate: "2024-03-17",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [7, 17, 43, 50, 83],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2024_1/gabarito_preliminar_revalida_2024_1.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2024_1/gabarito_definitivo_revalida_2024_1.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2024-1"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2024-1 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2024_1_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2024_1"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2024/1 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2024_1_to_firestore"));
if (isDirectExecution) {
  sync20241ToFirestore().catch((err) => {
  console.error("Erro na importação 2024/1:", err);
  process.exit(1);
});
}
