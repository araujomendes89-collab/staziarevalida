import {
  UserProfile,
  Question,
  QuestionAttempt,
  Flashcard,
  KnowledgeNode,
  OSCEStationAttempt,
  StudyMission,
} from "../types";
import { ALL_CANONICAL_QUESTIONS } from "../data/allOfficialQuestions";
import { normalizeQuestionList } from "../utils/questionNormalizer";
import { INITIAL_KNOWLEDGE_GRAPH } from "../data/knowledgeGraphData";
import { SpacedRepetitionService } from "./spacedRepetitionService";

const STORAGE_KEYS = {
  USER_PROFILE: "praxis_user_profile_v2",
  QUESTIONS: "praxis_questions_v3",
  ATTEMPTS: "praxis_attempts_v2",
  FLASHCARDS: "praxis_flashcards_v2",
  FLASHCARDS_BACKUP_V1: "praxis_flashcards_v1_backup",
  KNOWLEDGE_GRAPH: "praxis_knowledge_graph_v2",
  OSCE_ATTEMPTS: "praxis_osce_attempts_v2",
  STUDY_MISSION: "praxis_study_mission_v2",
  THEME_MODE: "praxis_theme_mode_v2",
};

// In-memory fallback cache when localStorage is full (QuotaExceeded) or disabled in private browsing
const memoryStore = new Map<string, string>();

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch (e) {
    console.warn(`[StorageService] Safe read failed for key ${key}:`, e);
  }
  return memoryStore.get(key) ?? null;
}

function safeSetItem(key: string, value: string): void {
  // Always update in-memory store
  memoryStore.set(key, value);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    // QuotaExceededError (e.g. on iOS Safari / private browsing)
    console.warn(`[StorageService] Quota exceeded or storage restricted for key ${key}, keeping in memory:`, e);
    // If quota exceeded, try to clean up stale heavy keys (like old questions cache)
    try {
      if (key !== STORAGE_KEYS.QUESTIONS) {
        window.localStorage.removeItem(STORAGE_KEYS.QUESTIONS);
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Memory store is active, continue safely
    }
  }
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

  static getFlashcards(): Flashcard[] {
    try {
      const data = safeGetItem(STORAGE_KEYS.FLASHCARDS);
      if (!data) return [];
      const parsed: Flashcard[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];

      const { migrated, hadLegacyCards } = SpacedRepetitionService.migrateLegacyFlashcards(parsed);
      if (hadLegacyCards) {
        // Create backup if not already present
        if (!safeGetItem(STORAGE_KEYS.FLASHCARDS_BACKUP_V1)) {
          safeSetItem(STORAGE_KEYS.FLASHCARDS_BACKUP_V1, data);
        }
        safeSetItem(STORAGE_KEYS.FLASHCARDS, JSON.stringify(migrated));
      }
      return migrated;
    } catch {
      return [];
    }
  }

  static saveFlashcards(cards: Flashcard[]): void {
    try {
      safeSetItem(STORAGE_KEYS.FLASHCARDS, JSON.stringify(cards));
    } catch (e) {
      console.warn("Error saving flashcards:", e);
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
      safeRemoveItem(STORAGE_KEYS.FLASHCARDS);
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
      safeRemoveItem(STORAGE_KEYS.FLASHCARDS);
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
