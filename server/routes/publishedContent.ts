/**
 * Published Content Router (Student & Authenticated Users Consumption).
 * Protected with authenticateFirebaseRequest (any authenticated user can read).
 * Resolves current PUBLISHED content version for study.
 */

import { Router, Request, Response } from "express";
import { authenticateFirebaseRequest } from "../auth/authMiddleware";
import { ServerContentPublicationService } from "../services/serverContentPublicationService";

export const publishedContentRouter = Router();

// Enforce authentication for student content reading
publishedContentRouter.use(authenticateFirebaseRequest);

/**
 * GET /api/published-content/:canonicalTopicId/current
 * Resolves current published version for student/authenticated consumption.
 * Only returns content with publicationStatus === "PUBLISHED".
 */
publishedContentRouter.get("/:canonicalTopicId/current", async (req: Request, res: Response) => {
  try {
    const { canonicalTopicId } = req.params;
    const header = await ServerContentPublicationService.getTopicHeader(canonicalTopicId);

    if (!header || header.publicationStatus !== "PUBLISHED" || !header.currentVersionId) {
      return res.status(404).json({
        status: "NOT_PUBLISHED",
        message: "No published version available for this canonical topic.",
      });
    }

    const version = await ServerContentPublicationService.getVersionSnapshot(
      canonicalTopicId,
      header.currentVersionId
    );

    if (!version) {
      return res.status(500).json({
        status: "ERROR",
        message: "Current version snapshot missing or corrupted.",
      });
    }

    return res.json({
      header,
      version,
    });
  } catch (err: any) {
    console.error("[Published Content API Error]:", err);
    return res.status(500).json({
      status: "ERROR",
      message: err?.message || "Failed to resolve published topic content.",
    });
  }
});
