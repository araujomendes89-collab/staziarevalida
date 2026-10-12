// @vitest-environment node
/**
 * Fase 1 · B12 no banco (supabase/migrations/…9835_suporte_e_relatos.sql): contato de suporte (uma configuração só, padrão
 * suporte@staziamed.com.br, editável só pelo administrador, legível até pelo visitante do login) e "Relatar um problema" (só o próprio
 * aluno grava, só a equipe lê e marca como resolvido, limite de tamanho e de 5 por 24 horas). A migração pode ser colada várias vezes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const FILE = "20261003009835_suporte_e_relatos.sql";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const ANA = id(3);
const BIA = id(4);

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
/** Roda um SQL direto como a pessoa (para provar o que a política de linhas permite), sem as funções do app. */
async function direto<T = any>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const falha = async (p: Promise<unknown>, re: RegExp) => {
  await expect(p).rejects.toThrow(re);
};
const reportar = (uid: string, message: string, screen: string | null = "Simulados") => rpc(uid, "app_report_problem", { p_screen: screen, p_message: message });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  // colada de novo, duas vezes: não pode dar erro nem apagar nada
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8"));
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8"));
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'master@teste.dev', '{"name":"Master"}'), ($2, 'editor@teste.dev', '{"name":"Editora"}'), ($3, 'ana@teste.dev', '{"name":"Ana"}'), ($4, 'bia@teste.dev', '{"name":"Bia"}')`,
    [ADMIN, EDITOR, ANA, BIA]
  );
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 120_000);

describe("Contato de suporte: uma configuração só", () => {
  it("o padrão é suporte@staziamed.com.br e até o visitante do login consegue ler", async () => {
    expect(await rpc(null, "app_support_contact")).toEqual({ email: "suporte@staziamed.com.br" });
    expect(await rpc(ANA, "app_support_contact")).toEqual({ email: "suporte@staziamed.com.br" });
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.support_config`)).rows[0].n).toBe(1);
  });

  it("o aluno e o visitante não leem nem mudam a tabela direto", async () => {
    await expect(direto(ANA, `select email from public.support_config`)).rejects.toThrow(/permission denied/i);
    await expect(direto(ANA, `update public.support_config set email = 'x@y.zz'`)).rejects.toThrow(/permission denied/i);
  });

  it("só o administrador muda; e-mail inválido é recusado em português; fica no Registro", async () => {
    await falha(rpc(ANA, "app_admin_save_support_contact", { p_email: "outro@staziamed.com.br" }), /Acesso restrito a administradores/);
    await falha(rpc(EDITOR, "app_admin_save_support_contact", { p_email: "outro@staziamed.com.br" }), /Acesso restrito a administradores/);
    await falha(rpc(null, "app_admin_save_support_contact", { p_email: "outro@staziamed.com.br" }), /permission denied|Acesso restrito/i);
    await falha(rpc(ADMIN, "app_admin_save_support_contact", { p_email: "sem-arroba" }), /Informe um e-mail de suporte válido/);
    await falha(rpc(ADMIN, "app_admin_save_support_contact", { p_email: "" }), /Informe um e-mail de suporte válido/);
    expect(await rpc(ADMIN, "app_admin_save_support_contact", { p_email: "  Ajuda@StaziaMed.com.br " })).toEqual({ email: "ajuda@staziamed.com.br" });
    expect(await rpc(null, "app_support_contact")).toEqual({ email: "ajuda@staziamed.com.br" });
    const log = (await db.query<any>(`select action, details from public.admin_audit_log where action = 'support.contact'`)).rows;
    expect(log).toEqual([{ action: "support.contact", details: { email: "ajuda@staziamed.com.br" } }]);
    await rpc(ADMIN, "app_admin_save_support_contact", { p_email: "suporte@staziamed.com.br" });
  });

  it("colar a migração de novo não troca o e-mail que o administrador escolheu", async () => {
    await rpc(ADMIN, "app_admin_save_support_contact", { p_email: "ajuda@staziamed.com.br" });
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8"));
    expect(await rpc(null, "app_support_contact")).toEqual({ email: "ajuda@staziamed.com.br" });
    await rpc(ADMIN, "app_admin_save_support_contact", { p_email: "suporte@staziamed.com.br" });
  });
});

