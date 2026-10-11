// @vitest-environment node
/**
 * Administração › Registro, parte do banco (supabase/migrations/…9511_registro_titulo_pessoa.sql e …9512_registro_pagina.sql)
 * num Postgres real em memória (PGlite), com todas as migrações:
 *  - RG03: aulas e podcasts mostram o título no Registro, também quando o item já foi apagado;
 *  - RG02: o papel ou o plano alterado mostra o e-mail da pessoa afetada (só quem já lê o Registro: administrador);
 *  - RG05: página, total e filtros (tipo, pessoa, data);
 *  - RG01: o que se faz na Central de Conteúdo aparece no mesmo Registro, sem repetir o que as duas tabelas já guardam.
 * A tela está em adminContentPanels.test.tsx; os nomes e resumos, em registroAdministracao.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const ANA = "00000000-0000-4000-8000-0000000000a1";
let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0].result;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'ana@t.dev')`, [ADMIN, EDITOR, ANA]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);

describe("RG02: o Registro diz de quem foi o papel ou o plano alterado", () => {
  it("papel e plano mostram o e-mail da pessoa afetada; as outras ações vêm sem pessoa", async () => {
    const bruno = "00000000-0000-4000-8000-0000000000b2";
    await db.query(`insert into auth.users (id, email) values ($1, 'bruno@t.dev')`, [bruno]);
    await rpc(ADMIN, "app_admin_set_role", { p_user_id: bruno, p_role: "editor" });
    await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: bruno, p_plan: "pro", p_status: "active" });
    await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", topic: "Asma", title: "Asma na infância" } });
    const log = await rpc(ADMIN, "app_admin_audit", { p_limit: 30 });
    const doBruno = (action: string) => log.find((l: any) => l.action === action && l.target === bruno);
    expect(doBruno("user.role")).toMatchObject({ subject: "bruno@t.dev", actor: "adm@t.dev" });
    expect(doBruno("user.subscription")).toMatchObject({ subject: "bruno@t.dev", actor: "adm@t.dev" });
    // nada novo foi gravado no registro: o e-mail é buscado na hora de mostrar (sem copiar dado pessoal)
    expect(doBruno("user.role").details).toEqual({ from: "student", to: "editor" });
    expect(log.find((l: any) => l.action === "lesson.save").subject).toBeNull();
    // a conta apagada: o registro continua, sem e-mail (a tela diz "conta excluída"); a exclusão guarda o e-mail no próprio registro
    expect(await rpc(ADMIN, "app_admin_delete_user", { p_user_id: bruno, p_confirm_email: "bruno@t.dev" })).toBe(true);
    const depois = await rpc(ADMIN, "app_admin_audit", { p_limit: 30 });
    expect(depois.find((l: any) => l.action === "user.role" && l.target === bruno).subject).toBeNull();
    expect(depois.find((l: any) => l.action === "user.delete")).toMatchObject({ target: bruno, subject: null, details: { email: "bruno@t.dev" } });
  });

  it("só o administrador vê o e-mail: editor, aluno e visitante não chamam o Registro nem as funções que buscam o e-mail", async () => {
    await expect(rpc(EDITOR, "app_admin_audit", { p_limit: 5 })).rejects.toThrow(/administradores/);
    await expect(rpc(ANA, "app_admin_audit", { p_limit: 5 })).rejects.toThrow(/administradores/);
    await expect(rpc(null, "app_admin_audit", { p_limit: 5 })).rejects.toThrow(/permission denied/);
    // as funções auxiliares são internas: nem o administrador logado as chama de fora
    await expect(rpc(ADMIN, "admin_audit_subject", { p_action: "user.role", p_target: ANA })).rejects.toThrow(/permission denied/);
    await expect(rpc(ADMIN, "admin_audit_title", { p_action: "lesson.save", p_target: ANA })).rejects.toThrow(/permission denied/);
    // direto na tabela: o editor e o aluno não leem o registro
    const leitura = async (uid: string) => db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      return (await tx.query<any>(`select count(*)::int n from public.admin_audit_log`)).rows[0].n;
    });
    expect(await leitura(EDITOR)).toBe(0);
    expect(await leitura(ANA)).toBe(0);
    expect(await leitura(ADMIN)).toBeGreaterThan(0);
  });
});

describe("RG03: título de aulas e podcasts no Registro", () => {
  it("aula e podcast mostram o título, também depois de apagados; as outras ações vêm sem título", async () => {
    const aula = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite viral aguda" } });
    const ep = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Episódio 1: sepse" } });
    await rpc(ADMIN, "app_admin_set_role", { p_user_id: ANA, p_role: "editor" });
    const antes = await rpc(ADMIN, "app_admin_audit", { p_limit: 20 });
    expect(antes.find((l: any) => l.action === "lesson.save")).toMatchObject({ target: aula.id, title: "Bronquiolite viral aguda" });
    expect(antes.find((l: any) => l.action === "podcast.save")).toMatchObject({ title: "Episódio 1: sepse" });
    expect(antes.find((l: any) => l.action === "user.role").title).toBeNull();
    // apagados: o registro guarda o título que o próprio registro viu antes
    expect(await rpc(ADMIN, "app_admin_delete_lesson", { p_id: aula.id })).toBe(true);
    await rpc(ADMIN, "app_admin_delete_podcast", { p_id: ep.id });
    const depois = await rpc(ADMIN, "app_admin_audit", { p_limit: 20 });
    expect(depois.find((l: any) => l.action === "lesson.delete")).toMatchObject({ target: aula.id, title: "Bronquiolite viral aguda" });
    expect(depois.find((l: any) => l.action === "podcast.delete")).toMatchObject({ target: ep.id, title: "Episódio 1: sepse" });
  });

  it("título de um item que mudou de nome: o registro mostra o nome de agora; material de aula não inventa título", async () => {
    const ep = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Primeiro título" } });
    await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { id: ep.id, title: "Segundo título" } });
    const log = await rpc(ADMIN, "app_admin_audit", { p_limit: 20 });
    const saves = log.filter((l: any) => l.action === "podcast.save" && l.target === ep.id);
    expect(saves.map((l: any) => l.title)).toEqual(["Segundo título", "Segundo título"]);
    // lesson.material.delete: o alvo é o código do material (já apagado): nada a mostrar
    await db.query(`insert into public.admin_audit_log (actor_id, action, target, details) values ($1, 'lesson.material.delete', '11111111-1111-4111-8111-111111111111', '{}'::jsonb)`, [ADMIN]);
    expect((await rpc(ADMIN, "app_admin_audit", { p_limit: 1 }))[0]).toMatchObject({ action: "lesson.material.delete", title: null });
  });

  it("quem não é administrador continua barrado, e o visitante nem chama", async () => {
    await expect(rpc(EDITOR, "app_admin_audit", { p_limit: 5 })).rejects.toThrow(/administradores/);
    await expect(rpc(null, "app_admin_audit", { p_limit: 5 })).rejects.toThrow(/Acesso restrito|permission denied/);
  });
});
