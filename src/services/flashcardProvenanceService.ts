import {
  Flashcard,
  FlashcardProvenance,
  FlashcardProvenanceStatus,
  FlashcardOrigin,
  Question,
  MedicalArea,
} from "../types";

/**
 * Deterministic 64-bit FNV-1a string hashing
 */
function fnv1a64Hex(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ (ch & 0xff), 0x01000193);
    h2 = Math.imul(h2 ^ (ch >>> 8), 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}`;
}

/**
 * Normalize text deterministically without altering clinical semantics
 */
function normalizeContentString(str?: string | null): string {
  if (!str) return "";
  return str
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export class FlashcardProvenanceService {
  static readonly CONTENT_FINGERPRINT_VERSION = 1;
  static readonly CONTENT_VERSION = 1;

  /**
   * Computes a deterministic, versioned content fingerprint for a flashcard
   */
  static createFlashcardContentFingerprint(
    front: string,
    back: string,
    keyMnemonic?: string
  ): string {
    const normFront = normalizeContentString(front);
    const normBack = normalizeContentString(back);
    const normMnemonic = normalizeContentString(keyMnemonic);

    const payload = `v=1|front=${normFront}|back=${normBack}|mnemonic=${normMnemonic}`;
    const hash = fnv1a64Hex(payload);
    return `fc_fp_v1_${hash}`;
  }

  /**
   * Creates a provenance record from a source Question
   */
  static createQuestionDerivedProvenance(
    question: Question,
    now: Date = new Date()
  ): FlashcardProvenance {
    const canonicalTopicId = (question as any).canonicalTopicId;

    return {
      origin: "QUESTION_DERIVED",
      createdAt: now.toISOString(),
      sourceQuestionId: question.id,
      sourceCanonicalQuestionId: question.canonicalQuestionId || undefined,
      sourceQuestionFingerprint: question.questionFingerprint || undefined,
      canonicalTopicId: typeof canonicalTopicId === "string" && canonicalTopicId.trim().length > 0 ? canonicalTopicId.trim() : undefined,
      sourceArea: question.area,
      sourceTopic: question.topic,
      sourceSubtopic: question.subtopic || undefined,
      sourceExamEdition: question.examEdition || undefined,
      sourceExamYear: question.examYear || undefined,
      contentReviewStatus: question.verifiedByDoctor ? "APPROVED" : "UNREVIEWED",
      reviewedByDoctor: question.verifiedByDoctor || undefined,
      reviewedAt: question.clinicalVerifiedAt || undefined,
    };
  }

  /**
   * Creates a legacy provenance record for existing local or imported cards
   */
  static createLegacyProvenance(
    origin: "LEGACY_LOCAL" | "IMPORTED_LEGACY" = "LEGACY_LOCAL",
    now: Date = new Date()
  ): FlashcardProvenance {
    return {
      origin,
      createdAt: now.toISOString(),
      contentReviewStatus: "UNREVIEWED",
    };
  }

  /**
   * Creates an AI-generated provenance record
   */
  static createAiGeneratedProvenance(
    metadata?: {
      model?: string;
      promptVersion?: string;
      agentTraceId?: string;
      reviewedByDoctor?: string;
      canonicalTopicId?: string;
      area?: MedicalArea;
      topic?: string;
    },
    now: Date = new Date()
  ): FlashcardProvenance {
    return {
      origin: "AI_GENERATED",
      createdAt: now.toISOString(),
      canonicalTopicId: metadata?.canonicalTopicId,
      sourceArea: metadata?.area,
      sourceTopic: metadata?.topic,
      aiGeneratedMetadata: metadata
        ? {
            model: metadata.model,
            promptVersion: metadata.promptVersion,
            agentTraceId: metadata.agentTraceId,
            generatedAt: now.toISOString(),
          }
        : undefined,
      contentReviewStatus: metadata?.reviewedByDoctor ? "APPROVED" : "UNREVIEWED",
      reviewedByDoctor: metadata?.reviewedByDoctor || undefined,
    };
  }

  /**
   * Evaluates the provenance completeness status of a flashcard
   */
  static getFlashcardProvenanceStatus(card: Flashcard): FlashcardProvenanceStatus {
    if (!card.provenance) {
      return "LEGACY_OR_UNKNOWN";
    }

    const { origin, sourceQuestionId, sourceQuestionFingerprint, sourceCanonicalQuestionId } = card.provenance;

    if (origin === "LEGACY_LOCAL" || origin === "IMPORTED_LEGACY" || origin === "UNKNOWN") {
      return "LEGACY_OR_UNKNOWN";
    }

    if (origin === "QUESTION_DERIVED") {
      if (sourceQuestionId && (sourceQuestionFingerprint || sourceCanonicalQuestionId)) {
        return "COMPLETE";
      }
      if (sourceQuestionId) {
        return "PARTIAL";
      }
      return "LEGACY_OR_UNKNOWN";
    }

    if (origin === "AI_GENERATED") {
      if (card.provenance.aiGeneratedMetadata?.model) {
        return "COMPLETE";
      }
      return "PARTIAL";
    }

    return "PARTIAL";
  }
}
