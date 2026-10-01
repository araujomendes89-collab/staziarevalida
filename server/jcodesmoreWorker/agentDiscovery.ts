/**
 * Agent & Browser MCP Discovery Service (1.27G.1).
 */

import fs from "fs";
import path from "path";
import { ControlledProcessRunner } from "./controlledProcessRunner";
import { JCodesMoreAgentType, JCodesMoreBrowserEngine } from "../../src/types/jcodesmoreWorker";

export interface AgentDiscoveryResult {
  claudeAvailable: boolean;
  claudeVersion?: string;
  codexAvailable: boolean;
  codexVersion?: string;
  geminiAvailable: boolean;
  geminiVersion?: string;
  selectedAgent: JCodesMoreAgentType;
  selectedAgentVersion?: string;
  browserMcpAvailable: boolean;
  browserEngine: JCodesMoreBrowserEngine;
}

export class JCodesMoreAgentDiscovery {
  /**
   * Safe discovery of installed agents without arbitrary command execution.
   */
  static async discover(): Promise<AgentDiscoveryResult> {
    let claudeAvailable = false;
    let claudeVersion: string | undefined;
    let codexAvailable = false;
    let codexVersion: string | undefined;
    let geminiAvailable = false;
    let geminiVersion: string | undefined;

    // 1. Probe Claude Code
    try {
      const claudeRes = await ControlledProcessRunner.run("claude", ["--version"], { timeoutMs: 5000 });
      if (claudeRes.exitCode === 0 && claudeRes.stdout.trim()) {
        claudeAvailable = true;
        claudeVersion = claudeRes.stdout.trim().split("\n")[0];
      }
    } catch {
      // not available
    }

    // 2. Probe Codex CLI
    try {
      const codexRes = await ControlledProcessRunner.run("codex", ["--version"], { timeoutMs: 5000 });
      if (codexRes.exitCode === 0 && codexRes.stdout.trim()) {
        codexAvailable = true;
        codexVersion = codexRes.stdout.trim().split("\n")[0];
      }
    } catch {
      // not available
    }

    // 3. Probe Gemini CLI
    try {
      const geminiRes = await ControlledProcessRunner.run("gemini", ["--version"], { timeoutMs: 5000 });
      if (geminiRes.exitCode === 0 && geminiRes.stdout.trim()) {
        geminiAvailable = true;
        geminiVersion = geminiRes.stdout.trim().split("\n")[0];
      }
    } catch {
      // not available
    }

    // Select agent in priority order
    let selectedAgent: JCodesMoreAgentType = "NONE";
    let selectedAgentVersion: string | undefined;

    if (claudeAvailable) {
      selectedAgent = "CLAUDE_CODE";
      selectedAgentVersion = claudeVersion;
    } else if (codexAvailable) {
      selectedAgent = "CODEX_CLI";
      selectedAgentVersion = codexVersion;
    } else if (geminiAvailable) {
      selectedAgent = "GEMINI_CLI";
      selectedAgentVersion = geminiVersion;
    }

    // 4. Probe Browser MCP / Chrome availability
    let browserMcpAvailable = false;
    let browserEngine: JCodesMoreBrowserEngine = "NONE";

    const chromeAppPath = "/Applications/Google Chrome.app";
    const chromeLinuxPath = "/usr/bin/google-chrome";
    const chromiumPath = "/usr/bin/chromium";

    if (
      fs.existsSync(chromeAppPath) ||
      fs.existsSync(chromeLinuxPath) ||
      fs.existsSync(chromiumPath)
    ) {
      browserMcpAvailable = true;
      browserEngine = "CHROME_MCP";
    }

    return {
      claudeAvailable,
      claudeVersion,
      codexAvailable,
      codexVersion,
      geminiAvailable,
      geminiVersion,
      selectedAgent,
      selectedAgentVersion,
      browserMcpAvailable,
      browserEngine,
    };
  }
}
