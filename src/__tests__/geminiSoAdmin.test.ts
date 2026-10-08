// @vitest-environment node
/**
 * Rotas antigas /api/gemini/* (vieram do app antigo): a chave do Gemini do servidor é só para a criação de conteúdo,
 * então só o administrador do app novo entra. Sem a Central configurada no servidor volta 503; sem login, 401; aluno,
 * editor e revisor médico recebem 403; e qualquer falha ao conferir o acesso recusa (a rota nunca roda "por engano").
 * Aqui o tratador da rota é de mentira e conta as chamadas: nenhuma chamada real ao Gemini.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "geminisoadmin-"));
const ROOT = path.resolve(__dirname, "../..");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const REVIEWER = "00000000-0000-4000-8000-0000000000c1";

// os textos exatos que o app mostra a quem for recusado
const SEM_LOGIN = { error: "Entre na sua conta." };
const SO_ADMIN = { error: "Acesso restrito a administradores." };
const INDISPONIVEL = { error: "Recurso indisponível neste servidor." };
const FALHA = { error: "Não foi possível conferir o acesso." };

let dev: DevDatabase;
let db: ContentDb;
let requireAdmin: typeof import("../../server/auth/requireAdmin").requireAdmin;
const servers: http.Server[] = [];
const tokens: Record<string, string> = {};
/** Quantas vezes o tratador (de mentira) da rota rodou: é o que, no servidor de verdade, gastaria a chave do Gemini. */
let chamadas = 0;

/** Sobe um app só em 127.0.0.1 (escutando em todos os endereços, a porta pode coincidir com outro programa do Mac). */
const subir = (deps: { db: ContentDb } | null) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use("/api/gemini", requireAdmin(deps));
    app.post("/api/gemini/tutor", (_req, res) => {
      chamadas++;
      res.json({ ok: true });
    });
    const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`));
    servers.push(srv);
  });

/** O banco de verdade, com a sessão de verdade, mas com um defeito só: a conferência do papel falha ou volta estranha. */
const comDefeito = (defeito: Partial<ContentDb>) => ({ db: { ...db, ...defeito } as ContentDb });

const chamar = (root: string, token: string | null, extra: { method?: string; path?: string; headers?: Record<string, string> } = {}) =>
  fetch(`${root}${extra.path ?? "/api/gemini/tutor"}`, {
    method: extra.method ?? "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra.headers },
    body: (extra.method ?? "POST") === "POST" ? JSON.stringify({ message: "oi" }) : undefined,
  });

describe("requireAdmin", () => {
  let aberto: string;
  let semCentral: string;

  beforeAll(async () => {
    ({ requireAdmin } = await import("../../server/auth/requireAdmin"));
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev'), ($4, 'rv@t.dev')`, [ADMIN, EDITOR, STUDENT, REVIEWER]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
    // revisor médico = aluno cadastrado como revisor de uma área (não é da equipe nem administrador)
    await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVIEWER]);
    tokens.admin = await dev.createSession(ADMIN);
    tokens.editor = await dev.createSession(EDITOR);
    tokens.student = await dev.createSession(STUDENT);
    tokens.reviewer = await dev.createSession(REVIEWER);
    aberto = await subir({ db });
    semCentral = await subir(null);
  }, 300_000);

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    chamadas = 0;
  });

  describe("com o banco de desenvolvimento", () => {
    it("sem login volta 401 e a rota não roda (sem token, token desconhecido ou malformado)", async () => {
      for (const token of [null, "0".repeat(64), "lixo"]) {
        const r = await chamar(aberto, token);
        expect(r.status, String(token)).toBe(401);
        expect(await r.json()).toEqual(SEM_LOGIN);
      }
      expect(chamadas).toBe(0);
    });

    it("cabeçalhos de usuário e plano não valem: sem token continua 401", async () => {
      const r = await chamar(aberto, null, { headers: { "x-user-id": ADMIN, "x-user-tier": "elite", "x-email-verified": "true", "x-auth-provider": "password" } });
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual(SEM_LOGIN);
      expect(chamadas).toBe(0);
    });

    it("vale para qualquer rota e qualquer verbo sob /api/gemini: sem login, até caminho que não existe volta 401", async () => {
      for (const [method, p] of [["GET", "/api/gemini/tutor"], ["POST", "/api/gemini/osce-evaluate"], ["PUT", "/api/gemini/qualquer-coisa"], ["DELETE", "/api/gemini"]] as const) {
        const r = await chamar(aberto, null, { method, path: p });
        expect(r.status, `${method} ${p}`).toBe(401);
        expect(await r.json()).toEqual(SEM_LOGIN);
      }
      expect(chamadas).toBe(0);
    });

    it("aluno recebe 403 e a rota não roda", async () => {
      const r = await chamar(aberto, tokens.student);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(SO_ADMIN);
      expect(chamadas).toBe(0);
    });

    it("editor (da equipe, mas não administrador) recebe 403 e a rota não roda", async () => {
      const r = await chamar(aberto, tokens.editor);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(SO_ADMIN);
      expect(chamadas).toBe(0);
    });

    it("revisor médico (aluno com área de revisão) recebe 403 e a rota não roda", async () => {
      const r = await chamar(aberto, tokens.reviewer);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(SO_ADMIN);
      expect(chamadas).toBe(0);
    });

    it("administrador passa: a rota roda uma vez e responde 200 { ok: true }", async () => {
      const r = await chamar(aberto, tokens.admin);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
      expect(chamadas).toBe(1);
    });
  });

  describe("quando a conferência não é possível", () => {
    it("sem a Central configurada no servidor (deps nulo) volta 503, até para o administrador", async () => {
      for (const token of [null, tokens.admin]) {
        const r = await chamar(semCentral, token);
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual(INDISPONIVEL);
      }
      expect(chamadas).toBe(0);
    });

    it("erro de permissão ao conferir volta 403 e a rota não roda", async () => {
      const erros = [new Error("Acesso restrito a administradores."), new Error("permission denied for function app_ch_whoami (42501)")];
      for (const erro of erros) {
        const url = await subir(comDefeito({ asUser: (async () => { throw erro; }) as ContentDb["asUser"] }));
        const r = await chamar(url, tokens.admin);
        expect(r.status, erro.message).toBe(403);
        expect(await r.json()).toEqual(SO_ADMIN);
      }
      expect(chamadas).toBe(0);
    });

    it("outro erro ao conferir (banco fora do ar, falha na autenticação) volta 500 e a rota não roda", async () => {
      const defeitos: Array<[string, Partial<ContentDb>]> = [
        ["asUser", { asUser: (async () => { throw new Error("connection terminated unexpectedly"); }) as ContentDb["asUser"] }],
        ["asUser com valor que não é Error", { asUser: (async () => { throw "boom"; }) as ContentDb["asUser"] }],
        ["authenticate", { authenticate: async () => { throw new Error("fetch failed"); } }],
      ];
      for (const [nome, defeito] of defeitos) {
        const url = await subir(comDefeito(defeito));
        const r = await chamar(url, tokens.admin);
        expect(r.status, nome).toBe(500);
        expect(await r.json()).toEqual(FALHA);
      }
      expect(chamadas).toBe(0);
    });

    it("só admin === true passa: resposta vazia ou estranha do banco volta 403 e a rota não roda", async () => {
      const respostas: unknown[] = [null, undefined, {}, { staff: true }, { admin: false, staff: true }, { admin: "true" }, { admin: 1 }];
      for (const resposta of respostas) {
        const url = await subir(comDefeito({ asUser: (async () => resposta) as ContentDb["asUser"] }));
        const r = await chamar(url, tokens.admin);
        expect(r.status, JSON.stringify(resposta)).toBe(403);
        expect(await r.json()).toEqual(SO_ADMIN);
      }
      expect(chamadas).toBe(0);
    });
  });
});

