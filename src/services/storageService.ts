import {
  UserProfile,
  Question,
  QuestionAttempt,
  Flashcard,
  FlashcardContent,
  UserFlashcardState,
  FlashcardStorageEnvelopeV4,
  KnowledgeNode,
  OSCEStationAttempt,
  StudyMission,
} from "../types";
import { ALL_CANONICAL_QUESTIONS } from "../data/allOfficialQuestions";
import { normalizeQuestionList } from "../utils/questionNormalizer";
import { INITIAL_KNOWLEDGE_GRAPH } from "../data/knowledgeGraphData";
import { SpacedRepetitionService } from "./spacedRepetitionService";
import { FlashcardProvenanceService } from "./flashcardProvenanceService";
import { FlashcardStorageAdapter } from "./flashcardStorageAdapter";

export interface FlashcardStorageScope {
  userId?: string | null;
  isGuest?: boolean;
}

const STORAGE_KEYS = {
  USER_PROFILE: "praxis_user_profile_v2",
  QUESTIONS: "praxis_questions_v3",
  ATTEMPTS: "praxis_attempts_v2",
  FLASHCARDS_LEGACY_V2: "praxis_flashcards_v2",
  FLASHCARDS_V3_PREFIX: "praxis_flashcards_v3",
  FLASHCARDS_V4_PREFIX: "praxis_flashcards_v4",
  FLASHCARDS_BACKUP_V1: "praxis_flashcards_v1_backup",
  FLASHCARDS_BACKUP_V2: "praxis_flashcards_v2_migrated_backup",
  GUEST_ID: "praxis_guest_id_v1",
  KNOWLEDGE_GRAPH: "praxis_knowledge_graph_v2",
  OSCE_ATTEMPTS: "praxis_osce_attempts_v2",
  STUDY_MISSION: "praxis_study_mission_v2",
  THEME_MODE: "praxis_theme_mode_v2",
};

export function getOrGenerateGuestId(): string {
  let guestId = safeGetItem(STORAGE_KEYS.GUEST_ID);
  if (!guestId || guestId.trim().length === 0) {
    guestId = `guest_${Math.random().toString(36).substring(2, 10)}`;
    safeSetItem(STORAGE_KEYS.GUEST_ID, guestId);
  }
  return guestId;
}

export function getFlashcardStorageKeyV4(scope?: FlashcardStorageScope | string | null): string {
  if (typeof scope === "string" && scope.trim().length > 0) {
    return `${STORAGE_KEYS.FLASHCARDS_V4_PREFIX}:user:${scope.trim()}`;
  }
  if (scope && typeof scope === "object") {
    if (scope.userId && scope.userId.trim().length > 0 && !scope.isGuest) {
      return `${STORAGE_KEYS.FLASHCARDS_V4_PREFIX}:user:${scope.userId.trim()}`;
    }
    if (scope.isGuest) {
      const guestId = getOrGenerateGuestId();
      return `${STORAGE_KEYS.FLASHCARDS_V4_PREFIX}:guest:${guestId}`;
    }
  }
  const guestId = getOrGenerateGuestId();
  return `${STORAGE_KEYS.FLASHCARDS_V4_PREFIX}:guest:${guestId}`;
}

export function getFlashcardStorageKeyV3(scope?: FlashcardStorageScope | string | null): string {
  if (typeof scope === "string" && scope.trim().length > 0) {
    return `${STORAGE_KEYS.FLASHCARDS_V3_PREFIX}:user:${scope.trim()}`;
  }
  if (scope && typeof scope === "object") {
    if (scope.userId && scope.userId.trim().length > 0 && !scope.isGuest) {
      return `${STORAGE_KEYS.FLASHCARDS_V3_PREFIX}:user:${scope.userId.trim()}`;
    }
    if (scope.isGuest) {
      const guestId = getOrGenerateGuestId();
      return `${STORAGE_KEYS.FLASHCARDS_V3_PREFIX}:guest:${guestId}`;
    }
  }
  const guestId = getOrGenerateGuestId();
  return `${STORAGE_KEYS.FLASHCARDS_V3_PREFIX}:guest:${guestId}`;
}

