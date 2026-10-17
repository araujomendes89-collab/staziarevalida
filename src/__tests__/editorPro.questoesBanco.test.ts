// @vitest-environment node
/**
 * Editor profissional nas QUESTÕES (migração 013120), num Postgres real em memória (PGlite) com todas as migrações.
 *   - ensaio: o banco ANTES da 013120 → aplicar duas vezes → conferir (013120-conferir.sql) → item antigo responde igual →
 *     desfazer (013120-desfazer.sql) → funções iguais às de antes;
 *   - as 4 provas do brief: (1) só formatação não derruba; (2) conteúdo derruba; (3) o aluno não recebe formatação de campo que ainda
 *     não pode ver (antes de responder, campos em revisão, anulada, Tutor); (4) questão/rascunho antigo sem formatação = resposta idêntica;
 *   - publicar inédita leva a formatação (stem→statement...), "só formatação" numa versão publicada chega ao aluno na hora;
 *   - equilibrar gabarito troca as letras da formatação; guarda de fonte complementar vale na formatação.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN, ALUNO, ALUNO2, EDITOR, criarUsuarios, rpcFor, sqlFor, type Rpc, type Sql } from "./helpers/publicacaoCentral";

vi.setConfig({ testTimeout: 120_000 });
const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = "20261003013120_editor_pro_questoes.sql";
const SQL_DIR = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql";
const REDEFINIDAS = ["admin_upsert_question", "practice_question_view", "tutor_question_view", "ch_raw_practice_correction_view", "draft_content_hash",
  "app_draft_question_save", "app_draft_balance_answer", "staziamed_question_payload", "app_staziamed_publish"];

let db: PGlite;
let sql: Sql;
let rpc: Rpc;
const lerArquivo = (f: string) => fs.readFileSync(f, "utf8");
const aplicarNova = () => db.exec(lerArquivo(path.join(MIGRATIONS, NOVA)));

// ---------------------------------------------------------------- formato
const txt = (t: string, marks?: any[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const env = (doc: any) => ({ f: "sdoc", v: 1, doc });
const negrito = (t: string) => env({ type: "doc", content: [{ type: "paragraph", content: [txt(t, [{ type: "bold" }])] }] });
const italico = (t: string) => env({ type: "doc", content: [{ type: "paragraph", content: [txt(t, [{ type: "italic" }])] }] });
const comNota = (t: string) => env({ type: "doc", content: [{ type: "paragraph", content: [txt(t)] }, { type: "notaRodape", content: [txt("ver")] }] });

// ---------------------------------------------------------------- questão oficial
const OF = { kind: "REVALIDA", year: 2024, semester: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo" };
const oficial = (number: number, extra: Record<string, unknown> = {}) => ({
  ...OF, number,
  statement: `Lactente de 4 meses com sibilância e coriza há 2 dias (questão ${number}). Qual a conduta?`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id} da ${number}.`, explanation: `${id === "B" ? "Correta" : "Incorreta"}. Explicação da ${id}.` })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte clínico.", inep_intent: "Manejo da bronquiolite.", needs_image: false, ...extra,
});
const idOf = (n: number) => `revalida_2024_1_q${String(n).padStart(3, "0")}`;
const linha = async (n: number) => (await sql(`select * from public.questions where id = $1`, [idOf(n)]))[0];
/** Toda a formatação possível de uma questão oficial (os textos de `oficial(n)`). */
const formatacaoOficial = (n: number) => {
  const q = oficial(n);
  const f: Record<string, unknown> = { statement: negrito(q.statement), expected_conduct: negrito(q.expected_conduct), inep_intent: italico(q.inep_intent) };
  for (const o of q.options) {
    f[`opcao.${o.id}.texto`] = negrito(o.text);
    f[`opcao.${o.id}.explicacao`] = italico(o.explanation);
  }
  return f;
};
const salvarOficial = (uid: string, n: number, extra: Record<string, unknown> = {}) =>
  rpc<any>(uid, "app_admin_save_question", { p_question: { ...oficial(n), id: idOf(n), ...extra } });
const responder = (uid: string, n: number, letra = "B") =>
  sql(`insert into public.question_attempts (user_id, question_id, selected_option, active_ms) values ($1, $2, $3, 1000)`, [uid, idOf(n), letra]);
