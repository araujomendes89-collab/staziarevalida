import { auth } from "../lib/firebase";
import { AdminUserDirectoryEntry, AdminUserDirectoryResponse } from "../types/adminUser";

export class AdminUserDirectoryClientService {
  /**
   * Fetches real user directory list from backend /api/admin/users.
   * Requires authenticated Firebase user with ADMIN privileges.
   */
  static async fetchUsers(
    pageSize = 100,
    pageToken?: string
  ): Promise<AdminUserDirectoryResponse> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Usuário não autenticado no Firebase Auth.");
    }

    const token = await currentUser.getIdToken();
    const queryParams = new URLSearchParams();
    queryParams.set("pageSize", String(pageSize));
    if (pageToken) {
      queryParams.set("pageToken", pageToken);
    }

    const response = await fetch(`/api/admin/users?${queryParams.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData?.error?.message ||
        `Erro ${response.status}: Falha ao buscar diretório de usuários.`;
      throw new Error(message);
    }

    const data = await response.json();
    return data as AdminUserDirectoryResponse;
  }
}
