// @vitest-environment node
/**
 * Dados do cadastro com WhatsApp e aceite do Termo: o cadastro leva WhatsApp, versão do termo e navegador nos metadados da
 * conta (Supabase: options.data; servidor de desenvolvimento: corpo do POST; banco local: raw_user_meta_data), o gatilho do
 * banco grava o aceite 'cadastro' e quem se cadastra sem esses dados cai na tela de aceite (boot.legal.gate_required).
 * Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seções 5, 6 e 9).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import type { Server } from "http";
import { PGlite } from "@electric-sql/pglite";
import { createLocalBackend, migrateLocalDatabase } from "../novo/data/localBackend";
import { createLocalCore, type LocalCore } from "../novo/data/localCore";
import { createDevServerBackend } from "../novo/data/devServerBackend";
import { createSupabaseBackend } from "../novo/data/supabaseBackend";
import type { AuthUser, Backend } from "../novo/data/backend";
import { createDevDbRouter } from "../../server/devDb/router";
import type { DevDatabase } from "../../server/devDb/devDatabase";
import { TERMO_VERSAO, TUTOR_IA_VERSAO } from "../novo/app/legal/versions.js";

const supabase = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signUp: supabase.signUp } }) }));

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const PHONE = "+5541999998888";
const sha256 = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

let backend: Backend;
let db: PGlite;
let core: LocalCore;
let dev: DevDatabase;
let server: Server;
let base: string;

/** O banco do servidor de desenvolvimento sem a carga das questões: só o que o roteador e o cadastro usam. */
function devDatabaseWithoutSeed(pg: PGlite, localCore: LocalCore): DevDatabase {
  const sessions = new Map<string, string>();
  return {
    db: pg,
    core: localCore,
    async createSession(userId) {
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, userId);
      return token;
    },
    async userForToken(token) {
      const id = token ? sessions.get(token) : undefined;
      if (!id) return null;
      const row = (await pg.query<AuthUser>(`select id, email from auth.users where id = $1`, [id])).rows[0];
      return row ?? null;
    },
    async revokeSession(token) {
      sessions.delete(token);
    },
  };
}

const acceptances = async (userId: string) =>
  (await db.query<any>(`select document, version, origin, user_agent, email_hash from public.legal_acceptances where user_id = $1 order by id`, [userId])).rows;
const profileOf = async (userId: string) => (await db.query<any>(`select name, phone from public.profiles where id = $1`, [userId])).rows[0];
const metaOf = async (userId: string) => (await db.query<any>(`select raw_user_meta_data as meta from auth.users where id = $1`, [userId])).rows[0].meta;

