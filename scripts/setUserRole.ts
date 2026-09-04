/**
 * Authoritative Server-Side User Role Management Script (Microetapa 1.27B.1.3).
 * Uses Firebase Admin SDK to safely update UserProfile.role in Cloud Firestore.
 * 
 * Usage:
 *   npx tsx scripts/setUserRole.ts --email="<target-email>" --role="<ADMIN|EDITOR|STUDENT>"
 * 
 * Strict invariants:
 * - NO hardcoded email or UID in source code.
 * - Server-side only (Firebase Admin SDK).
 * - Fails if Auth user or Firestore profile is not found.
 * - Preserves tier, plan, trial, and all other user fields unmodified.
 */

import { getAdminAuth, getAdminDb, resolveFirebaseProjectId } from "../server/firebaseAdmin";
import { ServerUserRole } from "../server/auth/types";

export const ALLOWED_ROLES: ServerUserRole[] = ["ADMIN", "EDITOR", "STUDENT"];

export interface SetUserRoleParams {
  email: string;
  role: string;
  dryRun?: boolean;
}

export interface SetUserRoleResult {
  success: boolean;
  uid: string;
  email: string;
  roleBefore: string;
  roleAfter: string;
  tierBefore: string;
  tierAfter: string;
  planBefore: string;
  planAfter: string;
  error?: string;
  errorCode?: string;
}

export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? `${name.substring(0, 2)}***` : `${name}***`;
  return `${maskedName}@${domain}`;
}

export function maskUid(uid: string): string {
  if (uid.length <= 8) return "***";
  return `${uid.substring(0, 6)}...${uid.substring(uid.length - 4)}`;
}

