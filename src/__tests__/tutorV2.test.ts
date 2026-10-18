// @vitest-environment node
/**
 * Stazia Tutor v2: teste grátis, limites, reservas (texto e voz), voz em tempo real com a OpenAI SIMULADA (nenhuma chamada externa),
 * ferramentas da voz, conferência do que foi dito, registro de uso, isolamento entre alunos e o relatório pedagógico.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { tutorTurn } from "../../server/tutor/engine";
import { NO_EVALUATION, composeRealtimeInstructions, type TutorOutput } from "../../server/tutor/prompts";
import { createTutorRouter } from "../../server/tutor/router";
import { realtimeConfig, startVoiceSweeper, type RealtimeConfig } from "../../server/tutor/realtime";
import { estimateCost, priceFor } from "../../server/tutor/costs";
import { REALTIME_TOOLS } from "../../server/tutor/tools";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-v2-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const S1 = "00000000-0000-4000-8000-0000000000b1";
const S2 = "00000000-0000-4000-8000-0000000000b2";
const S3 = "00000000-0000-4000-8000-0000000000b3";
const PAID = "00000000-0000-4000-8000-0000000000b4";
const KEY = "sk-servidor-" + "x".repeat(40);
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
const ent = async (uid: string) => (await rpc(uid, "app_tutor_status")).entitlement;

// OpenAI simulada: segredo temporário e encerramento de chamada
const openai: { url: string; body: any; auth: string | null }[] = [];
let secretFails = false;
const fakeFetch = (async (url: string, init: any) => {
  openai.push({ url, body: init?.body ? JSON.parse(init.body) : null, auth: init?.headers?.Authorization ?? null });
  if (url.endsWith("/realtime/client_secrets")) {
    if (secretFails) return new Response("indisponível", { status: 500 });
    return new Response(JSON.stringify({ value: "ek_temporario_teste", expires_at: 1_900_000_000 }), { status: 200 });
  }
  if (/\/realtime\/calls\/[^/]+\/hangup$/.test(url)) return new Response("", { status: 200 });
  return new Response("?", { status: 404 });
}) as typeof fetch;
const RT: RealtimeConfig = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 'b1@t.dev'), ($3, 'b2@t.dev'), ($4, 'b3@t.dev'), ($5, 'pago@t.dev')`, [ADMIN, S1, S2, S3, PAID]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [PAID]);
  for (const uid of [S1, S2, S3, PAID]) await aceitarTermos(dev.db, uid); // os alunos já aceitaram o §34 (o aceite em si é testado em termoAceiteTutor.test.ts)
  for (const r of await sql(`select id, correct_option from public.questions`)) off[r.id] = r.correct_option;
  process.env.TUTOR_AI_PROVIDER = "mock";
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Tutor ligado com teste grátis para os testes.");
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const turn = (uid: string, sid: string, action: any, respond: () => unknown = () => reply("Por onde você começaria?")) => tutorTurn({ db, mockRespond: respond }, uid, sid, action);

describe("Teste grátis e direito de uso (decididos no banco)", () => {
  it("o teste começa no primeiro uso real (não ao abrir a tela nem ao criar a conta) e dura 7 dias", async () => {
    expect(await ent(S1)).toMatchObject({ mode: "trial", trial: { state: "available", days: 7 }, can_use: true, can_text: true, can_voice: true, text: { limit: 40 }, questions: { limit: 30 } });
    const s = await rpc(S1, "app_tutor_start", "livre", null, null); // abrir sessão não gasta IA nem começa o teste
    expect((await ent(S1)).trial.state).toBe("available");
    await turn(S1, s.id, { type: "message", text: "o que é sepse?" });
    const e = await ent(S1);
    expect(e).toMatchObject({ mode: "trial", trial: { state: "active", day: 1 }, text: { used: 1, remaining: 39 } });
    expect(new Date(e.trial.ends_at).getTime() - new Date(e.trial.started_at).getTime()).toBe(7 * 86400_000);
    // oito dias depois: bloqueado (sessão nova, texto e voz)
    await sql(`update public.subscriptions set tutor_trial_started_at = now() - interval '8 days' where user_id = $1`, [S1]);
    expect(await ent(S1)).toMatchObject({ mode: "blocked", trial: { state: "expired" }, can_use: false, can_text: false, can_voice: false, block_reason: "trial_expired" });
    await expect(rpc(S1, "app_tutor_start", "livre", null, null)).rejects.toThrow(/teste grátis do Tutor terminou/);
    await expect(turn(S1, s.id, { type: "message", text: "oi" })).rejects.toMatchObject({ status: 403 });
    // o teste é uma vez por conta: começar de novo não reabre
    await sql(`select public.tutor_begin_trial($1)`, [S1]);
    expect((await ent(S1)).mode).toBe("blocked");
    // plano pago e administrador não têm teste nem limite de questões
    expect(await ent(PAID)).toMatchObject({ mode: "paid", is_paid: true, trial: { state: "none" }, questions: { limit: null } });
    expect((await ent(ADMIN)).mode).toBe("paid");
    // o aluno não consegue se dar teste nem plano
    await as(S1, (q) => q(`update public.subscriptions set tutor_trial_started_at = now(), plan = 'pro', status = 'active' where user_id = $1`, [S1])); // sem política de escrita: não muda nada
    expect((await ent(S1)).mode).toBe("blocked");
    await expect(as(S1, (q) => q(`select public.tutor_begin_trial($1)`, [S1]))).rejects.toThrow(/permission|permissão/i);
  });

  it("limites do teste: interações de texto e questões por dia; o aviso diz o limite", async () => {
    await rpc(ADMIN, "app_admin_tutor_save_config", { trial_text_daily: 2, trial_questions_daily: 1 }, "Limites baixos para o teste automático.");
    const s = await rpc(S2, "app_tutor_start", "questao", null, null);
    await turn(S2, s.id, { type: "message", text: "começa" });
    await turn(S2, s.id, { type: "hint" });
    await expect(turn(S2, s.id, { type: "hint" })).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/limite de 2 interações de hoje no teste grátis/) });
    await rpc(S2, "app_tutor_answer", s.id, off[s.question.id], 4);
    await expect(rpc(S2, "app_tutor_next_question", s.id)).rejects.toThrow(/limite de 1 questões de hoje no teste grátis/);
    await expect(rpc(S2, "app_tutor_start", "questao", null, null)).rejects.toThrow(/limite de 1 questões/);
    expect(await ent(S2)).toMatchObject({ text: { used: 2, remaining: 0 }, questions: { used: 1, remaining: 0 }, can_text: false });
    await rpc(ADMIN, "app_admin_tutor_save_config", { trial_text_daily: 40, trial_questions_daily: 30 }, "Voltando os limites do teste.");
  });

  it("reserva de texto: dois pedidos ao mesmo tempo não passam do limite; erro da IA devolve a cota", async () => {
    await rpc(ADMIN, "app_admin_tutor_save_config", { trial_text_daily: 1 }, "Uma interação só para testar a reserva.");
    const s = await rpc(S3, "app_tutor_start", "livre", null, null);
    const [a, b] = await Promise.all([
      db.service<any>("ch_worker_tutor_text_reserve", { p_user: S3, p_session_id: s.id }),
      db.service<any>("ch_worker_tutor_text_reserve", { p_user: S3, p_session_id: s.id }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const ok = a.ok ? a : b;
    await db.service("ch_worker_tutor_text_release", { p_user: S3, p_reservation: ok.reservation });
    await db.service("ch_worker_tutor_text_release", { p_user: S3, p_reservation: ok.reservation }); // devolver duas vezes não dá cota extra
    expect((await ent(S3)).text).toMatchObject({ used: 0, remaining: 1 });
    await expect(turn(S3, s.id, { type: "message", text: "oi" }, () => { throw new Error("OpenAI fora do ar"); })).rejects.toMatchObject({ status: 502 });
    expect((await ent(S3)).text.used).toBe(0);
    await rpc(ADMIN, "app_admin_tutor_save_config", { trial_text_daily: 40 }, "Voltando o limite de texto do teste.");
  });
});

describe("Voz em tempo real (OpenAI simulada)", () => {
  let server: import("http").Server;
  let base: string;
  let token: string;
  let session: string;
  const deps: any = { mockRespond: () => ({ ...NO_EVALUATION, error_type: "unknown", knowledge_gap: "ordem de prioridade", reasoning_quality: "low", recommended_action: "socratic_question" }), realtime: RT, fetch: fakeFetch };
  const post = async (p: string, body: unknown, tk = token) => {
    const r = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  beforeAll(async () => {
    deps.db = db;
    const app = express();
    app.use(express.json());
    app.use("/api/tutor", createTutorRouter(deps));
    server = await new Promise((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
    token = await dev.createSession(PAID);
    await rpc(PAID, "app_tutor_save_preferences", { personality_id: "durona" });
    session = (await rpc(PAID, "app_tutor_start", "questao", null, null)).id;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("sem configuração no servidor a voz não abre; a configuração exige modelo, consentimento e chave de verdade", async () => {
    expect(realtimeConfig({}).pending).toMatch(/OPENAI_REALTIME_MODEL/);
    expect(realtimeConfig({ OPENAI_REALTIME_MODEL: "gpt-realtime-2.1", OPENAI_API_KEY: KEY }).pending).toMatch(/TUTOR_VOICE_ALLOW_EXTERNAL=1/);
    // VZ01: a autorização da equipe sozinha não liga a voz ao vivo dos alunos; precisa também da trava própria
    expect(realtimeConfig({ OPENAI_REALTIME_MODEL: "m", TUTOR_VOICE_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: KEY }).pending).toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1/);
    expect(realtimeConfig({ OPENAI_REALTIME_MODEL: "gpt-realtime-2.1", TUTOR_VOICE_ALLOW_EXTERNAL: "1", TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: "MY_KEY" }).pending).toMatch(/texto de exemplo/);
    expect(realtimeConfig({ OPENAI_REALTIME_MODEL: "m", TUTOR_VOICE_ALLOW_EXTERNAL: "1", TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: KEY })).toMatchObject({ ready: true, model: "m" });
    deps.realtime = { ...RT, ready: false, pending: "x", key: null };
    expect((await post("/voice/start", { session_id: session })).status).toBe(503);
    deps.realtime = RT;
  });

  it("abre: a chave principal fica no servidor; o navegador recebe só o segredo temporário; a sessão leva instruções, voz e ferramentas", async () => {
    openai.length = 0;
    const r = await post("/voice/start", { session_id: session });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ client_secret: "ek_temporario_teste", model: "gpt-realtime-2.1", lease_seconds: 120 });
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    const call = openai.find((x) => x.url.endsWith("/realtime/client_secrets"))!;
    expect(call.auth).toBe(`Bearer ${KEY}`);
    expect(call.body.expires_after).toEqual({ anchor: "created_at", seconds: 120 });
    const sess = call.body.session;
    expect(sess).toMatchObject({ type: "realtime", model: "gpt-realtime-2.1", audio: { output: { voice: "marin" }, input: { turn_detection: { type: "semantic_vad", interrupt_response: true } } }, tool_choice: "auto" });
    expect(sess.tools.map((t: any) => t.name)).toEqual(REALTIME_TOOLS.map((t) => t.name));
    expect(sess.instructions).toContain("VOCÊ ESTÁ EM UMA CONVERSA POR VOZ, AO VIVO");
    expect(sess.instructions).toContain("QUEM VOCÊ É NESTA CONVERSA: Durona");
    expect(sess.instructions).toContain("Há uma questão ABERTA");
    expect(sess.instructions).not.toMatch(/Gabarito oficial da prova: [A-D]/); // os fatos vêm das ferramentas
    expect(sess.instructions).not.toContain("<base>");
    const v = (await sql(`select status, model, lease_until > now() + interval '100 seconds' ok from public.tutor_voice_calls where id = $1`, [r.body.voice_call_id]))[0];
    expect(v).toEqual({ status: "active", model: "gpt-realtime-2.1", ok: true });
    // outro aparelho do mesmo aluno: não abre em paralelo; assumindo, a anterior é encerrada (e desligada no servidor)
    await post("/voice/renew", { voice_call_id: r.body.voice_call_id, call_id: "rtc_aparelho_1" });
    const busy = await post("/voice/start", { session_id: session });
    expect(busy).toMatchObject({ status: 409, body: { code: "busy" } });
    openai.length = 0;
    const take = await post("/voice/start", { session_id: session, force: true });
    expect(take.status).toBe(200);
    expect((await sql(`select status, termination_reason from public.tutor_voice_calls where id = $1`, [r.body.voice_call_id]))[0]).toEqual({ status: "ended", termination_reason: "replaced" });
    await new Promise((x) => setTimeout(x, 20));
    expect(openai.some((x) => x.url.endsWith("/realtime/calls/rtc_aparelho_1/hangup"))).toBe(true);
    await post("/voice/end", { voice_call_id: take.body.voice_call_id });
  });

  it("cota de voz pelo tempo do servidor: renovação avisa perto do fim e encerra sem saldo; total do teste também conta", async () => {
    await rpc(ADMIN, "app_admin_tutor_save_config", { paid_voice_daily_seconds: 300 }, "Cinco minutos de voz para o teste.");
    const r = await post("/voice/start", { session_id: session });
    const id = r.body.voice_call_id;
    // quatro minutos depois (relógio do servidor, não do navegador)
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '230 seconds', lease_until = now() + interval '10 seconds' where id = $1`, [id]);
    const near = await post("/voice/renew", { voice_call_id: id, call_id: "rtc_cota" });
    expect(near.body).toMatchObject({ stop: false, warn: expect.stringMatching(/Restam \d+ minuto\(s\) de Tutor por voz hoje/) });
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '400 seconds', lease_until = now() + interval '5 seconds' where id = $1`, [id]);
    openai.length = 0;
    // sem saldo: o servidor manda encerrar com uma folga curta (o professor termina a frase); não derruba no meio da fala
    const stop = await post("/voice/renew", { voice_call_id: id, call_id: "rtc_cota" });
    expect(stop.body).toMatchObject({ stop: true, reason: "quota", grace_seconds: 20, message: "Você atingiu seu limite de voz de hoje. O acesso é renovado amanhã." });
    await new Promise((x) => setTimeout(x, 20));
    expect(openai.some((x) => x.url.endsWith("/realtime/calls/rtc_cota/hangup"))).toBe(false);
    // renovar de novo não estende a folga
    const again = await post("/voice/renew", { voice_call_id: id, call_id: "rtc_cota" });
    expect(again.body).toMatchObject({ stop: true, reason: "quota" });
    expect(again.body.grace_seconds).toBeLessThanOrEqual(20);
    expect((await sql(`select status, closing_reason, lease_until <= now() + interval '20 seconds' ok from public.tutor_voice_calls where id = $1`, [id]))[0]).toEqual({ status: "active", closing_reason: "quota", ok: true });
    // o aplicativo encerra depois da frase: aí o servidor desliga e registra
    await post("/voice/end", { voice_call_id: id, reason: "quota" });
    await new Promise((x) => setTimeout(x, 20));
    expect(openai.some((x) => x.url.endsWith("/realtime/calls/rtc_cota/hangup"))).toBe(true);
    expect((await sql(`select status, termination_reason, consumed_seconds >= 300 ok from public.tutor_voice_calls where id = $1`, [id]))[0]).toEqual({ status: "ended", termination_reason: "quota", ok: true });
    expect((await post("/voice/start", { session_id: session })).body).toMatchObject({ error: expect.stringMatching(/limite de voz de hoje/) });
    // o registro de uso guardou a duração e o resumo do dia somou os segundos
    expect((await sql(`select sum(duration_seconds)::int n from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_voice'`, [PAID]))[0].n).toBeGreaterThan(300);
    await rpc(ADMIN, "app_admin_tutor_save_config", { paid_voice_daily_seconds: 3600 }, "Voltando a voz paga para uma hora.");
    // no teste grátis vale também o total (40 minutos): aqui só 1 minuto restante no total
    await rpc(ADMIN, "app_admin_tutor_save_config", { trial_voice_total_seconds: 60 }, "Total curto de voz no teste para o teste.");
    await sql(`update public.subscriptions set tutor_trial_started_at = now() where user_id = $1`, [S3]);
    expect((await ent(S3)).voice).toMatchObject({ limit_today_s: 600, remaining_total_s: 60, remaining_s: 60 });
    await rpc(ADMIN, "app_admin_tutor_save_config", { trial_voice_total_seconds: 2400 }, "Voltando o total de voz do teste.");
  });

  it("chamada sem renovação expira sozinha (varredura do servidor) e é desligada; falha ao abrir não cobra", async () => {
    const r = await post("/voice/start", { session_id: session });
    await post("/voice/renew", { voice_call_id: r.body.voice_call_id, call_id: "rtc_sumiu" });
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '200 seconds', lease_until = now() - interval '60 seconds' where id = $1`, [r.body.voice_call_id]);
    openai.length = 0;
    const sweeper = startVoiceSweeper(deps, 3_600_000);
    await sweeper.tick();
    sweeper.stop();
    expect(openai.some((x) => x.url.endsWith("/realtime/calls/rtc_sumiu/hangup"))).toBe(true);
    expect((await sql(`select status, consumed_seconds from public.tutor_voice_calls where id = $1`, [r.body.voice_call_id]))[0]).toEqual({ status: "expired", consumed_seconds: 140 });
    secretFails = true;
    const fail = await post("/voice/start", { session_id: session });
    secretFails = false;
    expect(fail.status).toBe(502);
    expect((await sql(`select status, consumed_seconds from public.tutor_voice_calls where user_id = $1 order by started_at desc limit 1`, [PAID]))[0]).toEqual({ status: "ended", consumed_seconds: 0 });
  });

  it("ferramentas: questão aberta sem gabarito; quem corrige é o banco; resolução só depois da resposta; nada de ferramenta fora da lista", async () => {
    const r = await post("/voice/start", { session_id: session });
    const id = r.body.voice_call_id;
    const tool = (name: string, args: unknown = {}) => post("/voice/tool", { voice_call_id: id, name, arguments: JSON.stringify(args) });
    const s = await rpc(PAID, "app_tutor_session", session);
    const qid = s.question.id;
    const open = await tool("get_question_context");
    expect(open.body.output.question).toMatchObject({ id: qid, state: "open", official_answer: null, analysis: null });
    expect(open.body.output.question.options.every((o: any) => o.explanation === null)).toBe(true);
    expect((await tool("evaluate_student_reasoning", { answer: "B", reasoning: "achei" })).body.output.error).toMatch(/aberta/);
    const wrong = ["A", "B", "C", "D"].find((x) => x !== off[qid])!;
    const sub = await tool("submit_answer", { option: wrong, confidence: 4 });
    expect(sub.body.output.result).toMatchObject({ is_correct: false, correct_option: off[qid] });
    expect(sub.body.output.question.official_answer).toBe(off[qid]); // respondida: agora a voz pode explicar
    expect(sub.body.output.tone).toMatch(/ESTADO NESTA SESSÃO/);
    expect((await sql(`select is_correct from public.question_attempts where user_id = $1 and question_id = $2`, [PAID, qid]))[0].is_correct).toBe(false);
    const ev = await tool("evaluate_student_reasoning", { answer: wrong, reasoning: "pedi o exame antes de estabilizar" });
    expect(ev.body.output.evaluation).toMatchObject({ correct: false, error_type: "unknown" });
    expect((await sql(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_eval'`, [PAID]))[0].n).toBe(1);
    const reg = await tool("register_learning_event", { kind: "error", error_type: "priority_of_management", knowledge_gap: "estabilizar antes de investigar" });
    expect(reg.body.output.ok).toBe(true);
    expect((await sql(`select source, error_type from public.student_error_events where user_id = $1 and error_type = 'priority_of_management'`, [PAID]))[0]).toEqual({ source: "tutor_voice", error_type: "priority_of_management" });
    // próxima questão e pedido de resolução
    const next = await tool("next_question");
    expect(next.body.output.question.official_answer).toBeNull();
    // revisão do Pacote 1 (M4): pedir a resolução pela voz com a questão ainda sem resposta não abre o gabarito
    const reveal = await tool("get_question_context", { reveal: true });
    expect(reveal.body.output.question).toMatchObject({ state: "open", official_answer: null });
    // fontes: sem trecho na base, a ferramenta diz para não citar número
    expect((await tool("get_topic_context", { topic: "assunto inexistente xyzwv" })).body.output.note).toMatch(/não cite número/);
    expect((await post("/voice/tool", { voice_call_id: id, name: "run_sql", arguments: "{}" })).status).toBe(400);
    // a chamada de outro aluno não existe para este
    const other = await dev.createSession(S2);
    expect((await post("/voice/tool", { voice_call_id: id, name: "get_question_context", arguments: "{}" }, other)).status).toBe(404);
    await post("/voice/end", { voice_call_id: id });
    expect((await tool("get_question_context")).status).toBe(409);
  });

  it("o que a voz disse passa pela conferência depois: resposta adiantada gera correção imediata; tokens vão para o registro de custo", async () => {
    await rpc(PAID, "app_admin_tutor_save_config", {}, "nada").catch(() => undefined);
    const fresh = (await rpc(PAID, "app_tutor_start", "questao", null, null)).id;
    const r = await post("/voice/start", { session_id: fresh, force: true });
    const id = r.body.voice_call_id;
    const q = (await rpc(PAID, "app_tutor_session", fresh)).question.id;
    const leak = await post("/voice/transcript", { voice_call_id: id, role: "tutor", text: `A resposta é ${off[q]}, marca aí.` });
    expect(leak.body.correction).toMatch(/adiantou a resposta/);
    const saved = (await sql(`select content, meta from public.tutor_messages where session_id = $1 and role = 'tutor' order by id desc limit 1`, [fresh]))[0];
    expect(saved.meta).toMatchObject({ realtime: true, violations: ["answer_leak"] });
    expect((await post("/voice/transcript", { voice_call_id: id, role: "tutor", text: "Que conduta foi essa? Olha o comando." })).body.correction).toBeNull();
    expect((await post("/voice/transcript", { voice_call_id: id, role: "tutor", text: "Use cinquenta miligramas por quilo." })).body.correction).toMatch(/não veio das ferramentas/);
    await post("/voice/transcript", { voice_call_id: id, role: "student", text: "pensei que precisava pedir a tomografia primeiro" });
    expect((await sql(`select role from public.tutor_messages where session_id = $1 order by id desc limit 1`, [fresh]))[0].role).toBe("student");
    const before = (await sql(`select requests from public.ai_usage where user_id = $1`, [PAID]))[0].requests;
    const u = await post("/voice/usage", { voice_call_id: id, usage: { input_token_details: { text_tokens: 1000, audio_tokens: 20000, cached_tokens: 5000 }, output_token_details: { text_tokens: 200, audio_tokens: 10000 } } });
    // 1000×4 + 15000×32 + 5000×0,40 + 200×24 + 10000×64 por milhão
    expect(u.body.estimated_cost_usd).toBeCloseTo((1000 * 4 + 15000 * 32 + 5000 * 0.4 + 200 * 24 + 10000 * 64) / 1e6, 6);
    expect((await sql(`select requests from public.ai_usage where user_id = $1`, [PAID]))[0].requests).toBe(before); // token não é cota
    expect((await sql(`select feature, persona, mode from public.ai_usage_ledger where user_id = $1 order by id desc limit 1`, [PAID]))[0]).toEqual({ feature: "tutor_voice_tokens", persona: "durona", mode: "questao" });
    await post("/voice/end", { voice_call_id: id });
  });
});

describe("Isolamento, relatório e custo", () => {
  it("um aluno não lê nem escreve o uso, as chamadas ou os erros de outro; funções do servidor não abrem para o aluno", async () => {
    for (const table of ["ai_usage_ledger", "tutor_voice_calls", "student_error_events"]) {
      expect(await as(S2, (q) => q(`select * from public.${table} where user_id = $1`, [PAID]))).toEqual([]);
    }
    expect((await as(PAID, (q) => q(`select count(*)::int n from public.ai_usage_ledger`)))[0].n).toBeGreaterThan(0); // o próprio, sim
    await expect(as(PAID, (q) => q(`insert into public.ai_usage_ledger (user_id, feature, interactions) values ($1, 'tutor_text', -1)`, [PAID]))).rejects.toThrow();
    await expect(as(PAID, (q) => q(`insert into public.tutor_voice_calls (user_id, session_id, lease_until) select $1, id, now() from public.tutor_sessions limit 1`, [PAID]))).rejects.toThrow();
    await expect(as(S2, (q) => q(`select public.ch_worker_tutor_voice_start($1, $2, true, 'x')`, [S2, "00000000-0000-4000-8000-000000000000"]))).rejects.toThrow(/permission|permissão/i);
    await expect(as(S2, (q) => q(`select public.tutor_entitlement($1)`, [PAID]))).rejects.toThrow(/permission|permissão/i);
  });

  it("'O Tutor percebeu' só com amostra suficiente, e a frase vem dos dados", async () => {
    const r0 = await rpc(S3, "app_tutor_report");
    expect(r0.insights).toEqual([]);
    const s = await rpc(S3, "app_tutor_start", "livre", null, null);
    const add = (type: string, n: number) => Promise.all(Array.from({ length: n }, () => db.service("ch_worker_tutor_learning_event", { p_user: S3, p_session_id: s.id, p_event: { kind: "error", error_type: type, knowledge_gap: "conduta inicial" } })));
    await add("priority_of_management", 3);
    expect((await rpc(S3, "app_tutor_report")).insights).toEqual([]); // 3 erros: pouco para afirmar padrão
    await add("therapeutic_reasoning", 2);
    const r = await rpc(S3, "app_tutor_report");
    expect(r.insights[0]).toMatchObject({ text: "Você identifica o diagnóstico, mas tem perdido questões quando o comando pede a conduta.", evidence: 5 });
    expect(r.recurrent_errors[0]).toMatchObject({ error_type: "priority_of_management", times: 3 });
    expect(r.sessions.count).toBeGreaterThan(0);
    // histórico: título, professor e duração ou questões
    const list = await rpc(S3, "app_tutor_sessions", 5);
    expect(list[0]).toMatchObject({ persona: expect.any(String), minutes: expect.any(Number), questions: expect.any(Number) });
  });

  it("memória de longo prazo: evolução (errava um tema e agora acerta), piada interna e perfil do aluno", async () => {
    const s = await rpc(S3, "app_tutor_start", "livre", null, null);
    const q = Object.keys(off)[0];
    const topic = (await sql(`select topic from public.questions where id = $1`, [q]))[0].topic;
    // errava o tema há uma semana (2 erros) e acertou 2 questões dele nos últimos dias
    await sql(`insert into public.student_error_events (user_id, question_id, session_id, theme, error_type, knowledge_gap, source, occurred_at)
               values ($1, $2, $3, $4, 'knowledge_gap', 'conduta no tema', 'tutor_text', now() - interval '7 days'), ($1, $2, $3, $4, 'knowledge_gap', 'conduta no tema', 'tutor_text', now() - interval '6 days')`, [S3, q, s.id, topic]);
    for (let i = 0; i < 2; i++)
      await sql(`insert into public.tutor_answers (session_id, user_id, question_id, selected_option, is_correct, outcome, response_ms) values ($1, $2, $3, $4, true, 'normal', 20000)`, [s.id, S3, q, off[q]]);
    const mem = (await sql(`select public.tutor_learning_memory($1, null, null) m`, [S3]))[0].m;
    expect(mem.improvements).toEqual(expect.arrayContaining([expect.objectContaining({ topic, errors_before: 2, correct_recent: 2 })]));
    expect(mem.inside_jokes.map((j: any) => j.topic)).toContain("conduta no tema");
    expect(mem.profile).toMatchObject({ average_response_s: 20 });
  });

  it("custo central (AI_COST_CONFIG): preço por modelo, prefixo de versão e atualização pelo .env sem migração", () => {
    expect(priceFor("gpt-realtime-2.1-2026-09-01")).toMatchObject({ audio_out: 64 });
    expect(priceFor("modelo-desconhecido")).toBeNull();
    expect(estimateCost("gpt-realtime-2.1-mini", { output_audio_tokens: 1_000_000 })).toBe(20);
    expect(estimateCost("gpt-realtime-2.1-mini", { output_audio_tokens: 1_000_000 }, { AI_COST_CONFIG: '{"gpt-realtime-2.1-mini":{"audio_out":30}}' } as any)).toBe(30);
    expect(estimateCost("x", { output_audio_tokens: 10 })).toBeNull();
    const rt = composeRealtimeInstructions({ mode: "livre", persona: "P", context: "C" });
    expect(rt).not.toContain("<base>");
    // idioma e sotaque no começo e lembrados no fim (o dono ouviu "muito sotaque")
    expect(rt.startsWith("IDIOMA E SOTAQUE")).toBe(true);
    expect(rt).toContain("português brasileiro neutro");
    expect(rt).toContain("pronúncia de falante nativo");
    expect(rt).not.toContain("capital do Sudeste");
    expect(rt).toContain('AVC "a-vê-cê"');
    // pedido de 2026-10-06: professor conversando, não locutor; só muda de idioma se o aluno pedir ou passar a falar outra língua
    expect(rt.trim().endsWith("português brasileiro neutro, pronúncia nativa estável e conversa natural, sem imitar sotaques regionais; mantenha a personalidade escolhida.")).toBe(true);
    expect(rt).toContain("FALA DE GENTE, SEM FILTRO");
    expect(rt).toContain("Você pode GRITAR");
    expect(rt).toContain("Não transforme a fala em locução publicitária");
    expect(rt).toContain("Só mude de idioma se o aluno pedir explicitamente");
  });
});
