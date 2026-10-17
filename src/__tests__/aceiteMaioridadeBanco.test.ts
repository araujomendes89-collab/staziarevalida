// @vitest-environment node
/**
 * Aceite com a maioridade numa caixa só, sem a declaração de médico(a)
 * (supabase/migrations/20261003013661_aceite_com_maioridade.sql, decisão do dono de 17/10/2026 à noite).
 * Ensaio no PGlite: banco com todas as migrações de antes, contas criadas ANTES do remendo, migração aplicada duas vezes, o desfazer e
 * a volta. Nada aqui toca o banco real.
 *   * cadastro novo grava adult (physician nulo) e não cai na tela de aceite;
 *   * Google / tela de aceite gravam adult;
 *   * quem já tinha as duas declarações continua com N3/N4; quem não declarou a maioridade não tem N3/N4.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = "20261003013661_aceite_com_maioridade.sql";
const ler = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NOVA_SQL = ler(`supabase/migrations/${NOVA}`);
const DESFAZER = ler("supabase/desfazer/20261003013661_aceite_com_maioridade.desfazer.sql");
const SEM_MAIORIDADE = "Confirme que você tem 18 anos ou mais.";

let db: PGlite;
let seq = 0;

async function rpc<T = any>(uid: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return e.message;
  }
  throw new Error("Era para recusar, mas passou.");
}
async function signUp(meta: Record<string, unknown>) {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `pessoa${seq}@teste.dev`, meta]);
  return id;
}
const declaracoes = async (uid: string) =>
  (await db.query<any>(
    `select a.version, a.origin, d.adult, d.physician from public.legal_acceptances a
     left join public.legal_declarations d on d.acceptance_id = a.id where a.user_id = $1 and a.document = 'termo_uso' order by a.id`, [uid])).rows;
const legal = async (uid: string) => (await rpc(uid, "app_bootstrap")).legal;
const adulto = async (uid: string) => (await db.query<any>(`select public.tutor_adult_declared($1) as v`, [uid])).rows[0].v;
const salvarNivel = (uid: string, nivel: string) => rpc(uid, "app_tutor_save_explosiva_preferences", { p_level: nivel, p_shouts: true, p_profanity: true });
const definicoes = async () =>
  (await db.query<any>(
    `select p.proname, pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('legal_record', 'tutor_adult_declared', 'app_tutor_save_explosiva_preferences') order by 1, 2`)).rows;

let antigoDuas: string; // aceitou o 2.0 com as duas declarações antes do remendo
let antigoNada: string; // conta sem aceite nenhum, criada antes do remendo
let defsAntes: unknown;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ler("supabase/tests/bootstrap.sql"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== NOVA && f !== "20261003013740_termo_v3.sql").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(`update public.tutor_explosiva_config set enabled = true`);
  antigoDuas = await signUp({ name: "Antigo", terms_version: "2.0", declares_adult: "true", declares_physician: "true" });
  antigoNada = await signUp({ name: "Sem nada" });
  defsAntes = await definicoes();
  // aplicada duas vezes: tem de poder ser colada de novo sem estragar nada
  await db.exec(NOVA_SQL);
  await db.exec(NOVA_SQL);
}, 180_000);

describe("Aceite com maioridade — antes do remendo (como está no ar)", () => {
  it("o aceite e os níveis N3/N4 exigiam também a declaração de médico", () => {
    const txt = JSON.stringify(defsAntes);
    expect(txt).toContain("and d.adult and d.physician)");
    expect(txt).toContain("coalesce(p_physician, false)) then");
  });
});

describe("Aceite com maioridade — depois do remendo", () => {
  it("cadastro novo só com a maioridade grava adult (physician nulo) e não cai na tela de aceite", async () => {
    const id = await signUp({ name: "Ana", terms_version: "2.0", declares_adult: "true", user_agent: "UA/1" });
    expect(await declaracoes(id)).toEqual([{ version: "2.0", origin: "cadastro", adult: true, physician: null }]);
    expect(await legal(id)).toMatchObject({ gate_required: false, termo_uso: { accepted: "2.0" } });
    expect(await adulto(id)).toBe(true);
  });

  it("cadastro sem a maioridade não grava o aceite: a tela de aceite pede depois", async () => {
    const id = await signUp({ name: "Bia", terms_version: "2.0" });
    expect(await declaracoes(id)).toEqual([]);
    expect(await legal(id)).toMatchObject({ gate_required: true, declarations_required: true });
  });

  it("Google e tela de aceite: com a maioridade gravam adult; sem ela recusam com a mensagem nova", async () => {
    const id = await signUp({ name: "Gui" });
    expect(await recusa(rpc(id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: false, p_physician: true, p_origin: "google" })))
      .toBe(SEM_MAIORIDADE);
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "2.0", p_origin: "google" }))).toBe(SEM_MAIORIDADE);
    const r = await rpc<any>(id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: true, p_physician: false, p_origin: "google" });
    expect(r.legal).toMatchObject({ gate_required: false, termo_uso: { accepted: "2.0" } });
    expect(await declaracoes(id)).toEqual([{ version: "2.0", origin: "google", adult: true, physician: null }]);

    const tela = await signUp({ name: "Tela" });
    await rpc(tela, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: true, p_physician: null, p_origin: "tela_aceite" });
    expect(await declaracoes(tela)).toEqual([{ version: "2.0", origin: "tela_aceite", adult: true, physician: null }]);
  });

  it("quem já tinha as duas declarações continua igual e com N3/N4", async () => {
    expect(await declaracoes(antigoDuas)).toEqual([{ version: "2.0", origin: "cadastro", adult: true, physician: true }]);
    expect(await adulto(antigoDuas)).toBe(true);
    expect((await salvarNivel(antigoDuas, "n4")).choice.level).toBe("n4");
  });

  it("só com a maioridade também libera N3/N4; quem não declarou não tem N3/N4", async () => {
    const id = await signUp({ name: "Caio", terms_version: "2.0", declares_adult: "true" });
    expect((await salvarNivel(id, "n3")).choice.level).toBe("n3");
    expect(await adulto(antigoNada)).toBe(false);
    expect(await recusa(salvarNivel(antigoNada, "n3"))).toBe("Os níveis 3 e 4 ficam liberados depois do aceite do Termo com a declaração de maioridade.");
    expect((await salvarNivel(antigoNada, "n2")).choice.level).toBe("n2");
  });

  it("a prova continua só com 'sim': adult obrigatório; physician só true ou vazio", async () => {
    const id = await signUp({ name: "Prova", terms_version: "2.0", declares_adult: "true" });
    const [{ id: aceite }] = (await db.query<any>(`select id from public.legal_acceptances where user_id = $1`, [id])).rows;
    await expect(db.query(`update public.legal_declarations set physician = false where acceptance_id = $1`, [aceite])).rejects.toThrow();
    await expect(db.query(`update public.legal_declarations set adult = false where acceptance_id = $1`, [aceite])).rejects.toThrow();
  });

  it("as funções seguem SECURITY DEFINER com search_path vazio e fechadas para o navegador", async () => {
    const r = (await db.query<any>(
      `select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and (p.proname = 'tutor_adult_declared' or (p.proname = 'legal_record' and p.pronargs = 7))`)).rows;
    expect(r).toHaveLength(2);
    for (const f of r) expect(f).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], anon: false, auth: false });
  });
});

describe("Aceite com maioridade — desfazer e aplicar de novo", () => {
  it("o desfazer volta as funções de antes e a migração colada de novo tira outra vez", async () => {
    await db.exec(DESFAZER);
    await db.exec(DESFAZER);
    expect(await definicoes()).toEqual(defsAntes);
    const id = await signUp({ name: "Depois do desfazer" });
    expect(await recusa(rpc(id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: true, p_physician: false, p_origin: "google" })))
      .toBe("Confirme que você tem 18 anos ou mais e que é médico(a).");
    await db.exec(NOVA_SQL);
    await rpc(id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: true, p_physician: false, p_origin: "google" });
    expect(await legal(id)).toMatchObject({ gate_required: false });
  });

  it("recusa remendar uma função diferente da esperada (e não muda nada)", async () => {
    await db.exec("begin");
    try {
      await db.exec(`create or replace function public.tutor_adult_declared(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$ select false $$`);
      await expect(db.exec(NOVA_SQL)).rejects.toThrow(/diferente da esperada/);
    } finally {
      await db.exec("rollback");
    }
  });
});
