// @vitest-environment node
/**
 * Ajustes das correções da aba Questões, leva 2 (supabase/migrations/…7710_correcoes_questoes_ajustes.sql), num Postgres
 * real em memória, por cima da …7700:
 *   1. Questão anulada fica fora de acerto e de erro em todos os números do aluno: média dos simulados (Desempenho),
 *      questões erradas e motivos declarados (Perfil de erros), diagnóstico do erro e o resumo do aluno na Administração.
 *   5. Gabarito que volta à letra de antes da troca, antes da revisão: não fica a marca "mudou de B para B" e o aluno volta
 *      a ver as explicações; só continua marcado o texto que mudou durante a troca (pode ter sido reescrito para o outro
 *      gabarito).
 *   4. A …7710 pode ser colada duas vezes sem erro e, colada antes da …7700, para com um aviso em português.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const AJUSTES = path.join(MIGRATIONS, "20261003007710_correcoes_questoes_ajustes.sql");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const CARLA = "00000000-0000-4000-8000-00000000000c";
const DANI = "00000000-0000-4000-8000-00000000000d";
const EDU = "00000000-0000-4000-8000-00000000000e";

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

const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;

const explanations = (map: Record<string, string> = {}) => ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: map[id] ?? "" }));
const q = (number: number, extra: Record<string, unknown> = {}) => ({
  kind: "REVALIDA", year: 2024, semester: 1, number, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
  statement: `Lactente de 4 meses com sibilância e coriza há 2 dias (questão ${number}). Qual a conduta?`,
  options: explanations(), correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false, ...extra,
});
const idOf = (number: number) => `revalida_2024_1_q${String(number).padStart(3, "0")}`;
const row = async (number: number) => (await sql<any>(`select * from public.questions where id = $1`, [idOf(number)]))[0];
const save = (question: Record<string, unknown>) => rpc(EDITOR, "app_admin_save_question", { p_question: question });

const session = async (uid: string, kind: "questoes" | "simulado", numbers: number[]) =>
  (await sql<any>(`insert into public.practice_sessions (user_id, kind, question_ids) values ($1, $2, $3) returning id`, [uid, kind, numbers.map(idOf)]))[0].id as string;
const answer = (uid: string, sessionId: string, number: number, option: string) =>
  rpc(uid, "app_answer_question", { p_session_id: sessionId, p_question_id: idOf(number), p_option: option, p_active_ms: 10_000 });

const official = (extra: Record<string, unknown>) => ({
  p_answer: null, p_status: "FINAL", p_source: "Gabarito oficial definitivo INEP 2024/1 (teste)", p_reason: "Conferido no edital.", ...extra,
});
const setOfficial = (number: number, extra: Record<string, unknown>) => rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(number), ...official(extra) });
const annul = (number: number) => setOfficial(number, { p_status: "ANNULLED", p_reason: "A banca anulou a questão." });
/** Anulada sem gabarito (como gravava o editor antigo). */
const annulNoKey = (number: number) => sql(`update public.questions set status = 'annulled', correct_option = null where id = $1`, [idOf(number)]);
const view = (uid: string, number: number, selected: string) => rpc(uid, "practice_correction_view", { p_question_id: idOf(number), p_selected: selected });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [CARLA, "carla@teste.dev", "Carla"],
    [DANI, "dani@teste.dev", "Dani"],
    [EDU, "edu@teste.dev", "Edu"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 60_000);

