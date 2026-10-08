// @vitest-environment node
/**
 * Chamada da voz do professor (Tutor Nexus) no banco (migração 20261003005800): a chamada "tts" em tutor_voice_calls
 * serve à trava de turno e ao client_turn_id. Ela não depende nem gasta o tempo da voz ao vivo, não cai entre turnos
 * enquanto renova, divide com a voz ao vivo a regra de uma chamada ativa por aluno e guarda o resultado do último turno
 * para o mesmo pedido repetido não rodar duas vezes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-call-"));
let dev: DevDatabase;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const PAGO = "00000000-0000-4000-8000-0000000000d1";
const OUTRO = "00000000-0000-4000-8000-0000000000d2";
const TESTE = "00000000-0000-4000-8000-0000000000d3";
const BLOQ = "00000000-0000-4000-8000-0000000000d4";
const T1 = "turno-0001";
const T2 = "turno-0002";
const T3 = "turno-0003";
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
const worker = async (fn: string, ...args: unknown[]) =>
  (await sql(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map(arg)))[0].r;
const config = (c: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", c, "Ajuste para os testes da chamada da voz do professor.");
const open = (user: string, session: string, force = false, spoken = true) => worker("ch_worker_tutor_tts_open", user, session, force, spoken);
const renew = (user: string, call: string) => worker("ch_worker_tutor_voice_renew", user, call, null);
const end = (user: string, call: string, reason = "student") => worker("ch_worker_tutor_voice_end", user, call, reason);
const begin = (user: string, call: string, turn: string) => worker("ch_worker_tutor_tts_turn_begin", user, call, turn);
const finish = (user: string, call: string, turn: string, result: unknown) => worker("ch_worker_tutor_tts_turn_end", user, call, turn, result);
const call = async (id: string) => (await sql(`select * from public.tutor_voice_calls where id = $1`, [id]))[0];
const ledgerOf = async (id: string) => (await sql(`select count(*)::int n from public.ai_usage_ledger where meta ->> 'voice_call' = $1`, [id]))[0].n as number;
const sessionSeconds = async (id: string) => (await sql(`select voice_seconds from public.tutor_sessions where id = $1`, [id]))[0].voice_seconds as number;
const newSession = async (user: string) =>
  (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'nexus', 'durona', 3) returning id`, [user]))[0].id as string;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'pago@t.dev'), ($3, 'outro@t.dev'), ($4, 'teste@t.dev'), ($5, 'bloq@t.dev')`, [ADMIN, PAGO, OUTRO, TESTE, BLOQ]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active' where user_id in ($1, $2)`, [PAGO, OUTRO]);
  await dev.db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '1 day' where user_id = $1`, [TESTE]);
  await dev.db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '30 days' where user_id = $1`, [BLOQ]);
  for (const uid of [PAGO, OUTRO, TESTE, BLOQ]) await aceitarTermos(dev.db, uid);
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await sql(`update public.tutor_voice_calls set status = 'ended', ended_at = now(), termination_reason = 'student' where status = 'active'`);
  await sql(`delete from public.tutor_tts_usage`);
  await config({ enabled: true, requires_pro: true, voice_enabled: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000 });
});

describe("Voz do professor: a chamada tts", () => {
  it("abrir tts não depende do tempo da voz ao vivo (dia e teste inteiro esgotados) e não gasta segundos ao renovar e encerrar", async () => {
    const s = await newSession(TESTE);
    // a voz ao vivo do teste acabou (o teste inteiro e o dia)
    await sql(`insert into public.tutor_voice_calls (user_id, session_id, status, lease_until, consumed_seconds, ended_at, provider) values ($1, $2, 'ended', now(), 2400, now(), 'realtime')`, [TESTE, s]);
    const before = await worker("tutor_entitlement", TESTE);
    expect(before.can_voice).toBe(false);
    const o = await open(TESTE, s);
    expect(o).toMatchObject({ ok: true, lease_seconds: 120 });
    expect(await call(o.voice_call_id)).toMatchObject({ provider: "tts", model: "tts", status: "active" });
    // ativa, a chamada tts não conta no tempo da voz ao vivo
    expect((await worker("tutor_entitlement", TESTE)).voice).toEqual(before.voice);
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '90 seconds' where id = $1`, [o.voice_call_id]);
    expect((await renew(TESTE, o.voice_call_id)).ok).toBe(true);
    expect((await worker("tutor_entitlement", TESTE)).voice).toEqual(before.voice);
    const e = await end(TESTE, o.voice_call_id);
    expect(e).toMatchObject({ ok: true, consumed_seconds: 0 });
    expect(await call(o.voice_call_id)).toMatchObject({ status: "ended", consumed_seconds: 0 });
    expect(await ledgerOf(o.voice_call_id)).toBe(0);
    expect(await sessionSeconds(s)).toBe(0);
    expect((await worker("tutor_entitlement", TESTE)).voice).toEqual(before.voice);
  });

  it("abrir tts exige Tutor ligado, voz ligada e direito ao Tutor; com p_spoken, também caracteres; sem p_spoken, abre sem caracteres", async () => {
    const s = await newSession(PAGO);
    await config({ enabled: false });
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "disabled" });
    await config({ enabled: true, voice_enabled: false });
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "voice_disabled" });
    await config({ voice_enabled: true });
    expect(await open(BLOQ, await newSession(BLOQ))).toEqual({ ok: false, reason: "trial_expired" });

    // caracteres do aluno no dia
    await sql(`insert into public.tutor_tts_usage (user_id, chars, status) values ($1, 4000, 'spent'), ($1, 500, 'reserved')`, [PAGO]);
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "student_limit" });
    const silent = await open(PAGO, s, false, false);
    expect(silent.ok).toBe(true);
    await end(PAGO, silent.voice_call_id);
    // tetos da conta: o dia e o mês
    await sql(`delete from public.tutor_tts_usage`);
    await sql(`insert into public.tutor_tts_usage (user_id, chars, status) values ($1, 4000, 'spent'), ($1, 500, 'spent')`, [OUTRO]);
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "account_day" });
    await config({ tts_account_daily_chars: 100000, tts_account_monthly_chars: 4500 });
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "account_month" });
    await config({ tts_account_monthly_chars: 30000 });
    const ok = await open(PAGO, s);
    expect(ok.ok).toBe(true);
    // abrir não reserva caracteres e começa o teste de quem ainda não começou
    expect((await worker("ch_worker_tutor_tts_quota", PAGO)).used_today).toBe(0);
    const NOVO = "00000000-0000-4000-8000-0000000000d5";
    await sql(`insert into auth.users (id, email) values ($1, 'novo@t.dev')`, [NOVO]);
    await aceitarTermos(dev.db, NOVO);
    expect((await open(NOVO, await newSession(NOVO))).ok).toBe(true);
    expect((await sql(`select tutor_trial_started_at is not null began from public.subscriptions where user_id = $1`, [NOVO]))[0].began).toBe(true);
  });

  it("uma chamada ativa por aluno: a segunda aba recebe busy; com p_force assume; abrir a voz ao vivo encerra a tts sozinha", async () => {
    const s = await newSession(PAGO);
    const a = await open(PAGO, s);
    expect(a.ok).toBe(true);
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "busy" });
    const b = await open(PAGO, s, true);
    expect(b).toMatchObject({ ok: true, replaced_provider: "tts" });
    expect(await call(a.voice_call_id)).toMatchObject({ status: "ended", termination_reason: "replaced", consumed_seconds: 0 });
    expect(await ledgerOf(a.voice_call_id)).toBe(0);

    // a voz ao vivo (reserva) encerra a tts sem pedir p_force e sem segundos
    const live = await worker("ch_worker_tutor_voice_start", PAGO, s, false, "gpt-realtime");
    expect(live).toMatchObject({ ok: true, replaced_provider: "tts" });
    expect(await call(b.voice_call_id)).toMatchObject({ status: "ended", termination_reason: "replaced", consumed_seconds: 0 });
    expect(await ledgerOf(b.voice_call_id)).toBe(0);
    expect(await sessionSeconds(s)).toBe(0);

    // a tts não derruba a voz ao vivo sem p_force; com p_force, a ao vivo conta o tempo real
    expect(await open(PAGO, s)).toEqual({ ok: false, reason: "busy" });
    const c = await open(PAGO, s, true);
    expect(c).toMatchObject({ ok: true, replaced_provider: "realtime" });
    expect((await call(live.voice_call_id)).consumed_seconds).toBeGreaterThanOrEqual(1);
    expect(await ledgerOf(live.voice_call_id)).toBe(1);
  });

  it("tts não cai enquanto renova; sem renovar, a varredura encerra sem segundos e sem registro", async () => {
    const s = await newSession(PAGO);
    const o = await open(PAGO, s);
    // renovar estende a reserva por voice_lease_seconds, mesmo que já tenha passado do tempo de uma conversa ao vivo
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '3 hours', lease_until = now() + interval '5 seconds' where id = $1`, [o.voice_call_id]);
    expect(await renew(PAGO, o.voice_call_id)).toMatchObject({ ok: true, lease_seconds: 120 });
    expect((await sql(`select lease_until > now() + interval '100 seconds' longer from public.tutor_voice_calls where id = $1`, [o.voice_call_id]))[0].longer).toBe(true);
    // Tutor desligado, voz desligada ou teste terminado: para
    await config({ voice_enabled: false });
    expect(await renew(PAGO, o.voice_call_id)).toMatchObject({ ok: false, stop: true, reason: "voice_disabled" });
    await config({ voice_enabled: true });

    // sem renovar: a varredura encerra sem segundos, sem registro e sem somar na conversa
    await sql(`update public.tutor_voice_calls set lease_until = now() - interval '1 minute' where id = $1`, [o.voice_call_id]);
    const gone = await worker("ch_worker_tutor_voice_sweep");
    expect(gone).toContainEqual(expect.objectContaining({ voice_call: o.voice_call_id, provider: "tts", seconds: 0 }));
    expect(await call(o.voice_call_id)).toMatchObject({ status: "expired", consumed_seconds: 0 });
    expect(await ledgerOf(o.voice_call_id)).toBe(0);
    expect(await sessionSeconds(s)).toBe(0);

    // a renovação que chega tarde demais também encerra sem segundos
    const late = await open(PAGO, s);
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '10 minutes', lease_until = now() - interval '1 minute' where id = $1`, [late.voice_call_id]);
    expect(await renew(PAGO, late.voice_call_id)).toMatchObject({ ok: false, stop: true, reason: "timeout" });
    expect(await call(late.voice_call_id)).toMatchObject({ status: "expired", consumed_seconds: 0 });
    expect(await ledgerOf(late.voice_call_id)).toBe(0);
    // e a reserva vencida que abrir de novo limpa também não ganha segundos
    const stale = await open(PAGO, s);
    await sql(`update public.tutor_voice_calls set started_at = now() - interval '10 minutes', lease_until = now() - interval '1 second' where id = $1`, [stale.voice_call_id]);
    expect((await open(PAGO, s)).ok).toBe(true);
    expect(await call(stale.voice_call_id)).toMatchObject({ status: "expired", consumed_seconds: 0 });

    // conversa encerrada: a renovação para e encerra a chamada, sem segundos
    const fim = await newSession(PAGO);
    const f = await open(PAGO, fim, true);
    await sql(`update public.tutor_sessions set status = 'closed' where id = $1`, [fim]);
    expect(await renew(PAGO, f.voice_call_id)).toMatchObject({ ok: false, stop: true, reason: "session_closed" });
    expect(await call(f.voice_call_id)).toMatchObject({ status: "ended", termination_reason: "session_closed", consumed_seconds: 0 });
  });

  it("trava de turno de 60 s: o segundo pedido recebe busy; o mesmo client_turn_id depois de terminado devolve o resultado guardado", async () => {
    const s = await newSession(PAGO);
    const { voice_call_id: v } = await open(PAGO, s);
    expect(await begin(PAGO, v, T1)).toEqual({ ok: true });
    expect((await sql(`select turn_until between now() + interval '55 seconds' and now() + interval '65 seconds' sixty from public.tutor_voice_calls where id = $1`, [v]))[0].sixty).toBe(true);
    expect(await begin(PAGO, v, T2)).toEqual({ ok: false, reason: "busy" });
    expect(await begin(PAGO, v, T1)).toEqual({ ok: false, reason: "busy" });
    await finish(PAGO, v, T1, { intent: "message" });
    expect(await begin(PAGO, v, T1)).toEqual({ ok: false, reason: "repeat", result: { intent: "message" } });
    expect(await begin(PAGO, v, T2)).toEqual({ ok: true });
    // turno que falhou: sem resultado, a nova tentativa roda
    await finish(PAGO, v, T2, null);
    expect(await begin(PAGO, v, T2)).toEqual({ ok: true });
    // terminar com outro id não mexe na trava
    await finish(PAGO, v, T1, { intent: "x" });
    expect(await begin(PAGO, v, T3)).toEqual({ ok: false, reason: "busy" });
    // trava vencida (o servidor caiu no meio do turno): libera
    await sql(`update public.tutor_voice_calls set turn_until = now() - interval '1 second' where id = $1`, [v]);
    expect(await begin(PAGO, v, T3)).toEqual({ ok: true });
    await expect(begin(PAGO, v, "curto")).rejects.toThrow(/Turno inválido/);
    await expect(begin(PAGO, v, "tem espaço 123")).rejects.toThrow(/Turno inválido/);
  });

  it("conversa encerrada, de outro aluno ou só leitura não abre", async () => {
    const s = await newSession(PAGO);
    expect(await open(OUTRO, s)).toEqual({ ok: false, reason: "not_found" });
    expect(await open(PAGO, "00000000-0000-4000-8000-00000000ffff")).toEqual({ ok: false, reason: "not_found" });
    const closed = await newSession(PAGO);
    await sql(`update public.tutor_sessions set status = 'closed' where id = $1`, [closed]);
    expect(await open(PAGO, closed)).toEqual({ ok: false, reason: "session_closed" });
    const old = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, legacy_persona) values ($1, 'livre', 'antiga', 'acolhedor', 3, '{"name":"Acolhedor","emoji":"🤗"}') returning id`, [PAGO]))[0].id;
    expect(await open(PAGO, old)).toEqual({ ok: false, reason: "read_only" });
    const off = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'desligado', 'preguicoso', 3) returning id`, [PAGO]))[0].id;
    expect(await open(PAGO, off)).toEqual({ ok: false, reason: "read_only" });

    // a trava de turno só vale na chamada tts ativa do próprio aluno
    const o = await open(PAGO, s);
    expect(await begin(OUTRO, o.voice_call_id, T1)).toEqual({ ok: false, reason: "closed" });
    await end(PAGO, o.voice_call_id);
    expect(await begin(PAGO, o.voice_call_id, T1)).toEqual({ ok: false, reason: "closed" });
    const live = await worker("ch_worker_tutor_voice_start", PAGO, s, false, "gpt-realtime");
    expect(await begin(PAGO, live.voice_call_id, T1)).toEqual({ ok: false, reason: "closed" });
  });

  it("métricas aceitam os tempos de cada etapa", async () => {
    const s = await newSession(PAGO);
    const { voice_call_id: v } = await open(PAGO, s);
    expect(await worker("ch_worker_tutor_voice_metrics", PAGO, v, { stt_ms_avg: 820.4, engine_ms_avg: 1500, tts_ms_avg: 640, play_start_ms_avg: 95, turns: 3, inventada: 7, tts_ms_avg_txt: "x" })).toBe(true);
    expect((await call(v)).metrics).toEqual({ stt_ms_avg: 820, engine_ms_avg: 1500, tts_ms_avg: 640, play_start_ms_avg: 95, turns: 3 });
    // o id e o provedor "tts" são aceitos ao guardar a chamada
    expect(await worker("ch_worker_tutor_voice_attach", PAGO, v, "nexus_1234", "tts")).toBe(true);
    expect(await call(v)).toMatchObject({ provider: "tts", call_id: "nexus_1234" });
  });

  it("as funções novas não ficam abertas para o navegador", async () => {
    for (const fn of ["ch_worker_tutor_tts_open(uuid, uuid, boolean, boolean)", "ch_worker_tutor_tts_turn_begin(uuid, uuid, text)", "ch_worker_tutor_tts_turn_end(uuid, uuid, text, jsonb)"]) {
      for (const role of ["anon", "authenticated"]) {
        expect((await sql(`select has_function_privilege($1, $2, 'execute') ok`, [role, `public.${fn}`]))[0].ok, `${role} ${fn}`).toBe(false);
      }
    }
  });
});
