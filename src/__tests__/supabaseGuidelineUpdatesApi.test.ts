// @vitest-environment node
/**
 * Atualizações & Diretrizes (supabase/migrations/…4100_atualizacoes_diretrizes.sql) num Postgres real em memória:
 * o conteúdo do app anterior entra como rascunho, só revisor médico da área confere (com a fonte oficial registrada),
 * só o administrador publica, editar depois da conferência volta a revisão, e o aluno só vê o que foi publicado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const REVIEWER = "00000000-0000-4000-8000-0000000000f1"; // revisor médico de Gineco & Obstetrícia (papel de aluno)
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const PE = "prot-go-preeclampsia-2025";
const HAS = "prot-cm-has-sbc-2026";
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
const asUser = (uid: string, sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return tx.query<any>(sql, params);
  });
const idOf = async (slug: string) => (await db.query<any>(`select id from public.guideline_updates where slug = $1`, [slug])).rows[0].id as string;
const adminItem = async (slug: string) => (await rpc(ADMIN, "app_admin_guideline_updates")).items.find((u: any) => u.slug === slug);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'rev@t.dev'), ($4, 'al@t.dev')`, [ADMIN, EDITOR, REVIEWER, STUDENT]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`update public.profiles set name = 'Dra. Revisora' where id = $1`, [REVIEWER]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA')`, [REVIEWER]);
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count) values ('e', 'REVALIDA', 2024, 1, 'E', 10)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: id, explanation: "" })));
  for (let i = 1; i <= 6; i++) {
    await db.query(`insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option) values ($1, $2, 'e', $3, 'GINECOLOGIA_OBSTETRICIA', $4, $5, $6::jsonb, 'B')`,
      [`q${i}`, `C${i}`, i, i <= 4 ? "Doenças hipertensivas da gestação" : "Pré-natal", i <= 4 ? "Gestante com pré-eclâmpsia grave. Qual a conduta?" : "Gestante no pré-natal de baixo risco.", options]);
  }
}, 300_000);

describe("Conteúdo do app anterior", () => {
  it("as 19 atualizações entram como rascunho, sem fonte, com o que não se sustenta registrado para o revisor", async () => {
    const all = await rpc(ADMIN, "app_admin_guideline_updates");
    expect(all.items.length).toBe(19);
    expect(all.items.every((u: any) => u.origin === "legacy_app" && u.review_status === "pending" && !u.published && u.source_url === null)).toBe(true);
    const pe = all.items.find((u: any) => u.slug === PE);
    expect(pe).toMatchObject({ area: "GINECOLOGIA_OBSTETRICIA", years: [2025], search_terms: "pré-eclâmpsia" });
    expect(pe.legacy).toMatchObject({ status_label: "VALIDADO_OFICIAL_SUS", original_url_check: { http_status: 404 } });
    expect(pe.legacy.cited_questions[0]).toMatchObject({ exam_code: "REV-2021-GO-45", matched_topic: "Doenças hipertensivas da gestação" });
    expect(pe.flashcards.length).toBe(1);
    expect(pe.timeline[0]).toMatchObject({ year: 2025 });
    expect(pe.current_conduct.startsWith("✅")).toBe(false);
  });

  it("o aluno não vê rascunho: lista vazia e detalhe nulo", async () => {
    const list = await rpc(STUDENT, "app_guideline_updates");
    expect(list).toMatchObject({ total: 0, items: [] });
    expect(await rpc(STUDENT, "app_guideline_update", { p_slug: PE })).toBeNull();
    expect(await rpc(null, "app_guideline_updates")).toBeNull(); // sem login: nada (como as demais funções do app)
  });
});

describe("Conferência médica e publicação", () => {
  it("só revisor médico da área confere, e aprovar exige o endereço do documento oficial", async () => {
    const id = await idOf(PE);
    await expect(rpc(EDITOR, "app_admin_review_guideline_update", { p_id: id, p_decision: "approve", p_note: "Conferido no documento." })).rejects.toThrow(/revisor cadastrado/);
    await expect(rpc(REVIEWER, "app_admin_review_guideline_update", { p_id: await idOf(HAS), p_decision: "approve", p_note: "Conferido no documento." })).rejects.toThrow(/revisor cadastrado em Clínica Médica/);
    await expect(rpc(REVIEWER, "app_admin_review_guideline_update", { p_id: id, p_decision: "approve", p_note: "curta" })).rejects.toThrow(/10 caracteres/);
    await expect(rpc(REVIEWER, "app_admin_review_guideline_update", { p_id: id, p_decision: "approve", p_note: "Conferido no documento oficial." })).rejects.toThrow(/endereço do documento oficial/);
    const pe = await adminItem(PE);
    await expect(rpc(REVIEWER, "app_admin_save_guideline_update", { p_update: { ...pe, source_url: "http://inseguro.test" } })).rejects.toThrow(/https/);
    await rpc(REVIEWER, "app_admin_save_guideline_update", { p_update: { ...pe, source_url: "https://www.gov.br/saude/documento-conferido" } });
    const after = await rpc(REVIEWER, "app_admin_review_guideline_update", { p_id: id, p_decision: "approve", p_note: "Conferido no documento oficial, página 12." });
    const item = after.items.find((u: any) => u.slug === PE);
    expect(item).toMatchObject({ review_status: "approved", reviewer: "Dra. Revisora", reviewed: true });
    expect(item.source_checked_at).toBeTruthy();
  });

  it("só o administrador publica; o aluno vê a conduta conferida, o treino pelo tema e a fonte", async () => {
    const id = await idOf(PE);
    await expect(rpc(REVIEWER, "app_admin_publish_guideline_update", { p_id: id, p_published: true })).rejects.toThrow(/administradores/);
    await rpc(ADMIN, "app_admin_publish_guideline_update", { p_id: id, p_published: true });
    const list = await rpc(STUDENT, "app_guideline_updates");
    expect(list).toMatchObject({ total: 1, by_area: { GINECOLOGIA_OBSTETRICIA: 1 }, years: [2025] });
    expect(list.items[0]).toMatchObject({ slug: PE, reviewed: true, source_url: "https://www.gov.br/saude/documento-conferido" });
    expect(list.items[0].legacy).toBeUndefined();
    const detail = await rpc(STUDENT, "app_guideline_update", { p_slug: PE });
    expect(detail).toMatchObject({ questions_count: 4, reviewed: true });
    expect(detail.timeline.length).toBeGreaterThan(0);
    expect(detail.flashcards.length).toBe(1);
    expect(JSON.stringify(detail)).not.toMatch(/VALIDADO_OFICIAL_SUS|review_note|legacy/);
    const s = await rpc(STUDENT, "app_start_guideline_questions", { p_slug: PE, p_count: 10 });
    expect(s.filters).toEqual({ area: "GINECOLOGIA_OBSTETRICIA", search: "pré-eclâmpsia" });
    expect(s.count).toBe(4);
  });

  it("filtros do aluno: área, ano e busca sem acento", async () => {
    expect((await rpc(STUDENT, "app_guideline_updates", { p_area: "PEDIATRIA" })).items).toEqual([]);
    expect((await rpc(STUDENT, "app_guideline_updates", { p_year: 2026 })).items).toEqual([]);
    expect((await rpc(STUDENT, "app_guideline_updates", { p_search: "eclampsia" })).items.length).toBe(1);
  });

  it("editar depois de conferida volta a revisão (o aluno passa a ver o aviso); recusada não publica", async () => {
    const pe = await adminItem(PE);
    const saved = await rpc(ADMIN, "app_admin_save_guideline_update", { p_update: { ...pe, current_conduct: pe.current_conduct + " Texto alterado." } });
    expect(saved).toMatchObject({ review_status: "pending", review_note: expect.stringMatching(/revisar de novo/) });
    expect((await rpc(STUDENT, "app_guideline_update", { p_slug: PE })).reviewed).toBe(false);
    // só mudar a ordem não invalida a conferência
    await rpc(REVIEWER, "app_admin_review_guideline_update", { p_id: pe.id, p_decision: "approve", p_note: "Conferido de novo no documento oficial." });
    const again = await adminItem(PE);
    expect((await rpc(ADMIN, "app_admin_save_guideline_update", { p_update: { ...again, position: 99, priority: 2 } })).review_status).toBe("approved");
    // recusada não pode ser publicada
    const other = await idOf("prot-go-hpv-dna-2025");
    await rpc(REVIEWER, "app_admin_review_guideline_update", { p_id: other, p_decision: "reject", p_note: "Fonte não localizada no Ministério." });
    await expect(rpc(ADMIN, "app_admin_publish_guideline_update", { p_id: other, p_published: true })).rejects.toThrow(/recusada/);
  });

  it("publicar sem conferência é decisão do administrador e fica marcado para o aluno", async () => {
    await rpc(ADMIN, "app_admin_publish_guideline_update", { p_id: await idOf(HAS), p_published: true });
    const has = await rpc(STUDENT, "app_guideline_update", { p_slug: HAS });
    expect(has).toMatchObject({ reviewed: false, reviewed_at: null, source_url: null });
    const log = await rpc(ADMIN, "app_admin_audit", { p_limit: 20 });
    expect(JSON.stringify(log)).toMatch(/guideline_update\.publish/);
  });
});

describe("Cadastro e segurança", () => {
  it("nova atualização: linha do tempo define os anos; flashcards e questão de treino são conferidos", async () => {
    const base = { area: "PEDIATRIA", topic: "Atualização de teste", timeline: [{ year: 2026, text: "Mudança de teste" }, { year: "abc", text: "ignorada" }] };
    const n = await rpc(EDITOR, "app_admin_save_guideline_update", { p_update: base });
    expect(n).toMatchObject({ years: [2026], review_status: "pending", published: false });
    expect(n.timeline).toEqual([{ year: 2026, text: "Mudança de teste" }]);
    await expect(rpc(EDITOR, "app_admin_save_guideline_update", { p_update: { ...base, id: n.id, flashcards: [{ front: "", back: "x" }] } })).rejects.toThrow(/frente e verso/);
    await expect(rpc(EDITOR, "app_admin_save_guideline_update", { p_update: { ...base, id: n.id, practice_questions: [{ statement: "curto", answer: "E", options: [] }] } })).rejects.toThrow(/quatro alternativas/);
    const ok = await rpc(EDITOR, "app_admin_save_guideline_update", { p_update: { ...base, id: n.id, flashcards: [{ front: "Pergunta de teste?", back: "Resposta" }] } });
    expect(ok.flashcards).toEqual([{ front: "Pergunta de teste?", back: "Resposta" }]);
    await expect(rpc(EDITOR, "app_admin_delete_guideline_update", { p_id: n.id })).rejects.toThrow(/administradores/);
    expect(await rpc(ADMIN, "app_admin_delete_guideline_update", { p_id: n.id })).toBe(true);
  });

  it("aluno não lê rascunho direto na tabela, não escreve e não chama o painel", async () => {
    expect((await asUser(STUDENT, `select slug from public.guideline_updates`)).rows.map((r: any) => r.slug).sort()).toEqual([HAS, PE].sort());
    await expect(asUser(STUDENT, `update public.guideline_updates set published = true`)).resolves.toMatchObject({ affectedRows: 0 });
    await expect(asUser(STUDENT, `insert into public.guideline_updates (slug, area, topic) values ('x-y-z', 'PEDIATRIA', 'Invasão')`)).rejects.toThrow();
    await expect(rpc(STUDENT, "app_admin_guideline_updates")).rejects.toThrow(/equipe de conteúdo/);
    await expect(rpc(STUDENT, "app_admin_save_guideline_update", { p_update: { area: "PEDIATRIA", topic: "Invasão" } })).rejects.toThrow(/equipe de conteúdo/);
    // revisor de outra área edita só a própria área
    await expect(rpc(REVIEWER, "app_admin_save_guideline_update", { p_update: { area: "PEDIATRIA", topic: "Fora da área" } })).rejects.toThrow(/outra área/);
  });
});
