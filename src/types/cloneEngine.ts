/**
 * Types and Contracts for StaziaMed Clone Engine Adapter (Etapa 1.27C).
 * Defines adapter abstractions, raw & sanitized extraction models, rights policies, and viewport/interaction specifications.
 */

import {
  DesignReferenceRightsType,
  DesignBlueprint,
  StaziaDesignTemplate,
} from "./adminDesignStudio";

export type CloneAnalysisMode =
  | "FULL_PAGE"
  | "COMPONENTS"
  | "DESIGN_SYSTEM"
  | "STRUCTURE_LAYOUT";

export type CloneEngineErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "RIGHTS_TYPE_REQUIRED"
  | "CLONE_ENGINE_NOT_CONNECTED"
  | "CLONE_ENGINE_UNAVAILABLE"
  | "CAPTURE_FAILED"
  | "EXTRACTION_FAILED"
  | "SANITIZATION_FAILED";

export interface CloneEngineError {
  code: CloneEngineErrorCode;
  message: string;
  details?: Record<string, any>;
}

export interface CloneAnalysisRequest {
  requestId: string;
  url: string;
  rightsType: DesignReferenceRightsType;
  analysisMode: CloneAnalysisMode;
  requestedBy: string;
  requestedAt: string;
}

export type ViewportType =
  | "DESKTOP_1440"
  | "TABLET_768"
  | "MOBILE_390";

export type InteractionTriggerType =
  | "STATIC"
  | "CLICK"
  | "HOVER"
  | "SCROLL"
  | "TIME"
  | "COMBINED";

export interface ObservedDesignTokens {
  colors: Array<{ role?: string; hex: string; usageCount?: number }>;
  typography: Array<{ fontFamily?: string; fontSize: string; fontWeight?: string; lineHeight?: string }>;
  spacing: number[];
  radii: string[];
  shadows: string[];
  borders: string[];
}

export interface RawCloneAssetObservation {
  sourceUrl: string;
  type: "IMAGE" | "SVG" | "FONT" | "VIDEO" | "ICON";
  dimensions?: { width: number; height: number };
  role?: string;
}

export interface RawCloneExtraction {
  requestId: string;
  targetUrl: string;
  rightsType: DesignReferenceRightsType;
  capturedAt: string;
  pageMetadata: {
    title?: string;
    description?: string;
    lang?: string;
  };
  viewportCaptures: Array<{
    viewport: ViewportType;
    captureUri?: string;
  }>;
  computedStyles: Record<string, any>;
  layoutObservations: Array<{
    region: string;
    tag: string;
    gridInfo?: Record<string, any>;
    isSticky?: boolean;
    childrenCount: number;
  }>;
  interactionObservations: Array<{
    elementSelector: string;
    trigger: InteractionTriggerType;
    behaviorDescription: string;
  }>;
  componentObservations: Array<{
    role: string;
    boundingBox?: Record<string, any>;
    childCount: number;
    observedClassNames?: string[];
  }>;
  assetObservations: RawCloneAssetObservation[];
  observedTokens: ObservedDesignTokens;
}

export interface SanitizedDesignExtraction {
  requestId: string;
  targetUrl: string;
  rightsType: DesignReferenceRightsType;
  sanitizedAt: string;
  layoutObservations: Array<{
    region: string;
    tag: string;
    gridInfo?: Record<string, any>;
    isSticky?: boolean;
    childrenCount: number;
  }>;
  interactionObservations: Array<{
    elementSelector: string;
    trigger: InteractionTriggerType;
    behaviorDescription: string;
  }>;
  componentObservations: Array<{
    role: string;
    boundingBox?: Record<string, any>;
    childCount: number;
  }>;
  observedTokens: ObservedDesignTokens;
}

export interface CloneAnalysisResult {
  success: boolean;
  request: CloneAnalysisRequest;
  rawExtraction?: RawCloneExtraction;
  sanitizedExtraction?: SanitizedDesignExtraction;
  blueprint?: DesignBlueprint;
  error?: CloneEngineError;
}

/**
 * Standard abstraction for Clone Engine Adapters.
 * Decoupled from any specific vendor or cloner implementation.
 */
export interface CloneEngineAdapter {
  readonly isConnected: boolean;
  readonly engineName: string;
  analyze(request: CloneAnalysisRequest): Promise<CloneAnalysisResult>;
}

/**
 * Boundary interface for future isolated background clone runner.
 */
export interface CloneRunnerClient {
  submitJob(request: CloneAnalysisRequest): Promise<{ jobId: string }>;
  getJobStatus(jobId: string): Promise<{ status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"; progress?: number }>;
  getExtractionResult(jobId: string): Promise<RawCloneExtraction>;
  cancelJob(jobId: string): Promise<{ canceled: boolean }>;
}
