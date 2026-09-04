/**
 * StaziaMed Core Tokens & Semantic Tokens Registry (Etapa 1.27E.1).
 * Separates STAZIA_CORE_BRAND, STAZIA_APP_DARK, and MEDICAL_EDITORIAL_TOKENS (Light / Paper-Like).
 */

export const STAZIA_CORE_BRAND = {
  navy: "#0A192F",
  navyDark: "#06101E",
  teal: "#0D9488",
  tealLight: "#45E0CE",
  blue: "#2563EB",
  blueDark: "#2D68B8",
} as const;

export const STAZIA_APP_DARK_TOKENS = {
  pageMode: "DARK",
  navy: "#06101E",
  teal: "#45E0CE",
  tealStrong: "#0D9488",
  blue: "#2D68B8",
  background: "#06101E",
  surface: "#0B192C",
  surfaceAlt: "#10233D",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  border: "#1E293B",
  borderLight: "#334155",
} as const;

export const MEDICAL_EDITORIAL_TOKENS = {
  pageMode: "LIGHT_EDITORIAL",
  // Surface & Page (Light Paper-like)
  pageBackground: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F5F9",
  surfaceAlt: "#F8FAFC",
  textPrimary: "#0A192F",
  textSecondary: "#334155",
  textMuted: "#64748B",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderNavy: "#0A192F",

  // Brand Accents
  primary: "#0D9488",
  primaryLight: "#45E0CE",
  secondary: "#2563EB",
  navy: "#0A192F",

  // Note System (Post-it / Card Editorial)
  noteBackground: "#FEF9C3",
  noteBorder: "#FDE047",
  noteText: "#713F12",
  noteBadge: "#CA8A04",

  // Exam Tip System (Pegadinha / Dica de Prova)
  examTipBackground: "#FFFBEB",
  examTipBorder: "#FBBF24",
  examTipText: "#78350F",
  examTipBadge: "#D97706",

  // Warning System (3 Variants: Attention, High Risk, Emergency)
  attentionBackground: "#FFF7ED",
  attentionBorder: "#F97316",
  attentionText: "#9A3412",

  highRiskBackground: "#FEF2F2",
  highRiskBorder: "#EF4444",
  highRiskText: "#991B1B",

  emergencyBackground: "#450A0A",
  emergencyBorder: "#DC2626",
  emergencyText: "#FFFFFF",

  // Update System (Protocol Updates: Purple / Teal)
  updateBackground: "#FAF5FF",
  updateBorder: "#C084FC",
  updateText: "#581C87",
  updateBadge: "#9333EA",
  updateTealAccent: "#0D9488",

  // Medical Editorial Tables
  tableHeaderBg: "#0A192F",
  tableHeaderText: "#FFFFFF",
  tableRowBg: "#FFFFFF",
  tableRowAltBg: "#F8FAFC",
  tableBorder: "#E2E8F0",
  tableHighlight: "#CCFBF1",
} as const;

// Backward-compatible alias for app core references
export const STAZIA_CORE_TOKENS = STAZIA_APP_DARK_TOKENS;

export const STAZIA_SEMANTIC_TOKENS = {
  success: "#10B981",
  info: "#38BDF8",
  warning: "#F59E0B",
  danger: "#EF4444",
  update: "#8B5CF6",
  examTip: "#FBBF24",
  note: "#E2E8F0",
} as const;

export const STAZIA_SPACING_SCALE = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
} as const;

export const STAZIA_RADIUS_SCALE = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  "2xl": "24px",
  full: "9999px",
} as const;

export const STAZIA_SHADOW_SCALE = {
  NONE: "none",
  SUBTLE: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  CARD: "0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
  FLOATING: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  MODAL: "0 20px 25px -5px rgba(0, 0, 0, 0.15)",
} as const;

export const EDITORIAL_TYPOGRAPHY_SCALE = {
  EDITORIAL_DISPLAY: { fontSize: "32px", lineHeight: "40px", fontWeight: "700", fontFamily: "Merriweather, Georgia, serif" },
  EDITORIAL_H1: { fontSize: "24px", lineHeight: "32px", fontWeight: "700", fontFamily: "Merriweather, Georgia, serif" },
  EDITORIAL_H2: { fontSize: "20px", lineHeight: "28px", fontWeight: "600", fontFamily: "Merriweather, Georgia, serif" },
  EDITORIAL_H3: { fontSize: "16px", lineHeight: "24px", fontWeight: "600", fontFamily: "Inter, sans-serif" },
  EDITORIAL_BODY: { fontSize: "14px", lineHeight: "22px", fontWeight: "400", fontFamily: "Inter, sans-serif" },
  EDITORIAL_NOTE: { fontSize: "13px", lineHeight: "18px", fontWeight: "500", fontFamily: "Inter, sans-serif" },
  EDITORIAL_TABLE: { fontSize: "12px", lineHeight: "16px", fontWeight: "400", fontFamily: "Inter, sans-serif" },
  EDITORIAL_BADGE: { fontSize: "10px", lineHeight: "12px", fontWeight: "700", fontFamily: "Inter, sans-serif" },
} as const;

export const STAZIA_TYPOGRAPHY_SCALE = {
  DISPLAY: { fontSize: "32px", lineHeight: "40px", fontWeight: "700" },
  H1: { fontSize: "24px", lineHeight: "32px", fontWeight: "700" },
  H2: { fontSize: "20px", lineHeight: "28px", fontWeight: "600" },
  H3: { fontSize: "16px", lineHeight: "24px", fontWeight: "600" },
  BODY: { fontSize: "14px", lineHeight: "20px", fontWeight: "400" },
  LABEL: { fontSize: "12px", lineHeight: "16px", fontWeight: "500" },
  CAPTION: { fontSize: "11px", lineHeight: "14px", fontWeight: "400" },
  BADGE: { fontSize: "10px", lineHeight: "12px", fontWeight: "700" },
} as const;

/**
 * Standard typed registry mapping semantic roles to canonical Stazia components.
 */
export const STAZIA_DESIGN_COMPONENT_REGISTRY = {
  HEADER: "StaziaHeader",
  SIDEBAR: "StaziaSidebar",
  CARD: "StaziaCard",
  TABLE: "StaziaMedicalTable",
  BUTTON: "StaziaButton",
  INPUT: "StaziaInput",
  SELECT: "StaziaSelect",
  TABS: "StaziaTabs",
  BADGE: "StaziaBadge",
  HERO: "StaziaHero",
  ALERT: "ClinicalWarningCard",
  STICKY_NOTE: "StickyNoteCard",
  PROTOCOL_UPDATE: "ProtocolUpdateCard",
  BRUSH_HEADER: "BrushSectionHeader",
  QUICK_SUMMARY: "QuickSummaryStrip",
  FOOTER: "StaziaFooter",
  UNKNOWN: "GenericStaziaBlock",
} as const;

export type StaziaComponentRole = keyof typeof STAZIA_DESIGN_COMPONENT_REGISTRY;
