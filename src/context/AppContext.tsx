import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { pathToTab, tabToPath, tabToTitle } from "../services/routeMapping";
import {
  UserProfile,
  Question,
  QuestionAttempt,
  Flashcard,
  KnowledgeNode,
  OSCEStationAttempt,
  StudyMission,
  RadarUpdate,
  MedicalArea,
  ContentStatus,
  MedicalGuideline,
  GuidelineAuditLog,
  GuidelineWatchAlert,
  RevalidaEditionInventory,
  TrainingSessionDoc,
  ErrorAutopsyDoc,
} from "../types";
import { StorageService, DEFAULT_USER } from "../services/storageService";
import { FirebaseService } from "../services/firebaseService";
import { normalizeQuestionList } from "../utils/questionNormalizer";
import {
  testFirestoreConnection,
  subscribeToAuthState,
  signInWithGooglePopup,
  signInAnonymouslyUser,
  loginWithEmail,
  registerWithEmail,
  sendUserEmailVerification,
  reloadCurrentUser,
  resetPasswordWithEmail,
  signOutCurrentUser,
  FirebaseUser,
} from "../lib/firebase";
import { AdaptiveEngine } from "../services/adaptiveEngine";
import { SpacedRepetitionService } from "../services/spacedRepetitionService";
import { SEED_RADAR_UPDATES } from "../data/knowledgeGraphData";
import { REVALIDA_EDITIONS_INVENTORY } from "../data/revalidaInventoryData";
import { SEED_MEDICAL_GUIDELINES, SEED_GUIDELINE_WATCH_ALERTS, SEED_GUIDELINE_AUDIT_LOGS } from "../data/guidelinesData";

export type NavTab = 
  | "home"
  // 1. Estudar
  | "estudar"
  | "estudar-plano-hoje"
  | "estudar-aulas"
  | "estudar-grandes-temas"
  | "estudar-materiais"
  // 2. Praticar
  | "praticar"
  | "praticar-questoes"
  | "praticar-simulados"
  | "praticar-provas"
  | "praticar-questoes-ia"
  // 3. Revisar
  | "revisar"
  | "revisar-flashcards"
  | "revisar-erros"
  | "revisar-atualizacoes"
  | "revisar-radar"
  | "revisar-audio"
  // 4. Planejamento
  | "planejamento"
  | "planejamento-calendario"
  | "planejamento-semanal"
  | "planejamento-ate-prova"
  | "planejamento-disponibilidade"
  | "planejamento-replanejamento"
  // 5. Desempenho
  | "desempenho"
  | "desempenho-geral"
  | "desempenho-evolucao"
  | "desempenho-matriz"
  | "desempenho-tendencias"
  | "desempenho-areas"
  // 6. Tutor IA
  | "tutor-ia"
  | "tutor-conversar"
  | "tutor-transito"
  | "tutor-historico"
  // Legacy & Administrative aliases
  | "calendario-inteligente"
  | "questoes-ia"
  | "grandes-temas"
  | "questions"
  | "voice-tutor"
  | "agent"
  | "review"
  | "osce"
  | "progress"
  | "student-memory"
  | "calendar"
  | "pattern-engine"
  | "ineditas"
  | "inventory"
  | "guidelines"
  | "export"
  | "errors"
  | "radar"
  | "matrix"
  | "brazil"
  | "official-search"
  | "profile"
  | "settings"
  | "admin"
  | "subscription";

