// @vitest-environment node
/**
 * Administração (configurações, visão geral, estações) no banco simulado (PGlite com todas as migrações).
 * CF07: as configurações internas (app_settings, tutor_config) só a equipe lê direto; o aluno continua recebendo o aviso
 *       ativo (app_announcement) e a situação do Tutor (app_tutor_status) pelas funções.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const ANA = "00000000-0000-4000-8000-00000000000a";

let db: PGlite;

async function as<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(uid ? `set local role authenticated` : `set local role anon`);
    if (uid) await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const rpc = async (uid: string, fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  const r = await as<{ result: any }>(uid, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
  return r[0].result;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [ANA, "ana@teste.dev", "Ana Lima"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 60_000);

describe("CF07: configurações internas só para a equipe", () => {
  it("o aluno não lê as tabelas de configuração direto (rascunho do aviso, preços, limites)", async () => {
    expect(await as(ANA, `select key from public.app_settings`)).toEqual([]);
    expect(await as(ANA, `select id from public.tutor_config`)).toEqual([]);
  });

  it("a equipe (editor e administrador) continua lendo", async () => {
    for (const uid of [ADMIN, EDITOR]) {
      expect((await as<{ key: string }>(uid, `select key from public.app_settings`)).map((r) => r.key).sort()).toEqual(["announcement", "trial_days"]);
      expect(await as(uid, `select id from public.tutor_config`)).toHaveLength(1);
    }
  });

  it("o aluno continua recebendo o aviso ativo, mas não o rascunho", async () => {
    expect(await rpc(ANA, "app_announcement")).toBeNull();
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: false, tone: "info", title: "Rascunho interno", text: "Ainda não publicar" } } });
    expect(await rpc(ANA, "app_announcement")).toBeNull();
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: "Manutenção", text: "Sábado às 8h" } } });
    expect(await rpc(ANA, "app_announcement")).toEqual({ tone: "info", title: "Manutenção", text: "Sábado às 8h" });
  });

  it("o visitante (sem login) não executa o aviso", async () => {
    await expect(as(null, `select public.app_announcement()`)).rejects.toThrow(/permission denied/i);
  });

  it("o aluno segue vendo a situação do Tutor pela função", async () => {
    const status = await rpc(ANA, "app_tutor_status");
    expect(status).toHaveProperty("entitlement");
    expect(status).not.toHaveProperty("tts_price_per_1k_chars_usd");
  });
});
