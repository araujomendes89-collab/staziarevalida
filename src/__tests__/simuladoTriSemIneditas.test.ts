// @vitest-environment node
/**
 * Simulado TRI só com questões oficiais — migração …010400_tri_sem_ineditas.sql, num Postgres real em memória (PGlite) com todas
 * as migrações. A Questão Inédita StaziaMed (origin 'staziamed') não é do Inep e não tem calibração oficial: não entra na matriz
 * de calibração, não grava dificuldade e não entra na nota TRI de um simulado. Com só oficiais, o resultado é idêntico ao de antes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-0000000008a1"; // simulado com 30 oficiais + 1 inédita
const BIA = "00000000-0000-4000-8000-0000000008b1"; // simulado só com as mesmas 30 oficiais
const INEDITA = "staziamed_q9001";
const OFICIAIS = Array.from({ length: 30 }, (_, i) => `o-${i + 1}`);
const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));

let db: PGlite;
const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const asService = async <T = any>(q: string, p: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
    return (await tx.query<T>(q, p)).rows;
  });

/** Sessão de simulado TRI finalizada: o aluno acerta (B) as 20 primeiras oficiais e erra (A) as outras; na inédita acerta. */
async function sessao(uid: string, comInedita: boolean): Promise<string> {
  const qids = comInedita ? [...OFICIAIS.slice(0, 15), INEDITA, ...OFICIAIS.slice(15)] : OFICIAIS;
  const [{ id }] = await sql(
    `insert into public.practice_sessions (user_id, kind, question_ids, config, started_at, finished_at)
     values ($1, 'simulado', $2, '{"scoring":"irt","scoring_version":1}'::jsonb, now() - interval '2 hours', now() - interval '1 hour') returning id`,
    [uid, qids]
  );
  for (const q of qids) {
    const n = q === INEDITA ? 0 : Number(q.split("-")[1]);
    await sql(`insert into public.question_attempts (user_id, question_id, session_id, selected_option, answered_at) values ($1, $2, $3, $4, now() - interval '1 hour')`, [
      uid,
      q,
      id,
      n <= 20 ? "B" : "A",
    ]);
  }
  return id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await sql(`insert into auth.users (id, email) values ($1, 'ana@tri.dev'), ($2, 'bia@tri.dev')`, [ANA, BIA]);
  await sql(`insert into public.exams (id, kind, year, semester, title, question_count) values ('revalida-2025-1', 'REVALIDA', 2025, 1, 'Revalida 2025/1', 30)`);
  for (const [i, id] of OFICIAIS.entries()) {
    await sql(
      `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status)
       values ($1, $1, 'revalida-2025-1', $2, $3, $4, 's', $5, $6, 'B', 'valid')`,
      [id, i + 1, i % 2 ? "PEDIATRIA" : "CLINICA_MEDICA", `Tema ${i % 3}`, `Caso ${i + 1}.`, options]
    );
  }
  await sql(
    `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status, origin, sources)
     values ($1, 'STZ-9001', 'staziamed', 9001, 'PEDIATRIA', 'Tema 0', 's', 'Inédita.', $2, 'B', 'valid', 'staziamed', $3::jsonb)`,
    [INEDITA, options, JSON.stringify([{ title: "PCDT de teste", organ: "Ministério da Saúde (teste)", level: "A", page: 7, link: "https://exemplo.gov.br/pcdt-teste" }])]
  );
}, 180_000);

describe("irt_score_session sem inéditas", () => {
  it("a inédita não entra na conta; o resultado é idêntico ao de uma sessão só com as oficiais", async () => {
    const mista = await sessao(ANA, true);
    const so = await sessao(BIA, false);
    const [a] = await asService(`select public.irt_score_session($1) as r`, [mista]);
    const [b] = await asService(`select public.irt_score_session($1) as r`, [so]);
    const tira = ({ session_id, computed_at, recomputed_at, times_computed, ...resto }: any) => resto;
    expect(a.r.n_items).toBe(30);
    expect(a.r.n_correct).toBe(20);
    expect(tira(a.r)).toEqual(tira(b.r));
    expect(await sql(`select 1 from public.irt_responses where session_id = $1 and question_id = $2`, [mista, INEDITA])).toEqual([]);
    expect((await sql(`select count(*)::int as n from public.irt_responses where session_id = $1`, [mista]))[0].n).toBe(30);
  });

  it("sessão só com inédita não quebra: nada para contar", async () => {
    const [{ id }] = await sql(
      `insert into public.practice_sessions (user_id, kind, question_ids, config, finished_at) values ($1, 'simulado', $2, '{"scoring":"irt"}'::jsonb, now()) returning id`,
      [ANA, [INEDITA]]
    );
    const [r] = await asService(`select public.irt_score_session($1) as r`, [id]);
    expect(r.r.n_items).toBe(0);
  });
});

describe("calibração sem inéditas", () => {
  it("a matriz só traz questões oficiais (e as oficiais seguem todas lá)", async () => {
    const m = await asService<{ question_id: string }>(`select * from public.irt_calibration_matrix()`);
    expect(m.some((r) => r.question_id === INEDITA)).toBe(false);
    expect(new Set(m.map((r) => r.question_id)).size).toBe(30);
    expect(m.length).toBe(60); // Ana e Bia × 30 oficiais
  });

  it("irt_save_calibration ignora o item da inédita e grava o das oficiais; id desconhecido continua recusado", async () => {
    const items = [
      { question_id: INEDITA, b: 0.3, n_resp: 500 },
      { question_id: "o-1", b: -1.2, n_resp: 150 },
    ];
    const [{ r }] = await asService(`select public.irt_save_calibration('jmle', $1::jsonb) as r`, [JSON.stringify(items)]);
    expect(r).toMatchObject({ saved: 1, ignored: 1 });
    expect((await sql(`select question_id from public.irt_item_params where question_id in ($1, 'o-1') order by 1`, [INEDITA])).map((x: any) => x.question_id)).toEqual(["o-1"]);
    await expect(asService(`select public.irt_save_calibration('jmle', '[{"question_id":"nao-existe","b":0,"n_resp":50}]'::jsonb)`)).rejects.toThrow(/desconhecida/i);
  });
});
