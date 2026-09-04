import React, { useState, useRef } from "react";
import {
  FileText,
  UploadCloud,
  Layers,
  Sparkles,
  CheckCircle2,
  BookOpen,
  Shield,
  FileCheck,
  AlertTriangle,
  Info,
  ChevronRight,
  Workflow,
  Eye,
  Loader2,
  FileSearch,
  Check,
  Database,
  Hash,
  FolderTree,
} from "lucide-react";
import {
  SourceDocumentType as LegacySourceDocumentType,
  ContentReferenceRightsType as LegacyRightsType,
  CONTENT_BLOCK_COMPONENT_REGISTRY,
} from "../../types/adminContentEngine";
import {
  SourceDocument,
  SourceDocumentType,
  ContentReferenceRightsType,
  ExtractedPdfDocument,
} from "../../types/pdfIngestion";
import {
  StructuredSourceContent,
  STAZIAMED_CANONICAL_TOPICS,
} from "../../types/medicalTaxonomy";
import {
  StaziaEditorialDocumentDraft,
  EditorialComponentType,
} from "../../types/medicalEditorial";
import { StaziaEditorialCompositionEngine } from "../../services/staziaEditorialCompositionService";
import { validatePdfBytes } from "../../services/pdfValidationService";
import { StaziaNativePdfExtractor } from "../../services/pdfExtractionService";
import { SourceDocumentPreview } from "./contentEngine/SourceDocumentPreview";
import { StructuredSourceViewer } from "./contentEngine/StructuredSourceViewer";
import { StaziaEditorialEditor } from "./contentEngine/StaziaEditorialEditor";
import { PDF_CONTENT_ENGINE_LIMITS } from "../../config/pdfContentEngineLimits";
import { EditorialExportClientService } from "../../services/editorialExportClientService";

export type ContentEngineSubTab =
  | "overview"
  | "import"
  | "sources"
  | "structured"
  | "generated"
  | "review"
  | "publications";

type IngestionStep =
  | "IDLE"
  | "VALIDATING"
  | "FINGERPRINTING"
  | "STORING"
  | "EXTRACTING"
  | "COMPLETED"
  | "FAILED";

const INITIAL_STRUCTURED_CONTENTS: StructuredSourceContent[] = [
  {
    id: "struct-sample-has-1",
    sourceDocumentId: "doc-sample-1",
    segmentId: "seg_has_1",
    area: "CLINICA_MEDICA",
    specialty: "Cardiologia",
    topic: "Hipertensão Arterial Sistêmica",
    subtopics: ["Definição", "Classificação Pressórica", "Estratificação de Risco"],
    suggestedCanonicalTopicId: "top_has",
    canonicalTopicId: "top_has",
    sourcePages: [1, 2],
    sourceBlockRefs: ["doc-sample-1_p1_b1", "doc-sample-1_p1_b2", "doc-sample-1_p2_b1"],
    blocks: [
      {
        id: "doc-sample-1_p1_b1",
        type: "SOURCE_HEADING",
        order: 1,
        pageNumber: 1,
        sourceBlockId: "doc-sample-1_p1_b1",
        originalText: "DIRETRIZ BRASILEIRA DE HIPERTENSÃO ARTERIAL\n\n1. INTRODUÇÃO E CLASSIFICAÇÃO",
        provenance: {
          documentId: "doc-sample-1",
          segmentId: "seg_has_1",
          pageNumber: 1,
          sourceBlockId: "doc-sample-1_p1_b1",
        },
      },
      {
        id: "doc-sample-1_p1_b2",
        type: "SOURCE_TABLE",
        order: 2,
        pageNumber: 1,
        sourceBlockId: "doc-sample-1_p1_b2",
        originalText: "Tabela de Classificação Pressórica:\n- Normal: PA <= 120 e <= 80 mmHg\n- Hipertensão Estágio 1: PA 140-159 / 90-99 mmHg\n- Hipertensão Estágio 2: PA >= 160 / 100 mmHg",
        tableData: {
          tableId: "tab_1",
          documentId: "doc-sample-1",
          pageNumber: 1,
          columns: 2,
          rows: 4,
          cells: [
            ["Classificação", "Pressão Arterial (mmHg)"],
            ["Normal", "<= 120 e <= 80"],
            ["Hipertensão Estágio 1", "140-159 ou 90-99"],
            ["Hipertensão Estágio 2", ">= 160 ou >= 100"],
          ],
          structureConfidence: 0.95,
        },
        provenance: {
          documentId: "doc-sample-1",
          segmentId: "seg_has_1",
          pageNumber: 1,
          sourceBlockId: "doc-sample-1_p1_b2",
        },
      },
      {
        id: "doc-sample-1_p2_b1",
        type: "SOURCE_WARNING",
        order: 3,
        pageNumber: 2,
        sourceBlockId: "doc-sample-1_p2_b1",
        originalText: "2. ESTRATIFICAÇÃO DE RISCO CARDIOVASCULAR ADICIONAL\n\nPacientes com lesão de órgão alvo ou doença renal crônica são automaticamente classificados como ALTO RISCO CARDIOVASCULAR.",
        provenance: {
          documentId: "doc-sample-1",
          segmentId: "seg_has_1",
          pageNumber: 2,
          sourceBlockId: "doc-sample-1_p2_b1",
        },
      },
    ],
    classificationConfidence: 0.98,
    status: "APPROVED_STRUCTURE",
    taxonomyVersion: "2026.1.0",
    totalSourceBlocks: 3,
    assignedSourceBlocks: 3,
    unassignedSourceBlocks: 0,
    createdAt: "2026-09-01T10:05:00.000Z",
    updatedAt: "2026-09-01T10:05:00.000Z",
  },
  {
    id: "struct-sample-pcdt-dm2",
    sourceDocumentId: "doc-sample-2",
    segmentId: "seg_dm2_1",
    area: "CLINICA_MEDICA",
    specialty: "Endocrinologia",
    topic: "Diabetes Mellitus Tipo 2",
    subtopics: ["Diagnóstico", "Metas Terapêuticas"],
    suggestedCanonicalTopicId: "top_diabetes",
    canonicalTopicId: undefined, // Requires Admin confirmation
    sourcePages: [1],
    sourceBlockRefs: ["doc-sample-2_p1_b1"],
    blocks: [
      {
        id: "doc-sample-2_p1_b1",
        type: "SOURCE_PARAGRAPH",
        order: 1,
        pageNumber: 1,
        sourceBlockId: "doc-sample-2_p1_b1",
        originalText: "MINISTÉRIO DA SAÚDE — PROTOCOLO CLÍNICO E DIRETRIZES TERAPÊUTICAS\nDIABETES MELLITUS TIPO 2\n\nDiagnóstico laboratorial: Glicemia de jejum >= 126 mg/dL ou HbA1c >= 6.5% confirmados em duas ocasiões.",
        provenance: {
          documentId: "doc-sample-2",
          segmentId: "seg_dm2_1",
          pageNumber: 1,
          sourceBlockId: "doc-sample-2_p1_b1",
        },
      },
    ],
    classificationConfidence: 0.95,
    status: "REVIEW_REQUIRED",
    taxonomyVersion: "2026.1.0",
    totalSourceBlocks: 1,
    assignedSourceBlocks: 1,
    unassignedSourceBlocks: 0,
    createdAt: "2026-09-02T14:02:00.000Z",
    updatedAt: "2026-09-02T14:02:00.000Z",
  },
];

