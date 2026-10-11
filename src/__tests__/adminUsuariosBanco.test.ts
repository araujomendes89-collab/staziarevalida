// @vitest-environment node
/**
 * Administração › Usuários, parte do banco (Postgres real em memória, todas as migrações):
 *  - US02: excluir quem já aprovou/publicou conteúdo ou conferiu cartão de atualização explica o motivo em português,
 *    não apaga nada e não deixa rastro no registro de ações;
 *  - US05: a lista e a ficha trazem as áreas de revisão médica (só para administrador).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const REVISORA = "00000000-0000-4000-8000-0000000000c1";
const PUBLICADOR = "00000000-0000-4000-8000-0000000000c2";
const CONFERENTE = "00000000-0000-4000-8000-0000000000c3";
const COMUM = "00000000-0000-4000-8000-0000000000c4";
const UNIT_VERSION = "00000000-0000-4000-8000-0000000000f1";

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [REVISORA, "revisora@teste.dev", "Dra. Revisora"],
    [PUBLICADOR, "publicador@teste.dev", "Publicador"],
    [CONFERENTE, "conferente@teste.dev", "Conferente"],
    [COMUM, "comum@teste.dev", "Pessoa Comum"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  // Registros que prendem a conta (sem checar as chaves das tabelas vizinhas, que não importam aqui).
  await db.exec(`set session_replication_role = replica`);
  await db.query(`insert into public.ch_approvals (unit_version_id, kind, reviewer_id, area_code, content_hash) values ($1, 'medical', $2, 'pediatria', 'h1')`, [UNIT_VERSION, REVISORA]);
  await db.query(`insert into public.ch_publications (unit_version_id, content_hash, published_by) values ($1, 'h1', $2)`, [UNIT_VERSION, PUBLICADOR]);
  await db.query(
    `insert into public.question_update_cards (question_id, version, temporal_status, impact_level, what_changed, reviewed_by)
     values ('q-1', 1, 'MAJOR_GUIDELINE_CHANGE', 'MAJOR_CHANGE', 'Mudou a conduta recomendada em 2026.', $1)`,
    [CONFERENTE]
  );
  await db.exec(`set session_replication_role = origin`);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'pediatria'), ($1, 'clinica_medica')`, [REVISORA]);
}, 60_000);

describe("US02 · excluir quem já aprovou, publicou ou conferiu", () => {
  const apagar = (id: string, email: string) => rpc(ADMIN, "app_admin_delete_user", { p_user_id: id, p_confirm_email: email });
  const existe = async (id: string) => (await db.query(`select 1 from auth.users where id = $1`, [id])).rows.length === 1;

  it.each([
    ["aprovou conteúdo", REVISORA, "revisora@teste.dev", /aprovou ou publicou conteúdo na Central de Conteúdo/],
    ["publicou conteúdo", PUBLICADOR, "publicador@teste.dev", /aprovou ou publicou conteúdo na Central de Conteúdo/],
    ["conferiu cartão de atualização", CONFERENTE, "conferente@teste.dev", /conferiu cartões de atualização de questões/],
  ])("quem %s: explica o motivo e o que fazer, e não apaga nada", async (_nome, id, email, motivo) => {
    const antes = (await db.query(`select count(*)::int as n from public.admin_audit_log`)).rows[0] as any;
    const erro: Error = await apagar(id, email).then(
      () => new Error("não recusou"),
      (e) => e
    );
    expect(erro.message).toMatch(motivo);
    expect(erro.message).toMatch(/mude o papel para Aluno e o plano para Expirado/);
    // a tela só mostra frase pronta: começa com maiúscula, termina com ponto e não tem termo técnico
    expect(erro.message).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].{3,240}[.!?]$/);
    expect(erro.message).not.toMatch(/permission|syntax|violates|column|relation|function|null value|duplicate key|fetch/i);
    expect(await existe(id)).toBe(true);
    const depois = (await db.query(`select count(*)::int as n from public.admin_audit_log`)).rows[0] as any;
    expect(depois.n).toBe(antes.n); // recusa não vira "usuário excluído" no registro
  });

  it("quem não tem nada preso continua podendo ser excluído, com registro da ação", async () => {
    expect(await apagar(COMUM, " Comum@Teste.dev ")).toBe(true);
    expect(await existe(COMUM)).toBe(false);
    const log = (await db.query(`select action from public.admin_audit_log order by created_at desc limit 1`)).rows[0] as any;
    expect(log.action).toBe("user.delete");
  });

  it("continua só para administrador e pedindo o e-mail de confirmação", async () => {
    await expect(rpc(EDITOR, "app_admin_delete_user", { p_user_id: REVISORA, p_confirm_email: "revisora@teste.dev" })).rejects.toThrow(/restrito a administradores/);
    await expect(rpc(null, "app_admin_delete_user", { p_user_id: REVISORA, p_confirm_email: "revisora@teste.dev" })).rejects.toThrow();
    await expect(apagar(REVISORA, "outro@teste.dev")).rejects.toThrow(/e-mail do usuário/);
    await expect(apagar(ADMIN, "master@teste.dev")).rejects.toThrow(/própria conta/);
  });
});

describe("US05 · revisor médico aparece na lista e na ficha", () => {
  it("a lista traz as áreas de revisão de cada pessoa (vazio para quem não revisa)", async () => {
    const todos = await rpc(ADMIN, "app_admin_users");
    const revisora = todos.items.find((u: any) => u.id === REVISORA);
    expect(revisora.reviewer_areas).toEqual(["clinica_medica", "pediatria"]);
    expect(todos.items.find((u: any) => u.id === EDITOR).reviewer_areas).toEqual([]);
  });

  it("a ficha traz as mesmas áreas; trocar papel ou plano não perde a informação", async () => {
    expect((await rpc(ADMIN, "app_admin_user", { p_user_id: REVISORA })).reviewer_areas).toEqual(["clinica_medica", "pediatria"]);
    expect((await rpc(ADMIN, "app_admin_set_role", { p_user_id: REVISORA, p_role: "student" })).reviewer_areas).toEqual(["clinica_medica", "pediatria"]);
  });

  it("segue barrado para editor e visitante", async () => {
    await expect(rpc(EDITOR, "app_admin_users")).rejects.toThrow(/restrito a administradores/);
    await expect(rpc(EDITOR, "app_admin_user", { p_user_id: REVISORA })).rejects.toThrow(/restrito a administradores/);
    await expect(rpc(null, "app_admin_users")).rejects.toThrow();
  });
});

describe("US03 · páginas da lista sem repetir nem sumir (empate no created_at)", () => {
  it("120 pessoas com o MESMO created_at: páginas de 50 cobrem todas, uma vez cada", async () => {
    const before = ((await db.query(`select count(*)::int as n from auth.users`)).rows[0] as any).n;
    await db.exec(`
      insert into auth.users (id, email, created_at)
      select ('00000000-0000-4000-8000-' || lpad(to_hex(1000 + g), 12, '0'))::uuid, 'lote' || g || '@teste.dev', timestamptz '2026-01-01 12:00:00+00'
      from generate_series(1, 120) g`);
    const total = before + 120;
    const vistos: string[] = [];
    for (let offset = 0; offset < total; offset += 50) {
      const page = await rpc(ADMIN, "app_admin_users", { p_limit: 50, p_offset: offset });
      expect(page.total).toBe(total);
      vistos.push(...page.items.map((u: any) => u.id));
    }
    expect(vistos).toHaveLength(total);
    expect(new Set(vistos).size).toBe(total);
    const todos = (await db.query(`select id from auth.users`)).rows.map((r: any) => r.id);
    expect([...vistos].sort()).toEqual([...todos].sort());
  });
});
