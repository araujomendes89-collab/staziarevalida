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
 * Rodada de correção 1 (item 1, Stazia Play): anular, desfazer a anulação ou trocar a letra do gabarito conta de novo os
 * números guardados do Play (questões, acertos, erros e precisão) de quem respondeu a questão; a …7710 faz essa conta uma
 * vez para quem respondeu questão anulada ou com gabarito registrado antes dela.
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
const FLAVIA = "00000000-0000-4000-8000-00000000000f";
const GUTO = "00000000-0000-4000-8000-000000000010";
const HELO = "00000000-0000-4000-8000-000000000011";
const IARA = "00000000-0000-4000-8000-000000000012";
const KAIO = "00000000-0000-4000-8000-000000000013";
const LUIZ = "00000000-0000-4000-8000-000000000014";

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const result = await db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
  // Leva 3 (Q09): comentário salvo ou importado por uma pessoa espera o revisor médico. Estes testes montam questões cujo comentário
  // "já está no ar" (é o que as regras de gabarito daqui protegem), então o comentário é dado como aprovado logo depois de gravar.
  // A regra nova está provada em leva3QComentarioBanco.test.ts.
  if (fn === "app_admin_save_question" || fn === "app_admin_import_questions") await db.query(`update public.questions set comment_review = null where comment_review is not null`);
  return result;
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
/** Os números guardados do Stazia Play do aluno (perfil, ranking, foto do dia e medalhas leem daqui). */
const playStats = async (uid: string) => (await sql<any>(`select * from public.user_gamification_stats where user_id = $1`, [uid]))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`); // CC19: o aluno só recebe com o modo sombra desligado e a publicação ligada
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [CARLA, "carla@teste.dev", "Carla"],
    [DANI, "dani@teste.dev", "Dani"],
    [EDU, "edu@teste.dev", "Edu"],
    [FLAVIA, "flavia@teste.dev", "Flávia"],
    [GUTO, "guto@teste.dev", "Guto"],
    [HELO, "helo@teste.dev", "Helô"],
    [IARA, "iara@teste.dev", "Iara"],
    [KAIO, "kaio@teste.dev", "Kaio"],
    [LUIZ, "luiz@teste.dev", "Luiz"],
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

describe("1 (rodada de correção 1) — Stazia Play: mudar o gabarito conta de novo os números guardados de quem respondeu", () => {
  it("anular as erradas: o perfil e o ranking do Play contam como o Início; desfazer a anulação devolve a questão", async () => {
    for (const n of [80, 81, 82]) await save(q(n));
    const s = await session(FLAVIA, "questoes", [80, 81, 82]);
    await answer(FLAVIA, s, 80, "B"); // certa
    await answer(FLAVIA, s, 81, "A"); // errada
    await answer(FLAVIA, s, 82, "C"); // errada
    expect(await rpc(FLAVIA, "app_gamification_summary")).toMatchObject({ questions: 3, accuracy: 33.33 });
    // sequência guardada (por exemplo, mantida com uma proteção) e última atividade: contar de novo as respostas não mexe nelas
    await sql(`update public.user_gamification_stats set current_streak = 4, longest_streak = 9 where user_id = $1`, [FLAVIA]);
    const before = await playStats(FLAVIA);

    await annul(81);
    await annul(82);
    expect(await rpc(FLAVIA, "app_home")).toMatchObject({ attempts: 1, correct: 1 });
    expect(await rpc(FLAVIA, "app_gamification_summary")).toMatchObject({ questions: 1, accuracy: 100, streak: { current: 4, longest: 9 } });
    expect(await playStats(FLAVIA)).toMatchObject({
      questions_answered: 1, correct_answers: 1, wrong_answers: 0, accuracy: "100.00",
      current_streak: 4, longest_streak: 9, last_qualified_activity_at: before.last_qualified_activity_at,
    });
    const board = await rpc(FLAVIA, "app_leaderboard", { p_kind: "questoes" });
    expect(board.rows.find((r: any) => r.is_me)).toMatchObject({ questions: 1, accuracy: 100 });

    // desfazer a anulação da 81 (mesma letra B): a resposta A volta a contar como erro
    await setOfficial(81, { p_answer: "B", p_reason: "A anulação foi desfeita." });
    expect(await playStats(FLAVIA)).toMatchObject({ questions_answered: 2, correct_answers: 1, wrong_answers: 1, accuracy: "50.00" });
  });

  it("trocar a letra do gabarito: o acerto vira erro e o erro vira acerto também nos números do Play", async () => {
    await save(q(83));
    await answer(GUTO, await session(GUTO, "questoes", [83]), 83, "B"); // certa pelo gabarito B
    await answer(HELO, await session(HELO, "questoes", [83]), 83, "C"); // errada pelo gabarito B
    expect(await playStats(GUTO)).toMatchObject({ questions_answered: 1, correct_answers: 1, wrong_answers: 0 });

    const r = await setOfficial(83, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    expect(r.recorrected).toBe(2);
    expect(await playStats(GUTO)).toMatchObject({ questions_answered: 1, correct_answers: 0, wrong_answers: 1, accuracy: "0.00" });
    expect(await playStats(HELO)).toMatchObject({ questions_answered: 1, correct_answers: 1, wrong_answers: 0, accuracy: "100.00" });
  });

  it("a …7710 conta de novo, uma vez, quem respondeu questão anulada ou com gabarito registrado antes dela", async () => {
    for (const n of [84, 85]) await save(q(n));
    const s = await session(IARA, "questoes", [84, 85]);
    await answer(IARA, s, 84, "A"); // errada; depois anulada pelo editor antigo
    await answer(IARA, s, 85, "B"); // certa; depois o gabarito vira C pelo registro da leva 1 (recorrigia sem contar o Play de novo)
    await annulNoKey(84);
    await sql(`update public.questions set correct_option = 'C', status = 'changed_after_appeal' where id = $1`, [idOf(85)]);
    await sql(`update public.question_attempts set is_correct = false where question_id = $1`, [idOf(85)]);
    await sql(`insert into public.question_official_answers (question_id, answer, answer_status, source) values ($1, 'C', 'CHANGED_AFTER_APPEAL', 'teste')`, [idOf(85)]);
    expect(await playStats(IARA)).toMatchObject({ questions_answered: 2, correct_answers: 1, wrong_answers: 1 });

    await db.exec(fs.readFileSync(AJUSTES, "utf8"));
    expect(await playStats(IARA)).toMatchObject({ questions_answered: 1, correct_answers: 0, wrong_answers: 1, accuracy: "0.00" });
  });
});

describe("1 (rodada de correção 1) — Stazia Play: o que a conta de novo respeita", () => {
  it("resposta que o antifraude invalidou continua fora; o registro de ações guarda quantos alunos foram contados de novo", async () => {
    for (const n of [86, 87]) await save(q(n));
    const s = await session(KAIO, "questoes", [86, 87]);
    // rápida demais (menos de 3 s): o Play a invalida e ela nunca entra nos números
    await rpc(KAIO, "app_answer_question", { p_session_id: s, p_question_id: idOf(86), p_option: "B", p_active_ms: 1_000 });
    await answer(KAIO, s, 87, "B");
    expect(await playStats(KAIO)).toMatchObject({ questions_answered: 1, correct_answers: 1, wrong_answers: 0 });

    await setOfficial(87, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    expect(await playStats(KAIO)).toMatchObject({ questions_answered: 1, correct_answers: 0, wrong_answers: 1, accuracy: "0.00" });
    await annul(86); // a 86 já estava fora: anular e desfazer não a trazem para a conta
    await setOfficial(86, { p_answer: "B", p_reason: "A anulação foi desfeita." });
    expect(await playStats(KAIO)).toMatchObject({ questions_answered: 1, correct_answers: 0, wrong_answers: 1 });
    const log = (await sql<any>(`select details from public.admin_audit_log where target = $1 and action = 'question.official_answer' order by id desc limit 1`, [idOf(87)]))[0];
    expect(log.details).toMatchObject({ answer: "C", recorrected: 1, play_recounted: 1 });
  });

  it("as medalhas que leem esses números são conferidas de novo: desfazer a anulação pode completar a medalha de 10 questões; nenhuma é retirada", async () => {
    const numbers = [150, 151, 152, 153, 154, 155, 156, 157, 158, 159];
    for (const n of numbers) await save(q(n));
    await annulNoKey(159); // anulada antes de responder: a resposta não conta no Play
    const s = await session(LUIZ, "questoes", numbers);
    for (const n of numbers) await answer(LUIZ, s, n, "B");
    const medals = async () => (await sql<any>(`select achievement_slug from public.user_achievements where user_id = $1`, [LUIZ])).map((r) => r.achievement_slug);
    expect(await playStats(LUIZ)).toMatchObject({ questions_answered: 9 });
    expect(await medals()).not.toContain("primeiros_passos"); // 9 de 10

    await setOfficial(159, { p_answer: "B", p_reason: "A anulação foi desfeita." });
    expect(await playStats(LUIZ)).toMatchObject({ questions_answered: 10 });
    expect(await medals()).toContain("primeiros_passos");

    // anular de novo baixa o número, mas a medalha já conquistada fica
    await annul(159);
    expect(await playStats(LUIZ)).toMatchObject({ questions_answered: 9 });
    expect(await medals()).toContain("primeiros_passos");
  });

  it("registro sem mudança no que conta (por exemplo só a fonte): não conta de novo; com o Play desligado nada muda", async () => {
    await save(q(88));
    await answer(GUTO, await session(GUTO, "questoes", [88]), 88, "B");
    await sql(`update public.user_gamification_stats set questions_answered = 40 where user_id = $1`, [GUTO]); // marcador: só uma conta nova o apaga
    // mesma letra, mesma situação: nada a contar de novo
    expect((await setOfficial(88, { p_answer: "B", p_reason: "Só conferi a fonte." })).recorrected).toBe(0);
    expect(await playStats(GUTO)).toMatchObject({ questions_answered: 40 });
    // Play desligado: a troca de letra corrige as respostas, mas não escreve nos números do Play
    await sql(`update public.gamification_rules set value = 'false'::jsonb where key = 'flags.gamification_enabled'`);
    try {
      expect((await setOfficial(88, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." })).recorrected).toBe(1);
      expect(await playStats(GUTO)).toMatchObject({ questions_answered: 40 });
    } finally {
      await sql(`update public.gamification_rules set value = 'true'::jsonb where key = 'flags.gamification_enabled'`);
    }
    // ligado de novo: a próxima mudança conta de verdade
    await setOfficial(88, { p_answer: "B", p_status: "CHANGED_AFTER_APPEAL", p_reason: "A banca voltou atrás." });
    expect(await playStats(GUTO)).toMatchObject({ questions_answered: 2 });
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

describe("7 — Marcar como revisadas: só tira a marca que a pessoa viu", () => {
  it("se a marca mudou enquanto a pessoa revisava, o banco recusa e a marca de agora fica; com a marca de agora, tira", async () => {
    await save(q(90, { options: explanations({ B: "B é a correta.", C: "C está errada.", D: "D está errada." }) }));
    await setOfficial(90, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    // a pessoa 1 abre a questão e vê a marca desta troca
    const seen = (await rpc(EDITOR, "app_admin_question", { p_id: idOf(90) })).explanations_review;
    expect(seen).toMatchObject({ de: "B", para: "C" });
    // a pessoa 2 registra outra troca (C para D): a marca ganha a explicação da D, que a pessoa 1 ainda não viu
    await setOfficial(90, { p_answer: "D", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Segundo recurso." });
    await expect(rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(90), p_seen: seen })).rejects.toThrow(
      "A marca de revisão mudou enquanto você revisava"
    );
    const now = (await row(90)).explanations_review;
    expect(now).toMatchObject({ de: "B", para: "D" });
    expect(now.campos).toContain("explanation_D");

    // vendo a marca de agora, tira (e o registro de ações guarda o que foi revisado)
    const done = await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(90), p_seen: now });
    expect(done.explanations_review).toBeNull();
    expect((await row(90)).explanations_review).toBeNull();
    const log = (await sql<any>(`select details from public.admin_audit_log where target = $1 and action = 'question.explanations_reviewed' order by id desc limit 1`, [idOf(90)]))[0];
    expect(log.details.review).toMatchObject({ para: "D" });
  });

  it("o texto marcado foi reescrito por outra pessoa enquanto a marca seguia a mesma: o banco recusa e a marca fica", async () => {
    await save(q(92, { options: explanations({ B: "B é a correta.", C: "C está errada." }), expected_conduct: "Suporte." }));
    await setOfficial(92, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    const seen = (await rpc(EDITOR, "app_admin_question", { p_id: idOf(92) })).explanations_review;
    const seenTexts = { explanation_A: "", explanation_B: "B é a correta.", explanation_C: "C está errada.", explanation_D: "", expected_conduct: "Suporte." };
    // a pessoa 2 reescreve a explicação da C e salva: a marca é a mesma, mas o texto que a pessoa 1 viu não vale mais
    await save({ ...q(92, { correct_option: "C", status: "changed_after_appeal", expected_conduct: "Suporte.", options: explanations({ B: "B é a correta.", C: "C é a correta depois do recurso." }) }), id: idOf(92) });
    expect((await row(92)).explanations_review).toEqual(seen);
    await expect(rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(92), p_seen: seen, p_seen_texts: seenTexts })).rejects.toThrow(
      "O texto desta questão mudou enquanto você revisava"
    );
    expect((await row(92)).explanations_review).toEqual(seen);
    // vendo o texto de agora, tira; texto que não está na marca (a explicação da A) mudando não atrapalha
    await save({ ...q(92, { correct_option: "C", status: "changed_after_appeal", expected_conduct: "Suporte.", options: explanations({ A: "A errada.", B: "B é a correta.", C: "C é a correta depois do recurso." }) }), id: idOf(92) });
    const nowTexts = { ...seenTexts, explanation_A: "A errada.", explanation_C: "C é a correta depois do recurso." };
    expect((await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(92), p_seen: seen, p_seen_texts: nowTexts })).explanations_review).toBeNull();
  });

  it("marca que já saiu (outra pessoa revisou antes): não é erro; tela antiga, sem dizer o que viu, tira como antes", async () => {
    await save(q(91, { options: explanations({ B: "B é a correta.", C: "C está errada." }) }));
    await setOfficial(91, { p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito." });
    const seen = (await rpc(EDITOR, "app_admin_question", { p_id: idOf(91) })).explanations_review;
    // tela antiga: só o código da questão
    expect((await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(91) })).explanations_review).toBeNull();
    // a pessoa 1 clica depois: a marca já não existe e não há nada a recusar
    expect((await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(91), p_seen: seen })).explanations_review).toBeNull();
    // aluno não chama
    await expect(rpc(CARLA, "app_admin_question_review_done", { p_question_id: idOf(91), p_seen: seen })).rejects.toThrow("Acesso restrito à equipe.");
    await expect(rpc(null, "app_admin_question_review_done", { p_question_id: idOf(91), p_seen: seen })).rejects.toThrow();
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