export function getFlashcardStorageKey(scope?: FlashcardStorageScope | string | null): string {
  return getFlashcardStorageKeyV4(scope);
}

// In-memory fallback cache when localStorage is full (QuotaExceeded) or disabled in private browsing
const memoryStore = new Map<string, string>();

export function clearMemoryStore(): void {
  memoryStore.clear();
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn(`[StorageService] Safe read failed for key ${key}:`, e);
  }
  return memoryStore.get(key) ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
      memoryStore.delete(key);
      return;
    }
  } catch (e) {
    // QuotaExceededError (e.g. on iOS Safari / private browsing)
    console.warn(`[StorageService] Quota exceeded or storage restricted for key ${key}, keeping in memory:`, e);
    try {
      if (key !== STORAGE_KEYS.QUESTIONS) {
        window.localStorage.removeItem(STORAGE_KEYS.QUESTIONS);
        window.localStorage.setItem(key, value);
        memoryStore.delete(key);
        return;
      }
    } catch {
      // Memory store is active, continue safely
    }
  }
  memoryStore.set(key, value);
}

function safeRemoveItem(key: string): void {
  memoryStore.delete(key);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn(`[StorageService] Safe remove failed for key ${key}:`, e);
  }
}

export const DEFAULT_USER: UserProfile = {
  id: "usr-default",
  name: "Dr(a). Candidato(a)",
  email: "",
  graduationCountry: "",
  graduationUniversity: "",
  graduationYear: new Date().getFullYear(),
  targetEdition: "Revalida INEP 2026/2",
  examDate: "2026-09-13",
  isFirstAttempt: true,
  previousScore: 0,
  dailyStudyMinutes: 90,
  availableDaysPerWeek: 6,
  weakAreas: [],
  role: "STUDENT",
  tier: "FREE",
  isOnboardingCompleted: false,
  hasConfiguredExamDate: false,
  studyStreakDays: 0,
  totalQuestionsSolved: 0,
  overallReadiness: 0,
  projectedPassScoreMin: 0,
  projectedPassScoreMax: 0,
};

export class StorageService {
  static getUserProfile(): UserProfile {
    try {
      const data = safeGetItem(STORAGE_KEYS.USER_PROFILE);
      if (!data) return DEFAULT_USER;
      const parsed: UserProfile = JSON.parse(data);
      // If it is an old mock user profile (e.g. Joao Mendes / Univalle), reset to clean default
      if (
        parsed.name === "Dr. João Mendes" ||
        parsed.graduationUniversity === "Universidad Privada del Valle (Univalle)" ||
        parsed.id === "usr-01"
      ) {
        this.saveUserProfile(DEFAULT_USER);
        return DEFAULT_USER;
      }
      return parsed;
    } catch {
      return DEFAULT_USER;
    }
  }

  static saveUserProfile(profile: UserProfile): void {
    try {
      safeSetItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
    } catch (e) {
      console.warn("Error saving user profile:", e);
    }
  }

  static getQuestions(): Question[] {
    const allSeeds = ALL_CANONICAL_QUESTIONS;
    try {
      const data = safeGetItem(STORAGE_KEYS.QUESTIONS);
      if (!data) return allSeeds;
      const parsedRaw = JSON.parse(data);
      const parsed = normalizeQuestionList(parsedRaw);
      const parsedMap = new Map(parsed.map((q) => [q.id, q]));
      
      // Update each canonical question with any local overrides or keep fresh canonical data
      const mergedSeeds = allSeeds.map((seed) => {
        const stored = parsedMap.get(seed.id);
        if (!stored) return seed;
        return {
          ...seed,
          stats: stored.stats || seed.stats,
        };
      });

      // Include any user-created custom questions or newly cached questions not in canonical seeds
      const seedIds = new Set(allSeeds.map((s) => s.id));
      const userCustom = parsed.filter((q) => !seedIds.has(q.id));

      return [...mergedSeeds, ...userCustom];
    } catch {
      return allSeeds;
    }
  }

