// @vitest-environment node
/**
 * Migração dos três professores (20261003005500): o Acolhedor vira Tranquilo (jeito do Professor Preguiçoso), Durona e
 * Direto continuam, os outros perfis ficam desligados. As conversas antigas do Acolhedor e dos perfis desligados ficam
 * marcadas (legacy_persona) com o nome e o emoji originais, gravados ANTES da troca, para nunca trocarem de professor.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations");
const TRES = "20261003005500_tutor_tres_professores.sql";
const ANA = "00000000-0000-4000-8000-00000000a001";
const BIA = "00000000-0000-4000-8000-00000000a002";
const CAIO = "00000000-0000-4000-8000-00000000a003";
let db: PGlite;
const before: Record<string, { name: string; emoji: string; style_notes: unknown }> = {};
const sessions: Record<string, string> = {};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith(".sql") && f < "20261003005500").sort()) {
    await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@t.dev'), ($2, 'bia@t.dev'), ($3, 'caio@t.dev')`, [ANA, BIA, CAIO]);
  for (const id of ["acolhedor", "preguicoso"]) {
    const { rows } = await db.query<any>(`select name, emoji, style_notes from public.tutor_personalities where id = $1`, [id]);
    before[id] = rows[0];
  }
  for (const p of ["acolhedor", "preguicoso", "durona", "direto"]) {
    const { rows } = await db.query<any>(
      `insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'x', $2, 3) returning id`,
      [ANA, p],
    );
    sessions[p] = rows[0].id;
  }
  await db.query(
    `insert into public.tutor_preferences (user_id, personality_id, profanity) values ($1, 'preguicoso', 'mild'), ($2, 'durona', 'moderate'), ($3, 'direto', 'mild')`,
    [ANA, BIA, CAIO],
  );
  await db.exec(fs.readFileSync(path.join(MIG, TRES), "utf8"));
}, 180_000);

const legacyOf = async (p: string) =>
  (await db.query<any>(`select legacy_persona from public.tutor_sessions where id = $1`, [sessions[p]])).rows[0].legacy_persona;

describe("Três professores (migração 5500)", () => {
  it("conversas antigas do Acolhedor e dos perfis desligados ficam marcadas com o nome e o emoji originais; Durona e Direto não", async () => {
    expect(await legacyOf("acolhedor")).toEqual({ name: "Acolhedor", emoji: before.acolhedor.emoji });
    expect(await legacyOf("preguicoso")).toEqual({ name: before.preguicoso.name, emoji: before.preguicoso.emoji });
    expect(await legacyOf("durona")).toBeNull();
    expect(await legacyOf("direto")).toBeNull();
  });

  it("Tranquilo (id acolhedor) com o jeito do Preguiçoso; ordem Tranquilo, Durona, Direto; os outros desligados", async () => {
    const { rows } = await db.query<any>(`select id, name, emoji, style_notes, position, active from public.tutor_personalities order by id`);
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));
    expect(byId.acolhedor).toMatchObject({ name: "Tranquilo", emoji: "😌", position: 1, active: true });
    expect(byId.acolhedor.style_notes).toEqual(before.preguicoso.style_notes);
    expect(byId.durona).toMatchObject({ position: 2, active: true });
    expect(byId.direto).toMatchObject({ position: 3, active: true });
    expect(rows.filter((r: any) => r.active).map((r: any) => r.id).sort()).toEqual(["acolhedor", "direto", "durona"]);
  });

  it("preferência num perfil desligado passa para o Tranquilo sem palavrão; Durona e Direto ficam como estavam", async () => {
    const { rows } = await db.query<any>(`select user_id, personality_id, profanity from public.tutor_preferences order by user_id`);
    expect(rows).toEqual([
      { user_id: ANA, personality_id: "acolhedor", profanity: "off" },
      { user_id: BIA, personality_id: "durona", profanity: "moderate" },
      { user_id: CAIO, personality_id: "direto", profanity: "mild" },
    ]);
  });

  it("conversa nova do Tranquilo, depois da migração, nasce sem a marca", async () => {
    const { rows } = await db.query<any>(
      `insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'nova', 'acolhedor', 3) returning legacy_persona`,
      [ANA],
    );
    expect(rows[0].legacy_persona).toBeNull();
  });
});
