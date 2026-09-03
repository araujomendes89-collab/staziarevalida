import { describe, it, expect } from "vitest";
import {
  TopicTaxonomyService,
  normalizeTopicLabel,
} from "../services/topicTaxonomyService";
import { ALL_GRANDES_TEMAS } from "../data/grandesTemas";
import { MedicalArea, Question } from "../types";

describe("TopicTaxonomyService Unit Tests (Etapa 1.14E)", () => {
  describe("1. Text Normalization", () => {
    it("A. Normalizes case, trims and strips accents correctly", () => {
      expect(normalizeTopicLabel("  Pré-Eclâmpsia e Eclâmpsia  ")).toBe(
        "PRE ECLAMPSIA E ECLAMPSIA"
      );
      expect(normalizeTopicLabel("Hipertensão Arterial Sistêmica")).toBe(
        "HIPERTENSAO ARTERIAL SISTEMICA"
      );
      expect(normalizeTopicLabel("Atenção Primária à Saúde (APS)")).toBe(
        "ATENCAO PRIMARIA A SAUDE APS"
      );
    });

    it("B. Handles empty or null inputs gracefully", () => {
      expect(normalizeTopicLabel(null)).toBe("");
      expect(normalizeTopicLabel(undefined)).toBe("");
      expect(normalizeTopicLabel("")).toBe("");
    });
  });

  describe("2. Canonical Topic Resolution", () => {
    it("A. Resolves by Direct Canonical ID", () => {
      const res = TopicTaxonomyService.resolveCanonicalTopic({
        canonicalTopicId: "cm-01",
        area: "CLINICA_MEDICA",
      });

      expect(res.canonicalTopicId).toBe("cm-01");
      expect(res.matchType).toBe("DIRECT_ID");
      expect(res.confidence).toBe(1.0);
      expect(res.area).toBe("CLINICA_MEDICA");
    });

    it("B. Resolves by Canonical Title", () => {
      const res = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "Hipertensão Arterial e Emergências Hipertensivas",
        area: "CLINICA_MEDICA",
      });

      expect(res.canonicalTopicId).toBe("cm-01");
      expect(res.matchType).toBe("CANONICAL_NAME");
      expect(res.confidence).toBe(1.0);
    });

    it("C. Resolves by Explicit Medical Alias", () => {
      const resHAS = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "HAS",
        area: "CLINICA_MEDICA",
      });
      expect(resHAS.canonicalTopicId).toBe("cm-01");
      expect(resHAS.matchType).toBe("EXPLICIT_ALIAS");

      const resIAM = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "Infarto Agudo do Miocárdio",
        area: "CLINICA_MEDICA",
      });
      expect(resIAM.canonicalTopicId).toBe("cm-03");
      expect(resIAM.matchType).toBe("EXPLICIT_ALIAS");
    });

    it("D. Resolves through Subtopic when topic is generic", () => {
      const res = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "Cardiologia",
        subtopic: "Fibrilação Atrial",
        area: "CLINICA_MEDICA",
      });

      expect(res.canonicalTopicId).toBe("cm-05");
      expect(res.matchType).toBe("EXPLICIT_ALIAS");
    });

    it("E. Flags Ambiguous single-word generic terms as AMBIGUOUS", () => {
      const res = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "Choque",
        area: "CLINICA_MEDICA",
      });

      expect(res.canonicalTopicId).toBeNull();
      expect(res.matchType).toBe("AMBIGUOUS");
    });

    it("F. Detects Area Mismatch when clinical area conflicts", () => {
      // "Pré-Eclâmpsia" marked erroneously as Cirurgia Geral
      const res = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "Pré-Eclâmpsia",
        area: "CIRURGIA_GERAL",
      });

      expect(res.canonicalTopicId).toBe("go-02");
      expect(res.matchType).toBe("AREA_MISMATCH");
      expect(res.notes).toContain("difere da área canônica");
    });

    it("G. Returns UNMAPPED for unknown or empty topics", () => {
      const res = TopicTaxonomyService.resolveCanonicalTopic({
        topic: "Astronomia Médica Extraterrestre",
        area: "CLINICA_MEDICA",
      });

      expect(res.canonicalTopicId).toBeNull();
      expect(res.matchType).toBe("UNMAPPED");
    });

    it("H. Resolving a question does not mutate the question object", () => {
      const question: Question = {
        id: "q-test-immutable",
        area: "PEDIATRIA",
        topic: "Aleitamento Materno",
        clinicalCase: "Caso teste...",
        options: [],
        correctAnswer: "A",
        difficulty: "MEDIO",
        examYear: 2026,
        examEdition: "Revalida 2026/1",
        keyFinding: "Pega correta",
        expectedConduct: "Orientar técnica",
        inepIntent: "Avaliar amamentação",
      };

      const originalCopy = JSON.parse(JSON.stringify(question));
      const res = TopicTaxonomyService.resolveCanonicalTopic(question);

      expect(res.canonicalTopicId).toBe("ped-03");
      expect(question).toEqual(originalCopy);
    });

    it("I. Resolution is 100% deterministic", () => {
      const input = { topic: "Tuberculose Pulmonar", area: "CLINICA_MEDICA" as MedicalArea };
      const res1 = TopicTaxonomyService.resolveCanonicalTopic(input);
      const res2 = TopicTaxonomyService.resolveCanonicalTopic(input);

      expect(res1).toEqual(res2);
    });
  });

  describe("3. Canonical Taxonomy Integrity Audit", () => {
    it("A. All 75 Grandes Temas have unique IDs and valid areas", () => {
      const audit = TopicTaxonomyService.auditCanonicalTaxonomy();

      expect(audit.totalThemes).toBe(75);
      expect(audit.duplicateIds).toHaveLength(0);
      expect(audit.themesWithoutArea).toHaveLength(0);
      expect(audit.themesWithoutIrs).toHaveLength(0);
    });

    it("B. All 75 Grandes Temas resolve cleanly by their canonical title", () => {
      for (const theme of ALL_GRANDES_TEMAS) {
        const res = TopicTaxonomyService.resolveCanonicalTopic({
          topic: theme.title,
        });

        expect(res.canonicalTopicId).toBe(theme.id);
        expect(res.canonicalTopicTitle).toBe(theme.title);
        expect(res.irsScore).toBeGreaterThanOrEqual(50);
      }
    });
  });
});
