// @vitest-environment node
/**
 * Administração (configurações, visão geral, estações) no banco simulado (PGlite com todas as migrações).
 * CF07: as configurações internas (app_settings, tutor_config) só a equipe lê direto; o aluno continua recebendo o aviso
 *       ativo (app_announcement) e a situação do Tutor (app_tutor_status) pelas funções.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const ANA = "00000000-0000-4000-8000-00000000000a";

let db: PGlite;

async function as<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(uid ? `set local role authenticated` : `set local role anon`);
    if (uid) await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const rpc = async (uid: string, fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  const r = await as<{ result: any }>(uid, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
  return r[0].result;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [
    [ADMIN, "master@teste.dev", "Master"],
    [EDITOR, "editor@teste.dev", "Editora"],
    [ANA, "ana@teste.dev", "Ana Lima"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 60_000);

describe("CF07: configurações internas só para a equipe", () => {
  it("o aluno não lê as tabelas de configuração direto (rascunho do aviso, preços, limites)", async () => {
    expect(await as(ANA, `select key from public.app_settings`)).toEqual([]);
    expect(await as(ANA, `select id from public.tutor_config`)).toEqual([]);
  });

  it("a equipe (editor e administrador) continua lendo", async () => {
    for (const uid of [ADMIN, EDITOR]) {
      expect((await as<{ key: string }>(uid, `select key from public.app_settings`)).map((r) => r.key).sort()).toEqual(["announcement", "creditos", "simulado_ineditas_pct", "treino_dupla", "treino_dupla_chat", "trial_days"]); // chaves do Treino em Dupla (013300), do chat (013370) e dos créditos (013490)
      expect(await as(uid, `select id from public.tutor_config`)).toHaveLength(1);
    }
  });

  it("o aluno continua recebendo o aviso ativo, mas não o rascunho", async () => {
    expect(await rpc(ANA, "app_announcement")).toBeNull();
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: false, tone: "info", title: "Rascunho interno", text: "Ainda não publicar" } } });
    expect(await rpc(ANA, "app_announcement")).toBeNull();
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: "Manutenção", text: "Sábado às 8h" } } });
    expect(await rpc(ANA, "app_announcement")).toEqual({ tone: "info", title: "Manutenção", text: "Sábado às 8h" });
  });

  it("o visitante (sem login) não executa o aviso", async () => {
    await expect(as(null, `select public.app_announcement()`)).rejects.toThrow(/permission denied/i);
  });

  it("o aluno segue vendo a situação do Tutor pela função", async () => {
    const status = await rpc(ANA, "app_tutor_status");
    expect(status).toHaveProperty("entitlement");
    expect(status).not.toHaveProperty("tts_price_per_1k_chars_usd");
  });
});

// ---------------------------------------------------------------- Visão geral (GE01, GE03, GE04, GE05)
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const CARLA = "00000000-0000-4000-8000-00000000000c";
const DAVI = "00000000-0000-4000-8000-00000000000d";

describe("Visão geral (GE01 a GE05)", () => {
  beforeAll(async () => {
    for (const [id, email, name] of [
      [BRUNO, "bruno@teste.dev", "Bruno"],
      [CARLA, "carla@teste.dev", "Carla"],
      [DAVI, "davi@teste.dev", "Davi"],
    ]) {
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
    }
    // Ana: teste em andamento. Bruno: teste que já acabou há 3 dias, ainda marcado "em teste". Carla: Pro ativa. Davi: Elite com pagamento pendente.
    await db.query(`update public.subscriptions set trial_ends_at = now() - interval '3 days' where user_id = $1`, [BRUNO]);
    await db.query(`update public.subscriptions set plan = 'pro', status = 'active', trial_ends_at = null where user_id = $1`, [CARLA]);
    await db.query(`update public.subscriptions set plan = 'elite', status = 'past_due', trial_ends_at = null where user_id = $1`, [DAVI]);
  });

  it("GE01: 'Em teste' conta só quem ainda está dentro dos dias; o teste vencido aparece como expirado", async () => {
    const o = await rpc(ADMIN, "app_admin_overview");
    expect(o.users.by_plan["trial:trialing"]).toBe(1);
    expect(o.users.by_plan["trial:expired"]).toBe(1);
    expect(o.users.by_plan["pro:active"]).toBe(1);
    expect(o.users.by_plan["elite:past_due"]).toBe(1);
  });

  it("GE03: o editor não recebe os números de usuários e planos (mas vê o gasto de IA); o administrador recebe tudo", async () => {
    const editor = await rpc(EDITOR, "app_admin_overview");
    expect(editor).not.toHaveProperty("users");
    expect(editor.ai_month).toHaveProperty("central_usd"); // gasto de IA: administrador e editor (decisão do dono)
    expect(editor.questions).toBeTruthy();
    expect(editor.stations).toBeTruthy();
    const admin = await rpc(ADMIN, "app_admin_overview");
    expect(admin.users.total).toBeGreaterThan(0);
    expect(admin.ai_month).toHaveProperty("central_usd");
  });

  it("GE04: 'Ativos' conta quem viu aula ou conversou com o Nexus, e não conta a equipe", async () => {
    const before = (await rpc(ADMIN, "app_admin_overview")).users.active_7d;
    const lesson = (await db.query<{ id: string }>(
      `insert into public.lessons (area, topic, title) select (enum_range(null::public.med_area))[1], 'Tema', 'Aula' returning id`,
    )).rows[0].id;
    await db.query(`insert into public.lesson_progress (user_id, lesson_id, seconds_watched) values ($1, $2, 60)`, [ANA, lesson]);
    expect((await rpc(ADMIN, "app_admin_overview")).users.active_7d).toBe(before + 1);
    // conversa com o Nexus
    const session = (await db.query<{ id: string }>(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'Conversa', 'amigavel', 2) returning id`, [BRUNO])).rows[0].id;
    await db.query(`insert into public.tutor_messages (session_id, user_id, role, content) values ($1, $2, 'student', 'oi')`, [session, BRUNO]);
    expect((await rpc(ADMIN, "app_admin_overview")).users.active_7d).toBe(before + 2);
    // a equipe vendo aula não entra na conta
    await db.query(`insert into public.lesson_progress (user_id, lesson_id, seconds_watched) values ($1, $2, 60)`, [EDITOR, lesson]);
    expect((await rpc(ADMIN, "app_admin_overview")).users.active_7d).toBe(before + 2);
  });

  it("GE05: mostra o que espera revisão por aba e o gasto de IA do mês", async () => {
    await db.query(`insert into public.podcasts (title, status) values ('Podcast de teste', 'script_ready')`);
    await db.query(`insert into public.ai_calls (function_key, mode, role, provider, model, cost_usd, outcome) values ('teste', 'sozinha', 'principal', 'openai', 'm', 1.25, 'ok')`);
    await db.query(`insert into public.ai_calls (function_key, mode, role, provider, model, cost_usd, outcome, created_at) values ('teste', 'sozinha', 'principal', 'openai', 'm', 9, 'ok', now() - interval '60 days')`);
    const o = await rpc(ADMIN, "app_admin_overview");
    const updates = Number((await db.query<{ n: number }>(`select count(*)::int n from public.guideline_updates where review_status = 'pending'`)).rows[0].n);
    expect(o.pending_review).toMatchObject({ podcasts: 1, lessons_draft: 1, updates, stations: o.stations.pending });
    expect(o.pending_review.content).toBe(0); // exige o número: se a contagem da Central de Conteúdo falhar, some e o teste acusa
    expect(Number(o.ai_month.central_usd)).toBeCloseTo(1.25, 4);
    // roteiro de podcast e assistente da aula gravam no ledger, mas já entram em ai_calls: não são Nexus
    await db.query(`insert into public.ai_usage_ledger (user_id, feature, estimated_cost_usd) values ($1, 'podcast_script', 0.40), ($1, 'lesson_assist', 0.10)`, [ADMIN]);
    expect(Number((await rpc(ADMIN, "app_admin_overview")).ai_month.tutor_usd)).toBe(0);
    await db.query(`insert into public.ai_usage_ledger (user_id, feature, estimated_cost_usd) values ($1, 'tutor_tts', 0.30), ($1, 'tutor_voice_live', 0.20)`, [ANA]);
    expect(Number((await rpc(ADMIN, "app_admin_overview")).ai_month.tutor_usd)).toBeCloseTo(0.5, 4);
    const editor = await rpc(EDITOR, "app_admin_overview");
    expect(editor.pending_review.podcasts).toBe(1);
    expect(Number(editor.ai_month.central_usd)).toBeCloseTo(1.25, 4);
    expect(await rpc(ANA, "app_admin_overview").catch((e) => e.message)).toMatch(/restrito|acesso/i); // aluno nunca
  });
});
