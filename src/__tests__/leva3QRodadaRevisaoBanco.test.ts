// @vitest-environment node
/**
 * Leva 3, aba Questões: rodada de correções da revisão independente, parte do banco (achados 3, 4, 5, 9 e 10 da revisão).
 * Num Postgres real em memória com todas as migrações (supabase/migrations/…97NN_*.sql).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ADMIN, ANA, EDITOR, idOf, MIGRATIONS, question, REV_CIR, REV_PED, startDb, type Db } from "./helpers/questoesLeva3";

let t: Db;
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return null;
};
const read = (re: RegExp) => fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((f) => re.test(f))!), "utf8");
const save = (extra: Record<string, unknown>, uid = EDITOR) => t.rpc(uid, "app_admin_save_question", { p_question: extra });
const NOTE = "Conferi a explicação com a diretriz vigente.";

beforeAll(async () => {
  t = await startDb();
}, 120_000);

describe("achado 4: a tela só promete a revisão quando o banco a pratica", () => {
  const readyOf = async (uid = EDITOR) => ({
    question: (await t.rpc<any>(uid, "app_admin_question", { p_id: idOf(940) })).comment_review_ready,
    list: (await t.rpc<any>(uid, "app_admin_questions", { p_filters: {}, p_limit: 5, p_offset: 0 })).comment_review_ready,
  });
  beforeAll(async () => {
    await save(question(940));
  });

  it("a questão e a lista da equipe dizem true quando tudo está colado; o aluno não chama nenhuma das duas", async () => {
    expect(await readyOf(EDITOR)).toEqual({ question: true, list: true });
    expect(await readyOf(ADMIN)).toEqual({ question: true, list: true });
    expect(await failure(t.rpc(ANA, "app_admin_question", { p_id: idOf(940) }))).toMatch(/restrito|Acesso/i);
  });

  it("dizem false quando a …9620 foi colada de novo depois (as funções do aluno voltam a mostrar tudo) e quando falta o gatilho; true de novo ao colar esta", async () => {
    await t.db.exec(read(/^20261003009620_/));
    expect(await readyOf()).toEqual({ question: false, list: false });
    await t.db.exec(read(/^20261003009701_/));
    expect(await readyOf()).toEqual({ question: true, list: true });
    await t.db.exec(`drop trigger questions_comment_review_mark on public.questions`);
    expect(await readyOf()).toEqual({ question: false, list: false });
    expect(await t.rpc(ADMIN, "app_question_comment_check")).toEqual({ ok: false, faltando: ["gatilho questions_comment_review_mark"] });
    await t.db.exec(read(/^20261003009701_/));
    expect(await readyOf()).toEqual({ question: true, list: true });
    expect(await t.rpc(ADMIN, "app_question_comment_check")).toEqual({ ok: true, faltando: [] });
  });
});

describe("achado 9: o revisor médico vê a figura da questão que vai revisar", () => {
  it("app_admin_comment_review devolve as figuras (caminho e texto alternativo) ao revisor sem papel de equipe, da área dele", async () => {
    await save(question(950, { needs_image: true, expected_conduct: "Suporte ventilatório." }));
    const path1 = `questoes/${"b".repeat(32)}.png`;
    await t.sql(`select public.ch_worker_question_figure_confirm($1, 'image/png', 1000)`, [path1]);
    await t.rpc(EDITOR, "app_admin_set_question_image", { p_question_id: idOf(950), p_image: { path: path1, alt: "Radiografia de tórax em PA com infiltrado difuso" } });
    const view = await t.rpc<any>(REV_PED, "app_admin_comment_review", { p_question_id: idOf(950) });
    expect(view.images).toEqual([{ path: path1, alt: "Radiografia de tórax em PA com infiltrado difuso" }]);
    // revisor de outra área continua sem acesso ao conteúdo
    expect(await failure(t.rpc(REV_CIR, "app_admin_comment_review", { p_question_id: idOf(950) }))).toMatch(/Acesso restrito/);
    // questão sem figura: lista vazia
    await save(question(951, { expected_conduct: "Hidratação." }));
    expect((await t.rpc<any>(REV_PED, "app_admin_comment_review", { p_question_id: idOf(951) })).images).toEqual([]);
  });
});

describe("achado 10: a fila do revisor tem paginação (total e deslocamento)", () => {
  it("devolve o total e as páginas seguintes na mesma ordem, sem repetir questão", async () => {
    for (const n of [960, 961, 962, 963, 964]) await save(question(n, { expected_conduct: `Conduta ${n}.` }));
    const all = await t.rpc<any>(REV_PED, "app_admin_comment_review_queue", { p_filters: {}, p_limit: 200, p_offset: 0 });
    expect(all.total).toBeGreaterThanOrEqual(5);
    const ids = all.items.map((i: any) => i.id);
    const p1 = await t.rpc<any>(REV_PED, "app_admin_comment_review_queue", { p_filters: {}, p_limit: 2, p_offset: 0 });
    const p2 = await t.rpc<any>(REV_PED, "app_admin_comment_review_queue", { p_filters: {}, p_limit: 2, p_offset: 2 });
    const p3 = await t.rpc<any>(REV_PED, "app_admin_comment_review_queue", { p_filters: {}, p_limit: 2, p_offset: 4 });
    expect(p1.total).toBe(all.total);
    expect([...p1.items, ...p2.items, ...p3.items].map((i: any) => i.id)).toEqual(ids.slice(0, 6));
  });
});

describe("achados 3 e 5: limites aceitos (decisão do dono), registrados em teste", () => {
  it("achado 3: o administrador decide mesmo sem cadastro de revisor (regra do dono: revisor médico da área OU administrador); o editor e o revisor de outra área não", async () => {
    await save(question(970, { expected_conduct: "Conduta nova a revisar." }));
    expect(await t.sql(`select 1 from public.ch_reviewer_areas where user_id = $1`, [ADMIN])).toHaveLength(0);
    const seen = { explanation_A: "", explanation_B: "", explanation_C: "", explanation_D: "", expected_conduct: "Conduta nova a revisar.", inep_intent: "" };
    for (const uid of [EDITOR, REV_CIR, ANA]) {
      expect(await failure(t.rpc(uid, "app_admin_question_comment_decide", { p_question_id: idOf(970), p_decision: "approve", p_note: NOTE, p_seen_texts: seen })), uid).toMatch(/Acesso restrito|A decisão sobre o comentário/);
    }
    const done = await t.rpc<any>(ADMIN, "app_admin_question_comment_decide", { p_question_id: idOf(970), p_decision: "approve", p_note: NOTE, p_seen_texts: seen });
    expect(done.comment_review).toBeNull();
    // fica registrado quem decidiu
    expect((await t.sql<any>(`select decided_by from public.question_comment_reviews where question_id = $1`, [idOf(970)]))[0].decided_by).toBe(ADMIN);
  });

  it("achado 5: alteração sem pessoa logada (SQL colado pelo dono, serviço) não passa pela revisão: é o jeito do dono corrigir à mão", async () => {
    await save(question(971, { expected_conduct: "Conduta original." }));
    await t.sql(`update public.questions set comment_review = null where id = $1`, [idOf(971)]);
    await t.sql(`update public.questions set expected_conduct = 'Conduta corrigida à mão pelo dono.' where id = $1`, [idOf(971)]);
    expect((await t.sql<any>(`select comment_review from public.questions where id = $1`, [idOf(971)]))[0].comment_review).toBeNull();
    // o mesmo pelo editor da tela marca em revisão
    await save({ ...question(971, { expected_conduct: "Outra conduta pela tela." }), id: idOf(971) });
    expect((await t.sql<any>(`select comment_review from public.questions where id = $1`, [idOf(971)]))[0].comment_review.campos).toEqual(["expected_conduct"]);
  });
});
