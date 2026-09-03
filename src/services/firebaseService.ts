import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import {
  UserProfile,
  UserProfileDoc,
  TrainingSessionDoc,
  UserProgressDoc,
  ErrorAutopsyDoc,
  StudyMission,
  KnowledgeNode,
  QuestionAttempt,
  Question,
  ErrorTaxonomy,
} from "../types";

export class FirebaseService {
  // -------------------------------------------------------------
  // QUESTIONS COLLECTION (/questions/{questionId})
  // -------------------------------------------------------------
  static async saveQuestion(question: Question): Promise<void> {
    try {
      const qRef = doc(db, "questions", question.id);
      const sanitized = JSON.parse(JSON.stringify(question, (_, v) => (v === undefined ? null : v)));
      await setDoc(qRef, { ...sanitized, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.warn("[FirebaseService] Error saving question:", err);
    }
  }

  static async getQuestions(): Promise<Question[]> {
    try {
      const questionsRef = collection(db, "questions");
      const querySnap = await getDocs(questionsRef);
      if (querySnap.empty) return [];
      return querySnap.docs.map((d) => d.data() as Question);
    } catch (err) {
      console.warn("[FirebaseService] Error fetching questions:", err);
      return [];
    }
  }

  // -------------------------------------------------------------
  // FULL DATABASE IMPORT & SYNC
  // -------------------------------------------------------------
  static async importAllData(data: {
    questions: Question[];
    guidelines?: any[];
    editions?: any[];
    osceStations?: any[];
    knowledgeNodes?: any[];
    userProfile?: UserProfile;
  }): Promise<{
    success: boolean;
    questionsCount: number;
    guidelinesCount: number;
    editionsCount: number;
    osceCount: number;
    nodesCount: number;
    error?: string;
  }> {
    try {
      let qCount = 0;
      let gCount = 0;
      let eCount = 0;
      let oCount = 0;
      let nCount = 0;

      // 1. Questions
      if (data.questions && data.questions.length > 0) {
        for (const q of data.questions) {
          const qRef = doc(db, "questions", q.id);
          const sanitized = JSON.parse(JSON.stringify(q, (_, v) => (v === undefined ? null : v)));
          await setDoc(qRef, { ...sanitized, syncedAt: new Date().toISOString() }, { merge: true });
          qCount++;
        }
      }

      // 2. Guidelines
      if (data.guidelines && data.guidelines.length > 0) {
        for (const g of data.guidelines) {
          const gRef = doc(db, "guidelines", g.id);
          const sanitized = JSON.parse(JSON.stringify(g, (_, v) => (v === undefined ? null : v)));
          await setDoc(gRef, { ...sanitized, syncedAt: new Date().toISOString() }, { merge: true });
          gCount++;
        }
      }

      // 3. Editions
      if (data.editions && data.editions.length > 0) {
        for (const ed of data.editions) {
          const edRef = doc(db, "editions", ed.id);
          const sanitized = JSON.parse(JSON.stringify(ed, (_, v) => (v === undefined ? null : v)));
          await setDoc(edRef, { ...sanitized, syncedAt: new Date().toISOString() }, { merge: true });
          eCount++;
        }
      }

      // 4. OSCE
      if (data.osceStations && data.osceStations.length > 0) {
        for (const osce of data.osceStations) {
          const oRef = doc(db, "osce_stations", osce.id);
          const sanitized = JSON.parse(JSON.stringify(osce, (_, v) => (v === undefined ? null : v)));
          await setDoc(oRef, { ...sanitized, syncedAt: new Date().toISOString() }, { merge: true });
          oCount++;
        }
      }

      // 5. Knowledge Nodes
      if (data.knowledgeNodes && data.knowledgeNodes.length > 0) {
        for (const node of data.knowledgeNodes) {
          const nRef = doc(db, "knowledge_nodes", node.id);
          const sanitized = JSON.parse(JSON.stringify(node, (_, v) => (v === undefined ? null : v)));
          await setDoc(nRef, { ...sanitized, syncedAt: new Date().toISOString() }, { merge: true });
          nCount++;
        }
      }

      // 6. User Profile
      if (data.userProfile) {
        const uRef = doc(db, "users", data.userProfile.id);
        const sanitized = JSON.parse(JSON.stringify(data.userProfile, (_, v) => (v === undefined ? null : v)));
        await setDoc(uRef, { ...sanitized, updatedAt: new Date().toISOString() }, { merge: true });
      }

      return {
        success: true,
        questionsCount: qCount,
        guidelinesCount: gCount,
        editionsCount: eCount,
        osceCount: oCount,
        nodesCount: nCount,
      };
    } catch (err: any) {
      console.error("[FirebaseService] Error during importAllData:", err);
      return {
        success: false,
        questionsCount: 0,
        guidelinesCount: 0,
        editionsCount: 0,
        osceCount: 0,
        nodesCount: 0,
        error: err?.message || String(err),
      };
    }
  }

  // -------------------------------------------------------------
  // USERS COLLECTION (/users/{userId})
  // -------------------------------------------------------------
  static async getUserProfile(userId: string): Promise<UserProfileDoc | null> {
    try {
      const userRef = doc(db, "users", userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfileDoc;
        return {
          ...data,
          role: data.role || "STUDENT",
        };
      }
      return null;
    } catch (err) {
      console.warn("[FirebaseService] Error fetching user profile:", err);
      return null;
    }
  }

  static async saveUserProfile(profile: UserProfile): Promise<void> {
    try {
      const activeUid = auth.currentUser?.uid;
      // If user is not authenticated with Firebase Auth, skip cloud sync safely (kept in local storage)
      if (!activeUid) {
        return;
      }

      // In Firestore, authenticated users can only write to their own document: users/{activeUid}
      const targetUid = activeUid;
      const userRef = doc(db, "users", targetUid);
      const sanitized = JSON.parse(
        JSON.stringify(profile, (_, v) => (v === undefined ? null : v))
      );
      
      // SECURITY DEFENSE: Do not allow client SDK to overwrite or mutate the role field in Firestore.
      // The user role is strictly authoritative and managed solely via Firestore Console, backend, or Admin SDK.
      delete sanitized.role;

      const payload: Partial<UserProfileDoc> = {
        ...sanitized,
        id: targetUid,
        email: profile.email || auth.currentUser?.email || "",
        name: profile.name || auth.currentUser?.displayName || "Dr(a). Candidato(a)",
        previousScore: profile.previousScore ?? 0,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userRef, payload, { merge: true });
      console.log(`[FirebaseService] User profile saved successfully in Firestore: users/${targetUid}`);
    } catch (err: any) {
      console.warn("[FirebaseService] Error saving user profile:", err?.message || err);
    }
  }

  // -------------------------------------------------------------
  // SESSIONS COLLECTION (/sessions/{sessionId})
  // -------------------------------------------------------------
  static async saveTrainingSession(session: TrainingSessionDoc): Promise<void> {
    try {
      const activeUid = auth.currentUser?.uid;
      // If user is not authenticated with Firebase Auth (e.g. guest or offline),
      // skip cloud sync safely. Guest sessions remain exclusively in local storage.
      if (!activeUid) {
        return;
      }

      const sessionRef = doc(db, "sessions", session.id);
      const sanitized = JSON.parse(
        JSON.stringify(session, (_, v) => (v === undefined ? null : v))
      );
      const payload: TrainingSessionDoc = {
        ...sanitized,
        userId: activeUid, // Strictly enforce authoritative Auth UID as the owner
        lastUpdated: new Date().toISOString(),
      };
      await setDoc(sessionRef, payload, { merge: true });
    } catch (err) {
      console.warn("[FirebaseService] Error saving training session:", err);
    }
  }

  static async getTrainingSession(sessionId: string): Promise<TrainingSessionDoc | null> {
    try {
      const activeUid = auth.currentUser?.uid;
      if (!activeUid) {
        return null;
      }
      const sessionRef = doc(db, "sessions", sessionId);
      const snap = await getDoc(sessionRef);
      if (snap.exists()) {
        const data = snap.data() as TrainingSessionDoc;
        // Strict ownership check: only the owner or an admin can access this session doc
        if (data.userId && data.userId !== activeUid) {
          console.warn("[FirebaseService] Access denied: session belongs to another user");
          return null;
        }
        return data;
      }
      return null;
    } catch (err) {
      console.warn("[FirebaseService] Error fetching training session:", err);
      return null;
    }
  }

  static async getUserSessions(userId: string, maxLimit = 20): Promise<TrainingSessionDoc[]> {
    try {
      const activeUid = auth.currentUser?.uid;
      // Guarantee query is strictly constrained to the authenticated user
      if (!activeUid) {
        return [];
      }
      const targetUserId = activeUid;
      const sessionsRef = collection(db, "sessions");
      const q = query(
        sessionsRef,
        where("userId", "==", targetUserId),
        orderBy("startTime", "desc"),
        limit(maxLimit)
      );
      const querySnap = await getDocs(q);
      return querySnap.docs.map((d) => d.data() as TrainingSessionDoc);
    } catch (err) {
      console.warn("[FirebaseService] Error fetching user sessions:", err);
      return [];
    }
  }

  // -------------------------------------------------------------
  // PROGRESS COLLECTION (/progress/{progressId})
  // -------------------------------------------------------------
  static async saveUserProgress(progress: UserProgressDoc): Promise<void> {
    try {
      const activeUid = auth.currentUser?.uid;
      if (!activeUid) {
        return;
      }
      const progressRef = doc(db, "progress", `progress_${activeUid}`);
      const payload = {
        ...progress,
        id: `progress_${activeUid}`,
        userId: activeUid,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(progressRef, payload, { merge: true });
    } catch (err) {
      console.warn("[FirebaseService] Error saving user progress:", err);
    }
  }

  static async getUserLatestProgress(userId: string): Promise<UserProgressDoc | null> {
    try {
      const activeUid = auth.currentUser?.uid;
      const targetUid = activeUid || userId;
      if (!targetUid || targetUid === "guest" || targetUid === "usr-default") {
        return null;
      }
      const progressRef = doc(db, "progress", `progress_${targetUid}`);
      const snap = await getDoc(progressRef);
      if (snap.exists()) {
        return snap.data() as UserProgressDoc;
      }
      return null;
    } catch (err) {
      console.warn("[FirebaseService] Error fetching user progress:", err);
      return null;
    }
  }

  // -------------------------------------------------------------
  // ERRORS (ERROR AUTOPSY) COLLECTION (/errors/{errorId})
  // -------------------------------------------------------------
  static async recordErrorAutopsy(params: {
    userId: string;
    question: Question;
    attempt: QuestionAttempt;
    userReflection?: string;
    remedialCardId?: string;
  }): Promise<ErrorAutopsyDoc | null> {
    const activeUid = auth.currentUser?.uid;
    const { userId, question, attempt, userReflection, remedialCardId } = params;
    const errorId = `err_${attempt.id || Date.now()}`;
    const now = new Date().toISOString();

    const autopsyDoc: ErrorAutopsyDoc = {
      id: errorId,
      userId: activeUid || userId,
      questionId: question.id,
      questionCode: question.code,
      area: question.area,
      topic: question.topic,
      subtopic: question.subtopic || question.topic,
      selectedOption: attempt.selectedOption,
      correctOption: question.correctAnswer,
      timeSpentSeconds: attempt.timeSpentSeconds || 0,
      confidence: attempt.confidence || "MEDIUM",
      errorReason: (attempt.errorReason as ErrorTaxonomy) || "KNOWLEDGE_GAP",
      userReflection: userReflection || attempt.userReflection || "",
      keyFinding: question.keyFinding || "",
      expectedConduct: question.expectedConduct || "",
      inepIntent: question.inepIntent || "",
      remedialCardCreated: Boolean(remedialCardId),
      remedialCardId: remedialCardId || undefined,
      resolutionStatus: "PENDING_REVIEW",
      retestAttempts: [],
      timestamp: attempt.timestamp || now,
      updatedAt: now,
    };

    if (!activeUid) {
      // Unauthenticated / guest users store error reflections locally
      return autopsyDoc;
    }

    try {
      const errorRef = doc(db, "errors", errorId);
      await setDoc(errorRef, autopsyDoc, { merge: true });
      return autopsyDoc;
    } catch (err) {
      console.warn("[FirebaseService] Error recording error autopsy:", err);
      return autopsyDoc;
    }
  }

  static async getUserErrorAutopsies(userId: string, maxLimit = 50): Promise<ErrorAutopsyDoc[]> {
    try {
      const activeUid = auth.currentUser?.uid;
      if (!activeUid) {
        return [];
      }
      const errorsRef = collection(db, "errors");
      const q = query(
        errorsRef,
        where("userId", "==", activeUid),
        orderBy("timestamp", "desc"),
        limit(maxLimit)
      );
      const querySnap = await getDocs(q);
      return querySnap.docs.map((d) => d.data() as ErrorAutopsyDoc);
    } catch (err) {
      console.warn("[FirebaseService] Error fetching error autopsies:", err);
      return [];
    }
  }

  static async updateErrorAutopsyStatus(
    errorId: string,
    status: "PENDING_REVIEW" | "REMEDIATED" | "MASTERED",
    reflection?: string
  ): Promise<void> {
    try {
      const activeUid = auth.currentUser?.uid;
      if (!activeUid) {
        return;
      }
      const errorRef = doc(db, "errors", errorId);
      const payload: Partial<ErrorAutopsyDoc> = {
        resolutionStatus: status,
        updatedAt: new Date().toISOString(),
      };
      if (reflection !== undefined) {
        payload.userReflection = reflection;
      }
      await updateDoc(errorRef, payload as any);
    } catch (err) {
      console.warn("[FirebaseService] Error updating error autopsy status:", err);
    }
  }

  // -------------------------------------------------------------
  // WEEKLY READINESS BULLETIN (/progress/bulletin_{userId})
  // -------------------------------------------------------------
  static async saveWeeklyBulletin(userId: string, bulletin: any): Promise<void> {
    try {
      const activeUid = auth.currentUser?.uid;
      if (!activeUid) {
        return;
      }
      const bulletinRef = doc(db, "progress", `bulletin_${activeUid}`);
      const payload = {
        ...bulletin,
        userId: activeUid,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(bulletinRef, payload, { merge: true });
    } catch (err) {
      console.warn("[FirebaseService] Error saving weekly bulletin to Firestore:", err);
    }
  }

  static async getWeeklyBulletin(userId: string): Promise<any | null> {
    try {
      const bulletinRef = doc(db, "progress", `bulletin_${userId}`);
      const snap = await getDoc(bulletinRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.warn("[FirebaseService] Error fetching weekly bulletin from Firestore:", err);
      return null;
    }
  }
}
