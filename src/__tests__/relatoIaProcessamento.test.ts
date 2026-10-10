// @vitest-environment node
/**
 * Relato da IA do processamento (falha vista em produção, 2026-10-09): a cada rodada a tarefa do Cloud Run registrava
 * "IA do processamento: IA não configurada: defina CONTENT_HUB_AI_PROVIDER..." mesmo com a IA da Central funcionando. O relato
 * olhava a configuração antiga (variável CONTENT_HUB_AI_PROVIDER), que as etapas não usam desde a Central de IAs. Agora o relato
 * confere as funções da Central (Criação e Verificação) com as chaves do próprio processamento, sem chamar IA nenhuma; a falta
 * real aparece no log e no painel, e o aviso velho, de relatos antigos, continua escondido. Sem rede: provedores falsos.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import express from "express";
import type http from "http";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "relato-ia-"));
const ADMIN = "00000000-0000-4000-8000-0000000000af";
let dev: DevDatabase;
let db: ContentDb;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ri@t.dev')`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const A = { provider: "anthropic", model: "claude-sonnet-5-5" };
const O = { provider: "openai", model: "gpt-6.1-sol" };
/** O relato antigo: a variável que o processamento não usa mais. */
const OLD = { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada: defina CONTENT_HUB_AI_PROVIDER (anthropic ou gemini) e a chave no servidor." } };
const aiMaker = (ref: { provider: string; model: string }) =>
  ({
    name: ref.provider,
    model: ref.model,
    isMock: false,
    async generate() {
      throw new Error("o relato não pode chamar IA");
    },
  }) as any;
const deps = (extra: any = {}) => ({ db, ai: OLD, aiMaker, renderer: { templateVersion: "t", brandVersion: "b" }, ...extra }) as any;

async function resetAiState() {
  const { invalidateAiConfig } = await import("../../server/ai/config");
  for (const sql of [
    "delete from public.ai_calls",
    "delete from public.ai_functions",
    "delete from public.ai_model_prices",
    "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
    "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
    "update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')",
  ]) {
    await dev.db.query(sql);
  }
  invalidateAiConfig(db);
}
const on = async (...ids: string[]) => {
  for (const id of ids) await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: id, p_enabled: true });
};
const saveFn = (k: string, primary: object) =>
  db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: null, reviewers: [], care: "caprichado" } });
const refresh = async () => (await import("../../server/ai/config")).invalidateAiConfig(db);
const probe = async (d: any) => (await import("../../server/contentHub/capabilities")).probeProcessing(d);
const iaLines = (pending: string[]) => pending.filter((p) => p.startsWith("IA do processamento"));

