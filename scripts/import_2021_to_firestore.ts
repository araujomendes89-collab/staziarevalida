import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export const REVALIDA_2021_SAMPLE_QUESTIONS = [
  {
    id: "q-ped-01",
    canonicalQuestionId: "REV-CANONICAL-2021-019",
    code: "REV-2021-PED-19",
    origin: "INEP_OFICIAL",
    examYear: 2021,
    examEdition: "2021 - Edição Única",
    stage: "TEORICA_OBJETIVA",
    originalBooklet: "Caderno 1 - Azul",
    originalNumber: 19,
    sourcePage: 7,
    sourceDocument: "PROVA_OBJETIVA_CADERNO_1_AZUL_REVALIDA_2021.pdf",
    area: "PEDIATRIA",
    specialty: "Pneumologia Pediátrica & Emergência",
    topic: "Bronquiolite Viral Aguda (BVA)",
    subtopic: "Critérios de Gravidade e Manejo de Suporte",
    reasoningType: "CONDUTA",
    difficulty: "FACIL",
    clinicalCase: `Lactente de 4 meses de idade, previamente hígido e com vacinação em dia, é levado pela mãe à Unidade de Pronto Atendimento (UPA) com história de coriza hialina e tosse há 3 dias. Há 24 horas evoluiu com piora do padrão respiratório, cansaço às mamadas e febre de 38,1 °C. 

Ao exame físico: irritado, acianótico, afebril no momento; FR = 64 irpm, FC = 142 bpm, SatO2 = 91% em ar ambiente. Presença de tiragem subcostal moderada e batimento de asa de nariz. Ausculta pulmonar: tempo expiratório prolongado com sibilos difusos bilaterais e estertores subcrepitantes em bases. Ausculta cardíaca normal.

Considerando o diagnóstico mais provável de Bronquiolite Viral Aguda (BVA) e as diretrizes do Ministério da Saúde / Sociedade Brasileira de Pediatria, qual é a conduta terapêutica MAIS apropriada?`,
    options: [
      {
        id: "A",
        text: "Iniciar nebulização com Salbutamol a cada 20 minutos na primeira hora, associar Prednisolona 2 mg/kg/dia via oral por 5 dias e prescrever Azitromicina empírica.",
        isCorrect: false,
        explanation: "Incorreta. Corticoides sistêmicos, broncodilatadores de rotina e antibióticos não são recomendados na BVA típica."
      },
      {
        id: "B",
        text: "Indicar internação hospitalar para suporte ventilatório não invasivo com cânula nasal de alto fluxo (CNAF) ou oxigenioterapia por cateter nasal para manter SatO2 ≥ 92%, aspiração suave de vias aéreas superiores e hidratação adequada.",
        isCorrect: true,
        explanation: "Correta. O tratamento da BVA é estritamente de suporte: oxigenioterapia para hipoxemia (SatO2 < 92%), desobstrução nasal e manutenção hidroeletrolítica."
      },
      {
        id: "C",
        text: "Prescrever fisioterapia respiratória motora vigorosa com tapotagem 4 vezes ao dia e prescrever xarope antitussígeno com anti-histamínico para uso domiciliar.",
        isCorrect: false,
        explanation: "Incorreta. Fisioterapia respiratória convencional e antitussígenos são formalmente contraindicados em lactentes com BVA."
      },
      {
        id: "D",
        text: "Realizar teste terapêutico com adrenalina inalatória e liberar para o domicílio com prescrição de broncodilatador de longa ação caso ocorra melhora momentânea.",
        isCorrect: false,
        explanation: "Incorreta. A criança apresenta taquipneia importante, tiragem moderada e SatO2 91%, preenchendo critérios de internação hospitalar."
      }
    ],
    correctAnswer: "B",
    answerFinal: "B",
    officialStatus: "valid",
    extractionConfidence: "HIGH",
    keyFinding: "Lactente < 6 meses + pródromos virais + taquipneia + tiragem + SatO2 91% (Bronquiolite Viral Aguda moderada).",
    expectedConduct: "Internação para oxigenioterapia em cateter/CNAF + suporte hidroeletrolítico + higiene de vias aéreas.",
    inepIntent: "Verificar se o candidato evita a polifarmácia (não prescreve corticoide, antibiótico ou beta-2 agonista indiscriminadamente na BVA)."
  },
  {
    id: "q-cir-02",
    canonicalQuestionId: "REV-CANONICAL-2021-042",
    code: "REV-2021-CIR-42",
    origin: "INEP_OFICIAL",
    examYear: 2021,
    examEdition: "2021 - Edição Única",
    stage: "TEORICA_OBJETIVA",
    originalBooklet: "Caderno 1 - Azul",
    originalNumber: 42,
    sourcePage: 14,
    sourceDocument: "PROVA_OBJETIVA_CADERNO_1_AZUL_REVALIDA_2021.pdf",
    area: "CIRURGIA_GERAL",
    specialty: "Cirurgia do Aparelho Digestivo & Emergência",
    topic: "Colecistite Aguda Litiásica",
    subtopic: "Critérios de Tokyo Guidelines e Indicação Cirúrgica",
    reasoningType: "CONDUTA",
    difficulty: "MEDIO",
    clinicalCase: `Mulher de 44 anos, multípara, procura o pronto-socorro cirúrgico com dor intensa e contínua em hipocôndrio direito iniciada há 36 horas, com irradiação para a escápula direita, associada a náuseas e dois episódios de vômitos alimentares. 

Ao exame físico: corada, hidratada, anictérica; PA = 130/80 mmHg, FC = 96 bpm, temperatura axilar = 38,2 °C. Abdome plano, doloroso à palpação no hipocôndrio direito, com interrupção súbita da inspiração profunda durante a palpação bimanual da área da vesícula biliar (Sinal de Murphy positivo). Exames laboratoriais: leucócitos = 14.800/mm³ (com 6% de bastões), bilirrubinas totais e enzimas canaliculares normais. A ultrassonografia de abdome superior revela vesícula biliar distendida, com espessamento parietal de 5,5 mm, sinal do duplo contorno, múltiplos cálculos móveis e presença de líquido perivesicular, sem dilatação das vias biliares intra ou extra-hepáticas.

Com base nos critérios diagnósticos das Diretrizes de Tokyo (Tokyo Guidelines) e no manejo cirúrgico preconizado, qual é a conduta definitiva indicada para esta paciente?`,
    options: [
      {
        id: "A",
        text: "Prescrever antibioticoterapia venosa, antiespasmódicos e programar colecistectomia eletiva ambulatorial após 8 a 12 semanas do esfriamento do processo inflamatório.",
        isCorrect: false,
        explanation: "Incorreta. A abordagem precoce (nas primeiras 72 horas a 7 dias) é padrão-ouro e reduz complicações cirúrgicas e tempo de internação."
      },
      {
        id: "B",
        text: "Indicar internação hospitalar, iniciar antibioticoterapia parenteral precoce e realizar Colecistectomia Videolaparoscópica de urgência/precoce durante a mesma internação.",
        isCorrect: true,
        explanation: "Correta. Colecistite aguda litiásica com menos de 72h-7 dias tem indicação formal de colecistectomia videolaparoscópica precoce na mesma internação hospitalar."
      },
      {
        id: "C",
        text: "Realizar punção percutânea trans-hepática da vesícula biliar (colecistostomia percutânea) como primeira escolha e alta em 24h.",
        isCorrect: false,
        explanation: "Incorreta. Colecistostomia percutânea é reservada para pacientes graves, instáveis ou de altíssimo risco cirúrgico (Tokyo Grau III ou comorbidades graves proibitivas)."
      },
      {
        id: "D",
        text: "Solicitar Colangiopancreatografia Retrógrada Endoscópica (CPRE) de urgência com papilotomia antes de qualquer intervenção cirúrgica.",
        isCorrect: false,
        explanation: "Incorreta. Não há evidência de coledocolitíase ou colangite (anictérica, vias biliares não dilatadas, sem indicação de CPRE prévia)."
      }
    ],
    correctAnswer: "B",
    answerFinal: "B",
    officialStatus: "valid",
    extractionConfidence: "HIGH",
    keyFinding: "Dor em HCD > 24h + Murphy positivo + Febre/Leucocitose + USG com vesícula espessada (Colecistite Aguda Grau I/II).",
    expectedConduct: "Internação + Antibioticoterapia + Colecistectomia Videolaparoscópica Precoce na mesma internação.",
    inepIntent: "Confirmar que o médico não adia desnecessariamente o tratamento cirúrgico definitivo da colecistite aguda precoce."
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

  console.log(`[Import Revalida 2021] Updating ${REVALIDA_2021_SAMPLE_QUESTIONS.length} items to Firestore...`);
  for (const q of REVALIDA_2021_SAMPLE_QUESTIONS) {
    const qRef = doc(db, "questions", q.id);
    await setDoc(qRef, sanitizeForFirestore({ ...q, updatedAt: new Date().toISOString() }), { merge: true });
    console.log(`  ✓ Synced question: ${q.code} (${q.id})`);
  }
  console.log("[Import Revalida 2021] Completed successfully!");
}

const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("import_2021_to_firestore"));
if (isDirectExecution) {
  run().catch(console.error);
}
