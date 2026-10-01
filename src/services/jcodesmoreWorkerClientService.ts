/**
 * Client Service for JCodesMore Worker Runtime (1.27G.1).
 * Communicates with the authenticated admin backend endpoints.
 */

import { auth } from "../lib/firebase";
import { JCodesMoreWorkerHealth, JCodesMoreCloneJob } from "../types/jcodesmoreWorker";
import { DesignReferenceRightsType } from "../types/adminDesignStudio";

export class JCodesMoreWorkerClientService {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      } catch (err) {
        console.warn("[JCodesMoreClient] Failed to acquire auth token:", err);
      }
    }
    return headers;
  }

  static async fetchWorkerHealth(): Promise<JCodesMoreWorkerHealth | null> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch("/api/admin/design/jcodesmore/health", {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        console.warn("[JCodesMoreClient] Health endpoint returned status", res.status);
        return null;
      }

      const data = await res.json();
      return data.success ? (data.health as JCodesMoreWorkerHealth) : null;
    } catch (err) {
      console.error("[JCodesMoreClient] Error fetching worker health:", err);
      return null;
    }
  }

  static async createCloneJob(params: {
    url: string;
    rightsType: DesignReferenceRightsType;
    cloneScope?: "FULL_PAGE" | "COMPONENTS" | "DESIGN_SYSTEM" | "STRUCTURE_LAYOUT";
    sourceReferenceId?: string;
  }): Promise<{ success: boolean; job?: JCodesMoreCloneJob; message?: string; error?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch("/api/admin/design/jcodesmore/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: params.url,
          rightsType: params.rightsType,
          cloneScope: params.cloneScope || "FULL_PAGE",
          sourceReferenceId: params.sourceReferenceId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error?.message || `Erro HTTP ${res.status}`,
        };
      }

      return {
        success: true,
        job: data.job,
        message: data.message,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Falha na requisição: ${err?.message || String(err)}`,
      };
    }
  }

  static async fetchCloneJob(jobId: string): Promise<JCodesMoreCloneJob | null> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch(`/api/admin/design/jcodesmore/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.success ? (data.job as JCodesMoreCloneJob) : null;
    } catch (err) {
      console.error("[JCodesMoreClient] Error fetching job:", err);
      return null;
    }
  }

  static async listJobs(): Promise<JCodesMoreCloneJob[]> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch("/api/admin/design/jcodesmore/jobs", {
        method: "GET",
        headers,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.success && Array.isArray(data.jobs) ? data.jobs : [];
    } catch (err) {
      console.error("[JCodesMoreClient] Error listing jobs:", err);
      return [];
    }
  }

  static async cancelJob(jobId: string): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch(`/api/admin/design/jcodesmore/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error?.message || `Erro HTTP ${res.status}` };
      }
      return { success: true, cancelled: data.cancelled };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  static async signalAuthComplete(jobId: string): Promise<{ success: boolean; signaled?: boolean; message?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch(`/api/admin/design/jcodesmore/jobs/${encodeURIComponent(jobId)}/auth-complete`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      return {
        success: Boolean(data.success),
        signaled: Boolean(data.signaled),
        message: data.message,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || String(err) };
    }
  }
}

