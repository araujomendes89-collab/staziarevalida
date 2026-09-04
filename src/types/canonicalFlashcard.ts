import { MedicalArea } from "./index";
import { MedicalAreaId } from "./grandesTemas";
import {
  OfficialSourceType,
  DocumentVersionStatus,
  VerificationStatus,
} from "../services/officialSearchService";

export type CanonicalCardPurpose =
  | "DIAGNOSIS"
  | "MANAGEMENT"
  | "TREATMENT"
  | "DIAGNOSTIC_WORKUP"
  | "CONTRAINDICATION"
  | "RED_FLAG"
  | "EPIDEMIOLOGY_PREVENTION"
  | "MNEMONIC"
  | "OTHER";

export type CanonicalReviewStatus =
  | "UNREVIEWED"
  | "AUTO_VALIDATED"
  | "MEDICAL_REVIEWED";

export type CanonicalEditorialReviewStatus =
  | "PENDING"
  | "EDITORIAL_REVIEWED"
  | "REJECTED";

export type CanonicalPublicationStatus =
  | "DRAFT"
  | "READY"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "ARCHIVED";

export interface AssessmentSourceReference {
  sourceQuestionId?: string;
  sourceCanonicalQuestionId?: string;
  sourceQuestionFingerprint?: string;
  examYear?: number;
  examEdition?: string;
  originalNumber?: number;
  itemCode?: string;
}

export interface MedicalEvidenceReference {
  sourceType?: OfficialSourceType;
  title: string;
  publisher: string;
  publicationYear: number;
  publicationDate?: string;
  url?: string;
  versionStatus?: DocumentVersionStatus;
  verificationStatus?: VerificationStatus;
}

/**
 * Root Document Contract for /flashcardContents/{contentId}
 * Represents the DENORMALIZED_CURRENT_PROJECTION of the active published content.
 */
export interface CanonicalFlashcardContent {
  contentId: string; // Opaque immutable server-generated identifier
  currentRevision: number; // Monotonic integer for published revisions (1, 2, 3...)
  currentSemanticVersion: number; // Monotonic integer incremented on medical semantic changes (1, 2, 3...)

  front: string;
  back: string;
  keyMnemonic?: string;

  canonicalTopicId: string; // Validated against TopicTaxonomy (1 to 75, e.g. "cm-01")
  areaId: MedicalAreaId;
  area: MedicalArea;

  cardPurpose: CanonicalCardPurpose;

  contentFingerprint: string;
  contentFingerprintVersion: number;

  reviewStatus: CanonicalReviewStatus;
  editorialReviewStatus: CanonicalEditorialReviewStatus;
  publicationStatus: CanonicalPublicationStatus;

  assessmentSource?: AssessmentSourceReference;
  medicalEvidence?: MedicalEvidenceReference;

  publishedAt?: string;
  updatedAt: string;
  createdAt: string;

  supersededByContentId?: string;
}

/**
 * Historical Immutable Version Document Contract for /flashcardContents/{contentId}/versions/{versionId}
 */
export interface CanonicalFlashcardVersion {
  versionId: string; // e.g. "rev-1", "rev-2"
  contentId: string;
  revisionNumber: number;
  semanticVersion: number;
  front: string;
  back: string;
  keyMnemonic?: string;
  cardPurpose: CanonicalCardPurpose;
  changeType?: "NON_SEMANTIC" | "MINOR_SEMANTIC" | "MAJOR_SEMANTIC" | "SOURCE_UPDATE" | "CORRECTION";
  changeReason?: string;
  requiresRereview?: boolean;
  publishedAt: string;
  publishedBy?: string;
}
