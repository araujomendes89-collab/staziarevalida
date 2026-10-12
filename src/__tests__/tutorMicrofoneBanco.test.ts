// @vitest-environment node
/**
 * CF02 + VZ03 (Fase 1 objetiva, 2026-10-12) no banco (supabase/migrations/…9891_microfone_transcricao_estrutura.sql):
 *  - o microfone da Nexus nasce SÓ PARA A EQUIPE e os três tetos diários da transcrição nascem VAZIOS (os números são do dono);
 *  - o banco só deixa abrir o microfone aos alunos com os três tetos e o preço da transcrição preenchidos;
 *  - o banco só deixa liberar a voz do professor aos alunos com o preço da voz preenchido (só na hora de liberar);
 *  - ch_worker_tutor_stt_today soma os segundos de transcrição do dia de Brasília (pessoa e plataforma).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const ALUNO = id(3);
const OUTRO = id(4);
const TODOS = { ADMIN, EDITOR, ALUNO, OUTRO };
const MOTIVO = "Teste do microfone do Tutor";

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      })
    );
    return r.rows[0].result;
  });
}
const salvar = (config: Record<string, unknown>, uid: string | null = ADMIN) => rpc(uid, "app_admin_tutor_save_config", { p_config: config, p_reason: MOTIVO });
const config = async () => (await db.query<any>(`select * from public.tutor_config`)).rows[0];
const settings = async () => (await db.query<{ s: any }>(`select public.ch_worker_tutor_settings() as s`)).rows[0].s;
const podeChamar = async (fn: string) =>
  (await db.query<{ anon: boolean; authenticated: boolean }>(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') authenticated`, [fn])).rows[0];
const TETOS = { stt_trial_daily_seconds: "300", stt_paid_daily_seconds: "1800", stt_account_daily_seconds: "36000", stt_price_per_min_usd: "0.003" };
const registrarFala = (uid: string, seconds: number, day = "(now() at time zone 'America/Sao_Paulo')::date") =>
  db.query(`insert into public.ai_usage_ledger (user_id, feature, provider, model, duration_seconds, day) values ($1, 'tutor_stt', 'openai', 'x', $2, ${day})`, [uid, seconds]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [name, uid] of Object.entries(TODOS)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${name.toLowerCase()}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 120_000);

describe("CF02 — padrão: microfone só da equipe, tetos vazios", () => {
  it("a chave nasce ligada e os três tetos nascem sem valor", async () => {
    const c = await config();
    expect(c.stt_team_only).toBe(true);
    expect([c.stt_trial_daily_seconds, c.stt_paid_daily_seconds, c.stt_account_daily_seconds]).toEqual([null, null, null]);
    expect(await settings()).toMatchObject({ stt_team_only: true, stt_trial_daily_seconds: null, stt_paid_daily_seconds: null, stt_account_daily_seconds: null });
  });

  it("o painel (app_admin_tutor_config) devolve os campos novos", async () => {
    expect(await rpc(ADMIN, "app_admin_tutor_config")).toMatchObject({ stt_team_only: true, stt_trial_daily_seconds: null, stt_paid_daily_seconds: null, stt_account_daily_seconds: null });
  });

  it("só o administrador salva; visitante, aluno e editor são recusados", async () => {
    await expect(salvar({ stt_team_only: true }, null)).rejects.toThrow(/permission denied/);
    for (const uid of [ALUNO, EDITOR]) await expect(salvar({ stt_team_only: true }, uid), uid).rejects.toThrow("Acesso restrito a administradores.");
  });
});

describe("CF02 — abrir o microfone aos alunos", () => {
  it("é recusado sem os tetos e o preço, e a recusa não grava nada", async () => {
    await expect(salvar({ stt_team_only: false })).rejects.toThrow(/preencha antes o teto diário de transcrição/);
    expect((await config()).stt_team_only).toBe(true);
    // só um ou dois tetos não bastam
    await expect(salvar({ stt_team_only: false, stt_trial_daily_seconds: "300", stt_paid_daily_seconds: "1800", stt_price_per_min_usd: "0.003" })).rejects.toThrow(/preencha antes/);
    await expect(salvar({ stt_team_only: false, stt_trial_daily_seconds: "300", stt_paid_daily_seconds: "1800", stt_account_daily_seconds: "36000" })).rejects.toThrow(/preço da transcrição/);
    const c = await config();
    expect(c.stt_team_only).toBe(true);
    expect([c.stt_trial_daily_seconds, c.stt_paid_daily_seconds, c.stt_account_daily_seconds]).toEqual([null, null, null]);
  });

  it("preencher os tetos e o preço sem abrir o microfone é permitido", async () => {
    await salvar(TETOS);
    const c = await config();
    expect(c).toMatchObject({ stt_team_only: true, stt_trial_daily_seconds: 300, stt_paid_daily_seconds: 1800, stt_account_daily_seconds: 36000 });
    expect(Number(c.stt_price_per_min_usd)).toBe(0.003);
  });

  it("com tudo preenchido, o administrador abre o microfone; depois não dá para esvaziar um teto", async () => {
    await salvar({ stt_team_only: false });
    expect((await config()).stt_team_only).toBe(false);
    expect(await settings()).toMatchObject({ stt_team_only: false, stt_trial_daily_seconds: 300 });
    await expect(salvar({ stt_paid_daily_seconds: "" })).rejects.toThrow(/preencha antes o teto diário/);
    expect((await config()).stt_paid_daily_seconds).toBe(1800);
    await expect(salvar({ stt_price_per_min_usd: "0" })).rejects.toThrow(/preço da transcrição/);
  });

  it("fechar o microfone de novo é sempre permitido, mesmo esvaziando os tetos", async () => {
    await salvar({ stt_team_only: true, stt_trial_daily_seconds: "", stt_paid_daily_seconds: "", stt_account_daily_seconds: "" });
    const c = await config();
    expect(c.stt_team_only).toBe(true);
    expect([c.stt_trial_daily_seconds, c.stt_paid_daily_seconds, c.stt_account_daily_seconds]).toEqual([null, null, null]);
  });

  it("salvar outras coisas do Tutor não mexe nos tetos (chave ausente = mantém)", async () => {
    await salvar(TETOS);
    await salvar({ inside_jokes: false });
    expect(await config()).toMatchObject({ inside_jokes: false, stt_trial_daily_seconds: 300, stt_paid_daily_seconds: 1800, stt_account_daily_seconds: 36000 });
    await salvar({ inside_jokes: true, stt_trial_daily_seconds: "", stt_paid_daily_seconds: "", stt_account_daily_seconds: "" });
  });

  it("valida os tetos: 1 a 86400 segundos; texto e zero são recusados", async () => {
    for (const ruim of ["0", "-5", "abc", "90000", "1.5"]) {
      await expect(salvar({ stt_trial_daily_seconds: ruim }), ruim).rejects.toThrow(/Teto diário da transcrição/);
    }
    await expect(salvar({ stt_team_only: "talvez" })).rejects.toThrow(/Microfone só para a equipe/);
    await salvar({ stt_trial_daily_seconds: "86400" });
    expect((await config()).stt_trial_daily_seconds).toBe(86400);
    await salvar({ stt_trial_daily_seconds: "" });
  });

  it("a mudança fica no Registro", async () => {
    const r = await db.query<any>(`select details from public.admin_audit_log where action = 'tutor.config' order by id desc limit 1`);
    expect(r.rows[0].details.reason).toBe(MOTIVO);
  });
});

describe("VZ03 — liberar a voz do professor aos alunos exige o preço da voz", () => {
  it("ligado→desligado com preço zero é recusado; com preço, passa; quem já estava liberado não fica preso", async () => {
    await db.exec(`update public.tutor_config set tts_team_only = true, tts_price_per_1k_chars_usd = 0`);
    await expect(salvar({ tts_team_only: false })).rejects.toThrow(/preencha antes o preço da voz/);
    expect((await config()).tts_team_only).toBe(true);
    await salvar({ tts_team_only: false, tts_price_per_1k_chars_usd: "0.3" });
    expect((await config()).tts_team_only).toBe(false);
    // preço zerado depois da liberação: o salvar de outra coisa não é barrado
    await db.exec(`update public.tutor_config set tts_price_per_1k_chars_usd = 0`);
    await salvar({ inside_jokes: true });
    await salvar({ tts_team_only: false });
    // estado antigo (já liberado e sem preço): continua salvando
    expect((await config()).tts_team_only).toBe(false);
    await salvar({ tts_team_only: true });
  });
});

describe("CF02 — ch_worker_tutor_stt_today", () => {
  it("soma só a transcrição do dia de Brasília; a pessoa e a plataforma separadas", async () => {
    await registrarFala(ALUNO, 20);
    await registrarFala(ALUNO, 15);
    await registrarFala(OUTRO, 40);
    await registrarFala(ALUNO, 500, "(now() at time zone 'America/Sao_Paulo')::date - 1");
    await db.query(`insert into public.ai_usage_ledger (user_id, feature, provider, model, duration_seconds) values ($1, 'tutor_tts', 'x', 'x', 999)`, [ALUNO]);
    const hoje = async (uid: string) => (await db.query<{ r: any }>(`select public.ch_worker_tutor_stt_today($1) as r`, [uid])).rows[0].r;
    expect(await hoje(ALUNO)).toEqual({ user_seconds: 35, account_seconds: 75 });
    expect(await hoje(OUTRO)).toEqual({ user_seconds: 40, account_seconds: 75 });
    expect(await hoje(EDITOR)).toEqual({ user_seconds: 0, account_seconds: 75 });
  });

  it("não é chamável por visitante nem por quem está logado (só o servidor)", async () => {
    expect(await podeChamar("public.ch_worker_tutor_stt_today(uuid)")).toEqual({ anon: false, authenticated: false });
    expect(await podeChamar("public.ch_worker_tutor_settings()")).toEqual({ anon: false, authenticated: false });
  });
});
