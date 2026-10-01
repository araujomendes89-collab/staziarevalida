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

export interface AdminUserDirectoryResponse {
  success: boolean;
  users: AdminUserDirectoryEntry[];
  nextPageToken?: string;
  totalCount: number;
}
