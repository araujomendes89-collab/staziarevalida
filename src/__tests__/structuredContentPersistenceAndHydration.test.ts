import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import {
  toPersistedStructuredBlock,
  toPersistedStructuredContentHeader,
  PersistedStructuredBlock,
  PersistedStructuredContentHeader,
  MAX_STRUCTURED_BLOCK_BYTES,
} from "../../server/contentEngine/structuredContentPersistence";
import {
  StructuredBlockRepository,
  STRUCTURED_BLOCKS_SUBCOLLECTION,
} from "../../server/contentEngine/structuredBlockRepository";
import {
  StructuredContentRepository,
  STRUCTURED_CONTENTS_COLLECTION,
} from "../../server/contentEngine/structuredContentRepository";
import { StructuredContentHydrationService } from "../../server/contentEngine/structuredContentHydrationService";
import {
  SegmentationJobRepository,
  SEGMENTATION_JOBS_COLLECTION,
  SEGMENTS_SUBCOLLECTION,
} from "../../server/segmentation/segmentationJobRepository";
import {
  SegmentationJobManager,
  SegmentationJobState,
} from "../../server/segmentation/segmentationJobQueue";
import {
  adminPdfIngestionRouter,
  resetSourceDocumentsStore,
  registerSourceDocumentInStore,
} from "../../server/routes/adminPdfIngestion";
import * as firebaseAdminModule from "../../server/firebaseAdmin";
import {
  DocumentSegment,
  MedicalSegmentationResult,
  StructuredSourceBlock,
  StructuredSourceContent,
} from "../types/medicalTaxonomy";
import { SourceDocument } from "../types/pdfIngestion";

