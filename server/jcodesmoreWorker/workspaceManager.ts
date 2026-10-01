/**
 * JCodesMore Workspace Manager with Dedicated Home, Browser Profile & Path Escape Protection (1.27G.1.1).
 */

import fs from "fs";
import path from "path";
import { JCODESMORE_CONFIG } from "./config";

export interface WorkspacePaths {
  jobId: string;
  workspaceDir: string;
  homeDir: string;
  browserProfileDir: string;
  downloadsDir: string;
  sourceDir: string;
  targetDir: string;
  artifactsDir: string;
  normalizedDir: string;
  logsDir: string;
}

export class JCodesMoreWorkspaceManager {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = JCODESMORE_CONFIG.WORKSPACE_ROOT) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Validates that a jobId is strictly safe and does not escape workspaceRoot.
   */
  validateJobId(jobId: string): string {
    if (!jobId || typeof jobId !== "string") {
      throw new Error("[PATH_ESCAPE_BLOCKED] jobId inválido ou vazio.");
    }
    const cleanId = jobId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
      throw new Error(`[PATH_ESCAPE_BLOCKED] jobId contém caracteres inválidos: "${cleanId}"`);
    }
    const resolvedPath = path.resolve(this.workspaceRoot, cleanId);
    if (!resolvedPath.startsWith(this.workspaceRoot + path.sep)) {
      throw new Error(`[PATH_ESCAPE_BLOCKED] Tentativa de fuga de diretório detectada para jobId: "${cleanId}"`);
    }
    return cleanId;
  }

  /**
   * Initializes an isolated workspace for a given job with dedicated HOME and clean browser profile.
   */
  async createWorkspace(jobId: string): Promise<WorkspacePaths> {
    const safeJobId = this.validateJobId(jobId);
    const workspaceDir = path.join(this.workspaceRoot, safeJobId);

    const homeDir = path.join(workspaceDir, "home");
    const browserProfileDir = path.join(workspaceDir, "browser-profile");
    const downloadsDir = path.join(workspaceDir, "downloads");
    const sourceDir = path.join(workspaceDir, "source");
    const targetDir = path.join(workspaceDir, "target");
    const artifactsDir = path.join(workspaceDir, "artifacts");
    const normalizedDir = path.join(workspaceDir, "normalized");
    const logsDir = path.join(workspaceDir, "logs");

    await fs.promises.mkdir(homeDir, { recursive: true });
    await fs.promises.mkdir(browserProfileDir, { recursive: true });
    await fs.promises.mkdir(downloadsDir, { recursive: true });
    await fs.promises.mkdir(sourceDir, { recursive: true });
    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.mkdir(artifactsDir, { recursive: true });
    await fs.promises.mkdir(normalizedDir, { recursive: true });
    await fs.promises.mkdir(logsDir, { recursive: true });

    return {
      jobId: safeJobId,
      workspaceDir,
      homeDir,
      browserProfileDir,
      downloadsDir,
      sourceDir,
      targetDir,
      artifactsDir,
      normalizedDir,
      logsDir,
    };
  }

  /**
   * Cleans up an isolated workspace, wiping all session data, browser state, and temporary files.
   */
  async cleanupWorkspace(jobId: string): Promise<void> {
    const safeJobId = this.validateJobId(jobId);
    const workspaceDir = path.join(this.workspaceRoot, safeJobId);
    if (fs.existsSync(workspaceDir)) {
      await fs.promises.rm(workspaceDir, { recursive: true, force: true });
    }
  }

  /**
   * Checks if the workspace root is writable.
   */
  isWorkspaceRootWritable(): boolean {
    try {
      if (!fs.existsSync(this.workspaceRoot)) {
        fs.mkdirSync(this.workspaceRoot, { recursive: true });
      }
      const testFile = path.join(this.workspaceRoot, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, "ok");
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }
}
