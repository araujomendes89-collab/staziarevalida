// @vitest-environment node
/**
 * Pedir a IA pela tela (migração 9810): análise de questões históricas e conferência dos rascunhos inéditos.
 * Banco isolado (PGlite) com as migrações reais e IA FALSA (simulação / provedor de teste): nenhuma chamada de rede.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003009810_analise_ia_pedidos.sql"), "utf8");
// Leva 4: a 9810 convive com a 9800 (Questões StaziaMed); o corpo final de app_draft_questions / app_draft_question_decide está na 9830.
// Quem cola de novo a 9810 cola também a 9830 logo depois (ordem 9810 > 9820 > 9830).
const FECHAMENTO = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003009830_fechamento_leva4.sql"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "analise-ia-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const REV_PED = "00000000-0000-4000-8000-0000000000e1";
const REV_CIR = "00000000-0000-4000-8000-0000000000e2";
const EDITOR = "00000000-0000-4000-8000-0000000000e3";
const STUDENT = "00000000-0000-4000-8000-00000000000a";
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  const params = keys.map((k) => (args[k] !== null && typeof args[k] === "object" && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : args[k]));
  return (await as(uid, (q) => q(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) r`, params)))[0].r;
};

/** Decide como o app: com o texto que a pessoa viu (hash) e "conferi as fontes" marcado. */
const decideAs = async (uid: string, id: string, decision: string, note?: string) => {
  const hash = (await sql(`select content_hash h from public.draft_questions where id = $1`, [id]))[0].h;
  return rpc(uid, "app_draft_question_decide", { p_id: id, p_decision: decision, p_note: note ?? null, p_hash: hash, p_sources_checked: true });
};
const PASSAGE = "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias como primeira escolha no tratamento.";
const QUOTE = "indica-se amoxicilina 90 mg/kg/dia por 10 dias";
const DECISION = "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";
/**
 * Deixa o rascunho do jeito que a Questões StaziaMed (9800) exige para aprovar: tema, decisão clínica citada com trecho de fonte
 * oficial vigente. `title` entra também como source_file (a regra de evidência da 9810 casa o título). Camadas de conferência: `layers`.
 */
async function makeCitable(id: string, title: string, layers: string[] = []) {
  const [src] = await sql(`insert into public.ch_sources (title, organ, kind, status, version, published_on, authority_level) values ($1, 'Ministério da Saúde (teste)', 'final', 'current', '2026', '2026-01-01', 'A') returning id`, [title]);
  const [pas] = await sql(`insert into public.ch_source_passages (source_id, section, page, text) values ($1, 'Tratamento', 7, $2) returning id`, [src.id, PASSAGE]);
  const [{ topic }] = await sql(`select topic from public.staziamed_topic_weights('PEDIATRIA') limit 1`);
  const cit = { passage_id: pas.id, source_id: src.id, source: title, source_file: title, organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: QUOTE, supports: DECISION };
  await sql(`update public.draft_questions set topic = $2, clinical_decision = $3, source_citations = $4::jsonb where id = $1`, [id, topic, DECISION, JSON.stringify([cit])]);
  for (const layer of layers) await db.service("ch_worker_save_draft_check", { p_draft_id: id, p_layer: layer, p_verdict: "pass", p_findings: [], p_meta: { provider: "software", model: "regras" } });
}

