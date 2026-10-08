// @vitest-environment node
/**
 * Tutor Nexus no banco (migração 20261003005600): começar a conversa já com o professor escolhido (e a última escolha
 * gravada junto), conversas antigas só para leitura com o nome original, os limites e preços da voz do professor no
 * painel do Tutor e a aprovação das vozes (cada voz sozinha, só depois de ouvir todos os cenários da mesma versão).
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
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { createTutorRouter } from "../../server/tutor/router";
import { PROFESSOR_CHANGED, tutorTurn } from "../../server/tutor/engine";
import type { RealtimeConfig } from "../../server/tutor/realtime";
import type { LiveConfig } from "../../server/tutor/voiceProviders";
import { forgetTutorSettings, tutorSettings } from "../../server/tutor/settings";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-banco-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ALUNA = "00000000-0000-4000-8000-0000000000c1";
const OUTRO = "00000000-0000-4000-8000-0000000000c2";
const NOVA = "00000000-0000-4000-8000-0000000000c3"; // sem o aceite do Tutor
const KEY = "sk-servidor-" + "y".repeat(40);
const FP = "a".repeat(64);
const FP2 = "b".repeat(64);
const CENARIOS = ["apresentacao", "correcao"];
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string | null, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const arg = (a: unknown) => (a !== null && typeof a === "object" && !Array.isArray(a) ? JSON.stringify(a) : a);
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map(arg))))[0].r;
/** Funções do servidor (ch_worker_*): rodam com a chave de serviço, que aqui é o dono do banco. */
const worker = async (fn: string, ...args: unknown[]) =>
  (await sql(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map(arg)))[0].r;
const config = (c: Record<string, unknown>, why = "Ajuste para os testes do Tutor Nexus.") => rpc(ADMIN, "app_admin_tutor_save_config", c, why);
const reply = (text: string): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [] });
const RT: RealtimeConfig = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };
const LIVE: LiveConfig = { ready: true, model: "gpt-live-1", key: KEY, pending: null };
const fetchCalls: string[] = [];
const fakeFetch = (async (url: string) => {
  fetchCalls.push(String(url));
  return new Response(JSON.stringify({ error: "não deveria chamar" }), { status: 500 });
}) as unknown as typeof fetch;
const deps: any = { mockRespond: () => reply("Oi."), realtime: RT, live: LIVE, fetch: fakeFetch };
let server: Server;
let base: string;
let token: string;
const post = async (p: string, body: unknown, tk = token) => {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const legacySession = async (personality: string, legacy: unknown) =>
  (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, legacy_persona) values ($1, 'livre', 'antiga', $2, 3, $3) returning id`,
    [ALUNA, personality, legacy === null ? null : JSON.stringify(legacy)]))[0].id as string;

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  process.env.TUTOR_AI_PROVIDER = "mock";
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev'), ($3, 'outro@t.dev'), ($4, 'nova@t.dev')`, [ADMIN, ALUNA, OUTRO, NOVA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active' where user_id in ($1, $2, $3)`, [ALUNA, OUTRO, NOVA]);
  for (const uid of [ALUNA, OUTRO]) await aceitarTermos(dev.db, uid);
  await config({ enabled: true, requires_pro: true }, "Tutor ligado para os testes do Tutor Nexus.");
  deps.db = db;
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
  token = await dev.createSession(ALUNA);
}, 300_000);
afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.TUTOR_AI_PROVIDER;
});

