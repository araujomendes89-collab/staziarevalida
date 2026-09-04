/**
 * Component Detection & Extraction Service (Etapa 1.27F).
 * Detects component candidates, maps regions, creates ComponentBlueprints,
 * and enforces strict rights policies (PUBLIC_REFERENCE_ONLY).
 */

import {
  DetectedComponentType,
  ComponentClassification,
  DetectedComponentCandidate,
  SelectedComponentRegion,
  ComponentBlueprint,
  BoundingBox,
  DeclarativeActionType,
} from "../types/componentCapture";
import { DesignBlueprint, DesignReferenceRightsType } from "../types/adminDesignStudio";

export function classifyComponent(type: DetectedComponentType): ComponentClassification {
  if (type === "CALCULATOR_LAYOUT") {
    return "FUNCTIONAL_TOOL";
  }
  if (
    type === "TABS" ||
    type === "ACCORDION" ||
    type === "FILTER_PANEL" ||
    type === "FORM" ||
    type === "SEARCH"
  ) {
    return "INTERACTIVE_COMPONENT";
  }
  return "VISUAL_COMPONENT";
}

/**
 * Detects component candidates from an analyzed DesignBlueprint.
 */
export function detectComponentsFromBlueprint(
  blueprint: DesignBlueprint,
  sourceReferenceId: string
): DetectedComponentCandidate[] {
  const candidates: DetectedComponentCandidate[] = [];

  // 1. Navigation / Header candidate
  if (blueprint.navigation) {
    const navType: DetectedComponentType =
      blueprint.navigation.type === "SIDEBAR"
        ? "SIDEBAR"
        : blueprint.navigation.type === "TABS"
        ? "TABS"
        : "HEADER";

    candidates.push({
      id: `candidate_nav_${blueprint.id}`,
      sourceReferenceId,
      type: navType,
      label: navType === "SIDEBAR" ? "Barra Lateral de Navegação" : "Cabeçalho Principal & Navegação",
      classification: classifyComponent(navType),
      viewport: "DESKTOP_1440",
      boundingBox: { x: 0, y: 0, width: navType === "SIDEBAR" ? 280 : 1440, height: navType === "SIDEBAR" ? 900 : 72 },
      hierarchyPath: "body > header",
      childCount: blueprint.navigation.hierarchy?.length || 4,
      interactionTypes: ["CLICK", "NAVIGATE"],
      structuralSummary: {
        tag: navType === "SIDEBAR" ? "aside" : "header",
        elementCount: 6,
        hasButtons: true,
        layoutHint: "sticky-top",
      },
      observedTokens: {
        background: blueprint.observedTokens.colorPalette[0] || "#FFFFFF",
        color: blueprint.observedTokens.colorPalette[1] || "#0A192F",
      },
      responsiveMatchKey: "main-navigation",
    });
  }

  // 2. Section candidates
  if (blueprint.sections && blueprint.sections.length > 0) {
    blueprint.sections.forEach((sec, idx) => {
      let candidateType: DetectedComponentType = "SECTION";
      let label = `Seção ${idx + 1} (${sec.type})`;

      const lowerType = (sec.type || "").toLowerCase();
      if (lowerType.includes("hero")) {
        candidateType = "HERO";
        label = "Hero Section / Destaque";
      } else if (lowerType.includes("card") || lowerType.includes("grid")) {
        candidateType = "CARD_GROUP";
        label = "Grade de Cartões / Cards";
      } else if (lowerType.includes("table") || lowerType.includes("data")) {
        candidateType = "TABLE";
        label = "Tabela Estruturada de Dados";
      } else if (lowerType.includes("filter")) {
        candidateType = "FILTER_PANEL";
        label = "Painel de Filtros & Busca";
      } else if (lowerType.includes("calc")) {
        candidateType = "CALCULATOR_LAYOUT";
        label = "Layout de Ferramenta / Calculadora";
      } else if (lowerType.includes("timeline")) {
        candidateType = "TIMELINE";
        label = "Linha do Tempo / Timeline";
      }

      candidates.push({
        id: `candidate_sec_${sec.id || idx}`,
        sourceReferenceId,
        type: candidateType,
        label,
        classification: classifyComponent(candidateType),
        viewport: "DESKTOP_1440",
        boundingBox: {
          x: 40,
          y: 80 + idx * 160,
          width: 1360,
          height: 150,
        },
        hierarchyPath: `body > main > section#${sec.id || idx}`,
        childCount: sec.childrenComponentTypes?.length || 3,
        interactionTypes: ["SCROLL", "CLICK"],
        structuralSummary: {
          tag: "section",
          elementCount: (sec.childrenComponentTypes?.length || 3) * 2,
          hasInputs: candidateType === "FILTER_PANEL" || candidateType === "CALCULATOR_LAYOUT",
          hasButtons: true,
          hasTables: candidateType === "TABLE",
          layoutHint: sec.layoutType || "grid-responsive",
        },
        observedTokens: {
          background: blueprint.observedTokens.colorPalette[idx % blueprint.observedTokens.colorPalette.length] || "#FFFFFF",
          color: "#0A192F",
          borderRadius: blueprint.observedTokens.borderRadius[0] || "12px",
        },
        responsiveMatchKey: `section-block-${idx}`,
      });
    });
  }

  // 3. Fallback standard components if sections are sparse
  if (candidates.length < 3) {
    candidates.push({
      id: `candidate_card_group_default`,
      sourceReferenceId,
      type: "CARD_GROUP",
      label: "Grupo de Cartões Informativos",
      classification: "VISUAL_COMPONENT",
      viewport: "DESKTOP_1440",
      boundingBox: { x: 40, y: 260, width: 1360, height: 220 },
      hierarchyPath: "body > main > div.cards-grid",
      childCount: 4,
      interactionTypes: ["CLICK", "HOVER"],
      structuralSummary: {
        tag: "div",
        elementCount: 8,
        hasButtons: true,
        layoutHint: "grid-cols-3",
      },
      observedTokens: {
        background: "#FFFFFF",
        color: "#0A192F",
        borderRadius: "16px",
      },
      responsiveMatchKey: "summary-cards",
    });

    candidates.push({
      id: `candidate_table_default`,
      sourceReferenceId,
      type: "TABLE",
      label: "Tabela de Referência Clínica",
      classification: "VISUAL_COMPONENT",
      viewport: "DESKTOP_1440",
      boundingBox: { x: 40, y: 500, width: 1360, height: 200 },
      hierarchyPath: "body > main > table.data-table",
      childCount: 5,
      interactionTypes: ["SCROLL"],
      structuralSummary: {
        tag: "table",
        elementCount: 15,
        hasTables: true,
        layoutHint: "horizontal-scroll",
      },
      observedTokens: {
        background: "#FFFFFF",
        color: "#0A192F",
        border: "1px solid #E2E8F0",
      },
      responsiveMatchKey: "clinical-table",
    });
  }

  return candidates;
}

