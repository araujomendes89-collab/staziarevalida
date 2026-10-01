/**
 * Admin Content Publication Router.
 * Protected with authenticateFirebaseRequest + requireServerRole("ADMIN").
 * Strictly administrative endpoints: POST /preflight, POST /publish.
 * Identity of publisher is derived exclusively from authenticated req.principal.uid.
 */

import { Router, Request, Response } from "express";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../auth/authMiddleware";
import { PublicationPreflightService } from "../../src/services/publicationPreflightService";
import { ServerContentPublicationService } from "../services/serverContentPublicationService";
import { StaziaEditorialDocumentDraft } from "../../src/types/medicalEditorial";

export const adminContentPublicationRouter = Router();

// Enforce authenticated ADMIN capability for all admin publication routes
adminContentPublicationRouter.use(authenticateFirebaseRequest);
adminContentPublicationRouter.use(requireServerRole("ADMIN"));

/**
 * 1. POST /api/admin/content/publication/preflight
 * Runs all 6 preflight gates before publication.
 */
adminContentPublicationRouter.post("/preflight", (req: Request, res: Response) => {
  try {
    const { draft, canonicalTopicId } = req.body as {
      draft: StaziaEditorialDocumentDraft;
      canonicalTopicId?: string;
    };

    if (!draft) {
      return res.status(400).json({ error: "Missing editorial draft payload." });
    }

    const report = PublicationPreflightService.runPreflight(draft, canonicalTopicId);
    return res.json(report);
  } catch (err: any) {
    console.error("[AdminPublication Preflight API Error]:", err);
    return res.status(500).json({ error: err?.message || "Internal preflight error." });
  }
});

/**
 * 2. POST /api/admin/content/publication/publish
 * Executes immutable publication with short atomic pointer commit via Firebase Admin SDK.
 * Publisher identity MUST come from authenticated req.principal.uid (ignores any req.body.publishedBy).
 */
adminContentPublicationRouter.post("/publish", async (req: Request, res: Response) => {
  try {
    const { draft, canonicalTopicId } = req.body as {
      draft: StaziaEditorialDocumentDraft;
      canonicalTopicId: string;
    };

    if (!req.principal || !req.principal.uid) {
      return res.status(403).json({
        error: {
          code: "AUTH_FORBIDDEN",
          message: "Acesso negado: principal administrativo não identificado.",
        },
      });
    }

    if (!draft || !canonicalTopicId) {
      return res.status(400).json({
        error: "Missing draft or canonicalTopicId in publish request.",
      });
    }

    // Explicitly enforce server principal UID as the publisher identity
    const publishedBy = req.principal.uid;

    const result = await ServerContentPublicationService.publishEditorialDraft(
      draft,
      canonicalTopicId,
      publishedBy
    );

    if (result.state === "PUBLISHED") {
      return res.json(result);
    } else {
      return res.status(422).json(result);
    }
  } catch (err: any) {
    console.error("[AdminPublication Publish API Error]:", err);
    return res.status(500).json({
      error: err?.message || "Internal publication commit error.",
    });
  }
});
