// @vitest-environment node
/**
 * Rotas antigas /api/ai/* (vieram do app antigo): gastam as chaves de IA do servidor (Anthropic, OpenAI e Gemini) e só
 * conferiam cabeçalhos que dá para falsificar. Decisão do dono (2026-10-08): mesma trava das /api/gemini, só o
 * administrador do app novo entra. O app novo não usa nenhuma delas; a Central de IAs fica em /api/ai-central e não
 * pode ser pega por essa trava. Aqui os tratadores das rotas são de mentira e contam as chamadas: nenhuma IA de verdade.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import express from "express";
import type http from "http";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisoadmin-"));
const ROOT = path.resolve(__dirname, "../..");
const TEXT = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";

const SEM_LOGIN = { error: "Entre na sua conta." };
const SO_ADMIN = { error: "Acesso restrito a administradores." };
const GUARD = 'app.use("/api/ai", requireAdmin(';

/** As rotas antigas registradas no server.ts: [verbo, caminho, posição no texto]. */
const ROTAS = [...TEXT.matchAll(/app\.(get|post|put|patch|delete|all)\(\s*["'`](\/api\/ai\/[^"'`]+)["'`]/g)].map(
  (m) => [m[1].toUpperCase(), m[2], m.index!] as const
);

let dev: DevDatabase;
let db: ContentDb;
let requireAdmin: typeof import("../../server/auth/requireAdmin").requireAdmin;
const servers: http.Server[] = [];
const tokens: Record<string, string> = {};
/** Quantas vezes um tratador (de mentira) rodou: no servidor de verdade, cada chamada gastaria uma chave de IA. */
let chamadas = 0;
let central = 0;
let root: string;

const chamar = (method: string, p: string, token: string | null) =>
  fetch(`${root}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify({ prompt: "oi" }),
  });

describe("server.ts", () => {
  it("tem as 13 rotas antigas /api/ai/* (se mudar, conferir se a trava ainda cobre todas)", () => {
    expect(ROTAS.map(([v, p]) => `${v} ${p}`)).toEqual([
      "GET /api/ai/models",
      "GET /api/ai/usage",
      "POST /api/ai/generate",
      "POST /api/ai/stream",
      "POST /api/ai/official-medical-search",
      "POST /api/ai/audit-question",
      "POST /api/ai/agent-run",
      "GET /api/ai/tools",
      "POST /api/ai/execute-tool",
      "POST /api/ai/voice-tutor/explain",
      "POST /api/ai/voice-tutor/transit-question",
      "POST /api/ai/voice-tutor/transit-evaluate",
      "GET /api/ai/official-sources",
    ]);
  });

  it("monta a trava de /api/ai dentro do createApp, depois da Central, com o banco dela, antes de toda rota /api/ai", () => {
    const guard = TEXT.indexOf(GUARD);
    expect(guard, 'server.ts precisa ter app.use("/api/ai", requireAdmin(hub.deps))').toBeGreaterThanOrEqual(0);
    expect(TEXT.includes('app.use("/api/ai", requireAdmin(hub.deps));'), "a trava recebe o banco da Central (hub.deps)").toBe(true);
    const comeco = TEXT.indexOf("export async function createApp(");
    const fim = TEXT.indexOf("async function startServer(");
    const hub = TEXT.indexOf("const hub = await setupContentHub();");
    expect(comeco).toBeGreaterThanOrEqual(0);
    expect(hub).toBeGreaterThan(comeco);
    expect(guard, "a trava tem de vir depois do hub").toBeGreaterThan(hub);
    expect(guard, "a trava tem de estar dentro do createApp (a Vercel só usa o createApp)").toBeLessThan(fim);
    // qualquer registro sob /api/ai/ (rota ou use, de qualquer verbo) vem depois da trava; /api/ai-central não conta
    const registros = [...TEXT.matchAll(/app\.(?:get|post|put|patch|delete|all|options|head|use|route)\(\s*["'`]\/api\/ai(?=["'`/])/g)].map((m) => m.index!);
    expect(Math.min(...registros), "o primeiro registro sob /api/ai tem de ser a trava").toBe(guard);
  });
});

describe("trava de /api/ai como no server.ts", () => {
  beforeAll(async () => {
    ({ requireAdmin } = await import("../../server/auth/requireAdmin"));
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
    tokens.admin = await dev.createSession(ADMIN);
    tokens.editor = await dev.createSession(EDITOR);
    tokens.student = await dev.createSession(STUDENT);
    root = await new Promise<string>((resolve) => {
      const app = express();
      // a mesma ordem do server.ts: trava de /api/ai, Central em /api/ai-central, depois as rotas antigas
      app.use("/api/ai", requireAdmin({ db }));
      app.get("/api/ai-central/summary", (_req, res) => {
        central++;
        res.json({ central: true });
      });
      for (const [verbo, p] of ROTAS) {
        (app as any)[verbo.toLowerCase()](p, (_req: express.Request, res: express.Response) => {
          chamadas++;
          res.json({ ok: true });
        });
      }
      const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
      servers.push(srv);
    });
  }, 300_000);

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    chamadas = 0;
    central = 0;
  });

  it("sem login, as 13 rotas voltam 401 e nenhuma roda (nem com cabeçalhos de usuário falsificados)", async () => {
    for (const [verbo, p] of ROTAS) {
      const r = await chamar(verbo, p, null);
      expect(r.status, `${verbo} ${p}`).toBe(401);
      expect(await r.json()).toEqual(SEM_LOGIN);
    }
    const falsificado = await fetch(`${root}/api/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": ADMIN, "x-user-tier": "elite", "x-email-verified": "true" },
      body: "{}",
    });
    expect(falsificado.status).toBe(401);
    expect(chamadas).toBe(0);
  });

  it("aluno e editor recebem 403 e nenhuma rota roda", async () => {
    for (const quem of ["student", "editor"]) {
      for (const [verbo, p] of ROTAS) {
        const r = await chamar(verbo, p, tokens[quem]);
        expect(r.status, `${quem} ${verbo} ${p}`).toBe(403);
        expect(await r.json()).toEqual(SO_ADMIN);
      }
    }
    expect(chamadas).toBe(0);
  });

  it("administrador passa nas 13 rotas", async () => {
    for (const [verbo, p] of ROTAS) {
      const r = await chamar(verbo, p, tokens.admin);
      expect(r.status, `${verbo} ${p}`).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
    }
    expect(chamadas).toBe(ROTAS.length);
  });

  it("a trava não pega a Central de IAs (/api/ai-central é outro caminho)", async () => {
    const r = await chamar("GET", "/api/ai-central/summary", null);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ central: true });
    expect(central).toBe(1);
  });
});
