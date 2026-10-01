/**
 * JCodesMore Worker Health Service (1.27G.1).
 */

import fs from "fs";
import { JCODESMORE_CONFIG, JCODESMORE_PINNED_SOURCE } from "./config";
import { JCodesMoreTemplatePreparer } from "./templatePreparer";
import { JCodesMoreAgentDiscovery } from "./agentDiscovery";
import { JCodesMoreWorkspaceManager } from "./workspaceManager";
import { JCodesMoreWorkerHealth } from "../../src/types/jcodesmoreWorker";

export class JCodesMoreHealthService {
  static async checkHealth(): Promise<JCodesMoreWorkerHealth> {
    const missingRequirements: string[] = [];

    // 1. Source ZIP check
    let sourceZipFound = false;
    let sourceHashValid = false;
    const preparer = new JCodesMoreTemplatePreparer();

    if (fs.existsSync(JCODESMORE_CONFIG.SOURCE_ZIP)) {
      sourceZipFound = true;
      try {
        const hash = await preparer.computeZipHash();
        if (hash === JCODESMORE_CONFIG.PINNED_SHA256) {
          sourceHashValid = true;
        } else {
          missingRequirements.push("Hash SHA-256 do arquivo ZIP não confere com o valor pinado");
        }
      } catch {
        missingRequirements.push("Falha ao calcular hash do arquivo ZIP");
      }
    } else {
      missingRequirements.push(`Arquivo ZIP do template não encontrado em: ${JCODESMORE_CONFIG.SOURCE_ZIP}`);
    }

    // 2. Node.js compatibility check (requires Node >= 24)
    const nodeVer = process.version; // e.g. "v24.19.0"
    const majorVer = parseInt(nodeVer.replace(/^v/, "").split(".")[0], 10);
    const nodeRuntimeAvailable = majorVer >= 24;
    if (!nodeRuntimeAvailable) {
      missingRequirements.push(`Node.js atual (${nodeVer}) incompatível. Requer Node >= 24`);
    }

    // 3. Agent & Browser MCP discovery
    const agentDiscovery = await JCodesMoreAgentDiscovery.discover();
    const agentAvailable = agentDiscovery.selectedAgent !== "NONE";
    if (!agentAvailable) {
      missingRequirements.push("Nenhum agente compatível instalado (Claude Code, Codex CLI ou Gemini CLI)");
    }

    const browserMcpAvailable = agentDiscovery.browserMcpAvailable;
    if (!browserMcpAvailable) {
      missingRequirements.push("Navegador / Browser MCP não disponível no sistema");
    }

    // 4. Workspace writability
    const wsManager = new JCodesMoreWorkspaceManager();
    const workspaceWritable = wsManager.isWorkspaceRootWritable();
    if (!workspaceWritable) {
      missingRequirements.push("Diretório de workspace do worker não possui permissão de escrita");
    }

    // 5. Compute overall readiness
    const workerReady =
      sourceZipFound &&
      sourceHashValid &&
      nodeRuntimeAvailable &&
      agentAvailable &&
      browserMcpAvailable &&
      workspaceWritable;

    return {
      configured: true,
      sourceZipFound,
      sourceHashValid,
      packageVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
      nodeRuntimeAvailable,
      nodeVersion: nodeVer,
      agentAvailable,
      agentType: agentDiscovery.selectedAgent,
      agentVersion: agentDiscovery.selectedAgentVersion,
      browserMcpAvailable,
      browserType: agentDiscovery.browserEngine,
      workspaceWritable,
      workerReady,
      checkedAt: new Date().toISOString(),
      missingRequirements: missingRequirements.length > 0 ? missingRequirements : undefined,
    };
  }
}
