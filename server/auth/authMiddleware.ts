import { Request, Response, NextFunction } from "express";
import { getAdminAuth, getAdminDb } from "../firebaseAdmin";
import {
  AuthenticatedUser,
  ServerPrincipal,
  ServerUserRole,
  ServerUserTier,
  AuthErrorCode,
  AuthErrorResponse,
} from "./types";

export const USER_PROFILES_COLLECTION = "users";

function sendAuthError(
  res: Response,
  statusCode: number,
  code: AuthErrorCode,
  message: string
): void {
  const payload: AuthErrorResponse = {
    error: {
      code,
      message,
    },
  };
  res.status(statusCode).json(payload);
}

/**
 * Middleware: Authenticates incoming HTTP request via Firebase ID Token in Authorization header.
 * Enforces checkRevoked = true for high security on privileged operations.
 * Never logs raw auth tokens.
 */
export async function authenticateFirebaseRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== "string") {
    sendAuthError(
      res,
      401,
      "AUTH_MISSING_TOKEN",
      "Missing Authorization header. Expected Bearer token."
    );
    return;
  }

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1].trim()) {
    sendAuthError(
      res,
      401,
      "AUTH_INVALID_TOKEN",
      "Malformed Authorization header. Format must be 'Bearer <token>'."
    );
    return;
  }

  const token = parts[1].trim();

  try {
    const adminAuth = getAdminAuth();
    // verifyIdToken with checkRevoked = true guarantees revoked sessions are rejected
    const decodedToken = await adminAuth.verifyIdToken(token, true);

    if (!decodedToken || !decodedToken.uid) {
      sendAuthError(
        res,
        401,
        "AUTH_INVALID_TOKEN",
        "Invalid or expired Firebase ID token."
      );
      return;
    }

    const authContext: AuthenticatedUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      token,
    };

    req.auth = authContext;
    next();
  } catch (error: any) {
    if (error?.code === "auth/id-token-revoked") {
      sendAuthError(
        res,
        401,
        "AUTH_REVOKED_TOKEN",
        "Firebase ID token has been revoked. Please re-authenticate."
      );
      return;
    }

    sendAuthError(
      res,
      401,
      "AUTH_INVALID_TOKEN",
      "Authentication failed. Token is invalid or expired."
    );
  }
}

/**
 * Normalizes UserProfile role server-side
 */
export function normalizeServerRole(rawRole?: unknown): ServerUserRole {
  if (typeof rawRole === "string") {
    const upper = rawRole.toUpperCase().trim();
    if (upper === "ADMIN") return "ADMIN";
    if (upper === "EDITOR") return "EDITOR";
  }
  return "STUDENT";
}

/**
 * Normalizes UserProfile tier server-side
 */
export function normalizeServerTier(rawTier?: unknown): ServerUserTier {
  if (typeof rawTier === "string") {
    const upper = rawTier.toUpperCase().trim();
    if (upper === "ADMIN") return "ADMIN";
    if (upper === "PRO_PLUS" || upper === "PRO+") return "PRO_PLUS";
    if (upper === "PRO") return "PRO";
    if (upper === "EXPIRED") return "EXPIRED";
    if (upper === "FREE") return "FREE";
  }
  return "TRIAL";
}

/**
 * Middleware Factory: Enforces server-side authorization by reading UserProfile directly from Firestore.
 * Ignores any role/tier sent in request body, query, or custom headers.
 */
export function requireServerCapability(allowedRoles: ServerUserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth || !req.auth.uid) {
      sendAuthError(
        res,
        401,
        "AUTH_MISSING_TOKEN",
        "User is not authenticated. authenticateFirebaseRequest must run before authorization checks."
      );
      return;
    }

    const uid = req.auth.uid;

    try {
      const adminDb = getAdminDb();
      const userDocRef = adminDb.collection(USER_PROFILES_COLLECTION).doc(uid);
      const userSnap = await userDocRef.get();

      if (!userSnap.exists) {
        sendAuthError(
          res,
          403,
          "AUTH_PROFILE_NOT_FOUND",
          "User profile not found in server database. Access denied."
        );
        return;
      }

      const userData = userSnap.data() || {};

      if (userData.disabled === true) {
        sendAuthError(
          res,
          403,
          "AUTH_USER_DISABLED",
          "User account has been disabled by administrators."
        );
        return;
      }

      const role = normalizeServerRole(userData.role);
      const tier = normalizeServerTier(userData.tier);

      const principal: ServerPrincipal = {
        uid,
        email: req.auth.email || userData.email,
        role,
        tier,
        name: userData.name,
        disabled: false,
      };

      req.principal = principal;

      if (!allowedRoles.includes(role)) {
        sendAuthError(
          res,
          403,
          "AUTH_FORBIDDEN",
          `Insufficient privileges. Required role: [${allowedRoles.join(", ")}], user role: ${role}.`
        );
        return;
      }

      next();
    } catch (error: any) {
      console.error(`[ServerAuth] Error loading profile for ${uid}:`, error);
      sendAuthError(
        res,
        500,
        "AUTHZ_BACKEND_UNAVAILABLE",
        "Serviço de autorização indisponível. Erro ao consultar o banco de dados."
      );
    }
  };
}

/**
 * Convenience Middleware: Enforces that the user has a specific role (e.g. ADMIN)
 */
export function requireServerRole(role: ServerUserRole) {
  return requireServerCapability([role]);
}
