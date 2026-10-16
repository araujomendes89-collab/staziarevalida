// @vitest-environment node
/**
 * Administração, aba Questões (frente adm-questoes): problemas Q10, Q08, Q06, Q15 e Q11, num Postgres real em memória com
 * todas as migrações (supabase/migrations/…95NN_*.sql, por cima da …7700 e da …7710).
 *   Q10: a análise publicada sai do ar quando o enunciado ou o texto de uma alternativa muda ao salvar (pelo editor ou pela
 *        importação com "atualizar"); explicação, conduta, tema e espaços repetidos não derrubam a análise.
 *   Q08: a linha de exemplo do modelo de planilha não vira questão (editor, importação e prévia); apagar questão só para
 *        administrador e só sem resposta, anotação, marcação ou sessão de aluno, com registro de ações.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { csvTemplate, EXAMPLE_TEXTS, questionsFromCsv } from "../novo/app/admin/questionImport.js";

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
const sessionOf = session;
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
  await db.exec(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`); // CC19: o aluno só recebe com o modo sombra desligado e a publicação ligada
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

  it("reimportar com 'atualizar' sem mudar o texto (alternativas em outra ordem e com outras chaves) NÃO tira a análise", async () => {
    await save(q(106, { options: explanations({ B: "B é a correta." }) }));
    const analysis = await publishAnalysis(106);
    const s = await session(ANA, [106]);
    await answer(ANA, s, 106, "B");
    const reordered = [...q(106).options].reverse().map((o: any) => ({ ...o, text: `  ${o.text}  `, extra: "chave a mais", explanation: "" }));
    const result = await rpc(EDITOR, "app_admin_import_questions", {
      p_questions: [{ ...q(106), statement: `${q(106).statement}\n`, options: reordered }],
      p_update_existing: true,
    });
    expect(result).toMatchObject({ ok: true, updated: 1 });
    expect((await analysisOf(analysis)).status).toBe("published");
    expect((await commentOf(analysis)).status).toBe("published");
    expect(await studentSees(ANA, 106)).toBe("Análise feita para esta redação.");
    expect((await sql<any>(`select count(*)::int n from public.admin_audit_log where target = $1 and action = 'question.analysis_unpublished'`, [idOf(106)]))[0].n).toBe(0);
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

const EXAMPLE = () => questionsFromCsv(csvTemplate()).items[0].question;

describe("Q08 — a linha de exemplo do modelo de planilha não vira questão", () => {
  it("a linha de exemplo, como o modelo a traz, é recusada pelo banco na importação, na prévia e no editor", async () => {
    const example = EXAMPLE();
    const imported = await rpc(EDITOR, "app_admin_import_questions", { p_questions: [example], p_update_existing: false });
    expect(imported.ok).toBe(false);
    expect(imported.errors[0].message).toMatch(/linha de exemplo do modelo/);
    expect((await sql<any>(`select count(*)::int n from public.questions where exam_id = 'revalida-2026-2' and number = 1`))[0].n).toBe(0);
    const preview = await rpc(EDITOR, "app_admin_import_preview", { p_questions: [example] });
    expect(preview).toMatchObject({ new: 0, existing: 0 });
    await expect(save({ ...example, id: undefined })).rejects.toThrow(/linha de exemplo do modelo/);
  });

  it("não sobrescreve a Q1 real da prova com a linha de exemplo, nem com 'atualizar'", async () => {
    await save(q(1, { year: 2026, semester: 2, statement: "Enunciado real da questão 1 da prova 2026/2, com dados clínicos suficientes." }));
    const before = await sql<any>(`select statement, topic, options from public.questions where id = 'revalida_2026_2_q001'`);
    const result = await rpc(EDITOR, "app_admin_import_questions", { p_questions: [EXAMPLE()], p_update_existing: true });
    expect(result.ok).toBe(false);
    expect(await sql<any>(`select statement, topic, options from public.questions where id = 'revalida_2026_2_q001'`)).toEqual(before);
  });

  it("qualquer campo com o texto de exemplo é recusado (mesmo com o resto trocado); frase que só contém o texto passa", async () => {
    const real = q(120);
    const set = (patch: Record<string, unknown>) => ({ ...real, ...patch });
    const withOption = (id: string, patch: Record<string, unknown>) => set({ options: real.options.map((o: any) => (o.id === id ? { ...o, ...patch } : o)) });
    for (const bad of [
      set({ topic: "Tema principal da questão" }),
      set({ statement: "  Texto completo do enunciado,  como está no caderno de prova. " }),
      set({ subtopic: "Subtema (opcional)" }),
      set({ expected_conduct: "Conduta esperada (opcional)" }),
      withOption("C", { text: "TEXTO DA ALTERNATIVA C" }),
      withOption("B", { explanation: "Por que a alternativa correta está certa (opcional)" }),
      set({ sources: [{ title: "Gabarito oficial definitivo (opcional)" }] }),
    ]) {
      await expect(save(bad)).rejects.toThrow(/linha de exemplo do modelo/);
    }
    // a lista do banco é a do modelo de planilha (o modelo é a fonte): cada texto de exemplo é recusado, em qualquer campo de texto
    for (const text of EXAMPLE_TEXTS) {
      await expect(save(set({ topic: text })), text).rejects.toThrow(/linha de exemplo do modelo/);
    }
    await save(set({ topic: "Tema principal da questão: bronquiolite", subtopic: "Subtema (opcional) do tema" }));
    expect((await row(120)).topic).toBe("Tema principal da questão: bronquiolite");
  });
});

describe("Q08 — apagar questão: só administrador, só sem resposta de aluno, com registro", () => {
  it("administrador apaga questão sem resposta: some do banco, leva a análise junto e fica no registro de ações", async () => {
    await save(q(130));
    await publishAnalysis(130);
    const count = async () => (await sql<any>(`select question_count from public.exams where id = 'revalida-2024-1'`))[0].question_count as number;
    const before = await count();
    const result = await rpc(ADMIN, "app_admin_delete_question", { p_question_id: idOf(130) });
    expect(result).toMatchObject({ deleted: true, code: "REV-2024.1-Q130" });
    expect(await row(130)).toBeUndefined();
    expect((await sql<any>(`select count(*)::int n from public.question_analysis where question_id = $1`, [idOf(130)]))[0].n).toBe(0);
    expect(await count()).toBe(before - 1);
    const log = (await sql<any>(`select actor_id, details from public.admin_audit_log where target = $1 and action = 'question.delete'`, [idOf(130)]))[0];
    expect(log.actor_id).toBe(ADMIN);
    expect(log.details).toMatchObject({ code: "REV-2024.1-Q130", exam_id: "revalida-2024-1", number: 130, topic: "Bronquiolite", status: "valid" });
    expect(log.details.excerpt).toContain("questão 130");
  });

  it("só administrador: equipe, aluno e visitante não apagam, e a questão fica", async () => {
    await save(q(131));
    await expect(rpc(EDITOR, "app_admin_delete_question", { p_question_id: idOf(131) })).rejects.toThrow("Acesso restrito a administradores.");
    await expect(rpc(ANA, "app_admin_delete_question", { p_question_id: idOf(131) })).rejects.toThrow("Acesso restrito a administradores.");
    await expect(rpc(null, "app_admin_delete_question", { p_question_id: idOf(131) })).rejects.toThrow(/permission denied/);
    expect(await row(131)).toBeDefined();
    await expect(rpc(ADMIN, "app_admin_delete_question", { p_question_id: "nao_existe" })).rejects.toThrow("Questão não encontrada.");
  });

  it("recusa quando um aluno já respondeu, anotou o erro, marcou a questão ou a recebeu numa sessão; nada é apagado", async () => {
    for (const n of [132, 133, 134, 135]) await save(q(n));
    // 132: respondida
    await answer(ANA, await sessionOf(ANA, [132]), 132, "B");
    // 133: anotação de erro
    await sql(`insert into public.error_notes (user_id, question_id, note) values ($1, $2, 'anotei')`, [BIA, idOf(133)]);
    // 134: marcada
    await sql(`insert into public.question_bookmarks (user_id, question_id) values ($1, $2)`, [BIA, idOf(134)]);
    // 135: só recebida numa sessão de treino, sem resposta
    await sessionOf(BIA, [135]);
    const reasons: Record<number, RegExp> = {
      132: /1 resposta de aluno/, 133: /anotaç(ão|ões) de erro/, 134: /marcada por \d+ alunos?/, 135: /1 sessão de treino de aluno/,
    };
    for (const n of [132, 133, 134, 135]) {
      await expect(rpc(ADMIN, "app_admin_delete_question", { p_question_id: idOf(n) }), String(n)).rejects.toThrow(reasons[n]);
      expect(await row(n)).toBeDefined();
    }
    await expect(rpc(ADMIN, "app_admin_delete_question", { p_question_id: idOf(132) })).rejects.toThrow(/anule a questão pelo registro do gabarito oficial/);
    expect((await sql<any>(`select count(*)::int n from public.admin_audit_log where action = 'question.delete' and target = any ($1)`, [[132, 133, 134, 135].map(idOf)]))[0].n).toBe(0);
  });

  it("colar a migração duas vezes não dá erro e a função continua barrando visitante", async () => {
    const text = fs.readFileSync(path.join(MIGRATIONS, "20261003009501_questoes_apagar_e_exemplo.sql"), "utf8");
    await db.exec(text);
    await db.exec(text);
    await save(q(136));
    expect(await rpc(ADMIN, "app_admin_delete_question", { p_question_id: idOf(136) })).toMatchObject({ deleted: true });
    await expect(rpc(null, "app_admin_delete_question", { p_question_id: idOf(130) })).rejects.toThrow(/permission denied/);
    await expect(rpc(null, "admin_question_problem", { q: {} })).rejects.toThrow(/permission denied/);
  });
});

describe("Q06 — a lista da aba pagina de verdade (o banco devolve no máximo 200 por chamada)", () => {
  it("pedir 250 de uma vez devolve 200; as páginas por posição (p_offset) juntam todas, sem repetir nem pular", async () => {
    // 230 questões de uma prova só delas (direto no banco: é mais rápido que 230 salvamentos)
    await sql(`insert into public.exams (id, kind, year, semester, title) values ('revalida-2023-1', 'REVALIDA', 2023, 1, 'Revalida INEP 2023/1')`);
    await sql(
      `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status)
       select 'revalida_2023_1_q' || lpad(n::text, 3, '0'), 'REV-2023.1-Q' || lpad(n::text, 3, '0'), 'revalida-2023-1', n, 'PEDIATRIA', 'Tema ' || n,
              'Enunciado da questão ' || n || ' com texto suficiente.',
              '[{"id":"A","text":"a"},{"id":"B","text":"b"},{"id":"C","text":"c"},{"id":"D","text":"d"}]'::jsonb, 'B', 'valid'
       from generate_series(1, 230) n`
    );
    const filters = { exam_id: "revalida-2023-1" };
    const big = await rpc(EDITOR, "app_admin_questions", { p_filters: filters, p_limit: 250, p_offset: 0 });
    expect(big.total).toBe(230);
    expect(big.items).toHaveLength(200); // o teto: pedir 250, 300… nunca traz mais

    const seen: string[] = [];
    for (let offset = 0; offset < 230; offset += 50) {
      const page = await rpc(EDITOR, "app_admin_questions", { p_filters: filters, p_limit: 50, p_offset: offset });
      seen.push(...page.items.map((i: any) => i.id));
    }
    expect(seen).toHaveLength(230);
    expect(new Set(seen).size).toBe(230);
    expect(seen).toEqual(big.items.map((i: any) => i.id).concat(seen.slice(200)));
    expect([seen[0], seen[229]]).toEqual(["revalida_2023_1_q001", "revalida_2023_1_q230"]); // na ordem da prova e do número
  });
});

describe("Q15 — o Início conta, no tema prioritário, só as questões que entram no treino", () => {
  it("anulada e questão que cita figura sem imagem ficam fora da contagem; a que tem a imagem vinculada entra", async () => {
    const topic = "Tema do Início Q15";
    for (const n of [140, 141, 142, 143, 144]) await save(q(n, { topic }));
    await sql(`update public.questions set needs_image = true where id = any ($1)`, [[142, 143].map(idOf)]); // cita figura
    await sql(`update public.questions set images = '[{"url": "/question-assets/q143.png", "alt": "Figura da questão 143"}]'::jsonb where id = $1`, [idOf(143)]); // esta tem a imagem (recorte do caderno)
    await sql(`update public.questions set status = 'annulled' where id = $1`, [idOf(144)]);
    // o aluno erra a 140 (a 141 fica sem resposta)
    const s = await session(ANA, [140]);
    await answer(ANA, s, 140, "A");

    const home = await rpc(ANA, "app_home");
    const t = home.priority_topics.find((x: any) => x.topic === topic);
    // 140, 141 e 143 entram no treino; 142 (figura sem imagem) e 144 (anulada) não
    expect(t).toMatchObject({ topic, pending: 1, questions: 3 });
    // é a mesma conta do treino
    const pool = await sql<any>(`select count(*)::int n from public.practice_pool('{}'::jsonb) p join public.questions q on q.id = p.question_id where q.topic = $1`, [topic]);
    expect(pool[0].n).toBe(3);
  });

  it("a migração pode ser colada duas vezes e o Início continua igual", async () => {
    const text = fs.readFileSync(path.join(MIGRATIONS, "20261003009502_inicio_questoes_do_treino.sql"), "utf8");
    await db.exec(text);
    await db.exec(text);
    const t = (await rpc(ANA, "app_home")).priority_topics.find((x: any) => x.topic === "Tema do Início Q15");
    expect(t.questions).toBe(3);
  });
});
