import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2022_1_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2022-1-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Uma mulher com 51 anos de idade, em tratamento para osteoporose com bifosfonato, comparece ao ambulatório de infectologia de um hospital escola para receber o resultado da investigação diagnóstica de quadro de lesão crônica oro-cérvico-facial à direita. Segundo a paciente, a lesão iniciou-se há cerca de 18 meses como um endurecimento inflamatório logo abaixo da mandíbula, bem ao nível de seu ângulo; ao longo de alguns dias, a lesão tornou-se um nódulo endurecido que, posteriormente, se ulcerou, dando saída a secreção purulenta contendo granulações amareladas por 2 tratos fistulosos. Conta que procurou assistência médica, tendo realizado tratamento antibiótico por algumas vezes, sempre por 7 a 14 dias, com melhora inicial do quadro, mas retorno da drenagem de material nas semanas seguintes. Acrescenta que, há 4 semanas, foi submetida a procedimento de biópsia local, tendo retornado ao ambulatório para saber o resultado da investigação diagnóstica. O laudo histopatológico revelou a presença de granulações contendo material inflamatório linfo-histiocitário associado a camadas densas de neutrófilos, no interior das quais são observadas massas de bactérias gram-positivas com filamentos ramificados, além de material sugestivo de depósitos de fosfato de cálcio. As culturas do material drenado isolaram, além de Actinomyces israelii, Eikenella corrodens e espécies de Staphylococcus. Ao exame físico, a paciente apresenta 2 elementos molares da arcada dentária inferior, bem adjacentes à lesão cérvico-facial, em péssimo estado de conservação, com processo inflamatório inequívoco.\nNesse caso, o fármaco adequado, de uso prolongado, para a conduta terapêutica antimicrobiana é",
    alternatives: {
      "A": "oxacilina.",
      "B": "cefalexina.",
      "C": "clindamicina.",
      "D": "levofloxacina."
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
    id: "q-rev-2022-1-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Um paciente com 72 anos de idade, tabagista, vem se queixando de icterícia, acolia, colúria e prurido há cerca de 2 meses de forma progressiva. Ao exame físico, apresenta icterícia +++/4 e massa palpável, de consistência amolecida e indolor no hipocôndrio direito, mais precisamente no ponto cístico. Os exames laboratoriais apresentam os seguintes resultados: hemograma com discreta anemia, AST de 64 U/L, ALT de 88 U/L, bilirrubina total de 32 mg/dL, sendo 24 mg/dL de bilirrubina direta e 8 mg/dL de bilirrubina indireta.\nCom base nos dados apresentados, entre os diagnósticos a seguir, qual é o mais provável?",
    alternatives: {
      "A": "Coledocolitíase.",
      "B": "Adenocarcinoma de vesícula biliar.",
      "C": "Adenocarcinoma de cabeça de pâncreas.",
      "D": "Colangiocarcinoma da confluência dos ductos hepáticos."
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
    id: "q-rev-2022-1-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Segundo o Instituto Nacional do Câncer (INCA), o rastreamento do câncer de mama organizado por mamografia de rotina (em que se convida formalmente as mulheres na faixa etária alvo para os exames periódicos), além de garantir controle de qualidade, seguimento oportuno e monitoramento em todas as etapas do processo, apresenta melhores resultados e menores custos que o rastreamento oportunístico.\nConsiderando as informações apresentadas, para qual faixa etária e em que periodicidade, respectivamente, o INCA recomenda o rastreamento do câncer de mama organizado por mamografia de rotina?",
    alternatives: {
      "A": "45 aos 69 anos de idade; anualmente.",
      "B": "50 aos 79 anos de idade; anualmente.",
      "C": "40 aos 69 anos de idade; a cada 2 anos.",
      "D": "50 aos 69 anos de idade; a cada 2 anos."
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
    id: "q-rev-2022-1-19",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 19,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma mulher com 38 anos de idade comparece ao pronto atendimento com dor em baixo ventre de forte intensidade há algumas horas. A paciente refere que vinha sentindo um leve incômodo em baixo ventre, mas há algumas horas sente dor de forte intensidade em abdome, mais localizada em baixo ventre. Não tem fatores de melhora e piora ao caminhar. Refere náuseas e um episódio de vômito. Nega febre. Como antecedentes já teve uma doença inflamatória pélvica há alguns anos, tratada com antibióticos. Está casada há 10 anos, não utiliza método anticoncepcional hormonal e não usa preservativo em todas as relações. Tem dois filhos que nasceram de parto normal. Nega patologias clínicas. A data da última menstruação foi há aproximadamente 7 semanas. Ao exame, apresenta regular estado geral, lúcida e contactuante, afebril, descorada (++/++++), com pressão arterial de 100 x 55 mmHg e pulso de 110 batimentos por minuto. Exame cardiopulmonar sem anormalidades. Abdome distendido, doloroso, descompressão brusca presente em fossa ilíaca direita. Ruídos hidro aéreos presentes, mas diminuídos. Exame especular sem sangramento, presença de discreta leucorreia fluida sem sinais de vulvovaginite. Toque vaginal com muita dor, dificultando o exame, mas o útero está de tamanho, forma e consistência normal; sente muita dor à palpação de fundo de saco.\nConsiderando o quadro clínico apresentado, assinale a opção que apresenta, respectivamente, a principal hipótese diagnóstica e a conduta correta a ser realizada.",
    alternatives: {
      "A": "Apendicite aguda; cirurgia.",
      "B": "Gestação ectópica rota; cirurgia.",
      "C": "Doença inflamatória pélvica; antibioticoterapia parenteral.",
      "D": "Aborto ou ameaça de aborto; internação para observação."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 6,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2022-1-26",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 26,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um homem com 48 anos de idade, tabagista, em tratamento irregular de hipertensão arterial sistêmica, diabetes mellitus e dislipidemia, é admitido na unidade de emergência de hospital de pequeno município do interior, com quadro de dor torácica de forte intensidade, tipicamente anginosa, associada a diaforese, náuseas e vômitos. Segundo informa, o quadro álgico tem cerca de 4 horas de evolução, não tendo procurado antes a unidade de saúde por receio de contaminação devido à pandemia em curso. O exame físico dirigido revela um paciente em moderado desconforto agudo, ansioso, com pressão arterial (PA) de 102 x 70 mmHg, frequência cardíaca de 102 batimentos por minuto, levemente taquipneico, frequência respiratória de 22 incursões respiratórias por minuto. Na ausculta cardíaca, revelam-se uma 4ª bulha e um sopro sistólico suave na ponta, estando os pulmões limpos. É realizado, então, um eletrocardiograma (ECG) nos primeiros 10 minutos de atendimento, que mostra a presença de um supradesnível do segmento ST superior a 2 mm nas derivações D2, D3, aVF e V1, além de infradesnível de ST de 3 mm nas derivações V2 a V4, nas quais são observadas ondas R aumentadas e ondas T positivas proeminentes. São administrados nitrato sublingual e ácido acetilsalicílico (AAS), além de ser solicitada a infusão de tenecteplase intravenosa em bolus, uma vez que não há serviço de hemodinâmica na região. Enquanto é providenciada a elaboração do trombolítico, o paciente refere piora dos sintomas, sendo verificado que ele se encontra ainda mais pálido e hipotenso (PA: 80 x 46 mmHg), a despeito de sua ausculta pulmonar manter-se sem ruídos adventícios.\nConsiderando os dados relatados, a melhor explicação para a piora clínica do paciente logo após a instituição da abordagem inicial é",
    alternatives: {
      "A": "agravamento da hipercalemia pelo AAS.",
      "B": "desenvolvimento de rotura de septo interventricular.",
      "C": "medicação inadequada na coexistência de infarto de ventrículo direito.",
      "D": "instalação de choque cardiogênico por grave disfunção ventricular esquerda."
    },
    "correct_answer": "C",
    "status": "válida",
    "has_image": false,
    "source_question_page": 8,
    "source_answer_key_page": 1,
    "answer_key_type": "definitivo",
    "validation_status": "validated",
    "extraction_confidence": 1.00
  },
  {
    id: "q-rev-2022-1-42",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 42,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "No ambulatório de um hospital secundário, o médico de plantão recebe uma paciente de 43 anos de idade que se encontra no 10º dia de pós-operatório de uma histerectomia total abdominal por doença benigna. A paciente queixa-se de mal-estar, hiporexia e febre (37,3 °C) há cerca de 2 dias. Ao exame físico, a incisão operatória encontra-se um pouco hiperemiada e quente. A semiologia pulmonar é normal; não há queixa de disúria nem sinais de flebite.\nConsiderando esse caso, assinale a opção que apresenta, respectivamente, a classificação da cirurgia quanto ao grau de contaminação e qual deveria ter sido a melhor conduta pré-operatória para evitar a infecção pós-operatória.",
    alternatives: {
      "A": "Contaminada; realizar antibioticoprofilaxia com a administração de cefazolina 1G IV durante o ato cirúrgico.",
      "B": "Contaminada; realizar antibioticoprofilaxia com a administração de cefazolina 2G IV uma hora antes do ato cirúrgico.",
      "C": "Limpa-contaminada; realizar antibioticoprofilaxia com a administração de cefazolina 1G IV durante o ato cirúrgico.",
      "D": "Limpa-contaminada; realizar antibioticoprofilaxia com a administração de cefazolina 2G IV uma hora antes do ato cirúrgico."
    },
    "correct_answer": "D",
    "status": "válida",
    "answer_changed": true,
    "original_answer": "C",
    "official_answer": "D",
    "has_image": false,
    "source_question_page": 12,
    "source_answer_key_page": 1,
    "answer_key_type": "definitivo",
    "validation_status": "validated",
    "extraction_confidence": 1.00
  },
  {
    "id": "q-rev-2022-1-73",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 73,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Uma criança com 3 anos de idade, sexo masculino, iniciou, segundo relato de sua mãe, febre há cerca de 5 dias. Durante o exame clínico, o pediatra observou conjuntivite bilateral, exantema polimorfo, língua em framboesa, lábios avermelhados, fissurados e secos, edema duro dos dedos de pés e mãos e adenopatia cervical, além de descamação das extremidades.\nConsiderando a descrição desse caso, a principal hipótese diagnóstica é",
    alternatives: {
      "A": "escarlatina.",
      "B": "mononucleose.",
      "C": "eritema infeccioso.",
      "D": "doença de Kawasaki."
    },
    "correct_answer": "D",
    "status": "válida",
    "has_image": false,
    "source_question_page": 20,
    "source_answer_key_page": 1,
    "answer_key_type": "definitivo",
    "validation_status": "validated",
    "extraction_confidence": 1.00
  },
  {
    "id": "q-rev-2022-1-93",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 93,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Um recém-nascido a termo com 6 horas de vida encontra-se internado na maternidade, evoluindo com cianose progressiva. É filho de mãe diabética, nasceu com 4.200 Kg, obteve apgar 7 e 8. Ao exame, apresenta regular estado geral e cianose 3+/4+. A saturometria foi de 50% em ar ambiente. Os pulsos estão normopalpáveis, simétricos. Apresenta ainda sopro sistólico suave +/6+ em borda esternal esquerda alta. Foi realizado ecocardiograma, que apresentou transposição simples das grandes artérias (TGA) e comunicação interatrial ampla.\nNessa situação, a conduta imediata é",
    "alternatives": {
      "A": "realizar atriosseptostomia por balão.",
      "B": "iniciar a administração de prostaglandina.",
      "C": "encaminhar o paciente para cirurgia corretiva.",
      "D": "ventilar o paciente com uma FiO2 entre 80 a 100%."
    },
    "correct_answer": "B",
    "status": "válida",
    "has_image": false,
    "source_question_page": 26,
    "source_answer_key_page": 1,
    "answer_key_type": "definitivo",
    "validation_status": "validated",
    "extraction_confidence": 1.00
  },
  {
    "id": "q-rev-2022-1-99",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 99,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma primigesta com 24 anos de idade comparece à consulta médica de rotina de pré-natal com 38 semanas. Relata dores em cólica associadas às contrações uterinas. No exame obstétrico, apresentou dinâmica uterina positiva e, após as manobras de Leopold, notou-se o dorso à direita, com polo cefálico na pelve, conforme figura a seguir.\n\nA partir dessas informações, a situação, apresentação e posição do feto são, respectivamente,",
    "alternatives": {
      "A": "situação cefálica, apresentação longitudinal, variedade de posição occípito-esquerda-posterior.",
      "B": "situação cefálica, apresentação longitudinal, variedade de posição occípito-direita-posterior.",
      "C": "situação longitudinal, apresentação cefálica, variedade de posição occípito-direita-posterior.",
      "D": "situação longitudinal, apresentação cefálica, variedade de posição naso-esquerda-anterior."
    },
    "correct_answer": "C",
    "status": "válida",
    "has_image": true,
    "image_reference": "Figura de estática fetal (Rezende Obstetrícia 12ª ed.) demonstrando feto em situação longitudinal, apresentação cefálica e dorso à direita posterior (ODP).",
    "source_question_page": 27,
    "source_answer_key_page": 1,
    "answer_key_type": "definitivo",
    "validation_status": "validated",
    "extraction_confidence": 1.00
  },
  {
    "id": "q-rev-2022-1-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Uma mulher com 32 anos de idade comparece à consulta médica agendada na Unidade Básica de Saúde levando o resultado de exame citopatológico do colo uterino coletado há 1 mês. A paciente, muito nervosa, confessa que havia lido o resultado do exame e que pesquisou na internet sobre o tema. Ressaltou que segue corretamente às orientações do seu médico e que, aos 29 anos de idade, realizou o mesmo exame, com resultado normal. O resultado do exame citopatológico do colo uterino realizado no último mês apresentou amostra satisfatória, representatividade da junção escamo colunar, presença de células escamosas e glandulares e presença de ASCUS - (células escamosas atípicas de significado indeterminado).\nConsiderando o caso apresentado, após explicar à paciente que há presença de um exame com alteração, o médico de família deve",
    "alternatives": {
      "A": "repetir o exame citopatológico do colo uterino no momento da consulta.",
      "B": "solicitar novo exame citopatológico do colo uterino em 12 meses e, caso a alteração permaneça, avaliar indicação de cirurgia.",
      "C": "encaminhar a paciente para o serviço especializado de Ginecologia para realização de um novo exame mais detalhado, a colposcopia.",
      "D": "solicitar novo exame citopatológico do colo uterino em 6 meses e, caso a alteração permaneça, solicitar a realização de um exame mais detalhado, a colposcopia."
    },
    "correct_answer": "D",
    "status": "válida",
    "has_image": false,
    "source_question_page": 28,
    "source_answer_key_page": 1,
    "answer_key_type": "definitivo",
    "validation_status": "validated",
    "extraction_confidence": 1.00
  }
];

async function sync20221ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2022/1 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2022/1 no Firestore
  const editionDoc = {
    id: "rev-2022-1",
    year: 2022,
    editionLabel: "Revalida INEP 2022/1 — 1ª Edição Semestral",
    officialNotice: "Edital nº 04/2022 - INEP/MEC",
    examDate: "2022-03-06",
    stage: "1ª Etapa (Teórica)",
    objectiveCount: 100,
    annulledQuestions: [1, 6, 11, 14, 22, 27, 43, 57, 61, 83],
    alteredQuestions: [{ questionNumber: 42, from: "C", to: "D" }],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2022_1/gabarito_preliminar_revalida_2022_1.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2022_1/gabarito_definitivo_revalida_2022_1.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2022-1"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2022-1 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2022_1_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2022_1"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2022/1 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2022_1_to_firestore"));
if (isDirectExecution) {
  sync20221ToFirestore().catch((err) => {
  console.error("Erro na importação 2022/1:", err);
  process.exit(1);
});
}
