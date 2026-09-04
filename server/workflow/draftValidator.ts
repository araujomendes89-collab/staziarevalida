import crypto from "crypto";
import { DraftFlashcardPayload, AutoValidationStatus } from "../../src/types/canonicalWorkflow";
import { VALID_CARD_PURPOSES } from "../../src/services/canonicalFlashcardValidator";
import { getGrandeTemaById } from "../../src/data/grandesTemas";
import { AREA_ID_TO_MEDICAL_AREA } from "../../src/services/topicTaxonomyService";
import { CanonicalCardPurpose } from "../../src/types/canonicalFlashcard";

export interface DraftValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedDraft: DraftFlashcardPayload;
}

export interface AutoValidationCheckResult {
  status: AutoValidationStatus;
  errors: string[];
}

/**
 * Computes canonical content fingerprint v1:
 * fc_fp_v1_<sha256(normalized_front + "::" + normalized_back)>
 */
export function computeDraftFingerprint(front?: string, back?: string): string {
  if (!front || !back) return "";
  const normFront = front.trim().toLowerCase().replace(/\s+/g, " ");
  const normBack = back.trim().toLowerCase().replace(/\s+/g, " ");
  const hash = crypto
    .createHash("sha256")
    .update(`${normFront}::${normBack}`)
    .digest("hex")
    .slice(0, 16);
  return `fc_fp_v1_${hash}`;
}

/**
 * Validates and sanitizes draft payload for mass-assignment protection.
 * Permissive on optional/missing fields (since draft is a work-in-progress),
 * but strictly types and validates provided inputs.
 */
