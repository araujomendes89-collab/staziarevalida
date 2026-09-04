import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  transformBlueprintToStaziaTemplate,
  buildStaziaDesignTemplate,
  mapObservedTokensToStaziaTokens,
  mapBlueprintComponents,
  validateStaziaDesignTemplate,
  TransformationError,
} from "../services/staziaDesignTransformer";
import {
  STAZIA_CORE_TOKENS,
  STAZIA_SEMANTIC_TOKENS,
  MEDICAL_EDITORIAL_TOKENS,
  STAZIA_DESIGN_COMPONENT_REGISTRY,
} from "../services/staziaDesignTokens";
import { DesignBlueprint, StaziaDesignTemplate } from "../types/adminDesignStudio";
import { StaziaDesignPreviewRenderer } from "../components/admin/designStudio/StaziaDesignPreviewRenderer";
import { AdminDesignStudioView } from "../components/admin/AdminDesignStudioView";

describe("Blueprint to StaziaMed Transformation & Preview Pipeline (Etapa 1.27E)", () => {
  const sampleBlueprint: DesignBlueprint = {
    id: "dbp_revalida_cardio_01",
    sourceReferenceId: "ref_ext_cardio",
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
    sections: [
      { id: "sec_1", type: "HEADER", ordering: 1, layoutType: "HEADER", childrenComponentTypes: ["role_header"] },
      { id: "sec_2", type: "HERO", ordering: 2, layoutType: "GRID_CONTAINER", childrenComponentTypes: ["role_hero"] },
      { id: "sec_3", type: "CARDS", ordering: 3, layoutType: "GRID_CONTAINER", childrenComponentTypes: ["role_card"] },
      { id: "sec_4", type: "TABLE", ordering: 4, layoutType: "GRID_CONTAINER", childrenComponentTypes: ["role_table"] },
      { id: "sec_5", type: "SIDEBAR", ordering: 5, layoutType: "SIDEBAR", childrenComponentTypes: ["role_sidebar"] },
    ],
    componentTypes: [
      { id: "c_1", role: "HERO", layoutProps: { width: 1200 }, observedHierarchy: 1 },
      { id: "c_2", role: "CARD", layoutProps: { width: 400 }, observedHierarchy: 2 },
      { id: "c_3", role: "TABLE", layoutProps: { width: 800 }, observedHierarchy: 3 },
      { id: "c_4", role: "ALERT", layoutProps: { width: 800 }, observedHierarchy: 4 },
      { id: "c_5", role: "CARD", layoutProps: { width: 400 }, observedHierarchy: 5 },
    ],
    spacing: {
      baseUnit: 4,
      paddingScale: [4, 8, 16, 24, 32],
      marginScale: [4, 8, 16, 24, 32],
    },
    hierarchy: {
      headingScale: ["32px", "24px", "20px", "16px"],
      bodyScale: ["14px", "12px", "10px"],
    },
    responsiveBehavior: {
      breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
      mobileStackOrder: ["header", "hero", "cards", "table", "sidebar", "footer"],
    },
    observedTokens: {
      colorPalette: ["#0055FF", "#112233", "#FAFAFA"], // external brand colors
      typographyScale: ["32px", "20px", "14px"],
      borderRadius: ["8px", "12px"],
      shadows: ["0 4px 6px rgba(0,0,0,0.1)"],
    },
    createdAt: "2026-09-04T12:00:00.000Z",
  };

  describe("1. Token Mapping & Brand Neutrality", () => {
    it("should map observed tokens strictly to Stazia canonical tokens and purge third-party brand hexes", () => {
      const tokens = mapObservedTokensToStaziaTokens(sampleBlueprint.observedTokens, "MEDICAL_EDITORIAL_V1");

      // Core brand tokens must strictly match Stazia Medical Editorial identity
      expect(tokens.primary).toBe(MEDICAL_EDITORIAL_TOKENS.primary);
      expect(tokens.secondary).toBe(MEDICAL_EDITORIAL_TOKENS.secondary);
      expect(tokens.background).toBe(MEDICAL_EDITORIAL_TOKENS.pageBackground);
      expect(tokens.surface).toBe(MEDICAL_EDITORIAL_TOKENS.surface);
      expect(tokens.textPrimary).toBe(MEDICAL_EDITORIAL_TOKENS.textPrimary);
      expect(tokens.border).toBe(MEDICAL_EDITORIAL_TOKENS.border);

      // Semantic tokens
      expect(tokens.success).toBe(STAZIA_SEMANTIC_TOKENS.success);
      expect(tokens.warning).toBe(STAZIA_SEMANTIC_TOKENS.warning);
      expect(tokens.danger).toBe(STAZIA_SEMANTIC_TOKENS.danger);

      // Third-party hex must not be in primary or secondary
      expect(tokens.primary).not.toBe("#0055FF");
      expect(tokens.background).not.toBe("#112233");
    });
  });

  describe("2. Component Registry Mapping", () => {
    it("should map recognized component roles to canonical Stazia components", () => {
      const mapping = mapBlueprintComponents(sampleBlueprint, "MEDICAL_EDITORIAL_V1");

      expect(mapping.card).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.CARD);
      expect(mapping.table).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.TABLE);
      expect(mapping.alert).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.ALERT);
      expect(mapping.hero).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.HERO);
      expect(mapping.header).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.HEADER);
      expect(mapping.sidebar).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.SIDEBAR);
    });

    it("should map unknown component roles safely to GenericStaziaBlock without breaking", () => {
      const customBlueprint: DesignBlueprint = {
        ...sampleBlueprint,
        componentTypes: [
          { id: "c_unknown", role: "UNKNOWN_WIDGET" as any, layoutProps: {}, observedHierarchy: 1 },
        ],
      };

      const mapping = mapBlueprintComponents(customBlueprint, "MEDICAL_EDITORIAL_V1");
      expect(mapping.unknown_widget).toBe(STAZIA_DESIGN_COMPONENT_REGISTRY.UNKNOWN);
    });
  });

  describe("3. Determinism and Immutability", () => {
    it("should be pure and deterministic (same input produces identical template)", () => {
      const template1 = transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");
      const template2 = transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");

      expect(template1.id).toBe(template2.id);
      expect(template1.sourceBlueprintId).toBe(template2.sourceBlueprintId);
      expect(template1.templateFamily).toBe(template2.templateFamily);
      expect(template1.staziaTokens).toEqual(template2.staziaTokens);
      expect(template1.componentMapping).toEqual(template2.componentMapping);
      expect(template1.status).toBe("DRAFT");
    });

    it("should leave the source Blueprint completely unmodified", () => {
      const originalCopy = JSON.parse(JSON.stringify(sampleBlueprint));
      transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");

      expect(sampleBlueprint).toEqual(originalCopy);
    });
  });

  describe("4. Fail-Closed Validation", () => {
    it("should reject invalid or missing blueprint with TransformationError", () => {
      expect(() => transformBlueprintToStaziaTemplate(null as any)).toThrow(TransformationError);
      expect(() => transformBlueprintToStaziaTemplate({} as any)).toThrow(TransformationError);
    });

    it("should enforce DRAFT status on generated template", () => {
      const template = transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");
      expect(template.status).toBe("DRAFT");

      const validation = validateStaziaDesignTemplate(template);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe("5. Responsive Preview Rendering", () => {
    it("should render StaziaDesignPreviewRenderer in Desktop 1440 viewport without crash", () => {
      const template = transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");
      render(<StaziaDesignPreviewRenderer template={template} viewport="DESKTOP_1440" />);

      expect(screen.getByText(/StaziaMed Editorial/i)).toBeInTheDocument();
      expect(screen.getByText(/Manejo da Hipertensão Arterial Resistente/i)).toBeInTheDocument();
      expect(screen.getByText(/Critérios Diagnósticos/i)).toBeInTheDocument();
      expect(screen.getByText(/Quadro Sinóptico Farmacológico/i)).toBeInTheDocument();
    });

    it("should render StaziaDesignPreviewRenderer in Tablet 768 viewport without crash", () => {
      const template = transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");
      render(<StaziaDesignPreviewRenderer template={template} viewport="TABLET_768" />);

      expect(screen.getByText(/StaziaMed Editorial/i)).toBeInTheDocument();
      expect(screen.getAllByText(/4ª Droga de Escolha/i).length).toBeGreaterThan(0);
    });

    it("should render StaziaDesignPreviewRenderer in Mobile 390 viewport without crash", () => {
      const template = transformBlueprintToStaziaTemplate(sampleBlueprint, "MEDICAL_EDITORIAL_V1");
      render(<StaziaDesignPreviewRenderer template={template} viewport="MOBILE_390" />);

      expect(screen.getByText(/StaziaMed Editorial/i)).toBeInTheDocument();
      expect(screen.getByText(/Pegadinha INEP/i)).toBeInTheDocument();
    });
  });

  describe("6. Admin UI Transformation Flow", () => {
    it("should switch viewports when viewport buttons are clicked in preview tab", () => {
      render(<AdminDesignStudioView />);

      const previewTab = screen.getByRole("button", { name: /pré-visualização/i });
      fireEvent.click(previewTab);

      const tabletBtn = screen.getByRole("button", { name: /tablet \(768px\)/i });
      const mobileBtn = screen.getByRole("button", { name: /mobile \(390px\)/i });
      const desktopBtn = screen.getByRole("button", { name: /desktop \(1440px\)/i });

      expect(tabletBtn).toBeInTheDocument();
      expect(mobileBtn).toBeInTheDocument();
      expect(desktopBtn).toBeInTheDocument();

      fireEvent.click(tabletBtn);
      fireEvent.click(mobileBtn);
      fireEvent.click(desktopBtn);
    });
  });
});
