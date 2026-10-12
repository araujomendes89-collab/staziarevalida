// @vitest-environment node
/**
 * Pedir a IA pela tela (migração 9810), lado do processamento (Cloud Run): o worker roda só as questões/rascunhos do pedido, com
 * IA FALSA (simulação ou provedor de teste, sem rede), grava rascunhos, gasto e andamento, e nunca publica nem aprova nada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { MockProvider, type StructuredRequest } from "../../server/contentHub/ai/provider";
import { createContentHubWorker } from "../../server/contentHub/worker";
import type { PipelineDeps } from "../../server/contentHub/pipeline";
import { invalidateAiConfig } from "../../server/ai/config";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "analise-ia-worker-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  return (await as(ADMIN, (q) => q(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) r`, keys.map((k) => args[k]))))[0].r;
};

const opt = (id: string, over = {}) => ({
  option_id: id, is_official_correct: id === "A", distractor_kind: id === "A" ? "CORRECT" : "WRONG",
  reasoning: "A amoxicilina é a primeira escolha em lactente com otite média aguda e sem alergia a antibióticos.",
  why_plausible: "É uma conduta usada em quadros infecciosos de via aérea.",
  why_wrong: "Não é a conduta inicial recomendada para este lactente com otite média aguda.",
  when_correct: "Seria considerada em outro cenário clínico, com outra indicação.",
  concept_difference: "A escolha depende da idade e da gravidade do quadro.",
  error_types: id === "A" ? [] : ["WRONG_TREATMENT"], trap: "Escolher pela familiaridade do nome do medicamento.", quality: 3, ...over,
});
// a IA falsa devolve uma análise coerente com o gabarito oficial que recebe
const respond = (req: StructuredRequest): unknown => {
  const doc = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
  if (req.promptId === "solve") return { answer: doc.alternativas ? "A" : "A", certainty: "high", rationale: "simulação", ambiguity: "" };
  if (req.promptId === "redteam") return { issues: [{ severity: "minor", kind: "wording", where: "enunciado", detail: "Conferir a redação.", basis: "inconsistency" }] };
  const official = doc.gabarito_oficial as string;
  return {
    question_core: "Reconhecer o quadro e indicar a conduta de primeira escolha.",
    key_data: [{ text: "Lactente de 8 meses", role: "CRITICAL" }, { text: "Febre há 3 dias", role: "SUPPORTIVE" }],
    reasoning_types: ["tratamento_inicial"], difficulty: 2,
    difficulty_components: { reasoning_steps: 2, rarity: "low", distractor_similarity: "medium", integration: "low", specific_guideline: false, therapeutic_complexity: "low" },
    trap: "Tratar apenas os sintomas sem reconhecer a indicação.", golden_rule: "Reconhecer o quadro e tratar sem esperar.",
    pedagogy: { teaches: "Primeira escolha.", why_important: "Conduta frequente.", cognitive_error: "Fechamento precoce.", review_if_wrong: "Rever o tema." },
    guideline_dependency: { depends: false, topics: [] },
    options: ["A", "B", "C", "D"].map((id) => opt(id, { is_official_correct: id === official, distractor_kind: id === official ? "CORRECT" : "WRONG", error_types: id === official ? [] : ["WRONG_TREATMENT"], reasoning: `Alternativa ${id}: análise simulada do raciocínio clínico para esta questão de teste.` })),
  };
};

const seen: string[] = [];
const aiMaker = (ref: { provider: string; model: string }) =>
  ({
    name: ref.provider, model: ref.model, isMock: false,
    async generate(req: StructuredRequest) {
      seen.push(`${ref.provider}:${ref.model}:${req.promptId}`);
      return { output: respond(req), provider: ref.provider, model: ref.model, inputTokens: 1000, outputTokens: 2000, latencyMs: 1, costUsd: null };
    },
  }) as any;
const realDeps = (): PipelineDeps => ({ db, storage: null, ai: { provider: null, status: { ready: false } }, renderer: null, aiMaker }) as unknown as PipelineDeps;
const mockDeps = (): PipelineDeps => {
  const provider = new MockProvider(respond);
  return { db, storage: null, ai: { provider, status: { ready: true, provider: "mock", model: provider.model, isMock: true, pending: null } }, renderer: null } as unknown as PipelineDeps;
};
const drain = (deps: PipelineDeps) => createContentHubWorker(deps).drain();
const requestRow = async (id: string) => (await sql(`select * from public.ch_ai_requests where id = $1`, [id]))[0];

async function configureAi() {
  for (const id of ["anthropic", "openai"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
  const save = (key: string, primary: object, fallback: object | null = null) =>
    db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: key, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: fallback, reviewers: [], care: "caprichado" } });
  await save("engenharia_reversa", { provider: "anthropic", model: "claude-opus-5-5" }, { provider: "openai", model: "gpt-6.1-sol" });
  await save("verificacao", { provider: "openai", model: "gpt-6.1-sol" });
  for (const [provider, model, i, o] of [["anthropic", "claude-opus-5-5", 4, 20], ["openai", "gpt-6.1-sol", 2, 10]] as const)
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: provider, p_model: model, p_price: { input_per_mtok: i, output_per_mtok: o } });
  invalidateAiConfig(db);
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev')`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await configureAi();
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Worker: análise de questões pedida pela tela", () => {
  it("IA falsa gera só as questões do pedido como rascunho, conferidas por regras, e registra o gasto na Central de IAs", async () => {
    const r = await rpc("app_ch_question_analysis_request", { p_exam: "revalida-2021", p_count: 3 });
    const before = await requestRow(r.id);
    const gabaritos = await sql(`select id, correct_option from public.questions where id = any ($1)`, [before.target_ids]);
    expect(await drain(realDeps())).toBe(1);
    const row = await requestRow(r.id);
    expect(row).toMatchObject({ status: "concluido", done_count: 3, calls: 3, message: null });
    expect(Number(row.cost_usd)).toBeGreaterThan(0); // 1.000 de entrada e 2.000 de saída por chamada, pelo preço da tabela
    expect(row.summary.verdicts).toEqual({ pass: 3 });
    // só as questões do pedido, com o gabarito oficial intacto
    const analyses = await sql(`select question_id, status, official_answer_at_analysis oa from public.question_analysis where is_current`);
    expect(analyses.map((a) => a.question_id).sort()).toEqual([...before.target_ids].sort());
    for (const a of analyses) {
      expect(a.status).toBe("checked");
      expect(a.oa).toBe(gabaritos.find((g) => g.id === a.question_id)!.correct_option);
    }
    expect((await sql(`select count(*)::int n from public.questions q join public.question_official_answers o on o.question_id = q.id and o.is_current where o.answer_status <> 'ANNULLED' and o.answer is distinct from q.correct_option`))[0].n).toBe(0);
    // nada publicado
    expect((await sql(`select count(*)::int n from public.question_comments where status = 'published'`))[0].n).toBe(0);
    expect((await sql(`select count(*)::int n from public.question_analysis where status in ('published', 'reviewed')`))[0].n).toBe(0);
    // gasto na Central de IAs, com a origem e a função certas
    const calls = await sql(`select function_key, source, provider, model, outcome, cost_usd from public.ai_calls where function_key = 'engenharia_reversa'`);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({ source: "analise", provider: "anthropic", model: "claude-opus-5-5", outcome: "ok" });
    expect(calls.reduce((a, c) => a + Number(c.cost_usd), 0)).toBeCloseTo(Number(row.cost_usd), 4);
    // 1.000 × 4 + 2.000 × 20 por milhão = US$ 0,044 por chamada
    expect(Number(calls[0].cost_usd)).toBeCloseTo(0.044, 4);
    // a tarefa e o registro da Administração
    expect((await sql(`select status from public.ch_jobs where id = $1`, [before.job_id]))[0].status).toBe("succeeded");
    expect((await sql(`select details from public.ch_audit where action = 'question_analysis.result' and target = $1`, [r.id]))[0].details).toMatchObject({ status: "concluido", done: 3 });
    // as análises aparecem na lista "Para revisar" que a aba já usa
    const list = await rpc("app_question_analyses", { p_status: "checked", p_exam: "revalida-2021" });
    expect(list.total).toBe(3);
  });

  it("pedido repetido depois de concluído não refaz nem paga de novo; as já analisadas não entram em novo pedido 'só sem análise'", async () => {
    const callsBefore = seen.length;
    const r = await rpc("app_ch_question_analysis_request", { p_exam: "revalida-2021", p_count: 3 });
    const row = await requestRow(r.id);
    // novas três questões (as 3 primeiras já têm análise do conteúdo atual)
    const done = await sql(`select question_id from public.question_analysis`);
    expect(row.target_ids.some((id: string) => done.some((d) => d.question_id === id))).toBe(false);
    await drain(realDeps());
    expect(seen.length - callsBefore).toBe(3);
  });

  it("IA desligada: o pedido fica pendente com o motivo, a tarefa espera sem gastar tentativa, e termina quando a IA volta", async () => {
    const r = await rpc("app_ch_question_analysis_request", { p_exam: "revalida-2022-1", p_count: 2 });
    // desligada DEPOIS do pedido (o pedido em si recusaria antes)
    await sql(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    const job = (await requestRow(r.id)).job_id;
    const n = seen.length;
    await drain(realDeps());
    expect(await requestRow(r.id)).toMatchObject({ status: "pendente", done_count: 0 });
    expect((await requestRow(r.id)).message).toMatch(/IA desligada/);
    expect(seen.length).toBe(n);
    expect((await sql(`select status, attempts from public.ch_jobs where id = $1`, [job]))[0]).toEqual({ status: "blocked", attempts: 0 });
    // ainda pode ser cancelado nesta situação; aqui segue: liga e destrava
    await sql(`update public.ch_flags set value = true where key = 'ai_enabled'`);
    await db.service("ch_worker_unblock");
    await drain(realDeps());
    expect(await requestRow(r.id)).toMatchObject({ status: "concluido", done_count: 2 });
  });

  it("parada de segurança: gasto acima do teto do pedido interrompe o processamento e avisa em português", async () => {
    const r = await rpc("app_ch_question_analysis_request", { p_exam: "revalida-2022-2", p_count: 5 });
    await sql(`update public.ch_ai_requests set ceiling_usd = 0.05 where id = $1`, [r.id]); // cada chamada custa US$ 0,044
    await drain(realDeps());
    const row = await requestRow(r.id);
    expect(row.status).toBe("concluido");
    expect(row.done_count).toBe(2);
    expect(row.message).toMatch(/Parada de segurança.*passou do limite deste pedido/);
    expect((await sql(`select count(*)::int n from public.question_comments where status = 'published'`))[0].n).toBe(0);
  });

  it("com a simulação (desenvolvimento) o worker também roda; a análise fica marcada como simulada e não pode ser publicada", async () => {
    const r = await rpc("app_ch_question_analysis_request", { p_exam: "revalida-2023-1", p_count: 1 });
    await drain(mockDeps());
    expect(await requestRow(r.id)).toMatchObject({ status: "concluido", done_count: 1 });
    const m = (await sql(`select a.generated_by_model m from public.question_analysis a join public.questions q on q.id = a.question_id where q.exam_id = 'revalida-2023-1'`))[0].m;
    expect(m).toMatch(/^mock/);
  });
});

describe("Worker: conferência dos rascunhos pedida pela tela", () => {
  const ids: string[] = [];
  beforeAll(async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await sql(
        `insert into public.draft_questions (batch, source_id, slot, area, stem, alternatives, correct_answer, explanation, alternative_explanations, source_citations, clinical_decision, content_hash, model, ai_review)
         values ('lote_w', $1, $2, 'PEDIATRIA', $3, '{"A":"Amoxicilina por 10 dias.","B":"Observar sem antibiótico.","C":"Azitromicina em dose única.","D":"Ceftriaxona por 1 dia."}'::jsonb, 'A', 'Amoxicilina é a conduta inicial.',
                 '{"A":"Correta. Conduta inicial.","B":"Incorreta. Não é a conduta.","C":"Incorreta. Não é a primeira escolha.","D":"Incorreta. Reservada para falha."}'::jsonb,
                 '[{"source_file":"Apostila de curso.pdf","supported_claim":"Amoxicilina na otite."}]'::jsonb, 'Tratar a otite média aguda do lactente com amoxicilina.', $4, 'gpt-5.6-luna', '{"status":"APPROVED_FOR_PDF"}'::jsonb) returning id`,
        [`w${i}`, i, `Lactente com otite média aguda número ${i}. Qual a conduta inicial?`, `hw${i}`]
      );
      ids.push(r[0].id);
    }
  });

  it("regras + revisão clínica por IA de OUTRA empresa que a criadora; grava a triagem, o gasto, e não aprova nem publica nada", async () => {
    seen.length = 0;
    const r = await rpc("app_ch_draft_check_request", { p_batch: "lote_w", p_count: 3, p_layers: ["software", "sources", "redteam"] });
    const before = await requestRow(r.id);
    await drain(realDeps());
    const row = await requestRow(r.id);
    expect(row).toMatchObject({ status: "concluido", done_count: 3 });
    expect(row.summary.layers.software.saved).toBe(3);
    expect(row.summary.layers.sources.verdicts).toEqual({ insufficient: 3 }); // sem acervo oficial: não gasta IA
    expect(row.summary.layers.redteam.saved).toBe(3);
    // criadora é OpenAI (gpt-5.6-luna) e a Verificação também: a conferência trocou para outra empresa
    const redteam = seen.filter((s) => /:(solve|redteam)$/.test(s));
    expect(redteam).toHaveLength(6); // às cegas e com o gabarito, em cada um dos 3
    expect(redteam.every((s) => s.startsWith("anthropic:claude-opus-5-5"))).toBe(true);
    expect(seen.some((s) => s.startsWith("openai:"))).toBe(false);
    const gasto = await sql(`select source, provider, model, cost_usd from public.ai_calls where function_key = 'verificacao'`);
    expect(gasto).toHaveLength(6);
    expect(gasto.every((c) => c.source === "conferencia" && c.provider === "anthropic")).toBe(true);
    expect(Number(row.cost_usd)).toBeGreaterThan(0);
    // as 3 camadas gravadas só para os 3 rascunhos do pedido; o 4º ficou intocado
    const checks = await sql(`select d.source_id, count(*)::int n from public.draft_checks c join public.draft_questions d on d.id = c.draft_id where d.batch = 'lote_w' group by d.source_id order by 1`);
    expect(checks).toEqual([{ source_id: "w1", n: 3 }, { source_id: "w2", n: 3 }, { source_id: "w3", n: 3 }]);
    // triagem: sem fonte oficial => aprovação bloqueada; o 4º ainda não foi conferido
    const list = await rpc("app_draft_questions", { p_batch: "lote_w", p_limit: 10 });
    const by = Object.fromEntries(list.items.map((i: any) => [i.source_id, i]));
    expect(by.w1).toMatchObject({ triage: "sem_fonte", blocked_no_source: true });
    expect(by.w4).toMatchObject({ triage: "nao_conferida", blocked_no_source: false });
    // nada aprovado nem publicado, e a revisão automática antiga do motor não foi tocada
    expect((await sql(`select count(*)::int n from public.draft_questions where status <> 'awaiting_medical_review' or reviewed_by is not null`))[0].n).toBe(0);
    expect((await sql(`select ai_review from public.draft_questions where id = $1`, [ids[0]]))[0].ai_review).toEqual({ status: "APPROVED_FOR_PDF" });
    expect((await sql(`select count(*)::int n from public.questions where id like 'simulado%' or code like 'INEDITA%'`))[0].n).toBe(0);
    expect((await sql(`select status from public.ch_jobs where id = $1`, [before.job_id]))[0].status).toBe("succeeded");
    expect((await sql(`select details from public.ch_audit where action = 'draft_check.result' and target = $1`, [r.id]))[0].details).toMatchObject({ status: "concluido", done: 3 });
  });

  it("'conferir de novo' refaz as camadas já feitas; sem isso, só o que falta", async () => {
    const soft = await rpc("app_ch_draft_check_request", { p_batch: "lote_w", p_count: 10 });
    expect(soft.items).toBe(1); // só o w4 ainda não tem regras
    await drain(realDeps());
    expect(await requestRow(soft.id)).toMatchObject({ status: "concluido", done_count: 1 });
    const again = await rpc("app_ch_draft_check_request", { p_batch: "lote_w", p_count: 10, p_recheck: true });
    expect(again.items).toBe(4);
    const t0 = (await sql(`select max(checked_at) t from public.draft_checks where layer = 'software'`))[0].t;
    await new Promise((r) => setTimeout(r, 20));
    await drain(realDeps());
    expect((await sql(`select min(checked_at) t from public.draft_checks where layer = 'software'`))[0].t.getTime()).toBeGreaterThan(t0.getTime() - 1);
    expect(await requestRow(again.id)).toMatchObject({ status: "concluido", done_count: 4 });
  });

  it("sem IA de outra empresa pronta o pedido com revisão clínica fica pendente com o motivo; só regras não precisa de IA", async () => {
    await sql(`delete from public.draft_checks`);
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: false });
    invalidateAiConfig(db);
    const r = await rpc("app_ch_draft_check_request", { p_batch: "lote_w", p_count: 2, p_layers: ["redteam"] });
    await drain(realDeps());
    const row = await requestRow(r.id);
    expect(row.status).toBe("pendente");
    expect(row.message).toMatch(/outra IA|outra empresa|ligue/i);
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    invalidateAiConfig(db);
    await sql(`update public.ch_ai_requests set status = 'falhou' where id = $1`, [r.id]);
  });
});
