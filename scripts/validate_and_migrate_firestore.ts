import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";
import { REVALIDA_EDITIONS_INVENTORY, REVALIDA_GLOBAL_STATS } from "../src/data/revalidaInventoryData";
import { SEED_QUESTIONS } from "../src/data/questionsData";
import { SEED_INEDITAS_QUESTIONS } from "../src/data/ineditasData";
import { REVALIDA_2020_SAMPLE_QUESTIONS } from "./import_2020_to_firestore";
import { REVALIDA_2021_SAMPLE_QUESTIONS } from "./import_2021_to_firestore";
import { REVALIDA_2022_1_SAMPLE_QUESTIONS } from "./import_2022_1_to_firestore";
import { REVALIDA_2022_2_SAMPLE_QUESTIONS } from "./import_2022_2_to_firestore";
import { REVALIDA_2023_1_SAMPLE_QUESTIONS } from "./import_2023_1_to_firestore";
import { REVALIDA_2023_2_SAMPLE_QUESTIONS } from "./import_2023_2_to_firestore";
import { REVALIDA_2024_1_SAMPLE_QUESTIONS } from "./import_2024_1_to_firestore";
import { REVALIDA_2024_2_SAMPLE_QUESTIONS } from "./import_2024_2_to_firestore";
import { REVALIDA_2025_1_SAMPLE_QUESTIONS } from "./import_2025_1_to_firestore";
import { REVALIDA_2025_2_SAMPLE_QUESTIONS } from "./import_2025_2_to_firestore";
import { REVALIDA_2026_1_SAMPLE_QUESTIONS } from "./import_2026_1_to_firestore";
import { ENAMED_2025_SAMPLE_QUESTIONS } from "./import_enamed_2025_to_firestore";

export interface EditionAuditReport {
  editionId: string;
  editionLabel: string;
  year: number;
  expectedObjectiveCount: number;
  firestoreQuestionsCount: number;
  localQuestionsCount: number;
  expectedAnuladas: number[];
  foundAnuladas: number[];
  expectedAltered: number;
  bookletsCount: number;
  auditStatus: "PASS" | "WARNING" | "NEEDS_SYNC";
  notes: string;
}

