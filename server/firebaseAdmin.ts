import { initializeApp, getApps, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { execSync } from "child_process";

let adminApp: App | null = null;

export const DEFAULT_FIREBASE_PROJECT_ID = "staziamed-revalida-prod";

export function resolveFirebaseProjectId(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    process.env.FIREBASE_CONFIG_PROJECT_ID ||
    DEFAULT_FIREBASE_PROJECT_ID
  );
}

function getGcloudAccessToken(): string | null {
  try {
    const token = execSync("gcloud auth print-access-token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Initializes and returns the Firebase Admin SDK singleton.
 * Uses active gcloud access token or Application Default Credentials (ADC).
 */
export function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId = resolveFirebaseProjectId();

  const token = getGcloudAccessToken();
  if (token) {
    adminApp = initializeApp({
      projectId,
      credential: {
        getAccessToken: async () => {
          const liveToken = getGcloudAccessToken() || token;
          return {
            access_token: liveToken,
            expires_in: 3600,
          };
        },
      },
    });
  } else {
    adminApp = initializeApp({
      projectId,
    });
  }

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "staziamed-revalida-prod";
  try {
    return getFirestore(getAdminApp(), databaseId);
  } catch {
    return getFirestore(getAdminApp());
  }
}

/**
 * Helper for test isolation to cleanly reset the admin instance
 */
export async function resetAdminAppForTesting(): Promise<void> {
  if (adminApp) {
    await (adminApp as any).delete?.().catch(() => {});
    adminApp = null;
  }
}
