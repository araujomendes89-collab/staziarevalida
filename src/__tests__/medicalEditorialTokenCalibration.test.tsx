import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  transformBlueprintToStaziaTemplate,
  mapObservedTokensToStaziaTokens,
} from "../services/staziaDesignTransformer";
import {
  STAZIA_APP_DARK_TOKENS,
  MEDICAL_EDITORIAL_TOKENS,
  STAZIA_CORE_BRAND,
} from "../services/staziaDesignTokens";
import { DesignBlueprint, MEDICAL_EDITORIAL_V1 } from "../types/adminDesignStudio";
import { StaziaDesignPreviewRenderer } from "../components/admin/designStudio/StaziaDesignPreviewRenderer";

describe("Medical Editorial V1 Visual Token Calibration (Etapa 1.27E.1)", () => {
  const darkObservedBlueprint: DesignBlueprint = {
    id: "dbp_dark_reference",
    sourceReferenceId: "ref_dark_saas",
    version: 1,
    layout: {
      type: "RESPONSIVE_GRID",
      gridColumns: 12,
      maxWidth: "1440px",
      containerPadding: "24px",
    },
    navigation: {
      type: "HEADER",
      hierarchy: [],
    },
    sections: [
      { id: "sec_1", type: "HEADER", ordering: 1, layoutType: "HEADER", childrenComponentTypes: ["role_header"] },
      { id: "sec_2", type: "MAIN", ordering: 2, layoutType: "GRID", childrenComponentTypes: ["role_card"] },
    ],
    componentTypes: [
      { id: "c_1", role: "CARD", layoutProps: {}, observedHierarchy: 1 },
      { id: "c_2", role: "TABLE", layoutProps: {}, observedHierarchy: 2 },
      { id: "c_3", role: "ALERT", layoutProps: {}, observedHierarchy: 3 },
    ],
    spacing: { baseUnit: 4, paddingScale: [4, 8, 16], marginScale: [4, 8, 16] },
    hierarchy: { headingScale: ["32px", "20px"], bodyScale: ["14px"] },
    responsiveBehavior: {
      breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
      mobileStackOrder: ["header", "main"],
    },
    observedTokens: {
      colorPalette: ["#000000", "#111827", "#374151"], // Dark SaaS colors
      typographyScale: ["32px", "14px"],
      borderRadius: ["4px"],
      shadows: ["0 4px 6px rgba(0,0,0,0.5)"],
    },
    createdAt: "2026-09-04T12:00:00.000Z",
  };

  describe("1. Separation of Visual Token Families", () => {
    it("should separate MEDICAL_EDITORIAL_TOKENS from STAZIA_APP_DARK_TOKENS", () => {
      expect(MEDICAL_EDITORIAL_TOKENS.pageMode).toBe("LIGHT_EDITORIAL");
      expect(STAZIA_APP_DARK_TOKENS.pageMode).toBe("DARK");

      expect(MEDICAL_EDITORIAL_TOKENS.pageBackground).not.toBe(STAZIA_APP_DARK_TOKENS.background);
      expect(MEDICAL_EDITORIAL_TOKENS.pageBackground).toBe("#F8FAFC");
      expect(STAZIA_APP_DARK_TOKENS.background).toBe("#06101E");

      expect(MEDICAL_EDITORIAL_TOKENS.surface).not.toBe(STAZIA_APP_DARK_TOKENS.surface);
      expect(MEDICAL_EDITORIAL_TOKENS.surface).toBe("#FFFFFF");
      expect(STAZIA_APP_DARK_TOKENS.surface).toBe("#0B192C");
    });

    it("should maintain Stazia Core Brand identity across both profiles", () => {
      expect(STAZIA_CORE_BRAND.teal).toBe("#0D9488");
      expect(STAZIA_CORE_BRAND.tealLight).toBe("#45E0CE");
      expect(STAZIA_CORE_BRAND.navy).toBe("#0A192F");
    });
  });

  describe("2. Dark Reference Blueprint -> Light Editorial Transformation", () => {
    it("should transform dark website blueprint into LIGHT_EDITORIAL profile without propagating dark background", () => {
      const template = transformBlueprintToStaziaTemplate(darkObservedBlueprint, "MEDICAL_EDITORIAL_V1");

      expect(template.staziaTokens.pageMode).toBe("LIGHT_EDITORIAL");
      expect(template.staziaTokens.background).toBe("#F8FAFC");
      expect(template.staziaTokens.surface).toBe("#FFFFFF");
      expect(template.staziaTokens.textPrimary).toBe("#0A192F");

      // Verify that dark observed colors were purged
      expect(template.staziaTokens.background).not.toBe("#000000");
      expect(template.staziaTokens.surface).not.toBe("#111827");
    });
  });

  describe("3. Note, Exam Tip, Warning, and Update Systems", () => {
    it("should provide specialized tokens for post-it notes, exam tips, warnings and updates", () => {
      const tokens = mapObservedTokensToStaziaTokens(darkObservedBlueprint.observedTokens, "MEDICAL_EDITORIAL_V1");

      // Sticky Note
      expect(tokens.noteBackground).toBe("#FEF9C3");
      expect(tokens.noteBorder).toBe("#FDE047");
      expect(tokens.noteText).toBe("#713F12");

      // Exam Tip
      expect(tokens.examTipBackground).toBe("#FFFBEB");
      expect(tokens.examTipBorder).toBe("#FBBF24");

      // Warning variants
      expect(tokens.attentionBackground).toBe("#FFF7ED");
      expect(tokens.highRiskBackground).toBe("#FEF2F2");
      expect(tokens.emergencyBackground).toBe("#450A0A");

      // Update system
      expect(tokens.updateBackground).toBe("#FAF5FF");
      expect(tokens.updateBorder).toBe("#C084FC");
      expect(tokens.updateTealAccent).toBe("#0D9488");
    });
  });

  describe("4. Visual Runtime Preview Rendering", () => {
    it("should render light paper-like editorial interface in Desktop, Tablet and Mobile viewports", () => {
      const template = transformBlueprintToStaziaTemplate(darkObservedBlueprint, "MEDICAL_EDITORIAL_V1");

      // Desktop
      const { unmount } = render(<StaziaDesignPreviewRenderer template={template} viewport="DESKTOP_1440" />);
      expect(screen.getByText(/Style: MEDICAL EDITORIAL V1/i)).toBeInTheDocument();
      expect(screen.getByText(/Mode: LIGHT EDITORIAL/i)).toBeInTheDocument();
      expect(screen.getByText(/Manejo da Hipertensão Arterial Resistente/i)).toBeInTheDocument();
      expect(screen.getByText(/Nota de Consultório/i)).toBeInTheDocument();
      expect(screen.getByText(/Dica de Prova • Pegadinha INEP/i)).toBeInTheDocument();
      expect(screen.getByText(/Atualização 2026/i)).toBeInTheDocument();
      expect(screen.getByText(/Quadro Sinóptico Farmacológico/i)).toBeInTheDocument();
      unmount();

      // Tablet
      const tabletRender = render(<StaziaDesignPreviewRenderer template={template} viewport="TABLET_768" />);
      expect(screen.getByText(/Style: MEDICAL EDITORIAL V1/i)).toBeInTheDocument();
      tabletRender.unmount();

      // Mobile
      const mobileRender = render(<StaziaDesignPreviewRenderer template={template} viewport="MOBILE_390" />);
      expect(screen.getByText(/Style: MEDICAL EDITORIAL V1/i)).toBeInTheDocument();
      mobileRender.unmount();
    });
  });
});
