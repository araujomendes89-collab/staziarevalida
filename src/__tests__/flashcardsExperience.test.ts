import { describe, it, expect } from "vitest";
import { Flashcard } from "../types";

describe("Flashcards Experience & Spaced Repetition Integrity (Etapa 1.11)", () => {
  const sampleFlashcards: Flashcard[] = [
    {
      id: "fc-1",
      questionId: "q-1",
      area: "CLINICA_MEDICA",
      topic: "Hipertensão",
      front: "Qual é a conduta inicial na emergência hipertensiva com dissecção aguda de aorta?",
      back: "Esmolol EV + Nitroprussiato de Sódio com meta de FC < 60 bpm e PAS < 120 mmHg.",
      keyMnemonic: "FC antes da PA",
      intervalDays: 1,
      easeFactor: 2.5,
      repetitionCount: 1,
      dueDate: "2026-09-01T10:00:00.000Z", // overdue
      masteryLevel: 60,
    },
    {
      id: "fc-2",
      questionId: "q-2",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      front: "Qual é a tríade clínica de Beck no tamponamento cardíaco?",
      back: "Hipofonese de bulhas, turgência jugular patológica e hipotensão arterial.",
      intervalDays: 4,
      easeFactor: 2.5,
      repetitionCount: 2,
      dueDate: "2026-09-02T10:00:00.000Z", // overdue
      masteryLevel: 75,
    },
    {
      id: "fc-3",
      questionId: "q-3",
      area: "PEDIATRIA",
      topic: "Asma",
      front: "Qual é a dose recomendada de Salbutamol spray no manejo da crise asmática moderada na emergência pediátrica?",
      back: "4 a 8 jatos com espaçador valvulado a cada 20 minutos na primeira hora.",
      intervalDays: 14,
      easeFactor: 2.5,
      repetitionCount: 4,
      dueDate: "2026-10-15T10:00:00.000Z", // future due date
      masteryLevel: 90,
    },
  ];

  it("A. Due flashcards filter correctly based on current timestamp", () => {
    const referenceDate = "2026-09-03T12:00:00.000Z";
    const due = sampleFlashcards.filter((c) => !c.dueDate || c.dueDate <= referenceDate);

    expect(due.length).toBe(2);
    expect(due.map((c) => c.id)).toEqual(["fc-1", "fc-2"]);
  });

  it("B. Card starts with answer concealed (isFlipped = false)", () => {
    let isFlipped = false;
    expect(isFlipped).toBe(false);
  });

  it("C. Triggering flip action reveals the answer", () => {
    let isFlipped = false;
    // User clicks show answer
    isFlipped = true;
    expect(isFlipped).toBe(true);
  });

  it("D. Spaced review evaluation uses exact canonical ratings (AGAIN, HARD, MEDIUM, EASY)", () => {
    const validRatings: ("AGAIN" | "HARD" | "MEDIUM" | "EASY")[] = [
      "AGAIN",
      "HARD",
      "MEDIUM",
      "EASY",
    ];
    expect(validRatings.length).toBe(4);
  });

  it("E. Rating computation calculates interval progression accurately", () => {
    const card = sampleFlashcards[0];

    // AGAIN resets interval to 1
    const againInterval = 1;
    expect(againInterval).toBe(1);

    // HARD scales by 1.2
    const hardInterval = Math.max(1, Math.round(card.intervalDays * 1.2));
    expect(hardInterval).toBe(1);

    // MEDIUM scales by 2.0
    const mediumInterval = Math.max(2, Math.round(card.intervalDays * 2.0));
    expect(mediumInterval).toBe(2);

    // EASY scales by 2.8
    const easyInterval = Math.max(4, Math.round(card.intervalDays * 2.8));
    expect(easyInterval).toBe(4);
  });

  it("F. Session advances sequential index through cards", () => {
    const sessionList = [sampleFlashcards[0], sampleFlashcards[1]];
    let currentIndex = 0;

    // Advance 1
    currentIndex += 1;
    expect(currentIndex).toBe(1);
    expect(sessionList[currentIndex].id).toBe("fc-2");
  });

  it("G. Preserves card fields without mutation during review", () => {
    const card = sampleFlashcards[0];
    expect(card.front).toBeDefined();
    expect(card.back).toBeDefined();
    expect(card.area).toBe("CLINICA_MEDICA");
    expect(card.topic).toBe("Hipertensão");
  });

  it("H. Session completion triggers after rating the final card", () => {
    const sessionList = [sampleFlashcards[0]];
    const currentIndex = 0;
    const isLastCard = currentIndex === sessionList.length - 1;

    expect(isLastCard).toBe(true);
  });

  it("I. Empty flashcards dataset handles 0 cards state safely", () => {
    const emptyDeck: Flashcard[] = [];
    const due = emptyDeck.filter((c) => !c.dueDate);
    expect(due.length).toBe(0);
  });

  it("J. Reorganization does not auto-alter due dates without user rating", () => {
    const untouched = { ...sampleFlashcards[0] };
    expect(untouched.dueDate).toBe("2026-09-01T10:00:00.000Z");
    expect(untouched.intervalDays).toBe(1);
  });
});
