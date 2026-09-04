import {
  CanonicalFlashcardContent,
  CanonicalCardPurpose,
  CanonicalPublicationStatus,
  CanonicalReviewStatus,
  CanonicalEditorialReviewStatus,
} from "../types/canonicalFlashcard";
import { getGrandeTemaById } from "../data/grandesTemas";
import { AREA_ID_TO_MEDICAL_AREA } from "./topicTaxonomyService";
import { MedicalArea } from "../types";
import { MedicalAreaId } from "../types/grandesTemas";

export const VALID_CARD_PURPOSES: CanonicalCardPurpose[] = [
  "DIAGNOSIS",
  "MANAGEMENT",
  "TREATMENT",
  "DIAGNOSTIC_WORKUP",
  "CONTRAINDICATION",
  "RED_FLAG",
  "EPIDEMIOLOGY_PREVENTION",
  "MNEMONIC",
  "OTHER",
];

export const VALID_REVIEW_STATUSES: CanonicalReviewStatus[] = [
  "UNREVIEWED",
  "AUTO_VALIDATED",
  "MEDICAL_REVIEWED",
];

export const VALID_EDITORIAL_STATUSES: CanonicalEditorialReviewStatus[] = [
  "PENDING",
  "EDITORIAL_REVIEWED",
  "REJECTED",
];

export const VALID_PUBLICATION_STATUSES: CanonicalPublicationStatus[] = [
  "DRAFT",
  "READY",
  "PUBLISHED",
  "SUPERSEDED",
  "ARCHIVED",
];

export interface CanonicalFlashcardValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: CanonicalFlashcardContent;
}

/**
 * Validates a Firestore raw document or object against the CanonicalFlashcardContent contract.
 * Does NOT perform silent data mutations or auto-repairs on Firestore.
 */
export function validateCanonicalFlashcardDocument(
  data: unknown,
  fallbackId?: string
): CanonicalFlashcardValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["Document payload must be a non-null object"] };
  }

  const raw = data as Record<string, any>;
  const contentId = typeof raw.contentId === "string" && raw.contentId.trim()
    ? raw.contentId.trim()
    : (fallbackId && fallbackId.trim() ? fallbackId.trim() : "");

  if (!contentId) {
    errors.push("Missing or invalid 'contentId'");
  }

  if (typeof raw.front !== "string" || !raw.front.trim()) {
    errors.push("Missing or invalid 'front'");
  }

  if (typeof raw.back !== "string" || !raw.back.trim()) {
    errors.push("Missing or invalid 'back'");
  }

  const canonicalTopicId = typeof raw.canonicalTopicId === "string" ? raw.canonicalTopicId.trim() : "";
  if (!canonicalTopicId) {
    errors.push("Missing 'canonicalTopicId'");
  } else {
    const tema = getGrandeTemaById(canonicalTopicId);
    if (!tema) {
      errors.push(`Invalid 'canonicalTopicId': "${canonicalTopicId}" not found in canonical taxonomy`);
    }
  }

  const cardPurpose: CanonicalCardPurpose = VALID_CARD_PURPOSES.includes(raw.cardPurpose)
    ? raw.cardPurpose
    : "OTHER";

  if (raw.cardPurpose && !VALID_CARD_PURPOSES.includes(raw.cardPurpose)) {
    errors.push(`Unknown 'cardPurpose': "${raw.cardPurpose}"`);
  }

  const reviewStatus: CanonicalReviewStatus = VALID_REVIEW_STATUSES.includes(raw.reviewStatus)
    ? raw.reviewStatus
    : "UNREVIEWED";

  const editorialReviewStatus: CanonicalEditorialReviewStatus = VALID_EDITORIAL_STATUSES.includes(raw.editorialReviewStatus)
    ? raw.editorialReviewStatus
    : "PENDING";

  const publicationStatus: CanonicalPublicationStatus = VALID_PUBLICATION_STATUSES.includes(raw.publicationStatus)
    ? raw.publicationStatus
    : "DRAFT";

  if (!raw.publicationStatus || !VALID_PUBLICATION_STATUSES.includes(raw.publicationStatus)) {
    errors.push(`Invalid or missing 'publicationStatus': "${raw.publicationStatus}"`);
  }

  const currentRevision = typeof raw.currentRevision === "number" && Number.isInteger(raw.currentRevision) && raw.currentRevision >= 1
    ? raw.currentRevision
    : 1;

  const currentSemanticVersion = typeof raw.currentSemanticVersion === "number" && Number.isInteger(raw.currentSemanticVersion) && raw.currentSemanticVersion >= 1
    ? raw.currentSemanticVersion
    : 1;

  // Resolve area and areaId from canonical topic or payload
  let areaId: MedicalAreaId = "clinica-medica";
  let area: MedicalArea = "CLINICA_MEDICA";

  if (canonicalTopicId) {
    const tema = getGrandeTemaById(canonicalTopicId);
    if (tema) {
      areaId = tema.areaId;
      area = AREA_ID_TO_MEDICAL_AREA[tema.areaId] || "CLINICA_MEDICA";
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const parsed: CanonicalFlashcardContent = {
    contentId,
    currentRevision,
    currentSemanticVersion,
    front: raw.front.trim(),
    back: raw.back.trim(),
    keyMnemonic: typeof raw.keyMnemonic === "string" && raw.keyMnemonic.trim() ? raw.keyMnemonic.trim() : undefined,
    canonicalTopicId,
    areaId,
    area,
    cardPurpose,
    contentFingerprint: typeof raw.contentFingerprint === "string" ? raw.contentFingerprint : "",
    contentFingerprintVersion: typeof raw.contentFingerprintVersion === "number" ? raw.contentFingerprintVersion : 1,
    reviewStatus,
    editorialReviewStatus,
    publicationStatus,
    assessmentSource: raw.assessmentSource && typeof raw.assessmentSource === "object" ? raw.assessmentSource : undefined,
    medicalEvidence: raw.medicalEvidence && typeof raw.medicalEvidence === "object" ? raw.medicalEvidence : undefined,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    supersededByContentId: typeof raw.supersededByContentId === "string" && raw.supersededByContentId.trim() ? raw.supersededByContentId.trim() : undefined,
  };

  return { valid: true, errors: [], parsed };
}

/**
 * Pure parser helper. Returns a clean CanonicalFlashcardContent if valid, or null if malformed.
 */
export function parseCanonicalFlashcard(
  data: unknown,
  fallbackId?: string
): CanonicalFlashcardContent | null {
  const res = validateCanonicalFlashcardDocument(data, fallbackId);
  return res.valid && res.parsed ? res.parsed : null;
}
