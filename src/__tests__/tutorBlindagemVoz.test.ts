// @vitest-environment node
/**
 * Fase 0 do Tutor por voz (blindagem, 2026-10-14; auditoria L1, L2, L4 e L8). Tudo conferido NO SERVIDOR e no banco:
 *   - /voice/tool só com a voz ao vivo que usa ferramentas (Realtime ou Gemini): a Nexus "por escrito" (chamada tts) é recusada;
 *   - limite de frequência por aluno no banco (ferramentas, avaliação, delegação e falas transcritas);
 *   - a avaliação do raciocínio (IA de texto) gasta 1 interação da cota de mensagens;
 *   - a chave geral "IA desligada" vale também ao abrir e renovar a voz, nas ferramentas e na transcrição;
 *   - tetos da plataforma (minutos e US$ do dia) ao abrir e ao renovar;
 *   - teto do aluno no teste grátis: 5 min/dia por padrão.
 * Sem rede: IA simulada, OpenAI simulada.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { createTutorRouter } from "../../server/tutor/router";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { transcribe } from "../../server/tutor/stt";
import { forgetTutorSettings } from "../../server/tutor/settings";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-blindagem-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const ADMIN = "00000000-0000-4000-8000-0000000009a1";
const PAGO = "00000000-0000-4000-8000-0000000009b1";
const TESTE = "00000000-0000-4000-8000-0000000009b2";
const OUTRO = "00000000-0000-4000-8000-0000000009b3";
const KEY = "sk-servidor-" + "x".repeat(40);
const tokens: Record<string, string> = {};
const off: Record<string, string> = {};

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const config = (c: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", c, "Ajuste para os testes da blindagem da voz.");
const reply = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });

// IA simulada que conta as chamadas (a avaliação do raciocínio pede o formato "tutor_eval")
let aiCalls = 0;
const respond = (req: StructuredRequest) => {
  aiCalls++;
  return req.promptId === "tutor_eval" ? { ...NO_EVALUATION, error_type: "unknown", reasoning_quality: "low" } : reply("Bora. Me diz o que pesa mais no caso.");
};
// OpenAI simulada: segredo temporário, encerramento e transcrição
const openai: string[] = [];
const fakeFetch = (async (url: string) => {
  openai.push(url);
  if (url.endsWith("/realtime/client_secrets")) return new Response(JSON.stringify({ value: "ek_temporario", expires_at: 1_900_000_000 }), { status: 200 });
  if (/\/realtime\/calls\/[^/]+\/hangup$/.test(url)) return new Response("", { status: 200 });
  if (url.endsWith("/audio/transcriptions")) return new Response(JSON.stringify({ text: "minha resposta é a letra B" }), { status: 200 });
  return new Response("?", { status: 404 });
}) as typeof fetch;
const RT = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };
const STT = { ready: true, model: "gpt-4o-mini-transcribe", key: KEY, pending: null };
const deps: any = { mockRespond: respond, realtime: RT, stt: STT, fetch: fakeFetch, live: { ready: false, model: "gpt-live-1", key: null, pending: "desligada" }, gemini: { ready: false, model: "g", key: null, pending: "desligada" } };

const post = async (uid: string, url: string, body: unknown) => {
  const r = await fetch(`${base}${url}`, { method: "POST", headers: { Authorization: `Bearer ${tokens[uid]}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const tool = (uid: string, call: string, name: string, args: unknown = {}) => post(uid, "/voice/tool", { voice_call_id: call, name, arguments: JSON.stringify(args) });
const start = async (uid: string, mode: "livre" | "questao" = "livre") => (await rpc(uid, "app_tutor_start", mode, null, null)).id as string;
const endAll = () => sql(`update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'student' where status = 'active'`);
/** Chamada aberta direto no banco (Nexus "por escrito" = tts; GPT-Live = live), sem passar por provedor. */
const openCall = async (uid: string, sid: string, provider: "tts" | "live") =>
  (await sql(`insert into public.tutor_voice_calls (user_id, session_id, model, provider, lease_until) values ($1, $2, $3, $3, now() + interval '2 minutes') returning id`, [uid, sid, provider]))[0].id as string;
