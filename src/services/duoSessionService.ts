import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { OSCEStation } from "../types";
import {
  DuoSession,
  DuoChecklistScore,
  DuoItemScoreStatus,
  DuoChatMessage,
  RadarPoolEntry,
} from "../types/duoSession";
import { SEED_OSCE_STATIONS } from "../data/osceStationsData";

const RADAR_POOL_COLLECTION = "radar_pool";
const DUO_SESSIONS_COLLECTION = "duo_sessions";

export class DuoSessionService {
  /**
   * Enter the active matchmaking radar pool
   */
  static async joinRadarPool(
    user: { id: string; name: string; university?: string; targetEdition?: string },
    targetStationId?: string
  ): Promise<void> {
    if (!user.id) return;
    try {
      const poolRef = doc(db, RADAR_POOL_COLLECTION, user.id);
      const entry: RadarPoolEntry = {
        userId: user.id,
        name: user.name || "Dr(a). Candidato(a)",
        university: user.university || "Médico(a) Revalidando",
        targetEdition: user.targetEdition || "Revalida INEP",
        targetStationId: targetStationId || SEED_OSCE_STATIONS[0]?.id,
        status: "SEARCHING",
        joinedAt: new Date().toISOString(),
      };
      await setDoc(poolRef, entry);
    } catch (e) {
      console.warn("[DuoSessionService] joinRadarPool error:", e);
    }
  }

  /**
   * Leave the radar pool
   */
  static async leaveRadarPool(userId: string): Promise<void> {
    if (!userId) return;
    try {
      const poolRef = doc(db, RADAR_POOL_COLLECTION, userId);
      await deleteDoc(poolRef);
    } catch (e) {
      console.warn("[DuoSessionService] leaveRadarPool error:", e);
    }
  }

  /**
   * Listen for matches in the radar pool
   */
  static subscribeToRadarPool(
    userId: string,
    onMatchFound: (session: DuoSession) => void
  ): () => void {
    if (!userId) return () => {};

    try {
      const poolCol = collection(db, RADAR_POOL_COLLECTION);
      
      // 1. Listen to user's own status
      const myDocRef = doc(db, RADAR_POOL_COLLECTION, userId);
      const unsubMyDoc = onSnapshot(myDocRef, async (snap) => {
        if (!snap.exists()) return;
        const myData = snap.data() as RadarPoolEntry;
        if (myData.status === "MATCHED" && myData.matchedSessionId) {
          const session = await this.getDuoSession(myData.matchedSessionId);
          if (session) {
            onMatchFound(session);
          }
        }
      });

      // 2. Look for potential partner in pool
      const q = query(poolCol, where("status", "==", "SEARCHING"));
      const unsubPool = onSnapshot(q, async (snap) => {
        // Find other candidate
        const candidates: RadarPoolEntry[] = [];
        snap.forEach((d) => {
          if (d.id !== userId) {
            candidates.push(d.data() as RadarPoolEntry);
          }
        });

        if (candidates.length > 0) {
          // Check if I am still searching
          const mySnap = await getDoc(myDocRef).catch(() => null);
          if (mySnap && mySnap.exists() && mySnap.data().status === "SEARCHING") {
            const partner = candidates[0];
            const partnerRef = doc(db, RADAR_POOL_COLLECTION, partner.userId);

            // Deterministic pairing based on lexical sort of user IDs
            if (userId < partner.userId) {
              const station =
                SEED_OSCE_STATIONS.find((s) => s.id === partner.targetStationId) ||
                SEED_OSCE_STATIONS[0];

              const session = await this.createDuoSession(
                station,
                { id: userId, name: mySnap.data().name },
                { id: partner.userId, name: partner.name }
              );

              // Update both entries to MATCHED
              await updateDoc(myDocRef, {
                status: "MATCHED",
                matchedSessionId: session.id,
                matchedPartnerName: partner.name,
              }).catch(() => {});

              await updateDoc(partnerRef, {
                status: "MATCHED",
                matchedSessionId: session.id,
                matchedPartnerName: mySnap.data().name,
              }).catch(() => {});

              onMatchFound(session);
            }
          }
        }
      });

      return () => {
        unsubMyDoc();
        unsubPool();
      };
    } catch (e) {
      console.warn("[DuoSessionService] subscribeToRadarPool error:", e);
      return () => {};
    }
  }

