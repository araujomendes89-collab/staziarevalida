// @vitest-environment node
/**
 * IA02 (Administração › Central de IAs), parte só de leitura: o gasto do mês da Central (`ai_calls`, que entra no teto) não cobre o
 * Tutor, as vozes, a transcrição nem a busca por significado, que gravam o gasto em outros lugares (`ai_usage_ledger`, `ch_ai_runs`).
 * `app_admin_ai_spend_month()` (migração 9520) soma o que já fica registrado em cada lugar, sem contar duas vezes o que a Central já
 * conta (as Aulas e o roteiro dos Podcasts também entram no ledger) e sem inventar número: o que tem uso mas custo zero (preço não
 * definido) vem como "sem preço", e o que nem é gravado (rotas antigas, perguntas da busca) a rota marca como "sem registro".
 * Banco de teste local (PGlite) com todas as migrações; sem rede.
 */
import express from "express";
import fs from "fs";
import type http from "http";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gastodomes-"));
const ROOT = path.resolve(__dirname, "../..");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const admin = { id: ADMIN, email: "ad@t.dev" };
const editor = { id: EDITOR, email: "ed@t.dev" };
const student = { id: STUDENT, email: "al@t.dev" };
let dev: DevDatabase;
let db: ContentDb;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ledger = (feature: string, cols: Record<string, number | string> = {}, createdAt = "now()") =>
  dev.db.query(
    `insert into public.ai_usage_ledger (user_id, feature, ${Object.keys(cols).join(", ") || "meta"}, created_at) values ($1, $2, ${Object.keys(cols).map((_, i) => `$${i + 3}`).join(", ") || "'{}'::jsonb"}, ${createdAt})`,
    [STUDENT, feature, ...Object.values(cols)],
  );

describe("app_admin_ai_spend_month: o gasto do mês de tudo o que já fica registrado", () => {
  it("soma por lugar, separa o que não tem preço e não conta em dobro nem fora do mês", async () => {
    // Central (ai_calls): entra no teto e já está no painel de sempre
    await db.service("ch_worker_ai_log_calls", { p_calls: [{ run_id: null, function_key: "criacao", mode: "sozinha", role: "principal", provider: "gemini", model: "g", input_tokens: 10, output_tokens: 5, cost_usd: 1.5, duration_ms: 1, outcome: "ok", source: "aula" }] });
    // Tutor: conversa e avaliação (a reserva da cota, sem tokens, não conta como uso)
    await ledger("tutor_text", { input_text_tokens: 1000, output_text_tokens: 200, estimated_cost_usd: 0.25 });
    await ledger("tutor_text", { interactions: 1 });
    await ledger("tutor_eval", { input_text_tokens: 500, output_text_tokens: 100, estimated_cost_usd: 0.05 });
    // Tutor: voz ao vivo (tutor_voice é só o tempo da cota: o custo está nas outras linhas)
    await ledger("tutor_voice_live", { duration_seconds: 600, estimated_cost_usd: 0.5 });
    await ledger("tutor_voice", { duration_seconds: 600 });
    // Tutor: transcrição e voz do professor, com uso mas sem preço definido no painel do Tutor (custo 0)
    await ledger("tutor_stt", { duration_seconds: 30, estimated_cost_usd: 0 });
    await ledger("tutor_tts", { characters: 500, estimated_cost_usd: 0 });
    await ledger("tutor_tts_audicao", { characters: 200, estimated_cost_usd: 0.01 });
    // Podcasts: o áudio conta; o roteiro e as Aulas já estão em ai_calls e não entram de novo
    await ledger("podcast_tts", { characters: 3000, duration_seconds: 120, estimated_cost_usd: 0.3 });
    await ledger("podcast_script", { input_text_tokens: 9000, output_text_tokens: 9000, estimated_cost_usd: 9 });
    await ledger("lesson_assist", { input_text_tokens: 9000, output_text_tokens: 9000, estimated_cost_usd: 9 });
    // fora do mês: não entra
    await ledger("tutor_text", { input_text_tokens: 1000, estimated_cost_usd: 7 }, "now() - interval '70 days'");
    // busca por significado (ch_ai_runs, etapa embeddings); as outras etapas já estão em ai_calls
    await dev.db.query(
      `insert into public.ch_ai_runs (step, provider, model, prompt_id, prompt_version, schema_version, input_hash, status, input_tokens, output_tokens, cost_usd)
       values ('embeddings', 'gemini', 'gemini-embedding-2', 'p', '1', '768d', 'h1', 'ok', 5000, 0, 0.001), ('classify', 'gemini', 'g', 'p', '1', '1', 'h2', 'ok', 5000, 100, 4)`,
    );

    const r = await db.asUser<any>(admin, "app_admin_ai_spend_month");
    expect(r.month_start).toMatch(/^\d{4}-\d{2}-01$/);
    const by = Object.fromEntries(r.groups.map((g: any) => [g.key, g]));
    expect(r.groups.map((g: any) => g.key)).toEqual(["tutor_conversa", "tutor_voz_ao_vivo", "tutor_transcricao", "tutor_voz_professor", "podcasts_audio", "busca_significado"]);
    expect(by.tutor_conversa).toMatchObject({ records: 2, unpriced_records: 0 });
    expect(Number(by.tutor_conversa.cost_usd)).toBeCloseTo(0.3, 6);
    expect(by.tutor_voz_ao_vivo).toMatchObject({ records: 1, unpriced_records: 0 });
    expect(Number(by.tutor_voz_ao_vivo.cost_usd)).toBeCloseTo(0.5, 6);
    expect(by.tutor_transcricao).toMatchObject({ records: 1, unpriced_records: 1 });
    expect(Number(by.tutor_transcricao.cost_usd)).toBe(0);
    expect(by.tutor_voz_professor).toMatchObject({ records: 2, unpriced_records: 1 });
    expect(Number(by.tutor_voz_professor.cost_usd)).toBeCloseTo(0.01, 6);
    expect(by.podcasts_audio).toMatchObject({ records: 1, unpriced_records: 0 });
    expect(Number(by.podcasts_audio.cost_usd)).toBeCloseTo(0.3, 6);
    expect(by.busca_significado).toMatchObject({ records: 1, unpriced_records: 0 });
    expect(Number(by.busca_significado.cost_usd)).toBeCloseTo(0.001, 6);
    // o gasto da Central continua no painel de sempre e não é somado aqui
    const ov = await db.asUser<any>(admin, "app_admin_ai_overview");
    expect(Number(ov.month_spend)).toBeCloseTo(1.5, 6);
    expect(JSON.stringify(r)).not.toMatch(/"criacao"|podcast_script|lesson_assist/);
  });

  it("sem nenhum registro no mês, todos os grupos vêm com zero registros (e a tela não inventa gasto)", async () => {
    await dev.db.query("delete from public.ai_usage_ledger");
    await dev.db.query("delete from public.ch_ai_runs");
    const r = await db.asUser<any>(admin, "app_admin_ai_spend_month");
    expect(r.groups).toHaveLength(6);
    for (const g of r.groups) expect(g).toMatchObject({ cost_usd: 0, records: 0, unpriced_records: 0 });
  });

  it("só o administrador lê: editor e aluno recebem 'Acesso restrito a administradores'", async () => {
    await expect(db.asUser(editor, "app_admin_ai_spend_month")).rejects.toThrow(/Acesso restrito a administradores/);
    await expect(db.asUser(student, "app_admin_ai_spend_month")).rejects.toThrow(/Acesso restrito a administradores/);
  });

  it("a função não deixa visitante nem o papel público executar, e pode ser colada duas vezes", async () => {
    const acl = await dev.db.query<any>(
      `select has_function_privilege('anon', 'public.app_admin_ai_spend_month()', 'execute') as anon,
              has_function_privilege('public', 'public.app_admin_ai_spend_month()', 'execute') as pub`,
    );
    expect(acl.rows[0]).toEqual({ anon: false, pub: false });
    const src = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003009520_central_gasto_do_mes.sql"), "utf8");
    await dev.db.exec(src);
    await dev.db.exec(src);
    const r = await db.asUser<any>(admin, "app_admin_ai_spend_month");
    expect(r.groups).toHaveLength(6);
    // a função é security definer com caminho de busca fixo
    const def = await dev.db.query<any>(`select prosecdef, proconfig from pg_proc where proname = 'app_admin_ai_spend_month'`);
    expect(def.rows[0].prosecdef).toBe(true);
    expect(String(def.rows[0].proconfig)).toMatch(/search_path=""/);
  });

  it("nada é apagado nem alterado: a migração só cria a função", async () => {
    const src = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003009520_central_gasto_do_mes.sql"), "utf8").replace(/--.*$/gm, "");
    expect(src).not.toMatch(/\b(delete|drop|truncate|update|insert|alter)\b/i);
  });
});

