import { describe, it, expect, vi } from "vitest";
import { JCodesMoreWorkerClientService } from "../services/jcodesmoreWorkerClientService";

describe("1.27G.2 — JCodesMore Auth Handoff & Client Actions", () => {
  it("signals manual auth completion successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        signaled: true,
        message: "Sinal de autenticação manual recebido.",
      }),
    } as any);

    const res = await JCodesMoreWorkerClientService.signalAuthComplete("job_test_123");
    expect(res.success).toBe(true);
    expect(res.signaled).toBe(true);
  });

  it("cancels a job via client service", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        cancelled: true,
      }),
    } as any);

    const res = await JCodesMoreWorkerClientService.cancelJob("job_test_123");
    expect(res.success).toBe(true);
    expect(res.cancelled).toBe(true);
  });

  it("lists jobs via client service", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [
          {
            id: "job_1",
            status: "READY_FOR_IMPORT",
            requestedUrl: "https://beta.penserevalida.com/checklists",
          },
        ],
      }),
    } as any);

    const jobs = await JCodesMoreWorkerClientService.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("job_1");
  });
});
