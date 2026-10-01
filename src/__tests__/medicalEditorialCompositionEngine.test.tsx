import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  EDITORIAL_COMPOSITION_VERSION,
  MEDICAL_EDITORIAL_TOKENS,
  EditorialBlock,
  EditorialComponentType,
  StaziaEditorialDocumentDraft,
} from "../types/medicalEditorial";
import { StructuredSourceContent } from "../types/medicalTaxonomy";
import { EditorialSemanticMappingService } from "../services/editorialSemanticMappingService";
import { StaziaEditorialCompositionEngine } from "../../server/editorial/staziaEditorialCompositionEngine";
import { EditorialJobManager } from "../../server/editorial/editorialJobQueue";
import { StaziaEditorialEditor } from "../components/admin/contentEngine/StaziaEditorialEditor";
import { A4PageContainer } from "../components/admin/contentEngine/editorial/A4PageContainer";
import { ScreenPageContainer } from "../components/admin/contentEngine/editorial/ScreenPageContainer";

import * as firebaseAdminModule from "../../server/firebaseAdmin";

/**
 * High-fidelity in-memory Firestore Mock supporting subcollections and transactions.
 */
class InMemoryFirestoreMock {
  public store: Map<string, any> = new Map();

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

describe("Medical Editorial Composition Engine — Etapa 1.28D", () => {
  let sampleContent: StructuredSourceContent;

  beforeEach(() => {
    sampleContent = {
      id: "struct-test-has-1",
      sourceDocumentId: "doc-test-1",
      segmentId: "seg_has_1",
      area: "CLINICA_MEDICA",
      specialty: "Cardiologia",
      topic: "Hipertensão Arterial Sistêmica",
      subtopics: ["Definição", "Classificação", "Tratamento Farmacológico"],
      canonicalTopicId: "top_has",
      sourcePages: [1, 2],
      sourceBlockRefs: ["b1", "b2", "b3", "b4", "b5"],
      blocks: [
        {
          id: "b1",
          type: "SOURCE_HEADING",
          order: 1,
          pageNumber: 1,
          sourceBlockId: "src_b1",
          originalText: "DIRETRIZ DE HIPERTENSÃO ARTERIAL SISTÊMICA",
          provenance: {
            documentId: "doc-test-1",
            segmentId: "seg_has_1",
            pageNumber: 1,
            sourceBlockId: "src_b1",
          },
        },
        {
          id: "b2",
          type: "SOURCE_PARAGRAPH",
          order: 2,
          pageNumber: 1,
          sourceBlockId: "src_b2",
          originalText: "A hipertensão arterial sistêmica é definida por PA sistólica >= 140 mmHg e/ou diastólica >= 90 mmHg.",
          provenance: {
            documentId: "doc-test-1",
            segmentId: "seg_has_1",
            pageNumber: 1,
            sourceBlockId: "src_b2",
          },
        },
        {
          id: "b3",
          type: "SOURCE_TABLE",
          order: 3,
          pageNumber: 1,
          sourceBlockId: "src_b3",
          originalText: "Tabela 1. Classificação Pressórica\nNormal: <= 120 e <= 80\nEstágio 1: 140-159 ou 90-99",
          tableData: {
            tableId: "t1",
            documentId: "doc-test-1",
            pageNumber: 1,
            columns: 2,
            rows: 2,
            cells: [
              ["Classificação", "Pressão Arterial"],
              ["Normal", "<= 120 e <= 80"],
            ],
            structureConfidence: 0.95,
          },
          provenance: {
            documentId: "doc-test-1",
            segmentId: "seg_has_1",
            pageNumber: 1,
            sourceBlockId: "src_b3",
          },
        },
        {
          id: "b4",
          type: "SOURCE_WARNING",
          order: 4,
          pageNumber: 2,
          sourceBlockId: "src_b4",
          originalText: "ALERTA: Pacientes diabéticos ou com doença renal crônica possuem meta pressórica mais estrita (< 130/80 mmHg).",
          provenance: {
            documentId: "doc-test-1",
            segmentId: "seg_has_1",
            pageNumber: 2,
            sourceBlockId: "src_b4",
          },
        },
        {
          id: "b5",
          type: "SOURCE_ALGORITHM",
          order: 5,
          pageNumber: 2,
          sourceBlockId: "src_b5",
          originalText: "FLUXOGRAMA: 1. Iniciar IECA/BRA -> 2. Associar BCC se não controlado -> 3. Adicionar Tiazídico.",
          provenance: {
            documentId: "doc-test-1",
            segmentId: "seg_has_1",
            pageNumber: 2,
            sourceBlockId: "src_b5",
          },
        },
      ],
      classificationConfidence: 0.98,
      status: "APPROVED_STRUCTURE",
      taxonomyVersion: "2026.1.0",
      totalSourceBlocks: 5,
      assignedSourceBlocks: 5,
      unassignedSourceBlocks: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  describe("1. Medical Editorial Design Tokens & Style Profile", () => {
    it("should export correct MEDICAL_EDITORIAL_TOKENS matching StaziaMed visual identity", () => {
      expect(EDITORIAL_COMPOSITION_VERSION).toBe("2026.1.0");
      expect(MEDICAL_EDITORIAL_TOKENS.background).toBe("#F8FAFC");
      expect(MEDICAL_EDITORIAL_TOKENS.surface).toBe("#FFFFFF");
      expect(MEDICAL_EDITORIAL_TOKENS.deepNavy).toBe("#0A192F");
      expect(MEDICAL_EDITORIAL_TOKENS.teal).toBe("#0D9488");
      expect(MEDICAL_EDITORIAL_TOKENS.stickyYellow).toBe("#FEF9C3");
    });
  });

  describe("2. Semantic Mapping & Verbatim Integrity", () => {
    it("should deterministically map all source block types to appropriate StaziaMed editorial components", () => {
      const mappingService = EditorialSemanticMappingService.getInstance();
      
      const mappedHeading = mappingService.mapSourceBlockToEditorial(sampleContent.blocks[0], 1);
      expect(mappedHeading.type).toBe("BrushSectionHeader");
      expect(mappedHeading.content).toBe(sampleContent.blocks[0].originalText);

      const mappedParagraph = mappingService.mapSourceBlockToEditorial(sampleContent.blocks[1], 2);
      expect(mappedParagraph.type).toBe("EditorialParagraph");
      expect(mappedParagraph.content).toBe(sampleContent.blocks[1].originalText);

      const mappedTable = mappingService.mapSourceBlockToEditorial(sampleContent.blocks[2], 3);
      expect(mappedTable.type).toBe("StaziaMedicalTable");
      expect(mappedTable.tableData).toBeDefined();

      const mappedWarning = mappingService.mapSourceBlockToEditorial(sampleContent.blocks[3], 4);
      expect(mappedWarning.type).toBe("ClinicalWarningCard");

      const mappedAlgorithm = mappingService.mapSourceBlockToEditorial(sampleContent.blocks[4], 5);
      expect(mappedAlgorithm.type).toBe("ClinicalAlgorithmSteps");
    });

    it("should map unresolvable table without tableData to EditorialSourceWarning", () => {
      const mappingService = EditorialSemanticMappingService.getInstance();
      const brokenTableBlock = {
        ...sampleContent.blocks[2],
        tableData: undefined,
      };

      const mapped = mappingService.mapSourceBlockToEditorial(brokenTableBlock, 1);
      expect(mapped.type).toBe("EditorialSourceWarning");
      expect(mapped.provenance.sourceBlockId).toBe("src_b3");
    });

    it("should guarantee 100% verbatim preservation with zero rewriting", () => {
      const mappingService = EditorialSemanticMappingService.getInstance();
      for (const block of sampleContent.blocks) {
        const mapped = mappingService.mapSourceBlockToEditorial(block, block.order);
        expect(mapped.content).toBe(block.originalText);
        expect(mapped.provenance.sourceTextVerbatim).toBe(block.originalText);
      }
    });
  });

  describe("3. Zero Loss & Zero Duplication Audits", () => {
    it("should produce composition draft with 0 unaccounted blocks and 0 duplicated assignments", async () => {
      const engine = StaziaEditorialCompositionEngine.getInstance();
      const { draft, plan } = await engine.composeDocument(sampleContent);

      expect(draft.id).toBe(`draft_${sampleContent.id}`);
      expect(draft.status).toBe("DRAFT");
      expect(draft.styleProfile).toBe("MEDICAL_EDITORIAL_V1");
      expect(plan.unaccountedSourceBlocks).toBe(0);
      expect(plan.duplicatedSourceBlockAssignments).toBe(0);
      expect(plan.totalStructuredSourceBlocks).toBe(5);
      expect(plan.assignedEditorialBlocks).toBe(5);
    });
  });

  describe("4. Multi-Page Density Distribution & Layout Planning", () => {
    it("should distribute large block lists into multiple balanced pages without overflow", async () => {
      const engine = StaziaEditorialCompositionEngine.getInstance();

      // Create a large segment with 20 blocks
      const manyBlocks = Array.from({ length: 20 }).map((_, idx) => ({
        id: `block_${idx + 1}`,
        type: idx % 4 === 0 ? ("SOURCE_HEADING" as const) : ("SOURCE_PARAGRAPH" as const),
        order: idx + 1,
        pageNumber: Math.floor(idx / 5) + 1,
        sourceBlockId: `src_block_${idx + 1}`,
        originalText: `Texto médico do bloco de teste número ${idx + 1}. Parágrafo com informação clínica essencial para fixação.`,
        provenance: {
          documentId: "doc-large",
          segmentId: "seg_large",
          pageNumber: Math.floor(idx / 5) + 1,
          sourceBlockId: `src_block_${idx + 1}`,
        },
      }));

      const largeContent: StructuredSourceContent = {
        ...sampleContent,
        id: "struct-large",
        blocks: manyBlocks,
        totalSourceBlocks: 20,
        assignedSourceBlocks: 20,
      };

      const { draft } = await engine.composeDocument(largeContent);

      expect(draft.pages.length).toBeGreaterThan(1);
      expect(draft.pages[0].pageRole).toBe("TOPIC_OPENING");
      expect(draft.pages[1].pageRole).toBe("CORE_CONTENT");

      // Check all blocks are accounted for across all pages
      const totalBlocksInPages = draft.pages.reduce((sum, p) => sum + p.blocks.length, 0);
      expect(totalBlocksInPages).toBe(20);
    });
  });

  describe("5. Editorial Job Queue & Admin Operations", () => {
    let jobManager: EditorialJobManager;
    let mockFirestore: InMemoryFirestoreMock;

    beforeEach(() => {
      mockFirestore = new InMemoryFirestoreMock();
      vi.spyOn(firebaseAdminModule, "getAdminDb").mockImplementation(() => {
        return mockFirestore as any;
      });

      jobManager = EditorialJobManager.getInstance();
      jobManager.reset();
    });

    it("should execute composition job and register draft in store", async () => {
      const { job, draft } = await jobManager.createAndRunCompositionJob(sampleContent);

      expect(job.status).toBe("DRAFT_READY");
      expect(job.progress).toBe(100);
      expect(draft.pages.length).toBeGreaterThanOrEqual(1);

      const retrieved = await jobManager.getDraft(draft.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(draft.id);
    });

    it("should allow admin to reorder blocks within a page", async () => {
      const { draft } = await jobManager.createAndRunCompositionJob(sampleContent);
      const pageIndex = 1;
      const initialFirstBlockId = draft.pages[0].blocks[0].id;
      const initialSecondBlockId = draft.pages[0].blocks[1].id;

      const updated = await jobManager.reorderPageBlocks(draft.id, pageIndex, 0, 1);
      expect(updated.pages[0].blocks[0].id).toBe(initialSecondBlockId);
      expect(updated.pages[0].blocks[1].id).toBe(initialFirstBlockId);
    });

    it("should allow admin to change component type of a block", async () => {
      const { draft } = await jobManager.createAndRunCompositionJob(sampleContent);
      const targetBlockId = draft.pages[0].blocks[1].id;

      const updated = await jobManager.changeComponentType(draft.id, targetBlockId, "StickyNoteCard");
      const targetBlock = updated.pages[0].blocks.find((b) => b.id === targetBlockId);
      expect(targetBlock?.type).toBe("StickyNoteCard");
    });

    it("should allow admin to insert a manual page break at a block", async () => {
      const { draft } = await jobManager.createAndRunCompositionJob(sampleContent);
      const initialPageCount = draft.pages.length;
      const secondBlockId = draft.pages[0].blocks[1].id;

      const updated = await jobManager.insertPageBreakAtBlock(draft.id, secondBlockId);
      expect(updated.pages.length).toBe(initialPageCount + 1);
      expect(updated.pages[1].blocks[0].id).toBe(secondBlockId);
      expect(updated.pages[1].pageBreakReason).toContain("Quebra manual");
    });

    it("should allow admin to approve layout without auto-publishing", async () => {
      const { draft } = await jobManager.createAndRunCompositionJob(sampleContent);
      expect(draft.status).toBe("DRAFT");

      const approved = await jobManager.approveEditorialLayout(draft.id);
      expect(approved.status).toBe("APPROVED_EDITORIAL");
      expect(approved.plan.compositionStatus).toBe("APPROVED_EDITORIAL");
    });
  });

  describe("6. React Editorial Editor UI & Viewport Modes", () => {
    it("should render StaziaEditorialEditor with A4 mode and toolbar", async () => {
      const engine = StaziaEditorialCompositionEngine.getInstance();
      const { draft } = await engine.composeDocument(sampleContent);

      const onClose = vi.fn();
      const onApprove = vi.fn();

      render(
        <StaziaEditorialEditor
          draft={draft}
          onClose={onClose}
          onApproveLayout={onApprove}
        />
      );

      expect(screen.getByText(/Editor Medical Editorial V1/i)).toBeInTheDocument();
      expect(screen.getByText(/A4 Print/i)).toBeInTheDocument();
      expect(screen.getByText(/Tela/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Hipertensão Arterial Sistêmica/i).length).toBeGreaterThan(0);

      // Click Approve Layout button
      const approveBtn = screen.getByRole("button", { name: /APROVAR LAYOUT/i });
      fireEvent.click(approveBtn);
      expect(onApprove).toHaveBeenCalledWith(draft.id);
    });

    it("should switch between A4 and Screen viewports", async () => {
      const engine = StaziaEditorialCompositionEngine.getInstance();
      const { draft } = await engine.composeDocument(sampleContent);

      render(
        <StaziaEditorialEditor
          draft={draft}
          onClose={() => {}}
        />
      );

      // Switch to Screen Mode
      const screenBtn = screen.getByText(/Tela/i);
      fireEvent.click(screenBtn);

      expect(screen.getByTitle("Desktop")).toBeInTheDocument();
      expect(screen.getByTitle("Tablet")).toBeInTheDocument();
      expect(screen.getByTitle("Mobile (390px)")).toBeInTheDocument();
    });

    it("should render A4PageContainer with exact 210mm x 297mm styling", async () => {
      const engine = StaziaEditorialCompositionEngine.getInstance();
      const { draft } = await engine.composeDocument(sampleContent);

      const { container } = render(
        <A4PageContainer
          page={draft.pages[0]}
          totalPages={draft.pages.length}
          topic={draft.topic}
          area={draft.area}
          specialty={draft.specialty}
          subtopics={draft.subtopics}
          scale={1.0}
        />
      );

      expect(container.querySelector(".w-\\[210mm\\]")).toBeInTheDocument();
      expect(screen.getByText(/DIRETRIZ DE HIPERTENSÃO ARTERIAL SISTÊMICA/i)).toBeInTheDocument();
    });

    it("should render ScreenPageContainer in desktop and mobile responsive viewports", async () => {
      const engine = StaziaEditorialCompositionEngine.getInstance();
      const { draft } = await engine.composeDocument(sampleContent);

      const { rerender } = render(
        <ScreenPageContainer
          page={draft.pages[0]}
          totalPages={draft.pages.length}
          topic={draft.topic}
          area={draft.area}
          specialty={draft.specialty}
          subtopics={draft.subtopics}
          viewport="DESKTOP"
        />
      );
      expect(screen.getByText(/DIRETRIZ DE HIPERTENSÃO ARTERIAL SISTÊMICA/i)).toBeInTheDocument();

      rerender(
        <ScreenPageContainer
          page={draft.pages[0]}
          totalPages={draft.pages.length}
          topic={draft.topic}
          area={draft.area}
          specialty={draft.specialty}
          subtopics={draft.subtopics}
          viewport="MOBILE"
        />
      );
      expect(screen.getByText(/DIRETRIZ DE HIPERTENSÃO ARTERIAL SISTÊMICA/i)).toBeInTheDocument();
    });
  });
});
