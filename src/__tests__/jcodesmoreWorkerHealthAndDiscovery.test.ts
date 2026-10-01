import { describe, it, expect } from "vitest";
import { JCodesMoreHealthService } from "../../server/jcodesmoreWorker/healthService";
import { JCodesMoreAgentDiscovery } from "../../server/jcodesmoreWorker/agentDiscovery";

describe("JCodesMore Worker Health & Discovery (1.27G.1)", () => {
  it("should safely discover available agent without arbitrary execution", async () => {
    const discovery = await JCodesMoreAgentDiscovery.discover();
    expect(discovery).toBeDefined();
    expect(["CLAUDE_CODE", "CODEX_CLI", "GEMINI_CLI", "NONE"]).toContain(discovery.selectedAgent);
    expect(typeof discovery.browserMcpAvailable).toBe("boolean");
  });

  it("should evaluate comprehensive worker health model", async () => {
    const health = await JCodesMoreHealthService.checkHealth();
    expect(health.configured).toBe(true);
    expect(health.sourceZipFound).toBe(true);
    expect(health.sourceHashValid).toBe(true);
    expect(health.packageVersion).toBe("0.4.0");
    expect(typeof health.nodeRuntimeAvailable).toBe("boolean");
    expect(typeof health.agentAvailable).toBe("boolean");
    expect(typeof health.browserMcpAvailable).toBe("boolean");
    expect(typeof health.workspaceWritable).toBe("boolean");
    expect(typeof health.workerReady).toBe("boolean");
  });

  it("should enforce workerReady strictly based on all 5 gates", async () => {
    const health = await JCodesMoreHealthService.checkHealth();
    const expectedReady =
      health.sourceZipFound &&
      health.sourceHashValid &&
      health.nodeRuntimeAvailable &&
      health.agentAvailable &&
      health.browserMcpAvailable &&
      health.workspaceWritable;

    expect(health.workerReady).toBe(expectedReady);
  });
});
