/**
 * Medical Segmentation Engine (Etapa 1.28C).
 * Hierarchical chunked segmentation transforming resolved source pages into
 * structured medical content without rewriting or losing any source blocks.
 */

import {
  CanonicalMedicalArea,
  DocumentSegment,
  DocumentSegmentType,
  MedicalSegmentationResult,
  STAZIAMED_TAXONOMY_VERSION,
  StructuredBlockType,
  StructuredSourceBlock,
  StructuredSourceContent,
} from "../../src/types/medicalTaxonomy";
import { SourceDocument } from "../../src/types/pdfIngestion";
import { OcrBlock, ResolvedSourcePage } from "../../src/types/pdfOcr";
import { suggestCanonicalTopicMatch } from "../../src/services/canonicalTopicMatchingService";

export class MedicalSegmentationEngine {
  private static instance: MedicalSegmentationEngine;
  public readonly engineName = "MedicalSegmentationEngine";
  public readonly engineVersion = "1.0.0";

  public static getInstance(): MedicalSegmentationEngine {
    if (!MedicalSegmentationEngine.instance) {
      MedicalSegmentationEngine.instance = new MedicalSegmentationEngine();
    }
    return MedicalSegmentationEngine.instance;
  }

  /**
   * Executes hierarchical segmentation on a SourceDocument.
   */
  public async segmentDocument(
    sourceDoc: SourceDocument
  ): Promise<MedicalSegmentationResult> {
    const startedAt = Date.now();
    const resolvedPages: ResolvedSourcePage[] =
      sourceDoc.resolvedPages && sourceDoc.resolvedPages.length > 0
        ? sourceDoc.resolvedPages
        : this.generateFallbackResolvedPages(sourceDoc);

    // Pass 1: Collect All Source Blocks and Outline Index
    const allSourceBlocks: { block: OcrBlock; pageNumber: number }[] = [];
    resolvedPages.forEach((page) => {
      const pageBlocks = page.resolvedBlocks.length > 0
        ? page.resolvedBlocks
        : this.createBlocksFromPageText(sourceDoc.id, page.pageNumber, page.resolvedText);

      pageBlocks.forEach((b) => allSourceBlocks.push({ block: b, pageNumber: page.pageNumber }));
    });

    const totalSourceBlocks = allSourceBlocks.length;

    // Pass 2: Coarse Boundaries & Outline Detection
    const rawSegments = this.detectSegmentBoundaries(sourceDoc.id, resolvedPages, allSourceBlocks);

    // Pass 3 & 4: Structured Block Transformation & Zero Loss Attribution
    let assignedCount = 0;
    const structuredContents: StructuredSourceContent[] = [];
    const areasSummary: Record<CanonicalMedicalArea, number> = {
      CLINICA_MEDICA: 0,
      CIRURGIA: 0,
      PEDIATRIA: 0,
      GINECOLOGIA_OBSTETRICIA: 0,
      MEDICINA_PREVENTIVA: 0,
    };

    rawSegments.forEach((segment, segIdx) => {
      // Find blocks belonging to this segment's page range
      const segmentSourceItems = allSourceBlocks.filter(
        (item) => item.pageNumber >= segment.pageStart && item.pageNumber <= segment.pageEnd
      );

      const structuredBlocks: StructuredSourceBlock[] = segmentSourceItems.map((item, bIdx) => {
        const blk = item.block;
        const mappedType = this.mapBlockType(blk.type);

        return {
          id: `sb_${segment.id}_${bIdx + 1}`,
          type: mappedType,
          order: bIdx + 1,
          pageNumber: item.pageNumber,
          sourceBlockId: blk.id,
          originalText: blk.text || "",
          provenance: {
            documentId: sourceDoc.id,
            segmentId: segment.id,
            pageNumber: item.pageNumber,
            sourceBlockId: blk.id,
          },
        };
      });

      assignedCount += structuredBlocks.length;

      // Classify Area & Specialty
      const { area, specialty, topic, subtopics } = this.classifySegment(segment, structuredBlocks);

      if (area) {
        areasSummary[area] = (areasSummary[area] || 0) + 1;
      }

      // Pass 5: Canonical Match Suggestion (Without Auto-Approving)
      const contextText = structuredBlocks.slice(0, 10).map((b) => b.originalText).join(" ");
      const canonicalMatch = suggestCanonicalTopicMatch(area, specialty, topic, contextText);

      const structuredItem: StructuredSourceContent = {
        id: `sc_${sourceDoc.id}_${segIdx + 1}`,
        sourceDocumentId: sourceDoc.id,
        segmentId: segment.id,
        area,
        specialty,
        topic,
        subtopics,
        suggestedCanonicalTopicId: canonicalMatch.suggestedCanonicalTopicId,
        canonicalTopicId: undefined, // Strictly undefined until explicit Admin confirmation
        sourcePages: segment.sourcePageRefs,
        sourceBlockRefs: structuredBlocks.map((b) => b.sourceBlockId),
        blocks: structuredBlocks,
        classificationConfidence: canonicalMatch.matchConfidence || 0.85,
        status: "REVIEW_REQUIRED",
        taxonomyVersion: STAZIAMED_TAXONOMY_VERSION,
        totalSourceBlocks: structuredBlocks.length,
        assignedSourceBlocks: structuredBlocks.length,
        unassignedSourceBlocks: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      structuredContents.push(structuredItem);
    });

    const unassignedSourceBlocks = totalSourceBlocks - assignedCount;
    const duration = Date.now() - startedAt;

    return {
      documentId: sourceDoc.id,
      segments: rawSegments,
      structuredContents,
      areasFoundSummary: areasSummary,
      totalSourceBlocks,
      assignedSourceBlocks: assignedCount,
      unassignedSourceBlocks: Math.max(0, unassignedSourceBlocks),
      segmentationDurationMs: duration,
    };
  }

  private detectSegmentBoundaries(
    documentId: string,
    resolvedPages: ResolvedSourcePage[],
    allBlocks: { block: OcrBlock; pageNumber: number }[]
  ): DocumentSegment[] {
    const segments: DocumentSegment[] = [];
    const totalPages = resolvedPages.length || 1;

    // Detect explicit topic transitions
    interface TopicTransition {
      pageNumber: number;
      title: string;
      reason: string;
    }

    const transitions: TopicTransition[] = [];

    // Scan headings and page texts for major topic transitions
    resolvedPages.forEach((page) => {
      const headings = page.resolvedBlocks.filter((b) => b.type === "OCR_HEADING");
      for (const h of headings) {
        const text = h.text?.trim() || "";
        // Check for continuation indicator
        const isContinuation = /continua[çc][ãa]o|parte\s+\d+|seguimento/i.test(text);

        // Check if heading represents a major topic or canonical area transition
        if (
          !isContinuation &&
          (/^(CLÍNICA MÉDICA|CIRURGIA|PEDIATRIA|GINECOLOGIA|MEDICINA PREVENTIVA|HIPERTENSÃO|INSUFICIÊNCIA CARDÍACA|DIABETES|PNEUMONIA|DIARREIA|EPIDEMIOLOGIA|SISTEMA ÚNICO DE SAÚDE|ABDOME AGUDO|TRAUMA|PRÉ-NATAL|CALENDÁRIO|ASSISTÊNCIA|PARTO|PUERICULTURA)/i.test(
            text
          ) ||
            /^(\d+\.\s+[A-ZÁ-Ú]{4,})/i.test(text))
        ) {
          // If on same page as existing transition, refine title if more specific
          const existingOnPage = transitions.find((t) => t.pageNumber === page.pageNumber);
          const isGenericAreaHeader = /^(CLÍNICA MÉDICA|CIRURGIA GERAL|PEDIATRIA|GINECOLOGIA E OBSTETRÍCIA|MEDICINA PREVENTIVA E SOCIAL)$/i.test(text);

          if (existingOnPage) {
            if (!isGenericAreaHeader) {
              existingOnPage.title = text;
            }
          } else {
            transitions.push({
              pageNumber: page.pageNumber,
              title: text,
              reason: `Mudança semântica explícita detectada: "${text}"`,
            });
          }
        }
      }
    });

    // If no multi-topic transitions found, treat as single or dual topic document
    if (transitions.length <= 1) {
      const firstHeading = allBlocks.find((b) => b.block.type === "OCR_HEADING")?.block.text;
      const title = firstHeading || resolvedPages[0]?.resolvedText.split("\n")[0] || "Tema Principal";

      segments.push({
        id: `seg_${documentId}_1`,
        documentId,
        pageStart: 1,
        pageEnd: totalPages,
        sourcePageRefs: Array.from({ length: totalPages }, (_, i) => i + 1),
        detectedTitle: title,
        detectedHeadings: allBlocks.filter((b) => b.block.type === "OCR_HEADING").map((b) => b.block.text || ""),
        sourceBlockRefs: allBlocks.map((b) => b.block.id),
        tableRefs: [],
        figureRefs: [],
        segmentType: "TOPIC_SEGMENT",
        segmentationConfidence: 0.95,
        boundaryReason: "Documento com foco em tema único contínuo.",
        status: "PROCESSED",
        createdAt: new Date().toISOString(),
      });
      return segments;
    }

    // Multi-topic segmentation
    for (let i = 0; i < transitions.length; i++) {
      const cur = transitions[i];
      const next = transitions[i + 1];

      const pageStart = cur.pageNumber;
      const pageEnd = next ? next.pageNumber - 1 : totalPages;
      const pageRefs = Array.from({ length: pageEnd - pageStart + 1 }, (_, k) => pageStart + k);

      const segBlocks = allBlocks.filter((b) => b.pageNumber >= pageStart && b.pageNumber <= pageEnd);

      segments.push({
        id: `seg_${documentId}_${i + 1}`,
        documentId,
        pageStart,
        pageEnd,
        sourcePageRefs: pageRefs,
        detectedTitle: cur.title,
        detectedHeadings: segBlocks.filter((b) => b.block.type === "OCR_HEADING").map((b) => b.block.text || ""),
        sourceBlockRefs: segBlocks.map((b) => b.block.id),
        tableRefs: [],
        figureRefs: [],
        segmentType: "TOPIC_SEGMENT",
        segmentationConfidence: 0.92,
        boundaryReason: cur.reason,
        status: "PROCESSED",
        createdAt: new Date().toISOString(),
      });
    }

    return segments;
  }

  private classifySegment(
    segment: DocumentSegment,
    blocks: StructuredSourceBlock[]
  ): {
    area: CanonicalMedicalArea;
    specialty: string;
    topic: string;
    subtopics: string[];
  } {
    const combinedText = `${segment.detectedTitle || ""} ${blocks.map((b) => b.originalText).join(" ")}`.toLowerCase();

    // 1. Area Determination
    let area: CanonicalMedicalArea = "CLINICA_MEDICA";
    let specialty = "Clínica Geral";

    if (/pediatria|puericultura|recem-nascido|neonat|infantil|aleitamento|vacina.*infan|bva|bronquiolite/i.test(combinedText)) {
      area = "PEDIATRIA";
      specialty = "Pediatria Geral";
    } else if (/ginecologia|obstetr|parto|gesta|gravid|pre-natal|cesariana|eclampsia|preeclampsia|puerper|uterin/i.test(combinedText)) {
      area = "GINECOLOGIA_OBSTETRICIA";
      specialty = "Obstetrícia";
    } else if (/cirurgia|apendicite|trauma|atls|laparot|laparoscop|hernia|queimadur|ferida|blumberg/i.test(combinedText)) {
      area = "CIRURGIA";
      specialty = "Cirurgia Geral";
    } else if (/medicina preventiva|epidemiolog|\bsus\b|notificacao|sinan|saude coletiva|mortalidade|universalidade|lei 8080/i.test(combinedText)) {
      area = "MEDICINA_PREVENTIVA";
      specialty = "Saúde Coletiva / SUS";
    } else if (/pressao|hipertens|insuficiencia cardiaca|cardiolog|infarto|coronar/i.test(combinedText)) {
      area = "CLINICA_MEDICA";
      specialty = "Cardiologia";
    } else if (/glicemia|diabetes|tireoide|endocrin/i.test(combinedText)) {
      area = "CLINICA_MEDICA";
      specialty = "Endocrinologia";
    } else if (/clinica medica/i.test(combinedText)) {
      area = "CLINICA_MEDICA";
      specialty = "Clínica Geral";
    }

    // 2. Topic & Subtopics
    const topic = segment.detectedTitle || "Tema Clínico Estruturado";
    const subtopics: string[] = [];

    blocks.forEach((b) => {
      if (b.type === "SOURCE_HEADING" && b.originalText && b.originalText !== topic) {
        subtopics.push(b.originalText);
      }
    });

    if (subtopics.length === 0) {
      subtopics.push("Diagnóstico e Conduta");
    }

    return { area, specialty, topic, subtopics };
  }

  private mapBlockType(ocrType: string): StructuredBlockType {
    switch (ocrType) {
      case "OCR_HEADING":
        return "SOURCE_HEADING";
      case "OCR_LIST":
        return "SOURCE_LIST";
      case "OCR_TABLE":
        return "SOURCE_TABLE";
      case "OCR_FIGURE":
        return "SOURCE_FIGURE";
      case "OCR_CAPTION":
        return "SOURCE_CAPTION";
      case "OCR_FOOTNOTE":
        return "SOURCE_REFERENCE";
      default:
        return "SOURCE_PARAGRAPH";
    }
  }

  private generateFallbackResolvedPages(sourceDoc: SourceDocument): ResolvedSourcePage[] {
    const extractedPages = sourceDoc.extractedDocument?.pages || [];
    return extractedPages.map((p) => ({
      documentId: sourceDoc.id,
      pageNumber: p.pageNumber,
      nativeExtraction: p,
      resolvedBlocks: this.createBlocksFromPageText(sourceDoc.id, p.pageNumber, p.text),
      resolvedText: p.text,
      resolvedTables: [],
      resolvedFigures: [],
      resolutionMethod: "NATIVE_ONLY",
      warnings: [],
      sourceCompleteness: "COMPLETE",
    }));
  }

  private createBlocksFromPageText(documentId: string, pageNumber: number, text: string): OcrBlock[] {
    return text.split("\n\n").map((para, idx) => {
      const trimmed = para.trim();
      const isHeading =
        /^\d+\.\s+[A-Z]/.test(trimmed) ||
        /^(CLÍNICA MÉDICA|CIRURGIA|PEDIATRIA|GINECOLOGIA|MEDICINA PREVENTIVA|HIPERTENSÃO|INSUFICIÊNCIA CARDÍACA|DIABETES|PNEUMONIA|DIARREIA|EPIDEMIOLOGIA|SISTEMA ÚNICO|ABDOME AGUDO|TRAUMA|PRÉ-NATAL|CALENDÁRIO|ASSISTÊNCIA|PARTO|PUERICULTURA)/i.test(
          trimmed
        ) ||
        (trimmed.length <= 80 && trimmed === trimmed.toUpperCase() && !trimmed.includes("."));

      return {
        id: `blk_gen_${documentId}_p${pageNumber}_${idx + 1}`,
        pageNumber,
        type: isHeading ? "OCR_HEADING" : "OCR_PARAGRAPH",
        text: trimmed,
        order: idx + 1,
        provenance: { documentId, pageNumber },
      };
    });
  }
}
