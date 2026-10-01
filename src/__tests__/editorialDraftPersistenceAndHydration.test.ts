import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  toPersistedEditorialDraftHeader,
  toPersistedEditorialPage,
  toPersistedEditorialBlock,
  toPersistedSourceBlockAssignment,
  MAX_EDITORIAL_PAYLOAD_BYTES,
  PersistedEditorialDraftHeader,
  PersistedEditorialPage,
  PersistedEditorialBlock,
} from "../../server/editorial/editorialDraftPersistence";
import {
  EditorialDraftRepository,
  EDITORIAL_DRAFTS_COLLECTION,
  PAGES_SUBCOLLECTION,
  BLOCKS_SUBCOLLECTION,
  SOURCE_ASSIGNMENTS_SUBCOLLECTION,
} from "../../server/editorial/editorialDraftRepository";
import {
  EditorialJobRepository,
  EDITORIAL_JOBS_COLLECTION,
} from "../../server/editorial/editorialJobRepository";
import { EditorialDraftHydrationService } from "../../server/editorial/editorialDraftHydrationService";
import {
  EditorialJobManager,
  EditorialJobState,
} from "../../server/editorial/editorialJobQueue";
import * as firebaseAdminModule from "../../server/firebaseAdmin";
import {
  EditorialBlock,
  EditorialPagePlan,
  StaziaEditorialDocumentDraft,
} from "../types/medicalEditorial";
import { StructuredSourceContent } from "../types/medicalTaxonomy";

/**
 * High-fidelity in-memory Firestore Mock supporting subcollections and transactions.
 */
class InMemoryFirestoreMock {
  public store: Map<string, any> = new Map();

  constructor() {
    this.store.set("users/admin_uid_777", {
      role: "ADMIN",
      tier: "TRIAL",
      email: "admin@staziamed.com.br",
    });
  }

  collection(collectionPath: string) {
    const rootThis = this;
    return {
      doc: (docId: string) => {
        const fullDocPath = `${collectionPath}/${docId}`;
        return {
          id: docId,
          set: async (data: any, options?: { merge?: boolean }) => {
            if (options?.merge) {
              const existing = rootThis.store.get(fullDocPath) || {};
              rootThis.store.set(fullDocPath, { ...existing, ...data });
            } else {
              rootThis.store.set(fullDocPath, { ...data });
            }
          },
          get: async () => {
            const data = rootThis.store.get(fullDocPath);
            return {
              exists: Boolean(data),
              id: docId,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            };
          },
          delete: async () => {
            rootThis.store.delete(fullDocPath);
          },
          collection: (subcollectionPath: string) => {
            const fullSubPath = `${fullDocPath}/${subcollectionPath}`;
            return {
              doc: (subDocId: string) => {
                const fullSubDocPath = `${fullSubPath}/${subDocId}`;
                return {
                  id: subDocId,
                  set: async (data: any, options?: { merge?: boolean }) => {
                    if (options?.merge) {
                      const existing = rootThis.store.get(fullSubDocPath) || {};
                      rootThis.store.set(fullSubDocPath, { ...existing, ...data });
                    } else {
                      rootThis.store.set(fullSubDocPath, { ...data });
                    }
                  },
                  get: async () => {
                    const data = rootThis.store.get(fullSubDocPath);
                    return {
                      exists: Boolean(data),
                      id: subDocId,
                      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
                    };
                  },
                };
              },
              get: async () => {
                const docs: any[] = [];
                const prefix = `${fullSubPath}/`;
                for (const [key, value] of rootThis.store.entries()) {
                  if (key.startsWith(prefix)) {
                    const subId = key.substring(prefix.length);
                    if (!subId.includes("/")) {
                      docs.push({
                        id: subId,
                        data: () => JSON.parse(JSON.stringify(value)),
                      });
                    }
                  }
                }
                return {
                  empty: docs.length === 0,
                  docs,
                };
              },
            };
          },
        };
      },
      where: (field: string, op: string, value: any) => {
        const rootThis = this;
        return {
          limit: (n: number) => ({
            get: async () => {
              const docs: any[] = [];
              const prefix = `${collectionPath}/`;
              for (const [key, val] of rootThis.store.entries()) {
                if (key.startsWith(prefix)) {
                  const subId = key.substring(prefix.length);
                  if (!subId.includes("/") && val[field] === value) {
                    docs.push({
                      id: subId,
                      data: () => JSON.parse(JSON.stringify(val)),
                    });
                    if (docs.length >= n) break;
                  }
                }
              }
              return { empty: docs.length === 0, docs };
            },
          }),
          get: async () => {
            const docs: any[] = [];
            const prefix = `${collectionPath}/`;
            for (const [key, val] of rootThis.store.entries()) {
              if (key.startsWith(prefix)) {
                const subId = key.substring(prefix.length);
                if (!subId.includes("/") && val[field] === value) {
                  docs.push({
                    id: subId,
                    data: () => JSON.parse(JSON.stringify(val)),
                  });
                }
              }
            }
            return { empty: docs.length === 0, docs };
          },
        };
      },
      get: async () => {
        const docs: any[] = [];
        const prefix = `${collectionPath}/`;
        for (const [key, value] of rootThis.store.entries()) {
          if (key.startsWith(prefix)) {
            const subId = key.substring(prefix.length);
            if (!subId.includes("/")) {
              docs.push({
                id: subId,
                data: () => JSON.parse(JSON.stringify(value)),
              });
            }
          }
        }
        return {
          empty: docs.length === 0,
          docs,
        };
      },
    };
  }

