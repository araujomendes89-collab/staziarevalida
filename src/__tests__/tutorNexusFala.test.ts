// @vitest-environment node
/**
 * Voz do professor pela rota /api/tutor/speech (Tutor Nexus, spec §8 e §16 "Leitura da voz"): segue o direito do Tutor (o
 * teste grátis ouve), os caracteres por plano e os tetos da conta, a aprovação de cada voz (só a versão aprovada fala com
 * alunos; a equipe ouve antes; "só equipe" barra aluno), reserva antes de gerar e estorno se a voz não sair, e fala com o
 * estado com que o texto foi escrito. Sem rede: a voz oficial usa um fetch falso.
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
import { voiceFingerprint } from "../../server/tutor/officialVoices";
import { VOICE_BLOCK_ERROR, elevenAccessOf, minutesOf } from "../../server/tutor/nexus";
import { speechCut } from "../../server/tutor/speech";
import { TRIAL_OVER } from "../../server/tutor/engine";
import { aceitarTermos } from "./helpers/aceites";
import { GEMINI_VOZ_ENV, custoDe, pedidoGemini, respostaGemini } from "./helpers/vozGemini";

// a voz do professor é a do personagem no Gemini (padrão); a ElevenLabs só de reserva (TUTOR_VOICE_ENGINE=elevenlabs)
const ENV = GEMINI_VOZ_ENV;
const RESERVA_ELEVENLABS = { ...ENV, TUTOR_VOICE_ENGINE: "elevenlabs", ELEVENLABS_API_KEY: "chave-falsa-de-teste-" + "x".repeat(40),
  ELEVENLABS_VOICE_STAZI: "vozStaziTeste000001", ELEVENLABS_VOICE_STAZIA: "vozStaziaTeste00001" };
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const TESTE = "00000000-0000-4000-8000-0000000000f1";
const PAGO = "00000000-0000-4000-8000-0000000000f2";
const OUTRO = "00000000-0000-4000-8000-0000000000f3";
const BLOQ = "00000000-0000-4000-8000-0000000000f4";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-fala-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const tokens: Record<string, string> = {};
const sent: { url: string; body: any; text: string; voice: string; headers: Record<string, string> }[] = [];
let failVoice = false;
const fakeFetch = (async (url: string, init: RequestInit) => {
  if (failVoice) return new Response("fora do ar", { status: 503 });
  const pedido = pedidoGemini(init);
  sent.push({ url, ...pedido, headers: init.headers as Record<string, string> });
  return respostaGemini(pedido.text);
}) as typeof fetch;
const deps: any = { mockRespond: () => ({}), fetch: fakeFetch, elevenEnv: ENV };

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const config = (c: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", c, "Ajuste para os testes da voz do professor.");
const approve = async (voice: string, env = ENV) =>
  sql(`insert into public.tutor_voice_approvals (voice, fingerprint, approved_by) values ($1, $2, $3)
       on conflict (voice) do update set fingerprint = excluded.fingerprint, approved_at = now(), revoked_at = null, revoked_by = null`, [voice, voiceFingerprint(voice as any, env), ADMIN]);
const speak = async (uid: string, body: Record<string, unknown>) => {
  const r = await fetch(`${base}/speech`, { method: "POST", headers: { Authorization: `Bearer ${tokens[uid]}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : null;
  return { status: r.status, json, cache: r.headers.get("x-tutor-voice-cache") };
};
const phrase = (uid: string, p: "marked" | "unmarked", personality = "durona", letter: string | null = "B") => speak(uid, { kind: "phrase", phrase: p, letter: p === "marked" ? letter : null, personality_id: personality });
const used = async (uid: string) => (await sql(`select coalesce(sum(chars), 0)::int n from public.tutor_tts_usage where user_id = $1 and status in ('reserved', 'spent')`, [uid]))[0].n as number;
const session = async (uid: string, personality = "durona") => (await rpc(uid, "app_tutor_start", "livre", null, null, null, personality)).id as string;
const tutorMessage = async (uid: string, sid: string, content: string, meta: Record<string, unknown> = {}) =>
  (await sql(`insert into public.tutor_messages (session_id, user_id, role, content, meta) values ($1, $2, 'tutor', $3, $4) returning id`, [sid, uid, content, JSON.stringify(meta)]))[0].id as number;
const UNMARKED = "Desmarquei. Qual você escolhe?".length;
const MARKED = "Marquei a B. Diga confirmo para responder, ou fale outra alternativa.".length;

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'teste@t.dev'), ($3, 'pago@t.dev'), ($4, 'outro@t.dev'), ($5, 'bloq@t.dev')`, [ADMIN, TESTE, PAGO, OUTRO, BLOQ]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [PAGO, OUTRO]);
  await dev.db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '1 day' where user_id = $1`, [TESTE]);
  await dev.db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '30 days' where user_id = $1`, [BLOQ]);
  for (const uid of [ADMIN, TESTE, PAGO, OUTRO, BLOQ]) {
    await aceitarTermos(dev.db, uid);
    tokens[uid] = await dev.createSession(uid);
  }
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
beforeEach(async () => {
  sent.length = 0;
  failVoice = false;
  deps.elevenEnv = ENV;
  await sql(`delete from public.tutor_tts_usage`);
  await sql(`delete from public.tutor_voice_approvals`);
  await config({ enabled: true, requires_pro: true, voice_enabled: true, tts_team_only: false, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500,
                 tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000, tts_price_per_1k_chars_usd: 0.3 });
  for (const v of ["stazi", "stazia"]) await approve(v);
});

describe("Voz do professor pela rota", () => {
  it("aluno do teste grátis ouve a voz aprovada até o limite do dia; depois 429 'Você usou sua voz de hoje' (voice_student_limit)", async () => {
    await config({ tts_trial_daily_chars: UNMARKED + 10 });
    expect((await phrase(TESTE, "unmarked")).status).toBe(200);
    expect(await used(TESTE)).toBe(UNMARKED);
    expect(sent).toHaveLength(1);
    const no = await phrase(TESTE, "marked");
    expect(no).toMatchObject({ status: 429, json: { error: "Você usou sua voz de hoje", code: "voice_student_limit" } });
    expect(sent).toHaveLength(1);
    // o gasto entrou no registro de uso com o custo que o próprio Google informou (tokens do Gemini), não o preço do painel
    const led = await sql(`select feature, provider, model, characters, estimated_cost_usd::float c from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_tts'`, [TESTE]);
    expect(led).toEqual([{ feature: "tutor_tts", provider: "gemini", model: "gemini-3.8-flash-tts", characters: UNMARKED, c: custoDe(sent[0].text) }]);
    expect(custoDe(sent[0].text)).toBeGreaterThan(0);
  });

  it("a voz do professor funciona com o tempo da voz ao vivo esgotado (dia e teste inteiro)", async () => {
    const s = await session(TESTE);
    await sql(`insert into public.tutor_voice_calls (user_id, session_id, status, lease_until, consumed_seconds, ended_at, provider) values ($1, $2, 'ended', now(), 2400, now(), 'realtime')`, [TESTE, s]);
    expect((await sql(`select public.tutor_entitlement($1) e`, [TESTE]))[0].e.can_voice).toBe(false);
    const m = await tutorMessage(TESTE, s, "Pensa no que o enunciado te deu de bandeja.");
    expect((await speak(TESTE, { kind: "message", session_id: s, message_id: m })).status).toBe(200);
  });

  it("limite por plano: pago usa tts_paid_daily_chars; equipe conta como pago", async () => {
    await config({ tts_paid_daily_chars: UNMARKED + 10, tts_trial_daily_chars: 4500 });
    for (const uid of [PAGO, ADMIN]) {
      expect((await phrase(uid, "unmarked", "durao")).status, uid).toBe(200);
      expect(await phrase(uid, "marked", "durao"), uid).toMatchObject({ status: 429, json: { code: "voice_student_limit" } });
    }
    // o teste grátis segue o próprio limite
    expect((await phrase(TESTE, "marked", "durao")).status).toBe(200);
  });

  it("tetos da conta: 'A voz da plataforma acabou por hoje' e 'A voz da plataforma acabou neste mês'", async () => {
    await config({ tts_account_daily_chars: UNMARKED + 10 });
    expect((await phrase(PAGO, "unmarked", "acolhedor")).status).toBe(200);
    expect(await phrase(OUTRO, "marked", "acolhedor")).toMatchObject({ status: 429, json: { error: "A voz da plataforma acabou por hoje", code: "voice_account_day" } });
    await config({ tts_account_daily_chars: 100000, tts_account_monthly_chars: 1000 });
    await sql(`insert into public.tutor_tts_usage (user_id, day, month, chars, status) values ($1, public.today_br() - 1, date_trunc('month', public.today_br())::date, 990, 'spent')`, [OUTRO]);
    expect(await phrase(OUTRO, "marked", "acolhedor")).toMatchObject({ status: 429, json: { error: "A voz da plataforma acabou neste mês", code: "voice_account_month" } });
  });

  it("sem aprovação o aluno recebe 409 voice_unavailable e nada é gerado; a equipe ouve a voz não aprovada; 'só equipe' barra aluno mesmo com voz aprovada", async () => {
    await sql(`delete from public.tutor_voice_approvals where voice = 'stazia'`);
    expect(await phrase(PAGO, "unmarked", "durona")).toMatchObject({ status: 409, json: { error: "A voz do professor não está disponível agora.", code: "voice_unavailable" } });
    expect(sent).toHaveLength(0);
    expect(await used(PAGO)).toBe(0);
    // as outras vozes, aprovadas, seguem
    expect((await phrase(PAGO, "unmarked", "durao")).status).toBe(200);
    // a equipe ouve a voz ainda não aprovada (para medir os tempos antes de aprovar)
    expect((await phrase(ADMIN, "unmarked", "durona")).status).toBe(200);
    // só equipe: aluno fica de fora mesmo com a voz aprovada; a equipe segue
    await config({ tts_team_only: true });
    expect(await phrase(PAGO, "marked", "durao")).toMatchObject({ status: 409, json: { code: "voice_unavailable" } });
    expect((await phrase(ADMIN, "marked", "durao")).status).toBe(200);
  });

  it("aprovação revogada ou versão mudada: a próxima fala recusa na hora", async () => {
    expect((await phrase(PAGO, "unmarked", "durona")).status).toBe(200);
    await sql(`select public.ch_worker_tutor_voice_revoke($1, 'stazia')`, [ADMIN]);
    expect(await phrase(PAGO, "marked", "durona")).toMatchObject({ status: 409, json: { code: "voice_unavailable" } });
    await approve("stazia");
    expect((await phrase(PAGO, "marked", "durona")).status).toBe(200);
    // trocou o serviço da voz no servidor (reserva ElevenLabs): a versão aprovada não vale mais
    deps.elevenEnv = RESERVA_ELEVENLABS;
    const n = sent.length;
    expect(await phrase(PAGO, "marked", "durona", "C")).toMatchObject({ status: 409, json: { code: "voice_unavailable" } });
    expect(sent).toHaveLength(n);
  });

  it("estorno quando a voz não sai: fornecedor fora do ar devolve os caracteres e responde 502 voice_failed", async () => {
    const ledger = async () => (await sql(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_tts'`, [PAGO]))[0].n as number;
    const before = await ledger();
    failVoice = true;
    expect(await phrase(PAGO, "marked", "durao", "D")).toMatchObject({ status: 502, json: { error: "A voz natural falhou agora.", code: "voice_failed" } });
    expect(await used(PAGO)).toBe(0);
    expect((await sql(`select status from public.tutor_tts_usage where user_id = $1`, [PAGO])).map((r) => r.status)).toEqual(["refunded"]);
    expect(await ledger()).toBe(before);
  });

  it("a voz usa o estado com que a fala foi escrita (meta.personality), não o humor atual da conversa; frase fixa sai neutra", async () => {
    const s = await session(PAGO, "durona");
    await sql(`update public.tutor_sessions set emotion = '{"mood": "pleased", "frustration": 5, "enthusiasm": 80}'::jsonb where id = $1`, [s]);
    const m = await tutorMessage(PAGO, s, "De novo? Lê o comando da questão.", { personality: { id: "durona", mood: "irritated", frustration: 70, enthusiasm: 30 } });
    expect((await speak(PAGO, { kind: "message", session_id: s, message_id: m })).status).toBe(200);
    // o Gemini TTS lê em voz alta qualquer instrução de tom: vai só a fala, na voz da Stazia (Kore); o jeito vem do texto
    expect(sent.at(-1)!.text).toBe("De novo? Lê o comando da questão.");
    expect(sent.at(-1)!.voice).toBe("Kore");
    expect(Object.keys(sent.at(-1)!.body).sort()).toEqual(["contents", "generationConfig"]);
    expect(sent.at(-1)!.url).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash-tts:generateContent");
    expect(sent.at(-1)!.url).not.toContain(ENV.VERTEX_API_KEY);
    expect(sent.at(-1)!.headers["x-goog-api-key"]).toBe(ENV.VERTEX_API_KEY);
    expect((await phrase(PAGO, "marked", "durona", "E")).status).toBe(200);
    expect(sent.at(-1)!.text).toBe("Marquei a E. Diga confirmo para responder, ou fale outra alternativa.");
  });

  it("corte da fala: até ~450 caracteres num fim de frase; sem fim de frase, no último espaço; a mensagem gravada continua inteira", async () => {
    const sentence = "Essa conduta não fecha com o quadro clínico apresentado. ";
    const long = sentence.repeat(14).trim();
    expect(speechCut(long)).toBe(sentence.repeat(7).trim());
    expect(speechCut(long).length).toBeLessThanOrEqual(450);
    const words = "palavra ".repeat(80).trim();
    const cut = speechCut(words);
    expect(cut.length).toBeLessThanOrEqual(450);
    expect(cut.endsWith("palavra")).toBe(true);
    expect(speechCut("Curta.")).toBe("Curta.");
    // pela rota: a voz recebe o pedaço, a conversa guarda o texto inteiro
    const s = await session(PAGO, "durao");
    const m = await tutorMessage(PAGO, s, long);
    expect((await speak(PAGO, { kind: "message", session_id: s, message_id: m })).status).toBe(200);
    expect(sent.at(-1)!.text).toBe(sentence.repeat(7).trim());
    expect(sent.at(-1)!.voice).toBe("Zubenelgenubi"); // o Durão fala com a voz do Stazi
    expect(await used(PAGO)).toBe(sentence.repeat(7).trim().length);
    expect((await sql(`select content from public.tutor_messages where id = $1`, [m]))[0].content).toBe(long);
  });

  it("colchetes do texto viram parênteses (não viram marcação de áudio do serviço)", async () => {
    const s = await session(PAGO, "acolhedor");
    const m = await tutorMessage(PAGO, s, "Olha isso [laughs] e confere o enunciado.", { personality: { id: "acolhedor", mood: "neutral", frustration: 5 } });
    expect((await speak(PAGO, { kind: "message", session_id: s, message_id: m })).status).toBe(200);
    expect(sent.at(-1)!.text).not.toContain("[");
    expect(sent.at(-1)!.text).not.toContain("]");
  });

  it("ouvir de novo sai do cache, sem gerar nem cobrar", async () => {
    const s = await session(PAGO, "durao");
    const m = await tutorMessage(PAGO, s, "Isso. Diagnóstico e conduta certos.");
    expect((await speak(PAGO, { kind: "message", session_id: s, message_id: m })).cache).toBe("miss");
    const n = await used(PAGO);
    expect((await speak(PAGO, { kind: "message", session_id: s, message_id: m })).cache).toBe("hit");
    expect(sent).toHaveLength(1);
    expect(await used(PAGO)).toBe(n);
  });

  it("teste terminado: 403 com a mensagem do teste antes de qualquer voz; mensagens sem nome de fornecedor", async () => {
    expect(await phrase(BLOQ, "unmarked", "durao")).toMatchObject({ status: 403, json: { error: TRIAL_OVER } });
    expect(sent).toHaveLength(0);
    expect(await used(BLOQ)).toBe(0);
    for (const e of Object.values(VOICE_BLOCK_ERROR)) expect(e.message).not.toMatch(/elevenlabs|openai|google|gemini|aparelho/i);
    // a regra, isolada: voz desligada vem antes de tudo; equipe passa por "não aprovada" e "só equipe"
    const row = { id: "stazia" as const, label: "Stazia", configured: true, unique: true, ready: true, approved: false, fingerprint: "f".repeat(64), pending: null };
    const quota: any = { voice_enabled: true, team_only: true, staff: false, remaining_today: 10, account_day_left: 10, account_month_left: 10, approvals: {} };
    expect(elevenAccessOf({ quota: { ...quota, voice_enabled: false }, row })).toEqual({ ok: false, reason: "voice_off" });
    expect(elevenAccessOf({ quota, row: null })).toEqual({ ok: false, reason: "not_configured" });
    expect(elevenAccessOf({ quota, row })).toEqual({ ok: false, reason: "not_approved" });
    expect(elevenAccessOf({ quota: { ...quota, approvals: { stazia: { fingerprint: "f".repeat(64) } } }, row })).toEqual({ ok: false, reason: "team_only" });
    expect(elevenAccessOf({ quota: { ...quota, staff: true }, row, need: 11 })).toEqual({ ok: false, reason: "student_limit" });
    expect(elevenAccessOf({ quota: { ...quota, staff: true }, row, need: 10 })).toEqual({ ok: true, reason: null });
    expect([0, 899, 900, 4500].map(minutesOf)).toEqual([0, 0, 1, 5]);
  });
});
