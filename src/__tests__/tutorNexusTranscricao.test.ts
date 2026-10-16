// @vitest-environment node
/**
 * Transcrição da fala do aluno na Nexus (spec §16 "Rotas novas"): POST /api/tutor/voice/transcribe recebe o áudio (até 4 MB e
 * 45 s), só de quem tem o aceite do Tutor e uma conversa de voz aberta, e devolve só o texto. O áudio não fica em lugar
 * nenhum; a transcrição entra no registro de uso (tutor_stt) em segundos, com o preço do painel. Sem rede.
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
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, STT_DEFAULT_MODEL, STT_FAILED, sttConfig, sttPrompt } from "../../server/tutor/stt";
import { aceitarTermos } from "./helpers/aceites";

const KEY = "sk-teste-" + "k".repeat(40);
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ALUNA = "00000000-0000-4000-8000-0000000000c7";
const SEM_ACEITE = "00000000-0000-4000-8000-0000000000c8";
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
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev'), ($3, 'sem@t.dev')`, [ADMIN, ALUNA, SEM_ACEITE]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [ALUNA, SEM_ACEITE]);
  await aceitarTermos(dev.db, ALUNA);
  for (const uid of [ALUNA, SEM_ACEITE]) tokens[uid] = await dev.createSession(uid);
  // CF02: o microfone dos alunos só abre com os tetos diários e o preço preenchidos; aqui o dono "já abriu" (direto no banco)
  await dev.db.query(`update public.tutor_config set stt_team_only = false, stt_trial_daily_seconds = 300, stt_paid_daily_seconds = 1800, stt_account_daily_seconds = 36000`);
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

describe("Transcrição da Nexus", () => {
  it("transcreve em português com a dica de comandos e os termos do painel; devolve só o texto", async () => {
    const call = await openCall(ALUNA);
    const r = await send(ALUNA, call, Buffer.from("audio-de-teste"));
    expect(r).toEqual({ status: 200, json: { text: "Alternativa B" } });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(sent[0].auth).toBe(`Bearer ${KEY}`);
    const f = sent[0].form;
    expect(f.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(f.get("language")).toBe("pt");
    const prompt = String(f.get("prompt"));
    expect(prompt).toBe(sttPrompt(["INEP", "DPOC"]));
    expect(prompt).toContain("confirmo");
    expect(prompt).toContain("Termos: INEP, DPOC.");
    expect(sttPrompt([])).toBe("Conversa de estudo de medicina para o Revalida, em português do Brasil. Comandos: alternativa A, alternativa B, alternativa C, alternativa D, confirmo, cancela, dica, próxima.");
    // a trava própria e a chave de verdade decidem se a transcrição liga
    expect(sttConfig({}).ready).toBe(false);
    expect(sttConfig({ OPENAI_API_KEY: KEY }).ready).toBe(false);
    expect(sttConfig({ TUTOR_STT_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: "MY_OPENAI_API_KEY" }).ready).toBe(false);
    expect(sttConfig({ TUTOR_STT_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: KEY })).toEqual({ ready: true, model: "gpt-4o-mini-transcribe", key: KEY, pending: null });
    expect(sttConfig({ TUTOR_STT_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: KEY, TUTOR_STT_MODEL: " gpt-4o-transcribe " }).model).toBe("gpt-4o-transcribe");
  });

  it("aceita o áudio do iPhone (audio/mp4) e do Chrome (audio/webm;codecs=opus)", async () => {
    const call = await openCall(ALUNA);
    for (const [type, ext] of [["audio/mp4", "mp4"], ["audio/webm;codecs=opus", "webm"]] as const) {
      expect((await send(ALUNA, call, Buffer.from(`bytes-${ext}`), type)).status, type).toBe(200);
      const file = sent.at(-1)!.form.get("file") as File;
      expect(file.name, type).toBe(`fala.${ext}`);
      expect(file.type, type).toMatch(new RegExp(`^audio/${ext}`));
      expect(Buffer.from(await file.arrayBuffer()).toString(), type).toBe(`bytes-${ext}`);
    }
    expect(await send(ALUNA, call, Buffer.from("x"), "audio/ogg")).toMatchObject({ status: 415 });
  });

  it("o áudio não fica: nenhuma tabela, registro ou log guarda o áudio", async () => {
    const call = await openCall(ALUNA);
    answer = () => Response.json({ text: "texto-transcrito-secreto" });
    const MARK = "MARCADOR-DO-AUDIO-7f3a";
    expect((await send(ALUNA, call, Buffer.from(`${MARK}${"\u0000".repeat(64)}`))).status).toBe(200);
    const dump = JSON.stringify([
      await sql(`select content, meta from public.tutor_messages where user_id = $1`, [ALUNA]),
      await sql(`select meta from public.ai_usage_ledger where user_id = $1`, [ALUNA]),
      await sql(`select metrics from public.tutor_voice_calls where user_id = $1`, [ALUNA]),
    ]);
    expect(dump).not.toContain(MARK);
    expect(dump).not.toContain("texto-transcrito-secreto");
    expect(logs.join("\n")).not.toContain(MARK);
    expect(logs.join("\n")).not.toContain("texto-transcrito-secreto");
  });

  it("registra tutor_stt em segundos com o preço do painel", async () => {
    const call = await openCall(ALUNA);
    const before = (await sttRows(ALUNA)).length;
    expect((await send(ALUNA, call, Buffer.from("fala"), "audio/mp4", "12.4")).status).toBe(200);
    const rows = (await sttRows(ALUNA)).slice(before);
    expect(rows).toEqual([{ duration_seconds: 13, c: Math.round((12.4 / 60) * 0.003 * 1e6) / 1e6, model: "gpt-4o-mini-transcribe", meta: { voice_call: call } }]);
    // não conta nos caracteres da voz do professor
    expect((await sql(`select count(*)::int n from public.tutor_tts_usage where user_id = $1`, [ALUNA]))[0].n).toBe(0);
  });

  it("recusa sem o aceite (403 tutor_consent), sem conversa de voz aberta (409), acima de 45 s ou de 4 MB (413) e com a trava desligada (503)", async () => {
    expect(MAX_AUDIO_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_AUDIO_SECONDS).toBe(45);
    const semAceite = await openCall(SEM_ACEITE);
    expect(await send(SEM_ACEITE, semAceite, Buffer.from("x"))).toMatchObject({ status: 403, json: { code: "tutor_consent" } });
    expect(await send(ALUNA, "00000000-0000-4000-8000-00000000dead", Buffer.from("x"))).toEqual({ status: 409, json: { error: "A conversa por voz foi encerrada." } });
    expect((await send(ALUNA, null, Buffer.from("x"))).status).toBe(409);
    expect((await send(ALUNA, semAceite, Buffer.from("x"))).status).toBe(409); // a chamada é de outro aluno
    const call = await openCall(ALUNA);
    const too = { status: 413, json: { error: "Áudio acima de 45 segundos ou de 4 MB." } };
    expect(await send(ALUNA, call, Buffer.from("x"), "audio/webm", "45.5")).toEqual(too);
    expect(await send(ALUNA, call, Buffer.from("x"), "audio/webm", null)).toEqual(too);
    expect(await send(ALUNA, call, Buffer.alloc(0), "audio/webm")).toEqual(too);
    expect(await send(ALUNA, call, Buffer.alloc(MAX_AUDIO_BYTES + 1), "audio/webm")).toEqual(too);
    deps.stt = { ready: false, model: STT_DEFAULT_MODEL, key: null, pending: "desligada" };
    expect(await send(ALUNA, call, Buffer.from("x"))).toEqual({ status: 503, json: { error: "A transcrição não está ligada no servidor." } });
    expect(sent).toHaveLength(0);
    // conversa de voz encerrada
    deps.stt = { ready: true, model: STT_DEFAULT_MODEL, key: KEY, pending: null };
    await sql(`select public.ch_worker_tutor_voice_end($1, $2, 'student')`, [ALUNA, call]);
    expect((await send(ALUNA, call, Buffer.from("x"))).status).toBe(409);
  });

  it("falha na transcrição: 502 'Não entendi, pode repetir ou digitar?' (stt_failed), sem registro; nada nomeia fornecedor", async () => {
    const call = await openCall(ALUNA);
    const before = (await sttRows(ALUNA)).length;
    for (const bad of [() => new Response("erro do serviço", { status: 500 }), () => Response.json({ text: "   " })]) {
      answer = bad;
      const r = await send(ALUNA, call, Buffer.from("fala"));
      expect(r).toEqual({ status: 502, json: { error: STT_FAILED, code: "stt_failed" } });
    }
    expect(STT_FAILED).toBe("Não entendi, pode repetir ou digitar?");
    expect((await sttRows(ALUNA)).length).toBe(before);
    for (const msg of [STT_FAILED, "A transcrição não está ligada no servidor.", "Áudio acima de 45 segundos ou de 4 MB.", "A conversa por voz foi encerrada."]) {
      expect(msg).not.toMatch(/openai|google|gemini|elevenlabs/i);
    }
  });

  it("teto por aluno: uma transcrição por vez, até 20 por minuto, e o áudio do tamanho da duração declarada (o serviço cobra pelo tempo de verdade)", async () => {
    const uid = "00000000-0000-4000-8000-0000000000c9";
    await sql(`insert into auth.users (id, email) values ($1, 'teto@t.dev')`, [uid]);
    await sql(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [uid]);
    await aceitarTermos(dev.db, uid);
    tokens[uid] = await dev.createSession(uid);
    const call = await openCall(uid);
    const busy = { status: 429, json: { error: "Espere um pouco antes de falar de novo.", code: "stt_busy" } };
    // a duração declarada não cabe no tamanho: 200 kB em 1 s é áudio de muitos minutos espremido
    expect(await send(uid, call, Buffer.alloc(200_000), "audio/webm", "1")).toEqual({ status: 413, json: { error: "Áudio acima de 45 segundos ou de 4 MB." } });
    expect((await send(uid, call, Buffer.alloc(90_000), "audio/webm", "1")).status).toBe(200);
    // uma por vez
    let release!: () => void;
    answer = () => new Promise<Response>((r) => (release = () => r(Response.json({ text: "Alternativa B" })))) as unknown as Response;
    const first = send(uid, call, Buffer.from("fala"));
    await new Promise((r) => setTimeout(r, 150));
    expect(await send(uid, call, Buffer.from("fala"))).toEqual(busy);
    release();
    expect((await first).status).toBe(200);
    answer = () => Response.json({ text: "Alternativa B" });
    // até 20 por minuto (2 já foram)
    for (let i = 0; i < 18; i++) expect((await send(uid, call, Buffer.from("fala"))).status).toBe(200);
    expect(await send(uid, call, Buffer.from("fala"))).toEqual(busy);
    expect(sent).toHaveLength(20);
  });
});
