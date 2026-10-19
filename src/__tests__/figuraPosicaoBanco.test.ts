// @vitest-environment node
/**
 * Posição da figura no enunciado (defeito da Revalida 2024/2 Q73, 19/10/2026): a equipe grava, em cada figura, `apos` (trecho exato do
 * enunciado que aparece UMA vez; a figura entra logo depois dele) e `tipo` ("tabela" usa a largura toda). Nada muda no caminho, no
 * endereço nem no texto alternativo da figura; trocar o arquivo não perde a posição. Postgres real em memória com todas as migrações.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { ANA, EDITOR, idOf, question, startDb, type Db } from "./helpers/questoesLeva3";

let t: Db;
let counter = 0;
const fresh = () => `questoes/${(++counter).toString(16).padStart(32, "b")}.png`;
const ALT = "Tabela de exames laboratoriais do recém-nascido";
const STATEMENT = "Recém-nascido com icterícia. Os exames revelam: O pediatra iniciou fototerapia e obteve-se: Qual a conduta adequada?";
const row = async (n: number) => (await t.sql<any>(`select * from public.questions where id = $1`, [idOf(n)]))[0];
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return null;
};
const layout = (uid: string, n: number, p_layout: unknown) => t.rpc(uid, "app_admin_set_question_figure_layout", { p_question_id: idOf(n), p_layout: JSON.stringify(p_layout) });
const setFigure = async (n: number, p = fresh()) => {
  await t.sql(`select public.ch_worker_question_figure_confirm($1, 'image/png', 120000)`, [p]);
  return t.rpc<any>(EDITOR, "app_admin_set_question_image", { p_question_id: idOf(n), p_image: { path: p, alt: ALT } });
};

beforeAll(async () => {
  t = await startDb();
}, 120_000);

describe("posição da figura no enunciado", () => {
  it("a equipe grava 'apos' e 'tipo'; caminho e texto alternativo ficam iguais; o aluno recebe a posição", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(901, { statement: STATEMENT, needs_image: true }) });
    const p = fresh();
    await setFigure(901, p);
    const saved = await layout(EDITOR, 901, [{ index: 0, apos: "revelam:", tipo: "tabela" }]);
    expect(saved.images).toEqual([{ path: p, alt: ALT, apos: "revelam:", tipo: "tabela" }]);
    const view = await t.rpc<any>(ANA, "practice_question_view", { p_question_id: idOf(901) });
    expect(view.images).toEqual([{ path: p, alt: ALT, apos: "revelam:", tipo: "tabela" }]);
  });

  it("trecho que não aparece ou aparece mais de uma vez é recusado; tipo inválido também; nada muda", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(902, { statement: STATEMENT, needs_image: true }) });
    await setFigure(902);
    const antes = (await row(902)).images;
    expect(await failure(layout(EDITOR, 902, [{ index: 0, apos: "trecho que não existe" }]))).toMatch(/aparecer uma vez/);
    expect(await failure(layout(EDITOR, 902, [{ index: 0, apos: "e" }]))).toMatch(/aparecer uma vez/);
    expect(await failure(layout(EDITOR, 902, [{ index: 0, tipo: "grafico" }]))).toMatch(/tabela.*figura/);
    expect(await failure(layout(EDITOR, 902, [{ index: 3, apos: "revelam:" }]))).toMatch(/não existe/);
    expect((await row(902)).images).toEqual(antes);
  });

  it("'apos' vazio volta a figura ao lugar de sempre (tira a chave)", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(903, { statement: STATEMENT, needs_image: true }) });
    const p = fresh();
    await setFigure(903, p);
    await layout(EDITOR, 903, [{ index: 0, apos: "obteve-se:", tipo: "tabela" }]);
    const saved = await layout(EDITOR, 903, [{ index: 0, apos: "", tipo: null }]);
    expect(saved.images).toEqual([{ path: p, alt: ALT }]);
  });

  it("várias figuras (do caderno): cada uma com sua posição; o endereço continua pela posição original", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(904, { statement: STATEMENT, needs_image: true }) });
    await t.sql(`update public.questions set images = '[{"url":"/question-assets/a.png","alt":"Tabela A do caderno"},{"url":"/question-assets/b.png","alt":"Tabela B do caderno"}]'::jsonb where id = $1`, [idOf(904)]);
    const saved = await layout(EDITOR, 904, [{ index: 1, apos: "revelam:" }, { index: 0, apos: "obteve-se:", tipo: "tabela" }]);
    expect(saved.images).toEqual([
      { url: "/question-assets/a.png", alt: "Tabela A do caderno", apos: "obteve-se:", tipo: "tabela" },
      { url: "/question-assets/b.png", alt: "Tabela B do caderno", apos: "revelam:" },
    ]);
    expect(await t.rpc(ANA, "app_question_figure", { p_question_id: idOf(904), p_index: 1 })).toEqual({ url: "/question-assets/b.png", alt: "Tabela B do caderno" });
  });

  it("trocar o arquivo da figura não perde a posição", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(905, { statement: STATEMENT, needs_image: true }) });
    await setFigure(905);
    await layout(EDITOR, 905, [{ index: 0, apos: "revelam:", tipo: "tabela" }]);
    const novo = fresh();
    const saved = await setFigure(905, novo);
    expect(saved.images).toEqual([{ path: novo, alt: ALT, apos: "revelam:", tipo: "tabela" }]);
  });

  it("só a equipe: aluno não grava posição", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(906, { statement: STATEMENT, needs_image: true }) });
    await setFigure(906);
    expect(await failure(layout(ANA, 906, [{ index: 0, apos: "revelam:" }]))).not.toBeNull();
    expect((await row(906)).images[0].apos).toBeUndefined();
  });
});