  static saveQuestions(questions: Question[]): void {
    try {
      // Only store custom questions or modified stats to avoid bloating localStorage
      const seedIds = new Set(ALL_CANONICAL_QUESTIONS.map((s) => s.id));
      const customOrModified = questions.filter((q) => !seedIds.has(q.id) || (q.stats && q.stats.totalAttempts > 0));
      safeSetItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(customOrModified));
    } catch (e) {
      console.warn("Error saving questions:", e);
    }
  }

  static getAttempts(): QuestionAttempt[] {
    try {
      const data = safeGetItem(STORAGE_KEYS.ATTEMPTS);
      if (!data) return [];
      const parsed: QuestionAttempt[] = JSON.parse(data);
      // Remove any legacy mockup attempts if found
      const clean = parsed.filter((a) => a.id !== "att-1" && a.id !== "att-2" && a.id !== "att-3");
      if (clean.length !== parsed.length) {
        this.saveAttempts(clean);
      }
      return clean;
    } catch {
      return [];
    }
  }

  static saveAttempts(attempts: QuestionAttempt[]): void {
    try {
      // Limit stored attempts locally to most recent 500 to protect storage quota
      const trimmed = (attempts || []).slice(0, 500);
      safeSetItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("Error saving attempts:", e);
    }
  }

  static addAttempt(attempt: QuestionAttempt): void {
    const list = this.getAttempts();
    list.unshift(attempt);
    this.saveAttempts(list);
  }

  static getFlashcardStorageKey(scope?: FlashcardStorageScope | string | null): string {
    return getFlashcardStorageKeyV4(scope);
  }

  static getFlashcardStorageKeyV4(scope?: FlashcardStorageScope | string | null): string {
    return getFlashcardStorageKeyV4(scope);
  }

  static getFlashcardStorageKeyV3(scope?: FlashcardStorageScope | string | null): string {
    return getFlashcardStorageKeyV3(scope);
  }

  /**
   * Retrieves or migrates the V4 Flashcard Storage Envelope for the active scope
   */
  static getFlashcardsEnvelope(scope?: FlashcardStorageScope | string | null): FlashcardStorageEnvelopeV4 {
    const v4Key = getFlashcardStorageKeyV4(scope);
    const v3Key = getFlashcardStorageKeyV3(scope);

    // 1. Try reading V4 single envelope
    try {
      const dataV4 = safeGetItem(v4Key);
      if (dataV4) {
        const parsed = JSON.parse(dataV4);
        if (FlashcardStorageAdapter.validateV4Envelope(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("[StorageService] Error reading V4 flashcards envelope:", e);
    }

    // 2. If V4 not present or invalid, attempt deterministic migration from V3 in same scope
    try {
      const dataV3 = safeGetItem(v3Key);
      if (dataV3) {
        const parsedV3 = JSON.parse(dataV3);
        if (Array.isArray(parsedV3) && parsedV3.length > 0) {
          const userId = typeof scope === "string" ? scope : scope?.userId || "guest";
          const envelopeV4 = FlashcardStorageAdapter.migrateV3CardsToV4Envelope(parsedV3, userId);
          // Atomically write V4 envelope and preserve V3 as rollback backup
          safeSetItem(v4Key, JSON.stringify(envelopeV4));
          return envelopeV4;
        }
      }
    } catch (e) {
      console.warn("[StorageService] Error migrating V3 to V4 flashcards:", e);
    }

    return {
      schemaVersion: 4,
      updatedAt: new Date().toISOString(),
      contents: {},
      userStates: {},
    };
  }

  /**
   * Saves the V4 Flashcard Storage Envelope atomically for the active scope
   */
  static saveFlashcardsEnvelope(
    envelope: FlashcardStorageEnvelopeV4,
    scope?: FlashcardStorageScope | string | null
  ): void {
    const v4Key = getFlashcardStorageKeyV4(scope);
    try {
      if (!FlashcardStorageAdapter.validateV4Envelope(envelope)) {
        throw new Error("Invalid V4 envelope structure");
      }
      safeSetItem(v4Key, JSON.stringify(envelope));
    } catch (e) {
      console.warn("[StorageService] Error saving V4 flashcards envelope:", e);
    }
  }

  /**
   * Reads decoupled V4 storage and hydrates a compatible Flashcard view model list for consumers
   */
  static getFlashcards(scope?: FlashcardStorageScope | string | null): Flashcard[] {
    try {
      const envelope = this.getFlashcardsEnvelope(scope);
      const contents = envelope.contents || {};
      const userStates = envelope.userStates || {};

      const hydrated: Flashcard[] = [];
      for (const bridgeId of Object.keys(contents)) {
        const content = contents[bridgeId];
        const state = userStates[bridgeId];
        if (!content) continue;

        // If user state is missing for this content (orphan content), provide safe baseline state
        const effectiveState =
          state || {
            localBridgeId: bridgeId,
            userId: typeof scope === "string" ? scope : scope?.userId || "guest",
            schedulerVersion: "FSRS_V1" as const,
            stability: 0,
            difficulty: 5.0,
            elapsedDays: 0,
            scheduledDays: 1,
            reps: 0,
            lapses: 0,
            state: 0,
            dueDate: new Date().toISOString(),
            intervalDays: 1,
            easeFactor: 2.5,
            repetitionCount: 0,
            masteryLevel: 25,
          };

        hydrated.push(FlashcardStorageAdapter.hydrateFlashcardItem(content, effectiveState));
      }

      return hydrated;
    } catch (e) {
      console.warn("[StorageService] Error hydrating flashcards from V4 envelope:", e);
      return [];
    }
  }

  /**
   * Saves flashcards into the V4 single envelope, keeping FlashcardContent immutable during ratings
   */
  static saveFlashcards(cards: Flashcard[], scope?: FlashcardStorageScope | string | null): void {
    try {
      const userId = typeof scope === "string" ? scope : scope?.userId || "guest";
      const envelope = this.getFlashcardsEnvelope(scope);
      const contents: Record<string, FlashcardContent> = { ...envelope.contents };
      const userStates: Record<string, UserFlashcardState> = { ...envelope.userStates };

      const currentIds = new Set<string>();

      for (const card of cards) {
        if (!card || !card.id) continue;
        currentIds.add(card.id);

        const existingContent = contents[card.id];
        const existingState = userStates[card.id];

        if (existingContent && existingState) {
          // Content is IMMUTABLE during review/rating: update ONLY UserFlashcardState
          userStates[card.id] = {
            ...existingState,
            schedulerVersion: card.schedulerVersion || existingState.schedulerVersion || "FSRS_V1",
            stability: card.stability ?? existingState.stability,
            difficulty: card.difficulty ?? existingState.difficulty,
            elapsedDays: card.elapsedDays ?? existingState.elapsedDays,
            scheduledDays: card.scheduledDays ?? card.intervalDays ?? existingState.scheduledDays,
            reps: card.reps ?? card.repetitionCount ?? existingState.reps,
            lapses: card.lapses ?? existingState.lapses,
            state: card.state ?? existingState.state,
            lastReviewed: card.lastReviewed ?? existingState.lastReviewed,
            dueDate: card.dueDate || existingState.dueDate,
            intervalDays: card.intervalDays ?? existingState.intervalDays,
            easeFactor: card.easeFactor ?? existingState.easeFactor,
            repetitionCount: card.repetitionCount ?? card.reps ?? existingState.repetitionCount,
            masteryLevel: card.masteryLevel ?? existingState.masteryLevel,
            updatedAt: new Date().toISOString(),
          };
        } else {
          // New card: deconstruct and insert both
          const { content, userState } = FlashcardStorageAdapter.deconstructFlashcardItem(card, userId);
          contents[card.id] = content;
          userStates[card.id] = userState;
        }
      }

      // Handle card removals if user passed a pruned list (e.g. data reset)
      for (const id of Object.keys(contents)) {
        if (!currentIds.has(id)) {
          delete contents[id];
          delete userStates[id];
        }
      }

      const updatedEnvelope: FlashcardStorageEnvelopeV4 = {
        schemaVersion: 4,
        updatedAt: new Date().toISOString(),
        contents,
        userStates,
      };

      this.saveFlashcardsEnvelope(updatedEnvelope, scope);
    } catch (e) {
      console.warn("[StorageService] Error saving flashcards to V4 envelope:", e);
    }
  }

  static hasLegacyFlashcards(): boolean {
    try {
      const data = safeGetItem(STORAGE_KEYS.FLASHCARDS_LEGACY_V2);
      if (!data) return false;
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  static getLegacyFlashcardsCount(): number {
    try {
      const data = safeGetItem(STORAGE_KEYS.FLASHCARDS_LEGACY_V2);
      if (!data) return 0;
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }

  static hasDismissedLegacyRecovery(scope?: FlashcardStorageScope | string | null): boolean {
    const scopeKey = getFlashcardStorageKeyV4(scope);
    return safeGetItem(`praxis_legacy_dismissed:${scopeKey}`) === "true";
  }

  static dismissLegacyRecovery(scope?: FlashcardStorageScope | string | null): void {
    const scopeKey = getFlashcardStorageKeyV4(scope);
    safeSetItem(`praxis_legacy_dismissed:${scopeKey}`, "true");
  }

  static importLegacyFlashcards(scope?: FlashcardStorageScope | string | null): Flashcard[] {
    const v4Key = getFlashcardStorageKeyV4(scope);
    try {
      const data = safeGetItem(STORAGE_KEYS.FLASHCARDS_LEGACY_V2);
      if (!data) return [];
      const parsed: Flashcard[] = JSON.parse(data);
      if (!Array.isArray(parsed) || parsed.length === 0) return [];

      // Preserve technical backup
      if (!safeGetItem(STORAGE_KEYS.FLASHCARDS_BACKUP_V2)) {
        safeSetItem(STORAGE_KEYS.FLASHCARDS_BACKUP_V2, data);
      }

      const { migrated } = SpacedRepetitionService.migrateLegacyFlashcards(parsed);
      const userId = typeof scope === "string" ? scope : scope?.userId || "guest";
      const enrichedCards = migrated.map((card) => ({
        ...card,
        provenance:
          card.provenance?.origin === "QUESTION_DERIVED"
            ? card.provenance
            : FlashcardProvenanceService.createLegacyProvenance("IMPORTED_LEGACY"),
        contentFingerprint:
          card.contentFingerprint ||
          FlashcardProvenanceService.createFlashcardContentFingerprint(card.front, card.back, card.keyMnemonic),
      }));

      // Directly build V4 envelope and save
      const envelope = FlashcardStorageAdapter.migrateV3CardsToV4Envelope(enrichedCards, userId);
      this.saveFlashcardsEnvelope(envelope, scope);
      safeSetItem(`praxis_legacy_dismissed:${v4Key}`, "true");
      return this.getFlashcards(scope);
    } catch (e) {
      console.warn("Error importing legacy flashcards:", e);
      return [];
    }
  }

  static getKnowledgeGraph(): KnowledgeNode[] {
    try {
      const data = safeGetItem(STORAGE_KEYS.KNOWLEDGE_GRAPH);
      return data ? JSON.parse(data) : INITIAL_KNOWLEDGE_GRAPH;
    } catch {
      return INITIAL_KNOWLEDGE_GRAPH;
    }
  }

  static saveKnowledgeGraph(nodes: KnowledgeNode[]): void {
    try {
      safeSetItem(STORAGE_KEYS.KNOWLEDGE_GRAPH, JSON.stringify(nodes));
    } catch (e) {
      console.warn("Error saving knowledge graph:", e);
    }
  }

  static getOSCEAttempts(): OSCEStationAttempt[] {
    try {
      const data = safeGetItem(STORAGE_KEYS.OSCE_ATTEMPTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveOSCEAttempts(attempts: OSCEStationAttempt[]): void {
    try {
      safeSetItem(STORAGE_KEYS.OSCE_ATTEMPTS, JSON.stringify(attempts));
    } catch (e) {
      console.warn("Error saving OSCE attempts:", e);
    }
  }

  static addOSCEAttempt(attempt: OSCEStationAttempt): void {
    const list = this.getOSCEAttempts();
    list.unshift(attempt);
    this.saveOSCEAttempts(list);
  }

  static getTodayMission(): StudyMission {
    try {
      const data = safeGetItem(STORAGE_KEYS.STUDY_MISSION);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.id !== "mis-today-sprint") {
          return parsed;
        }
      }

      const initialMission: StudyMission = {
        id: "mis-initial-diagnostic",
        title: "Diagnóstico Clínico Inicial — Matriz INEP",
        estimatedMinutes: 60,
        targetArea: "CLINICA_MEDICA",
        focusTopic: "Diagnóstico de Microcompetências Prioritárias",
        rationale: "Resolva suas primeiras questões oficiais para que o motor neural calibrado calcule seu Score PPS (Prioridade de Pontos) nas 5 grandes áreas.",
        tasks: [
          {
            type: "QUESTIONS",
            description: "10 Questões Oficiais INEP (Diagnóstico Inicial)",
            count: 10,
            minutes: 30,
            completed: false,
          },
          {
            type: "ERROR_AUTOPSY",
            description: "Revisão e autópsia de eventuais erros",
            minutes: 15,
            completed: false,
          },
          {
            type: "FLASHCARDS",
            description: "Fixação ativa com repetição espaçada",
            count: 5,
            minutes: 15,
            completed: false,
          },
        ],
      };
      this.saveTodayMission(initialMission);
      return initialMission;
    } catch {
      return {
        id: "mis-default",
        title: "Estudo Adaptativo",
        estimatedMinutes: 30,
        targetArea: "CLINICA_MEDICA",
        focusTopic: "Microcompetências INEP",
        rationale: "Consolidação de microcompetências",
        tasks: [],
      };
    }
  }

  static saveTodayMission(mission: StudyMission): void {
    try {
      safeSetItem(STORAGE_KEYS.STUDY_MISSION, JSON.stringify(mission));
    } catch (e) {
      console.warn("Error saving today mission:", e);
    }
  }

  static resetUserData(): void {
    try {
      safeRemoveItem(STORAGE_KEYS.ATTEMPTS);
      safeRemoveItem(STORAGE_KEYS.FLASHCARDS_LEGACY_V2);
      safeRemoveItem(STORAGE_KEYS.KNOWLEDGE_GRAPH);
      safeRemoveItem(STORAGE_KEYS.OSCE_ATTEMPTS);
      safeRemoveItem(STORAGE_KEYS.STUDY_MISSION);
      safeRemoveItem("staziamed_student_cognitive_memory_v1");
    } catch (e) {
      console.warn("Error resetting user data:", e);
    }
  }

  static resetAllLocalData(): void {
    try {
      safeRemoveItem(STORAGE_KEYS.USER_PROFILE);
      safeRemoveItem(STORAGE_KEYS.QUESTIONS);
      safeRemoveItem(STORAGE_KEYS.ATTEMPTS);
      safeRemoveItem(STORAGE_KEYS.FLASHCARDS_LEGACY_V2);
      safeRemoveItem(STORAGE_KEYS.KNOWLEDGE_GRAPH);
      safeRemoveItem(STORAGE_KEYS.OSCE_ATTEMPTS);
      safeRemoveItem(STORAGE_KEYS.STUDY_MISSION);
      safeRemoveItem("staziamed_student_cognitive_memory_v1");
      safeRemoveItem("praxis_guest_mode");
    } catch (e) {
      console.warn("Error resetting local data:", e);
    }
  }
}
