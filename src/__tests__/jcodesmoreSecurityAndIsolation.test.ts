import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import { ControlledProcessRunner } from "../../server/jcodesmoreWorker/controlledProcessRunner";
import { JCodesMoreWorkspaceManager } from "../../server/jcodesmoreWorker/workspaceManager";

describe("JCodesMore Security & Isolation Protection (1.27G.1)", () => {
  describe("ControlledProcessRunner", () => {
    it("should block non-allowlisted binary execution", async () => {
      await expect(
        ControlledProcessRunner.run("curl", ["https://example.com"])
      ).rejects.toThrow(/COMMAND_INJECTION_BLOCKED/);
    });

    it("should block shell chaining / injection characters in binary", async () => {
      await expect(
        ControlledProcessRunner.run("node; rm -rf /", [])
      ).rejects.toThrow(/COMMAND_INJECTION_BLOCKED/);
    });

    it("should allow legitimate allowlisted binary execution", async () => {
      const res = await ControlledProcessRunner.run("node", ["-e", "console.log('safe_isolation_ok')"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe("safe_isolation_ok");
    });
  });

  describe("JCodesMoreWorkspaceManager", () => {
    const testRoot = path.join(os.tmpdir(), `jcm_ws_sec_test_${Date.now()}`);
    const wsManager = new JCodesMoreWorkspaceManager(testRoot);

    it("should create isolated workspace for valid alphanumeric jobId", async () => {
      const paths = await wsManager.createWorkspace("job_123_valid");
      expect(paths.workspaceDir).toContain("job_123_valid");
      expect(paths.sourceDir).toContain("source");
      expect(paths.targetDir).toContain("target");
      expect(paths.artifactsDir).toContain("artifacts");
      await wsManager.cleanupWorkspace("job_123_valid");
    });

    it("should block path traversal attempts with ../ in jobId", async () => {
      await expect(
        wsManager.createWorkspace("../../../etc/cron.d/malicious")
      ).rejects.toThrow(/PATH_ESCAPE_BLOCKED/);
    });

    it("should block absolute path escapes in jobId", async () => {
      await expect(
        wsManager.createWorkspace("/tmp/arbitrary_dir")
      ).rejects.toThrow(/PATH_ESCAPE_BLOCKED/);
    });

    it("should block shell special characters in jobId", async () => {
      await expect(
        wsManager.createWorkspace("job;rm -rf /")
      ).rejects.toThrow(/PATH_ESCAPE_BLOCKED/);
    });
  });
});
