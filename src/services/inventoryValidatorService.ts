import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Question, RevalidaEditionInventory } from "../types";
import { REVALIDA_EDITIONS_INVENTORY, REVALIDA_GLOBAL_STATS } from "../data/revalidaInventoryData";

export interface EditionAuditItem {
  id: string;
  year: number;
  editionLabel: string;
  officialNotice: string;
  examDate: string;
  stage: string;
  objectiveCount: number;
  bookletsCount: number;
  localQuestionsCount: number;
  firestoreQuestionsCount: number;
  annulledExpected: number[];
  annulledFound: number[];
  alteredExpectedCount: number;
  isCompliant: boolean;
  status: "SYNCED" | "PARTIAL" | "OFFLINE_READY" | "PENDING_SYNC";
  notes: string;
}

export interface InventoryValidationResult {
  timestamp: string;
  totalEditions: number;
  totalExpectedQuestions: number;
  totalLocalQuestions: number;
  totalFirestoreQuestions: number;
  totalAnnulledAudited: number;
  totalAlteredAudited: number;
  editions: EditionAuditItem[];
  allEditionsCovered: boolean;
  isOnline: boolean;
}

function sanitizeForFirestore(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export class InventoryValidatorService {
  /**
   * Helper to determine if a question belongs to a specific edition inventory
   */
  static matchesEdition(q: any, ed: RevalidaEditionInventory): boolean {
    if (!q || !ed || !ed.id) return false;
    const qYear = q.examYear || q.year;
    const qEd = (q.examEdition || q.edition || "").toLowerCase();
    const qCode = (q.code || "").toLowerCase();
    const qId = (q.id || "").toLowerCase();

    if (ed.id === "enamed-2025") {
      return (
        qEd.includes("enamed") ||
        qCode.includes("enamed") ||
        qId.includes("enamed")
      );
    }

    if (ed.id === "rev-2020") {
      return (qYear === 2020 || qEd.includes("2020") || qCode.includes("2020")) && !qEd.includes("enamed");
    }

    if (ed.id === "rev-2021") {
      return (qYear === 2021 || qEd.includes("2021") || qCode.includes("2021")) && !qEd.includes("enamed");
    }

    if (ed.id === "rev-2022-1") {
      return (qYear === 2022 && (qEd.includes("2022/1") || qEd.includes("2022.1") || qEd.includes("1ª"))) || qCode.includes("2022.1") || qCode.includes("2022-1");
    }

    if (ed.id === "rev-2022-2") {
      return (qYear === 2022 && (qEd.includes("2022/2") || qEd.includes("2022.2") || qEd.includes("2ª"))) || qCode.includes("2022.2") || qCode.includes("2022-2");
    }

    if (ed.id === "rev-2023-1") {
      return (qYear === 2023 && (qEd.includes("2023/1") || qEd.includes("2023.1") || qEd.includes("1ª"))) || qCode.includes("2023.1") || qCode.includes("2023-1");
    }

    if (ed.id === "rev-2023-2") {
      return (qYear === 2023 && (qEd.includes("2023/2") || qEd.includes("2023.2") || qEd.includes("2ª"))) || qCode.includes("2023.2") || qCode.includes("2023-2");
    }

    if (ed.id === "rev-2024-1") {
      return (qYear === 2024 && (qEd.includes("2024/1") || qEd.includes("2024.1") || qEd.includes("1ª"))) || qCode.includes("2024.1") || qCode.includes("2024-1");
    }

    if (ed.id === "rev-2024-2") {
      return (qYear === 2024 && (qEd.includes("2024/2") || qEd.includes("2024.2") || qEd.includes("2ª"))) || qCode.includes("2024.2") || qCode.includes("2024-2");
    }

    if (ed.id === "rev-2025-1") {
      return (qYear === 2025 && (qEd.includes("2025/1") || qEd.includes("2025.1") || qEd.includes("1ª"))) || qCode.includes("2025.1") || qCode.includes("2025-1");
    }

    if (ed.id === "rev-2025-2") {
      return (qYear === 2025 && (qEd.includes("2025/2") || qEd.includes("2025.2") || qEd.includes("2ª"))) || qCode.includes("2025.2") || qCode.includes("2025-2");
    }

    if (ed.id === "rev-2026-1") {
      return (qYear === 2026 && (qEd.includes("2026/1") || qEd.includes("2026.1") || qEd.includes("1ª"))) || qCode.includes("2026.1") || qCode.includes("2026-1");
    }

    if (ed.id === "rev-2026-2") {
      return (
        qYear === 2026 &&
        (qEd.includes("2026/2") || qEd.includes("2026.2") || qEd.includes("2ª") || qEd.includes("inéditas") || qEd.includes("vigente") || qCode.includes("ined-2026"))
      );
    }

    return qYear === ed.year;
  }

  /**
   * Performs an audit of the inventory against both memory state and Firestore
   */
  static async auditAll(localQuestions: Question[]): Promise<InventoryValidationResult> {
    let firestoreQuestions: any[] = [];
    let isOnline = false;

    try {
      const qSnap = await getDocs(collection(db, "questions"));
      if (!qSnap.empty) {
        firestoreQuestions = qSnap.docs.map((d) => d.data());
        isOnline = true;
      }
    } catch (err) {
      console.warn("[InventoryValidatorService] Firestore query failed, falling back to local memory audit:", err);
    }

    const items: EditionAuditItem[] = REVALIDA_EDITIONS_INVENTORY.map((ed) => {
      const localMatches = localQuestions.filter((q) => this.matchesEdition(q, ed));
      const fsMatches = firestoreQuestions.filter((q) => this.matchesEdition(q, ed));

      const foundAnuladas = (fsMatches.length > 0 ? fsMatches : localMatches)
        .filter((q) => q.status === "anulada" || q.officialStatus === "annulled" || q.isAnnulled === true)
        .map((q) => q.originalNumber || q.question_number || 0)
        .filter((n) => n > 0);

      const isSynced = fsMatches.length > 0;
      let status: "SYNCED" | "PARTIAL" | "OFFLINE_READY" | "PENDING_SYNC" = "PENDING_SYNC";
      let notes = "Pronto para sincronização.";

      if (isSynced) {
        status = "SYNCED";
        notes = `${fsMatches.length} itens sincronizados no Firestore.`;
      } else if (localMatches.length > 0) {
        status = "OFFLINE_READY";
        notes = `${localMatches.length} itens disponíveis em memória local.`;
      }

      return {
        id: ed.id,
        year: ed.year,
        editionLabel: ed.editionLabel,
        officialNotice: ed.officialNotice,
        examDate: ed.examDate,
        stage: ed.stage,
        objectiveCount: ed.objectiveCount || 100,
        bookletsCount: ed.booklets?.length || 1,
        localQuestionsCount: localMatches.length,
        firestoreQuestionsCount: fsMatches.length,
        annulledExpected: ed.annulledQuestions || [],
        annulledFound: Array.from(new Set(foundAnuladas)),
        alteredExpectedCount: ed.alteredQuestions?.length || 0,
        isCompliant: localMatches.length > 0 || fsMatches.length > 0,
        status,
        notes,
      };
    });

    const totalExpected = REVALIDA_EDITIONS_INVENTORY.reduce((acc, ed) => acc + (ed.objectiveCount || 100), 0);
    const totalAnnulled = REVALIDA_EDITIONS_INVENTORY.reduce((acc, ed) => acc + (ed.annulledQuestions?.length || 0), 0);
    const totalAltered = REVALIDA_EDITIONS_INVENTORY.reduce((acc, ed) => acc + (ed.alteredQuestions?.length || 0), 0);

    return {
      timestamp: new Date().toISOString(),
      totalEditions: REVALIDA_EDITIONS_INVENTORY.length,
      totalExpectedQuestions: totalExpected,
      totalLocalQuestions: localQuestions.length,
      totalFirestoreQuestions: firestoreQuestions.length,
      totalAnnulledAudited: totalAnnulled,
      totalAlteredAudited: totalAltered,
      editions: items,
      allEditionsCovered: items.every((i) => i.isCompliant),
      isOnline,
    };
  }

  /**
   * Syncs all editions metadata and questions to Firestore in batch
   */
  static async syncAllToFirestore(localQuestions: Question[]): Promise<{
    success: boolean;
    syncedEditions: number;
    syncedQuestions: number;
    error?: string;
  }> {
    try {
      // 1. Sync Editions
      let eCount = 0;
      for (const ed of REVALIDA_EDITIONS_INVENTORY) {
        const edRef = doc(db, "editions", ed.id);
        await setDoc(edRef, sanitizeForFirestore({ ...ed, updatedAt: new Date().toISOString() }), { merge: true });
        eCount++;
      }

      // 2. Sync Questions
      let qCount = 0;
      for (const q of localQuestions) {
        const qRef = doc(db, "questions", q.id);
        await setDoc(qRef, sanitizeForFirestore({ ...q, syncedAt: new Date().toISOString() }), { merge: true });
        qCount++;
      }

      return {
        success: true,
        syncedEditions: eCount,
        syncedQuestions: qCount,
      };
    } catch (err: any) {
      console.error("[InventoryValidatorService] Sync error:", err);
      return {
        success: false,
        syncedEditions: 0,
        syncedQuestions: 0,
        error: err?.message || String(err),
      };
    }
  }
}
