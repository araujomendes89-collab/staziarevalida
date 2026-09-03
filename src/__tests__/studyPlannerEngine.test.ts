import { describe, it, expect } from "vitest";
import {
  StudyPlannerEngine,
  PPS_CONFIG,
  TopicPriorityInput,
} from "../services/studyPlannerEngine";

describe("StudyPlannerEngine & PPS Mathematical Unit Tests (Etapa 1.14D)", () => {
  const defaultTopic: TopicPriorityInput = {
    id: "top-test-1",
    name: "Pré-Eclâmpsia e Eclâmpsia",
    area: "GINECOLOGIA_OBSTETRICIA",
    irs: 90,
    mastery: 50,
    attempts: 10,
    daysSinceLastReview: 7,
    stabilityDays: 5,
  };

  describe("1. Sample Size & Confidence-Adjusted Deficit", () => {
    it("A. Zero attempts returns neutral prior deficit (50%)", () => {
      const topicZeroAttempts: TopicPriorityInput = {
        ...defaultTopic,
        attempts: 0,
        mastery: 0,
      };

      const result = StudyPlannerEngine.calculateTopicPriorities([topicZeroAttempts], 60);
      expect(result).toHaveLength(1);
      // Deficit = 50, IRS = 90, ForgettingRisk = 13% (R=0.868)
      // rawScore = (90 * 0.40) + (50 * 0.35) + (13 * 0.25) = 36 + 17.5 + 3.25 = 56.75 => 57
      expect(result[0].finalPpsScore).toBe(57);
    });

    it("B. 1 attempt has low confidence and stays close to prior", () => {
      const topicOneAttempt: TopicPriorityInput = {
        ...defaultTopic,
        attempts: 1,
        mastery: 0, // observedDeficit = 100
      };

      // sampleConfidence = 1 / (1 + 10) = 1/11 ~ 0.0909
      // adjustedDeficit = (0.0909 * 100) + (0.9091 * 50) = 9.09 + 45.45 = 54.54
      // rawScore = (90 * 0.40) + (54.54 * 0.35) + (13 * 0.25) = 36 + 19.09 + 3.25 = 58.34 => 58
      const result = StudyPlannerEngine.calculateTopicPriorities([topicOneAttempt], 60);
      expect(result[0].finalPpsScore).toBe(58);
    });

    it("C. 10 attempts have intermediate confidence (50%)", () => {
      const topicTenAttempts: TopicPriorityInput = {
        ...defaultTopic,
        attempts: 10,
        mastery: 0, // observedDeficit = 100
      };

      // sampleConfidence = 10 / (10 + 10) = 0.50
      // adjustedDeficit = (0.50 * 100) + (0.50 * 50) = 75
      // rawScore = (90 * 0.40) + (75 * 0.35) + (13 * 0.25) = 36 + 26.25 + 3.25 = 65.5 => 66
      const result = StudyPlannerEngine.calculateTopicPriorities([topicTenAttempts], 60);
      expect(result[0].finalPpsScore).toBe(66);
    });

    it("D. 100 attempts closely reflect observed deficit", () => {
      const topicManyAttempts: TopicPriorityInput = {
        ...defaultTopic,
        attempts: 100,
        mastery: 0, // observedDeficit = 100
      };

      // sampleConfidence = 100 / (100 + 10) = 100/110 ~ 0.909
      // adjustedDeficit = (0.909 * 100) + (0.091 * 50) = 90.9 + 4.55 = 95.45
      // rawScore = (90 * 0.40) + (95.45 * 0.35) + (13 * 0.25) = 36 + 33.41 + 3.25 = 72.66 => 73
      const result = StudyPlannerEngine.calculateTopicPriorities([topicManyAttempts], 60);
      expect(result[0].finalPpsScore).toBe(73);
    });

    it("E. Critical Scenario: 10/30 chronic deficit takes priority over 0/1 noise", () => {
      const topicSingleMiss: TopicPriorityInput = {
        id: "top-single-miss",
        name: "Tema A (0/1)",
        area: "CLINICA_MEDICA",
        irs: 80,
        mastery: 0,
        attempts: 1,
        daysSinceLastReview: 7,
        stabilityDays: 5,
      };

      const topicChronicDeficit: TopicPriorityInput = {
        id: "top-chronic-deficit",
        name: "Tema B (10/30)",
        area: "CLINICA_MEDICA",
        irs: 80,
        mastery: 33,
        attempts: 30,
        daysSinceLastReview: 7,
        stabilityDays: 5,
      };

      const result = StudyPlannerEngine.calculateTopicPriorities(
        [topicSingleMiss, topicChronicDeficit],
        60
      );

      // Tema B (PPS ~63) should rank ABOVE Tema A (PPS ~61)
      expect(result[0].topicId).toBe("top-chronic-deficit");
      expect(result[1].topicId).toBe("top-single-miss");
      expect(result[0].finalPpsScore).toBeGreaterThan(result[1].finalPpsScore);
    });
  });

  describe("2. Urgency Boost & Non-Saturating Properties", () => {
    it("A. Greater urgency increases absolute score monotonically across time brackets", () => {
      const testTopic: TopicPriorityInput = {
        ...defaultTopic,
        irs: 75,
        mastery: 40,
        attempts: 20,
      };

      const ppsFar = StudyPlannerEngine.calculateTopicPriorities([testTopic], 60)[0].finalPpsScore;
      const ppsMid = StudyPlannerEngine.calculateTopicPriorities([testTopic], 30)[0].finalPpsScore;
      const ppsNear = StudyPlannerEngine.calculateTopicPriorities([testTopic], 14)[0].finalPpsScore;
      const ppsFinal = StudyPlannerEngine.calculateTopicPriorities([testTopic], 5)[0].finalPpsScore;

      expect(ppsFar).toBeLessThanOrEqual(ppsMid);
      expect(ppsMid).toBeLessThanOrEqual(ppsNear);
      expect(ppsNear).toBeLessThanOrEqual(ppsFinal);
      expect(ppsFinal).toBeLessThanOrEqual(PPS_CONFIG.MAX_SCORE);
    });

    it("B. 10 distinct raw scores at <= 7 days do NOT collapse into 99 in mass", () => {
      const distinctScores: TopicPriorityInput[] = [
        { id: "t1", name: "Tema 1", area: "CLINICA_MEDICA", irs: 40, mastery: 80, attempts: 20 },
        { id: "t2", name: "Tema 2", area: "CLINICA_MEDICA", irs: 50, mastery: 75, attempts: 20 },
        { id: "t3", name: "Tema 3", area: "CLINICA_MEDICA", irs: 55, mastery: 70, attempts: 20 },
        { id: "t4", name: "Tema 4", area: "CLINICA_MEDICA", irs: 60, mastery: 65, attempts: 20 },
        { id: "t5", name: "Tema 5", area: "CLINICA_MEDICA", irs: 65, mastery: 60, attempts: 20 },
        { id: "t6", name: "Tema 6", area: "CLINICA_MEDICA", irs: 70, mastery: 55, attempts: 20 },
        { id: "t7", name: "Tema 7", area: "CLINICA_MEDICA", irs: 75, mastery: 50, attempts: 20 },
        { id: "t8", name: "Tema 8", area: "CLINICA_MEDICA", irs: 80, mastery: 45, attempts: 20 },
        { id: "t9", name: "Tema 9", area: "CLINICA_MEDICA", irs: 85, mastery: 40, attempts: 20 },
        { id: "t10", name: "Tema 10", area: "CLINICA_MEDICA", irs: 90, mastery: 35, attempts: 20 },
      ];

      const result = StudyPlannerEngine.calculateTopicPriorities(distinctScores, 5);
      const scores = result.map((r) => r.finalPpsScore);

      // No more than 1 topic should hit 99 in this realistic spectrum
      const countAtMax = scores.filter((s) => s === 99).length;
      expect(countAtMax).toBeLessThanOrEqual(1);

      // Verify strict preservation of ranking order
      for (let i = 0; i < scores.length - 1; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
      }
    });

    it("C. Relative order is preserved under different urgency brackets", () => {
      const topicHigh: TopicPriorityInput = {
        id: "high",
        name: "Alta Prioridade",
        area: "GINECOLOGIA_OBSTETRICIA",
        irs: 95,
        mastery: 30,
        attempts: 20,
      };

      const topicLow: TopicPriorityInput = {
        id: "low",
        name: "Baixa Prioridade",
        area: "PEDIATRIA",
        irs: 40,
        mastery: 80,
        attempts: 20,
      };

      const result60d = StudyPlannerEngine.calculateTopicPriorities([topicLow, topicHigh], 60);
      const result7d = StudyPlannerEngine.calculateTopicPriorities([topicLow, topicHigh], 7);

      expect(result60d[0].topicId).toBe("high");
      expect(result7d[0].topicId).toBe("high");
    });
  });

  describe("3. Cold Start & Determinism", () => {
    it("A. Aluno novo (0 attempts) is cleanly ordered by INEP recurrence (IRS)", () => {
      const newStudentTopics: TopicPriorityInput[] = [
        { id: "low-irs", name: "Tema Baixo IRS", area: "PEDIATRIA", irs: 30 },
        { id: "high-irs", name: "Tema Alto IRS", area: "GINECOLOGIA_OBSTETRICIA", irs: 95 },
        { id: "mid-irs", name: "Tema Médio IRS", area: "CLINICA_MEDICA", irs: 65 },
      ];

      const result = StudyPlannerEngine.calculateTopicPriorities(newStudentTopics, 60);

      expect(result[0].topicId).toBe("high-irs");
      expect(result[1].topicId).toBe("mid-irs");
      expect(result[2].topicId).toBe("low-irs");
    });

    it("B. Function is 100% deterministic with identical inputs", () => {
      const topics: TopicPriorityInput[] = [
        { id: "t1", name: "Apendicite", area: "CIRURGIA_GERAL", irs: 88, mastery: 45, attempts: 15 },
        { id: "t2", name: "HAS", area: "CLINICA_MEDICA", irs: 92, mastery: 60, attempts: 25 },
      ];

      const run1 = StudyPlannerEngine.calculateTopicPriorities(topics, 30);
      const run2 = StudyPlannerEngine.calculateTopicPriorities(topics, 30);

      expect(run1).toEqual(run2);
    });

    it("C. Tie-break breaks ties by IRS then alphabetical name", () => {
      const tiedTopics: TopicPriorityInput[] = [
        { id: "b", name: "Zebra Topic", area: "CLINICA_MEDICA", irs: 80, mastery: 50, attempts: 10 },
        { id: "a", name: "Alpha Topic", area: "CLINICA_MEDICA", irs: 80, mastery: 50, attempts: 10 },
      ];

      const result = StudyPlannerEngine.calculateTopicPriorities(tiedTopics, 60);

      expect(result[0].topicName).toBe("Alpha Topic");
      expect(result[1].topicName).toBe("Zebra Topic");
    });
  });

  describe("4. Edge Cases & Safety", () => {
    it("A. Handles negative daysUntilExam gracefully without NaN", () => {
      const result = StudyPlannerEngine.calculateTopicPriorities([defaultTopic], -5);
      expect(result[0].finalPpsScore).toBeGreaterThanOrEqual(0);
      expect(result[0].finalPpsScore).toBeLessThanOrEqual(99);
      expect(isNaN(result[0].finalPpsScore)).toBe(false);
    });

    it("B. Handles undefined, NaN or missing fields safely", () => {
      const corruptedTopic: TopicPriorityInput = {
        id: "corrupted",
        name: "Corrompido",
        area: "CIRURGIA_GERAL",
        irs: NaN,
        mastery: undefined,
        attempts: -10,
        daysSinceLastReview: NaN,
        stabilityDays: 0,
      };

      const result = StudyPlannerEngine.calculateTopicPriorities([corruptedTopic], 0);

      expect(isNaN(result[0].finalPpsScore)).toBe(false);
      expect(result[0].finalPpsScore).toBeGreaterThanOrEqual(0);
      expect(result[0].finalPpsScore).toBeLessThanOrEqual(99);
    });
  });
});
