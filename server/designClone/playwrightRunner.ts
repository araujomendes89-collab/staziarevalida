import { chromium, Browser, Page } from "playwright";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { validateSsrfTargetUrl, SsrfValidationOptions } from "./ssrfValidator";
import {
  CloneAnalysisRequest,
  CloneAnalysisResult,
  RawCloneExtraction,
  SanitizedDesignExtraction,
  ViewportType,
  RawCloneAssetObservation,
  ObservedDesignTokens,
} from "../../src/types/cloneEngine";
import {
  sanitizeCloneExtraction,
  buildDesignBlueprint,
} from "../../src/services/cloneEngineService";

export interface IsolatedCloneRunnerOptions extends SsrfValidationOptions {
  timeoutMs?: number;
  captureScreenshots?: boolean;
}

export interface IsolatedCloneAnalysisResponse {
  success: boolean;
  request: CloneAnalysisRequest;
  rawExtraction?: RawCloneExtraction;
  sanitizedExtraction?: SanitizedDesignExtraction;
  blueprint?: any;
  summary?: {
    landmarksCount: number;
    componentsCount: number;
    colorsObserved: number;
    typographyCount: number;
    viewportsCaptured: number;
    executionTimeMs: number;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

const VIEWPORT_CONFIGS: Array<{ type: ViewportType; width: number; height: number }> = [
  { type: "DESKTOP_1440", width: 1440, height: 900 },
  { type: "TABLET_768", width: 768, height: 1024 },
  { type: "MOBILE_390", width: 390, height: 844 },
];

/**
 * Executes a fully isolated, secure browser automation inspection on a target URL.
 * Strictly adheres to SSRF boundaries, performs 3-viewport structural & token extraction,
 * sanitizes raw output, and builds a neutral DesignBlueprint.
 */
export async function executeIsolatedCloneAnalysis(
  request: CloneAnalysisRequest,
  options: IsolatedCloneRunnerOptions = {}
): Promise<IsolatedCloneAnalysisResponse> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 20000;
  const tempFilesToDelete: string[] = [];

  // 1. SSRF Pre-flight validation
  const ssrfCheck = await validateSsrfTargetUrl(request.url, {
    allowLocalTestHosts: options.allowLocalTestHosts,
  });

  if (!ssrfCheck.isSafe) {
    return {
      success: false,
      request,
      error: {
        code: "SSRF_VALIDATION_FAILED",
        message: ssrfCheck.reason || "Acesso ao host de destino bloqueado por proteção SSRF.",
        details: { resolvedIps: ssrfCheck.resolvedIps },
      },
    };
  }

  let browser: Browser | null = null;

  try {
    // 2. Launch ephemeral Chromium instance
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    // 3. Create fresh, completely isolated browser context (no cookies/storage sharing)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 StaziaMedDesignRunner/1.0",
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
    });

    const page: Page = await context.newPage();