describe("1 — anulada fora de acerto e de erro em todos os números do aluno", () => {
  it("Desempenho: a média dos simulados não conta a anulada, e simulado só com anuladas não quebra a conta", async () => {
    for (const n of [60, 61, 62, 63, 64, 65]) await save(q(n));
    const sim = await session(CARLA, "simulado", [60, 61, 62, 63, 64]);
    await answer(CARLA, sim, 60, "B"); // certa
    await answer(CARLA, sim, 61, "A"); // errada; depois anulada
    await answer(CARLA, sim, 62, "B"); // certa; depois anulada (anular guarda a letra B)
    await answer(CARLA, sim, 64, "B"); // certa; a 63 fica em branco (no simulado, conta como erro)
    await rpc(CARLA, "app_finish_session", { p_session_id: sim });
    const only = await session(CARLA, "simulado", [65]);
    await annulNoKey(65);
    await answer(CARLA, only, 65, "A");
    await rpc(CARLA, "app_finish_session", { p_session_id: only });
    await annul(61);
    await annul(62);

    const perf = await rpc(CARLA, "app_performance", { p_days: 30 });
    // sem as anuladas: 60 e 64 certas, 63 em branco = 2 de 3 (67%); o simulado só com a anulada fica fora da média
    expect(perf.simulados).toEqual({ count: 2, accuracy: 67 });
    // o mesmo que o resultado do simulado e a lista "Seus simulados" mostram
    expect((await rpc(CARLA, "practice_result", { p_session_id: sim }))).toMatchObject({ total: 3, correct: 2, annulled: 2 });
    expect(perf).toMatchObject({ attempts: 2, correct: 2 });
  });

  it("Perfil de erros: anulada não conta em 'questões erradas' nem nos motivos declarados; o diagnóstico do erro não sai", async () => {
    for (const n of [66, 67, 68]) await save(q(n));
    const treino = await session(DANI, "questoes", [66, 67, 68]);
    await answer(DANI, treino, 66, "A");
    await answer(DANI, treino, 67, "A");
    await rpc(DANI, "app_save_error_note", { p_question_id: idOf(66), p_note: "", p_reason: "conhecimento" });
    await rpc(DANI, "app_save_error_note", { p_question_id: idOf(67), p_note: "", p_reason: "atencao" });
    expect(await rpc(DANI, "app_error_reasons", { p_days: 90 })).toEqual({ wrong_questions: 2, declared: { conhecimento: 1, atencao: 1 } });
    await annul(67); // anulada pelo registro depois de errada
    await annulNoKey(68); // anulada sem gabarito antes de responder: a resposta grava "falso" (a coluna não aceita nulo)
    expect(await answer(DANI, treino, 68, "C")).toMatchObject({ annulled: true, is_correct: null });

    expect(await rpc(DANI, "app_error_reasons", { p_days: 90 })).toEqual({ wrong_questions: 1, declared: { conhecimento: 1 } });
    expect(await rpc(DANI, "app_attempt_diagnosis", { p_question_id: idOf(67) })).toBeNull();
    expect(await rpc(DANI, "app_attempt_diagnosis", { p_question_id: idOf(68) })).toBeNull();
    expect(await rpc(DANI, "app_attempt_diagnosis", { p_question_id: idOf(66) })).toMatchObject({ selected: "A" });
  });

  it("Administração: o resumo do aluno não conta a anulada em respondidas, acertos nem erros pendentes", async () => {
    // Dani: 66 errada (vale), 67 errada e anulada, 68 anulada sem gabarito
    expect(await rpc(ADMIN, "app_admin_user", { p_user_id: DANI })).toMatchObject({ answered: 1, correct: 0, pending_errors: 1 });
    const list = await rpc(ADMIN, "app_admin_users", {});
    expect(list.items.find((u: any) => u.id === DANI)).toMatchObject({ answered: 1, correct: 0 });
  });
});

