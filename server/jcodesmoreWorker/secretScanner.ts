/**
 * JCodesMore Secret Scanner (1.27G.2).
 * Strictly inspects generated artifact bundles, specifications, research files,
 * and code previews to guarantee zero accidental persistence or leaking of
 * session tokens, personal cookies, API keys, passwords, or credentials.
 */

import { JCodesMoreRawArtifactBundle } from "../../src/types/jcodesmoreWorker";

export interface SecretScanResult {
  passed: boolean;
  violations: string[];
}

const SUSPICIOUS_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Bearer Token", pattern: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i },
  { name: "JWT Token", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/ },
  { name: "Generic API Key / Secret", pattern: /(api[_-]?key|secret[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i },
  { name: "Private SSH / RSA Key", pattern: /-----BEGIN\s+(RSA|OPENSSH|DSA|EC)?\s*PRIVATE KEY-----/ },
  { name: "Cookie Session Header", pattern: /(connect\.sid|PHPSESSID|JSESSIONID|session_token|auth_token)=[^;\s]+/i },
  { name: "User Password in Plaintext", pattern: /password\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { name: "Firebase Admin Service Account Private Key", pattern: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY/ },
];

export class JCodesMoreSecretScanner {
  /**
   * Scans a single string content for secret patterns.
   */
  static scanString(content: string, contextLabel: string = "content"): SecretScanResult {
    const violations: string[] = [];
    if (!content || typeof content !== "string") {
      return { passed: true, violations: [] };
    }

    for (const { name, pattern } of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`[SECRET_VIOLATION] Padrão sensível detectado (${name}) em: ${contextLabel}`);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Scans an entire JCodesMoreRawArtifactBundle for violations.
   */
  static scanBundle(bundle: JCodesMoreRawArtifactBundle): SecretScanResult {
    const violations: string[] = [];

    // 1. Scan research specs
    if (bundle.researchSpecs.topologyJson) {
      const res = this.scanString(bundle.researchSpecs.topologyJson, "researchSpecs.topologyJson");
      if (!res.passed) violations.push(...res.violations);
    }
    if (bundle.researchSpecs.tokensJson) {
      const res = this.scanString(bundle.researchSpecs.tokensJson, "researchSpecs.tokensJson");
      if (!res.passed) violations.push(...res.violations);
    }
    if (bundle.researchSpecs.researchReportJson) {
      const res = this.scanString(bundle.researchSpecs.researchReportJson, "researchSpecs.researchReportJson");
      if (!res.passed) violations.push(...res.violations);
    }
    if (bundle.researchSpecs.componentSpecs) {
      for (const spec of bundle.researchSpecs.componentSpecs) {
        const res = this.scanString(spec.content, `componentSpec[${spec.name}]`);
        if (!res.passed) violations.push(...res.violations);
      }
    }

    // 2. Scan generated code files
    if (bundle.generatedCodeFiles) {
      for (const file of bundle.generatedCodeFiles) {
        // Disallow .env or credential filenames
        const lower = file.relativePath.toLowerCase();
        if (lower.includes(".env") || lower.includes("credentials") || lower.includes("id_rsa") || lower.includes(".pem")) {
          violations.push(`[DISALLOWED_FILE] Arquivo proibido gerado: ${file.relativePath}`);
        }
        if (file.previewContent) {
          const res = this.scanString(file.previewContent, `filePreview[${file.relativePath}]`);
          if (!res.passed) violations.push(...res.violations);
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}
