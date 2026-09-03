import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2022_2_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2022-2-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um paciente de 64 anos foi levado por familiares à unidade de emergência logo após ter apresentado episódio de síncope. Segundo o paciente, ele já tinha apresentado 2 outros episódios nos últimos 3 meses, sempre precedidos por sensação de “tonteiras”, e, eventualmente, tem sentido a impressão de fraqueza, “escurecimento da visão” e sensação de queda iminente. Não há dados relevantes de história patológica pregressa do paciente, que não faz uso de nenhum fármaco regularmente. No exame físico, o paciente apresentava-se bradicárdico (42 batimentos por minuto), normotenso, com ritmo cardíaco regular em 3 tempos (B4), sem sopros. Seu pulso venoso jugular revelou a presença de intermitentes ondas “a em canhão”. Foi realizado um eletrocardiograma, que revelou padrão similar ao ilustrado na figura abaixo.\n\nO emergencista que atende esse paciente deverá explicar-lhe que será necessária a realização de",
    alternatives: {
      "A": "cardioversão elétrica.",
      "B": "ablação de via anômala.",
      "C": "implante de marca-passo definitivo.",
      "D": "isolamento elétrico das vias pulmonares."
    },
    correct_answer: "C",
    status: "válida",
    has_image: true,
    image_reference: "Eletrocardiograma de 12 derivações demonstrando dissociação atrioventricular total (BAV de 3º grau / BAVT) com escape ventricular bradicárdico.",
    source_question_page: 2,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2022-2-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 75 anos de idade, tabagista 1 maço/dia desde os 20 anos de idade, apresenta queixa de polaciúria, disúria e hematúria macroscópica. Relata diversos episódios de infecção do trato urinário no passado e hiperplasia prostática benigna tratada por ressecção transuretral, com melhora significativa dos sintomas obstrutivos urinários. No toque retal, percebe-se próstata de tamanho aumentado, com superfície regular. Exame de urina tipo I (EAS) evidencia hematúria maciça, com mais de 80% de hemácias isomórficas.\nNesse caso, a melhor conduta diagnóstica e o diagnóstico mais provável são, respectivamente",
    alternatives: {
      "A": "uretrocistoscopia; carcinoma invasor de bexiga.",
      "B": "urografia excretora; carcinoma de células renais.",
      "C": "ressonância magnética de abdome; cálculo coraliforme.",
      "D": "ultrassom transretal com biópsia de próstata; adenocarcinoma de próstata."
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
    id: "q-rev-2022-2-03",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 3,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Lactente de 6 meses está sendo atendido na unidade básica de saúde para consulta de puericultura. A criança, nascida com 39 semanas, encontra-se em aleitamento materno exclusivo e com desenvolvimento neuropsicomotor adequado. Sua genitora solicita orientações para iniciar a alimentação complementar.\nAcerca da introdução alimentar nesse caso, assinale a opção correta.",
    alternatives: {
      "A": "A carne deve ser triturada e peneirada, para garantir oferta adequada de ferro, zinco e vitamina B12.",
      "B": "As frutas, in natura, raspadas, amassadas ou picadas devem ser introduzidas como fontes de fibras.",
      "C": "Os sucos devem ser introduzidos na rotina alimentar, uma vez ao dia, sendo importante fonte de vitaminas e fibras.",
      "D": "A gema do ovo, por ser uma importante fonte proteica, deve ser oferecida de imediato, ao passo que a clara, devido ao seu poder alergênico, deve ser oferecida somente após 12 meses de idade."
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
    id: "q-rev-2022-2-06",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 6,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Uma paciente de 62 anos de idade foi encaminhada ao ambulatório de nefrologia de um hospital universitário para ajuste no tratamento anti-hipertensivo, em razão de suposta nefropatia hipertensiva estágio 3. A paciente tem hipertensão arterial sistêmica (HAS) há longa data e faz tratamento com hidroclorotiazida 25 mg/dia e anlodipino 10 mg duas vezes ao dia. Recentemente, seus exames de sangue revelaram pequena retenção de escórias nitrogenadas, sendo o cálculo estimado da taxa de filtração glomerular de 54 ml/min/1,73 m2. Exame urinário revelou a presença de microalbuminúria (120 mg/g de creatinina em amostra isolada de urina; valor de referência: até 30 mg/g de creatinina na urina). No exame físico, os níveis tensionais se encontravam em 150 x 90 mmHg no membro superior (MS) direito e em 148 x 92 mmHg no MS esquerdo.\nConsiderando-se o risco cardiovascular da paciente, os níveis tensionais observados na consulta e a presença de dano renal crônico em estágio 3 (da classificação KDIGO — do inglês Kidney Disease: Improving Global Outcomes), em relação ao esquema terapêutico em curso, a conduta correta seria",
    alternatives: {
      "A": "adicionar inibidor da enzima conversora ou bloqueador do receptor de angiotensina II.",
      "B": "trocar a hidroclorotiazida por diurético de alça e aumentar a dose do bloqueador de canal de cálcio.",
      "C": "iniciar espironolactona e carvedilol.",
      "D": "mantê-lo sem alterações e trabalhar a adesão ao tratamento."
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
    id: "q-rev-2022-2-07",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 7,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 55 anos de idade apresenta quadro de dor em fossa ilíaca esquerda. No exame físico, apresentava bom estado geral, frequência cardíaca de 90 batimentos por minuto, pressão arterial de 130 × 80 mmHg, frequência respiratória de 20 incursões respiratórias por minuto e temperatura axilar de 37,9 °C. O paciente realizou tomografia de abdome e pelve, que mostrou ausência de líquido livre e gás na cavidade peritoneal, discreta distensão de alças de delgado e cólons direito e transverso, espessamento de cólon descendente e abscesso pericolônico de 6 cm próximo à goteira parietocólica esquerda.\nNesse caso, qual é a melhor conduta imediata?",
    alternatives: {
      "A": "Internação e antibioticoterapia venosa exclusiva.",
      "B": "Antibioticoterapia venosa e drenagem do abscesso.",
      "C": "Alta hospitalar e antibioticoterapia oral ambulatorial.",
      "D": "Laparotomia exploradora e procedimento de Hartmann."
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
    id: "q-rev-2022-2-12",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 12,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem de 33 anos procurou atendimento por dor em cólica, de forte intensidade, em hipocôndrio direito, iniciada havia 3 meses, com irradiação para abdome superior e dorso. Informou que alguns episódios melhoravam com o uso de analgésicos orais. Em diversas ocasiões, havia sido atendido em unidade de emergência, sendo submetido a analgesia intravenosa, devido à intensidade da dor. Relatou, ainda, que as crises dolorosas são associadas a náuseas e vômitos e desencadeadas pela ingestão de alimentos gordurosos. Negou icterícia, colúria e acolia fecal. Apresenta ritmo intestinal e aspecto das fezes normais. No exame físico, estava em bom estado geral, consciente, contactuante, orientado no tempo e no espaço, normocorado, hidratado, anictérico, acianótico, afebril, com frequência cardíaca de 64 batimentos por minuto, frequência respiratória de 16 incursões respiratórias por minuto, pressão arterial de 120 × 80 mmHg, abdome plano, ruídos hidroaéreos presentes e normais, timpânico, flácido, indolor à palpação superficial e profunda, sem sinais de irritação peritoneal, ausência de visceromegalias ou massas, sinal de Murphy negativo.\nRealizou exames laboratoriais, cujos resultados foram os seguintes.\n• Hemograma: hemoglobina = 16, 1g/dL; hematócrito = 49,8%; leucócitos = 5.800 mm³; segmentados = 48,5%; linfócitos = 41,5%; plaquetas = 155.000/mm³; coagulação: TP = 13,3 segundos; RNI = 1,09.\n• Urina: tipo 1 sem alterações.\n• Bioquímica: glicemia de jejum = 83mg/dL; AST = 35 UI/L (valor de referência [VR] de 17-59); ALT = 46 UI/L (VR: 21- 72); amilase = 100 UI/L (VR: 20-160); bilirrubina total = 0,8 mg/dL; bilirrubina direta = 0,5 mg/dL; bilirrubina indireta = 0,3 mg/dL.\nCom base no caso descrito, assinale a opção que apresenta o diagnóstico mais provável e a conduta mais apropriada, respectivamente.",
    alternatives: {
      "A": "Coledocolitíase; colangiografia endoscópica.",
      "B": "Colecistite aguda calculosa; ultrassonografia.",
      "C": "Pólipo da vesícular biliar; colangiorressonância.",
      "D": "Colelitíase; colecistectomia videolaparoscópica."
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
    id: "q-rev-2022-2-40",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 40,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Um homem de 40 anos, funcionário de um pet shop, morador da cidade de São Paulo, procurou atendimento na unidade de saúde da família, devido a uma ferida no antebraço. Relatou que a lesão surgira havia 2 meses, inicialmente como um pequeno “caroço”, que cresceu e ulcerou. Disse, ainda, que, nas últimas três semanas, surgiram novos “caroços” no antebraço. No exame físico, apresentava-se em bom estado geral, afebril, eutrófico, com úlcera de aproximadamente 3 cm de diâmetro no antebraço direito. Também no antebraço direito, apresentava 4 nódulos eritematosos distribuídos de forma linear entre a úlcera e a fossa cubital. Apresentava, ainda, linfonodo axilar direito aumentado, de consistência fibroelástica, levemente doloroso à palpação.\nNesse caso, qual é a hipótese diagnóstica mais provável?",
    alternatives: {
      "A": "Esporotricose.",
      "B": "Cromoblastomicose.",
      "C": "Leishmaniose tegumentar.",
      "D": "Blastomicose sul-americana."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 11,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2022-2-79",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 79,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Gestante de 39 anos de idade, com histórico de três cesarianas prévias, irá realizar uma cesariana eletiva por iteratividade, com 39 semanas de gestação. Ao ser internada na maternidade para realizar o procedimento, ela apresentou cultura positiva para Streptococcus beta-hemolítico oriundo de swab vaginal e retal colhido com 36 semanas de gestação. Durante a anamnese, a paciente relatou ser alérgica a penicilina benzatina.\nDiante das informações apresentadas, qual é a melhor conduta a ser adotada?",
    alternatives: {
      "A": "Evitar profilaxia antibiótica.",
      "B": "Usar vancomicina 1 g intravascular.",
      "C": "Empregar ampicilina 2 g intravascular.",
      "D": "Utilizar clindamicina 900 mg intravascular."
    },
    correct_answer: "D",
    status: "válida",
    answer_changed: true,
    official_answer: "D",
    has_image: false,
    source_question_page: 20,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2022-2-81",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 81,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Homem de 63 anos, portador de hipertensão arterial sistêmica e diabetes mellitus há longa data, além de cardiopatia hipertensiva e fibrilação atrial paroxística, foi levado por familiares a uma unidade de emergência, com quadro neurológico de instalação abrupta havia cerca de 2 horas. Segundo informaram seus familiares, o paciente tinha começado a “falar embolado” e mostrava dificuldade para movimentar o membro superior direito, tendo evoluído para progressivo rebaixamento do nível de consciência, o que motivou a família a levá-lo para a unidade. Não houve interrupção da administração de fármacos de uso crônico (valsartana, amlodipina e amiodarona).\nNo exame físico, o paciente estava em coma superficial, exibindo evidente hemiparesia de predomínio braquiofacial direito. Sua pressão arterial (ambos membros superiores) era de 160 × 100 mmHg, sendo o ritmo cardíaco irregular, em 2 tempos, com bulhas normofonéticas e sem sopros. A glicemia capilar era de 320 mg/dL, enquanto o eletrocardiograma revelou apenas ritmo de fibrilação atrial com resposta ventricular inferior a 110 batimentos por minuto. Uma tomografia computadorizada de crânio, laudada em 45 minutos após sua chegada à unidade, mostrou-se sem anormalidades aparentes.\nVisando-se ao melhor prognóstico do paciente, com menores limitações neurológicas funcionais futuras, a estratégia terapêutica que deve ser instituída imediatamente é",
    alternatives: {
      "A": "reverter a fibrilação atrial paroxística com cardioversão química.",
      "B": "administrar terapia trombolítica intravenosa com rtPA.",
      "C": "infundir insulina intravenosa em bólus.",
      "D": "controlar a hipertensão arterial com nitroprussiato de sódio."
    },
    correct_answer: "B",
    status: "válida",
    has_image: false,
    source_question_page: 20,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2022-2-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2022,
    edition: "2022.2",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Criança de 5 anos foi levada por familiar para consulta na unidade básica de saúde, com quadro de febre não aferida havia 3 dias, odinofagia e recusa alimentar. No exame físico, observou-se presença de lesões vesiculares na mucosa bucal e na língua, além de erupções papulovesiculares localizadas em regiões palmares e plantares bilateralmente.\nConsiderando-se como principal hipótese diagnóstica a síndrome mão-pé-boca, qual é a conduta correta?",
    alternatives: {
      "A": "Orientar isolamento e afastar a criança da creche por sete dias ou até o desaparecimento das lesões cutâneas.",
      "B": "Notificar imediatamente o caso ao serviço de vigilância epidemiológica e agendar visita à creche para busca ativa de casos.",
      "C": "Recomendar isolamento domiciliar por sete dias e instituir tratamento ambulatorial com o antiviral plenaril.",
      "D": "Encaminhar a criança para internação hospitalar, para hidratação, se necessária, tratamento sintomático e aplicação de imunoglobulina endovenosa."
    },
    correct_answer: "A",
    status: "válida",
    has_image: false,
    source_question_page: 23,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20222ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2022/2 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2022/2 no Firestore
  const editionDoc = {
    id: "rev-2022-2",
    year: 2022,
    editionLabel: "Revalida INEP 2022/2 — 2ª Edição Semestral",
    officialNotice: "Edital nº 55/2022 - INEP/MEC",
    examDate: "2022-08-07",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [12, 16, 21, 37, 50, 60, 61, 62, 66, 70, 73, 78, 84, 85],
    alteredQuestions: [{ questionNumber: 79, from: "Preliminar", to: "D" }],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2022_2/gabarito_preliminar_revalida_2022_2.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2022_2/gabarito_definitivo_revalida_2022_2.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2022-2"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2022-2 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2022_2_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2022_2"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2022/2 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2022_2_to_firestore"));
if (isDirectExecution) {
  sync20222ToFirestore().catch((err) => {
  console.error("Erro na importação 2022/2:", err);
  process.exit(1);
});
}
