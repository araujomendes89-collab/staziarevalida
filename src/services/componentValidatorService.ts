/**
 * Component Validation & Security Verification Service (Etapa 1.27F / Items 40-41).
 * Strictly validates ComponentBlueprints, StaziaComponentDrafts, and InstallationPlans,
 * enforcing architectural isolation and sanitizing harmful or proprietary injection.
 */

import {
  ComponentBlueprint,
  StaziaComponentDraft,
  StaziaComponentInstallationPlan,
  StaziaComponentNode,
} from "../types/componentCapture";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const FORBIDDEN_SECURITY_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, message: "Raw <script> tags are forbidden in component blueprints/drafts" },
  { pattern: /javascript\s*:/gi, message: "javascript: pseudo-protocol URIs are forbidden" },
  { pattern: /\bon[a-z]+\s*=/gi, message: "Inline HTML event handlers (e.g. onclick, onload) are forbidden" },
  { pattern: /eval\s*\(/gi, message: "Arbitrary dynamic code execution (eval) is forbidden" },
  { pattern: /<iframe\b[^>]*>/gi, message: "Raw unvalidated <iframe> tags are forbidden" },
  { pattern: /https?:\/\/[^\s"']+\.(?:js|mjs|cjs)/gi, message: "External executable script URLs are forbidden" },
];

/**
 * Checks a string or object tree for security violations.
 */
export function checkSecurityPatterns(data: any): string[] {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  const errors: string[] = [];

  for (const { pattern, message } of FORBIDDEN_SECURITY_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(message);
    }
  }

  return errors;
}

/**
 * Validates a ComponentBlueprint.
 */
export function validateComponentBlueprint(blueprint: ComponentBlueprint): ValidationResult {
  const errors: string[] = [];

  if (!blueprint) {
    return { valid: false, errors: ["Blueprint is null or undefined"] };
  }

  if (!blueprint.id || typeof blueprint.id !== "string") {
    errors.push("ComponentBlueprint must have a valid string id");
  }

  if (!blueprint.componentType) {
    errors.push("ComponentBlueprint must specify a componentType");
  }

  if (!blueprint.classification) {
    errors.push("ComponentBlueprint must specify a classification (VISUAL, INTERACTIVE, or FUNCTIONAL_TOOL)");
  }

  if (blueprint.classification === "FUNCTIONAL_TOOL" && blueprint.functionalToolLogicCaptured !== false) {
    errors.push("Functional tools must have functionalToolLogicCaptured strictly set to false");
  }

  // Rights check
  if (blueprint.rightsType === "PUBLIC_REFERENCE_ONLY") {
    // Ensure no proprietary external branding/asset URLs are captured
    const serialized = JSON.stringify(blueprint);
    if (/cdn\.prop-hospital\.com|logo-secret\.svg|proprietary-formula/i.test(serialized)) {
      errors.push("Proprietary external asset URLs or brand signatures detected in PUBLIC_REFERENCE_ONLY blueprint");
    }
  }

  // Security pattern check
  const secErrors = checkSecurityPatterns(blueprint);
  errors.push(...secErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a StaziaComponentDraft.
 */
export function validateStaziaComponentDraft(draft: StaziaComponentDraft): ValidationResult {
  const errors: string[] = [];

  if (!draft) {
    return { valid: false, errors: ["StaziaComponentDraft is null or undefined"] };
  }

  if (!draft.id || typeof draft.id !== "string") {
    errors.push("Draft must have a valid string id");
  }

  if (!draft.name || draft.name.trim().length === 0) {
    errors.push("Draft must have a non-empty name");
  }

  if (!draft.componentTree || typeof draft.componentTree !== "object") {
    errors.push("Draft must have a valid componentTree");
  } else {
    validateComponentNode(draft.componentTree, errors);
  }

  if (draft.classification === "FUNCTIONAL_TOOL" && draft.functionalToolLogicCaptured !== false) {
    errors.push("Draft for functional tool must have functionalToolLogicCaptured === false");
  }

  if (!draft.styleProfile) {
    errors.push("Draft must specify a styleProfile");
  }

  // Security pattern check
  const secErrors = checkSecurityPatterns(draft);
  errors.push(...secErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateComponentNode(node: StaziaComponentNode, errors: string[]) {
  if (!node.id) {
    errors.push("Component node must have an id");
  }
  if (!node.type) {
    errors.push("Component node must have a type");
  }
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child) => validateComponentNode(child, errors));
  }
}

/**
 * Validates an Installation Plan without touching the production app or routes.
 */
export function validateInstallationPlan(plan: StaziaComponentInstallationPlan): ValidationResult {
  const errors: string[] = [];

  if (!plan) {
    return { valid: false, errors: ["Installation plan is null or undefined"] };
  }

  if (!plan.id) {
    errors.push("Installation plan must have an id");
  }

  if (!plan.componentDraftId) {
    errors.push("Installation plan must reference a componentDraftId");
  }

  const validTargets = ["SIDEBAR", "DASHBOARD", "EXISTING_PAGE", "NEW_PAGE", "MODAL", "ADMIN_PANEL"];
  if (!validTargets.includes(plan.target)) {
    errors.push(`Invalid placement target: ${plan.target}. Must be one of: ${validTargets.join(", ")}`);
  }

  const validDestinations = ["ROUTE", "MODAL", "INLINE_PANEL"];
  if (!validDestinations.includes(plan.destinationType)) {
    errors.push(`Invalid destination type: ${plan.destinationType}. Must be one of: ${validDestinations.join(", ")}`);
  }

  const validVisibilities = ["ADMIN_ONLY", "STUDENT", "ALL_AUTHENTICATED"];
  if (!validVisibilities.includes(plan.visibility)) {
    errors.push(`Invalid visibility: ${plan.visibility}. Must be one of: ${validVisibilities.join(", ")}`);
  }

  if (plan.destinationType === "ROUTE" && (!plan.targetRoute || !plan.targetRoute.startsWith("/"))) {
    errors.push("Route destinations must provide a valid absolute targetRoute starting with '/'");
  }

  const secErrors = checkSecurityPatterns(plan);
  errors.push(...secErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}
