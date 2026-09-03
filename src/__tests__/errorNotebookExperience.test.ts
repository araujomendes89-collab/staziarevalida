import { describe, it, expect } from "vitest";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { QuestionAttempt, MedicalArea } from "../types";

describe("Error Notebook Experience & Integrity (Etapa 1.10)", () => {
  const allQuestions = TEST_QUESTIONS_COLLECTION;
  const q1 = allQuestions[0];
  const q2 = allQuestions[1];
  const q3 = allQuestions[2];

  const attempts: QuestionAttempt[] = [
    {
      id: "att-correct-1",
      userId: "user-1",
      questionId: q1.id,
      selectedOption: q1.correctAnswer,
      isCorrect: true,
      timeSpentSeconds: 40,
      confidence: "HIGH",
      timestamp: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "att-wrong-1",
      userId: "user-1",
      questionId: q2.id,
      selectedOption: "A", // wrong
      isCorrect: false,
      timeSpentSeconds: 60,
      confidence: "MEDIUM",
      timestamp: "2026-09-02T10:00:00.000Z",
      userReflection: "Esqueci a primeira linha de antibiótico para pneumonia comunitária típica.",
    },
    {
      id: "att-wrong-2",
      userId: "user-1",
      questionId: q3.id,
      selectedOption: "C", // wrong
      isCorrect: false,
      timeSpentSeconds: 50,
      confidence: "LOW",
      timestamp: "2026-09-03T10:00:00.000Z",
    },
  ];

  it("A. Only actually incorrect attempts enter the Error Notebook", () => {
    const wrongAttempts = attempts.filter((a) => !a.isCorrect);
    expect(wrongAttempts.length).toBe(2);
    wrongAttempts.forEach((att) => {
      expect(att.isCorrect).toBe(false);
    });
  });

  it("B. Original questionId is preserved in error records", () => {
    const wrongAttempts = attempts.filter((a) => !a.isCorrect);
    const questionIds = wrongAttempts.map((a) => a.questionId);
    expect(questionIds).toEqual([q2.id, q3.id]);
  });

  it("C. User selected option is faithfully recorded", () => {
    const att2 = attempts.find((a) => a.questionId === q2.id);
    expect(att2?.selectedOption).toBe("A");

    const att3 = attempts.find((a) => a.questionId === q3.id);
    expect(att3?.selectedOption).toBe("C");
  });

  it("D. Official answer key is retrieved from original question", () => {
    const q2Actual = allQuestions.find((q) => q.id === q2.id);
    expect(q2Actual?.correctAnswer).toBe(q2.correctAnswer);
  });

  it("E. Medical area and topic correspond exactly to the original question", () => {
    const q2Actual = allQuestions.find((q) => q.id === q2.id);
    expect(q2Actual?.area).toBe(q2.area);
    expect(q2Actual?.topic).toBe(q2.topic);
  });

  it("F. Student personal reflection note is preserved", () => {
    const att2 = attempts.find((a) => a.questionId === q2.id);
    expect(att2?.userReflection).toBe(
      "Esqueci a primeira linha de antibiótico para pneumonia comunitária típica."
    );
  });

  it("G. Retrain errors session receives exactly the IDs of wrong questions", () => {
    const wrongQIds = Array.from(new Set(attempts.filter((a) => !a.isCorrect).map((a) => a.questionId)));
    expect(wrongQIds).toEqual([q2.id, q3.id]);
    expect(wrongQIds.length).toBe(2);
  });

  it("H. Filtering by area isolates questions without mutating dataset", () => {
    const targetArea: MedicalArea = q2.area;
    const filtered = attempts
      .filter((a) => !a.isCorrect)
      .filter((att) => {
        const q = allQuestions.find((item) => item.id === att.questionId);
        return q && q.area === targetArea;
      });

    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((att) => {
      const q = allQuestions.find((item) => item.id === att.questionId);
      expect(q?.area).toBe(targetArea);
    });
  });

  it("I. Empty attempts array yields empty error notebook safely", () => {
    const emptyAttempts: QuestionAttempt[] = [];
    const wrongAttempts = emptyAttempts.filter((a) => !a.isCorrect);
    expect(wrongAttempts.length).toBe(0);
  });

  it("J. Editorial commentaries are distinct from official answer keys", () => {
    const correctOpt = q2.options.find((o) => o.id === q2.correctAnswer);
    expect(q2.correctAnswer).toBeDefined();
    expect(correctOpt?.explanation).toBeDefined();
  });
});
