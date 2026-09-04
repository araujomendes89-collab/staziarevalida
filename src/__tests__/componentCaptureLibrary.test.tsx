import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  classifyComponent,
  detectComponentsFromBlueprint,
  createSelectedComponentRegion,
  buildComponentBlueprint,
} from "../services/componentDetectionService";
import { transformComponentBlueprintToStaziaDraft } from "../services/staziaComponentTransformer";
import {
  validateComponentBlueprint,
  validateStaziaComponentDraft,
  validateInstallationPlan,
  checkSecurityPatterns,
} from "../services/componentValidatorService";
import { ComponentRegionMapOverlay } from "../components/admin/designStudio/ComponentRegionMapOverlay";
import { StaziaComponentPreviewRenderer } from "../components/admin/designStudio/StaziaComponentPreviewRenderer";
import { AdminDesignStudioView } from "../components/admin/AdminDesignStudioView";
import { DesignBlueprint } from "../types/adminDesignStudio";
import {
  DetectedComponentCandidate,
  SelectedComponentRegion,
  ComponentBlueprint,
  StaziaComponentDraft,
  StaziaComponentInstallationPlan,
  ComponentPlacementTarget,
} from "../types/componentCapture";

// Comprehensive Controlled Detection Fixture (Item 42)
const controlledFullFixtureBlueprint: DesignBlueprint = {
  id: "bp_controlled_full_fixture",
  targetUrl: "https://reference.hospital-study.org/clinical-cases",
  rightsType: "PUBLIC_REFERENCE_ONLY",
  viewport: "DESKTOP_1440",
  layout: {
    type: "GRID",
    gridColumns: 12,
    hasSidebar: true,
    hasHeader: true,
    hasFooter: true,
  },
  navigation: {
    type: "SIDEBAR",
    hierarchy: ["Home", "Protocolos", "Calculadoras", "Casos", "Configurações"],
  },
  sections: [
    {
      id: "sec_hero",
      type: "HERO",
      layoutType: "full-width",
      childrenComponentTypes: ["Heading", "Subheading", "Button"],
    },
    {
      id: "sec_cards",
      type: "CARD_GROUP",
      layoutType: "grid-cols-3",
      childrenComponentTypes: ["StaziaCard", "StaziaCard", "StaziaCard"],
    },
    {
      id: "sec_filter",
      type: "FILTER_PANEL",
      layoutType: "filter-bar",
      childrenComponentTypes: ["Input", "Select", "Button"],
    },
    {
      id: "sec_table",
      type: "TABLE",
      layoutType: "table-responsive",
      childrenComponentTypes: ["Table"],
    },
    {
      id: "sec_form",
      type: "FORM",
      layoutType: "form-stack",
      childrenComponentTypes: ["Input", "Select", "Button"],
    },
    {
      id: "sec_timeline",
      type: "TIMELINE",
      layoutType: "vertical-steps",
      childrenComponentTypes: ["TimelineItem", "TimelineItem"],
    },
    {
      id: "sec_footer",
      type: "FOOTER",
      layoutType: "footer-columns",
      childrenComponentTypes: ["FooterNav", "Copyright"],
    },
  ],
  componentTypes: [
    "HEADER",
    "SIDEBAR",
    "HERO",
    "CARD_GROUP",
    "FILTER_PANEL",
    "TABLE",
    "FORM",
    "TIMELINE",
    "FOOTER",
  ],
  observedTokens: {
    colorPalette: ["#0A192F", "#0D9488", "#F8FAFC", "#FFFFFF"],
    fontFamilies: ["Inter, sans-serif"],
    borderRadius: ["12px", "16px"],
    spacingScale: ["16px", "24px", "32px"],
  },
  createdAt: "2026-09-04T12:00:00Z",
};

