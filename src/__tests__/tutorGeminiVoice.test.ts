// @vitest-environment node
/**
 * Voz do Tutor pelo Gemini (pedido de 2026-10-06: "ainda está com muito sotaque americano, quero português do Brasil"), com o Google
 * e a OpenAI SIMULADOS (nenhuma chamada externa): o automático prefere o Gemini; a chave temporária leva as instruções, a voz e as
 * ferramentas travadas (o navegador nunca vê a chave principal); se o Google recusar ou o aparelho não conectar, a OpenAI assume
 * na hora; o custo por minuto entra no livro-caixa como tutor_voice_gemini.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { createTutorRouter } from "../../server/tutor/router";
import type { RealtimeConfig } from "../../server/tutor/realtime";
import {
  createGeminiVoiceToken, geminiVoiceConfig, GeminiVoiceError, geminiVoiceName, markGeminiUnavailable, planProviders, resetGeminiAvailability,
  type GeminiVoiceConfig, type LiveConfig,
} from "../../server/tutor/voiceProviders";
import { REALTIME_TOOLS } from "../../server/tutor/tools";
import { voiceTimeCost } from "../../server/tutor/costs";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-gemini-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ALUNA = "00000000-0000-4000-8000-0000000000c1";
const OKEY = "sk-servidor-" + "y".repeat(40);
const GKEY = "AIza" + "g".repeat(35);
/** As duas travas da voz ao vivo dos alunos (VZ01). */
const AO_VIVO = { TUTOR_VOICE_ALLOW_EXTERNAL: "1", TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1" };
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;

// OpenAI simulada (segredo do Realtime) e Google simulado (chave temporária do Gemini)
const openai: string[] = [];
const fakeFetch = (async (url: string) => {
  openai.push(url);
  if (url.endsWith("/realtime/client_secrets")) return new Response(JSON.stringify({ value: "ek_temporario", expires_at: 1_900_000_000 }), { status: 200 });
  if (/\/realtime\/calls\/[^/]+\/hangup$/.test(url)) return new Response("", { status: 200 });
  return new Response("?", { status: 404 });
}) as typeof fetch;
const google: any[] = [];
let googleFails = false;
const geminiClient = {
  authTokens: {
    create: async (params: any) => {
      google.push(params);
      if (googleFails) throw Object.assign(new Error(`PERMISSION_DENIED para a chave ${GKEY}`), { status: 403 });
      return { name: "auth_tokens/temporario123" };
    },
  },
};
const RT: RealtimeConfig = { ready: true, model: "gpt-realtime-2.1", pending: null, key: OKEY, transcribeModel: null };
const LIVE: LiveConfig = { ready: false, model: null, key: null, pending: "sem GPT-Live" };
const GEMINI: GeminiVoiceConfig = { ready: true, model: "gemini-3.8-live", key: GKEY, pending: null };
const deps: any = { mockRespond: () => ({}), realtime: RT, live: LIVE, gemini: GEMINI, geminiClient, fetch: fakeFetch };

let server: Server;
let base: string;
let token: string;
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json(), raw: "" };
};
const end = (id: string) => post("/voice/end", { voice_call_id: id });

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  process.env.TUTOR_AI_PROVIDER = "mock";
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev')`, [ADMIN, ALUNA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ALUNA]);
  await aceitarTermos(dev.db, ALUNA); // a aluna já aceitou o §34 (o aceite em si é testado em termoAceiteTutor.test.ts)
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Tutor ligado para os testes da voz do Gemini.");
  deps.db = db;
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
  token = await dev.createSession(ALUNA);
  await rpc(ALUNA, "app_tutor_save_preferences", { personality_id: "durona" });
}, 300_000);
afterAll(async () => {
  resetGeminiAvailability();
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.TUTOR_SETTINGS_TTL_MS;
});