describe("5 — gabarito que volta à letra de antes da troca, antes da revisão", () => {
  it("sem texto mexido: a marca sai, nada de 'mudou de B para B', e o aluno volta a ver explicações e conduta", async () => {
    await save(q(70, { options: explanations({ B: "B é a correta: só suporte.", C: "C está errada: não há indicação." }), expected_conduct: "Só suporte." }));
    await sql(
      `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis)
       values ($1, 1, 'Análise feita para a B.', 'x', 'published', 'B')`,
      [idOf(70)]
    );
    const s = await session(EDU, "questoes", [70]);
    await answer(EDU, s, 70, "B");
    const toC = await setOfficial(70, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    expect(toC).toMatchObject({ recorrected: 1, review: { de: "B", para: "C", campos: ["analise", "expected_conduct", "explanation_B", "explanation_C"] } });

    const back = await setOfficial(70, { p_answer: "B", p_reason: "Engano no registro anterior: a banca manteve a B." });
    expect(back).toMatchObject({ recorrected: 1, review: null });
    expect(await row(70)).toMatchObject({ correct_option: "B", status: "valid", explanations_review: null });
    expect(await view(EDU, 70, "B")).toMatchObject({
      is_correct: true, explanation: "B é a correta: só suporte.", expected_conduct: "Só suporte.", in_review: false,
      option_notes: [{ id: "C", text: "C está errada: não há indicação." }],
    });
    expect((await rpc(EDU, "app_question_commentary", { p_question_id: idOf(70) }))?.question_core).toBe("Análise feita para a B.");
    const log = (await sql<any>(`select action, details from public.admin_audit_log where target = $1 order by id desc limit 1`, [idOf(70)]))[0];
    expect(log).toMatchObject({ action: "question.official_answer", details: { answer: "B", from: "C", review_cleared: true } });
  });

  it("com texto mudado durante a troca: só o que mudou continua marcado (pode ter sido escrito para o outro gabarito)", async () => {
    await save(q(71, { options: explanations({ A: "A está errada.", B: "B é a correta.", C: "C está errada." }), expected_conduct: "Só suporte." }));
    await setOfficial(71, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    // a equipe reescreve, para o gabarito novo, a explicação da C (marcada) e a da A (não marcada, o aluno a via), salva,
    // mas ainda não marcou como revisadas
    await save({
      ...q(71, {
        correct_option: "C", status: "changed_after_appeal", expected_conduct: "Só suporte.",
        options: explanations({ A: "A está errada; a correta é a C.", B: "B é a correta.", C: "C é a correta depois do recurso." }),
      }),
      id: idOf(71),
    });

    const back = await setOfficial(71, { p_answer: "B", p_reason: "A banca voltou atrás." });
    expect(back.review).toMatchObject({ de: "B", para: "B", campos: ["explanation_A", "explanation_C"] });
    const s = await session(EDU, "questoes", [71]);
    await answer(EDU, s, 71, "B");
    // a da B e a conduta valem de novo; as reescritas durante a troca ficam fora até a revisão
    expect(await view(EDU, 71, "B")).toMatchObject({ explanation: "B é a correta.", expected_conduct: "Só suporte.", option_notes: [], in_review: true });
  });

  it("anular e voltar à mesma letra, sem texto mexido: a marca sai", async () => {
    await save(q(72, { options: explanations({ B: "B é a correta." }) }));
    expect((await annul(72)).review).toMatchObject({ de: "B", para: "ANULADA", campos: ["expected_conduct"] });
    const back = await setOfficial(72, { p_answer: "B", p_reason: "A anulação foi desfeita." });
    expect(back).toMatchObject({ recorrected: 0, review: null });
    expect(await row(72)).toMatchObject({ status: "valid", correct_option: "B", explanations_review: null });
  });

  it("marca feita antes desta versão (sem os textos guardados): voltar mantém a marca, pelo lado seguro", async () => {
    await save(q(73, { options: explanations({ B: "B é a correta.", C: "C está errada." }) }));
    await sql(
      `update public.questions set correct_option = 'C', status = 'changed_after_appeal',
         explanations_review = '{"de": "B", "para": "C", "campos": ["explanation_B", "explanation_C"]}'::jsonb where id = $1`,
      [idOf(73)]
    );
    const back = await setOfficial(73, { p_answer: "B", p_reason: "A banca voltou atrás." });
    expect(back.review).toMatchObject({ de: "B", para: "B", campos: ["expected_conduct", "explanation_B", "explanation_C"] });
  });

  it("troca para outra letra continua marcando como antes; os textos de antes da primeira troca ficam guardados para a volta", async () => {
    await save(q(74, { options: explanations({ B: "B é a correta.", D: "D está errada." }) }));
    const toC = await setOfficial(74, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    const toD = await setOfficial(74, { p_answer: "D", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Segundo recurso." });
    expect(toD.review).toMatchObject({ de: "B", para: "D", campos: ["expected_conduct", "explanation_B", "explanation_D"] });
    expect(Object.keys(toD.review.textos).sort()).toEqual(["expected_conduct", "explanation_A", "explanation_B", "explanation_C", "explanation_D"]);
    // a impressão é a de antes da primeira troca; a segunda troca não a refaz
    expect(toD.review.textos).toEqual(toC.review.textos);
  });
});

describe("4 — a …7710 pode ser colada de novo", () => {
  it("colada duas vezes: sem erro, e as funções continuam valendo", async () => {
    const text = fs.readFileSync(AJUSTES, "utf8");
    await db.exec(text);
    await db.exec(text);
    expect((await rpc(CARLA, "app_performance", { p_days: 30 })).simulados).toEqual({ count: 2, accuracy: 67 });
  });

  it("colada antes da …7700: para com um aviso em português e não muda nada", async () => {
    const text = fs.readFileSync(AJUSTES, "utf8");
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`alter table public.questions drop column explanations_review`);
        await tx.exec(text);
      })
    ).rejects.toThrow("Cole primeiro o arquivo correcoes_questoes_supabase.sql (leva 1) e depois este.");
    expect((await sql<any>(`select count(*)::int n from information_schema.columns where table_name = 'questions' and column_name = 'explanations_review'`))[0].n).toBe(1);
  });
});
