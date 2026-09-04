import admin from "firebase-admin";

let adminApp: admin.app.App | null = null;

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
 * Initializes and returns the Firebase Admin SDK singleton.
 * Uses Application Default Credentials (ADC) in Google Cloud / Production,
 * or standard emulator environment variables in local/testing environments.
 */
export function getAdminApp(): admin.app.App {
  if (adminApp) {
    return adminApp;
  }

  if (admin.apps.length > 0 && admin.apps[0]) {
    adminApp = admin.apps[0];
    return adminApp;
  }

  const projectId = resolveFirebaseProjectId();

  adminApp = admin.initializeApp({
    projectId,
  });

  return adminApp;
}

export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}

export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

/**
 * Helper for test isolation to cleanly reset the admin instance
 */
export async function resetAdminAppForTesting(): Promise<void> {
  if (adminApp) {
    await adminApp.delete().catch(() => {});
    adminApp = null;
  }
}
