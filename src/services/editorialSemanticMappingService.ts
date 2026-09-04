/**
 * Editorial Semantic Mapping Service (Etapa 1.28D).
 * Transforms StructuredSourceBlocks into EditorialBlocks with deterministic
 * component assignments, semantic roles, and layout hints without text modifications.
 */

import {
  EditorialBlock,
  EditorialComponentType,
  EditorialLayoutHints,
  EditorialSemanticRole,
} from "../types/medicalEditorial";
import { StructuredSourceBlock } from "../types/medicalTaxonomy";

export class EditorialSemanticMappingService {
  private static instance: EditorialSemanticMappingService;

  public static getInstance(): EditorialSemanticMappingService {
    if (!EditorialSemanticMappingService.instance) {
      EditorialSemanticMappingService.instance = new EditorialSemanticMappingService();
    }
    return EditorialSemanticMappingService.instance;
  }

  /**
   * Maps a single StructuredSourceBlock to an EditorialBlock.
   */
  public mapSourceBlockToEditorial(
    sourceBlock: StructuredSourceBlock,
    editorialOrder: number
  ): EditorialBlock {
    const rawText = sourceBlock.originalText || "";
    const trimmed = rawText.trim();

    let type: EditorialComponentType = "EditorialParagraph";
    let semanticRole: EditorialSemanticRole = "BODY";
    let styleVariant: string | undefined = undefined;
    let warningSeverity: "ATTENTION" | "HIGH_RISK" | "EMERGENCY" | undefined = undefined;

    // Deterministic Mapping by StructuredBlockType
    switch (sourceBlock.type) {
      case "SOURCE_HEADING": {
        if (/^(1\.|2\.|3\.|4\.|5\.|6\.|7\.|8\.|9\.|[A-ZÁ-Ú\s]{4,})/i.test(trimmed) && trimmed.length <= 80) {
          type = "BrushSectionHeader";
          semanticRole = "SECTION_HEADER";
        } else {
          type = "EditorialSubheading";
          semanticRole = "SUBSECTION_HEADER";
        }
        break;
      }

      case "SOURCE_LIST": {
        type = "EditorialList";
        semanticRole = "LIST";
        break;
      }

      case "SOURCE_TABLE": {
        if (!sourceBlock.tableData || sourceBlock.tableData.isUnresolved || sourceBlock.tableData.structureConfidence < 0.5) {
          type = "EditorialSourceWarning";
          semanticRole = "UNRESOLVED";
        } else {
          type = "StaziaMedicalTable";
          semanticRole = "TABLE";
        }
        break;
      }

      case "SOURCE_WARNING": {
        type = "ClinicalWarningCard";
        semanticRole = "WARNING";
        if (/emerg[êe]ncia|grave|risco de morte|parada/i.test(trimmed)) {
          warningSeverity = "EMERGENCY";
        } else if (/alto risco|contraindica|alerta|urg[êe]ncia|loa/i.test(trimmed)) {
          warningSeverity = "HIGH_RISK";
        } else {
          warningSeverity = "ATTENTION";
        }
        styleVariant = warningSeverity;
        break;
      }

      case "SOURCE_ALGORITHM": {
        type = "ClinicalAlgorithmSteps";
        semanticRole = "ALGORITHM";
        break;
      }

      case "SOURCE_DEFINITION": {
        type = "DefinitionCard";
        semanticRole = "DEFINITION";
        break;
      }

      case "SOURCE_FIGURE": {
        type = "MedicalImageBlock";
        semanticRole = "FIGURE";
        break;
      }

      case "SOURCE_CAPTION": {
        type = "MedicalFigureCaption";
        semanticRole = "CAPTION";
        break;
      }

      case "SOURCE_REFERENCE": {
        type = "ReferenceBlock";
        semanticRole = "REFERENCE";
        break;
      }

      default: {
        // Semantic inspection on paragraph text for explicit contextual cards
        if (/^(nota|observa[çc][ãa]o|lembrete|aten[çc][ãa]o\s*:)/i.test(trimmed)) {
          type = "StickyNoteCard";
          semanticRole = "NOTE";
        } else if (/^(urg[êe]ncia\s+x\s+emerg[êe]ncia|versus|compara[çc][ãa]o|diferen[çc]as)/i.test(trimmed)) {
          type = "ComparisonCard";
          semanticRole = "COMPARISON";
        } else if (/^(atualiza[çc][ãa]o\s+de\s+protocolo|nova\s+diretriz\s+ms|mudan[çc]a\s+pcdt)/i.test(trimmed)) {
          type = "ProtocolUpdateCard";
          semanticRole = "NOTE";
        } else if (/^(resumo\s+dos\s+pontos|conclus[ãa]o\s+do\s+cap[íi]tulo|pontos-chave)/i.test(trimmed)) {
          type = "QuickSummaryStrip";
          semanticRole = "SOURCE_SUMMARY";
        } else {
          type = "EditorialParagraph";
          semanticRole = "BODY";
        }
        break;
      }
    }

    const layoutHints = this.calculateLayoutHints(type, trimmed);

    // List items extraction if type is list
    let listItems: string[] | undefined = undefined;
    if (type === "EditorialList") {
      listItems = trimmed
        .split("\n")
        .map((line) => line.replace(/^[-*•\d.]+\s*/, "").trim())
        .filter((line) => line.length > 0);
    }

    return {
      id: `ed_blk_${sourceBlock.id}`,
      type,
      sourceBlockRefs: [sourceBlock.sourceBlockId || sourceBlock.id],
      content: rawText, // STRICT VERBATIM SOURCE TEXT
      semanticRole,
      styleVariant,
      layoutHints,
      provenance: {
        documentId: sourceBlock.provenance.documentId,
        sourcePage: sourceBlock.provenance.pageNumber,
        sourceBlockId: sourceBlock.provenance.sourceBlockId || sourceBlock.id,
        sourceTextVerbatim: rawText,
      },
      sourceOrder: sourceBlock.order,
      editorialOrder,
      tableData: sourceBlock.tableData,
      figureData: sourceBlock.figureData,
      listItems,
      warningSeverity,
      rightsWarning: undefined,
    };
  }

