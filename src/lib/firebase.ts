import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  QueryConstraint,
  getDocFromServer,
  Firestore,
  DocumentData,
  SetOptions,
} from "firebase/firestore";
import {
  getAuth,
  Auth,
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  reload,
  Unsubscribe,
} from "firebase/auth";
import { getDatabase, Database } from "firebase/database";

import firebaseConfigJson from "../../firebase-applet-config.json";

// Target Database ID & Region Constants
const metaEnv = (typeof import.meta !== "undefined" && import.meta.env
  ? import.meta.env
  : {}) as Record<string, string | undefined>;

export const FIRESTORE_DATABASE_ID =
  metaEnv.VITE_FIREBASE_DATABASE_ID ||
  (firebaseConfigJson as any).firestoreDatabaseId ||
  "staziamed-revalida-prod";

export const FIRESTORE_REGION = "southamerica-east1";

// Resolve Firebase configuration
export const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
  firestoreDatabaseId: FIRESTORE_DATABASE_ID,
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore targeting the specific database ID in southamerica-east1 with ignoreUndefinedProperties
export const db: Firestore = (() => {
  const dbId = FIRESTORE_DATABASE_ID || "(default)";
  try {
    return initializeFirestore(
      app,
      {
        ignoreUndefinedProperties: true,
      },
      dbId
    );
  } catch {
    return getFirestore(app, dbId);
  }
})();

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Initialize Firebase Realtime Database (RTDB) safely with fallback
export const rtdb: Database | null = (() => {
  try {
    const rtdbUrl =
      metaEnv.VITE_FIREBASE_DATABASE_URL ||
      (firebaseConfigJson as any).databaseURL ||
      `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;
    return getDatabase(app, rtdbUrl);
  } catch {
    return null;
  }
})();



// ---------------------------------------------------------------------------
// Standardized Firestore Error Handling & Data Operations Utilities
// ---------------------------------------------------------------------------
export enum FirestoreOperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: FirestoreOperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: FirestoreOperationType,
  path: string | null
): never {
  const currentAuth = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.uid,
      email: currentAuth?.email,
      emailVerified: currentAuth?.emailVerified,
      isAnonymous: currentAuth?.isAnonymous,
      tenantId: currentAuth?.tenantId,
      providerInfo:
        currentAuth?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("[Firestore Error]", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Connection probe to verify network reachability to Firestore
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "_health_check", "connection"));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("[Firestore] Offline mode active or local persistence fallback.");
      return false;
    }
    // Any other response confirms network reachability to the endpoint
    return true;
  }
}

/**
 * Generic data operation: Get a single document
 */
export async function getDocument<T = DocumentData>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as T;
  } catch (error) {
    handleFirestoreError(error, FirestoreOperationType.GET, path);
  }
}

/**
 * Generic data operation: Set/merge a document
 */
export async function setDocument<T extends DocumentData>(
  collectionName: string,
  docId: string,
  data: T,
  options: SetOptions = { merge: true }
): Promise<void> {
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, data, options);
  } catch (error) {
    handleFirestoreError(error, FirestoreOperationType.WRITE, path);
  }
}

/**
 * Generic data operation: Update specific fields of an existing document
 */
export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  docId: string,
  data: Partial<T>
): Promise<void> {
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, data as DocumentData);
  } catch (error) {
    handleFirestoreError(error, FirestoreOperationType.UPDATE, path);
  }
}

/**
 * Generic data operation: Delete a document
 */
export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, FirestoreOperationType.DELETE, path);
  }
}

/**
 * Generic data operation: Query a collection with constraints
 */
export async function queryDocuments<T = DocumentData>(
  collectionName: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  } catch (error) {
    handleFirestoreError(error, FirestoreOperationType.LIST, collectionName);
  }
}

// ---------------------------------------------------------------------------
// Firebase Authentication Utilities & Session Helpers
// ---------------------------------------------------------------------------

export type { User as FirebaseUser };

/**
 * Listen to real-time auth state changes
 */
export function subscribeToAuthState(
  callback: (user: User | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

/**
 * Sign in using Google OAuth Popup
 */
export async function signInWithGooglePopup(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("[FirebaseAuth] Google Sign-In Error:", error);
    throw error;
  }
}

/**
 * Sign in anonymously for instant guest sessions
 */
export async function signInAnonymouslyUser(): Promise<User> {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error("[FirebaseAuth] Anonymous Sign-In Error:", error);
    throw error;
  }
}

/**
 * Sign in with Email and Password
 */
export async function loginWithEmail(
  email: string,
  pass: string
): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
    console.error("[FirebaseAuth] Email Login Error:", error);
    throw error;
  }
}

/**
 * Register new user with Email and Password & Send Verification Email
 */
export async function registerWithEmail(
  email: string,
  pass: string,
  displayName?: string
): Promise<User> {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    if (displayName && result.user) {
      await updateProfile(result.user, { displayName });
    }
    // Auto-send verification email for email/password sign-up
    try {
      if (result.user) {
        await sendEmailVerification(result.user);
        console.log(`[FirebaseAuth] Verification email sent to ${email}`);
      }
    } catch (verifErr) {
      console.warn("[FirebaseAuth] Could not send initial verification email:", verifErr);
    }
    return result.user;
  } catch (error) {
    console.error("[FirebaseAuth] Email Registration Error:", error);
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch {
      // ignore
    }
    throw error;
  }
}

/**
 * Resend Email Verification to currently logged in user
 */
export async function sendUserEmailVerification(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Nenhum usuário logado no momento.");
  }
  await sendEmailVerification(currentUser);
  console.log(`[FirebaseAuth] Resent verification email to ${currentUser.email}`);
}

/**
 * Reload currently authenticated user state from Firebase
 */
export async function reloadCurrentUser(): Promise<User | null> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    await reload(currentUser);
    return auth.currentUser;
  }
  return null;
}

/**
 * Send Password Reset Email
 */
export async function resetPasswordWithEmail(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("[FirebaseAuth] Password Reset Error:", error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function signOutCurrentUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("[FirebaseAuth] Sign-Out Error:", error);
    throw error;
  }
}