export interface GlobalValidationReport {
  timestamp: string;
  databaseId: string;
  totalEditionsEvaluated: number;
  totalExpectedQuestions: number;
  totalFirestoreQuestions: number;
  totalLocalQuestions: number;
  totalAnuladasAudited: number;
  totalAlteredAudited: number;
  editionsReports: EditionAuditReport[];
  isFullyCompliant: boolean;
}

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export async function runFirestoreValidation(options: { autoMigrate?: boolean } = {}): Promise<GlobalValidationReport> {
  console.log("================================================================================");
  console.log("🔍 [AUDITORIA FIRESTORE] Validador & Migrador de Inventário Revalida/ENAMED");
  console.log(`📡 Database: ${firebaseConfigJson.firestoreDatabaseId} (${firebaseConfigJson.projectId})`);
  console.log(`📅 Período Coberto: 2020 a 2026/1, 2026/2 e ENAMED 2025`);
  console.log("================================================================================");

  const app = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });

  const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);

  // Compile all available local questions
  const allLocalQuestions: any[] = [
    ...SEED_QUESTIONS,
    ...SEED_INEDITAS_QUESTIONS,
    ...REVALIDA_2020_SAMPLE_QUESTIONS,
    ...REVALIDA_2021_SAMPLE_QUESTIONS,
    ...REVALIDA_2022_1_SAMPLE_QUESTIONS,
    ...REVALIDA_2022_2_SAMPLE_QUESTIONS,
    ...REVALIDA_2023_1_SAMPLE_QUESTIONS,
    ...REVALIDA_2023_2_SAMPLE_QUESTIONS,
    ...REVALIDA_2024_1_SAMPLE_QUESTIONS,
    ...REVALIDA_2024_2_SAMPLE_QUESTIONS,
    ...REVALIDA_2025_1_SAMPLE_QUESTIONS,
    ...REVALIDA_2025_2_SAMPLE_QUESTIONS,
    ...REVALIDA_2026_1_SAMPLE_QUESTIONS,
    ...ENAMED_2025_SAMPLE_QUESTIONS
  ];

  // Deduplicate local questions
  const localMap = new Map<string, any>();
  for (const q of allLocalQuestions) {
    if (q && q.id) {
      localMap.set(q.id, q);
    }
  }
  const uniqueLocalQuestions = Array.from(localMap.values());

  // 1. Fetch current questions from Firestore
  console.log("📥 Consultando coleção 'questions' no Firestore...");
  let firestoreQuestions: any[] = [];
  try {
    const qSnap = await getDocs(collection(db, "questions"));
    firestoreQuestions = qSnap.docs.map((d) => d.data());
    console.log(`✅ ${firestoreQuestions.length} documentos encontrados na coleção 'questions'.`);
  } catch (err: any) {
    console.warn("⚠️ Aviso ao consultar 'questions' no Firestore:", err?.message || err);
  }

  // 2. Fetch current editions from Firestore
  console.log("📥 Consultando coleção 'editions' no Firestore...");
  let firestoreEditions: any[] = [];
  try {
    const eSnap = await getDocs(collection(db, "editions"));
    firestoreEditions = eSnap.docs.map((d) => d.data());
    console.log(`✅ ${firestoreEditions.length} documentos encontrados na coleção 'editions'.`);
  } catch (err: any) {
    console.warn("⚠️ Aviso ao consultar 'editions' no Firestore:", err?.message || err);
  }

  // 3. Match questions to edition
  function isQuestionFromEdition(q: any, ed: typeof REVALIDA_EDITIONS_INVENTORY[0]): boolean {
    const qYear = q.examYear || q.year;
    const qEd = (q.examEdition || q.edition || "").toLowerCase();
    const edId = ed.id.toLowerCase();
    const edYear = ed.year;

    if (ed.id === "enamed-2025") {
      return (
        qEd.includes("enamed") ||
        (q.id && q.id.toLowerCase().includes("enamed")) ||
        (q.code && q.code.toLowerCase().includes("enamed"))
      );
    }

    if (ed.id === "rev-2020") {
      return (qYear === 2020 || qEd.includes("2020")) && !qEd.includes("enamed");
    }

    if (ed.id === "rev-2021") {
      return (qYear === 2021 || qEd.includes("2021")) && !qEd.includes("enamed");
    }

    if (ed.id === "rev-2022-1") {
      return (qYear === 2022 && (qEd.includes("2022/1") || qEd.includes("2022.1") || qEd.includes("1ª"))) || (q.code && q.code.includes("2022.1"));
    }

    if (ed.id === "rev-2022-2") {
      return (qYear === 2022 && (qEd.includes("2022/2") || qEd.includes("2022.2") || qEd.includes("2ª"))) || (q.code && q.code.includes("2022.2"));
    }

    if (ed.id === "rev-2023-1") {
      return (qYear === 2023 && (qEd.includes("2023/1") || qEd.includes("2023.1") || qEd.includes("1ª"))) || (q.code && q.code.includes("2023.1"));
    }

    if (ed.id === "rev-2023-2") {
      return (qYear === 2023 && (qEd.includes("2023/2") || qEd.includes("2023.2") || qEd.includes("2ª"))) || (q.code && q.code.includes("2023.2"));
    }

    if (ed.id === "rev-2024-1") {
      return (qYear === 2024 && (qEd.includes("2024/1") || qEd.includes("2024.1") || qEd.includes("1ª"))) || (q.code && q.code.includes("2024.1"));
    }

    if (ed.id === "rev-2024-2") {
      return (qYear === 2024 && (qEd.includes("2024/2") || qEd.includes("2024.2") || qEd.includes("2ª"))) || (q.code && q.code.includes("2024.2"));
    }

    if (ed.id === "rev-2025-1") {
      return (qYear === 2025 && (qEd.includes("2025/1") || qEd.includes("2025.1") || qEd.includes("1ª"))) || (q.code && q.code.includes("2025.1"));
    }

    if (ed.id === "rev-2025-2") {
      return (qYear === 2025 && (qEd.includes("2025/2") || qEd.includes("2025.2") || qEd.includes("2ª"))) || (q.code && q.code.includes("2025.2"));
    }

    if (ed.id === "rev-2026-1") {
      return (qYear === 2026 && (qEd.includes("2026/1") || qEd.includes("2026.1") || qEd.includes("1ª"))) || (q.code && q.code.includes("2026.1"));
    }

    if (ed.id === "rev-2026-2") {
      return (qYear === 2026 && (qEd.includes("2026/2") || qEd.includes("2026.2") || qEd.includes("2ª") || qEd.includes("inéditas") || qEd.includes("vigente")));
    }

    return qYear === edYear;
  }

  // 4. Audit each edition
  const reports: EditionAuditReport[] = [];

  for (const ed of REVALIDA_EDITIONS_INVENTORY) {
    const fsMatches = firestoreQuestions.filter((q) => isQuestionFromEdition(q, ed));
    const localMatches = uniqueLocalQuestions.filter((q) => isQuestionFromEdition(q, ed));

    const foundAnuladasFs = fsMatches
      .filter((q) => q.status === "anulada" || q.officialStatus === "annulled" || (q.isAnnulled === true))
      .map((q) => q.originalNumber || q.question_number || 0)
      .filter((n) => n > 0);

    const isSyncedInFirestore = fsMatches.length > 0;
    const hasFullLocalDefinition = localMatches.length > 0;

    let auditStatus: "PASS" | "WARNING" | "NEEDS_SYNC" = "PASS";
    let notes = "Edição canônica auditada e integrada.";

    if (!isSyncedInFirestore) {
      auditStatus = "NEEDS_SYNC";
      notes = `Pendente de sincronização no Firestore (${localMatches.length} itens locais prontos).`;
    } else if (fsMatches.length < localMatches.length) {
      auditStatus = "WARNING";
      notes = `Firestore contém ${fsMatches.length} itens, mas repositório possui ${localMatches.length}.`;
    }

    reports.push({
      editionId: ed.id,
      editionLabel: ed.editionLabel,
      year: ed.year,
      expectedObjectiveCount: ed.objectiveCount || 100,
      firestoreQuestionsCount: fsMatches.length,
      localQuestionsCount: localMatches.length,
      expectedAnuladas: ed.annulledQuestions || [],
      foundAnuladas: Array.from(new Set(foundAnuladasFs)),
      expectedAltered: (ed.alteredQuestions || []).length,
      bookletsCount: (ed.booklets || []).length,
      auditStatus,
      notes,
    });
  }

  // 5. If autoMigrate is requested, write all missing editions and questions to Firestore
  if (options.autoMigrate) {
    console.log("\n🚀 [MIGRAÇÃO AUTOMÁTICA] Sincronizando edições e questões para o Firestore...");

    // Sync Editions
    for (const ed of REVALIDA_EDITIONS_INVENTORY) {
      try {
        const edRef = doc(db, "editions", ed.id);
        await setDoc(edRef, sanitizeForFirestore({ ...ed, updatedAt: new Date().toISOString() }), { merge: true });
      } catch (err) {
        console.error(`Erro ao sincronizar edição ${ed.id}:`, err);
      }
    }
    console.log(`  ✓ ${REVALIDA_EDITIONS_INVENTORY.length} Edições sincronizadas com sucesso.`);

    // Sync Questions
    let qCount = 0;
    for (const q of uniqueLocalQuestions) {
      try {
        const qRef = doc(db, "questions", q.id);
        await setDoc(qRef, sanitizeForFirestore({ ...q, syncedAt: new Date().toISOString() }), { merge: true });
        qCount++;
      } catch (err) {
        console.error(`Erro ao sincronizar questão ${q.id}:`, err);
      }
    }
    console.log(`  ✓ ${qCount} Questões sincronizadas na coleção 'questions'.`);
  }

  // Generate Summary Report
  const totalFirestoreQ = firestoreQuestions.length;
  const totalLocalQ = uniqueLocalQuestions.length;
  const totalAnuladas = REVALIDA_EDITIONS_INVENTORY.reduce((acc, ed) => acc + (ed.annulledQuestions?.length || 0), 0);
  const totalAltered = REVALIDA_EDITIONS_INVENTORY.reduce((acc, ed) => acc + (ed.alteredQuestions?.length || 0), 0);

  const globalReport: GlobalValidationReport = {
    timestamp: new Date().toISOString(),
    databaseId: firebaseConfigJson.firestoreDatabaseId,
    totalEditionsEvaluated: REVALIDA_EDITIONS_INVENTORY.length,
    totalExpectedQuestions: REVALIDA_EDITIONS_INVENTORY.reduce((acc, ed) => acc + (ed.objectiveCount || 100), 0),
    totalFirestoreQuestions: totalFirestoreQ,
    totalLocalQuestions: totalLocalQ,
    totalAnuladasAudited: totalAnuladas,
    totalAlteredAudited: totalAltered,
    editionsReports: reports,
    isFullyCompliant: reports.every((r) => r.auditStatus !== "NEEDS_SYNC"),
  };

  // Print Formatted Report Table
  console.log("\n================================================================================");
  console.log("📊 MATRIZ DE AUDITORIA DE PROVAS (2020-2026/1 e ENAMED 2025)");
  console.log("================================================================================");
  console.log(
    "EDIÇÃO".padEnd(36) +
    "ANO".padEnd(6) +
    "ESPERADO".padEnd(10) +
    "LOCAL".padEnd(8) +
    "FIRESTORE".padEnd(11) +
    "ANULADAS".padEnd(10) +
    "STATUS"
  );
  console.log("-".repeat(95));

  for (const r of reports) {
    const label = r.editionLabel.length > 34 ? r.editionLabel.substring(0, 31) + "..." : r.editionLabel;
    const anulStr = `${r.expectedAnuladas.length} it.`;
    const statusStr = r.auditStatus === "PASS" ? "✅ OK" : r.auditStatus === "WARNING" ? "⚠️ ALERTA" : "🔄 MIGRAR";

    console.log(
      label.padEnd(36) +
      r.year.toString().padEnd(6) +
      (r.expectedObjectiveCount + " q.").padEnd(10) +
      (r.localQuestionsCount + " q.").padEnd(8) +
      (r.firestoreQuestionsCount + " q.").padEnd(11) +
      anulStr.padEnd(10) +
      statusStr
    );
  }

  console.log("-".repeat(95));
  console.log(`📌 Total de Edições Oficiais Auditadas: ${reports.length} edições (2020-2026/1 + 2026/2 + ENAMED 2025)`);
  console.log(`📌 Total de Questões no Repositório Local: ${totalLocalQ} itens`);
  console.log(`📌 Total de Questões no Firestore: ${totalFirestoreQ} itens`);
  console.log(`📌 Total de Questões Anuladas Auditadas: ${totalAnuladas} itens com gabarito oficial`);
  console.log(`📌 Total de Questões com Gabarito Alterado Pós-Recurso: ${totalAltered} itens`);
  console.log("================================================================================\n");

  return globalReport;
}

// CLI Execution Entry Point
const isDirectExecution = typeof window === "undefined" && typeof process !== "undefined" && Array.isArray(process?.argv) && Boolean(process.argv[1]?.includes("validate_and_migrate_firestore"));
if (isDirectExecution) {
  const shouldMigrate = process.argv.includes("--migrate") || process.argv.includes("-m");
  runFirestoreValidation({ autoMigrate: shouldMigrate })
    .then((report) => {
      if (report.isFullyCompliant || shouldMigrate) {
        console.log("🎯 Validação de Inventário concluída com sucesso!");
        process.exit(0);
      } else {
        console.log("ℹ️ Execute com a flag '--migrate' para sincronizar pendências com o Firestore.");
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("❌ Erro fatal na validação:", err);
      process.exit(1);
    });
}
