// @vitest-environment node
/**
 * RT07 e RT03 (servidor):
 *  - se a conferência de login falhar por defeito do banco ou da rede, as rotas (podcasts, aulas, figuras das questões, Central de
 *    Conteúdo, materiais visuais, Central de IAs, Tutor) devolvem uma frase amigável, nunca o texto técnico cru (que traz nome de
 *    servidor, usuário do banco etc.);
 *  - erro técnico no meio de uma operação também vira frase em português com o motivo; frase pronta do banco passa inteira;
 *  - /api/entitlements/upgrade-self (troca de plano sem pagamento) é só administrador.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type http from "http";

vi.setConfig({ testTimeout: 60_000 });

const upgrades = vi.hoisted(() => ({ chamadas: 0 }));

vi.mock("../../server/firebaseAdmin", () => ({ getAdminApp: () => { throw new Error("sem Firebase"); }, getAdminAuth: () => { throw new Error("sem Firebase"); }, getAdminDb: () => { throw new Error("sem Firebase"); } }));
vi.mock("../../server/services/entitlements/entitlementsService", () => ({
  EntitlementsService: { upgradeSubscription: async () => { upgrades.chamadas++; return { plan: "elite" }; } },
}));
// login de mentira: o cabeçalho x-uid diz quem é, x-role o papel (o de verdade confere no Firebase e no Firestore)
vi.mock("../../server/auth/authMiddleware", () => ({
  authenticateFirebaseRequest: (req: any, res: any, next: any) => {
    if (!req.headers["x-uid"]) return res.status(401).json({ error: { code: "AUTH_MISSING_TOKEN" } });
    req.auth = { uid: String(req.headers["x-uid"]) };
    next();
  },
  requireServerRole: (role: string) => (req: any, res: any, next: any) => (req.headers["x-role"] === role ? next() : res.status(403).json({ error: { code: "AUTH_FORBIDDEN" } })),
  requireServerCapability: () => (_req: any, _res: any, next: any) => next(),
}));

const TECNICO_DO_BANCO =
  'connection to server at "db.abcdefgh.supabase.co" (10.0.0.1), port 5432 failed: FATAL: password authentication failed for user "postgres"';
const servers: http.Server[] = [];
const subir = (montar: (app: express.Express) => void) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    montar(app);
    const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    servers.push(srv);
  });
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

/** Banco de mentira cuja conferência de login estoura com texto técnico. */
const dbQuebrado = { mode: "dev", authenticate: async () => { throw new Error(TECNICO_DO_BANCO); }, asUser: async () => { throw new Error(TECNICO_DO_BANCO); }, service: async () => { throw new Error(TECNICO_DO_BANCO); } } as any;
const logs: string[] = [];
const deps = { db: dbQuebrado, log: (m: string) => logs.push(m) } as any;

describe("RT07: a conferência de login que falha mostra frase amigável", () => {
  const rotas: Array<[string, string, () => Promise<express.Router>]> = [
    ["podcasts", "/p", async () => (await import("../../server/podcasts/router")).createPodcastsRouter({ ...deps, storage: {} as any, lessons: {} as any }) as any],
    ["aulas", "/p", async () => (await import("../../server/lessons/router")).createLessonsRouter({ ...deps, storage: {} as any }) as any],
    ["figuras das questões", "/p", async () => (await import("../../server/questions/figures")).createQuestionFiguresRouter({ ...deps, storage: {} as any }) as any],
    ["Central de Conteúdo", "/p/status", async () => (await import("../../server/contentHub/router")).createContentHubRouter(deps) as any],
    ["materiais visuais", "/p", async () => (await import("../../server/contentHub/visual/router")).createVisualRouter(deps) as any],
    ["Central de IAs", "/p/summary", async () => (await import("../../server/ai/router")).createAiRouter(deps) as any],
    ["Tutor", "/p/status", async () => (await import("../../server/tutor/router")).createTutorRouter(deps) as any],
  ];

  for (const [nome, caminho, criar] of rotas) {
    it(nome, async () => {
      const router = await criar();
      const root = await subir((app) => app.use("/p", router));
      const r = await fetch(`${root}${caminho.startsWith("/p/") ? caminho : "/p/x"}`, { headers: { Authorization: "Bearer qualquer" } });
      const texto = await r.text();
      expect(r.status).toBe(500);
      expect(texto).toMatch(/Não foi possível conferir o seu acesso agora\. Tente de novo em instantes\./);
      expect(texto).not.toMatch(/supabase|password|postgres|FATAL|10\.0\.0\.1|5432/i);
    });
  }

  it("o detalhe técnico não se perde: vai para o registro do servidor", async () => {
    expect(logs.some((l) => /conferência de login falhou/.test(l) && /supabase\.co/.test(l))).toBe(true);
  });
});

describe("erro no meio da operação: motivo em português, sem texto técnico", () => {
  it("frase pronta do banco passa inteira e erro técnico vira motivo (aulas)", async () => {
    const { createLessonsRouter } = await import("../../server/lessons/router");
    const usuario = { id: "u1" };
    let erro: Error = new Error("Aula não encontrada.");
    const db = { mode: "dev", authenticate: async () => usuario, asUser: async () => { throw erro; }, service: async () => { throw erro; } } as any;
    const root = await subir((app) => app.use("/aulas", createLessonsRouter({ db, storage: {} as any })));
    const chamar = () => fetch(`${root}/aulas/00000000-0000-4000-8000-000000000001`, { method: "DELETE", headers: { Authorization: "Bearer x" } });
    let r = await chamar();
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("Aula não encontrada."); // frase do banco, inteira
    erro = Object.assign(new Error('relation "public.lessons" does not exist'), { code: "42P01" });
    r = await chamar();
    const corpo = await r.json();
    expect(corpo.error).toMatch(/ainda não foi atualizada no servidor/);
    expect(JSON.stringify(corpo)).not.toMatch(/relation|public\.lessons|does not exist/);
    erro = new TypeError("fetch failed");
    expect((await (await chamar()).json()).error).toMatch(/Sem conexão com o servidor/);
  });
});

describe("RT03: troca de plano sem pagamento é só administrador", () => {
  it("aluno logado não se dá Pro nem Elite; administrador consegue; sem login, 401", async () => {
    const { entitlementsRouter } = await import("../../server/routes/entitlements");
    const root = await subir((app) => app.use("/api/entitlements", entitlementsRouter));
    const pedir = (headers: Record<string, string>) =>
      fetch(`${root}/api/entitlements/upgrade-self`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ plan: "elite" }) });

    expect((await pedir({})).status).toBe(401);
    expect((await pedir({ "x-uid": "aluno-1", "x-role": "STUDENT" })).status).toBe(403);
    expect((await pedir({ "x-uid": "editor-1", "x-role": "EDITOR" })).status).toBe(403);
    expect(upgrades.chamadas).toBe(0);
    const ok = await pedir({ "x-uid": "admin-1", "x-role": "ADMIN" });
    expect(ok.status).toBe(200);
    expect(upgrades.chamadas).toBe(1);
  });
});