const requests = async (uid: string) => (await sql(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [uid]))[0].n as number;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'pago@t.dev'), ($3, 'teste@t.dev'), ($4, 'outro@t.dev')`, [ADMIN, PAGO, TESTE, OUTRO]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [PAGO, OUTRO]);
  for (const uid of [ADMIN, PAGO, TESTE, OUTRO]) await aceitarTermos(dev.db, uid);
  for (const uid of [ADMIN, PAGO, TESTE, OUTRO]) tokens[uid] = await dev.createSession(uid);
  for (const r of await sql(`select id, correct_option from public.questions`)) off[r.id] = r.correct_option;
  process.env.TUTOR_AI_PROVIDER = "mock";
  process.env.DETERMINISTIC_TUTOR = "true";
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
}, 300_000);
afterAll(async () => {
  delete process.env.DETERMINISTIC_TUTOR;
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await endAll();
  await sql(`delete from public.tutor_rate_limits`);
  await sql(`update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')`);
  await config({ enabled: true, requires_pro: true, voice_enabled: true, daily_message_limit: 40, paid_voice_daily_seconds: 3600, live_account_daily_seconds: 36000, live_account_daily_usd: 100,
                 live_price_per_min_usd: 0.039, voice_rate_limits: { voice_tool_per_minute: 30, voice_eval_per_minute: 4, voice_delegate_per_minute: 15, voice_transcript_per_minute: 40 } });
  forgetTutorSettings(deps);
});

