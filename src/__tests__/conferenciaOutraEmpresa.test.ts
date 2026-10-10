// @vitest-environment node
/**
 * Conferência por outra empresa (decisão do dono, 2026-10-10): no processamento da Central de Conteúdo, a IA que confere
 * (evidência de cada afirmação e revisão automática do rascunho) nunca é da mesma empresa da IA que escreveu o texto. Vale a
 * Verificação da Central (principal, depois reserva) pulando a mesma empresa; sem nenhuma, outra das três empresas pronta, na
 * ordem Gemini → Claude → OpenAI, com o modelo dessa empresa já escolhido na Central. Sem nenhuma pronta, a etapa espera com
 * aviso. Sem rede: provedores falsos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conferencia-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const adminUser = { id: ADMIN, email: "ad@t.dev" };
let dev: DevDatabase;
let db: ContentDb;

type R = { provider: string; model: string };
const A: R = { provider: "anthropic", model: "claude-sonnet-5-5" };
const O: R = { provider: "openai", model: "gpt-6.1-sol" };
const G: R = { provider: "gemini", model: "gemini-2.5-pro" };
const key = (r: R) => `${r.provider}:${r.model}`;
const origin = { source: "central" as const, itemId: "item-1", actorId: null };
const REQ = { promptId: "t", promptVersion: "1", system: "sistema", input: "x".repeat(400), schema: { type: "object" as const }, schemaName: "teste", maxOutputTokens: 1000 };

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev')`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function resetAiState() {
  const { invalidateAiConfig } = await import("../../server/ai/config");
  for (const sql of [
    "delete from public.ai_calls",
    "delete from public.ai_functions",
    "delete from public.ai_model_prices",
    "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
    "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
  ]) {
    await dev.db.query(sql);
  }
  invalidateAiConfig(db);
}
const on = async (...ids: string[]) => {
  for (const id of ids) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
};
const saveFn = async (k: string, primary: R | null, fallback: R | null = null) => {
  await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: fallback, reviewers: [], care: "caprichado" } });
};
const refresh = async () => (await import("../../server/ai/config")).invalidateAiConfig(db);

/** Provedores falsos: só as refs listadas existem; cada chamada fica registrada; sem rede. */
function fakes(refs: R[]) {
  const calls: Record<string, number> = {};
  const known = new Set(refs.map(key));
  const makeProviderFor = (ref: R) =>
    known.has(key(ref))
      ? ({
          name: ref.provider,
          model: ref.model,
          isMock: false,
          async generate() {
            calls[key(ref)] = (calls[key(ref)] ?? 0) + 1;
            return { output: { ok: key(ref) }, provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
          },
        } as any)
      : null;
  return { makeProviderFor, calls };
}
const deps = (f: ReturnType<typeof fakes>, env: Record<string, string> = {}) => ({ db, env: env as any, makeProviderFor: f.makeProviderFor, log: () => {} });

describe("maestroCheckerProvider: quem confere nunca é da empresa de quem escreveu", () => {
  beforeEach(resetAiState);
  const checker = async () => (await import("../../server/ai/maestro")).maestroCheckerProvider;

  it("Verificação de outra empresa: usa a Verificação como hoje", async () => {
    await on("anthropic", "openai");
    await saveFn("verificacao", O);
    await refresh();
    const f = fakes([A, O, G]);
    const r = await (await checker())(deps(f), "verificacao", A.model, origin);
    expect(r.status).toMatchObject({ ready: true, provider: "openai", model: O.model });
    expect((await r.provider!.generate<any>(REQ)).output).toEqual({ ok: key(O) });
  });

  it("Verificação da mesma empresa e reserva de outra: usa a reserva", async () => {
    await on("anthropic", "openai");
    await saveFn("verificacao", A, O);
    await refresh();
    const f = fakes([A, O, G]);
    const r = await (await checker())(deps(f), "verificacao", "claude-opus-5-5", origin);
    expect(r.status).toMatchObject({ ready: true, provider: "openai", model: O.model });
    await r.provider!.generate(REQ);
    expect(f.calls[key(A)]).toBeUndefined();
    expect(f.calls[key(O)]).toBe(1);
  });

  it("Verificação e reserva da mesma empresa: troca sozinho para o Gemini (primeiro da ordem), com o modelo padrão dele", async () => {
    await on("anthropic", "gemini", "openai");
    await saveFn("verificacao", A, { provider: "anthropic", model: "claude-opus-5-5" });
    await refresh();
    const f = fakes([A, O, G]);
    const r = await (await checker())(deps(f), "verificacao", A.model, origin);
    expect(r.status).toMatchObject({ ready: true, provider: "gemini", model: G.model });
    await r.provider!.generate(REQ);
    expect(f.calls).toEqual({ [key(G)]: 1 });
    // o registro da Central guarda a chamada como Verificação, com a IA que de fato conferiu
    const rows = (await dev.db.query<any>(`select function_key, provider, model, outcome from public.ai_calls`)).rows;
    expect(rows).toEqual([{ function_key: "verificacao", provider: "gemini", model: G.model, outcome: "ok" }]);
  });

  it("Gemini desligado: a próxima da ordem é o Claude quando quem escreveu foi a OpenAI", async () => {
    await on("anthropic", "openai");
    await saveFn("verificacao", O);
    await refresh();
    const f = fakes([A, O, G]);
    const r = await (await checker())(deps(f), "verificacao", "gpt-6.1-sol", origin);
    expect(r.status).toMatchObject({ ready: true, provider: "anthropic", model: A.model });
  });

  it("a OpenAI escolhida sozinha usa o modelo dela que já está escolhido na Central (aqui, no assistente Conversar)", async () => {
    await on("gemini", "openai");
    await saveFn("verificacao", G);
    await saveFn("assistente_revisar", O);
    await refresh();
    const f = fakes([A, O, G]);
    const r = await (await checker())(deps(f), "verificacao", "gemini-3.5-flash", origin);
    expect(r.status).toMatchObject({ ready: true, provider: "openai", model: O.model });
  });

  it("sem nenhuma IA de outra empresa pronta: espera, com o aviso de qual ligar", async () => {
    await on("anthropic");
    await saveFn("verificacao", A);
    await refresh();
    const r = await (await checker())(deps(fakes([A, O, G])), "verificacao", "claude-opus-5-5", origin);
    expect(r.provider).toBeNull();
    expect(r.status.ready).toBe(false);
    expect(r.status.pending).toBe("Falta uma IA de outra empresa para conferir (quem escreveu foi Claude): ligue Gemini ou OpenAI na Central de IAs.");
  });

  it("texto sem registro de quem escreveu (escrito por uma pessoa): segue a Verificação como hoje", async () => {
    await on("anthropic");
    await saveFn("verificacao", A);
    await refresh();
    const f = fakes([A]);
    for (const writer of [null, ""]) {
      const r = await (await checker())(deps(f), "verificacao", writer, origin);
      expect(r.status, String(writer)).toMatchObject({ ready: true, provider: "anthropic", model: A.model });
    }
  });
});

describe("Central de IAs: aviso quando Verificação e Criação são da mesma empresa", () => {
  beforeEach(resetAiState);

  it("mesma empresa: aviso na Verificação; empresas diferentes: sem o aviso", async () => {
    const { functionChecks, loadAiConfig } = await import("../../server/ai/config");
    await on("anthropic", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", { provider: "anthropic", model: "claude-opus-5-5" });
    await refresh();
    const AVISO = "Verificação e Criação são da mesma empresa (Claude): no processamento, a conferência troca sozinha para outra empresa pronta (Gemini, Claude ou OpenAI, nesta ordem).";
    expect(functionChecks(await loadAiConfig(db), {} as any).verificacao.warnings).toContain(AVISO);
    await saveFn("verificacao", O);
    await refresh();
    expect(functionChecks(await loadAiConfig(db), {} as any).verificacao.warnings.join(" ")).not.toMatch(/mesma empresa/);
  });
});

describe("processamento: evidência e revisão por outra empresa", () => {
  const T = "Texto sintético de teste.";
  const PASSAGE = `${T} Na bronquiolite viral aguda, a oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%.`;
  /** Texto diferente por documento: as respostas guardadas de um documento não valem para o outro. */
  const blocks = (name: string) => [
    { page_no: 1, idx: 0, type: "heading", text: `Bronquiolite viral aguda (${name})` },
    { page_no: 1, idx: 1, type: "paragraph", text: `${PASSAGE} Caso: ${name}.` },
  ];
  let storage: any;
  let docId: string;
  const aiMaker = (ref: { provider: string; model: string }) =>
    ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate(req: any) {
        const { mockRespond } = await import("../../server/contentHub/ai/mock");
        return { output: mockRespond(req), provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
      },
    }) as any;
  const noAi = { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada." } };
  /** Gerador de arquivos falso (nenhum arquivo): o processamento segue até a revisão automática. */
  const renderer = { templateVersion: "t1", brandVersion: "b1", render: async () => [] };
  const centralDeps = (extra: any = {}) => ({ db, storage, ai: noAi, aiMaker, renderer, ...extra }) as any;

  beforeAll(async () => {
    const { localStorageDir } = await import("../../server/contentHub/infra");
    storage = localStorageDir(path.join(tmp, "files"));
    const src = await db.asUser<{ id: string }>(adminUser, "app_ch_register_source", { p_source: { title: "Fonte sintética", organ: "Órgão de teste", version: "1", published_on: "2026-01-01", url: "https://exemplo.invalid/f.pdf" } });
    await db.asUser(adminUser, "app_ch_add_passage", { p_source_id: src.id, p_passage: { section: "Tratamento", page: 12, text: PASSAGE } });
  }, 120_000);
  beforeEach(resetAiState);

  /** Documento novo (o anterior pode ter respostas guardadas): extração pronta, processamento a partir da classificação. */
  async function newDocument(name: string) {
    const bytes = Buffer.from(`%PDF-1.7 ${name}`);
    const sha = (await import("crypto")).createHash("sha256").update(bytes).digest("hex");
    await storage.put(`documents/${sha}.pdf`, bytes, "application/pdf");
    const r = await db.asUser<{ id: string }>(adminUser, "app_ch_register_document", { p_doc: { name, sha256: sha, storage_path: `documents/${sha}.pdf`, rights_status: "own" } });
    docId = r.id;
    await db.service("ch_worker_save_extraction", { p_document_id: docId, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }], p_blocks: blocks(name).map((b) => ({ ...b, bbox: [0, 0, 1, 1] })) });
  }
  async function process(deps: any) {
    const { stepVersions } = await import("../../server/contentHub/pipeline");
    const { createContentHubWorker } = await import("../../server/contentHub/worker");
    await db.service("ch_worker_unblock");
    await db.service("ch_worker_next", { p_document_id: docId, p_step: "classify", p_versions: stepVersions("classify", deps) });
    await createContentHubWorker(deps).drain();
  }
  const runs = async (step: string) =>
    (await dev.db.query<any>(`select provider, model from public.ch_ai_runs where document_id = $1 and step = $2`, [docId, step])).rows.map((r) => `${r.provider}:${r.model}`);

  it("o banco devolve quem escreveu cada afirmação e cada versão", async () => {
    // Verificação com a OpenAI: o teste seguinte confere com o Gemini sem reaproveitar respostas guardadas deste
    await on("anthropic", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    await newDocument("Apostila quem escreveu");
    await process(centralDeps());
    const claims = await db.service<any[]>("ch_worker_claims", { p_document_id: docId });
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.created_by_model === A.model)).toBe(true);
    const versions = await db.service<any[]>("ch_worker_unit_versions", { p_document_id: docId });
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((v) => v.generated_by_model === A.model)).toBe(true);
    const one = await db.service<any>("ch_worker_unit_version", { p_version_id: versions[0].version_id });
    expect(one.generated_by_model).toBe(A.model);
  });

  it("Criação e Verificação com o Claude: a evidência e a revisão automática saem pelo Gemini", async () => {
    await on("anthropic", "gemini", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", { provider: "anthropic", model: "claude-opus-5-5" });
    await refresh();
    await newDocument("Apostila mesma empresa");
    await process(centralDeps());
    expect(await runs("claims")).toEqual(expect.arrayContaining([key(A)]));
    const evidence = await runs("evidence");
    expect(evidence.length).toBeGreaterThan(0);
    expect(new Set(evidence)).toEqual(new Set([key(G)]));
    const review = await runs("review_check");
    expect(review.length).toBeGreaterThan(0);
    expect(new Set(review)).toEqual(new Set([key(G)]));
    // a marca da revisão automática diz qual IA conferiu
    const versions = await db.service<any[]>("ch_worker_unit_versions", { p_document_id: docId });
    const flags = versions.flatMap((v) => (v.review_flags ?? []).filter((f: any) => f.by === "ai_review"));
    for (const f of flags) expect(f.model).toBe(G.model);
  });

  it("só o Claude ligado: a evidência espera (sem gastar tentativa), com o aviso de qual IA ligar", async () => {
    await on("anthropic");
    await saveFn("criacao", A);
    await saveFn("verificacao", A);
    await refresh();
    await newDocument("Apostila sem outra empresa");
    await process(centralDeps());
    const job = (await dev.db.query<any>(`select status, attempts, error from public.ch_jobs where document_id = $1 and step = 'evidence'`, [docId])).rows[0];
    expect(job).toMatchObject({ status: "blocked", attempts: 0 });
    expect(job.error).toBe("Falta uma IA de outra empresa para conferir (quem escreveu foi Claude): ligue Gemini ou OpenAI na Central de IAs.");
    expect(await runs("evidence")).toEqual([]);
  });
});
