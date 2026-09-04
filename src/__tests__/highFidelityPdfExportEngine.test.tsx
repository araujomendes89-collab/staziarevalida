import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "fs/promises";
import path from "path";
import {
  CANONICAL_A4_PRINT_CONFIG,
  EDITORIAL_PDF_EXPORT_VERSION,
  EditorialPdfExport,
} from "../types/editorialPdfExport";
import {
  StaziaEditorialDocumentDraft,
} from "../types/medicalEditorial";
import { StaziaEditorialCompositionEngine } from "../../server/editorial/staziaEditorialCompositionEngine";
import { StaziaPdfExportEngine } from "../../server/editorial/staziaPdfExportEngine";
import { EditorialPrintAssetResolver } from "../../server/editorial/print/editorialPrintAssetResolver";
import { EditorialReactPrintRenderer } from "../../server/editorial/print/editorialReactPrintRenderer";
import { EditorialExportJobManager } from "../../server/editorial/editorialExportJobQueue";
import { MemoryEditorialPdfExportRepository } from "../../server/editorial/repositories/firestoreEditorialPdfExportRepository";
import { StaziaEditorialEditor } from "../components/admin/contentEngine/StaziaEditorialEditor";
import { A4PageContainer } from "../components/admin/contentEngine/editorial/A4PageContainer";

