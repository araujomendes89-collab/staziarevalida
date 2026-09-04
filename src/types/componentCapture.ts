/**
 * Domain types and contracts for Component Capture & Stazia Library (Etapa 1.27F).
 * Strictly defines component detection candidates, selected regions, ComponentBlueprints,
 * declarative component trees, and StaziaComponentDrafts.
 */

import { DesignReferenceRightsType } from "./adminDesignStudio";
import { ViewportType } from "./cloneEngine";

export type DetectedComponentType =
  | "HEADER"
  | "TOPBAR"
  | "NAV"
  | "SIDEBAR"
  | "HERO"
  | "CARD"
  | "CARD_GROUP"
  | "TABLE"
  | "FORM"
  | "SEARCH"
  | "FILTER_PANEL"
  | "TABS"
  | "ACCORDION"
  | "TIMELINE"
  | "PROGRESS"
  | "CALCULATOR_LAYOUT"
  | "LIST"
  | "TOOLBAR"
  | "SECTION"
  | "FOOTER"
  | "UNKNOWN";

export type ComponentClassification =
  | "VISUAL_COMPONENT"
  | "INTERACTIVE_COMPONENT"
  | "FUNCTIONAL_TOOL";

export type ComponentCaptureMode =
  | "FULL_PAGE"
  | "SECTION"
  | "COMPONENT"
  | "DESIGN_SYSTEM";

export type DeclarativeActionType =
  | "OPEN_MODAL"
  | "NAVIGATE"
  | "TOGGLE"
  | "EXPAND"
  | "COLLAPSE"
  | "SELECT"
  | "FILTER"
  | "SUBMIT_PLACEHOLDER";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedComponentCandidate {
  id: string;
  sourceReferenceId: string;
  type: DetectedComponentType;
  label: string;
  classification: ComponentClassification;
  viewport: ViewportType;
  boundingBox: BoundingBox;
  hierarchyPath: string;
  parentCandidateId?: string;
  childCount: number;
  interactionTypes: string[];
  structuralSummary: {
    tag: string;
    elementCount: number;
    hasInputs?: boolean;
    hasButtons?: boolean;
    hasTables?: boolean;
    hasMedia?: boolean;
    layoutHint?: string;
  };
  observedTokens: {
    background?: string;
    color?: string;
    fontSize?: string;
    borderRadius?: string;
    border?: string;
  };
  responsiveMatchKey?: string;
}

export interface SelectedComponentRegion {
  candidateId: string;
  sourceReferenceId: string;
  sourceBlueprintId: string;
  componentType: DetectedComponentType;
  classification: ComponentClassification;
  boundingBox: BoundingBox;
  structuralData: {
    tag: string;
    hierarchyPath: string;
    childCount: number;
    itemsCount?: number;
    elements?: Array<{ type: string; label?: string; tag?: string }>;
  };
  observedTokens: {
    background?: string;
    color?: string;
    borderRadius?: string;
    border?: string;
  };
  interactionObservations: string[];
  responsiveObservations: {
    desktop?: { width: number; height: number };
    tablet?: { width: number; height: number };
    mobile?: { width: number; height: number };
  };
}

export interface ComponentBlueprint {
  id: string;
  sourceBlueprintId: string;
  sourceReferenceId: string;
  componentType: DetectedComponentType;
  classification: ComponentClassification;
  layout: {
    display: "flex" | "grid" | "block";
    flexDirection?: "row" | "column";
    gridColumns?: number;
    gap?: string;
    padding?: string;
    maxWidth?: string;
  };
  children: Array<{
    id: string;
    type: string;
    role?: string;
    label?: string;
    props?: Record<string, any>;
  }>;
  tokens: {
    primary?: string;
    background?: string;
    surface?: string;
    text?: string;
    border?: string;
    radius?: string;
  };
  interactions: Array<{
    trigger: string;
    action: DeclarativeActionType;
    target?: string;
  }>;
  responsiveRules: {
    mobileStack?: boolean;
    tabletColumns?: number;
    desktopColumns?: number;
    overflowScroll?: boolean;
  };
  rightsType: DesignReferenceRightsType;
  functionalToolLogicCaptured: boolean; // strictly false for functional tools
  createdAt: string;
}

export type StaziaComponentNodeType =
  | "StaziaHeader"
  | "StaziaSidebar"
  | "StaziaHero"
  | "StaziaSection"
  | "StaziaCard"
  | "StaziaCardGroup"
  | "StaziaTable"
  | "StaziaButton"
  | "StaziaInput"
  | "StaziaSelect"
  | "StaziaTabs"
  | "StaziaAccordion"
  | "StaziaBadge"
  | "StaziaAlert"
  | "StaziaTimeline"
  | "StaziaProgress"
  | "StaziaFilterPanel"
  | "StaziaFormLayout"
  | "GenericStaziaBlock";

export interface StaziaComponentNode {
  id: string;
  type: StaziaComponentNodeType;
  label?: string;
  props?: Record<string, any>;
  children?: StaziaComponentNode[];
}

export type StaziaComponentDraftStatus = "DRAFT";

export interface StaziaComponentDraft {
  id: string;
  name: string;
  componentType: DetectedComponentType;
  classification: ComponentClassification;
  sourceComponentBlueprintId: string;
  sourceReferenceId: string;
  styleProfile: string;
  layout: {
    display: "flex" | "grid" | "block";
    flexDirection?: "row" | "column";
    gridColumns?: number;
    gap?: string;
    padding?: string;
  };
  componentTree: StaziaComponentNode;
  tokenMapping: Record<string, string>;
  interactionMapping: Array<{
    elementId: string;
    action: DeclarativeActionType;
    description: string;
  }>;
  responsiveRules: {
    mobileStack?: boolean;
    tabletColumns?: number;
    desktopColumns?: number;
  };
  status: StaziaComponentDraftStatus;
  functionalToolLogicCaptured: boolean; // strictly false
  createdAt: string;
  createdBy: string;
}

// ----------------------------------------------------------------------------
// Placement & Installation Plan Contracts (Items 30-33)
// ----------------------------------------------------------------------------

export type ComponentPlacementTarget =
  | "SIDEBAR"
  | "DASHBOARD"
  | "EXISTING_PAGE"
  | "NEW_PAGE"
  | "MODAL"
  | "ADMIN_PANEL";

export type ComponentDestinationType =
  | "ROUTE"
  | "MODAL"
  | "INLINE_PANEL";

export type ComponentInstallationVisibility =
  | "ADMIN_ONLY"
  | "STUDENT"
  | "ALL_AUTHENTICATED";

export interface StaziaComponentInstallationPlan {
  id: string;
  componentDraftId: string;
  target: ComponentPlacementTarget;
  targetRoute?: string;
  targetSlot?: string;
  buttonLabel?: string;
  icon?: string;
  destinationType: ComponentDestinationType;
  visibility: ComponentInstallationVisibility;
  status: "PLANNED" | "DRAFT";
  createdAt: string;
  notes?: string;
}
