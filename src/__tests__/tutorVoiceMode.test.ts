// @vitest-environment node
/**
 * Stazia Voice Mode no servidor (OpenAI SIMULADA, nenhuma chamada externa): GPT-Live com a oferta trocada pelo servidor e queda
 * para o Realtime, delegação (o banco corrige; o motor do Tutor responde; a voz só diz), painel (provedor, voz, limite por
 * conversa, transcrição e retenção, motor emocional, piadas internas, nível da Durona, pronúncias, professores), ferramentas novas
 * (lembrança, revisão, esperar o aluno), memória entre conversas, custo por minuto e métricas da ligação.
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
import { NO_EVALUATION, composeLiveInstructions, type TutorOutput } from "../../server/tutor/prompts";
import { createTutorRouter } from "../../server/tutor/router";
import { tutorTurn } from "../../server/tutor/engine";
import type { RealtimeConfig } from "../../server/tutor/realtime";
import { liveConfig, planProviders, resetLiveAvailability, setLiveSidebandFactory, type LiveConfig } from "../../server/tutor/voiceProviders";
import { chunks, studentTurnText, voiceIntent } from "../../server/tutor/delegate";
import { DURONA_LEVELS, engineFor, normalize, step } from "../../server/tutor/emotion";
import { voiceTimeCost } from "../../server/tutor/costs";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-voz-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const ALUNA = "00000000-0000-4000-8000-0000000000c1";
const OUTRO = "00000000-0000-4000-8000-0000000000c2";
const KEY = "sk-servidor-" + "y".repeat(40);
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;
const reply = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });
const off: Record<string, string> = {};
const config = (c: Record<string, unknown>, why = "Ajuste para o teste do modo de voz.") => rpc(ADMIN, "app_admin_tutor_save_config", c, why);

// OpenAI simulada: GPT-Live, segredo do Realtime e encerramento de chamada
const openai: { url: string; body: any; auth: string | null }[] = [];
let liveStatus = 201;
const fakeFetch = (async (url: string, init: any) => {
  openai.push({ url, body: init?.body ? JSON.parse(init.body) : null, auth: init?.headers?.Authorization ?? null });
  if (url.endsWith("/live/sessions")) {
    if (liveStatus !== 201) return new Response("sem acesso", { status: liveStatus });
    return new Response(JSON.stringify({ session: { id: `live_${openai.length}` }, transport: { type: "webrtc", sdp: "v=0 resposta-live" } }), { status: 201 });
  }
  if (url.endsWith("/realtime/client_secrets")) return new Response(JSON.stringify({ value: "ek_temporario", expires_at: 1_900_000_000 }), { status: 200 });
  if (/\/realtime\/calls\/[^/]+\/hangup$/.test(url)) return new Response("", { status: 200 });
  return new Response("?", { status: 404 });
}) as typeof fetch;
const RT: RealtimeConfig = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };
const LIVE: LiveConfig = { ready: true, model: "gpt-live-1", key: KEY, pending: null };

// canal lateral do GPT-Live simulado (encerrar pelo servidor)
const sideband: { url: string; auth: string; sent: any[] }[] = [];
setLiveSidebandFactory((url, headers) => {
  const handlers: Record<string, (...a: any[]) => void> = {};
  const ws = {
    on: (ev: string, cb: (...a: any[]) => void) => {
      handlers[ev] = cb;
      if (ev === "open") setTimeout(() => cb(), 0);
      return ws;
    },
    send: (data: string) => {
      const ev = JSON.parse(data);
      rec.sent.push(ev);
      if (ev.type === "session.close") setTimeout(() => handlers.message?.(JSON.stringify({ type: "session.closed", reason: "close_requested" })), 0);
    },
    close: () => {},
  };
  const rec = { url, auth: headers.Authorization, sent: [] as any[] };
  sideband.push(rec);
  return ws;
});

const respond = (req: any) => (req?.schemaName === "staziamed_tutor" ? reply(lastReply) : { ...NO_EVALUATION, error_type: "unknown", knowledge_gap: "ordem de prioridade", reasoning_quality: "low", recommended_action: "socratic_question" });
let lastReply = "Errou, mas vamos ver por quê.";
const deps: any = { mockRespond: respond, realtime: RT, live: LIVE, fetch: fakeFetch };
let server: Server;
let base: string;
let token: string;
const post = async (p: string, body: unknown, tk = token) => {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const SDP = "v=0 oferta-do-navegador";

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0"; // mudança no painel vale na hora (no ar, em até 15 s)
  process.env.TUTOR_AI_PROVIDER = "mock";
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev'), ($3, 'outro@t.dev')`, [ADMIN, ALUNA, OUTRO]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [ALUNA, OUTRO]);
  for (const uid of [ALUNA, OUTRO]) await aceitarTermos(dev.db, uid); // os alunos já aceitaram o §34 (o aceite em si é testado em termoAceiteTutor.test.ts)
  for (const r of await sql(`select id, correct_option from public.questions`)) off[r.id] = r.correct_option;
  await config({ enabled: true, requires_pro: true }, "Tutor ligado para os testes do modo de voz.");
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
  setLiveSidebandFactory(null);
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.DETERMINISTIC_TUTOR;
});

describe("Provedor da voz", () => {
  it("modelos só pelo ambiente; GPT-Live exige modelo, consentimento e chave; o painel escolhe e o automático prefere o GPT-Live", () => {
    expect(liveConfig({}).pending).toMatch(/OPENAI_LIVE_MODEL/);
    expect(liveConfig({ OPENAI_LIVE_MODEL: "gpt-live-1", OPENAI_API_KEY: KEY }).pending).toMatch(/TUTOR_VOICE_ALLOW_EXTERNAL=1/);
    // VZ01: a autorização da equipe sozinha não liga a voz ao vivo dos alunos; precisa também da trava própria
    expect(liveConfig({ OPENAI_LIVE_MODEL: "gpt-live-1", TUTOR_VOICE_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: KEY }).pending).toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1/);
    expect(liveConfig({ OPENAI_LIVE_MODEL: "gpt-live-1", TUTOR_VOICE_ALLOW_EXTERNAL: "1", TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: KEY })).toMatchObject({ ready: true, model: "gpt-live-1" });
    expect(planProviders("auto", {}, LIVE, RT, true)).toMatchObject({ first: "live", fallback: "realtime" });
    expect(planProviders("auto", { OPENAI_VOICE_PROVIDER: "realtime" }, LIVE, RT, true)).toMatchObject({ first: "realtime", fallback: "live" });
    expect(planProviders("realtime", { OPENAI_VOICE_PROVIDER: "live" }, LIVE, RT, true).first).toBe("realtime"); // painel manda
    expect(planProviders("live", {}, LIVE, RT, false).first).toBe("realtime"); // navegador antigo (sem oferta): Realtime
    expect(planProviders("auto", {}, { ...LIVE, ready: false, pending: "x" }, { ...RT, ready: false, pending: "y" }, true)).toMatchObject({ first: null, pending: "y" });
  });

  it("GPT-Live: o servidor troca a oferta do navegador com a OpenAI; nenhuma credencial vai ao navegador; delegação ao aplicativo", async () => {
    const session = (await rpc(ALUNA, "app_tutor_start", "questao", null, null)).id;
    openai.length = 0;
    const r = await post("/voice/start", { session_id: session, sdp: SDP });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ provider: "live", sdp: "v=0 resposta-live", model: "gpt-live-1", voice: "marin", lease_seconds: 120, session_max_seconds: 1800 });
    expect(r.body.client_secret).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    const call = openai.find((x) => x.url.endsWith("/live/sessions"))!;
    expect(call.auth).toBe(`Bearer ${KEY}`);
    expect(call.body.transport).toEqual({ type: "webrtc", sdp: SDP });
    expect(call.body.session).toMatchObject({ model: "gpt-live-1", voice: "marin", delegation: { type: "client" } });
    expect(call.body.session.tools).toBeUndefined(); // o conteúdo vem do servidor por delegação, não de ferramentas na voz
    const ins: string = call.body.session.instructions;
    expect(ins.startsWith("IDIOMA E SOTAQUE")).toBe(true);
    expect(ins).toContain("DELEGUE ao backend");
    expect(ins).toContain("Há uma questão ABERTA nesta sessão: o backend traz o caso");
    expect(ins).toContain("QUEM VOCÊ É NESTA CONVERSA: Durona");
    expect(ins).not.toMatch(/Gabarito oficial da prova: [A-D]/);
    expect((await sql(`select provider, call_id from public.tutor_voice_calls where id = $1`, [r.body.voice_call_id]))[0]).toEqual({ provider: "live", call_id: r.body.live_session_id });
    // encerrar pelo aplicativo: o servidor fecha a sessão no GPT-Live pelo canal lateral e registra o custo por minuto
    sideband.length = 0;
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '120 seconds' where id = $1`, [r.body.voice_call_id]);
    const end = await post("/voice/end", { voice_call_id: r.body.voice_call_id, metrics: { connect_ms: 812, first_audio_ms: 1400, turn_ms_avg: 950, turns: 4, reconnects: 0, delegations: 3, provider_used: "live", disconnect_reason: "student", transcript: "não pode" } });
    expect(end.status).toBe(200);
    await new Promise((x) => setTimeout(x, 30));
    expect(sideband.at(-1)).toMatchObject({ url: `wss://api.openai.com/v1/live/sessions/${r.body.live_session_id}/attach`, auth: `Bearer ${KEY}`, sent: [{ type: "session.close" }] });
    const v = (await sql(`select status, metrics from public.tutor_voice_calls where id = $1`, [r.body.voice_call_id]))[0];
    expect(v.status).toBe("ended");
    expect(v.metrics).toEqual({ connect_ms: 812, first_audio_ms: 1400, turn_ms_avg: 950, turns: 4, reconnects: 0, delegations: 3, provider_used: "live", disconnect_reason: "student" }); // só números e rótulos conhecidos
    const led = (await sql(`select duration_seconds, estimated_cost_usd::float cost, model from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_voice_live' order by id desc limit 1`, [ALUNA]))[0];
    expect(led.model).toBe("gpt-live-1");
    expect(led.cost).toBeCloseTo((led.duration_seconds / 60) * 0.05, 5);
    expect(voiceTimeCost("gpt-live-1", 60)).toBe(0.05);
  });

  it("sem acesso ao GPT-Live, cai no Realtime com a mesma ligação (sem cobrar a tentativa) e não insiste por um tempo", async () => {
    resetLiveAvailability();
    const session = (await rpc(ALUNA, "app_tutor_start", "livre", null, null)).id;
    liveStatus = 403;
    openai.length = 0;
    const r = await post("/voice/start", { session_id: session, sdp: SDP });
    liveStatus = 201;
    expect(r.body).toMatchObject({ provider: "realtime", client_secret: "ek_temporario", model: "gpt-realtime-2.1" });
    const failed = (await sql(`select status, consumed_seconds, provider from public.tutor_voice_calls where user_id = $1 and model = 'gpt-live-1' order by started_at desc limit 1`, [ALUNA]))[0];
    expect(failed).toMatchObject({ status: "ended", consumed_seconds: 0 });
    await post("/voice/end", { voice_call_id: r.body.voice_call_id });
    openai.length = 0;
    const again = await post("/voice/start", { session_id: session, sdp: SDP });
    expect(again.body.provider).toBe("realtime");
    expect(openai.some((x) => x.url.endsWith("/live/sessions"))).toBe(false);
    await post("/voice/end", { voice_call_id: again.body.voice_call_id });
    resetLiveAvailability();
  });

  it("painel: Realtime fixo ignora o GPT-Live; a voz escolhida vale para todos os professores; o aluno vê o limite da conversa", async () => {
    await config({ voice_provider: "realtime", voice_name: "cedar", voice_session_max_seconds: 900 });
    const session = (await rpc(ALUNA, "app_tutor_start", "livre", null, null)).id;
    openai.length = 0;
    const r = await post("/voice/start", { session_id: session, sdp: SDP });
    expect(r.body).toMatchObject({ provider: "realtime", voice: "cedar", session_max_seconds: 900 });
    expect(openai.find((x) => x.url.endsWith("/realtime/client_secrets"))!.body.session.audio.output.voice).toBe("cedar");
    expect((await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()))).toMatchObject({ live_voice: false, voice_session_max_seconds: 900 });
    await post("/voice/end", { voice_call_id: r.body.voice_call_id });
    await config({ voice_provider: "auto", voice_name: "", voice_session_max_seconds: 1800 });
    expect((await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json())).live_voice).toBe(true);
  });
});

describe("Delegação do GPT-Live (o banco corrige; o motor do Tutor responde; a voz só diz)", () => {
  it("regras do pedido falado: letra, negação, dúvida entre duas, dica, resolução e próxima", () => {
    expect(voiceIntent("acho que é a letra B", "open")).toEqual({ kind: "answer", option: "B" });
    expect(voiceIntent("Alternativa C.", "open")).toEqual({ kind: "answer", option: "C" });
    expect(voiceIntent("D.", "open")).toEqual({ kind: "answer", option: "D" });
    expect(voiceIntent("não é a B, né?", "open")).toEqual({ kind: "message" });
    expect(voiceIntent("tô entre a A e a C", "open")).toEqual({ kind: "message" });
    expect(voiceIntent("me dá uma dica", "open")).toEqual({ kind: "hint" });
    expect(voiceIntent("desisto, mostra a resposta", "open")).toEqual({ kind: "reveal" });
    expect(voiceIntent("letra B", "answered")).toEqual({ kind: "message" }); // respondida: a letra vira conversa
    expect(voiceIntent("bora pra próxima", "answered")).toEqual({ kind: "next" });
    expect(studentTurnText({ transcript: [{ role: "tutor", text: "Fala." }, { role: "student", text: "acho que" }, { role: "student", text: "é a B" }] })).toBe("acho que é a B");
    expect(studentTurnText({ transcript: [{ role: "student", text: "oi" }], typed: "escrevi isto" })).toBe("escrevi isto");
    expect(chunks("Frase um. ".repeat(400), 1500).every((c) => c.length <= 1500)).toBe(true);
  });

  it("a letra dita vai para o banco, o professor reage ao resultado; a voz recebe o que dizer, o tom e a emoção; a cota de texto não muda", async () => {
    const s = await rpc(ALUNA, "app_tutor_start", "questao", null, null);
    const qid = (await rpc(ALUNA, "app_tutor_session", s.id)).question.id;
    const r = await post("/voice/start", { session_id: s.id, sdp: SDP, force: true });
    expect(r.body.provider).toBe("live");
    const id = r.body.voice_call_id;
    const textBefore = (await rpc(ALUNA, "app_tutor_status")).entitlement.text.used;
    const wrong = ["A", "B", "C", "D"].find((x) => x !== off[qid])!;
    lastReply = "Errou. Olha de novo o que o caso entregou.";
    const d = await post("/voice/delegate", { voice_call_id: id, transcript: [{ role: "tutor", text: "Lê com calma." }, { role: "student", text: `minha resposta é a letra ${wrong}` }] });
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ intent: "answer", say: ["Errou. Olha de novo o que o caso entregou."], question_state: "answered" });
    expect(d.body.tone).toMatch(/ESTADO NESTA SESSÃO/);
    expect(d.body.avatar).toMatchObject({ emotion: expect.any(String), intensity: expect.any(Number) });
    // quem corrigiu foi o banco, com o gabarito oficial
    expect((await sql(`select selected_option, is_correct from public.tutor_answers where session_id = $1 order by answered_at desc limit 1`, [s.id]))[0]).toEqual({ selected_option: wrong, is_correct: false });
    expect((await rpc(ALUNA, "app_tutor_status")).entitlement.text.used).toBe(textBefore); // voz é cobrada por tempo
    expect((await sql(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_voice_backend'`, [ALUNA]))[0].n).toBeGreaterThan(0);
    // a troca fica na conversa como voz (retenção e transcrição do painel valem para ela)
    const msgs = await sql(`select role, content, meta ->> 'realtime' rt from public.tutor_messages where session_id = $1 order by id desc limit 2`, [s.id]);
    expect(msgs.map((m: any) => m.rt)).toEqual(["true", "true"]);
    // próxima questão: a fala de abertura e o caso em contexto silencioso (para a voz ler sem inventar)
    const n = await post("/voice/delegate", { voice_call_id: id, transcript: [{ role: "student", text: "bora pra próxima" }] });
    expect(n.body.intent).toBe("next");
    expect(n.body.thinking.join(" ")).toMatch(/Leia para o aluno, com naturalidade e sem dar a resposta/);
    // sem fala transcrita: pede para repetir (não inventa)
    expect((await post("/voice/delegate", { voice_call_id: id, transcript: [] })).body).toMatchObject({ intent: "unclear", say: [expect.stringMatching(/Repete a última parte/)] });
    // ligação de outro aluno não existe para este; ligação encerrada não delega
    expect((await post("/voice/delegate", { voice_call_id: id, transcript: [{ role: "student", text: "oi" }] }, await dev.createSession(OUTRO))).status).toBe(404);
    await post("/voice/end", { voice_call_id: id });
    expect((await post("/voice/delegate", { voice_call_id: id, transcript: [{ role: "student", text: "oi" }] })).status).toBe(409);
  });

  it("ligação do Realtime não usa delegação", async () => {
    await config({ voice_provider: "realtime" });
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    const r = await post("/voice/start", { session_id: s.id, force: true });
    expect((await post("/voice/delegate", { voice_call_id: r.body.voice_call_id, transcript: [{ role: "student", text: "oi" }] })).status).toBe(409);
    await post("/voice/end", { voice_call_id: r.body.voice_call_id });
    await config({ voice_provider: "auto" });
  });
});

describe("Limite por conversa e fim sem cortar a fala", () => {
  it("passou do limite do painel: avisa com folga; o aplicativo encerra depois da frase; sem encerrar, a varredura derruba", async () => {
    await config({ voice_session_max_seconds: 60 });
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    const r = await post("/voice/start", { session_id: s.id, sdp: SDP, force: true });
    const id = r.body.voice_call_id;
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '70 seconds' where id = $1`, [id]);
    const stop = await post("/voice/renew", { voice_call_id: id, call_id: null });
    expect(stop.body).toMatchObject({ stop: true, reason: "session_limit", grace_seconds: 20, message: "Esta conversa por voz chegou ao tempo máximo. Você pode abrir outra." });
    // sem o aplicativo encerrar: a folga vence e a varredura derruba (pelo canal lateral do GPT-Live) com o motivo certo
    await sql(`update public.tutor_voice_calls set lease_until = now() - interval '30 seconds' where id = $1`, [id]);
    sideband.length = 0;
    const sw = await fetch(`${base}/voice/sweep`, { headers: { Authorization: "Bearer cron-teste" } });
    expect(sw.status).toBe(401); // sem o segredo da tarefa agendada
    process.env.CRON_SECRET = "cron-teste";
    const ok = await fetch(`${base}/voice/sweep`, { headers: { Authorization: "Bearer cron-teste" } }).then((x) => x.json());
    delete process.env.CRON_SECRET;
    expect(ok.expired).toBeGreaterThanOrEqual(1);
    await new Promise((x) => setTimeout(x, 30));
    expect(sideband.some((x) => x.url.includes(r.body.live_session_id))).toBe(true);
    expect((await sql(`select status, termination_reason from public.tutor_voice_calls where id = $1`, [id]))[0]).toEqual({ status: "expired", termination_reason: "session_limit" });
    await config({ voice_session_max_seconds: 1800 });
  });
});

describe("Memória entre conversas, ferramentas novas e painel", () => {
  it("lembrança guardada pela voz fortalece, volta na próxima conversa e nas ferramentas; piadas internas desligadas no painel saem", async () => {
    await config({ voice_provider: "realtime" });
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    const r = await post("/voice/start", { session_id: s.id, force: true });
    const id = r.body.voice_call_id;
    const tool = (name: string, args: unknown = {}) => post("/voice/tool", { voice_call_id: id, name, arguments: JSON.stringify(args) });
    expect((await tool("save_tutor_memory", { kind: "inside_joke", concept: "sulfato de magnésio", note: "errou três vezes a dose de ataque" })).body.output).toMatchObject({ ok: true, strength: 1 });
    expect((await tool("save_tutor_memory", { kind: "inside_joke", concept: "Sulfato de  Magnésio" })).body.output).toMatchObject({ ok: true, strength: 2 }); // mesmo assunto
    expect((await tool("save_tutor_memory", { kind: "goal", concept: "passar no Revalida 2027/1" })).body.output.ok).toBe(true);
    expect((await tool("wait_for_user", { reason: "background" })).body.output).toEqual({ ok: true, action: "stay_silent" });
    expect((await tool("schedule_review", { days: 3 })).body.output).toMatchObject({ scheduled: false }); // conversa livre, sem questão
    const mem = (await tool("get_student_learning_memory")).body.output.memory;
    expect(mem.saved_memories.map((m: any) => m.concept)).toEqual(expect.arrayContaining(["sulfato de magnésio", "passar no Revalida 2027/1"]));
    await post("/voice/end", { voice_call_id: id });
    // próxima conversa: as lembranças entram no contexto da voz (e a continuidade, no modo determinístico)
    process.env.DETERMINISTIC_TUTOR = "true";
    const s2 = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    openai.length = 0;
    const r2 = await post("/voice/start", { session_id: s2.id, force: true });
    const ins: string = openai.find((x) => x.url.endsWith("/realtime/client_secrets"))!.body.session.instructions;
    expect(ins).toContain("piada interna: sulfato de magnésio");
    expect(ins).toContain("meta: passar no Revalida 2027/1");
    expect(ins).toMatch(/Continuidade \(use nesta abertura só se encaixar\): a última conversa foi mais cedo hoje/);
    delete process.env.DETERMINISTIC_TUTOR;
    // piadas internas desligadas: não entram nem se guardam
    await config({ inside_jokes: false });
    const t2 = (name: string, args: unknown = {}) => post("/voice/tool", { voice_call_id: r2.body.voice_call_id, name, arguments: JSON.stringify(args) });
    expect((await t2("save_tutor_memory", { kind: "inside_joke", concept: "bronquiolite" })).body.output).toMatchObject({ ok: false });
    expect((await t2("get_student_learning_memory")).body.output.memory.saved_memories.map((m: any) => m.kind)).not.toContain("inside_joke");
    await post("/voice/end", { voice_call_id: r2.body.voice_call_id });
    await config({ inside_jokes: true, voice_provider: "auto" });
    // o aluno lê as próprias lembranças; ninguém escreve direto
    expect((await as(ALUNA, (q) => q(`select count(*)::int n from public.tutor_memories`)))[0].n).toBeGreaterThanOrEqual(2);
    expect((await as(OUTRO, (q) => q(`select count(*)::int n from public.tutor_memories`)))[0].n).toBe(0);
    await expect(as(ALUNA, (q) => q(`insert into public.tutor_memories (user_id, kind, concept) values ($1, 'fact', 'x y')`, [ALUNA]))).rejects.toThrow();
  });

  it("revisão pedida pelo professor entra na revisão espaçada do aluno", async () => {
    await config({ voice_provider: "realtime" });
    await sql(`delete from public.tutor_reviews where user_id = $1`, [ALUNA]); // começa sem revisões (as dos testes anteriores mudariam a data)
    const s = await rpc(ALUNA, "app_tutor_start", "questao", null, null);
    const r = await post("/voice/start", { session_id: s.id, force: true });
    const out = (await post("/voice/tool", { voice_call_id: r.body.voice_call_id, name: "schedule_review", arguments: JSON.stringify({ days: 3 }) })).body.output;
    expect(out).toMatchObject({ scheduled: true, days: 3 });
    const qid = (await rpc(ALUNA, "app_tutor_session", s.id)).question.id;
    const rev = (await sql(`select reason, due_at > now() + interval '2 days' ok from public.tutor_reviews where user_id = $1 and question_id = $2`, [ALUNA, qid]))[0];
    expect(rev).toEqual({ reason: "tutor_request", ok: true });
    await post("/voice/end", { voice_call_id: r.body.voice_call_id });
    await config({ voice_provider: "auto" });
  });

  it("transcrição desligada no painel: a voz não grava falas; retenção apaga só as falas da voz mais velhas que o prazo", async () => {
    await config({ save_transcripts: false });
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    const r = await post("/voice/start", { session_id: s.id, sdp: SDP, force: true });
    const count = async () => (await sql(`select count(*)::int n from public.tutor_messages where session_id = $1`, [s.id]))[0].n;
    const before = await count(); // a abertura do professor (texto) já está lá
    await post("/voice/transcript", { voice_call_id: r.body.voice_call_id, role: "student", text: "isso não deve ficar guardado" });
    expect(await count()).toBe(before);
    await post("/voice/end", { voice_call_id: r.body.voice_call_id });
    await config({ save_transcripts: true, transcript_retention_days: 30 });
    await sql(`insert into public.tutor_messages (session_id, user_id, role, content, meta, created_at) values ($1, $2, 'student', 'fala antiga', '{"realtime": true}', now() - interval '40 days'), ($1, $2, 'student', 'texto antigo', '{}', now() - interval '40 days'), ($1, $2, 'student', 'fala nova', '{"realtime": true}', now())`, [s.id, ALUNA]);
    process.env.CRON_SECRET = "cron-teste";
    const sweep = await fetch(`${base}/voice/sweep`, { headers: { Authorization: "Bearer cron-teste" } }).then((x) => x.json());
    delete process.env.CRON_SECRET;
    expect(sweep.purged_transcripts).toBe(1);
    const left = (await sql(`select content from public.tutor_messages where session_id = $1 order by content`, [s.id])).map((m: any) => m.content);
    expect(left).toEqual(expect.arrayContaining(["fala nova", "texto antigo"]));
    expect(left).not.toContain("fala antiga");
    await config({ transcript_retention_days: 180 });
  });

  it("painel: valida provedor, voz, nível e pronúncias (que chegam às instruções); Tranquilo não sai; aluno não mexe", async () => {
    await config({ voice_provider: "auto" });
    resetLiveAvailability();
    await expect(config({ voice_provider: "outro" })).rejects.toThrow(/Provedor de voz inválido/);
    await expect(config({ voice_name: "Voz Bonita!" })).rejects.toThrow(/Nome de voz inválido/);
    await expect(config({ durona_level: "infernal" })).rejects.toThrow(/Nível da Durona inválido/);
    await expect(config({ voice_provider: "live" }, "curto")).rejects.toThrow(/motivo/);
    const saved = await config({ pronunciations: [{ term: "INEP", say: "inépi" }, { term: "", say: "x" }, "lixo"], durona_level: "moderada", emotion_engine: true });
    expect(saved).toMatchObject({ pronunciations: [{ term: "INEP", say: "inépi" }], durona_level: "moderada", voice_30d: { calls: expect.any(Number) } });
    expect(composeLiveInstructions({ mode: "livre", persona: "P", context: "C", pronunciations: saved.pronunciations })).toContain('- INEP: "inépi"');
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    openai.length = 0;
    const r = await post("/voice/start", { session_id: s.id, sdp: SDP, force: true });
    expect(openai.find((x) => x.url.endsWith("/live/sessions"))!.body.session.instructions).toContain('- INEP: "inépi"');
    await post("/voice/end", { voice_call_id: r.body.voice_call_id });
    await config({ durona_level: "forte", pronunciations: [] });
    // professores
    const list = await rpc(ADMIN, "app_admin_tutor_personalities");
    expect(list.map((p: any) => [p.id, p.name, p.character])).toEqual([["durao", "Durão", "stazi"], ["acolhedor", "Tranquilo", "stazi"], ["durona", "Durona", "stazia"], ["tranquila", "Tranquila", "stazia"]]);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", "acolhedor", false, "Tirando o padrão para testar.")).rejects.toThrow(/Tranquilo é o professor padrão/);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", "questionador", false, "Removendo perfil antigo.")).rejects.toThrow(/Professor não encontrado/);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", "direto", true, "Direto saiu e não volta pelo painel.")).rejects.toThrow(/Professor não encontrado/);
    const after = await rpc(ADMIN, "app_admin_tutor_set_personality", "durao", false, "Durão fora por um tempo para testar.");
    expect(after.find((p: any) => p.id === "durao").active).toBe(false);
    expect((await rpc(ALUNA, "app_tutor_status")).personalities.map((p: any) => p.id)).not.toContain("durao");
    await rpc(ADMIN, "app_admin_tutor_set_personality", "durao", true, "Durão de volta depois do teste.");
    await expect(rpc(ALUNA, "app_admin_tutor_personalities")).rejects.toThrow();
    await expect(rpc(ALUNA, "app_admin_tutor_save_config", { voice_provider: "live" }, "Aluno tentando mudar o painel.")).rejects.toThrow();
    // funções do servidor não abrem para o aluno
    await expect(as(ALUNA, (q) => q(`select public.ch_worker_tutor_save_memory($1, $2, '{"kind":"fact","concept":"xx"}'::jsonb)`, [ALUNA, s.id]))).rejects.toThrow(/permission|permissão/i);
    await expect(as(ALUNA, (q) => q(`select public.ch_worker_tutor_settings()`))).rejects.toThrow(/permission|permissão/i);
  });
});

describe("Motor emocional: nível da Durona, painel e modo determinístico", () => {
  it("o nível da Durona muda o teto (não os limites de respeito); determinístico não varia; acerto logo depois de errar vira alívio", () => {
    expect(engineFor("durona", {}, "moderada")).toMatchObject({ frustration_multiplier: 1.0, language_max: 3, sarcasm_max: 60 });
    expect(engineFor("durona", { frustration_multiplier: 1.25 }, "sem_filtro")).toMatchObject({ frustration_multiplier: 1.4, language_max: 5, sarcasm_max: 100 });
    expect(engineFor("acolhedor", {}, "sem_filtro").frustration_multiplier).toBe(0.45); // Tranquilo (jeito do Preguiçoso); só a Durona muda com o nível
    expect(DURONA_LEVELS.forte).toEqual({});
    process.env.DETERMINISTIC_TUTOR = "true";
    const e = engineFor("durona", {}, "forte");
    const s0 = normalize({ session_mood: "impatient" }, e);
    expect(s0.sessionMood).toBe("neutral"); // sem sorteio do humor do dia
    const a = step(s0, e, { kind: "answer", correct: false, severity: 3 });
    const b = step(s0, e, { kind: "answer", correct: false, severity: 3 });
    expect(a.frustrationDelta).toBe(b.frustrationDelta);
    expect(a.frustrationDelta).toBe(Math.round(3 * 3 * 1.25)); // sem os ±8 de variação
    let st = s0;
    for (let i = 0; i < 4; i++) st = step(st, e, { kind: "answer", correct: false, severity: 4, repeated: i > 0 }).state;
    expect(["irritated", "angry"]).toContain(st.mood);
    const rec = step(st, e, { kind: "answer", correct: true });
    // Nexus: a Durona mostra alívio no acerto logo depois de errar (a irritação cai para até 40)
    expect(rec.events).toContain("relieved");
    expect(rec.state.mood).toBe("relieved");
    expect(rec.state.frustration).toBeLessThanOrEqual(40);
    delete process.env.DETERMINISTIC_TUTOR;
  });

  it("motor emocional desligado no painel: o turno responde e o humor fica no tom de base", async () => {
    await config({ emotion_engine: false });
    const s = await rpc(ALUNA, "app_tutor_start", "livre", null, null);
    const before = (await sql(`select emotion from public.tutor_sessions where id = $1`, [s.id]))[0].emotion;
    lastReply = "Tá, me explica de novo.";
    await tutorTurn({ ...deps, mockRespond: respond }, ALUNA, s.id, { type: "message", text: "chutei a resposta e errei feio" });
    const after = (await sql(`select emotion from public.tutor_sessions where id = $1`, [s.id]))[0].emotion;
    expect(normalize(after, engineFor("durona")).frustration).toBe(normalize(before, engineFor("durona")).frustration);
    await config({ emotion_engine: true });
  });
});