  /**
   * Calculates layout weight and page break constraints for density planning.
   */
  private calculateLayoutHints(type: EditorialComponentType, text: string): EditorialLayoutHints {
    const charCount = text.length;

    switch (type) {
      case "BrushSectionHeader":
        return { densityWeight: 1.5, keepWithNext: true, avoidPageBreakInside: true };
      case "EditorialSubheading":
        return { densityWeight: 1.0, keepWithNext: true, avoidPageBreakInside: true };
      case "StaziaMedicalTable":
        return { densityWeight: 4.0, avoidPageBreakInside: true, fullWidth: true };
      case "MedicalImageBlock":
        return { densityWeight: 3.5, avoidPageBreakInside: true };
      case "ClinicalAlgorithmSteps":
        return { densityWeight: 4.0, avoidPageBreakInside: true };
      case "ClinicalWarningCard":
        return { densityWeight: 2.5, avoidPageBreakInside: true };
      case "StickyNoteCard":
        return { densityWeight: 2.0, avoidPageBreakInside: true };
      case "ProtocolUpdateCard":
      case "ComparisonCard":
      case "DefinitionCard":
      case "QuickSummaryStrip":
        return { densityWeight: 2.5, avoidPageBreakInside: true };
      case "EditorialList":
        return { densityWeight: Math.max(1.5, Math.ceil(charCount / 120)), avoidPageBreakInside: false };
      case "EditorialSourceWarning":
        return { densityWeight: 2.0, avoidPageBreakInside: true };
      default:
        // Paragraph: estimate based on char length (average 300 chars = 1 weight unit)
        return { densityWeight: Math.max(0.8, Math.min(3.0, charCount / 250)), avoidPageBreakInside: false };
    }
  }
}
