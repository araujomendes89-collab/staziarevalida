/**
 * Types and Contracts for StaziaMed Content Engine (Etapa 1.27B).
 * Strictly defines domain models, source document contracts, structured AST, and block mappings.
 */

export type SourceDocumentType =
  | "APOSTILA"
  | "PCDT"
  | "DIRETRIZ"
  | "AULA"
  | "PROVA"
  | "MATERIAL_PROPRIO"
  | "OUTRO";

export type ContentReferenceRightsType =
  | "OWNED"
  | "LICENSED"
  | "AUTHORIZED"
  | "PUBLIC_REFERENCE_ONLY";

export interface SourceDocument {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sourceType: SourceDocumentType;
  rightsType: ContentReferenceRightsType;
  status: "PENDING" | "PROCESSED" | "FAILED";
  createdBy: string;
  createdAt: string;
}

export type ContentBlockType =
  | "heading"
  | "paragraph"
  | "table"
  | "image"
  | "clinicalAlert"
  | "examTip"
  | "protocolUpdate"
  | "comparison"
  | "algorithm"
  | "quickSummary";

export interface BaseContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
}

export interface HeadingBlockContent extends BaseContentBlock {
  type: "heading";
  level: 1 | 2 | 3 | 4;
  text: string;
}

export interface ParagraphBlockContent extends BaseContentBlock {
  type: "paragraph";
  text: string;
}

export interface ClinicalAlertBlockContent extends BaseContentBlock {
  type: "clinicalAlert";
  title: string;
  content: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  sourceGuideline?: string;
}

export interface ExamTipBlockContent extends BaseContentBlock {
  type: "examTip";
  title: string;
  tip: string;
  inepFocusYear?: number;
}

export interface ProtocolUpdateBlockContent extends BaseContentBlock {
  type: "protocolUpdate";
  topic: string;
  previousConduct: string;
  updatedConduct: string;
  validFromYear: number;
  officialSource: string;
}

export interface TableBlockContent extends BaseContentBlock {
  type: "table";
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface ComparisonBlockContent extends BaseContentBlock {
  type: "comparison";
  title: string;
  criteria: string[];
  items: Array<{ name: string; values: string[] }>;
}

export interface AlgorithmBlockContent extends BaseContentBlock {
  type: "algorithm";
  title: string;
  steps: Array<{ stepNumber: number; action: string; condition?: string; nextStep?: number }>;
}

export interface QuickSummaryBlockContent extends BaseContentBlock {
  type: "quickSummary";
  keyTakeaways: string[];
}

export interface ImageBlockContent extends BaseContentBlock {
  type: "image";
  url: string;
  caption?: string;
  altText?: string;
}

export type ContentBlock =
  | HeadingBlockContent
  | ParagraphBlockContent
  | ClinicalAlertBlockContent
  | ExamTipBlockContent
  | ProtocolUpdateBlockContent
  | TableBlockContent
  | ComparisonBlockContent
  | AlgorithmBlockContent
  | QuickSummaryBlockContent
  | ImageBlockContent;

export interface StructuredSourceContent {
  id: string;
  sourceDocumentId: string;
  area: string;
  specialty: string;
  topic: string;
  canonicalTopicId?: string; // Explicitly optional: AI suggests, Admin approves
  sourcePages: number[];
  blocks: ContentBlock[];
  status: "DRAFT" | "STRUCTURED" | "VERIFIED";
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedContentDraft {
  id: string;
  sourceContentId: string;
  transformationType: "FLASHCARDS" | "QUESTIONS" | "SUMMARY" | "EDITORIAL";
  content: Record<string, any>;
  model?: string;
  createdAt: string;
  createdBy: string;
}

export interface PublishedContent {
  id: string;
  contentDraftId: string;
  version: number;
  publishedAt: string;
  publishedBy: string;
}

/**
 * Conceptual Registry mapping JSON block types to Stazia component names.
 */
export const CONTENT_BLOCK_COMPONENT_REGISTRY: Record<ContentBlockType, string> = {
  heading: "HeadingBlock",
  paragraph: "ParagraphBlock",
  clinicalAlert: "ClinicalWarningCard",
  examTip: "ExamTipCard",
  protocolUpdate: "ProtocolUpdateCard",
  table: "StaziaMedicalTable",
  comparison: "ComparisonTableCard",
  algorithm: "ClinicalAlgorithmSteps",
  quickSummary: "QuickSummaryCard",
  image: "MedicalImageBlock",
};
