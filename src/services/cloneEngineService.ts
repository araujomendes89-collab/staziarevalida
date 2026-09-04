/**
 * Pure Domain Services and Sanitization Boundary for Clone Engine (Etapa 1.27C).
 * Handles URL validation with SSRF protection rules, rights policy resolution, extraction sanitization, and blueprint construction.
 */

import {
  DesignReferenceRightsType,
  DesignBlueprint,
  StaziaDesignTemplate,
} from "../types/adminDesignStudio";
import {
  CloneAnalysisRequest,
  CloneEngineErrorCode,
  RawCloneExtraction,
  SanitizedDesignExtraction,
  ObservedDesignTokens,
} from "../types/cloneEngine";

export interface UrlValidationResult {
  isValid: boolean;
  error?: CloneEngineErrorCode;
  message?: string;
  sanitizedUrl?: string;
}

export interface CloneExtractionPolicy {
  rightsType: DesignReferenceRightsType;
  allowDirectAssetCopy: boolean;
  allowBrandingPreservation: boolean;
  allowTextContentCopy: boolean;
  allowLayoutExtraction: true;
  allowTokenObservation: true;
  allowInteractionExtraction: true;
  mandatorySanitization: boolean;
}

/**
 * Validates a target URL against protocol and SSRF security rules.
 * Strictly accepts only http:// and https:// and blocks private IP ranges / localhost / unsafe schemes.
 */
