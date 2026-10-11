// @vitest-environment node
/**
 * Rotas antigas de cobrança do app anterior (Firebase), sem tela no app novo (RT01 e RT02, decisão do dono: "Fazer agora").
 *   - /api/billing tinha /simulate-gateway-action sem login: qualquer pessoa marcava um pagamento como aprovado e a
 *     resposta de erro devolvia a mensagem interna.
 *   - /api/webhooks (/payment e /payment-provider) aceitava aviso de pagamento de qualquer remetente quando faltava a
 *     senha: dava Pro/Elite a uma conta ou cortava o acesso de outra.
 * Elas deixam de ser montadas no servidor publicado (o createApp, que a Vercel usa); os arquivos de código ficam. A cobrança
 * futura será feita do zero, com conferência obrigatória da assinatura do aviso.
 *
 * Aqui o servidor sobe como no ar (NODE_ENV=production, serverless, sem Supabase): nada de banco, IA ou internet.
 * O Firebase é de mentira e conta as chamadas: as rotas antigas não podem nem chegar a ele.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import type http from "http";
import path from "path";

vi.setConfig({ testTimeout: 120_000 });

const firebase = vi.hoisted(() => ({ chamadas: 0 }));

vi.mock("../../server/firebaseAdmin", () => {
  const desligado = () => {
    firebase.chamadas++;
    throw new Error("Firebase desligado no teste");
  };
  return {
    DEFAULT_FIREBASE_PROJECT_ID: "teste",
    resolveFirebaseProjectId: () => "teste",
    getAdminApp: desligado,
    getAdminAuth: desligado,
    getAdminDb: desligado,
    resetAdminAppForTesting: async () => {},
  };
});

// bibliotecas pesadas que o server.ts importa mas este teste nunca usa: versões de mentira (sobe mais rápido e nada sai)
vi.mock("firebase-admin/firestore", () => ({ FieldValue: {}, getFirestore: () => { throw new Error("Firebase desligado no teste"); } }));
vi.mock("firebase-admin/storage", () => ({ getStorage: () => { throw new Error("Firebase desligado no teste"); } }));
vi.mock("playwright", () => ({ chromium: { launch: async () => { throw new Error("sem navegador no teste"); } } }));

// nunca lê um .env de verdade (chaves reais) ao importar o server.ts
vi.mock("dotenv", () => ({ default: { config: () => ({ parsed: {} }) }, config: () => ({ parsed: {} }) }));

const ROOT = path.resolve(__dirname, "../..");
const TEXT = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");

/** Variáveis que o teste mexe; voltam ao valor de antes no fim. */
const ENV_KEYS = ["NODE_ENV", "VERCEL", "CONTENT_HUB_WORKER", "SUPABASE_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const envAntes: Record<string, string | undefined> = {};

let server: http.Server | null = null;
let root = "";

const chamar = (method: string, p: string, body?: unknown) =>
  fetch(`${root}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });

beforeAll(async () => {
  for (const k of ENV_KEYS) envAntes[k] = process.env[k];
  process.env.NODE_ENV = "production"; // como no ar: sem banco de desenvolvimento, sem Vite
  process.env.VERCEL = "1"; // importar o server.ts não sobe o servidor de porta fixa
  for (const k of ["SUPABASE_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  const { createApp } = await import("../../server");
  const { app } = await createApp({ serverless: true });
  root = await new Promise<string>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    server = srv;
  });
}, 900_000); // importar o server.ts inteiro é lento com o disco externo e a máquina dividida entre muitos agentes

afterAll(async () => {
  if (server) await new Promise((r) => server!.close(r));
  for (const k of ENV_KEYS) {
    if (envAntes[k] === undefined) delete process.env[k];
    else process.env[k] = envAntes[k];
  }
});

describe("RT01: /api/billing (cobrança do app antigo) não existe no servidor publicado", () => {
  it("POST /api/billing/simulate-gateway-action responde 404 (não 500 com erro interno) e não toca no Firebase", async () => {
    const antes = firebase.chamadas;
    const r = await chamar("POST", "/api/billing/simulate-gateway-action", { paymentId: "pay_qualquer", action: "approve" });
    const texto = await r.text();
    expect(r.status).toBe(404);
    expect(texto).not.toMatch(/Firebase|stack|Error:/i);
    expect(firebase.chamadas - antes).toBe(0);
  });

  it("as outras rotas de /api/billing também respondem 404", async () => {
    const antes = firebase.chamadas;
    for (const [m, p] of [
      ["POST", "/api/billing/checkout"],
      ["GET", "/api/billing/payment-status/pay_qualquer"],
      ["GET", "/api/billing/my-subscription"],
      ["POST", "/api/billing/cancel-subscription"],
    ] as const) {
      const r = await chamar(m, p, { plan: "elite", billingCycle: "monthly" });
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    expect(firebase.chamadas - antes).toBe(0);
  });
});

describe("RT02: /api/webhooks (aviso de pagamento sem conferência) não existe no servidor publicado", () => {
  it("POST /api/webhooks/payment com aviso inventado responde 404 e não dá plano a ninguém", async () => {
    const antes = firebase.chamadas;
    // o mesmo pedido que a tela antiga mandava sozinha para "aprovar" a compra
    const r = await chamar("POST", "/api/webhooks/payment", { plan: "elite", billingCycle: "monthly", email: "vitima@t.dev", source: "direct_checkout" });
    expect(r.status).toBe(404);
    expect(firebase.chamadas - antes).toBe(0);
  });

  it("POST /api/webhooks/payment-provider (reembolso ou cancelamento inventado) responde 404", async () => {
    const antes = firebase.chamadas;
    for (const evento of [
      { type: "charge.refunded", userId: "outra-conta" },
      { type: "customer.subscription.deleted", userId: "outra-conta" },
      { type: "payment_succeeded", userId: "minha-conta", plan: "elite" },
    ]) {
      const r = await chamar("POST", "/api/webhooks/payment-provider", evento);
      expect(r.status, evento.type).toBe(404);
    }
    expect(firebase.chamadas - antes).toBe(0);
  });
});

describe("server.ts", () => {
  it("não monta nem importa as rotas antigas de cobrança (os arquivos continuam no projeto)", () => {
    // compara só o trecho achado (sem despejar o server.ts inteiro quando falha)
    expect(TEXT.match(/app\.\w+\(\s*["'`]\/api\/(billing|webhooks)[^)]*\)/g)).toBeNull();
    expect(TEXT.match(/.*\b(billingRouter|paymentWebhooksRouter)\b.*/g)).toBeNull();
    expect(fs.existsSync(path.join(ROOT, "server/routes/billing.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "server/routes/paymentWebhooks.ts"))).toBe(true);
  });

  it("o app novo (src/novo) não chama /api/billing nem /api/webhooks", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && /\/api\/(billing|webhooks)\b/.test(fs.readFileSync(p, "utf8"))) achados.push(path.relative(ROOT, p));
      }
    };
    varrer(path.join(ROOT, "src/novo"));
    expect(achados).toEqual([]);
  });
});

describe("as rotas do app novo continuam montadas", () => {
  it("/api/health responde 200", async () => {
    const r = await chamar("GET", "/api/health");
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("ok");
  });

  it("Central, Central de IAs, Tutor, vozes, Aulas, Podcasts, Assistente e materiais visuais respondem (503 sem banco neste teste, nunca 404)", async () => {
    for (const [m, p] of [
      ["GET", "/api/content-hub/status"],
      ["GET", "/api/content-hub/visual/files/x"],
      ["GET", "/api/ai-central/summary"],
      ["GET", "/api/tutor/status"],
      ["GET", "/api/tutor/voices"],
      ["GET", "/api/lessons/assist/providers"],
      ["GET", "/api/podcasts/providers"],
      ["GET", "/api/admin-assistant/status"],
      ["GET", "/api/gemini/qualquer"],
    ] as const) {
      const r = await chamar(m, p);
      expect(r.status, `${m} ${p}`).toBe(503);
    }
  });

  it("a tarefa agendada do Stazia Play responde 401 sem a senha (rota montada)", async () => {
    const r = await chamar("GET", "/api/play/cron");
    expect(r.status).toBe(401);
  });
});
