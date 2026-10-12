// @vitest-environment node
/**
 * A08 (decisão do dono, 11/10/2026, revisada): o aluno só ganha o XP de concluir a aula se ASSISTIU ATÉ O FIM (o player avisou o
 * fim). Concluir continua marcando a aula como feita. Nada é retroativo. Banco (migração …9711) num Postgres real em memória.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-00000000000a";
const BIA = "00000000-0000-4000-8000-00000000000b";
const CAIO = "00000000-0000-4000-8000-00000000000c";
const VELHA = "00000000-0000-4000-8000-00000000000d"; // concluiu antes desta regra
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
let db: PGlite;
let n = 0;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
const aula = async (published = true) =>
  (await rpc<any>(ADMIN, "app_admin_save_lesson", { p_lesson: JSON.stringify({ area: "PEDIATRIA", topic: "Sepse", title: `Aula ${++n}`, published, review_note: "Conferido com a diretriz.", video_url: "https://youtu.be/abc123" }) })).id as string;
const eventos = async (uid: string, lesson?: string) =>
  (await db.query<any>(`select source_id, xp_awarded from public.gamification_events where user_id = $1 and event_type = 'LESSON_COMPLETED' ${lesson ? "and source_id = $2" : ""} order by id`, lesson ? [uid, lesson] : [uid])).rows;
const xpTotal = async (uid: string) => (await db.query<any>(`select total_xp from public.user_gamification_stats where user_id = $1`, [uid])).rows[0]?.total_xp ?? 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@t.dev'), ($2, 'bia@t.dev'), ($3, 'caio@t.dev'), ($4, 'velha@t.dev'), ($5, 'ed@t.dev'), ($6, 'adm@t.dev')`, [ANA, BIA, CAIO, VELHA, EDITOR, ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 300_000);

describe("A08: XP da conclusão só com a aula assistida até o fim", () => {
  it("concluir sem assistir marca a aula como feita, mas NÃO dá XP (nem mandando segundos enormes)", async () => {
    const id = await aula();
    const p = await rpc(ANA, "app_lesson_progress", { p_id: id, p_seconds: 86400, p_completed: true });
    expect(p.completed_at).toBeTruthy();
    expect(p.xp).toBeNull();
    expect(await eventos(ANA, id)).toEqual([]);
    expect(await xpTotal(ANA)).toBe(0);
    expect((await rpc(ANA, "app_lessons")).completed).toBe(1); // continua contando como concluída
  });

  it("depois de concluída, assistir até o fim traz o XP uma vez só (a resposta já diz quanto)", async () => {
    const id = await aula();
    await rpc(BIA, "app_lesson_progress", { p_id: id, p_completed: true });
    const meio = await rpc(BIA, "app_lesson_watch", { p_id: id, p_seconds: 600 });
    expect(meio).toMatchObject({ seconds_watched: 600, watched_to_end_at: null, xp: null });
    expect(await eventos(BIA, id)).toEqual([]);
    const fim = await rpc(BIA, "app_lesson_watch", { p_id: id, p_seconds: 1800, p_ended: true });
    expect(fim.watched_to_end_at).toBeTruthy();
    expect(fim.xp).toBe(20);
    expect(await eventos(BIA, id)).toEqual([{ source_id: id, xp_awarded: 20 }]);
    expect(await xpTotal(BIA)).toBe(20);
    const de_novo = await rpc(BIA, "app_lesson_watch", { p_id: id, p_seconds: 1800, p_ended: true });
    expect(de_novo.xp).toBeNull();
    await rpc(BIA, "app_lesson_progress", { p_id: id, p_completed: true });
    expect(await eventos(BIA, id)).toHaveLength(1);
    expect(await xpTotal(BIA)).toBe(20);
  });

  it("assistir até o fim primeiro e concluir depois: o XP vem ao concluir", async () => {
    const id = await aula();
    const fim = await rpc(CAIO, "app_lesson_watch", { p_id: id, p_seconds: 900, p_ended: true });
    expect(fim).toMatchObject({ completed_at: null, xp: null });
    expect(await eventos(CAIO, id)).toEqual([]);
    const p = await rpc(CAIO, "app_lesson_progress", { p_id: id, p_completed: true });
    expect(p.xp).toBe(20);
    expect(await xpTotal(CAIO)).toBe(20);
  });

  it("o progresso só cresce e o fim, uma vez medido, não se desfaz", async () => {
    const id = await aula();
    await rpc(ANA, "app_lesson_watch", { p_id: id, p_seconds: 300 });
    let s = await rpc(ANA, "app_lesson_watch", { p_id: id, p_seconds: 100 });
    expect(s.seconds_watched).toBe(300);
    s = await rpc(ANA, "app_lesson_watch", { p_id: id, p_ended: true });
    const quando = s.watched_to_end_at;
    expect(quando).toBeTruthy();
    s = await rpc(ANA, "app_lesson_watch", { p_id: id, p_seconds: 10, p_ended: false });
    expect(s).toMatchObject({ seconds_watched: 300, watched_to_end_at: quando });
    expect((await rpc(ANA, "app_lesson_watch_state", { p_id: id }))).toMatchObject({ seconds_watched: 300, watched_to_end_at: quando, completed_at: null });
  });

  it("nada é retroativo: quem já concluiu e ganhou XP antes não perde nada, e assistir depois não paga de novo", async () => {
    const id = await aula();
    // estado de antes desta regra: concluída (sem o fim medido) e o XP já ganho
    await db.query(`insert into public.lesson_progress (user_id, lesson_id, seconds_watched, completed_at) values ($1, $2, 120, '2026-10-01T10:00:00Z')`, [VELHA, id]);
    await db.query(`select public.gam_ensure($1)`, [VELHA]);
    await db.query(`select public.gam_award($1, 'LESSON_COMPLETED', 'lesson', $2, 20, 0, '{}'::jsonb)`, [VELHA, id]);
    expect(await xpTotal(VELHA)).toBe(20);
    // colar a migração de novo (idempotente) não mexe no que já existe
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003009711_aulas_xp_ate_o_fim.sql"), "utf8"));
    const antes = (await db.query<any>(`select seconds_watched, completed_at from public.lesson_progress where user_id = $1`, [VELHA])).rows[0];
    expect(antes.seconds_watched).toBe(120);
    expect(new Date(antes.completed_at).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect((await rpc(VELHA, "app_lessons")).completed).toBeGreaterThanOrEqual(1);
    await rpc(VELHA, "app_lesson_watch", { p_id: id, p_seconds: 1800, p_ended: true });
    expect(await eventos(VELHA, id)).toEqual([{ source_id: id, xp_awarded: 20 }]);
    expect(await xpTotal(VELHA)).toBe(20);
  });

  it("com a Arena desligada não dá XP, mas a conclusão e o fim ficam guardados", async () => {
    const id = await aula();
    const flag = (await db.query<any>(`select value from public.gamification_rules where key = 'flags.gamification_enabled'`)).rows[0];
    await db.query(`update public.gamification_rules set value = 'false'::jsonb where key = 'flags.gamification_enabled'`);
    try {
      await rpc(ANA, "app_lesson_progress", { p_id: id, p_completed: true });
      const s = await rpc(ANA, "app_lesson_watch", { p_id: id, p_seconds: 5, p_ended: true });
      expect(s).toMatchObject({ xp: null });
      expect(s.watched_to_end_at).toBeTruthy();
      expect(await eventos(ANA, id)).toEqual([]);
    } finally {
      await db.query(`update public.gamification_rules set value = $1::jsonb where key = 'flags.gamification_enabled'`, [JSON.stringify(flag.value)]);
    }
  });
});

describe("A08: permissões", () => {
  it("visitante barrado; aula em rascunho ou inexistente não registra; aluno, editor e administrador podem registrar o próprio progresso", async () => {
    const id = await aula();
    const rascunho = await aula(false);
    await expect(rpc(null, "app_lesson_watch", { p_id: id, p_ended: true })).rejects.toThrow();
    await expect(rpc(null, "app_lesson_watch_state", { p_id: id })).rejects.toThrow();
    await expect(rpc(ANA, "app_lesson_watch", { p_id: rascunho, p_ended: true })).rejects.toThrow(/Aula não encontrada/);
    await expect(rpc(ANA, "app_lesson_watch", { p_id: "00000000-0000-4000-8000-000000000999", p_ended: true })).rejects.toThrow(/Aula não encontrada/);
    for (const uid of [ANA, EDITOR, ADMIN]) expect((await rpc(uid, "app_lesson_watch", { p_id: id, p_seconds: 5 })).seconds_watched).toBe(5);
    // um aluno nunca escreve no progresso de outro: cada um mexe só na própria linha
    expect((await db.query<any>(`select count(*)::int n from public.lesson_progress where lesson_id = $1`, [id])).rows[0].n).toBe(3);
    // e a tabela continua sem escrita direta
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA })]);
      await tx.query(`update public.lesson_progress set watched_to_end_at = now() where user_id = $1`, [ANA]);
      const r = await tx.query<any>(`select watched_to_end_at from public.lesson_progress where user_id = $1 and lesson_id = $2`, [ANA, id]);
      if (r.rows[0]?.watched_to_end_at) throw new Error("escreveu direto");
    })).resolves.toBeUndefined();
  });

  it("a função do gatilho não é chamável por ninguém de fora", async () => {
    await expect(rpc(ANA, "gam_process_lesson")).rejects.toThrow();
  });
});
