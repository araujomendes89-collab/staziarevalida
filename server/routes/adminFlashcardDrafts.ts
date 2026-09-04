import { Router, Request, Response } from "express";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../auth/authMiddleware";
import {
  CanonicalDraftService,
  CanonicalDraftServiceError,
} from "../workflow/canonicalDraftService";

export const adminFlashcardDraftsRouter = Router();

// Apply auth + ADMIN role check on all draft and review endpoints
adminFlashcardDraftsRouter.use(authenticateFirebaseRequest);
adminFlashcardDraftsRouter.use(requireServerRole("ADMIN"));

/**
 * POST /api/admin/flashcards/drafts
 * Creates a new private draft workflow.
 */
adminFlashcardDraftsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const principal = req.principal!;
    const draftPayload = req.body?.draft;

    const workflow = await CanonicalDraftService.createDraft(
      principal,
      draftPayload
    );

    res.status(201).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    if (error instanceof CanonicalDraftServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error("[AdminDraftRouter] Failed to create draft:", error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error creating flashcard draft.",
      },
    });
  }
});

/**
 * PATCH /api/admin/flashcards/drafts/:contentId
 * Updates an existing draft workflow with concurrency checking.
 */
adminFlashcardDraftsRouter.patch("/:contentId", async (req: Request, res: Response) => {
  try {
    const principal = req.principal!;
    const contentId = req.params.contentId;
    const expectedRevision = req.body?.expectedDraftRevision;
    const draftUpdates = req.body?.draft;

    if (expectedRevision === undefined || expectedRevision === null) {
      res.status(400).json({
        error: {
          code: "DRAFT_INVALID",
          message: "Missing 'expectedDraftRevision' in request body.",
        },
      });
      return;
    }

    const workflow = await CanonicalDraftService.updateDraft(
      principal,
      contentId,
      expectedRevision,
      draftUpdates
    );

    res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    if (error instanceof CanonicalDraftServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error(`[AdminDraftRouter] Failed to update draft ${req.params.contentId}:`, error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error updating flashcard draft.",
      },
    });
  }
});

/**
 * POST /api/admin/flashcards/drafts/:contentId/auto-validate
 * Executes technical auto-validation on the draft.
 */
adminFlashcardDraftsRouter.post("/:contentId/auto-validate", async (req: Request, res: Response) => {
  try {
    const principal = req.principal!;
    const contentId = req.params.contentId;
    const expectedRevision = req.body?.expectedDraftRevision;

    if (expectedRevision === undefined || expectedRevision === null) {
      res.status(400).json({
        error: {
          code: "DRAFT_INVALID",
          message: "Missing 'expectedDraftRevision' in request body.",
        },
      });
      return;
    }

    const workflow = await CanonicalDraftService.autoValidateDraft(
      principal,
      contentId,
      expectedRevision
    );

    res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    if (error instanceof CanonicalDraftServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error(`[AdminDraftRouter] Failed to auto-validate draft ${req.params.contentId}:`, error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error auto-validating flashcard draft.",
      },
    });
  }
});

/**
 * POST /api/admin/flashcards/drafts/:contentId/medical-review
 * Submits medical clinical review on the draft.
 */
adminFlashcardDraftsRouter.post("/:contentId/medical-review", async (req: Request, res: Response) => {
  try {
    const principal = req.principal!;
    const contentId = req.params.contentId;
    const expectedRevision = req.body?.expectedDraftRevision;
    const result = req.body?.result;
    const primarySourceValidated = req.body?.primarySourceValidated;
    const notes = req.body?.notes;

    if (expectedRevision === undefined || expectedRevision === null) {
      res.status(400).json({
        error: {
          code: "DRAFT_INVALID",
          message: "Missing 'expectedDraftRevision' in request body.",
        },
      });
      return;
    }

    if (!result) {
      res.status(400).json({
        error: {
          code: "REVIEW_INVALID_RESULT",
          message: "Missing 'result' in request body. Must be 'APPROVED' or 'CHANGES_REQUESTED'.",
        },
      });
      return;
    }

    const workflow = await CanonicalDraftService.submitMedicalReview(
      principal,
      contentId,
      expectedRevision,
      result,
      primarySourceValidated,
      notes
    );

    res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    if (error instanceof CanonicalDraftServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error(`[AdminDraftRouter] Failed to submit medical review for ${req.params.contentId}:`, error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error submitting medical review.",
      },
    });
  }
});

/**
 * POST /api/admin/flashcards/drafts/:contentId/editorial-review
 * Submits editorial pedagogical review on the draft.
 */
adminFlashcardDraftsRouter.post("/:contentId/editorial-review", async (req: Request, res: Response) => {
  try {
    const principal = req.principal!;
    const contentId = req.params.contentId;
    const expectedRevision = req.body?.expectedDraftRevision;
    const result = req.body?.result;
    const notes = req.body?.notes;

    if (expectedRevision === undefined || expectedRevision === null) {
      res.status(400).json({
        error: {
          code: "DRAFT_INVALID",
          message: "Missing 'expectedDraftRevision' in request body.",
        },
      });
      return;
    }

    if (!result) {
      res.status(400).json({
        error: {
          code: "REVIEW_INVALID_RESULT",
          message: "Missing 'result' in request body. Must be 'APPROVED' or 'CHANGES_REQUESTED'.",
        },
      });
      return;
    }

    const workflow = await CanonicalDraftService.submitEditorialReview(
      principal,
      contentId,
      expectedRevision,
      result,
      notes
    );

    res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    if (error instanceof CanonicalDraftServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error(`[AdminDraftRouter] Failed to submit editorial review for ${req.params.contentId}:`, error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error submitting editorial review.",
      },
    });
  }
});

/**
 * POST /api/admin/flashcards/drafts/:contentId/ready
 * Validates all review gates and marks the workflow as READY.
 */
adminFlashcardDraftsRouter.post("/:contentId/ready", async (req: Request, res: Response) => {
  try {
    const principal = req.principal!;
    const contentId = req.params.contentId;
    const expectedRevision = req.body?.expectedDraftRevision;

    if (expectedRevision === undefined || expectedRevision === null) {
      res.status(400).json({
        error: {
          code: "DRAFT_INVALID",
          message: "Missing 'expectedDraftRevision' in request body.",
        },
      });
      return;
    }

    const workflow = await CanonicalDraftService.markReady(
      principal,
      contentId,
      expectedRevision
    );

    res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    if (error instanceof CanonicalDraftServiceError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error(`[AdminDraftRouter] Failed to mark draft ${req.params.contentId} as ready:`, error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error marking draft as ready.",
      },
    });
  }
});

/**
 * GET /api/admin/flashcards/drafts/:contentId
 * Retrieves a single draft workflow for administrative editing.
 */
adminFlashcardDraftsRouter.get("/:contentId", async (req: Request, res: Response) => {
  try {
    const contentId = req.params.contentId;
    const workflow = await CanonicalDraftService.getDraftById(contentId);

    if (!workflow) {
      res.status(404).json({
        error: {
          code: "DRAFT_NOT_FOUND",
          message: `Draft workflow "${contentId}" not found.`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    console.error(`[AdminDraftRouter] Failed to get draft ${req.params.contentId}:`, error);
    res.status(500).json({
      error: {
        code: "DRAFT_INTERNAL_ERROR",
        message: "Internal server error reading flashcard draft.",
      },
    });
  }
});
