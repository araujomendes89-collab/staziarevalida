/**
 * Pinned Configuration & Sandbox Constants for JCodesMore Isolated Worker (Etapa 1.27G.1.1).
 */

import path from "path";
import os from "os";
import { JCodesMoreWorkerSource } from "../../src/types/jcodesmoreWorker";

export const JCODESMORE_PINNED_SOURCE: JCodesMoreWorkerSource = {
  sourceType: "LOCAL_ZIP",
  zipPath: "/Volumes/PortableSSD/ai-website-cloner-template-master.zip",
  zipSha256: "a3a90a0cec72bfa7e3947ce372e04c797bfb819bdbae829fbd1111ebfc912303",
  packageVersion: "0.4.0",
  framework: "Next.js 16 (App Router)",
  nodeRequirement: ">=24",
  auditedAt: "2026-09-04T19:07:56Z",
};

export const JCODESMORE_CONFIG = {
  SOURCE_ZIP: process.env.JCODESMORE_SOURCE_ZIP || JCODESMORE_PINNED_SOURCE.zipPath,
  PINNED_SHA256: JCODESMORE_PINNED_SOURCE.zipSha256,
  MAX_CONCURRENT_JOBS: 1,
  JOB_TIMEOUT_MS: 300000, // 5 minutes
  WORKSPACE_ROOT: process.env.JCODESMORE_WORKSPACE_ROOT || path.join(os.tmpdir(), "staziamed-jcodesmore-workspaces"),
  ALLOWLISTED_BINARIES: ["claude", "codex", "gemini", "node", "npm", "npx", "git", "unzip"] as const,
  // Strict environment allowlist: excludes HOME, USER, SHELL from un-sanitized inheritance
  ENV_ALLOWLIST: ["NODE_ENV", "PATH", "LANG", "LC_ALL", "TMPDIR"] as const,
  BLOCKED_ENV_PREFIXES: [
    "FIREBASE",
    "GOOGLE",
    "OPENAI",
    "ANTHROPIC",
    "GITHUB",
    "AWS",
    "DATABASE",
    "SMTP",
    "SESSION",
    "COOKIE",
    "SECRET",
    "KEY",
    "TOKEN",
    "PASSWORD",
  ] as const,
  STAZIAMED_PROJECT_ROOT: path.resolve(process.cwd()),
};
