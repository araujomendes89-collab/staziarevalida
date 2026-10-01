/**
 * JCodesMore Template Preparer & Source Pinning (1.27G.1).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { JCODESMORE_CONFIG, JCODESMORE_PINNED_SOURCE } from "./config";
import { ControlledProcessRunner } from "./controlledProcessRunner";

export interface TemplatePreparationResult {
  valid: boolean;
  zipPath: string;
  sha256: string;
  packageVersion: string;
  extractedPath?: string;
  error?: string;
}

export class JCodesMoreTemplatePreparer {
  private zipPath: string;
  private expectedHash: string;

  constructor(
    zipPath: string = JCODESMORE_CONFIG.SOURCE_ZIP,
    expectedHash: string = JCODESMORE_CONFIG.PINNED_SHA256
  ) {
    this.zipPath = zipPath;
    this.expectedHash = expectedHash;
  }

  /**
   * Computes SHA-256 of the source zip file.
   */
  async computeZipHash(): Promise<string> {
    if (!fs.existsSync(this.zipPath)) {
      throw new Error(`[SOURCE_ZIP_NOT_FOUND] Arquivo ZIP não encontrado em: ${this.zipPath}`);
    }
    const hash = crypto.createHash("sha256");
    const fileStream = fs.createReadStream(this.zipPath);
    for await (const chunk of fileStream) {
      hash.update(chunk);
    }
    return hash.digest("hex");
  }

  /**
   * Validates source ZIP integrity and extracts safely to the target directory.
   */
  async prepareWorkerTemplate(targetExtractDir: string): Promise<TemplatePreparationResult> {
    try {
      if (!fs.existsSync(this.zipPath)) {
        return {
          valid: false,
          zipPath: this.zipPath,
          sha256: "",
          packageVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
          error: `Arquivo ZIP do template JCodesMore não encontrado em: ${this.zipPath}`,
        };
      }

      const calculatedHash = await this.computeZipHash();
      if (calculatedHash !== this.expectedHash) {
        return {
          valid: false,
          zipPath: this.zipPath,
          sha256: calculatedHash,
          packageVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
          error: `Hash SHA-256 incompatível. Esperado: ${this.expectedHash.substring(0, 12)}..., Obtido: ${calculatedHash.substring(0, 12)}...`,
        };
      }

      // Safe extraction using ControlledProcessRunner with unzip
      await fs.promises.mkdir(targetExtractDir, { recursive: true });

      const auditResult = await ControlledProcessRunner.run("unzip", [
        "-q",
        "-o",
        this.zipPath,
        "-d",
        targetExtractDir,
      ]);

      if (auditResult.exitCode !== 0) {
        return {
          valid: false,
          zipPath: this.zipPath,
          sha256: calculatedHash,
          packageVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
          error: `Falha na extração segura do ZIP: ${auditResult.stderr || auditResult.stdout}`,
        };
      }

      // Locate root directory within extract
      let templateRoot = targetExtractDir;
      const innerDir = path.join(targetExtractDir, "ai-website-cloner-template-master");
      if (fs.existsSync(innerDir)) {
        templateRoot = innerDir;
      }

      // Verify mandatory files
      const pkgJsonPath = path.join(templateRoot, "package.json");
      const skillPath = path.join(templateRoot, ".claude", "skills", "clone-website", "SKILL.md");

      if (!fs.existsSync(pkgJsonPath) || !fs.existsSync(skillPath)) {
        return {
          valid: false,
          zipPath: this.zipPath,
          sha256: calculatedHash,
          packageVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
          error: "Estrutura do template inválida: package.json ou SKILL.md ausentes.",
        };
      }

      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

      return {
        valid: true,
        zipPath: this.zipPath,
        sha256: calculatedHash,
        packageVersion: pkg.version || JCODESMORE_PINNED_SOURCE.packageVersion,
        extractedPath: templateRoot,
      };
    } catch (err: any) {
      return {
        valid: false,
        zipPath: this.zipPath,
        sha256: "",
        packageVersion: JCODESMORE_PINNED_SOURCE.packageVersion,
        error: `Erro ao preparar template: ${err?.message || String(err)}`,
      };
    }
  }
}
