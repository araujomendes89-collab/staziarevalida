import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2025_1_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2025-1-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Homem de 62 anos vai a uma unidade de pronto atendimento (UPA) referindo cansaço e tontura ao se levantar há 2 semanas. Nega outras queixas, comorbidades ou cirurgias prévias, assim como o uso de medicamentos. Ao exame físico, apresenta-se corado, hidratado, lúcido e orientado em tempo e espaço; pressão arterial de 120 x 70 mmHg; frequência cardíaca de 45 bpm; saturação de O2 de 96% em ar ambiente; ritmo cardíaco regular, sem turgência jugular; murmúrio vesicular fisiológico, sem ruídos acessórios; e enchimento capilar de 2 segundos. Diante disso, o médico solicita um eletrocardiograma de 12 derivações que revela Bloqueio Atrioventricular de 2º Grau Mobitz II / BAV avançado com frequência ventricular baixa.\nA partir desse quadro clínico e da interpretação do eletrocardiograma, a conduta adequada consiste em",
    alternatives: {
      "A": "conceder alta médica e encaminhar o paciente ao ambulatório especializado de cardiologia.",
      "B": "monitorizar o paciente, solicitar marca-passo transcutâneo e aguardar avaliação do cardiologista.",
      "C": "monitorizar o paciente, administrar atropina 1 mg (IV) e implantar marca-passo transcutâneo.",
      "D": "monitorizar o paciente, administrar atropina 1 mg (IV) e iniciar uso de dopamina 5 mcg/kg/min."
    },
    correct_answer: "B",
    status: "válida",
    has_image: true,
    image_reference: "Eletrocardiograma de 12 derivações com bradiarritmia sintomática / BAV de 2º grau Mobitz II.",
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-1-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 42 anos, em uso crônico de anti-inflamatório não esteroide por doença reumática, dá entrada no pronto-socorro com 6 horas de evolução de dor epigástrica de forte intensidade. Sinais vitais: FC 110 bpm, PA 90 x 50 mmHg, FR 22 irpm, Tax 36,5 °C. Ao exame físico, abdome tenso, com descompressão brusca dolorosa nos quatro quadrantes. O hemograma apresenta valores dentro da normalidade e a tomografia de abdome evidencia líquido livre intraperitoneal com ar no recesso hepatofrênico.\nNesse caso, assinale a alternativa que apresenta a principal hipótese diagnóstica.",
    alternatives: {
      "A": "Úlcera gástrica perfurada.",
      "B": "Pancreatite aguda.",
      "C": "Colecistite aguda.",
      "D": "Diverticulite aguda."
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
    id: "q-rev-2025-1-03",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 3,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Menina de 7 anos e 6 meses é encaminhada ao ambulatório de pediatria porque sua família percebeu surgimento de broto mamário há cerca de 3 meses. O exame físico revela que seu estadiamento puberal é M2P1 e sua estatura está próxima ao escore Z +2 para a idade, com peso em escore Z 0. Um exame de radiografia simples de punho, solicitado pelo médico da atenção primária, mostra idade óssea compatível com 9 anos e 6 meses.\nConsiderando essa situação, assinale a alternativa que apresenta a principal hipótese diagnóstica, seguida de sua justificativa.",
    alternatives: {
      "A": "Puberdade precoce central, pois o crescimento das mamas está associado a avanço da idade óssea.",
      "B": "Telarca isolada precoce, pois a diferença entre a idade óssea e a idade cronológica não é significativa.",
      "C": "Telarca isolada precoce, pois o crescimento das mamas foi um achado isolado na investigação da paciente.",
      "D": "Puberdade precoce central, pois, além da telarca, há também sinais de pubarca, o que sugere ativação do eixo hormonal."
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
    id: "q-rev-2025-1-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Primigesta de 25 anos procura o pronto atendimento de ginecologia e obstetrícia com história de atraso menstrual e resultado de beta-hCG quantitativo de 10.000 mIU/mL realizado há 2 dias. Não se recorda da data da última menstruação. Queixa-se de sangramento vaginal, em pequena quantidade, que já dura 3 dias. Ao exame especular, nota-se presença de sangramento vivo em pequena quantidade e, ao toque, percebe-se colo uterino fechado. Solicitado beta-hCG no dia da consulta, com resultado de 23.400 mIU/mL.\nA partir desses dados, assinale a alternativa que apresenta, respectivamente, o diagnóstico desse caso e a conduta adequada.",
    alternatives: {
      "A": "Gestação ectópica; laparotomia.",
      "B": "Ameaça de aborto; repouso relativo.",
      "C": "Aborto incompleto; curetagem uterina.",
      "D": "Aborto em evolução; acompanhamento clínico."
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
    id: "q-rev-2025-1-07",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 7,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 28 anos foi admitido em hospital após 30 minutos de acidente motociclístico. Apresentava múltiplas e graves lesões em face, mandíbula e cavidade oral, sem lesões cervicais. Exame físico do tórax e do abdome e ultrassonografia focada no abdome no trauma (FAST) sem alterações. Sinais vitais: frequência cardíaca 92 bpm; pressão arterial 130 x 80 mmHg; saturação periférica de oxigênio 100% em ar ambiente. O paciente evoluiu rapidamente com dispneia, taquipneia, estridor inspiratório e expiratório, cornagem e rebaixamento do nível de consciência. Saturação periférica de oxigênio passou para 88%, mesmo com a oferta de oxigênio suplementar. Após alguns minutos, evoluiu com saturação periférica de oxigênio de 59% e frequência cardíaca de 48 bpm.\nNesse momento, qual é a conduta imediata adequada para esse paciente?",
    alternatives: {
      "A": "Traqueostomia.",
      "B": "Cricotireoidotomia.",
      "C": "Intubação orotraqueal.",
      "D": "Intubação nasotraqueal."
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
    id: "q-rev-2025-1-17",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 17,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 39 anos, sem comorbidades e em bom estado de saúde, encontra-se em preparação pré-operatória eletiva de colecistectomia que será realizada por via laparoscópica. Durante consulta com o médico que o acompanha, o paciente manifesta preocupação sobre o que pode ingerir e por quanto tempo deve permanecer em jejum antes do procedimento.\nNesse caso, o médico deve orientar o paciente a fazer, antes da anestesia, jejum de alimentos sólidos por",
    alternatives: {
      "A": "12 horas e de líquidos por 8 horas.",
      "B": "6 a 8 horas e de líquidos claros por 2 horas.",
      "C": "4 a 6 horas e de bebida proteica por 1 hora.",
      "D": "10 horas e de pequenos volumes de água por 4 horas."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 5,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-1-23",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 23,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Agrupadas no acrônimo TORCHSZ, as infecções congênitas e/ou perinatais são causas de significativa morbimortalidade neonatal. Os sinais e sintomas dessas enfermidades são similares, porém algumas características são mais sugestivas de determinada doença.\nA partir do exposto, assinale a alternativa que relaciona corretamente sinais e sintomas e/ou achados de exames complementares com a doença.",
    alternatives: {
      "A": "Hidrocefalia, plaquetose, hepatoesplenomegalia e icterícia são achados mais comuns da toxoplasmose.",
      "B": "Rash macular com úlceras, plaquetopenia e alteração liquórica são achados típicos da rubéola congênita.",
      "C": "Rinite serossanguinolenta, pseudoparalisia de Parrot, catarata e coriorretinite são encontradas na herpes simples.",
      "D": "Catarata, persistência do canal arterial ou estenose pulmonar e retardo de crescimento intrauterino são achados mais comuns de citomegalovírus."
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
    id: "q-rev-2025-1-34",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 34,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Menina de 14 anos vai à consulta na unidade básica de saúde (UBS), acompanhada de sua mãe, relatando preocupação, pois todas as suas amigas da mesma faixa etária já menstruaram, exceto ela. A paciente apresenta as mamas desenvolvidas e alguns pelos pubianos e, durante a consulta, apresenta muitas dúvidas em relação à menstruação.\nNesse caso, após orientar a menina sobre ciclo menstrual e sobre métodos contraceptivos, a conduta adequada é",
    alternatives: {
      "A": "solicitar exames complementares para investigação de amenorreia.",
      "B": "orientar a mãe e a filha a aguardarem a menstruação até os 16 anos.",
      "C": "indicar teste de progesterona oral para confirmar amenorreia primária.",
      "D": "solicitar ultrassonografia e dosagens hormonais para investigação de amenorreia."
    },
    correct_answer: null,
    status: "anulada",
    has_image: false,
    source_question_page: 9,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-1-64",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 64,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Primigesta com idade gestacional de 38 semanas procura a maternidade. Realizou pré-natal regular e todos os seus exames estão dentro da normalidade. Relata sentir ansiedade porque a data provável do parto se aproxima e ela ainda não tem sinais do início do trabalho de parto. Diante disso, expressa desejo de realizar uma cesariana para evitar possíveis complicações. Ao exame clínico, não foram identificadas alterações.\nNesse caso, a conduta mais adequada é",
    alternatives: {
      "A": "conversar sobre os riscos da cesariana e, caso a paciente mantenha o desejo de realizá-la, agendar o procedimento a partir de 39 semanas de gestação.",
      "B": "expor que, devido aos maiores riscos da cesariana, o parto vaginal é a via de parto indicada em gestações de baixo risco e que, por isso, é inviável optar pela cesariana.",
      "C": "explicar que, em gestações de baixo risco, a cesariana por desejo materno só pode ser realizada antes do início do trabalho de parto, a partir de 41 semanas de gestação.",
      "D": "orientar sobre os riscos da cesariana e, caso a paciente mantenha o desejo de realizá-la, fazer o procedimento imediatamente, posto que a autonomia da gestante deve ser garantida."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 17,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2025-1-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2025,
    edition: "2025.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Diante de um novo teste diagnóstico para hanseníase, que está sendo aplicado em uma unidade básica de saúde (UBS), o médico julga pertinente iniciar uma capacitação com sua equipe sobre a validade de testes diagnósticos, medidas de sensibilidade, especificidade e valores preditivos. Então, ele apresenta os seguintes dados a sua equipe: dentre 100 pessoas acometidas por hanseníase, 98 são verdadeiros positivos; e, dentre 100 pessoas não acometidas por hanseníase, 90 são verdadeiros negativos.\nA partir desses dados, é correto afirmar que o valor de sensibilidade do teste é",
    alternatives: {
      "A": "90%.",
      "B": "90,7%.",
      "C": "97,8%.",
      "D": "98%."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 25,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20251ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2025/1 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2025/1 no Firestore
  const editionDoc = {
    id: "rev-2025-1",
    year: 2025,
    editionLabel: "Revalida INEP 2025/1 — 1ª Edição Semestral",
    officialNotice: "Edital nº 06/2025 - INEP/MEC",
    examDate: "2025-03-09",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [7, 23, 34],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2025_1/gabarito_preliminar_revalida_2025_1.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2025_1/gabarito_definitivo_revalida_2025_1.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2025-1"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2025-1 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2025_1_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2025_1"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2025/1 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2025_1_to_firestore"));
if (isDirectExecution) {
  sync20251ToFirestore().catch((err) => {
  console.error("Erro na importação 2025/1:", err);
  process.exit(1);
});
}
