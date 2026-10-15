// @vitest-environment node
/**
 * Testes de garantia: O Simulado TRI (e qualquer outro sorteio de simulado:
 * rápido, geral, por área, por tema, por prova anterior oficial) NUNCA sorteia Questões Inéditas
 * (origin = 'staziamed', exam_id = 'staziamed'). Inéditas existem apenas no treino.
 * Executa em banco PostgreSQL real em memória (PGlite) com TODAS as migrações até 20261003010800.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"];
const ALUNO_PRO = "00000000-0000-4000-8000-0000000009a1";

let db: PGlite;

async function as<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(sql, params)).rows;
  });
}

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const rows = await as<{ result: T }>(
    uid,
    `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
    keys.map((k) => args[k])
  );
  return rows[0].result;
}

const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;

const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));
const fontes = JSON.stringify([{ title: "PCDT de teste", organ: "MS", level: "A", page: 1, link: "https://gov.br" }]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }

  // Usuário Pro (tem acesso liberado a simulados e a questões inéditas)
  await sql(`insert into auth.users (id, email) values ($1, 'pro@teste.dev')`, [ALUNO_PRO]);
  await sql(
    `insert into public.subscriptions (user_id, plan, status, current_period_end)
     values ($1, 'pro', 'active', now() + interval '180 days')
     on conflict (user_id) do update set plan = 'pro', status = 'active', current_period_end = now() + interval '180 days'`,
    [ALUNO_PRO]
  );

  // Prova oficial Revalida 2025/1
  await sql(`insert into public.exams (id, kind, year, semester, title, question_count) values ('revalida-2025-1', 'REVALIDA', 2025, 1, 'Revalida 2025/1', 60)`);

  // 60 questões oficiais: 12 em cada uma das 5 áreas
  let numOficial = 0;
  for (const [aIdx, area] of AREAS.entries()) {
    for (let n = 1; n <= 12; n++) {
      numOficial++;
      await sql(
        `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status, origin)
         values ($1, $1, 'revalida-2025-1', $2, $3, $4, 'subtema', $5, $6, 'B', 'valid', 'official')`,
        [`oficial-${numOficial}`, numOficial, area, `Tema ${aIdx}-${n <= 6 ? 'A' : 'B'}`, `Caso oficial ${numOficial}.`, options]
      );
    }
  }

  // 20 questões inéditas StaziaMed (distribuídas nas áreas, incluindo Pediatria e Clínica Médica)
  for (let n = 1; n <= 20; n++) {
    const area = AREAS[n % AREAS.length];
    await sql(
      `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status, origin, sources)
       values ($1, $2, 'staziamed', $3, $4, $5, 'subtema', $6, $7, 'B', 'valid', 'staziamed', $8::jsonb)`,
      [`inedita-${n}`, `STZ-${n}`, 9000 + n, area, `Tema ${n % 5}-A`, `Enunciado inédito ${n}.`, options, fontes]
    );
  }
}, 180_000);

describe("Sorteio de Simulado no Banco de Dados (PostgreSQL / PGlite)", () => {
  it("Simulado Geral (sem filtros de prova): nunca sorteia nenhuma questão inédita", async () => {
    const res = await rpc<{ session_id: string; count: number }>(ALUNO_PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: {},
      p_count: 30,
      p_time_limit_seconds: 3600,
    });

    expect(res.count).toBe(30);

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    // Conferir na tabela questions se alguma questão sorteada é inédita
    const origins = await sql<{ origin: string; count: number }>(
      `select origin, count(*)::int as count from public.questions where id = any($1) group by origin`,
      [qids]
    );

    expect(origins).toEqual([{ origin: "official", count: 30 }]);
    expect(qids.some((id) => id.startsWith("inedita-"))).toBe(false);
  });

  it("Simulado por Área: sorteia apenas oficiais da área, sem inéditas", async () => {
    const res = await rpc<{ session_id: string; count: number }>(ALUNO_PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "PEDIATRIA" },
      p_count: 10,
      p_time_limit_seconds: 1800,
    });

    expect(res.count).toBe(10);

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    const rows = await sql<{ id: string; origin: string; area: string }>(
      `select id, origin, area from public.questions where id = any($1)`,
      [qids]
    );

    expect(rows.length).toBe(10);
    for (const r of rows) {
      expect(r.origin).toBe("official");
      expect(r.area).toBe("PEDIATRIA");
    }
  });

  it("Simulado por Tema: sorteia apenas oficiais do tema, sem inéditas", async () => {
    const res = await rpc<{ session_id: string; count: number }>(ALUNO_PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { topic: "Tema 0-A" },
      p_count: 5,
    });

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    const rows = await sql<{ origin: string }>(
      `select origin from public.questions where id = any($1)`,
      [qids]
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.origin).toBe("official");
    }
  });

  it("Simulado de Prova Anterior Oficial: sorteia apenas oficiais daquela prova", async () => {
    const res = await rpc<{ session_id: string; count: number }>(ALUNO_PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { exam_id: "revalida-2025-1" },
      p_count: 20,
    });

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    const rows = await sql<{ origin: string; exam_id: string }>(
      `select origin, exam_id from public.questions where id = any($1)`,
      [qids]
    );

    expect(rows.length).toBe(20);
    for (const r of rows) {
      expect(r.origin).toBe("official");
      expect(r.exam_id).toBe("revalida-2025-1");
    }
  });

  it("Tentativa de sortear simulado de inéditas: recusada com erro", async () => {
    await expect(
      rpc(ALUNO_PRO, "app_start_session", {
        p_kind: "simulado",
        p_filters: { exam_id: "staziamed" },
        p_count: 20,
      })
    ).rejects.toThrow(/Simulados usam apenas questões oficiais do Inep/);

    // Variações com espaço ou maiúsculas também são recusadas
    await expect(
      rpc(ALUNO_PRO, "app_start_session", {
        p_kind: "simulado",
        p_filters: { exam_id: " STAZIAMED " },
        p_count: 20,
      })
    ).rejects.toThrow(/Simulados usam apenas questões oficiais do Inep/);
  });

  it("Simulado TRI: sorteia apenas questões oficiais do Inep", async () => {
    const res = await rpc<{ session_id: string; count: number; scoring: string }>(
      ALUNO_PRO,
      "app_start_simulado_tri",
      { p_filters: {}, p_count: 30, p_time_limit_seconds: 5400 }
    );

    expect(res.count).toBe(30);
    expect(res.scoring).toBe("irt");

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    const rows = await sql<{ origin: string }>(
      `select origin from public.questions where id = any($1)`,
      [qids]
    );

    expect(rows.length).toBe(30);
    for (const r of rows) {
      expect(r.origin).toBe("official");
    }
  });

  it("Simulado TRI com tentativa de exam_id = 'staziamed': recusada imediatamente", async () => {
    await expect(
      rpc(ALUNO_PRO, "app_start_simulado_tri", {
        p_filters: { exam_id: "staziamed" },
        p_count: 30,
      })
    ).rejects.toThrow(/O simulado TRI usa apenas questões oficiais do Inep/);
  });

  it("Simulado aberto pela Trilha (app_start_trail_node sem tema): só questões oficiais", async () => {
    const res = await rpc<{ session_id: string; count: number }>(
      ALUNO_PRO,
      "app_start_trail_node",
      { p_area: "PEDIATRIA", p_topic: null }
    );

    expect(res.count).toBeGreaterThan(0);

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    const rows = await sql<{ origin: string }>(
      `select origin from public.questions where id = any($1)`,
      [qids]
    );

    expect(rows.length).toBe(res.count);
    for (const r of rows) {
      expect(r.origin).toBe("official");
    }
  });

  it("Banco de Questões de Treino (p_kind = 'questoes'): continua permitindo inéditas para aluno com plano", async () => {
    const res = await rpc<{ session_id: string; count: number }>(ALUNO_PRO, "app_start_session", {
      p_kind: "questoes",
      p_filters: { exam_id: "staziamed" },
      p_count: 5,
    });

    expect(res.count).toBe(5);

    const [{ qids }] = await sql<{ qids: string[] }>(
      `select question_ids as qids from public.practice_sessions where id = $1`,
      [res.session_id]
    );

    const rows = await sql<{ origin: string }>(
      `select origin from public.questions where id = any($1)`,
      [qids]
    );

    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.origin).toBe("staziamed");
    }
  });
});
