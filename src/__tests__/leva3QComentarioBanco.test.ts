// @vitest-environment node
/**
 * Leva 3, aba Questões, Q09 (decisão do dono, 11/10/2026): comentário/explicação novo ou alterado de uma questão fica "Em revisão"
 * e só aparece ao aluno depois que o revisor médico da área aprovar. O texto que já está no ar continua visível até alguém mexer.
 * Mesmo padrão das Atualizações, das Estações e do áudio das Aulas (ch_reviewer_areas / ch_is_reviewer). Num Postgres real em
 * memória com todas as migrações (supabase/migrations/…97NN_*.sql).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ADMIN, ANA, EDITOR, idOf, MIGRATIONS, options, question, REV_CIR, REV_PED, startDb, type Db } from "./helpers/questoesLeva3";

let t: Db;
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return null;
};
const row = async (n: number) => (await t.sql<any>(`select * from public.questions where id = $1`, [idOf(n)]))[0];
const save = (extra: Record<string, unknown>, uid = EDITOR, reason?: string) => t.rpc(uid, "app_admin_save_question", { p_question: extra, ...(reason ? { p_reason: reason } : {}) });
const edit = (n: number, extra: Record<string, unknown>, uid = EDITOR, reason?: string) => save({ ...question(n), id: idOf(n), ...extra }, uid, reason);
/** Questão que já estava no ar com comentário antes da regra (montada como o banco do dono: sem pessoa logada, nada em revisão). */
async function liveQuestion(n: number, extra: Record<string, unknown> = {}) {
  await save(question(n, { options: options({ A: "A está errada.", B: "B é a correta: suporte.", C: "C está errada.", D: "D está errada." }), expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo.", ...extra }));
  // o salvar pelo editor já marca como em revisão; para ter "texto que já estava no ar" o dono já tinha aprovado (ou veio antes da regra)
  await t.sql(`update public.questions set comment_review = null where id = $1`, [idOf(n)]);
}
const answerAs = async (uid: string, n: number, option = "B") => {
  const [s] = await t.sql<any>(`insert into public.practice_sessions (user_id, kind, question_ids) values ($1, 'questoes', $2) returning id`, [uid, [idOf(n)]]);
  await t.rpc(uid, "app_answer_question", { p_session_id: s.id, p_question_id: idOf(n), p_option: option, p_active_ms: 5000 });
};
const correction = (uid: string, n: number) => t.rpc<any>(uid, "practice_correction_view", { p_question_id: idOf(n), p_selected: "B" });
const truth = async (n: number) => (await t.sql<any>(`select public.tutor_truth($1, 'full') t`, [idOf(n)]))[0].t;
const seenOf = async (n: number) => {
  const r = await row(n);
  return { ...Object.fromEntries(r.options.map((o: any) => [`explanation_${o.id}`, o.explanation])), expected_conduct: r.expected_conduct ?? "", inep_intent: r.inep_intent ?? "" };
};
const decide = async (uid: string, n: number, decision: string, note = "Conferi a explicação e a conduta com as diretrizes vigentes.", seen?: Record<string, string>) =>
  t.rpc<any>(uid, "app_admin_question_comment_decide", { p_question_id: idOf(n), p_decision: decision, p_note: note, p_seen_texts: seen ?? (await seenOf(n)) });

beforeAll(async () => {
  t = await startDb();
}, 120_000);

describe("Q09 — o texto que já está no ar continua visível até alguém mexer", () => {
  it("questão com comentário gravado antes da regra: o aluno vê tudo e nada está em revisão", async () => {
    await liveQuestion(901);
    await answerAs(ANA, 901);
    const c = await correction(ANA, 901);
    expect(c).toMatchObject({ explanation: "B é a correta: suporte.", expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo.", in_review: false });
    expect(c.option_notes.map((n: any) => n.id)).toEqual(["A", "C", "D"]);
    expect((await row(901)).comment_review).toBeNull();
  });

  it("salvar o MESMO texto de novo (ou só mexer em espaços, tema, enunciado, gabarito igual) não põe nada em revisão", async () => {
    await liveQuestion(902);
    await edit(902, { options: options({ A: "A está errada.", B: "  B é a correta: suporte.  ", C: "C está errada.", D: "D está errada." }), expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo.", topic: "Bronquiolite aguda" });
    expect((await row(902)).comment_review).toBeNull();
    await answerAs(ANA, 902);
    expect((await correction(ANA, 902)).explanation).toBe("B é a correta: suporte.");
  });
});

describe("Q09 — texto novo ou alterado fica em revisão e o aluno não o vê", () => {
  it("alterar a explicação da correta, a de outra alternativa, a conduta e o 'o que avalia': só o que mudou some do aluno", async () => {
    await liveQuestion(910);
    await answerAs(ANA, 910);
    await edit(910, {
      options: options({ A: "A está errada.", B: "B é a correta: suporte e oxigênio se saturação baixa.", C: "C está errada, mudei o texto.", D: "D está errada." }),
      expected_conduct: "Suporte ventilatório e hidratação.", inep_intent: "Avalia o manejo da bronquiolite.",
    });
    const flag = (await row(910)).comment_review;
    expect(flag.campos).toEqual(["expected_conduct", "explanation_B", "explanation_C", "inep_intent"]);
    expect(flag.por).toBe(EDITOR);
    const c = await correction(ANA, 910);
    expect(c.in_review).toBe(true);
    expect(c.explanation).toBeNull(); // a da correta mudou: sumiu (nem o texto antigo aparece)
    expect(c.expected_conduct).toBeNull();
    expect(c.inep_intent).toBeNull();
    expect(c.option_notes.map((n: any) => n.id)).toEqual(["A", "D"]); // C mudou: sumiu; A e D continuam
    const tt = await truth(910);
    expect(tt.expected_conduct).toBeNull();
    expect(tt.inep_intent).toBeNull();
    expect(tt.options.find((o: any) => o.id === "B").explanation).toBeNull();
    expect(tt.options.find((o: any) => o.id === "C").explanation).toBeNull();
    expect(tt.options.find((o: any) => o.id === "A").explanation).toBe("A está errada.");
    expect(JSON.stringify(c) + JSON.stringify(tt)).not.toMatch(/oxigênio|mudei o texto|hidratação|bronquiolite\./);
    // a questão em si (enunciado, alternativas, gabarito) segue valendo
    expect(c.correct_option).toBe("B");
  });

  it("questão nova com comentário entra em revisão (a questão vale, o comentário espera)", async () => {
    await save(question(911, { options: options({ B: "B é a correta: suporte." }), expected_conduct: "Suporte.", inep_intent: "Avalia o manejo." }));
    expect((await row(911)).comment_review.campos).toEqual(["expected_conduct", "explanation_B", "inep_intent"]);
    await answerAs(ANA, 911);
    const c = await correction(ANA, 911);
    expect(c).toMatchObject({ explanation: null, expected_conduct: null, inep_intent: null, in_review: true });
    expect(c.correct_option).toBe("B");
  });

  it("questão nova sem nenhum comentário não entra em revisão; apagar um texto tira esse campo da revisão", async () => {
    await save(question(912));
    expect((await row(912)).comment_review).toBeNull();
    await edit(912, { expected_conduct: "Suporte.", inep_intent: "Avalia." });
    expect((await row(912)).comment_review.campos).toEqual(["expected_conduct", "inep_intent"]);
    await edit(912, { expected_conduct: "Suporte.", inep_intent: "" });
    expect((await row(912)).comment_review.campos).toEqual(["expected_conduct"]);
    await edit(912, { expected_conduct: "", inep_intent: "" });
    expect((await row(912)).comment_review).toBeNull();
  });

  it("texto vindo do assistente de IA também entra em revisão, com a marca de que veio dele", async () => {
    await liveQuestion(913);
    await edit(913, { options: options({ A: "A está errada.", B: "B é a correta: suporte.", C: "C está errada.", D: "D errada por outro motivo (IA)." }) }, EDITOR, "assistente de IA");
    const flag = (await row(913)).comment_review;
    expect(flag).toMatchObject({ campos: ["explanation_D"], ia: true });
    await liveQuestion(914);
    await edit(914, { expected_conduct: "Outra conduta." });
    expect((await row(914)).comment_review.ia).toBe(false);
  });

  it("a importação com 'atualizar' que troca um comentário também põe em revisão; a que repete o texto, não", async () => {
    await liveQuestion(915);
    const file = (extra: Record<string, unknown>) => ({ ...question(915, { options: options({ A: "A está errada.", B: "B é a correta: suporte.", C: "C está errada.", D: "D está errada." }), expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo." }), ...extra });
    await t.rpc(EDITOR, "app_admin_import_questions", { p_questions: [file({})], p_update_existing: true });
    expect((await row(915)).comment_review).toBeNull();
    await t.rpc(EDITOR, "app_admin_import_questions", { p_questions: [file({ expected_conduct: "Conduta nova do arquivo." })], p_update_existing: true });
    expect((await row(915)).comment_review.campos).toEqual(["expected_conduct"]);
  });

  it("outra edição soma ao que já espera revisão (não esquece o campo anterior) e a devolução some quando o texto muda", async () => {
    await liveQuestion(916);
    await edit(916, { expected_conduct: "Conduta nova." });
    await edit(916, { expected_conduct: "Conduta nova.", inep_intent: "Avalia outra coisa." });
    expect((await row(916)).comment_review.campos).toEqual(["expected_conduct", "inep_intent"]);
    await decide(REV_PED, 916, "return", "A conduta precisa citar a hidratação e a oximetria.");
    expect((await row(916)).comment_review.devolvido).toMatchObject({ por: REV_PED, nota: "A conduta precisa citar a hidratação e a oximetria." });
    await edit(916, { expected_conduct: "Conduta nova com hidratação e oximetria.", inep_intent: "Avalia outra coisa." });
    const flag = (await row(916)).comment_review;
    expect(flag.campos).toEqual(["expected_conduct", "inep_intent"]);
    expect(flag.devolvido).toBeUndefined();
  });

  it("correção oficial do gabarito não é afetada: registrar o gabarito não cria nem tira a revisão do comentário", async () => {
    await liveQuestion(917);
    await edit(917, { expected_conduct: "Conduta nova." });
    const before = (await row(917)).comment_review;
    await t.rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(917), p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_source: "Gabarito definitivo", p_reason: "Recurso aceito pela banca." });
    const after = await row(917);
    expect(after.comment_review).toEqual(before);
    expect(after.correct_option).toBe("C");
    expect(after.explanations_review).not.toBeNull(); // a marca do gabarito segue o caminho dela (7700/7710)
    // e uma questão sem comentário em revisão continua sem, depois de registrar o gabarito
    await liveQuestion(918);
    await t.rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: idOf(918), p_answer: "C", p_status: "FINAL", p_source: "Gabarito definitivo", p_reason: "Gabarito conferido." });
    expect((await row(918)).comment_review).toBeNull();
  });

  it("SQL direto no editor do Supabase (sem pessoa logada) não passa pela revisão: é o jeito do dono corrigir à mão", async () => {
    await liveQuestion(919);
    await t.sql(`update public.questions set expected_conduct = 'Corrigido à mão pelo dono.' where id = $1`, [idOf(919)]);
    expect((await row(919)).comment_review).toBeNull();
  });
});

describe("Q09 — quem revisa e como", () => {
  it("o revisor médico da área aprova com a nota: o comentário volta ao aluno e fica quem, quando e o quê", async () => {
    await liveQuestion(920);
    await edit(920, { options: options({ A: "A está errada.", B: "B é a correta: suporte e oxigênio.", C: "C está errada.", D: "D está errada." }), expected_conduct: "Suporte e oxigênio." });
    await answerAs(ANA, 920);
    expect((await correction(ANA, 920)).explanation).toBeNull();
    const done = await decide(REV_PED, 920, "approve");
    expect(done.comment_review).toBeNull();
    const c = await correction(ANA, 920);
    expect(c).toMatchObject({ explanation: "B é a correta: suporte e oxigênio.", expected_conduct: "Suporte e oxigênio.", in_review: false });
    expect((await truth(920)).expected_conduct).toBe("Suporte e oxigênio.");
    const [dec] = await t.sql<any>(`select decision, decided_by, note, campos from public.question_comment_reviews where question_id = $1`, [idOf(920)]);
    expect(dec).toMatchObject({ decision: "approve", decided_by: REV_PED, campos: ["expected_conduct", "explanation_B"] });
    expect(dec.note).toMatch(/diretrizes vigentes/);
    const log = (await t.sql<any>(`select actor_id, details from public.admin_audit_log where target = $1 and action = 'question.comment_approved'`, [idOf(920)]))[0];
    expect(log.actor_id).toBe(REV_PED);
    expect(log.details).toMatchObject({ campos: ["expected_conduct", "explanation_B"] });
  });

  it("o administrador também aprova; o revisor de OUTRA área, o editor, o aluno e o visitante não", async () => {
    await liveQuestion(921);
    await edit(921, { expected_conduct: "Outra conduta." });
    const refused = (uid: string | null) => failure(decide(uid as string, 921, "approve"));
    expect(await refused(REV_CIR)).toMatch(/revisor médico cadastrado em Pediatria ou de um administrador/);
    expect(await refused(EDITOR)).toMatch(/revisor médico cadastrado em Pediatria ou de um administrador/);
    expect(await refused(ANA)).toMatch(/Acesso restrito/);
    expect(await failure(t.rpc(null, "app_admin_question_comment_decide", { p_question_id: idOf(921), p_decision: "approve", p_note: "Conferi tudo direitinho.", p_seen_texts: {} }))).toMatch(/permission denied|permissão/i);
    expect((await row(921)).comment_review).not.toBeNull();
    await decide(ADMIN, 921, "approve");
    expect((await row(921)).comment_review).toBeNull();
  });

  it("a nota é obrigatória (10 letras ou mais), a decisão tem de ser aprovar ou devolver, e questão sem revisão pendente é recusada", async () => {
    await liveQuestion(922);
    expect(await failure(decide(REV_PED, 922, "approve"))).toMatch(/não tem comentário em revisão/);
    await edit(922, { expected_conduct: "Outra conduta." });
    expect(await failure(decide(REV_PED, 922, "approve", "ok"))).toMatch(/pelo menos 10 caracteres/);
    expect(await failure(decide(REV_PED, 922, "return", "   "))).toMatch(/pelo menos 10 caracteres/);
    expect(await failure(decide(REV_PED, 922, "publish"))).toMatch(/aprovar ou devolver/);
    expect(await failure(t.rpc(REV_PED, "app_admin_question_comment_decide", { p_question_id: idOf(922), p_decision: "approve", p_note: "Conferi o comentário todo.", p_seen_texts: null }))).toMatch(/textos que você revisou/);
    expect(await failure(decide(REV_PED, 922, "approve", "Conferi o comentário todo.", { expected_conduct: "Outra conduta." }))).toBeNull();
  });

  it("aprovar um texto que mudou enquanto o revisor lia é recusado (ele não aprova o que não viu)", async () => {
    await liveQuestion(923);
    await edit(923, { expected_conduct: "Conduta que o revisor leu." });
    const seen = await seenOf(923);
    await edit(923, { expected_conduct: "Conduta reescrita depois da leitura." });
    expect(await failure(decide(REV_PED, 923, "approve", "Conferi o comentário todo.", seen))).toMatch(/mudou enquanto você revisava/);
    expect((await row(923)).comment_review).not.toBeNull();
    // outro campo entrou na revisão depois da leitura: também recusa
    await liveQuestion(924);
    await edit(924, { expected_conduct: "Conduta nova." });
    const seen2 = await seenOf(924);
    await edit(924, { expected_conduct: "Conduta nova.", inep_intent: "Avalia outra coisa." });
    expect(await failure(decide(REV_PED, 924, "approve", "Conferi o comentário todo.", seen2))).toMatch(/mudou enquanto você revisava/);
    expect(await failure(decide(REV_PED, 924, "approve", "Conferi o comentário todo."))).toBeNull();
  });

  it("devolver mantém o comentário escondido do aluno e deixa a nota para quem escreveu", async () => {
    await liveQuestion(925);
    await edit(925, { expected_conduct: "Conduta com erro." });
    await answerAs(ANA, 925);
    const back = await decide(REV_PED, 925, "return", "A conduta cita um fármaco fora da diretriz atual.");
    expect(back.comment_review.campos).toEqual(["expected_conduct"]);
    expect((await correction(ANA, 925)).expected_conduct).toBeNull();
    const asked = await t.rpc<any>(EDITOR, "app_admin_question", { p_id: idOf(925) });
    expect(asked.comment_review.devolvido).toMatchObject({ nota: "A conduta cita um fármaco fora da diretriz atual." });
    expect(asked.comment_decision).toMatchObject({ decision: "return", note: "A conduta cita um fármaco fora da diretriz atual.", by: "Dra. Revisora" });
    const log = await t.sql<any>(`select action from public.admin_audit_log where target = $1 and action like 'question.comment_%'`, [idOf(925)]);
    expect(log.map((l) => l.action)).toEqual(["question.comment_returned"]);
  });
});

describe("Q09 — a fila do revisor e a tela da equipe", () => {
  it("o revisor médico (sem papel de equipe) vê só as questões das áreas dele; a equipe vê todas, com a marca de quem pode decidir", async () => {
    await liveQuestion(930);
    await edit(930, { expected_conduct: "Conduta de pediatria." });
    await liveQuestion(931, { area: "CIRURGIA_GERAL", topic: "Apendicite" });
    await edit(931, { area: "CIRURGIA_GERAL", topic: "Apendicite", expected_conduct: "Conduta de cirurgia." });
    const mine = await t.rpc<any>(REV_PED, "app_admin_comment_review_queue", { p_filters: {}, p_limit: 200 });
    expect(mine.items.map((i: any) => i.id)).toContain(idOf(930));
    expect(mine.items.map((i: any) => i.id)).not.toContain(idOf(931));
    expect(mine.items.find((i: any) => i.id === idOf(930))).toMatchObject({ code: "REV-2024.1-Q930", can_review: true, campos: ["expected_conduct"] });
    const cir = await t.rpc<any>(REV_CIR, "app_admin_comment_review_queue", { p_limit: 200 });
    expect(cir.items.map((i: any) => i.id)).toContain(idOf(931));
    expect(cir.items.map((i: any) => i.id)).not.toContain(idOf(930));
    const staff = await t.rpc<any>(EDITOR, "app_admin_comment_review_queue", { p_limit: 200 });
    expect(staff.items.map((i: any) => i.id)).toEqual(expect.arrayContaining([idOf(930), idOf(931)]));
    expect(staff.items.every((i: any) => i.can_review === false)).toBe(true);
    const admin = await t.rpc<any>(ADMIN, "app_admin_comment_review_queue", { p_limit: 200 });
    expect(admin.items.every((i: any) => i.can_review === true)).toBe(true);
    // aluno e visitante não veem a fila
    expect(await failure(t.rpc(ANA, "app_admin_comment_review_queue", {}))).toMatch(/Acesso restrito/);
    expect(await failure(t.rpc(null, "app_admin_comment_review_queue", {}))).toMatch(/permission denied|permissão/i);
  });

  it("o revisor abre o conteúdo da questão para conferir; o de outra área e o aluno não", async () => {
    await liveQuestion(932);
    await edit(932, { expected_conduct: "Conduta para conferir." });
    const view = await t.rpc<any>(REV_PED, "app_admin_comment_review", { p_question_id: idOf(932) });
    expect(view).toMatchObject({ id: idOf(932), code: "REV-2024.1-Q932", statement: expect.stringContaining("Lactente"), correct_option: "B", expected_conduct: "Conduta para conferir.", can_review: true });
    expect(view.options).toHaveLength(4);
    expect(view.comment_review.campos).toEqual(["expected_conduct"]);
    expect(await failure(t.rpc(REV_CIR, "app_admin_comment_review", { p_question_id: idOf(932) }))).toMatch(/Acesso restrito/);
    expect(await failure(t.rpc(ANA, "app_admin_comment_review", { p_question_id: idOf(932) }))).toMatch(/Acesso restrito/);
    expect(await failure(t.rpc(REV_PED, "app_admin_comment_review", { p_question_id: "nao_existe" }))).toMatch(/não encontrada/);
    // a equipe abre também (sem poder decidir)
    expect((await t.rpc<any>(EDITOR, "app_admin_comment_review", { p_question_id: idOf(932) })).can_review).toBe(false);
  });

  it("o revisor médico NÃO ganha acesso às demais funções da aba Questões", async () => {
    await liveQuestion(933);
    for (const [fn, args] of [
      ["app_admin_question", { p_id: idOf(933) }],
      ["app_admin_questions", {}],
      ["app_admin_save_question", { p_question: question(933) }],
    ] as const) expect(await failure(t.rpc(REV_PED, fn, args as any)), fn).toMatch(/Acesso restrito/);
  });

  it("a lista da equipe marca e filtra as questões com comentário em revisão; o editor vê quem pode decidir e quem mexeu", async () => {
    await liveQuestion(934);
    await liveQuestion(935);
    await edit(935, { expected_conduct: "Mexida." });
    const list = await t.rpc<any>(EDITOR, "app_admin_questions", { p_filters: { comment_review: true }, p_limit: 200 });
    const ids = list.items.map((i: any) => i.id);
    expect(ids).toContain(idOf(935));
    expect(ids).not.toContain(idOf(934));
    expect(list.items.find((i: any) => i.id === idOf(935)).comment_review).toBe(true);
    const full = await t.rpc<any>(EDITOR, "app_admin_questions", { p_filters: {}, p_limit: 200 });
    expect(full.items.find((i: any) => i.id === idOf(934)).comment_review).toBe(false);
    const one = await t.rpc<any>(EDITOR, "app_admin_question", { p_id: idOf(935) });
    expect(one).toMatchObject({ comment_can_review: false, comment_review_by: "Editora" });
    expect((await t.rpc<any>(ADMIN, "app_admin_question", { p_id: idOf(935) })).comment_can_review).toBe(true);
  });
});

describe("Q09 — permissões e migração", () => {
  it("o aluno não lê a marca nem o histórico de decisões direto pelo banco", async () => {
    await liveQuestion(940);
    await edit(940, { expected_conduct: "Mexida." });
    expect(await failure(t.asUser(ANA, `select comment_review from public.questions where id = $1`, [idOf(940)]))).toMatch(/permission denied/);
    expect(await failure(t.asUser(ANA, `select * from public.question_comment_reviews`))).toMatch(/permission denied/);
    expect(await failure(t.asUser(REV_PED, `select * from public.question_comment_reviews`))).toMatch(/permission denied/);
    expect(await failure(t.asUser(EDITOR, `select * from public.question_comment_reviews`))).toMatch(/permission denied/);
    // nem tira a marca por conta própria
    await failure(t.asUser(ANA, `update public.questions set comment_review = null where id = $1`, [idOf(940)]));
    expect((await row(940)).comment_review).not.toBeNull();
  });

  it("as funções internas não ficam à mostra e o revisor/aluno não consegue chamá-las", async () => {
    for (const fn of ["question_comment_fields(jsonb, text, text)", "question_hidden_fields(jsonb, jsonb)", "question_can_review_comment(public.med_area)", "questions_comment_review_mark()"]) {
      const [r] = await t.sql<any>(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n`, [`public.${fn}`]);
      expect(r, fn).toEqual({ a: false, n: false });
    }
  });

  it("a migração pode ser colada duas vezes e não muda o que está em revisão nem o que o aluno vê", async () => {
    await liveQuestion(941);
    await edit(941, { expected_conduct: "Conduta em revisão." });
    await answerAs(ANA, 941);
    const before = (await row(941)).comment_review;
    const text = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((f) => /^20261003009701_/.test(f))!), "utf8");
    await t.db.exec(text);
    await t.db.exec(text);
    expect((await row(941)).comment_review).toEqual(before);
    expect((await correction(ANA, 941)).expected_conduct).toBeNull();
    await decide(REV_PED, 941, "approve", "Conferi a conduta na diretriz vigente.");
    expect((await correction(ANA, 941)).expected_conduct).toBe("Conduta em revisão.");
  });

  it("a conferência do administrador acusa quando a …9620 é colada de novo depois desta, e volta ao normal ao colar esta de novo", async () => {
    expect(await t.rpc(ADMIN, "app_question_comment_check")).toEqual({ ok: true, faltando: [] });
    for (const uid of [EDITOR, REV_PED, ANA]) expect(await failure(t.rpc(uid, "app_question_comment_check")), uid).toMatch(/Acesso restrito/);
    expect(await failure(t.rpc(null, "app_question_comment_check"))).toMatch(/permission denied|permissão/i);
    const read = (re: RegExp) => fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((f) => re.test(f))!), "utf8");
    await t.db.exec(read(/^20261003009620_/));
    expect(await t.rpc(ADMIN, "app_question_comment_check")).toEqual({ ok: false, faltando: ["ch_raw_practice_correction_view(text, text)", "ch_raw_tutor_truth(text, text)"] });
    await t.db.exec(read(/^20261003009701_/));
    expect(await t.rpc(ADMIN, "app_question_comment_check")).toEqual({ ok: true, faltando: [] });
  });
});