/**
 * Creates a SelectedComponentRegion from a picked candidate.
 */
export function createSelectedComponentRegion(
  candidate: DetectedComponentCandidate,
  blueprint: DesignBlueprint
): SelectedComponentRegion {
  return {
    candidateId: candidate.id,
    sourceReferenceId: candidate.sourceReferenceId,
    sourceBlueprintId: blueprint.id,
    componentType: candidate.type,
    classification: candidate.classification,
    boundingBox: candidate.boundingBox,
    structuralData: {
      tag: candidate.structuralSummary.tag,
      hierarchyPath: candidate.hierarchyPath,
      childCount: candidate.childCount,
      itemsCount: candidate.structuralSummary.elementCount,
    },
    observedTokens: {
      background: candidate.observedTokens.background,
      color: candidate.observedTokens.color,
      borderRadius: candidate.observedTokens.borderRadius,
      border: candidate.observedTokens.border,
    },
    interactionObservations: candidate.interactionTypes,
    responsiveObservations: {
      desktop: { width: 1440, height: candidate.boundingBox.height },
      tablet: { width: 768, height: Math.round(candidate.boundingBox.height * 1.1) },
      mobile: { width: 390, height: Math.round(candidate.boundingBox.height * 1.3) },
    },
  };
}

/**
 * Builds a ComponentBlueprint from a selected region, strictly sanitizing
 * third-party assets and formulas under PUBLIC_REFERENCE_ONLY.
 */