describe("Qual voz abre", () => {
  it("Gemini pronto com chave e consentimento; o automático prefere o Gemini, depois GPT-Live, depois Realtime; o painel manda", () => {
    expect(geminiVoiceConfig({}).pending).toMatch(/TUTOR_VOICE_ALLOW_EXTERNAL=1/);
    // VZ01: a autorização da equipe sozinha não liga a voz ao vivo dos alunos; precisa também da trava própria
    expect(geminiVoiceConfig({ TUTOR_VOICE_ALLOW_EXTERNAL: "1", GOOGLE_GEMINI_API_KEY: GKEY }).pending).toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1/);
    expect(geminiVoiceConfig({ ...AO_VIVO }).pending).toMatch(/GEMINI_API_KEY/);
    expect(geminiVoiceConfig({ ...AO_VIVO, GOOGLE_GEMINI_API_KEY: GKEY })).toMatchObject({ ready: true, model: "gemini-3.8-live" });
    expect(geminiVoiceConfig({ ...AO_VIVO, GEMINI_API_KEY: GKEY, GEMINI_LIVE_MODEL: "gemini-x-live" }).model).toBe("gemini-x-live");
    const LIVE_OK: LiveConfig = { ready: true, model: "gpt-live-1", key: OKEY, pending: null };
    expect(planProviders("auto", {}, LIVE_OK, RT, true, GEMINI)).toMatchObject({ first: "gemini", fallback: "live", order: ["gemini", "live", "realtime"] });
    expect(planProviders("auto", {}, LIVE_OK, RT, false, GEMINI).order).toEqual(["gemini", "realtime"]); // sem oferta WebRTC, nada de GPT-Live
    expect(planProviders("auto", {}, LIVE_OK, RT, true, GEMINI, ["gemini"]).first).toBe("live"); // não conectou no aparelho
    expect(planProviders("realtime", {}, LIVE_OK, RT, true, GEMINI).order).toEqual(["realtime", "live", "gemini"]);
    expect(planProviders("auto", { OPENAI_VOICE_PROVIDER: "realtime" }, LIVE_OK, RT, true, GEMINI).first).toBe("realtime");
    expect(planProviders("gemini", {}, LIVE_OK, RT, true, { ...GEMINI, ready: false, pending: "sem chave" })).toMatchObject({ first: "live" });
    markGeminiUnavailable();
    expect(planProviders("auto", {}, LIVE_OK, RT, true, GEMINI).first).toBe("live"); // recusado há pouco: espera um tempo
    resetGeminiAvailability();
    expect(geminiVoiceName("kore")).toBe("Kore");
    expect(geminiVoiceName("marin")).toBeNull();
  });

  it("chave temporária: uma conversa só, instruções, voz, ferramentas e transcrições travadas no servidor; a continuidade fica livre; nada de chave no erro", async () => {
    google.length = 0;
    const t = await createGeminiVoiceToken({ key: GKEY, model: "gemini-3.8-live", instructions: "INSTRUÇÕES DO PROFESSOR", voice: "Kore", tools: REALTIME_TOOLS as never, maxSeconds: 1800, client: geminiClient });
    expect(t.token).toBe("auth_tokens/temporario123");
    const cfg = google[0].config;
    expect(cfg).toMatchObject({ uses: 1, lockAdditionalFields: [], liveConnectConstraints: { model: "gemini-3.8-live" } });
    // vence 2 minutos depois do que a ligação pode durar (o servidor não desliga uma conversa do Gemini)
    const left = new Date(cfg.expireTime).getTime() - Date.now();
    expect(left).toBeGreaterThan(1800 * 1000);
    expect(left).toBeLessThanOrEqual(1920 * 1000);
    expect(cfg.newSessionExpireTime).toBe(cfg.expireTime);
    const live = cfg.liveConnectConstraints.config;
    expect(live).toMatchObject({
      responseModalities: ["AUDIO"],
      systemInstruction: "INSTRUÇÕES DO PROFESSOR",
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      enableAffectiveDialog: true,
    });
    expect(live.sessionResumption).toBeUndefined();
    const decl = live.tools[0].functionDeclarations;
    expect(decl.map((d: any) => d.name)).toEqual(REALTIME_TOOLS.map((x: any) => x.name));
    expect(decl[0].parametersJsonSchema).toMatchObject({ type: "object" });
    googleFails = true;
    const err = await createGeminiVoiceToken({ key: GKEY, model: "m", instructions: "i", voice: null, tools: [], maxSeconds: 60, client: geminiClient }).catch((e) => e);
    googleFails = false;
    expect(err).toBeInstanceOf(GeminiVoiceError);
    expect(err).toMatchObject({ status: 403, access: true });
    expect(err.message).not.toContain(GKEY);
  });
});

