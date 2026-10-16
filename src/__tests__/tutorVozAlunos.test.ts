// @vitest-environment node
/**
 * Tetos da conta inteira da voz ao vivo e limites por aluno (2026-10-16):
 *   - custo real via livro-caixa (ai_usage_ledger) ou estimativa por segundos x preço/min;
 *   - corte ao atingir teto diário e teto mensal em US$;
 *   - proteção do painel de administração;
 *   - aluno sem acesso (teste vencido ou limite diário de 10 min);
 *   - termo de consentimento pendente impede abertura;
 *   - trava de voz ao vivo (TUTOR_LIVE_VOICE_ALLOW_EXTERNAL);
 *   - relatório de uso da ponte (/voice/ponte-uso) alimenta o custo da conta.
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
import { forgetTutorSettings } from "../../server/tutor/settings";
import { geminiVoiceConfig } from "../../server/tutor/voiceProviders";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-voz-alunos-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const ADMIN = "00000000-0000-4000-8000-0000000009a1";
const PAGO = "00000000-0000-4000-8000-0000000009b1";
const TESTE = "00000000-0000-4000-8000-0000000009b2";
const OUTRO = "00000000-0000-4000-8000-0000000009b3";
const SEM_ACEITE = "00000000-0000-4000-8000-0000000009b4";
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
const config = (c: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", c, "Ajuste para os testes da voz dos alunos.");
const reply = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });

let aiCalls = 0;
const respond = (req: StructuredRequest) => {
  aiCalls++;
  return req.promptId === "tutor_eval" ? { ...NO_EVALUATION, error_type: "unknown", reasoning_quality: "low" } : reply("Bora. Me diz o que pesa mais no caso.");
};
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
const start = async (uid: string, mode: "livre" | "questao" = "livre") => (await rpc(uid, "app_tutor_start", mode, null, null)).id as string;
const endAll = () => sql(`update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'student' where status = 'active'`);

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(
    `insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'pago@t.dev'), ($3, 'teste@t.dev'), ($4, 'outro@t.dev'), ($5, 'semaceite@t.dev')`,
    [ADMIN, PAGO, TESTE, OUTRO, SEM_ACEITE]
  );
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(
    `update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2, $3, $4)`,
    [ADMIN, PAGO, OUTRO, SEM_ACEITE]
  );
  // Aceite dos termos para equipe e alunos de teste, exceto o 5º usuário (SEM_ACEITE)
  for (const uid of [ADMIN, PAGO, TESTE, OUTRO]) await aceitarTermos(dev.db, uid);
  for (const uid of [ADMIN, PAGO, TESTE, OUTRO, SEM_ACEITE]) tokens[uid] = await dev.createSession(uid);
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
  await sql(`delete from public.tutor_voice_calls`);
  await sql(`delete from public.ai_usage_ledger where feature in ('tutor_voice', 'tutor_voice_gemini', 'tutor_voice_live', 'tutor_voice_backend', 'tutor_eval')`);
  await sql(`delete from public.tutor_rate_limits`);
  await sql(`update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')`);
  await config({
    enabled: true,
    requires_pro: true,
    voice_enabled: true,
    daily_message_limit: 40,
    paid_voice_daily_seconds: 3600,
    trial_voice_daily_seconds: 600,
    voice_lease_seconds: 120,
    voice_session_max_seconds: 1800,
    live_account_daily_seconds: 36000,
    live_account_daily_usd: 100,
    live_account_monthly_usd: 50,
    live_price_per_min_usd: 0.039,
    voice_rate_limits: {
      voice_tool_per_minute: 30,
      voice_eval_per_minute: 4,
      voice_delegate_per_minute: 15,
      voice_transcript_per_minute: 40,
    },
  });
  forgetTutorSettings(deps);
});

describe("Voz ao vivo para os alunos — tetos de gasto e limites", () => {
  // 1. Custo real conta: ai_usage_ledger > 0 prevalece sobre a estimativa; ausente ou 0 cai na estimativa
  it("custo real conta: linha do livro-caixa define o custo em US$ e ausência ou valor 0 recorre à estimativa", async () => {
    const s = await start(PAGO);
    const callId = (
      await sql(
        `insert into public.tutor_voice_calls (user_id, session_id, model, provider, status, consumed_seconds, lease_until)
         values ($1, $2, 'gemini-3.8-live', 'gemini', 'ended', 60, now()) returning id`,
        [PAGO, s]
      )
    )[0].id;

    // Com linha no livro-caixa de 0.5 USD: devolve 0.5 (não 0.039)
    await sql(
      `insert into public.ai_usage_ledger (user_id, session_id, feature, estimated_cost_usd, meta)
       values ($1, $2, 'tutor_voice_gemini', 0.5, jsonb_build_object('voice_call', $3::text))`,
      [PAGO, s, callId]
    );
    const comCustoReal = (await sql(`select public.tutor_live_account_today() as a`))[0].a;
    expect(comCustoReal.usd).toBe(0.5);

    // Sem a linha do livro-caixa: cai na estimativa de 60 s x 0.039 / 60 = 0.039
    await sql(`delete from public.ai_usage_ledger where meta ->> 'voice_call' = $1`, [callId]);
    const semLinha = (await sql(`select public.tutor_live_account_today() as a`))[0].a;
    expect(semLinha.usd).toBe(0.039);

    // Com linha de custo 0: também cai na estimativa de 0.039
    await sql(
      `insert into public.ai_usage_ledger (user_id, session_id, feature, estimated_cost_usd, meta)
       values ($1, $2, 'tutor_voice_gemini', 0, jsonb_build_object('voice_call', $3::text))`,
      [PAGO, s, callId]
    );
    const comCustoZero = (await sql(`select public.tutor_live_account_today() as a`))[0].a;
    expect(comCustoZero.usd).toBe(0.039);
  });

  // 2. Teto do dia em US$ com custo real
  it("teto do dia em US$ com custo real: corta abertura de nova chamada com 503 voice_account_limit", async () => {
    await config({ live_account_daily_usd: 2 });
    const sOutro = await start(OUTRO);
    const callOutro = (
      await sql(
        `insert into public.tutor_voice_calls (user_id, session_id, model, provider, status, consumed_seconds, lease_until)
         values ($1, $2, 'gemini-3.8-live', 'gemini', 'ended', 60, now()) returning id`,
        [OUTRO, sOutro]
      )
    )[0].id;
    await sql(
      `insert into public.ai_usage_ledger (user_id, session_id, feature, estimated_cost_usd, meta)
       values ($1, $2, 'tutor_voice_gemini', 2, jsonb_build_object('voice_call', $3::text))`,
      [OUTRO, sOutro, callOutro]
    );

    const sPago = await start(PAGO);
    const res = await post(PAGO, "/voice/start", { session_id: sPago });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "voice_account_limit" });
  });

  // 3. Teto do MÊS corta
  it("teto do MÊS corta: bloqueia abertura, limita lease ao saldo proporcional e corta na renovação", async () => {
    await config({ live_account_daily_usd: 100, live_account_monthly_usd: 3, voice_lease_seconds: 600 });
    const m0 = (await sql(`select (date_trunc('month', now() at time zone 'America/Sao_Paulo')::date)::text as d`))[0].d;
    const sOutro = await start(OUTRO);
    const callOutro = (
      await sql(
        `insert into public.tutor_voice_calls (user_id, session_id, model, provider, status, consumed_seconds, day, lease_until)
         values ($1, $2, 'gemini-3.8-live', 'gemini', 'ended', 60, $3::date, now()) returning id`,
        [OUTRO, sOutro, m0]
      )
    )[0].id;
    await sql(
      `insert into public.ai_usage_ledger (user_id, session_id, feature, estimated_cost_usd, day, meta)
       values ($1, $2, 'tutor_voice_gemini', 3, $3::date, jsonb_build_object('voice_call', $4::text))`,
      [OUTRO, sOutro, m0, callOutro]
    );

    // Teto mensal de 3 atingido: start bloqueia 503
    const sPago = await start(PAGO);
    const bloqueado = await post(PAGO, "/voice/start", { session_id: sPago });
    expect(bloqueado.status).toBe(503);
    expect(bloqueado.body).toMatchObject({ code: "voice_account_limit" });

    // Subindo o teto do mês para 3,20, abre (200) e a reserva não passa do saldo: (3,20 - 3) / 0,039 x 60 = 307 s (< 600 da reserva)
    await config({ live_account_monthly_usd: 3.2 });
    const aberto = await post(PAGO, "/voice/start", { session_id: sPago });
    expect(aberto.status).toBe(200);
    const maxLease = Math.floor(((3.2 - 3) / 0.039) * 60);
    expect(aberto.body.lease_seconds).toBeLessThanOrEqual(maxLease);
    expect(aberto.body.lease_seconds).toBe(307);

    // Com mais custo real de 2 no livro-caixa, renew responde stop: true e reason: account_limit
    await sql(`insert into public.ai_usage_ledger (user_id, feature, estimated_cost_usd) values ($1, 'tutor_voice_backend', 2)`, [OUTRO]);
    const renew = await post(PAGO, "/voice/renew", { voice_call_id: aberto.body.voice_call_id, call_id: "rtc_teste_renew" });
    expect(renew.body).toMatchObject({ stop: true, reason: "account_limit" });
  });

  // 4. Painel
  it("painel: não-admin é impedido de salvar teto mensal; admin salva 80 e recupera 80", async () => {
    await expect(rpc(PAGO, "app_admin_tutor_save_config", { live_account_monthly_usd: 80 }, "Aluno tentando subir o teto mensal.")).rejects.toThrow();

    await config({ live_account_monthly_usd: 80 });
    const panel = await rpc(ADMIN, "app_admin_tutor_config");
    expect(panel.live_account_monthly_usd).toBe(80);
  });

  // 5. Aluno sem acesso
  it("aluno sem acesso: teste vencido é bloqueado sem criar chamada; teste ativo respeita teto de 10 min", async () => {
    // (a) Aluno TESTE sem assinatura e com teste vencido há 30 dias
    const sVencido = await start(TESTE); // a conversa abre antes de o teste vencer
    await sql(`update public.subscriptions set tutor_trial_started_at = now() - interval '30 days' where user_id = $1`, [TESTE]);
    const antesVencido = (await sql(`select count(*)::int n from public.tutor_voice_calls where provider <> 'tts'`))[0].n;
    const resVencido = await post(TESTE, "/voice/start", { session_id: sVencido });
    expect(resVencido.status).toBe(403);
    const depoisVencido = (await sql(`select count(*)::int n from public.tutor_voice_calls where provider <> 'tts'`))[0].n;
    expect(depoisVencido).toBe(antesVencido);

    // (b) Aluno TESTE com teste ativo abre normalmente
    await sql(`update public.subscriptions set tutor_trial_started_at = now() where user_id = $1`, [TESTE]);
    const sAtivo = await start(TESTE);
    const resAtivo = await post(TESTE, "/voice/start", { session_id: sAtivo });
    expect(resAtivo.status).toBe(200);

    // Ao passar de 10 min no dia (600 s consumidos), não abre mais
    await endAll();
    await sql(
      `insert into public.tutor_voice_calls (user_id, session_id, model, provider, status, consumed_seconds, lease_until)
       values ($1, $2, 'gemini-3.8-live', 'gemini', 'ended', 600, now())`,
      [TESTE, sAtivo]
    );
    const sEstourado = await start(TESTE);
    const resEstourado = await post(TESTE, "/voice/start", { session_id: sEstourado });
    expect(resEstourado.status).toBe(429);
    expect(resEstourado.body).toMatchObject({ code: "voice_quota" });
  });

  // 6. Termo
  it("termo: aluno sem aceite do Tutor recebe 403 tutor_consent e nenhuma chamada é criada", async () => {
    // a conversa abre pelo caminho do app com os aceites; depois o aceite do Tutor sai (fica só o do Termo)
    await aceitarTermos(dev.db, SEM_ACEITE);
    const sNovo = await start(SEM_ACEITE);
    await sql(`delete from public.legal_acceptances where user_id = $1 and origin = 'tutor'`, [SEM_ACEITE]);
    const antes = (await sql(`select count(*)::int n from public.tutor_voice_calls where user_id = $1`, [SEM_ACEITE]))[0].n;

    const res = await post(SEM_ACEITE, "/voice/start", { session_id: sNovo });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: "tutor_consent",
      error: "Aceite do Tutor pendente.",
    });

    const depois = (await sql(`select count(*)::int n from public.tutor_voice_calls where user_id = $1`, [SEM_ACEITE]))[0].n;
    expect(depois).toBe(antes);
  });

  // 7. Trava dos alunos
  it("trava dos alunos: sem TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1 a voz ao vivo do Gemini fica desligada; com as duas, liberada", () => {
    const envSemTrava = { GEMINI_API_KEY: "AIza" + "g".repeat(40), TUTOR_VOICE_ALLOW_EXTERNAL: "1" };
    const confSem = geminiVoiceConfig(envSemTrava as NodeJS.ProcessEnv);
    expect(confSem.ready).toBe(false);
    expect(confSem.pending).toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1/);

    const envComTrava = { ...envSemTrava, TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1" };
    const confCom = geminiVoiceConfig(envComTrava as NodeJS.ProcessEnv);
    expect(confCom.ready).toBe(true);
    expect(confCom.pending).toBeNull();
  });

  // 8. ponte-uso
  it("ponte-uso: relatório assinado insere custo no livro-caixa e tutor_live_account_today reflete o valor", async () => {
    const { assinarRelatorio } = await import("../../server/vozPonte/bilhete");
    const SEGREDO = "segredo-super-secreto-para-os-testes-da-ponte-32chars";
    const antesUrl = process.env.VOZ_PONTE_URL;
    const antesSeg = process.env.VOZ_PONTE_SEGREDO;
    process.env.VOZ_PONTE_URL = "wss://ponte.teste/ponte";
    process.env.VOZ_PONTE_SEGREDO = SEGREDO;
    try {
      const s = await start(PAGO);
      const callId = (
        await sql(
          `insert into public.tutor_voice_calls (user_id, session_id, model, provider, status, consumed_seconds, lease_until)
           values ($1, $2, 'gemini-3.8-live', 'gemini', 'ended', 60, now()) returning id`,
          [PAGO, s]
        )
      )[0].id;
      const corpo = JSON.stringify({
        vc: callId,
        u: PAGO,
        modelo: "gemini-3.8-live",
        duracao_s: 60,
        turnos: 1,
        uso: { textoEntrada: 1000, audioEntrada: 200, textoSaida: 150, audioSaida: 300 },
        custo_usd: 0.1234,
        motivo: "aluno encerrou",
        t: Date.now(),
      });
      const assinatura = assinarRelatorio(corpo, SEGREDO);
      const r = await fetch(`${base}/voice/ponte-uso`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Stazia-Ponte-Assinatura": assinatura },
        body: corpo,
      });
      expect(r.status).toBe(200);

      const account = (await sql(`select public.tutor_live_account_today() as a`))[0].a;
      expect(account.usd).toBe(0.1234);
    } finally {
      if (antesUrl) process.env.VOZ_PONTE_URL = antesUrl;
      else delete process.env.VOZ_PONTE_URL;
      if (antesSeg) process.env.VOZ_PONTE_SEGREDO = antesSeg;
      else delete process.env.VOZ_PONTE_SEGREDO;
    }
  });
});
