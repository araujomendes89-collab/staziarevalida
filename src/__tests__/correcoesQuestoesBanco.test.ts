// @vitest-environment node
/**
 * Correções da aba Questões (supabase/migrations/…7700_correcoes_questoes.sql) num Postgres real em memória.
 *   Q01: "Nova questão" com a mesma prova e número de uma já gravada é recusada (nunca grava por cima).
 *   Q02: gabarito e situação de questão já gravada não mudam pelo salvar; só pelo registro do gabarito oficial
 *        (administrador, com fonte e motivo), que recorrige as respostas antigas e sinaliza as explicações que
 *        contradizem o novo gabarito, também ao anular (nem a correção do aluno nem o Tutor as recebem até a revisão).
 *   Q03: importar com "atualizar as que já existem" só troca o que veio preenchido, nunca gabarito nem situação, e a
 *        prévia diz antes quantas perderiam comentário.
 *   Q04: questão anulada sem gabarito numa sessão em andamento não trava o simulado nem o treino, e não conta como
 *        acerto nem erro.
 *   Q05: a correção diz que a questão foi anulada (a tela mostra "Questão anulada pela banca"); em anulada, nenhuma
 *        explicação de alternativa sai ao aluno (correção e Tutor), com ou sem marca (rodada 2).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";

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

async function recusa(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message, code: e.code };
  }
  throw new Error("Era para recusar, mas passou.");
}

const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;

const JA_EXISTE = { message: "Essa questão já existe: abra-a para editar.", code: "22023" };
const GABARITO_TRAVADO = {
  message: "Gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial (administrador, com fonte e motivo).",
  code: "22023",
};

const explanations = (map: Record<string, string> = {}) => ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: map[id] ?? "" }));
const q = (number: number, extra: Record<string, unknown> = {}) => ({
  kind: "REVALIDA", year: 2024, semester: 1, number, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
  statement: `Lactente de 4 meses com sibilância e coriza há 2 dias (questão ${number}). Qual a conduta?`,
  options: explanations(), correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false, ...extra,
});
const idOf = (number: number) => `revalida_2024_1_q${String(number).padStart(3, "0")}`;
const row = async (number: number) => (await sql<any>(`select * from public.questions where id = $1`, [idOf(number)]))[0];
const trail = async (number: number) => sql<any>(`select reason, changes from public.question_change_log where question_id = $1 order by id`, [idOf(number)]);

/** Sessão do aluno com as questões dadas (como se ele já tivesse começado antes da mudança). */
const session = async (uid: string, kind: "questoes" | "simulado", numbers: number[]) =>
  (await sql<any>(`insert into public.practice_sessions (user_id, kind, question_ids) values ($1, $2, $3) returning id`, [uid, kind, numbers.map(idOf)]))[0].id as string;
const answer = (uid: string, sessionId: string, number: number, option: string) =>
  rpc(uid, "app_answer_question", { p_session_id: sessionId, p_question_id: idOf(number), p_option: option, p_active_ms: 10_000 });
const attempts = async (number: number) =>
  sql<any>(`select user_id, selected_option, is_correct from public.question_attempts where question_id = $1 order by user_id`, [idOf(number)]);

const official = (extra: Record<string, unknown>) => ({
  p_answer: null, p_status: "FINAL", p_source: "Gabarito oficial definitivo INEP 2024/1 (teste)", p_reason: "Conferido no edital.", ...extra,
});

/** Análise SQIE publicada, feita com o gabarito gravado agora (como o processamento anota). Devolve o id. */
const analysis = async (number: number, core: string, version = 1) =>
  (
    await sql<any>(
      `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis)
       select q.id, $2, $3, 'x', 'published', q.correct_option from public.questions q where q.id = $1 returning id`,
      [idOf(number), version, core]
    )
  )[0].id as string;
/** O que o Tutor do aluno recebe da questão (tutor_truth é interna: só o servidor a chama). */
const truth = async (number: number, level = "full") => (await sql<any>(`select public.tutor_truth($1, $2) t`, [idOf(number), level]))[0].t;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [ANA, "ana@teste.dev", "Ana"],
    [BRUNO, "bruno@teste.dev", "Bruno"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 60_000);