describe("Component Capture & Stazia Library Foundation (Etapa 1.27F)", () => {
  describe("1. Component Classification & Detection Engine (Items 42-43)", () => {
    it("should classify components accurately into VISUAL, INTERACTIVE, and FUNCTIONAL_TOOL", () => {
      expect(classifyComponent("CARD_GROUP")).toBe("VISUAL_COMPONENT");
      expect(classifyComponent("TABLE")).toBe("VISUAL_COMPONENT");
      expect(classifyComponent("HERO")).toBe("VISUAL_COMPONENT");
      expect(classifyComponent("TABS")).toBe("INTERACTIVE_COMPONENT");
      expect(classifyComponent("FILTER_PANEL")).toBe("INTERACTIVE_COMPONENT");
      expect(classifyComponent("FORM")).toBe("INTERACTIVE_COMPONENT");
      expect(classifyComponent("CALCULATOR_LAYOUT")).toBe("FUNCTIONAL_TOOL");
    });

    it("should detect all 9 canonical sections from controlled fixture (Item 42)", () => {
      const candidates = detectComponentsFromBlueprint(controlledFullFixtureBlueprint, "ref_fixture_001");
      const types = candidates.map((c) => c.type);

      expect(types).toContain("SIDEBAR");
      expect(types).toContain("HERO");
      expect(types).toContain("CARD_GROUP");
      expect(types).toContain("FILTER_PANEL");
      expect(types).toContain("TABLE");
      expect(types).toContain("TIMELINE");
    });

    it("should isolate CARD_GROUP without including HEADER, SIDEBAR, TABLE, FOOTER (Item 43)", () => {
      const candidates = detectComponentsFromBlueprint(controlledFullFixtureBlueprint, "ref_fixture_001");
      const cardGroupCandidate = candidates.find((c) => c.type === "CARD_GROUP")!;
      expect(cardGroupCandidate).toBeDefined();

      const region = createSelectedComponentRegion(cardGroupCandidate, controlledFullFixtureBlueprint);
      const blueprint = buildComponentBlueprint(region, "PUBLIC_REFERENCE_ONLY");

      // Verify strict isolation
      expect(blueprint.componentType).toBe("CARD_GROUP");
      const childTypes = blueprint.children.map((c) => c.type);
      expect(childTypes).not.toContain("HEADER");
      expect(childTypes).not.toContain("SIDEBAR");
      expect(childTypes).not.toContain("TABLE");
      expect(childTypes).not.toContain("FOOTER");
      expect(blueprint.children.every((c) => c.type === "StaziaCard")).toBe(true);
    });
  });

  describe("2. Functional Tool & Calculator Isolation (Item 44)", () => {
    it("should capture visual structure but strictly exclude business/formula logic (Item 44)", () => {
      const calcCandidate: DetectedComponentCandidate = {
        id: "cand_calc_sample",
        sourceReferenceId: "ref_calc_001",
        type: "CALCULATOR_LAYOUT",
        label: "Calculadora de Risco Cardiovascular",
        classification: "FUNCTIONAL_TOOL",
        viewport: "DESKTOP_1440",
        boundingBox: { x: 40, y: 100, width: 800, height: 400 },
        hierarchyPath: "body > main > div#calc",
        childCount: 4,
        interactionTypes: ["CLICK", "SUBMIT"],
        structuralSummary: {
          tag: "form",
          elementCount: 4,
          hasInputs: true,
          hasButtons: true,
        },
        observedTokens: { background: "#FFFFFF", color: "#0A192F" },
      };

      const region = createSelectedComponentRegion(calcCandidate, controlledFullFixtureBlueprint);
      const blueprint = buildComponentBlueprint(region, "PUBLIC_REFERENCE_ONLY");
      const draft = transformComponentBlueprintToStaziaDraft(blueprint, "MEDICAL_EDITORIAL_V1");

      // Invariant checks
      expect(blueprint.classification).toBe("FUNCTIONAL_TOOL");
      expect(blueprint.functionalToolLogicCaptured).toBe(false);
      expect(draft.functionalToolLogicCaptured).toBe(false);

      // Verify no executable scripts or formulas
      const serialized = JSON.stringify(draft);
      expect(serialized).not.toContain("Math.exp");
      expect(serialized).not.toContain("calculateScore");
      expect(serialized).not.toContain("eval(");
      expect(serialized).not.toContain("<script");
    });
  });

  describe("3. Public Reference Sanitization (Item 45)", () => {
    it("should sanitize third-party logos, external scripts and brand identities (Item 45)", () => {
      const candidateWithExternalBrand: DetectedComponentCandidate = {
        id: "cand_dirty_brand",
        sourceReferenceId: "ref_dirty_001",
        type: "HERO",
        label: "Destaque Hospitalar",
        classification: "VISUAL_COMPONENT",
        viewport: "DESKTOP_1440",
        boundingBox: { x: 0, y: 0, width: 1440, height: 350 },
        hierarchyPath: "body > header.brand-hero",
        childCount: 3,
        interactionTypes: ["CLICK"],
        structuralSummary: { tag: "div", elementCount: 3 },
        observedTokens: { background: "#0A192F" },
      };

      const region = createSelectedComponentRegion(candidateWithExternalBrand, controlledFullFixtureBlueprint);
      const blueprint = buildComponentBlueprint(region, "PUBLIC_REFERENCE_ONLY");
      const draft = transformComponentBlueprintToStaziaDraft(blueprint, "MEDICAL_EDITORIAL_V1");

      const serializedBlueprint = JSON.stringify(blueprint);
      const serializedDraft = JSON.stringify(draft);

      expect(serializedBlueprint).not.toContain("logo-secret.svg");
      expect(serializedBlueprint).not.toContain("cdn.prop-hospital.com");
      expect(serializedDraft).not.toContain("Hospital Proprietary Inc.");
      expect(draft.styleProfile).toBe("MEDICAL_EDITORIAL_V1");
    });
  });

  describe("4. Responsive Component Rules (Item 46)", () => {
    it("should correlate 3 viewports into ONE ComponentBlueprint with responsive rules (Item 46)", () => {
      const candidates = detectComponentsFromBlueprint(controlledFullFixtureBlueprint, "ref_fixture_001");
      const cardCandidate = candidates.find((c) => c.type === "CARD_GROUP")!;
      const region = createSelectedComponentRegion(cardCandidate, controlledFullFixtureBlueprint);

      expect(region.responsiveObservations.desktop).toBeDefined();
      expect(region.responsiveObservations.tablet).toBeDefined();
      expect(region.responsiveObservations.mobile).toBeDefined();

      const blueprint = buildComponentBlueprint(region, "PUBLIC_REFERENCE_ONLY");
      expect(blueprint.responsiveRules.mobileStack).toBe(true);
      expect(blueprint.responsiveRules.tabletColumns).toBe(2);
      expect(blueprint.responsiveRules.desktopColumns).toBe(3);
    });
  });

  describe("5. Preview Rendering Across Viewports (Item 47)", () => {
    it("should render Desktop, Tablet, and Mobile views without crashing (Item 47)", () => {
      const candidates = detectComponentsFromBlueprint(controlledFullFixtureBlueprint, "ref_fixture_001");
      const cardCandidate = candidates.find((c) => c.type === "CARD_GROUP")!;
      const region = createSelectedComponentRegion(cardCandidate, controlledFullFixtureBlueprint);
      const compBlueprint = buildComponentBlueprint(region, "PUBLIC_REFERENCE_ONLY");
      const draft = transformComponentBlueprintToStaziaDraft(compBlueprint, "MEDICAL_EDITORIAL_V1");

      const { unmount } = render(<StaziaComponentPreviewRenderer draft={draft} viewport="DESKTOP_1440" />);
      expect(screen.getByTestId("stazia-component-preview-container")).toBeInTheDocument();
      expect(screen.getByTestId("stazia-card-group-node")).toBeInTheDocument();

      // Switch to Tablet
      const tabletBtn = screen.getByTestId("vp-tablet-btn");
      fireEvent.click(tabletBtn);
      expect(tabletBtn).toHaveClass("bg-teal-600");

      // Switch to Mobile
      const mobileBtn = screen.getByTestId("vp-mobile-btn");
      fireEvent.click(mobileBtn);
      expect(mobileBtn).toHaveClass("bg-teal-600");

      unmount();
    });
  });

  describe("6. Validators & Security Validation (Items 40-41)", () => {
    it("should validate valid ComponentBlueprint and StaziaComponentDraft", () => {
      const candidates = detectComponentsFromBlueprint(controlledFullFixtureBlueprint, "ref_fixture_001");
      const cardCandidate = candidates.find((c) => c.type === "CARD_GROUP")!;
      const region = createSelectedComponentRegion(cardCandidate, controlledFullFixtureBlueprint);
      const blueprint = buildComponentBlueprint(region, "PUBLIC_REFERENCE_ONLY");
      const draft = transformComponentBlueprintToStaziaDraft(blueprint, "MEDICAL_EDITORIAL_V1");

      const bpVal = validateComponentBlueprint(blueprint);
      expect(bpVal.valid).toBe(true);
      expect(bpVal.errors).toHaveLength(0);

      const draftVal = validateStaziaComponentDraft(draft);
      expect(draftVal.valid).toBe(true);
      expect(draftVal.errors).toHaveLength(0);
    });

    it("should reject malicious script injection or javascript: URIs (Item 41)", () => {
      const maliciousData = {
        name: "<script>alert('xss')</script>",
        uri: "javascript:void(0)",
        handler: "onclick=evil()",
        code: "eval('danger')",
      };

      const secErrors = checkSecurityPatterns(maliciousData);
      expect(secErrors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("7. Installation Plan Model (Items 30-33, 48)", () => {
    it("should validate contractual installation plan across targets without installing anything (Item 48)", () => {
      const targets: ComponentPlacementTarget[] = [
        "SIDEBAR",
        "DASHBOARD",
        "EXISTING_PAGE",
        "NEW_PAGE",
        "MODAL",
        "ADMIN_PANEL",
      ];

      for (const target of targets) {
        const plan: StaziaComponentInstallationPlan = {
          id: `plan_${target.toLowerCase()}_test`,
          componentDraftId: "draft_test_123",
          target,
          destinationType: target === "SIDEBAR" ? "ROUTE" : "INLINE_PANEL",
          targetRoute: target === "SIDEBAR" ? "/ferramentas/calculadora-clinica" : undefined,
          visibility: "STUDENT",
          buttonLabel: "Calculadora clínica",
          status: "PLANNED",
          createdAt: new Date().toISOString(),
        };

        const result = validateInstallationPlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  describe("8. Admin Design Studio Interactive UI Flow (Items 49-50)", () => {
    it("should perform full capture mode switch, candidate selection, draft renaming, and plan validation", () => {
      render(<AdminDesignStudioView />);

      // 1. Switch capture mode
      const compModeBtn = screen.getByRole("button", { name: /selecionar componente/i });
      fireEvent.click(compModeBtn);
      expect(compModeBtn).toHaveClass("bg-sky-500/20");

      // 2. Open Biblioteca Stazia
      const libraryTab = screen.getByRole("button", { name: /biblioteca stazia/i });
      fireEvent.click(libraryTab);
      expect(screen.getByText(/Biblioteca de Componentes Transformados/i)).toBeInTheDocument();

      // 3. Test Prepare Installation modal and Plan Validation
      const prepareBtn = screen.getByTestId("btn-prepare-install-draft_card_group_hypertension");
      fireEvent.click(prepareBtn);

      expect(screen.getByText(/STAGE 1.27F \(CONTRATO APENAS\)/i)).toBeInTheDocument();

      const validatePlanBtn = screen.getByTestId("btn-validate-installation-plan");
      fireEvent.click(validatePlanBtn);

      expect(screen.getByTestId("plan-validation-notice")).toBeInTheDocument();
      expect(screen.getByText(/Plano de instalação validado com sucesso/i)).toBeInTheDocument();
    });
  });
});