describe("L2: /voice/tool só na voz ao vivo com ferramentas, com limite no banco", () => {
  it("chamada tts da Nexus 'por escrito' é recusada (409) antes de qualquer IA ou registro", async () => {
    const s = await start(PAGO, "questao");
    const call = await openCall(PAGO, s, "tts");
    aiCalls = 0;
    const r = await tool(PAGO, call, "evaluate_student_reasoning", { answer: "A", reasoning: "achei" });
    expect(r.status).toBe(409);
    expect((await tool(PAGO, call, "get_question_context")).status).toBe(409);
    expect(aiCalls).toBe(0);
    expect((await sql(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_eval'`, [PAGO]))[0].n).toBe(0);
    // GPT-Live delega pelo /voice/delegate: ferramenta direta também não
    await endAll();
    const live = await openCall(PAGO, await start(PAGO), "live");
    expect((await tool(PAGO, live, "wait_for_user")).status).toBe(409);
  });

  it("Realtime: as ferramentas passam até o limite por minuto do painel; depois 429 (voice_rate)", async () => {
    await config({ voice_rate_limits: { voice_tool_per_minute: 3 } });
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    expect(r.body).toMatchObject({ provider: "realtime" });
    for (let i = 0; i < 3; i++) expect((await tool(PAGO, r.body.voice_call_id, "wait_for_user")).body.output).toMatchObject({ ok: true });
    const fourth = await tool(PAGO, r.body.voice_call_id, "wait_for_user");
    expect(fourth.status).toBe(429);
    expect(fourth.body).toMatchObject({ code: "voice_rate", error: expect.stringMatching(/Espere um pouco/) });
    // o limite é por aluno: outro aluno segue
    const o = await post(OUTRO, "/voice/start", { session_id: await start(OUTRO) });
    expect((await tool(OUTRO, o.body.voice_call_id, "wait_for_user")).status).toBe(200);
    // virou o minuto: libera de novo (a janela fica no banco, não na memória do servidor)
    await sql(`update public.tutor_rate_limits set minute_start = now() - interval '61 seconds' where user_id = $1`, [PAGO]);
    expect((await tool(PAGO, r.body.voice_call_id, "wait_for_user")).status).toBe(200);
  });

  it("limite do dia também vale e o aluno não chama a função do limite nem a soma da plataforma direto", async () => {
    await config({ voice_rate_limits: { voice_tool_per_day: 2 } });
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    await tool(PAGO, r.body.voice_call_id, "wait_for_user");
    await tool(PAGO, r.body.voice_call_id, "wait_for_user");
    const third = await tool(PAGO, r.body.voice_call_id, "wait_for_user");
    expect(third).toMatchObject({ status: 429, body: { code: "voice_rate", error: expect.stringMatching(/limite de uso da voz de hoje/) } });
    await config({ voice_rate_limits: { voice_tool_per_day: 600 } });
    await expect(rpc(PAGO, "ch_worker_tutor_rate_hit", PAGO, "voice_tool")).rejects.toThrow(/permission|permissão/i);
    await expect(rpc(PAGO, "tutor_live_account_today")).rejects.toThrow(/permission|permissão/i);
    await expect(dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: PAGO })]);
      return tx.query(`select * from public.tutor_rate_limits`);
    })).rejects.toThrow(/permission|permissão/i);
  });

  it("evaluate_student_reasoning gasta 1 interação de texto, tem limite próprio e para quando a cota acaba (sem chamar a IA)", async () => {
    const s = await start(PAGO, "questao");
    const r = await post(PAGO, "/voice/start", { session_id: s });
    const call = r.body.voice_call_id;
    const qid = (await rpc(PAGO, "app_tutor_session", s)).question.id;
    const wrong = ["A", "B", "C", "D"].find((x) => x !== off[qid])!;
    await tool(PAGO, call, "submit_answer", { option: wrong });
    const before = await requests(PAGO);
    aiCalls = 0;
    const ev = await tool(PAGO, call, "evaluate_student_reasoning", { answer: wrong, reasoning: "pedi o exame antes de estabilizar" });
    expect(ev.body.output.evaluation).toMatchObject({ correct: false });
    expect(aiCalls).toBe(1);
    expect(await requests(PAGO)).toBe(before + 1);
    // limite próprio da avaliação (por minuto)
    await config({ voice_rate_limits: { voice_eval_per_minute: 1 } });
    aiCalls = 0;
    expect((await tool(PAGO, call, "evaluate_student_reasoning", { answer: wrong, reasoning: "de novo" })).body.output.error).toMatch(/Espere um pouco/);
    expect(aiCalls).toBe(0);
    // cota de mensagens do dia acabou: a avaliação não roda
    await sql(`delete from public.tutor_rate_limits`);
    await config({ voice_rate_limits: { voice_eval_per_minute: 4 }, daily_message_limit: await requests(PAGO) });
    expect((await tool(PAGO, call, "evaluate_student_reasoning", { answer: wrong, reasoning: "mais uma" })).body.output.error).toMatch(/limite de \d+ interações de hoje/);
    expect(aiCalls).toBe(0);
  });

  it("/voice/delegate (GPT-Live) e /voice/transcript também têm limite por minuto", async () => {
    await config({ voice_rate_limits: { voice_delegate_per_minute: 2, voice_transcript_per_minute: 2 } });
    const live = await openCall(PAGO, await start(PAGO), "live");
    const d = () => post(PAGO, "/voice/delegate", { voice_call_id: live, transcript: [] });
    expect((await d()).body).toMatchObject({ intent: "unclear" });
    expect((await d()).status).toBe(200);
    expect(await d()).toMatchObject({ status: 429, body: { code: "voice_rate" } });
    await endAll();
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    const t = () => post(PAGO, "/voice/transcript", { voice_call_id: r.body.voice_call_id, role: "tutor", text: "Que conduta foi essa?" });
    expect((await t()).status).toBe(200);
    expect((await t()).status).toBe(200);
    expect(await t()).toMatchObject({ status: 429, body: { code: "voice_rate" } });
  });
});

