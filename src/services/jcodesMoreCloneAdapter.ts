/**
 * StaziaMed Isolated Clone Engine Adapter (Etapa 1.27D).
 * Connects the frontend Design Studio to the isolated server-side Playwright runner via
 * the authenticated admin endpoint /api/admin/design/clone-analysis.
 */

import {
  CloneEngineAdapter,
  CloneAnalysisRequest,
  CloneAnalysisResult,
  CloneEngineError,
} from "../types/cloneEngine";
import { validateCloneUrl } from "./cloneEngineService";
import { auth } from "../lib/firebase";

export class JCodesMoreCloneEngineAdapter implements CloneEngineAdapter {
  readonly isConnected: boolean = true;
  readonly engineName: string = "StaziaMed Isolated Playwright Clone Runner (Etapa 1.27D)";

  private endpoint: string;

  constructor(endpoint: string = "/api/admin/design/clone-analysis") {
    this.endpoint = endpoint;
  }

  /**
   * Analyzes the requested URL by performing client-side validation first,
   * then invoking the secure server-side isolated browser runner.
   */
  async analyze(request: CloneAnalysisRequest): Promise<CloneAnalysisResult> {
    // 1. Client-Side Pre-Validation (Protocol & SSRF basic checks)
    const validation = validateCloneUrl(request.url);
    if (!validation.isValid) {
      const error: CloneEngineError = {
        code: validation.error || "INVALID_URL",
        message: validation.message || "URL inválida ou não permitida.",
      };
      return {
        success: false,
        request,
        error,
      };
    }

    // 2. Rights Type validation
    if (!request.rightsType) {
      const error: CloneEngineError = {
        code: "RIGHTS_TYPE_REQUIRED",
        message: "O tipo de direitos de uso da referência é obrigatório.",
      };
      return {
        success: false,
        request,
        error,
      };
    }

    try {
      // 3. Acquire Firebase ID token if authenticated
      let token: string | undefined;
      if (auth && auth.currentUser) {
        try {
          token = await auth.currentUser.getIdToken();
        } catch {
          // fallback without token if in mock/test
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: request.url,
          rightsType: request.rightsType,
          analysisMode: request.analysisMode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          request,
          error: {
            code: (data.error?.code as any) || "EXTRACTION_FAILED",
            message: data.error?.message || `Erro HTTP ${response.status} ao analisar referência.`,
            details: data.error?.details,
          },
        };
      }

      return {
        success: true,
        request,
        rawExtraction: data.rawExtraction,
        sanitizedExtraction: data.sanitizedExtraction,
        blueprint: data.blueprint,
      };
    } catch (networkError: any) {
      return {
        success: false,
        request,
        error: {
          code: "CLONE_ENGINE_UNAVAILABLE",
          message: `Falha na conexão com o runner isolado: ${networkError?.message || "Servidor indisponível"}`,
          details: { error: String(networkError) },
        },
      };
    }
  }
}

// Export singleton instance for UI usage
export const defaultCloneEngineAdapter = new JCodesMoreCloneEngineAdapter();
