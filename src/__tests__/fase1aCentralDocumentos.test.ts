// @vitest-environment node
/**
 * Fase 1, grupo A: Central de Conteúdo, Documentos e Processamento (CC03, CC05, CC06, CC07, CC08, CC09, CC10, CC11).
 * Banco isolado (as mesmas migrações do Supabase) e IA simulada: nada de rede, nenhuma chave real. Textos sintéticos.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, DigestLimit, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { MockProvider } from "../../server/contentHub/ai/provider";
import { mockRespond } from "../../server/contentHub/ai/mock";
import { describeNoDrafts, isNoCreditError, stepVersions, type PipelineDeps } from "../../server/contentHub/pipeline";
import { createContentHubWorker } from "../../server/contentHub/worker";
import { createContentHubRouter } from "../../server/contentHub/router";
import { applyReferenceCleanup, cleanTerms, previewReferenceCleanup, undoReferenceCleanup } from "../../server/contentHub/referenceCleanup";
import { estimateDocumentCost } from "../../server/contentHub/costEstimate";
import { invalidateAiConfig } from "../../server/ai/config";
import type { AuthUser } from "../../src/novo/data/backend";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fase1a-"));
let dev: DevDatabase;
let db: ContentDb;
let storage: Storage;
let admin: AuthUser;
let editorA: AuthUser;
let editorB: AuthUser;
let student: AuthUser;
const tokens: Record<string, string> = {};
const servers: Server[] = [];
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

async function registerDoc(user: AuthUser, name: string, bytes: Buffer = Buffer.from(`%PDF-1.7 ${name} ${Math.random()}`)) {
  const hash = sha(bytes);
  const key = `documents/${hash}.pdf`;
  await storage.put(key, bytes, "application/pdf");
  const r = await db.asUser<{ id: string; duplicate: boolean }>(user, "app_ch_register_document", { p_doc: { name, sha256: hash, storage_path: key, rights_status: "own" } });
  return { ...r, sha: hash };
}
const extract = (doc: string, blocks: { page_no: number; idx: number; type: string; text: string }[]) =>
  db.service("ch_worker_save_extraction", { p_document_id: doc, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }, { page_no: 2, kind: "text", width: 595, height: 842 }], p_blocks: blocks.map((b) => ({ ...b, bbox: [0, 0, 1, 1] })) });
const mockDeps = (extra: Partial<PipelineDeps> = {}): PipelineDeps => {
  const provider = new MockProvider((req) => mockRespond(req));
  return { db, storage, ai: { provider, status: { ready: true, provider: "mock", model: provider.model, isMock: true, pending: null } }, renderer: null, sleep: async () => undefined, ...extra };
};

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  storage = localStorageDir(path.join(tmp, "files"));
  admin = await dev.core.createAccount("Admin Teste", "admin@fase1a.local", "senha-forte-123", true);
  editorA = await dev.core.createAccount("Editor A", "ea@fase1a.local", "senha-forte-123");
  editorB = await dev.core.createAccount("Editor B", "eb@fase1a.local", "senha-forte-123");
  student = await dev.core.createAccount("Aluno", "al@fase1a.local", "senha-forte-123");
  for (const e of [editorA, editorB]) await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [e.id]);
  await dev.db.query(`update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')`);
  for (const [k, u] of Object.entries({ admin, editorA, editorB, student })) tokens[k] = await dev.createSession(u.id);
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------ CC07
describe("CC07: a equipe vê os documentos enviados por qualquer pessoa da equipe", () => {
  let docA: string;
  let docA2: string;

  it("o editor B vê na lista, abre e lê as páginas e o texto do documento que o editor A enviou", async () => {
    const a = await registerDoc(editorA, "Apostila do editor A");
    docA = a.id;
    await extract(docA, [{ page_no: 1, idx: 0, type: "paragraph", text: "Texto sintético da página um." }]);
    const list = await db.asUser<{ id: string; name: string }[]>(editorB, "app_ch_documents");
    expect(list.map((d) => d.id)).toContain(docA);
    const detail = await db.asUser<any>(editorB, "app_ch_document", { p_document_id: docA });
    expect(detail.document.name).toBe("Apostila do editor A");
    const blocks = await db.asUser<any[]>(editorB, "app_ch_blocks", { p_document_id: docA, p_page: 1 });
    expect(blocks).toHaveLength(1);
    expect(await db.asUser<any>(editorB, "app_ch_inventory", { p_document_id: docA })).toBeTruthy();
  });

  it("a leitura direta das tabelas (RLS) também: a equipe lê documentos, páginas e blocos de qualquer um; aluno não lê nada", async () => {
    const as = (uid: string, q: string) =>
      dev.db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
        return (await tx.query<any>(q)).rows[0].n as number;
      });
    for (const t of ["ch_documents", "ch_pages", "ch_blocks"]) {
      expect(await as(editorB.id, `select count(*)::int n from public.${t}`)).toBeGreaterThan(0);
      expect(await as(admin.id, `select count(*)::int n from public.${t}`)).toBeGreaterThan(0);
      expect(await as(student.id, `select count(*)::int n from public.${t}`)).toBe(0);
    }
  });

  it("aluno continua sem acesso a nada; revisor que não é da equipe vê só o que ele mesmo enviou", async () => {
    await expect(db.asUser(student, "app_ch_documents")).rejects.toThrow(/restrito|sem acesso/i);
    await expect(db.asUser(student, "app_ch_document", { p_document_id: docA })).rejects.toThrow(/sem acesso|restrito/i);
    const reviewer = await dev.core.createAccount("Revisor", "rev@fase1a.local", "senha-forte-123");
    await db.asUser(admin, "app_ch_set_reviewer_areas", { p_user_id: reviewer.id, p_area_codes: ["CLINICA_MEDICA"] });
    expect(await db.asUser<any[]>(reviewer, "app_ch_documents")).toEqual([]);
    await expect(db.asUser(reviewer, "app_ch_document", { p_document_id: docA })).rejects.toThrow(/sem acesso/i);
    const own = await registerDoc(reviewer, "PDF do revisor");
    expect((await db.asUser<any[]>(reviewer, "app_ch_documents")).map((d) => d.id)).toEqual([own.id]);
  });

  it("o mesmo PDF enviado por duas pessoas da equipe vira dois registros (um por pessoa); da mesma pessoa, o mesmo", async () => {
    const bytes = Buffer.from("%PDF-1.7 mesmo arquivo nas duas contas");
    const a = await registerDoc(editorA, "Mesmo PDF", bytes);
    const b = await registerDoc(editorB, "Mesmo PDF", bytes);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(b.id).not.toBe(a.id);
    docA2 = a.id;
    expect((await registerDoc(editorA, "Mesmo PDF de novo", bytes)).duplicate).toBe(true);
    expect((await db.asUser<any[]>(editorB, "app_ch_documents")).map((d) => d.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("colar o SQL de novo não muda nada (as funções e as políticas são refeitas iguais)", async () => {
    const file = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009840_documentos_equipe_ve_todos.sql"), "utf8");
    await dev.db.exec(file);
    await dev.db.exec(file);
    expect((await db.asUser<any[]>(editorB, "app_ch_documents")).map((d) => d.id)).toContain(docA2);
    expect((await sql(`select count(*)::int n from pg_policies where tablename = 'ch_documents' and policyname like 'documentos:%'`))[0].n).toBe(1);
  });
});

// ------------------------------------------------------------------------------------------------ CC03
describe("CC03: documento sem nenhum rascunho não fica 'Aguardando revisão'", () => {
  const BLOCKS = [
    { page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda" },
    { page_no: 1, idx: 1, type: "paragraph", text: "Texto sintético. Na bronquiolite viral aguda, a oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%." },
  ];

  it("a explicação diz o que aconteceu e o que fazer (sem afirmações, sem fonte, sem tema)", () => {
    expect(describeNoDrafts([])).toMatch(/^Sem rascunhos para revisar: nenhum rascunho foi gerado porque nenhuma afirmação clínica foi extraída/);
    const sem = describeNoDrafts([{ status: "insufficient", theme_node_id: "t" }, { status: "insufficient", theme_node_id: "t" }, { status: "needs_review", theme_node_id: null }]);
    expect(sem).toMatch(/nenhuma das 3 afirmações ficou compatível/);
    expect(describeNoDrafts([{ status: "insufficient", theme_node_id: "t" }])).toMatch(/a afirmação extraída não ficou compatível com uma fonte oficial \(1 sem fonte oficial que a sustente\), então/);
    expect(sem).toMatch(/2 sem fonte oficial que a sustente/);
    expect(sem).toMatch(/1 para conferir à mão/);
    expect(sem).toMatch(/Cadastre ou aprove as fontes oficiais/);
    expect(describeNoDrafts([{ status: "compatible", theme_node_id: null }])).toMatch(/1 afirmação ficou compatível com fonte oficial, mas ela não tem tema/);
    expect(describeNoDrafts([{ status: "compatible", theme_node_id: "t" }])).toMatch(/foi barrado pela conferência do sistema/);
    expect(describeNoDrafts([{ status: "compatible", theme_node_id: null }, { status: "compatible", theme_node_id: null }])).toMatch(/2 afirmações ficaram compatíveis com fonte oficial, mas nenhuma tem tema/);
  });

  it("sem fonte oficial, o processamento termina em 'Sem rascunhos' com o motivo e não gera materiais nem revisão", async () => {
    const doc = (await registerDoc(editorA, "Apostila sem fonte")).id;
    await extract(doc, BLOCKS);
    await db.service("ch_worker_next", { p_document_id: doc, p_step: "classify", p_versions: stepVersions("classify", mockDeps()) });
    await createContentHubWorker(mockDeps()).drain();
    const [d] = await sql(`select status, failure from public.ch_documents where id = $1`, [doc]);
    expect(d.status).toBe("no_drafts");
    expect(d.failure).toMatch(/^Sem rascunhos para revisar: (a afirmação extraída não ficou compatível|nenhuma das \d+ afirmações ficou compatível) com uma fonte oficial/);
    const steps = (await sql(`select step from public.ch_jobs where document_id = $1`, [doc])).map((j) => j.step);
    expect(steps).toEqual(expect.arrayContaining(["classify", "claims", "evidence", "draft"]));
    expect(steps).not.toContain("materials");
    expect(steps).not.toContain("review_check");
    expect((await db.asUser<any[]>(editorB, "app_ch_documents")).find((x) => x.id === doc)?.status).toBe("no_drafts");
  });

  it("site novo + SQL antigo: sem a situação nova no banco, grava 'Aguardando revisão' com o mesmo motivo, sem derrubar a etapa", async () => {
    const doc = (await registerDoc(editorA, "Apostila sem fonte (banco antigo)")).id;
    await extract(doc, BLOCKS);
    const old = `check (status in ('received', 'extracting', 'classifying', 'verifying_sources', 'drafting', 'awaiting_review', 'failed'))`;
    await sql(`update public.ch_documents set status = 'awaiting_review' where status = 'no_drafts'`);
    await dev.db.exec(`alter table public.ch_documents drop constraint ch_documents_status_check; alter table public.ch_documents add constraint ch_documents_status_check ${old}`);
    try {
      await db.service("ch_worker_next", { p_document_id: doc, p_step: "classify", p_versions: stepVersions("classify", mockDeps()) });
      await createContentHubWorker(mockDeps()).drain();
      const [d] = await sql(`select status, failure from public.ch_documents where id = $1`, [doc]);
      expect(d.status).toBe("awaiting_review");
      expect(d.failure).toMatch(/^Sem rascunhos para revisar: (a afirmação extraída não ficou compatível|nenhuma das \d+ afirmações ficou compatível) com uma fonte oficial/);
      expect((await sql(`select status from public.ch_jobs where document_id = $1 and step = 'draft'`, [doc]))[0].status).toBe("succeeded");
    } finally {
      await dev.db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009841_documento_sem_rascunhos.sql"), "utf8"));
    }
  });

  it("colar o SQL de novo (2x) mantém a regra e aceita a situação nova", async () => {
    const file = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009841_documento_sem_rascunhos.sql"), "utf8");
    await dev.db.exec(file);
    await dev.db.exec(file);
    const defs = await sql(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.ch_documents'::regclass and conname = 'ch_documents_status_check'`);
    expect(defs).toHaveLength(1);
    expect(defs[0].d).toContain("no_drafts");
  });
});

// ------------------------------------------------------------------------------------------------ CC06
describe("CC06: falta de crédito pausa o trabalho em vez de virar 'Falhou'", () => {
  it("reconhece falta de crédito e cota, e não confunde com limite por minuto", () => {
    for (const m of [
      "Claude respondeu 400: Your credit balance is too low to access the Anthropic API.",
      "OpenAI respondeu 429: You exceeded your current quota, please check your plan and billing details.",
      "insufficient_quota",
      "Gemini respondeu 402: payment required",
      "Sem crédito na conta da IA.",
    ]) expect(isNoCreditError(m), m).toBe(true);
    for (const m of ["Gemini respondeu 429: Quota exceeded for quota metric requests per minute", "rate limit reached, tente de novo", "Tempo esgotado (180 s)", "Resposta fora do formato", ""]) expect(isNoCreditError(m), m).toBe(false);
  });

  const credit = () =>
    ({
      name: "anthropic",
      model: "claude-sonnet-5-5",
      isMock: false,
      async generate() {
        throw new Error("Claude respondeu 400: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.");
      },
    }) as any;
  const setupAi = async () => {
    await db.service("ch_worker_ai_set_provider", { p_actor: admin.id, p_provider: "anthropic", p_enabled: true });
    await db.service("ch_worker_ai_save_function", { p_actor: admin.id, p_key: "criacao", p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-sonnet-5-5" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    invalidateAiConfig(db);
  };
  let doc: string;
  let job: string;

  it("o trabalho fica pendente (sem gastar tentativa), com aviso claro no documento, e a chamada que falhou fica registrada", async () => {
    await setupAi();
    doc = (await registerDoc(editorA, "Apostila sem crédito")).id;
    await extract(doc, [{ page_no: 1, idx: 0, type: "paragraph", text: "Texto sintético sobre bronquiolite." }]);
    const created = await db.service<{ id: string }>("ch_worker_next", { p_document_id: doc, p_step: "classify", p_versions: {} });
    job = created.id;
    const deps = { db, storage, ai: { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "x" } }, renderer: null, aiMaker: credit, sleep: async () => undefined } as any;
    expect(await createContentHubWorker(deps).drain()).toBe(1);
    const [j] = await sql(`select status, attempts, error, metrics from public.ch_jobs where id = $1`, [job]);
    expect(j.status).toBe("blocked");
    expect(j.attempts).toBe(0);
    expect(j.error).toMatch(/^Sem crédito na IA: o provedor recusou o pedido por falta de crédito ou de cota/);
    expect(j.error).toMatch(/tenta de novo sozinho a cada 10 minutos/);
    expect(j.metrics.credit_pause_at).toBeTruthy();
    const [d] = await sql(`select status, failure from public.ch_documents where id = $1`, [doc]);
    expect(d.status).not.toBe("failed");
    expect(d.failure).toMatch(/^Pendência: Sem crédito na IA/);
    expect((await sql(`select status from public.ch_ai_runs where document_id = $1`, [doc]))[0].status).toBe("failed");
  });

  it("volta sozinho, mas só depois de 10 minutos (a cada passada do agendador não repete a chamada)", async () => {
    await db.service<number>("ch_worker_unblock");
    expect((await sql(`select status from public.ch_jobs where id = $1`, [job]))[0].status).toBe("blocked");
    expect((await sql(`select failure from public.ch_documents where id = $1`, [doc]))[0].failure).toMatch(/^Pendência: Sem crédito/);
    await sql(`update public.ch_jobs set metrics = jsonb_set(metrics, '{credit_pause_at}', to_jsonb((now() - interval '11 minutes')::text)) where id = $1`, [job]);
    expect(await db.service<number>("ch_worker_unblock")).toBeGreaterThanOrEqual(1);
    expect((await sql(`select status, error from public.ch_jobs where id = $1`, [job]))[0]).toMatchObject({ status: "queued", error: null });
    expect((await sql(`select failure from public.ch_documents where id = $1`, [doc]))[0].failure).toBeNull();
  });

  it("pendência por outro motivo continua voltando na hora (comportamento de sempre) e a nota só vale para trabalho pendente", async () => {
    const other = (await registerDoc(editorA, "Outra pendência")).id;
    const created = await db.service<{ id: string }>("ch_worker_next", { p_document_id: other, p_step: "classify", p_versions: {} });
    await sql(`update public.ch_jobs set status = 'blocked', error = 'IA desligada na Central de IAs.' where id = $1`, [created.id]);
    await db.service("ch_worker_note_credit_pause", { p_job_id: created.id });
    expect(await db.service<number>("ch_worker_unblock")).toBeGreaterThanOrEqual(1);
    expect((await sql(`select status from public.ch_jobs where id = $1`, [created.id]))[0].status).toBe("queued");
    // trabalho que não está pendente não recebe a nota
    const idle = await db.service<{ id: string }>("ch_worker_next", { p_document_id: other, p_step: "claims", p_versions: {} });
    await db.service("ch_worker_note_credit_pause", { p_job_id: idle.id });
    expect((await sql(`select metrics ? 'credit_pause_at' as has from public.ch_jobs where id = $1`, [idle.id]))[0].has).toBe(false);
  });

  it("colar o SQL de novo (2x) não muda nada", async () => {
    const file = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009842_pausa_sem_credito.sql"), "utf8");
    await dev.db.exec(file);
    await dev.db.exec(file);
    expect(await db.service<number>("ch_worker_unblock")).toBeGreaterThanOrEqual(0);
  });
});

// ------------------------------------------------------------------------------------------------ CC05
describe("CC05: estimativa de custo por documento e teto por documento (desligado)", () => {
  let doc: string;
  const BLOCKS = [
    { page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda" },
    { page_no: 1, idx: 1, type: "paragraph", text: "Texto sintético. A oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%. ".repeat(20) },
    { page_no: 2, idx: 0, type: "paragraph", text: "Outro parágrafo sintético sobre o manejo inicial. ".repeat(30) },
  ];

  it("o teto por documento nasce desligado e sem valor; só administrador lê e muda; ligar exige valor", async () => {
    expect(await db.asUser(admin, "app_ch_processing_settings")).toEqual({ document_cap_enabled: false, document_cap_usd: null });
    await expect(db.asUser(editorA, "app_ch_processing_settings")).rejects.toThrow(/administradores/);
    await expect(db.asUser(editorA, "app_ch_set_processing_settings", { p_document_cap_enabled: false, p_document_cap_usd: null })).rejects.toThrow(/administradores/);
    await expect(db.asUser(admin, "app_ch_set_processing_settings", { p_document_cap_enabled: true, p_document_cap_usd: null })).rejects.toThrow(/valor maior que zero/);
    await expect(db.asUser(admin, "app_ch_set_processing_settings", { p_document_cap_enabled: true, p_document_cap_usd: 0 })).rejects.toThrow(/valor maior que zero/);
    await expect(db.asUser(admin, "app_ch_set_processing_settings", { p_document_cap_enabled: false, p_document_cap_usd: -1 })).rejects.toThrow(/maior que zero/);
    expect(await db.service("ch_worker_processing_settings")).toEqual({ document_cap_enabled: false, document_cap_usd: null });
  });

  it("estimativa: o texto lido vira chamadas (classificar e afirmações); as outras etapas esperam as afirmações; sem preço, sem dólar inventado", async () => {
    doc = (await registerDoc(editorA, "Apostila para estimar")).id;
    await extract(doc, BLOCKS);
    const e = await estimateDocumentCost(db, doc);
    expect(e.text_chars).toBeGreaterThan(1000);
    const by = Object.fromEntries(e.lines.map((l) => [l.step, l]));
    expect(by.classify.calls).toBeGreaterThanOrEqual(1);
    expect(by.claims.calls).toBeGreaterThanOrEqual(1);
    for (const s of ["evidence", "draft", "materials", "review_check"]) expect(by[s].calls).toBeNull();
    expect(e.claims).toBeNull();
    expect(e.partial).toBe(true);
    expect(e.notes.join(" ")).toMatch(/dependem de quantas afirmações/);
    expect(e.cap).toEqual({ enabled: false, usd: null });
    expect(e.spent_usd).toBe(0);
    // sem IA escolhida/preço: nenhum valor em dólar
    for (const l of e.lines) expect(l.usd).toBeNull();
  });

  it("com IA e preço cadastrados: o valor sai pela mesma conta dos tetos e a soma bate", async () => {
    await db.service("ch_worker_ai_set_provider", { p_actor: admin.id, p_provider: "openai", p_enabled: true });
    await db.service("ch_worker_ai_save_function", { p_actor: admin.id, p_key: "criacao", p_config: { mode: "sozinha", primary_ref: { provider: "openai", model: "gpt-6.1-sol" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    await db.service("ch_worker_ai_save_function", { p_actor: admin.id, p_key: "verificacao", p_config: { mode: "sozinha", primary_ref: { provider: "openai", model: "gpt-6.1-sol" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    await sql(`insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok) values ('openai', 'gpt-6.1-sol', 2, 10) on conflict (provider, model) do update set input_per_mtok = 2, output_per_mtok = 10`);
    invalidateAiConfig(db);
    const e = await estimateDocumentCost(db, doc);
    const by = Object.fromEntries(e.lines.map((l) => [l.step, l]));
    expect(by.classify.usd).toBeGreaterThan(0);
    expect(by.claims.usd).toBeGreaterThan(0);
    expect(by.evidence.per_call_usd).toBeGreaterThan(0); // custo de UMA conferência já aparece
    expect(by.evidence.usd).toBeNull(); // quantidade ainda desconhecida
    expect(e.total_usd).toBeCloseTo((by.classify.usd as number) + (by.claims.usd as number), 6);
    expect(e.partial).toBe(true);
    expect(e.missing_prices).toEqual([]);
  });

  it("com as afirmações já extraídas, as etapas seguintes ganham quantidade e a estimativa deixa de ser parcial", async () => {
    const claim = await db.service<string>("ch_worker_add_claim", { p_claim: { document_id: doc, statement: "A oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%.", critical_kinds: [], context: {} } });
    expect(claim).toBeTruthy();
    const e = await estimateDocumentCost(db, doc);
    const by = Object.fromEntries(e.lines.map((l) => [l.step, l]));
    expect(e.claims).toBe(1);
    expect(by.evidence.calls).toBe(1);
    expect(by.evidence.usd).toBeGreaterThan(0);
    // sem tema a afirmação não vira rascunho: temas = 0, e as etapas por tema têm 0 chamadas (nada a gastar)
    expect(by.draft.calls).toBe(0);
    expect(by.materials.calls).toBe(0);
    expect(e.partial).toBe(false);
  });

  it("o gasto já registrado do documento aparece (inclusive chamadas que falharam)", async () => {
    await sql(`insert into public.ai_calls (function_key, mode, role, provider, model, outcome, cost_usd, source, item_id) values ('criacao', 'sozinha', 'principal', 'openai', 'gpt-6.1-sol', 'ok', 0.0125, 'central', $1), ('criacao', 'sozinha', 'principal', 'openai', 'gpt-6.1-sol', 'falha', 0.0025, 'central', $1), ('criacao', 'sozinha', 'principal', 'openai', 'gpt-6.1-sol', 'ok', 9, 'central', 'outro-item')`, [doc]);
    expect(Number(await db.service("ch_worker_document_spend", { p_document_id: doc }))).toBeCloseTo(0.015, 6);
    expect((await estimateDocumentCost(db, doc)).spent_usd).toBeCloseTo(0.015, 6);
  });

  it("teto ligado: o processamento para o documento ao alcançar o teto (pendência, sem gastar tentativa) e volta ao desligar", async () => {
    await db.asUser(admin, "app_ch_set_processing_settings", { p_document_cap_enabled: true, p_document_cap_usd: 0.01 });
    expect((await db.asUser<any>(admin, "app_ch_processing_settings")).document_cap_enabled).toBe(true);
    const created = await db.service<{ id: string }>("ch_worker_next", { p_document_id: doc, p_step: "classify", p_versions: { teste: "teto" } });
    await sql(`update public.ch_jobs set status = 'succeeded' where status in ('queued', 'blocked') and id <> $1`, [created.id]); // só este trabalho entra na conta
    let called = 0;
    const aiMaker = () => ({ name: "openai", model: "gpt-6.1-sol", isMock: false, async generate() { called++; throw new Error("não devia chamar"); } }) as any;
    const deps = { db, storage, ai: { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "x" } }, renderer: null, aiMaker, sleep: async () => undefined } as any;
    await createContentHubWorker(deps).drain();
    expect(called).toBe(0);
    const [j] = await sql(`select status, attempts, error from public.ch_jobs where id = $1`, [created.id]);
    expect(j).toMatchObject({ status: "blocked", attempts: 0 });
    expect(j.error).toMatch(/^Teto de gasto de IA por documento atingido: US\$ 0,015 gastos de US\$ 0,01\./);
    await db.asUser(admin, "app_ch_set_processing_settings", { p_document_cap_enabled: false, p_document_cap_usd: 0.01 });
    expect(await db.service<number>("ch_worker_unblock")).toBeGreaterThanOrEqual(1);
    expect((await sql(`select status from public.ch_jobs where id = $1`, [created.id]))[0].status).toBe("queued");
  });

  it("colar o SQL de novo (2x) não apaga o ajuste salvo", async () => {
    await db.asUser(admin, "app_ch_set_processing_settings", { p_document_cap_enabled: false, p_document_cap_usd: 3.5 });
    const file = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009843_teto_por_documento_desligado.sql"), "utf8");
    await dev.db.exec(file);
    await dev.db.exec(file);
    expect(await db.service("ch_worker_processing_settings")).toEqual({ document_cap_enabled: false, document_cap_usd: 3.5 });
  });
});

// ------------------------------------------------------------------------------------------------ CC09
describe("CC09: tirar marcas de terceiros sem licença cadastrada", () => {
  const TERMS = ["Curso Modelo", "Apostila Modelo", "cursomodelo.com.br"];
  let doc: string;
  const blocks = () => sql(`select id, original_text, revised_text, status, flags from public.ch_blocks where document_id = $1 order by page_no, idx`, [doc]);

  it("confere o que o administrador digitou: sem repetir, de 3 a 80 letras, no máximo 30", () => {
    expect(cleanTerms(undefined)).toEqual([]);
    expect(cleanTerms(["  Curso   Modelo ", "curso modelo", "", "cursomodelo.com.br"])).toEqual(["Curso Modelo", "cursomodelo.com.br"]);
    expect(() => cleanTerms("Curso")).toThrow(/lista/);
    expect(() => cleanTerms([7])).toThrow(/texto/);
    expect(() => cleanTerms(["ab"])).toThrow(/curto demais/);
    expect(() => cleanTerms(["x".repeat(81)])).toThrow(/longo demais/);
    expect(() => cleanTerms(Array.from({ length: 31 }, (_, i) => `Nome número ${i}`))).toThrow(/no máximo 30/);
  });

  it("prévia, aplicar e desfazer funcionam sem nenhuma licença; o original nunca muda", async () => {
    doc = (await registerDoc(admin, "Apostila de outro curso")).id;
    expect(await sql(`select 1 from public.ch_licenses where document_id = $1`, [doc])).toHaveLength(0);
    await extract(doc, [
      { page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda" },
      { page_no: 1, idx: 1, type: "paragraph", text: "Oxigênio quando a saturação estiver abaixo de 92% (Apostila Modelo)." },
      { page_no: 1, idx: 2, type: "paragraph", text: "Curso Modelo" },
      { page_no: 2, idx: 0, type: "paragraph", text: "O salbutamol não deve ser usado de rotina. Mais em https://cursomodelo.com.br/dicas." },
      { page_no: 2, idx: 1, type: "paragraph", text: "Texto clínico limpo, sem marca alguma." },
    ]);
    const before = await blocks();
    const p = await previewReferenceCleanup(db, doc, TERMS);
    expect(p).toMatchObject({ edited: 2, excluded: 1, terms: TERMS });
    expect(await blocks()).toEqual(before); // a prévia não grava nada
    // sem nada digitado, só contatos e avisos de direitos: este documento não tem nenhum
    expect((await previewReferenceCleanup(db, doc, [])).changes).toEqual([]);

    const r = await applyReferenceCleanup(db, doc, admin.id, TERMS);
    expect(r).toMatchObject({ edited: 2, excluded: 1, skipped: 0 });
    const b = await blocks();
    expect(b[1]).toMatchObject({ original_text: "Oxigênio quando a saturação estiver abaixo de 92% (Apostila Modelo).", revised_text: "Oxigênio quando a saturação estiver abaixo de 92%." });
    expect(b[1].flags).toEqual([expect.objectContaining({ code: "reference_removed" })]);
    expect(b[2]).toMatchObject({ status: "excluded", original_text: "Curso Modelo" });
    expect(b[3].revised_text).not.toMatch(/cursomodelo|https/);
    expect(b[4].revised_text).toBeNull();
    expect((await sql(`select count(*)::int n from public.ch_reference_cleanups where document_id = $1 and undone_at is null and license_id is null`, [doc]))[0].n).toBe(3);
    expect((await sql(`select details from public.ch_audit where action = 'content.clean_references'`))[0].details).toMatchObject({ edited: 2, excluded: 1, terms: TERMS });
    expect((await previewReferenceCleanup(db, doc, TERMS)).changes).toEqual([]);

    // alguém revisa um bloco depois: o desfazer preserva a revisão
    await sql(`update public.ch_blocks set revised_text = 'Revisão humana posterior.' where document_id = $1 and page_no = 2 and idx = 0`, [doc]);
    expect(await undoReferenceCleanup(db, doc, admin.id)).toMatchObject({ undone: 2, skipped: 1 });
    const c = await blocks();
    expect(c[1]).toMatchObject({ revised_text: null, flags: [] });
    expect(c[2].status).toBe("extracted");
    expect(c[3].revised_text).toBe("Revisão humana posterior.");
  });

  it("bloco que mudou depois da prévia não é tocado, e documento que não existe é recusado", async () => {
    const before = await blocks();
    const p = await previewReferenceCleanup(db, doc, TERMS);
    await sql(`update public.ch_blocks set revised_text = 'Texto trocado por uma pessoa.' where document_id = $1 and page_no = 1 and idx = 1`, [doc]);
    const changes = p.changes.map((c) => ({ block_id: c.block_id, before: c.before, after: c.after, exclude: c.exclude, removed: c.removed }));
    const r = await db.service<any>("ch_worker_apply_reference_cleanup_free", { p_document_id: doc, p_actor: admin.id, p_terms: TERMS, p_changes: changes });
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect((await blocks())[1].revised_text).toBe("Texto trocado por uma pessoa.");
    await expect(db.service("ch_worker_apply_reference_cleanup_free", { p_document_id: "00000000-0000-4000-8000-00000000dead", p_actor: admin.id, p_terms: [], p_changes: [] })).rejects.toThrow(/não encontrado/i);
    expect(before.length).toBe((await blocks()).length);
    await undoReferenceCleanup(db, doc, admin.id);
  });

  it("colar o SQL de novo (2x) não muda nada", async () => {
    const file = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009844_tirar_marcas_de_terceiros.sql"), "utf8");
    await dev.db.exec(file);
    await dev.db.exec(file);
    expect((await sql(`select is_nullable from information_schema.columns where table_name = 'ch_reference_cleanups' and column_name = 'license_id'`))[0].is_nullable).toBe("YES");
  });
});

// ------------------------------------------------------------------------------------------------ rotas
const listen = (st: Storage, extra: { worker?: any } = {}, ai?: any) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json());
    const deps = { db, storage: st, ai: ai ?? { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste" } }, renderer: null } as any;
    app.use("/api/content-hub", createContentHubRouter(deps, extra));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  return { status: r.status, body: (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const postJson = (url: string, token: string, body: unknown) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("rotas: marcas de terceiros e estimativa (só administrador)", () => {
  let base: string;
  let doc: string;
  beforeAll(async () => {
    base = await listen(storage);
    doc = (await registerDoc(admin, "Apostila das rotas")).id;
    await extract(doc, [
      { page_no: 1, idx: 0, type: "paragraph", text: "Conduta inicial (Apostila Modelo)." },
      { page_no: 1, idx: 1, type: "paragraph", text: "Siga @cursomodelo para mais dicas clínicas de pediatria." },
    ]);
  });

  it("marcas de terceiros: editor e aluno não passam; administrador vê a prévia, aplica e desfaz; nome curto demais é recusado em português", async () => {
    const url = `${base}/documents/${doc}/clean-references`;
    expect((await postJson(url, tokens.editorA, { action: "preview", terms: ["Apostila Modelo"] })).status).toBe(403);
    expect((await postJson(url, tokens.student, { action: "preview", terms: ["Apostila Modelo"] })).status).toBe(403);
    const bad = await postJson(url, tokens.admin, { action: "preview", terms: ["ab"] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/curto demais/);
    expect((await postJson(`${base}/documents/nao-e-um-id/clean-references`, tokens.admin, { action: "preview" })).status).toBe(400);
    const p = await postJson(url, tokens.admin, { action: "preview", terms: ["Apostila Modelo"] });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ edited: 2, excluded: 0, total: 2, shown: 2 });
    expect(p.body.changes.find((c: any) => c.before.includes("Conduta")).after).toBe("Conduta inicial.");
    const applied = await postJson(url, tokens.admin, { action: "apply", terms: ["Apostila Modelo"] });
    expect(applied.body).toMatchObject({ edited: 2, skipped: 0 });
    expect((await postJson(url, tokens.admin, { action: "undo" })).body).toMatchObject({ undone: 2 });
  });

  it("estimativa de custo: só administrador, e só de documento que a pessoa pode abrir", async () => {
    const url = `${base}/documents/${doc}/cost-estimate`;
    expect((await call(url, tokens.editorA)).status).toBe(403);
    expect((await call(url, tokens.student)).status).toBe(403);
    expect((await call(`${base}/documents/nao-e-um-id/cost-estimate`, tokens.admin)).status).toBe(400);
    const r = await call(url, tokens.admin);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ document_id: doc, lines: expect.any(Array), notes: expect.any(Array) });
    expect(r.body.lines.map((l: any) => l.step)).toEqual(["classify", "claims", "evidence", "draft", "materials", "review_check"]);
  });
});

// ------------------------------------------------------------------------------------------------ CC11
describe("CC11: o aviso 'IA pronta' olha o processamento, não o site", () => {
  const NO_FN = /Nenhuma função da Central de IAs está pronta/;
  let base: string;
  beforeAll(async () => {
    // a Central de IAs não tem função pronta com as chaves do SITE (nenhuma chave neste teste)
    await sql(`delete from public.ai_functions`);
    await sql(`update public.ai_providers set enabled = false`);
    invalidateAiConfig(db);
    base = await listen(storage);
  });
  const report = (ai: Record<string, unknown>, pending: string[] = []) =>
    db.service("ch_worker_report", { p_worker: "cloud_run", p_report: { where: "cloud_run", renderer: true, python: true, ocr_languages: ["por"], brand: { version: "1", pending: [] }, ai, embeddings: { ready: true, model: "m", pending: null }, pending, checked_at: new Date().toISOString() } });
  const status = async () => (await call(`${base}/status`, tokens.editorA)).body as { pending: string[] };

  it("sem nenhum relato do processamento: o site confere as próprias chaves (como antes)", async () => {
    const s = await status();
    expect(s.pending.some((p) => NO_FN.test(p))).toBe(true);
  });

  it("relato antigo (sem 'source: central'): continua valendo a conferência do site", async () => {
    await report({ ready: false, pending: "IA não configurada: defina CONTENT_HUB_AI_PROVIDER" }, ["IA do processamento: IA não configurada: defina CONTENT_HUB_AI_PROVIDER"]);
    const s = await status();
    expect(s.pending.some((p) => NO_FN.test(p))).toBe(true);
    expect(s.pending.join(" ")).not.toContain("CONTENT_HUB_AI_PROVIDER");
  });

  it("relato novo com a IA do processamento pronta: o aviso do site (sem chaves aqui) NÃO aparece", async () => {
    await report({ ready: true, source: "central", functions: { criacao: { ready: true, provider: "anthropic", model: "m" }, verificacao: { ready: true, provider: "openai", model: "n" } }, pending: null });
    const s = await status();
    expect(s.pending.some((p) => NO_FN.test(p))).toBe(false);
  });

  it("relato novo com falta real no processamento: a falta aparece, uma vez, e sem o aviso do site", async () => {
    const line = "IA do processamento (Criação): ANTHROPIC_API_KEY vazia no servidor.";
    await report({ ready: false, source: "central", functions: {}, pending: line }, [line]);
    const s = await status();
    expect(s.pending.filter((p) => p === line)).toHaveLength(1);
    expect(s.pending.some((p) => NO_FN.test(p))).toBe(false);
  });

  it("servidor que processa sozinho (desenvolvimento): valem as chaves dele", async () => {
    const local = await listen(storage, { worker: { running: true } });
    const s = (await call(`${local}/status`, tokens.editorA)).body as { pending: string[] };
    expect(s.pending.some((p) => NO_FN.test(p))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ CC08
describe("CC08: conferir o envio de um PDF grande sem baixar o arquivo inteiro", () => {
  const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n");
  const PDF_SHA = sha(PDF);
  let base: string;
  let digestCalls = 0;
  let getCalls = 0;
  let copies: [string, string][] = [];
  let limit: DigestLimit | null = null;
  const inner = localStorageDir(path.join(tmp, "files-cc08"));
  const spyStorage: Storage = {
    ...inner,
    async get(key) {
      getCalls++;
      return inner.get(key);
    },
    async digest(key, opts) {
      digestCalls++;
      if (limit) throw limit;
      return inner.digest!(key, opts);
    },
    async copy(from, to) {
      copies.push([from, to]);
      return inner.copy!(from, to);
    },
    async signedUpload(key) {
      return { path: key, token: "token" };
    },
  };
  beforeAll(async () => {
    base = await listen(spyStorage);
  });
  const sendTemp = async (bytes: Buffer, over: Record<string, unknown> = {}) => {
    const prep = (await postJson(`${base}/documents/upload`, tokens.editorA, { size_bytes: bytes.length })).body;
    await inner.put(prep.key, bytes, "application/pdf");
    const done = await postJson(`${base}/documents/confirm`, tokens.editorA, { key: prep.key, name: "Diretriz grande.pdf", ...over });
    return { prep, done };
  };

  it("confere em pedaços e copia dentro do depósito: o arquivo não é baixado inteiro nem enviado de volta", async () => {
    digestCalls = 0; getCalls = 0; copies = [];
    const { prep, done } = await sendTemp(PDF);
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ duplicate: false, sha256: PDF_SHA });
    expect(digestCalls).toBe(1);
    expect(getCalls).toBe(0);
    expect(copies).toEqual([[prep.key, `documents/${PDF_SHA}.pdf`]]);
    expect(await inner.exists(`documents/${PDF_SHA}.pdf`)).toBe(true);
    expect(await inner.exists(prep.key)).toBe(false); // o temporário sai
    const row = (await sql(`select provenance, storage_path from public.ch_documents where id = $1`, [done.body.id]))[0];
    expect(row.storage_path).toBe(`documents/${PDF_SHA}.pdf`);
    expect(row.provenance).toMatchObject({ size_bytes: PDF.length, original_file_name: "Diretriz grande.pdf" });
    // o mesmo arquivo de novo: abre o que já existe, sem copiar outra vez
    copies = [];
    const again = await sendTemp(PDF);
    expect(again.done.status).toBe(200);
    expect(again.done.body).toMatchObject({ id: done.body.id, duplicate: true });
    expect(copies).toEqual([]);
  });

  it("o que não é PDF é recusado (415) e o temporário sai; arquivo acima do máximo vira 413; conferência lenta vira 504", async () => {
    const notPdf = await sendTemp(Buffer.from("isto não é um pdf, é só texto"));
    expect(notPdf.done.status).toBe(415);
    expect(await inner.exists(notPdf.prep.key)).toBe(false);
    limit = new DigestLimit("size", "x");
    const big = await sendTemp(Buffer.from("%PDF-1.7 grande"));
    expect(big.done.status).toBe(413);
    expect(big.done.body.error).toMatch(/Arquivo acima de 300 MB/);
    expect(await inner.exists(big.prep.key)).toBe(false);
    limit = new DigestLimit("time", "x");
    const slow = await sendTemp(Buffer.from("%PDF-1.7 lento"));
    expect(slow.done.status).toBe(504);
    expect(slow.done.body.error).toMatch(/demorou demais/);
    expect(await inner.exists(slow.prep.key)).toBe(false);
    limit = null;
  });

  it("a conferência em pedaços dá o mesmo SHA-256 e recusa quando passa do tamanho", async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 123, 7);
    await inner.put("uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf", big, "application/pdf");
    const d = await inner.digest!("uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf");
    expect(d.sha256).toBe(sha(big));
    expect(d.size).toBe(big.length);
    expect([...d.head]).toEqual(new Array(16).fill(7));
    await expect(inner.digest!("uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf", { maxBytes: 1024 })).rejects.toBeInstanceOf(DigestLimit);
    await inner.remove!(["uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf"]);
  });
});

// ------------------------------------------------------------------------------------------------ CC10
describe("CC10: o aviso depois do envio fala a verdade sobre quando começa", () => {
  it("diz que o arquivo entrou na fila e que a tarefa passa a cada 10 minutos (não 'o processamento começou')", async () => {
    const labels = fs.readFileSync(path.join(process.cwd(), "src/novo/app/admin/content/labels.js"), "utf8");
    const docs = fs.readFileSync(path.join(process.cwd(), "src/novo/app/admin/content/Documents.jsx"), "utf8");
    expect(docs).not.toContain("O processamento começou");
    expect(docs).toContain("PROCESSING_START_NOTICE");
    expect(labels).toMatch(/Arquivo recebido e na fila\. O processamento pega o arquivo na próxima passada \(a tarefa passa a cada 10 minutos/);
    const script = fs.readFileSync(path.join(process.cwd(), "scripts/cloudrun/deploy-pdf-worker.sh"), "utf8");
    expect(script).toContain('SCHEDULE="${SCHEDULE:-*/10 * * * *}"');
  });
});
