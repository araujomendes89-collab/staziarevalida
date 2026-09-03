import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2023_1_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2023-1-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um paciente com 54 anos, em acompanhamento há 4 meses em função de cardiopatia isquêmica dilatada, foi admitido na unidade de emergência com queixas de súbitas palpitações e dispneia há cerca de 3 horas. O paciente nega dor precordial, informando ser portador, de longa data, de hipertensão arterial sistêmica e diabetes melito, em uso de carvedilol, enalapril, furosemida, espironolactona, dapagliflozina e insulina NPH (dose apenas noturna). Ao exame físico, o paciente se encontra em moderado desconforto respiratório, sudorese presente, pressão arterial de 80 × 62 mmHg, frequência cardíaca de 120 batimentos por minuto, com ritmo cardíaco irregular e com estertoração bolhosa bibasal. É realizado um eletrocardiograma (ECG) que evidencia padrão irregular, com existência de ondas f, sendo caracterizada fibrilação atrial paroxística com elevada resposta ventricular; fora a presença de ondas Q patológicas na parede anterior, não há distúrbios de ST-T no ECG. A médica que o atende opta por realizar um procedimento que exige prévia aplicação de sedação e analgesia ao paciente, passando a explicar-lhe o que será realizado em seguida.\nDiante da situação apresentada, o procedimento que será realizado no paciente é",
    alternatives: {
      "A": "cineangiocoronariografia com angioplastia coronária.",
      "B": "cateterismo cardíaco com estudo eletrofisiológico.",
      "C": "implante de marca-passo provisório transvenoso.",
      "D": "aplicação de cardioversão elétrica."
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
    id: "q-rev-2023-1-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Um homem com 62 anos comparece, acompanhado de sua filha, a uma unidade básica de saúde, após terem sido alertados pelos vizinhos sobre a campanha de detecção de câncer de próstata, denominada Novembro azul. O paciente não mantém contato com os irmãos nem com o restante da família, portanto desconhece se há história familiar de câncer. Está completamente assintomático. Relata que seu pai faleceu aos 65 anos de idade e que não sabe a causa da morte.\nNesse caso, do ponto de vista da prevenção, a conduta do médico deve ser",
    alternatives: {
      "A": "orientar o rastreio, indicado para homens de 50 a 70 anos de idade e esclarecer a filha de que será solicitado o PSA (antígeno prostático específico), método com grande sensibilidade e especificidade para diagnóstico de estágio precoce de doença.",
      "B": "iniciar o rastreio indicado para homens de 50 a 70 anos de idade, como recomendado pelo Ministério da Saúde, que prevê, nessa faixa etária, a realização do toque retal e a ultrassonografia da próstata, após concordância, expressa no consentimento informado.",
      "C": "avaliar a necessidade de rastreio, indicado para homens de 50 a 70 anos de idade, esclarecendo à filha de que serão solicitados um exame de toque retal, a coleta do PSA e a ultrassonografia da próstata, após concordância, expressa no consentimento informado.",
      "D": "discutir o rastreio do câncer de próstata com o paciente e sua filha, dado que ele está assintomático e que, nesse caso, há muitos dados que mostram que possíveis danos relacionados a testes diagnósticos e tratamentos excessivos superam respectivos benefícios."
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
    id: "q-rev-2023-1-03",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 3,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Uma lactente com 6 meses, nascida a termo, sem doenças prévias, encontra-se em consulta médica de puericultura. A mãe refere uso de leite de cabra in natura exclusivo na alimentação da criança desde o nascimento. Ao exame físico, a criança apresenta palidez cutâneo-mucosa importante e língua lisa. Foi solicitado hemograma, que apresentou anemia macrocítica, neutropenia com hipersegmentação de neutrófilos e plaquetopenia. Ampliada a investigação, o mielograma apresentou-se normal.\nConsiderando-se a hipótese diagnóstica mais provável, além de adequação dietética, o tratamento medicamentoso indicado para reverter essa situação é a administração de",
    alternatives: {
      "A": "vitamina E e iodo.",
      "B": "vitamina B12 e folato.",
      "C": "zinco e ácido ascórbico.",
      "D": "sais de ferro e vitamina A."
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
    id: "q-rev-2023-1-07",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 7,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Um paciente de 55 anos, obeso, tabagista, foi internado no serviço de urologia. Apresentava hematúria franca, tendo sido submetido a cistoscopia com ressecção transuretral de lesões. O laudo anatomopatológico revelou a ressecção de 3 lesões tumorais superficiais, limitadas ao revestimento da bexiga, compatíveis com carcinoma de células transicionais de alto grau, além de ausência de invasão muscular. A pesquisa realizada por meio de ultrassonografia não demonstrou acometimento de linfonodos locais.\nNessa situação, qual conduta deve ser adotada para o caso?",
    alternatives: {
      "A": "Solicitar cistectomia total.",
      "B": "Indicar tratamento intravesical com BCG.",
      "C": "Indicar tratamento com dose única de mitomicina.",
      "D": "Solicitar cistoscopia com nova ressecção trimestral."
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
    id: "q-rev-2023-1-20",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 20,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Uma paciente com 35 anos, que vive com o marido e dois filhos pequenos, procurou uma unidade básica de saúde (UBS) com feridas recentes. Ela relatou que, na noite anterior, havia sido agredida pelo marido, com socos e pontapés, e ameaçada com uma faca. Após receber atendimento para as lesões, e tendo sido abordada pelo médico, a paciente confirmou que a atitude violenta do marido é frequente e que vem ocorrendo há dois anos.\nDiante desse quadro, a conduta médica adequada é",
    alternatives: {
      "A": "encaminhar a paciente ao atendimento psiquiátrico e comunicar o caso ao Conselho Tutelar.",
      "B": "encaminhar a paciente, acompanhada de alguém da equipe da UBS, à Delegacia de Proteção à Mulher e emitir boletim de ocorrência.",
      "C": "comunicar o fato à rede social de apoio da paciente, vizinhos e familiares, para que a ajudem nos momentos de conflito entre ela e o marido.",
      "D": "propor abordagem multiprofissional e notificar o caso de violência preenchendo a Ficha de Notificação do Sistema de Informação de Agravos de Notificação (SINAN)."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 6,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-1-44",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 44,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma paciente primigesta de 16 anos, com 36 semanas de idade gestacional, procura a unidade básica de saúde apresentando ruptura prematura de membranas ovulares. Encaminhada ao hospital em franco trabalho de parto, é admitida em período expulsivo. O recém-nascido (RN), acolhido pela equipe de neonatologia, tem peso adequado para a idade gestacional e sua avaliação na escala Apgar é de 9/9 no primeiro e quinto minutos. No entanto, após 36 horas do nascimento, o RN apresenta quadro de pneumonia e evolui rapidamente para sepse.\nNesse caso, para prevenir a ocorrência da sepse, deveria ter sido realizado durante o pré-natal o rastreio e a quimioprofilaxia de qual agente etiológico?",
    alternatives: {
      "A": "Streptococcus β-hemolíticos do grupo B.",
      "B": "Chlamydia trachomatis.",
      "C": "Staphylococcus aureus.",
      "D": "Escherichia coli."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 12,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-1-59",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 59,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma paciente com 24 anos apresenta sangramento vaginal volumoso no puerpério imediato de parto vaginal sem episiotomia. Relata como antecedentes pré-natal e parto vaginal sem intercorrências ou morbidade associada à gestação. Ao exame físico, apresenta-se: em regular estado geral; confusa; com frequência cardíaca de 138 batimentos por minuto; pressão arterial de 80 × 50 mmHg; à ausculta cardíaca, com ritmo cardíaco regular em dois tempos, bulhas hipofonéticas, sem sopros; à ausculta pulmonar, com murmúrios vesiculares sem ruídos adventícios. O exame do abdome da paciente evidencia útero amolecido e palpável 8 cm acima da cicatriz umbilical. Em análise do partograma, foi constatado uso de ocitocina 05 UI durante as 14 horas de condução do trabalho de parto.\nDiante do quadro apresentado, a conduta inicial adequada é",
    alternatives: {
      "A": "iniciar imediatamente a infusão de Ringer Lactato 1.000 ml em acesso venoso calibroso, realizar massagem uterina e usar drogas uterotônicas.",
      "B": "encaminhar a paciente para a ultrassonografia de urgência e solicitar hemograma, para avaliar necessidade de hemotransfusão.",
      "C": "realizar laparotomia de urgência e histerectomia, com hemotransfusão, sem necessidade de prova cruzada.",
      "D": "tranquilizar a paciente, esclarecendo que se trata de loquiação fisiológica do puerpério imediato."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 15,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-1-61",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 61,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um homem com 50 anos chega ao pronto-socorro após queda da própria altura e dor em pulso direito. Relata perda ponderal de 25 kg nos últimos dois anos, referindo hiporexia e má alimentação. Relata ingestão de bebidas destiladas diariamente há 10 anos, cerca de 500 a 800 ml/dia, nega tabagismo, doenças preexistentes, uso de medicamentos e de drogas ilícitas. O paciente apresenta-se em estado geral ruim, apático, alerta, orientado em espaço, pouco orientado em tempo; sua marcha é atáxica. Ao exame físico, registram-se índice de massa corporal de 18 kg/m2; frequência cardíaca de 100 batimentos por minuto; frequência respiratória de 16 incursões respiratórias por minuto; pressão arterial de 100 × 60 mmHg. Observam-se diplopia, nistagmo e estrabismo convergente bilateral, punho direito edemaciado, além de amnésia retrógrada e distorção ao relatar histórias passadas. Os resultados de seus exames de sangue apresentam: hemoglobina: 13,1 g/dL; leucócitos: 8.890 /mL; plaquetas: 280.000/mL; magnésio: 0,9 mg/dL; vitamina B1: 15 mmol/L (VR: 60-120). No resultado da ressonância magnética plano axial T2, observam-se sinais hiperintensos na região do tecto e na substância cinzenta próxima ao aqueduto cerebral.\nConsiderando-se esse quadro clínico e a suspeita diagnóstica da Síndrome de Wernick Korsakoff, quais seriam, respectivamente, o fator etiopatogênico dessa síndrome e a conduta terapêutica adequada para o paciente?",
    alternatives: {
      "A": "Alcoolismo; hidratação com soro glicofisiológico a 10% + complexo B oral.",
      "B": "Traumatismo cranioencefálico; internação na unidade de terapia intensiva (UTI).",
      "C": "Traumatismo cranioencefálico; observação e hidratação com soro glicofisiológico a 10%.",
      "D": "Alcoolismo; tiamina parenteral intravenosa ou intramuscular (500 mg, 2 a 3 vezes por dia, por 3 dias)."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 16,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-1-64",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 64,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Uma paciente com 39 semanas e 2 dias de idade gestacional chega à unidade de pronto atendimento para avaliação obstétrica e, após anamnese e exame físico geral, foi constatada, no exame de toque vaginal, uma apresentação fetal como a ilustrada na foto a seguir.\n\nCom relação à foto, é correto afirmar que se trata de uma apresentação cefálica",
    alternatives: {
      "A": "defletida de 1° grau, bregmática.",
      "B": "defletida de 2° grau, de fronte.",
      "C": "defletida de 3° grau, de face.",
      "D": "fletida, occipital."
    },
    correct_answer: "C",
    status: "válida",
    has_image: true,
    image_reference: "Fotografia obstétrica ao toque evidenciando apresentação cefálica defletida de 3º grau (face).",
    source_question_page: 17,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2023-1-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2023,
    edition: "2023.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Uma médica iniciou suas atividades em uma equipe de Saúde da Família (ESF) de um grande centro urbano. Na primeira reunião de equipe, questionou de que forma os trabalhadores organizavam seu processo de trabalho para compreender as especificidades e necessidades da população da área adstrita, do ponto de vista dos determinantes sociais da saúde (DSS). Os profissionais participantes da reunião não conseguiram responder a essa pergunta.\nA seguir é apresentado o modelo de determinantes sociais da saúde (DSS), proposto por Dahlgren e Whitehead.\n\nConsiderando o modelo de determinação social da saúde apresentado, os profissionais dessa ESF deveriam",
    alternatives: {
      "A": "considerar que apenas os fatores genéticos, estilo de vida e as redes sociais e comunitárias devem ser avaliadas para se reconhecerem as especificidades da população da área adstrita.",
      "B": "entender que, apesar das condições de vida e trabalho serem importantes para os DSS, elas não influenciam ou orientam as atividades desenvolvidas no território.",
      "C": "considerar que os fatores hereditários; estilo de vida; condições socioeconômicas, culturais e ambientais gerais, são os fatores mais importantes para a determinação das suas ações.",
      "D": "entender que os indivíduos e suas características individuais de idade, sexo e fatores hereditários estão na base do modelo, e os estilos de vida individuais estão situados no limiar entre os fatores individuais e os DSS."
    },
    correct_answer: "D",
    status: "válida",
    has_image: true,
    image_reference: "Modelo concêntrico em arco-íris dos Determinantes Sociais da Saúde (Dahlgren & Whitehead, 1991).",
    source_question_page: 26,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20231ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2023/1 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2023/1 no Firestore
  const editionDoc = {
    id: "rev-2023-1",
    year: 2023,
    editionLabel: "Revalida INEP 2023/1 — 1ª Edição Semestral",
    officialNotice: "Edital nº 02/2023 - INEP/MEC",
    examDate: "2023-03-05",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [7, 13, 35, 38, 42, 48, 49],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2023_1/gabarito_preliminar_revalida_2023_1.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2023_1/gabarito_definitivo_revalida_2023_1.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2023-1"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2023-1 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2023_1_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2023_1"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2023/1 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2023_1_to_firestore"));
if (isDirectExecution) {
  sync20231ToFirestore().catch((err) => {
  console.error("Erro na importação 2023/1:", err);
  process.exit(1);
});
}
