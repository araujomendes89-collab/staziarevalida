import { describe, it, expect, vi, beforeEach } from "vitest";
import { defaultJobRepository } from "../../server/jcodesmoreWorker/jobRepository";
import { ClaudeCodeJCodesMoreAgentAdapter } from "../../server/jcodesmoreWorker/claudeCodeAgentAdapter";
import { JCodesMoreCloneJob } from "../../src/types/jcodesmoreWorker";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("JCodesMore Job Repository & Execution Contracts (1.27G.1)", () => {
  beforeEach(() => {
    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(null as any);
  });
  it("should create and persist durable clone job metadata", async () => {
    const job: JCodesMoreCloneJob = {
      id: "job_test_001",
      requestedUrl: "https://example.com/medical-dashboard",
      rightsType: "PUBLIC_REFERENCE_ONLY",
      cloneScope: "FULL_PAGE",
      requestedBy: "admin-uid-123",
      engine: "JCODESMORE",
      engineVersion: "0.4.0",
      engineSourceHash: "a3a90a0cec72bfa7e3947ce372e04c797bfb819bdbae829fbd1111ebfc912303",
      agentType: "CLAUDE_CODE",
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    };

    const created = await defaultJobRepository.createJob(job);
    expect(created.id).toBe("job_test_001");
    expect(created.rightsType).toBe("PUBLIC_REFERENCE_ONLY");

    const fetched = await defaultJobRepository.getJob("job_test_001");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe("job_test_001");
    expect(fetched?.status).toBe("QUEUED");
  });

  it("should update job status across controlled lifecycle states", async () => {
    const updated = await defaultJobRepository.updateJobStatus("job_test_001", "PREFLIGHT", {
      startedAt: new Date().toISOString(),
    });
    expect(updated.status).toBe("PREFLIGHT");
    expect(updated.startedAt).toBeDefined();
  });

  it("should enforce NOT_ENABLED_IN_1_27G_1 controlled stub in agent adapter", async () => {
    const adapter = new ClaudeCodeJCodesMoreAgentAdapter();
    const job = (await defaultJobRepository.getJob("job_test_001"))!;
    const res = await adapter.runClone(job, "/tmp/dummy");
    expect(res.success).toBe(false);
    expect(res.error).toContain("NOT_ENABLED_IN_1_27G_1");
  });
});
