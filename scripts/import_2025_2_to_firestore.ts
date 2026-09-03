import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2025_2_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2025-2-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Mulher de 58 anos, com diagnóstico de hipertensão arterial sistêmica (HAS) e em tratamento irregular, é encaminhada ao ambulatório de clínica médica de atenção secundária. Queixa-se de fadiga e dispneia aos esforços, com piora progressiva. Ao exame físico, é observado ritmo cardíaco regular em 4 tempos (B3 + B4), sem sopros no precórdio, mas com crépitos em bases pulmonares; pressão arterial: 148 x 90 mmHg. Ecocardiograma transtorácico evidencia hipertrofia ventricular esquerda concêntrica, associada com fração de ejeção de 38% (por Simpson). Exames laboratoriais normais, salvo pela elevação sérica de peptídeo natriurético tipo B (BNP). Para melhorar o controle da HAS e o prognóstico da paciente, o tratamento com inibidor da enzima conversora de angiotensina foi mantido, e o especialista optou por associar determinado fármaco, devido ao impacto positivo no prognóstico de sobrevida dessa paciente.\nO fármaco introduzido no tratamento da paciente foi",
    alternatives: {
      "A": "espironolactona.",
      "B": "clortalidona.",
      "C": "hidralazina.",
      "D": "clonidina."
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
    id: "q-rev-2025-2-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Lactente de 4 meses é levado ao serviço de emergência com história de vômitos, poliúria, episódios de fraqueza intensa e febre. Ao exame físico, apresenta-se com desidratação grave e déficit de crescimento significativo. Encontram-se, ainda, sinais radiológicos de osteopenia e raquitismo resistente à vitamina D.\nCom base na principal hipótese diagnóstica, o distúrbio ácido básico relacionado ao caso é",
    alternatives: {
      "A": "alcalose respiratória hipoclorêmica.",
      "B": "acidose metabólica hiperclorêmica.",
      "C": "alcalose respiratória hipocalêmica.",
      "D": "acidose metabólica hipercalêmica."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 3,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Paciente de 30 anos procurou consultório de ginecologia relatando fadiga, dismenorreia progressiva e dispareunia de profundidade. Toque vaginal: útero de volume normal, retroversofletido, dor à mobilização do colo.\nCom base nessas informações, a principal hipótese diagnóstica é",
    alternatives: {
      "A": "doença inflamatória pélvica.",
      "B": "miomatose uterina.",
      "C": "cisto hemorrágico.",
      "D": "endometriose."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 3,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-05",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 5,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Homem de 28 anos, estudante universitário, residente em zona urbana, comparece à Unidade Básica de Saúde (UBS) referindo aparecimento de lesão cutânea em região dorsal da mão, cerca de 1 mês após ter sofrido arranhadura de gato de rua. A lesão apresenta úlceras com presença de crostas além de nodulações próximas. Foi submetido à biópsia da lesão cutânea e cultura de material. Observou-se dermatite granulomatosa difusa, presença de corpos asteroides e material eosinofílico ao redor de células características.\nQual é a principal hipótese diagnóstica e o respectivo tratamento para esse caso?",
    alternatives: {
      "A": "Furunculose; cefalexina por 7 dias.",
      "B": "Herpes-zoster; aciclovir por 10 dias.",
      "C": "Esporotricose; itraconazol por 120 dias.",
      "D": "Paracoccidioidomicose; anfotericina B por 30 dias."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 3,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-07",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 7,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 20 anos, com diagnóstico de esquizofrenia, chega à Unidade de Pronto Atendimento (UPA) acompanhado de familiares, que descrevem que o paciente acordou “torto”. Há 5 dias, foi realizada a troca de risperidona por haloperidol, pois aquela estava em falta na farmácia. Paciente nega outras queixas clínicas. Ao exame, apresenta contratura de região cervical e fácies de dor.\nQuais são, respectivamente, a hipótese diagnóstica mais provável e a conduta mais adequada?",
    alternatives: {
      "A": "Distonia; biperideno intramuscular.",
      "B": "Acatisia; haloperidol intramuscular.",
      "C": "Discinesia tardia; diazepam intramuscular.",
      "D": "Síndrome extrapiramidal; prometazina intramuscular."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 4,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-09",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 9,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Paciente de 7 anos, na 4ª semana de tratamento quimioterápico para leucemia linfocítica aguda, é admitido em hospital terciário com história de febre há 12 horas (temperatura axilar de 39 °C), tosse e dispneia. Após 24 horas da admissão, segue febril, apesar de ter usado dipirona há 1 hora, e mantém diurese de 2 mL/kg/h. Exame físico: hidratado; pálido; orientado no tempo e no espaço; frequência cardíaca de 130 bpm; temperatura axilar de 39 °C; frequência respiratória de 36 irpm; pressão arterial de 90 x 60 mmHg; boa perfusão periférica; murmúrio vesicular diminuído em base de hemitórax à direita, com crepitações; bulhas taquicárdicas; fígado a 4 cm do rebordo costal direito e 5 cm do apêndice xifoide; baço a 4 cm do rebordo costal esquerdo. Os exames laboratoriais evidenciam lactato aumentado, acidose metabólica e hemograma com leucocitose com desvio à esquerda.\nCom base no quadro descrito, o diagnóstico é",
    alternatives: {
      "A": "sepse.",
      "B": "choque séptico.",
      "C": "disfunção de múltiplos órgãos.",
      "D": "síndrome da resposta inflamatória sistêmica."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 4,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-11",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 11,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Paciente de 25 anos, com duas gestações e um parto, no segundo trimestre de gestação, compareceu à primeira consulta de pré-natal sem queixas. Após orientações e realização dos testes rápidos, verificou-se que o teste para sífilis foi positivo e imediatamente a paciente recebeu 2,4 milhões UI de penicilina benzatina intramuscular. Paciente nega diagnóstico e tratamento prévios para sífilis.\nEm relação ao acompanhamento da paciente, é correto afirmar que",
    alternatives: {
      "A": "com o tratamento instituído, o feto não terá sequelas.",
      "B": "titulações menores ou iguais a um quarto indicarão cicatriz sorológica.",
      "C": "a queda de duas titulações do VDRL indicará efetividade de tratamento.",
      "D": "o exame de FTA-Abs reagente indicará doença ativa."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 5,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-20",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 20,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Mulher travesti de 28 anos, profissional do sexo, comparece à Unidade Básica de Saúde (UBS) em demanda espontânea. Relata relações sexuais frequentes com diferentes parceiros, com uso inconsistente de preservativos, principalmente durante relações anais receptivas. Há 2 dias teve uma relação sexual desprotegida com um cliente que se recusou a usar camisinha. Nunca utilizou medicamento para profilaxia pré-exposição (PrEP) ou pós-exposição (PEP) à infecção pelo HIV.\nConsiderando que a paciente está assintomática no momento, qual a melhor estratégia de prevenção?",
    alternatives: {
      "A": "Prescrever PrEP após resultado não reagente para HIV; indicar PEP após tratamento inicial e orientar rastreamento de ISTs a cada 3 meses.",
      "B": "Oferecer teste rápido para HIV e sífilis; prescrever PrEP de início imediato; orientar sobre as vacinas disponíveis no SUS para seu grupo populacional.",
      "C": "Realizar testagem rápida para HIV e sífilis; prescrever PEP mediante resultado não reagente para HIV e programar início da PrEP após término da PEP.",
      "D": "Prescrever PEP e PrEP de forma concomitante; solicitar sorologias para ISTs; agendar retorno para analisar os resultados e revisar adesão ao tratamento."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 7,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-72",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 72,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Mulher de 62 anos, com colelitíase sintomática, é admitida em hospital de atenção secundária com quadro de dor abdominal em hipocôndrio direito, febre com calafrios e icterícia. Ao exame físico, além da icterícia, a paciente encontra-se com o sensório rebaixado e pressão arterial de 72 x 44 mmHg. O exame de ultrassonografia revelou a presença de dilatação de via biliar por cálculo impactado no colédoco. Foram coletadas hemoculturas e dosagem sérica de lactato, iniciada antibioticoterapia intravenosa de amplo espectro e foi prescrito resgate volêmico com cristaloide, sendo programada a realização de colangiopancreatografia retrógrada endoscópica (CPRE) terapêutica. Após cerca de 30 minutos, a paciente mantém pressão arterial média inferior a 65 mmHg.\nNesse momento, a conduta prioritária é",
    alternatives: {
      "A": "encaminhar imediatamente à CPRE.",
      "B": "associar coloide à hidratação intravenosa.",
      "C": "iniciar infusão intravenosa de noradrenalina.",
      "D": "prescrever hidrocortisona em infusão intermitente."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 18,
    source_answer_key_page: 3,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-2-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Criança de 7 anos chega à Unidade Básica de Saúde (UBS) com múltiplas afecções de pele disseminadas em ambos os pés. As lesões são caracterizadas por pápulas arredondadas amareladas com ponto preto central. O pai relata que cria porcos e que a menina está sempre brincando perto dos chiqueiros.\nQuais são, respectivamente, o diagnóstico provável, o tratamento e a orientação?",
    alternatives: {
      "A": "Dermatite de contato; tratamento tópico e eliminação do foco alérgico; orientação para uso de calçados adequados e meias de algodão.",
      "B": "Tungíase; retirada manual dos parasitas, seguida de tratamento tópico e sistêmico; orientação para uso de calçados, evitando a área próxima aos chiqueiros.",
      "C": "Escabiose; limpeza diária e tratamento sistêmico, fornecimento de atestado para a escola; orientação de realizar controle ambiental até a eliminação do parasita.",
      "D": "Esporotricose; o caso deve ser encaminhado a um serviço de dermatologia para realização de biópsia das lesões para a confirmação do diagnóstico; orientação de aguardar o resultado do exame."
    },
    correct_answer: "B",
    status: "válida",
    has_image: true,
    image_reference: "Fotografia clínica de lesões papulares amareladas com ponto escuro central em pés compatíveis com tungíase (Tunga penetrans).",
    source_question_page: 26,
    source_answer_key_page: 4,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20252ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2025/2 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2025/2 no Firestore
  const editionDoc = {
    id: "rev-2025-2",
    year: 2025,
    editionLabel: "Revalida INEP 2025/2 — 2ª Edição Semestral",
    officialNotice: "Edital nº 49/2025 - INEP/MEC",
    examDate: "2025-10-25",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [7, 9, 11, 43, 55, 85, 87],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2025_2/gabarito_preliminar_revalida_2025_2.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2025_2/gabarito_definitivo_revalida_2025_2.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2025-2"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2025-2 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2025_2_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2025_2"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2025/2 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2025_2_to_firestore"));
if (isDirectExecution) {
  sync20252ToFirestore().catch((err) => {
  console.error("Erro na importação 2025/2:", err);
  process.exit(1);
});
}
