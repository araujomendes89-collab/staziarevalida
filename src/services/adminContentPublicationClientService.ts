/**
 * Admin Content Publication Client Service.
 * Communicates with backend /api/admin/content/publication endpoints
 * using authenticated Firebase ID tokens.
 * Enforces server-authoritative publisher identity (no publishedBy sent in payload).
 */

import { auth } from "../lib/firebase";
import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";
import {
  PublicationJobResult,
  PublicationPreflightReport,
} from "../types/publishedContent";

export class AdminContentPublicationClientService {
  /**
   * Runs all 6 preflight gates on the backend server.
   */
  static async runPreflight(
    draft: StaziaEditorialDocumentDraft,
    canonicalTopicId: string
  ): Promise<PublicationPreflightReport> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Usuário não autenticado no Firebase Auth.");
    }
    const token = await currentUser.getIdToken();

    const response = await fetch("/api/admin/content/publication/preflight", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ draft, canonicalTopicId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.error?.message ||
          errorData?.error ||
          `Erro ${response.status}: Falha no preflight de publicação.`
      );
    }

    return (await response.json()) as PublicationPreflightReport;
  }

  /**
   * Publishes an approved editorial draft via the backend API.
   * Authentication is passed via Bearer ID token in Authorization header.
   * Publisher identity is derived exclusively on the server from the principal.
   */
  static async publishEditorialDraft(
    draft: StaziaEditorialDocumentDraft,
    canonicalTopicId: string
  ): Promise<PublicationJobResult> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Usuário não autenticado no Firebase Auth.");
    }
    const token = await currentUser.getIdToken();

    const response = await fetch("/api/admin/content/publication/publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ draft, canonicalTopicId }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // If 422 Unprocessable Entity, return the structured PublicationJobResult
      if (response.status === 422 && data.state) {
        return data as PublicationJobResult;
      }

      const message =
        data?.error?.message ||
        data?.error ||
        `Erro ${response.status}: Falha na publicação de conteúdo.`;
      throw new Error(message);
    }

    return data as PublicationJobResult;
  }
}
