// @vitest-environment node
/**
 * Sessão única no servidor: as rotas de IA (/api/tutor) recusam a sessão derrubada (a conta foi aberta em outro aparelho),
 * para não gastar crédito de outra pessoa. Banco de verdade (PGlite com todas as migrações), como o banco local do servidor:
 * o token não traz session_id, então vale o cabeçalho X-Stazia-Sessao que o app manda.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import type { Server } from "http";
import { PGlite } from "@electric-sql/pglite";
import { createLocalCore, type LocalCore } from "../novo/data/localCore";
import type { ContentDb, Identity } from "../../server/contentHub/infra";
import { esquecerSessoesGuardadas, sessaoDerrubada, SESSAO_DERRUBADA_CODIGO } from "../../server/auth/sessaoUnica";
import { createTutorRouter } from "../../server/tutor/router";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ALUNA = "00000000-0000-4000-8000-00000000a001";
const ADMIN = "00000000-0000-4000-8000-00000000a002";

let pg: PGlite;
let core: LocalCore;
let db: ContentDb;
let server: Server;
let base: string;

const aluna: Identity = { id: ALUNA, email: "aluna@t.dev" };
const req = (sessao?: string) => ({ headers: sessao ? { "x-stazia-sessao": sessao } : {} });
const regra = (ativa: boolean) => pg.query(`update public.app_settings set value = jsonb_set(value, '{ativa}', $1::jsonb) where key = 'sessao_unica'`, [JSON.stringify(ativa)]);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await pg.query(`insert into auth.users (id, email) values ($1, 'aluna@t.dev'), ($2, 'adm@t.dev')`, [ALUNA, ADMIN]);
  await pg.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  core = createLocalCore(pg);
  const tokens: Record<string, Identity> = { "token-aluna": aluna, "token-admin": { id: ADMIN, email: "adm@t.dev" } };
  db = {
    mode: "dev",
    service: async () => {
      throw new Error("não usado");
    },
    asUser: (user, fn, args) => core.rpc(user, fn, args),
    authenticate: async (r) => tokens[String(r.headers.authorization ?? "").replace(/^Bearer\s+/i, "")] ?? null,
  };
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter({ db, mockRespond: () => null } as any));
  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
}, 240_000);

afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await pg?.close();
});

beforeEach(async () => {
  esquecerSessoesGuardadas();
  await regra(true);
});

describe("Sessão única nas rotas de IA", () => {
  it("a sessão derrubada é recusada; a vigente passa", async () => {
    await core.rpc(aluna, "app_session_claim", { p_session_id: "srv-aparelho-a", p_device: "A" });
    expect(await sessaoDerrubada(db, aluna, req("srv-aparelho-a"))).toBe(false);
    await core.rpc(aluna, "app_session_claim", { p_session_id: "srv-aparelho-b", p_device: "B" });
    esquecerSessoesGuardadas();
    expect(await sessaoDerrubada(db, aluna, req("srv-aparelho-a"))).toBe(true);
    expect(await sessaoDerrubada(db, aluna, req("srv-aparelho-b"))).toBe(false);
  });

  it("rota /api/tutor: 401 com o código sessao_derrubada para o aparelho derrubado; o vigente segue para a rota", async () => {
    await core.rpc(aluna, "app_session_claim", { p_session_id: "rota-aparelho-a", p_device: "A" });
    await core.rpc(aluna, "app_session_claim", { p_session_id: "rota-aparelho-b", p_device: "B" });
    const derrubado = await fetch(`${base}/turn`, { method: "POST", headers: { Authorization: "Bearer token-aluna", "X-Stazia-Sessao": "rota-aparelho-a", "Content-Type": "application/json" }, body: "{}" });
    expect(derrubado.status).toBe(401);
    const corpo = await derrubado.json();
    expect(corpo).toEqual({ error: "Sua conta foi aberta em outro aparelho. Entre de novo para continuar.", code: SESSAO_DERRUBADA_CODIGO });

    const vigente = await fetch(`${base}/turn`, { method: "POST", headers: { Authorization: "Bearer token-aluna", "X-Stazia-Sessao": "rota-aparelho-b", "Content-Type": "application/json" }, body: "{}" });
    expect((await vigente.json().catch(() => ({}))).code).not.toBe(SESSAO_DERRUBADA_CODIGO);
  });

  it("chave desligada ou equipe: nada muda", async () => {
    await regra(false);
    expect(await sessaoDerrubada(db, aluna, req("qualquer-sessao-1"))).toBe(false);
    await regra(true);
    const admin: Identity = { id: ADMIN, email: "adm@t.dev" };
    await core.rpc(admin, "app_session_claim", { p_session_id: "admin-aparelho-a", p_device: "A" });
    await core.rpc(admin, "app_session_claim", { p_session_id: "admin-aparelho-b", p_device: "B" });
    expect(await sessaoDerrubada(db, admin, req("admin-aparelho-a"))).toBe(false);
  });

  it("na dúvida libera: banco falhando ou sem identificação da sessão não derruba ninguém", async () => {
    const quebrado = { asUser: async () => { throw new Error("function app_session_check does not exist"); } };
    expect(await sessaoDerrubada(quebrado, aluna, req("srv-aparelho-a"))).toBe(false);
    expect(await sessaoDerrubada(db, aluna, req())).toBe(false); // sem cabeçalho e sem session_id no token: o banco recusa e a rota libera
    expect(await sessaoDerrubada(db, aluna, { headers: { "x-stazia-sessao": "inválido com espaço" } })).toBe(false);
  });
});
