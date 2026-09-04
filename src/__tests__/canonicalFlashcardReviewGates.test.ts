import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  performAutoValidationChecks,
} from "../../server/workflow/draftValidator";
import {
  CanonicalDraftService,
  CanonicalDraftServiceError,
} from "../../server/workflow/canonicalDraftService";
import { ServerPrincipal } from "../../server/auth/types";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("Canonical Flashcard Review Gates & READY Workflow", () => {
  let mockDb: any;
  let mockDocRef: any;

  const mockAdminPrincipal: ServerPrincipal = {
    uid: "admin_dr_house",
    email: "house@staziamed.com",
    role: "ADMIN",
    tier: "ADMIN",
    name: "Dr. Gregory House",
    disabled: false,
  };

  const validDraftContent = {
    front: "Qual o tratamento farmacológico de 1ª linha para febre maculosa?",
    back: "Doxiciclina por via oral ou intravenosa, independentemente da idade do paciente.",
    canonicalTopicId: "cm-01",
    cardPurpose: "TREATMENT" as const,
    keyMnemonic: "DOXICICLINA_SEMPRE",
    medicalEvidence: {
      sourceType: "GOVERNMENT_HEALTH" as const,
      title: "Guia de Vigilância em Saúde - Febre Maculosa",
      publisher: "Ministério da Saúde",
      publicationYear: 2023,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDocRef = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      }),
      runTransaction: vi.fn(),
    };

    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(mockDb as any);
  });

  describe("performAutoValidationChecks", () => {
    it("should PASS auto-validation on a structurally complete draft", () => {
      const res = performAutoValidationChecks(validDraftContent);
      expect(res.status).toBe("PASS");
      expect(res.errors).toHaveLength(0);
    });

    it("should FAIL auto-validation on an incomplete draft (missing back and evidence)", () => {
      const incomplete = {
        front: "Pergunta sem resposta",
        canonicalTopicId: "cm-01",
      };
      const res = performAutoValidationChecks(incomplete);
      expect(res.status).toBe("FAIL");
      expect(res.errors).toContain("Missing required field 'back'.");
      expect(res.errors.some((e) => e.includes("medicalEvidence"))).toBe(true);
    });

    it("should FAIL auto-validation on invalid canonicalTopicId", () => {
      const invalidTopic = {
        ...validDraftContent,
        canonicalTopicId: "topic-not-existing",
      };
      const res = performAutoValidationChecks(invalidTopic);
      expect(res.status).toBe("FAIL");
      expect(res.errors.some((e) => e.includes("canonical taxonomy"))).toBe(true);
    });
  });

  describe("CanonicalDraftService.autoValidateDraft", () => {
    it("should attach autoValidation record to the workflow bound to current revision", async () => {
      const existingDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: validDraftContent,
        createdBy: "admin_dr_house",
        createdAt: "2026-03-01T10:00:00Z",
        updatedBy: "admin_dr_house",
        updatedAt: "2026-03-01T10:00:00Z",
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => existingDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      const updated = await CanonicalDraftService.autoValidateDraft(
        mockAdminPrincipal,
        "c_fc_sample_123",
        1
      );

      expect(updated.autoValidation).toBeDefined();
      expect(updated.autoValidation?.status).toBe("PASS");
      expect(updated.autoValidation?.validatedDraftRevision).toBe(1);
      expect(updated.autoValidation?.validationVersion).toBe(1);
    });

    it("should throw 409 REVIEW_REVISION_CONFLICT when expected revision is stale", async () => {
      const existingDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 2, // Server is at 2
        draft: validDraftContent,
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => existingDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      try {
        await CanonicalDraftService.autoValidateDraft(mockAdminPrincipal, "c_fc_sample_123", 1);
        expect.unreachable("Should have thrown REVIEW_REVISION_CONFLICT");
      } catch (err: any) {
        expect(err.code).toBe("REVIEW_REVISION_CONFLICT");
        expect(err.statusCode).toBe(409);
      }
    });
  });

  describe("CanonicalDraftService.submitMedicalReview", () => {
    it("should attach medical review approval with primarySourceValidated", async () => {
      const existingDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: validDraftContent,
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => existingDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      const updated = await CanonicalDraftService.submitMedicalReview(
        mockAdminPrincipal,
        "c_fc_sample_123",
        1,
        "APPROVED",
        true, // primarySourceValidated
        "Conduta 100% alinhada com PCDT MS 2023."
      );

      expect(updated.medicalReview).toBeDefined();
      expect(updated.medicalReview?.result).toBe("APPROVED");
      expect(updated.medicalReview?.primarySourceValidated).toBe(true);
      expect(updated.medicalReview?.reviewedBy).toBe("admin_dr_house");
      expect(updated.medicalReview?.reviewedDraftRevision).toBe(1);
      expect(updated.medicalReview?.notes).toBe("Conduta 100% alinhada com PCDT MS 2023.");
    });

    it("should require notes when CHANGES_REQUESTED is submitted", async () => {
      await expect(
        CanonicalDraftService.submitMedicalReview(
          mockAdminPrincipal,
          "c_fc_sample_123",
          1,
          "CHANGES_REQUESTED",
          false,
          "" // Empty notes
        )
      ).rejects.toThrow(CanonicalDraftServiceError);
    });
  });

  describe("CanonicalDraftService.submitEditorialReview", () => {
    it("should attach editorial review approval", async () => {
      const existingDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: validDraftContent,
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => existingDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      const updated = await CanonicalDraftService.submitEditorialReview(
        mockAdminPrincipal,
        "c_fc_sample_123",
        1,
        "APPROVED",
        "Active recall claro e sem distratores induzidos."
      );

      expect(updated.editorialReview).toBeDefined();
      expect(updated.editorialReview?.result).toBe("APPROVED");
      expect(updated.editorialReview?.reviewedBy).toBe("admin_dr_house");
      expect(updated.editorialReview?.reviewedDraftRevision).toBe(1);
    });
  });

  describe("CanonicalDraftService.markReady", () => {
    it("should transition workflowStatus to READY when all gates on current revision are satisfied", async () => {
      const readyDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: validDraftContent,
        autoValidation: {
          status: "PASS",
          validatedDraftRevision: 1,
          validatedAt: "2026-03-01T10:00:00Z",
          validationVersion: 1,
        },
        medicalReview: {
          result: "APPROVED",
          reviewedDraftRevision: 1,
          reviewedBy: "admin_dr_house",
          reviewedAt: "2026-03-01T10:05:00Z",
          primarySourceValidated: true,
        },
        editorialReview: {
          result: "APPROVED",
          reviewedDraftRevision: 1,
          reviewedBy: "admin_dr_house",
          reviewedAt: "2026-03-01T10:10:00Z",
        },
        createdBy: "admin_dr_house",
        createdAt: "2026-03-01T10:00:00Z",
        updatedBy: "admin_dr_house",
        updatedAt: "2026-03-01T10:10:00Z",
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => readyDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      const result = await CanonicalDraftService.markReady(mockAdminPrincipal, "c_fc_sample_123", 1);
      expect(result.workflowStatus).toBe("READY");
      expect(result.readyAt).toBeDefined();
      expect(result.readyBy).toBe("admin_dr_house");
    });

    it("should reject markReady when medicalReview is missing", async () => {
      const incompleteDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: validDraftContent,
        autoValidation: { status: "PASS", validatedDraftRevision: 1 },
        editorialReview: { result: "APPROVED", reviewedDraftRevision: 1 },
        // Missing medicalReview
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => incompleteDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      try {
        await CanonicalDraftService.markReady(mockAdminPrincipal, "c_fc_sample_123", 1);
        expect.unreachable("Should have thrown MEDICAL_REVIEW_REQUIRED");
      } catch (err: any) {
        expect(err.code).toBe("MEDICAL_REVIEW_REQUIRED");
      }
    });

    it("should reject markReady when primarySourceValidated is false", async () => {
      const unvalidatedSourceDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: validDraftContent,
        autoValidation: { status: "PASS", validatedDraftRevision: 1 },
        medicalReview: {
          result: "APPROVED",
          reviewedDraftRevision: 1,
          reviewedBy: "admin_dr_house",
          primarySourceValidated: false, // NOT validated
        },
        editorialReview: { result: "APPROVED", reviewedDraftRevision: 1 },
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => unvalidatedSourceDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      try {
        await CanonicalDraftService.markReady(mockAdminPrincipal, "c_fc_sample_123", 1);
        expect.unreachable("Should have thrown PRIMARY_SOURCE_REVIEW_REQUIRED");
      } catch (err: any) {
        expect(err.code).toBe("PRIMARY_SOURCE_REVIEW_REQUIRED");
      }
    });

    it("should reject markReady when prior review was for revision 1 but draft was updated to revision 2", async () => {
      const staleReviewDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 2, // Draft was updated to 2
        draft: validDraftContent,
        autoValidation: { status: "PASS", validatedDraftRevision: 1 }, // Stale revision 1
        medicalReview: {
          result: "APPROVED",
          reviewedDraftRevision: 1, // Stale revision 1
          primarySourceValidated: true,
        },
        editorialReview: { result: "APPROVED", reviewedDraftRevision: 1 }, // Stale revision 1
      };

      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => staleReviewDoc }),
          set: vi.fn(),
        };
        return await cb(mockTransaction);
      });

      try {
        await CanonicalDraftService.markReady(mockAdminPrincipal, "c_fc_sample_123", 2);
        expect.unreachable("Should have thrown AUTO_VALIDATION_FAILED for stale revision");
      } catch (err: any) {
        expect(err.code).toBe("AUTO_VALIDATION_FAILED");
      }
    });
  });
});
