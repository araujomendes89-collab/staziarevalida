/**
 * Types and Contracts for JCodesMore Isolated Worker Runtime (Etapa 1.27G.1).
 * Strictly defines Worker Source metadata, Worker Health Model, Job States, and Execution Contracts.
 */

import { DesignReferenceRightsType } from "./adminDesignStudio";

export type JCodesMoreAgentType =
  | "CLAUDE_CODE"
  | "CODEX_CLI"
  | "GEMINI_CLI"
  | "NONE";

export type JCodesMoreBrowserEngine =
  | "CHROME_MCP"
  | "PLAYWRIGHT_MCP"
  | "PUPPETEER_MCP"
  | "BROWSERBASE"
  | "NONE";

export interface JCodesMoreWorkerSource {
  sourceType: "LOCAL_ZIP";
  zipPath: string;
  zipSha256: string;
  packageVersion: string;
  framework: string;
  nodeRequirement: string;
  auditedAt: string;
}

export interface JCodesMoreWorkerHealth {
  configured: boolean;
  sourceZipFound: boolean;
  sourceHashValid: boolean;
  packageVersion: string;
  nodeRuntimeAvailable: boolean;
  nodeVersion: string;
  agentAvailable: boolean;
  agentType: JCodesMoreAgentType;
  agentVersion?: string;
  browserMcpAvailable: boolean;
  browserType: JCodesMoreBrowserEngine;
  workspaceWritable: boolean;
  workerReady: boolean;
  checkedAt: string;
  missingRequirements?: string[];
}

export type JCodesMoreJobStatus =
  | "QUEUED"
  | "PREFLIGHT"
  | "PREPARING_WORKSPACE"
  | "WAITING_FOR_BROWSER"
  | "WAITING_FOR_USER_AUTH"
  | "AUTHENTICATED_BROWSER_READY"
  | "RECONNAISSANCE"
  | "CLONING"
  | "ASSEMBLING"
  | "VISUAL_QA"
  | "EXTRACTING_ARTIFACTS"
  | "SANITIZING"
  | "TRANSFORMING"
  | "READY_FOR_IMPORT"
  | "READY_FOR_REVIEW"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "FAILED"
  | "BLOCKED";

export interface JCodesMoreRawArtifactBundle {
  jobId: string;
  targetUrl: string;
  capturedAt: string;
  rightsType: DesignReferenceRightsType;
  screenshots: {
    referenceDesktop?: string;
    referenceMobile?: string;
    cloneDesktop?: string;
    cloneMobile?: string;
    visualDiffDesktop?: string;
  };
  researchSpecs: {
    topologyJson?: string;
    tokensJson?: string;
    researchReportJson?: string;
    componentSpecs?: Array<{ name: string; content: string }>;
  };
  generatedCodeFiles: Array<{
    relativePath: string;
    sizeBytes: number;
    previewContent?: string;
  }>;
  secretScanPassed: boolean;
  similarityScore?: number;
}

export interface JCodesMoreCloneJob {
  id: string;
  sourceReferenceId?: string;
  requestedUrl: string;
  rightsType: DesignReferenceRightsType;
  cloneScope: "FULL_PAGE" | "COMPONENTS" | "DESIGN_SYSTEM" | "STRUCTURE_LAYOUT";
  requestedBy: string;
  engine: "JCODESMORE";
  engineVersion: string;
  engineSourceHash: string;
  agentType: JCodesMoreAgentType;
  status: JCodesMoreJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failureCode?: string;
  failureMessageSanitized?: string;
  artifactManifestId?: string;
  authRequired?: boolean;
  authHandoffUrl?: string;
  authHandoffMessage?: string;
  artifactsBundle?: JCodesMoreRawArtifactBundle;
  similarityScore?: number;
  validationStatus?: "PENDING_USER_CONFIRMATION" | "APPROVED" | "REJECTED";
}

export interface JCodesMoreAgentAdapter {
  readonly agentType: JCodesMoreAgentType;
  healthCheck(): Promise<{ available: boolean; version?: string; error?: string }>;
  prepare(workspacePath: string): Promise<{ ready: boolean; error?: string }>;
  runClone(job: JCodesMoreCloneJob, workspacePath: string): Promise<{ success: boolean; error?: string }>;
  cancel(jobId: string): Promise<{ cancelled: boolean }>;
  collectArtifacts(workspacePath: string): Promise<{ artifactManifestId?: string; files: string[] }>;
  cleanup(workspacePath: string): Promise<void>;
}

