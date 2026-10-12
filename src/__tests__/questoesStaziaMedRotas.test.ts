// @vitest-environment node
/**
 * Questões StaziaMed — rotas do servidor e estimativa de custo (Tarefa 9): custo por chamada pelos preços da Central de IAs,
 * "Cadastre fontes oficiais na Central de Conteúdo" sem gastar nada, pedido que vira tarefas, Conferir pendentes sem duplicar e
 * a regra de que só a equipe (administrador ou editor) usa as rotas.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AiConfig } from "../../server/ai/config";
import { estimateCostUsd } from "../../server/ai/prices";
import { CALL_PROFILE, estimateChecks, estimateGeneration, estimateSource } from "../../server/contentHub/questoes/estimate";
import { createContentHubRouter } from "../../server/contentHub/router";
import { addOfficialSource, insertDraft, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });

const price = (provider: string, model: string, i: number, o: number) => ({ provider, model, input_per_mtok: i, output_per_mtok: o, per_search_usd: null, source_url: "", checked_on: "2026-10-11" }) as any;
const cfg = (over: Partial<AiConfig> = {}): AiConfig =>
  ({
    providers: {} as any,
    functions: {
      criacao: { key: "criacao", mode: "sozinha", primary: { provider: "openai", model: "gpt-teste" }, fallback: null, reviewers: [], care: "caprichado", max_searches: null },
      verificacao: {
        key: "verificacao", mode: "linha", primary: { provider: "anthropic", model: "claude-teste" }, fallback: null, care: "caprichado", max_searches: null,
        reviewers: [{ provider: "gemini", model: "gemini-teste" }, { provider: "anthropic", model: "claude-teste" }, { provider: "gemini", model: "gemini-teste" }],
      },
    } as any,
    settings: { monthly_cap_usd: 100, per_run_cap_usd: 5, caps_enabled: true, tab_override_enabled: false },
    prices: [price("openai", "gpt-teste", 2, 10), price("anthropic", "claude-teste", 3, 15), price("gemini", "gemini-teste", 1, 5)],
    ...over,
  }) as AiConfig;
const usd = (i: number, o: number, kind: keyof typeof CALL_PROFILE) => estimateCostUsd({ input_per_mtok: i, output_per_mtok: o }, CALL_PROFILE[kind].inputChars, CALL_PROFILE[kind].maxOut)!;

describe("Estimativa de custo", () => {
  it("gerar 3: 18 a 36 chamadas; custo = soma de estimateCostUsd da criadora e dos conferentes da Central", () => {
    const e = estimateGeneration(cfg(), 3, {});
    expect(e.chamadas_min).toBe(18);
    expect(e.chamadas_max).toBe(36);
    // criação 1 (2) + fontes 1 (2) + atualidade 1 (2) + revisão clínica 2 (4) + pedagógica 1 (2), por questão
    const one = (n: number) => 3 * n * usd(2, 10, "criacao") + 3 * n * usd(1, 5, "conferencia") /* fontes */ + 3 * n * usd(3, 15, "conferencia") /* atualidade */ + 3 * 2 * n * usd(1, 5, "conferencia") /* clínica */ + 3 * n * usd(1, 5, "conferencia");
    expect(e.usd_min).toBeCloseTo(one(1), 4);
    expect(e.usd_max).toBeCloseTo(one(2), 4);
    expect(e.sem_preco).toEqual([]);
    expect(e.ias).toEqual({ criadora: "openai/gpt-teste", conferentes: ["gemini/gemini-teste", "anthropic/claude-teste"] });
  });

  it("modelo sem preço aparece em sem_preco e o custo fica nulo; Ollama custa 0", () => {
    const semPreco = estimateGeneration(cfg({ prices: [price("openai", "gpt-teste", 2, 10)] }), 2, {});
    expect(semPreco.usd_min).toBeNull();
    expect(semPreco.usd_max).toBeNull();
    expect(semPreco.sem_preco.sort()).toEqual(["anthropic/claude-teste", "gemini/gemini-teste"]);
    expect(semPreco.chamadas_min).toBe(12);
    const base = cfg();
    const local = estimateChecks({ ...base, functions: { ...base.functions, verificacao: { ...base.functions.verificacao!, reviewers: [], primary: { provider: "ollama", model: "qwen3:8b" } } } } as AiConfig, 10, {});
    expect(local).toMatchObject({ chamadas_min: 50, chamadas_max: 50, usd_min: 0, usd_max: 0, sem_preco: [] });
  });

  it("conferir: 5 chamadas por rascunho; buscar fonte: 1 por afirmação", () => {
    expect(estimateChecks(cfg(), 4, {})).toMatchObject({ chamadas_min: 20, chamadas_max: 20 });
    const s = estimateSource(cfg(), 3, {});
    expect(s).toMatchObject({ chamadas_min: 3, chamadas_max: 3, ias: { criadora: null, conferentes: ["gemini/gemini-teste"] } });
    expect(s.usd_min).toBeCloseTo(3 * usd(1, 5, "conferencia"), 4);
  });
});