describe("L4: a chave geral 'IA desligada' desliga a voz inteira", () => {
  it("abrir a voz: 503 (ai_off) sem reservar tempo e sem falar com a OpenAI", async () => {
    await sql(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    openai.length = 0;
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    expect(r).toMatchObject({ status: 503, body: { code: "ai_off", error: "O Tutor está indisponível no momento." } });
    expect(openai).toEqual([]);
    expect((await sql(`select count(*)::int n from public.tutor_voice_calls where user_id = $1 and status = 'active'`, [PAGO]))[0].n).toBe(0);
  });

  it("renovar com a IA desligada encerra a ligação; ferramentas e transcrição recusam", async () => {
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    const call = r.body.voice_call_id;
    await sql(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    const renew = await post(PAGO, "/voice/renew", { voice_call_id: call, call_id: "rtc_teste_1" });
    expect(renew.body).toMatchObject({ stop: true, reason: "ai_off", grace_seconds: 0 });
    expect((await sql(`select status from public.tutor_voice_calls where id = $1`, [call]))[0].status).toBe("ended");
    expect(openai.some((u) => u.endsWith("/realtime/calls/rtc_teste_1/hangup"))).toBe(true);
    // ferramenta numa chamada ainda aberta: devolve o aviso para a voz, sem consultar nada
    await sql(`update public.ch_flags set value = true where key = 'ai_enabled'`);
    const r2 = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    await sql(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    expect((await tool(PAGO, r2.body.voice_call_id, "get_question_context")).body.output).toEqual({ error: "O Tutor está indisponível no momento." });
    // transcrição: recusa antes de mandar o áudio
    openai.length = 0;
    const tts = await openCall(TESTE, await start(TESTE), "tts");
    await expect(transcribe(deps, TESTE, tts, Buffer.from("audio"), "audio/webm", 2)).rejects.toMatchObject({ status: 503 });
    expect(openai).toEqual([]);
  });
});

describe("L1: tetos da plataforma (minutos e US$ do dia) ao abrir e ao renovar", () => {
  it("sem minutos na plataforma: recusa (503, voice_account_limit); a reserva nunca passa do que sobra", async () => {
    const other = await start(OUTRO);
    await sql(`insert into public.tutor_voice_calls (user_id, session_id, model, provider, status, lease_until, ended_at, consumed_seconds) values ($1, $2, 'gpt-realtime-2.1', 'realtime', 'ended', now(), now(), 90)`, [OUTRO, other]);
    await config({ live_account_daily_seconds: 100 });
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    expect(r).toMatchObject({ status: 503, body: { code: "voice_account_limit" } });
    expect(r.body.error).toMatch(/limite de uso de hoje/);
    await config({ live_account_daily_seconds: 130 });
    const ok = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    expect(ok.status).toBe(200);
    expect(ok.body.lease_seconds).toBeLessThanOrEqual(40);
  });

  it("teto em US$: recusa ao abrir e encerra na renovação (folga de 20 s)", async () => {
    await sql(`delete from public.tutor_voice_calls`);
    await sql(`insert into public.ai_usage_ledger (user_id, feature, estimated_cost_usd) values ($1, 'tutor_eval', 2)`, [OUTRO]);
    await config({ live_account_daily_usd: 2 });
    const r = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    expect(r).toMatchObject({ status: 503, body: { code: "voice_account_limit" } });
    await config({ live_account_daily_usd: 3 });
    const ok = await post(PAGO, "/voice/start", { session_id: await start(PAGO) });
    expect(ok.status).toBe(200);
    const renew1 = await post(PAGO, "/voice/renew", { voice_call_id: ok.body.voice_call_id, call_id: "rtc_teste_2" });
    expect(renew1.body).toMatchObject({ stop: false });
    await sql(`insert into public.ai_usage_ledger (user_id, feature, estimated_cost_usd) values ($1, 'tutor_voice_backend', 5)`, [OUTRO]);
    const renew2 = await post(PAGO, "/voice/renew", { voice_call_id: ok.body.voice_call_id, call_id: "rtc_teste_2" });
    expect(renew2.body).toMatchObject({ stop: true, reason: "account_limit", grace_seconds: 20 });
    expect(renew2.body.message).toMatch(/limite de uso de hoje/);
    await sql(`delete from public.ai_usage_ledger where user_id = $1 and feature in ('tutor_eval', 'tutor_voice_backend')`, [OUTRO]);
  });
});

describe("L8: tetos do aluno e padrões novos", () => {
  it("padrões mantidos para o aluno (teste 600 s, pago 3600 s); painel com os tetos da plataforma e validação dos campos novos", async () => {
    // padrão da coluna continua 600 s no teste grátis e 3600 s no plano pago
    expect((await sql(`select column_default d from information_schema.columns where table_name = 'tutor_config' and column_name = 'trial_voice_daily_seconds'`))[0].d).toBe("600");
    expect((await sql(`select column_default d from information_schema.columns where table_name = 'tutor_config' and column_name = 'paid_voice_daily_seconds'`))[0].d).toBe("3600");
    await sql(`update public.subscriptions set tutor_trial_started_at = now() where user_id = $1`, [TESTE]);
    expect((await rpc(TESTE, "app_tutor_status")).entitlement.voice).toMatchObject({ limit_today_s: 600 });
    const panel = await rpc(ADMIN, "app_admin_tutor_config");
    expect(panel).toMatchObject({
      live_account_daily_seconds: expect.any(Number),
      live_account_daily_usd: expect.any(Number),
      live_account_monthly_usd: expect.any(Number),
      live_price_per_min_usd: 0.039,
      voice_rate_limits: expect.objectContaining({ voice_tool_per_minute: expect.any(Number) }),
    });
    await expect(config({ voice_rate_limits: { voice_tool_per_minute: 0 } })).rejects.toThrow(/Limites de frequência/);
    await expect(config({ voice_rate_limits: { voice_tool_per_minute: "muito" } })).rejects.toThrow(/Limites de frequência/);
    await expect(config({ live_account_daily_usd: "abc" })).rejects.toThrow(/US\$ por dia/);
    await expect(config({ live_account_monthly_usd: "abc" })).rejects.toThrow(/US\$ por mês/);
    await expect(config({ live_price_per_min_usd: 0 })).rejects.toThrow(/maior que zero/);
    await expect(rpc(PAGO, "app_admin_tutor_save_config", { live_account_daily_usd: 1000 }, "Aluno tentando subir o teto.")).rejects.toThrow();
  });

  it("a migração pode ser colada de novo sem erro e o CONFERIR diz OK (e FALTA num banco vazio)", async () => {
    const ROOT = path.resolve(__dirname, "../..");
    const migracao = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003012800_tutor_voz_alunos_tetos.sql"), "utf8");
    const conferir = fs.readFileSync(path.join(ROOT, "supabase/conferir/tutor-voz-alunos-tetos.sql"), "utf8");
    await config({ live_account_daily_usd: 7.5, voice_rate_limits: { voice_tool_per_minute: 12 } });
    await dev.db.exec(migracao);
    // o que o dono já escolheu no painel fica
    expect((await sql(`select live_account_daily_usd::float8 u, voice_rate_limits ->> 'voice_tool_per_minute' t from public.tutor_config`))[0]).toEqual({ u: 7.5, t: "12" });
    expect((await sql(conferir))[0].resultado).toMatch(/^OK: /);
    const { PGlite } = await import("@electric-sql/pglite");
    const vazio = new PGlite();
    await vazio.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
    expect((await vazio.query<any>(conferir)).rows[0].resultado).toMatch(/^FALTA: requisito/);
    await vazio.close();
  }, 60_000);

  it("o DESFAZER volta tudo (CONFERIR diz FALTA, a dica do Tutor continua) e a migração entra de novo por cima", async () => {
    const ROOT = path.resolve(__dirname, "../..");
    const ler = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const conferir = ler("supabase/conferir/tutor-voz-alunos-tetos.sql");
    await dev.db.exec(ler("supabase/desfazer/20261003012800_tutor_voz_alunos_tetos.desfazer.sql"));
    const falta = (await sql(conferir))[0].resultado as string;
    expect(falta).toMatch(/^FALTA: /);
    expect(falta).toMatch(/tutor_rate_limits/);
    expect(falta).not.toMatch(/dica do Tutor/);
    expect(await sql(`select to_regclass('public.tutor_rate_limits') t`)).toEqual([{ t: null }]);
    await dev.db.exec(ler("supabase/migrations/20261003012800_tutor_voz_alunos_tetos.sql"));
    expect((await sql(conferir))[0].resultado).toMatch(/^OK: /);
    expect((await sql(`select live_price_per_min_usd::float8 p from public.tutor_config`))[0].p).toBe(0.039);
  }, 60_000);
});
