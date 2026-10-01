/**
 * Web Content & Prompt Injection Guard for JCodesMore Worker (1.27G.1.1).
 */

import { DesignReferenceRightsType } from "../../src/types/adminDesignStudio";

export class JCodesMorePromptInjectionGuard {
  private static DANGEROUS_PATTERNS = [
    /ignore (all )?previous instructions/i,
    /system prompt override/i,
    /read ~\/\.ssh/i,
    /cat \/etc\/passwd/i,
    /upload (the )?env(ironment)?/i,
    /curl https?:\/\//i,
    /open localhost/i,
    /exec\(/i,
    /eval\(/i,
  ];

  /**
   * Analyzes extracted web text content for prompt injection attempts.
   * Returns sanitized status and logs detection without modifying server policy.
   */
  static inspectWebContent(rawText: string): { hasInjectionAttempt: boolean; patternsDetected: string[] } {
    if (!rawText || typeof rawText !== "string") {
      return { hasInjectionAttempt: false, patternsDetected: [] };
    }

    const detected: string[] = [];
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(rawText)) {
        detected.push(pattern.source);
      }
    }

    return {
      hasInjectionAttempt: detected.length > 0,
      patternsDetected: detected,
    };
  }

  /**
   * Enforces that policy parameters (rightsType, paths, allowedBinaries) cannot be altered by web content.
   */
  static enforceImmutablePolicy(
    serverRightsType: DesignReferenceRightsType,
    _webSuppliedContent?: string
  ): DesignReferenceRightsType {
    // Web content is strictly UNTRUSTED. Server rightsType is authoritative and immutable.
    return serverRightsType;
  }
}