describe("Rotas", () => {
  let env: StaziaEnv;
  const servers: Server[] = [];
  let base = "";
  const tokens: Record<string, string> = {};
  const call = async (uid: string, path: string, body?: object) => {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${tokens[uid]}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json() };
  };
  let topic: { area: string; topic: string };

  beforeAll(async () => {
    env = await openStaziaEnv();
    const deps = { db: env.db, storage: {} as any, ai: { provider: null, status: { ready: true, provider: "anthropic", model: "modelo-de-teste", isMock: false } }, renderer: null } as any;
    const app = express();
    app.use(express.json());
    app.use("/api/content-hub", createContentHubRouter(deps, {}));
    await new Promise<void>((resolve) => {
      const srv = app.listen(0, () => {
        base = `http://127.0.0.1:${(srv.address() as any).port}/api/content-hub/questoes-staziamed`;
        servers.push(srv);
        resolve();
      });
    });
    for (const uid of [USERS.ADMIN, USERS.EDITOR, USERS.REVISOR_PED, USERS.PRO, USERS.TESTE]) tokens[uid] = await env.dev.createSession(uid);
    topic = (await env.sql<{ area: string; topic: string }>(`select area, topic from public.staziamed_topic_weights('PEDIATRIA') limit 1`))[0];
  }, 600_000);
  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    await env?.close();
  }, 60_000);

  it("sem fonte oficial: gerar e buscar fonte respondem 409 'Cadastre fontes oficiais na Central de Conteúdo' e nada é gravado", async () => {
    const draft = await insertDraft(env);
    const jobs = async () => Number((await env.sql(`select count(*)::int as n from public.ch_jobs`))[0].n);
    const requests = async () => Number((await env.sql(`select count(*)::int as n from public.staziamed_requests`))[0].n);
    const before = [await jobs(), await requests()];
    expect(await call(USERS.EDITOR, "/estimativa", { acao: "gerar", quantidade: 3 })).toMatchObject({ status: 409, body: { error: "Cadastre fontes oficiais na Central de Conteúdo" } });
    expect(await call(USERS.EDITOR, "/estimativa", { acao: "fonte", rascunho: draft })).toMatchObject({ status: 409, body: { error: "Cadastre fontes oficiais na Central de Conteúdo" } });
    expect(await call(USERS.EDITOR, "/pedidos", { modo: "tema", area: topic.area, tema: topic.topic, quantidade: 3 })).toMatchObject({ status: 409 });
    expect(await call(USERS.EDITOR, `/rascunhos/${draft}/buscar-fonte`)).toMatchObject({ status: 409 });
    expect([await jobs(), await requests()]).toEqual(before);
  });

  it("pedido de editor vira tarefas na fila; revisor sem papel de equipe e aluno recebem 403", async () => {
    await addOfficialSource(env, { title: "PCDT de teste", text: `${topic.topic}. Texto oficial sobre o tema.` });
    const est = await call(USERS.EDITOR, "/estimativa", { acao: "gerar", quantidade: 3 });
    expect(est.status).toBe(200);
    expect(est.body).toMatchObject({ chamadas_min: 18, chamadas_max: 36, acervo: 1, teto: { ligado: expect.any(Boolean) } });
    expect(Array.isArray(est.body.ia_pendente)).toBe(true);
    expect(await call(USERS.EDITOR, "/estimativa", { acao: "gerar", quantidade: 21 })).toMatchObject({ status: 400, body: { error: "Escolha de 1 a 20 questões." } });
    for (const uid of [USERS.REVISOR_PED, USERS.PRO, USERS.TESTE]) {
      expect(await call(uid, "/estimativa", { acao: "gerar", quantidade: 3 }), uid).toMatchObject({ status: 403, body: { error: "Gerar, conferir e buscar fonte é da equipe (administrador ou editor)." } });
      expect((await call(uid, "/pedidos", { modo: "tema", area: topic.area, tema: topic.topic, quantidade: 3 })).status, uid).toBe(403);
    }
    const r = await call(USERS.EDITOR, "/pedidos", { modo: "tema", area: topic.area, tema: topic.topic, quantidade: 3 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ mode: "tema", count: 3, state: "na_fila" });
    expect(r.body.estimate).toMatchObject({ chamadas_min: 18, chamadas_max: 36 });
    expect((await env.sql(`select count(*)::int as n from public.ch_jobs where scope_key like $1 and step = 'question_generate'`, [`staziamed:${r.body.id}:%`]))[0].n).toBe(3);
    // o mesmo pedido em seguida
    expect(await call(USERS.EDITOR, "/pedidos", { modo: "tema", area: topic.area, tema: topic.topic, quantidade: 3 })).toMatchObject({ status: 409, body: { error: "Este pedido já está na fila." } });
    expect((await call(USERS.EDITOR, "/pedidos", { modo: "outro", quantidade: 3 })).status).toBe(400);
  });

  it("Conferir pendentes: estimativa pelo número de rascunhos do filtro; enfileirar duas vezes não duplica", async () => {
    await insertDraft(env, { batch: "lote-rotas", stem: "Primeiro enunciado do lote das rotas, sobre tema A." });
    await insertDraft(env, { batch: "lote-rotas", stem: "Segundo enunciado do lote das rotas, bem diferente." });
    const est = await call(USERS.ADMIN, "/estimativa", { acao: "conferir", filtro: { batch: "lote-rotas" } });
    expect(est.status).toBe(200);
    expect(est.body).toMatchObject({ chamadas_min: 10, chamadas_max: 10 });
    expect(est.body.rascunhos).toHaveLength(2);
    const first = await call(USERS.ADMIN, "/conferir", { filtro: { batch: "lote-rotas" } });
    expect(first).toMatchObject({ status: 200, body: { na_fila: 2, ja_na_fila: 0 } });
    expect((await call(USERS.ADMIN, "/conferir", { filtro: { batch: "lote-rotas" } })).body).toEqual({ na_fila: 0, ja_na_fila: 2 });
    expect((await call(USERS.ADMIN, "/conferir", { filtro: { batch: "lote-que-nao-existe" } })).body).toEqual({ na_fila: 0, ja_na_fila: 0 });
    expect((await call(USERS.TESTE, "/conferir", { filtro: {} })).status).toBe(403);
  });

  it("buscar fonte: sem decisão clínica 400 'Preencha a decisão clínica central'; com decisão entra na fila uma vez", async () => {
    const semDecisao = await insertDraft(env, { clinical_decision: " " });
    expect(await call(USERS.EDITOR, "/estimativa", { acao: "fonte", rascunho: semDecisao })).toMatchObject({ status: 400, body: { error: "Preencha a decisão clínica central" } });
    expect(await call(USERS.EDITOR, `/rascunhos/${semDecisao}/buscar-fonte`)).toMatchObject({ status: 400, body: { error: "Preencha a decisão clínica central" } });
    const ok = await insertDraft(env);
    const est = await call(USERS.EDITOR, "/estimativa", { acao: "fonte", rascunho: ok });
    expect(est.status).toBe(200);
    expect(est.body.chamadas_min).toBeGreaterThanOrEqual(2);
    expect(est.body.chamadas_min).toBeLessThanOrEqual(8);
    const first = await call(USERS.EDITOR, `/rascunhos/${ok}/buscar-fonte`);
    expect(first.status).toBe(200);
    expect(first.body.ja_na_fila).toBe(false);
    expect((await call(USERS.EDITOR, `/rascunhos/${ok}/buscar-fonte`)).body.ja_na_fila).toBe(true);
    expect((await call(USERS.EDITOR, "/rascunhos/nao-e-id/buscar-fonte")).status).toBe(400);
  });

  it("sem login: 401", async () => {
    const res = await fetch(`${base}/estimativa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });
});