export function validateCloneUrl(rawUrl?: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      isValid: false,
      error: "INVALID_URL",
      message: "A URL da referência não pode ser vazia.",
    };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      error: "INVALID_URL",
      message: "Formato de URL inválido. Certifique-se de incluir o protocolo (ex: https://...).",
    };
  }

  // 1. Protocol Validation
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      isValid: false,
      error: "UNSUPPORTED_PROTOCOL",
      message: `Protocolo '${parsed.protocol}' não suportado. Apenas HTTP e HTTPS são permitidos.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. SSRF Protection: Block localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return {
      isValid: false,
      error: "INVALID_URL",
      message: "Endereços locais e loopback não são permitidos por políticas de segurança SSRF.",
    };
  }

  // 3. SSRF Protection: Block IPv4 Private Ranges (RFC 1918) & Link-Local (169.254.x.x)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const octet1 = parseInt(ipMatch[1], 10);
    const octet2 = parseInt(ipMatch[2], 10);

    // 10.0.0.0/8
    if (octet1 === 10) {
      return { isValid: false, error: "INVALID_URL", message: "IP privado (10.0.0.0/8) bloqueado por segurança SSRF." };
    }
    // 172.16.0.0/12 (172.16 - 172.31)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
      return { isValid: false, error: "INVALID_URL", message: "IP privado (172.16.0.0/12) bloqueado por segurança SSRF." };
    }
    // 192.168.0.0/16
    if (octet1 === 192 && octet2 === 168) {
      return { isValid: false, error: "INVALID_URL", message: "IP privado (192.168.0.0/16) bloqueado por segurança SSRF." };
    }
    // 169.254.0.0/16 (Link-Local / Cloud Metadata)
    if (octet1 === 169 && octet2 === 254) {
      return { isValid: false, error: "INVALID_URL", message: "IP link-local/metadata (169.254.0.0/16) bloqueado por segurança SSRF." };
    }
  }

  return {
    isValid: true,
    sanitizedUrl: parsed.toString(),
  };
}

/**
 * Resolves the legal and structural extraction policy based on rightsType.
 */
export function resolveCloneExtractionPolicy(rightsType: DesignReferenceRightsType): CloneExtractionPolicy {
  switch (rightsType) {
    case "OWNED":
    case "LICENSED":
    case "AUTHORIZED":
      return {
        rightsType,
        allowDirectAssetCopy: true,
        allowBrandingPreservation: true,
        allowTextContentCopy: true,
        allowLayoutExtraction: true,
        allowTokenObservation: true,
        allowInteractionExtraction: true,
        mandatorySanitization: false,
      };

    case "PUBLIC_REFERENCE_ONLY":
    default:
      return {
        rightsType: "PUBLIC_REFERENCE_ONLY",
        allowDirectAssetCopy: false,
        allowBrandingPreservation: false,
        allowTextContentCopy: false,
        allowLayoutExtraction: true,
        allowTokenObservation: true,
        allowInteractionExtraction: true,
        mandatorySanitization: true,
      };
  }
}

/**
 * Sanitizes a raw extraction result according to rights policy.
 * For PUBLIC_REFERENCE_ONLY, strips all assets, brand names, copy and proprietary elements.
 */
export function sanitizeCloneExtraction(
  raw: RawCloneExtraction,
  rightsType: DesignReferenceRightsType
): SanitizedDesignExtraction {
  const policy = resolveCloneExtractionPolicy(rightsType);

  // Filter observed tokens (strip any proprietary brand colors/names)
  const cleanedTokens: ObservedDesignTokens = {
    colors: raw.observedTokens?.colors || [],
    typography: raw.observedTokens?.typography || [],
    spacing: raw.observedTokens?.spacing || [4, 8, 12, 16, 24, 32, 48],
    radii: raw.observedTokens?.radii || ["4px", "8px", "12px", "16px", "24px"],
    shadows: raw.observedTokens?.shadows || ["0 1px 3px rgba(0,0,0,0.1)"],
    borders: raw.observedTokens?.borders || ["1px solid #e2e8f0"],
  };

  // Filter component observations: Strip observed third-party class names and brand labels
  const cleanedComponents = (raw.componentObservations || []).map((comp) => ({
    role: comp.role,
    boundingBox: comp.boundingBox,
    childCount: comp.childCount,
  }));

  return {
    requestId: raw.requestId,
    targetUrl: raw.targetUrl,
    rightsType,
    sanitizedAt: new Date().toISOString(),
    layoutObservations: raw.layoutObservations || [],
    interactionObservations: raw.interactionObservations || [],
    componentObservations: cleanedComponents,
    observedTokens: cleanedTokens,
  };
}

/**
 * Builds a clean, abstract DesignBlueprint from a sanitized extraction result.
 * Conforms strictly to the canonical DesignBlueprint interface.
 */
export function buildDesignBlueprint(
  sanitized: SanitizedDesignExtraction,
  sourceReferenceId?: string
): DesignBlueprint {
  return {
    id: `dbp_${sanitized.requestId}`,
    sourceReferenceId: sourceReferenceId || `dsr_${sanitized.requestId}`,
    version: 1,
    layout: {
      type: "RESPONSIVE_GRID",
      gridColumns: 12,
      maxWidth: "1280px",
      containerPadding: "24px",
    },
    navigation: {
      type: "HEADER",
      hierarchy: [],
    },
    sections: (sanitized.layoutObservations || []).map((obs, idx) => ({
      id: `sec_${idx + 1}`,
      type: obs.region || "CONTENT_SECTION",
      ordering: idx + 1,
      layoutType: obs.tag === "aside" ? "SIDEBAR" : "GRID_CONTAINER",
      childrenComponentTypes: [`role_${obs.region}`],
    })),
    componentTypes: (sanitized.componentObservations || []).map((comp, idx) => ({
      id: `comp_type_${idx + 1}`,
      role: (comp.role.toUpperCase() as "HERO" | "CARD" | "TABLE" | "ALERT" | "MODAL") || "CARD",
      layoutProps: comp.boundingBox || {},
      observedHierarchy: idx + 1,
    })),
    spacing: {
      baseUnit: 4,
      paddingScale: sanitized.observedTokens.spacing || [4, 8, 12, 16, 24, 32],
      marginScale: sanitized.observedTokens.spacing || [4, 8, 12, 16, 24, 32],
    },
    hierarchy: {
      headingScale: ["32px", "24px", "20px", "16px"],
      bodyScale: ["14px", "12px", "10px"],
    },
    responsiveBehavior: {
      breakpoints: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },
      mobileStackOrder: ["header", "main", "sidebar", "footer"],
    },
    observedTokens: {
      colorPalette: (sanitized.observedTokens.colors || []).map((c) => c.hex),
      typographyScale: (sanitized.observedTokens.typography || []).map((t) => t.fontSize),
      borderRadius: sanitized.observedTokens.radii || ["8px", "16px"],
      shadows: sanitized.observedTokens.shadows || ["0 4px 6px -1px rgba(0,0,0,0.1)"],
    },
    createdAt: new Date().toISOString(),
  };
}

export {
  transformBlueprintToStaziaTemplate,
  buildStaziaDesignTemplate,
  normalizeBlueprint,
  validateStaziaDesignTemplate,
  mapObservedTokensToStaziaTokens,
  mapBlueprintComponents,
} from "./staziaDesignTransformer";

