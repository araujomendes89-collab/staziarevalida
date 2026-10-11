// @vitest-environment node
/**
 * Voz do professor (Tutor Nexus) no banco (migração 20261003005700): caracteres por aluno por dia (teste e pago), tetos da
 * conta inteira por dia e por mês (Brasília), reserva antes de gerar e estorno se a voz não sair, o gasto entrando no
 * registro de uso (tutor_tts), audição e transcrição registradas fora dos limites, e a leitura da voz pelo direito do Tutor
 * (não mais "só assinante"), trazendo o estado com que cada fala foi escrita.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-chars-"));
let dev: DevDatabase;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const PAGO = "00000000-0000-4000-8000-0000000000c1";
const OUTRO = "00000000-0000-4000-8000-0000000000c2";
const TESTE = "00000000-0000-4000-8000-0000000000c3";
const BLOQ = "00000000-0000-4000-8000-0000000000c4";
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
const config = (c: Record<string, unknown>) => rpc(ADMIN, "app_admin_tutor_save_config", c, "Ajuste para os testes da voz do professor.");
const reserve = (user: string, chars: number) => worker("ch_worker_tutor_tts_reserve", user, null, chars);
const settle = (user: string, reservation: number, spent: boolean, entry: unknown = {}) => worker("ch_worker_tutor_tts_settle", user, reservation, spent, entry);
const quota = (user: string) => worker("ch_worker_tutor_tts_quota", user);
const today = async () => (await sql(`select public.today_br()::text d`))[0].d as string;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'pago@t.dev'), ($3, 'outro@t.dev'), ($4, 'teste@t.dev'), ($5, 'bloq@t.dev')`, [ADMIN, PAGO, OUTRO, TESTE, BLOQ]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [PAGO, OUTRO]);
  await dev.db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '1 day' where user_id = $1`, [TESTE]);
  await dev.db.query(`update public.subscriptions set tutor_trial_started_at = now() - interval '30 days' where user_id = $1`, [BLOQ]);
  for (const uid of [PAGO, OUTRO, TESTE, BLOQ]) await aceitarTermos(dev.db, uid);
  await config({ enabled: true, requires_pro: true, voice_enabled: true });
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await sql(`delete from public.tutor_tts_usage`);
  await config({ enabled: true, voice_enabled: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000 });
});

describe("Voz do professor: caracteres", () => {
  it("teste grátis e plano pago: 4.500 caracteres por dia; o que passar recusa com student_limit", async () => {
    await config({ tts_account_daily_chars: 100000, tts_account_monthly_chars: 1000000 });
    for (const user of [TESTE, PAGO]) {
      expect((await quota(user)).limit_today, user).toBe(4500);
      expect((await reserve(user, 4000)).ok, user).toBe(true);
      expect((await reserve(user, 500)).ok, user).toBe(true);
      const no = await reserve(user, 1);
      expect(no, user).toMatchObject({ ok: false, reason: "student_limit" });
      expect(no.quota).toMatchObject({ used_today: 4500, remaining_today: 0 });
    }
    expect((await quota(TESTE)).mode).toBe("trial");
    expect((await quota(PAGO)).mode).toBe("paid");
    await expect(reserve(PAGO, 0)).rejects.toThrow(/Texto de voz inválido/);
    await expect(reserve(PAGO, 4001)).rejects.toThrow(/Texto de voz inválido/);
  });

  it("tetos da conta (4.500 por dia e 30.000 por mês) valem para todos juntos", async () => {
    expect((await reserve(PAGO, 3000)).ok).toBe(true);
    expect(await reserve(OUTRO, 3000)).toMatchObject({ ok: false, reason: "account_day" });
    expect((await quota(OUTRO)).account_day_left).toBe(1500);
    await sql(`delete from public.tutor_tts_usage`);
    // gasto noutros dias deste mês: 29.000
    for (const chars of [4000, 4000, 4000, 4000, 4000, 4000, 4000, 1000]) {
      await sql(`insert into public.tutor_tts_usage (user_id, day, month, chars, status) values ($1, public.today_br() - 1, date_trunc('month', public.today_br())::date, $2, 'spent')`, [OUTRO, chars]);
    }
    expect((await quota(PAGO)).account_month_left).toBe(1000);
    expect(await reserve(PAGO, 1500)).toMatchObject({ ok: false, reason: "account_month" });
    expect((await reserve(PAGO, 1000)).ok).toBe(true);
  });

  it("dois pedidos ao mesmo tempo não passam do limite", async () => {
    const [a, b] = await Promise.all([reserve(PAGO, 3000), reserve(PAGO, 3000)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await quota(PAGO)).used_today).toBe(3000);
  });

  it("estorno devolve; gasto vira uma linha tutor_tts (a Central de IAs soma) e sobe ai_usage.voice_chars; acertar de novo não duplica", async () => {
    const r1 = await reserve(PAGO, 1000);
    expect((await quota(PAGO)).used_today).toBe(1000);
    await settle(PAGO, r1.reservation, false);
    expect((await quota(PAGO)).used_today).toBe(0);
    expect((await sql(`select status from public.tutor_tts_usage where id = $1`, [r1.reservation]))[0].status).toBe("refunded");
    const before = Number((await sql(`select coalesce(sum(voice_chars), 0) n from public.ai_usage where user_id = $1`, [PAGO]))[0].n);
    const r2 = await reserve(PAGO, 1200);
    const entry = { provider: "elevenlabs", model: "eleven_v3", estimated_cost_usd: 0.36 };
    await settle(PAGO, r2.reservation, true, entry);
    await settle(PAGO, r2.reservation, true, entry); // repetir não faz nada
    await settle(PAGO, r2.reservation, false); // nem estorna depois de gasto
    const rows = await sql(`select feature, characters, provider, model, estimated_cost_usd::float c, meta from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_tts'`, [PAGO]);
    expect(rows).toEqual([{ feature: "tutor_tts", characters: 1200, provider: "elevenlabs", model: "eleven_v3", c: 0.36, meta: { reservation: r2.reservation } }]);
    expect(Number((await sql(`select coalesce(sum(voice_chars), 0) n from public.ai_usage where user_id = $1`, [PAGO]))[0].n)).toBe(before + 1200);
    expect((await quota(PAGO)).used_today).toBe(1200);
    // a reserva de outro aluno não muda
    const r3 = await reserve(OUTRO, 100);
    await settle(PAGO, r3.reservation, false);
    expect((await sql(`select status from public.tutor_tts_usage where id = $1`, [r3.reservation]))[0].status).toBe("reserved");
  });

  it("dia de Brasília e mês do calendário: o de ontem não conta hoje; o do mês passado não conta no mês", async () => {
    await sql(`insert into public.tutor_tts_usage (user_id, day, month, chars, status) values ($1, public.today_br() - 1, date_trunc('month', public.today_br())::date, 4000, 'spent')`, [PAGO]);
    for (let i = 0; i < 8; i++) {
      await sql(`insert into public.tutor_tts_usage (user_id, day, month, chars, status) values ($1, public.today_br() - 40, date_trunc('month', public.today_br() - 31)::date, 4000, 'spent')`, [PAGO]);
    }
    const q = await quota(PAGO);
    expect(q.used_today).toBe(0);
    expect(q.account_day_left).toBe(4500);
    expect(q.account_month_left).toBe(26000);
    const r = await reserve(PAGO, 100);
    const row = (await sql(`select day::text d, month::text m from public.tutor_tts_usage where id = $1`, [r.reservation]))[0];
    expect(row.d).toBe(await today());
    expect(row.m).toBe((await sql(`select date_trunc('month', public.today_br())::date::text m`))[0].m);
  });

  it("audição (tutor_tts_audicao) e transcrição (tutor_stt) entram no registro por ch_worker_tutor_ledger e não contam nos limites nem nos tetos", async () => {
    await worker("ch_worker_tutor_ledger", ADMIN, null, { feature: "tutor_tts_audicao", provider: "elevenlabs", model: "eleven_v3", characters: 900, estimated_cost_usd: 0.27 });
    await worker("ch_worker_tutor_ledger", PAGO, null, { feature: "tutor_stt", provider: "openai", model: "gpt-4o-mini-transcribe", duration_seconds: 30, estimated_cost_usd: 0.002 });
    expect((await sql(`select feature from public.ai_usage_ledger where feature in ('tutor_tts_audicao', 'tutor_stt') order by feature`)).map((r: any) => r.feature)).toEqual(["tutor_stt", "tutor_tts_audicao"]);
    const q = await quota(PAGO);
    expect(q).toMatchObject({ used_today: 0, account_day_left: 4500, account_month_left: 30000 });
  });

  it("teste terminado, Tutor desligado e voz desligada recusam antes de reservar", async () => {
    expect(await reserve(BLOQ, 100)).toMatchObject({ ok: false, reason: "trial_expired" });
    expect((await quota(BLOQ)).limit_today).toBe(0);
    await config({ voice_enabled: false });
    expect(await reserve(PAGO, 100)).toMatchObject({ ok: false, reason: "voice_disabled" });
    await config({ enabled: false });
    expect(await reserve(PAGO, 100)).toMatchObject({ ok: false, reason: "disabled" });
    expect((await sql(`select count(*)::int n from public.tutor_tts_usage`))[0].n).toBe(0);
  });

  it("leitura da voz: a fala traz o estado com que foi escrita (meta.personality), não o humor atual; frase fixa sem estado; sem requires_pro/is_pro/used_chars", async () => {
    const sid = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, emotion) values ($1, 'livre', 'x', 'durona', 3, $2) returning id`,
      [PAGO, JSON.stringify({ mood: "neutral", frustration: 0 })]))[0].id;
    const escrito = { id: "durona", mood: "irritated", frustration: 55, language_intensity: 3, profanity: "moderate" };
    const mid = (await sql(`insert into public.tutor_messages (session_id, user_id, role, content, meta) values ($1, $2, 'tutor', 'Errou de novo.', $3) returning id`,
      [sid, PAGO, JSON.stringify({ personality: escrito })]))[0].id;
    const fala = await worker("ch_worker_tutor_speech", PAGO, sid, "message", mid, null);
    expect(fala).toMatchObject({ found: true, consent_pending: false, session_id: sid, direction: escrito, text: "Errou de novo." });
    expect(fala.quota).toMatchObject({ mode: "paid", limit_today: 4500 });
    for (const k of ["is_pro", "used_chars"]) expect(fala, k).not.toHaveProperty(k);
    expect(fala.config).not.toHaveProperty("requires_pro");
    const frase = await worker("ch_worker_tutor_speech", PAGO, null, "phrase", null, "durona");
    expect(frase).toMatchObject({ found: true, direction: null });
    expect(frase.quota).toMatchObject({ mode: "paid" });
  });

  it("funções novas só do servidor; tutor_tts_usage sem leitura pelo navegador", async () => {
    await reserve(PAGO, 100);
    for (const uid of [PAGO, ADMIN, null]) {
      expect(await as(uid, (q) => q(`select * from public.tutor_tts_usage`)).catch(() => [])).toEqual([]);
      for (const call of [
        `select public.ch_worker_tutor_tts_quota('${PAGO}')`,
        `select public.ch_worker_tutor_tts_reserve('${PAGO}', null, 10)`,
        `select public.ch_worker_tutor_tts_settle('${PAGO}', 1, true, '{}'::jsonb)`,
        `select public.tutor_tts_quota('${PAGO}')`,
      ]) {
        await expect(as(uid, (q) => q(call)), call).rejects.toThrow(/permission denied/);
      }
    }
  });
});
