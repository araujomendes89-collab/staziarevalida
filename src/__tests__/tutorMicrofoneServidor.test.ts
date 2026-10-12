// @vitest-environment node
/**
 * CF02 (Fase 1 objetiva, 2026-10-12): o microfone da Nexus é da equipe até o dono abrir aos alunos e preencher os tetos diários da
 * transcrição. Rota POST /api/tutor/voice/transcribe e GET /api/tutor/nexus (campo stt). Sem rede.
 *   - padrão: aluno recebe 403 stt_team_only antes de qualquer gasto; equipe transcreve;
 *   - chave aberta mas sem teto (estado que o painel não deixa criar): continua fechado;
 *   - tetos: por aluno no plano pago e no teste, e da plataforma, contados pelo registro de uso do dia de Brasília.
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
import { createTutorRouter } from "../../server/tutor/router";
import { STT_ACCOUNT_LIMIT, STT_DEFAULT_MODEL, STT_STUDENT_LIMIT, STT_TEAM_ONLY, sttAccessOf } from "../../server/tutor/stt";
import { DEFAULT_SETTINGS } from "../../server/tutor/settings";
import { aceitarTermos } from "./helpers/aceites";

const KEY = "sk-teste-" + "k".repeat(40);
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ALUNA = "00000000-0000-4000-8000-0000000000c7";
const SEM_ACEITE = "00000000-0000-4000-8000-0000000000c8";
const TESTE = "00000000-0000-4000-8000-0000000000c6";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-stt-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const tokens: Record<string, string> = {};
const logs: string[] = [];
let sent: { url: string; auth: string | null; form: FormData }[] = [];
let answer: () => Response = () => Response.json({ text: "Alternativa B" });
const fakeFetch = (async (url: string, init: RequestInit) => {
  sent.push({ url, auth: new Headers(init.headers).get("authorization"), form: init.body as FormData });
  return answer();
}) as typeof fetch;
const deps: any = { mockRespond: () => ({}), fetch: fakeFetch, log: (m: string) => logs.push(m) };

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const openCall = async (uid: string) => {
  const s = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'nexus', 'durona', 3) returning id`, [uid]))[0].id;
  const o = (await sql(`select public.ch_worker_tutor_tts_open($1, $2, true, false) r`, [uid, s]))[0].r;
  expect(o.ok).toBe(true);
  return o.voice_call_id as string;
};
const send = async (uid: string, call: string | null, audio: Buffer, type = "audio/webm;codecs=opus", seconds: string | null = "3.2") => {
  const r = await fetch(`${base}/voice/transcribe`, {
    method: "POST", body: audio,
    headers: { Authorization: `Bearer ${tokens[uid]}`, "Content-Type": type, ...(call ? { "X-Voice-Call-Id": call } : {}), ...(seconds != null ? { "X-Audio-Seconds": seconds } : {}) },
  });
  return { status: r.status, json: await r.json() };
};
const sttRows = async (uid: string) => sql(`select duration_seconds, estimated_cost_usd::float c, model, meta from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_stt' order by id`, [uid]);

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev'), ($3, 'sem@t.dev'), ($4, 'teste@t.dev')`, [ADMIN, ALUNA, SEM_ACEITE, TESTE]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [ALUNA, SEM_ACEITE]);
  await dev.db.query(`update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '5 days' where user_id = $1`, [TESTE]);
  await aceitarTermos(dev.db, ALUNA);
  await aceitarTermos(dev.db, ADMIN);
  await aceitarTermos(dev.db, TESTE);
  for (const uid of [ALUNA, SEM_ACEITE, ADMIN, TESTE]) tokens[uid] = await dev.createSession(uid);
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true, voice_enabled: true, stt_price_per_min_usd: 0.003, pronunciations: [{ term: "INEP", say: "inépi" }, { term: "DPOC", say: "dê-pê-ó-cê" }] }, "Ajuste para os testes da transcrição do Nexus.");
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
}, 300_000);
afterAll(async () => {
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  sent = [];
  logs.length = 0;
  answer = () => Response.json({ text: "Alternativa B" });
  deps.stt = { ready: true, model: STT_DEFAULT_MODEL, key: KEY, pending: null };
});


const ABERTO = { stt_team_only: false, stt_trial_daily_seconds: 10, stt_paid_daily_seconds: 20, stt_account_daily_seconds: 100 };
const configurar = async (c: Record<string, unknown>) => {
  const sets = Object.entries(c).map(([k], i) => `${k} = $${i + 1}`).join(", ");
  await dev.db.query(`update public.tutor_config set ${sets}`, Object.values(c));
};
const FECHADO = { stt_team_only: true, stt_trial_daily_seconds: null, stt_paid_daily_seconds: null, stt_account_daily_seconds: null };
const nexus = async (uid: string) => {
  const r = await fetch(`${base}/nexus`, { headers: { Authorization: `Bearer ${tokens[uid]}` } });
  return { status: r.status, json: await r.json() };
};
const zerar = async () => {
  await sql(`delete from public.ai_usage_ledger where feature = 'tutor_stt'`);
  await configurar(FECHADO);
};

describe("CF02 — padrão: microfone só da equipe", () => {
  beforeEach(zerar);

  it("o aluno recebe 403 stt_team_only, sem chamar o serviço e sem registro; a equipe transcreve", async () => {
    const call = await openCall(ALUNA);
    const r = await send(ALUNA, call, Buffer.from("fala"));
    expect(r).toEqual({ status: 403, json: { error: STT_TEAM_ONLY, code: "stt_team_only" } });
    expect(sent).toHaveLength(0);
    expect(await sttRows(ALUNA)).toEqual([]);
    expect(STT_TEAM_ONLY).not.toMatch(/openai|google|gemini|elevenlabs/i);
    const equipe = await openCall(ADMIN);
    expect(await send(ADMIN, equipe, Buffer.from("fala"))).toEqual({ status: 200, json: { text: "Alternativa B" } });
    expect(sent).toHaveLength(1);
  });

  it("a entrada da Nexus diz stt: false ao aluno e stt: true à equipe", async () => {
    expect((await nexus(ALUNA)).json).toMatchObject({ stt: false });
    expect((await nexus(ADMIN)).json).toMatchObject({ stt: true });
  });

  it("chave aberta mas sem teto (estado que o painel não deixa criar): continua fechado para o aluno", async () => {
    await configurar({ stt_team_only: false });
    const call = await openCall(ALUNA);
    expect((await send(ALUNA, call, Buffer.from("fala"))).json).toMatchObject({ code: "stt_team_only" });
    expect((await nexus(ALUNA)).json).toMatchObject({ stt: false });
    // só o teto da plataforma não basta
    await configurar({ stt_account_daily_seconds: 100 });
    expect((await send(ALUNA, call, Buffer.from("fala"))).json).toMatchObject({ code: "stt_team_only" });
    expect(sent).toHaveLength(0);
  });

  it("sem o aceite do Tutor, o aceite vem antes (403 tutor_consent), mesmo com o microfone fechado", async () => {
    const semAceite = await openCall(SEM_ACEITE);
    expect(await send(SEM_ACEITE, semAceite, Buffer.from("x"))).toMatchObject({ status: 403, json: { code: "tutor_consent" } });
  });
});

describe("CF02 — tetos diários da transcrição", () => {
  beforeEach(async () => {
    await zerar();
    await configurar(ABERTO);
  });

  it("aberto com os tetos preenchidos: a entrada diz stt: true ao aluno", async () => {
    expect((await nexus(ALUNA)).json).toMatchObject({ stt: true });
  });

  it("plano pago: soma o que já transcreveu hoje; passou do teto, 403 stt_student_limit sem chamar o serviço", async () => {
    const call = await openCall(ALUNA);
    expect((await send(ALUNA, call, Buffer.from("a"), "audio/webm", "12")).status).toBe(200); // 12 de 20
    expect((await send(ALUNA, call, Buffer.from("b"), "audio/webm", "9")).json).toEqual({ error: STT_STUDENT_LIMIT, code: "stt_student_limit" }); // 12 + 9 > 20
    expect(sent).toHaveLength(1);
    expect((await send(ALUNA, call, Buffer.from("c"), "audio/webm", "8")).status).toBe(200); // 12 + 8 = 20, cabe
    expect((await send(ALUNA, call, Buffer.from("d"), "audio/webm", "0.5")).status).toBe(403); // arredonda para 1 s: 21 > 20
    expect(sent).toHaveLength(2);
    expect((await sttRows(ALUNA)).map((r) => r.duration_seconds)).toEqual([12, 8]);
    expect(STT_STUDENT_LIMIT).not.toMatch(/openai|google|gemini|elevenlabs/i);
  });

  it("o limite é de cada aluno: outro aluno não é afetado e a equipe não tem teto", async () => {
    const call = await openCall(ALUNA);
    await send(ALUNA, call, Buffer.from("a"), "audio/webm", "20");
    expect((await send(ALUNA, call, Buffer.from("b"), "audio/webm", "1")).status).toBe(403);
    const equipe = await openCall(ADMIN);
    for (let i = 0; i < 3; i++) expect((await send(ADMIN, equipe, Buffer.from("x"), "audio/webm", "30")).status).toBe(200);
  });

  it("teste grátis usa o teto do teste (menor)", async () => {
    const call = await openCall(TESTE);
    expect((await send(TESTE, call, Buffer.from("a"), "audio/webm", "11")).json).toMatchObject({ code: "stt_student_limit" });
    expect((await send(TESTE, call, Buffer.from("b"), "audio/webm", "10")).status).toBe(200);
  });

  it("teto da plataforma: a soma de todos (equipe incluída) no dia; 403 stt_account_limit só para o aluno", async () => {
    await configurar({ stt_account_daily_seconds: 40, stt_paid_daily_seconds: 40 });
    const equipe = await openCall(ADMIN);
    await send(ADMIN, equipe, Buffer.from("x"), "audio/webm", "30"); // 30 de 40 na plataforma
    const call = await openCall(ALUNA);
    expect((await send(ALUNA, call, Buffer.from("a"), "audio/webm", "11")).json).toEqual({ error: STT_ACCOUNT_LIMIT, code: "stt_account_limit" });
    expect((await send(ALUNA, call, Buffer.from("b"), "audio/webm", "10")).status).toBe(200);
    expect((await send(ALUNA, call, Buffer.from("c"), "audio/webm", "1")).status).toBe(403);
    expect((await send(ADMIN, equipe, Buffer.from("y"), "audio/webm", "30")).status).toBe(200);
  });

  it("transcrição de ontem não conta hoje", async () => {
    await sql(`insert into public.ai_usage_ledger (user_id, feature, provider, model, duration_seconds, day) values ($1, 'tutor_stt', 'openai', 'x', 500, (now() at time zone 'America/Sao_Paulo')::date - 1)`, [ALUNA]);
    const call = await openCall(ALUNA);
    expect((await send(ALUNA, call, Buffer.from("a"), "audio/webm", "15")).status).toBe(200);
  });
});

describe("CF02 — regra pura (sttAccessOf)", () => {
  const S = { ...DEFAULT_SETTINGS, stt_team_only: false, stt_trial_daily_seconds: 10, stt_paid_daily_seconds: 20, stt_account_daily_seconds: 100 };
  it("equipe sempre passa; padrão fechado; sem teto fechado; teto do modo certo", () => {
    expect(sttAccessOf({ staff: true, mode: "paid", settings: DEFAULT_SETTINGS })).toBeNull();
    expect(sttAccessOf({ staff: false, mode: "paid", settings: DEFAULT_SETTINGS })).toBe("team_only");
    expect(sttAccessOf({ staff: false, mode: "paid", settings: { ...S, stt_paid_daily_seconds: null } })).toBe("team_only");
    expect(sttAccessOf({ staff: false, mode: "trial", settings: { ...S, stt_account_daily_seconds: null } })).toBe("team_only");
    expect(sttAccessOf({ staff: false, mode: "blocked", settings: S })).toBe("team_only");
    expect(sttAccessOf({ staff: false, mode: "paid", settings: S })).toBeNull();
    const used = (user_seconds: number, account_seconds = 0) => ({ user_seconds, account_seconds });
    expect(sttAccessOf({ staff: false, mode: "trial", settings: S, used: used(0), seconds: 10 })).toBeNull();
    expect(sttAccessOf({ staff: false, mode: "trial", settings: S, used: used(1), seconds: 10 })).toBe("student_limit");
    expect(sttAccessOf({ staff: false, mode: "paid", settings: S, used: used(1), seconds: 10 })).toBeNull();
    expect(sttAccessOf({ staff: false, mode: "paid", settings: S, used: used(0, 95), seconds: 6 })).toBe("account_limit");
    expect(sttAccessOf({ staff: false, mode: "paid", settings: S, used: used(0, 94), seconds: 6 })).toBeNull();
  });
});