export async function executeSetUserRole(params: SetUserRoleParams): Promise<SetUserRoleResult> {
  const { email, role, dryRun = false } = params;

  if (!email || typeof email !== "string" || !email.trim()) {
    return {
      success: false,
      uid: "",
      email: "",
      roleBefore: "",
      roleAfter: "",
      tierBefore: "",
      tierAfter: "",
      planBefore: "",
      planAfter: "",
      errorCode: "INVALID_EMAIL",
      error: "Parameter 'email' is mandatory and cannot be empty.",
    };
  }

  const normalizedRole = role ? (role.trim().toUpperCase() as ServerUserRole) : ("" as ServerUserRole);

  if (!ALLOWED_ROLES.includes(normalizedRole)) {
    return {
      success: false,
      uid: "",
      email,
      roleBefore: "",
      roleAfter: "",
      tierBefore: "",
      tierAfter: "",
      planBefore: "",
      planAfter: "",
      errorCode: "INVALID_ROLE",
      error: `Parameter 'role' must be one of: [${ALLOWED_ROLES.join(", ")}]. Got: '${role}'`,
    };
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  // 1. Locate Auth User
  let authUser;
  try {
    authUser = await adminAuth.getUserByEmail(email.trim());
  } catch (error: any) {
    if (error?.code === "auth/user-not-found") {
      return {
        success: false,
        uid: "",
        email,
        roleBefore: "",
        roleAfter: "",
        tierBefore: "",
        tierAfter: "",
        planBefore: "",
        planAfter: "",
        errorCode: "AUTH_USER_NOT_FOUND",
        error: `No Firebase Auth user exists with email ${maskEmail(email)}.`,
      };
    }
    return {
      success: false,
      uid: "",
      email,
      roleBefore: "",
      roleAfter: "",
      tierBefore: "",
      tierAfter: "",
      planBefore: "",
      planAfter: "",
      errorCode: "AUTH_QUERY_FAILED",
      error: `Failed to query Firebase Auth: ${error?.message || error}`,
    };
  }

  const uid = authUser.uid;

  // 2. Locate Firestore Profile
  const userDocRef = adminDb.collection("users").doc(uid);
  const docSnap = await userDocRef.get();

  if (!docSnap.exists) {
    return {
      success: false,
      uid,
      email,
      roleBefore: "",
      roleAfter: "",
      tierBefore: "",
      tierAfter: "",
      planBefore: "",
      planAfter: "",
      errorCode: "USER_PROFILE_NOT_FOUND",
      error: `Document users/${maskUid(uid)} does not exist in Firestore. Script will not auto-create profiles.`,
    };
  }

  const currentData = docSnap.data() || {};
  const roleBefore = (currentData.role as string) || "STUDENT";
  const tierBefore = currentData.tier || "TRIAL";
  const planBefore = currentData.plan || "trial";
  const profileEmail = currentData.email || "";

  // 3. Verify Email Match
  if (profileEmail && profileEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return {
      success: false,
      uid,
      email,
      roleBefore,
      roleAfter: roleBefore,
      tierBefore,
      tierAfter: tierBefore,
      planBefore,
      planAfter: planBefore,
      errorCode: "PROFILE_EMAIL_MISMATCH",
      error: `Profile email (${maskEmail(profileEmail)}) does not match requested email (${maskEmail(email)}).`,
    };
  }

  if (dryRun) {
    return {
      success: true,
      uid,
      email,
      roleBefore,
      roleAfter: normalizedRole,
      tierBefore,
      tierAfter: tierBefore,
      planBefore,
      planAfter: planBefore,
    };
  }

  // 4. Update ONLY the role field
  await userDocRef.update({
    role: normalizedRole,
    updatedAt: new Date().toISOString(),
  });

  // 5. Re-read and verify
  const reloadedSnap = await userDocRef.get();
  if (!reloadedSnap.exists) {
    return {
      success: false,
      uid,
      email,
      roleBefore,
      roleAfter: "",
      tierBefore,
      tierAfter: "",
      planBefore,
      planAfter: "",
      errorCode: "DOC_NOT_FOUND_AFTER_WRITE",
      error: "Document not found in Firestore after write.",
    };
  }

  const updatedData = reloadedSnap.data() || {};
  const roleAfter = (updatedData.role as string) || "";
  const tierAfter = updatedData.tier || "TRIAL";
  const planAfter = updatedData.plan || "trial";

  return {
    success: roleAfter === normalizedRole,
    uid,
    email,
    roleBefore,
    roleAfter,
    tierBefore,
    tierAfter,
    planBefore,
    planAfter,
  };
}

function parseCliArgs(): { email?: string; role?: string; dryRun?: boolean } {
  const args = process.argv.slice(2);
  const parsed: { email?: string; role?: string; dryRun?: boolean } = {};

  for (const arg of args) {
    if (arg.startsWith("--email=")) {
      parsed.email = arg.split("=")[1]?.trim();
    } else if (arg.startsWith("--role=")) {
      parsed.role = arg.split("=")[1]?.trim().toUpperCase();
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    }
  }

  return parsed;
}

// Auto-run if executed directly via CLI
if (process.argv[1] && process.argv[1].includes("setUserRole")) {
  const { email, role, dryRun } = parseCliArgs();

  console.log("============================================================");
  console.log("AUTHORITATIVE USER ROLE MANAGEMENT — FIREBASE ADMIN SDK");
  console.log("============================================================");

  const projectId = resolveFirebaseProjectId();
  console.log(`Target Firebase Project: ${projectId}`);

  if (!email || !role) {
    console.error("ERROR: Missing required arguments.");
    console.error("Usage: npx tsx scripts/setUserRole.ts --email=\"<email>\" --role=\"ADMIN\"");
    process.exit(1);
  }

  executeSetUserRole({ email, role, dryRun })
    .then((result) => {
      if (!result.success) {
        console.error(`\n[ERROR] ${result.errorCode}: ${result.error}`);
        process.exit(1);
      }

      console.log(`\nUser:          ${maskEmail(result.email)}`);
      console.log(`Target:        users/${maskUid(result.uid)}`);
      console.log(`Previous Role: ${result.roleBefore}`);
      console.log(`New Role:      ${result.roleAfter}`);
      console.log(`Tier Unchanged: ${result.tierBefore === result.tierAfter ? "YES" : "NO"} (${result.tierAfter})`);
      console.log(`Plan Unchanged: ${result.planBefore === result.planAfter ? "YES" : "NO"} (${result.planAfter})`);
      console.log("\n============================================================");
      console.log("PROVISIONING COMPLETED SUCCESSFULLY");
      console.log("============================================================");
    })
    .catch((err) => {
      console.error("FATAL ERROR:", err);
      process.exit(1);
    });
}