describe("server.ts", () => {
  const text = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");
  const GUARD = 'app.use("/api/gemini", requireAdmin(';

  it("monta o porteiro de /api/gemini antes da primeira rota /api/gemini (de qualquer verbo)", () => {
    const guard = text.indexOf(GUARD);
    expect(guard, 'server.ts precisa ter app.use("/api/gemini", requireAdmin(…))').toBeGreaterThanOrEqual(0);
    const firstPost = text.indexOf('app.post("/api/gemini/');
    expect(firstPost, "server.ts ainda registra as rotas antigas /api/gemini/*").toBeGreaterThanOrEqual(0);
    expect(guard, "o porteiro tem de vir antes da primeira rota /api/gemini").toBeLessThan(firstPost);
    // qualquer outro jeito de registrar algo sob /api/gemini (get, put, all, use, route…) também vem depois do porteiro
    const registros = [...text.matchAll(/app\.(?:get|post|put|patch|delete|all|options|head|use|route)\(\s*["'`]\/api\/gemini/g)].map((m) => m.index!);
    expect(registros.length).toBeGreaterThan(1);
    expect(Math.min(...registros), "o primeiro registro sob /api/gemini tem de ser o porteiro").toBe(guard);
  });

  it("monta o porteiro dentro do createApp (a Vercel só usa o createApp), depois da Central, com o banco dela", () => {
    const guard = text.indexOf(GUARD);
    const comeco = text.indexOf("export async function createApp(");
    const fim = text.indexOf("async function startServer(");
    expect(comeco).toBeGreaterThanOrEqual(0);
    expect(fim).toBeGreaterThan(comeco);
    expect(guard, "o porteiro tem de estar dentro do createApp").toBeGreaterThan(comeco);
    expect(guard, "o porteiro tem de estar dentro do createApp").toBeLessThan(fim);
    const hub = text.indexOf("const hub = await setupContentHub();");
    expect(hub, "o porteiro usa o hub, que precisa existir antes").toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(hub);
    expect(text.includes('app.use("/api/gemini", requireAdmin(hub.deps));'), "o porteiro recebe o banco da Central (hub.deps)").toBe(true);
    expect(text).toMatch(/import \{ requireAdmin \} from "\.\/server\/auth\/requireAdmin";/);
  });
});