  batch() {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (docRef: any, data: any, options?: { merge?: boolean }) => {
        ops.push(async () => {
          await docRef.set(data, options);
        });
      },
      commit: async () => {
        for (const op of ops) {
          await op();
        }
      },
    };
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    const rootThis = this;
    const transaction = {
      get: async (docRef: any) => docRef.get(),
      set: (docRef: any, data: any, options?: { merge?: boolean }) => {
        return docRef.set(data, options);
      },
      delete: (docRef: any) => docRef.delete(),
    };
    return await updateFunction(transaction);
  }
}

describe("Persistência Durável 4: Editorial Draft & Editorial Job", () => {
  let mockFirestore: InMemoryFirestoreMock;

  beforeEach(() => {
    mockFirestore = new InMemoryFirestoreMock();

    vi.spyOn(firebaseAdminModule, "getAdminDb").mockImplementation(() => {
      return mockFirestore as any;
    });

    EditorialJobManager.getInstance().reset();
  });

  const createSampleDraft = (draftId = "draft_cardio_101"): StaziaEditorialDocumentDraft => {
    const block1: EditorialBlock = {
      id: "eb_1",
      type: "HERO_TITLE",
      sourceBlockRefs: ["sb_1"],
      content: "Insuficiência Cardíaca Aguda Descompensada",
      semanticRole: "DOCUMENT_TITLE",
      layoutHints: { densityWeight: 2, keepWithNext: true },
      provenance: {
        documentId: "doc_cardiologia_2026",
        sourcePage: 1,
        sourceBlockId: "sb_1",
        sourceTextVerbatim: "Insuficiência Cardíaca Aguda Descompensada",
      },
      sourceOrder: 1,
      editorialOrder: 1,
    };

    const block2: EditorialBlock = {
      id: "eb_2",
      type: "CLINICAL_SUMMARY_CALLOUT",
      sourceBlockRefs: ["sb_2"],
      content: "Quadro clássico de congestão pulmonar com dispneia paroxística noturna.",
      semanticRole: "DIAGNOSTIC_CRITERIA",
      layoutHints: { densityWeight: 3 },
      provenance: {
        documentId: "doc_cardiologia_2026",
        sourcePage: 1,
        sourceBlockId: "sb_2",
        sourceTextVerbatim: "Quadro clássico de congestão pulmonar com dispneia paroxística noturna.",
      },
      sourceOrder: 2,
      editorialOrder: 2,
    };

    const block3: EditorialBlock = {
      id: "eb_3",
      type: "DRUG_PROTOCOL_CARD",
      sourceBlockRefs: ["sb_3"],
      content: "Furosemida IV 40mg em bolus inicial se hipervolêmico.",
      semanticRole: "TREATMENT_FIRST_LINE",
      layoutHints: { densityWeight: 3 },
      provenance: {
        documentId: "doc_cardiologia_2026",
        sourcePage: 2,
        sourceBlockId: "sb_3",
        sourceTextVerbatim: "Furosemida IV 40mg em bolus inicial se hipervolêmico.",
      },
      sourceOrder: 3,
      editorialOrder: 3,
    };

    const page1: EditorialPagePlan = {
      pageIndex: 0,
      pageRole: "OPENING",
      blocks: [block1, block2],
      sourceBlockRefs: ["sb_1", "sb_2"],
      estimatedDensity: "BALANCED",
      densityScore: 5.0,
    };

    const page2: EditorialPagePlan = {
      pageIndex: 1,
      pageRole: "CORE_CONTENT",
      blocks: [block3],
      sourceBlockRefs: ["sb_3"],
      estimatedDensity: "BALANCED",
      densityScore: 3.0,
    };

    const pages = [page1, page2];

    return {
      id: draftId,
      structuredSourceContentId: "content_struct_999",
      sourceDocumentId: "doc_cardiologia_2026",
      segmentId: "seg_1",
      area: "CLINICA_MEDICA",
      topic: "Insuficiência Cardíaca Aguda",
      subtopics: ["IC Aguda", "Manejo Hemodinâmico"],
      styleProfile: "MEDICAL_EDITORIAL_V1",
      compositionVersion: "2026.1.0",
      pages,
      plan: {
        id: `plan_${draftId}`,
        structuredSourceContentId: "content_struct_999",
        styleProfile: "MEDICAL_EDITORIAL_V1",
        documentTitle: "Insuficiência Cardíaca Aguda",
        pagePlan: pages,
        sourceBlockAssignments: [
          { sourceBlockId: "sb_1", status: "ASSIGNED", assignedEditorialBlockId: "eb_1" },
          { sourceBlockId: "sb_2", status: "ASSIGNED", assignedEditorialBlockId: "eb_2" },
          { sourceBlockId: "sb_3", status: "ASSIGNED", assignedEditorialBlockId: "eb_3" },
        ],
        warnings: [],
        compositionStatus: "DRAFT",
        totalStructuredSourceBlocks: 3,
        assignedEditorialBlocks: 3,
        adminExcludedBlocks: 0,
        reviewRequiredBlocks: 0,
        unaccountedSourceBlocks: 0,
        duplicatedSourceBlockAssignments: 0,
      },
      status: "DRAFT",
      createdAt: "2026-09-04T12:00:00.000Z",
      createdBy: "admin_uid_777",
      updatedAt: "2026-09-04T12:00:00.000Z",
    };
  };

  describe("Contratos e Mapeamento de Persistência", () => {
    it("A. toPersistedEditorialDraftHeader exclui estritamente pages[], plan.pagePlan[] e sourceBlockAssignments[]", () => {
      const draft = createSampleDraft();
      const header = toPersistedEditorialDraftHeader(draft);

      expect((header as any).pages).toBeUndefined();
      expect((header as any).plan?.pagePlan).toBeUndefined();
      expect((header as any).plan?.sourceBlockAssignments).toBeUndefined();
      expect(header.id).toBe("draft_cardio_101");
      expect(header.pageCount).toBe(2);
      expect(header.planSummary.totalStructuredSourceBlocks).toBe(3);
      expect(header.planSummary.assignedEditorialBlocks).toBe(3);
      expect(header.planSummary.unaccountedSourceBlocks).toBe(0);
    });

    it("B. toPersistedEditorialPage exclui estritamente blocks[] e armazena blockRefs", () => {
      const draft = createSampleDraft();
      const page = draft.pages[0];
      const pageDoc = toPersistedEditorialPage(page, "page_0_fixed");

      expect((pageDoc as any).blocks).toBeUndefined();
      expect(pageDoc.pageId).toBe("page_0_fixed");
      expect(pageDoc.pageIndex).toBe(0);
      expect(pageDoc.blockRefs).toEqual(["eb_1", "eb_2"]);
      expect(pageDoc.sourceBlockRefs).toEqual(["sb_1", "sb_2"]);
    });

    it("C. toPersistedEditorialBlock preserva dados integrais sem truncamento", () => {
      const draft = createSampleDraft();
      const block = draft.pages[0].blocks[0];
      const blockDoc = toPersistedEditorialBlock(block);

      expect(blockDoc.id).toBe("eb_1");
      expect(blockDoc.type).toBe("HERO_TITLE");
      expect(blockDoc.content).toBe("Insuficiência Cardíaca Aguda Descompensada");
      expect(blockDoc.provenance.sourceTextVerbatim).toBe("Insuficiência Cardíaca Aguda Descompensada");
      expect(blockDoc.layoutHints.keepWithNext).toBe(true);
    });

    it("D. toPersistedSourceBlockAssignment preserva o mapeamento individual", () => {
      const assignment = {
        sourceBlockId: "sb_1",
        status: "ASSIGNED" as const,
        assignedEditorialBlockId: "eb_1",
      };
      const doc = toPersistedSourceBlockAssignment(assignment);
      expect(doc.sourceBlockId).toBe("sb_1");
      expect(doc.status).toBe("ASSIGNED");
      expect(doc.assignedEditorialBlockId).toBe("eb_1");
    });

    it("E. Validação Fail-Closed: lança erro se header exceder 900KB", () => {
      const draft = createSampleDraft();
      draft.topic = "A".repeat(MAX_EDITORIAL_PAYLOAD_BYTES + 100);

      expect(() => toPersistedEditorialDraftHeader(draft)).toThrow(
        /EDITORIAL_DRAFT_HEADER_TOO_LARGE/
      );
    });

    it("F. Validação Fail-Closed: lança erro se bloco editorial exceder 900KB", () => {
      const draft = createSampleDraft();
      const block = draft.pages[0].blocks[0];
      block.content = "B".repeat(MAX_EDITORIAL_PAYLOAD_BYTES + 100);

      expect(() => toPersistedEditorialBlock(block)).toThrow(
        /EDITORIAL_BLOCK_TOO_LARGE/
      );
    });
  });

  describe("Repositórios e Persistência no Firestore", () => {
    it("G. EditorialDraftRepository.saveDraft grava header e subcoleções (pages, blocks, sourceAssignments)", async () => {
      const draft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(draft);

      const header = await EditorialDraftRepository.getHeader(draft.id);
      expect(header).not.toBeNull();
      expect(header?.id).toBe(draft.id);
      expect(header?.pageCount).toBe(2);

      const pages = await EditorialDraftRepository.listPages(draft.id);
      expect(pages).toHaveLength(2);
      expect(pages[0].blockRefs).toEqual(["eb_1", "eb_2"]);
      expect(pages[1].blockRefs).toEqual(["eb_3"]);

      const blocks = await EditorialDraftRepository.listBlocks(draft.id);
      expect(blocks).toHaveLength(3);
      expect(blocks.map((b) => b.id).sort()).toEqual(["eb_1", "eb_2", "eb_3"]);

      const assignments = await EditorialDraftRepository.listAssignments(draft.id);
      expect(assignments).toHaveLength(3);
      expect(assignments.map((a) => a.sourceBlockId).sort()).toEqual(["sb_1", "sb_2", "sb_3"]);
    });

    it("H. EditorialJobRepository persiste e recupera lightweight job sem embutir draft pesado", async () => {
      const jobState: EditorialJobState = {
        jobId: "job_ed_42",
        structuredContentId: "content_struct_999",
        status: "DRAFT_READY",
        progress: 100,
        startedAt: "2026-09-04T12:00:00.000Z",
        finishedAt: "2026-09-04T12:00:02.000Z",
        jobFingerprint: "sha256_mock_cardio",
      };

      await EditorialJobRepository.saveJob(jobState, "draft_cardio_101");

      const rawJobDoc = mockFirestore.store.get(`${EDITORIAL_JOBS_COLLECTION}/job_ed_42`);
      expect(rawJobDoc).toBeDefined();
      expect(rawJobDoc.jobId).toBe("job_ed_42");
      expect(rawJobDoc.draftId).toBe("draft_cardio_101");
      expect(rawJobDoc.draft).toBeUndefined(); // Não embute o draft inteiro

      const loaded = await EditorialJobRepository.getJob("job_ed_42");
      expect(loaded?.jobId).toBe("job_ed_42");
      expect(loaded?.draftId).toBe("draft_cardio_101");
      expect(loaded?.status).toBe("DRAFT_READY");
    });
  });

  describe("Serviço de Hidratação (Reconstituição do Draft)", () => {
    it("I. EditorialDraftHydrationService.hydrateDraft reconstrói integralmente o draft com pages e plan.pagePlan unificados", async () => {
      const originalDraft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(originalDraft);

      const hydrated = await EditorialDraftHydrationService.hydrateDraft(originalDraft.id);
      expect(hydrated).not.toBeNull();
      expect(hydrated!.id).toBe(originalDraft.id);
      expect(hydrated!.pages).toHaveLength(2);
      expect(hydrated!.pages[0].blocks).toHaveLength(2);
      expect(hydrated!.pages[0].blocks[0].id).toBe("eb_1");
      expect(hydrated!.pages[0].blocks[0].content).toBe("Insuficiência Cardíaca Aguda Descompensada");
      expect(hydrated!.pages[1].blocks).toHaveLength(1);
      expect(hydrated!.pages[1].blocks[0].id).toBe("eb_3");

      // draft.pages and draft.plan.pagePlan must point to the identical reconstructed structure
      expect(hydrated!.pages).toEqual(hydrated!.plan.pagePlan);
      expect(hydrated!.plan.sourceBlockAssignments).toHaveLength(3);
    });

    it("J. EditorialDraftHydrationService.getDraftByStructuredContentId encontra e hidrata o draft mais recente", async () => {
      const originalDraft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(originalDraft);

      const hydrated = await EditorialDraftHydrationService.getDraftByStructuredContentId(
        "content_struct_999"
      );
      expect(hydrated).not.toBeNull();
      expect(hydrated!.id).toBe(originalDraft.id);
      expect(hydrated!.topic).toBe("Insuficiência Cardíaca Aguda");
    });
  });

  describe("Operações Editoriais Duráveis com Transações Firestore", () => {
    it("K. reorderPageBlocks persiste nova ordem de blocos e atualiza editorialOrder", async () => {
      const draft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(draft);

      // Reorder on page 0: move eb_2 (index 1) to index 0
      await EditorialJobManager.getInstance().reorderPageBlocks(draft.id, 0, 1, 0);

      // Wipe RAM cache to simulate restart
      EditorialJobManager.getInstance().reset();

      const rehydrated = await EditorialDraftHydrationService.hydrateDraft(draft.id);
      expect(rehydrated!.pages[0].blocks[0].id).toBe("eb_2");
      expect(rehydrated!.pages[0].blocks[1].id).toBe("eb_1");
      expect(rehydrated!.pages[0].blocks[0].editorialOrder).toBe(1);
      expect(rehydrated!.pages[0].blocks[1].editorialOrder).toBe(2);
    });

    it("L. changeComponentType atualiza o tipo do bloco no Firestore", async () => {
      const draft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(draft);

      await EditorialJobManager.getInstance().changeComponentType(
        draft.id,
        "eb_2",
        "WARNING_CALLOUT"
      );

      // Wipe RAM cache
      EditorialJobManager.getInstance().reset();

      const rehydrated = await EditorialDraftHydrationService.hydrateDraft(draft.id);
      expect(rehydrated!.pages[0].blocks[1].id).toBe("eb_2");
      expect(rehydrated!.pages[0].blocks[1].type).toBe("WARNING_CALLOUT");
    });

    it("M. insertPageBreakAtBlock divide a página atomicamente, cria nova página e ajusta índices", async () => {
      const draft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(draft);

      // In page 0 (containing eb_1 and eb_2), break at eb_2
      await EditorialJobManager.getInstance().insertPageBreakAtBlock(draft.id, "eb_2");

      // Wipe RAM cache
      EditorialJobManager.getInstance().reset();

      const rehydrated = await EditorialDraftHydrationService.hydrateDraft(draft.id);
      expect(rehydrated!.pages).toHaveLength(3);

      // Page 0 has only eb_1
      expect(rehydrated!.pages[0].pageIndex).toBe(0);
      expect(rehydrated!.pages[0].blocks.map((b) => b.id)).toEqual(["eb_1"]);

      // Page 1 is the new page containing eb_2
      expect(rehydrated!.pages[1].pageIndex).toBe(1);
      expect(rehydrated!.pages[1].blocks.map((b) => b.id)).toEqual(["eb_2"]);
      expect(rehydrated!.pages[1].pageBreakReason).toContain("Quebra manual");

      // Page 2 was originally page 1 (eb_3), pageIndex shifted to 2
      expect(rehydrated!.pages[2].pageIndex).toBe(2);
      expect(rehydrated!.pages[2].blocks.map((b) => b.id)).toEqual(["eb_3"]);

      // Header pageCount updated
      const header = await EditorialDraftRepository.getHeader(draft.id);
      expect(header?.pageCount).toBe(3);
    });

    it("N. approveEditorialLayout aprova se zero perdas e rejeita se houver blocos não atribuídos", async () => {
      const draft = createSampleDraft();
      await EditorialDraftRepository.saveDraft(draft);

      // Approve valid draft
      await EditorialJobManager.getInstance().approveEditorialLayout(draft.id);

      // Wipe RAM
      EditorialJobManager.getInstance().reset();

      const rehydrated = await EditorialDraftHydrationService.hydrateDraft(draft.id);
      expect(rehydrated!.status).toBe("APPROVED_EDITORIAL");
      expect(rehydrated!.plan.compositionStatus).toBe("APPROVED_EDITORIAL");

      // Try approving a draft with unaccounted blocks
      const badDraft = createSampleDraft("draft_bad_999");
      badDraft.plan.unaccountedSourceBlocks = 1;
      await EditorialDraftRepository.saveDraft(badDraft);

      await expect(
        EditorialJobManager.getInstance().approveEditorialLayout(badDraft.id)
      ).rejects.toThrow(/CANNOT_APPROVE_UNACCOUNTED_BLOCKS/);
    });
  });

  describe("Ciclo de Vida Completo Pós-Restart Simulado", () => {
    it("O. Executa Composição -> Reinicia Servidor -> Recupera Job e Draft -> Aplica Modificações -> Aprova", async () => {
      const structuredContent: StructuredSourceContent = {
        id: "content_struct_cardio_1",
        sourceDocumentId: "doc_cardiologia_2026",
        segmentId: "seg_1",
        topic: "Insuficiência Cardíaca Aguda",
        subtopics: ["IC Aguda", "Manejo"],
        confidenceScore: 0.95,
        status: "APPROVED_STRUCTURE",
        styleProfile: "MEDICAL_EDITORIAL_V1",
        blocks: [
          {
            id: "sb_10",
            type: "HEADING",
            order: 1,
            pageNumber: 1,
            sourceBlockId: "sb_10",
            originalText: "Manejo da Insuficiência Cardíaca Aguda Descompensada",
            semanticRole: "DOCUMENT_TITLE",
            provenance: {
              documentId: "doc_cardiologia_2026",
              pageNumber: 1,
              sourceBlockId: "sb_10",
              extractionConfidence: "HIGH",
            },
          },
          {
            id: "sb_20",
            type: "PARAGRAPH",
            order: 2,
            pageNumber: 1,
            sourceBlockId: "sb_20",
            originalText: "A avaliação clínica imediata deve focar em congestão e perfusão periférica.",
            semanticRole: "CORE_CONCEPT",
            provenance: {
              documentId: "doc_cardiologia_2026",
              pageNumber: 1,
              sourceBlockId: "sb_20",
              extractionConfidence: "HIGH",
            },
          },
          {
            id: "sb_30",
            type: "CALLOUT",
            order: 3,
            pageNumber: 1,
            sourceBlockId: "sb_30",
            originalText: "Atenção: hipotensão severa contraindica uso imediato de vasodilatadores.",
            semanticRole: "WARNING",
            provenance: {
              documentId: "doc_cardiologia_2026",
              pageNumber: 1,
              sourceBlockId: "sb_30",
              extractionConfidence: "HIGH",
            },
          },
        ],
        unmappedVerbatimPageIds: [],
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      };

      // 1. Start composition job
      const edManager = EditorialJobManager.getInstance();
      const { job, draft } = await edManager.createAndRunCompositionJob(structuredContent);

      expect(job.status).toBe("DRAFT_READY");
      expect(draft.pages.length).toBeGreaterThan(0);
      const generatedDraftId = draft.id;
      const generatedJobId = job.jobId;

      // 2. SIMULATE COMPLETE SERVER RESTART: wipe memory completely
      edManager.reset();

      // 3. Query job after restart
      const recoveredJob = await edManager.getJob(generatedJobId);
      expect(recoveredJob).toBeDefined();
      expect(recoveredJob?.status).toBe("DRAFT_READY");
      expect(recoveredJob?.draft).toBeDefined();
      expect(recoveredJob?.draft?.id).toBe(generatedDraftId);

      // 4. Query draft by content ID after restart
      const recoveredDraft = await edManager.getDraftByStructuredContentId(structuredContent.id);
      expect(recoveredDraft).toBeDefined();
      expect(recoveredDraft?.id).toBe(generatedDraftId);

      // 5. Approve layout after restart
      const approvedDraft = await edManager.approveEditorialLayout(generatedDraftId);
      expect(approvedDraft.status).toBe("APPROVED_EDITORIAL");

      // 6. SIMULATE ANOTHER RESTART: verify approval persisted
      edManager.reset();
      const postRestartApproved = await edManager.getDraft(generatedDraftId);
      expect(postRestartApproved?.status).toBe("APPROVED_EDITORIAL");
    });
  });
});