describe("Q01 — Nova questão não grava por cima de uma que já existe", () => {
  it("sem o id, a mesma prova e número é recusada (equipe ou administrador, com ou sem motivo) e a gravada fica igual", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(1, { options: explanations({ B: "B é a correta." }) }) });
    const before = await row(1);
    const intruder = q(1, { statement: "Outro enunciado, bem diferente do primeiro, para outra questão.", correct_option: "D", expected_conduct: "" });
    for (const uid of [EDITOR, ADMIN]) {
      expect(await recusa(rpc(uid, "app_admin_save_question", { p_question: intruder }))).toEqual(JA_EXISTE);
      expect(await recusa(rpc(uid, "app_admin_save_question", { p_question: intruder, p_reason: "assistente de IA" }))).toEqual(JA_EXISTE);
    }
    expect(await row(1)).toEqual(before);
    expect(await trail(1)).toEqual([]);
  });

  it("abrindo a questão (com o id), salvar continua funcionando", async () => {
    const saved = await rpc(EDITOR, "app_admin_save_question", { p_question: { ...q(1, { topic: "Asma" }), id: idOf(1) } });
    expect(saved.topic).toBe("Asma");
  });
});

describe("Q02 — gabarito e situação: só pelo registro do gabarito oficial", () => {
  it("ninguém troca gabarito ou situação pelo salvar da questão já gravada", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(2) });
    const before = await row(2);
    const tentativas = [
      { correct_option: "C" },
      { status: "annulled" },
      { status: "annulled", correct_option: null },
      { status: "changed_after_appeal" },
    ];
    for (const uid of [EDITOR, ADMIN]) {
      for (const extra of tentativas) {
        const p_question = { ...q(2, extra), id: idOf(2) };
        expect(await recusa(rpc(uid, "app_admin_save_question", { p_question }))).toEqual(GABARITO_TRAVADO);
        expect(await recusa(rpc(uid, "app_admin_save_question", { p_question, p_reason: "assistente de IA" }))).toEqual(GABARITO_TRAVADO);
      }
    }
    expect(await row(2)).toEqual(before);
  });

  it("questão nova ainda nasce com o gabarito e a situação do formulário", async () => {
    const created = await rpc(EDITOR, "app_admin_save_question", { p_question: q(3, { status: "annulled", correct_option: null }) });
    expect(created).toMatchObject({ status: "annulled", correct_option: null });
  });

  it("o registro do gabarito oficial é só do administrador e exige fonte e motivo", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(4) });
    const call = (uid: string, extra: Record<string, unknown>) => rpc(uid, "app_admin_set_official_answer", { p_question_id: idOf(4), ...official(extra) });
    expect((await recusa(call(EDITOR, { p_answer: "C" }))).message).toBe("Acesso restrito a administradores.");
    expect((await recusa(call(ANA, { p_answer: "C" }))).message).toBe("Acesso restrito a administradores.");
    expect(await recusa(call(ADMIN, { p_answer: "C", p_source: "  " }))).toEqual({ message: "Informe a fonte do gabarito (documento e data).", code: "22023" });
    expect(await recusa(call(ADMIN, { p_answer: "C", p_reason: " " }))).toEqual({ message: "Informe o motivo da mudança.", code: "22023" });
    expect(await recusa(call(ADMIN, { p_answer: "C", p_reason: null }))).toEqual({ message: "Informe o motivo da mudança.", code: "22023" });
    expect(await recusa(call(ADMIN, { p_answer: null }))).toEqual({ message: "Informe a letra do gabarito (A, B, C ou D).", code: "22023" });
    expect(await recusa(call(ADMIN, { p_answer: "E" }))).toEqual({ message: "Gabarito deve ser A, B, C ou D.", code: "22023" });
    expect(await recusa(call(ADMIN, { p_answer: "C", p_status: "QUALQUER" }))).toEqual({ message: "Situação do gabarito inválida.", code: "22023" });
    expect((await recusa(rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: "nao-existe", ...official({ p_answer: "C" }) }))).message).toBe("Questão não encontrada.");
    expect(await sql(`select 1 from public.question_official_answers where question_id = $1`, [idOf(4)])).toHaveLength(0);
    expect((await row(4)).correct_option).toBe("B");
  });

  it("trocar a letra recorrige as respostas antigas e tira do aluno as explicações que contradizem o novo gabarito, até a revisão", async () => {
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: q(5, { options: explanations({ B: "B é a correta: só suporte.", C: "C está errada: não há indicação.", A: "A está errada." }), expected_conduct: "Só suporte." }),
    });
    const ana = await session(ANA, "questoes", [5]);
    const bruno = await session(BRUNO, "questoes", [5]);
    expect(await answer(ANA, ana, 5, "C")).toMatchObject({ is_correct: false });
    expect(await answer(BRUNO, bruno, 5, "B")).toMatchObject({ is_correct: true });

    const done = await rpc(ADMIN, "app_admin_set_official_answer", {
      p_question_id: idOf(5), ...official({ p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_source: "Gabarito pós-recurso INEP 2024/1 (teste)", p_reason: "Recurso aceito pela banca." }),
    });
    expect(done).toMatchObject({ version: 1, recorrected: 2 });
    expect(done.review).toMatchObject({ de: "B", para: "C", campos: ["expected_conduct", "explanation_B", "explanation_C"], motivo: "Recurso aceito pela banca." });
    expect(await row(5)).toMatchObject({ correct_option: "C", status: "changed_after_appeal" });
    expect(await attempts(5)).toEqual([
      { user_id: ANA, selected_option: "C", is_correct: true },
      { user_id: BRUNO, selected_option: "B", is_correct: false },
    ]);
    const last = (await trail(5)).at(-1);
    expect(last.reason).toMatch(/CHANGED_AFTER_APPEAL/);
    expect(last.reason).toMatch(/Recurso aceito pela banca\./);
    expect(last.changes.correct_option).toEqual({ de: "B", para: "C" });

    // o aluno: correção certa, sem as explicações que contradizem; o "por que não as outras" fica só com a A
    const view = await rpc(ANA, "practice_correction_view", { p_question_id: idOf(5), p_selected: "C" });
    expect(view).toMatchObject({ is_correct: true, correct_option: "C", annulled: false, explanation: null, expected_conduct: null, in_review: true });
    expect(view.option_notes).toEqual([{ id: "A", text: "A está errada." }]);

    // a equipe vê a marca no editor e na lista (filtro "explicações a revisar")
    expect((await rpc(EDITOR, "app_admin_question", { p_id: idOf(5) })).explanations_review).toMatchObject({ de: "B", para: "C" });
    const list = await rpc(EDITOR, "app_admin_questions", { p_filters: { review: true } });
    expect(list.items.map((i: any) => [i.id, i.explanations_review])).toEqual([[idOf(5), true]]);

    // a revisão: corrige as explicações (mesmo gabarito e situação, já gravados) e marca como revisadas
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: { ...q(5, { correct_option: "C", status: "changed_after_appeal", options: explanations({ C: "C é a correta depois do recurso.", A: "A está errada." }), expected_conduct: "Conduta da C." }), id: idOf(5) },
    });
    expect((await rpc(ANA, "practice_correction_view", { p_question_id: idOf(5), p_selected: "C" })).explanation).toBeNull();
    expect((await recusa(rpc(ANA, "app_admin_question_review_done", { p_question_id: idOf(5) }))).message).toBe("Acesso restrito à equipe.");
    const reviewed = await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(5) });
    expect(reviewed.explanations_review).toBeNull();
    expect(await rpc(ANA, "practice_correction_view", { p_question_id: idOf(5), p_selected: "C" })).toMatchObject({
      explanation: "C é a correta depois do recurso.", expected_conduct: "Conduta da C.", in_review: false,
    });
    const log = (await sql<any>(`select action, actor_id from public.admin_audit_log where target = $1 order by id desc limit 1`, [idOf(5)]))[0];
    expect(log).toEqual({ action: "question.explanations_reviewed", actor_id: EDITOR });
  });

  it("o registro mostra no editor o gabarito oficial atual", async () => {
    const q5 = await rpc(EDITOR, "app_admin_question", { p_id: idOf(5) });
    expect(q5.official).toMatchObject({ answer: "C", answer_status: "CHANGED_AFTER_APPEAL", version: 1, source: "Gabarito pós-recurso INEP 2024/1 (teste)" });
  });

  it("anular pelo registro: a questão fica anulada, a resposta anterior não vira acerto nem erro e as explicações saem do aluno e do Tutor até a revisão", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(6, { options: explanations({ B: "B é a correta.", A: "A está errada." }) }) });
    const ana = await session(ANA, "questoes", [6]);
    await answer(ANA, ana, 6, "B");
    await analysis(6, "Análise feita para a B.");
    expect((await rpc(ANA, "app_question_commentary", { p_question_id: idOf(6) }))?.question_core).toBe("Análise feita para a B.");

    const done = await rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(6), ...official({ p_status: "ANNULLED", p_reason: "Banca anulou a questão." }) });
    // anular guarda a letra antiga (decisão 7). Toda explicação de alternativa foi escrita supondo a B como a única
    // correta, mas em questão anulada ela nunca sai ao aluno (rodada 2): só a conduta e a análise ficam marcadas
    expect(done).toMatchObject({ recorrected: 0, review: { de: "B", para: "ANULADA", campos: ["analise", "expected_conduct"] } });
    expect(await row(6)).toMatchObject({ status: "annulled", correct_option: "B" });
    expect(await rpc(ANA, "practice_correction_view", { p_question_id: idOf(6), p_selected: "B" })).toMatchObject({
      annulled: true, is_correct: null, explanation: null, option_notes: [], expected_conduct: null, in_review: true,
    });
    expect(await rpc(ANA, "app_question_commentary", { p_question_id: idOf(6) })).toBeNull();
    const t = await truth(6);
    expect(t.options.map((o: any) => o.explanation)).toEqual([null, null, null, null]);
    expect(t).toMatchObject({ expected_conduct: null, analysis: null });

    // revisadas: a conduta reescrita volta; a explicação de alternativa não sai em anulada (rodada 2), mesmo reescrita; a
    // análise não volta (ela aponta uma alternativa como a correta, e o processamento não analisa questão anulada)
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: { ...q(6, { status: "annulled", options: explanations({ A: "A e B são defensáveis: a banca anulou." }), expected_conduct: "Questão anulada." }), id: idOf(6) },
    });
    await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(6) });
    expect(await rpc(ANA, "practice_correction_view", { p_question_id: idOf(6), p_selected: "B" })).toMatchObject({
      explanation: null, option_notes: [], expected_conduct: "Questão anulada.", in_review: false,
    });
    expect(await rpc(ANA, "app_question_commentary", { p_question_id: idOf(6) })).toBeNull();
    expect((await truth(6)).analysis).toBeNull();
    await sql(`update public.question_analysis set is_current = false where question_id = $1`, [idOf(6)]);
    await analysis(6, "Análise nova, ainda apontando a B.", 2);
    expect(await rpc(ANA, "app_question_commentary", { p_question_id: idOf(6) })).toBeNull();
    expect((await truth(6)).analysis).toBeNull();
  });

  it("desfazer a anulação também marca todas as explicações e recorrige as respostas", async () => {
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: q(9, { status: "annulled", correct_option: null, options: explanations({ A: "Anulada: A e C defensáveis.", C: "Anulada." }) }),
    });
    const ana = await session(ANA, "questoes", [9]);
    await answer(ANA, ana, 9, "C");
    const done = await rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(9), ...official({ p_answer: "C", p_reason: "Banca reviu a anulação." }) });
    expect(done).toMatchObject({ recorrected: 1, review: { de: "ANULADA", para: "C", campos: ["expected_conduct", "explanation_A", "explanation_C"] } });
    expect(await row(9)).toMatchObject({ status: "valid", correct_option: "C" });
    expect(await rpc(ANA, "practice_correction_view", { p_question_id: idOf(9), p_selected: "C" })).toMatchObject({
      annulled: false, is_correct: true, explanation: null, option_notes: [], expected_conduct: null, in_review: true,
    });
  });

  it("o Tutor do aluno recebe o mesmo que a correção: sem as explicações, a conduta e a análise feitas para o gabarito antigo, até a revisão", async () => {
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: q(8, { options: explanations({ B: "B e a correta: suporte.", A: "A esta errada." }), expected_conduct: "Conduta da B." }),
    });
    const ana = await session(ANA, "questoes", [8]);
    await answer(ANA, ana, 8, "A");
    const a = await analysis(8, "Analise feita para B.");
    await sql(
      `insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning, why_wrong, trap)
       values ($1, $2, 'A', false, 'WRONG', 'A nao trata a causa.', 'A nao e a conduta.', 'Armadilha da A.'),
              ($1, $2, 'B', true, 'CORRECT', 'B e a conduta.', null, null)`,
      [a, idOf(8)]
    );
    await sql(
      `insert into public.question_update_cards (question_id, version, temporal_status, impact_level, official_answer, current_answer, what_changed, reviewed_by)
       values ($1, 1, 'UPDATED_BUT_SAME_ANSWER', 'COMMENT_ONLY', 'B', 'B', 'A diretriz nova manteve a conduta da B.', $2)`,
      [idOf(8), ADMIN]
    );
    const antes = await truth(8);
    expect(antes.options.find((o: any) => o.id === "B").explanation).toBe("B e a correta: suporte.");
    expect(antes).toMatchObject({ official_answer: "B", expected_conduct: "Conduta da B.", analysis: { question_core: "Analise feita para B." }, update_card: { official_answer: "B" } });
    expect(await rpc(ANA, "app_attempt_diagnosis", { p_question_id: idOf(8) })).toMatchObject({ selected: "A", diagnosed: true, trap: "Armadilha da A." });

    await rpc(ADMIN, "app_admin_set_official_answer", {
      p_question_id: idOf(8), ...official({ p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito pela banca." }),
    });
    for (const level of ["hint", "full"]) {
      const t = await truth(8, level);
      expect(t.official_answer).toBe("C");
      expect(t.options.map((o: any) => [o.id, o.explanation])).toEqual([["A", "A esta errada."], ["B", null], ["C", null], ["D", null]]);
      expect(t.expected_conduct).toBeNull();
    }
    expect(await truth(8)).toMatchObject({ analysis: null, update_card: null });
    // o diagnóstico do erro também vinha da análise feita para a B
    expect(await rpc(ANA, "app_attempt_diagnosis", { p_question_id: idOf(8) })).toMatchObject({ selected: "A", diagnosed: false, trap: null });

    // revisadas: as explicações e a conduta reescritas voltam; a análise e o cartão feitos para a B, não
    await rpc(EDITOR, "app_admin_save_question", {
      p_question: { ...q(8, { correct_option: "C", status: "changed_after_appeal", options: explanations({ C: "C e a correta depois do recurso.", A: "A esta errada." }), expected_conduct: "Conduta da C." }), id: idOf(8) },
    });
    await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(8) });
    const depois = await truth(8);
    expect(depois.options.find((o: any) => o.id === "C").explanation).toBe("C e a correta depois do recurso.");
    expect(depois).toMatchObject({ expected_conduct: "Conduta da C.", analysis: null, update_card: null });
  });

  it("a análise publicada feita para o gabarito antigo sai do aluno até haver nova análise", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(7) });
    const ana = await session(ANA, "questoes", [7]);
    await answer(ANA, ana, 7, "B");
    const [a] = await sql<any>(
      `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis)
       values ($1, 1, 'O que a banca quer saber.', 'x', 'published', 'B') returning id`,
      [idOf(7)]
    );
    expect((await rpc(ANA, "app_question_commentary", { p_question_id: idOf(7) }))?.question_core).toBe("O que a banca quer saber.");
    const done = await rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(7), ...official({ p_answer: "D", p_reason: "Gabarito definitivo diferente do preliminar." }) });
    expect(done.review.campos).toEqual(["analise", "expected_conduct"]);
    expect(await rpc(ANA, "app_question_commentary", { p_question_id: idOf(7) })).toBeNull();
    expect(a.id).toBeTruthy();
  });
});

