import { describe, it, expect } from "vitest";
import {
  validateCloneUrl,
  resolveCloneExtractionPolicy,
  sanitizeCloneExtraction,
  buildDesignBlueprint,
  transformBlueprintToStaziaTemplate,
} from "../services/cloneEngineService";
import {
  JCodesMoreCloneEngineAdapter,
  defaultCloneEngineAdapter,
} from "../services/jcodesMoreCloneAdapter";
import {
  CloneAnalysisRequest,
  RawCloneExtraction,
  CloneEngineAdapter,
} from "../types/cloneEngine";
import { DesignReferenceRightsType } from "../types/adminDesignStudio";
import { STUDENT_NAVIGATION_CONFIG } from "../config/navigation";

describe("JCodesMore Clone Engine Adapter & Sanitization Contracts (Etapa 1.27C)", () => {
  describe("1. URL Validation & SSRF Protection Rules", () => {
    it("should accept valid HTTP and HTTPS URLs", () => {
      const validUrls = [
        "https://diretrizes.cardiol.br/2024/hipertensao",
        "http://bvsms.saude.gov.br/pcdt",
        "https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/revalida",
      ];

      for (const url of validUrls) {
        const res = validateCloneUrl(url);
        expect(res.isValid).toBe(true);
        expect(res.error).toBeUndefined();
        expect(res.sanitizedUrl).toBeDefined();
      }
    });

    it("should reject empty, malformed, or non-string inputs", () => {
      expect(validateCloneUrl("").isValid).toBe(false);
      expect(validateCloneUrl("   ").isValid).toBe(false);
      expect(validateCloneUrl("not-a-url").isValid).toBe(false);
      expect(validateCloneUrl(undefined).error).toBe("INVALID_URL");
    });

    it("should reject unsafe protocols (file, javascript, data, ftp)", () => {
      expect(validateCloneUrl("file:///etc/passwd").error).toBe("UNSUPPORTED_PROTOCOL");
      expect(validateCloneUrl("javascript:alert(1)").error).toBe("UNSUPPORTED_PROTOCOL");
      expect(validateCloneUrl("data:text/html,<h1>Test</h1>").error).toBe("UNSUPPORTED_PROTOCOL");
      expect(validateCloneUrl("ftp://files.example.com").error).toBe("UNSUPPORTED_PROTOCOL");
    });

    it("should block localhost, loopback, and private IPv4 ranges (SSRF Protection)", () => {
      const blockedSsrfUrls = [
        "http://localhost:3000/admin",
        "https://127.0.0.1:8080",
        "http://0.0.0.0/status",
        "http://10.0.0.1/internal-api",
        "http://172.16.0.1/private",
        "http://172.31.255.255/admin",
        "http://192.168.1.1/router",
        "http://169.254.169.254/latest/meta-data", // AWS/GCP metadata endpoint
      ];

      for (const url of blockedSsrfUrls) {
        const res = validateCloneUrl(url);
        expect(res.isValid).toBe(false);
        expect(res.error).toBe("INVALID_URL");
        expect(res.message).toMatch(/SSRF|loopback|privado/i);
      }
    });
  });

  describe("2. Rights Policy Resolution", () => {
    it("should resolve liberal policies for OWNED, LICENSED, and AUTHORIZED rights", () => {
      const rights: DesignReferenceRightsType[] = ["OWNED", "LICENSED", "AUTHORIZED"];
      for (const r of rights) {
        const policy = resolveCloneExtractionPolicy(r);
        expect(policy.rightsType).toBe(r);
        expect(policy.allowDirectAssetCopy).toBe(true);
        expect(policy.allowBrandingPreservation).toBe(true);
        expect(policy.allowTextContentCopy).toBe(true);
        expect(policy.mandatorySanitization).toBe(false);
      }
    });

    it("should resolve strict sanitization policy for PUBLIC_REFERENCE_ONLY", () => {
      const policy = resolveCloneExtractionPolicy("PUBLIC_REFERENCE_ONLY");
      expect(policy.rightsType).toBe("PUBLIC_REFERENCE_ONLY");
      expect(policy.allowDirectAssetCopy).toBe(false);
      expect(policy.allowBrandingPreservation).toBe(false);
      expect(policy.allowTextContentCopy).toBe(false);
      expect(policy.allowLayoutExtraction).toBe(true);
      expect(policy.allowTokenObservation).toBe(true);
      expect(policy.allowInteractionExtraction).toBe(true);
      expect(policy.mandatorySanitization).toBe(true);
    });
  });

  describe("3. Extraction Sanitization & Blueprint Construction", () => {
    const mockRawExtraction: RawCloneExtraction = {
      requestId: "req_test_123",
      targetUrl: "https://example-medical.com/page",
      rightsType: "PUBLIC_REFERENCE_ONLY",
      capturedAt: new Date().toISOString(),
      pageMetadata: {
        title: "Third Party Brand Exam Portal",
        description: "Copyrighted third party text",
      },
      viewportCaptures: [{ viewport: "DESKTOP_1440", captureUri: "gs://raw-captures/123.png" }],
      computedStyles: { body: { color: "#333" } },
      layoutObservations: [
        { region: "header", tag: "header", childrenCount: 3 },
        { region: "content", tag: "main", isSticky: false, childrenCount: 5 },
      ],
      interactionObservations: [
        { elementSelector: ".accordion-toggle", trigger: "CLICK", behaviorDescription: "Expands panel" },
      ],
      componentObservations: [
        { role: "CARD", observedClassNames: ["brand-logo-card", "proprietary-btn"], childCount: 2 },
      ],
      assetObservations: [
        { sourceUrl: "https://example-medical.com/logo.svg", type: "SVG", role: "BRAND_LOGO" },
        { sourceUrl: "https://example-medical.com/hero.jpg", type: "IMAGE", role: "HERO_BANNER" },
      ],
      observedTokens: {
        colors: [{ hex: "#0055FF", usageCount: 10 }],
        typography: [{ fontSize: "16px" }],
        spacing: [4, 8, 16],
        radii: ["8px"],
        shadows: ["0 2px 4px rgba(0,0,0,0.1)"],
        borders: ["1px solid #ccc"],
      },
    };

    it("should sanitize raw extraction by stripping third-party assets and class names for PUBLIC_REFERENCE_ONLY", () => {
      const sanitized = sanitizeCloneExtraction(mockRawExtraction, "PUBLIC_REFERENCE_ONLY");

      expect(sanitized.requestId).toBe("req_test_123");
      expect(sanitized.rightsType).toBe("PUBLIC_REFERENCE_ONLY");
      expect((sanitized as any).assetObservations).toBeUndefined();

      // Component class names should be stripped
      for (const comp of sanitized.componentObservations) {
        expect((comp as any).observedClassNames).toBeUndefined();
      }
    });

    it("should build an abstract DesignBlueprint compatible with Stazia Design System", () => {
      const sanitized = sanitizeCloneExtraction(mockRawExtraction, "PUBLIC_REFERENCE_ONLY");
      const blueprint = buildDesignBlueprint(sanitized);

      expect(blueprint.id).toBe("dbp_req_test_123");
      expect(blueprint.version).toBe(1);
      expect(blueprint.layout.gridColumns).toBe(12);
      expect(blueprint.sections).toHaveLength(2);
      expect(blueprint.componentTypes).toHaveLength(1);
      expect(blueprint.componentTypes[0].role).toBe("CARD");
    });

    it("should transform blueprint to a draft StaziaDesignTemplate signature", () => {
      const sanitized = sanitizeCloneExtraction(mockRawExtraction, "PUBLIC_REFERENCE_ONLY");
      const blueprint = buildDesignBlueprint(sanitized);
      const staziaTemplate = transformBlueprintToStaziaTemplate(blueprint);

      expect(staziaTemplate.id).toBe("sdt_transformed_dbp_req_test_123");
      expect(staziaTemplate.templateFamily).toBe("MEDICAL_EDITORIAL");
      expect(staziaTemplate.status).toBe("DRAFT");
      expect(staziaTemplate.staziaTokens.primary).toBe("#0D9488");
    });
  });

  describe("4. JCodesMore Adapter & Connected Runner Contract", () => {
    it("should conform to CloneEngineAdapter interface and start in connected runner mode", () => {
      const adapter: CloneEngineAdapter = new JCodesMoreCloneEngineAdapter();
      expect(adapter.isConnected).toBe(true);
      expect(adapter.engineName).toContain("Playwright");
    });

    it("should handle offline or unavailable endpoint gracefully", async () => {
      const request: CloneAnalysisRequest = {
        requestId: "req_demo_01",
        url: "https://diretrizes.cardiol.br/has-2024",
        rightsType: "PUBLIC_REFERENCE_ONLY",
        analysisMode: "STRUCTURE_LAYOUT",
        requestedBy: "admin",
        requestedAt: new Date().toISOString(),
      };

      // Mock fetch rejection
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      try {
        const result = await defaultCloneEngineAdapter.analyze(request);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe("CLONE_ENGINE_UNAVAILABLE");
        expect(result.error?.message).toMatch(/indisponível|conexão/i);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should validate and return INVALID_URL before checking engine connection", async () => {
      const invalidRequest: CloneAnalysisRequest = {
        requestId: "req_demo_02",
        url: "http://localhost:8080/secret",
        rightsType: "PUBLIC_REFERENCE_ONLY",
        analysisMode: "FULL_PAGE",
        requestedBy: "admin",
        requestedAt: new Date().toISOString(),
      };

      const result = await defaultCloneEngineAdapter.analyze(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_URL");
    });

    it("should ensure student navigation remains completely isolated from clone engine", () => {
      const studentNavIds = STUDENT_NAVIGATION_CONFIG.map((s) => s.id);
      expect(studentNavIds).not.toContain("design-studio");
      expect(studentNavIds).not.toContain("clone-engine");
      expect(studentNavIds).not.toContain("admin");
    });
  });
});