export const AdminContentEngineView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<ContentEngineSubTab>("overview");
  const [importTitle, setImportTitle] = useState("");
  const [importSourceType, setImportSourceType] = useState<SourceDocumentType>("DIRETRIZ");
  const [importRightsType, setImportRightsType] = useState<ContentReferenceRightsType>("PUBLIC_REFERENCE_ONLY");
  const [importYear, setImportYear] = useState<string>("2026");
  const [importInstitution, setImportInstitution] = useState<string>("Ministério da Saúde / SUS");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [ingestionStep, setIngestionStep] = useState<IngestionStep>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [lastIngestedDoc, setLastIngestedDoc] = useState<SourceDocument | null>(null);
  const [previewingDoc, setPreviewingDoc] = useState<SourceDocument | null>(null);

  // Structured Content & Segmentation State
  const [structuredContents, setStructuredContents] = useState<StructuredSourceContent[]>(INITIAL_STRUCTURED_CONTENTS);
  const [selectedSegmentDoc, setSelectedSegmentDoc] = useState<SourceDocument | null>(null);

  // Editorial Composition State
  const [editingEditorialDraft, setEditingEditorialDraft] = useState<StaziaEditorialDocumentDraft | null>(null);

  const handleCreateEditorialDraft = async (content: StructuredSourceContent) => {
    try {
      const compositionEngine = StaziaEditorialCompositionEngine.getInstance();
      const { draft } = await compositionEngine.composeDocument(content);
      setEditingEditorialDraft(draft);
    } catch (err: any) {
      console.error("[Create Editorial Draft Error]:", err);
      setErrorMessage(err?.message || "Erro ao gerar rascunho de composição editorial.");
    }
  };

  const handleApproveEditorialLayout = (draftId: string) => {
    setEditingEditorialDraft((prev) => {
      if (!prev || prev.id !== draftId) return prev;
      return {
        ...prev,
        status: "APPROVED_EDITORIAL",
        plan: {
          ...prev.plan,
          compositionStatus: "APPROVED_EDITORIAL",
        },
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleReorderEditorialBlocks = (pageIndex: number, fromIdx: number, toIdx: number) => {
    setEditingEditorialDraft((prev) => {
      if (!prev) return prev;
      const targetPage = prev.pages.find((p) => p.pageIndex === pageIndex);
      if (!targetPage) return prev;

      const newBlocks = [...targetPage.blocks];
      const [moved] = newBlocks.splice(fromIdx, 1);
      newBlocks.splice(toIdx, 0, moved);
      newBlocks.forEach((b, idx) => {
        b.editorialOrder = idx + 1;
      });

      const updatedPages = prev.pages.map((p) =>
        p.pageIndex === pageIndex
          ? { ...p, blocks: newBlocks, sourceBlockRefs: newBlocks.flatMap((b) => b.sourceBlockRefs) }
          : p
      );

      return {
        ...prev,
        pages: updatedPages,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleChangeEditorialComponentType = (blockId: string, newType: EditorialComponentType) => {
    setEditingEditorialDraft((prev) => {
      if (!prev) return prev;
      const updatedPages = prev.pages.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, type: newType } : b)),
      }));

      return {
        ...prev,
        pages: updatedPages,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleInsertEditorialPageBreak = (blockId: string) => {
    setEditingEditorialDraft((prev) => {
      if (!prev) return prev;
      let targetPageIndex = -1;
      let targetBlockIndex = -1;

      for (let pIdx = 0; pIdx < prev.pages.length; pIdx++) {
        const bIdx = prev.pages[pIdx].blocks.findIndex((b) => b.id === blockId);
        if (bIdx !== -1) {
          targetPageIndex = pIdx;
          targetBlockIndex = bIdx;
          break;
        }
      }

      if (targetPageIndex === -1 || targetBlockIndex === -1) return prev;

      const curPage = prev.pages[targetPageIndex];
      const keptBlocks = curPage.blocks.slice(0, targetBlockIndex);
      const remainingBlocks = curPage.blocks.slice(targetBlockIndex);

      const page1 = {
        ...curPage,
        blocks: keptBlocks,
        sourceBlockRefs: keptBlocks.flatMap((b) => b.sourceBlockRefs),
      };

      const newPage = {
        pageIndex: targetPageIndex + 2,
        pageRole: "CORE_CONTENT" as const,
        blocks: remainingBlocks,
        sourceBlockRefs: remainingBlocks.flatMap((b) => b.sourceBlockRefs),
        estimatedDensity: "BALANCED" as const,
        densityScore: 5.0,
        pageBreakReason: "Quebra manual inserida pelo Administrador",
      };

      const newPages = [
        ...prev.pages.slice(0, targetPageIndex),
        page1,
        newPage,
        ...prev.pages.slice(targetPageIndex + 1),
      ].map((p, idx) => ({ ...p, pageIndex: idx + 1 }));

      return {
        ...prev,
        pages: newPages,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // PDF Exports State & Handlers
  const [exportsHistory, setExportsHistory] = useState<EditorialPdfExport[]>([]);

  const handleExportPdf = async (draft: StaziaEditorialDocumentDraft): Promise<EditorialPdfExport | null> => {
    try {
      const client = EditorialExportClientService.getInstance();
      const exportRecord = await client.requestExport(draft);
      setExportsHistory((prev) => [exportRecord, ...prev.filter((e) => e.id !== exportRecord.id)]);
      return exportRecord;
    } catch (err: any) {
      console.error("[Export PDF Handler Error]:", err);
      throw err;
    }
  };

  const handleDownloadPdf = async (exportId: string) => {
    try {
      const client = EditorialExportClientService.getInstance();
      const currentDraft = activeEditorialDraft;
      const topicName = currentDraft?.topic || "document";
      await client.downloadPdf(exportId, topicName);
    } catch (err: any) {
      console.error("[Download PDF Handler Error]:", err);
      setErrorMessage(err?.message || "Erro ao baixar arquivo PDF.");
    }
  };

  const handleRightsReview = async (draftId: string, status: RightsReviewStatus) => {
    try {
      const client = EditorialExportClientService.getInstance();
      await client.recordRightsDecision(draftId, status);
    } catch (err: any) {
      console.error("[Rights Review Error]:", err);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initial registered documents list
  const [registeredDocuments, setRegisteredDocuments] = useState<SourceDocument[]>([
    {
      id: "doc-sample-1",
      title: "Diretriz Brasileira de Hipertensão Arterial 2020/2024",
      fileName: "StaziaMed_Revalida_Hipertensao.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2450000,
      pageCount: 28,
      documentFingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      sourceType: "DIRETRIZ",
      rightsType: "PUBLIC_REFERENCE_ONLY",
      sourceYear: 2024,
      institution: "Sociedade Brasileira de Cardiologia (SBC)",
      contentMode: "TEXT_PDF",
      status: "EXTRACTED",
      storagePath: "content-engine/source-documents/doc-sample-1/source.pdf",
      createdBy: "admin-master",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:05:00.000Z",
      extractedDocument: {
        documentId: "doc-sample-1",
        pageCount: 2,
        contentMode: "TEXT_PDF",
        totalCharacterCount: 1420,
        imageCount: 0,
        tableCount: 1,
        pagesRequiringOcr: 0,
        engineName: "StaziaNativePdfExtractor",
        engineVersion: "1.0.0",
        startedAt: "2026-09-01T10:00:00.000Z",
        finishedAt: "2026-09-01T10:00:01.000Z",
        pages: [
          {
            documentId: "doc-sample-1",
            pageNumber: 1,
            text: "DIRETRIZ BRASILEIRA DE HIPERTENSÃO ARTERIAL\n\n1. INTRODUÇÃO E CLASSIFICAÇÃO\nA hipertensão arterial sistêmica (HAS) é uma condição clínica multifatorial caracterizada por elevação sustentada dos níveis pressóricos.\n\nClassificação Pressórica:\n- Normal: PA sistólica <= 120 e diastólica <= 80 mmHg\n- Pré-hipertensão: PA 121-139 / 81-89 mmHg\n- Hipertensão Estágio 1: PA 140-159 / 90-99 mmHg\n- Hipertensão Estágio 2: PA >= 160 / 100 mmHg",
            textCharacterCount: 450,
            hasNativeText: true,
            images: [],
            tables: [
              {
                tableId: "tab_1",
                documentId: "doc-sample-1",
                pageNumber: 1,
                columns: 2,
                rows: 4,
                cells: [
                  ["Classificação", "Pressão Arterial (mmHg)"],
                  ["Normal", "<= 120 e <= 80"],
                  ["Hipertensão Estágio 1", "140-159 ou 90-99"],
                  ["Hipertensão Estágio 2", ">= 160 ou >= 100"],
                ],
                structureConfidence: 0.95,
              },
            ],
            extractionStatus: "EXTRACTED",
            ocrRequired: false,
          },
          {
            documentId: "doc-sample-1",
            pageNumber: 2,
            text: "2. ESTRATIFICAÇÃO DE RISCO CARDIOVASCULAR ADICIONAL\n\nA estratificação de risco deve considerar fatores de risco clássicos, lesão de órgão-alvo (LOA) e doença cardiovascular ou renal preexistente.\n\nPacientes com lesão de órgão alvo ou doença renal crônica são automaticamente classificados como ALTO RISCO CARDIOVASCULAR.",
            textCharacterCount: 320,
            hasNativeText: true,
            images: [],
            tables: [],
            extractionStatus: "EXTRACTED",
            ocrRequired: false,
          },
        ],
      },
    },
    {
      id: "doc-sample-2",
      title: "PCDT Diabetes Mellitus Tipo 2 — MS",
      fileName: "pcdt_diabetes_tipo2_ms.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3120000,
      pageCount: 42,
      documentFingerprint: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
      sourceType: "PCDT",
      rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
      sourceYear: 2024,
      institution: "Ministério da Saúde / CONITEC",
      contentMode: "MIXED_PDF",
      status: "OCR_REQUIRED",
      storagePath: "content-engine/source-documents/doc-sample-2/source.pdf",
      createdBy: "admin-master",
      createdAt: "2026-09-02T14:00:00.000Z",
      updatedAt: "2026-09-02T14:02:00.000Z",
      extractedDocument: {
        documentId: "doc-sample-2",
        pageCount: 2,
        contentMode: "MIXED_PDF",
        totalCharacterCount: 280,
        imageCount: 1,
        tableCount: 0,
        pagesRequiringOcr: 1,
        engineName: "StaziaNativePdfExtractor",
        engineVersion: "1.0.0",
        startedAt: "2026-09-02T14:00:00.000Z",
        finishedAt: "2026-09-02T14:00:01.000Z",
        pages: [
          {
            documentId: "doc-sample-2",
            pageNumber: 1,
            text: "MINISTÉRIO DA SAÚDE — PROTOCOLO CLÍNICO E DIRETRIZES TERAPÊUTICAS\nDIABETES MELLITUS TIPO 2\n\nDiagnóstico laboratorial: Glicemia de jejum >= 126 mg/dL ou HbA1c >= 6.5% confirmados em duas ocasiões.",
            textCharacterCount: 210,
            hasNativeText: true,
            images: [],
            tables: [],
            extractionStatus: "EXTRACTED",
            ocrRequired: false,
          },
          {
            documentId: "doc-sample-2",
            pageNumber: 2,
            text: "",
            textCharacterCount: 0,
            hasNativeText: false,
            images: [
              {
                assetId: "img_doc-sample-2_p2_1",
                documentId: "doc-sample-2",
                pageNumber: 2,
                index: 1,
                mimeType: "image/jpeg",
              },
            ],
            tables: [],
            extractionStatus: "OCR_REQUIRED",
            ocrRequired: true,
          },
        ],
      },
    },
  ]);

  const subTabs: { id: ContentEngineSubTab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Visão Geral", icon: BookOpen },
    { id: "import", label: "Importar PDF", icon: UploadCloud },
    { id: "sources", label: "Documentos-fonte", icon: FileText },
    { id: "structured", label: "Conteúdo estruturado", icon: Layers },
    { id: "generated", label: "Conteúdo gerado", icon: Sparkles },
    { id: "review", label: "Fila de Revisão", icon: FileCheck },
    { id: "publications", label: "Publicações", icon: CheckCircle2 },
  ];

  const handleConfirmCanonical = (contentId: string, canonicalTopicId: string) => {
    setStructuredContents((prev) =>
      prev.map((item) =>
        item.id === contentId
          ? { ...item, canonicalTopicId, updatedAt: new Date().toISOString() }
          : item
      )
    );
  };

  const handleApproveStructure = (contentId: string) => {
    setStructuredContents((prev) =>
      prev.map((item) =>
        item.id === contentId
          ? { ...item, status: "APPROVED_STRUCTURE", updatedAt: new Date().toISOString() }
          : item
      )
    );
  };

  const handleSplitSegment = (contentId: string, splitAtIndex: number) => {
    setStructuredContents((prev) => {
      const target = prev.find((item) => item.id === contentId);
      if (!target || splitAtIndex <= 0 || splitAtIndex >= target.blocks.length) return prev;

      const part1Blocks = target.blocks.slice(0, splitAtIndex);
      const part2Blocks = target.blocks.slice(splitAtIndex);

      const part1: StructuredSourceContent = {
        ...target,
        id: `${target.id}_part1`,
        blocks: part1Blocks,
        totalSourceBlocks: part1Blocks.length,
        assignedSourceBlocks: part1Blocks.length,
        unassignedSourceBlocks: 0,
        sourcePages: Array.from(new Set(part1Blocks.map((b) => b.pageNumber))),
        updatedAt: new Date().toISOString(),
      };

      const part2: StructuredSourceContent = {
        ...target,
        id: `${target.id}_part2`,
        topic: `${target.topic} (Parte 2)`,
        blocks: part2Blocks,
        totalSourceBlocks: part2Blocks.length,
        assignedSourceBlocks: part2Blocks.length,
        unassignedSourceBlocks: 0,
        sourcePages: Array.from(new Set(part2Blocks.map((b) => b.pageNumber))),
        status: "REVIEW_REQUIRED",
        updatedAt: new Date().toISOString(),
      };

      return prev.flatMap((item) => (item.id === contentId ? [part1, part2] : [item]));
    });
  };

  const handleMergeSegments = (contentIdA: string, contentIdB: string) => {
    setStructuredContents((prev) => {
      const itemA = prev.find((item) => item.id === contentIdA);
      const itemB = prev.find((item) => item.id === contentIdB);
      if (!itemA || !itemB) return prev;

      const mergedBlocks = [...itemA.blocks, ...itemB.blocks].map((b, idx) => ({
        ...b,
        order: idx + 1,
      }));

      const merged: StructuredSourceContent = {
        ...itemA,
        id: `${itemA.id}_merged_${itemB.id}`,
        topic: itemA.topic === itemB.topic ? itemA.topic : `${itemA.topic} / ${itemB.topic}`,
        subtopics: Array.from(new Set([...itemA.subtopics, ...itemB.subtopics])),
        blocks: mergedBlocks,
        totalSourceBlocks: mergedBlocks.length,
        assignedSourceBlocks: mergedBlocks.length,
        unassignedSourceBlocks: 0,
        sourcePages: Array.from(new Set(mergedBlocks.map((b) => b.pageNumber))).sort((a, b) => a - b),
        status: "REVIEW_REQUIRED",
        updatedAt: new Date().toISOString(),
      };

      return prev.filter((item) => item.id !== contentIdA && item.id !== contentIdB).concat(merged);
    });
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setErrorMessage(null);
    setDuplicateWarning(null);
    if (!importTitle) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setImportTitle(cleanName);
    }
  };

  const handleStartIngestion = async () => {
    if (!selectedFile) {
      setErrorMessage("Motor de ingestão em preparação (Etapa 1.28A). Por favor, selecione um arquivo PDF acima para prosseguir.");
      return;
    }

    if (!importTitle.trim()) {
      setErrorMessage("Por favor, preencha o título do documento.");
      return;
    }

    try {
      setErrorMessage(null);
      setDuplicateWarning(null);
      setIngestionStep("VALIDATING");

      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Bytes = new Uint8Array(arrayBuffer);

      // Step 1: Validate PDF Magic Bytes & limits
      const validation = await validatePdfBytes(uint8Bytes);
      if (!validation.valid) {
        setIngestionStep("FAILED");
        setErrorMessage(validation.errorMessage || "O arquivo PDF fornecido é inválido ou corrompido.");
        return;
      }

      // Step 2: Fingerprint & Duplicate Detection
      setIngestionStep("FINGERPRINTING");
      const existingDuplicate = registeredDocuments.find(
        (d) => d.documentFingerprint === validation.fingerprint
      );
      if (existingDuplicate) {
        setDuplicateWarning(
          `Aviso de Duplicata: Este arquivo possui a mesma assinatura digital (SHA-256) do documento já cadastrado "${existingDuplicate.title}" (ID: ${existingDuplicate.id}).`
        );
      }

      // Step 3: Simulate Private Storing
      setIngestionStep("STORING");
      const documentId = `src_doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const storagePath = `${PDF_CONTENT_ENGINE_LIMITS.STORAGE_BASE_PATH}/${documentId}/source.pdf`;

      const initialSourceDoc: SourceDocument = {
        id: documentId,
        title: importTitle.trim(),
        fileName: selectedFile.name,
        mimeType: "application/pdf",
        sizeBytes: selectedFile.size,
        pageCount: validation.estimatedPageCount || 1,
        documentFingerprint: validation.fingerprint,
        sourceType: importSourceType,
        rightsType: importRightsType,
        sourceYear: importYear ? Number(importYear) : undefined,
        institution: importInstitution.trim() || undefined,
        contentMode: "TEXT_PDF",
        status: "EXTRACTING",
        storagePath,
        createdBy: "admin-master",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        duplicateOfDocumentId: existingDuplicate?.id,
      };

      // Step 4: Verbatim Native Source Extraction
      setIngestionStep("EXTRACTING");
      const extractor = new StaziaNativePdfExtractor();
      const extractedDoc = await extractor.extract(initialSourceDoc, uint8Bytes);

      const finalStatus = extractedDoc.pagesRequiringOcr > 0 ? "OCR_REQUIRED" : "EXTRACTED";

      const finalizedDoc: SourceDocument = {
        ...initialSourceDoc,
        pageCount: extractedDoc.pageCount,
        contentMode: extractedDoc.contentMode,
        status: finalStatus,
        updatedAt: new Date().toISOString(),
        extractedDocument: extractedDoc,
      };

      setIngestionStep("COMPLETED");
      setLastIngestedDoc(finalizedDoc);
      setRegisteredDocuments((prev) => [finalizedDoc, ...prev]);
    } catch (err: any) {
      console.error("[Ingestion Execution Error]:", err);
      setIngestionStep("FAILED");
      setErrorMessage(err?.message || "Ocorreu um erro inesperado durante a extração do PDF.");
    }
  };

  const getStatusBadge = (status: SourceDocument["status"]) => {
    switch (status) {
      case "EXTRACTED":
        return (
          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            EXTRACTED
          </span>
        );
      case "OCR_REQUIRED":
        return (
          <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
            OCR REQUIRED
          </span>
        );
      case "EXTRACTION_FAILED":
        return (
          <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
            FAILED
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-bold text-slate-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
            {status}
          </span>
        );
    }
  };

  const getContentModeBadge = (mode: SourceDocument["contentMode"]) => {
    switch (mode) {
      case "TEXT_PDF":
        return (
          <span className="text-[10px] font-semibold text-teal-300 bg-teal-500/15 px-2 py-0.5 rounded-md border border-teal-500/30">
            TEXT_PDF
          </span>
        );
      case "SCANNED_PDF":
        return (
          <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30">
            SCANNED_PDF
          </span>
        );
      case "MIXED_PDF":
        return (
          <span className="text-[10px] font-semibold text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-md border border-sky-500/30">
            MIXED_PDF
          </span>
        );
    }
  };

  return (
    <div id="admin-content-engine-view" className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" />
              StaziaMed Content Engine
            </span>
            <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              Etapa 1.28A — Source Extraction
            </span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Motor de Ingestão & Curadoria Médica Estruturada
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
            Pipeline de extração, validação de integridade, cálculo de fingerprint SHA-256 e visualização de documentos-fonte.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab("import")}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Importar Novo PDF</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800/80">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-teal-300" : "text-slate-500"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. VISÃO GERAL */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-black/30 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">1. Ingestão & Verbatim Source</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Upload de PDFs e diretrizes com validação %PDF-, cálculo de SHA-256 e extração fiel página a página.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab("import")}
                className="text-xs text-teal-300 hover:text-teal-200 font-semibold flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Importar fonte</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-black/30 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">2. Estruturação AST</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Mapeamento em blocos semânticos (Alertas Clínicos, Tabelas Médicas, Algoritmos e Diretrizes).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab("structured")}
                className="text-xs text-sky-300 hover:text-sky-200 font-semibold flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Explorar AST</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-black/30 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">3. Curadoria & Publicação</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Governança médica mandatória com auditoria de fontes antes da liberação ao ecossistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab("review")}
                className="text-xs text-emerald-300 hover:text-emerald-200 font-semibold flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Ver fila</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Component Registry Card */}
          <div className="p-5 rounded-2xl bg-[#0B1728]/80 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Workflow className="w-4 h-4 text-teal-400" />
              <span>Registro de Componentes Semânticos Mapeados (JSON → StaziaComponent)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
              {Object.entries(CONTENT_BLOCK_COMPONENT_REGISTRY).map(([blockKey, componentName]) => (
                <div key={blockKey} className="p-2.5 rounded-xl bg-black/40 border border-slate-800/80">
                  <span className="text-[10px] text-teal-400 font-mono block">{blockKey}</span>
                  <span className="text-xs font-semibold text-white/90 block mt-0.5 truncate">{componentName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. IMPORTAR PDF */}
      {activeSubTab === "import" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-5">
          <div>
            <h4 className="text-sm font-bold text-white">Importar Documento Médico Fonte</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Envie um PDF para validação de integridade, armazenamento privado e extração de conteúdo-fonte.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Título do Documento</label>
              <input
                type="text"
                placeholder="Ex: Diretriz Brasileira de Hipertensão Arterial 2024"
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Tipo de Fonte</label>
              <select
                value={importSourceType}
                onChange={(e) => setImportSourceType(e.target.value as SourceDocumentType)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
              >
                <option value="DIRETRIZ">Diretriz Oficial (SBC, FEBRASGO, etc.)</option>
                <option value="PCDT">PCDT — Ministério da Saúde</option>
                <option value="APOSTILA">Apostila Teórica StaziaMed</option>
                <option value="PROVA">Caderno de Prova INEP</option>
                <option value="AULA">Roteiro de Aula / Resumo</option>
                <option value="ARTIGO">Artigo Científico</option>
                <option value="MATERIAL_PROPRIO">Material Próprio Autoral</option>
                <option value="OUTRO">Outro Documento</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Ano da Edição / Publicação</label>
              <input
                type="number"
                placeholder="2026"
                value={importYear}
                onChange={(e) => setImportYear(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Instituição / Sociedade Emissora</label>
              <input
                type="text"
                placeholder="Ex: Ministério da Saúde / SUS"
                value={importInstitution}
                onChange={(e) => setImportInstitution(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-slate-300">Direitos de Uso & Proveniência</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "OWNED" as const, label: "Próprio / Autoral" },
                  { id: "LICENSED" as const, label: "Licenciado" },
                  { id: "AUTHORIZED" as const, label: "Autorizado" },
                  { id: "OFFICIAL_PUBLIC_DOCUMENT" as const, label: "Documento Público Oficial" },
                  { id: "PUBLIC_REFERENCE_ONLY" as const, label: "Referência Pública" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setImportRightsType(item.id)}
                    className={`p-2.5 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                      importRightsType === item.id
                        ? "bg-teal-500/20 border-teal-500/40 text-teal-200 font-bold"
                        : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          {/* Drag & Drop Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className="p-8 rounded-2xl border-2 border-dashed border-slate-700 hover:border-teal-400/50 bg-black/20 text-center space-y-3 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 mx-auto flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-teal-300 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    Arquivo selecionado: {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Tamanho: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Clique para trocar
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-bold text-white">Arraste seu arquivo PDF aqui ou clique para selecionar</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Suporte para arquivos PDF de até 50MB (limite canônico)</p>
                </>
              )}
            </div>
          </div>

          {/* Duplicate Warning Banner */}
          {duplicateWarning && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">Aviso de Duplicata Detectada</p>
                <p className="text-slate-300">{duplicateWarning}</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Live Ingestion Steps Progress */}
          {ingestionStep !== "IDLE" && (
            <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 space-y-3">
              <h5 className="text-xs font-bold text-white flex items-center gap-2">
                {ingestionStep === "COMPLETED" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : ingestionStep === "FAILED" ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                ) : (
                  <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                )}
                <span>Status da Ingestão & Extração: {ingestionStep}</span>
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                <div
                  className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    ingestionStep === "VALIDATING"
                      ? "bg-teal-500/20 border-teal-500/40 text-teal-200"
                      : ingestionStep !== "IDLE" && ingestionStep !== "FAILED"
                      ? "bg-black/30 border-slate-800 text-slate-400"
                      : "bg-black/20 border-slate-800/50 text-slate-600"
                  }`}
                >
                  <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span>1. Validação %PDF-</span>
                </div>

                <div
                  className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    ingestionStep === "FINGERPRINTING"
                      ? "bg-teal-500/20 border-teal-500/40 text-teal-200"
                      : ingestionStep === "STORING" || ingestionStep === "EXTRACTING" || ingestionStep === "COMPLETED"
                      ? "bg-black/30 border-slate-800 text-slate-400"
                      : "bg-black/20 border-slate-800/50 text-slate-600"
                  }`}
                >
                  <Hash className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span>2. SHA-256 Fingerprint</span>
                </div>

                <div
                  className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    ingestionStep === "STORING"
                      ? "bg-teal-500/20 border-teal-500/40 text-teal-200"
                      : ingestionStep === "EXTRACTING" || ingestionStep === "COMPLETED"
                      ? "bg-black/30 border-slate-800 text-slate-400"
                      : "bg-black/20 border-slate-800/50 text-slate-600"
                  }`}
                >
                  <Database className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span>3. Storage Privado</span>
                </div>

                <div
                  className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    ingestionStep === "EXTRACTING"
                      ? "bg-teal-500/20 border-teal-500/40 text-teal-200"
                      : ingestionStep === "COMPLETED"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-bold"
                      : "bg-black/20 border-slate-800/50 text-slate-600"
                  }`}
                >
                  <FileSearch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>4. Extração Verbatim</span>
                </div>
              </div>
            </div>
          )}

          {/* Success Card with Preview Button */}
          {ingestionStep === "COMPLETED" && lastIngestedDoc && (
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Documento-Fonte Ingerido e Extraído com Sucesso!
                </span>
                <p className="text-slate-300">
                  {lastIngestedDoc.title} • {lastIngestedDoc.pageCount} páginas • Modo: {lastIngestedDoc.contentMode}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewingDoc(lastIngestedDoc)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span>Abrir Source Preview</span>
              </button>
            </div>
          )}

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={ingestionStep === "VALIDATING" || ingestionStep === "EXTRACTING"}
              onClick={handleStartIngestion}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-2"
            >
              {ingestionStep === "VALIDATING" || ingestionStep === "EXTRACTING" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processando Extração...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Iniciar Importação & Análise</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. DOCUMENTOS FONTE */}
      {activeSubTab === "sources" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white">Documentos-Fonte Cadastrados</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Base documental oficial registrada para extração médica e governança editorial.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveSubTab("import")}
              className="px-3.5 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 font-semibold text-xs rounded-xl border border-teal-500/30 transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Importar PDF</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {registeredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-4 rounded-2xl bg-black/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white text-sm">{doc.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-semibold">
                      {doc.sourceType}
                    </span>
                    {getContentModeBadge(doc.contentMode)}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {doc.rightsType}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 text-[11px] font-mono">
                    <span>{doc.fileName}</span>
                    <span>•</span>
                    <span>{doc.pageCount} páginas</span>
                    <span>•</span>
                    <span>SHA: {doc.documentFingerprint ? doc.documentFingerprint.slice(0, 10) : "N/A"}...</span>
                    {doc.institution && (
                      <>
                        <span>•</span>
                        <span className="text-slate-300">{doc.institution}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {getStatusBadge(doc.status)}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSegmentDoc(doc);
                      setActiveSubTab("structured");
                    }}
                    className="px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 font-semibold text-xs rounded-xl border border-teal-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderTree className="w-3.5 h-3.5 text-teal-400" />
                    <span>Organizar Conteúdo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewingDoc(doc)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-semibold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-teal-400" />
                    <span>Visualizar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. CONTEÚDO ESTRUTURADO */}
      {activeSubTab === "structured" && (
        <StructuredSourceViewer
          structuredContents={structuredContents}
          selectedDocument={selectedSegmentDoc}
          onConfirmCanonical={handleConfirmCanonical}
          onApproveStructure={handleApproveStructure}
          onSplitSegment={handleSplitSegment}
          onMergeSegments={handleMergeSegments}
          onCreateEditorialDraft={handleCreateEditorialDraft}
        />
      )}

      {/* 5. CONTEÚDO GERADO */}
      {activeSubTab === "generated" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Rascunhos de Conteúdo Gerado</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Flashcards, questões inéditas e sínteses geradas a partir do conteúdo estruturado.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
            Nenhum rascunho de IA em processamento nesta etapa de extração pura de fontes (SOURCE FIRST).
          </div>
        </div>
      )}

      {/* 6. FILA DE REVISÃO */}
      {activeSubTab === "review" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Fila Editorial de Curadoria</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Itens aguardando aprovação médica formal antes de publicação.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
            Fila editorial limpa. Nenhum item pendente de revisão médica nesta etapa.
          </div>
        </div>
      )}

      {/* 7. PUBLICAÇÕES */}
      {activeSubTab === "publications" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Publicações Canônicas Ativas</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Conteúdos aprovados e integrados ao ecossistema de estudo dos alunos.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
            Todas as publicações canônicas estão sincronizadas com o inventário principal.
          </div>
        </div>
      )}

      {/* Source Document Preview Modal */}
      {previewingDoc && (
        <SourceDocumentPreview
          document={previewingDoc}
          onClose={() => setPreviewingDoc(null)}
        />
      )}

      {/* Editorial Editor Modal */}
      {editingEditorialDraft && (
        <StaziaEditorialEditor
          draft={editingEditorialDraft}
          onClose={() => setEditingEditorialDraft(null)}
          onApproveLayout={handleApproveEditorialLayout}
          onReorderBlock={handleReorderEditorialBlocks}
          onChangeComponentType={handleChangeEditorialComponentType}
          onInsertPageBreak={handleInsertEditorialPageBreak}
          onExportPdf={handleExportPdf}
          onDownloadPdf={handleDownloadPdf}
          onRightsReview={handleRightsReview}
          exportsHistory={exportsHistory}
        />
      )}
    </div>
  );
};
