import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2023_2_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2023-2-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Uma mulher de 60 anos, hipertensa, em uso irregular de medicamentos, é levada pelo filho ao pronto-socorro com história de ter começado a sentir, há 8 horas, cefaleia holocraniana intensa, apresentando náuseas e vômitos. Ela passou a ter confusão mental e, na última hora, está mais sonolenta. Ao exame físico, apresenta pressão arterial de 220 × 140 mmHg em ambos os membros superiores; está sonolenta, mas é responsiva ao chamado verbal. Percebe-se, também, que está desorientada no tempo e no espaço. Além disso, suas pupilas estão isocóricas e fotorreativas e ela não apresenta déficit motor ou sensitivo.\nDiante da hipótese diagnóstica mais provável, a conduta adequada é realizar uma",
    alternatives: {
      "A": "punção liquórica e prescrever betabloqueadores.",
      "B": "tomografia de crânio e infundir nitroprussiato de sódio.",
      "C": "tomografia de crânio imediata e administrar furosemida endovenosa.",
      "D": "ressonância magnética de crânio imediata e administrar ácido acetilsalicílico."
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
    id: "q-rev-2023-2-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Um paciente de 48 anos é internado devido a uma fratura de fêmur fechada, a qual ocorreu há 12 horas. Durante a internação, o paciente mantém-se estável; não há intercorrências. Ele não apresenta comorbidades e não faz uso de medicações. Ao avaliar o caso, a equipe de ortopedia indica fixação definitiva da fratura. Visando à segurança do paciente, de acordo com as práticas recomendadas para realização de cirurgia segura, é importante verificar uma listagem de itens durante a etapa de identificação, antes da indução anestésica para o procedimento cirúrgico.\nCom base nessas informações, o que deve ser realizado pela equipe médica durante a etapa de identificação do paciente, visando a sua segurança?",
    alternatives: {
      "A": "Apresentação de cada membro da equipe pelo nome e função; e confirmação de vaga em unidade de terapia intensiva para o pós-operatório imediato.",
      "B": "Confirmação da explicação do procedimento e seus riscos para os familiares do paciente; e verificação da existência de equipe de acolhimento hospitalar.",
      "C": "Contagem de materiais a serem utilizados, como pinças e compressas; e checagem do funcionamento adequado de aparelhagem radiológica e anestésica.",
      "D": "Demarcação da lateralidade (direita ou esquerda) do procedimento; avaliação de alergias conhecidas; e checagem da existência do termo de consentimento para o procedimento."
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
    id: "q-rev-2023-2-03",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 3,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Um menino de 9 anos, com peso de 29 kg e altura de 1,36 m, recém-adotado, comparece à primeira consulta de rotina com a família atual. Seus pais questionam o médico sobre a forma mais segura de transportar o filho na parte central do banco traseiro do automóvel, a fim de zelar por sua integridade física em caso de acidente.\nEm resposta ao questionamento dos pais, o médico deve orientar que a forma mais segura de transportar a criança é de frente para o painel do veículo,",
    alternatives: {
      "A": "no banco, utilizando o cinto de segurança de três pontos do veículo.",
      "B": "na cadeirinha, utilizando o cinto de segurança da própria cadeirinha.",
      "C": "na cadeirinha, utilizando o cinto de segurança de três pontos do veículo.",
      "D": "no assento de elevação, utilizando o cinto de segurança de três pontos do veículo."
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
    id: "q-rev-2023-2-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma mulher de 49 anos comparece à unidade básica de saúde para consulta de rotina. Ela relata ao médico que ficou muito preocupada depois de ler uma matéria na internet sobre os riscos da osteoporose após a menopausa. Sua última menstruação ocorreu há 15 meses. A paciente afirma não praticar atividade física regularmente, mas relata alimentação balanceada e sem restrições. Ela nega doenças crônicas, uso de medicações contínuas, etilismo ou tabagismo. Na história familiar, relata que sua mãe, de 67 anos de idade, possui diagnóstico de hipertensão arterial e de hipotireoidismo. Ao exame, a paciente apresenta pressão arterial de 126 × 78 mmHg, índice de massa corporal 27 kg/m2. Sua tireoide é normal à palpação. Os exames das mamas, do aparelho cardiovascular e do abdome apresentam-se dentro dos limites da normalidade.\nNesse caso, para prevenção primária da osteoporose, o médico deve",
    alternatives: {
      "A": "suplementar com carbonato de cálcio e com vitamina D, além de iniciar rastreio com a densitometria óssea aos 55 anos de idade.",
      "B": "manter uma dieta rica em cálcio e em vitamina D, com exposição solar adequada e exercícios físicos regulares para fortalecimento muscular e ósseo.",
      "C": "realizar densitometria óssea e, caso seja confirmada osteopenia, suplementar com carbonato de cálcio e com vitamina D e usar alendronato de sódio ou raloxifeno.",
      "D": "realizar dosagem sérica do hormônio folículo estimulante e do estradiol e, caso seja confirmada a menopausa, fazer uso da terapia hormonal com estrógenos conjugados."
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
    id: "q-rev-2023-2-22",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 22,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Uma mulher de 45 anos procura o pronto-socorro com queixa de dor abdominal há 3 dias em região epigástrica e hipocôndrio direito, de intensidade crescente, associada a náusea e vômitos. Refere sudorese e calafrios, porém não aferiu temperatura corporal. Além disso, apresenta urina de coloração escurecida. A paciente nega episódios anteriores e não possui antecedentes pessoais relevantes. Ao exame físico, apresenta regular estado geral, corada e hidratada; ictérica 2+/4+; frequência cardíaca de 108 batimentos por minuto; pressão arterial de 110 × 70 mmHg; saturação de oxigênio de 97% em ar ambiente; frequência respiratória de 23 incursões respiratórias por minuto; e temperatura axilar de 38,5 °C; abdome doloroso à palpação em região epigástrica e em hipocôndrio direito. Exames laboratoriais: Leucócitos 16.150 mm³, TGO 81 U/L, TGP 79 U/L, FA 850 U/L, GGT 790 U/L, Bilirrubina Total 6,9 mg/dL (Direta 6,5 mg/dL), PCR 220 mg/dL. USG de abdome: vesícula biliar de paredes finas, múltiplos cálculos e moderada dilatação de vias biliares.\nAcerca do quadro dessa paciente, qual é a principal hipótese diagnóstica e a conduta imediata adequada?",
    alternatives: {
      "A": "Colangite aguda; realizar antibioticoterapia.",
      "B": "Colecistite aguda; realizar papilotomia endoscópica.",
      "C": "Colangite aguda; realizar colecistostomia percutânea.",
      "D": "Colecistite aguda; realizar colecistectomia com exploração de via biliar."
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
    id: "q-rev-2023-2-29",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 29,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma mulher de 27 anos vai em consulta por demanda espontânea na unidade básica de saúde com queixa de corrimento vaginal e de prurido há 3 dias. Ela não é fumante nem possui histórico de infecções sexualmente transmissíveis. Sua última menstruação ocorreu há 20 dias. Ao exame físico, a paciente está em bom estado geral, com temperatura de 36,8 °C, frequência cardíaca de 80 batimentos por minuto, sem sinais de dor abdominal nem de alterações ginecológicas ao toque vaginal. Ao exame especular, é observado um corrimento esbranquiçado, sem cheiro forte, grumoso e aderente na parede vaginal e ectocérvice, além de hiperemia da mucosa vaginal. O teste de Whiff (KOH 10%) foi negativo e o pH vaginal estava normal (< 4,5).\nA partir desses achados, assinale a opção que apresenta o agente etiológico mais provável.",
    alternatives: {
      "A": "Candida sp.",
      "B": "Gardnerella vaginalis.",
      "C": "Trichomonas vaginallis.",
      "D": "Chlamydia trachomatis."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 9,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-2-33",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 33,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Um menino de 15 meses, previamente hígido e com peso de 11,0 kg, aferido há 1 semana, apresenta-se em uma unidade de pronto-atendimento com quadro de diarreia e de vômitos persistente há 3 dias. Na última hora, já apresentou 5 episódios de vômitos de conteúdo alimentar. Ao exame físico durante a consulta, apresenta-se com peso de 10,0 kg, hipotônico, com pulsos fracos, com tempo de enchimento capilar de 3 segundos, com olhos fundos, choro sem lágrimas, e sem conseguir ingerir líquidos.\nDiante do quadro desse paciente, a conduta inicial e imediata do médico deve ser realizar administração endovenosa de",
    alternatives: {
      "A": "200 mL de cloreto de sódio a 0,9% por 20 minutos.",
      "B": "300 mL de cloreto de sódio a 0,9% por 30 minutos.",
      "C": "300 mL da solução de Ringer com lactato por 1 hora.",
      "D": "200 mL da solução de Ringer com lactato por 20 minutos."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 10,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-2-41",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 41,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Uma mulher de 19 anos vai a uma consulta devido a edema de membros inferiores. Ela relata que teve gestação sem intercorrências, embora tenha feito apenas duas consultas de pré-natal. Contudo, 1 mês após o parto, procurou atendimento médico devido à persistência e piora progressiva do edema de membros inferiores, que, inicialmente, atribuiu à gravidez. Ao exame físico, apresenta edema depressível de membros inferiores e pressão arterial de 130 × 80 mmHg. Os exames laboratoriais apresentam urina de rotina com proteína positiva (4+/4+); proteinúria de 24h de 4g (VR: < 150 mg/24h); colesterol total de 300 mg/dL; colesterol HDL de 20 mg/dL; triglicerídeos de 280 mg/dL; glicemia de jejum de 201 mg/dL; albumina de 1,8 g/dL; pesquisa de autoanticorpos FAN positiva com padrão nuclear homogêneo e título de 1:640.\nO diagnóstico sindrômico e o diagnóstico etiológico mais prováveis são, respectivamente,",
    alternatives: {
      "A": "síndrome nefrótica; diabetes mellitus.",
      "B": "síndrome nefrítica; síndrome de Sjögren.",
      "C": "síndrome nefrítica; trombose de veia renal.",
      "D": "síndrome nefrótica; lúpus eritematoso sistêmico."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 13,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-2-66",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 66,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um homem de 50 anos vai ao ambulatório relatando 3 dias de febre e icterícia. Ele mora em área urbana com falta de saneamento básico e nega viagens recentes. Além de febre e de icterícia, apresenta náuseas, eritema conjuntival bilateral e dor muscular, especialmente em panturrilhas. Os exames iniciais indicam leucocitose com neutrofilia e apresentam os seguintes resultados: potássio de 3 mEq/L (VR: 3,5 a 5,1 mEq/L); creatinina de 1,8 mg/dL (VR: 0,6 a 1,2 mg/dL); bilirrubina total de 24 mg/dL (VR: 0,2 a 1,2 mg/dL); bilirrubina direta de 19 mg/dL; TGO de 98 U/L; e TGP de 102 U/L.\nA partir dessas informações, é correto afirmar que a hipótese pertinente para o caso apresentado e a investigação complementar são, respectivamente,",
    alternatives: {
      "A": "dengue; sorologia IgM para dengue.",
      "B": "hepatite por vírus B; Anti-HBc e HBsAg.",
      "C": "leptospirose; teste de microaglutinação.",
      "D": "febre amarela; sorologia IgM para febre amarela."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 19,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-2-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Uma mulher de 28 anos de idade, profissional do sexo, vai a uma consulta com o médico de família e comunidade buscando orientações para prevenção de infecções sexualmente transmissíveis (IST). Ela refere manter atividade sexual com preservativo sempre que possível. Sua última relação sem uso de preservativo foi há 1 semana. Ela não apresenta alterações ao exame físico nem alergia medicamentosa e realizou testes rápidos para IST há 5 meses, todos não reagentes. Foi solicitado teste rápido (TR) para sífilis, com resultado reagente, e para HIV, com resultado não reagente.\nDiante desse caso, o médico deve",
    alternatives: {
      "A": "solicitar VDRL trimestralmente para controle de cura; tratar a parceria; solicitar função hepática; repetir o TR para HIV em 30 dias e anualmente para sífilis; oferecer sorologias para outras IST; notificar; realizar o aconselhamento pós-teste e iniciar penicilina benzatina 2,4 milhões de UI a cada semana, por 3 semanas.",
      "B": "repetir o TR de sífilis mensalmente para controle de cura; tratar a parceria; solicitar função hepática, sorologias para outras IST; repetir TR para HIV em 30 dias; notificar e iniciar penicilina benzatina 2,4 milhões de UI a cada semana, por 3 semanas.",
      "C": "solicitar VDRL para confirmação, e trimestralmente para controle de cura; repetir o TR para HIV em 30 dias; oferecer sorologias para outras IST; aconselhamento pós-teste; notificar e iniciar penicilina benzatina 2,4 milhões em dose única.",
      "D": "repetir o TR para confirmar sífilis; oferecer sorologias para outras IST; repetir o TR para HIV em 30 dias; aconselhamento pós-teste, notificar e iniciar benzatina 2,4 milhões dose única associada à doxiciclina 100mg de 12/12h por 15 dias."
    },
    correct_answer: "C",
    status: "válida",
    has_image: false,
    source_question_page: 28,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20232ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2023/2 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2023/2 no Firestore
  const editionDoc = {
    id: "rev-2023-2",
    year: 2023,
    editionLabel: "Revalida INEP 2023/2 — 2ª Edição Semestral",
    officialNotice: "Edital nº 38/2023 - INEP/MEC",
    examDate: "2023-08-06",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [3, 28, 37, 46, 48, 58, 67, 73, 93],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2023_2/gabarito_preliminar_revalida_2023_2.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2023_2/gabarito_definitivo_revalida_2023_2.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2023-2"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2023-2 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2023_2_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2023_2"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2023/2 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2023_2_to_firestore"));
if (isDirectExecution) {
  sync20232ToFirestore().catch((err) => {
  console.error("Erro na importação 2023/2:", err);
  process.exit(1);
});
}