export function validateAndSanitizeDraftPayload(
  rawInput: unknown
): DraftValidationResult {
  const errors: string[] = [];

  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return {
      valid: false,
      errors: ["Draft payload must be a non-null object."],
      sanitizedDraft: {},
    };
  }

  const raw = rawInput as Record<string, any>;
  const sanitized: DraftFlashcardPayload = {};

  // Front & Back validation
  if (raw.front !== undefined) {
    if (typeof raw.front !== "string") {
      errors.push("'front' must be a string.");
    } else if (raw.front.length > 4000) {
      errors.push("'front' length exceeds 4000 characters limit.");
    } else {
      sanitized.front = raw.front.trim();
    }
  }

  if (raw.back !== undefined) {
    if (typeof raw.back !== "string") {
      errors.push("'back' must be a string.");
    } else if (raw.back.length > 4000) {
      errors.push("'back' length exceeds 4000 characters limit.");
    } else {
      sanitized.back = raw.back.trim();
    }
  }

  // Key Mnemonic
  if (raw.keyMnemonic !== undefined) {
    if (typeof raw.keyMnemonic !== "string") {
      errors.push("'keyMnemonic' must be a string.");
    } else if (raw.keyMnemonic.length > 200) {
      errors.push("'keyMnemonic' length exceeds 200 characters limit.");
    } else {
      sanitized.keyMnemonic = raw.keyMnemonic.trim();
    }
  }

  // Canonical Topic & Area derivation
  if (raw.canonicalTopicId !== undefined) {
    if (typeof raw.canonicalTopicId !== "string") {
      errors.push("'canonicalTopicId' must be a string.");
    } else {
      const topicId = raw.canonicalTopicId.trim();
      if (topicId) {
        const tema = getGrandeTemaById(topicId);
        if (!tema) {
          errors.push(`Invalid 'canonicalTopicId': "${topicId}" not found in canonical taxonomy.`);
        } else {
          sanitized.canonicalTopicId = topicId;
          sanitized.areaId = tema.areaId;
          sanitized.area = AREA_ID_TO_MEDICAL_AREA[tema.areaId] || "CLINICA_MEDICA";
        }
      }
    }
  }

  // Card Purpose
  if (raw.cardPurpose !== undefined) {
    if (typeof raw.cardPurpose !== "string" || !VALID_CARD_PURPOSES.includes(raw.cardPurpose as CanonicalCardPurpose)) {
      errors.push(`Invalid 'cardPurpose': "${raw.cardPurpose}". Allowed: ${VALID_CARD_PURPOSES.join(", ")}.`);
    } else {
      sanitized.cardPurpose = raw.cardPurpose as CanonicalCardPurpose;
    }
  }

  // Assessment Source
  if (raw.assessmentSource !== undefined) {
    if (typeof raw.assessmentSource !== "object" || raw.assessmentSource === null || Array.isArray(raw.assessmentSource)) {
      errors.push("'assessmentSource' must be a structured object.");
    } else {
      sanitized.assessmentSource = {
        sourceQuestionId: typeof raw.assessmentSource.sourceQuestionId === "string" ? raw.assessmentSource.sourceQuestionId.trim() : undefined,
        sourceCanonicalQuestionId: typeof raw.assessmentSource.sourceCanonicalQuestionId === "string" ? raw.assessmentSource.sourceCanonicalQuestionId.trim() : undefined,
        sourceQuestionFingerprint: typeof raw.assessmentSource.sourceQuestionFingerprint === "string" ? raw.assessmentSource.sourceQuestionFingerprint.trim() : undefined,
        examYear: typeof raw.assessmentSource.examYear === "number" ? raw.assessmentSource.examYear : undefined,
        examEdition: typeof raw.assessmentSource.examEdition === "string" ? raw.assessmentSource.examEdition.trim() : undefined,
        originalNumber: typeof raw.assessmentSource.originalNumber === "number" ? raw.assessmentSource.originalNumber : undefined,
        itemCode: typeof raw.assessmentSource.itemCode === "string" ? raw.assessmentSource.itemCode.trim() : undefined,
      };
    }
  }

  // Medical Evidence
  if (raw.medicalEvidence !== undefined) {
    if (typeof raw.medicalEvidence !== "object" || raw.medicalEvidence === null || Array.isArray(raw.medicalEvidence)) {
      errors.push("'medicalEvidence' must be a structured object.");
    } else {
      sanitized.medicalEvidence = {
        sourceType: raw.medicalEvidence.sourceType,
        title: typeof raw.medicalEvidence.title === "string" ? raw.medicalEvidence.title.trim() : "",
        publisher: typeof raw.medicalEvidence.publisher === "string" ? raw.medicalEvidence.publisher.trim() : "",
        publicationYear: typeof raw.medicalEvidence.publicationYear === "number" ? raw.medicalEvidence.publicationYear : new Date().getFullYear(),
        publicationDate: typeof raw.medicalEvidence.publicationDate === "string" ? raw.medicalEvidence.publicationDate.trim() : undefined,
        url: typeof raw.medicalEvidence.url === "string" ? raw.medicalEvidence.url.trim() : undefined,
        versionStatus: raw.medicalEvidence.versionStatus,
        verificationStatus: raw.medicalEvidence.verificationStatus,
      };
    }
  }

  // Derive contentFingerprint if front and back are available
  if (sanitized.front && sanitized.back) {
    sanitized.contentFingerprint = computeDraftFingerprint(sanitized.front, sanitized.back);
    sanitized.contentFingerprintVersion = 1;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedDraft: sanitized,
  };
}

/**
 * Evaluates structural and technical completeness of a draft for auto-validation.
 * Note: Auto-validation verifies schema, canonical topic existence, and structural completeness;
 * it does NOT evaluate medical clinical truth.
 */
export function performAutoValidationChecks(
  draft: DraftFlashcardPayload
): AutoValidationCheckResult {
  const errors: string[] = [];

  if (!draft.front || !draft.front.trim()) {
    errors.push("Missing required field 'front'.");
  }

  if (!draft.back || !draft.back.trim()) {
    errors.push("Missing required field 'back'.");
  }

  if (!draft.canonicalTopicId || !draft.canonicalTopicId.trim()) {
    errors.push("Missing required field 'canonicalTopicId'.");
  } else {
    const tema = getGrandeTemaById(draft.canonicalTopicId);
    if (!tema) {
      errors.push(`Invalid 'canonicalTopicId': "${draft.canonicalTopicId}" not found in canonical taxonomy.`);
    }
  }

  if (!draft.cardPurpose || !VALID_CARD_PURPOSES.includes(draft.cardPurpose)) {
    errors.push("Missing or invalid 'cardPurpose'.");
  }

  if (!draft.medicalEvidence || !draft.medicalEvidence.title || !draft.medicalEvidence.publisher) {
    errors.push("Missing or incomplete 'medicalEvidence' reference (title and publisher are required).");
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    errors,
  };
}
