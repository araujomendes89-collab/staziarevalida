import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { executeIsolatedCloneAnalysis } from "../../server/designClone/playwrightRunner";
import { CloneAnalysisRequest } from "../types/cloneEngine";

describe("Isolated Playwright Clone Runner POC (Etapa 1.27D)", () => {
  let server: http.Server;
  let serverUrl: string;

  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="description" content="Portal de Diretrizes Clínicas e Condutas Médicas" />
        <title>Portal Clínico de Referência</title>
        <style>
          body {
            background-color: #0f172a;
            color: #f8fafc;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          header {
            background-color: #1e293b;
            color: #38bdf8;
            padding: 16px;
            font-size: 20px;
          }
          nav {
            position: sticky;
            top: 0;
            background-color: #0284c7;
            padding: 12px;
          }
          main {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            padding: 24px;
          }
          aside {
            background-color: #1e293b;
            padding: 16px;
            border-radius: 8px;
          }
          .card {
            background-color: #334155;
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
          }
          button {
            background-color: #0d9488;
            color: #ffffff;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 14px;
            border: none;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #475569;
            padding: 8px;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>Diretrizes Clínicas 2026</h1>
        </header>
        <nav>
          <a href="#cm">Clínica Médica</a>
          <a href="#ped">Pediatria</a>
        </nav>
        <main>
          <div class="card">
            <h2>Hipertensão Arterial</h2>
            <p>Protocolo de conduta diagnóstica e farmacológica.</p>
            <button>Ver Detalhes</button>
          </div>
          <div class="card">
            <h2>Diabetes Mellitus</h2>
            <p>Rastreamento de nefropatia diabética no SUS.</p>
            <button>Acessar Protocolo</button>
          </div>
          <table>
            <thead>
              <tr><th>Fármaco</th><th>Classe</th><th>Dose</th></tr>
            </thead>
            <tbody>
              <tr><td>Losartana</td><td>BRA</td><td>50mg</td></tr>
              <tr><td>Anlodipino</td><td>BCC</td><td>5mg</td></tr>
            </tbody>
          </table>
        </main>
        <aside>
          <h3>Sinais de Alarme</h3>
          <p>Condutas prioritárias em emergência hipertensiva.</p>
        </aside>
        <footer>
          <p>&copy; 2026 Portal de Referência Médica</p>
        </footer>
      </body>
    </html>
  `;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(sampleHtml);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}/reference-page`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should execute isolated extraction on local fixture and extract structure, viewports and tokens", async () => {
    const request: CloneAnalysisRequest = {
      requestId: "req_test_poc_1",
      url: serverUrl,
      rightsType: "PUBLIC_REFERENCE_ONLY",
      analysisMode: "STRUCTURE_LAYOUT",
      requestedBy: "usr-admin-master",
      requestedAt: new Date().toISOString(),
    };

    const result = await executeIsolatedCloneAnalysis(request, {
      allowLocalTestHosts: true,
      captureScreenshots: true,
      timeoutMs: 15000,
    });

    expect(result.success).toBe(true);
    expect(result.rawExtraction).toBeDefined();
    expect(result.sanitizedExtraction).toBeDefined();
    expect(result.blueprint).toBeDefined();

    // 1. Check Page Metadata
    const meta = result.rawExtraction!.pageMetadata;
    expect(meta.title).toContain("Portal Clínico de Referência");
    expect(meta.description).toContain("Portal de Diretrizes Clínicas");
    expect(meta.lang).toBe("pt-BR");

    // 2. Check 3 Viewports Captured
    const viewports = result.rawExtraction!.viewportCaptures;
    expect(viewports.length).toBe(3);
    const vpTypes = viewports.map((v) => v.viewport);
    expect(vpTypes).toContain("DESKTOP_1440");
    expect(vpTypes).toContain("TABLET_768");
    expect(vpTypes).toContain("MOBILE_390");

    // 3. Check Landmarks & Layout
    const layouts = result.rawExtraction!.layoutObservations;
    expect(layouts.length).toBeGreaterThanOrEqual(4);
    const regions = layouts.map((l) => l.region);
    expect(regions).toContain("HEADER");
    expect(regions).toContain("NAVIGATION");
    expect(regions).toContain("MAIN_CONTENT");
    expect(regions).toContain("SIDEBAR");
    expect(regions).toContain("FOOTER");

    // 4. Check Components
    const comps = result.rawExtraction!.componentObservations;
    const compRoles = comps.map((c) => c.role);
    expect(compRoles).toContain("BUTTON");
    expect(compRoles).toContain("TABLE");
    expect(compRoles).toContain("CARD");

    // 5. Check Tokens
    const tokens = result.rawExtraction!.observedTokens;
    expect(tokens.colors.length).toBeGreaterThan(0);
    expect(tokens.typography.length).toBeGreaterThan(0);

    // 6. Check Sanitization
    expect(result.sanitizedExtraction!.rightsType).toBe("PUBLIC_REFERENCE_ONLY");
    expect(result.sanitizedExtraction!.layoutObservations.length).toBe(layouts.length);

    // 7. Check Blueprint
    const bp = result.blueprint!;
    expect(bp.id).toBe(`dbp_${request.requestId}`);
    expect(bp.layout.type).toBe("RESPONSIVE_GRID");
    expect(bp.sections.length).toBeGreaterThanOrEqual(4);
    expect(bp.componentTypes.length).toBeGreaterThan(0);
  }, 30000);

  it("should fail gracefully when SSRF blocks private IP without test flag", async () => {
    const request: CloneAnalysisRequest = {
      requestId: "req_test_poc_blocked",
      url: "http://127.0.0.1:8080/forbidden",
      rightsType: "PUBLIC_REFERENCE_ONLY",
      analysisMode: "STRUCTURE_LAYOUT",
      requestedBy: "usr-admin-master",
      requestedAt: new Date().toISOString(),
    };

    const result = await executeIsolatedCloneAnalysis(request, {
      allowLocalTestHosts: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("SSRF_VALIDATION_FAILED");
  });
});
