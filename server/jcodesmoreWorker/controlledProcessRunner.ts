/**
 * Controlled Process Runner with Dedicated Home, Working Directory Boundary & Secret Leak Protection (1.27G.1.1).
 */

import { execFile, ExecFileOptions } from "child_process";
import path from "path";
import { JCODESMORE_CONFIG } from "./config";

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ControlledRunOptions {
  cwd?: string;
  dedicatedHome?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export class ControlledProcessRunner {
  /**
   * Constructs an explicitly isolated environment without leaking user home or sensitive secrets.
   */
  static buildSanitizedEnv(options: { dedicatedHome?: string; customEnv?: Record<string, string> } = {}): NodeJS.ProcessEnv {
    const sanitized: NodeJS.ProcessEnv = {};

    // 1. Inherit only strictly allowlisted variables
    for (const key of JCODESMORE_CONFIG.ENV_ALLOWLIST) {
      if (process.env[key] !== undefined) {
        sanitized[key] = process.env[key];
      }
    }

    // 2. Add npm global bin paths to PATH
    if (sanitized.PATH && !sanitized.PATH.includes(".npm-global")) {
      const realHome = process.env.HOME || "";
      if (realHome) {
        sanitized.PATH = `${realHome}/.npm-global/bin:${sanitized.PATH}`;
      }
    }

    // 3. Set controlled DEDICATED WORKER HOME (never real user HOME)
    if (options.dedicatedHome) {
      sanitized.HOME = path.resolve(options.dedicatedHome);
    } else {
      sanitized.HOME = path.join(JCODESMORE_CONFIG.WORKSPACE_ROOT, "default-home");
    }

    // 4. Controlled USER and SHELL
    sanitized.USER = "stazia-worker";
    sanitized.SHELL = "/bin/sh";

    // 5. Merge custom variables only if not matching any blocked secret prefix
    if (options.customEnv) {
      for (const [k, v] of Object.entries(options.customEnv)) {
        const isBlocked = (JCODESMORE_CONFIG.BLOCKED_ENV_PREFIXES as readonly string[]).some((prefix) =>
          k.toUpperCase().startsWith(prefix)
        );
        if (!isBlocked && (JCODESMORE_CONFIG.ENV_ALLOWLIST as readonly string[]).includes(k as any)) {
          sanitized[k] = v;
        }
      }
    }

    // 6. Enforce zero leak of sensitive credentials
    for (const key of Object.keys(sanitized)) {
      const isBlocked = (JCODESMORE_CONFIG.BLOCKED_ENV_PREFIXES as readonly string[]).some((prefix) =>
        key.toUpperCase().startsWith(prefix)
      );
      if (isBlocked) {
        delete sanitized[key];
      }
    }

    return sanitized;
  }

  private static isBinaryAllowlisted(binary: string): boolean {
    if (!binary || typeof binary !== "string") return false;
    const baseName = path.basename(binary.trim());
    return (JCODESMORE_CONFIG.ALLOWLISTED_BINARIES as readonly string[]).includes(baseName as any);
  }

  /**
   * Validates that cwd is strictly isolated and does not point to StaziaMed root or real user root.
   */
  private static validateWorkingDirectory(cwd?: string): string {
    if (!cwd) {
      return path.join(JCODESMORE_CONFIG.WORKSPACE_ROOT, "sandbox");
    }
    const resolvedCwd = path.resolve(cwd);
    const staziaRoot = path.resolve(JCODESMORE_CONFIG.STAZIAMED_PROJECT_ROOT);
    const userRealHome = process.env.HOME ? path.resolve(process.env.HOME) : "";

    // Reject execution inside StaziaMed source root
    if (resolvedCwd === staziaRoot || resolvedCwd.startsWith(staziaRoot + path.sep)) {
      throw new Error(
        `[SANDBOX_BOUNDARY_VIOLATION] O worker não pode executar dentro do repositório StaziaMed: "${resolvedCwd}"`
      );
    }

    // Reject execution directly in user home root
    if (userRealHome && resolvedCwd === userRealHome) {
      throw new Error(
        `[SANDBOX_BOUNDARY_VIOLATION] O worker não pode executar diretamente no HOME do usuário: "${resolvedCwd}"`
      );
    }

    return resolvedCwd;
  }

  /**
   * Executes an allowlisted binary within an isolated sandbox.
   */
  static run(
    binary: string,
    args: string[] = [],
    options: ControlledRunOptions = {}
  ): Promise<ProcessRunResult> {
    return new Promise((resolve, reject) => {
      // 1. Validate Binary Allowlist
      if (!this.isBinaryAllowlisted(binary)) {
        return reject(
          new Error(
            `[COMMAND_INJECTION_BLOCKED] Executável "${binary}" não permitido. Permitidos: ${JCODESMORE_CONFIG.ALLOWLISTED_BINARIES.join(", ")}`
          )
        );
      }

      // 2. Reject Shell Injection Chars in Binary Name
      if (/[;&|`><\n\r]/.test(binary)) {
        return reject(new Error(`[COMMAND_INJECTION_BLOCKED] Caracteres de injeção de shell detectados no executável.`));
      }

      // 3. Validate Working Directory Boundary (unless probe without cwd)
      let safeCwd: string | undefined;
      try {
        if (options.cwd) {
          safeCwd = this.validateWorkingDirectory(options.cwd);
        }
      } catch (err) {
        return reject(err);
      }

      const execOptions: ExecFileOptions = {
        cwd: safeCwd,
        env: this.buildSanitizedEnv({ dedicatedHome: options.dedicatedHome, customEnv: options.env }),
        timeout: options.timeoutMs || JCODESMORE_CONFIG.JOB_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      };

      execFile(binary, args, execOptions, (error, stdout, stderr) => {
        const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({
          exitCode,
          stdout: stdout ? stdout.toString() : "",
          stderr: stderr ? stderr.toString() : "",
        });
      });
    });
  }
}
