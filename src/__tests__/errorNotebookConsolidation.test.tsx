import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildErrorCases,
  filterErrorCases,
  sortErrorCases,
} from "../services/errorNotebookService";
import { ErrorNotebookView } from "../components/errors/ErrorNotebookView";
import { Question, QuestionAttempt, MedicalArea } from "../types";
import * as AppContextModule from "../context/AppContext";

// Mock question generator
function mockQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    canonicalQuestionId: id,
    questionFingerprint: `fp-${id}`,
    code: `REV-${id}`,
    origin: "OFICIAL_INEP" as any,
    examYear: 2025,
    examEdition: "Revalida INEP 2025/1",
    area: "PEDIATRIA" as MedicalArea,
    topic: "Bronquiolite Viral Aguda",
    subtopic: "Critérios de Internação",
    competencyId: "comp-1",
    competencyDescription: "Pediatria clínica",
    difficulty: "MEDIO",
    clinicalCase: `Caso clínico de exemplo para questão ${id}. Lactente apresentando taquipneia.`,
    options: [
      { id: "A", text: "Opção A", isCorrect: false, explanation: "Incorreta" },
      { id: "B", text: "Opção B", isCorrect: false, explanation: "Incorreta" },
      { id: "C", text: "Opção C", isCorrect: false, explanation: "Incorreta" },
      { id: "D", text: "Opção D", isCorrect: true, explanation: "Conduta ouro: suporte de oxigênio e hidratação." },
    ],
    correctAnswer: "D",
    answerFinal: "D",
    officialStatus: "valid",
    extractionConfidence: "HIGH",
    ...overrides,
  };
}

// Mock attempt generator
function mockAttempt(
  id: string,
  questionId: string,
  isCorrect: boolean,
  timestamp: string,
  selectedOption: "A" | "B" | "C" | "D" = "B"
): QuestionAttempt {
  return {
    id,
    questionId,
    timestamp,
    selectedOption,
    isCorrect,
    timeSpentSeconds: 45,
    confidence: "MEDIUM" as any,
    mode: "STUDY",
  };
}

