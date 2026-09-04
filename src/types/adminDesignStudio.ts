/**
 * Types and Contracts for StaziaMed Design Studio (Etapa 1.27B).
 * Strictly defines Design Source References, Design Blueprints, and Stazia Design Templates.
 */

export type DesignReferenceRightsType =
  | "OWNED"
  | "LICENSED"
  | "AUTHORIZED"
  | "PUBLIC_REFERENCE_ONLY";

export type DesignSourceReferenceStatus =
  | "DRAFT"
  | "QUEUED"
  | "CAPTURED"
  | "FAILED";

export interface DesignSourceReference {
  id: string;
  url: string;
  title?: string;
  rightsType: DesignReferenceRightsType;
  status: DesignSourceReferenceStatus;
  capturedAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface DesignBlueprint {
  id: string;
  sourceReferenceId: string;
  version: number;
  layout: {
    type: string;
    gridColumns: number;
    maxWidth: string;
    containerPadding: string;
  };
  navigation: {
    type: "SIDEBAR" | "HEADER" | "TABS";
    hierarchy: any[];
  };
  sections: Array<{
    id: string;
    type: string;
    ordering: number;
    layoutType: string;
    childrenComponentTypes: string[];
  }>;
  componentTypes: Array<{
    id: string;
    role: "HERO" | "CARD" | "TABLE" | "ALERT" | "MODAL";
    layoutProps: any;
    observedHierarchy: number;
  }>;
  spacing: {
    baseUnit: number;
    paddingScale: number[];
    marginScale: number[];
  };
  hierarchy: {
    headingScale: string[];
    bodyScale: string[];
  };
  responsiveBehavior: {
    breakpoints: { sm: string; md: string; lg: string; xl: string };
    mobileStackOrder: string[];
  };
  observedTokens: {
    colorPalette: string[];
    typographyScale: string[];
    borderRadius: string[];
    shadows: string[];
  };
  createdAt: string;
}

export type TemplateFamily =
  | "MEDICAL_EDITORIAL"
  | "ADMIN_DASHBOARD"
  | "STUDY_SUMMARY"
  | "QUESTION_REVIEW"
  | "PROTOCOL_UPDATE"
  | "COMPARISON"
  | "TIMELINE"
  | "CLINICAL_ALGORITHM";

export type StaziaDesignTemplateStatus =
  | "DRAFT"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "PUBLISHED"
  | "NEEDS_CORRECTION"
  | "REJECTED";

export interface StaziaDesignTemplate {
  id: string;
  name: string;
  version: number;
  sourceBlueprintId: string;
  templateFamily: TemplateFamily;
  staziaTokens: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    textPrimary: string;
    border: string;
    [key: string]: any;
  };
  componentMapping: Record<string, string>;
  layoutDefinition: Record<string, any>;
  responsiveRules: Record<string, any>;
  status: StaziaDesignTemplateStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * Registered canonical metadata for MEDICAL_EDITORIAL_V1.
 * Canonical baseline document: StaziaMed_Revalida_Hipertensao_.pdf
 */
export const MEDICAL_EDITORIAL_V1: StaziaDesignTemplate = {
  id: "template_medical_editorial_v1",
  name: "Medical Editorial V1 — Revalida INEP Edition",
  version: 1,
  sourceBlueprintId: "blueprint_staziamed_canonical_hipertensao",
  templateFamily: "MEDICAL_EDITORIAL",
  staziaTokens: {
    pageMode: "LIGHT_EDITORIAL",
    primary: "#0D9488",
    primaryLight: "#45E0CE",
    secondary: "#2563EB",
    navy: "#0A192F",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceMuted: "#F1F5F9",
    textPrimary: "#0A192F",
    textSecondary: "#334155",
    border: "#E2E8F0",
    noteBackground: "#FEF9C3",
    noteBorder: "#FDE047",
    noteText: "#713F12",
  },
  componentMapping: {
    heading: "HeadingBlock",
    clinicalAlert: "ClinicalWarningCard",
    examTip: "ExamTipCard",
    table: "StaziaMedicalTable",
    protocolUpdate: "ProtocolUpdateCard",
    algorithm: "ClinicalAlgorithmSteps",
    stickyNote: "StickyNoteCard",
    brushHeader: "BrushSectionHeader",
    quickSummary: "QuickSummaryStrip",
  },
  layoutDefinition: {
    containerMaxWidth: "1140px",
    gridSystem: "responsive-12-col",
    typographyScale: "editorial-clinical",
  },
  responsiveRules: {
    mobileStack: true,
    tableHorizontalScroll: true,
  },
  status: "DRAFT",
  createdBy: "system-editorial-governance",
  createdAt: "2026-09-04T00:00:00Z",
};