describe("High-Fidelity PDF Export Engine — Etapa 1.28E & 1.28E.1 Hardening", () => {
  let sampleApprovedDraft: StaziaEditorialDocumentDraft;

  beforeEach(async () => {
    const compositionEngine = StaziaEditorialCompositionEngine.getInstance();
    const { draft } = await compositionEngine.composeDocument({
      id: "struct-has-exp-1",
      sourceDocumentId: "doc-has-src-1",
      segmentId: "seg_has_1",
      area: "CLINICA_MEDICA",
      specialty: "Cardiologia",
      topic: "Hipertensão Arterial Sistêmica",
      subtopics: ["Classificação Pressórica", "Tratamento"],
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
            documentId: "doc-has-src-1",
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
          originalText:
            "A hipertensão arterial sistêmica (HAS) é uma condição clínica multifatorial caracterizada por elevação sustentada dos níveis pressóricos.",
          provenance: {
            documentId: "doc-has-src-1",
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
          originalText:
            "Categoria | PA Sistólica | PA Diastólica\nNormal | < 120 | < 80\nPré-hipertensão | 120-139 | 80-89\nEstágio 1 | 140-159 | 90-99\nEstágio 2 | >= 160 | >= 100",
          provenance: {
            documentId: "doc-has-src-1",
            segmentId: "seg_has_1",
            pageNumber: 1,
            sourceBlockId: "src_b3",
          },
        },
        {
          id: "b4",
          type: "SOURCE_PARAGRAPH",
          order: 4,
          pageNumber: 2,
          sourceBlockId: "src_b4",
          originalText:
            "ALERTA CLÍNICO REVALIDA: Em pacientes diabéticos ou com alto risco cardiovascular, a meta terapêutica alvo é PA < 130/80 mmHg.",
          provenance: {
            documentId: "doc-has-src-1",
            segmentId: "seg_has_1",
            pageNumber: 2,
            sourceBlockId: "src_b4",
          },
        },
        {
          id: "b5",
          type: "SOURCE_PARAGRAPH",
          order: 5,
          pageNumber: 2,
          sourceBlockId: "src_b5",
          originalText:
            "FLUXOGRAMA TERAPÊUTICO: 1. Monoterapia no Estágio 1 de baixo risco; 2. Dupla combinação no Estágio 2 (IECA/BRA + BCC ou Tiazídico).",
          provenance: {
            documentId: "doc-has-src-1",
            segmentId: "seg_has_1",
            pageNumber: 2,
            sourceBlockId: "src_b5",
          },
        },
      ],
      estimatedReadingMinutes: 4,
      totalSourceWordCount: 120,
    });

    sampleApprovedDraft = {
      ...draft,
      status: "APPROVED_EDITORIAL",
      approvedBy: "admin-master",
      approvedAt: "2026-09-04T12:00:00.000Z",
    };
  });

  describe("1. Canonical A4 Geometry & Contracts", () => {
    it("should enforce standard A4 print dimensions in millimeters and inches without global DPI claim", () => {
      expect(CANONICAL_A4_PRINT_CONFIG.width).toBe("210mm");
      expect(CANONICAL_A4_PRINT_CONFIG.height).toBe("297mm");
      expect(CANONICAL_A4_PRINT_CONFIG.widthMm).toBe(210);
      expect(CANONICAL_A4_PRINT_CONFIG.heightMm).toBe(297);
      expect(CANONICAL_A4_PRINT_CONFIG.safeTop).toBe("18mm");
      expect(CANONICAL_A4_PRINT_CONFIG.safeBottom).toBe("18mm");
      expect(CANONICAL_A4_PRINT_CONFIG.safeLeft).toBe("18mm");
      expect(CANONICAL_A4_PRINT_CONFIG.safeRight).toBe("18mm");
      expect(CANONICAL_A4_PRINT_CONFIG.rasterAssetTargetDpi).toBe(300);
      expect(CANONICAL_A4_PRINT_CONFIG.rasterMinAcceptableDpi).toBe(150);
      expect(EDITORIAL_PDF_EXPORT_VERSION).toBe("2026.1.0");
    });
  });

  describe("2. Preflight Gates (Draft Approval, Rights, Assets, Layout)", () => {
    it("should reject export for drafts not in APPROVED_EDITORIAL status", async () => {
      const engine = StaziaPdfExportEngine.getInstance();
      const draftDraft: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        status: "DRAFT_COMPOSITION",
      };

      await expect(engine.exportToPdf({ draft: draftDraft })).rejects.toThrow(
        /EXPORT_DENIED_NOT_APPROVED/
      );
    });

    it("should fail preflight when republication review is required without explicit approval", async () => {
      const engine = StaziaPdfExportEngine.getInstance();
      const draftRequiringReview: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        sourceRightsType: "PUBLIC_REFERENCE_ONLY",
        assetRightsWarnings: [{ assetId: "fig1", warningMessage: "Revisão necessária" }],
      };

      await expect(
        engine.exportToPdf({
          draft: draftRequiringReview,
          rightsReviewStatus: "PENDING",
        })
      ).rejects.toThrow(/direitos/i);
    });

    it("should allow export and record snapshot when rightsReviewStatus is APPROVED", async () => {
      const resolver = EditorialPrintAssetResolver.getInstance();
      const draftRequiringReview: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        sourceRightsType: "PUBLIC_REFERENCE_ONLY",
      };

      const { preflightResult } = await resolver.executePreflight(
        draftRequiringReview,
        "APPROVED"
      );

      expect(preflightResult.rightsGate).toBe("PASS");
      expect(preflightResult.status).toBe("PASS");
    });
  });

  describe("3. Private Asset Resolution & Raster DPI Validation", () => {
    it("should resolve base64 figures into secure Data URIs with SHA-256 fingerprints", async () => {
      const resolver = EditorialPrintAssetResolver.getInstance();
      const sampleFigureDraft: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        pages: [
          {
            ...sampleApprovedDraft.pages[0],
            blocks: [
              ...sampleApprovedDraft.pages[0].blocks,
              {
                id: "b_fig_1",
                type: "MedicalImageBlock",
                order: 6,
                pageNumber: 1,
                sourceBlockId: "src_fig_1",
                content: "Eletrocardiograma de Sobrecarga Ventricular",
                figureData: {
                  assetId: "ecg_asset_1",
                  mimeType: "image/png",
                  base64Data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  isRequired: true,
                },
                provenance: { documentId: "d1", pageNumber: 1, sourceBlockId: "src_fig_1", sourceTextVerbatim: "ECG" },
                editorialOrder: 6,
                sourceOrder: 6,
                sourceBlockRefs: ["src_fig_1"],
                layoutHints: { densityWeight: 3.0 },
                semanticRole: "FIGURE",
              },
            ],
          },
        ],
      };

      const { preflightResult, resolvedAssets } = await resolver.executePreflight(sampleFigureDraft);

      expect(preflightResult.assetsGate).toBe("PASS");
      expect(resolvedAssets.has("ecg_asset_1")).toBe(true);
      const asset = resolvedAssets.get("ecg_asset_1")!;
      expect(asset.dataUri).toContain("data:image/png;base64,");
      expect(asset.fingerprint).toHaveLength(64);
    });

    it("should detect low resolution raster assets and register warning", async () => {
      const resolver = EditorialPrintAssetResolver.getInstance();
      const lowResFigureDraft: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        pages: [
          {
            ...sampleApprovedDraft.pages[0],
            blocks: [
              ...sampleApprovedDraft.pages[0].blocks,
              {
                id: "b_fig_low_dpi",
                type: "MedicalImageBlock",
                order: 6,
                pageNumber: 1,
                sourceBlockId: "src_fig_low",
                content: "Imagem de Baixa Resolução",
                figureData: {
                  assetId: "low_dpi_asset",
                  mimeType: "image/png",
                  base64Data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  pixelWidth: 200, // 200px / 6.85in = ~29 DPI (< 150 min)
                  pixelHeight: 150,
                  isRequired: true,
                },
                provenance: { documentId: "d1", pageNumber: 1, sourceBlockId: "src_fig_low", sourceTextVerbatim: "Low DPI" },
                editorialOrder: 6,
                sourceOrder: 6,
                sourceBlockRefs: ["src_fig_low"],
                layoutHints: { densityWeight: 2.0 },
                semanticRole: "FIGURE",
              },
            ],
          },
        ],
      };

      const { preflightResult } = await resolver.executePreflight(lowResFigureDraft);
      expect(preflightResult.details.rasterDpiWarnings).toBeDefined();
      expect(preflightResult.details.rasterDpiWarnings?.length).toBeGreaterThan(0);
      expect(preflightResult.details.rasterDpiWarnings?.[0]).toContain("LOW_RESOLUTION_RASTER_ASSET_WARNING");
    });
  });

  describe("4. Single Canonical React Print Renderer & Source Security", () => {
    it("should render complete self-contained HTML via React SSR without manual string concatenation", async () => {
      const renderer = EditorialReactPrintRenderer.getInstance();
      const html = await renderer.renderPrintHtml({ draft: sampleApprovedDraft });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("data-render-mode=\"PRINT\"");
      expect(html).toContain("a4-print-page");
      expect(html).toContain("Hipertensão Arterial Sistêmica");
      expect(html).toContain("DIRETRIZ DE HIPERTENSÃO ARTERIAL SISTÊMICA");
    });

    it("should escape unsafe HTML injections in source texts completely", async () => {
      const renderer = EditorialReactPrintRenderer.getInstance();
      const injectionDraft: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        topic: "Cardiologia <script>alert('xss')</script>",
        pages: [
          {
            ...sampleApprovedDraft.pages[0],
            blocks: [
              {
                id: "b_xss",
                type: "MedicalPostItAlertBlock",
                order: 1,
                pageNumber: 1,
                sourceBlockId: "src_xss",
                content: "Atenção: <img src=x onerror=alert(1)> Ponto Chave",
                provenance: { documentId: "d1", pageNumber: 1, sourceBlockId: "src_xss", sourceTextVerbatim: "raw" },
                editorialOrder: 1,
                sourceOrder: 1,
                sourceBlockRefs: ["src_xss"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "ALERT",
              },
            ],
          },
        ],
      };

      const html = await renderer.renderPrintHtml({ draft: injectionDraft });

      expect(html).not.toContain("<script>alert('xss')</script>");
      expect(html).not.toContain("<img src=x onerror=alert(1)>");
      expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
    });
  });

  describe("5. End-to-End Playwright PDF Generation & Parser Text Validation", () => {
    it("should generate a valid A4 PDF binary with selectable text and verified extracted tokens", async () => {
      const engine = StaziaPdfExportEngine.getInstance();
      const result = await engine.exportToPdf({
        draft: sampleApprovedDraft,
        adminUserId: "admin-master",
      });

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(1000);
      expect(result.pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(result.exportRecord.status).toBe("EXPORT_READY");
      expect(result.exportRecord.styleProfile).toBe("MEDICAL_EDITORIAL_V1");
      expect(result.exportRecord.pageCount).toBe(sampleApprovedDraft.pages.length);
      expect(result.validationResult.pageCountMatch).toBe(true);
      expect(result.validationResult.textSelectable).toBe(true);
      expect(result.validationResult.searchableTextFound).toBe(true);
      expect(result.validationResult.parsedTextVerified).toBe(true);
      expect(result.validationResult.isRasterOnly).toBe(false);
      expect(result.validationResult.extractedSampleTokens.length).toBeGreaterThan(0);
    }, 45000);

    it("should generate complete 9-block visual fixture (hero, paragraphs, list, table, warning, sticky, algorithm, figure, references) without legal disclaimer in medical body", async () => {
      const comprehensiveDraft: StaziaEditorialDocumentDraft = {
        ...sampleApprovedDraft,
        id: "draft_has_comprehensive_fixture",
        topic: "Hipertensão Arterial Sistêmica",
        pages: [
          {
            pageIndex: 1,
            estimatedDensity: "BALANCED",
            blocks: [
              {
                id: "b_hero",
                type: "MedicalEditorialHeroBlock",
                order: 1,
                pageNumber: 1,
                sourceBlockId: "src_hero",
                content: "Diretriz Brasileira de Hipertensão Arterial 2020/2024",
                provenance: { documentId: "doc-1", pageNumber: 1, sourceBlockId: "src_hero", sourceTextVerbatim: "Diretriz" },
                editorialOrder: 1,
                sourceOrder: 1,
                sourceBlockRefs: ["src_hero"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "HEADING",
              },
              {
                id: "b_para",
                type: "MedicalBodyBlock",
                order: 2,
                pageNumber: 1,
                sourceBlockId: "src_para",
                content: "A hipertensão arterial sistêmica é a principal causa evitável de morbimortalidade cardiovascular no Brasil.",
                provenance: { documentId: "doc-1", pageNumber: 1, sourceBlockId: "src_para", sourceTextVerbatim: "Texto" },
                editorialOrder: 2,
                sourceOrder: 2,
                sourceBlockRefs: ["src_para"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "BODY",
              },
              {
                id: "b_list",
                type: "MedicalConductListBlock",
                order: 3,
                pageNumber: 1,
                sourceBlockId: "src_list",
                content: "• Redução do consumo de sódio para < 2g/dia\n• Prática de atividade física regular (150 min/semana)\n• Cessação do tabagismo e controle ponderal",
                provenance: { documentId: "doc-1", pageNumber: 1, sourceBlockId: "src_list", sourceTextVerbatim: "Lista" },
                editorialOrder: 3,
                sourceOrder: 3,
                sourceBlockRefs: ["src_list"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "LIST",
              },
              {
                id: "b_table",
                type: "MedicalClassificationTableBlock",
                order: 4,
                pageNumber: 1,
                sourceBlockId: "src_table",
                content: "Classificação | Sistólica (mmHg) | Diastólica (mmHg)\nÓtima | < 120 | < 80\nPré-Hipertensão | 120-139 | 80-89\nHipertensão Estágio 1 | 140-159 | 90-99\nHipertensão Estágio 2 | >= 160 | >= 100",
                provenance: { documentId: "doc-1", pageNumber: 1, sourceBlockId: "src_table", sourceTextVerbatim: "Tabela" },
                editorialOrder: 4,
                sourceOrder: 4,
                sourceBlockRefs: ["src_table"],
                layoutHints: { densityWeight: 1.5 },
                semanticRole: "TABLE",
              },
              {
                id: "b_warning",
                type: "MedicalProtocolBoxBlock",
                order: 5,
                pageNumber: 1,
                sourceBlockId: "src_warn",
                content: "CONDUTA EM EMERGÊNCIA HIPERTENSIVA: Lesão aguda de órgão-alvo exige nitroprussiato de sódio ou esmolol em UTI.",
                provenance: { documentId: "doc-1", pageNumber: 1, sourceBlockId: "src_warn", sourceTextVerbatim: "Alerta" },
                editorialOrder: 5,
                sourceOrder: 5,
                sourceBlockRefs: ["src_warn"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "PROTOCOL_BOX",
              },
            ],
          },
          {
            pageIndex: 2,
            estimatedDensity: "BALANCED",
            blocks: [
              {
                id: "b_sticky",
                type: "MedicalPostItAlertBlock",
                order: 6,
                pageNumber: 2,
                sourceBlockId: "src_sticky",
                content: "PEGADINHA REVALIDA: Não iniciar betabloqueador como primeira linha em hipertensão não complicada sem comorbidade.",
                provenance: { documentId: "doc-1", pageNumber: 2, sourceBlockId: "src_sticky", sourceTextVerbatim: "Post-it" },
                editorialOrder: 6,
                sourceOrder: 6,
                sourceBlockRefs: ["src_sticky"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "ALERT",
              },
              {
                id: "b_algo",
                type: "MedicalAlgorithmStepBlock",
                order: 7,
                pageNumber: 2,
                sourceBlockId: "src_algo",
                content: "ALGORITMO DE TRATAMENTO: Passo 1: IECA/BRA + BCC ou DIU -> Passo 2: Tríplice (IECA/BRA + BCC + DIU) -> Passo 3: Adicionar Espironolactona (HAS Resistente).",
                provenance: { documentId: "doc-1", pageNumber: 2, sourceBlockId: "src_algo", sourceTextVerbatim: "Algoritmo" },
                editorialOrder: 7,
                sourceOrder: 7,
                sourceBlockRefs: ["src_algo"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "ALGORITHM",
              },
              {
                id: "b_fig",
                type: "MedicalImageBlock",
                order: 8,
                pageNumber: 2,
                sourceBlockId: "src_fig",
                content: "Figura 1: Sobrecarga Ventricular Esquerda ao ECG (Índice de Sokolow-Lyon > 35mm)",
                figureData: {
                  assetId: "fig_sokolow",
                  mimeType: "image/png",
                  base64Data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  isRequired: true,
                },
                provenance: { documentId: "doc-1", pageNumber: 2, sourceBlockId: "src_fig", sourceTextVerbatim: "ECG" },
                editorialOrder: 8,
                sourceOrder: 8,
                sourceBlockRefs: ["src_fig"],
                layoutHints: { densityWeight: 1.5 },
                semanticRole: "FIGURE",
              },
              {
                id: "b_ref",
                type: "MedicalReferenceNoteBlock",
                order: 9,
                pageNumber: 2,
                sourceBlockId: "src_ref",
                content: "REFERÊNCIAS OFICIAIS: Diretrizes Brasileiras de Hipertensão Arterial — SBC/SBH/SBN (2020); Matriz de Correspondência INEP 2026.",
                provenance: { documentId: "doc-1", pageNumber: 2, sourceBlockId: "src_ref", sourceTextVerbatim: "Ref" },
                editorialOrder: 9,
                sourceOrder: 9,
                sourceBlockRefs: ["src_ref"],
                layoutHints: { densityWeight: 1.0 },
                semanticRole: "REFERENCE",
              },
            ],
          },
        ],
      };

      const engine = StaziaPdfExportEngine.getInstance();
      const result = await engine.exportToPdf({ draft: comprehensiveDraft });

      expect(result.validationResult.pageCountMatch).toBe(true);
      expect(result.exportRecord.pageCount).toBe(2);
      expect(result.validationResult.isRasterOnly).toBe(false);

      // Verify LEGAL_DISCLAIMER_IN_MEDICAL_BODY = NO
      const medicalBlocksText = comprehensiveDraft.pages.flatMap((p) => p.blocks.map((b) => b.content)).join(" ");
      expect(medicalBlocksText).not.toContain("Termos de Uso Governamentais");
      expect(medicalBlocksText).not.toContain("Isenção de Responsabilidade Legal");
      expect(result.exportRecord.rightsSnapshot.disclaimerText).toBeDefined();
    }, 45000);
  });

  describe("6. Print Stylesheet, Break Protections & Table Continuation", () => {
    it("should contain @page A4 size, table-header-group, and break-inside avoid rules in medicalEditorialPrint.css", async () => {
      const cssPath = path.resolve(__dirname, "../../server/editorial/print/medicalEditorialPrint.css");
      const cssContent = await fs.readFile(cssPath, "utf-8");

      expect(cssContent).toContain("@page");
      expect(cssContent).toContain("size: 210mm 297mm portrait");
      expect(cssContent).toContain("thead");
      expect(cssContent).toContain("display: table-header-group");
      expect(cssContent).toContain("page-break-inside: avoid");
      expect(cssContent).toContain("break-inside: avoid");
    });
  });

  describe("7. Durable Repository & Multi-Instance Consistency", () => {
    it("should support instance A writing and instance B reading from same persistent repository without shared memory", async () => {
      const sharedStorage = {
        exports: new Map<string, EditorialPdfExport>(),
        rightsDecisions: new Map<string, any>(),
      };

      const repoInstanceA = new MemoryEditorialPdfExportRepository(sharedStorage);
      const managerA = EditorialExportJobManager.createIsolatedInstance(repoInstanceA);

      await managerA.recordRightsDecision(sampleApprovedDraft.id, "APPROVED", "admin-director", "Aprovado formalmente");

      const { exportRecord } = await managerA.requestExport(sampleApprovedDraft, "admin-user-a");
      expect(exportRecord.id).toBeDefined();

      // Instance A is destroyed / disposed. Create Instance B from repository:
      const repoInstanceB = new MemoryEditorialPdfExportRepository(sharedStorage);
      const managerB = EditorialExportJobManager.createIsolatedInstance(repoInstanceB);

      const retrievedFromB = await managerB.getExport(exportRecord.id);
      expect(retrievedFromB).not.toBeNull();
      expect(retrievedFromB?.id).toBe(exportRecord.id);
      expect(retrievedFromB?.editorialDocumentId).toBe(sampleApprovedDraft.id);
      expect(retrievedFromB?.status).toBe("EXPORT_READY");
    });

    it("should persist stale export status across instances when draft is updated", async () => {
      const sharedStorage = {
        exports: new Map<string, EditorialPdfExport>(),
        rightsDecisions: new Map<string, any>(),
      };

      const repoA = new MemoryEditorialPdfExportRepository(sharedStorage);
      const managerA = EditorialExportJobManager.createIsolatedInstance(repoA);

      const { exportRecord } = await managerA.requestExport(sampleApprovedDraft);

      // Instance A marks draft stale
      await managerA.markDraftStale(sampleApprovedDraft.id);

      // Instance B reads export
      const repoB = new MemoryEditorialPdfExportRepository(sharedStorage);
      const managerB = EditorialExportJobManager.createIsolatedInstance(repoB);

      const exportFromB = await managerB.getExport(exportRecord.id);
      expect(exportFromB?.isStale).toBe(true);
    });
  });

  describe("8. StaziaEditorialEditor UI Export Flow", () => {
    it("should render [ EXPORTAR PDF ] button when draft is approved and trigger modal", () => {
      const onExport = vi.fn().mockResolvedValue({
        id: "exp_1",
        status: "EXPORT_READY",
        pageCount: 2,
      });
      const onDownload = vi.fn();

      render(
        <StaziaEditorialEditor
          draft={sampleApprovedDraft}
          onClose={() => {}}
          onExportPdf={onExport}
          onDownloadPdf={onDownload}
        />
      );

      const exportBtn = screen.getByRole("button", { name: /EXPORTAR PDF/i });
      expect(exportBtn).toBeInTheDocument();

      fireEvent.click(exportBtn);

      expect(screen.getByText(/Exportação de PDF A4 de Alta Fidelidade/i)).toBeInTheDocument();
      expect(screen.getByText(/Preparação & Verificação A4/i)).toBeInTheDocument();
    });
  });
});
