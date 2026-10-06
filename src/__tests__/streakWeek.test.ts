// @vitest-environment node
/**
 * Semana da sequência para a animação de conquista (supabase/migrations/…4800_semana_da_sequencia.sql): segunda a domingo no
 * fuso do aluno, com estudou, protegido, hoje, perdido e por vir, lidos só dos eventos do próprio aluno.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const CARLA = "00000000-0000-4000-8000-00000000000c";
let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<{ r: T }>(`select public.${fn}() as r`)).rows[0].r;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@t.dev'), ($2, 'bruno@t.dev'), ($3, 'carla@t.dev')`, [ANA, BRUNO, CARLA]);
}, 120_000);

describe("Semana da sequência", () => {
  it("segunda a domingo, com o que houve em cada dia; o que é do outro aluno não entra", async () => {
    const { rows } = await db.query<{ today: string; monday: string }>(`select public.gam_today($1)::text as today, public.gam_week_start(public.gam_today($1))::text as monday`, [ANA]);
    const { today, monday } = rows[0];
    const day = (offset: number) => {
      const d = new Date(`${monday}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    // Ana: estudou hoje; se hoje não for segunda, estudou na segunda também e usou proteção no dia seguinte
    const award = (uid: string, type: string, date: string) =>
      db.query(`select public.gam_award($1, $2, 'day', $3, 0, 0)`, [uid, type, date]);
    await award(ANA, "STREAK_INCREMENTED", today);
    if (today !== monday) await award(ANA, "STREAK_INCREMENTED", monday);
    if (day(1) < today) await award(ANA, "STREAK_FREEZE_USED", day(1));
    await award(BRUNO, "STREAK_INCREMENTED", day(2) <= today ? day(2) : today);

    const w = await rpc<any>(ANA, "app_play_streak_week");
    expect(w.today).toBe(today);
    expect(w.days.map((d: any) => d.date)).toEqual([0, 1, 2, 3, 4, 5, 6].map(day));
    for (const d of w.days) {
      const expected =
        d.date === today || d.date === monday ? "done"
          : d.date === day(1) && day(1) < today ? "frozen"
            : d.date > today ? "future"
              : "missed";
      expect({ date: d.date, state: d.state }).toEqual({ date: d.date, state: expected });
    }
  });

  it("sem conta não abre; aluno sem nada na semana vê só hoje e o resto", async () => {
    await expect(rpc(null, "app_play_streak_week")).rejects.toThrow(/permission|permissão|Entre/i);
    const w = await rpc<any>(CARLA, "app_play_streak_week");
    expect(w.streak).toBe(0);
    expect(w.days).toHaveLength(7);
    expect(w.days.filter((d: any) => d.state === "today")).toEqual([{ date: w.today, state: "today" }]);
    expect(w.days.every((d: any) => (d.date < w.today ? d.state === "missed" : d.date > w.today ? d.state === "future" : true))).toBe(true);
  });
});