beforeAll(async () => {
  backend = await createLocalBackend({ persist: false, seed: false });

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const source = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(MIGRATIONS, f), "utf8")]));
  db = new PGlite();
  await migrateLocalDatabase(db, source, null);
  core = createLocalCore(db);
  dev = devDatabaseWithoutSeed(db, core);

  const app = express();
  app.use("/api/dev-db", createDevDbRouter(async () => dev));
  base = await new Promise<string>((resolve) => {
    server = app.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as any).port}/api/dev-db`));
  });
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(null)));
  await db?.close();
});

describe("Cadastro — banco local do navegador", () => {
  it("cadastro local com WhatsApp e versão do termo já abre sem a tela de aceite", async () => {
    const result = await backend.signUp("Ana Lima", "ana@teste.dev", "senha-segura", { phone: PHONE, termsVersion: "2.0", declaresAdult: true, declaresPhysician: true, userAgent: "T" });
    expect(result.needsEmailConfirmation).toBe(false);

    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile).toMatchObject({ name: "Ana Lima", phone: PHONE });
    expect(boot.legal).toMatchObject({
      student: true,
      phone_missing: false,
      gate_required: false,
      termo_uso: { current: "2.0", accepted: "2.0", accepted_at: expect.any(String) },
    });

    // o aceite veio do cadastro, não da tela de aceite
    const exported = await backend.rpc<any>("app_export_my_data");
    expect(exported.acceptances).toEqual([{ document: "termo_uso", version: "2.0", accepted_at: expect.any(String), origin: "cadastro", user_agent: "T" }]);
  });

  it("cadastro sem versão do termo pede a tela de aceite", async () => {
    await backend.signUp("Bruno Reis", "bruno@teste.dev", "senha-segura", { phone: "+351912345678" });
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile.phone).toBe("+351912345678");
    expect(boot.legal).toMatchObject({ student: true, phone_missing: false, gate_required: true, termo_uso: { accepted: null, accepted_at: null } });
    expect((await backend.rpc<any>("app_export_my_data")).acceptances).toEqual([]);
  });

  it("cadastro de antes (só nome, e-mail e senha) continua funcionando e pede aceite e WhatsApp", async () => {
    await backend.signUp("Caio Dias", "caio@teste.dev", "senha-segura");
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile).toMatchObject({ name: "Caio Dias", phone: null });
    expect(boot.legal).toMatchObject({ phone_missing: true, gate_required: true });
  });

  it("versão vigente sem a declaração de maioridade não vale como aceite", async () => {
    await backend.signUp("Lia Souza", "lia2@teste.dev", "senha-segura", { phone: PHONE, termsVersion: TERMO_VERSAO, declaresPhysician: true, userAgent: "T" });
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.legal).toMatchObject({ gate_required: true, declarations_required: true, termo_uso: { accepted: null } });
  });

  it("versão do termo que não é a vigente não vale como aceite", async () => {
    await backend.signUp("Davi Melo", "davi@teste.dev", "senha-segura", { phone: PHONE, termsVersion: "0.9", userAgent: "T" });
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.legal).toMatchObject({ gate_required: true, termo_uso: { accepted: null } });
  });

  it("aceitar depois, com os argumentos da sessão, fecha a tela de aceite (e repetir não duplica)", async () => {
    await backend.signUp("Eva Costa", "eva@teste.dev", "senha-segura");
    const args = { p_document: "termo_uso", p_version: TERMO_VERSAO, p_origin: "tela_aceite", p_phone: PHONE, p_user_agent: "UA/1", p_adult: true, p_physician: true };

    const boot = await backend.rpc<any>("app_accept_terms_declared", args);
    expect(boot.profile.phone).toBe(PHONE);
    expect(boot.legal).toMatchObject({ phone_missing: false, gate_required: false, termo_uso: { accepted: "2.0" } });
    await backend.rpc("app_accept_terms_declared", { ...args, p_phone: null });

    expect((await backend.rpc<any>("app_export_my_data")).acceptances).toEqual([
      { document: "termo_uso", version: "2.0", accepted_at: expect.any(String), origin: "tela_aceite", user_agent: "UA/1" },
    ]);
  });

  it("versão desatualizada e WhatsApp inválido são recusados com as mensagens do spec, sem gravar nada", async () => {
    await backend.signUp("Rui Neto", "rui@teste.dev", "senha-segura");
    const args = { p_document: "termo_uso", p_version: TERMO_VERSAO, p_origin: "tela_aceite", p_phone: PHONE, p_user_agent: "UA/1", p_adult: true, p_physician: true };

    await expect(backend.rpc("app_accept_terms_declared", { ...args, p_version: "0.9" })).rejects.toThrow("Versão desatualizada do termo.");
    await expect(backend.rpc("app_accept_terms_declared", { ...args, p_phone: "41999998888" })).rejects.toThrow("Informe o WhatsApp com código do país.");
    // Termo 2.0: sem a declaração de maioridade não há aceite (nem pela função antiga, nem só com a de médico); a de médico não é
    // mais exigida (…13661_aceite_com_maioridade)
    const { p_adult: _a, p_physician: _p, ...semDeclaracao } = args;
    await expect(backend.rpc("app_accept_terms", semDeclaracao)).rejects.toThrow("Confirme que você tem 18 anos ou mais.");
    await expect(backend.rpc("app_accept_terms_declared", { ...args, p_adult: false })).rejects.toThrow("Confirme que você tem 18 anos ou mais.");

    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile.phone).toBeNull();
    expect(boot.legal).toMatchObject({ phone_missing: true, gate_required: true, termo_uso: { accepted: null } });
  });

  it("as versões do app são as vigentes no banco", async () => {
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.legal.termo_uso.current).toBe(TERMO_VERSAO);
    expect(boot.legal.tutor_ia.current).toBe(TUTOR_IA_VERSAO);
  });

  it("os dados de antes continuam: e-mail repetido e senha curta valem para quem manda os dados novos", async () => {
    const extra = { phone: PHONE, termsVersion: "2.0", declaresAdult: true, declaresPhysician: true, userAgent: "T" };
    await expect(backend.signUp("Ana 2", "ana@teste.dev", "senha-segura", extra)).rejects.toMatchObject({ code: "email_taken" });
    await expect(backend.signUp("Fábio", "fabio@teste.dev", "curta", extra)).rejects.toMatchObject({ code: "weak_password" });
    await expect(backend.signUp("Fábio", "sem-arroba", "senha-segura", extra)).rejects.toMatchObject({ code: "invalid_email" });
  });
});

describe("Cadastro — createAccount do banco local (usado pelo servidor de desenvolvimento)", () => {
  it("grava os metadados na conta e o gatilho cria o aceite 'cadastro' com o navegador e o e-mail em código", async () => {
    const user = await core.createAccount(" Gabi Souza ", " Gabi@Teste.dev ", "senha-segura", false, {
      phone: PHONE,
      terms_version: "2.0",
      declares_adult: "true",
      declares_physician: "true",
      user_agent: "UA/Gabi",
    });
    expect(user.email).toBe("gabi@teste.dev");
    expect(await metaOf(user.id)).toEqual({ name: "Gabi Souza", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true", user_agent: "UA/Gabi" });
    expect(await profileOf(user.id)).toEqual({ name: "Gabi Souza", phone: PHONE });
    expect(await acceptances(user.id)).toEqual([
      { document: "termo_uso", version: "2.0", origin: "cadastro", user_agent: "UA/Gabi", email_hash: sha256("gabi@teste.dev") },
    ]);
  });

  it("sem metadados a conta nasce como antes, só com o nome", async () => {
    const user = await core.createAccount("Hugo Lima", "hugo@teste.dev", "senha-segura");
    expect(await metaOf(user.id)).toEqual({ name: "Hugo Lima" });
    expect(await profileOf(user.id)).toEqual({ name: "Hugo Lima", phone: null });
    expect(await acceptances(user.id)).toEqual([]);
  });

  it("o nome vem do parâmetro nome, nunca dos metadados; e administrador continua sendo o quarto parâmetro", async () => {
    const user = await core.createAccount("Iara Gomes", "iara@teste.dev", "senha-segura", true, { name: "Outro Nome", phone: PHONE });
    expect(await profileOf(user.id)).toEqual({ name: "Iara Gomes", phone: PHONE });
    const role = (await db.query<any>(`select role from public.user_roles where user_id = $1`, [user.id])).rows[0].role;
    expect(role).toBe("admin");
  });
});

describe("Cadastro — servidor de desenvolvimento (/api/dev-db)", () => {
  it("o app de desenvolvimento leva WhatsApp, versão do termo e navegador ao banco", async () => {
    const devBackend = createDevServerBackend(base);
    const result = await devBackend.signUp("Jade Rocha", "jade@teste.dev", "senha-segura", { phone: "+351912345678", termsVersion: "2.0", declaresAdult: true, declaresPhysician: true, userAgent: "UA/Jade" });
    expect(result.needsEmailConfirmation).toBe(false);

    const boot = await devBackend.rpc<any>("app_bootstrap");
    expect(boot.profile).toMatchObject({ name: "Jade Rocha", phone: "+351912345678" });
    expect(boot.legal).toMatchObject({ phone_missing: false, gate_required: false, termo_uso: { accepted: "2.0" } });

    const id = (await devBackend.getUser())!.id;
    expect(await acceptances(id)).toEqual([
      { document: "termo_uso", version: "2.0", origin: "cadastro", user_agent: "UA/Jade", email_hash: sha256("jade@teste.dev") },
    ]);
  });

  it("sem os dados novos o cadastro de desenvolvimento continua igual e pede o aceite", async () => {
    const devBackend = createDevServerBackend(base);
    await devBackend.signUp("Kaue Neves", "kaue@teste.dev", "senha-segura");
    const boot = await devBackend.rpc<any>("app_bootstrap");
    expect(boot.profile).toMatchObject({ name: "Kaue Neves", phone: null });
    expect(boot.legal).toMatchObject({ phone_missing: true, gate_required: true });
  });

  it("o roteador só repassa texto: número, objeto ou lista nos campos novos são ignorados", async () => {
    const post = (body: unknown) =>
      fetch(`${base}/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const ruim = await post({ name: "Lia Prado", email: "lia@teste.dev", password: "senha-segura", phone: 5541999998888, terms_version: 1, user_agent: { a: 1 } });
    expect(ruim.status).toBe(200);
    const id = ((await ruim.json()) as any).user.id;
    expect(await metaOf(id)).toEqual({ name: "Lia Prado" });
    expect(await profileOf(id)).toEqual({ name: "Lia Prado", phone: null });
    expect(await acceptances(id)).toEqual([]);

    // campos com outros nomes não entram nos metadados da conta
    const solto = await post({ name: "Maju Reis", email: "maju@teste.dev", password: "senha-segura", phone: PHONE, role: "admin", is_admin: "true" });
    const idSolto = ((await solto.json()) as any).user.id;
    expect(await metaOf(idSolto)).toEqual({ name: "Maju Reis", phone: PHONE });
  });
});

