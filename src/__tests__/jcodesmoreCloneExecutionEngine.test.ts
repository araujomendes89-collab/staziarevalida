import { describe, it, expect, vi, beforeEach } from "vitest";
import { JCodesMoreCloneExecutionEngine } from "../../server/jcodesmoreWorker/cloneExecutionEngine";
import { defaultJobRepository } from "../../server/jcodesmoreWorker/jobRepository";
import { JCodesMoreCloneJob } from "../types/jcodesmoreWorker";
import * as firebaseAdminModule from "../../server/firebaseAdmin";

describe("1.27G.2 — JCodesMore Clone Execution Engine & Lifecycle", () => {
  beforeEach(async () => {
    vi.spyOn(firebaseAdminModule, "getAdminDb").mockReturnValue(null as any);
  });

  it("strictly enforces Rights Gate: rejects PUBLIC_REFERENCE_ONLY and LICENSED without owned authorization", async () => {
    const invalidJob: JCodesMoreCloneJob = {
      id: "job_rights_reject_1",
      requestedUrl: "https://beta.penserevalida.com/checklists",
      rightsType: "PUBLIC_REFERENCE_ONLY",
      cloneScope: "FULL_PAGE",
      requestedBy: "admin-master",
      engine: "JCODESMORE",
      engineVersion: "0.4.0",
      engineSourceHash: "abc",
      agentType: "CLAUDE_CODE",
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    };

    const preflight = await JCodesMoreCloneExecutionEngine.validatePreflight(invalidJob);
    expect(preflight.valid).toBe(false);
    expect(preflight.reason).toContain("[RIGHTS_GATE_REJECTED]");
  });

  it("accepts OWNED or AUTHORIZED rights in preflight", async () => {
    const validJob: JCodesMoreCloneJob = {
      id: "job_rights_pass_1",
      requestedUrl: "https://beta.penserevalida.com/checklists",
      rightsType: "OWNED",
      cloneScope: "FULL_PAGE",
      requestedBy: "admin-master",
      engine: "JCODESMORE",
      engineVersion: "0.4.0",
      engineSourceHash: "abc",
      agentType: "CLAUDE_CODE",
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    };

    const preflight = await JCodesMoreCloneExecutionEngine.validatePreflight(validJob, { skipDnsForTesting: true });
    expect(preflight.valid).toBe(true);
  });


  it("runs full job lifecycle and completes with READY_FOR_IMPORT and PASS secret scan", async () => {
    const jobId = `job_test_exec_${Date.now()}`;
    const testJob: JCodesMoreCloneJob = {
      id: jobId,
      requestedUrl: "https://beta.penserevalida.com/checklists",
      rightsType: "OWNED",
      cloneScope: "FULL_PAGE",
      requestedBy: "admin-master",
      engine: "JCODESMORE",
      engineVersion: "0.4.0",
      engineSourceHash: "a3a90a0cec72bfa7e3947ce372e04c797bfb819bdbae829fbd1111ebfc912303",
      agentType: "CLAUDE_CODE",
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    };

    await defaultJobRepository.createJob(testJob);

    // Run execution with mock browser mode
    await JCodesMoreCloneExecutionEngine.startJob(jobId, {
      headless: true,
      mockBrowserForTesting: true,
    });

    const completedJob = await defaultJobRepository.getJob(jobId);
    expect(completedJob).not.toBeNull();
    expect(completedJob?.status).toBe("READY_FOR_IMPORT");
    expect(completedJob?.artifactsBundle?.secretScanPassed).toBe(true);
    expect(completedJob?.validationStatus).toBe("PENDING_USER_CONFIRMATION");
    expect(completedJob?.similarityScore).toBeGreaterThan(90);
    expect(completedJob?.artifactsBundle?.generatedCodeFiles.length).toBeGreaterThan(0);
  });

  it("supports cancelling an active or queued job", async () => {
    const jobId = `job_test_cancel_${Date.now()}`;
    const testJob: JCodesMoreCloneJob = {
      id: jobId,
      requestedUrl: "https://beta.penserevalida.com/checklists",
      rightsType: "AUTHORIZED",
      cloneScope: "FULL_PAGE",
      requestedBy: "admin-master",
      engine: "JCODESMORE",
      engineVersion: "0.4.0",
      engineSourceHash: "abc",
      agentType: "CLAUDE_CODE",
      status: "WAITING_FOR_USER_AUTH",
      createdAt: new Date().toISOString(),
    };

    await defaultJobRepository.createJob(testJob);

    const cancelled = await JCodesMoreCloneExecutionEngine.cancelJob(jobId);
    expect(cancelled).toBe(true);

    const updatedJob = await defaultJobRepository.getJob(jobId);
    expect(updatedJob?.status).toBe("CANCELLED");
  });
});
