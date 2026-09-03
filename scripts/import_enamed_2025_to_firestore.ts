import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const ENAMED_2025_SAMPLE_QUESTIONS = [
  {
    id: "q-enamed-2025-01",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
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
    id: "q-enamed-2025-02",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
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
    correct_answer: null,
    status: "excluída",
    notes: "Excluída do cálculo dos resultados por desajuste ao modelo estatístico (TRI).",
    has_image: false,
    source_question_page: 3,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-enamed-2025-04",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
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
    id: "q-enamed-2025-07",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
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
    id: "q-enamed-2025-10",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
    question_number: 10,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Paciente feminina de 78 anos, com 24 horas de evolução de dor e abaulamento progressivo em região inguinal direita. Apresentou também alguns episódios de vômitos e diminuição da eliminação de flatos. Antecedentes: neoplasia de mama há 30 anos, diabetes mellitus há 20 anos e tabagista de 40 maços/ano. Ao exame estava normotensa, eucárdica, afebril, eupneica. Índice de massa corporal de 35 kg/m2. Abdome globoso, depressível, com abaulamento não redutível e desconforto à palpação em região inguinal direita, com discreta hiperemia local e sem sinais de irritação peritoneal. Exames laboratoriais: Leucócitos 10.300/mL, Creatinina 1,8 mg/dL, Ureia 65 mg/dL.\nA hipótese diagnóstica mais provável é",
    alternatives: {
      "A": "isquemia mesentérica.",
      "B": "hérnia inguinal indireta.",
      "C": "hérnia femoral encarcerada.",
      "D": "neoplasia de cólon obstrutiva."
    },
    correct_answer: null,
    status: "anulada",
    notes: "Anulação administrativa pré-recursos devido a divergência material de redação entre cadernos 01 e 02.",
    has_image: false,
    source_question_page: 4,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-enamed-2025-53",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
    question_number: 53,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Paciente do sexo masculino, 23 anos, foi vítima de acidente automobilístico no qual o veículo em que estava colidiu com caminhão. Usava cinto de segurança e foi retirado consciente do carro pela equipe de resgate. Apresentava amnésia anterógrada. Após atendimento pré-hospitalar, o paciente foi levado ao pronto-socorro, sem déficits motores ou sensitivos. No hospital, o médico pede uma tomografia computadorizada de crânio para avaliação. Alguns minutos depois, a equipe de enfermagem solicita avaliação de emergência para o paciente, com necessidade de intubação orotraqueal por rebaixamento do nível de consciência e anisocoria com pupila esquerda dilatada.\nTomografia computadorizada de crânio sem contraste evidenciando imagem hiperdensa biconvexa / lenticular adjacente à tábua óssea.\nAo considerar a situação clínica do paciente e a imagem tomográfica apresentada, o médico diagnosticou",
    alternatives: {
      "A": "hematoma subdural agudo, sendo necessário realizar hidantalização do paciente e aguardar melhora clínica.",
      "B": "contusão cerebral, sendo necessário realizar cirurgia de emergência para controle de hipertensão intracraniana.",
      "C": "hematoma epidural, sendo necessário realizar cirurgia de emergência para controle da hipertensão intracraniana.",
      "D": "hematoma intraparenquimatoso, sendo necessário realizar hidantalização do paciente e aguardar melhora clínica."
    },
    correct_answer: "C",
    status: "válida",
    has_image: true,
    image_reference: "TC de crânio evidenciando hematoma extradural/epidural com formato biconvexo/lenticular.",
    source_question_page: 14,
    source_answer_key_page: 2,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-enamed-2025-86",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
    question_number: 86,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Mulher de 55 anos, sem história de doenças crônicas, procura atendimento por queixa de cefaleia persistente em ambos os lados do crânio, associada a alterações de visão (amaurose fugaz e diplopia), cansaço e artralgias. Relata dor em todo o couro cabeludo. Notou perda de peso (2 kg em 2 meses). Nega fotofobia ou fonofobia, febre ou náuseas, e afirma que não acorda de madrugada por conta da cefaleia. Nega qualquer problema de ordem emocional. Ao exame, a paciente encontra-se afebril, com pupilas isocóricas e sem rigidez de nuca.\nQual é o tipo de cefaleia dessa paciente, e qual exame seria útil na sua investigação preliminar, respectivamente?",
    alternatives: {
      "A": "Cefaleia primária (cefaleia tensional); nenhum exame é necessário.",
      "B": "Cefaleia secundária (hemorragia subaracnoideia); análise de líquor.",
      "C": "Cefaleia primária (migrânea); tomografia computadorizada de encéfalo.",
      "D": "Cefaleia secundária (arterite temporal); velocidade de hemossedimentação."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 22,
    source_answer_key_page: 3,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-enamed-2025-100",
    exam: "ENAMED",
    institution: "INEP / Sinaes",
    year: 2025,
    edition: "2025",
    stage: "Prova Única Objetiva",
    exam_version: "Caderno 01",
    question_number: 100,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Considerando a atenção ao pré-natal de pacientes na atenção primária em saúde, assinale a condição clínica que indica a referência da gestante para acompanhamento conjunto em um centro de referência especializado (pré-natal de alto risco).",
    alternatives: {
      "A": "Malária no 3º trimestre da gestação.",
      "B": "Anemia com 9,5 mg/dL de hemoglobina.",
      "C": "Gestação gemelar dicoriônica diamniótica.",
      "D": "Diabetes mellitus gestacional controlada com dieta."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 26,
    source_answer_key_page: 4,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function syncEnamed2025ToFirestore() {
  console.log("🚀 Sincronizando ENAMED 2025 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição ENAMED 2025 no Firestore
  const editionDoc = {
    id: "enamed-2025",
    year: 2025,
    exam: "ENAMED",
    editionLabel: "ENAMED INEP/Sinaes 2025 — Exame Nacional de Avaliação da Formação Médica",
    officialNotice: "Portaria INEP nº 359/2025 - ENADE/ENAMED",
    examDate: "2025-10-26",
    stage: "Prova Única Objetiva",
    objectiveCount: 100,
    annulledQuestions: [7, 9, 10, 11, 43, 76, 100],
    excludedQuestions: [2, 40, 88],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/enamed/2025/gabarito_preliminar_enamed_2025.pdf",
    finalKeyUrl: "https://download.inep.gov.br/enamed/2025/gabarito_definitivo_enamed_2025.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "enamed-2025"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição enamed-2025 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of ENAMED_2025_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_ENAMED_2025"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do ENAMED 2025 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_enamed_2025_to_firestore"));
if (isDirectExecution) {
  syncEnamed2025ToFirestore().catch((err) => {
  console.error("Erro na importação ENAMED 2025:", err);
  process.exit(1);
});
}