async function configureAi() {
  for (const id of ["anthropic", "openai"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
  const save = (key: string, primary: object, fallback: object | null = null, reviewers: object[] = []) =>
    db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: key, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: fallback, reviewers, care: "caprichado" } });
  await save("engenharia_reversa", { provider: "anthropic", model: "claude-opus-5-5" }, { provider: "openai", model: "gpt-6.1-sol" });
  await save("verificacao", { provider: "openai", model: "gpt-6.1-sol" });
  for (const [provider, model, i, o] of [["anthropic", "claude-opus-5-5", 4, 20], ["openai", "gpt-6.1-sol", 2, 10]] as const)
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: provider, p_model: model, p_price: { input_per_mtok: i, output_per_mtok: o } });
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1,'a@t.dev'),($2,'rp@t.dev'),($3,'rc@t.dev'),($4,'ed@t.dev'),($5,'s@t.dev')`, [ADMIN, REV_PED, REV_CIR, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1,'PEDIATRIA'),($2,'CIRURGIA')`, [REV_PED, REV_CIR]);
  await configureAi();
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Migração 9810", () => {
  it("colar de novo (2x) não dá erro e a restrição de etapas guarda a união + as duas etapas novas", async () => {
    await dev.db.exec(MIGRATION);
    await dev.db.exec(FECHAMENTO);
    await dev.db.exec(MIGRATION);
    await dev.db.exec(FECHAMENTO);
    for (const step of ["extract", "source_search", "visual_render", "station_draft", "question_check", "question_analysis", "draft_check"]) {
      await sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ($1, 't', $2)`, [step, `teste-etapa:${step}`]);
    }
    await expect(sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ('nada', 't', 'teste-etapa:nada')`)).rejects.toThrow(/ch_jobs_step_check/);
    await sql(`delete from public.ch_jobs where idempotency_key like 'teste-etapa:%'`);
  });

  it("funções internas e do servidor fechadas para anon e authenticated; tabela com RLS", async () => {
    const open = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'ch\\_ai\\_%' or p.proname like 'ch\\_qa\\_%' or p.proname like 'ch\\_dc\\_%' or p.proname in ('ch_draft_triage', 'ch_worker_ai_request_get', 'ch_worker_ai_request_update', 'ch_worker_questions_for_analysis_ids', 'ch_worker_drafts_for_check_ids'))
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`
    );
    expect(open).toEqual([]);
    expect((await sql(`select relrowsecurity from pg_class where relname = 'ch_ai_requests'`))[0].relrowsecurity).toBe(true);
  });
});

describe("Análise de questões: pedido pela tela", () => {
  const preview = (uid: string, a: Record<string, unknown> = {}) => rpc(uid, "app_ch_question_analysis_preview", { p_exam: "revalida-2021", ...a });
  const request = (uid: string, a: Record<string, unknown> = {}) => rpc(uid, "app_ch_question_analysis_request", { p_exam: "revalida-2021", ...a });

  it("prévia: quantas entram, estimativa em dólares pela tabela de preços, cota do dia e IA pronta; não grava nada", async () => {
    const p = await preview(ADMIN, { p_count: 3 });
    expect(p.limits).toEqual({ per_request: 50, per_day: 100, default: 3 });
    expect(p.will_analyze).toBe(3);
    expect(p.available).toBeGreaterThan(3);
    expect(p.remaining_today).toBe(100);
    expect(p.ai).toEqual({ ready: true, reason: null });
    expect(p.estimate).toMatchObject({ calls: 3, provider: "anthropic", model: "claude-opus-5-5", note: null });
    // 3 × 2.600 de saída a US$ 20/Mtok = 0,156 + entrada: mais que isso, menos que US$ 1
    expect(p.estimate.typical_usd).toBeGreaterThan(0.15);
    expect(p.estimate.typical_usd).toBeLessThan(1);
    expect(p.estimate.max_usd).toBeGreaterThan(p.estimate.typical_usd);
    expect(await sql(`select 1 from public.ch_ai_requests`)).toHaveLength(0);
    expect(await sql(`select 1 from public.ch_jobs where step = 'question_analysis'`)).toHaveLength(0);
  });

  it("pedido válido do administrador enfileira a tarefa e grava o pedido com as questões congeladas", async () => {
    const r = await request(ADMIN, { p_count: 3 });
    expect(r).toMatchObject({ duplicate: false, status: "na_fila", items: 3 });
    const [row] = await sql(`select * from public.ch_ai_requests where id = $1`, [r.id]);
    expect(row).toMatchObject({ kind: "question_analysis", requested_by: ADMIN, item_count: 3, status: "na_fila" });
    expect(row.target_ids).toHaveLength(3);
    expect(Number(row.ceiling_usd)).toBeGreaterThan(Number(row.estimate_usd));
    const [job] = await sql(`select step, status, document_id from public.ch_jobs where id = $1`, [row.job_id]);
    expect(job).toEqual({ step: "question_analysis", status: "queued", document_id: null });
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'question_analysis.request'`))[0].n).toBe(1);
  });

  it("idempotência: o mesmo pedido enquanto anda não duplica", async () => {
    const again = await request(ADMIN, { p_count: 3 });
    expect(again).toMatchObject({ duplicate: true, status: "na_fila", items: 3 });
    expect((await sql(`select count(*)::int n from public.ch_ai_requests where kind = 'question_analysis'`))[0].n).toBe(1);
    expect((await sql(`select count(*)::int n from public.ch_jobs where step = 'question_analysis'`))[0].n).toBe(1);
  });

  it("limite de 50 por pedido, 1 como mínimo", async () => {
    await expect(request(ADMIN, { p_count: 51 })).rejects.toThrow(/1 a 50 questões por pedido/);
    await expect(request(ADMIN, { p_count: 0 })).rejects.toThrow(/1 a 50 questões/);
  });

  it("limite de 100 por dia por pessoa (o pedido que estoura é recusado em português; outra pessoa não é afetada)", async () => {
    // 3 já pedidas acima; preenche 90 com pedidos já concluídos (a base de teste não tem tantas questões por prova) e mais 7 chegam a 100
    for (const [i, n] of [50, 40].entries()) {
      await sql(`insert into public.ch_ai_requests (kind, requested_by, request_key, target_ids, item_count, status, done_count)
                 values ('question_analysis', $1, $2, array(select 'q' || g from generate_series(1, $3::int) g), $3::int, 'concluido', $3::int)`, [ADMIN, `enchimento-${i}`, n]);
    }
    expect(await request(ADMIN, { p_count: 7, p_exam: "revalida-2022-2" })).toMatchObject({ items: 7 });
    await expect(request(ADMIN, { p_count: 1, p_exam: "revalida-2023-1" })).rejects.toThrow(/Limite de 100 questões por dia atingido: você já pediu 100 hoje/);
    expect((await preview(ADMIN, { p_exam: "revalida-2023-1" })).remaining_today).toBe(0);
    // dia seguinte (Brasília): a cota volta
    await sql(`update public.ch_ai_requests set created_at = created_at - interval '1 day' where requested_by = $1`, [ADMIN]);
    expect((await preview(ADMIN, { p_exam: "revalida-2023-1" })).remaining_today).toBe(100);
  });

  it("pedido que falhou antes de fazer algo não gasta a cota do dia", async () => {
    const r = await request(ADMIN, { p_count: 5, p_exam: "revalida-2023-1" });
    expect((await preview(ADMIN, { p_exam: "revalida-2024-1" })).used_today).toBe(5);
    await db.service("ch_worker_ai_request_update", { p_request_id: r.id, p_patch: { status: "falhou", message: "x", done_count: 0 } });
    expect((await preview(ADMIN, { p_exam: "revalida-2024-1" })).used_today).toBe(0);
  });

  it("permissões: aluno, editor sem área, revisor de outra área e quem não entrou são barrados; revisor só pede a área dele", async () => {
    await expect(request(STUDENT)).rejects.toThrow(/restrito/);
    await expect(preview(STUDENT)).rejects.toThrow(/restrito/);
    await expect(request(EDITOR)).rejects.toThrow(/administrador ou revisor médico/);
    await expect(request(REV_PED, { p_area: "CIRURGIA" })).rejects.toThrow(/não é revisor médico da área CIRURGIA/);
    await expect(dev.db.query(`select public.app_ch_question_analysis_request('revalida-2021', 3)`)).rejects.toThrow();
    const r = await request(REV_PED, { p_count: 4, p_exam: "revalida-2024-2" });
    const areas = await sql(`select distinct public.question_area_code(q) a from public.ch_ai_requests r, unnest(r.target_ids) q where r.id = $1`, [r.id]);
    expect(areas).toEqual([{ a: "PEDIATRIA" }]);
    // cada pessoa vê só os seus pedidos; o administrador vê todos
    const mine = await rpc(REV_PED, "app_ch_ai_requests", {});
    expect(mine.every((x: any) => x.requested_by === REV_PED)).toBe(true);
    const all = await rpc(ADMIN, "app_ch_ai_requests", {});
    expect(all.length).toBeGreaterThan(mine.length);
    expect(all[0].requested_by_email).toBeTruthy();
    expect(mine[0].requested_by_email ?? null).toBeNull();
    expect(mine[0].target_ids).toBeUndefined();
  });

  it("IA da Central não pronta recusa com mensagem em português (função sem IA, IA desligada, interruptor)", async () => {
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: false });
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "openai", p_enabled: false });
    expect((await preview(ADMIN, { p_exam: "revalida-2025-1" })).ai.reason).toMatch(/está desligada na Central de IAs/);
    await expect(request(ADMIN, { p_exam: "revalida-2025-1" })).rejects.toThrow(/Engenharia reversa.*desligada na Central de IAs/);
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "openai", p_enabled: true });
    await sql(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    try {
      await expect(request(ADMIN, { p_exam: "revalida-2025-1" })).rejects.toThrow(/IA da Central de Conteúdo está desligada/);
    } finally {
      await sql(`update public.ch_flags set value = true where key = 'ai_enabled'`);
    }
    await sql(`update public.ch_flags set value = false where key = 'enabled'`);
    try {
      await expect(request(ADMIN, { p_exam: "revalida-2025-1" })).rejects.toThrow(/desligado pelo administrador/);
    } finally {
      await sql(`update public.ch_flags set value = true where key = 'enabled'`);
    }
  });

  it("estimativa sem preço cadastrado avisa em português em vez de inventar valor", async () => {
    await sql(`delete from public.ai_model_prices where model = 'claude-opus-5-5'`);
    const p = await preview(ADMIN, { p_exam: "revalida-2025-1" });
    expect(p.estimate.typical_usd).toBeNull();
    expect(p.estimate.note).toMatch(/Falta o preço/);
    // sem preço não há como limitar o gasto: o pedido é RECUSADO em português (não roda sem parada de segurança)
    await expect(request(ADMIN, { p_exam: "revalida-2025-1" })).rejects.toThrow(/Pedido recusado: Falta o preço/);
    expect(await sql(`select 1 from public.ch_ai_requests where params ->> 'exam' = 'revalida-2025-1'`)).toHaveLength(0);
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "anthropic", p_model: "claude-opus-5-5", p_price: { input_per_mtok: 4, output_per_mtok: 20 } });
  });

  it("análise já publicada ou revisada nunca entra no pedido; cancelar só na fila", async () => {
    const [q] = await sql(`select id from public.questions where exam_id = 'revalida-2025-2' and status <> 'annulled' and correct_option is not null order by number limit 1`);
    await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash) values ($1, 1, 'x', 'published', 'm', 'x')`, [q.id]);
    const r = await request(ADMIN, { p_count: 10, p_exam: "revalida-2025-2", p_only_missing: false });
    const [row] = await sql(`select target_ids from public.ch_ai_requests where id = $1`, [r.id]);
    expect(row.target_ids).not.toContain(q.id);
    await expect(rpc(STUDENT, "app_ch_ai_request_cancel", { p_id: r.id })).rejects.toThrow(/restrito/);
    await expect(rpc(REV_CIR, "app_ch_ai_request_cancel", { p_id: r.id })).rejects.toThrow(/Só quem fez o pedido/);
    expect(await rpc(ADMIN, "app_ch_ai_request_cancel", { p_id: r.id })).toMatchObject({ status: "falhou" });
    expect((await sql(`select status from public.ch_jobs where idempotency_key = $1`, ["ai_request:" + r.id]))[0].status).toBe("dead");
    await expect(rpc(ADMIN, "app_ch_ai_request_cancel", { p_id: r.id })).rejects.toThrow(/já começou ou terminou/);
  });

  it("tarefa que morre fecha o pedido como falhou, com o motivo", async () => {
    const [{ id, job_id }] = await sql(`select id, job_id from public.ch_ai_requests where status = 'na_fila' limit 1`);
    await sql(`update public.ch_jobs set status = 'dead', error = 'Motivo de teste.' where id = $1`, [job_id]);
    expect((await sql(`select status, message from public.ch_ai_requests where id = $1`, [id]))[0]).toEqual({ status: "falhou", message: "Motivo de teste." });
  });
});

describe("Conferência de rascunhos inéditos: pedido pela tela, triagem e aprovação bloqueada sem fonte", () => {
  const ids: string[] = [];
  const preview = (uid: string, a: Record<string, unknown> = {}) => rpc(uid, "app_ch_draft_check_preview", { p_batch: "lote_teste", ...a });
  const request = (uid: string, a: Record<string, unknown> = {}) => rpc(uid, "app_ch_draft_check_request", { p_batch: "lote_teste", ...a });
  const check = (id: string, layer: string, verdict: string, findings: unknown[] = []) =>
    db.service("ch_worker_save_draft_check", { p_draft_id: id, p_layer: layer, p_verdict: verdict, p_findings: findings, p_meta: { provider: "software", model: "regras" } });

  beforeAll(async () => {
    for (let i = 1; i <= 26; i++) {
      const area = i <= 22 ? "PEDIATRIA" : "CIRURGIA";
      const r = await sql(
        `insert into public.draft_questions (batch, source_id, slot, area, stem, alternatives, correct_answer, explanation, alternative_explanations, source_citations, clinical_decision, content_hash, model)
         values ('lote_teste', $1, $2, $3, $4, '{"A":"a1","B":"b1","C":"c1","D":"d1"}'::jsonb, 'A', 'Explicação.', '{}'::jsonb, '[]'::jsonb, 'Tratar a doença X com a conduta Y.', $5, 'gpt-5.6-luna') returning id`,
        [`q${i}`, i, area, `Enunciado sintético ${i}.`, `h${i}`]
      );
      ids.push(r[0].id);
    }
  });

  it("prévia: só software não precisa de IA e custa zero; com camadas de IA mostra o custo por camada pela tabela de preços", async () => {
    const soft = await preview(ADMIN, { p_count: 10 });
    expect(soft.layers).toEqual(["software"]);
    expect(soft.limits).toEqual({ per_request: 20, per_day: 60, default: 10 });
    expect(soft.will_check).toBe(10);
    expect(soft.estimate).toMatchObject({ calls: 0, typical_usd: 0 });
    expect(soft.ai.needed).toBe(false);
    const full = await preview(ADMIN, { p_count: 10, p_layers: ["sources", "currency", "redteam"] });
    expect(full.layers).toEqual(["software", "sources", "currency", "redteam"]);
    expect(full.estimate.calls).toBe(40); // 10 fontes + 10 atualidade + 20 revisão clínica
    expect(full.estimate.typical_usd).toBeGreaterThan(0);
    expect(full.estimate.max_usd).toBeGreaterThan(full.estimate.typical_usd);
    expect(Object.keys(full.estimate.by_layer).sort()).toEqual(["currency", "redteam", "sources"]);
    expect(full.ai).toMatchObject({ ready: true, needed: true });
    await expect(preview(ADMIN, { p_layers: ["magia"] })).rejects.toThrow(/Camada de conferência desconhecida/);
    expect(await sql(`select 1 from public.ch_ai_requests where kind = 'draft_check'`)).toHaveLength(0);
  });

  it("pedido válido enfileira; idempotente; limite de 20 por pedido e 60 por dia; padrão 10", async () => {
    const r = await request(ADMIN, { p_count: 10 });
    expect(r).toMatchObject({ duplicate: false, status: "na_fila", items: 10 });
    const [row] = await sql(`select * from public.ch_ai_requests where id = $1`, [r.id]);
    expect(row.params).toMatchObject({ batch: "lote_teste", layers: ["software"], recheck: false });
    expect((await sql(`select step, status from public.ch_jobs where id = $1`, [row.job_id]))[0]).toEqual({ step: "draft_check", status: "queued" });
    expect(await request(ADMIN, { p_count: 10 })).toMatchObject({ duplicate: true, id: r.id });
    await expect(request(ADMIN, { p_count: 21 })).rejects.toThrow(/1 a 20 rascunhos por pedido/);
    await expect(request(ADMIN, { p_count: 0 })).rejects.toThrow(/1 a 20 rascunhos/);
    // 10 já pedidos; +20 +20 = 50; +20 estoura os 60
    await sql(`update public.draft_questions set content_hash = content_hash || 'x' where batch = 'lote_teste'`); // outro conjunto de camadas pendentes
    const a = await request(ADMIN, { p_count: 20, p_recheck: true });
    expect(a.items).toBe(20);
    const b = await request(ADMIN, { p_count: 20, p_recheck: true, p_batch: "lote_teste", p_area: "PEDIATRIA", p_layers: ["software", "redteam"] });
    expect(b.items).toBe(20);
    await expect(request(ADMIN, { p_count: 20, p_recheck: true, p_layers: ["software", "sources"] })).rejects.toThrow(/Limite de 60 rascunhos por dia atingido: você já pediu 50 hoje/);
    await sql(`delete from public.ch_jobs where step = 'draft_check'`); // (as tarefas somem; os pedidos viram falhou)
    await sql(`delete from public.ch_ai_requests where kind = 'draft_check'`);
  });

  it("permissões: aluno, editor sem área e revisor de outra área barrados; revisor só recebe rascunhos da área dele", async () => {
    await expect(request(STUDENT)).rejects.toThrow(/restrito/);
    await expect(request(EDITOR)).rejects.toThrow(/administrador ou revisor médico/);
    await expect(request(REV_PED, { p_area: "CIRURGIA" })).rejects.toThrow(/não é revisor médico da área CIRURGIA/);
    const r = await request(REV_CIR, { p_count: 20 });
    expect(r.items).toBe(4); // só os 4 de Cirurgia
    const areas = await sql(`select distinct d.area from public.ch_ai_requests q, unnest(q.target_ids) t join public.draft_questions d on d.id = t::uuid where q.id = $1`, [r.id]);
    expect(areas).toEqual([{ area: "CIRURGIA" }]);
    await sql(`delete from public.ch_jobs where step = 'draft_check'`);
    await sql(`delete from public.ch_ai_requests where kind = 'draft_check'`);
  });

  it("camadas de IA com a Verificação sem IA ligada recusam em português; só regras não precisa de IA", async () => {
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "openai", p_enabled: false });
    try {
      await expect(request(ADMIN, { p_layers: ["redteam"] })).rejects.toThrow(/Verificação.*desligada na Central de IAs/);
      expect((await preview(ADMIN, { p_layers: ["redteam"] })).ai.ready).toBe(false);
      expect(await request(ADMIN, { p_count: 5 })).toMatchObject({ duplicate: false, items: 5 });
    } finally {
      await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "openai", p_enabled: true });
      await sql(`delete from public.ch_jobs where step = 'draft_check'`);
      await sql(`delete from public.ch_ai_requests where kind = 'draft_check'`);
    }
  });

  it("selo de triagem: nada conferido, reprovada, sem fonte oficial, com apontamentos, só regras, sem apontamentos; contagem e ordem", async () => {
    const t = async (id: string) => (await sql(`select public.ch_draft_triage($1) r`, [id]))[0].r;
    // rascunho nunca conferido, sem citação oficial: sem evidência positiva, aprovação bloqueada
    expect(await t(ids[0])).toMatchObject({ code: "nao_conferida", blocked: true });
    await check(ids[1], "software", "fail", [{ severity: "critical", code: "x", detail: "d" }]);
    expect(await t(ids[1])).toMatchObject({ code: "reprovada" });
    await check(ids[2], "software", "issues", [{ severity: "major", code: "third_party_source_only", detail: "d" }]);
    expect(await t(ids[2])).toMatchObject({ code: "sem_fonte", blocked: true });
    await check(ids[3], "software", "pass");
    await check(ids[3], "sources", "insufficient", [{ severity: "major", code: "no_official_source", detail: "d" }]);
    expect(await t(ids[3])).toMatchObject({ code: "sem_fonte", blocked: true });
    await makeCitable(ids[4], "Documento Oficial E4 (teste)");
    await check(ids[4], "software", "pass");
    await check(ids[4], "sources", "pass");
    await check(ids[4], "redteam", "issues", [{ severity: "minor", code: "y", detail: "d" }]);
    expect(await t(ids[4])).toMatchObject({ code: "com_apontamentos", blocked: false });
    await check(ids[5], "software", "pass");
    expect(await t(ids[5])).toMatchObject({ code: "sem_fonte", blocked: true }); // só regras e nada que prove fonte oficial
    // cita trecho de documento cadastrado como fonte oficial vigente (nível A a D): há evidência positiva (o texto mudou: confere de novo)
    await makeCitable(ids[5], "Documento Oficial A (teste)");
    expect(await t(ids[5])).toMatchObject({ code: "nao_conferida", blocked: false });
    await check(ids[5], "software", "pass");
    expect(await t(ids[5])).toMatchObject({ code: "so_regras", blocked: false });
    await makeCitable(ids[6], "Documento Oficial G (teste)", ["software", "sources", "currency", "redteam"]);
    expect(await t(ids[6])).toMatchObject({ code: "sem_apontamentos" });
    // conteúdo mudou: a conferência deixa de valer (o hash sai do texto, não se escolhe)
    const stem6 = (await sql(`select stem s from public.draft_questions where id = $1`, [ids[6]]))[0].s;
    await sql(`update public.draft_questions set stem = $2 where id = $1`, [ids[6], stem6 + " (editado)"]);
    expect(await t(ids[6])).toMatchObject({ code: "nao_conferida" });
    await sql(`update public.draft_questions set stem = $2 where id = $1`, [ids[6], stem6]);
    expect(await t(ids[6])).toMatchObject({ code: "sem_apontamentos" });

    const list = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_teste", p_status: "awaiting_medical_review", p_limit: 30, p_order: "problematicos" });
    expect(list.triage_counts).toMatchObject({ reprovada: 1, sem_fonte: 2, com_apontamentos: 1, so_regras: 1, sem_apontamentos: 1 });
    expect(list.triage_counts.nao_conferida).toBe(20);
    expect(list.items.slice(0, 3).map((i: any) => i.triage)).toEqual(["reprovada", "sem_fonte", "sem_fonte"]);
    const clean = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_teste", p_limit: 30, p_order: "limpos" });
    expect(clean.items[0].triage).toBe("sem_apontamentos");
    const filtered = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_teste", p_triage: "sem_fonte" });
    expect(filtered.total).toBe(2);
    expect(filtered.items.every((i: any) => i.triage_blocked && /nível A a D/.test(i.blocked_reason))).toBe(true);
    await expect(rpc(ADMIN, "app_draft_questions", { p_triage: "xyz" })).rejects.toThrow(/Selo de triagem inválido/);
  });

  it("aprovação bloqueada sem fonte oficial; pedir ajustes e recusar continuam livres; com fonte aprovar ainda é decisão do revisor; a triagem não aprova nada", async () => {
    await expect(decideAs(REV_PED, ids[2], "approved")).rejects.toThrow(/Aprovação bloqueada.*fonte oficial/);
    await expect(decideAs(REV_PED, ids[3], "approved")).rejects.toThrow(/Aprovação bloqueada/);
    expect(await decideAs(REV_PED, ids[2], "needs_changes", "Cadastrar a fonte.")).toBe(true);
    // limpo continua aguardando: só pessoa aprova
    expect((await sql(`select status from public.draft_questions where id = $1`, [ids[6]]))[0].status).toBe("awaiting_medical_review");
    await expect(decideAs(STUDENT, ids[6], "approved")).rejects.toThrow(/revisor cadastrado/);
    expect(await decideAs(REV_PED, ids[6], "approved")).toBe(true);
    expect((await sql(`select count(*)::int n from public.draft_questions where status = 'approved'`))[0].n).toBe(1);
  });
});

describe("Revisão independente 1: correções (achados 1 a 12 do relatório da OpenAI)", () => {
  const dids: string[] = [];
  const dpreview = (uid: string, a: Record<string, unknown> = {}) => rpc(uid, "app_ch_draft_check_preview", { p_batch: "lote_rev1", ...a });
  const drequest = (uid: string, a: Record<string, unknown> = {}) => rpc(uid, "app_ch_draft_check_request", { p_batch: "lote_rev1", ...a });
  const check = (id: string, layer: string, verdict: string, findings: unknown[] = []) =>
    db.service("ch_worker_save_draft_check", { p_draft_id: id, p_layer: layer, p_verdict: verdict, p_findings: findings, p_meta: { provider: "software", model: "regras" } });
  const decide = (uid: string, id: string, decision: string, note?: string) => decideAs(uid, id, decision, note);
  const cleanRequests = async () => {
    await sql(`delete from public.ch_jobs where step in ('draft_check', 'question_analysis')`);
    await sql(`delete from public.ch_ai_requests`);
  };

  beforeAll(async () => {
    await cleanRequests();
    for (let i = 1; i <= 40; i++) {
      const area = i <= 30 ? "PEDIATRIA" : "CIRURGIA";
      const r = await sql(
        `insert into public.draft_questions (batch, source_id, slot, area, stem, alternatives, correct_answer, explanation, alternative_explanations, source_citations, clinical_decision, content_hash, model)
         values ('lote_rev1', $1, $2, $3, $4, '{"A":"a1","B":"b1","C":"c1","D":"d1"}'::jsonb, 'A', 'Explicação.', '{}'::jsonb, '[]'::jsonb, 'Tratar a doença X.', $5, 'gpt-5.6-luna') returning id`,
        [`r${i}`, i, area, `Enunciado de revisão ${i}.`, `hr${i}`]
      );
      dids.push(r[0].id);
    }
    await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Diretriz Oficial B (teste)', 'Órgão', 'final', '1', 'B'), ('Apostila de curso (teste)', 'Curso', 'final', '1', 'E')`);
  });

  // ---- achado 1
  it("1. aprovação exige evidência POSITIVA de fonte oficial A a D: sem conferência nenhuma, sem citação oficial, bloqueia (e vale na chamada direta, de qualquer tela)", async () => {
    const id = dids[0];
    await expect(decide(REV_PED, id, "approved")).rejects.toThrow(/Aprovação bloqueada.*fonte oficial/); // nunca conferido
    await sql(`update public.draft_questions set source_citations = '[{"source_file":"Apostila de curso (teste)"}]'::jsonb where id = $1`, [id]);
    await expect(decide(REV_PED, id, "approved")).rejects.toThrow(/Aprovação bloqueada/); // só material de terceiros (nível E)
    await sql(`update public.draft_questions set source_citations = '[{"source_file":"Diretriz Oficial B (teste)"}]'::jsonb where id = $1`, [id]);
    await expect(decide(REV_PED, id, "approved")).rejects.toThrow(/Aprovação bloqueada/); // citação antiga (só o nome do arquivo): na Leva 4 não basta
    // citação nova (trecho de fonte oficial vigente) e as quatro camadas sem problema, menos a de fontes:
    await makeCitable(id, "Diretriz Oficial B2 (teste)", ["software", "currency", "redteam"]);
    await check(id, "sources", "insufficient"); // a conferência disse que falta trecho: continua bloqueado
    await expect(decide(REV_PED, id, "approved")).rejects.toThrow(/Aprovação bloqueada/);
    await check(id, "sources", "issues");
    await expect(decide(REV_PED, id, "approved")).rejects.toThrow(/Aprovação bloqueada/);
    await check(id, "sources", "pass"); // evidência positiva conferida para este texto
    expect(await decide(REV_PED, id, "approved")).toBe(true);
    const [row] = await sql(`select status, reviewed_hash = content_hash as same from public.draft_questions where id = $1`, [id]);
    expect(row).toEqual({ status: "approved", same: true });
  });

  it("1. citação nova de fonte oficial vigente vale como evidência quando ainda não há conferência de fontes; conferência velha (texto mudou) não vale", async () => {
    const id = dids[1];
    await makeCitable(id, "Diretriz Oficial C (teste)", ["software", "sources", "currency", "redteam"]);
    await sql(`update public.draft_questions set stem = stem || ' Revisado.' where id = $1`, [id]); // o texto mudou: as conferências antigas não contam
    await expect(decide(REV_PED, id, "approved")).rejects.toThrow(/Não aprova: .*Conferência pendente/);
    for (const layer of ["software", "sources", "currency", "redteam"]) await check(id, layer, "pass");
    expect(await decide(REV_PED, id, "approved")).toBe(true);
    // fonte retirada de vigência: a citação deixa de ser evidência
    const id2 = dids[2];
    await makeCitable(id2, "Diretriz Oficial D (teste)", ["software", "sources", "currency", "redteam"]);
    await sql(`update public.ch_sources set status = 'superseded' where title = 'Diretriz Oficial D (teste)'`);
    await expect(decide(REV_PED, id2, "approved")).rejects.toThrow(/Aprovação bloqueada/);
    await sql(`update public.ch_sources set status = 'current' where title = 'Diretriz Oficial D (teste)'`);
    expect(await decide(REV_PED, id2, "approved")).toBe(true);
  });

  it("1. a decisão trava a linha (for update), para a verificação e a gravação valerem para o mesmo texto", async () => {
    const def = (await sql(`select pg_get_functiondef('public.app_draft_question_decide(uuid, text, text, text, boolean)'::regprocedure) d`))[0].d as string;
    expect(def).toMatch(/from public\.draft_questions where id = p_id for update/);
    // o triage da lista e o bloqueio da decisão usam a MESMA regra de evidência
    const t = (await sql(`select public.ch_draft_triage($1) r`, [dids[3]]))[0].r;
    expect(t.blocked).toBe(true);
    await expect(decide(REV_PED, dids[3], "approved")).rejects.toThrow(/Aprovação bloqueada/);
  });

  // ---- achado 2
  it("2. a lista de rascunhos mostra ao revisor só as áreas dele (lotes, contagens, conferências, e-mails); administrador e editor veem tudo", async () => {
    await check(dids[31], "software", "pass"); // um de Cirurgia
    const ped = await rpc(REV_PED, "app_draft_questions", { p_batch: "lote_rev1", p_limit: 100 });
    expect(ped.items.length).toBe(30);
    expect(ped.items.every((i: any) => i.area === "PEDIATRIA")).toBe(true);
    expect(ped.total).toBe(30);
    expect(ped.batches.find((b: any) => b.batch === "lote_rev1").total).toBe(30);
    expect(Object.values(ped.triage_counts).reduce((a: number, b: any) => a + b, 0)).toBe(30);
    // pedir a área dos outros não adianta
    const outra = await rpc(REV_PED, "app_draft_questions", { p_batch: "lote_rev1", p_area: "CIRURGIA" });
    expect(outra.items).toEqual([]);
    expect(outra.total).toBe(0);
    // as conferências de outras áreas não entram nas contagens por camada
    expect(ped.checks.software.pass).toBe(3); // os 3 de Pediatria já conferidos acima; o de Cirurgia não entra na conta dele
    const adm = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_rev1", p_limit: 100 });
    expect(adm.total).toBe(40);
    expect(adm.checks.software.pass).toBe(4);
    expect((await rpc(EDITOR, "app_draft_questions", { p_batch: "lote_rev1", p_limit: 100 })).total).toBe(40);
    // revisor sem nenhuma área não vê nada (não é equipe)
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CIRURGIA') on conflict do nothing`, [REV_CIR]);
    const cir = await rpc(REV_CIR, "app_draft_questions", { p_batch: "lote_rev1", p_limit: 100 });
    expect(cir.items.every((i: any) => i.area === "CIRURGIA")).toBe(true);
    expect(cir.total).toBe(10);
  });

  // ---- achado 3
  it("3. conferir a cota e reservar é uma operação só: o pedido pega uma trava por pessoa e tipo até o fim da transação", async () => {
    await cleanRequests();
    const def = (await sql(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = 'app_ch_question_analysis_request'`))[0].d as string;
    expect(def.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(0);
    expect(def.indexOf("pg_advisory_xact_lock")).toBeLessThan(def.indexOf("ch_ai_used_today"));
    const defDc = (await sql(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = 'app_ch_draft_check_request'`))[0].d as string;
    expect(defDc.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(0);
    expect(defDc.indexOf("pg_advisory_xact_lock")).toBeLessThan(defDc.indexOf("ch_ai_used_today"));
    // na prática: dentro da transação do pedido a trava existe (some ao fim dela)
    const held = await as(ADMIN, async (q) => {
      await q(`select public.app_ch_question_analysis_request(p_exam => 'revalida-2024-1', p_count => 2)`);
      return (await q(`select count(*)::int n from pg_locks where locktype = 'advisory' and granted and pid = pg_backend_pid()`))[0].n;
    });
    expect(held).toBeGreaterThan(0);
    // e a cota continua certa depois dos dois tipos de pedido
    expect((await preview_qa(ADMIN, "revalida-2024-1")).used_today).toBe(2);
    await cleanRequests();
  });
  const preview_qa = (uid: string, exam: string) => rpc(uid, "app_ch_question_analysis_preview", { p_exam: exam });

  // ---- achado 4 e 11
  it("4. sem preço ou sem configuração salva da função, o pedido é RECUSADO em português (não roda sem parada de segurança)", async () => {
    await cleanRequests();
    // análise: função sem configuração salva
    const saved = (await sql(`select * from public.ai_functions where key = 'engenharia_reversa'`))[0];
    await sql(`delete from public.ai_functions where key = 'engenharia_reversa'`);
    try {
      expect((await preview_qa(ADMIN, "revalida-2024-2")).ai.reason).toMatch(/ainda não foi configurada na Central de IAs/);
      await expect(rpc(ADMIN, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 1 })).rejects.toThrow(/ainda não foi configurada/);
    } finally {
      await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "engenharia_reversa", p_config: { mode: saved.mode, primary_ref: saved.primary_ref, fallback_ref: saved.fallback_ref, reviewers: saved.reviewers, care: saved.care } });
    }
    // a reserva paga sem preço também recusa
    await sql(`delete from public.ai_model_prices where model = 'gpt-6.1-sol'`);
    try {
      await expect(rpc(ADMIN, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 1 })).rejects.toThrow(/Pedido recusado: Falta o preço/);
      await expect(drequest(ADMIN, { p_layers: ["redteam"] })).rejects.toThrow(/Pedido recusado: Falta o preço/);
      // só regras não gasta nada: segue
      expect(await drequest(ADMIN, { p_count: 2 })).toMatchObject({ duplicate: false });
    } finally {
      await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "openai", p_model: "gpt-6.1-sol", p_price: { input_per_mtok: 2, output_per_mtok: 10 } });
    }
    await cleanRequests();
  });

  it("11. a estimativa e o teto da conferência valem pelo pior caso das IAs ligadas (a conferência troca de empresa), nunca zero se pode pagar", async () => {
    await cleanRequests();
    const ver = (await sql(`select * from public.ai_functions where key = 'verificacao'`))[0];
    // Verificação em Ollama (custa zero), mas há IAs pagas ligadas que a troca de empresa pode escolher
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "ollama", p_enabled: true });
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "verificacao", p_config: { mode: "sozinha", primary_ref: { provider: "ollama", model: "qwen3:8b" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    try {
      const p = await dpreview(ADMIN, { p_count: 5, p_layers: ["redteam"] });
      expect(p.estimate.typical_usd).toBeGreaterThan(0);
      expect(p.estimate.max_usd).toBeGreaterThan(p.estimate.typical_usd);
      expect(p.estimate.note).toMatch(/pior caso entre as IAs ligadas/);
      const r = await drequest(ADMIN, { p_count: 5, p_layers: ["redteam"] });
      const [row] = await sql(`select estimate_usd, ceiling_usd from public.ch_ai_requests where id = $1`, [r.id]);
      expect(Number(row.estimate_usd)).toBeGreaterThan(0);
      expect(Number(row.ceiling_usd)).toBeGreaterThan(Number(row.estimate_usd));
    } finally {
      await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "verificacao", p_config: { mode: ver.mode, primary_ref: ver.primary_ref, fallback_ref: ver.fallback_ref, reviewers: ver.reviewers, care: ver.care } });
      await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "ollama", p_enabled: false });
    }
    await cleanRequests();
  });

  // ---- achado 5 e 8 (banco)
  it("5. o cancelamento vence a passagem para 'analisando'; estado final não vira outro estado final", async () => {
    await cleanRequests();
    const r = await rpc(ADMIN, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 2 });
    await rpc(ADMIN, "app_ch_ai_request_cancel", { p_id: r.id });
    expect(await db.service("ch_worker_ai_request_update", { p_request_id: r.id, p_patch: { status: "analisando" } })).toBe(false);
    expect((await sql(`select status from public.ch_ai_requests where id = $1`, [r.id]))[0].status).toBe("falhou");
    // concluído não vira falhou, falhou não vira concluído, e nenhum registro de resultado extra nasce
    expect(await db.service("ch_worker_ai_request_update", { p_request_id: r.id, p_patch: { status: "concluido", done_count: 2 } })).toBe(false);
    const r2 = await rpc(ADMIN, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 2, p_only_missing: false });
    expect(await db.service("ch_worker_ai_request_update", { p_request_id: r2.id, p_patch: { status: "concluido", done_count: 2 } })).toBe(true);
    expect(await db.service("ch_worker_ai_request_update", { p_request_id: r2.id, p_patch: { status: "falhou", message: "x" } })).toBe(false);
    expect((await sql(`select status, message from public.ch_ai_requests where id = $1`, [r2.id]))[0]).toMatchObject({ status: "concluido", message: null });
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'question_analysis.result' and target = $1`, [r2.id]))[0].n).toBe(1);
    await cleanRequests();
  });

  // ---- achado 7 (cota)
  it("7. pedido que falhou DEPOIS de chamar a IA conta a cota inteira (o gasto não devolve a cota)", async () => {
    await cleanRequests();
    const r = await rpc(ADMIN, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 4 });
    await db.service("ch_worker_ai_request_update", { p_request_id: r.id, p_patch: { status: "falhou", message: "x", done_count: 0 } });
    expect((await preview_qa(ADMIN, "revalida-2024-2")).used_today).toBe(0); // falhou sem chamar a IA: cota volta
    const r2 = await rpc(ADMIN, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 4, p_only_missing: false });
    await db.service("ch_worker_ai_request_update", { p_request_id: r2.id, p_patch: { status: "falhou", message: "x", done_count: 0, calls: 1, cost_usd: 0.04 } });
    expect((await preview_qa(ADMIN, "revalida-2024-2")).used_today).toBe(4);
    await cleanRequests();
  });

  // ---- achado 9
  it("9. 'mais problemáticos primeiro' escolhe a PÁGINA pela ordem do selo (um reprovado do fim do lote vem na primeira página)", async () => {
    await check(dids[29], "software", "fail", [{ severity: "critical", code: "x", detail: "d" }]); // último de Pediatria (nº 30)
    const page = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_rev1", p_area: "PEDIATRIA", p_limit: 3, p_offset: 0, p_order: "problematicos" });
    expect(page.items[0]).toMatchObject({ slot: 30, triage: "reprovada" });
    const next = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_rev1", p_area: "PEDIATRIA", p_limit: 3, p_offset: 3, p_order: "problematicos" });
    expect(next.items.map((i: any) => i.slot)).not.toContain(30);
    const clean = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_rev1", p_area: "PEDIATRIA", p_limit: 2, p_order: "limpos" });
    expect(clean.items).toHaveLength(2);
  });

  // ---- achado 10
  it("10. quem deixou de ser revisor (ou administrador) não lê mais os próprios pedidos nem direto na tabela", async () => {
    await cleanRequests();
    await sql(`delete from public.ch_reviewer_areas where user_id = $1`, [REV_CIR]);
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CIRURGIA')`, [REV_CIR]);
    await rpc(REV_CIR, "app_ch_draft_check_request", { p_batch: "lote_rev1", p_count: 2 });
    expect(await as(REV_CIR, (q) => q(`select id from public.ch_ai_requests`))).toHaveLength(1);
    await sql(`delete from public.ch_reviewer_areas where user_id = $1`, [REV_CIR]);
    expect(await as(REV_CIR, (q) => q(`select id from public.ch_ai_requests`))).toEqual([]);
    expect((await as(ADMIN, (q) => q(`select id from public.ch_ai_requests`))).length).toBe(1);
    await cleanRequests();
  });

  // ---- achado 12
  it("12. pedido igual de outra pessoa NÃO é tratado como duplicado: cada pessoa recebe e vê o seu próprio pedido", async () => {
    await cleanRequests();
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA') on conflict do nothing`, [REV_CIR]);
    const a = await rpc(REV_PED, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 2, p_area: "PEDIATRIA" });
    const b = await rpc(REV_CIR, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 2, p_area: "PEDIATRIA" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(b.id).not.toBe(a.id);
    expect((await rpc(REV_CIR, "app_ch_ai_requests", {})).map((x: any) => x.id)).toEqual([b.id]);
    // o mesmo pedido da MESMA pessoa continua sem duplicar
    expect(await rpc(REV_PED, "app_ch_question_analysis_request", { p_exam: "revalida-2024-2", p_count: 2, p_area: "PEDIATRIA" })).toMatchObject({ duplicate: true, id: a.id });
    await cleanRequests();
  });
});