describe("relato do processamento: IA da Central de IAs", () => {
  beforeEach(resetAiState);
  afterEach(() => vi.unstubAllEnvs());

  it("Central pronta: nenhuma pendência de IA, mesmo sem CONTENT_HUB_AI_PROVIDER (o aviso falso some)", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    const report = await probe(deps());
    expect(iaLines(report.pending)).toEqual([]);
    expect(report.pending.join(" ")).not.toContain("CONTENT_HUB_AI_PROVIDER");
    expect(report.ai).toMatchObject({
      ready: true,
      source: "central",
      functions: { criacao: { ready: true, provider: "anthropic", model: A.model }, verificacao: { ready: true, provider: "openai", model: O.model } },
      pending: null,
    });
    // só leitura: nenhuma chamada de IA registrada
    expect((await dev.db.query<any>("select count(*)::int n from public.ai_calls")).rows[0].n).toBe(0);
  });

  it("IAs desligadas na Central: a falta real aparece, com a função", async () => {
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    const report = await probe(deps());
    expect(report.ai.ready).toBe(false);
    expect(report.pending).toContain("IA do processamento (Criação): Claude está desligada na Central de IAs.");
    expect(iaLines(report.pending).some((p) => p.startsWith("IA do processamento (Verificação):"))).toBe(true);
  });

  it("chave ausente no processamento: a falta aparece (sem chamar a IA nem usar a rede)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await on("anthropic", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    const report = await probe(deps({ aiMaker: undefined }));
    expect(report.pending).toContain("IA do processamento (Criação): ANTHROPIC_API_KEY vazia no servidor.");
  });

  it("IA desligada pelo administrador (sinalizador ai_enabled): aparece com o mesmo começo", async () => {
    await on("anthropic", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    await dev.db.query(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    const report = await probe(deps());
    expect(report.ai.ready).toBe(false);
    expect(report.pending).toContain("IA do processamento: IA desligada pelo administrador (sinalizador ai_enabled).");
  });

  it("Central ilegível: o relato diz que não conseguiu ler, sem esconder", async () => {
    const broken = { ...db, service: async (fn: string, args?: any) => (fn === "ch_worker_ai_config" ? Promise.reject(new Error("banco fora")) : db.service(fn, args)) } as any;
    const report = await probe(deps({ db: broken }));
    expect(report.ai.ready).toBe(false);
    expect(iaLines(report.pending).join(" ")).toMatch(/não foi possível ler a Central de IAs/);
  });

  it("simulação (desenvolvimento): pronta, sem pendência de IA", async () => {
    const mock = { provider: { name: "mock", model: "mock-dev", isMock: true }, status: { ready: true, provider: "mock", model: "mock-dev", isMock: true, pending: null } };
    const report = await probe(deps({ ai: mock }));
    expect(iaLines(report.pending)).toEqual([]);
    expect(report.ai.ready).toBe(true);
  });

  it("linha de início da tarefa: resumo da IA de cada função", async () => {
    const { aiSummaryLine } = await import("../../server/contentHub/capabilities");
    await on("anthropic", "openai");
    await saveFn("criacao", A);
    await saveFn("verificacao", O);
    await refresh();
    expect(aiSummaryLine((await probe(deps())).ai)).toBe(`IA: Criação pronta (${A.model}) · Verificação pronta (${O.model})`);
    await dev.db.query("update public.ai_providers set enabled = false where id = 'openai'");
    await refresh();
    expect(aiSummaryLine((await probe(deps())).ai)).toBe(`IA: Criação pronta (${A.model}) · Verificação pendente`);
  });
});

/**
 * Principal da Criação bloqueada e só a reserva funcionando (revisão, rodada 1): o relato dizia "Criação pronta (gemini-3.5-flash)"
 * e conferia a Verificação como se o Gemini escrevesse. Na prática toda Criação ia para a reserva (Claude Opus, a mais cara) e
 * toda revisão parava em "Falta uma IA de outra empresa pronta para conferir (quem escreveu foi Claude)", sem nada no painel.
 */
