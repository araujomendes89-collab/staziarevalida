/**
 * Pure Deterministic Transformation Pipeline from DesignBlueprint to StaziaDesignTemplate (Etapa 1.27E.1).
 * Calibrated specifically for MEDICAL_EDITORIAL_V1 (Light / Paper-like) visual language.
 */

import {
  DesignBlueprint,
  StaziaDesignTemplate,
  TemplateFamily,
} from "../types/adminDesignStudio";
import {
  STAZIA_CORE_BRAND,
  STAZIA_APP_DARK_TOKENS,
  MEDICAL_EDITORIAL_TOKENS,
  STAZIA_SEMANTIC_TOKENS,
  STAZIA_DESIGN_COMPONENT_REGISTRY,
  STAZIA_SPACING_SCALE,
  STAZIA_RADIUS_SCALE,
  STAZIA_SHADOW_SCALE,
  EDITORIAL_TYPOGRAPHY_SCALE,
  StaziaComponentRole,
} from "./staziaDesignTokens";

export type StaziaStyleProfile =
  | "MEDICAL_EDITORIAL_V1"
  | "STAZIA_CORE_UI"
  | "STUDY_DASHBOARD"
  | "QUESTION_REVIEW"
  | "PROTOCOL_UPDATE";

export type TransformationErrorCode =
  | "INVALID_BLUEPRINT"
  | "UNSUPPORTED_COMPONENT"
  | "INVALID_TOKEN_MAPPING"
  | "TEMPLATE_VALIDATION_FAILED"
  | "TRANSFORMATION_FAILED";

export class TransformationError extends Error {
  readonly code: TransformationErrorCode;
  readonly details?: Record<string, any>;

  constructor(code: TransformationErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.name = "TransformationError";
    this.code = code;
    this.details = details;
  }
}

