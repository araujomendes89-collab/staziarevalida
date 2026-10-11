// @vitest-environment node
/**
 * Administração, aba Questões (frente adm-questoes): problemas Q10, Q08, Q06, Q15 e Q11, num Postgres real em memória com
 * todas as migrações (supabase/migrations/…95NN_*.sql, por cima da …7700 e da …7710).
 *   Q10: a análise publicada sai do ar quando o enunciado ou o texto de uma alternativa muda ao salvar (pelo editor ou pela
 *        importação com "atualizar"); explicação, conduta, tema e espaços repetidos não derrubam a análise.
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
const BIA = "00000000-0000-4000-8000-00000000000b";

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
/** Salva de novo uma questão que já existe (com o id), mudando só o que veio em `extra`. */
const edit = (number: number, extra: Record<string, unknown>) => save({ ...q(number), ...extra, id: idOf(number) });
const session = async (uid: string, numbers: number[]) =>
  (await sql<any>(`insert into public.practice_sessions (user_id, kind, question_ids) values ($1, 'questoes', $2) returning id`, [uid, numbers.map(idOf)]))[0].id as string;
const answer = (uid: string, sessionId: string, number: number, option: string) =>
  rpc(uid, "app_answer_question", { p_session_id: sessionId, p_question_id: idOf(number), p_option: option, p_active_ms: 10_000 });

/** Análise publicada para o gabarito B, com o comentário publicado (como o revisor médico aprovando). */
async function publishAnalysis(number: number, status = "published") {
  const [a] = await sql<any>(
    `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis, reviewed_at, review_note)
     values ($1, 1, 'Análise feita para esta redação.', 'x', $2, 'B', now(), 'Aprovada pelo revisor.') returning id`,
    [idOf(number), status]
  );
  await sql(
    `insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status, published_at)
     values ($1, $2, 1, 'full', '{"texto": "comentário"}'::jsonb, 'h', $3, now())`,
    [idOf(number), a.id, status]
  );
  return a.id as string;
}
const analysisOf = async (id: string) => (await sql<any>(`select status, is_current, review_note, reviewed_at from public.question_analysis where id = $1`, [id]))[0];
const commentOf = async (id: string) => (await sql<any>(`select status from public.question_comments where analysis_id = $1`, [id]))[0];
/** O que o Tutor do aluno recebe da questão (função interna: o servidor a chama, ninguém pela API). */
const tutorAnalysis = async (number: number) => (await sql<any>(`select public.tutor_truth($1, 'full') -> 'analysis' as analysis`, [idOf(number)]))[0].analysis;
const studentSees = async (uid: string, number: number) => (await rpc(uid, "app_question_commentary", { p_question_id: idOf(number) }))?.question_core ?? null;

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
    [BIA, "bia@teste.dev", "Bia"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 60_000);

