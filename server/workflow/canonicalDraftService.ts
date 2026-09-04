import crypto from "crypto";
import { getAdminDb } from "../firebaseAdmin";
import {
  CanonicalFlashcardWorkflow,
  DraftFlashcardPayload,
  ReviewResult,
  AutoValidationRecord,
  MedicalReviewRecord,
  EditorialReviewRecord,
} from "../../src/types/canonicalWorkflow";
import { ServerPrincipal } from "../auth/types";
import {
  validateAndSanitizeDraftPayload,
  computeDraftFingerprint,
  performAutoValidationChecks,
} from "./draftValidator";

export const WORKFLOW_COLLECTION = "flashcardWorkflows";

export class CanonicalDraftServiceError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "CanonicalDraftServiceError";
  }
}

export class CanonicalDraftService {
  /**
   * Generates an opaque, immutable server-side contentId: c_fc_<32_hex_chars>
   */
  static generateContentId(): string {
    const uuidHex = crypto.randomUUID().replace(/-/g, "");
    return `c_fc_${uuidHex}`;
  }

  /**
   * Creates a brand new private canonical flashcard workflow in DRAFT status.
   * Does NOT touch the public /flashcardContents collection.
   */
  static async createDraft(
    principal: ServerPrincipal,
    rawDraft?: unknown
  ): Promise<CanonicalFlashcardWorkflow> {
    const contentId = this.generateContentId();
    const now = new Date().toISOString();

    const validation = validateAndSanitizeDraftPayload(rawDraft || {});
    if (!validation.valid) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        `Draft validation failed: ${validation.errors.join("; ")}`
      );
    }

    const workflowDoc: CanonicalFlashcardWorkflow = {
      contentId,
      workflowStatus: "DRAFT",
      draftRevision: 1,
      draft: validation.sanitizedDraft,
      createdBy: principal.uid,
      createdAt: now,
      updatedBy: principal.uid,
      updatedAt: now,
    };

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId);

    // .create() enforces that the document does not already exist
    await docRef.create(workflowDoc);

    return workflowDoc;
  }

  /**
   * Updates an existing working draft with optimistic concurrency control.
   * Runs inside a Firestore transaction to prevent lost updates.
   * Modifying content increments draftRevision, which automatically invalidates prior revision review gates.
   */
  static async updateDraft(
    principal: ServerPrincipal,
    contentId: string,
    expectedDraftRevision: number,
    rawDraftUpdates: unknown
  ): Promise<CanonicalFlashcardWorkflow> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        "Missing or invalid contentId parameter."
      );
    }

    if (typeof expectedDraftRevision !== "number" || !Number.isInteger(expectedDraftRevision)) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        "expectedDraftRevision must be an integer."
      );
    }

    const validation = validateAndSanitizeDraftPayload(rawDraftUpdates || {});
    if (!validation.valid) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        `Draft updates validation failed: ${validation.errors.join("; ")}`
      );
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId.trim());

    return await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        throw new CanonicalDraftServiceError(
          "DRAFT_NOT_FOUND",
          404,
          `Draft workflow with contentId "${contentId}" not found.`
        );
      }

      const existing = snap.data() as CanonicalFlashcardWorkflow;

      if (existing.workflowStatus !== "DRAFT") {
        throw new CanonicalDraftServiceError(
          "DRAFT_NOT_EDITABLE",
          400,
          `Workflow is not in editable DRAFT status. Current status: ${existing.workflowStatus}.`
        );
      }

      if (existing.draftRevision !== expectedDraftRevision) {
        throw new CanonicalDraftServiceError(
          "DRAFT_REVISION_CONFLICT",
          409,
          `Stale update conflict. Stored draftRevision is ${existing.draftRevision}, but expected ${expectedDraftRevision}.`
        );
      }

      const mergedDraft: DraftFlashcardPayload = {
        ...existing.draft,
        ...validation.sanitizedDraft,
      };

      if (mergedDraft.front && mergedDraft.back) {
        mergedDraft.contentFingerprint = computeDraftFingerprint(
          mergedDraft.front,
          mergedDraft.back
        );
        mergedDraft.contentFingerprintVersion = 1;
      }

      const nextRevision = existing.draftRevision + 1;
      const now = new Date().toISOString();

      const updatedWorkflow: CanonicalFlashcardWorkflow = {
        contentId: existing.contentId,
        workflowStatus: "DRAFT",
        draftRevision: nextRevision,
        draft: mergedDraft,
        // Prior gate reviews remain historical with their old reviewedDraftRevision (< nextRevision)
        autoValidation: existing.autoValidation,
        medicalReview: existing.medicalReview,
        editorialReview: existing.editorialReview,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedBy: principal.uid,
        updatedAt: now,
      };

      transaction.set(docRef, updatedWorkflow);
      return updatedWorkflow;
    });
  }

  /**
   * Executes technical auto-validation on the current draft revision.
   */
  static async autoValidateDraft(
    principal: ServerPrincipal,
    contentId: string,
    expectedDraftRevision: number
  ): Promise<CanonicalFlashcardWorkflow> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        "Missing or invalid contentId parameter."
      );
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId.trim());

    return await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        throw new CanonicalDraftServiceError(
          "DRAFT_NOT_FOUND",
          404,
          `Draft workflow "${contentId}" not found.`
        );
      }

      const existing = snap.data() as CanonicalFlashcardWorkflow;

      if (existing.workflowStatus !== "DRAFT") {
        throw new CanonicalDraftServiceError(
          "WORKFLOW_NOT_DRAFT",
          400,
          `Workflow is not in DRAFT status. Current status: ${existing.workflowStatus}.`
        );
      }

      if (existing.draftRevision !== expectedDraftRevision) {
        throw new CanonicalDraftServiceError(
          "REVIEW_REVISION_CONFLICT",
          409,
          `Stale revision for auto-validation. Stored draftRevision is ${existing.draftRevision}, but expected ${expectedDraftRevision}.`
        );
      }

      const check = performAutoValidationChecks(existing.draft);
      const now = new Date().toISOString();

      const autoValidationRecord: AutoValidationRecord = {
        status: check.status,
        validatedDraftRevision: existing.draftRevision,
        validatedAt: now,
        validationVersion: 1,
        errors: check.errors.length > 0 ? check.errors : undefined,
      };

      const updatedWorkflow: CanonicalFlashcardWorkflow = {
        ...existing,
        autoValidation: autoValidationRecord,
        updatedBy: principal.uid,
        updatedAt: now,
      };

      transaction.set(docRef, updatedWorkflow);
      return updatedWorkflow;
    });
  }

  /**
   * Submits a medical clinical review on the current draft revision.
   */
  static async submitMedicalReview(
    principal: ServerPrincipal,
    contentId: string,
    expectedDraftRevision: number,
    result: ReviewResult,
    primarySourceValidated: boolean,
    notes?: string
  ): Promise<CanonicalFlashcardWorkflow> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        "Missing or invalid contentId parameter."
      );
    }

    if (result !== "APPROVED" && result !== "CHANGES_REQUESTED") {
      throw new CanonicalDraftServiceError(
        "REVIEW_INVALID_RESULT",
        400,
        "result must be 'APPROVED' or 'CHANGES_REQUESTED'."
      );
    }

    if (result === "CHANGES_REQUESTED" && (!notes || !notes.trim())) {
      throw new CanonicalDraftServiceError(
        "REVIEW_INVALID_RESULT",
        400,
        "Review notes are required when requesting clinical changes."
      );
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId.trim());

    return await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        throw new CanonicalDraftServiceError(
          "DRAFT_NOT_FOUND",
          404,
          `Draft workflow "${contentId}" not found.`
        );
      }

      const existing = snap.data() as CanonicalFlashcardWorkflow;

      if (existing.workflowStatus !== "DRAFT") {
        throw new CanonicalDraftServiceError(
          "WORKFLOW_NOT_DRAFT",
          400,
          `Workflow is not in DRAFT status. Current status: ${existing.workflowStatus}.`
        );
      }

      if (existing.draftRevision !== expectedDraftRevision) {
        throw new CanonicalDraftServiceError(
          "REVIEW_REVISION_CONFLICT",
          409,
          `Stale revision for medical review. Stored draftRevision is ${existing.draftRevision}, but expected ${expectedDraftRevision}.`
        );
      }

      const now = new Date().toISOString();

      const medicalReviewRecord: MedicalReviewRecord = {
        result,
        reviewedDraftRevision: existing.draftRevision,
        reviewedBy: principal.uid,
        reviewedAt: now,
        primarySourceValidated: !!primarySourceValidated,
        notes: notes?.trim() || undefined,
      };

      const updatedWorkflow: CanonicalFlashcardWorkflow = {
        ...existing,
        medicalReview: medicalReviewRecord,
        updatedBy: principal.uid,
        updatedAt: now,
      };

      transaction.set(docRef, updatedWorkflow);
      return updatedWorkflow;
    });
  }

  /**
   * Submits an editorial/pedagogical review on the current draft revision.
   */
  static async submitEditorialReview(
    principal: ServerPrincipal,
    contentId: string,
    expectedDraftRevision: number,
    result: ReviewResult,
    notes?: string
  ): Promise<CanonicalFlashcardWorkflow> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        "Missing or invalid contentId parameter."
      );
    }

    if (result !== "APPROVED" && result !== "CHANGES_REQUESTED") {
      throw new CanonicalDraftServiceError(
        "REVIEW_INVALID_RESULT",
        400,
        "result must be 'APPROVED' or 'CHANGES_REQUESTED'."
      );
    }

    if (result === "CHANGES_REQUESTED" && (!notes || !notes.trim())) {
      throw new CanonicalDraftServiceError(
        "REVIEW_INVALID_RESULT",
        400,
        "Review notes are required when requesting editorial changes."
      );
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId.trim());

    return await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        throw new CanonicalDraftServiceError(
          "DRAFT_NOT_FOUND",
          404,
          `Draft workflow "${contentId}" not found.`
        );
      }

      const existing = snap.data() as CanonicalFlashcardWorkflow;

      if (existing.workflowStatus !== "DRAFT") {
        throw new CanonicalDraftServiceError(
          "WORKFLOW_NOT_DRAFT",
          400,
          `Workflow is not in DRAFT status. Current status: ${existing.workflowStatus}.`
        );
      }

      if (existing.draftRevision !== expectedDraftRevision) {
        throw new CanonicalDraftServiceError(
          "REVIEW_REVISION_CONFLICT",
          409,
          `Stale revision for editorial review. Stored draftRevision is ${existing.draftRevision}, but expected ${expectedDraftRevision}.`
        );
      }

      const now = new Date().toISOString();

      const editorialReviewRecord: EditorialReviewRecord = {
        result,
        reviewedDraftRevision: existing.draftRevision,
        reviewedBy: principal.uid,
        reviewedAt: now,
        notes: notes?.trim() || undefined,
      };

      const updatedWorkflow: CanonicalFlashcardWorkflow = {
        ...existing,
        editorialReview: editorialReviewRecord,
        updatedBy: principal.uid,
        updatedAt: now,
      };

      transaction.set(docRef, updatedWorkflow);
      return updatedWorkflow;
    });
  }

  /**
   * Evaluates all review gates and marks workflow as READY for future publication.
   * Does NOT write to /flashcardContents (zero public writes).
   */
  static async markReady(
    principal: ServerPrincipal,
    contentId: string,
    expectedDraftRevision: number
  ): Promise<CanonicalFlashcardWorkflow> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      throw new CanonicalDraftServiceError(
        "DRAFT_INVALID",
        400,
        "Missing or invalid contentId parameter."
      );
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId.trim());

    return await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        throw new CanonicalDraftServiceError(
          "DRAFT_NOT_FOUND",
          404,
          `Draft workflow "${contentId}" not found.`
        );
      }

      const existing = snap.data() as CanonicalFlashcardWorkflow;

      if (existing.workflowStatus === "READY") {
        throw new CanonicalDraftServiceError(
          "WORKFLOW_ALREADY_READY",
          400,
          `Workflow "${contentId}" is already marked as READY.`
        );
      }

      if (existing.workflowStatus !== "DRAFT") {
        throw new CanonicalDraftServiceError(
          "WORKFLOW_NOT_DRAFT",
          400,
          `Workflow must be in DRAFT status to transition to READY. Current: ${existing.workflowStatus}.`
        );
      }

      if (existing.draftRevision !== expectedDraftRevision) {
        throw new CanonicalDraftServiceError(
          "REVIEW_REVISION_CONFLICT",
          409,
          `Stale revision for READY transition. Stored draftRevision is ${existing.draftRevision}, but expected ${expectedDraftRevision}.`
        );
      }

      // Gate 1: Auto-Validation must PASS on current revision
      if (
        !existing.autoValidation ||
        existing.autoValidation.status !== "PASS" ||
        existing.autoValidation.validatedDraftRevision !== existing.draftRevision
      ) {
        throw new CanonicalDraftServiceError(
          "AUTO_VALIDATION_FAILED",
          400,
          "Ready transition rejected: Auto-validation has not passed for the current draft revision."
        );
      }

      // Gate 2: Medical Review must be APPROVED on current revision
      if (
        !existing.medicalReview ||
        existing.medicalReview.result !== "APPROVED" ||
        existing.medicalReview.reviewedDraftRevision !== existing.draftRevision
      ) {
        throw new CanonicalDraftServiceError(
          "MEDICAL_REVIEW_REQUIRED",
          400,
          "Ready transition rejected: Medical clinical review has not been approved for the current draft revision."
        );
      }

      // Gate 3: Primary Source must be explicitly confirmed by medical review
      if (!existing.medicalReview.primarySourceValidated) {
        throw new CanonicalDraftServiceError(
          "PRIMARY_SOURCE_REVIEW_REQUIRED",
          400,
          "Ready transition rejected: Primary source clinical evidence has not been validated."
        );
      }

      // Gate 4: Editorial Review must be APPROVED on current revision
      if (
        !existing.editorialReview ||
        existing.editorialReview.result !== "APPROVED" ||
        existing.editorialReview.reviewedDraftRevision !== existing.draftRevision
      ) {
        throw new CanonicalDraftServiceError(
          "EDITORIAL_REVIEW_REQUIRED",
          400,
          "Ready transition rejected: Editorial pedagogical review has not been approved for the current draft revision."
        );
      }

      // Gate 5: Structural requirements check
      if (!existing.draft.front || !existing.draft.back || !existing.draft.canonicalTopicId) {
        throw new CanonicalDraftServiceError(
          "READY_GATES_INCOMPLETE",
          400,
          "Ready transition rejected: Missing mandatory structural content fields."
        );
      }

      const now = new Date().toISOString();

      const readyWorkflow: CanonicalFlashcardWorkflow = {
        ...existing,
        workflowStatus: "READY",
        readyAt: now,
        readyBy: principal.uid,
        updatedBy: principal.uid,
        updatedAt: now,
      };

      transaction.set(docRef, readyWorkflow);
      return readyWorkflow;
    });
  }

  /**
   * Retrieves a single draft workflow by ID.
   */
  static async getDraftById(
    contentId: string
  ): Promise<CanonicalFlashcardWorkflow | null> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      return null;
    }

    const adminDb = getAdminDb();
    const docRef = adminDb.collection(WORKFLOW_COLLECTION).doc(contentId.trim());
    const snap = await docRef.get();

    if (!snap.exists) {
      return null;
    }

    return snap.data() as CanonicalFlashcardWorkflow;
  }
}