export function buildComponentBlueprint(
  region: SelectedComponentRegion,
  rightsType: DesignReferenceRightsType = "PUBLIC_REFERENCE_ONLY"
): ComponentBlueprint {
  const isFunctionalTool = region.classification === "FUNCTIONAL_TOOL";

  // Declarative actions based on component type
  const interactions: Array<{
    trigger: string;
    action: DeclarativeActionType;
    target?: string;
  }> = [];

  if (region.componentType === "TABS") {
    interactions.push({ trigger: "click", action: "SELECT", target: "tab-panel" });
  } else if (region.componentType === "ACCORDION") {
    interactions.push({ trigger: "click", action: "TOGGLE", target: "accordion-item" });
  } else if (region.componentType === "FILTER_PANEL") {
    interactions.push({ trigger: "change", action: "FILTER", target: "list-view" });
  } else if (region.componentType === "CALCULATOR_LAYOUT") {
    interactions.push({ trigger: "submit", action: "SUBMIT_PLACEHOLDER", target: "result-box" });
  } else {
    interactions.push({ trigger: "click", action: "OPEN_MODAL", target: "detail-view" });
  }

  // Children representation (abstracted, never raw 3rd-party copy)
  const children: Array<{ id: string; type: string; role?: string; label?: string; props?: Record<string, any> }> = [];

  if (region.componentType === "CARD_GROUP") {
    for (let i = 0; i < 3; i++) {
      children.push({
        id: `card_item_${i + 1}`,
        type: "StaziaCard",
        role: "info-card",
        label: `Item Demonstrativo ${i + 1}`,
        props: { index: i + 1 },
      });
    }
  } else if (region.componentType === "FILTER_PANEL") {
    children.push({ id: "filter_search", type: "StaziaInput", label: "Buscar por termo ou CID" });
    children.push({ id: "filter_area", type: "StaziaSelect", label: "Filtrar por Especialidade Médica" });
    children.push({ id: "filter_btn", type: "StaziaButton", label: "Aplicar Filtros" });
  } else if (region.componentType === "CALCULATOR_LAYOUT") {
    children.push({ id: "calc_input_1", type: "StaziaInput", label: "Parâmetro Clínico A (Ex: Idade / PA Sistólica)" });
    children.push({ id: "calc_input_2", type: "StaziaInput", label: "Parâmetro Clínico B (Ex: Creatinina / FC)" });
    children.push({ id: "calc_btn", type: "StaziaButton", label: "Calcular Escore" });
    children.push({ id: "calc_result", type: "StaziaAlert", label: "Área de Demonstração do Resultado" });
  } else if (region.componentType === "TABLE") {
    children.push({ id: "table_header", type: "StaziaTable", label: "Tabela de Condutas e Critérios" });
  } else if (region.componentType === "TIMELINE") {
    children.push({ id: "timeline_1", type: "StaziaTimeline", label: "Etapa 1: Diagnóstico Inicial" });
    children.push({ id: "timeline_2", type: "StaziaTimeline", label: "Etapa 2: Conduta Terapêutica" });
  } else {
    children.push({ id: "generic_block", type: "GenericStaziaBlock", label: `Bloco ${region.componentType}` });
  }

  return {
    id: `comp_bp_${region.candidateId}_${Date.now()}`,
    sourceBlueprintId: region.sourceBlueprintId,
    sourceReferenceId: region.sourceReferenceId,
    componentType: region.componentType,
    classification: region.classification,
    layout: {
      display: region.componentType === "CARD_GROUP" ? "grid" : "flex",
      flexDirection: "column",
      gridColumns: region.componentType === "CARD_GROUP" ? 3 : 1,
      gap: "16px",
      padding: "24px",
      maxWidth: "1140px",
    },
    children,
    tokens: {
      primary: "#0D9488",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#0A192F",
      border: "#E2E8F0",
      radius: region.observedTokens.borderRadius || "12px",
    },
    interactions,
    responsiveRules: {
      mobileStack: true,
      tabletColumns: region.componentType === "CARD_GROUP" ? 2 : 1,
      desktopColumns: region.componentType === "CARD_GROUP" ? 3 : 1,
      overflowScroll: region.componentType === "TABLE",
    },
    rightsType,
    functionalToolLogicCaptured: false, // strictly false
    createdAt: new Date().toISOString(),
  };
}
