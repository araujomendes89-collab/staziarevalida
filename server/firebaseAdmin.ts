import { initializeApp, getApps, App, applicationDefault } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";

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

/**
 * Initializes and returns the canonical Firebase Admin SDK singleton.
 * Uses standard Application Default Credentials (ADC) in Google Cloud and local environments.
 * Single unified instance for both Firebase Auth and Firestore.
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

  adminApp = initializeApp({
    projectId,
    credential: applicationDefault(),
  });

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "staziamed-revalida-prod";
  return getFirestore(getAdminApp(), databaseId);
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
