import { Router, Request, Response } from "express";
import {
  authenticateFirebaseRequest,
  requireServerRole,
} from "../auth/authMiddleware";
import { AdminUserDirectoryService } from "../services/adminUserDirectoryService";

export const adminUsersRouter = Router();

adminUsersRouter.use(authenticateFirebaseRequest);
adminUsersRouter.use(requireServerRole("ADMIN"));

/**
 * GET /api/admin/users
 * Returns list of real users from Firebase Auth aggregated with Firestore profile and claims.
 * Enforces authenticated ADMIN role via server verification.
 * Pure READ-ONLY.
 */
adminUsersRouter.get("/", async (req: Request, res: Response) => {
  try {
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 100;
    const pageToken = req.query.pageToken as string | undefined;

    const result = await AdminUserDirectoryService.listUsers(pageSize, pageToken);

    res.json({
      success: true,
      users: result.users,
      nextPageToken: result.nextPageToken,
      totalCount: result.users.length,
    });
  } catch (error: any) {
    console.error("[AdminUsersRouter] Error listing users:", error);
    res.status(500).json({
      error: {
        code: "USER_DIRECTORY_ERROR",
        message: "Erro ao consultar diretório de usuários.",
      },
    });
  }
});