describe("Q03 — importação: atualiza só o que veio preenchido, nunca gabarito nem situação", () => {
  const full = (number: number, extra: Record<string, unknown> = {}) =>
    q(number, {
      options: explanations({ B: "B é a correta: suporte." }), expected_conduct: "Suporte.", inep_intent: "Manejo inicial.", subtopic: "Manejo",
      sources: [{ title: "Gabarito oficial" }], ...extra,
    });
  const bare = (number: number, extra: Record<string, unknown> = {}) =>
    q(number, { options: explanations(), expected_conduct: null, inep_intent: null, subtopic: null, sources: [], ...extra });

  it("campos vazios no arquivo não apagam o que está gravado", async () => {
    expect(await rpc(EDITOR, "app_admin_import_questions", { p_questions: [full(20), full(21), full(22)] })).toEqual({ ok: true, inserted: 3, updated: 0, skipped: 0, answer_differs: 0 });
    const result = await rpc(EDITOR, "app_admin_import_questions", { p_questions: [bare(20, { topic: "Bronquiolite viral aguda" })], p_update_existing: true });
    expect(result).toEqual({ ok: true, inserted: 0, updated: 1, skipped: 0, answer_differs: 0 });
    const r = await row(20);
    expect(r).toMatchObject({ topic: "Bronquiolite viral aguda", subtopic: "Manejo", expected_conduct: "Suporte.", inep_intent: "Manejo inicial.", correct_option: "B", status: "valid" });
    expect(r.options.find((o: any) => o.id === "B").explanation).toBe("B é a correta: suporte.");
    expect(r.sources).toEqual([{ title: "Gabarito oficial" }]);
  });

  it("linha com gabarito ou situação diferente não muda nada e é contada à parte", async () => {
    const before = await row(21);
    const result = await rpc(EDITOR, "app_admin_import_questions", {
      p_questions: [bare(21, { correct_option: "C", topic: "Outro tema" }), bare(22, { status: "annulled", correct_option: null, topic: "Outro tema" })],
      p_update_existing: true,
    });
    expect(result).toEqual({ ok: true, inserted: 0, updated: 0, skipped: 0, answer_differs: 2 });
    expect(await row(21)).toEqual(before);
    expect(await row(22)).toMatchObject({ correct_option: "B", status: "valid", topic: "Bronquiolite" });
  });

  it("sem marcar atualizar, as que já existem continuam puladas", async () => {
    expect(await rpc(EDITOR, "app_admin_import_questions", { p_questions: [bare(21, { topic: "Outro tema" })] })).toEqual({ ok: true, inserted: 0, updated: 0, skipped: 1, answer_differs: 0 });
    expect((await row(21)).topic).toBe("Bronquiolite");
  });

  it("a prévia diz antes quantas são novas, quantas perderiam comentário e quantas têm gabarito diferente, sem gravar nada", async () => {
    const count = async () => (await sql<any>(`select count(*)::int n from public.questions`))[0].n;
    const before = await count();
    const items = [
      bare(20, { options: explanations({ B: "Outra explicação da B." }) }), // troca a explicação gravada
      bare(21, { expected_conduct: "Outra conduta." }),                       // troca a conduta gravada
      bare(22, { correct_option: "D" }),                                      // gabarito diferente
      bare(23),                                                               // nova
      { ...bare(24), area: "ODONTO" },                                       // com problema: fica fora da conta
    ];
    const preview = await rpc(EDITOR, "app_admin_import_preview", { p_questions: items });
    expect(preview).toEqual({
      new: 1,
      existing: 3,
      lose_comment: [{ index: 1, code: "REV-2024.1-Q020" }, { index: 2, code: "REV-2024.1-Q021" }],
      answer_differs: [{ index: 3, code: "REV-2024.1-Q022", stored: "B", file: "D" }],
    });
    expect(await count()).toBe(before);
    expect((await recusa(rpc(ANA, "app_admin_import_preview", { p_questions: items }))).message).toBe("Acesso restrito à equipe.");

    // importando de verdade, a explicação preenchida no arquivo troca a gravada
    await rpc(EDITOR, "app_admin_import_questions", { p_questions: [items[0]], p_update_existing: true });
    expect((await row(20)).options.find((o: any) => o.id === "B").explanation).toBe("Outra explicação da B.");
  });

  it("anulada pelo registro oficial e ANULADA no arquivo: não é gabarito diferente, e o texto corrigido é gravado", async () => {
    await rpc(EDITOR, "app_admin_import_questions", { p_questions: [full(25)] });
    await rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(25), ...official({ p_status: "ANNULLED", p_reason: "Banca anulou a questão." }) });
    expect(await row(25)).toMatchObject({ status: "annulled", correct_option: "B" }); // anular guarda a letra antiga
    const file = bare(25, { status: "annulled", correct_option: null, topic: "Bronquiolite viral aguda" });
    expect(await rpc(EDITOR, "app_admin_import_preview", { p_questions: [file] })).toEqual({ new: 0, existing: 1, lose_comment: [], answer_differs: [] });
    expect(await rpc(EDITOR, "app_admin_import_questions", { p_questions: [file], p_update_existing: true })).toEqual({
      ok: true, inserted: 0, updated: 1, skipped: 0, answer_differs: 0,
    });
    expect(await row(25)).toMatchObject({ topic: "Bronquiolite viral aguda", status: "annulled", correct_option: "B" });
    // anulada de um lado só continua diferente
    expect((await rpc(EDITOR, "app_admin_import_preview", { p_questions: [bare(25)] })).answer_differs).toEqual([
      { index: 1, code: "REV-2024.1-Q025", stored: "ANULADA", file: "B" },
    ]);
  });

  it("'cita figura' marcada ou desmarcada pela equipe só muda quando o arquivo trouxe a coluna imagem preenchida", async () => {
    await rpc(EDITOR, "app_admin_import_questions", { p_questions: [full(27)] });
    const mark = (value: boolean) => rpc(EDITOR, "app_admin_save_question", { p_question: { ...full(27, { needs_image: value }), id: idOf(27) } });
    const update = (extra: Record<string, unknown>) =>
      rpc(EDITOR, "app_admin_import_questions", { p_questions: [bare(27, extra)], p_update_existing: true });
    // marcada à mão; sem a coluna imagem, a planilha manda o palpite tirado do enunciado (aqui, falso)
    await mark(true);
    expect(await update({ needs_image: false })).toMatchObject({ updated: 1 });
    expect((await row(27)).needs_image).toBe(true);
    // o inverso: desmarcada à mão, o palpite (verdadeiro) não a tira dos treinos
    await mark(false);
    await update({ needs_image: true });
    expect((await row(27)).needs_image).toBe(false);
    // com a coluna imagem preenchida, vale o arquivo
    await update({ needs_image: true, needs_image_declared: true });
    expect((await row(27)).needs_image).toBe(true);
    await update({ needs_image: false, needs_image_declared: true });
    expect((await row(27)).needs_image).toBe(false);
  });

  it("a prévia diz a situação quando ela difere (alterada após recurso com a mesma letra)", async () => {
    await rpc(EDITOR, "app_admin_import_questions", { p_questions: [full(26)] });
    await rpc(ADMIN, "app_admin_set_official_answer", {
      p_question_id: idOf(26), ...official({ p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_reason: "Recurso aceito pela banca." }),
    });
    const preview = await rpc(EDITOR, "app_admin_import_preview", {
      p_questions: [bare(26, { correct_option: "C" }), bare(26, { correct_option: "C", status: "changed_after_appeal" })],
    });
    expect(preview.answer_differs).toEqual([{ index: 1, code: "REV-2024.1-Q026", stored: "C (alterada após recurso)", file: "C" }]);
  });
});

