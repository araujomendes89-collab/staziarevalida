import { Request } from "express";

export type ServerUserRole = "STUDENT" | "EDITOR" | "ADMIN";
export type ServerUserTier = "TRIAL" | "EXPIRED" | "FREE" | "PRO" | "PRO_PLUS" | "ADMIN";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  token: string;
}

export interface ServerPrincipal {
  uid: string;
  email?: string;
  role: ServerUserRole;
  tier: ServerUserTier;
  name?: string;
  disabled?: boolean;
}

export type AuthErrorCode =
  | "AUTH_MISSING_TOKEN"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_REVOKED_TOKEN"
  | "AUTH_PROFILE_NOT_FOUND"
  | "AUTH_USER_DISABLED"
  | "AUTH_FORBIDDEN"
  | "AUTH_INTERNAL_ERROR";

export interface AuthErrorResponse {
  error: {
    code: AuthErrorCode;
    message: string;
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      principal?: ServerPrincipal;
    }
  }
}
