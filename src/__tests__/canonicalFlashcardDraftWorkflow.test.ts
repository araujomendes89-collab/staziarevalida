import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateAndSanitizeDraftPayload,
  computeDraftFingerprint,
} from "../../server/workflow/draftValidator";
import {
  CanonicalDraftService,
  CanonicalDraftServiceError,
  WORKFLOW_COLLECTION,
} from "../../server/workflow/canonicalDraftService";
import { ServerPrincipal } from "../../server/auth/types";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("Canonical Flashcard Draft Workflow Foundation", () => {
  let mockDb: any;
  let mockCollection: any;
  let mockDocRef: any;

  const mockAdminPrincipal: ServerPrincipal = {
    uid: "admin_dr_house",
    email: "house@staziamed.com",
    role: "ADMIN",
    tier: "ADMIN",
    name: "Dr. Gregory House",
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDocRef = {
      create: vi.fn().mockResolvedValue({}),
      get: vi.fn(),
      set: vi.fn().mockResolvedValue({}),
    };

    mockCollection = {
      doc: vi.fn().mockReturnValue(mockDocRef),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
      runTransaction: vi.fn(),
    };

    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(mockDb as any);
  });

  describe("Draft Validator & Sanitizer (Mass Assignment Protection)", () => {
    it("should validate and sanitize a partial draft payload", () => {
      const input = {
        front: "Qual o achado tomográfico típico na apendicite aguda?",
        back: "Espessamento parietal do apêndice cecal (> 6 mm) com densificação da gordura periapendicular.",
        canonicalTopicId: "cir-01", // Abdome Agudo Inflamatório / Apendicite
        cardPurpose: "DIAGNOSTIC_WORKUP",
        keyMnemonic: "APENDICE_6MM",
      };

      const res = validateAndSanitizeDraftPayload(input);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.sanitizedDraft.front).toBe(input.front);
      expect(res.sanitizedDraft.back).toBe(input.back);
      expect(res.sanitizedDraft.canonicalTopicId).toBe("cir-01");
      expect(res.sanitizedDraft.areaId).toBe("cirurgia");
      expect(res.sanitizedDraft.area).toBe("CIRURGIA_GERAL");
      expect(res.sanitizedDraft.cardPurpose).toBe("DIAGNOSTIC_WORKUP");
      expect(res.sanitizedDraft.contentFingerprint).toMatch(/^fc_fp_v1_[a-f0-9]{16}$/);
      expect(res.sanitizedDraft.contentFingerprintVersion).toBe(1);
    });

    it("should strip injected metadata fields (Mass Assignment Protection)", () => {
      const maliciousInput = {
        front: "Pergunta clínica",
        workflowStatus: "PUBLISHED", // Malicious status escalation
        draftRevision: 999, // Malicious revision injection
        createdBy: "hacker_uid", // Malicious author spoofing
        updatedBy: "hacker_uid",
        contentId: "c_fc_stolen_id",
      };

      const res = validateAndSanitizeDraftPayload(maliciousInput);
      expect(res.valid).toBe(true);
      expect((res.sanitizedDraft as any).workflowStatus).toBeUndefined();
      expect((res.sanitizedDraft as any).draftRevision).toBeUndefined();
      expect((res.sanitizedDraft as any).createdBy).toBeUndefined();
      expect((res.sanitizedDraft as any).updatedBy).toBeUndefined();
      expect((res.sanitizedDraft as any).contentId).toBeUndefined();
    });

    it("should reject invalid canonicalTopicId", () => {
      const input = {
        canonicalTopicId: "unknown-topic-999",
      };
      const res = validateAndSanitizeDraftPayload(input);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("not found in canonical taxonomy"))).toBe(true);
    });

    it("should reject invalid cardPurpose", () => {
      const input = {
        cardPurpose: "INVALID_PURPOSE_TYPE",
      };
      const res = validateAndSanitizeDraftPayload(input);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Invalid 'cardPurpose'"))).toBe(true);
    });
  });

  describe("CanonicalDraftService.createDraft", () => {
    it("should create a private draft workflow with revision 1 and server-generated contentId", async () => {
      const draftInput = {
        front: "Qual o tratamento de escolha para o choque anafilático?",
        back: "Adrenalina (epinefrina) intramuscular na face anterolateral da coxa.",
        canonicalTopicId: "cm-01",
        cardPurpose: "TREATMENT" as const,
      };

      const workflow = await CanonicalDraftService.createDraft(
        mockAdminPrincipal,
        draftInput
      );

      expect(workflow.contentId).toMatch(/^c_fc_[a-f0-9]{32}$/);
      expect(workflow.workflowStatus).toBe("DRAFT");
      expect(workflow.draftRevision).toBe(1);
      expect(workflow.createdBy).toBe("admin_dr_house");
      expect(workflow.updatedBy).toBe("admin_dr_house");
      expect(workflow.createdAt).toBeDefined();
      expect(workflow.updatedAt).toBeDefined();
      expect(workflow.draft.front).toBe(draftInput.front);

      // Verify Firestore call
      expect(mockDb.collection).toHaveBeenCalledWith(WORKFLOW_COLLECTION);
      expect(mockCollection.doc).toHaveBeenCalledWith(workflow.contentId);
      expect(mockDocRef.create).toHaveBeenCalledWith(workflow);
    });
  });

  describe("CanonicalDraftService.updateDraft & Concurrency Control", () => {
    it("should update draft and increment revision when expected revision matches", async () => {
      const existingDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: {
          front: "Versão 1 da pergunta",
        },
        createdBy: "admin_dr_house",
        createdAt: "2026-03-01T10:00:00Z",
        updatedBy: "admin_dr_house",
        updatedAt: "2026-03-01T10:00:00Z",
      };

      mockDb.runTransaction.mockImplementation(async (callback: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => existingDoc,
          }),
          set: vi.fn(),
        };
        return await callback(mockTransaction);
      });

      const updates = {
        front: "Versão 2 corrigida da pergunta",
        back: "Resposta adicionada na revisão 2",
        canonicalTopicId: "ped-01",
      };

      const updated = await CanonicalDraftService.updateDraft(
        mockAdminPrincipal,
        "c_fc_sample_123",
        1, // Expected draftRevision 1
        updates
      );

      expect(updated.draftRevision).toBe(2);
      expect(updated.draft.front).toBe("Versão 2 corrigida da pergunta");
      expect(updated.draft.back).toBe("Resposta adicionada na revisão 2");
      expect(updated.draft.canonicalTopicId).toBe("ped-01");
      expect(updated.draft.area).toBe("PEDIATRIA");
      expect(updated.updatedBy).toBe("admin_dr_house");
    });

    it("should reject stale update with 409 DRAFT_REVISION_CONFLICT", async () => {
      const existingDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 2, // Server is already at revision 2
        draft: {},
        createdBy: "admin_dr_house",
        createdAt: "2026-03-01T10:00:00Z",
        updatedBy: "admin_dr_house",
        updatedAt: "2026-03-01T10:00:00Z",
      };

      mockDb.runTransaction.mockImplementation(async (callback: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => existingDoc,
          }),
          set: vi.fn(),
        };
        return await callback(mockTransaction);
      });

      await expect(
        CanonicalDraftService.updateDraft(
          mockAdminPrincipal,
          "c_fc_sample_123",
          1, // Stale client expected revision 1
          { front: "Nova pergunta conflitante" }
        )
      ).rejects.toThrow(CanonicalDraftServiceError);

      try {
        await CanonicalDraftService.updateDraft(
          mockAdminPrincipal,
          "c_fc_sample_123",
          1,
          { front: "Nova pergunta conflitante" }
        );
      } catch (err: any) {
        expect(err.code).toBe("DRAFT_REVISION_CONFLICT");
        expect(err.statusCode).toBe(409);
      }
    });

    it("should reject update when draft is not found with 404 DRAFT_NOT_FOUND", async () => {
      mockDb.runTransaction.mockImplementation(async (callback: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: false,
          }),
          set: vi.fn(),
        };
        return await callback(mockTransaction);
      });

      await expect(
        CanonicalDraftService.updateDraft(
          mockAdminPrincipal,
          "nonexistent_id",
          1,
          { front: "Pergunta" }
        )
      ).rejects.toThrow(CanonicalDraftServiceError);
    });
  });

  describe("CanonicalDraftService.getDraftById", () => {
    it("should return workflow document if exists", async () => {
      const mockDoc = {
        contentId: "c_fc_sample_123",
        workflowStatus: "DRAFT",
        draftRevision: 1,
        draft: { front: "Pergunta teste" },
      };

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockDoc,
      });

      const draft = await CanonicalDraftService.getDraftById("c_fc_sample_123");
      expect(draft).not.toBeNull();
      expect(draft?.contentId).toBe("c_fc_sample_123");
    });

    it("should return null for invalid or missing id", async () => {
      expect(await CanonicalDraftService.getDraftById("")).toBeNull();
      mockDocRef.get.mockResolvedValue({ exists: false });
      expect(await CanonicalDraftService.getDraftById("nonexistent")).toBeNull();
    });
  });
});