describe("Q04/Q05 — anulada sem gabarito numa sessão em andamento", () => {
  const annulNoKey = (number: number) => sql(`update public.questions set status = 'annulled', correct_option = null where id = $1`, [idOf(number)]);

  it("simulado: a resposta guardada não trava o finalizar e a anulada não conta como acerto nem erro", async () => {
    for (const n of [30, 31, 32]) await rpc(EDITOR, "app_admin_save_question", { p_question: q(n, { area: n === 31 ? "CLINICA_MEDICA" : "PEDIATRIA" }) });
    const sim = await session(ANA, "simulado", [30, 31, 32]);
    expect(await answer(ANA, sim, 30, "B")).toEqual({ saved: true });
    expect(await answer(ANA, sim, 31, "A")).toEqual({ saved: true });
    await annulNoKey(31); // anulada sem gabarito depois de respondida (como fazia o editor antigo)

    const done = await rpc(ANA, "app_finish_session", { p_session_id: sim });
    expect(done.finished_at).not.toBeNull();
    expect(done.result).toMatchObject({ total: 2, answered: 1, correct: 1, annulled: 1 });
    expect(done.result.by_area).toEqual([{ area: "PEDIATRIA", total: 2, answered: 1, correct: 1 }]);
    expect(done.questions[1]).toMatchObject({ selected: "A", correction: { annulled: true, is_correct: null, correct_option: null } });
    expect(await attempts(31)).toEqual([{ user_id: ANA, selected_option: "A", is_correct: false }]);

    const [recent] = await rpc(ANA, "app_recent_sessions", { p_kind: "simulado" });
    expect(recent).toMatchObject({ id: sim, total: 3, answered: 1, correct: 1, annulled: 1 });
  });

  it("treino: responder a anulada sem gabarito é aceito e não entra nos números do aluno", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(33) });
    const home = async () => (await rpc(BRUNO, "app_home")).attempts as number;
    const before = await home();
    const treino = await session(BRUNO, "questoes", [33]);
    await annulNoKey(33);
    expect(await answer(BRUNO, treino, 33, "A")).toMatchObject({ selected: "A", annulled: true, is_correct: null, correct_option: null });
    expect(await home()).toBe(before);
    const done = await rpc(BRUNO, "app_finish_session", { p_session_id: treino });
    expect(done.result).toMatchObject({ total: 0, answered: 0, correct: 0, annulled: 1 });
  });
});

