import { getAdminAuth, getAdminDb } from "../firebaseAdmin";

export interface AdminUserDirectoryEntry {
  uid: string;
  uidMasked: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  providerIds: string[];
  role: "ADMIN" | "EDITOR" | "STUDENT" | "UNRESOLVED";
  tier: string;
  plan: string;
  profileDocumentExists: boolean;
  profileStatus: "READY" | "MISSING";
  privilegeSource: string;
  createdAt?: string;
  lastSignInAt?: string;
  hasCustomAdminClaim: boolean;
  status: "Ativo" | "Desativado";
}

export class AdminUserDirectoryService {
  /**
   * Lists real users from Firebase Auth and merges each record with its Firestore users/{uid} document.
   * Guarantees ONE ROW PER FIREBASE AUTH UID.
   * Pure READ-ONLY operation.
   */
  static async listUsers(
    pageSize = 100,
    pageToken?: string
  ): Promise<{ users: AdminUserDirectoryEntry[]; nextPageToken?: string }> {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const listResult = await adminAuth.listUsers(pageSize, pageToken);
    const authUsers = listResult.users;

    const entries: AdminUserDirectoryEntry[] = [];

    for (const u of authUsers) {
      const uid = u.uid;
      const maskedUid =
        uid.length > 10 ? `${uid.substring(0, 6)}...${uid.substring(uid.length - 4)}` : uid;

      let docData: any = null;
      let profileDocumentExists = false;

      try {
        const userDocSnap = await adminDb.collection("users").doc(uid).get();
        if (userDocSnap.exists) {
          docData = userDocSnap.data();
          profileDocumentExists = true;
        }
      } catch (err) {
        console.warn(`[AdminUserDirectoryService] Error reading Firestore doc for ${maskedUid}:`, err);
      }

      const hasCustomAdminClaim = Boolean(u.customClaims && (u.customClaims as any).admin === true);

      let role: "ADMIN" | "EDITOR" | "STUDENT" | "UNRESOLVED" = "UNRESOLVED";
      let tier = "—";
      let plan = "—";
      let profileStatus: "READY" | "MISSING" = "MISSING";

      if (profileDocumentExists && docData) {
        role = docData.role || "STUDENT";
        tier = docData.tier || "—";
        plan = docData.plan || "—";
        profileStatus = "READY";
      }

      // Compute privilege source for single aggregated row
      let privilegeSource = "Nenhum";
      if (role === "ADMIN" && hasCustomAdminClaim) {
        privilegeSource = "Firestore Server Doc + Claims";
      } else if (role === "ADMIN") {
        privilegeSource = "Firestore Server Doc";
      } else if (hasCustomAdminClaim) {
        privilegeSource = "Custom Claims Only";
      } else if (profileDocumentExists) {
        privilegeSource = "Firestore Server Doc";
      }

      const entry: AdminUserDirectoryEntry = {
        uid,
        uidMasked: maskedUid,
        displayName: u.displayName || docData?.name || "Sem Nome",
        email: u.email || docData?.email || "Sem Email",
        emailVerified: Boolean(u.emailVerified),
        disabled: Boolean(u.disabled),
        providerIds: u.providerData.map((p) => p.providerId),
        role,
        tier,
        plan,
        profileDocumentExists,
        profileStatus,
        privilegeSource,
        createdAt: u.metadata?.creationTime,
        lastSignInAt: u.metadata?.lastSignInTime,
        hasCustomAdminClaim,
        status: u.disabled ? "Desativado" : "Ativo",
      };

      entries.push(entry);
    }

    return {
      users: entries,
      nextPageToken: listResult.pageToken,
    };
  }
}
