// @vitest-environment node
/**
 * Simulado TRI (estimativa StaziaMed) no banco — migração …9996_simulado_tri.sql, num Postgres real em memória (PGlite) com
 * todas as migrações: a conta EAP do banco (irt_eap / irt_estimar_theta) bate com o estimador em TypeScript; o aluno escolhe
 * o modo TRI ao iniciar; ao finalizar o banco grava θ, erro padrão, faixa de 95%, nota StaziaMed e o desempenho por área;
 * cada aluno só vê o seu; anulada sai da conta; mudança de gabarito recorrige; a matriz de calibração só usa o que vale;
 * a calibração grava "provisória" ou "calibrada"; o modo clássico continua igual.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { bProvisorioPorPercentual, escalaStaziaMed, estimarTheta, thetaEap } from "../../scripts/tri/rasch";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"];
const ANA = "00000000-0000-4000-8000-0000000007a1";
const BRUNO = "00000000-0000-4000-8000-0000000007b1";
const EQUIPE = "00000000-0000-4000-8000-0000000007e1";
const TOTAL = 60; // 5 áreas × 12 questões válidas (gabarito B)

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
async function asService<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const sql = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;

const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: "" })));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await sql(`insert into auth.users (id, email) values ($1, 'ana@tri.dev'), ($2, 'bruno@tri.dev'), ($3, 'equipe@tri.dev')`, [ANA, BRUNO, EQUIPE]);
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [EQUIPE]);
  await sql(`insert into public.exams (id, kind, year, semester, title, question_count) values ('revalida-2025-1', 'REVALIDA', 2025, 1, 'Revalida 2025/1', 61)`);
  let number = 0;
  for (const [a, area] of AREAS.entries()) {
    for (let n = 1; n <= 12; n++) {
      await sql(
        `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status)
         values ($1, $1, 'revalida-2025-1', $2, $3, $4, 'subtema', $5, $6, 'B', 'valid')`,
        [`t-${a}-${n}`, ++number, area, n <= 6 ? `Tema ${a}-A` : `Tema ${a}-B`, `Caso clínico ${a}-${n}.`, options]
      );
    }
  }
  await sql(
    `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status)
     values ('t-anulada', 't-anulada', 'revalida-2025-1', 61, 'PEDIATRIA', 'Anulada', 's', 'Anulada.', $1, 'B', 'annulled')`,
    [options]
  );
  // nível do blueprint em algumas: 1ª de cada área "LOW", 2ª "HIGH" (as outras sem nível)
  for (const a of AREAS.keys()) {
    await sql(`insert into public.question_dna (question_id, difficulty_estimate, dataset_version) values ($1, 'LOW', 't'), ($2, 'HIGH', 't')`, [
      `t-${a}-1`,
      `t-${a}-2`,
    ]);
  }
}, 120_000);

describe("Migração", () => {
  it("pode ser colada de novo sem erro", async () => {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003009996_simulado_tri.sql"), "utf8"));
  });

  it("o SQL de conferência responde OK depois de colar", async () => {
    const [row] = await sql(fs.readFileSync(path.join(ROOT, "supabase/conferir/simulado-tri.sql"), "utf8"));
    expect(row.resultado).toMatch(/^OK: /);
  });
});

describe("Conta do banco (EAP) = estimador em TypeScript", () => {
  it("irt_eap devolve o mesmo θ e erro padrão (prior N(0,1), 61 pontos)", async () => {
    const b = [-2, -1.5, -1, -0.5, 0, 0.3, 0.6, 1, 1.5, 2, 0.2, -0.7];
    const r = [1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0];
    const [row] = await sql(`select * from public.irt_eap($1::smallint[], $2::double precision[])`, [r, b]);
    const js = thetaEap(r, b);
    expect(row.theta).toBeCloseTo(js.theta, 9);
    expect(row.se).toBeCloseTo(js.se, 9);
    expect(row.n_items).toBe(12);
  });

  it("irt_estimar_theta: θ, EP, nota 50+10θ e intervalo de 95%; nula (anulada) fica fora", async () => {
    const r = [1, 1, 0, null, 1, 0, 1, 1];
    const b = [0.5, -1, 1, 3, 0, 0.2, -0.3, 1.1];
    const [{ e }] = await sql(`select public.irt_estimar_theta($1::smallint[], $2::double precision[]) as e`, [r, b]);
    const js = estimarTheta(r, b);
    expect(e.theta).toBeCloseTo(js.theta, 9);
    expect(e.se).toBeCloseTo(js.se, 9);
    expect(e.theta_lo).toBeCloseTo(js.thetaLo, 9);
    expect(e.theta_hi).toBeCloseTo(js.thetaHi, 9);
    expect([e.nota, e.nota_lo, e.nota_hi]).toEqual([js.nota, js.notaLo, js.notaHi]);
    expect(e).toMatchObject({ n_items: 7, n_correct: 5, method: "EAP", scale: { media: 50, por_logit: 10 } });
  });

  it("mesma prova e mesmo número de acertos = mesmo θ; conjunto mais difícil vale mais", async () => {
    const b = [-1, -0.5, 0, 0.5, 1];
    const [{ x }] = await sql(`select public.irt_estimar_theta('{1,1,1,0,0}'::smallint[], $1::double precision[]) ->> 'theta' as x`, [b]);
    const [{ y }] = await sql(`select public.irt_estimar_theta('{0,0,1,1,1}'::smallint[], $1::double precision[]) ->> 'theta' as y`, [b]);
    expect(Number(x)).toBeCloseTo(Number(y), 12);
    const [{ facil }] = await sql(`select (public.irt_estimar_theta('{1,1,1,0}'::smallint[], '{-1,-1,-1,-1}') ->> 'theta')::float8 as facil`);
    const [{ dificil }] = await sql(`select (public.irt_estimar_theta('{1,1,1,0}'::smallint[], '{1,1,1,1}') ->> 'theta')::float8 as dificil`);
    expect(dificil).toBeGreaterThan(facil);
  });

  it("listas de tamanhos diferentes são recusadas", async () => {
    await expect(sql(`select public.irt_estimar_theta('{1,0}'::smallint[], '{0}'::double precision[])`)).rejects.toThrow(/mesmo tamanho/);
  });
});

describe("Simulado TRI do aluno: escolher, responder, finalizar e ver a estimativa", () => {
  let sessionId: string;
  let ids: string[];
  // padrão de respostas: B (certa) nas 1ª a 8ª de cada área, A (errada) na 9ª e 10ª, em branco na 11ª e 12ª
  const resposta = (id: string) => {
    const n = Number(id.split("-")[2]);
    return n <= 8 ? "B" : n <= 10 ? "A" : null;
  };

  it("menos de 30 questões não abre o modo TRI", async () => {
    await expect(rpc(ANA, "app_start_simulado_tri", { p_filters: {}, p_count: 20 })).rejects.toThrow(/pelo menos 30 questões/);
  });

  it("abre um simulado com a correção TRI guardada na sessão (o sorteio é o mesmo do simulado de sempre)", async () => {
    const started = await rpc(ANA, "app_start_simulado_tri", { p_filters: {}, p_count: TOTAL, p_time_limit_seconds: 3600 });
    expect(started).toMatchObject({ count: TOTAL, scoring: "irt" });
    sessionId = started.session_id;
    const [s] = await sql(`select kind, config, time_limit_seconds from public.practice_sessions where id = $1`, [sessionId]);
    expect(s).toMatchObject({ kind: "simulado", time_limit_seconds: 3600 });
    expect(s.config.scoring).toBe("irt");
    const sessao = await rpc(ANA, "app_get_session", { p_session_id: sessionId });
    ids = sessao.questions.map((q: any) => q.id);
    expect(ids).toHaveLength(TOTAL);
    expect(ids).not.toContain("t-anulada");
    // antes de finalizar: sem estimativa
    expect(await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId })).toMatchObject({ scoring: "irt", ready: false });
  });

  it("ao finalizar, grava θ, erro padrão, faixa de 95% e nota StaziaMed (mesma conta do estimador)", async () => {
    for (const id of ids) {
      const option = resposta(id);
      if (option) await rpc(ANA, "app_answer_question", { p_session_id: sessionId, p_question_id: id, p_option: option, p_active_ms: 1000 });
    }
    await rpc(ANA, "app_finish_session", { p_session_id: sessionId });
    const r = await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId });
    expect(r).toMatchObject({
      scoring: "irt",
      ready: true,
      n_items: TOTAL,
      n_correct: 40,
      n_blank: 10,
      n_annulled: 0,
      n_preliminary: 0,
      label: "Estimativa StaziaMed, não é a nota do Inep",
      scale: { media: 50, por_logit: 10 },
      method: "EAP",
    });
    // dificuldades provisórias: sem respostas suficientes, vale o nível do blueprint (LOW −1, HIGH +1, sem nível 0)
    expect(r.n_provisional).toBe(TOTAL);
    expect(r.n_calibrated).toBe(0);
    const b = ids.map((id) => (id.endsWith("-1") ? -1 : id.endsWith("-2") ? 1 : 0));
    const x = ids.map((id) => (resposta(id) === "B" ? 1 : 0)); // em branco conta como erro no simulado
    const js = estimarTheta(x, b);
    expect(r.theta).toBeCloseTo(js.theta, 9);
    expect(r.se).toBeCloseTo(js.se, 9);
    expect([r.nota, r.nota_lo, r.nota_hi]).toEqual([js.nota, js.notaLo, js.notaHi]);
    expect(r.nota).toBe(escalaStaziaMed(r.theta));
    expect(r.nota_lo).toBeLessThan(r.nota);
    expect(r.nota_hi).toBeGreaterThan(r.nota);
  });

  it("desempenho por área (acertos × esperado pelo modelo) e por tema", async () => {
    const r = await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId });
    expect(r.by_area.map((a: any) => a.area).sort()).toEqual([...AREAS].sort());
    for (const a of r.by_area) {
      expect(a).toMatchObject({ n_items: 12, n_correct: 8 });
      expect(a.expected).toBeGreaterThan(0);
      expect(a.expected).toBeLessThan(12);
      expect(typeof a.nota).toBe("number");
      expect(a.nota_lo).toBeLessThanOrEqual(a.nota);
    }
    expect(r.by_topic.length).toBe(10);
    expect(r.by_topic[0]).toEqual(expect.objectContaining({ area: expect.any(String), topic: expect.any(String), n_items: 6 }));
  });

  it("a revisão e o placar clássico continuam iguais (acertos ÷ questões)", async () => {
    const s = await rpc(ANA, "app_get_session", { p_session_id: sessionId });
    expect(s.result).toMatchObject({ total: TOTAL, answered: 50, correct: 40 });
  });

  it("cada aluno só vê o seu: outro aluno não lê nem chama; ninguém grava direto", async () => {
    await expect(rpc(BRUNO, "app_session_irt_result", { p_session_id: sessionId })).rejects.toThrow(/não encontrada/);
    await expect(rpc(null, "app_session_irt_result", { p_session_id: sessionId })).rejects.toThrow();
    expect(await as(BRUNO, `select * from public.irt_session_results`)).toHaveLength(0);
    expect(await as(BRUNO, `select * from public.irt_responses`)).toHaveLength(0);
    expect(await as(ANA, `select session_id from public.irt_session_results`)).toEqual([{ session_id: sessionId }]);
    expect((await as(ANA, `select * from public.irt_responses`)).length).toBe(TOTAL);
    await expect(as(ANA, `update public.irt_session_results set theta = 5`)).rejects.toThrow(/permission denied/);
    await expect(as(ANA, `insert into public.irt_item_params (question_id, b, origem, estado) values ('t-0-3', -4, 'rasch', 'calibrada')`)).rejects.toThrow(
      /permission denied/
    );
    // dificuldade e calibração: só a equipe lê
    expect(await as(ANA, `select * from public.irt_calibration_runs`)).toHaveLength(0);
    // funções internas e do servidor: o aluno não executa
    for (const call of [
      `select public.irt_score_session('${sessionId}')`,
      `select public.irt_calibration_matrix()`,
      `select public.irt_save_calibration('jmle', '[]'::jsonb, '{}'::jsonb)`,
      `select public.irt_refresh_provisional()`,
      `select public.irt_regrade_question('t-0-3')`,
    ]) {
      await expect(as(ANA, call), call).rejects.toThrow(/permission denied/);
    }
    // equipe lê os resultados de todos (auditoria)
    expect((await as(EQUIPE, `select session_id from public.irt_session_results`)).length).toBe(1);
  });

  it("gabarito preliminar entra na conta e é contado à parte", async () => {
    await sql(`insert into public.question_official_answers (question_id, answer, answer_status, source) values ('t-0-3', 'B', 'PRELIMINARY', 'teste')`);
    const r = await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId });
    expect(r.n_preliminary).toBe(1);
    expect(r.n_items).toBe(TOTAL);
    expect(r.recomputed_at).not.toBeNull();
  });

  it("mudou o gabarito: a estimativa é recorrigida (a tentativa original não muda)", async () => {
    const antes = await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId });
    // t-1-9: Ana marcou A; o gabarito passa a ser A
    await sql(`update public.questions set correct_option = 'A' where id = 't-1-9'`);
    const depois = await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId });
    expect(depois.n_correct).toBe(antes.n_correct + 1);
    expect(depois.theta).toBeGreaterThan(antes.theta);
    const [a] = await sql(`select is_correct from public.question_attempts where session_id = $1 and question_id = 't-1-9'`, [sessionId]);
    expect(a.is_correct).toBe(false);
    await sql(`update public.questions set correct_option = 'B' where id = 't-1-9'`);
    expect((await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId })).n_correct).toBe(antes.n_correct);
  });

  it("questão anulada depois do simulado sai da conta (não vira acerto para ninguém)", async () => {
    await sql(`update public.questions set status = 'annulled' where id = 't-2-11'`);
    const r = await rpc(ANA, "app_session_irt_result", { p_session_id: sessionId });
    expect(r).toMatchObject({ n_items: TOTAL - 1, n_annulled: 1, n_correct: 40, n_blank: 9 });
    const [row] = await as(ANA, `select score, excluded_reason from public.irt_responses where question_id = 't-2-11'`);
    expect(row).toEqual({ score: null, excluded_reason: "anulada" });
    await sql(`update public.questions set status = 'valid' where id = 't-2-11'`);
  });

  it("modo clássico: nada muda e não há estimativa TRI", async () => {
    const classic = await rpc(ANA, "app_start_session", { p_kind: "simulado", p_filters: {}, p_count: 30 });
    await rpc(ANA, "app_finish_session", { p_session_id: classic.session_id });
    expect(await rpc(ANA, "app_session_irt_result", { p_session_id: classic.session_id })).toEqual({ scoring: "classic" });
    expect(await sql(`select 1 from public.irt_session_results where session_id = $1`, [classic.session_id])).toHaveLength(0);
  });
});

describe("Calibração própria (dificuldade dos itens)", () => {
  const ALUNOS = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-0000000071${String(i).padStart(2, "0")}`);
  // 12 alunos fazem um simulado com as 12 questões de Clínica (área 0); o aluno i acerta as questões 1..(i % 12 + 1)
  beforeAll(async () => {
    for (const [i, uid] of ALUNOS.entries()) {
      await sql(`insert into auth.users (id, email) values ($1, $2)`, [uid, `aluno${i}@tri.dev`]);
      const qids = Array.from({ length: 12 }, (_, k) => `t-0-${k + 1}`);
      const [{ id }] = await sql(
        `insert into public.practice_sessions (user_id, kind, question_ids, started_at, finished_at)
         values ($1, 'simulado', $2, now() - interval '2 hours', now() - interval '1 hour') returning id`,
        [uid, qids]
      );
      for (const [k, q] of qids.entries()) {
        await sql(`insert into public.question_attempts (user_id, question_id, session_id, selected_option, answered_at) values ($1, $2, $3, $4, now() - interval '1 hour')`, [
          uid,
          q,
          id,
          k <= i % 12 ? "B" : "C",
        ]);
      }
    }
    // um aluno que respondeu só 2 de 12 (menos de 80%): fora da matriz
    const fraco = "00000000-0000-4000-8000-000000007199";
    await sql(`insert into auth.users (id, email) values ($1, 'fraco@tri.dev')`, [fraco]);
    const [{ id }] = await sql(
      `insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'simulado', $2, now()) returning id`,
      [fraco, Array.from({ length: 12 }, (_, k) => `t-0-${k + 1}`)]
    );
    await sql(`insert into public.question_attempts (user_id, question_id, session_id, selected_option) values ($1, 't-0-1', $2, 'B'), ($1, 't-0-2', $2, 'B')`, [fraco, id]);
    // Bruno viu t-0-5 num treino ANTES do simulado: no simulado ela não é "primeira vez" e fica fora para ele
    const [{ id: treino }] = await sql(
      `insert into public.practice_sessions (user_id, kind, question_ids, started_at, finished_at) values ($1, 'questoes', '{t-0-5}', now() - interval '3 days', now() - interval '3 days') returning id`,
      [BRUNO]
    );
    await sql(`insert into public.question_attempts (user_id, question_id, session_id, selected_option, answered_at) values ($1, 't-0-5', $2, 'B', now() - interval '3 days')`, [BRUNO, treino]);
    const qids = Array.from({ length: 12 }, (_, k) => `t-0-${k + 1}`);
    const [{ id: sim }] = await sql(
      `insert into public.practice_sessions (user_id, kind, question_ids, started_at, finished_at) values ($1, 'simulado', $2, now() - interval '1 day', now() - interval '1 day') returning id`,
      [BRUNO, qids]
    );
    for (const q of qids) await sql(`insert into public.question_attempts (user_id, question_id, session_id, selected_option) values ($1, $2, $3, 'B')`, [BRUNO, q, sim]);
  });

  it("a matriz usa só simulado finalizado com ≥ 80% respondido, primeira vez de cada aluno, sem anuladas, corrigida pelo gabarito atual", async () => {
    const m = await asService<{ person: string; question_id: string; score: number }>(`select * from public.irt_calibration_matrix()`);
    const pessoas = new Set(m.map((r) => r.person));
    expect(pessoas.has(BRUNO)).toBe(false); // a matriz não traz o id da conta (só um código)
    // Ana (60) + 12 alunos (12 cada) + Bruno (11: t-0-5 fora) — o fraco e o simulado clássico de Ana sem respostas ficam fora
    expect(m.length).toBe(TOTAL + 12 * 12 + 11);
    expect(m.filter((r) => r.question_id === "t-0-5").length).toBe(1 + 12);
    expect(m.some((r) => r.question_id === "t-anulada")).toBe(false);
    expect(m.every((r) => r.score === 0 || r.score === 1)).toBe(true);
  });

  it("irt_refresh_provisional: ≥ 10 respostas → dificuldade provisória pelo percentual de acerto", async () => {
    const out = await asService(`select public.irt_refresh_provisional() as r`);
    expect(out[0].r.saved).toBe(12);
    const rows = await as(EQUIPE, `select question_id, b, n_resp, n_correct, origem, estado from public.irt_item_params order by question_id`);
    const q1 = rows.find((r: any) => r.question_id === "t-0-1");
    expect(q1).toMatchObject({ origem: "percentual", estado: "provisoria" });
    expect(q1.b).toBeCloseTo(bProvisorioPorPercentual(q1.n_correct, q1.n_resp), 9);
    expect(rows.every((r: any) => r.question_id.startsWith("t-0-"))).toBe(true);
    // a primeira (todos acertam) fica mais fácil que a última (quase ninguém)
    const q12 = rows.find((r: any) => r.question_id === "t-0-12");
    expect(q1.b).toBeLessThan(q12.b);
  });

  it("irt_save_calibration (servidor): ≥ 100 respostas calibrada, 30–99 provisória, < 30 ignorada, rejeitada fica fora da nota", async () => {
    const items = [
      { question_id: "t-3-1", b: 0.8, se_b: 0.2, n_resp: 150, n_correct: 60, infit: 1.0, outfit: 1.1 },
      { question_id: "t-3-2", b: -0.4, se_b: 0.3, n_resp: 50, n_correct: 30 },
      { question_id: "t-3-3", b: 0.1, n_resp: 12, n_correct: 6 },
      { question_id: "t-3-4", b: 2.5, n_resp: 120, n_correct: 10, outfit: 2.6, reject_reason: "outfit > 2" },
      { question_id: "t-0-1", b: -2.2, se_b: 0.25, n_resp: 100, n_correct: 90 },
    ];
    const [{ r }] = await asService(`select public.irt_save_calibration('jmle', $1::jsonb, '{"teste": true}'::jsonb) as r`, [JSON.stringify(items)]);
    expect(r).toMatchObject({ saved: 4, ignored: 1 });
    const rows = await as(EQUIPE, `select question_id, estado, origem, run_id is not null as tem_run from public.irt_item_params where question_id like 't-3-%' order by question_id`);
    // (t-3-3 tinha só 12 respostas: ignorada)
    expect(rows).toEqual([
      { question_id: "t-3-1", estado: "calibrada", origem: "rasch", tem_run: true },
      { question_id: "t-3-2", estado: "provisoria", origem: "rasch", tem_run: true },
      { question_id: "t-3-4", estado: "rejeitado", origem: "rasch", tem_run: true },
    ]);
    await expect(asService(`select public.irt_save_calibration('jmle', '[{"question_id":"t-3-1","b":99,"n_resp":200}]'::jsonb, '{}'::jsonb)`)).rejects.toThrow(
      /dificuldade fora da faixa/i
    );

    // a percentual (t-0-1 tem ≥ 10 respostas na matriz) não passa por cima de uma dificuldade do Rasch
    await asService(`select public.irt_refresh_provisional()`);
    expect(await as(EQUIPE, `select origem, estado, b from public.irt_item_params where question_id = 't-0-1'`)).toEqual([
      { origem: "rasch", estado: "calibrada", b: -2.2 },
    ]);
    // |b| > 6,5 sem motivo vira rejeitado (como a NT 42/2025)
    await asService(`select public.irt_save_calibration('cmle', '[{"question_id":"t-3-5","b":6.9,"n_resp":40}]'::jsonb)`);
    expect(await as(EQUIPE, `select estado, reject_reason from public.irt_item_params where question_id = 't-3-5'`)).toEqual([
      { estado: "rejeitado", reject_reason: "|b| > 6,5" },
    ]);

    // novo simulado TRI de Bruno com as 60: calibrada conta como calibrada; a rejeitada fica fora
    const started = await rpc(BRUNO, "app_start_simulado_tri", { p_filters: {}, p_count: TOTAL });
    await rpc(BRUNO, "app_finish_session", { p_session_id: started.session_id });
    const res = await rpc(BRUNO, "app_session_irt_result", { p_session_id: started.session_id });
    expect(res).toMatchObject({ n_items: TOTAL - 2, n_rejected: 2, n_calibrated: 2, n_correct: 0, n_blank: TOTAL - 2 });
    const [rej] = await as(BRUNO, `select score, excluded_reason from public.irt_responses where question_id = 't-3-4'`);
    expect(rej).toEqual({ score: null, excluded_reason: "item_rejeitado" });
  });
});