describe("Tutor Nexus no banco", () => {
  it("começar com o professor escolhido grava a conversa e a última escolha juntas; o palavrão da conversa segue a regra de hoje", async () => {
    const max = (await rpc(ADMIN, "app_admin_tutor_config")).max_profanity;
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null, { type: "free" }, "durona");
    expect(s.personality.id).toBe("durona");
    expect((await sql(`select personality_id, profanity from public.tutor_preferences where user_id = $1`, [ALUNA]))[0]).toEqual({ personality_id: "durona", profanity: max });
    expect((await sql(`select settings ->> 'profanity' p from public.tutor_sessions where id = $1`, [s.id]))[0].p).toBe(max);
    const t = await rpc(ALUNA, "app_tutor_start", "livre", null, null, { type: "free" }, "acolhedor");
    expect(t.personality.id).toBe("acolhedor");
    expect((await sql(`select personality_id, profanity from public.tutor_preferences where user_id = $1`, [ALUNA]))[0]).toEqual({ personality_id: "acolhedor", profanity: "off" });
  });

  it("só os três professores ativos: desligado ou inexistente recusa sem criar conversa", async () => {
    const count = async () => (await sql(`select count(*)::int n from public.tutor_sessions where user_id = $1`, [ALUNA]))[0].n;
    const before = await count();
    for (const p of ["preguicoso", "xyz"]) {
      await expect(rpc(ALUNA, "app_tutor_start", "livre", null, null, null, p), p).rejects.toThrow(/Professor não encontrado/);
    }
    await rpc(ADMIN, "app_admin_tutor_set_personality", "direto", false, "Desligado para o teste do Tutor Nexus.");
    await expect(rpc(ALUNA, "app_tutor_start", "livre", null, null, null, "direto")).rejects.toThrow(/Professor não encontrado/);
    await rpc(ADMIN, "app_admin_tutor_set_personality", "direto", true, "Religado depois do teste do Tutor Nexus.");
    expect(await count()).toBe(before);
  });

  it("sem p_personality vale a preferência salva; o aceite pendente continua vindo antes do professor", async () => {
    await rpc(ALUNA, "app_tutor_save_preferences", { personality_id: "direto" });
    expect((await rpc(ALUNA, "app_tutor_start", "livre", null, null, null)).personality.id).toBe("direto");
    expect((await rpc(ALUNA, "app_tutor_start", "livre", null, null, null, null)).personality.id).toBe("direto");
    await expect(rpc(NOVA, "app_tutor_start", "livre", null, null, null, "xyz")).rejects.toThrow(/Aceite do Tutor pendente/);
  });

  it("conversa marcada ou de professor desligado: lista e abertura dizem só leitura com o nome original; turno e voz recusam com 409", async () => {
    const marcada = await legacySession("acolhedor", { name: "Acolhedor", emoji: "🤗" });
    const desligado = await legacySession("preguicoso", null);
    const lista = await rpc(ALUNA, "app_tutor_sessions", 50);
    const item = lista.find((x: any) => x.id === marcada);
    expect(item).toMatchObject({ read_only: true, persona: "Acolhedor", personality: "🤗", personality_id: "acolhedor" });
    expect(lista.find((x: any) => x.id === desligado)).toMatchObject({ read_only: true, personality_id: "preguicoso" });
    expect(lista.filter((x: any) => x.id !== marcada && x.id !== desligado).every((x: any) => x.read_only === false)).toBe(true);
    const aberta = await rpc(ALUNA, "app_tutor_session", marcada);
    expect(aberta.read_only).toBe(true);
    expect(aberta.personality).toMatchObject({ name: "Acolhedor", emoji: "🤗" });
    expect((await rpc(ALUNA, "app_tutor_session", desligado)).read_only).toBe(true);
    expect((await worker("ch_worker_tutor_context", ALUNA, marcada)).session.read_only).toBe(true);

    for (const sid of [marcada, desligado]) {
      await expect(tutorTurn({ ...deps, db }, ALUNA, sid, { type: "message", text: "oi" })).rejects.toMatchObject({ status: 409, message: PROFESSOR_CHANGED });
      const r = await post("/voice/start", { session_id: sid, sdp: "v=0 oferta" });
      expect(r).toEqual({ status: 409, body: expect.objectContaining({ error: "Este professor mudou. Comece uma conversa nova." }) });
    }
    expect(fetchCalls).toEqual([]);
  });

  it("painel: 'só equipe', limites e preços com os padrões 4500/4500/4500/30000/0/0/true; salvos com motivo e lidos pelo servidor", async () => {
    const keys = ["tts_team_only", "tts_trial_daily_chars", "tts_paid_daily_chars", "tts_account_daily_chars", "tts_account_monthly_chars", "tts_price_per_1k_chars_usd", "stt_price_per_min_usd"];
    const pick = (o: any) => Object.fromEntries(keys.map((k) => [k, typeof o[k] === "string" ? Number(o[k]) : o[k]]));
    expect(pick(await rpc(ADMIN, "app_admin_tutor_config"))).toEqual({
      tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
      tts_price_per_1k_chars_usd: 0, stt_price_per_min_usd: 0,
    });
    await expect(config({ tts_paid_daily_chars: 3000 }, "curto")).rejects.toThrow(/motivo/);
    await expect(config({ tts_trial_daily_chars: -1 })).rejects.toThrow();
    const novo = { tts_team_only: false, tts_trial_daily_chars: 3000, tts_paid_daily_chars: 6000, tts_account_daily_chars: 9000, tts_account_monthly_chars: 60000, tts_price_per_1k_chars_usd: 0.3, stt_price_per_min_usd: 0.006 };
    expect(pick(await config(novo))).toEqual(novo);
    expect(pick(await worker("ch_worker_tutor_settings"))).toEqual(novo);
    forgetTutorSettings({ db });
    expect(pick(await tutorSettings({ db }))).toEqual(novo);
    await config({ tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000, tts_price_per_1k_chars_usd: 0, stt_price_per_min_usd: 0 });
  });

  it("aprovação só de administrador e só depois de ouvir todos os cenários da mesma versão nas últimas 24 h; revogar uma não mexe nas outras", async () => {
    const aprovar = (voice: string, fp = FP, user = ADMIN) => worker("ch_worker_tutor_voice_approve", user, voice, fp, `{${CENARIOS.join(",")}}`, `tutor-voice-samples/${voice}/${fp}.mp3`);
    const ouvir = (voice: string, scenario: string, fp = FP, user = ADMIN) => worker("ch_worker_tutor_voice_listened", user, voice, fp, scenario);
    await expect(aprovar("durona")).rejects.toThrow(/Ouça todos os cenários desta voz antes de aprovar/);
    await ouvir("durona", "apresentacao");
    await expect(aprovar("durona")).rejects.toThrow(/Ouça todos os cenários/);
    await ouvir("durona", "correcao", FP2); // outra versão da voz não conta
    await expect(aprovar("durona")).rejects.toThrow(/Ouça todos os cenários/);
    await ouvir("durona", "correcao");
    await sql(`update public.tutor_voice_listen_log set heard_at = now() - interval '25 hours' where voice = 'durona' and scenario = 'correcao' and fingerprint = $1`, [FP]);
    await expect(aprovar("durona")).rejects.toThrow(/Ouça todos os cenários/);
    await ouvir("durona", "correcao");
    const painel = await aprovar("durona");
    expect(painel.approvals.durona).toMatchObject({ fingerprint: FP, revoked_at: null, sample_path: `tutor-voice-samples/durona/${FP}.mp3` });
    expect(painel.heard).toEqual(expect.arrayContaining([{ voice: "durona", fingerprint: FP, scenario: "apresentacao" }, { voice: "durona", fingerprint: FP, scenario: "correcao" }]));

    await expect(ouvir("durona", "apresentacao", FP, ALUNA)).rejects.toThrow(/Acesso restrito a administradores/);
    await expect(aprovar("direto", FP, ALUNA)).rejects.toThrow(/Acesso restrito a administradores/);
    await expect(worker("ch_worker_tutor_voice_panel", ALUNA)).rejects.toThrow(/Acesso restrito a administradores/);
    await expect(ouvir("xyz", "apresentacao")).rejects.toThrow(/Voz inválida/);

    for (const c of CENARIOS) await ouvir("direto", c);
    await aprovar("direto");
    const depois = await worker("ch_worker_tutor_voice_revoke", ADMIN, "durona");
    expect(depois.approvals.durona.revoked_at).not.toBeNull();
    expect(depois.approvals.direto).toMatchObject({ fingerprint: FP, revoked_at: null });
    const log = (await sql(`select action, actor_id from public.admin_audit_log where action like 'tutor.voice.%' order by id`)).map((r: any) => [r.action, r.actor_id]);
    expect(log).toEqual([["tutor.voice.approve", ADMIN], ["tutor.voice.approve", ADMIN], ["tutor.voice.revoke", ADMIN]]);
    // aprovar de novo zera a revogação
    expect((await aprovar("durona")).approvals.durona.revoked_at).toBeNull();
  });

  it("aprovações e audições: o navegador não lê nem grava; as funções novas são só do servidor", async () => {
    for (const uid of [ALUNA, ADMIN, null]) {
      expect(await as(uid, (q) => q(`select * from public.tutor_voice_approvals`)).catch(() => [])).toEqual([]);
      expect(await as(uid, (q) => q(`select * from public.tutor_voice_listen_log`)).catch(() => [])).toEqual([]);
      await expect(as(uid, (q) => q(`insert into public.tutor_voice_approvals (voice, fingerprint) values ('tranquilo', $1)`, [FP]))).rejects.toThrow();
      for (const call of [
        `select public.ch_worker_tutor_voice_panel('${ADMIN}')`,
        `select public.ch_worker_tutor_voice_listened('${ADMIN}', 'durona', '${FP}', 'apresentacao')`,
        `select public.ch_worker_tutor_voice_approve('${ADMIN}', 'durona', '${FP}', '{apresentacao}', null)`,
        `select public.ch_worker_tutor_voice_revoke('${ADMIN}', 'durona')`,
      ]) {
        await expect(as(uid, (q) => q(call)), call).rejects.toThrow(/permission denied/);
      }
    }
  });
});
