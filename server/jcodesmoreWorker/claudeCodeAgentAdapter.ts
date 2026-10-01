/**
 * Claude Code JCodesMore Agent Adapter (1.27G.1).
 * Encapsulates execution boundaries and contracts for Claude Code within an isolated workspace.
 */

import { JCodesMoreAgentAdapter, JCodesMoreCloneJob } from "../../src/types/jcodesmoreWorker";
import { JCodesMoreAgentDiscovery } from "./agentDiscovery";
import { JCodesMoreTemplatePreparer } from "./templatePreparer";
import { JCodesMoreWorkspaceManager } from "./workspaceManager";

export class ClaudeCodeJCodesMoreAgentAdapter implements JCodesMoreAgentAdapter {
  readonly agentType = "CLAUDE_CODE" as const;

  async healthCheck(): Promise<{ available: boolean; version?: string; error?: string }> {
    const discovery = await JCodesMoreAgentDiscovery.discover();
    if (discovery.claudeAvailable) {
      return {
        available: true,
        version: discovery.claudeVersion,
      };
    }
    return {
      available: false,
      error: "Executável do Claude Code não encontrado no ambiente.",
    };
  }

  async prepare(workspacePath: string): Promise<{ ready: boolean; error?: string }> {
    const preparer = new JCodesMoreTemplatePreparer();
    const res = await preparer.prepareWorkerTemplate(workspacePath);
    return {
      ready: res.valid,
      error: res.error,
    };
  }

  /**
   * Controlled stub for 1.27G.1.
   * Real external clone execution is strictly disabled in this microstep.
   */
  async runClone(job: JCodesMoreCloneJob, _workspacePath: string): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: "NOT_ENABLED_IN_1_27G_1: Execução real de clone será habilitada na etapa 1.27G.2 após validação de runtime.",
    };
  }

  async cancel(jobId: string): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }

  async collectArtifacts(_workspacePath: string): Promise<{ artifactManifestId?: string; files: string[] }> {
    return { files: [] };
  }

  async cleanup(workspacePath: string): Promise<void> {
    const wsManager = new JCodesMoreWorkspaceManager();
    // Path-safe cleanup
  }
}