describe("Q10 — a análise publicada sai do ar quando o enunciado ou o texto de uma alternativa muda", () => {
  it("mudar o texto de uma alternativa tira a análise do ar (aluno, Tutor), com o motivo na análise e no registro de ações", async () => {
    await save(q(100, { options: explanations({ B: "B é a correta: só suporte." }) }));
    const analysis = await publishAnalysis(100);
    const s = await session(ANA, [100]);
    await answer(ANA, s, 100, "B");
    expect(await studentSees(ANA, 100)).toBe("Análise feita para esta redação.");
    expect(await tutorAnalysis(100)).not.toBeNull();

    await edit(100, { options: explanations({ B: "B é a correta: só suporte." }).map((o) => (o.id === "C" ? { ...o, text: "alternativa C reescrita" } : o)) });

    expect(await studentSees(ANA, 100)).toBeNull();
    expect(await tutorAnalysis(100)).toBeNull();
    const a = await analysisOf(analysis);
    expect(a.status).toBe("rejected");
    // quem aprovou continua sendo quem aprovou; o motivo é somado à observação que já havia
    expect(a.review_note).toContain("Aprovada pelo revisor.");
    expect(a.review_note).toContain("Saiu do ar em ");
    expect(a.reviewed_at).not.toBeNull();
    expect((await commentOf(analysis)).status).toBe("rejected");
    const log = (await sql<any>(`select details from public.admin_audit_log where target = $1 and action = 'question.analysis_unpublished'`, [idOf(100)]))[0];
    expect(log.details).toMatchObject({ analysis_ids: [analysis] });
  });

  it("mudar o enunciado também tira; mudar só explicação, conduta, tema ou espaços repetidos não tira", async () => {
    await save(q(101));
    const analysis = await publishAnalysis(101);
    const s = await session(ANA, [101]);
    await answer(ANA, s, 101, "B");
    await edit(101, { options: explanations({ A: "A está errada." }), expected_conduct: "Suporte e observação.", topic: "Bronquiolite aguda", subtopic: "Conduta", inep_intent: "Avalia o manejo." });
    // espaços repetidos, quebras de linha e espaços nas pontas não mudam o que a análise explica
    await edit(101, { statement: `  ${q(101).statement.replace(" ", "   ")}  \n` });
    expect((await analysisOf(analysis)).status).toBe("published");
    expect(await studentSees(ANA, 101)).toBe("Análise feita para esta redação.");

    await edit(101, { statement: `${q(101).statement} Considere que o lactente tem saturação de 90%.` });
    expect((await analysisOf(analysis)).status).toBe("rejected");
    expect(await studentSees(ANA, 101)).toBeNull();
  });

  it("a importação com 'atualizar' que muda o enunciado também tira; análise ainda não publicada não é mexida", async () => {
    await save(q(102));
    await save(q(103));
    const published = await publishAnalysis(102);
    const draft = await publishAnalysis(103, "ai_draft");
    const file = (n: number, statement: string) => ({ ...q(n), statement });
    const result = await rpc(EDITOR, "app_admin_import_questions", {
      p_questions: [file(102, "Enunciado novo da questão 102, com mais um dado clínico."), file(103, "Enunciado novo da questão 103, com mais um dado clínico.")],
      p_update_existing: true,
    });
    expect(result).toMatchObject({ ok: true, updated: 2 });
    expect((await analysisOf(published)).status).toBe("rejected");
    // o rascunho segue como estava: a revisão do revisor já não deixa aprová-lo (a questão mudou depois da análise)
    expect((await analysisOf(draft)).status).toBe("ai_draft");
    expect((await commentOf(draft)).status).toBe("ai_draft");
  });

  it("depois de sair do ar, salvar de novo a questão continua funcionando e a análise nova (aprovada depois) aparece", async () => {
    await save(q(104));
    await publishAnalysis(104);
    const s = await session(BIA, [104]);
    await answer(BIA, s, 104, "B");
    await edit(104, { statement: "Enunciado reescrito da questão 104." });
    await edit(104, { statement: "Enunciado reescrito da questão 104, de novo." });
    expect(await studentSees(BIA, 104)).toBeNull();
    // a análise nova é gerada para o texto de agora e aprovada por um revisor: volta
    await sql(`update public.question_analysis set is_current = false where question_id = $1`, [idOf(104)]);
    await sql(
      `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis)
       values ($1, 2, 'Análise nova.', 'y', 'published', 'B')`,
      [idOf(104)]
    );
    expect(await studentSees(BIA, 104)).toBe("Análise nova.");
  });
});

describe("Q10 — a migração pode ser colada de novo", () => {
  it("colada duas vezes: sem erro, um gatilho só, e a análise sai do ar uma vez", async () => {
    const text = fs.readFileSync(path.join(MIGRATIONS, "20261003009500_questoes_analise_sai_do_ar.sql"), "utf8");
    await db.exec(text);
    await db.exec(text);
    expect((await sql<any>(`select count(*)::int n from pg_trigger where tgname = 'questions_unpublish_stale_analysis' and not tgisinternal`))[0].n).toBe(1);
    await save(q(105));
    const analysis = await publishAnalysis(105);
    await edit(105, { statement: "Enunciado da 105 mudado." });
    expect((await analysisOf(analysis)).status).toBe("rejected");
    expect((await sql<any>(`select count(*)::int n from public.admin_audit_log where target = $1 and action = 'question.analysis_unpublished'`, [idOf(105)]))[0].n).toBe(1);
    // as funções internas não são chamadas por ninguém pela API
    await expect(rpc(EDITOR, "question_analysis_basis_text", { p_statement: "a", p_options: [] })).rejects.toThrow(/permission denied/);
  });
});