    // 4. Request Interception & Redirect Re-validation
    await page.route("**/*", async (route) => {
      const reqUrl = route.request().url();
      const check = await validateSsrfTargetUrl(reqUrl, {
        allowLocalTestHosts: options.allowLocalTestHosts,
      });

      if (!check.isSafe) {
        // Block request immediately if destination IP violates SSRF rules
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    // 5. Navigate to initial target URL
    await page.goto(request.url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    // Short stabilization wait for DOM rendering
    await page.waitForTimeout(600);

    // 6. Multi-viewport inspections & temporary screenshots
    const viewportCaptures: Array<{ viewport: ViewportType; captureUri?: string }> = [];

    for (const vp of VIEWPORT_CONFIGS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      let tempScreenshotPath: string | undefined;
      if (options.captureScreenshots) {
        const tempPath = path.join(
          os.tmpdir(),
          `stazia-clone-${request.requestId}-${vp.type}-${Date.now()}.png`
        );
        try {
          await page.screenshot({ path: tempPath, fullPage: false });
          tempFilesToDelete.push(tempPath);
          tempScreenshotPath = `temp://${path.basename(tempPath)}`;
        } catch {
          // Screenshot capture failure is non-fatal
        }
      }

      viewportCaptures.push({
        viewport: vp.type,
        captureUri: tempScreenshotPath,
      });
    }

    // Reset back to desktop viewport for comprehensive DOM/CSS inspection
    await page.setViewportSize({ width: 1440, height: 900 });

    // 7. Structural & Token Extraction from Browser DOM
    const extractedData = await page.evaluate(() => {
      // Helper: parse rgb/rgba to hex
      function rgbToHex(rgbStr: string): string {
        if (!rgbStr || rgbStr === "transparent" || rgbStr.startsWith("rgba(0, 0, 0, 0)")) {
          return "";
        }
        const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return rgbStr;
        const r = parseInt(match[1], 10).toString(16).padStart(2, "0");
        const g = parseInt(match[2], 10).toString(16).padStart(2, "0");
        const b = parseInt(match[3], 10).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`.toUpperCase();
      }

      // Metadata
      const title = document.title || "";
      const descEl = document.querySelector('meta[name="description"]');
      const description = descEl ? descEl.getAttribute("content") || "" : "";
      const lang = document.documentElement.lang || "pt-BR";

      // Layout landmarks
      const landmarkSelectors = [
        { sel: "header", region: "HEADER" },
        { sel: "nav", region: "NAVIGATION" },
        { sel: "aside", region: "SIDEBAR" },
        { sel: "main", region: "MAIN_CONTENT" },
        { sel: "footer", region: "FOOTER" },
        { sel: "section", region: "CONTENT_SECTION" },
        { sel: "article", region: "ARTICLE" },
      ];

      const layoutObservations: Array<{
        region: string;
        tag: string;
        gridInfo?: Record<string, any>;
        isSticky?: boolean;
        childrenCount: number;
      }> = [];

      const foundLandmarks = new Set<Element>();

      for (const item of landmarkSelectors) {
        const elements = document.querySelectorAll(item.sel);
        elements.forEach((el) => {
          if (foundLandmarks.has(el)) return;
          foundLandmarks.add(el);
          const computed = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const isSticky =
              computed.position === "sticky" ||
              computed.position === "fixed" ||
              computed.top === "0px";
            layoutObservations.push({
              region: item.region,
              tag: el.tagName.toLowerCase(),
              gridInfo: {
                display: computed.display,
                gridTemplateColumns: computed.gridTemplateColumns !== "none" ? computed.gridTemplateColumns : undefined,
                flexDirection: computed.flexDirection,
                gap: computed.gap !== "normal" ? computed.gap : undefined,
              },
              isSticky,
              childrenCount: el.children.length,
            });
          }
        });
      }

      // Semantic components
      const componentObservations: Array<{
        role: string;
        boundingBox?: Record<string, any>;
        childCount: number;
        observedClassNames?: string[];
      }> = [];

      const roleQueries = [
        { sel: "button, [role='button'], input[type='submit']", role: "BUTTON" },
        { sel: "table", role: "TABLE" },
        { sel: "form", role: "FORM" },
        { sel: "input:not([type='submit']), select, textarea", role: "INPUT" },
        { sel: "div[class*='card'], div[class*='Card'], article", role: "CARD" },
        { sel: "div[class*='alert'], div[class*='Alert'], div[role='alert']", role: "ALERT" },
        { sel: "div[class*='hero'], section[class*='hero']", role: "HERO" },
      ];

      for (const rq of roleQueries) {
        const els = document.querySelectorAll(rq.sel);
        els.forEach((el, index) => {
          if (index < 10) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              componentObservations.push({
                role: rq.role,
                boundingBox: {
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                },
                childCount: el.children.length,
                observedClassNames: Array.from(el.classList).slice(0, 5),
              });
            }
          }
        });
      }

      // Assets
      const assetObservations: Array<{
        sourceUrl: string;
        type: "IMAGE" | "SVG" | "FONT" | "VIDEO" | "ICON";
        dimensions?: { width: number; height: number };
        role?: string;
      }> = [];

      document.querySelectorAll("img").forEach((img, idx) => {
        if (idx < 15 && img.src) {
          assetObservations.push({
            sourceUrl: img.src,
            type: "IMAGE",
            dimensions: { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height },
            role: img.alt || "image",
          });
        }
      });

      document.querySelectorAll("svg").forEach((svg, idx) => {
        if (idx < 10) {
          const rect = svg.getBoundingClientRect();
          assetObservations.push({
            sourceUrl: "inline-svg",
            type: "SVG",
            dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) },
            role: "icon",
          });
        }
      });

      // Observed tokens
      const colorCounts: Record<string, number> = {};
      const typographyMap: Record<string, { fontFamily: string; fontSize: string; fontWeight: string }> = {};
      const radiiSet = new Set<string>();
      const shadowsSet = new Set<string>();

      const allSampledEls = document.querySelectorAll("body, h1, h2, h3, h4, p, a, button, nav, header, aside, footer, table, tr, th, td, div");
      const sampleLimit = Math.min(allSampledEls.length, 120);

      for (let i = 0; i < sampleLimit; i++) {
        const el = allSampledEls[i];
        const style = window.getComputedStyle(el);

        const bgHex = rgbToHex(style.backgroundColor);
        if (bgHex && bgHex !== "#00000000") {
          colorCounts[bgHex] = (colorCounts[bgHex] || 0) + 1;
        }

        const textHex = rgbToHex(style.color);
        if (textHex) {
          colorCounts[textHex] = (colorCounts[textHex] || 0) + 1;
        }

        if (style.fontSize && style.fontFamily) {
          const key = `${style.fontSize}-${style.fontWeight}`;
          if (!typographyMap[key]) {
            typographyMap[key] = {
              fontFamily: style.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
            };
          }
        }

        if (style.borderRadius && style.borderRadius !== "0px") {
          radiiSet.add(style.borderRadius);
        }

        if (style.boxShadow && style.boxShadow !== "none") {
          shadowsSet.add(style.boxShadow);
        }
      }

      const colorsList = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([hex, usageCount]) => ({ hex, usageCount }));

      const typographyList = Object.values(typographyMap).slice(0, 8);

      return {
        pageMetadata: { title, description, lang },
        layoutObservations,
        componentObservations,
        assetObservations,
        observedTokens: {
          colors: colorsList,
          typography: typographyList,
          spacing: [4, 8, 12, 16, 24, 32, 48, 64],
          radii: Array.from(radiiSet).slice(0, 6),
          shadows: Array.from(shadowsSet).slice(0, 4),
          borders: ["1px solid #e2e8f0"],
        },
        interactionObservations: [
          {
            elementSelector: "nav",
            trigger: "SCROLL" as const,
            behaviorDescription: "Navegação com fixação e suporte a responsividade",
          },
        ],
      };
    });

    // 8. Construct RawCloneExtraction
    const rawExtraction: RawCloneExtraction = {
      requestId: request.requestId,
      targetUrl: request.url,
      rightsType: request.rightsType,
      capturedAt: new Date().toISOString(),
      pageMetadata: extractedData.pageMetadata,
      viewportCaptures,
      computedStyles: {},
      layoutObservations: extractedData.layoutObservations,
      interactionObservations: extractedData.interactionObservations,
      componentObservations: extractedData.componentObservations,
      assetObservations: extractedData.assetObservations as RawCloneAssetObservation[],
      observedTokens: extractedData.observedTokens as ObservedDesignTokens,
    };

    // 9. Sanitization boundary (strip proprietary brand data for PUBLIC_REFERENCE_ONLY)
    const sanitizedExtraction = sanitizeCloneExtraction(rawExtraction, request.rightsType);

    // 10. Abstract Blueprint construction
    const blueprint = buildDesignBlueprint(sanitizedExtraction);

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      request,
      rawExtraction,
      sanitizedExtraction,
      blueprint,
      summary: {
        landmarksCount: rawExtraction.layoutObservations.length,
        componentsCount: rawExtraction.componentObservations.length,
        colorsObserved: rawExtraction.observedTokens.colors.length,
        typographyCount: rawExtraction.observedTokens.typography.length,
        viewportsCaptured: viewportCaptures.length,
        executionTimeMs: durationMs,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      request,
      error: {
        code: "CLONE_EXTRACTION_ERROR",
        message: `Falha na extração de layout do navegador isolado: ${error?.message || "Erro desconhecido"}`,
        details: { stack: error?.stack },
      },
    };
  } finally {
    // 11. Strict cleanup: close browser and delete temporary scratch screenshots
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close error
      }
    }

    for (const filePath of tempFilesToDelete) {
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore file unlink failure if already gone
      }
    }
  }
}