describe("relato do processamento: principal bloqueada, só a reserva funciona", () => {
  beforeEach(resetAiState);
  afterEach(() => vi.unstubAllEnvs());

  const G35 = { provider: "gemini", model: "gemini-3.5-flash" };
  const G25 = { provider: "gemini", model: "gemini-2.5-pro" };
  const OPUS = { provider: "anthropic", model: "claude-opus-5" };
  const saveWithReserve = (k: string, primary: object, fallback: object) =>
    db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: k, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: fallback, reviewers: [], care: "caprichado" } });

  async function scenario() {
    await on("gemini", "anthropic");
    await saveWithReserve("criacao", G35, OPUS);
    await saveWithReserve("verificacao", G25, OPUS);
    await refresh();
  }

  function expectReserveReport(report: any, why: RegExp) {
    const { criacao, verificacao } = report.ai.functions;
    // quem responde de fato é a reserva; a principal fica registrada com o motivo
    expect(criacao).toMatchObject({ ready: true, provider: "anthropic", model: OPUS.model, primary: { provider: "gemini", model: G35.model } });
    expect(criacao.primary.blocked).toMatch(why);
    const line = report.pending.find((p: string) => p.startsWith("IA do processamento (Criação):"));
    expect(line).toBeDefined();
    expect(line).toContain(G35.model);
    expect(line).toContain(`reserva ${OPUS.model}`);
    expect(line).toMatch(why);
    // a Verificação é conferida contra quem escreve de fato (Claude): sem Gemini pronto, falta quem confira
    expect(verificacao.ready).toBe(false);
    expect(report.pending.some((p: string) => p.startsWith("IA do processamento (Verificação): Falta uma IA de outra empresa pronta para conferir (quem escreveu foi Claude)"))).toBe(true);
    expect(report.ai.ready).toBe(false);
  }

  it("Cloud Run sem chave do Google: diz que a Criação vai pela reserva e que a Verificação não tem quem confira", async () => {
    const { GOOGLE_KEY_MISSING } = await import("../../server/ai/googleKey");
    for (const k of ["VERTEX_API_KEY", "GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY", "OPENAI_API_KEY"]) vi.stubEnv(k, "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-teste-falsa-sem-rede");
    await scenario();
    const report = await probe(deps({ aiMaker: undefined }));
    expectReserveReport(report, new RegExp(GOOGLE_KEY_MISSING.slice(0, 30)));
    const { aiSummaryLine } = await import("../../server/contentHub/capabilities");
    expect(aiSummaryLine(report.ai)).toBe(`IA: Criação pela reserva (${OPUS.model}; principal ${G35.model} indisponível) · Verificação pendente`);
    expect((await dev.db.query<any>("select count(*)::int n from public.ai_calls")).rows[0].n).toBe(0);
  });

  it("modelo sem preço com os tetos ligados: o mesmo relato, com o motivo do bloqueio", async () => {
    await scenario();
    await dev.db.query(`update public.ai_settings set caps_enabled = true`);
    await dev.db.query(`insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok) values ('anthropic', 'claude-opus-5', 5, 25)`);
    await refresh();
    expectReserveReport(await probe(deps()), /sem preço cadastrado/);
  });

  it("Verificação de outra empresa pronta: só o aviso da reserva da Criação", async () => {
    await on("gemini", "anthropic", "openai");
    await saveWithReserve("criacao", G35, OPUS);
    await saveFn("verificacao", O);
    await dev.db.query(`update public.ai_settings set caps_enabled = true`);
    await dev.db.query(`insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok) values ('anthropic', 'claude-opus-5', 5, 25), ('openai', $1, 1, 1)`, [O.model]);
    await refresh();
    const report = await probe(deps());
    expect(report.ai.functions.verificacao).toMatchObject({ ready: true, provider: "openai", model: O.model });
    expect(iaLines(report.pending)).toHaveLength(1);
    expect(iaLines(report.pending)[0]).toMatch(/^IA do processamento \(Criação\): .*reserva claude-opus-5/);
    const { aiSummaryLine } = await import("../../server/contentHub/capabilities");
    expect(aiSummaryLine(report.ai)).toBe(`IA: Criação pela reserva (${OPUS.model}; principal ${G35.model} indisponível) · Verificação pronta (${O.model})`);
  });
});

describe("painel (/status): pendências de IA do relato", () => {
  beforeEach(resetAiState);

  async function status(d: any) {
    const { createContentHubRouter } = await import("../../server/contentHub/router");
    const token = await dev.createSession(ADMIN);
    const app = express();
    app.use("/api/content-hub", createContentHubRouter(d, { worker: null }));
    const srv = await new Promise<http.Server>((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub/status`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      return await res.json();
    } finally {
      await new Promise((r) => srv.close(r));
    }
  }
  const report = (extra: object) =>
    db.service("ch_worker_report", {
      p_worker: "cloud_run",
      p_report: { where: "cloud_run", renderer: true, python: true, ocr_languages: ["por"], brand: { version: "1", pending: [] }, checked_at: new Date().toISOString(), ...extra },
    });

  it("relato novo (da Central) com falta de IA: aparece no painel", async () => {
    await on("anthropic");
    await saveFn("criacao", A);
    await refresh();
    const line = "IA do processamento (Criação): ANTHROPIC_API_KEY vazia no servidor.";
    await report({ ai: { ready: false, source: "central", functions: {}, pending: line }, pending: [line] });
    const s = await status(deps());
    expect(s.pending).toContain(line);
  });

  it("relato antigo com o aviso de CONTENT_HUB_AI_PROVIDER: continua escondido", async () => {
    const old = `IA do processamento: ${OLD.status.pending}`;
    await report({ ai: { ready: false, provider: null, pending: OLD.status.pending }, pending: [old] });
    const s = await status(deps());
    expect(s.pending.some((p: string) => p.includes("CONTENT_HUB_AI_PROVIDER"))).toBe(false);
  });

  it("relato novo com motivo de IA: não repete a linha geral de nenhuma função pronta", async () => {
    const none = "Nenhuma função da Central de IAs está pronta: ligue e configure as IAs em Administração › Central de IAs.";
    const line = "IA do processamento (Criação): Claude está desligada na Central de IAs.";
    await report({ ai: { ready: false, source: "central", functions: {}, pending: line }, pending: [line] });
    const s = await status(deps());
    expect(s.pending).toContain(line);
    expect(s.pending).not.toContain(none);
  });
});