const visao = (uid: string, n: number) => rpc<any>(uid, "practice_question_view", { p_question_id: idOf(n) });
const correcao = (uid: string, n: number, letra = "B") => rpc<any>(uid, "practice_correction_view", { p_question_id: idOf(n), p_selected: letra });
const tutor = async (n: number, estado: string) => (await sql(`select public.tutor_question_view($1, $2) as v`, [idOf(n), estado]))[0].v;
const chaves = (x: any) => Object.keys(x?.formatacao ?? {}).sort();

// ---------------------------------------------------------------- rascunho (Questão Inédita)
const DECISAO = "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";
const TRECHO = "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias como primeira escolha no tratamento.";
let seq = 0;
async function rascunho(over: Record<string, unknown> = {}) {
  seq += 1;
  const [s] = await sql(`insert into public.ch_sources (title, organ, kind, status, version, published_on, authority_level) values ($1, 'Ministério da Saúde (teste)', 'final', 'current', '2026', '2026-01-01', 'A') returning id`, [`PCDT ${seq}`]);
  const [p] = await sql(`insert into public.ch_source_passages (source_id, section, page, text) values ($1, 'Tratamento', 7, $2) returning id`, [s.id, TRECHO]);
  const cit = [{ passage_id: p.id, source_id: s.id, source: `PCDT ${seq}`, organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: "indica-se amoxicilina 90 mg/kg/dia por 10 dias", supports: DECISAO }];
  const row: Record<string, unknown> = {
    batch: "teste-013120", source_id: `q${seq}`, slot: seq, area: "PEDIATRIA", topic: "Otite média aguda",
    stem: `Quadro ${seq}: lactente com febre e otalgia há três dias, membrana timpânica abaulada. Qual a conduta inicial adequada?`,
    support_type: "NONE", support_rows: [],
    alternatives: { A: "Amoxicilina 90 mg/kg/dia por 10 dias.", B: "Observar por 48 horas.", C: "Azitromicina dose única.", D: "Ceftriaxona por 1 dia." },
    correct_answer: "A", explanation: "Em lactente com otite média aguda, indica-se amoxicilina.",
    alternative_explanations: { A: "Correta. É a conduta inicial.", B: "Incorreta. Não é a conduta.", C: "Incorreta. Não é a primeira escolha.", D: "Incorreta. Reservada para falha." },
    clinical_decision: DECISAO, update_application: "Aplicação da diretriz de 2026.", key_concepts: [], source_citations: cit, generated_by: "servidor", ...over,
  };
  const cols = Object.keys(row);
  const json = new Set(["support_rows", "alternatives", "alternative_explanations", "key_concepts", "source_citations", "formatacao"]);
  const [d] = await sql(`insert into public.draft_questions (${cols.join(", ")}) values (${cols.map((c, i) => `$${i + 1}${json.has(c) ? "::jsonb" : ""}`).join(", ")}) returning id`,
    cols.map((c) => (json.has(c) ? JSON.stringify(row[c]) : row[c])));
  return d.id as string;
}
const draft = async (id: string) => (await sql(`select * from public.draft_questions where id = $1`, [id]))[0];
/** As 4 conferências "pass" no texto atual e a aprovação do revisor (direto no banco, como se o revisor tivesse aprovado). */
async function aprovar(id: string) {
  const d = await draft(id);
  await sql(`delete from public.draft_checks where draft_id = $1`, [id]);
  for (const layer of ["software", "sources", "currency", "redteam"])
    await sql(`insert into public.draft_checks (draft_id, layer, verdict, content_hash, model) values ($1, $2, 'pass', $3, 'mock')`, [id, layer, d.content_hash]);
  await sql(`update public.draft_questions set status = 'approved', reviewed_hash = content_hash, reviewed_at = now() where id = $1`, [id]);
  return (await draft(id)).content_hash as string;
}
const salvarRascunho = async (id: string, content: Record<string, unknown>) => rpc<any>(EDITOR, "app_draft_question_save", { p_id: id, p_hash: (await draft(id)).content_hash, p_content: content });
const conferencias = async (id: string) => Number((await sql(`select count(*)::int as n from public.draft_checks where draft_id = $1`, [id]))[0].n);

