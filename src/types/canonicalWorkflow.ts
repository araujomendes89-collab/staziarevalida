import { MedicalArea } from "./index";
import { MedicalAreaId } from "./grandesTemas";
import {
  CanonicalCardPurpose,
  AssessmentSourceReference,
  MedicalEvidenceReference,
} from "./canonicalFlashcard";

export type CanonicalWorkflowStatus = "DRAFT" | "READY";

export type AutoValidationStatus = "PASS" | "FAIL";
export type ReviewResult = "APPROVED" | "CHANGES_REQUESTED";

export interface AutoValidationRecord {
  status: AutoValidationStatus;
  validatedDraftRevision: number;
  validatedAt: string;
  validationVersion: number;
  errors?: string[];
}

export interface MedicalReviewRecord {
  result: ReviewResult;
  reviewedDraftRevision: number;
  reviewedBy: string;
  reviewedAt: string;
  primarySourceValidated: boolean;
  notes?: string;
}

export interface EditorialReviewRecord {
  result: ReviewResult;
  reviewedDraftRevision: number;
  reviewedBy: string;
  reviewedAt: string;
  notes?: string;
}

export interface DraftFlashcardPayload {
  front?: string;
  back?: string;
  keyMnemonic?: string;
  canonicalTopicId?: string;
  areaId?: MedicalAreaId;
  area?: MedicalArea;
  cardPurpose?: CanonicalCardPurpose;
  assessmentSource?: AssessmentSourceReference;
  medicalEvidence?: MedicalEvidenceReference;
  contentFingerprint?: string;
  contentFingerprintVersion?: number;
}

export interface CanonicalFlashcardWorkflow {
  contentId: string;
  workflowStatus: CanonicalWorkflowStatus;
  draftRevision: number;
  draft: DraftFlashcardPayload;
  autoValidation?: AutoValidationRecord;
  medicalReview?: MedicalReviewRecord;
  editorialReview?: EditorialReviewRecord;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  readyAt?: string;
  readyBy?: string;
}

export interface CreateDraftRequest {
  draft?: DraftFlashcardPayload;
}

export interface UpdateDraftRequest {
  expectedDraftRevision: number;
  draft: DraftFlashcardPayload;
}

export interface AutoValidateDraftRequest {
  expectedDraftRevision: number;
}

export interface MedicalReviewRequest {
  expectedDraftRevision: number;
  result: ReviewResult;
  primarySourceValidated: boolean;
  notes?: string;
}

export interface EditorialReviewRequest {
  expectedDraftRevision: number;
  result: ReviewResult;
  notes?: string;
}

export interface MarkReadyRequest {
  expectedDraftRevision: number;
}
