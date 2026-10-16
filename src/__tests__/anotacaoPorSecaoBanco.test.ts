// @vitest-environment node
/**
 * Anotação POR SEÇÃO da aula (migração 9994, decisão do dono em 14/10/2026), no banco de teste (PGlite). Não é produção.
 * Prova: as anotações antigas (1 bloco por aula, tabela lesson_notes) passam para a chave 'geral' sem perder nada;
 * cada seção tem a sua; cada aluno só lê e grava as suas; a equipe (administrador) não lê; colar o SQL de novo não estraga nada.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN, ALUNO, ALUNO2, asUserFor, criarUsuarios, rpcFor, sqlFor, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";

const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "supabase/migrations");
const F9994 = "20261003009994_anotacao_por_secao.sql";
const migracao = () => fs.readFileSync(path.join(DIR, F9994), "utf8");
const conferir = () => fs.readFileSync(path.join(ROOT, "supabase/conferir/anotacao-por-secao.sql"), "utf8");
const ANTES = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && !f.startsWith("._") && f < F9994).sort();

let db: PGlite; let sql: Sql; let rpc: Rpc; let asUser: AsUser;
let aula: string; let rascunho: string;
const NOTA_ANTIGA = "Minha nota antiga\ncom duas linhas e acentuação: ção, é, ü.";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of ANTES) await db.exec(fs.readFileSync(path.join(DIR, f), "utf8"));
  sql = sqlFor(db); rpc = rpcFor(db); asUser = asUserFor(db);
  await criarUsuarios(sql);
  aula = (await sql(`insert into public.lessons (area, topic, title, published) values ('CLINICA_MEDICA', 'Tuberculose', 'Aula de teste', true) returning id`))[0].id;
  rascunho = (await sql(`insert into public.lessons (area, topic, title, published) values ('CLINICA_MEDICA', 'Rascunho', 'Aula em rascunho', false) returning id`))[0].id;
  // dados do jeito antigo (1 bloco por aula), gravados pela função de antes da 9994
  await rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: aula, p_note: NOTA_ANTIGA, p_checks: { "sec-1": true, "erro-2": true } });
  await rpc(ALUNO2, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "", p_checks: { "sec-3": true } });
}, 300_000);

describe("Antes de colar: o CONFERIR diz o que falta", () => {
  it("responde FALTA sem dar erro (inclusive em banco vazio)", async () => {
    expect((await db.query<any>(conferir())).rows[0].resultado).toMatch(/^FALTA: .*app_lesson_section_note_save/);
    const vazio = new PGlite();
    await vazio.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
    expect((await vazio.query<any>(conferir())).rows[0].resultado).toMatch(/^FALTA: requisito/);
    await vazio.close();
  }, 60_000);
});

describe("Migração dos dados antigos (colada duas vezes)", () => {
  let antigaEm: string;
  beforeAll(async () => {
    antigaEm = (await sql(`select updated_at::text t from public.lesson_notes where user_id = $1`, [ALUNO]))[0].t;
    await db.exec(migracao());
    await db.exec(migracao());
  });
  it("a anotação antiga vira a chave 'geral', igual letra por letra e com a mesma data", async () => {
    const r = await sql(`select section_key, note, updated_at::text t from public.lesson_section_notes where user_id = $1 and lesson_id = $2`, [ALUNO, aula]);
    expect(r).toEqual([{ section_key: "geral", note: NOTA_ANTIGA, t: antigaEm }]);
  });
  it("anotação vazia não cria linha; caixas marcadas continuam iguais", async () => {
    expect(await sql(`select 1 from public.lesson_section_notes where user_id = $1`, [ALUNO2])).toEqual([]);
    expect((await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).checks).toEqual({ "sec-1": true, "erro-2": true });
    expect((await rpc(ALUNO2, "app_lesson_notes", { p_lesson_id: aula })).checks).toEqual({ "sec-3": true });
  });
  it("a leitura devolve a geral em 'note' (tela antiga) e em 'notas' (tela nova)", async () => {
    const r = await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula });
    expect(r.note).toBe(NOTA_ANTIGA);
    expect(r.notas).toEqual({ geral: NOTA_ANTIGA });
    expect(await rpc(ALUNO2, "app_lesson_notes", { p_lesson_id: aula })).toMatchObject({ note: "", notas: {} });
  });
  it("o CONFERIR passa a dizer OK", async () => {
    expect((await db.query<any>(conferir())).rows[0].resultado).toMatch(/^OK:/);
  });
});

describe("Uma anotação por seção", () => {
  it("grava, troca e lê de volta cada seção; gravar o mesmo duas vezes não duplica", async () => {
    await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-1", p_note: "seção 1 rascunho" });
    await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-1", p_note: "seção 1 final" });
    await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-1", p_note: "seção 1 final" });
    const r = await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-12", p_note: "seção 12" });
    expect(r).toMatchObject({ ok: true, secao: "sec-12" });
    expect((await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).notas).toEqual({ geral: NOTA_ANTIGA, "sec-1": "seção 1 final", "sec-12": "seção 12" });
    expect((await sql(`select count(*)::int n from public.lesson_section_notes where user_id = $1`, [ALUNO]))[0].n).toBe(3);
  });
  it("apagar o texto de uma seção remove só ela", async () => {
    await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-12", p_note: "" });
    expect((await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).notas).toEqual({ geral: NOTA_ANTIGA, "sec-1": "seção 1 final" });
  });
  it("marcar caixas (função nova) não mexe nas anotações", async () => {
    await rpc(ALUNO, "app_lesson_checks_save", { p_lesson_id: aula, p_checks: { "sec-1": true, "sec-2": true } });
    const r = await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula });
    expect(r.checks).toEqual({ "sec-1": true, "sec-2": true });
    expect(r.notas).toEqual({ geral: NOTA_ANTIGA, "sec-1": "seção 1 final" });
  });
  it("recusa seção inválida, texto longo demais, caixas inválidas e aula em rascunho", async () => {
    for (const s of ["", "sec-0", "sec-1000", "secao 1", "GERAL", "sec-1; drop"])
      await expect(rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: s, p_note: "x" }), s).rejects.toThrow(/Seção inválida/);
    await expect(rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-2", p_note: "x".repeat(20001) })).rejects.toThrow(/20\.000/);
    await expect(rpc(ALUNO, "app_lesson_checks_save", { p_lesson_id: aula, p_checks: { a: "sim" } })).rejects.toThrow(/Caixa marcada inválida/);
    await expect(rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: rascunho, p_secao: "sec-1", p_note: "x" })).rejects.toThrow(/Aula não encontrada/);
    await expect(rpc(ALUNO, "app_lesson_checks_save", { p_lesson_id: rascunho, p_checks: {} })).rejects.toThrow(/Aula não encontrada/);
    expect(await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: rascunho })).toMatchObject({ note: "", notas: {}, checks: {} });
  });
  it("visitante sem login não lê nem grava", async () => {
    for (const [fn, args] of [
      ["app_lesson_notes", { p_lesson_id: aula }],
      ["app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-1", p_note: "x" }],
      ["app_lesson_checks_save", { p_lesson_id: aula, p_checks: {} }],
    ] as const) await expect(rpc(null, fn, args), fn).rejects.toThrow();
  });
});

describe("Privacidade: cada aluno só vê as suas; a equipe não lê", () => {
  beforeAll(async () => {
    await rpc(ALUNO2, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "sec-1", p_note: "segredo do aluno 2" });
  });
  it("um aluno não lê a anotação do outro (nem pela função, nem direto na tabela)", async () => {
    expect((await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).notas["sec-1"]).toBe("seção 1 final");
    expect((await rpc(ALUNO2, "app_lesson_notes", { p_lesson_id: aula })).notas).toEqual({ "sec-1": "segredo do aluno 2" });
    const visto = await asUser(ALUNO, `select user_id, note from public.lesson_section_notes`);
    expect(visto.length).toBeGreaterThan(0);
    expect(visto.every((r) => r.user_id === ALUNO)).toBe(true);
    expect(JSON.stringify(visto)).not.toMatch(/segredo do aluno 2/);
  });
  it("o administrador não lê anotação de aluno (tabela nova e antiga) e não tem função para isso", async () => {
    expect(await asUser(ADMIN, `select * from public.lesson_section_notes`)).toEqual([]);
    expect(await asUser(ADMIN, `select * from public.lesson_notes`)).toEqual([]);
    expect(await rpc(ADMIN, "app_lesson_notes", { p_lesson_id: aula })).toMatchObject({ note: "", notas: {} });
  });
  it("ninguém grava direto na tabela (só pelas funções)", async () => {
    await expect(asUser(ALUNO, `insert into public.lesson_section_notes (user_id, lesson_id, section_key, note) values ($1, $2, 'sec-5', 'x')`, [ALUNO, aula])).rejects.toThrow(/permission denied/);
    await expect(asUser(ALUNO, `update public.lesson_section_notes set note = 'trocada' where user_id = $1`, [ALUNO2])).rejects.toThrow(/permission denied/);
    await expect(asUser(ALUNO, `delete from public.lesson_section_notes`)).rejects.toThrow(/permission denied/);
  });
});

describe("Transição: tela antiga e tela nova convivem; colar de novo não ressuscita nada", () => {
  it("a tela antiga (app_lesson_notes_save) continua gravando e cai na 'geral'", async () => {
    await rpc(ALUNO2, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "escrita pela tela antiga", p_checks: { x: true } });
    const r = await rpc(ALUNO2, "app_lesson_notes", { p_lesson_id: aula });
    expect(r.notas).toEqual({ geral: "escrita pela tela antiga", "sec-1": "segredo do aluno 2" });
    expect(r.checks).toEqual({ x: true });
  });
  it("a 'geral' gravada pela tela nova fica igual na tabela antiga; apagada não volta ao colar o SQL de novo", async () => {
    await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "geral", p_note: "geral editada" });
    expect((await sql(`select note from public.lesson_notes where user_id = $1 and lesson_id = $2`, [ALUNO, aula]))[0].note).toBe("geral editada");
    await rpc(ALUNO, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "geral", p_note: "" });
    await db.exec(migracao());
    const r = await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula });
    expect(r.notas).toEqual({ "sec-1": "seção 1 final" });
    expect(r.checks).toEqual({ "sec-1": true, "sec-2": true });
  });
  it("aluno sem linha antiga grava a geral pela tela nova e as caixas ficam vazias", async () => {
    await sql(`delete from public.lesson_notes where user_id = $1`, [ADMIN]);
    await rpc(ADMIN, "app_lesson_section_note_save", { p_lesson_id: aula, p_secao: "geral", p_note: "do admin como aluno" });
    expect(await rpc(ADMIN, "app_lesson_notes", { p_lesson_id: aula })).toMatchObject({ note: "do admin como aluno", checks: {} });
  });
  it("se sobrar anotação antiga sem cópia, o CONFERIR avisa e colar de novo resolve", async () => {
    await sql(`update public.lesson_notes set note = 'sobrou' where user_id = $1 and lesson_id = $2`, [ALUNO, aula]);
    expect((await db.query<any>(conferir())).rows[0].resultado).toMatch(/^FALTA: anotação antiga ainda não copiada para a chave geral \(1\)/);
    await db.exec(migracao());
    expect((await db.query<any>(conferir())).rows[0].resultado).toMatch(/^OK:/);
    expect((await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).notas.geral).toBe("sobrou");
  });
});