describe("Error Notebook Derived Model & Consolidation (Etapa 1.21B)", () => {
  const q1 = mockQuestion("q1", { area: "PEDIATRIA", topic: "Bronquiolite" });
  const q2 = mockQuestion("q2", { area: "PEDIATRIA", topic: "Bronquiolite" });
  const q3 = mockQuestion("q3", { area: "CLINICA_MEDICA", topic: "Hipertensão", examYear: 2024 });

  const questions = [q1, q2, q3];

  it("1. Consolidates multiple wrong attempts of same question into single ErrorCase while preserving attempt count", () => {
    // 3 wrong attempts on Q1
    const rawAttempts: QuestionAttempt[] = [
      mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
      mockAttempt("att-2", "q1", false, "2025-08-15T10:00:00.000Z", "B"),
      mockAttempt("att-3", "q1", false, "2025-08-20T10:00:00.000Z", "C"),
    ];

    const errorCases = buildErrorCases(rawAttempts, questions);

    expect(rawAttempts.length).toBe(3); // Storage preserved
    expect(errorCases.length).toBe(1); // Derived unique case
    expect(errorCases[0].questionId).toBe("q1");
    expect(errorCases[0].wrongAttemptCount).toBe(3);
    expect(errorCases[0].allAttempts.length).toBe(3);
    expect(errorCases[0].isRemediated).toBe(false);
    expect(errorCases[0].firstErrorAt).toBe("2025-08-10T10:00:00.000Z");
    expect(errorCases[0].lastErrorAt).toBe("2025-08-20T10:00:00.000Z");
    expect(errorCases[0].latestWrongAttempt.selectedOption).toBe("C");
  });

  it("2. Does NOT consolidate different questions that share the same topic and area (Identity Safety Rule)", () => {
    const rawAttempts: QuestionAttempt[] = [
      mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
      mockAttempt("att-2", "q2", false, "2025-08-10T10:00:00.000Z", "B"),
    ];

    const errorCases = buildErrorCases(rawAttempts, questions);

    expect(errorCases.length).toBe(2);
    expect(errorCases.map((ec) => ec.questionId)).toEqual(["q1", "q2"]);
  });

  it("3. Marks ErrorCase as remediated (Superado) only when a correct attempt occurs AFTER the last error", () => {
    // Q1: Error on 10/08, Error on 15/08, Correct on 22/08
    const rawAttempts: QuestionAttempt[] = [
      mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
      mockAttempt("att-2", "q1", false, "2025-08-15T10:00:00.000Z", "B"),
      mockAttempt("att-3", "q1", true, "2025-08-22T10:00:00.000Z", "D"),
    ];

    const errorCases = buildErrorCases(rawAttempts, questions);

    expect(errorCases.length).toBe(1);
    expect(errorCases[0].wrongAttemptCount).toBe(2);
    expect(errorCases[0].allAttempts.length).toBe(3);
    expect(errorCases[0].isRemediated).toBe(true);
    expect(errorCases[0].laterCorrectAttempt?.id).toBe("att-3");
  });

  it("4. Temporality Rule: Correct attempt BEFORE a subsequent error does NOT mark it as remediated", () => {
    // Q1: Correct on 05/08, then Error on 10/08
    const rawAttempts: QuestionAttempt[] = [
      mockAttempt("att-1", "q1", true, "2025-08-05T10:00:00.000Z", "D"),
      mockAttempt("att-2", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
    ];

    const errorCases = buildErrorCases(rawAttempts, questions);

    expect(errorCases.length).toBe(1);
    expect(errorCases[0].isRemediated).toBe(false); // Still active error!
    expect(errorCases[0].laterCorrectAttempt).toBeUndefined();
  });

  it("5. Filters ErrorCases accurately across Status, Area, Year, and Search Query", () => {
    const rawAttempts: QuestionAttempt[] = [
      // Q1 (Pediatria, 2025): Pending error
      mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
      // Q2 (Pediatria, 2025): Remediated error
      mockAttempt("att-2", "q2", false, "2025-08-10T10:00:00.000Z", "A"),
      mockAttempt("att-3", "q2", true, "2025-08-15T10:00:00.000Z", "D"),
      // Q3 (Clinica Medica, 2024): Pending error
      mockAttempt("att-4", "q3", false, "2025-08-12T10:00:00.000Z", "B"),
    ];

    const allCases = buildErrorCases(rawAttempts, questions);
    expect(allCases.length).toBe(3);

    // Status: PENDING (Default view)
    const pendingCases = filterErrorCases(allCases, {
      statusFilter: "PENDING",
      areaFilter: "ALL",
    });
    expect(pendingCases.length).toBe(2);
    expect(pendingCases.map((ec) => ec.questionId)).toEqual(["q1", "q3"]);

    // Status: REMEDIATED (Superados)
    const remediatedCases = filterErrorCases(allCases, {
      statusFilter: "REMEDIATED",
      areaFilter: "ALL",
    });
    expect(remediatedCases.length).toBe(1);
    expect(remediatedCases[0].questionId).toBe("q2");

    // Area: PEDIATRIA
    const pedCases = filterErrorCases(allCases, {
      statusFilter: "ALL",
      areaFilter: "PEDIATRIA",
    });
    expect(pedCases.length).toBe(2);

    // Year: 2024
    const year2024Cases = filterErrorCases(allCases, {
      statusFilter: "ALL",
      areaFilter: "ALL",
      yearFilter: 2024,
    });
    expect(year2024Cases.length).toBe(1);
    expect(year2024Cases[0].questionId).toBe("q3");

    // Search Query
    const searchCases = filterErrorCases(allCases, {
      statusFilter: "ALL",
      areaFilter: "ALL",
      searchQuery: "Hipertensão",
    });
    expect(searchCases.length).toBe(1);
    expect(searchCases[0].questionId).toBe("q3");
  });

  it("6. Sorts ErrorCases deterministically (Newest, Oldest, Most Errors)", () => {
    const rawAttempts: QuestionAttempt[] = [
      mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
      mockAttempt("att-2", "q1", false, "2025-08-25T10:00:00.000Z", "B"), // q1 last: 25/08, 2 errors
      mockAttempt("att-3", "q2", false, "2025-08-01T10:00:00.000Z", "A"), // q2 last: 01/08, 1 error
      mockAttempt("att-4", "q3", false, "2025-08-15T10:00:00.000Z", "C"),
      mockAttempt("att-5", "q3", false, "2025-08-16T10:00:00.000Z", "C"),
      mockAttempt("att-6", "q3", false, "2025-08-17T10:00:00.000Z", "C"), // q3 last: 17/08, 3 errors
    ];

    const allCases = buildErrorCases(rawAttempts, questions);

    const newest = sortErrorCases(allCases, "NEWEST");
    expect(newest.map((ec) => ec.questionId)).toEqual(["q1", "q3", "q2"]);

    const oldest = sortErrorCases(allCases, "OLDEST");
    expect(oldest.map((ec) => ec.questionId)).toEqual(["q2", "q1", "q3"]);

    const mostErrors = sortErrorCases(allCases, "MOST_ERRORS");
    expect(mostErrors.map((ec) => ec.questionId)).toEqual(["q3", "q1", "q2"]);
  });

  it("7. Preserves user reflection text and links to autopsy if available", () => {
    const rawAttempts: QuestionAttempt[] = [
      mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
    ];

    const autopsies = [
      {
        id: "att-1",
        questionId: "q1",
        userId: "user-1",
        userReflection: "Esqueci a tríade clássica",
        resolutionStatus: "PENDING" as const,
        errorTaxonomy: "KNOWLEDGE_GAP" as any,
        createdAt: "2025-08-10T10:00:00.000Z",
        updatedAt: "2025-08-10T10:00:00.000Z",
      },
    ];

    const allCases = buildErrorCases(rawAttempts, questions, autopsies);
    expect(allCases[0].reflection).toBe("Esqueci a tríade clássica");
  });
});

describe("ErrorNotebookView UI Component", () => {
  const q1 = mockQuestion("q1", { area: "PEDIATRIA", topic: "Bronquiolite Viral Aguda" });
  const q2 = mockQuestion("q2", { area: "CIRURGIA_GERAL", topic: "Apendicite Aguda" });
  const questions = [q1, q2];

  const attempts: QuestionAttempt[] = [
    mockAttempt("att-1", "q1", false, "2025-08-10T10:00:00.000Z", "A"),
    mockAttempt("att-2", "q1", false, "2025-08-15T10:00:00.000Z", "B"),
    mockAttempt("att-3", "q2", false, "2025-08-10T10:00:00.000Z", "A"),
    mockAttempt("att-4", "q2", true, "2025-08-20T10:00:00.000Z", "D"),
  ];

  beforeEach(() => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      attempts,
      questions,
      errorAutopsies: [],
      updateErrorAutopsyReflection: vi.fn(),
      setActiveTab: vi.fn(),
      setQuestionMode: vi.fn(),
    } as any);
  });

  it("renders consolidated ErrorCases with proper KPIs and status tabs", () => {
    render(<ErrorNotebookView />);

    // Header
    expect(screen.getByText("Caderno de Erros")).toBeDefined();

    // Default Tab is "Para Revisar (1)" because Q1 is pending and Q2 is superado
    expect(screen.getByText(/Para Revisar \(1\)/)).toBeDefined();
    expect(screen.getByText(/Superados \(1\)/)).toBeDefined();
    expect(screen.getByText(/Todos \(2\)/)).toBeDefined();

    // Q1 should display "Errou 2 vezes" badge
    expect(screen.getByText(/Errou 2 vezes/)).toBeDefined();

    // Q1 is visible in default "Para Revisar"
    expect(screen.getByText(/Bronquiolite Viral Aguda/)).toBeDefined();

    // Answer comparison in preview
    expect(screen.getByText(/Marcou B/)).toBeDefined();
  });

  it("switches to Superados tab and displays remediated questions", () => {
    render(<ErrorNotebookView />);

    const superadosTab = screen.getByText(/Superados \(1\)/);
    fireEvent.click(superadosTab);

    // Q2 is superado
    expect(screen.getByText(/Apendicite Aguda/)).toBeDefined();
    expect(screen.getAllByText(/Superado/).length).toBeGreaterThanOrEqual(1);
  });
});
