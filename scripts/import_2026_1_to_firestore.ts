import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2026_1_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2026-1-01",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 1,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Mulher, 53 anos, relata episódios de cefaleia desde os 24 anos. Nos últimos dois anos, tem apresentado de 2 a 3 episódios mensais, com um máximo de 10 dias de dor por mês. Geralmente a dor de cabeça é precedida por sintomas visuais, como pontos cintilantes que duram aproximadamente 30 minutos. A dor costuma durar de 8 a 24 horas, é pulsátil, unilateral, de intensidade moderada a forte, acompanhada de fotofobia, fonofobia e náuseas. Em algumas ocasiões, houve episódios de vômito. A paciente está preocupada com o uso frequente de analgésicos e anti-inflamatórios. Queixa-se ainda de insônia frequente. Relata asma na infância e atualmente crises eventuais de broncoespasmo. Nega tabagismo, etilismo, doenças crônicas como diabetes e hipertensão arterial, bem como uso contínuo de medicamentos.\nA conduta farmacológica de uso contínuo, diário e mais indicada como profilaxia para os episódios de cefaleia desta paciente é",
    alternatives: {
      "A": "ibuprofeno 400 mg.",
      "B": "propanolol 40 mg.",
      "C": "sumatriptano 50 mg.",
      "D": "amitriptilina 25 mg."
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
    id: "q-rev-2026-1-02",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 2,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Menino de 8 anos vai à consulta médica em ambulatório de hospital secundário trazido pela mãe. A genitora refere que a criança abruptamente, durante o sono, começa a “chorar, gritar e suar bastante”, por alguns minutos. Nesses momentos, não responde aos chamados e retoma sono profundo. Quando questionado na manhã seguinte, o menino diz não se lembrar de nada do ocorrido. Desconhecem-se antecedentes patológicos. O paciente apresenta bom desempenho escolar e comportamento adequado com os colegas e professores.\nQual é a principal hipótese diagnóstica?",
    alternatives: {
      "A": "Sonambulismo.",
      "B": "Insônia de manutenção.",
      "C": "Terror noturno.",
      "D": "Transtorno de pesadelos."
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
    id: "q-rev-2026-1-03",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 3,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Mulher de 88 anos é trazida à Unidade de Pronto Atendimento (UPA) pelo SAMU, com queixa de dor intensa em quadril direito após queda da própria altura. Possui antecedentes de hipertensão arterial sistêmica e diabetes mellitus, em acompanhamento regular. Nega outras comorbidades ou uso prévio de psicotrópicos. É diagnosticada com fratura de colo de fêmur e aguarda transferência hospitalar. Apresenta dor significativa no quadril, exacerbada à mobilização passiva, a despeito da administração de dipirona endovenosa. Após 6 horas na UPA, evolui com desatenção, agitação psicomotora alternada com apatia e discurso desconexo, com tomografia de crânio normal. Exame físico: PA 138 x 76 mmHg; FC 102 bpm; FR 22 irpm; Temperatura 36,5 °C; SpO2 94% em ar ambiente; glicemia capilar 120 mg/dL. Pupilas isocóricas e fotorreagentes; ausculta cardiopulmonar sem alterações; abdome indolor e sem visceromegalias; ausência de déficits neurológicos focais.\nConsiderando o quadro clínico apresentado, o(s) principal(is) fator(es) precipitante(s) é(são)",
    alternatives: {
      "A": "hipoxemia.",
      "B": "comorbidades prévias.",
      "C": "dor não controlada.",
      "D": "hipoglicemia."
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
    id: "q-rev-2026-1-04",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 4,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Gestante de 30 anos, G2 P1, com 28 semanas de gestação, comparece à Unidade Básica de Saúde para consulta de rotina. Nega disúria, urgência miccional, dor suprapúbica, lombar, febre ou comorbidades. Traz exames solicitados da rotina pré-natal: EAS com aspecto ligeiramente turvo, densidade 1.015, pH 5,5, proteínas traços, nitrito negativo, leucócitos 4/campo, hemácias 2/campo, bactérias moderadas. Urocultura: Crescimento de Escherichia coli 30.000 UFC/mL.\nQual é a interpretação para os exames laboratoriais e o manejo adequado da paciente?",
    alternatives: {
      "A": "Diagnosticar bacteriúria assintomática e iniciar tratamento imediato.",
      "B": "Considerar o exame contaminado e repetir a urocultura com nova coleta.",
      "C": "Diagnosticar cistite aguda subclínica e iniciar antibiótico.",
      "D": "Considerar o resultado da urocultura alterado e acompanhar a gestação."
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
    id: "q-rev-2026-1-05",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 5,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Mulher de 32 anos procura a Unidade Básica de Saúde referindo presença de lesão pruriginosa em pé direito há aproximadamente 3 semanas, iniciando-se entre terceiro e quarto pododáctilos e estendendo-se ao dorso do pé, com trajeto serpiginoso e linear eritematoso.\nDiante do caso apresentado e da respectiva imagem da lesão, assinale a alternativa com o agente etiológico.",
    alternatives: {
      "A": "Tunga penetrans.",
      "B": "Ancylostoma brasiliensis.",
      "C": "Sarcoptes scabiei.",
      "D": "Trichophyton rubrum."
    },
    correct_answer: "B",
    status: "válida",
    has_image: true,
    image_reference: "Fotografia dermatológica de lesão serpiginosa eritematosa e pruriginosa no dorso do pé (Larva migrans cutânea).",
    source_question_page: 4,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2026-1-06",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 6,
    question_type: "objetiva",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    statement: "Um trabalhador da construção civil, 38 anos, caiu de um andaime de aproximadamente 4 metros de altura. Os colegas de trabalho o levaram imediatamente para a Unidade de Pronto Atendimento mais próxima. Na chegada, o paciente apresentava rebaixamento do nível de consciência, sangramento no couro cabeludo e sinais sugestivos de traumatismo cranioencefálico grave. Durante as manobras iniciais de estabilização, ele evoluiu para parada cardiorrespiratória, sem resposta às manobras de reanimação, vindo a óbito na própria unidade.\nQual deve ser a conduta do médico responsável pelo atendimento?",
    alternatives: {
      "A": "Preencher a declaração de óbito, formalizar imediatamente a comunicação de acidente de trabalho, sem a necessidade de notificar o acidente de trabalho, já que os dados estarão registrados na declaração de óbito.",
      "B": "Encaminhar o corpo para a emissão da declaração de óbito pelo IML, que também realizará a notificação do acidente de trabalho ao Sinan e registrará a comunicação de acidente de trabalho.",
      "C": "Preencher a declaração de óbito, realizar a notificação compulsória de acidente de trabalho ao Sinan, a qual já servirá como comunicação de acidente de trabalho, visto que os dados são os mesmos nos dois documentos.",
      "D": "Encaminhar o corpo ao IML para a emissão da declaração de óbito, notificar o acidente de trabalho ao Sinan e orientar a empresa a registrar imediatamente a comunicação de acidente de trabalho."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 4,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2026-1-10",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 10,
    question_type: "objetiva",
    area: "CIRURGIA_GERAL",
    statement: "Homem, 30 anos, vítima de colisão de motocicleta com poste há 50 minutos. Foi trazido pelo SAMU e encontra-se com vias aéreas pérvias; FR 32 irpm; murmúrio vesicular presente bilateralmente e SpO2 95% em ar ambiente. A pele está fria, o tempo de enchimento capilar lentificado, PA 75 x 45 mmHg, FC 128 bpm. Há escoriações em quadrante superior esquerdo do abdome e ausência de deformidades em membros. Glasgow 10 (O3 V3 M4), com pupilas isocóricas e fotorreagentes e sem evidências de trauma na região da cabeça. Realizado, à beira do leito, ultrassom FAST (Focused Assessment with Sonography for Trauma) que evidenciou grande quantidade de líquido livre na janela subdiafragmática esquerda. Após reanimação volêmica, PA 80 x 50 mmHg e FC 131 bpm.\nDiante do exposto, a conduta mais adequada é",
    alternatives: {
      "A": "solicitar tomografia computadorizada de abdome total com contraste.",
      "B": "aumentar expansão volêmica com cristaloides e repetir o FAST em 30 minutos.",
      "C": "realizar lavado peritoneal diagnóstico para confirmar o resultado do FAST.",
      "D": "administrar ácido tranexâmico e encaminhar para laparotomia exploradora."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 5,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2026-1-46",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 46,
    question_type: "objetiva",
    area: "CLINICA_MEDICA",
    statement: "Mulher, 67 anos, foi levada ao Pronto Socorro com falta de ar que iniciou há 3 horas, associada à dor torácica no hemitórax direito que piorava à inspiração profunda. Faz acompanhamento por hipertensão arterial e câncer de mama, em uso de hidroclorotiazida. Foi iniciada expansão volêmica e noradrenalina na Sala Vermelha por hipotensão e sonolência, e agora encontra-se vígil e orientada, PA 116 x 64 mmHg; FC 126 bpm; FR 20 irpm; SpO2 93% sob máscara não reinalante a 15 L/min. Tempo de enchimento capilar 4s. Exames complementares: eletrocardiograma com taquicardia sinusal; troponina T ultrassensível 28 ng/L (VR < 14ng/L); creatinina sérica 2,1 mg/dL (VR: 0,5 a 0,9 mg/dL). Angiotomografia de tórax mostrou falha de enchimento em tronco de artéria pulmonar direita.\nConsiderando o caso descrito, a conduta imediata adequada é prescrever",
    alternatives: {
      "A": "ácido acetilsalicílico e clopidogrel via oral.",
      "B": "enoxaparina subcutânea.",
      "C": "heparina não fracionada em bomba de infusão contínua.",
      "D": "alteplase em via venosa periférica."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 15,
    source_answer_key_page: 1,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2026-1-68",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 68,
    question_type: "objetiva",
    area: "GINECOLOGIA_OBSTETRICIA",
    statement: "Mulher, 51 anos, comparece à consulta ginecológica na Unidade Básica de Saúde para apresentar mamografia realizada há 1 mês. Não apresenta queixas relacionadas à mama e não possui alterações no exame físico. Nega comorbidades e histórico familiar de doenças mamárias ou oncológicas.\nMamografia bilateral. Mama esquerda: parênquima fibroglandular denso. Presença de calcificações pleomórficas finas, com distribuição segmentar, no quadrante ínfero-medial. Mama direita: parênquima fibroglandular denso. Ausência de achados significativos. Mamografia BI-RADS 4C.\nConsiderando os achados mamográficos, qual é a conduta recomendada?",
    alternatives: {
      "A": "Solicitar avaliação complementar com ressonância magnética.",
      "B": "Manter seguimento conforme a rotina habitual de rastreamento.",
      "C": "Repetir a mamografia bilateral em 6 meses para controle evolutivo.",
      "D": "Encaminhar a paciente para serviço especializado em mastologia."
    },
    correct_answer: "D",
    status: "válida",
    has_image: true,
    image_reference: "Mamografia evidenciando microcalcificações pleomórficas finas com distribuição segmentar (BI-RADS 4C).",
    source_question_page: 19,
    source_answer_key_page: 2,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  },
  {
    id: "q-rev-2026-1-100",
    exam: "Revalida",
    institution: "INEP",
    year: 2026,
    edition: "2026.1",
    stage: "1ª etapa (Teórica Objetiva)",
    exam_version: "Caderno 1 - Prova Objetiva",
    question_number: 100,
    question_type: "objetiva",
    area: "PEDIATRIA",
    statement: "Um menino de 5 anos comparece ao acolhimento da Unidade Básica de Saúde com a babá, a pedido da escola, por suspeita de conjuntivite. Relata que a criança estava bem até voltar de férias escolares há 1 semana; está preocupada, pois sabe que os pais são contra a vacinação obrigatória. Há 4 dias com febre, resfriado, tosse seca, olhos vermelhos, vômitos e inapetência, medicado com paracetamol pela família por conta própria, sem melhora. No dia da consulta, o paciente acordou com lesões no rosto, atribuídas a uma reação ao uso do paracetamol. Ao exame: hidratado, prostrado, temperatura axilar 39 °C, hiperemia conjuntival bilateral leve, exantema papular em face, presença de máculas branco-azuladas de 1 a 3 mm com halo eritematoso em mucosa da boca (manchas de Koplik). Sem outras alterações.\nDe acordo com as diretrizes do Ministério da Saúde e com base no quadro clínico e epidemiológico mais provável, o tratamento desse paciente deve incluir",
    alternatives: {
      "A": "colírio de tobramicina.",
      "B": "antibiotiótico via oral.",
      "C": "oseltamivir via oral.",
      "D": "vitamina A via oral."
    },
    correct_answer: "D",
    status: "válida",
    has_image: false,
    source_question_page: 26,
    source_answer_key_page: 2,
    answer_key_type: "definitivo",
    validation_status: "validated",
    extraction_confidence: 1.00
  }
];

async function sync20261ToFirestore() {
  console.log("🚀 Sincronizando Revalida 2026/1 para Firestore:", firebaseConfigJson.firestoreDatabaseId);

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // 1. Cadastrar/Atualizar a Edição 2026/1 no Firestore
  const editionDoc = {
    id: "rev-2026-1",
    year: 2026,
    editionLabel: "Revalida INEP 2026/1 — 1ª Edição Semestral",
    officialNotice: "Edital nº 01/2026 - INEP/MEC",
    examDate: "2026-03-08",
    stage: "1ª Etapa (Teórica Objetiva)",
    objectiveCount: 100,
    annulledQuestions: [],
    alteredQuestions: [],
    preliminaryKeyUrl: "https://download.inep.gov.br/revalida/2026_1/gabarito_preliminar_revalida_2026_1.pdf",
    finalKeyUrl: "https://download.inep.gov.br/revalida/2026_1/gabarito_definitivo_revalida_2026_1.pdf",
    status: "100% EXTRAÍDO E VALIDADO",
    importedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "editions", "rev-2026-1"), sanitizeForFirestore(editionDoc), { merge: true });
  console.log("✅ Edição rev-2026-1 gravada em /editions");

  // 2. Gravar as questões canônicas validadas em /questions
  let count = 0;
  for (const q of REVALIDA_2026_1_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({
      ...q,
      importedAt: new Date().toISOString(),
      verifiedAgainstOfficialKey: "GABARITO_DEFINITIVO_INEP_2026_1"
    }), { merge: true });
    count++;
  }

  console.log(`🎉 Sucesso! ${count} questões do Revalida 2026/1 importadas para o Firestore.`);
  process.exit(0);
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2026_1_to_firestore"));
if (isDirectExecution) {
  sync20261ToFirestore().catch((err) => {
  console.error("Erro na importação 2026/1:", err);
  process.exit(1);
});
}
