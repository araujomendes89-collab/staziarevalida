/**
 * Ajudante dos testes das rotas /api/admin-assistant: banco de desenvolvimento em memória, pessoas fixas, servidor Express real
 * e chamadas HTTP. Nunca chama IA, link ou rede de verdade (IA por mockRespond/aiMaker, link por fetchImpl falso).
 */
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../../server/contentHub/infra";
import { invalidateAiConfig } from "../../../server/ai/config";
import { createAdminAssistantRouter, type AdminAssistantDeps } from "../../../server/adminAssistant/router";

const P = "00000000-0000-4000-8000-";
export const IDS = { ADMIN: `${P}0000000000ad`, EDITOR: `${P}0000000000e1`, STUDENT: `${P}0000000000b1`, REVIEWER_GO: `${P}0000000000f1` };

export const FIXED_PAGE =
  "<html><head><title>Diretriz</title></head><body><p>Bronquiolite: suporte é a base do tratamento, com oxigênio quando a saturação cai abaixo de 90%.</p></body></html>";

export interface ListenOptions {
  db?: ContentDb;
  mockRespond?: AdminAssistantDeps["mockRespond"];
  aiMaker?: AdminAssistantDeps["aiMaker"];
  embedder?: AdminAssistantDeps["embedder"];
  fetchImpl?: typeof fetch;
  checkHost?: (host: string) => Promise<void>;
}

export interface AssistantHarness {
  dev: DevDatabase;
  db: ContentDb;
  tokens: { admin: string; editor: string; student: string; reviewer: string };
  listen(o?: ListenOptions): Promise<string>;
  call(url: string, token: string, body?: unknown): Promise<{ status: number; body: any }>;
  resetAi(): Promise<void>;
  enableAi(): Promise<void>;
  aiCalls(): Promise<any[]>;
  seedQuestion(id: string, extra?: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

export async function startAssistantHarness(): Promise<AssistantHarness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assistente-abas-"));
  const dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  const db = devContentDb(async () => dev);
  const sql = (text: string, params: unknown[] = []) => dev.db.query<any>(text, params);
  await sql(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev'), ($4, 're@t.dev')`, [IDS.ADMIN, IDS.EDITOR, IDS.STUDENT, IDS.REVIEWER_GO]);
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [IDS.ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [IDS.EDITOR]);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA')`, [IDS.REVIEWER_GO]);
  const tokens = {
    admin: await dev.createSession(IDS.ADMIN),
    editor: await dev.createSession(IDS.EDITOR),
    student: await dev.createSession(IDS.STUDENT),
    reviewer: await dev.createSession(IDS.REVIEWER_GO),
  };
  const servers: Server[] = [];

  const listen: AssistantHarness["listen"] = (o = {}) =>
    new Promise((resolve) => {
      const app = express();
      app.use(express.json({ limit: "50mb" }));
      app.use(
        "/api/admin-assistant",
        createAdminAssistantRouter({
          db: o.db ?? db,
          embedder: o.embedder ?? null,
          mockRespond: o.mockRespond,
          aiMaker: o.aiMaker,
          checkHost: o.checkHost ?? (async () => {}),
          fetchImpl: o.fetchImpl ?? ((async () => new Response(FIXED_PAGE, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch),
        })
      );
      const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/admin-assistant`));
      servers.push(srv);
    });

  const call: AssistantHarness["call"] = async (url, token, body) => {
    const r = await fetch(url, body === undefined ? { headers: { Authorization: `Bearer ${token}` } } : { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };

  const resetAi = async () => {
    for (const text of [
      "delete from public.ai_calls",
      "delete from public.ai_functions",
      "delete from public.ai_model_prices",
      "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
      "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
    ])
      await sql(text);
    invalidateAiConfig(db);
  };
  const enableAi = async () => {
    await db.service("ch_worker_ai_set_provider", { p_actor: IDS.ADMIN, p_provider: "gemini", p_enabled: true });
    for (const key of ["assistente_preencher", "assistente_conferir", "assistente_revisar"])
      await db.service("ch_worker_ai_save_function", {
        p_actor: IDS.ADMIN,
        p_key: key,
        p_config: { mode: "sozinha", primary_ref: { provider: "gemini", model: "gemini-2.5-pro" }, fallback_ref: null, reviewers: [], care: "caprichado" },
      });
    invalidateAiConfig(db);
  };
  const aiCalls = async () => (await sql(`select function_key, provider, source, item_id, actor_id, outcome from public.ai_calls order by id`)).rows;

  const seedQuestion: AssistantHarness["seedQuestion"] = async (id, extra = {}) => {
    await sql(`insert into public.exams (id, kind, year, semester, title) values ('e-assistente', 'REVALIDA', 2024, 1, 'Prova do assistente') on conflict do nothing`);
    const n = (await sql(`select coalesce(max(number), 0)::int + 1 as n from public.questions where exam_id = 'e-assistente'`)).rows[0].n;
    const row: Record<string, unknown> = {
      id,
      code: `T-${id}`,
      exam_id: "e-assistente",
      number: n,
      area: "PEDIATRIA",
      topic: "Bronquiolite viral aguda",
      subtopic: "Manejo",
      statement: "Lactente de 5 meses com coriza, tosse e sibilos há 3 dias. Qual a conduta?",
      options: JSON.stringify(["A", "B", "C", "D"].map((l) => ({ id: l, text: `Alternativa ${l}`, explanation: "" }))),
      correct_option: "B",
      status: "valid",
      ...extra,
    };
    const cols = Object.keys(row);
    await sql(`insert into public.questions (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c]));
  };

  return {
    dev,
    db,
    tokens,
    listen,
    call,
    resetAi,
    enableAi,
    aiCalls,
    seedQuestion,
    async close() {
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
      await dev.db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}