export interface StaziaTransformationResult {
  success: boolean;
  template?: StaziaDesignTemplate;
  styleProfile: StaziaStyleProfile;
  transformedComponentsCount: number;
  tokensMapped: Record<string, any>;
  error?: {
    code: TransformationErrorCode;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Normalizes and validates the incoming DesignBlueprint before transformation.
 */
export function normalizeBlueprint(blueprint: DesignBlueprint): DesignBlueprint {
  if (!blueprint || typeof blueprint !== "object") {
    throw new TransformationError("INVALID_BLUEPRINT", "Blueprint é nulo ou inválido.");
  }

  if (!blueprint.id || !blueprint.sourceReferenceId) {
    throw new TransformationError("INVALID_BLUEPRINT", "Blueprint carece de identificadores válidos.");
  }

  if (!blueprint.layout || !Array.isArray(blueprint.sections) || !Array.isArray(blueprint.componentTypes)) {
    throw new TransformationError("INVALID_BLUEPRINT", "Estrutura de layout ou seções ausente no Blueprint.");
  }

  return {
    ...blueprint,
    sections: blueprint.sections || [],
    componentTypes: blueprint.componentTypes || [],
    spacing: blueprint.spacing || { baseUnit: 4, paddingScale: [4, 8, 16, 24], marginScale: [4, 8, 16, 24] },
    observedTokens: blueprint.observedTokens || {
      colorPalette: [],
      typographyScale: [],
      borderRadius: [],
      shadows: [],
    },
  };
}

/**
 * Maps observed tokens from the Blueprint to Stazia semantic design tokens.
 * For MEDICAL_EDITORIAL_V1, always resolves to the light paper-like editorial palette.
 */
export function mapObservedTokensToStaziaTokens(
  _observed: DesignBlueprint["observedTokens"],
  styleProfile: StaziaStyleProfile = "MEDICAL_EDITORIAL_V1"
): StaziaDesignTemplate["staziaTokens"] {
  if (styleProfile === "MEDICAL_EDITORIAL_V1") {
    return {
      pageMode: "LIGHT_EDITORIAL",
      primary: MEDICAL_EDITORIAL_TOKENS.primary,
      primaryLight: MEDICAL_EDITORIAL_TOKENS.primaryLight,
      secondary: MEDICAL_EDITORIAL_TOKENS.secondary,
      navy: MEDICAL_EDITORIAL_TOKENS.navy,
      background: MEDICAL_EDITORIAL_TOKENS.pageBackground,
      surface: MEDICAL_EDITORIAL_TOKENS.surface,
      surfaceMuted: MEDICAL_EDITORIAL_TOKENS.surfaceMuted,
      surfaceAlt: MEDICAL_EDITORIAL_TOKENS.surfaceAlt,
      textPrimary: MEDICAL_EDITORIAL_TOKENS.textPrimary,
      textSecondary: MEDICAL_EDITORIAL_TOKENS.textSecondary,
      textMuted: MEDICAL_EDITORIAL_TOKENS.textMuted,
      border: MEDICAL_EDITORIAL_TOKENS.border,
      borderLight: MEDICAL_EDITORIAL_TOKENS.borderLight,
      borderNavy: MEDICAL_EDITORIAL_TOKENS.borderNavy,

      // Note System
      noteBackground: MEDICAL_EDITORIAL_TOKENS.noteBackground,
      noteBorder: MEDICAL_EDITORIAL_TOKENS.noteBorder,
      noteText: MEDICAL_EDITORIAL_TOKENS.noteText,
      noteBadge: MEDICAL_EDITORIAL_TOKENS.noteBadge,

      // Exam Tip System
      examTipBackground: MEDICAL_EDITORIAL_TOKENS.examTipBackground,
      examTipBorder: MEDICAL_EDITORIAL_TOKENS.examTipBorder,
      examTipText: MEDICAL_EDITORIAL_TOKENS.examTipText,
      examTipBadge: MEDICAL_EDITORIAL_TOKENS.examTipBadge,

      // Warning System (3 Variants)
      attentionBackground: MEDICAL_EDITORIAL_TOKENS.attentionBackground,
      attentionBorder: MEDICAL_EDITORIAL_TOKENS.attentionBorder,
      attentionText: MEDICAL_EDITORIAL_TOKENS.attentionText,
      highRiskBackground: MEDICAL_EDITORIAL_TOKENS.highRiskBackground,
      highRiskBorder: MEDICAL_EDITORIAL_TOKENS.highRiskBorder,
      highRiskText: MEDICAL_EDITORIAL_TOKENS.highRiskText,
      emergencyBackground: MEDICAL_EDITORIAL_TOKENS.emergencyBackground,
      emergencyBorder: MEDICAL_EDITORIAL_TOKENS.emergencyBorder,
      emergencyText: MEDICAL_EDITORIAL_TOKENS.emergencyText,

      // Update System
      updateBackground: MEDICAL_EDITORIAL_TOKENS.updateBackground,
      updateBorder: MEDICAL_EDITORIAL_TOKENS.updateBorder,
      updateText: MEDICAL_EDITORIAL_TOKENS.updateText,
      updateBadge: MEDICAL_EDITORIAL_TOKENS.updateBadge,
      updateTealAccent: MEDICAL_EDITORIAL_TOKENS.updateTealAccent,

      // Semantic standard roles
      success: STAZIA_SEMANTIC_TOKENS.success,
      info: STAZIA_SEMANTIC_TOKENS.info,
      warning: STAZIA_SEMANTIC_TOKENS.warning,
      danger: STAZIA_SEMANTIC_TOKENS.danger,
      update: STAZIA_SEMANTIC_TOKENS.update,
      examTip: STAZIA_SEMANTIC_TOKENS.examTip,
      note: STAZIA_SEMANTIC_TOKENS.note,

      // Tables
      tableHeaderBg: MEDICAL_EDITORIAL_TOKENS.tableHeaderBg,
      tableHeaderText: MEDICAL_EDITORIAL_TOKENS.tableHeaderText,
      tableRowBg: MEDICAL_EDITORIAL_TOKENS.tableRowBg,
      tableRowAltBg: MEDICAL_EDITORIAL_TOKENS.tableRowAltBg,
      tableBorder: MEDICAL_EDITORIAL_TOKENS.tableBorder,
      tableHighlight: MEDICAL_EDITORIAL_TOKENS.tableHighlight,

      // Scales
      spacing: STAZIA_SPACING_SCALE,
      radii: STAZIA_RADIUS_SCALE,
      shadows: STAZIA_SHADOW_SCALE,
      typography: EDITORIAL_TYPOGRAPHY_SCALE,
    };
  }

  // Fallback for Dark UI profiles
  return {
    pageMode: "DARK",
    primary: STAZIA_APP_DARK_TOKENS.teal,
    primaryStrong: STAZIA_APP_DARK_TOKENS.tealStrong,
    secondary: STAZIA_APP_DARK_TOKENS.blue,
    background: STAZIA_APP_DARK_TOKENS.background,
    surface: STAZIA_APP_DARK_TOKENS.surface,
    surfaceAlt: STAZIA_APP_DARK_TOKENS.surfaceAlt,
    textPrimary: STAZIA_APP_DARK_TOKENS.textPrimary,
    textSecondary: STAZIA_APP_DARK_TOKENS.textSecondary,
    textMuted: STAZIA_APP_DARK_TOKENS.textMuted,
    border: STAZIA_APP_DARK_TOKENS.border,
    borderLight: STAZIA_APP_DARK_TOKENS.borderLight,

    success: STAZIA_SEMANTIC_TOKENS.success,
    info: STAZIA_SEMANTIC_TOKENS.info,
    warning: STAZIA_SEMANTIC_TOKENS.warning,
    danger: STAZIA_SEMANTIC_TOKENS.danger,
    update: STAZIA_SEMANTIC_TOKENS.update,
    examTip: STAZIA_SEMANTIC_TOKENS.examTip,
    note: STAZIA_SEMANTIC_TOKENS.note,

    spacing: STAZIA_SPACING_SCALE,
    radii: STAZIA_RADIUS_SCALE,
    shadows: STAZIA_SHADOW_SCALE,
  };
}

/**
 * Maps component types from the Blueprint to approved Stazia design components.
 */
export function mapBlueprintComponents(
  blueprint: DesignBlueprint,
  _styleProfile: StaziaStyleProfile = "MEDICAL_EDITORIAL_V1"
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const comp of blueprint.componentTypes) {
    const roleUpper = (comp.role || "UNKNOWN").toUpperCase() as StaziaComponentRole;
    if (STAZIA_DESIGN_COMPONENT_REGISTRY[roleUpper]) {
      mapping[comp.role.toLowerCase()] = STAZIA_DESIGN_COMPONENT_REGISTRY[roleUpper];
    } else {
      mapping[comp.role.toLowerCase()] = STAZIA_DESIGN_COMPONENT_REGISTRY.UNKNOWN;
    }
  }

  // Ensure default core editorial mappings
  if (!mapping.card) mapping.card = STAZIA_DESIGN_COMPONENT_REGISTRY.CARD;
  if (!mapping.table) mapping.table = STAZIA_DESIGN_COMPONENT_REGISTRY.TABLE;
  if (!mapping.alert) mapping.alert = STAZIA_DESIGN_COMPONENT_REGISTRY.ALERT;
  if (!mapping.hero) mapping.hero = STAZIA_DESIGN_COMPONENT_REGISTRY.HERO;
  if (!mapping.header) mapping.header = STAZIA_DESIGN_COMPONENT_REGISTRY.HEADER;
  if (!mapping.sidebar) mapping.sidebar = STAZIA_DESIGN_COMPONENT_REGISTRY.SIDEBAR;
  if (!mapping.stickynote) mapping.stickynote = STAZIA_DESIGN_COMPONENT_REGISTRY.STICKY_NOTE;
  if (!mapping.protocolupdate) mapping.protocolupdate = STAZIA_DESIGN_COMPONENT_REGISTRY.PROTOCOL_UPDATE;
  if (!mapping.brushheader) mapping.brushheader = STAZIA_DESIGN_COMPONENT_REGISTRY.BRUSH_HEADER;
  if (!mapping.quicksummary) mapping.quicksummary = STAZIA_DESIGN_COMPONENT_REGISTRY.QUICK_SUMMARY;

  return mapping;
}

/**
 * Builds the draft StaziaDesignTemplate from normalized Blueprint and mapped tokens.
 */
export function buildStaziaDesignTemplate(
  blueprint: DesignBlueprint,
  styleProfile: StaziaStyleProfile = "MEDICAL_EDITORIAL_V1"
): StaziaDesignTemplate {
  const normalized = normalizeBlueprint(blueprint);
  const tokens = mapObservedTokensToStaziaTokens(normalized.observedTokens, styleProfile);
  const componentMapping = mapBlueprintComponents(normalized, styleProfile);

  const family: TemplateFamily =
    styleProfile === "MEDICAL_EDITORIAL_V1" ? "MEDICAL_EDITORIAL" : "ADMIN_DASHBOARD";

  return {
    id: `sdt_transformed_${normalized.id}`,
    name: `StaziaMed Template (${styleProfile}) from ${normalized.id}`,
    version: 1,
    sourceBlueprintId: normalized.id,
    templateFamily: family,
    staziaTokens: tokens,
    componentMapping,
    layoutDefinition: {
      type: normalized.layout.type || "RESPONSIVE_GRID",
      gridColumns: normalized.layout.gridColumns || 12,
      maxWidth: normalized.layout.maxWidth || "1280px",
      containerPadding: normalized.layout.containerPadding || "24px",
      sections: normalized.sections,
      hierarchy: normalized.hierarchy,
      pageMode: tokens.pageMode,
    },
    responsiveRules: {
      breakpoints: normalized.responsiveBehavior.breakpoints,
      mobileStackOrder: normalized.responsiveBehavior.mobileStackOrder,
    },
    status: "DRAFT",
    createdBy: "stazia-blueprint-transformer",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validates the generated StaziaDesignTemplate against domain invariants.
 */
export function validateStaziaDesignTemplate(
  template: StaziaDesignTemplate
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!template) {
    return { isValid: false, errors: ["Template nulo."] };
  }

  if (template.status !== "DRAFT") {
    errors.push(`Status inválido para novo template: '${template.status}'. Deve ser estritamente 'DRAFT'.`);
  }

  if (!template.staziaTokens || !template.staziaTokens.primary || !template.staziaTokens.background) {
    errors.push("Tokens fundamentais da StaziaMed ausentes no template.");
  }

  if (!template.componentMapping || Object.keys(template.componentMapping).length === 0) {
    errors.push("Mapeamento de componentes Stazia vazio.");
  }

  if (!template.layoutDefinition || !template.layoutDefinition.gridColumns) {
    errors.push("Definição de layout inválida.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Main Pure Transformation Entrypoint:
 * Executes normalize -> map tokens -> map components -> build -> validate.
 * Completely deterministic and fail-closed.
 */
export function transformBlueprintToStaziaTemplate(
  blueprint: DesignBlueprint,
  styleProfile: StaziaStyleProfile = "MEDICAL_EDITORIAL_V1"
): StaziaDesignTemplate {
  try {
    const normalized = normalizeBlueprint(blueprint);
    const template = buildStaziaDesignTemplate(normalized, styleProfile);
    const validation = validateStaziaDesignTemplate(template);

    if (!validation.isValid) {
      throw new TransformationError(
        "TEMPLATE_VALIDATION_FAILED",
        `Validação do template StaziaMed falhou: ${validation.errors.join("; ")}`,
        { errors: validation.errors }
      );
    }

    return template;
  } catch (err: any) {
    if (err instanceof TransformationError) {
      throw err;
    }
    throw new TransformationError(
      "TRANSFORMATION_FAILED",
      `Falha na transformação do Blueprint para template StaziaMed: ${err?.message || "Erro desconhecido"}`
    );
  }
}
