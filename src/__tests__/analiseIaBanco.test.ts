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
    await dev.db.exec(MIGRATION);
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
    expect(p.limits).toEqual({ per_request: 10, per_day: 20, default: 3 });
    expect(p.will_analyze).toBe(3);
    expect(p.available).toBeGreaterThan(3);
    expect(p.remaining_today).toBe(20);
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

  it("limite de 10 por pedido, 1 como mínimo", async () => {
    await expect(request(ADMIN, { p_count: 11 })).rejects.toThrow(/1 a 10 questões por pedido/);
    await expect(request(ADMIN, { p_count: 0 })).rejects.toThrow(/1 a 10 questões/);
  });

  it("limite de 20 por dia por pessoa (o pedido que estoura é recusado em português; outra pessoa não é afetada)", async () => {
    // 3 já pedidas acima; mais 10 e mais 7 chegam a 20
    expect(await request(ADMIN, { p_count: 10, p_exam: "revalida-2022-1" })).toMatchObject({ items: 10 });
    expect(await request(ADMIN, { p_count: 7, p_exam: "revalida-2022-2" })).toMatchObject({ items: 7 });
    await expect(request(ADMIN, { p_count: 1, p_exam: "revalida-2023-1" })).rejects.toThrow(/Limite de 20 questões por dia atingido: você já pediu 20 hoje/);
    expect((await preview(ADMIN, { p_exam: "revalida-2023-1" })).remaining_today).toBe(0);
    // dia seguinte (Brasília): a cota volta
    await sql(`update public.ch_ai_requests set created_at = created_at - interval '1 day' where requested_by = $1`, [ADMIN]);
    expect((await preview(ADMIN, { p_exam: "revalida-2023-1" })).remaining_today).toBe(20);
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
    expect(p.estimate.note).toMatch(/Sem preço cadastrado/);
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
    expect(await t(ids[0])).toMatchObject({ code: "nao_conferida", blocked: false });
    await check(ids[1], "software", "fail", [{ severity: "critical", code: "x", detail: "d" }]);
    expect(await t(ids[1])).toMatchObject({ code: "reprovada" });
    await check(ids[2], "software", "issues", [{ severity: "major", code: "third_party_source_only", detail: "d" }]);
    expect(await t(ids[2])).toMatchObject({ code: "sem_fonte", blocked: true });
    await check(ids[3], "software", "pass");
    await check(ids[3], "sources", "insufficient", [{ severity: "major", code: "no_official_source", detail: "d" }]);
    expect(await t(ids[3])).toMatchObject({ code: "sem_fonte", blocked: true });
    await check(ids[4], "software", "pass");
    await check(ids[4], "sources", "pass");
    await check(ids[4], "redteam", "issues", [{ severity: "minor", code: "y", detail: "d" }]);
    expect(await t(ids[4])).toMatchObject({ code: "com_apontamentos", blocked: false });
    await check(ids[5], "software", "pass");
    expect(await t(ids[5])).toMatchObject({ code: "so_regras", blocked: false });
    await check(ids[6], "software", "pass");
    await check(ids[6], "sources", "pass");
    expect(await t(ids[6])).toMatchObject({ code: "sem_apontamentos" });
    // conteúdo mudou: a conferência deixa de valer
    const hash7 = (await sql(`select content_hash h from public.draft_questions where id = $1`, [ids[6]]))[0].h;
    await sql(`update public.draft_questions set content_hash = 'novo' where id = $1`, [ids[6]]);
    expect(await t(ids[6])).toMatchObject({ code: "nao_conferida" });
    await sql(`update public.draft_questions set content_hash = $2 where id = $1`, [ids[6], hash7]);
    expect(await t(ids[6])).toMatchObject({ code: "sem_apontamentos" });

    const list = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_teste", p_status: "awaiting_medical_review", p_limit: 30, p_order: "problematicos" });
    expect(list.triage_counts).toMatchObject({ reprovada: 1, sem_fonte: 2, com_apontamentos: 1, so_regras: 1, sem_apontamentos: 1 });
    expect(list.triage_counts.nao_conferida).toBe(20);
    expect(list.items.slice(0, 3).map((i: any) => i.triage)).toEqual(["reprovada", "sem_fonte", "sem_fonte"]);
    const clean = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_teste", p_limit: 30, p_order: "limpos" });
    expect(clean.items[0].triage).toBe("sem_apontamentos");
    const filtered = await rpc(ADMIN, "app_draft_questions", { p_batch: "lote_teste", p_triage: "sem_fonte" });
    expect(filtered.total).toBe(2);
    expect(filtered.items.every((i: any) => i.blocked_no_source && /nível A a D/.test(i.blocked_reason))).toBe(true);
    await expect(rpc(ADMIN, "app_draft_questions", { p_triage: "xyz" })).rejects.toThrow(/Selo de triagem inválido/);
  });

  it("aprovação bloqueada sem fonte oficial; pedir ajustes e recusar continuam livres; com fonte aprovar ainda é decisão do revisor; a triagem não aprova nada", async () => {
    await expect(rpc(REV_PED, "app_draft_question_decide", { p_id: ids[2], p_decision: "approved" })).rejects.toThrow(/Aprovação bloqueada.*fonte oficial/);
    await expect(rpc(REV_PED, "app_draft_question_decide", { p_id: ids[3], p_decision: "approved" })).rejects.toThrow(/Aprovação bloqueada/);
    expect(await rpc(REV_PED, "app_draft_question_decide", { p_id: ids[2], p_decision: "needs_changes", p_note: "Cadastrar a fonte." })).toBe(true);
    // limpo continua aguardando: só pessoa aprova
    expect((await sql(`select status from public.draft_questions where id = $1`, [ids[6]]))[0].status).toBe("awaiting_medical_review");
    await expect(rpc(STUDENT, "app_draft_question_decide", { p_id: ids[6], p_decision: "approved" })).rejects.toThrow(/revisor cadastrado/);
    expect(await rpc(REV_PED, "app_draft_question_decide", { p_id: ids[6], p_decision: "approved" })).toBe(true);
    expect((await sql(`select count(*)::int n from public.draft_questions where status = 'approved'`))[0].n).toBe(1);
  });
});
