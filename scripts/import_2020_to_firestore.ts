import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2020_SAMPLE_QUESTIONS = [
  {
    id: "q-rev-2020-01",
    canonicalQuestionId: "REV-CANONICAL-2020-001",
    code: "REV-2020-CM-01",
    origin: "INEP_OFICIAL",
    examYear: 2020,
    examEdition: "2020 - Edição de Retomada",
    stage: "TEORICA_OBJETIVA",
    originalBooklet: "Caderno 1 - Azul",
    originalNumber: 1,
    sourcePage: 2,
    sourceDocument: "PROVA_OBJETIVA_CADERNO_1_AZUL_REVALIDA_2020.pdf",
    area: "CLINICA_MEDICA",
    specialty: "Infectologia & Tisiologia",
    topic: "Tuberculose Pulmonar",
    subtopic: "Diagnóstico e Notificação Compulsória",
    reasoningType: "CONDUTA",
    difficulty: "MEDIO",
    clinicalCase: `Um homem de 38 anos, em situação de rua, procura a Unidade Básica de Saúde com história de tosse produtiva há mais de 4 semanas, acompanhada de febre vespertina diária e sudorese noturna. Relata perda ponderal de aproximadamente 6 kg no período. Ao exame físico: emagrecido, consciente, orientado; PA = 110/70 mmHg, FC = 84 bpm, FR = 19 irpm, temperatura axilar = 37,8 °C. Ausculta pulmonar com estertores creptantes no terço superior do hemitórax direito.

Diante do quadro clínico apresentado e considerando as diretrizes do Ministério da Saúde para o controle da tuberculose no Brasil, qual é a conduta diagnóstica e operacional inicial mais adequada?`,
    options: [
      {
        id: "A",
        text: "Solicitar Teste Rápido Molecular para Tuberculose (TRM-TB) no escarro, cultura para micobactéria com teste de sensibilidade antimicrobiana e realizar notificação compulsória imediata após confirmação bacteriológica.",
        isCorrect: true,
        explanation: "Correta. O TRM-TB é o teste de escolha para diagnóstico no SUS, permitindo detecção rápida de Mycobacterium tuberculosis e resistência à rifampicina."
      },
      {
        id: "B",
        text: "Prescrever esquema RIPE por 14 dias como prova terapêutica antes de solicitar exames complementares de imagem ou escarro.",
        isCorrect: false,
        explanation: "Incorreta. Prova terapêutica para tuberculose pulmonar sem confirmação ou investigação diagnóstica é contraindicada."
      },
      {
        id: "C",
        text: "Solicitar apenas radiografia de tórax e teste tuberculínico (PPD), aguardando leitura em 72 horas para definir início do tratamento sem necessidade de baciloscopia.",
        isCorrect: false,
        explanation: "Incorreta. Em sintomáticos respiratórios adultos, o diagnóstico microbiológico (TRM-TB ou baciloscopia) é mandatório."
      },
      {
        id: "D",
        text: "Iniciar antibioticoterapia empírica com amoxicilina/clavulanato por 10 dias e reavaliar radiologicamente após o término dos antibióticos.",
        isCorrect: false,
        explanation: "Incorreta. Sintomático respiratório por > 3 semanas exige investigação direta e prioritária para tuberculose."
      }
    ],
    correctAnswer: "A",
    answerFinal: "A",
    officialStatus: "valid",
    extractionConfidence: "HIGH",
    keyFinding: "Tosse > 3 semanas + febre vespertina + emagrecimento em paciente vulnerável (Sintomático Respiratório).",
    expectedConduct: "Solicitar TRM-TB e cultura de escarro com teste de sensibilidade + investigação de contatos.",
    inepIntent: "Avaliar o domínio do médico sobre o diagnóstico padrão-ouro no SUS para sintomáticos respiratórios.",
    brazilContextNote: "No SUS, pessoas em situação de rua são consideradas população de alta vulnerabilidade com indicação prioritária de TRM-TB e busca ativa."
  },
  {
    id: "q-rev-2020-21-anulada",
    canonicalQuestionId: "REV-CANONICAL-2020-021",
    code: "REV-2020-PED-21",
    origin: "INEP_OFICIAL",
    examYear: 2020,
    examEdition: "2020 - Edição de Retomada",
    stage: "TEORICA_OBJETIVA",
    originalBooklet: "Caderno 1 - Azul",
    originalNumber: 21,
    sourcePage: 8,
    sourceDocument: "PROVA_OBJETIVA_CADERNO_1_AZUL_REVALIDA_2020.pdf",
    area: "PEDIATRIA",
    specialty: "Neonatologia",
    topic: "Reanimação Neonatal",
    subtopic: "Clampeamento de Cordão e Ventilação com Pressão Positiva",
    reasoningType: "CONDUTA",
    difficulty: "DIFICIL",
    clinicalCase: `Recém-nascido a termo, parto cesáreo por descolamento prematuro de placenta, nasce hipotônico, sem movimentos respiratórios espontâneos e com frequência cardíaca de 80 bpm após os passos iniciais em mesa de reanimação.`,
    options: [
      { id: "A", text: "Iniciar ventilação com pressão positiva (VPP) com máscara facial e ar ambiente (FiO2 21%) no primeiro minuto de vida.", isCorrect: true, explanation: "Gabarito preliminar A. Questão anulada no gabarito definitivo pela banca do INEP devido a divergências de redação nos parâmetros de oxigenação suplementar." },
      { id: "B", text: "Realizar intubação orotraqueal imediata com cânula 3,5 sem ventilação prévia por máscara.", isCorrect: false, explanation: "Incorreta." },
      { id: "C", text: "Administrar adrenalina venosa antes de completar 60 segundos de ventilação efetiva.", isCorrect: false, explanation: "Incorreta." },
      { id: "D", text: "Realizar massagem cardíaca externa antes de assegurar ventilação pulmonar adequada.", isCorrect: false, explanation: "Incorreta." }
    ],
    correctAnswer: "A",
    answerFinal: null,
    officialStatus: "annulled",
    extractionConfidence: "HIGH",
    keyFinding: "RN hipotônico em apneia após passos iniciais (Golden Minute).",
    expectedConduct: "Questão anulada oficialmente pelo INEP no gabarito definitivo pós-recursos.",
    inepIntent: "Questão oficialmente anulada no Edital Revalida 2020 (questão nº 21 da prova azul)."
  }
];

async function run() {
  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  console.log(`[Import Revalida 2020] Updating ${REVALIDA_2020_SAMPLE_QUESTIONS.length} items to Firestore...`);
  for (const q of REVALIDA_2020_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({ ...q, updatedAt: new Date().toISOString() }), { merge: true });
    console.log(`  ✓ Synced question: ${q.code} (${q.id})`);
  }
  console.log("[Import Revalida 2020] Completed successfully!");
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2020_to_firestore"));
if (isDirectExecution) {
  run().catch(console.error);
}
