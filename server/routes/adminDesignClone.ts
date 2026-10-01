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

/**
 * GET /api/admin/design/jcodesmore/health
 * Returns sanitized health metadata for JCodesMore isolated worker runtime.
 */
adminDesignCloneRouter.get(
  "/jcodesmore/health",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const { JCodesMoreHealthService } = await import("../jcodesmoreWorker/healthService");
      const health = await JCodesMoreHealthService.checkHealth();
      res.json({
        success: true,
        health,
      });
    } catch (error: any) {
      console.error("[JCodesMoreHealth Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "WORKER_HEALTH_CHECK_FAILED",
          message: error?.message || "Falha ao verificar integridade do worker JCodesMore.",
        },
      });
    }
  }
);

/**
 * GET /api/admin/design/jcodesmore/jobs
 * Lists recent JCodesMore clone jobs.
 */
adminDesignCloneRouter.get(
  "/jcodesmore/jobs",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const { defaultJobRepository } = await import("../jcodesmoreWorker/jobRepository");
      const jobs = await defaultJobRepository.listJobs(50);
      res.json({
        success: true,
        jobs,
      });
    } catch (error: any) {
      console.error("[JCodesMoreListJobs Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "JOBS_FETCH_FAILED",
          message: error?.message || "Falha ao listar jobs JCodesMore.",
        },
      });
    }
  }
);

/**
 * POST /api/admin/design/jcodesmore/jobs
 * Creates, queues and triggers a new JCodesMore clone job.
 */
adminDesignCloneRouter.post(
  "/jcodesmore/jobs",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, rightsType = "PUBLIC_REFERENCE_ONLY", cloneScope = "FULL_PAGE", sourceReferenceId } = req.body;

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

      // Rights Gate verification
      if (rightsType !== "OWNED" && rightsType !== "AUTHORIZED") {
        res.status(403).json({
          success: false,
          error: {
            code: "RIGHTS_GATE_REJECTED",
            message: "Clone de alta fidelidade via JCodesMore requer direitos explicitamente selecionados como OWNED ou AUTHORIZED.",
          },
        });
        return;
      }

      const { JCodesMoreHealthService } = await import("../jcodesmoreWorker/healthService");
      const health = await JCodesMoreHealthService.checkHealth();

      const { defaultJobRepository } = await import("../jcodesmoreWorker/jobRepository");
      const { JCODESMORE_PINNED_SOURCE } = await import("../jcodesmoreWorker/config");

      const jobId = `job_jcm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const requestedBy = req.principal?.uid || "admin-system";

      const newJob = await defaultJobRepository.createJob({
        id: jobId,
        sourceReferenceId,
        requestedUrl: url.trim(),
        rightsType,
        cloneScope,
        requestedBy,
        engine: "JCODESMORE",
        engineVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
        engineSourceHash: JCODESMORE_PINNED_SOURCE.zipSha256,
        agentType: health.agentType,
        status: health.workerReady ? "QUEUED" : "BLOCKED",
        createdAt: new Date().toISOString(),
      });

      if (health.workerReady) {
        const { JCodesMoreCloneExecutionEngine } = await import("../jcodesmoreWorker/cloneExecutionEngine");
        // Start background execution asynchronously
        JCodesMoreCloneExecutionEngine.startJob(jobId, { headless: true }).catch((err) => {
          console.error(`[AdminDesignClone] Error running job ${jobId}:`, err);
        });
      }

      res.status(201).json({
        success: true,
        job: newJob,
        message: health.workerReady
          ? "Job JCodesMore iniciado com sucesso em ambiente isolado."
          : "Job registrado em estado BLOCKED (dependências do worker ausentes).",
      });
    } catch (error: any) {
      console.error("[JCodesMoreCreateJob Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "JOB_CREATION_FAILED",
          message: error?.message || "Falha ao criar job JCodesMore.",
        },
      });
    }
  }
);

/**
 * GET /api/admin/design/jcodesmore/jobs/:jobId
 * Retrieves current status of a JCodesMore clone job.
 */
adminDesignCloneRouter.get(
  "/jcodesmore/jobs/:jobId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { defaultJobRepository } = await import("../jcodesmoreWorker/jobRepository");
      const job = await defaultJobRepository.getJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: {
            code: "JOB_NOT_FOUND",
            message: `Job '${jobId}' não encontrado.`,
          },
        });
        return;
      }

      res.json({
        success: true,
        job,
      });
    } catch (error: any) {
      console.error("[JCodesMoreGetJob Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "JOB_FETCH_FAILED",
          message: error?.message || "Falha ao consultar job JCodesMore.",
        },
      });
    }
  }
);

/**
 * POST /api/admin/design/jcodesmore/jobs/:jobId/cancel
 * Cancels a running or queued JCodesMore clone job.
 */
adminDesignCloneRouter.post(
  "/jcodesmore/jobs/:jobId/cancel",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { JCodesMoreCloneExecutionEngine } = await import("../jcodesmoreWorker/cloneExecutionEngine");
      const cancelled = await JCodesMoreCloneExecutionEngine.cancelJob(jobId);

      res.json({
        success: true,
        cancelled,
        message: cancelled ? "Job cancelado com sucesso." : "Job não pôde ser cancelado ou já concluído.",
      });
    } catch (error: any) {
      console.error("[JCodesMoreCancelJob Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "JOB_CANCEL_FAILED",
          message: error?.message || "Falha ao cancelar job JCodesMore.",
        },
      });
    }
  }
);

/**
 * POST /api/admin/design/jcodesmore/jobs/:jobId/auth-complete
 * Signals that the admin finished manual authentication in the visible browser.
 */
adminDesignCloneRouter.post(
  "/jcodesmore/jobs/:jobId/auth-complete",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { JCodesMoreCloneExecutionEngine } = await import("../jcodesmoreWorker/cloneExecutionEngine");
      const signaled = JCodesMoreCloneExecutionEngine.signalAuthComplete(jobId);

      res.json({
        success: true,
        signaled,
        message: signaled
          ? "Sinal de autenticação manual recebido. Retomando o processo de clone."
          : "Nenhum job aguardando sinal de autenticação manual.",
      });
    } catch (error: any) {
      console.error("[JCodesMoreAuthComplete Error]:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "AUTH_SIGNAL_FAILED",
          message: error?.message || "Falha ao processar sinal de autenticação.",
        },
      });
    }
  }
);