describe("Relatar um problema", () => {
  it("o aluno envia; o relato guarda quem, a tela, o texto e a data; começa aberto", async () => {
    expect(await reportar(ANA, "  O gabarito da questão 12 parece errado.  ", "Questões")).toEqual({ ok: true });
    const r = (await db.query<any>(`select user_id, screen, message, status, resolved_at, resolved_by, created_at from public.student_reports`)).rows[0];
    expect(r).toMatchObject({ user_id: ANA, screen: "Questões", message: "O gabarito da questão 12 parece errado.", status: "open", resolved_at: null, resolved_by: null });
    expect(Math.abs(new Date(r.created_at).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("visitante não envia; texto curto ou grande demais é recusado com mensagem simples", async () => {
    await falha(rpc(null, "app_report_problem", { p_screen: null, p_message: "Não consigo entrar na conta." }), /permission denied|Entre na sua conta/i);
    await falha(reportar(BIA, "curto"), /pelo menos 10 letras/);
    await falha(reportar(BIA, "          "), /pelo menos 10 letras/);
    await falha(reportar(BIA, "a".repeat(1001)), /no máximo 1000 caracteres/);
    expect(await reportar(BIA, "a".repeat(1000), null)).toEqual({ ok: true });
    expect((await db.query<any>(`select screen from public.student_reports where user_id = $1`, [BIA])).rows[0].screen).toBeNull();
  });

  it("no máximo 5 relatos por aluno nas últimas 24 horas; outro aluno não é afetado; depois de 24 h volta a poder", async () => {
    const uid = id(50);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'cheia@teste.dev', '{}')`, [uid]);
    for (let i = 1; i <= 5; i++) await reportar(uid, `Relato número ${i} com detalhe.`);
    await falha(reportar(uid, "Relato número 6 com detalhe."), /5 relatos nas últimas 24 horas/);
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.student_reports where user_id = $1`, [uid])).rows[0].n).toBe(5);
    expect(await reportar(ANA, "Outro aluno ainda pode relatar isto.")).toEqual({ ok: true });
    await db.query(`update public.student_reports set created_at = now() - interval '25 hours' where user_id = $1`, [uid]);
    expect(await reportar(uid, "Passaram 24 horas, pode de novo.")).toEqual({ ok: true });
  });

  it("direto na tabela: o aluno só grava como ele mesmo, não escolhe estado nem data, e o limite vale também aqui", async () => {
    await expect(direto(ANA, `insert into public.student_reports (user_id, message) values ($1, 'Tentando gravar como outra pessoa.')`, [BIA])).rejects.toThrow(/row-level security/i);
    await direto(ANA, `insert into public.student_reports (user_id, message, status, created_at, resolved_at) values ($1, 'Tentando já nascer resolvido.', 'resolved', '2020-01-01', now())`, [ANA]);
    const r = (await db.query<any>(`select status, resolved_at, created_at from public.student_reports where message = 'Tentando já nascer resolvido.'`)).rows[0];
    expect(r.status).toBe("open");
    expect(r.resolved_at).toBeNull();
    expect(new Date(r.created_at).getFullYear()).toBeGreaterThan(2024);
  });

  it("aluno não lê relato nenhum (nem o próprio) e não muda nem apaga; a equipe lê", async () => {
    expect(await direto(ANA, `select id from public.student_reports`)).toEqual([]);
    await expect(direto(ANA, `update public.student_reports set status = 'resolved'`)).rejects.toThrow(/permission denied/i);
    await expect(direto(ANA, `delete from public.student_reports`)).rejects.toThrow(/permission denied/i);
    expect((await direto(EDITOR, `select id from public.student_reports`)).length).toBeGreaterThan(0);
  });
});

describe("Lista dos relatos na Administração", () => {
  it("só a equipe abre a lista; aluno e visitante são recusados", async () => {
    await falha(rpc(ANA, "app_admin_reports"), /Acesso restrito à equipe/);
    await falha(rpc(null, "app_admin_reports"), /permission denied|Acesso restrito/i);
    await falha(rpc(ANA, "app_admin_report_resolve", { p_id: 1 }), /Acesso restrito à equipe/);
  });

  it("mostra data, aluno (nome e e-mail), tela e texto; os mais novos primeiro; conta os abertos", async () => {
    const lista = await rpc(EDITOR, "app_admin_reports");
    expect(lista.open).toBe(lista.total);
    expect(lista.items.length).toBe(lista.total);
    const dela = lista.items.find((x: any) => x.message === "O gabarito da questão 12 parece errado.");
    expect(dela).toMatchObject({ student_name: "Ana", student_email: "ana@teste.dev", screen: "Questões", status: "open", resolved_at: null });
    const datas = lista.items.map((x: any) => new Date(x.created_at).getTime());
    expect([...datas].sort((a, b) => b - a)).toEqual(datas);
    expect((await rpc(EDITOR, "app_admin_reports", { p_limit: 2 })).items.length).toBe(2);
  });

  it("marcar como resolvido (e reabrir) fica registrado com quem fez; o filtro separa abertos e resolvidos", async () => {
    const id1 = (await rpc(EDITOR, "app_admin_reports")).items.find((x: any) => x.student_name === "Ana").id;
    expect(await rpc(EDITOR, "app_admin_report_resolve", { p_id: id1 })).toEqual({ id: id1, status: "resolved" });
    const resolvidos = await rpc(ADMIN, "app_admin_reports", { p_status: "resolved" });
    expect(resolvidos.items.map((x: any) => x.id)).toEqual([id1]);
    expect(resolvidos.items[0]).toMatchObject({ status: "resolved", resolved_by_name: "Editora" });
    expect(resolvidos.items[0].resolved_at).toBeTruthy();
    const abertos = await rpc(ADMIN, "app_admin_reports", { p_status: "open" });
    expect(abertos.items.some((x: any) => x.id === id1)).toBe(false);
    expect(abertos.open).toBe(abertos.total);
    expect((await rpc(ADMIN, "app_admin_reports", { p_status: "all" })).total).toBeGreaterThan(abertos.total);
    expect(await rpc(ADMIN, "app_admin_report_resolve", { p_id: id1, p_resolved: false })).toEqual({ id: id1, status: "open" });
    expect((await rpc(ADMIN, "app_admin_reports", { p_status: "resolved" })).items).toEqual([]);
    const log = (await db.query<any>(`select details from public.admin_audit_log where action = 'report.resolve' order by id`)).rows;
    expect(log.map((x) => x.details.resolved)).toEqual([true, false]);
    expect(JSON.stringify(log)).not.toMatch(/gabarito/); // o texto do aluno não é copiado para o Registro
  });

  it("relato que não existe: mensagem simples", async () => {
    await falha(rpc(ADMIN, "app_admin_report_resolve", { p_id: 999999 }), /Relato não encontrado/);
  });

  it("apagar a conta do aluno apaga os relatos dele (LGPD)", async () => {
    await db.query(`delete from auth.users where id = $1`, [BIA]);
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.student_reports where user_id = $1`, [BIA])).rows[0].n).toBe(0);
  });
});