// ---------------------------------------------------------------- a rota: junta o que a tela precisa e marca o "sem registro"
describe("GET /overview traz o painel de gasto do mês (all_spend), com o que não tem registro marcado", () => {
  let server: http.Server;
  let base = "";
  const fake = (spend: () => unknown) =>
    ({
      mode: "dev",
      async authenticate() {
        return admin;
      },
      async asUser(_u: unknown, name: string) {
        if (name === "app_ch_whoami") return { admin: true, staff: true };
        if (name === "app_admin_ai_overview") return { providers: [], functions: [], settings: {}, prices: [], month_spend: 1.5 };
        if (name === "app_admin_ai_spend_month") return spend();
        throw new Error(`função inesperada: ${name}`);
      },
      async service(name: string) {
        if (name === "ch_worker_ai_config") return { providers: [], functions: [], settings: {}, prices: [] };
        throw new Error(`função inesperada: ${name}`);
      },
    }) as any;
  let current: () => unknown = () => ({ month_start: "2026-10-01", groups: [] });
  beforeAll(async () => {
    const { createAiRouter } = await import("../../server/ai/router");
    await new Promise<void>((resolve) => {
      const app = express();
      app.use("/api/ai-central", createAiRouter({ db: fake(() => current()) }, { env: {} as any }));
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${(server.address() as any).port}/api/ai-central`;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("devolve os grupos do banco e a lista fixa dos usos sem registro", async () => {
    current = () => ({ month_start: "2026-10-01", groups: [{ key: "tutor_conversa", cost_usd: 0.3, records: 2, unpriced_records: 0 }] });
    const j = await (await fetch(base + "/overview")).json();
    expect(j.all_spend.available).toBe(true);
    expect(j.all_spend.groups).toEqual([{ key: "tutor_conversa", cost_usd: 0.3, records: 2, unpriced_records: 0 }]);
    expect(j.all_spend.no_record.map((x: any) => x.key)).toEqual(["rotas_antigas", "perguntas_busca"]);
    expect(j.month_spend).toBe(1.5);
  });

  it("banco sem a migração 9520 (ainda não colada): o painel de sempre continua e o gasto de tudo vem como indisponível", async () => {
    current = () => {
      throw new Error("function public.app_admin_ai_spend_month() does not exist");
    };
    const r = await fetch(base + "/overview");
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.all_spend).toMatchObject({ available: false, groups: [] });
    expect(j.all_spend.no_record).toHaveLength(2);
    expect(j.month_spend).toBe(1.5);
  });
});