describe("Rodada 2 — anulada: a letra guardada não é a correta, então nenhuma explicação de alternativa sai ao aluno", () => {
  const TEXTOS = { A: "A esta errada.", B: "B e a correta porque X.", C: "C esta errada.", D: "D esta errada." };
  const semExplicacao = async (number: number) => (await truth(number)).options.map((o: any) => o.explanation);

  it("anulada pelo registro e 'Marcar como revisadas' sem editar nada: nem 'Explicação clínica' nem 'Por que não as outras?'", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(40, { options: explanations(TEXTOS) }) });
    const ana = await session(ANA, "questoes", [40]);
    await answer(ANA, ana, 40, "B");
    const done = await rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(40), ...official({ p_status: "ANNULLED", p_reason: "Banca anulou a questão." }) });
    // a explicação de cada alternativa nunca sai em anulada, então só a conduta esperada fica marcada para revisão
    expect(done.review).toMatchObject({ de: "B", para: "ANULADA", campos: ["expected_conduct"] });
    await rpc(EDITOR, "app_admin_question_review_done", { p_question_id: idOf(40) });
    expect(await row(40)).toMatchObject({ status: "annulled", correct_option: "B", explanations_review: null });
    expect(await rpc(ANA, "practice_correction_view", { p_question_id: idOf(40), p_selected: "B" })).toMatchObject({
      annulled: true, is_correct: null, explanation: null, option_notes: [], expected_conduct: "Suporte.", in_review: false,
    });
    expect(await semExplicacao(40)).toEqual([null, null, null, null]);
  });

  it("anulada com letra pelo editor antigo ou pela importação (sem marca nenhuma): também sem explicação de alternativa", async () => {
    await rpc(EDITOR, "app_admin_save_question", { p_question: q(41, { options: explanations(TEXTOS) }) });
    const ana = await session(ANA, "questoes", [41]);
    await answer(ANA, ana, 41, "C");
    await sql(`update public.questions set status = 'annulled', correct_option = 'C' where id = $1`, [idOf(41)]);
    expect(await rpc(ANA, "practice_correction_view", { p_question_id: idOf(41), p_selected: "C" })).toMatchObject({
      annulled: true, is_correct: null, correct_option: "C", explanation: null, option_notes: [], in_review: false,
    });
    expect(await semExplicacao(41)).toEqual([null, null, null, null]);
  });
});