// ---------------------------------------------------------------- estado de antes da 013120
const defs = async () =>
  Object.fromEntries(
    (await sql(`select p.proname, pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any ($1::text[])`, [REDEFINIDAS]))
      .map((r: any) => [r.proname, r.d])
  );
const regraEventos = async () => (await sql(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'draft_question_events_kind_check'`))[0].d;
let antes: { defs: Record<string, string>; regra: string; aluno: any; correcao: any; tutorAberta: any; tutorRespondida: any; hash: string; rascunhoAntigo: string };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(lerArquivo(path.join(ROOT, "supabase/tests/bootstrap.sql")));
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !f.startsWith("._") && f !== NOVA).sort()) await db.exec(lerArquivo(path.join(MIGRATIONS, f)));
  sql = sqlFor(db);
  rpc = rpcFor(db);
  await criarUsuarios(sql);
  // questão oficial antiga (sem formatação), respondida pelo ALUNO; rascunho antigo
  await sql(`select public.admin_upsert_question($1::jsonb, true)`, [JSON.stringify(oficial(1))]);
  await responder(ALUNO, 1);
  const rascunhoAntigo = await rascunho();
  antes = {
    defs: await defs(), regra: await regraEventos(),
    aluno: await visao(ALUNO, 1), correcao: await correcao(ALUNO, 1), tutorAberta: await tutor(1, "open"), tutorRespondida: await tutor(1, "answered"),
    hash: (await draft(rascunhoAntigo)).content_hash, rascunhoAntigo,
  };
}, 600_000);
afterAll(async () => {
  await db?.close();
});

describe("Ensaio da 013120: aplicar duas vezes, conferir; o antigo responde igual", () => {
  it("aplica duas vezes sem erro e o conferir dá tudo true", async () => {
    await aplicarNova();
    await aplicarNova();
    const linhas = await sql(lerArquivo(path.join(SQL_DIR, "013120-conferir.sql")));
    expect(linhas.length).toBe(9);
    expect(linhas.filter((l: any) => l.ok !== true).map((l: any) => l.item)).toEqual([]);
  });

  it("prova 4: questão e rascunho antigos sem formatação → resposta idêntica à de antes (aluno, correção, Tutor, hash)", async () => {
    expect(await visao(ALUNO, 1)).toEqual(antes.aluno);
    expect(await correcao(ALUNO, 1)).toEqual(antes.correcao);
    expect(await tutor(1, "open")).toEqual(antes.tutorAberta);
    expect(await tutor(1, "answered")).toEqual(antes.tutorRespondida);
    expect((await visao(ALUNO, 1)).formatacao).toBeUndefined();
    expect((await draft(antes.rascunhoAntigo)).content_hash).toBe(antes.hash);
    expect((await sql(`select public.draft_content_hash(d) as h from public.draft_questions d where id = $1`, [antes.rascunhoAntigo]))[0].h).toBe(antes.hash);
  });
});

describe("Questões oficiais", () => {
  let analise: string;
  beforeAll(async () => {
    await sql(`select public.admin_upsert_question($1::jsonb, true)`, [JSON.stringify(oficial(2))]);
    const [a] = await sql(
      `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis, reviewed_at, review_note)
       values ($1, 1, 'Análise feita para esta redação.', 'x', 'published', 'B', now(), 'Aprovada.') returning id`, [idOf(2)]);
    analise = a.id;
  });

  it("prova 1: salvar SÓ a formatação grava, não manda o comentário para revisão, não tira a análise do ar e registra só 'formatacao' na trilha", async () => {
    const r = await salvarOficial(EDITOR, 2, { formatacao: formatacaoOficial(2) });
    expect(Object.keys(r.formatacao).sort()).toEqual(Object.keys(formatacaoOficial(2)).sort());
    const q = await linha(2);
    expect(q.comment_review).toBeNull();
    expect(q.correct_option).toBe("B");
    expect((await sql(`select status from public.question_analysis where id = $1`, [analise]))[0].status).toBe("published");
    const trilha = await sql(`select changes, changed_by from public.question_change_log where question_id = $1 order by id`, [idOf(2)]);
    expect(trilha).toHaveLength(1);
    expect(Object.keys(trilha[0].changes)).toEqual(["formatacao"]);
    expect(trilha[0].changes.formatacao.campos).toHaveLength(11);
    expect(trilha[0].changed_by).toBe(EDITOR);
  });

  it("sem a chave no pedido mantém a formatação (importação); null apaga; forma inválida é recusada; o gabarito continua imutável", async () => {
    await sql(`select public.admin_upsert_question($1::jsonb, true)`, [JSON.stringify(oficial(2))]);
    expect(Object.keys((await linha(2)).formatacao)).toHaveLength(11);
    await expect(salvarOficial(EDITOR, 2, { formatacao: { statement: { f: "html", v: 1, doc: {} } } })).rejects.toThrow("Formatação inválida.");
    await expect(salvarOficial(EDITOR, 2, { formatacao: formatacaoOficial(2), correct_option: "C" })).rejects.toThrow(/Gabarito e situação de questão já gravada/);
    await salvarOficial(EDITOR, 2, { formatacao: null });
    expect((await linha(2)).formatacao).toBeNull();
    await salvarOficial(EDITOR, 2, { formatacao: formatacaoOficial(2) });
  });

  it("prova 2 (oficiais): mudar o TEXTO de uma explicação continua com a regra de sempre (vai para a trilha como texto)", async () => {
    const q = oficial(2);
    const options = q.options.map((o) => (o.id === "C" ? { ...o, explanation: "Incorreta. Texto novo da C." } : o));
    await salvarOficial(EDITOR, 2, { options, formatacao: formatacaoOficial(2) });
    const ultima = (await sql(`select changes from public.question_change_log where question_id = $1 order by id desc limit 1`, [idOf(2)]))[0];
    expect(Object.keys(ultima.changes)).toContain("options");
    // a formatação velha da explicação C não bate mais com o texto: fica guardada, mas o leitor do aluno a descarta (ricoValido)
    await salvarOficial(EDITOR, 2, { formatacao: formatacaoOficial(2) });
  });

  it("prova 3: antes de responder o aluno só recebe a formatação do enunciado e das alternativas; a correção, só depois", async () => {
    await salvarOficial(EDITOR, 2, { formatacao: formatacaoOficial(2) });
    const textos = ["opcao.A.texto", "opcao.B.texto", "opcao.C.texto", "opcao.D.texto", "statement"];
    expect(chaves(await visao(ALUNO2, 2))).toEqual(textos);
    expect(await correcao(ALUNO2, 2)).toBeNull(); // não respondeu: nada de gabarito, explicação nem formatação
    expect(chaves(await tutor(2, "open"))).toEqual(textos);
    expect(chaves(await tutor(2, "answered"))).toEqual(textos); // o Tutor nunca recebe a das explicações por aqui
    await responder(ALUNO2, 2);
    const c = await correcao(ALUNO2, 2);
    // a explicação da C teve o TEXTO mudado no teste anterior: está na revisão do comentário (Q09), então nem o texto nem a
    // formatação dela vão ao aluno até o revisor aprovar
    expect((await linha(2)).comment_review.campos).toContain("explanation_C");
    expect(chaves(c)).toEqual(["expected_conduct", "inep_intent", "opcao.A.explicacao", "opcao.A.texto", "opcao.B.explicacao", "opcao.B.texto",
      "opcao.C.texto", "opcao.D.explicacao", "opcao.D.texto", "statement"]);
    // o rico de cada campo bate com o texto que o aluno recebe (é o que o leitor confere)
    expect(c.formatacao["opcao.B.explicacao"].doc.content[0].content[0].text).toBe(c.explanation);
    expect(c.formatacao.expected_conduct.doc.content[0].content[0].text).toBe(c.expected_conduct);
  });

  it("prova 3: campos em revisão (question_hidden_fields) e questão anulada não levam a formatação das explicações", async () => {
    await sql(`update public.questions set explanations_review = '{"campos": ["explanation_B", "expected_conduct"], "de": "B", "para": "B"}'::jsonb where id = $1`, [idOf(2)]);
    const c = await correcao(ALUNO2, 2);
    expect(c.explanation).toBeNull();
    expect(chaves(c)).not.toContain("opcao.B.explicacao");
    expect(chaves(c)).not.toContain("expected_conduct");
    expect(chaves(c)).toContain("opcao.A.explicacao");
    await sql(`update public.questions set explanations_review = null, status = 'annulled' where id = $1`, [idOf(2)]);
    const anulada = await correcao(ALUNO2, 2);
    expect(chaves(anulada).filter((k) => k.endsWith(".explicacao"))).toEqual([]);
    expect(chaves(anulada)).toContain("statement");
    await sql(`update public.questions set status = 'valid' where id = $1`, [idOf(2)]);
  });

  it("fonte complementar citada na formatação é recusada (a mesma guarda do texto)", async () => {
    await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Apostila Gama Turbo de Pediatria', 'Curso Gama', 'final', 'E')`);
    const f = { ...formatacaoOficial(2), inep_intent: italico("Ver a Apostila Gama Turbo de Pediatria.") };
    await expect(salvarOficial(EDITOR, 2, { formatacao: f })).rejects.toThrow(/fonte complementar/);
  });

  it("o aluno não lê a coluna direto (sem grant): só pelas funções", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ALUNO })]);
      return tx.query(`select formatacao from public.questions limit 1`).then(() => "leu", (e) => String(e.message));
    });
    expect(r).toMatch(/permission denied/);
  });
});