interface AppContextType {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  prefilledGenerationParams: { area?: string; theme?: string; subtheme?: string } | null;
  setPrefilledGenerationParams: React.Dispatch<React.SetStateAction<{ area?: string; theme?: string; subtheme?: string } | null>>;
  navigateToAiQuestionGenerator: (params?: { area?: string; theme?: string; subtheme?: string }) => void;
  questions: Question[];
  editionsInventory: RevalidaEditionInventory[];
  guidelines: MedicalGuideline[];
  guidelineAlerts: GuidelineWatchAlert[];
  guidelineAuditLogs: GuidelineAuditLog[];
  attempts: QuestionAttempt[];
  flashcards: Flashcard[];
  knowledgeGraph: KnowledgeNode[];
  osceAttempts: OSCEStationAttempt[];
  todayMission: StudyMission;
  radarUpdates: RadarUpdate[];
  activeQuestionIndex: number;
  setActiveQuestionIndex: (idx: number) => void;
  questionFilterArea: MedicalArea | "ALL";
  setQuestionFilterArea: (area: MedicalArea | "ALL") => void;
  questionFilterYear: number | "ALL";
  setQuestionFilterYear: (year: number | "ALL") => void;
  questionFilterStatus: ContentStatus | "ALL";
  setQuestionFilterStatus: (status: ContentStatus | "ALL") => void;
  questionFilterOrigin: "ALL" | "INEP_OFICIAL" | "INEDITAS";
  setQuestionFilterOrigin: (origin: "ALL" | "INEP_OFICIAL" | "INEDITAS") => void;
  questionMode: "STUDY" | "EXAM" | "PRESSURE" | "DUEL";
  setQuestionMode: (mode: "STUDY" | "EXAM" | "PRESSURE" | "DUEL") => void;
  isStudyForMeOpen: boolean;
  setIsStudyForMeOpen: (open: boolean) => void;
  isExamConfigOpen: boolean;
  setIsExamConfigOpen: (open: boolean) => void;
  isOnboardingOpen: boolean;
  setIsOnboardingOpen: (open: boolean) => void;
  isWhatIfOpen: boolean;
  setIsWhatIfOpen: (open: boolean) => void;
  isSubscriptionModalOpen: boolean;
  setIsSubscriptionModalOpen: (open: boolean) => void;
  isOfficialSearchOpen: boolean;
  setIsOfficialSearchOpen: (open: boolean) => void;
  officialSearchQuery: string;
  setOfficialSearchQuery: (query: string) => void;
  openOfficialSearch: (query?: string) => void;
  addToast?: (message: string, type?: "success" | "error" | "info") => void;
  selectedOSCEId: string | null;
  setSelectedOSCEId: (id: string | null) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  recordQuestionAttempt: (attempt: Omit<QuestionAttempt, "id" | "timestamp">) => void;
  updateFlashcardScore: (cardId: string, rating: "EASY" | "MEDIUM" | "HARD" | "AGAIN") => void;
  generateCustomStudySession: (minutes: 15 | 30 | 60 | 120) => void;
  refreshMissionTask: (taskIndex: number) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  addGuidelineAuditLog: (log: Omit<GuidelineAuditLog, "id" | "timestamp">) => void;
  approveGuidelineAlert: (alertId: string) => void;
  approveIneditaQuestion: (questionId: string, doctorName: string) => void;
  rejectIneditaQuestion: (questionId: string, reason: string) => void;
  editIneditaQuestion: (questionId: string, updates: Partial<Question>, reason: string, doctorName: string) => void;
  addGeneratedQuestion: (question: Question) => void;
  addBatchQuestions: (newQuestions: Question[]) => void;
  saveSessionToFirestore: (session: TrainingSessionDoc) => Promise<void>;
  updateErrorAutopsyReflection: (errorId: string, status: "PENDING_REVIEW" | "REMEDIATED" | "MASTERED", reflection?: string) => Promise<void>;
  syncQuestionsFromFirestore: () => Promise<number>;
  readinessData: ReturnType<typeof AdaptiveEngine.calculateReadiness>;
  resetUserData: () => void;
  resetAllData: () => void;
  // Auth state & methods
  firebaseUser: FirebaseUser | null;
  isAuthLoading: boolean;
  isGuestMode: boolean;
  isGoogleProvider: boolean;
  isEmailVerified: boolean;
  resendVerificationEmail: () => Promise<void>;
  reloadUserAuth: () => Promise<boolean>;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  signInWithGoogle: () => Promise<FirebaseUser>;
  signInAnonymously: () => Promise<FirebaseUser>;
  signInWithEmail: (email: string, pass: string) => Promise<FirebaseUser>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<FirebaseUser>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(() => StorageService.getUserProfile());
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("praxis_guest_mode") === "true";
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTabState] = useState<NavTab>(() => {
    if (typeof window !== "undefined") {
      return pathToTab(window.location.pathname);
    }
    return "home";
  });

  // Keep activeTab in sync with browser navigation (Back, Forward, direct URL change)
  useEffect(() => {
    const tabFromUrl = pathToTab(location.pathname);
    setActiveTabState((prev) => (prev !== tabFromUrl ? tabFromUrl : prev));
    document.title = tabToTitle(tabFromUrl);
  }, [location.pathname]);

  // Navigate to corresponding URL and update state
  const setActiveTab = useCallback(
    (tab: NavTab) => {
      setActiveTabState(tab);
      const targetPath = tabToPath(tab);
      document.title = tabToTitle(tab);
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate]
  );
  const [questions, setQuestions] = useState<Question[]>(() => StorageService.getQuestions());
  const [editionsInventory] = useState<RevalidaEditionInventory[]>(REVALIDA_EDITIONS_INVENTORY);
  const [guidelines, setGuidelines] = useState<MedicalGuideline[]>(SEED_MEDICAL_GUIDELINES);
  const [guidelineAlerts, setGuidelineAlerts] = useState<GuidelineWatchAlert[]>(SEED_GUIDELINE_WATCH_ALERTS);
  const [guidelineAuditLogs, setGuidelineAuditLogs] = useState<GuidelineAuditLog[]>(SEED_GUIDELINE_AUDIT_LOGS);

  const [attempts, setAttempts] = useState<QuestionAttempt[]>(() => StorageService.getAttempts());
  const [flashcards, setFlashcards] = useState<Flashcard[]>(() => StorageService.getFlashcards());
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeNode[]>(() => StorageService.getKnowledgeGraph());
  const [osceAttempts, setOsceAttempts] = useState<OSCEStationAttempt[]>(() => StorageService.getOSCEAttempts());
  const [todayMission, setTodayMission] = useState<StudyMission>(() => StorageService.getTodayMission());
  const [radarUpdates] = useState<RadarUpdate[]>(SEED_RADAR_UPDATES);

  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [questionFilterArea, setQuestionFilterArea] = useState<MedicalArea | "ALL">("ALL");
  const [questionFilterYear, setQuestionFilterYear] = useState<number | "ALL">("ALL");
  const [questionFilterStatus, setQuestionFilterStatus] = useState<ContentStatus | "ALL">("ALL");
  const [questionFilterOrigin, setQuestionFilterOrigin] = useState<"ALL" | "INEP_OFICIAL" | "INEDITAS">("ALL");
  const [questionMode, setQuestionMode] = useState<"STUDY" | "EXAM" | "PRESSURE" | "DUEL">("STUDY");

  const [isStudyForMeOpen, setIsStudyForMeOpen] = useState<boolean>(false);
  const [isExamConfigOpen, setIsExamConfigOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isWhatIfOpen, setIsWhatIfOpen] = useState<boolean>(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState<boolean>(false);
  const [isOfficialSearchOpen, setIsOfficialSearchOpen] = useState<boolean>(false);
  const [officialSearchQuery, setOfficialSearchQuery] = useState<string>("");
  const [selectedOSCEId, setSelectedOSCEId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [prefilledGenerationParams, setPrefilledGenerationParams] = useState<{
    area?: string;
    theme?: string;
    subtheme?: string;
  } | null>(null);

  const navigateToAiQuestionGenerator = (params?: { area?: string; theme?: string; subtheme?: string }) => {
    if (params) {
      setPrefilledGenerationParams(params);
    }
    setActiveTab("questoes-ia");
  };

  const openOfficialSearch = (searchQuery?: string) => {
    if (searchQuery) {
      setOfficialSearchQuery(searchQuery);
    }
    setIsOfficialSearchOpen(true);
  };

  // Calculate live readiness & Pass Score
  const readinessData = AdaptiveEngine.calculateReadiness(knowledgeGraph, attempts);

  // Set up Firebase Authentication session listener
  useEffect(() => {
    // Safety timeout: ensure loading state never hangs forever in sandboxed iframes
    const safetyTimer = setTimeout(() => {
      setIsAuthLoading(false);
    }, 1200);

    const unsubscribe = subscribeToAuthState(async (fbUser) => {
      clearTimeout(safetyTimer);
      setFirebaseUser(fbUser);
      setIsAuthLoading(false);

      if (fbUser) {
        console.log(`[FirebaseAuth] Active session detected: ${fbUser.email || fbUser.uid}`);
        try {
          const now = new Date();
          const nowIso = now.toISOString();
          const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

          // Check if user profile exists in Firestore
          const cloudProfile = await FirebaseService.getUserProfile(fbUser.uid);
          if (cloudProfile) {
            let plan = cloudProfile.plan || (cloudProfile.tier === "PRO" ? "pro" : cloudProfile.tier === "PRO_PLUS" ? "pro_plus" : cloudProfile.tier === "ADMIN" ? "admin" : "trial");
            let tier = cloudProfile.tier || "TRIAL";
            let trialStartedAt = cloudProfile.trialStartedAt || nowIso;
            let trialEndsAt = cloudProfile.trialEndsAt || sevenDaysLater;

            // Check if trial has expired
            if (tier !== "PRO" && tier !== "PRO_PLUS" && tier !== "ADMIN") {
              const trialEndsTimestamp = new Date(trialEndsAt).getTime();
              if (!isNaN(trialEndsTimestamp) && trialEndsTimestamp <= now.getTime()) {
                plan = "expired";
                tier = "EXPIRED";
              } else {
                plan = "trial";
                tier = "TRIAL";
              }
            } else if (cloudProfile.subscriptionExpiresAt && tier !== "ADMIN") {
              // Check paid subscription expiration
              const subEndsTimestamp = new Date(cloudProfile.subscriptionExpiresAt).getTime();
              if (!isNaN(subEndsTimestamp) && subEndsTimestamp <= now.getTime()) {
                plan = "expired";
                tier = "EXPIRED";
              }
            }

            const syncedUser: UserProfile = {
              ...user,
              ...cloudProfile,
              id: fbUser.uid,
              email: fbUser.email || cloudProfile.email || "",
              name: fbUser.displayName || cloudProfile.name || "Dr. Candidato",
              plan: plan as any,
              tier: tier as any,
              trialStartedAt,
              trialEndsAt,
            };
            setUser(syncedUser);
            StorageService.saveUserProfile(syncedUser);

            // Sync back to Firestore if plan status updated or trial dates were missing
            if (syncedUser.tier !== cloudProfile.tier || syncedUser.plan !== cloudProfile.plan || !cloudProfile.trialEndsAt) {
              await FirebaseService.saveUserProfile(syncedUser);
            }
          } else {
            // New profile creation for newly authenticated user (Trial 7 days linked to UID)
            const newUserProfile: UserProfile = {
              ...user,
              id: fbUser.uid,
              email: fbUser.email || "",
              name: fbUser.displayName || user.name || "Dr. Candidato",
              role: "STUDENT",
              plan: "trial",
              tier: "TRIAL",
              trialStartedAt: nowIso,
              trialEndsAt: sevenDaysLater,
              planUpdatedAt: nowIso,
              isOnboardingCompleted: false,
            };
            setUser(newUserProfile);
            StorageService.saveUserProfile(newUserProfile);
            await FirebaseService.saveUserProfile(newUserProfile);
          }

          // Hydrate user's latest progress & mission from Firestore
          const cloudProgress = await FirebaseService.getUserLatestProgress(fbUser.uid);
          if (cloudProgress) {
            if (cloudProgress.todayMission) {
              setTodayMission(cloudProgress.todayMission);
              StorageService.saveTodayMission(cloudProgress.todayMission);
            }
            if (cloudProgress.knowledgeGraphNodes && cloudProgress.knowledgeGraphNodes.length > 0) {
              setKnowledgeGraph(cloudProgress.knowledgeGraphNodes);
              StorageService.saveKnowledgeGraph(cloudProgress.knowledgeGraphNodes);
            }
          }
        } catch (err) {
          console.error("[FirebaseAuth] Error syncing user session with Firestore:", err);
        }
      } else {
        console.log("[FirebaseAuth] No active auth session (Guest/Offline state)");
      }
    });

    // Global AI Event Listeners (Trigger Pricing Modal on Plan Expired)
    const handleOpenPricing = (_e: Event) => {
      setIsSubscriptionModalOpen(true);
    };
    const handlePlanExpired = (_e: Event) => {
      setIsSubscriptionModalOpen(true);
    };

    window.addEventListener("open-pricing-modal", handleOpenPricing);
    window.addEventListener("ai-plan-expired", handlePlanExpired);

    // Test Firestore connection on boot
    testFirestoreConnection();

    // Auto-fetch questions from Firestore on startup
    syncQuestionsFromFirestore();

    return () => {
      unsubscribe();
      window.removeEventListener("open-pricing-modal", handleOpenPricing);
      window.removeEventListener("ai-plan-expired", handlePlanExpired);
    };
  }, []);

  // Sync Questions with Firestore
  const syncQuestionsFromFirestore = async (): Promise<number> => {
    try {
      console.log("[AppContext] Syncing questions with Firestore...");
      const rawCloudQuestions = await FirebaseService.getQuestions();
      if (rawCloudQuestions && rawCloudQuestions.length > 0) {
        const normalized = normalizeQuestionList(rawCloudQuestions);
        setQuestions((prevLocal) => {
          const map = new Map<string, Question>();
          // 1. Put local canonical questions
          for (const q of prevLocal) {
            map.set(q.id, q);
          }
          // 2. Overlay Firestore questions
          for (const cq of normalized) {
            map.set(cq.id, cq);
          }
          const merged = Array.from(map.values());
          StorageService.saveQuestions(merged);
          console.log(`[AppContext] Successfully synced ${merged.length} total questions (${normalized.length} from Firestore).`);
          return merged;
        });
        return normalized.length;
      }
    } catch (err) {
      console.warn("[AppContext] Error syncing questions from Firestore:", err);
    }
    return 0;
  };

  // Authentication actions
  const signInWithGoogle = async (): Promise<FirebaseUser> => {
    const userCred = await signInWithGooglePopup();
    return userCred;
  };

  const signInAnonymously = async (): Promise<FirebaseUser> => {
    const userCred = await signInAnonymouslyUser();
    return userCred;
  };

  const signInWithEmail = async (email: string, pass: string): Promise<FirebaseUser> => {
    const userCred = await loginWithEmail(email, pass);
    return userCred;
  };

  const signUpWithEmail = async (email: string, pass: string, name?: string): Promise<FirebaseUser> => {
    try {
      const userCred = await registerWithEmail(email, pass, name);
      return userCred;
    } catch (err) {
      setFirebaseUser(null);
      throw err;
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    await resetPasswordWithEmail(email);
  };

  const isGoogleProvider = Boolean(
    firebaseUser?.providerData?.some((p) => p.providerId === "google.com")
  );
  const isEmailVerified = Boolean(
    firebaseUser && (isGoogleProvider || firebaseUser.emailVerified)
  );

  const resendVerificationEmail = async (): Promise<void> => {
    await sendUserEmailVerification();
  };

  const reloadUserAuth = async (): Promise<boolean> => {
    const reloaded = await reloadCurrentUser();
    if (reloaded) {
      setFirebaseUser({ ...reloaded } as FirebaseUser);
      return Boolean(reloaded.emailVerified || isGoogleProvider);
    }
    return false;
  };

  const enterGuestMode = () => {
    setIsGuestMode(true);
    try {
      localStorage.setItem("praxis_guest_mode", "true");
    } catch (e) {
      console.warn("Could not persist guest mode:", e);
    }
  };

  const exitGuestMode = () => {
    setIsGuestMode(false);
    try {
      localStorage.removeItem("praxis_guest_mode");
    } catch (e) {
      console.warn("Could not clear guest mode:", e);
    }
  };

  const logout = async (): Promise<void> => {
    exitGuestMode();
    await signOutCurrentUser();
    setFirebaseUser(null);
  };

  // Keep user profile in sync with computed score
  useEffect(() => {
    setUser((prev) => {
      const updated = {
        ...prev,
        overallReadiness: readinessData.score,
        projectedPassScoreMin: readinessData.projectedMin,
        projectedPassScoreMax: readinessData.projectedMax,
      };
      StorageService.saveUserProfile(updated);
      if (firebaseUser && !isGuestMode) {
        FirebaseService.saveUserProfile(updated);
      }
      return updated;
    });
  }, [knowledgeGraph, attempts, firebaseUser, isGuestMode]);

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUser((prev) => {
      const updated = { ...prev, ...updates };
      StorageService.saveUserProfile(updated);
      if (firebaseUser && !isGuestMode) {
        FirebaseService.saveUserProfile(updated);
      }
      return updated;
    });
  };

  const addGuidelineAuditLog = (logData: Omit<GuidelineAuditLog, "id" | "timestamp">) => {
    const newLog: GuidelineAuditLog = {
      ...logData,
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    setGuidelineAuditLogs((prev) => [newLog, ...prev]);

    // Update question status in memory & storage
    setQuestions((prevQuestions) => {
      const updated = prevQuestions.map((q) => {
        if (q.id === logData.questionId || q.code === logData.questionCode) {
          if (q.guidelineUpdate) {
            return {
              ...q,
              guidelineUpdate: {
                ...q.guidelineUpdate,
                status: logData.newStatus,
                knowledgeLastReviewedAt: new Date().toISOString().split("T")[0],
                reviewedBy: logData.changedBy,
              },
            };
          }
        }
        return q;
      });
      StorageService.saveQuestions(updated);
      return updated;
    });
  };

  const approveGuidelineAlert = (alertId: string) => {
    setGuidelineAlerts((prev) =>
      prev.map((alert) => (alert.id === alertId ? { ...alert, status: "APPLIED" } : alert))
    );
  };

  const recordQuestionAttempt = (attemptData: Omit<QuestionAttempt, "id" | "timestamp">) => {
    const newAttempt: QuestionAttempt = {
      ...attemptData,
      id: `att-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    StorageService.addAttempt(newAttempt);
    setAttempts((prev) => [newAttempt, ...prev]);

    // Update Knowledge Node for this question's topic
    const question = questions.find((q) => q.id === attemptData.questionId);
    if (question) {
      const nextNodes = knowledgeGraph.map((node) => {
        if (node.name.toLowerCase().includes(question.topic.toLowerCase()) || node.area === question.area) {
          const delta = attemptData.isCorrect ? 3 : -2;
          const newMastery = Math.min(100, Math.max(10, node.userMastery + delta));
          return {
            ...node,
            userMastery: newMastery,
            totalQuestionsAnswered: node.totalQuestionsAnswered + 1,
            lastStudied: new Date().toISOString().split("T")[0],
          };
        }
        return node;
      });
      setKnowledgeGraph(nextNodes);
      StorageService.saveKnowledgeGraph(nextNodes);

      let createdCardId: string | undefined = undefined;

      // If user got it wrong, auto-generate a smart flashcard from the key finding & record Error Autopsy
      if (!attemptData.isCorrect) {
        createdCardId = `fc-auto-${Date.now()}`;
        const newCard: Flashcard = SpacedRepetitionService.createInitialFSRSCard({
          id: createdCardId,
          questionId: question.id,
          area: question.area,
          topic: question.subtopic || question.topic,
          front: `[Autópsia do Erro] ${question.keyFinding} — Qual é a conduta padrão-ouro no SUS?`,
          back: `${question.expectedConduct}\n\nJustificativa: ${question.inepIntent}`,
          keyMnemonic: question.brazilContextNote,
        });
        setFlashcards((prev) => {
          const updated = [newCard, ...prev];
          StorageService.saveFlashcards(updated);
          return updated;
        });

        // Persist Error Autopsy directly to Firestore 'errors' collection
        FirebaseService.recordErrorAutopsy({
          userId: user.id,
          question,
          attempt: newAttempt,
          userReflection: attemptData.userReflection,
          remedialCardId: createdCardId,
        });
      }

      // Sync updated progress to Firestore 'progress' collection
      FirebaseService.saveUserProgress({
        id: `progress_${user.id}`,
        userId: user.id,
        missionDate: new Date().toISOString().split("T")[0],
        todayMission,
        knowledgeGraphNodes: nextNodes,
        studyStreakDays: user.studyStreakDays,
        totalQuestionsSolved: user.totalQuestionsSolved + 1,
        overallReadiness: readinessData.score,
        projectedPassScoreMin: readinessData.projectedMin,
        projectedPassScoreMax: readinessData.projectedMax,
        flashcardStats: {
          total: flashcards.length + (createdCardId ? 1 : 0),
          dueToday: flashcards.filter((f) => new Date(f.dueDate) <= new Date()).length,
          mastered: flashcards.filter((f) => f.masteryLevel >= 80).length,
        },
        lastActiveDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const updateFlashcardScore = (cardId: string, rating: "EASY" | "MEDIUM" | "HARD" | "AGAIN") => {
    setFlashcards((prev) => {
      const updated = prev.map((card) => {
        if (card.id !== cardId) return card;
        return SpacedRepetitionService.scheduleFSRSReview(card, rating);
      });
      StorageService.saveFlashcards(updated);
      return updated;
    });
  };

  const generateCustomStudySession = (minutes: 15 | 30 | 60 | 120) => {
    const newMission = AdaptiveEngine.generateQuickSession(minutes, knowledgeGraph);
    setTodayMission(newMission);
    StorageService.saveTodayMission(newMission);
    FirebaseService.saveUserProgress({
      id: `progress_${user.id}`,
      userId: user.id,
      missionDate: new Date().toISOString().split("T")[0],
      todayMission: newMission,
      knowledgeGraphNodes: knowledgeGraph,
      studyStreakDays: user.studyStreakDays,
      totalQuestionsSolved: user.totalQuestionsSolved,
      overallReadiness: readinessData.score,
      projectedPassScoreMin: readinessData.projectedMin,
      projectedPassScoreMax: readinessData.projectedMax,
      lastActiveDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const refreshMissionTask = (taskIndex: number) => {
    setTodayMission((prev) => {
      const tasks = prev?.tasks ? [...prev.tasks] : [];
      if (tasks[taskIndex]) {
        tasks[taskIndex].completed = !tasks[taskIndex].completed;
      }
      const updated = { ...prev, tasks: tasks || [] };
      StorageService.saveTodayMission(updated);
      FirebaseService.saveUserProgress({
        id: `progress_${user?.id || "guest"}`,
        userId: user?.id || "guest",
        missionDate: new Date().toISOString().split("T")[0],
        todayMission: updated,
        knowledgeGraphNodes: knowledgeGraph || [],
        studyStreakDays: user?.studyStreakDays ?? 0,
        totalQuestionsSolved: user?.totalQuestionsSolved ?? 0,
        overallReadiness: readinessData?.score ?? 70,
        projectedPassScoreMin: readinessData?.projectedMin ?? 65,
        projectedPassScoreMax: readinessData?.projectedMax ?? 75,
        lastActiveDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return updated;
    });
  };

  const saveSessionToFirestore = async (session: TrainingSessionDoc) => {
    if (!firebaseUser?.uid) {
      // Guest and offline sessions remain strictly in local storage
      return;
    }
    await FirebaseService.saveTrainingSession({
      ...session,
      userId: firebaseUser.uid,
    });
  };

  const updateErrorAutopsyReflection = async (
    errorId: string,
    status: "PENDING_REVIEW" | "REMEDIATED" | "MASTERED",
    reflection?: string
  ) => {
    await FirebaseService.updateErrorAutopsyStatus(errorId, status, reflection);
  };

  const approveIneditaQuestion = (questionId: string, doctorName: string) => {
    setQuestions((prev) => {
      const updated = prev.map((q) => {
        if (q.id !== questionId) return q;
        const newVersionRecord = {
          version: (q.versions?.length || 0) + 1,
          changedBy: doctorName || "Médico Especialista Revisor",
          changeReason: "Aprovação médica e publicação no Banco Oficial de Inéditas",
          timestamp: new Date().toISOString(),
        };
        return {
          ...q,
          generationStatus: "PUBLISHED" as const,
          reviewStatus: "Aprovada e Publicada",
          clinicalVerifiedAt: new Date().toISOString().split("T")[0],
          verifiedByDoctor: doctorName || "Médico Especialista Revisor",
          officialStatus: "valid" as const,
          versions: [...(q.versions || []), newVersionRecord],
        };
      });
      StorageService.saveQuestions(updated);
      return updated;
    });
  };

  const rejectIneditaQuestion = (questionId: string, reason: string) => {
    setQuestions((prev) => {
      const updated = prev.map((q) => {
        if (q.id !== questionId) return q;
        return {
          ...q,
          generationStatus: "REJECTED" as const,
          reviewStatus: `Rejeitada: ${reason}`,
          officialStatus: "annulled" as const,
        };
      });
      StorageService.saveQuestions(updated);
      return updated;
    });
  };

  const editIneditaQuestion = (
    questionId: string,
    updates: Partial<Question>,
    reason: string,
    doctorName: string
  ) => {
    setQuestions((prev) => {
      const updated = prev.map((q) => {
        if (q.id !== questionId) return q;
        const versionRecord = {
          version: (q.versions?.length || 0) + 1,
          changedBy: doctorName || "Equipe Editorial Médica",
          changeReason: reason || "Ajuste editorial clínico",
          timestamp: new Date().toISOString(),
          previousStem: q.clinicalCase,
          previousCorrectAnswer: q.correctAnswer,
        };
        return {
          ...q,
          ...updates,
          versions: [...(q.versions || []), versionRecord],
        };
      });
      StorageService.saveQuestions(updated);
      return updated;
    });
  };

  const addGeneratedQuestion = (newQuestion: Question) => {
    setQuestions((prev) => {
      const updated = [newQuestion, ...prev];
      StorageService.saveQuestions(updated);
      return updated;
    });
  };

  const addBatchQuestions = (newQuestions: Question[]) => {
    setQuestions((prev) => {
      const existingIds = new Set(prev.map((q) => q.id));
      const existingFingerprints = new Set(prev.map((q) => q.questionFingerprint));
      const filtered = newQuestions.filter(
        (q) => !existingIds.has(q.id) && !existingFingerprints.has(q.questionFingerprint)
      );
      const updated = [...filtered, ...prev];
      StorageService.saveQuestions(updated);
      return updated;
    });
  };

  const resetUserData = () => {
    StorageService.resetUserData();
    setAttempts([]);
    setFlashcards([]);
    setKnowledgeGraph(StorageService.getKnowledgeGraph());
    setOsceAttempts([]);
    setTodayMission(StorageService.getTodayMission());
    setUser((prev) => ({
      ...prev,
      studyStreakDays: 0,
      totalQuestionsSolved: 0,
      overallReadiness: 0,
      projectedPassScoreMin: 0,
      projectedPassScoreMax: 0,
    }));
  };

  const resetAllData = () => {
    StorageService.resetAllLocalData();
    setUser(DEFAULT_USER);
    setAttempts([]);
    setFlashcards([]);
    setKnowledgeGraph(StorageService.getKnowledgeGraph());
    setOsceAttempts([]);
    setTodayMission(StorageService.getTodayMission());
  };

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        activeTab,
        setActiveTab,
        prefilledGenerationParams,
        setPrefilledGenerationParams,
        navigateToAiQuestionGenerator,
        questions,
        editionsInventory,
        guidelines,
        guidelineAlerts,
        guidelineAuditLogs,
        attempts,
        flashcards,
        knowledgeGraph,
        osceAttempts,
        todayMission,
        radarUpdates,
        activeQuestionIndex,
        setActiveQuestionIndex,
        questionFilterArea,
        setQuestionFilterArea,
        questionFilterYear,
        setQuestionFilterYear,
        questionFilterStatus,
        setQuestionFilterStatus,
        questionFilterOrigin,
        setQuestionFilterOrigin,
        questionMode,
        setQuestionMode,
        isStudyForMeOpen,
        setIsStudyForMeOpen,
        isExamConfigOpen,
        setIsExamConfigOpen,
        isOnboardingOpen,
        setIsOnboardingOpen,
        isWhatIfOpen,
        setIsWhatIfOpen,
        isSubscriptionModalOpen,
        setIsSubscriptionModalOpen,
        isOfficialSearchOpen,
        setIsOfficialSearchOpen,
        officialSearchQuery,
        setOfficialSearchQuery,
        openOfficialSearch,
        selectedOSCEId,
        setSelectedOSCEId,
        isDarkMode,
        setIsDarkMode,
        recordQuestionAttempt,
        updateFlashcardScore,
        generateCustomStudySession,
        refreshMissionTask,
        updateUserProfile,
        addGuidelineAuditLog,
        approveGuidelineAlert,
        approveIneditaQuestion,
        rejectIneditaQuestion,
        editIneditaQuestion,
        addGeneratedQuestion,
        addBatchQuestions,
        saveSessionToFirestore,
        updateErrorAutopsyReflection,
        syncQuestionsFromFirestore,
        readinessData,
        resetUserData,
        resetAllData,
        firebaseUser,
        isAuthLoading,
        isGuestMode,
        isGoogleProvider,
        isEmailVerified,
        resendVerificationEmail,
        reloadUserAuth,
        enterGuestMode,
        exitGuestMode,
        signInWithGoogle,
        signInAnonymously,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
