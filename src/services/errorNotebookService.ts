import { Question, QuestionAttempt, MedicalArea, ErrorAutopsyDoc } from "../types";

export interface ErrorCase {
  questionId: string;
  question: Question;
  wrongAttempts: QuestionAttempt[];
  allAttempts: QuestionAttempt[];
  wrongAttemptCount: number;
  totalAttemptCount: number;
  firstErrorAt: string;
  lastErrorAt: string;
  latestWrongAttempt: QuestionAttempt;
  latestAttempt: QuestionAttempt;
  laterCorrectAttempt?: QuestionAttempt;
  isRemediated: boolean;
  reflection: string;
  recurrentTopicErrorCount: number;
}

export type ErrorNotebookStatusFilter = "PENDING" | "REMEDIATED" | "ALL";
export type ErrorNotebookSortOption = "NEWEST" | "OLDEST" | "MOST_ERRORS";

export interface QuestionAnswerProvenance {
  compactLabel: string;
  detailedLabel: string;
  isOfficial: boolean;
  isAnnulled: boolean;
  isProvisional: boolean;
  isChangedAfterAppeal: boolean;
  displayAnswerText: string;
}

/**
 * Normalizes and derives the appropriate, honest answer label based on question provenance & status.
 * Prevents non-official/editorial questions from falsely claiming to be an "Official INEP Answer Key".
 */
export function getQuestionAnswerProvenance(question?: Partial<Question> | null): QuestionAnswerProvenance {
  if (!question) {
    return {
      compactLabel: "Resposta correta",
      detailedLabel: "Resposta Correta",
      isOfficial: false,
      isAnnulled: false,
      isProvisional: false,
      isChangedAfterAppeal: false,
      displayAnswerText: "Resposta Correta",
    };
  }

  const origin = (question.origin || "").toUpperCase();
  const isOfficial = origin === "INEP_OFICIAL" || origin === "OFICIAL_INEP" || origin === "INEP";
  const status = (question.officialStatus || "").toLowerCase();
  const isAnnulled =
    status === "annulled" ||
    question.answerFinal === "ANNULLED" ||
    (question.correctAnswer as string) === "ANNULLED";
  const isProvisional =
    status === "pending_validation" ||
    (Boolean(question.answerPreliminary) && !question.answerFinal && status !== "valid");
  const isChangedAfterAppeal = status === "changed_after_appeal";

  const answerLetter = question.correctAnswer || question.options?.find((o) => o.isCorrect)?.id || "-";
  const displayAnswerText = isAnnulled ? "Anulada pela Banca" : `Alternativa ${answerLetter}`;

  if (isAnnulled) {
    return {
      compactLabel: "Status",
      detailedLabel: isOfficial ? "Questão Anulada (INEP)" : "Questão Anulada",
      isOfficial,
      isAnnulled: true,
      isProvisional: false,
      isChangedAfterAppeal: false,
      displayAnswerText: "Anulada pela Banca",
    };
  }

  if (isOfficial) {
    if (isProvisional) {
      return {
        compactLabel: "Gabarito preliminar",
        detailedLabel: "Gabarito Preliminar (INEP)",
        isOfficial: true,
        isAnnulled: false,
        isProvisional: true,
        isChangedAfterAppeal: false,
        displayAnswerText,
      };
    }
    if (isChangedAfterAppeal) {
      return {
        compactLabel: "Gabarito pós-recurso",
        detailedLabel: "Gabarito Oficial (Pós-Recurso)",
        isOfficial: true,
        isAnnulled: false,
        isProvisional: false,
        isChangedAfterAppeal: true,
        displayAnswerText,
      };
    }
    return {
      compactLabel: "Gabarito oficial",
      detailedLabel: "Gabarito Oficial (INEP)",
      isOfficial: true,
      isAnnulled: false,
      isProvisional: false,
      isChangedAfterAppeal: false,
      displayAnswerText,
    };
  }

  if (origin.includes("INEDITA") || origin.includes("EDITORIAL")) {
    return {
      compactLabel: "Resposta correta",
      detailedLabel: "Resposta Correta (Gabarito Editorial)",
      isOfficial: false,
      isAnnulled: false,
      isProvisional: false,
      isChangedAfterAppeal: false,
      displayAnswerText,
    };
  }

  if (origin.includes("AI") || origin.includes("PLATFORM")) {
    return {
      compactLabel: "Resposta esperada",
      detailedLabel: "Resposta Esperada",
      isOfficial: false,
      isAnnulled: false,
      isProvisional: false,
      isChangedAfterAppeal: false,
      displayAnswerText,
    };
  }

  // Safe fallback (fail-safe for unknown origin)
  return {
    compactLabel: "Resposta correta",
    detailedLabel: "Resposta Correta",
    isOfficial: false,
    isAnnulled: false,
    isProvisional: false,
    isChangedAfterAppeal: false,
    displayAnswerText,
  };
}

/**
 * Pure selector that transforms raw question attempts into consolidated ErrorCase view models.
 * Preserves the factual attempt history while providing an active remediation view.
 */
