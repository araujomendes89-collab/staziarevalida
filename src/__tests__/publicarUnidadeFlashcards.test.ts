// @vitest-environment node
/**
 * Grupo B, CC02 etapa 2 (migração 9862): os flashcards da unidade entram no baralho StaziaMed de todos os alunos,
 * sem perder a agenda de revisão entre versões; cartão que sai é escondido (não apagado) e não conta como vencido.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, ALUNO2, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { aprovar, conteudoDaVersao, montarUnidade, preparaBanco, publicar } from "./helpers/centralUnidades";

let db: PGlite; let sql: Sql; let rpc: Rpc; let asUser: AsUser;
const M9861 = path.resolve(__dirname, "../../supabase/migrations/20261003009861_publicar_unidade_aula_aluno.sql");
const M9862 = path.resolve(__dirname, "../../supabase/migrations/20261003009862_publicar_unidade_flashcards.sql");
beforeAll(async () => { ({ db, sql, rpc, asUser } = await abrirBanco()); await preparaBanco(sql); }, 240_000);

const meusCartoes = async (uid: string) => (await asUser(uid, `select * from public.my_flashcards('')`)) as any[];
const novaVersao = async (u: { unidade: string; afirmacao: string }, n: number, cards: { front: string; back: string }[], titulo: string) => {
  const [v] = await sql(`insert into public.ch_unit_versions (unit_id, version, content, content_hash) values ($1, $2, '{"sections": []}', public.ch_hash('{"sections": []}'::jsonb)) returning id`, [u.unidade, n]);
  await conteudoDaVersao(rpc, sql, v.id, u.afirmacao, { titulo, cards, secoes: [{ heading: "Conceito", paragraphs: [`Texto da versão ${n}.`] }] });
  await aprovar(rpc, v.id);
  return v.id as string;
};

describe("Flashcards da Central no baralho de todos os alunos", () => {
  it("Publicar cria os cartões (dono nulo, revisados por médico, com o tema da aula) e todo aluno os vê; ninguém os edita nem apaga", async () => {
    const u = await montarUnidade(sql, rpc, {
      titulo: "Cartões da pré-eclâmpsia",
      cards: [{ front: "Qual a tríade?", back: "Pressão, proteína, edema." }, { front: "Conduta inicial?", back: "Internar." }, { front: "  QUAL a tríade?  ", back: "Pressão,  proteína, edema." }],
    });
    expect((await rpc(ADMIN, "app_ch_publish_preview", { p_version_id: u.versao })).cards).toEqual({ added: 2, kept: 0, hidden: 0, total: 2 });
    const r = await publicar(rpc, u.versao);
    expect(r.distribution.flashcards).toEqual({ added: 2, kept: 0, hidden: 0, total: 2 });
    const aula = (await sql(`select id, area, topic from public.lessons where ch_unit_id = $1`, [u.unidade]))[0];
    const cartoes = (await meusCartoes(ALUNO)).filter((c) => ["Qual a tríade?", "Conduta inicial?"].includes(c.front));
    expect(cartoes).toHaveLength(2);
    expect(cartoes[0]).toMatchObject({ area: aula.area, topic: aula.topic, mine: false });
    expect(await meusCartoes(ALUNO2)).toEqual(expect.arrayContaining([expect.objectContaining({ front: "Conduta inicial?" })]));
    const linhas = await sql(`select owner_id, review_status, published, ch_unit_id from public.flashcards where ch_unit_id = $1`, [u.unidade]);
    expect(linhas).toHaveLength(2);
    for (const l of linhas) expect(l).toMatchObject({ owner_id: null, review_status: "medical_reviewed", published: true, ch_unit_id: u.unidade });
    // o aluno não apaga nem altera cartão da Central
    await asUser(ALUNO, `delete from public.flashcards where ch_unit_id = $1`, [u.unidade]);
    await asUser(ALUNO, `update public.flashcards set back = 'trocado' where ch_unit_id = $1`, [u.unidade]);
    expect((await sql(`select count(*)::int n from public.flashcards where ch_unit_id = $1 and back <> 'trocado'`, [u.unidade]))[0].n).toBe(2);
    // a publicação registra o que foi feito
    expect((await sql(`select distribution from public.ch_publications where unit_version_id = $1`, [u.versao]))[0].distribution.flashcards).toMatchObject({ added: 2 });
  });

  it("versão nova: cartão igual (mesmo com espaços e maiúsculas diferentes) é o mesmo cartão e mantém a agenda do aluno; mudado entra novo; o que saiu some sem perder a agenda", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Agenda dos cartões", cards: [{ front: "Primeira linha?", back: "Resposta um." }, { front: "Segunda?", back: "Resposta dois." }, { front: "Terceira?", back: "Resposta três." }] });
    await publicar(rpc, u.versao);
    const ids = Object.fromEntries((await sql(`select front, id from public.flashcards where ch_unit_id = $1`, [u.unidade])).map((c) => [c.front, c.id]));
    for (const front of ["Primeira linha?", "Segunda?"])
      await sql(`insert into public.flashcard_states (user_id, card_id, due, stability, difficulty, reps, state, scheduled_days) values ($1, $2, now() - interval '1 day', 5, 4, 3, 2, 10)`, [ALUNO, ids[front]]);
    expect((await rpc(ALUNO, "app_bootstrap")).flashcards_due).toBeGreaterThanOrEqual(2);
    const dueAntes = (await rpc(ALUNO, "app_bootstrap")).flashcards_due as number;

    const v2 = await novaVersao(u, 2, [{ front: "  PRIMEIRA   linha?", back: "resposta um." }, { front: "Segunda corrigida?", back: "Resposta dois corrigida." }, { front: "Quarta?", back: "Resposta quatro." }], "Agenda dos cartões");
    expect((await rpc(ADMIN, "app_ch_publish_preview", { p_version_id: v2 })).cards).toEqual({ added: 2, kept: 1, hidden: 2, total: 3 });
    const r = await publicar(rpc, v2);
    expect(r.distribution.flashcards).toEqual({ added: 2, kept: 1, hidden: 2, total: 3 });
    const depois = await sql(`select id, front, published from public.flashcards where ch_unit_id = $1`, [u.unidade]);
    // o igual continua sendo o mesmo registro, com a agenda do aluno intacta
    const igual = depois.find((c) => c.id === ids["Primeira linha?"]);
    expect(igual).toMatchObject({ published: true });
    expect((await sql(`select reps, state from public.flashcard_states where user_id = $1 and card_id = $2`, [ALUNO, ids["Primeira linha?"]]))[0]).toEqual({ reps: 3, state: 2 });
    // os que saíram ficam escondidos, não apagados, e a agenda deles fica guardada
    for (const front of ["Segunda?", "Terceira?"]) expect(depois.find((c) => c.id === ids[front])).toMatchObject({ published: false });
    const fronts = (await meusCartoes(ALUNO)).map((c) => c.front);
    expect(fronts).toEqual(expect.arrayContaining(["Primeira linha?", "Segunda corrigida?", "Quarta?"]));
    expect(fronts).not.toContain("Segunda?");
    expect(fronts).not.toContain("Terceira?");
    const [guardado] = await sql(`select due, hidden_due, reps from public.flashcard_states where user_id = $1 and card_id = $2`, [ALUNO, ids["Segunda?"]]);
    expect(guardado.reps).toBe(3);
    expect(guardado.hidden_due).toBeTruthy();
    // cartão escondido não conta como vencido (e não trava o "fila zerada")
    expect((await rpc(ALUNO, "app_bootstrap")).flashcards_due).toBe(dueAntes - 1);
    // versão 3 traz o cartão antigo de volta: mesma linha, agenda de volta
    const v3 = await novaVersao(u, 3, [{ front: "Segunda?", back: "Resposta dois." }], "Agenda dos cartões");
    await publicar(rpc, v3);
    const [volta] = await sql(`select c.published, s.due, s.hidden_due from public.flashcards c join public.flashcard_states s on s.card_id = c.id where c.id = $1 and s.user_id = $2`, [ids["Segunda?"], ALUNO]);
    expect(volta.published).toBe(true);
    expect(volta.hidden_due).toBeNull();
    expect(new Date(volta.due).getTime()).toBeLessThan(Date.now());
    expect((await rpc(ALUNO, "app_bootstrap")).flashcards_due).toBeGreaterThanOrEqual(1);
  });

  it("Retirar esconde os cartões da unidade; nada é apagado; publicar de novo traz de volta", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Cartões retirados", cards: [{ front: "Retirável?", back: "Sim." }] });
    await publicar(rpc, u.versao);
    expect((await meusCartoes(ALUNO)).map((c) => c.front)).toContain("Retirável?");
    await rpc(ADMIN, "app_ch_retire", { p_version_id: u.versao, p_reason: "Revisão pediu para retirar." });
    expect((await meusCartoes(ALUNO)).map((c) => c.front)).not.toContain("Retirável?");
    expect((await sql(`select count(*)::int n from public.flashcards where ch_unit_id = $1`, [u.unidade]))[0].n).toBe(1);
    const v2 = await novaVersao(u, 2, [{ front: "Retirável?", back: "Sim." }], "Cartões retirados");
    await publicar(rpc, v2);
    expect((await meusCartoes(ALUNO)).map((c) => c.front)).toContain("Retirável?");
    expect((await sql(`select count(*)::int n from public.flashcards where ch_unit_id = $1`, [u.unidade]))[0].n).toBe(1);
  });

  it("cartão com frente ou verso vazio, ou grande demais, trava a publicação", async () => {
    const vazio = await montarUnidade(sql, rpc, { titulo: "Cartão vazio", cards: [{ front: "Pergunta sem resposta?", back: "   " }], semAprovar: true });
    expect(((await rpc(ADMIN, "app_ch_publish_problems", { p_version_id: vazio.versao })) as string[]).join(" | ")).toMatch(/flashcard sem frente ou sem verso/);
    const grande = await montarUnidade(sql, rpc, { titulo: "Cartão enorme", cards: [{ front: "Pergunta?", back: "x".repeat(4001) }], semAprovar: true });
    expect(((await rpc(ADMIN, "app_ch_publish_problems", { p_version_id: grande.versao })) as string[]).join(" | ")).toMatch(/Flashcard grande demais/);
  });

  it("unidade sem flashcards publica a aula normalmente", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Só a aula", cards: [] });
    const r = await publicar(rpc, u.versao);
    expect(r.distribution.flashcards).toEqual({ added: 0, kept: 0, hidden: 0, total: 0 });
  });

  it("colar 9861, 9862 e 9861 de novo (e a 9862 outra vez) não desfaz os flashcards nem dá erro", async () => {
    for (const f of [M9861, M9862, M9861, M9862]) await db.exec(fs.readFileSync(f, "utf8"));
    const u = await montarUnidade(sql, rpc, { titulo: "Depois de colar tudo de novo", cards: [{ front: "Ainda funciona?", back: "Sim." }] });
    expect((await publicar(rpc, u.versao)).distribution.flashcards.added).toBe(1);
    for (const fn of ["ch_cards_plan(uuid)", "ch_distribute_cards(uuid, uuid)", "ch_hide_cards(uuid)", "ch_publish_problems_cards(uuid)", "ch_version_cards(uuid)", "ch_hide_card_rows(uuid[])"])
      expect((await sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a, has_function_privilege('anon', 'public.${fn}', 'execute') b`))[0]).toEqual({ a: false, b: false });
  });
});