describe("Cadastro — Supabase (produção)", () => {
  const REDIRECT = "https://exemplo.test/novo";

  it("manda nome, WhatsApp, versão do termo e navegador em options.data, junto do redirecionamento", async () => {
    supabase.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const sb = createSupabaseBackend("https://x.supabase.test", "chave-anonima", REDIRECT);

    const result = await sb.signUp("Nina Alves", "nina@teste.dev", "senha-segura", { phone: PHONE, termsVersion: "2.0", declaresAdult: true, declaresPhysician: true, userAgent: "UA/Nina" });
    expect(supabase.signUp).toHaveBeenLastCalledWith({
      email: "nina@teste.dev",
      password: "senha-segura",
      options: { data: { name: "Nina Alves", phone: PHONE, terms_version: "2.0", user_agent: "UA/Nina", declares_adult: "true", declares_physician: "true" }, emailRedirectTo: `${REDIRECT}?confirmacao=1` },
    });
    expect(result).toEqual({ needsEmailConfirmation: true }); // sem sessão: o e-mail precisa ser confirmado
  });

  it("sem os dados novos manda só o nome, como antes", async () => {
    supabase.signUp.mockResolvedValueOnce({ data: { session: { access_token: "t" } }, error: null });
    const sb = createSupabaseBackend("https://x.supabase.test", "chave-anonima", REDIRECT);

    const result = await sb.signUp("Otto Reis", "otto@teste.dev", "senha-segura");
    expect(supabase.signUp).toHaveBeenLastCalledWith({
      email: "otto@teste.dev",
      password: "senha-segura",
      options: { data: { name: "Otto Reis" }, emailRedirectTo: `${REDIRECT}?confirmacao=1` },
    });
    expect(result).toEqual({ needsEmailConfirmation: false });
  });

  it("campo novo vazio não vai, e o navegador é cortado em 300 caracteres", async () => {
    supabase.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const sb = createSupabaseBackend("https://x.supabase.test", "chave-anonima", REDIRECT);

    await sb.signUp("Pia Lopes", "pia@teste.dev", "senha-segura", { phone: "", termsVersion: undefined, userAgent: "x".repeat(500) });
    const data = supabase.signUp.mock.lastCall![0].options.data;
    expect(Object.keys(data)).toEqual(["name", "user_agent"]);
    expect(data.user_agent).toHaveLength(300);
  });

  it("erro do Supabase continua virando o erro do app", async () => {
    supabase.signUp.mockResolvedValueOnce({ data: { session: null }, error: { code: "user_already_exists", message: "User already registered" } });
    const sb = createSupabaseBackend("https://x.supabase.test", "chave-anonima", REDIRECT);
    await expect(sb.signUp("Quin", "quin@teste.dev", "senha-segura", { phone: PHONE, termsVersion: "2.0" })).rejects.toMatchObject({ code: "email_taken" });
  });
});
