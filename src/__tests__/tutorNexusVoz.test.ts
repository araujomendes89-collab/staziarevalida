// @vitest-environment node
/**
 * Conversa da Nexus pela voz (spec §5, §8 e §16): os três jeitos (voz ao vivo primeiro desde 18/10; reserva: voz do professor em
 * cascata; por escrito), a
 * abertura (/voice/open), o estado por professor (/nexus) e o turno (/voice/say): a letra só marca, "confirmo" (ou o toque
 * em Responder) responde, o banco corrige, cada resposta do motor gasta 1 interação, a trava de turno e o client_turn_id
 * impedem resposta dobrada. Sem rede: IA simulada, voz ao vivo só configurada.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { createTutorRouter } from "../../server/tutor/router";
import { voiceFingerprint } from "../../server/tutor/officialVoices";
import { ttsIntent } from "../../server/tutor/delegate";
import { PROFESSOR_CHANGED } from "../../server/tutor/engine";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { aceitarTermos } from "./helpers/aceites";
import { GEMINI_VOZ_ENV } from "./helpers/vozGemini";

// a voz do professor é a do personagem no Gemini (padrão)
const ENV = GEMINI_VOZ_ENV;
const KEY = "sk-teste-" + "k".repeat(40);
const STT = { ready: true, model: "gpt-4o-mini-transcribe", key: KEY, pending: null };
const RT = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };
const RT_OFF = { ready: false, model: "gpt-realtime-2.1", pending: "desligada no teste", key: null, transcribeModel: null };
const LIVE_OFF = { ready: false, model: "gpt-live-1", key: null, pending: "desligada no teste" };
const GEMINI_OFF = { ready: false, model: "gemini-teste", key: null, pending: "desligada no teste" };
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const PAGO = "00000000-0000-4000-8000-0000000000e1";
const SEM_ACEITE = "00000000-0000-4000-8000-0000000000e2";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-voz-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const tokens: Record<string, string> = {};
const reply = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });
let respond: (req: StructuredRequest) => unknown = () => reply("Bora. Me diz o que pesa mais no caso.");
const deps: any = { mockRespond: (req: StructuredRequest) => respond(req), elevenEnv: ENV, stt: STT, realtime: RT, live: LIVE_OFF, gemini: GEMINI_OFF };

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const config = (c: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", c, "Ajuste para os testes da conversa por voz do Nexus.");
const api = async (uid: string, method: "GET" | "POST", url: string, body?: unknown) => {
  const r = await fetch(`${base}${url}`, { method, headers: { Authorization: `Bearer ${tokens[uid]}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, json: await r.json() };
};
const open = (uid: string, sid: string, force = false) => api(uid, "POST", "/voice/open", { session_id: sid, ...(force ? { force: true } : {}) });
let turnN = 0;
const say = (uid: string, call: string, body: Record<string, unknown>, turn = `turno-${String(++turnN).padStart(6, "0")}`) =>
  api(uid, "POST", "/voice/say", { voice_call_id: call, client_turn_id: turn, ...body });
const start = async (uid: string, mode: "livre" | "questao", personality = "durona") => (await rpc(uid, "app_tutor_start", mode, null, null, null, personality)).id as string;
const requests = async (uid: string) => (await sql(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [uid]))[0].n as number;
const approveAll = async () => {
  for (const v of ["stazi", "stazia"] as const) {
    await sql(`insert into public.tutor_voice_approvals (voice, fingerprint) values ($1, $2) on conflict (voice) do update set fingerprint = excluded.fingerprint, revoked_at = null, sample_path = null`, [v, voiceFingerprint(v, ENV)]);
  }
};
const correctOf = async (sid: string) => (await sql(`select q.correct_option o from public.tutor_sessions s join public.questions q on q.id = s.question_id where s.id = $1`, [sid]))[0].o as string;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'pago@t.dev'), ($3, 'sem@t.dev')`, [ADMIN, PAGO, SEM_ACEITE]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [PAGO, SEM_ACEITE]);
  for (const uid of [ADMIN, PAGO]) await aceitarTermos(dev.db, uid);
  for (const uid of [ADMIN, PAGO, SEM_ACEITE]) tokens[uid] = await dev.createSession(uid);
  // CF02/VZ03: o microfone dos alunos e a voz do professor só abrem com os tetos e os preços preenchidos; aqui o dono "já preencheu" (direto no banco)
  await dev.db.query(`update public.tutor_config set stt_team_only = false, stt_trial_daily_seconds = 300, stt_paid_daily_seconds = 1800, stt_account_daily_seconds = 36000,
                      stt_price_per_min_usd = 0.003, tts_price_per_1k_chars_usd = 0.3`);
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
  respond = () => reply("Bora. Me diz o que pesa mais no caso.");
  // a voz ao vivo começa desligada (os testes do turno são da cascata); os testes dos jeitos ligam quando precisam
  Object.assign(deps, { stt: STT, realtime: RT_OFF, live: LIVE_OFF, gemini: GEMINI_OFF, elevenEnv: ENV });
  await sql(`update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'student' where status = 'active'`);
  await sql(`delete from public.tutor_tts_usage`);
  await approveAll();
  await config({ enabled: true, requires_pro: true, voice_enabled: true, tts_team_only: false, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500,
                 tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000, daily_message_limit: 40 });
});

describe("Nexus: os jeitos e a abertura", () => {
  it("voz ao vivo primeiro (aluno e equipe), sem chamada tts; sem a voz ao vivo, a voz do professor; aluno sem aprovação: por escrito", async () => {
    deps.realtime = RT;
    const antes = await requests(PAGO);
    const vivo = await open(PAGO, await start(PAGO, "livre"));
    expect(vivo).toMatchObject({ status: 200, json: { jeito: "aovivo", voice_call_id: null, mic: true } });
    // na voz ao vivo o professor abre falando: a abertura escrita pela IA nem é pedida (sem espera e sem gasto)
    expect(vivo.json.opening).toBeUndefined();
    expect(await requests(PAGO)).toBe(antes);
    expect(vivo.json.live_minutes).toBeGreaterThan(0);
    expect(vivo.json.reserve_minutes).toBe(vivo.json.live_minutes);
    // equipe também cai na voz ao vivo (antes caía na cascata porque a voz do professor sempre "valia" para a equipe)
    expect((await open(ADMIN, await start(ADMIN, "livre"))).json).toMatchObject({ jeito: "aovivo", voice_call_id: null });
    expect((await sql(`select count(*)::int n from public.tutor_voice_calls where status = 'active' and provider = 'tts'`))[0].n).toBe(0);
    // sem a voz ao vivo (trava do servidor): a cascata
    deps.realtime = RT_OFF;
    const r = await open(PAGO, await start(PAGO, "livre"));
    expect(r).toMatchObject({ status: 200, json: { jeito: "eleven", mic: true, reason: null, minutes_today: 5, live_minutes: expect.any(Number) } });
    expect((await sql(`select provider, status from public.tutor_voice_calls where id = $1`, [r.json.voice_call_id]))[0]).toEqual({ provider: "tts", status: "active" });
    await sql(`delete from public.tutor_voice_approvals where voice = 'stazia'`);
    expect((await open(ADMIN, await start(ADMIN, "livre"))).json).toMatchObject({ jeito: "eleven", reason: null });
    const aluno = await open(PAGO, await start(PAGO, "livre"), true);
    expect(aluno.json).toMatchObject({ jeito: "escrito", mic: true, reason: "not_approved" });
  });

  it("sem minutos ao vivo: a voz do professor (se valer); 'só equipe', limite do aluno ou teto da conta: por escrito", async () => {
    deps.realtime = RT;
    const s = await start(PAGO, "livre");
    // minutos ao vivo gastos (a carteira de voz do plano): a voz ao vivo não é oferecida
    await sql(`insert into public.tutor_voice_calls (user_id, session_id, status, lease_until, consumed_seconds, ended_at, provider) values ($1, $2, 'ended', now(), 100000, now(), 'realtime')`, [PAGO, s]);
    expect((await open(PAGO, s)).json).toMatchObject({ jeito: "eleven", live_minutes: 0, reserve_minutes: 0 });
    await sql(`update public.tutor_voice_calls set status = 'ended', ended_at = now() where status = 'active' and provider = 'tts'`);
    await config({ tts_team_only: true });
    expect((await open(PAGO, s)).json).toMatchObject({ jeito: "escrito", reason: "team_only" });
    await config({ tts_team_only: false, tts_paid_daily_chars: 0 });
    expect((await open(PAGO, s, true)).json).toMatchObject({ jeito: "escrito", reason: "student_limit", minutes_today: 0 });
    await config({ tts_paid_daily_chars: 4500, tts_account_daily_chars: 0 });
    const escrito = await open(PAGO, s, true);
    expect(escrito.json).toMatchObject({ jeito: "escrito", mic: true, reason: "account_day" });
    expect((await sql(`select provider from public.tutor_voice_calls where id = $1`, [escrito.json.voice_call_id]))[0].provider).toBe("tts");
    await sql(`delete from public.tutor_voice_calls where user_id = $1 and provider = 'realtime'`, [PAGO]);
  });

  it("'Conversa por voz' desligada: 'escrito' sem chamada e sem microfone; trava da transcrição desligada: microfone só na voz ao vivo", async () => {
    const s = await start(PAGO, "livre");
    await config({ voice_enabled: false });
    expect((await open(PAGO, s)).json).toMatchObject({ jeito: "escrito", voice_call_id: null, mic: false });
    await config({ voice_enabled: true });
    deps.stt = { ...STT, ready: false, key: null };
    expect((await open(PAGO, s)).json).toMatchObject({ jeito: "eleven", mic: false });
    deps.realtime = RT;
    expect((await open(PAGO, s, true)).json).toMatchObject({ jeito: "aovivo", mic: true });
  });

  it("/nexus: por professor, se a voz do professor vale e se há amostra; minutos = caracteres restantes ÷ 900", async () => {
    await sql(`update public.tutor_voice_approvals set sample_path = 'stazia/' || fingerprint || '.mp3' where voice = 'stazia'`);
    await sql(`delete from public.tutor_voice_approvals where voice = 'stazi'`);
    await sql(`insert into public.tutor_tts_usage (user_id, chars, status) values ($1, 1000, 'spent')`, [PAGO]);
    const r = await api(PAGO, "GET", "/nexus");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ voice_enabled: true, stt: true, live: false, reserve: false, minutes_today: 3 });
    deps.realtime = RT;
    const vivo = await api(PAGO, "GET", "/nexus");
    expect(vivo.json).toMatchObject({ live: true, reserve: true });
    expect(vivo.json.live_minutes).toBeGreaterThan(0);
    expect(r.json.professors).toEqual([
      { id: "durao", eleven: false, sample: false, reason: "not_approved" },
      { id: "acolhedor", eleven: false, sample: false, reason: "not_approved" },
      { id: "durona", eleven: true, sample: true, reason: null },
      { id: "tranquila", eleven: true, sample: true, reason: null },
    ]);
  });

  it("no meio da conversa: 'aovivo' pula a voz ao vivo (vai à cascata), 'eleven' pula a voz do professor, 'voice' pula as duas", async () => {
    deps.realtime = RT;
    const s = await start(PAGO, "livre");
    expect((await open(PAGO, s)).json.jeito).toBe("aovivo");
    const skip = (what: unknown) => api(PAGO, "POST", "/voice/open", { session_id: s, force: true, skip: what });
    const cascata = await skip("aovivo");
    expect(cascata.json).toMatchObject({ jeito: "eleven" });
    expect(cascata.json.voice_call_id).toBeTruthy();
    expect((await skip("eleven")).json).toMatchObject({ jeito: "aovivo", voice_call_id: null });
    deps.realtime = RT_OFF;
    const escrito = await skip("eleven");
    expect(escrito.json).toMatchObject({ jeito: "escrito", mic: true });
    expect(escrito.json.voice_call_id).toBeTruthy();
    deps.realtime = RT;
    const semVoz = await skip("voice");
    expect(semVoz.json).toMatchObject({ jeito: "escrito", mic: true });
    expect((await sql(`select provider, status from public.tutor_voice_calls where id = $1`, [semVoz.json.voice_call_id]))[0]).toEqual({ provider: "tts", status: "active" });
    expect((await skip("tudo")).status).toBe(400);
    expect((await skip("reserva")).status).toBe(400);
  });

  it("segunda aba: abrir de novo responde 409 busy; com force assume", async () => {
    const s = await start(PAGO, "livre");
    const first = await open(PAGO, s);
    expect(first.json.jeito).toBe("eleven");
    expect(await open(PAGO, s)).toMatchObject({ status: 409, json: { code: "busy" } });
    const second = await open(PAGO, s, true);
    expect(second.json.jeito).toBe("eleven");
    expect((await sql(`select status, termination_reason from public.tutor_voice_calls where id = $1`, [first.json.voice_call_id]))[0]).toEqual({ status: "ended", termination_reason: "replaced" });
  });
});

describe("Nexus: o turno", () => {
  it("letra falada ou tocada só marca ('Marquei a B…') sem gravar resposta; 'cancela' desmarca", async () => {
    expect(ttsIntent("letra B", "open", null)).toEqual({ kind: "mark", option: "B" });
    expect(ttsIntent("confirmo", "open", "B")).toEqual({ kind: "answer", option: "B" });
    expect(ttsIntent("pode confirmar", "open", null)).toEqual({ kind: "message" });
    expect(ttsIntent("cancela", "open", "B")).toEqual({ kind: "unmark" });
    expect(ttsIntent("me dá uma dica", "open", null)).toEqual({ kind: "hint" });
    expect(ttsIntent("próxima questão", "answered", null)).toEqual({ kind: "next" });
    expect(ttsIntent("confirmo a C", "open", "B")).toEqual({ kind: "mark", option: "C" }); // falou outra letra: só marca a nova
    const s = await start(PAGO, "questao");
    const call = (await open(PAGO, s)).json.voice_call_id;
    const n = await requests(PAGO);
    const m = await say(PAGO, call, { text: "acho que é a letra B" });
    expect(m).toMatchObject({ status: 200, json: { intent: "mark", message: null, marked: "B", phrase: { phrase: "marked", letter: "B", text: "Marquei a B. Diga confirmo para responder, ou fale outra alternativa." } } });
    const u = await say(PAGO, call, { text: "cancela", marked: "B" });
    expect(u.json).toMatchObject({ intent: "unmark", marked: null, phrase: { phrase: "unmarked", letter: null, text: "Desmarquei. Qual você escolhe?" } });
    expect((await sql(`select count(*)::int n from public.tutor_answers where session_id = $1`, [s]))[0].n).toBe(0);
    expect(await requests(PAGO)).toBe(n);
  });

  it("'confirmo' com a B marcada responde antes do texto: o banco corrige e a Durona já sai firme no erro", async () => {
    const s = await start(PAGO, "questao", "durona");
    const call = (await open(PAGO, s)).json.voice_call_id;
    const wrong = (await correctOf(s)) === "B" ? "C" : "B";
    respond = () => reply("Sério isso? O enunciado te deu a pista.", { evaluation: { ...NO_EVALUATION, error_type: "distractor_trap", severity: 3, knowledge_gap: "pista do enunciado" } });
    const r = await say(PAGO, call, { text: "confirmo", marked: wrong });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ intent: "answer", question_state: "answered", message: { content: "Sério isso? O enunciado te deu a pista." } });
    expect(r.json.message.voice_avatar.emotion).toBe("firm");
    expect((await sql(`select selected_option, is_correct from public.tutor_answers where session_id = $1`, [s]))).toEqual([{ selected_option: wrong, is_correct: false }]);
  });

  it("Responder pelo toque faz o mesmo que 'confirmo'", async () => {
    const s = await start(PAGO, "questao");
    const call = (await open(PAGO, s)).json.voice_call_id;
    const right = await correctOf(s);
    respond = () => reply("Tá. Essa foi bonita, vai.");
    const r = await say(PAGO, call, { command: "answer", option: right });
    expect(r.json).toMatchObject({ intent: "answer", question_state: "answered" });
    expect((await sql(`select selected_option, is_correct from public.tutor_answers where session_id = $1`, [s]))).toEqual([{ selected_option: right, is_correct: true }]);
    expect((await say(PAGO, call, { command: "answer" })).status).toBe(400); // tocar Responder sem letra
  });

  it("cada resposta do motor gasta 1 interação (falada ou digitada); sem interações, o aviso do chat (429)", async () => {
    const s = await start(PAGO, "livre");
    const call = (await open(PAGO, s)).json.voice_call_id;
    const n = await requests(PAGO);
    const r = await say(PAGO, call, { text: "o que pesa mais num caso de DPOC?" });
    expect(r.json).toMatchObject({ intent: "message", message: { content: "Bora. Me diz o que pesa mais no caso." } });
    expect(r.json.used_today).toBe(n + 1);
    expect(await requests(PAGO)).toBe(n + 1);
    await config({ daily_message_limit: n + 1 });
    const chat = await api(PAGO, "POST", "/turn", { session_id: s, action: "message", text: "mais uma" });
    expect(chat.status).toBe(429);
    expect(await say(PAGO, call, { text: "mais uma pela voz" })).toEqual({ status: 429, json: chat.json });
  });

  it("motor falhou: 'O professor não conseguiu responder, tente de novo', sem gastar interação", async () => {
    const s = await start(PAGO, "livre");
    const call = (await open(PAGO, s)).json.voice_call_id;
    const n = await requests(PAGO);
    respond = () => {
      throw new Error("serviço fora do ar");
    };
    const turn = "turno-falhou-0001";
    expect(await say(PAGO, call, { text: "oi" }, turn)).toEqual({ status: 502, json: { error: "O professor não conseguiu responder, tente de novo" } });
    expect(await requests(PAGO)).toBe(n);
    // o mesmo turno pode tentar de novo (a falha não fica guardada)
    respond = () => reply("Voltei. Onde a gente estava?");
    expect((await say(PAGO, call, { text: "oi" }, turn)).json).toMatchObject({ intent: "message", message: { content: "Voltei. Onde a gente estava?" } });
  });

  it("um turno por vez: o segundo recebe 429 turn_busy; o mesmo client_turn_id repetido não responde nem cobra duas vezes", async () => {
    const s = await start(PAGO, "livre");
    const call = (await open(PAGO, s)).json.voice_call_id;
    // um turno em andamento (outra aba, ou a resposta anterior ainda saindo)
    await sql(`select public.ch_worker_tutor_tts_turn_begin($1, $2, 'turno-andando-01')`, [PAGO, call]);
    expect(await say(PAGO, call, { text: "oi" })).toEqual({ status: 429, json: { error: "Espere a resposta anterior antes de mandar outra.", code: "turn_busy" } });
    await sql(`select public.ch_worker_tutor_tts_turn_end($1, $2, 'turno-andando-01', null)`, [PAGO, call]);
    const turn = "turno-repetido-01";
    const first = await say(PAGO, call, { text: "o que é choque?" }, turn);
    expect(first.status).toBe(200);
    const n = await requests(PAGO);
    const msgs = (await sql(`select count(*)::int n from public.tutor_messages where session_id = $1`, [s]))[0].n;
    const again = await say(PAGO, call, { text: "o que é choque?" }, turn);
    expect(again.json).toEqual({ ...first.json, repeated: true });
    expect(await requests(PAGO)).toBe(n);
    expect((await sql(`select count(*)::int n from public.tutor_messages where session_id = $1`, [s]))[0].n).toBe(msgs);
    expect((await say(PAGO, call, { text: "oi" }, "curto")).status).toBe(400);
  });

  it("dica, resolução e próxima pelo comando; a próxima não lê o enunciado", async () => {
    const s = await start(PAGO, "questao");
    const call = (await open(PAGO, s)).json.voice_call_id;
    respond = () => reply("Olha a idade da paciente e o tempo de evolução.");
    expect((await say(PAGO, call, { command: "hint" })).json).toMatchObject({ intent: "hint", message: { content: "Olha a idade da paciente e o tempo de evolução." } });
    respond = () => reply("A resposta é a conduta que estabiliza primeiro.", { reveals_answer: true });
    // revisão do Pacote 1 (M4): a resolução só sai depois da resposta; pedir pela voz com a questão aberta é recusado
    const rev = await say(PAGO, call, { command: "reveal" });
    expect(rev.status).toBe(409);
    expect(JSON.stringify(rev.json)).not.toContain("A resposta é a conduta");
    // responde (qualquer letra) e aí segue para a próxima
    respond = () => reply("Vamos ver o que pesou na sua escolha.");
    expect((await say(PAGO, call, { command: "answer", option: "A" })).status).toBe(200);
    const n = await requests(PAGO);
    const next = await say(PAGO, call, { command: "next" });
    expect(next.json).toMatchObject({ intent: "next", message: null, phrase: null, question_state: "open" });
    const statement = (await sql(`select q.statement from public.tutor_sessions s join public.questions q on q.id = s.question_id where s.id = $1`, [s]))[0].statement as string;
    expect(JSON.stringify(next.json)).not.toContain(statement.slice(0, 40));
    expect(await requests(PAGO)).toBe(n); // a próxima não passa pelo motor
  });

  it("as três rotas recusam sem o aceite (403 tutor_consent) e conversa só leitura (409); nenhuma chave nas respostas", async () => {
    const s = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'x', 'durona', 3) returning id`, [SEM_ACEITE]))[0].id;
    const call = (await sql(`select public.ch_worker_tutor_tts_open($1, $2, true, false) r`, [SEM_ACEITE, s]))[0].r.voice_call_id;
    expect((await api(SEM_ACEITE, "GET", "/nexus")).json).toMatchObject({ code: "tutor_consent" });
    expect(await open(SEM_ACEITE, s)).toMatchObject({ status: 403, json: { code: "tutor_consent" } });
    expect(await say(SEM_ACEITE, call, { text: "letra A" })).toMatchObject({ status: 403, json: { code: "tutor_consent" } });
    const old = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, legacy_persona) values ($1, 'livre', 'antiga', 'acolhedor', 3, '{"name":"Acolhedor","emoji":"🤗"}') returning id`, [PAGO]))[0].id;
    expect(await open(PAGO, old)).toEqual({ status: 409, json: { error: PROFESSOR_CHANGED } });
    const raw = JSON.stringify([(await api(PAGO, "GET", "/nexus")).json, (await open(PAGO, await start(PAGO, "livre"))).json]);
    for (const secret of [KEY, ENV.VERTEX_API_KEY, "Kore", "Zubenelgenubi"]) expect(raw).not.toContain(secret);
  });
});
