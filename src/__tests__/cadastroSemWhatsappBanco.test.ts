// @vitest-environment node
/**
 * Cadastro sem WhatsApp (supabase/migrations/20261003013660_cadastro_sem_whatsapp.sql, decisão do dono de 17/10/2026).
 * Ensaio no PGlite: banco com todas as migrações de antes, contas criadas ANTES do remendo, migração aplicada duas vezes, o desfazer e
 * a volta. Nada aqui toca o banco real.
 *   * cadastro sem telefone passa (o gatilho cria a conta e grava o aceite com as declarações);
 *   * aceite sem telefone libera a tela de aceite;
 *   * quem já tem telefone continua igual.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = "20261003013660_cadastro_sem_whatsapp.sql";
const ler = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NOVA_SQL = ler(`supabase/migrations/${NOVA}`);
const DESFAZER = ler("supabase/desfazer/20261003013660_cadastro_sem_whatsapp.desfazer.sql");

const PHONE = "+5541999998888";
const DECLARA = { declares_adult: "true", declares_physician: "true" };

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
async function signUp(meta: Record<string, unknown>) {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `aluno${seq}@teste.dev`, meta]);
  return id;
}
const legal = async (uid: string) => (await rpc(uid, "app_bootstrap")).legal;
const telefone = async (uid: string) => (await db.query<any>(`select phone from public.profiles where id = $1`, [uid])).rows[0]?.phone ?? null;
const aceites = async (uid: string) =>
  (await db.query<any>(
    `select a.version, a.origin, d.adult, d.physician from public.legal_acceptances a
     left join public.legal_declarations d on d.acceptance_id = a.id where a.user_id = $1 and a.document = 'termo_uso' order by a.id`, [uid])).rows;

// contas criadas antes do remendo
let comZap: string; // aceitou o Termo vigente e tem WhatsApp
let semZapAceitou: string; // aceitou o Termo vigente, sem WhatsApp (ficava preso na tela de aceite)
let semNada: string; // sem aceite e sem WhatsApp
let estadoComZapAntes: unknown;
let definicaoAntes: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ler("supabase/tests/bootstrap.sql"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== NOVA && f !== "20261003013740_termo_v3.sql").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  comZap = await signUp({ name: "Com WhatsApp", phone: PHONE, terms_version: "2.0", ...DECLARA });
  semZapAceitou = await signUp({ name: "Sem WhatsApp", terms_version: "2.0", ...DECLARA });
  semNada = await signUp({ name: "Sem nada" });
  estadoComZapAntes = await legal(comZap);
  definicaoAntes = (await db.query<any>(`select pg_get_functiondef('public.app_legal_state()'::regprocedure) as d`)).rows[0].d;
  // aplicada duas vezes: tem de poder ser colada de novo sem estragar nada
  await db.exec(NOVA_SQL);
  await db.exec(NOVA_SQL);
}, 180_000);

describe("Cadastro sem WhatsApp — antes do remendo (como está no ar)", () => {
  it("o aluno que aceitou o Termo mas não tem WhatsApp ficava preso na tela de aceite", () => {
    expect(definicaoAntes).toContain("or v_phone_missing)");
  });
});

describe("Cadastro sem WhatsApp — depois do remendo", () => {
  it("cadastro sem telefone passa: conta criada, aceite 2.0 com as declarações gravado e nenhuma tela de aceite", async () => {
    const id = await signUp({ name: "Ana", terms_version: "2.0", user_agent: "UA/1", ...DECLARA });
    expect(await telefone(id)).toBeNull();
    expect(await aceites(id)).toEqual([{ version: "2.0", origin: "cadastro", adult: true, physician: true }]);
    expect(await legal(id)).toMatchObject({ student: true, phone_missing: true, gate_required: false, termo_uso: { accepted: "2.0" } });
  });

  it("quem já tinha aceitado e estava sem WhatsApp sai da tela de aceite", async () => {
    expect(await legal(semZapAceitou)).toMatchObject({ student: true, phone_missing: true, gate_required: false });
  });

  it("sem aceite a tela continua (com as declarações); aceitar sem telefone libera", async () => {
    expect(await legal(semNada)).toMatchObject({ gate_required: true, declarations_required: true, termo_uso: { accepted: null } });
    const r = await rpc<any>(semNada, "app_accept_terms_declared", {
      p_document: "termo_uso", p_version: "2.0", p_origin: "tela_aceite", p_phone: null, p_user_agent: "UA/2", p_adult: true, p_physician: true,
    });
    expect(r.legal).toMatchObject({ gate_required: false, phone_missing: true, termo_uso: { accepted: "2.0" } });
    expect(await telefone(semNada)).toBeNull();
  });

  it("cadastro sem telefone e sem as declarações continua na tela de aceite (as declarações seguem obrigatórias)", async () => {
    const id = await signUp({ name: "Bia", terms_version: "2.0" });
    expect(await aceites(id)).toEqual([]);
    expect(await legal(id)).toMatchObject({ gate_required: true, termo_uso: { accepted: null } });
  });

  it("quem já tem WhatsApp continua igual (mesmo telefone, mesma abertura)", async () => {
    expect(await telefone(comZap)).toBe(PHONE);
    expect(await legal(comZap)).toEqual(estadoComZapAntes);
  });

  it("o WhatsApp continua opcional e validado quando vem (cadastro, aceite e Minha conta)", async () => {
    const id = await signUp({ name: "Caio", phone: PHONE, terms_version: "2.0", ...DECLARA });
    expect(await telefone(id)).toBe(PHONE);
    const ruim = await signUp({ name: "Davi", phone: "41999998888", terms_version: "2.0", ...DECLARA });
    expect(await telefone(ruim)).toBeNull();
    expect(await legal(ruim)).toMatchObject({ gate_required: false });
    await expect(rpc(ruim, "app_update_profile", { p_patch: { phone: "123" } })).rejects.toThrow();
    await rpc(ruim, "app_update_profile", { p_patch: { phone: PHONE } });
    expect(await telefone(ruim)).toBe(PHONE);
  });

  it("a função segue SECURITY DEFINER com search_path vazio e a regra não olha mais o telefone", async () => {
    const r = (await db.query<any>(
      `select p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'app_legal_state'`)).rows;
    expect(r).toHaveLength(1);
    expect(r[0].prosecdef).toBe(true);
    expect(r[0].proconfig).toEqual(['search_path=""']);
    expect(r[0].d).not.toContain("or v_phone_missing");
    expect(r[0].d).toContain("'phone_missing', v_phone_missing");
  });
});

describe("Cadastro sem WhatsApp — desfazer e aplicar de novo", () => {
  it("o desfazer volta a regra de antes e a migração colada de novo tira outra vez", async () => {
    await db.exec(DESFAZER);
    await db.exec(DESFAZER);
    expect((await db.query<any>(`select pg_get_functiondef('public.app_legal_state()'::regprocedure) as d`)).rows[0].d).toBe(definicaoAntes);
    expect(await legal(semZapAceitou)).toMatchObject({ gate_required: true });
    await db.exec(NOVA_SQL);
    expect(await legal(semZapAceitou)).toMatchObject({ gate_required: false });
  });

  it("recusa remendar uma função diferente da esperada", async () => {
    await db.exec("begin");
    try {
      await db.exec(`create or replace function public.app_legal_state() returns jsonb language sql stable security definer set search_path = '' as $$ select '{}'::jsonb $$`);
      await expect(db.exec(NOVA_SQL)).rejects.toThrow(/não tem a regra esperada/);
    } finally {
      await db.exec("rollback");
    }
  });
});