describe("Questões Inéditas (rascunhos)", () => {
  it("prova 1: só formatação mantém aprovação, hash, conferências e propostas; evento 'formatada'", async () => {
    const id = await rascunho();
    const hash = await aprovar(id);
    const d = await draft(id);
    const r = await salvarRascunho(id, { formatacao: { stem: negrito(d.stem), "alt.A": negrito(d.alternatives.A), explanation: italico(d.explanation), update_application: negrito(d.update_application) } });
    expect(r).toMatchObject({ changed: true, so_formatacao: true, status: "approved", content_hash: hash });
    const depois = await draft(id);
    expect(depois).toMatchObject({ status: "approved", reviewed_hash: hash, content_hash: hash });
    expect(await conferencias(id)).toBe(4);
    expect(Object.keys(depois.formatacao).sort()).toEqual(["alt.A", "explanation", "stem", "update_application"]);
    const ev = await sql(`select kind, details from public.draft_question_events where draft_id = $1 and kind = 'formatada'`, [id]);
    expect(ev).toHaveLength(1);
    expect(ev[0].details.campos).toEqual(["alt.A", "explanation", "stem", "update_application"]);
    // salvar de novo igual: nada muda
    expect(await salvarRascunho(id, { formatacao: depois.formatacao })).toMatchObject({ changed: false });
  });

  it("prova 2: texto novo derruba (volta para revisão médica, conferências zeradas)", async () => {
    const id = await rascunho();
    await aprovar(id);
    const d = await draft(id);
    const r = await salvarRascunho(id, { stem: d.stem + " Mais um detalhe.", formatacao: { stem: negrito(d.stem + " Mais um detalhe.") } });
    expect(r).toMatchObject({ changed: true, so_formatacao: false, status: "awaiting_medical_review" });
    expect(await conferencias(id)).toBe(0);
  });

  it("prova 2: formatação que traz CONTEÚDO (nota) derruba e muda o hash", async () => {
    const id = await rascunho();
    const hash = await aprovar(id);
    const d = await draft(id);
    const r = await salvarRascunho(id, { formatacao: { clinical_decision: comNota(d.clinical_decision) } });
    expect(r).toMatchObject({ changed: true, so_formatacao: false, status: "awaiting_medical_review" });
    expect(r.content_hash).not.toBe(hash);
    expect(await conferencias(id)).toBe(0);
    const ev = await sql(`select details from public.draft_question_events where draft_id = $1 and kind = 'editada' order by id desc limit 1`, [id]);
    expect(ev[0].details.campos).toContain("formatacao");
  });

  it("forma inválida é recusada", async () => {
    const id = await rascunho();
    await expect(salvarRascunho(id, { formatacao: { stem: "<b>x</b>" } })).rejects.toThrow("Rascunho inválido: formatação.");
  });

  it("equilibrar o gabarito troca as letras da formatação junto com as alternativas", async () => {
    await rascunho(); // outro rascunho com gabarito A: a letra menos usada passa a ser B
    const id = await rascunho();
    const d = await draft(id);
    await salvarRascunho(id, { formatacao: { "alt.A": negrito(d.alternatives.A), "altexp.A": italico(d.alternative_explanations.A), "alt.C": negrito(d.alternatives.C) } });
    const r = await rpc<any>(EDITOR, "app_draft_balance_answer", { p_id: id, p_hash: (await draft(id)).content_hash });
    expect(r).toMatchObject({ from: "A", to: "B" });
    const depois = await draft(id);
    expect(depois.alternatives.B).toBe(d.alternatives.A);
    expect(Object.keys(depois.formatacao).sort()).toEqual(["alt.B", "alt.C", "altexp.B"]);
    expect(depois.formatacao["alt.B"].doc.content[0].content[0].text).toBe(depois.alternatives.B);
    expect(depois.formatacao["altexp.B"].doc.content[0].content[0].text).toBe(depois.alternative_explanations.B);
  });

  it("publicar leva a formatação nas chaves da questão; 'só formatação' na versão no ar chega ao aluno na hora", async () => {
    const id = await rascunho();
    let d = await draft(id);
    await salvarRascunho(id, {
      formatacao: { stem: negrito(d.stem), "alt.B": negrito(d.alternatives.B), explanation: italico(d.explanation), "altexp.A": negrito(d.alternative_explanations.A),
        "altexp.C": italico(d.alternative_explanations.C), clinical_decision: negrito(d.clinical_decision), update_application: negrito(d.update_application) },
    });
    const hash = await aprovar(id);
    const out = await rpc<any>(ADMIN, "app_staziamed_publish", { p_id: id, p_hash: hash });
    const q = (await sql(`select * from public.questions where id = $1`, [out.question_id]))[0];
    // a explicação da correta (A) é o comentário do professor; a aplicação da atualização não é publicada
    expect(Object.keys(q.formatacao).sort()).toEqual(["expected_conduct", "opcao.A.explicacao", "opcao.B.texto", "opcao.C.explicacao", "statement"]);
    expect(q.formatacao["opcao.A.explicacao"].doc.content[0].content[0].text).toBe(q.options.find((o: any) => o.id === "A").explanation);
    expect(q.formatacao.statement.doc.content[0].content[0].text).toBe(q.statement);
    expect(q.formatacao.expected_conduct.doc.content[0].content[0].text).toBe(q.expected_conduct);
    // só formatação depois de publicada: aprovação mantida e o aluno já vê
    d = await draft(id);
    const r = await salvarRascunho(id, { formatacao: { ...d.formatacao, "alt.D": negrito(d.alternatives.D) } });
    expect(r).toMatchObject({ so_formatacao: true, status: "approved" });
    expect(Object.keys((await sql(`select formatacao from public.questions where id = $1`, [out.question_id]))[0].formatacao)).toContain("opcao.D.texto");
    // e a visão do aluno (equipe abre qualquer inédita) traz só enunciado e alternativas
    expect(chaves(await rpc<any>(ADMIN, "practice_question_view", { p_question_id: out.question_id }))).toEqual(["opcao.B.texto", "opcao.D.texto", "statement"]);
  });
});

describe("Desfazer (013120-desfazer.sql)", () => {
  it("volta as funções e a regra dos eventos exatamente como antes, apaga as colunas, e o antigo responde igual", async () => {
    await db.exec(lerArquivo(path.join(SQL_DIR, "013120-desfazer.sql")));
    expect(await defs()).toEqual(antes.defs);
    expect(await regraEventos()).toBe(antes.regra);
    expect((await sql(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and column_name = 'formatacao' and table_name in ('questions', 'draft_questions')`))[0].n).toBe(0);
    expect((await sql(`select count(*)::int as n from public.draft_question_events where kind = 'formatada'`))[0].n).toBe(0);
    expect((await sql(`select count(*)::int as n from public.draft_questions d where d.content_hash is distinct from public.draft_content_hash(d)`))[0].n).toBe(0);
    expect(await visao(ALUNO, 1)).toEqual(antes.aluno);
    expect(await correcao(ALUNO, 1)).toEqual(antes.correcao);
    expect((await draft(antes.rascunhoAntigo)).content_hash).toBe(antes.hash);
  });
});
