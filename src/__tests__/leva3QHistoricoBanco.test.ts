// @vitest-environment node
/**
 * Leva 3, aba Questões, Q12 (decisão do dono, 11/10/2026): histórico de mudanças da questão no editor, visível a toda a equipe
 * (editor e administrador), com quem mudou, quando, o motivo e o antes/depois. Num Postgres real em memória com todas as
 * migrações (supabase/migrations/…97NN_*.sql). A tela (e o "Voltar para este texto", que só copia) está em leva3QHistoricoTela.test.tsx.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ADMIN, ANA, EDITOR, idOf, MIGRATIONS, options, question, REV_PED, startDb, type Db } from "./helpers/questoesLeva3";

let t: Db;
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return null;
};
const edit = (n: number, extra: Record<string, unknown>, uid = EDITOR, reason?: string) =>
  t.rpc(uid, "app_admin_save_question", { p_question: { ...question(n), id: idOf(n), ...extra }, ...(reason ? { p_reason: reason } : {}) });
const history = (uid: string | null, n: number, args: Record<string, unknown> = {}) => t.rpc<any>(uid, "app_admin_question_history", { p_question_id: idOf(n), ...args });

beforeAll(async () => {
  t = await startDb();
}, 120_000);

describe("Q12 — histórico de mudanças da questão", () => {
  it("lista da mais nova para a mais antiga: quem mudou (nome), quando, o motivo e o antes e depois de cada campo", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(801) });
    const s1 = { statement: "Lactente de 4 meses com sibilância, coriza e febre baixa. Qual a conduta?" };
    const s2 = { ...s1, options: options({ B: "B é a correta: suporte." }), expected_conduct: "Suporte ventilatório." };
    await edit(801, s1);
    await edit(801, s2, ADMIN);
    await edit(801, { ...s2, inep_intent: "Avalia o manejo.", topic: "Bronquiolite aguda" }, EDITOR, "assistente de IA");
    const h = await history(EDITOR, 801);
    expect(h.total).toBe(3);
    expect(h.items.map((i: any) => i.by)).toEqual(["Editora", "Master", "Editora"]);
    expect(h.items.map((i: any) => i.reason)).toEqual(["assistente de IA", null, null]);
    expect(h.items.map((i: any) => Object.keys(i.changes).sort())).toEqual([["inep_intent", "topic"], ["expected_conduct", "options"], ["statement"]]);
    expect(h.items[0].changes.topic).toEqual({ de: "Bronquiolite", para: "Bronquiolite aguda" });
    expect(h.items[2].changes.statement.de).toBe(question(801).statement);
    expect(h.items[1].changes.options.para.find((o: any) => o.id === "B").explanation).toBe("B é a correta: suporte.");
    expect(h.items[1].changes.options.de.find((o: any) => o.id === "B").explanation).toBe("");
    // da mais nova para a mais antiga
    const dates = h.items.map((i: any) => Date.parse(i.at));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(h.items.every((i: any) => typeof i.id === "number" || /^\d+$/.test(String(i.id)))).toBe(true);
  });

  it("toda a equipe vê (editor e administrador); aluno, revisor médico sem papel de equipe e visitante, não", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(802) });
    await edit(802, { topic: "Asma" });
    expect((await history(EDITOR, 802)).total).toBe(1);
    expect((await history(ADMIN, 802)).total).toBe(1);
    for (const uid of [ANA, REV_PED]) expect(await failure(history(uid, 802)), uid).toMatch(/Acesso restrito à equipe/);
    expect(await failure(history(null, 802))).toMatch(/permission denied|permissão/i);
    // nem pela tabela: o aluno e o revisor não leem direto
    expect(await t.asUser(ANA, `select * from public.question_change_log`)).toEqual([]);
    expect(await t.asUser(REV_PED, `select * from public.question_change_log`)).toEqual([]);
  });

  it("questão inexistente é recusada; questão sem mudança volta vazia", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(803) });
    expect(await history(EDITOR, 803)).toEqual({ total: 0, items: [] });
    expect(await failure(t.rpc(EDITOR, "app_admin_question_history", { p_question_id: "nao_existe" }))).toMatch(/não encontrada/);
  });

  it("páginas: o total vem inteiro, limit e offset funcionam e o limite máximo é 200", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(804) });
    for (let i = 1; i <= 7; i++) await edit(804, { topic: `Tema ${i}` });
    const first = await history(EDITOR, 804, { p_limit: 3, p_offset: 0 });
    const second = await history(EDITOR, 804, { p_limit: 3, p_offset: 3 });
    const third = await history(EDITOR, 804, { p_limit: 3, p_offset: 6 });
    expect([first.total, first.items.length, second.items.length, third.items.length]).toEqual([7, 3, 3, 1]);
    const topics = [...first.items, ...second.items, ...third.items].map((i: any) => i.changes.topic.para);
    expect(topics).toEqual(["Tema 7", "Tema 6", "Tema 5", "Tema 4", "Tema 3", "Tema 2", "Tema 1"]);
    expect((await history(EDITOR, 804, { p_limit: 100000 })).items).toHaveLength(7);
    expect((await history(EDITOR, 804, { p_limit: 0 })).items).toHaveLength(1);
  });

  it("registra também a figura (enviada, trocada, tirada) e a marca 'Cita figura'; gabarito e situação aparecem sem ser desfeitos aqui", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(805, { needs_image: true }) });
    const p1 = `questoes/${"1".repeat(32)}.png`;
    const p2 = `questoes/${"2".repeat(32)}.jpg`;
    // o servidor confere cada arquivo antes de o banco aceitá-lo como figura
    await t.sql(`select public.ch_worker_question_figure_confirm($1, 'image/png', 1000), public.ch_worker_question_figure_confirm($2, 'image/jpeg', 1000)`, [p1, p2]);
    await t.rpc(EDITOR, "app_admin_set_question_image", { p_question_id: idOf(805), p_image: { path: p1, alt: "Eletrocardiograma com supradesnivelamento de ST" } });
    await t.rpc(ADMIN, "app_admin_set_question_image", { p_question_id: idOf(805), p_image: { path: p2, alt: "Radiografia de tórax com derrame pleural à direita" } });
    await t.rpc(EDITOR, "app_admin_remove_question_image", { p_question_id: idOf(805) });
    await edit(805, { needs_image: true, topic: "ECG" });
    await t.rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(805), p_answer: "C", p_status: "FINAL", p_source: "Gabarito definitivo", p_reason: "Recurso aceito." });
    const h = await history(EDITOR, 805);
    const figs = h.items.filter((i: any) => i.changes.figura).map((i: any) => i.changes.figura);
    expect(figs).toEqual([
      { de: "Radiografia de tórax com derrame pleural à direita", para: null },
      { de: "Eletrocardiograma com supradesnivelamento de ST", para: "Radiografia de tórax com derrame pleural à direita" },
      { de: null, para: "Eletrocardiograma com supradesnivelamento de ST" },
    ]);
    expect(h.items[0].changes).toMatchObject({ correct_option: { de: "B", para: "C" } });
    expect(h.items[0].reason).toMatch(/Gabarito oficial: FINAL/);
    expect(h.items[0].by).toBe("Master");
  });

  it("mudança feita direto no banco (sem pessoa) aparece sem nome, para ninguém achar que foi a equipe", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(806) });
    await t.sql(`update public.questions set topic = 'Corrigido à mão' where id = $1`, [idOf(806)]);
    const h = await history(EDITOR, 806);
    expect(h.items).toHaveLength(1);
    expect(h.items[0].by).toBeNull();
  });

  it("a migração pode ser colada duas vezes e o histórico que já existe continua igual", async () => {
    await t.rpc(EDITOR, "app_admin_save_question", { p_question: question(807) });
    await edit(807, { topic: "Tema A" });
    const before = await history(EDITOR, 807);
    const text = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((f) => /^20261003009702_/.test(f))!), "utf8");
    await t.db.exec(text);
    await t.db.exec(text);
    expect(await history(EDITOR, 807)).toEqual(before);
    await edit(807, { topic: "Tema B" });
    expect((await history(EDITOR, 807)).total).toBe(2);
  });
});
