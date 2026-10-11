// @vitest-environment node
/**
 * Texto seguro para o banco (falha vista em produção, 2026-10-09): "[central] claims erro (queued): unsupported Unicode escape
 * sequence". O Postgres recusa o caractere nulo (U+0000) em text/jsonb e metade solta de par substituto em jsonb; a resposta de
 * uma IA (ou o texto de um PDF) com esse caractere derrubava a gravação da etapa e cada nova tentativa pagava a IA de novo.
 * A saída única para o banco (ContentDb) limpa esses caracteres. Sem rede: provedores falsos e banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, safeForDb, type ContentDb } from "../../server/contentHub/infra";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "texto-seguro-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ae";
const adminUser = { id: ADMIN, email: "ts@t.dev" };
let dev: DevDatabase;
let db: ContentDb;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ts@t.dev')`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("safeForDb", () => {
  it("tira o caractere nulo e troca metade solta de par substituto, em qualquer profundidade", () => {
    const d = new Date(0);
    const input = { a: ["x\u0000y", { b: "corte\ud835" }], n: 1, z: null, d, ok: true };
    const out = safeForDb(input);
    expect(out).toEqual({ a: ["xy", { b: "corte�" }], n: 1, z: null, d, ok: true });
    expect(out.d).toBe(d);
  });

  it("metade baixa solta também vira o sinal de substituição", () => {
    expect(safeForDb("a\udefcb")).toBe("a�b");
  });

  it("pares válidos (letra matemática, emoji) e acentos ficam como estão", () => {
    const s = "𝛼 dose 😀 ação";
    expect(safeForDb(s)).toBe(s);
    expect(safeForDb({ s })).toEqual({ s });
  });

  it("limpa também as chaves dos objetos", () => {
    expect(safeForDb({ ["k\u0000"]: 1 })).toEqual({ k: 1 });
  });

  it("não muda o objeto recebido", () => {
    const input = { a: ["x\u0000y"] };
    safeForDb(input);
    expect(input.a[0]).toBe("x\u0000y");
  });
});

describe("gravação no banco com caracteres que o Postgres recusa", () => {
  async function newDocument(name: string) {
    const sha = (await import("crypto")).createHash("sha256").update(name).digest("hex");
    const r = await db.asUser<{ id: string }>(adminUser, "app_ch_register_document", { p_doc: { name, sha256: sha, storage_path: `documents/${sha}.pdf`, rights_status: "own" } });
    return r.id;
  }

  it("ch_worker_log_ai_run grava a resposta da IA sem o caractere nulo e sem metade solta", async () => {
    const id = await db.service<string>("ch_worker_log_ai_run", {
      p_run: {
        step: "claims",
        provider: "mock",
        model: "m",
        prompt_id: "claims",
        prompt_version: "1",
        schema_version: "1",
        input_hash: "h-nul",
        status: "ok",
        output: { claims: [{ population: "adultos\u0000", conditions: "corte\ud835" }] },
        error: "erro\u0000",
      },
    });
    const row = (
      await dev.db.query<any>(
        `select output->'claims'->0->>'population' as population, output->'claims'->0->>'conditions' as conditions, error from public.ch_ai_runs where id = $1`,
        [id]
      )
    ).rows[0];
    expect(row).toEqual({ population: "adultos", conditions: "corte�", error: "erro" });
  });

  it("ch_worker_save_extraction grava o texto do PDF sem o caractere nulo", async () => {
    const docId = await newDocument("Extração com nulo");
    await db.service("ch_worker_save_extraction", {
      p_document_id: docId,
      p_text_kind: "text",
      p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }],
      p_blocks: [{ page_no: 1, idx: 0, type: "paragraph", text: "Dose\u0000 10 mg", bbox: [0, 0, 1, 1] }],
    });
    const row = (await dev.db.query<any>(`select original_text from public.ch_blocks where document_id = $1`, [docId])).rows[0];
    expect(row.original_text).toBe("Dose 10 mg");
  });

  it("as funções app_* (como o usuário) também recebem o texto limpo", async () => {
    const sha = (await import("crypto")).createHash("sha256").update("nome-com-nulo").digest("hex");
    const r = await db.asUser<{ id: string }>(adminUser, "app_ch_register_document", { p_doc: { name: "Apostila\u0000 nula", sha256: sha, storage_path: `documents/${sha}.pdf`, rights_status: "own" } });
    const row = (await dev.db.query<any>(`select name from public.ch_documents where id = $1`, [r.id])).rows[0];
    expect(row.name).toBe("Apostila nula");
  });

  it("etapa de afirmações: resposta da IA com caractere nulo é gravada e a etapa termina (não volta para a fila)", async () => {
    const { invalidateAiConfig } = await import("../../server/ai/config");
    for (const id of ["anthropic", "openai"]) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
    const save = (k: string, ref: { provider: string; model: string }) =>
      db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode: "sozinha", primary_ref: ref, fallback_ref: null, reviewers: [], care: "caprichado" } });
    await save("criacao", { provider: "anthropic", model: "claude-sonnet-5-5" });
    await save("verificacao", { provider: "openai", model: "gpt-6.1-sol" });
    invalidateAiConfig(db);

    const { mockRespond } = await import("../../server/contentHub/ai/mock");
    const aiMaker = (ref: { provider: string; model: string }) =>
      ({
        name: ref.provider,
        model: ref.model,
        isMock: false,
        async generate(req: any) {
          const output: any = mockRespond(req);
          if (Array.isArray(output?.claims)) output.claims = output.claims.map((c: any) => ({ ...c, population: "adultos\u0000" }));
          return { output, provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
        },
      }) as any;
    const noAi = { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada." } };
    const { localStorageDir } = await import("../../server/contentHub/infra");
    const storage = localStorageDir(path.join(tmp, "files"));
    const renderer = { templateVersion: "t1", brandVersion: "b1", render: async () => [] };
    const logs: string[] = [];
    const deps = { db, storage, ai: noAi, aiMaker, renderer, log: (m: string) => logs.push(m) } as any;

    const docId = await newDocument("Afirmações com nulo");
    const text = "Na bronquiolite viral aguda, a oxigenoterapia deve ser iniciada quando a saturação estiver abaixo de 92%.";
    await db.service("ch_worker_save_extraction", {
      p_document_id: docId,
      p_text_kind: "text",
      p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }],
      p_blocks: [
        { page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda", bbox: [0, 0, 1, 1] },
        { page_no: 1, idx: 1, type: "paragraph", text, bbox: [0, 0, 1, 1] },
      ],
    });
    const { stepVersions } = await import("../../server/contentHub/pipeline");
    const { createContentHubWorker } = await import("../../server/contentHub/worker");
    await db.service("ch_worker_next", { p_document_id: docId, p_step: "classify", p_versions: stepVersions("classify", deps) });
    await createContentHubWorker(deps).drain();

    const job = (await dev.db.query<any>(`select status, error from public.ch_jobs where document_id = $1 and step = 'claims'`, [docId])).rows[0];
    expect(logs.filter((l) => /Unicode/.test(l))).toEqual([]);
    expect(job).toMatchObject({ status: "succeeded" });
    const claims = await db.service<any[]>("ch_worker_claims", { p_document_id: docId });
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.context.population === "adultos")).toBe(true);
    const runs = (await dev.db.query<any>(`select count(*)::int as n from public.ch_ai_runs where document_id = $1 and step = 'claims'`, [docId])).rows[0];
    expect(runs.n).toBeGreaterThan(0);
  });
});
