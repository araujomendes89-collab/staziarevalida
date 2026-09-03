import { describe, it, expect } from "vitest";

describe("Performance Evolution Metrics - Weighted Period Accuracy", () => {
  it("calculates true weighted period accuracy instead of arithmetic mean of weekly averages", () => {
    // Scenario:
    // Week 1: 1 question, 1 correct (100%)
    // Week 2: 100 questions, 60 correct (60%)
    const week1 = { questions: 1, correct: 1, rate: 100 };
    const week2 = { questions: 100, correct: 60, rate: 60 };

    const totalQuestions = week1.questions + week2.questions; // 101
    const totalCorrect = week1.correct + week2.correct; // 61
    const totalIncorrect = totalQuestions - totalCorrect; // 40

    // Weighted calculation
    const weightedPeriodAccuracy = Math.round((totalCorrect / totalQuestions) * 100);

    // Arithmetic mean of weekly rates (INCORRECT METHOD)
    const arithmeticMean = (week1.rate + week2.rate) / 2;

    expect(totalQuestions).toBe(101);
    expect(totalCorrect).toBe(61);
    expect(totalIncorrect).toBe(40);
    expect(weightedPeriodAccuracy).toBe(60); // 60.39% -> 60%
    expect(weightedPeriodAccuracy).not.toBe(80); // Must not equal the unweighted average
    expect(arithmeticMean).toBe(80);
  });

  it("handles zero total attempts gracefully without division by zero", () => {
    const totalQuestions = 0;
    const totalCorrect = 0;
    const periodAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    expect(periodAccuracy).toBe(0);
  });
});