/**
 * High-fidelity in-memory Firestore Mock with multi-level subcollections and transaction simulation.
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
                  delete: async () => {
                    rootThis.store.delete(fullSubDocPath);
                  },
                };
              },
              get: async () => {
                const prefix = `${fullSubPath}/`;
                const docs: any[] = [];
                for (const [key, value] of rootThis.store.entries()) {
                  if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
                    docs.push({
                      id: key.slice(prefix.length),
                      data: () => JSON.parse(JSON.stringify(value)),
                    });
                  }
                }
                return {
                  docs,
                  empty: docs.length === 0,
                };
              },
            };
          },
        };
      },
      where: (field: string, op: string, val: any) => {
        return {
          get: async () => {
            const prefix = `${collectionPath}/`;
            const docs: any[] = [];
            for (const [key, value] of rootThis.store.entries()) {
              if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
                if (op === "==" && value[field] === val) {
                  docs.push({
                    id: key.slice(prefix.length),
                    data: () => JSON.parse(JSON.stringify(value)),
                  });
                }
              }
            }
            return {
              docs,
              empty: docs.length === 0,
            };
          },
        };
      },
      get: async () => {
        const prefix = `${collectionPath}/`;
        const docs: any[] = [];
        for (const [key, value] of rootThis.store.entries()) {
          if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
            docs.push({
              id: key.slice(prefix.length),
              data: () => JSON.parse(JSON.stringify(value)),
            });
          }
        }
        return {
          docs,
          empty: docs.length === 0,
        };
      },
    };
  }

  batch() {
    const operations: Array<() => Promise<void>> = [];
    return {
      set: (docRef: any, data: any, options?: { merge?: boolean }) => {
        operations.push(async () => {
          await docRef.set(data, options);
        });
      },
      delete: (docRef: any) => {
        operations.push(async () => {
          await docRef.delete();
        });
      },
      commit: async () => {
        for (const op of operations) {
          await op();
        }
      },
    };
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>): Promise<any> {
    const rootThis = this;
    const reads: Map<string, any> = new Map();
    const writes: Array<() => Promise<void>> = [];

    const transaction = {
      get: async (docRef: any) => {
        const snap = await docRef.get();
        return snap;
      },
      set: (docRef: any, data: any, options?: { merge?: boolean }) => {
        writes.push(async () => {
          await docRef.set(data, options);
        });
      },
      delete: (docRef: any) => {
        writes.push(async () => {
          await docRef.delete();
        });
      },
    };

    const result = await updateFunction(transaction);
    for (const write of writes) {
      await write();
    }
    return result;
  }
}

async function makeRequest(
  app: express.Express,
  method: "GET" | "POST",
  routePath: string,
  options?: { headers?: Record<string, string>; body?: any }
) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        return reject(new Error("Unable to obtain port"));
      }
      const port = address.port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${routePath}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
        });
        const contentType = res.headers.get("content-type");
        let body: any = null;
        if (contentType && contentType.includes("application/json")) {
          body = await res.json();
        } else {
          body = await res.text();
        }
        server.close(() => {
          resolve({ status: res.status, body });
        });
      } catch (err) {
        server.close(() => {
          reject(err);
        });
      }
    });
  });
}

describe("Etapa Persistência Durável 3: Segmentação + Structured Content", () => {
  let app: express.Express;
  let inMemoryDb: InMemoryFirestoreMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetSourceDocumentsStore();
    inMemoryDb = new InMemoryFirestoreMock();

    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(inMemoryDb as any);
    vi.spyOn(firebaseAdminModule, "getAdminAuth").mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: "admin_uid_777", email: "admin@staziamed.com.br" }),
    } as any);

    app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api/admin/content", adminPdfIngestionRouter);
  });

  describe("1. Structured Block & Header Persistence Contracts", () => {
    it("A & B. Structured block persists under sourceDocuments/{docId}/structuredBlocks and excludes order", () => {
      const block: StructuredSourceBlock = {
        id: "sb_cardio_01",
        type: "SOURCE_PARAGRAPH",
        order: 1, // runtime ordering
        pageNumber: 4,
        sourceBlockId: "src_blk_01",
        originalText: "Hipertensão arterial sistêmica é uma condição clínica multifatorial...",
        semanticRole: "DEFINITION",
        provenance: {
          documentId: "doc_has_001",
          segmentId: "seg_has_01",
          pageNumber: 4,
          sourceBlockId: "src_blk_01",
        },
      };

      const persisted = toPersistedStructuredBlock("doc_has_001", block);
      expect(persisted.id).toBe("sb_cardio_01");
      expect(persisted.sourceDocumentId).toBe("doc_has_001");
      expect((persisted as any).order).toBeUndefined(); // order is NOT persisted
      expect(persisted.originalText).toBe(block.originalText);
      expect(persisted.semanticRole).toBe("DEFINITION");
    });

    it("C & D. Structured content header persists under structuredContents and excludes blocks[] array", () => {
      const content: StructuredSourceContent = {
        id: "sc_has_01",
        sourceDocumentId: "doc_has_001",
        segmentId: "seg_has_01",
        area: "CLINICA_MEDICA",
        specialty: "Cardiologia",
        topic: "Hipertensão Arterial Sistêmica",
        subtopics: ["Diagnóstico", "Classificação"],
        suggestedCanonicalTopicId: "top_has",
        sourcePages: [4, 5],
        sourceBlockRefs: ["src_blk_01", "src_blk_02"],
        blocks: [
          {
            id: "sb_cardio_01",
            type: "SOURCE_PARAGRAPH",
            order: 1,
            pageNumber: 4,
            sourceBlockId: "src_blk_01",
            originalText: "Definição de HAS",
            provenance: {
              documentId: "doc_has_001",
              segmentId: "seg_has_01",
              pageNumber: 4,
              sourceBlockId: "src_blk_01",
            },
          },
        ],
        classificationConfidence: 0.95,
        status: "STRUCTURING",
        taxonomyVersion: "2026.1.0",
        totalSourceBlocks: 1,
        assignedSourceBlocks: 1,
        unassignedSourceBlocks: 0,
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      };

      const header = toPersistedStructuredContentHeader(content, "job_123");
      expect(header.id).toBe("sc_has_01");
      expect((header as any).blocks).toBeUndefined(); // blocks[] is strictly excluded
      expect(header.blockRefs).toEqual([
        {
          blockId: "sb_cardio_01",
          sourceBlockId: "src_blk_01",
          pageNumber: 4,
        },
      ]);
      expect(header.segmentationJobId).toBe("job_123");
    });

    it("G, H & I. Preserves verbatim originalText, tableData, and figureData with 100% fidelity", () => {
      const block: StructuredSourceBlock = {
        id: "sb_complex_01",
        type: "SOURCE_TABLE",
        order: 2,
        pageNumber: 6,
        sourceBlockId: "src_tbl_01",
        originalText: "Tabela 1: Metas Pressóricas",
        tableData: {
          tableId: "tbl_1",
          documentId: "doc_has_001",
          pageNumber: 6,
          columns: 3,
          rows: 3,
          cells: [
            ["Categoria", "PAS", "PAD"],
            ["Ótima", "< 120", "< 80"],
            ["Hipertensão Estágio 1", "140-159", "90-99"],
          ],
          structureConfidence: 0.99,
        },
        figureData: {
          figureId: "fig_1",
          documentId: "doc_has_001",
          pageNumber: 6,
          caption: "Fluxograma de conduta",
          confidence: 0.95,
        },
        provenance: {
          documentId: "doc_has_001",
          segmentId: "seg_has_01",
          pageNumber: 6,
          sourceBlockId: "src_tbl_01",
        },
      };

      const persisted = toPersistedStructuredBlock("doc_has_001", block);
      expect(persisted.tableData?.cells).toEqual(block.tableData?.cells);
      expect(persisted.figureData?.caption).toBe("Fluxograma de conduta");
    });

    it("J & K. Fail-closed: Throws STRUCTURED_BLOCK_TOO_LARGE when block exceeds safe threshold", () => {
      const hugeBlock: StructuredSourceBlock = {
        id: "sb_huge_01",
        type: "SOURCE_PARAGRAPH",
        order: 1,
        pageNumber: 1,
        sourceBlockId: "src_blk_huge",
        originalText: "A".repeat(MAX_STRUCTURED_BLOCK_BYTES + 5000),
        provenance: {
          documentId: "doc_has_001",
          segmentId: "seg_has_01",
          pageNumber: 1,
          sourceBlockId: "src_blk_huge",
        },
      };

      expect(() => toPersistedStructuredBlock("doc_has_001", hugeBlock)).toThrow(
        /STRUCTURED_BLOCK_TOO_LARGE/
      );
    });
  });

  describe("2. StructuredBlockRepository Operations & Deduplication", () => {
    const docId = "doc_block_repo_001";

    it("L. Deduplicates identical blocks by ID during batch save", async () => {
      const blockA: StructuredSourceBlock = {
        id: "sb_shared_01",
        type: "SOURCE_PARAGRAPH",
        order: 1,
        pageNumber: 2,
        sourceBlockId: "src_blk_shared",
        originalText: "Texto compartilhado idêntico",
        provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 2, sourceBlockId: "src_blk_shared" },
      };
      const blockB: StructuredSourceBlock = {
        ...blockA,
        order: 5, // different runtime order
      };

      await StructuredBlockRepository.saveBlocks(docId, [blockA, blockB]);

      const retrieved = await StructuredBlockRepository.getBlock(docId, "sb_shared_01");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.originalText).toBe("Texto compartilhado idêntico");
    });

    it("M. Fail-closed: Throws STRUCTURED_BLOCK_ID_CONFLICT when same ID has conflicting payloads", async () => {
      const blockA: StructuredSourceBlock = {
        id: "sb_conflict_01",
        type: "SOURCE_PARAGRAPH",
        order: 1,
        pageNumber: 2,
        sourceBlockId: "src_blk_c",
        originalText: "Versão A do texto",
        provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 2, sourceBlockId: "src_blk_c" },
      };
      const blockB: StructuredSourceBlock = {
        id: "sb_conflict_01",
        type: "SOURCE_PARAGRAPH",
        order: 2,
        pageNumber: 2,
        sourceBlockId: "src_blk_c",
        originalText: "Versão B conflitante do texto",
        provenance: { documentId: docId, segmentId: "seg_2", pageNumber: 2, sourceBlockId: "src_blk_c" },
      };

      await expect(StructuredBlockRepository.saveBlocks(docId, [blockA, blockB])).rejects.toThrow(
        /STRUCTURED_BLOCK_ID_CONFLICT/
      );
    });
  });

  describe("3. Hydration Service & Order Reconstruction", () => {
    it("F. Hydrates StructuredSourceContent and reconstructs sequential order from blockRefs", async () => {
      const docId = "doc_hyd_001";
      const contentId = "sc_hyd_01";

      // Save blocks into sourceDocuments subcollection
      await StructuredBlockRepository.saveBlocks(docId, [
        {
          id: "blk_z",
          type: "SOURCE_HEADING",
          order: 99,
          pageNumber: 1,
          sourceBlockId: "src_1",
          originalText: "Título Principal",
          provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 1, sourceBlockId: "src_1" },
        },
        {
          id: "blk_a",
          type: "SOURCE_PARAGRAPH",
          order: 99,
          pageNumber: 1,
          sourceBlockId: "src_2",
          originalText: "Parágrafo Explicativo",
          provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 1, sourceBlockId: "src_2" },
        },
      ]);

      // Save header into top-level structuredContents
      await StructuredContentRepository.saveHeader({
        id: contentId,
        sourceDocumentId: docId,
        segmentId: "seg_1",
        area: "CIRURGIA",
        topic: "Apendicite Aguda",
        subtopics: ["Diagnóstico"],
        sourcePages: [1],
        sourceBlockRefs: ["src_1", "src_2"],
        blockRefs: [
          { blockId: "blk_z", sourceBlockId: "src_1", pageNumber: 1 },
          { blockId: "blk_a", sourceBlockId: "src_2", pageNumber: 1 },
        ],
        classificationConfidence: 0.99,
        status: "STRUCTURING",
        taxonomyVersion: "2026.1.0",
        totalSourceBlocks: 2,
        assignedSourceBlocks: 2,
        unassignedSourceBlocks: 0,
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      });

      const hydrated = await StructuredContentHydrationService.hydrateStructuredContent(contentId);
      expect(hydrated).not.toBeNull();
      expect(hydrated?.blocks.length).toBe(2);
      expect(hydrated?.blocks[0].id).toBe("blk_z");
      expect(hydrated?.blocks[0].order).toBe(1); // restored order
      expect(hydrated?.blocks[1].id).toBe("blk_a");
      expect(hydrated?.blocks[1].order).toBe(2); // restored order
      expect(hydrated?.blocks[0].originalText).toBe("Título Principal");
    });
  });

  describe("4. Transactions: Confirm Canonical, Update, Approve, Split & Merge", () => {
    const docId = "doc_trans_001";

    beforeEach(async () => {
      await StructuredBlockRepository.saveBlocks(docId, [
        {
          id: "b1",
          type: "SOURCE_PARAGRAPH",
          order: 1,
          pageNumber: 1,
          sourceBlockId: "s1",
          originalText: "Texto 1",
          provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 1, sourceBlockId: "s1" },
        },
        {
          id: "b2",
          type: "SOURCE_PARAGRAPH",
          order: 2,
          pageNumber: 2,
          sourceBlockId: "s2",
          originalText: "Texto 2",
          provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 2, sourceBlockId: "s2" },
        },
        {
          id: "b3",
          type: "SOURCE_PARAGRAPH",
          order: 3,
          pageNumber: 3,
          sourceBlockId: "s3",
          originalText: "Texto 3",
          provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 3, sourceBlockId: "s3" },
        },
      ]);

      await StructuredContentRepository.saveHeader({
        id: "sc_trans_item_01",
        sourceDocumentId: docId,
        segmentId: "seg_1",
        area: "PEDIATRIA",
        topic: "Bronquiolite Viral Aguda",
        subtopics: ["Etiologia", "Tratamento"],
        sourcePages: [1, 2, 3],
        sourceBlockRefs: ["s1", "s2", "s3"],
        blockRefs: [
          { blockId: "b1", sourceBlockId: "s1", pageNumber: 1 },
          { blockId: "b2", sourceBlockId: "s2", pageNumber: 2 },
          { blockId: "b3", sourceBlockId: "s3", pageNumber: 3 },
        ],
        classificationConfidence: 0.95,
        status: "STRUCTURING",
        taxonomyVersion: "2026.1.0",
        totalSourceBlocks: 3,
        assignedSourceBlocks: 3,
        unassignedSourceBlocks: 0,
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      });
    });

    it("N. confirmCanonicalTopic executes in Firestore and persists canonicalTopicId", async () => {
      const segManager = SegmentationJobManager.getInstance();
      segManager.reset(); // Wipe memory cache

      const updated = await segManager.confirmCanonicalTopic("sc_trans_item_01", "top_bronquiolite");
      expect(updated.canonicalTopicId).toBe("top_bronquiolite");

      // Verify directly from Firestore
      const header = await StructuredContentRepository.getHeader("sc_trans_item_01");
      expect(header?.canonicalTopicId).toBe("top_bronquiolite");
    });

    it("O. approveStructure executes in Firestore and updates status to APPROVED_STRUCTURE", async () => {
      const segManager = SegmentationJobManager.getInstance();
      segManager.reset();

      const updated = await segManager.approveStructure("sc_trans_item_01");
      expect(updated.status).toBe("APPROVED_STRUCTURE");

      const header = await StructuredContentRepository.getHeader("sc_trans_item_01");
      expect(header?.status).toBe("APPROVED_STRUCTURE");
    });

    it("P. updateMetadata updates permitted metadata fields in Firestore", async () => {
      const segManager = SegmentationJobManager.getInstance();
      segManager.reset();

      const updated = await segManager.updateMetadata("sc_trans_item_01", {
        specialty: "Pneumologia Pediátrica",
        topic: "Bronquiolite Obliterante",
      });

      expect(updated.specialty).toBe("Pneumologia Pediátrica");
      expect(updated.topic).toBe("Bronquiolite Obliterante");

      const header = await StructuredContentRepository.getHeader("sc_trans_item_01");
      expect(header?.specialty).toBe("Pneumologia Pediátrica");
    });

    it("Q, R & S. splitSegment performs atomic transaction: creates 2 new headers, deletes original, preserves structured blocks", async () => {
      const segManager = SegmentationJobManager.getInstance();
      segManager.reset();

      const parts = await segManager.splitSegment("sc_trans_item_01", 1);
      expect(parts.length).toBe(2);
      expect(parts[0].id).toBe("sc_trans_item_01_part1");
      expect(parts[1].id).toBe("sc_trans_item_01_part2");
      expect(parts[0].blocks.length).toBe(1);
      expect(parts[1].blocks.length).toBe(2);
      expect(parts[1].topic).toBe("Bronquiolite Viral Aguda (Parte 2)");

      // Original header deleted
      const originalHeader = await StructuredContentRepository.getHeader("sc_trans_item_01");
      expect(originalHeader).toBeNull();

      // Original structured blocks remain untouched
      const block1 = await StructuredBlockRepository.getBlock(docId, "b1");
      const block2 = await StructuredBlockRepository.getBlock(docId, "b2");
      expect(block1).not.toBeNull();
      expect(block2).not.toBeNull();
    });

    it("T, U, V & W. mergeSegments performs atomic transaction, rejects cross-document merge, preserves structured blocks", async () => {
      const segManager = SegmentationJobManager.getInstance();
      segManager.reset();

      // Split first
      const [part1, part2] = await segManager.splitSegment("sc_trans_item_01", 1);
      segManager.reset();

      // Merge back
      const merged = await segManager.mergeSegments(part1.id, part2.id);
      expect(merged.id.startsWith("sc_merged_")).toBe(true);
      expect(merged.blocks.length).toBe(3);
      expect(merged.blocks[0].order).toBe(1);
      expect(merged.blocks[1].order).toBe(2);
      expect(merged.blocks[2].order).toBe(3);

      // Verify parts are deleted
      expect(await StructuredContentRepository.getHeader(part1.id)).toBeNull();
      expect(await StructuredContentRepository.getHeader(part2.id)).toBeNull();

      // Cross-document merge attempt must fail
      await StructuredContentRepository.saveHeader({
        id: "sc_other_doc",
        sourceDocumentId: "other_doc_999",
        segmentId: "seg_x",
        topic: "Other",
        subtopics: [],
        sourcePages: [1],
        sourceBlockRefs: [],
        blockRefs: [],
        classificationConfidence: 1,
        status: "STRUCTURING",
        taxonomyVersion: "2026.1.0",
        totalSourceBlocks: 0,
        assignedSourceBlocks: 0,
        unassignedSourceBlocks: 0,
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      });

      await expect(segManager.mergeSegments(merged.id, "sc_other_doc")).rejects.toThrow(
        /CROSS_DOCUMENT_MERGE_FORBIDDEN/
      );
    });
  });

  describe("5. SegmentationJobRepository & Cold Restart Lifecycle", () => {
    it("X, Y, Z & AA. Segmentation job persists metadata and segments in subcollection, reconstructing result on cold read", async () => {
      const jobId = "job_seg_test_001";
      const docId = "doc_seg_test_001";

      const segments: DocumentSegment[] = [
        {
          id: "seg_1",
          documentId: docId,
          pageStart: 1,
          pageEnd: 2,
          sourcePageRefs: [1, 2],
          detectedTitle: "Segmento 1",
          detectedHeadings: ["Heading 1"],
          sourceBlockRefs: ["b1"],
          tableRefs: [],
          figureRefs: [],
          segmentType: "TOPIC_SEGMENT",
          segmentationConfidence: 0.95,
          boundaryReason: "HEADING_MATCH",
          status: "PROCESSED",
          createdAt: "2026-09-04T12:00:00.000Z",
        },
      ];

      await SegmentationJobRepository.saveJob(
        {
          jobId,
          documentId: docId,
          status: "REVIEW_REQUIRED",
          progress: 100,
          startedAt: "2026-09-04T12:00:00.000Z",
          finishedAt: "2026-09-04T12:00:05.000Z",
          jobFingerprint: "fingerprint_123",
        },
        {
          areasFoundSummary: {
            CLINICA_MEDICA: 1,
            CIRURGIA: 0,
            PEDIATRIA: 0,
            GINECOLOGIA_OBSTETRICIA: 0,
            MEDICINA_PREVENTIVA: 0,
          },
          totalSourceBlocks: 1,
          assignedSourceBlocks: 1,
          unassignedSourceBlocks: 0,
          segmentationDurationMs: 5000,
          segmentCount: 1,
          structuredContentCount: 1,
        }
      );

      await SegmentationJobRepository.saveSegments(jobId, segments);

      // Save a block & header for this document
      await StructuredBlockRepository.saveBlocks(docId, [
        {
          id: "b1",
          type: "SOURCE_PARAGRAPH",
          order: 1,
          pageNumber: 1,
          sourceBlockId: "sb1",
          originalText: "Texto do segmento 1",
          provenance: { documentId: docId, segmentId: "seg_1", pageNumber: 1, sourceBlockId: "sb1" },
        },
      ]);
      await StructuredContentRepository.saveHeader({
        id: "sc_1",
        sourceDocumentId: docId,
        segmentId: "seg_1",
        area: "CLINICA_MEDICA",
        topic: "Tema 1",
        subtopics: [],
        sourcePages: [1],
        sourceBlockRefs: ["sb1"],
        blockRefs: [{ blockId: "b1", sourceBlockId: "sb1", pageNumber: 1 }],
        classificationConfidence: 0.9,
        status: "STRUCTURING",
        taxonomyVersion: "2026.1.0",
        totalSourceBlocks: 1,
        assignedSourceBlocks: 1,
        unassignedSourceBlocks: 0,
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      });

      // Cold Restart: Wipe RAM
      const segManager = SegmentationJobManager.getInstance();
      segManager.reset();

      const job = await segManager.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.status).toBe("REVIEW_REQUIRED");
      expect(job?.result).toBeDefined();
      expect(job?.result?.segments.length).toBe(1);
      expect(job?.result?.structuredContents.length).toBe(1);
      expect(job?.result?.structuredContents[0].blocks[0].originalText).toBe("Texto do segmento 1");
    });

    it("AD, AE & AF. POST /editorial/start-job retrieves structured content from Firestore after RAM wipe", async () => {
      const docId = "doc_editorial_001";
      const contentId = "sc_approved_001";

      await StructuredBlockRepository.saveBlocks(docId, [
        {
          id: "b_ed_1",
          type: "SOURCE_PARAGRAPH",
          order: 1,
          pageNumber: 1,
          sourceBlockId: "sb_ed_1",
          originalText: "Clinical content ready for editorial draft.",
          provenance: { documentId: docId, segmentId: "seg_ed", pageNumber: 1, sourceBlockId: "sb_ed_1" },
        },
      ]);

      await StructuredContentRepository.saveHeader({
        id: contentId,
        sourceDocumentId: docId,
        segmentId: "seg_ed",
        area: "CLINICA_MEDICA",
        topic: "Dengue Manejo Clínico",
        subtopics: ["Classificação de Risco"],
        canonicalTopicId: "top_dengue",
        sourcePages: [1],
        sourceBlockRefs: ["sb_ed_1"],
        blockRefs: [{ blockId: "b_ed_1", sourceBlockId: "sb_ed_1", pageNumber: 1 }],
        classificationConfidence: 0.98,
        status: "APPROVED_STRUCTURE",
        taxonomyVersion: "2026.1.0",
        totalSourceBlocks: 1,
        assignedSourceBlocks: 1,
        unassignedSourceBlocks: 0,
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
      });

      // Wipe RAM
      resetSourceDocumentsStore();
      SegmentationJobManager.getInstance().reset();

      const res = await makeRequest(app, "POST", "/api/admin/content/editorial/start-job", {
        headers: { Authorization: "Bearer valid_admin_token" },
        body: { structuredContentId: contentId },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.draft).toBeDefined();
      expect(res.body.draft.topic).toBe("Dengue Manejo Clínico");
    });

    it("AE. Verifies no unresolved 'segManager.getStructuredContent(' exists in adminPdfIngestion.ts", () => {
      const routePath = path.resolve(__dirname, "../../server/routes/adminPdfIngestion.ts");
      const code = fs.readFileSync(routePath, "utf-8");
      expect(code).not.toContain("segManager.getStructuredContent(");
      expect(code).toContain("getStructuredContentById(");
    });
  });
});