export function buildErrorCases(
  attempts: QuestionAttempt[],
  questions: Question[],
  errorAutopsies: ErrorAutopsyDoc[] = [],
  reflectionTexts: Record<string, string> = {}
): ErrorCase[] {
  const qMap = new Map<string, Question>(questions.map((q) => [q.id, q]));

  // Pre-calculate topic error counts across all raw wrong attempts
  const topicCounts: Record<string, number> = {};
  for (const att of attempts) {
    if (!att.isCorrect) {
      const q = qMap.get(att.questionId);
      const topic = q?.topic || "Geral";
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }

  // Group attempts by questionId (Authoritative identity key)
  const attemptsByQuestion = new Map<string, QuestionAttempt[]>();
  for (const att of attempts) {
    const list = attemptsByQuestion.get(att.questionId) || [];
    list.push(att);
    attemptsByQuestion.set(att.questionId, list);
  }

  const errorCases: ErrorCase[] = [];

  for (const [questionId, qAttempts] of attemptsByQuestion.entries()) {
    const question = qMap.get(questionId);
    if (!question) continue;

    // Chronological order (oldest to newest)
    const sortedAsc = [...qAttempts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const wrongAttempts = sortedAsc.filter((a) => !a.isCorrect);
    if (wrongAttempts.length === 0) continue;

    const firstErrorAt = wrongAttempts[0].timestamp;
    const latestWrongAttempt = wrongAttempts[wrongAttempts.length - 1];
    const lastErrorAt = latestWrongAttempt.timestamp;
    const latestAttempt = sortedAsc[sortedAsc.length - 1];

    // Check if there is a correct attempt occurring AFTER the latest wrong attempt
    const latestWrongTime = new Date(latestWrongAttempt.timestamp).getTime();
    const laterCorrectAttempt = sortedAsc.find(
      (a) => a.isCorrect && new Date(a.timestamp).getTime() > latestWrongTime
    );

    const autopsy = errorAutopsies.find(
      (ea) => ea.questionId === questionId || ea.id === latestWrongAttempt.id
    );

    const isRemediated =
      Boolean(laterCorrectAttempt) ||
      autopsy?.resolutionStatus === "REMEDIATED" ||
      autopsy?.resolutionStatus === "MASTERED";

    // Reflection text priority: local user edit > autopsy doc > attempt record
    const reflection =
      reflectionTexts[latestWrongAttempt.id] ??
      reflectionTexts[questionId] ??
      autopsy?.userReflection ??
      latestWrongAttempt.userReflection ??
      "";

    const topic = question.topic || "Geral";

    errorCases.push({
      questionId,
      question,
      wrongAttempts,
      allAttempts: sortedAsc,
      wrongAttemptCount: wrongAttempts.length,
      totalAttemptCount: sortedAsc.length,
      firstErrorAt,
      lastErrorAt,
      latestWrongAttempt,
      latestAttempt,
      laterCorrectAttempt,
      isRemediated,
      reflection,
      recurrentTopicErrorCount: topicCounts[topic] || 0,
    });
  }

  return errorCases;
}

/**
 * Filter ErrorCases by status, medical area, exam year, and search term.
 */
export function filterErrorCases(
  errorCases: ErrorCase[],
  options: {
    statusFilter: ErrorNotebookStatusFilter;
    areaFilter: MedicalArea | "ALL";
    yearFilter?: number | "ALL";
    searchQuery?: string;
  }
): ErrorCase[] {
  const { statusFilter, areaFilter, yearFilter = "ALL", searchQuery = "" } = options;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return errorCases.filter((ec) => {
    // Status Filter
    if (statusFilter === "PENDING" && ec.isRemediated) return false;
    if (statusFilter === "REMEDIATED" && !ec.isRemediated) return false;

    // Area Filter
    if (areaFilter !== "ALL" && ec.question.area !== areaFilter) return false;

    // Year Filter
    if (yearFilter !== "ALL" && ec.question.examYear !== yearFilter) return false;

    // Search Query Filter
    if (normalizedQuery) {
      const q = ec.question;
      const matchesTopic = q.topic?.toLowerCase().includes(normalizedQuery);
      const matchesSubtopic = q.subtopic?.toLowerCase().includes(normalizedQuery);
      const matchesCase = q.clinicalCase?.toLowerCase().includes(normalizedQuery);
      const matchesCode = q.code?.toLowerCase().includes(normalizedQuery);
      const matchesEdition = q.examEdition?.toLowerCase().includes(normalizedQuery);

      if (!matchesTopic && !matchesSubtopic && !matchesCase && !matchesCode && !matchesEdition) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort ErrorCases deterministically.
 */
export function sortErrorCases(
  errorCases: ErrorCase[],
  sortOption: ErrorNotebookSortOption
): ErrorCase[] {
  return [...errorCases].sort((a, b) => {
    if (sortOption === "NEWEST") {
      return new Date(b.lastErrorAt).getTime() - new Date(a.lastErrorAt).getTime();
    }
    if (sortOption === "OLDEST") {
      return new Date(a.firstErrorAt).getTime() - new Date(b.firstErrorAt).getTime();
    }
    if (sortOption === "MOST_ERRORS") {
      if (b.wrongAttemptCount !== a.wrongAttemptCount) {
        return b.wrongAttemptCount - a.wrongAttemptCount;
      }
      return new Date(b.lastErrorAt).getTime() - new Date(a.lastErrorAt).getTime();
    }
    return 0;
  });
}