  /**
   * Create a new Duo Training Session
   */
  static async createDuoSession(
    station: OSCEStation,
    doctor: { id: string; name: string },
    evaluator: { id: string; name: string }
  ): Promise<DuoSession> {
    const sessionId = `duo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build initial checklist scores
    const initialScores: Record<string, DuoChecklistScore> = {};
    let totalMaxScore = 0;

    station.checklist.forEach((item) => {
      totalMaxScore += item.points;
      initialScores[item.id] = {
        itemId: item.id,
        itemDescription: item.description,
        status: "UNCHECKED",
        pointsAwarded: 0,
        maxPoints: item.points,
      };
    });

    const initialSession: DuoSession = {
      id: sessionId,
      stationId: station.id,
      stationTitle: station.title,
      stationArea: station.area,
      doctorUserId: doctor.id,
      doctorName: doctor.name,
      evaluatorUserId: evaluator.id,
      evaluatorName: evaluator.name,
      status: "LOBBY",
      timeLimitSeconds: station.timeLimitSeconds || 600,
      checklistScores: initialScores,
      totalScore: 0,
      maxScore: totalMaxScore || 10,
      chatMessages: [
        {
          id: `msg_${Date.now()}`,
          sender: "system",
          senderName: "StaziaMed Revalida",
          text: `Sessão de treino em dupla iniciada. Dr(a). ${doctor.name} atua como Médico(a) e Dr(a). ${evaluator.name} atua como Avaliador(a)/Paciente.`,
          time: "00:00",
        },
      ],
      revealedExams: [],
      createdAt: new Date().toISOString(),
    };

    try {
      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      await setDoc(sessionRef, {
        ...initialSession,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[DuoSessionService] createDuoSession Firestore error, saving local:", e);
    }

    return initialSession;
  }

  /**
   * Retrieve a duo session by ID
   */
  static async getDuoSession(sessionId: string): Promise<DuoSession | null> {
    try {
      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      const snap = await getDoc(sessionRef);
      if (snap.exists()) {
        return snap.data() as DuoSession;
      }
    } catch (e) {
      console.warn("[DuoSessionService] getDuoSession error:", e);
    }
    return null;
  }

  /**
   * Subscribe to real-time session changes (checklist, messages, timer)
   */
  static subscribeToDuoSession(
    sessionId: string,
    onUpdate: (session: DuoSession) => void
  ): () => void {
    if (!sessionId) return () => {};

    try {
      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      return onSnapshot(
        sessionRef,
        (snap) => {
          if (snap.exists()) {
            onUpdate(snap.data() as DuoSession);
          }
        },
        (err) => {
          console.warn("[DuoSessionService] subscribeToDuoSession error:", err);
        }
      );
    } catch (e) {
      console.warn("[DuoSessionService] subscribeToDuoSession setup error:", e);
      return () => {};
    }
  }

  /**
   * Start the timer and consultation
   */
  static async startSession(sessionId: string): Promise<void> {
    try {
      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        status: "IN_PROGRESS",
        startedAt: Date.now(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[DuoSessionService] startSession error:", e);
    }
  }

  /**
   * Update scoring on an INEP checklist item in real time
   */
  static async updateChecklistScore(
    sessionId: string,
    itemId: string,
    status: DuoItemScoreStatus,
    maxPoints: number,
    notes?: string
  ): Promise<void> {
    try {
      const session = await this.getDuoSession(sessionId);
      if (!session) return;

      let pointsAwarded = 0;
      if (status === "ADEQUATE") pointsAwarded = maxPoints;
      else if (status === "PARTIAL") pointsAwarded = maxPoints / 2;

      const updatedScores = {
        ...session.checklistScores,
        [itemId]: {
          itemId,
          itemDescription: session.checklistScores[itemId]?.itemDescription || "",
          status,
          pointsAwarded,
          maxPoints,
          notes: notes ?? session.checklistScores[itemId]?.notes,
          scoredAt: new Date().toISOString(),
        },
      };

      const newTotalScore = Object.values(updatedScores).reduce(
        (acc, item) => acc + item.pointsAwarded,
        0
      );

      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        checklistScores: updatedScores,
        totalScore: Math.round(newTotalScore * 100) / 100,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[DuoSessionService] updateChecklistScore error:", e);
    }
  }

  /**
   * Reveal an exam or lab to the candidate
   */
  static async revealExam(sessionId: string, examName: string): Promise<void> {
    try {
      const session = await this.getDuoSession(sessionId);
      if (!session) return;

      if (session.revealedExams.includes(examName)) return;
      const updated = [...session.revealedExams, examName];

      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        revealedExams: updated,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[DuoSessionService] revealExam error:", e);
    }
  }

  /**
   * Send a chat or clinical dialogue message
   */
  static async sendChatMessage(
    sessionId: string,
    sender: "doctor" | "evaluator",
    senderName: string,
    text: string
  ): Promise<void> {
    try {
      const session = await this.getDuoSession(sessionId);
      if (!session) return;

      const newMsg: DuoChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender,
        senderName,
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        chatMessages: [...session.chatMessages, newMsg],
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[DuoSessionService] sendChatMessage error:", e);
    }
  }

  // Sem "inverter papéis" na mesma estação (decisão do dono de 17/10): o swapRoles saiu. O novo candidato já teria visto o tema
  // como avaliador da rodada anterior.

  /**
   * Finish the station session and lock checklist
   */
  static async finishSession(sessionId: string): Promise<void> {
    try {
      const sessionRef = doc(db, DUO_SESSIONS_COLLECTION, sessionId);
      await updateDoc(sessionRef, {
        status: "COMPLETED",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[DuoSessionService] finishSession error:", e);
    }
  }
}