describe("Abrir a voz pela rota", () => {
  it("status diz ao aplicativo para abrir o Gemini; a abertura devolve a chave temporária, a voz da Durona (Kore) e nada de chave principal", async () => {
    const st = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(st).toMatchObject({ realtime_voice: true, voice_hint: "gemini" });
    const session = (await rpc(ALUNA, "app_tutor_start", "livre", null, null)).id;
    google.length = 0;
    const r = await post("/voice/start", { session_id: session });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ provider: "gemini", gemini_token: "auth_tokens/temporario123", model: "gemini-3.8-live", voice: "Kore" });
    expect(JSON.stringify(r.body)).not.toContain(GKEY);
    // a chave não vale mais do que o tempo de voz que a aluna ainda tem (mais a folga)
    const can = Math.min(1800, r.body.entitlement.voice.remaining_s + r.body.lease_seconds);
    expect(new Date(google[0].config.expireTime).getTime() - Date.now()).toBeLessThanOrEqual((can + 120) * 1000);
    // as instruções travadas são as do professor, em português do Brasil e sem filtro
    const instr = google[0].config.liveConnectConstraints.config.systemInstruction as string;
    expect(instr.startsWith("IDIOMA E SOTAQUE")).toBe(true);
    expect(instr).toContain("Não transfira a pronúncia do inglês"); // o bloco de pronúncia do pt-BR (voiceLanguage.ts) substituiu o "NADA DE SOTAQUE AMERICANO"
    expect(instr).toContain("FALA DE GENTE, SEM FILTRO");
    expect(instr).toContain("QUEM VOCÊ É NESTA CONVERSA: Durona");
    const call = (await sql(`select provider, model, status from public.tutor_voice_calls where id = $1`, [r.body.voice_call_id]))[0];
    expect(call).toEqual({ provider: "gemini", model: "gemini-3.8-live", status: "active" });
    // dois minutos de conversa: o custo por tempo vai para o livro-caixa
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '120 seconds', lease_until = now() + interval '60 seconds' where id = $1`, [r.body.voice_call_id]);
    const e = await end(r.body.voice_call_id);
    expect(e.status).toBe(200);
    const led = await sql(`select feature, provider, model, duration_seconds, estimated_cost_usd from public.ai_usage_ledger where feature = 'tutor_voice_gemini'`);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ feature: "tutor_voice_gemini", provider: "google", model: "gemini-3.8-live" });
    expect(Number(led[0].estimated_cost_usd)).toBeCloseTo(voiceTimeCost("gemini-3.8-live", led[0].duration_seconds)!, 5);
    expect(Number(led[0].estimated_cost_usd)).toBeGreaterThan(0);
  });

  it("o Google recusa: a OpenAI assume na mesma abertura, e o Gemini descansa um tempo", async () => {
    const session = (await rpc(ALUNA, "app_tutor_start", "livre", null, null)).id;
    googleFails = true;
    openai.length = 0;
    const r = await post("/voice/start", { session_id: session });
    googleFails = false;
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ provider: "realtime", client_secret: "ek_temporario" });
    expect(openai.some((u) => u.endsWith("/realtime/client_secrets"))).toBe(true);
    // a reserva recusada pelo Google foi liberada sem cobrar; só a da OpenAI está aberta
    expect(await sql(`select provider, status from public.tutor_voice_calls where user_id = $1 and status = 'active'`, [ALUNA])).toEqual([{ provider: "realtime", status: "active" }]);
    const st = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(st.voice_hint).toBe("realtime");
    await end(r.body.voice_call_id);
    resetGeminiAvailability();
  });

  it("o aparelho não conectou no Gemini: o aplicativo pede outra voz (avoid) e recebe a da OpenAI", async () => {
    const session = (await rpc(ALUNA, "app_tutor_start", "livre", null, null)).id;
    google.length = 0;
    const r = await post("/voice/start", { session_id: session, avoid: ["gemini", "qualquer"] });
    expect(r.status).toBe(200);
    expect(r.body.provider).toBe("realtime");
    expect(google).toHaveLength(0);
    await end(r.body.voice_call_id);
  });

  it("painel: o administrador escolhe o Gemini e vê se ele está pronto", async () => {
    const saved = await rpc(ADMIN, "app_admin_tutor_save_config", { voice_provider: "gemini", voice_name: "kore" }, "Voz brasileira nativa pelo Gemini.");
    expect(saved).toMatchObject({ voice_provider: "gemini", voice_name: "kore" });
    await expect(rpc(ADMIN, "app_admin_tutor_save_config", { voice_provider: "outra" }, "Teste de provedor inválido.")).rejects.toThrow(/Provedor de voz inválido/);
    const adminToken = await dev.createSession(ADMIN);
    const st = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    expect(st).toMatchObject({ voice_hint: "gemini", gemini_voice_model: "gemini-3.8-live", gemini_voice_pending: null });
    await rpc(ADMIN, "app_admin_tutor_save_config", { voice_provider: "auto", voice_name: "" }, "Voltando ao automático no teste.");
  });
});
