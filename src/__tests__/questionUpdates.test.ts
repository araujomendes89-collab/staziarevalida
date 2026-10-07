// @vitest-environment node
/**
 * SQIE fase 4: do aviso de mudança ao cartão "gabarito da prova × conduta atual". Cenário de ponta a ponta com
 * FONTES E TEXTOS SINTÉTICOS (não há acervo oficial real) e provedor de IA simulado: nada aqui vale como conferência médica.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { compareSourceVersions } from "../../server/contentHub/sourceCompare";
import { reanalysisChecks, runQuestionReanalysis, type Proposal, type ReanalysisInput } from "../../server/contentHub/questionReanalysis";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie4-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const STUDENT = "00000000-0000-4000-8000-00000000000a";
const OTHER_STUDENT = "00000000-0000-4000-8000-00000000000b";
const REVIEWER = "00000000-0000-4000-8000-0000000000e1";
const OTHER_AREA_REVIEWER = "00000000-0000-4000-8000-0000000000e2";
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) => (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;

let q1: string, q3: string, claim1: string, claim3: string, official1: string, official3: string, v1: string, v2: string, area1: string;
let statement1: string;
const statement = async (id: string) => (await sql(`select statement from public.ch_claims where id = $1`, [id]))[0].statement as string;

async function publish(questionId: string, uid: string) {
  const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash, reviewed_at, temporal_status, reviewed_by)
    values ($1, 1, 'Pergunta de teste', 'published', 'modelo-de-teste', 'x', now(), 'REQUIRES_MEDICAL_REVIEW', $2) returning id`, [questionId, ADMIN]))[0];
  const off = (await sql(`select correct_option from public.questions where id = $1`, [questionId]))[0].correct_option;
  for (const id of ["A", "B", "C", "D"]) {
    await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning) values ($1, $2, $3, $4, $5, 'análise de teste')`, [a.id, questionId, id, id === off, id === off ? "CORRECT" : "WRONG"]);
  }
  await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status) values ($1, $2, 1, 'full', '{}'::jsonb, 'h', 'published')`, [questionId, a.id]);
  await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [uid, questionId]);
  return off as string;
}

// fonte monitorada e conferida agora (como o vigia faz): frescor em dia
const monitor = async (sourceId: string) => {
  await rpc(ADMIN, "app_ch_watch_source", sourceId, "https://exemplo.invalid/doc.pdf", 30);
  await db.service("ch_worker_watch_result", { p_source_id: sourceId, p_hash: "a".repeat(64), p_status: "ok" });
};
const link = (claimId: string, sourceId: string, passageId: string, quote: string) =>
  rpc(ADMIN, "app_ch_link_evidence", claimId, { source_id: sourceId, passage_id: passageId, quote, verdict: "compatible", page: 1 });

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 's@t.dev'), ($3, 's2@t.dev'), ($4, 'r@t.dev'), ($5, 'r2@t.dev')`, [ADMIN, STUDENT, OTHER_STUDENT, REVIEWER, OTHER_AREA_REVIEWER]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  const qs = (await sql(`select question_id from public.question_claims where role = 'solves' order by question_id limit 80`)).map((r) => r.question_id);
  q1 = qs[0];
  area1 = (await sql(`select public.question_area_code($1) a`, [q1]))[0].a;
  // q3: outra afirmação e OUTRA área, para provar que a revisão é por área
  q3 = (await Promise.all(qs.map(async (q) => ({ q, a: (await sql(`select public.question_area_code($1) a`, [q]))[0].a })))).find((x) => x.a !== area1)!.q;
  claim1 = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q1]))[0].claim_id;
  claim3 = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q3]))[0].claim_id;
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, $2), ($3, $4)`, [REVIEWER, area1, OTHER_AREA_REVIEWER, (await sql(`select public.question_area_code($1) a`, [q3]))[0].a]);
  official1 = await publish(q1, STUDENT);
  official3 = await publish(q3, STUDENT);
  statement1 = await statement(claim1);
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Selo 'Atualizada' (fonte sintética)", () => {
  it("sem evidência conferida por pessoa em fonte oficial vigente não há selo nem como confirmar a atualidade", async () => {
    expect((await rpc(STUDENT, "app_question_commentary", q1)).seal).toBeNull();
    await expect(rpc(REVIEWER, "app_question_confirm_currency", q1, "conferi tudo certinho aqui")).rejects.toThrow(/evidências conferidas por pessoa/);
  });

  it("com evidência conferida por pessoa: só o revisor DA ÁREA confirma, e o selo aparece com a data da conferência", async () => {
    v1 = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, published_on) values ('Documento SINTÉTICO fase 4', 'Órgão de teste', 'final', '1', 'A', '2025-01-01') returning id`))[0].id;
    const pass = async (text: string, page: number) => (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, $2, $3) returning id`, [v1, page, text]))[0].id as string;
    const s3 = await statement(claim3);
    const p1 = await pass(`${statement1} Dose habitual de 10 mg uma vez ao dia.`, 1);
    const p3 = await pass(`${s3} Conduta mantida sem alterações nesta seção do documento.`, 2);
    // evidência feita só pelo worker (sem pessoa) não basta
    await db.service("ch_worker_link_evidence", { p_claim_id: claim1, p_evidence: { source_id: v1, passage_id: p1, quote: statement1, verdict: "compatible", model: "teste" } });
    expect((await sql(`select public.question_evidence_ready($1) r`, [q1]))[0].r).toBe(false);
    await link(claim1, v1, p1, statement1);
    await link(claim3, v1, p3, s3);
    await monitor(v1); // sem monitoramento a fonte é "não monitorada" e o selo não existe
    expect((await sql(`select public.question_evidence_ready($1) r`, [q1]))[0].r).toBe(true);
    await expect(rpc(OTHER_AREA_REVIEWER, "app_question_confirm_currency", q1, "conferi tudo certinho aqui")).rejects.toThrow(/revisor cadastrado na área/);
    await expect(rpc(STUDENT, "app_question_confirm_currency", q1, "conferi tudo certinho aqui")).rejects.toThrow();
    await expect(rpc(REVIEWER, "app_question_confirm_currency", q1, "curto")).rejects.toThrow(/pelo menos 10/);
    expect(await rpc(REVIEWER, "app_question_confirm_currency", q1, "Conferi a afirmação com o documento oficial v1.")).toBe(true);
    expect(await rpc(OTHER_AREA_REVIEWER, "app_question_confirm_currency", q3, "Conferi a afirmação com o documento oficial v1.")).toBe(true);
    const c = await rpc(STUDENT, "app_question_commentary", q1);
    expect(c).toMatchObject({ seal: "UPDATED", temporal_status: "CURRENT", update_in_review: false, update_card: null });
    expect(c.seal_checked_at).not.toBeNull();
  });
});

describe("Mudança de fonte → reanálise seletiva → proposta", () => {
  it("nova versão cadastrada e comparada: o selo some nas duas questões e a fila ganha triagem", async () => {
    v2 = (await rpc(ADMIN, "app_ch_register_source", { title: "Documento SINTÉTICO fase 4", organ: "Órgão de teste", kind: "final", version: "2" })).id;
    await rpc(ADMIN, "app_ch_set_source_authority", v2, "A"); // como no painel: o nível é informado ao cadastrar
    const s3 = await statement(claim3);
    await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2), ($1, 2, $3)`, [v2, `${statement1} Dose habitual de 20 mg uma vez ao dia.`, `${s3} Conduta mantida sem alterações nesta seção do documento.`]);
    await compareSourceVersions(db, v1, v2);
    for (const q of [q1, q3]) expect((await rpc(STUDENT, "app_question_commentary", q)).seal).toBeNull();
    const rows = await sql(`select question_id, impact_level, triage_kind, critical from public.question_updates where old_source_id = $1`, [v1]);
    expect(rows.filter((r) => r.question_id === q1).every((r) => r.impact_level === "UNDETERMINED" && r.triage_kind === "NUMERIC" && r.critical)).toBe(true);
    expect(rows.filter((r) => r.question_id === q3).every((r) => r.impact_level === "NO_IMPACT")).toBe(true);
    expect((await rpc(STUDENT, "app_question_commentary", q1)).update_in_review).toBe(true);
  });

  it("estimativa não grava nem envia; só a questão com mudança relevante é reanalisada (trecho igual não gasta IA)", async () => {
    const dry = await runQuestionReanalysis({ db }, { dryRun: true });
    expect(dry.considered).toBe(1);
    expect(dry.estimate?.calls).toBe(1);
    expect(await sql(`select 1 from public.question_updates where proposal is not null`)).toHaveLength(0);
    process.env.CONTENT_HUB_AI_PROVIDER_CREATE = "anthropic";
    const blocked = await runQuestionReanalysis({ db });
    expect(blocked.saved).toBe(0);
    expect(blocked.pending).toBeTruthy();
  });

  const other = (a: string) => ["A", "B", "C", "D"].find((x) => x !== a)!;
  let seenInput = "";

  it("proposta com citação exata e resposta atual diferente fica guardada, marcada como simulação, sem mudar nada para o aluno", async () => {
    process.env.CONTENT_HUB_AI_PROVIDER_CREATE = "mock";
    const quote = "Dose habitual de 20 mg uma vez ao dia";
    const respond = (req: { input: string }): Proposal => {
      seenInput = req.input;
      return {
        assessment: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT",
        impact_level: "CURRENT_ANSWER_CHANGED",
        current_answer: other(official1),
        what_changed: "A dose habitual do documento passou de 10 mg para 20 mg uma vez ao dia.",
        why_it_matters: "A alternativa que reproduzia a dose anterior deixa de ser a conduta atual.",
        options_affected: [{ option_id: official1, note: "A dose citada nesta alternativa mudou na versão nova." }],
        citations: [{ ref: "M1.novo", quote }, { ref: "M1.antigo", quote: "Dose habitual de 10 mg uma vez ao dia" }],
        confidence: 70,
      };
    };
    const r = await runQuestionReanalysis({ db, mockRespond: respond });
    expect(r).toMatchObject({ considered: 1, saved: 1, verdicts: { pass: 1 } });
    expect(seenInput).toContain("<documento>");
    expect(seenInput).toContain("M1.novo");
    const u = (await sql(`select proposal, proposal_checks, proposal_model, status, impact_level, current_answer from public.question_updates where question_id = $1 and proposal is not null`, [q1]))[0];
    expect(u.proposal).toMatchObject({ assessment: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT", simulated: true });
    expect(u.proposal_model).toMatch(/simula/i);
    expect(u).toMatchObject({ status: "review_required", impact_level: "UNDETERMINED", current_answer: null });
    // para o aluno nada mudou: segue o gabarito histórico, sem cartão e sem resposta atual
    const c = await rpc(STUDENT, "app_question_commentary", q1);
    expect(c).toMatchObject({ update_card: null, current_best_answer: null, seal: null, update_in_review: true });
    // reexecutar não reanalisa de novo (já tem proposta)
    expect((await runQuestionReanalysis({ db }, { dryRun: true })).considered).toBe(0);
  });

  it("conferência por software barra proposta que contesta o gabarito, inventa número, cita fora do texto ou dá resposta sem citar o trecho novo", () => {
    const q = { question_id: "q", exam_id: "e", number: 1, area: "x", statement: "Enunciado com 5 dias.", correct_option: "B", options: [], official: { answer: "B", status: "FINAL", source: null }, analysis: null,
      changes: [{ update_id: "u", claim: "Afirmação", kind: "NUMERIC", critical: true, old_source: null, new_source: null, old_text: "Usar 10 mg por dia.", new_text: "Usar 20 mg por dia." }] } as ReanalysisInput;
    const base: Proposal = { assessment: "UPDATED_BUT_SAME_ANSWER", impact_level: "COMMENT_ONLY", current_answer: "NONE", what_changed: "A dose passou de 10 mg para 20 mg por dia na nova versão.", why_it_matters: "", options_affected: [], citations: [{ ref: "M1.novo", quote: "Usar 20 mg por dia." }], confidence: 80 };
    const codes = (p: Proposal) => reanalysisChecks(q, p).map((f) => f.code);
    expect(codes(base)).toEqual([]);
    expect(codes({ ...base, what_changed: "A dose passou de 10 mg para 40 mg por dia na nova versão." })).toContain("numbers_not_in_sources");
    expect(codes({ ...base, citations: [{ ref: "M1.novo", quote: "Usar 30 mg por dia." }] })).toContain("citation_not_exact");
    expect(codes({ ...base, citations: [{ ref: "M9.novo", quote: "Usar 20 mg por dia." }] })).toContain("citation_unknown_ref");
    expect(codes({ ...base, why_it_matters: "O gabarito oficial está errado nesta questão." })).toContain("challenges_official_answer");
    expect(codes({ ...base, assessment: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT", current_answer: "C", citations: [{ ref: "M1.antigo", quote: "Usar 10 mg por dia." }] })).toContain("answer_without_new_citation");
    expect(codes({ ...base, assessment: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT", current_answer: "B" })).toContain("differs_without_other_answer");
    expect(codes({ ...base, assessment: "INCONCLUSIVE", current_answer: "C" })).toContain("inconclusive_with_answer");
    expect(codes({ ...base, assessment: "CURRENTLY_AMBIGUOUS", current_answer: "C" })).toContain("no_option_with_answer");
  });
});

describe("Decisão do revisor e cartão para o aluno", () => {
  const card = () => ({ temporal_status: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT", impact_level: "CURRENT_ANSWER_CHANGED", current_answer: ["A", "B", "C", "D"].find((x) => x !== official1), what_changed: "A dose habitual passou de 10 mg para 20 mg uma vez ao dia na versão 2 do documento.", why_it_matters: "A conduta da prova mudou.", options_affected: [{ option_id: official1, note: "Dose desatualizada." }], effective_date: "2025-06-01" });
  let updateId: string;

  it("fila de revisão mostra proposta, trechos antigo e novo e se a evidência está pronta; aluno não vê", async () => {
    const queue = await rpc(REVIEWER, "app_question_updates_queue", "review_required", 30, 0);
    const item = queue.find((x: any) => x.question_id === q1);
    updateId = item.id;
    expect(item).toMatchObject({ critical: true, triage_kind: "NUMERIC", evidence_ready: false, official_answer: official1 });
    expect(item.old_text).toContain("10 mg");
    expect(item.new_text).toContain("20 mg");
    expect(item.proposal.assessment).toBe("OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT");
    expect(item.proposal_checks.verdict).toBe("pass");
    await expect(rpc(STUDENT, "app_question_updates_queue", "review_required", 30, 0)).rejects.toThrow(/restrito/);
  });

  it("sem evidência conferida na versão nova ninguém publica; revisor de outra área nunca decide; aluno nunca", async () => {
    await expect(rpc(REVIEWER, "app_question_update_decide", updateId, "publish_update", "Conferi a nova versão.", card())).rejects.toThrow(/Confira primeiro as evidências/);
    await expect(rpc(OTHER_AREA_REVIEWER, "app_question_update_decide", updateId, "no_change", "Conferi a nova versão toda.", null)).rejects.toThrow(/revisor cadastrado na área/);
    await expect(rpc(STUDENT, "app_question_update_decide", updateId, "no_change", "Conferi a nova versão toda.", null)).rejects.toThrow();
  });

  it("rejeitar a proposta exige motivo, limpa a proposta e devolve a atualização para reanálise", async () => {
    await expect(rpc(REVIEWER, "app_question_update_decide", updateId, "reject_proposal", "curto", null)).rejects.toThrow(/pelo menos 10/);
    expect((await rpc(REVIEWER, "app_question_update_decide", updateId, "reject_proposal", "A proposta não cita a tabela do documento.", null)).status).toBe("queued");
    expect((await sql(`select proposal, status, decision from public.question_updates where id = $1`, [updateId]))[0]).toEqual({ proposal: null, status: "queued", decision: "reject_proposal" });
    expect((await runQuestionReanalysis({ db }, { dryRun: true })).considered).toBe(1);
    // reanálise usa a função engenharia reversa da Central de IAs e grava o modelo de quem respondeu
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "engenharia_reversa", p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-reanalise-teste" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    const { invalidateAiConfig } = await import("../../server/ai/config");
    invalidateAiConfig(db);
    const seen: string[] = [];
    const aiMaker = (ref: { provider: string; model: string }) =>
      ({
        name: ref.provider,
        model: ref.model,
        isMock: false,
        async generate() {
          seen.push(`${ref.provider}:${ref.model}`);
          return { output: { assessment: "INCONCLUSIVE", impact_level: "MAJOR_CHANGE", current_answer: "NONE", what_changed: "A dose do documento mudou, mas os trechos não bastam para concluir.", why_it_matters: "", options_affected: [], citations: [], confidence: 30 }, provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
        },
      }) as any;
    // teto de gasto atingido: a reanálise para com a mensagem do teto (sem marcar falha) e nada é gravado
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "anthropic", p_model: "claude-reanalise-teste", p_price: { input_per_mtok: 100, output_per_mtok: 200 } });
    await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { caps_enabled: true, monthly_cap_usd: 1000, per_run_cap_usd: 0.01 } });
    invalidateAiConfig(db);
    const capped = await runQuestionReanalysis({ db, aiMaker });
    expect(capped).toMatchObject({ considered: 1, saved: 0, skipped: 0 });
    expect(capped.pending).toMatch(/teto por execução de US\$ 0,01/);
    expect(seen).toEqual([]);
    await db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: { caps_enabled: false } });
    invalidateAiConfig(db);
    const again = await runQuestionReanalysis({ db, aiMaker });
    expect(again.saved).toBe(1);
    expect(seen).toEqual(["anthropic:claude-reanalise-teste"]);
    expect((await sql(`select proposal_model m from public.question_updates where id = $1`, [updateId]))[0].m).toBe("claude-reanalise-teste");
  });

  it("evidência conferida por pessoa na versão nova libera: cartão publicado, análise com a conduta atual, gabarito histórico intacto", async () => {
    const s = await statement(claim1);
    const p = (await sql(`select id, text from public.ch_source_passages where source_id = $1 and text like '%20 mg%'`, [v2]))[0];
    await link(claim1, v2, p.id, s);
    // a evidência do outro claim (q3, outra área) continua sem versão nova: não atrapalha q1
    expect((await sql(`select public.question_evidence_ready($1) r`, [q1]))[0].r).toBe(true);
    await expect(rpc(REVIEWER, "app_question_update_decide", updateId, "publish_update", "Conferi a nova versão.", { ...card(), current_answer: official1 })).rejects.toThrow(/diferente da oficial/);
    await expect(rpc(REVIEWER, "app_question_update_decide", updateId, "publish_update", "Conferi a nova versão.", { ...card(), temporal_status: "inventado" })).rejects.toThrow(/inválida/);
    const r = await rpc(REVIEWER, "app_question_update_decide", updateId, "publish_update", "Conferi a nova versão do documento oficial.", card());
    expect(r).toMatchObject({ status: "reviewed", temporal_status: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT" });
    // outras atualizações abertas da mesma questão? (uma por afirmação: só há uma)
    expect(r.open_updates).toBe(0);
    const a = (await sql(`select temporal_status, current_best_answer from public.question_analysis where question_id = $1 and is_current`, [q1]))[0];
    expect(a).toEqual({ temporal_status: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT", current_best_answer: card().current_answer });
    // Regra 102: o gabarito oficial da prova NÃO mudou
    expect((await sql(`select correct_option from public.questions where id = $1`, [q1]))[0].correct_option).toBe(official1);
    expect((await sql(`select answer, version from public.question_official_answers where question_id = $1 and is_current`, [q1]))[0]).toMatchObject({ answer: official1 });
  });

  it("o aluno vê o gabarito da prova e a conduta atual separados, com fonte, versão e data; sem selo 'Atualizada' de conduta antiga", async () => {
    const c = await rpc(STUDENT, "app_question_commentary", q1);
    expect(c.official_answer).toBe(official1);
    expect(c.update_card).toMatchObject({ version: 1, temporal_status: "OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT", official_answer: official1, current_answer: card().current_answer, effective_date: "2025-06-01" });
    expect(c.update_card.what_changed).toContain("20 mg");
    expect(c.update_card.sources).toEqual([expect.objectContaining({ title: "Documento SINTÉTICO fase 4", version: "2", organ: "Órgão de teste" })]);
    expect(c.update_card.verified_at).toBeTruthy();
    expect(c.update_in_review).toBe(false);
    expect(c.seal).toBeNull(); // a conduta mudou: não é "mesma resposta atualizada"
    // quem não respondeu a questão não recebe nada
    expect(await rpc(OTHER_STUDENT, "app_question_commentary", q1)).toBeNull();
    expect(await rpc(OTHER_STUDENT, "app_question_timeline", q1)).toEqual([]);
  });

  it("cartão publicado é histórico: não se edita nem se apaga; nova decisão cria a versão 2 e substitui a 1", async () => {
    await expect(sql(`update public.question_update_cards set what_changed = 'reescrito por fora do processo normal' where question_id = $1`, [q1])).rejects.toThrow(/não muda/);
    await expect(sql(`delete from public.question_update_cards where question_id = $1`, [q1])).rejects.toThrow(/não são apagados/);
    // a fonte muda de novo (v3): a questão volta à fila e o cartão v1 segue visível, avisando que há atualização em revisão
    const v3 = (await rpc(ADMIN, "app_ch_register_source", { title: "Documento SINTÉTICO fase 4", organ: "Órgão de teste", kind: "final", version: "3" })).id;
    await rpc(ADMIN, "app_ch_set_source_authority", v3, "A");
    const s = await statement(claim1);
    await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2)`, [v3, `${s} Dose habitual de 30 mg uma vez ao dia.`]);
    await compareSourceVersions(db, v2, v3);
    const c = await rpc(STUDENT, "app_question_commentary", q1);
    expect(c).toMatchObject({ update_in_review: true, temporal_status: "REQUIRES_MEDICAL_REVIEW", seal: null });
    expect(c.update_card.version).toBe(1);
    const p = (await sql(`select id from public.ch_source_passages where source_id = $1`, [v3]))[0].id;
    await link(claim1, v3, p, s);
    const open = (await rpc(REVIEWER, "app_question_updates_queue", "review_required", 30, 0)).find((x: any) => x.question_id === q1);
    await rpc(REVIEWER, "app_question_update_decide", open.id, "publish_update", "Conferi a versão 3 do documento oficial.", { ...card(), what_changed: "A dose habitual passou de 20 mg para 30 mg uma vez ao dia na versão 3 do documento." });
    const cards = await sql(`select version, status from public.question_update_cards where question_id = $1 order by version`, [q1]);
    expect(cards).toEqual([{ version: 1, status: "superseded" }, { version: 2, status: "published" }]);
    expect((await rpc(STUDENT, "app_question_commentary", q1)).update_card.version).toBe(2);
  });

  it("'sem mudança': a nova versão confirma a mesma conduta → atualidade conferida, selo volta e nenhum cartão é criado", async () => {
    const s3 = await statement(claim3);
    const p = (await sql(`select id from public.ch_source_passages where source_id = $1 and text like $2`, [v2, `${s3.slice(0, 30)}%`]))[0].id;
    // q3 está sem evidência na versão vigente (v3 não tem o trecho dela): primeiro precisa reconferir
    const open = (await rpc(OTHER_AREA_REVIEWER, "app_question_updates_queue", "review_required", 30, 0)).find((x: any) => x.question_id === q3);
    expect(open).toBeTruthy();
    await expect(rpc(OTHER_AREA_REVIEWER, "app_question_update_decide", open.id, "no_change", "O trecho está igual na nova versão.", null)).rejects.toThrow(/Confira primeiro/);
    const cur = (await sql(`select id from public.ch_sources where title = 'Documento SINTÉTICO fase 4' and status = 'current'`))[0].id;
    const np = (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 2, $2) returning id`, [cur, `${s3} Conduta mantida sem alterações nesta seção do documento.`]))[0].id;
    void p;
    await link(claim3, cur, np, s3);
    await monitor(cur);
    const r = await rpc(OTHER_AREA_REVIEWER, "app_question_update_decide", open.id, "no_change", "O trecho está igual na nova versão do documento.", null);
    expect(r).toMatchObject({ status: "reviewed", temporal_status: "UPDATED_BUT_SAME_ANSWER", card_id: null });
    expect((await sql(`select count(*)::int n from public.question_update_cards where question_id = $1`, [q3]))[0].n).toBe(0);
    const c = await rpc(STUDENT, "app_question_commentary", q3);
    expect(c).toMatchObject({ seal: "UPDATED", temporal_status: "UPDATED_BUT_SAME_ANSWER", update_card: null, update_in_review: false });
    await expect(rpc(OTHER_AREA_REVIEWER, "app_question_update_decide", open.id, "no_change", "Decidindo de novo a mesma coisa.", null)).rejects.toThrow(/já foi decidida/);
  });
});

describe("Linha do tempo e painel", () => {
  it("aluno vê só o público (gabarito oficial, análise publicada, cartões); a equipe vê também os alertas de mudança", async () => {
    const student = await rpc(STUDENT, "app_question_timeline", q1);
    const types = student.map((e: any) => e.type);
    expect(types).toContain("OFFICIAL_ANSWER");
    expect(types).toContain("ANALYSIS_PUBLISHED");
    expect(types.filter((t: string) => t === "UPDATE_CARD")).toHaveLength(2);
    expect(types).not.toContain("SOURCE_CHANGE_DETECTED");
    expect(student.find((e: any) => e.type === "OFFICIAL_ANSWER")).toMatchObject({ answer: official1, version: 1 });
    expect(student.filter((e: any) => e.type === "UPDATE_CARD").map((e: any) => [e.version, e.superseded])).toEqual([[1, true], [2, false]]);
    const dates = student.map((e: any) => e.at);
    expect([...dates].sort()).toEqual(dates);
    const staff = await rpc(REVIEWER, "app_question_timeline", q1);
    expect(staff.map((e: any) => e.type)).toContain("SOURCE_CHANGE_DETECTED");
  });

  it("painel: cartões publicados e propostas aguardando revisão", async () => {
    const s = await rpc(ADMIN, "app_question_update_summary");
    expect(s.cards_published).toBe(1);
    expect(s.with_proposal).toBeGreaterThanOrEqual(0);
    expect(s.by_status.reviewed).toBeGreaterThan(0);
  });
});
