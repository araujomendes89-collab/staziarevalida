import { Router, Request, Response } from "express";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../auth/authMiddleware";
import { executeIsolatedCloneAnalysis } from "../designClone/playwrightRunner";
import {
  CloneAnalysisRequest,
  CloneAnalysisMode,
} from "../../src/types/cloneEngine";
import { DesignReferenceRightsType } from "../../src/types/adminDesignStudio";

export const adminDesignCloneRouter = Router();

// Enforce Firebase Auth + Server-Side UserProfile ADMIN role check
adminDesignCloneRouter.use(authenticateFirebaseRequest);
adminDesignCloneRouter.use(requireServerRole("ADMIN"));

/**
 * POST /api/admin/design/clone-analysis
 * Executes an isolated browser analysis for a reference URL.
 */
adminDesignCloneRouter.post(
  "/clone-analysis",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        url,
        rightsType = "PUBLIC_REFERENCE_ONLY",
        analysisMode = "LAYOUT_STRUCTURE",
        captureScreenshots = false,
        allowLocalTestHosts = false,
      } = req.body;

      if (!url || typeof url !== "string" || !url.trim()) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_URL",
            message: "Parâmetro 'url' é obrigatório.",
          },
        });
        return;
      }

      const validRights: DesignReferenceRightsType[] = [
        "OWNED",
        "LICENSED",
        "AUTHORIZED",
        "PUBLIC_REFERENCE_ONLY",
      ];

      const resolvedRightsType: DesignReferenceRightsType = validRights.includes(rightsType)
        ? rightsType
        : "PUBLIC_REFERENCE_ONLY";

      const validModes: CloneAnalysisMode[] = [
        "FULL_PAGE",
        "COMPONENTS",
        "DESIGN_SYSTEM",
        "STRUCTURE_LAYOUT",
      ];

      const resolvedAnalysisMode: CloneAnalysisMode = validModes.includes(analysisMode)
        ? analysisMode
        : "STRUCTURE_LAYOUT";

      const requestId = `req_clone_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const requestedBy = req.principal?.uid || "admin-system";

      const cloneRequest: CloneAnalysisRequest = {
        requestId,
        url: url.trim(),
        rightsType: resolvedRightsType,
        analysisMode: resolvedAnalysisMode,
        requestedBy,
        requestedAt: new Date().toISOString(),
      };

      const result = await executeIsolatedCloneAnalysis(cloneRequest, {
        captureScreenshots: Boolean(captureScreenshots),
        allowLocalTestHosts: Boolean(allowLocalTestHosts),
      });

      if (!result.success) {
        const statusCode = result.error?.code === "SSRF_VALIDATION_FAILED" ? 400 : 422;
        res.status(statusCode).json(result);
        return;
      }

      res.json(result);
    } catch (error: any) {
      console.error("[AdminDesignClone Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_CLONE_RUNNER_ERROR",
          message: error?.message || "Erro interno ao executar análise isolada de design.",
        },
      });
    }
  }
);
