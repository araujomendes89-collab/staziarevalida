// @vitest-environment node
/**
 * SQIE fase 5: diagnóstico do erro do aluno e reforço adaptativo. Análises "publicadas" abaixo são criadas só para o teste
 * (modelo de teste, textos sintéticos): nenhuma análise real foi revisada ainda.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie5-"));
let dev: DevDatabase;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) => (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)))[0].r;

let pair: { subarea: string; competency: string }, qs: string[], off: Record<string, string>;
const wrongOf = (q: string) => ["A", "B", "C", "D"].find((x) => x !== off[q])!;
const attempt = (u: string, q: string, opt: string, confidence: number | null = null) => sql(`insert into public.question_attempts (user_id, question_id, selected_option, confidence) values ($1, $2, $3, $4)`, [u, q, opt, confidence]);

async function publish(q: string, errorTypes: string[], trap: string) {
  const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash, reviewed_at) values ($1, 1, 'Pergunta de teste', 'published', 'modelo-de-teste', 'x', now()) returning id`, [q]))[0];
  for (const id of ["A", "B", "C", "D"]) {
    const ok = id === off[q];
    await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning, error_types, trap, why_wrong, concept_difference)
      values ($1, $2, $3, $4, $5, 'análise de teste', $6, $7, 'por que errada (teste)', 'diferença de conceito (teste)')`, [a.id, q, id, ok, ok ? "CORRECT" : "WRONG", ok ? [] : errorTypes, ok ? null : trap]);
  }
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.exec(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`); // CC19: o aluno só recebe com o modo sombra desligado e a publicação ligada
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 's1@t.dev'), ($3, 's2@t.dev')`, [ADMIN, S1, S2]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  pair = (await sql(`select d.subarea, d.competency from public.question_dna d join public.questions q on q.id = d.question_id and q.status <> 'annulled'
    where d.subarea is not null and d.competency is not null group by d.subarea, d.competency having count(*) >= 12 order by count(*) desc limit 1`))[0];
  qs = (await sql(`select d.question_id from public.question_dna d join public.questions q on q.id = d.question_id and q.status <> 'annulled'
    where d.subarea = $1 and d.competency = $2 order by d.question_id limit 12`, [pair.subarea, pair.competency])).map((r) => r.question_id);
  off = Object.fromEntries((await sql(`select id, correct_option from public.questions where id = any($1)`, [qs])).map((r) => [r.id, r.correct_option]));
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Diagnóstico do erro", () => {
  it("sem análise publicada o erro existe, mas não ganha tipo inventado; a cobertura diz isso", async () => {
    await attempt(S1, qs[0], wrongOf(qs[0]));
    const d = await rpc(S1, "app_attempt_diagnosis", qs[0]);
    expect(d).toMatchObject({ selected: wrongOf(qs[0]), diagnosed: false, error_types: [], repeated_same_option: false });
    const p = await rpc(S1, "app_error_profile", 90);
    expect(p).toMatchObject({ wrong: 1, diagnosed: 0, error_types: [], traps: [] });
  });

  it("com análise publicada: tipo de erro, tipo de distrator e armadilha da alternativa escolhida", async () => {
    await publish(qs[1], ["WRONG_DOSE", "OVERTREATMENT"], "Dose de adulto em criança.");
    await publish(qs[2], ["WRONG_DOSE"], "Dose de adulto em criança.");
    await publish(qs[3], ["TRUE_BUT_NOT_BEST"], "Vale em outro cenário.");
    await attempt(S1, qs[1], wrongOf(qs[1]), 3);
    await attempt(S1, qs[2], wrongOf(qs[2]), 1);
    await attempt(S1, qs[3], wrongOf(qs[3]));
    await attempt(S1, qs[4], off[qs[4]]); // acerto
    const d = await rpc(S1, "app_attempt_diagnosis", qs[1]);
    expect(d).toMatchObject({ diagnosed: true, distractor_kind: "WRONG", error_types: ["WRONG_DOSE", "OVERTREATMENT"], trap: "Dose de adulto em criança.", confidence: 3 });
    const p = await rpc(S1, "app_error_profile", 90);
    expect(p).toMatchObject({ attempts: 5, wrong: 4, diagnosed: 3 });
    expect(p.error_types[0]).toEqual({ type: "WRONG_DOSE", count: 2 });
    expect(p.error_types.map((e: any) => e.type)).toEqual(expect.arrayContaining(["OVERTREATMENT", "TRUE_BUT_NOT_BEST"]));
    expect(p.traps[0]).toMatchObject({ trap: "Dose de adulto em criança.", count: 2 });
    expect(p.confidence).toEqual({ recorded: 2, wrong_but_sure: 1, wrong_and_guessing: 1 });
  });

  it("análise não publicada nunca vira diagnóstico", async () => {
    await sql(`update public.question_analysis set status = 'checked' where question_id = $1`, [qs[3]]);
    expect((await rpc(S1, "app_attempt_diagnosis", qs[3])).diagnosed).toBe(false);
    expect((await rpc(S1, "app_error_profile", 90)).diagnosed).toBe(2);
    await sql(`update public.question_analysis set status = 'published' where question_id = $1`, [qs[3]]);
  });

  it("errar de novo a MESMA alternativa vira 'ideia fixa'; trocar de alternativa não", async () => {
    await attempt(S1, qs[1], wrongOf(qs[1]));
    expect((await rpc(S1, "app_attempt_diagnosis", qs[1]))).toMatchObject({ same_option_times: 2, repeated_same_option: true });
    expect((await rpc(S1, "app_error_profile", 90)).fixed_ideas).toBe(1);
    await attempt(S1, qs[2], ["A", "B", "C", "D"].find((x) => x !== off[qs[2]] && x !== wrongOf(qs[2]))!);
    expect((await rpc(S1, "app_attempt_diagnosis", qs[2])).repeated_same_option).toBe(false);
  });

  it("cada aluno só vê o próprio diagnóstico; questão não errada não tem diagnóstico; anônimo não entra", async () => {
    expect(await rpc(S2, "app_attempt_diagnosis", qs[1])).toBeNull();
    expect(await rpc(S2, "app_error_profile", 90)).toMatchObject({ attempts: 0, wrong: 0, weak_points: [], error_types: [] });
    expect(await rpc(S1, "app_attempt_diagnosis", qs[4])).toBeNull(); // acertou
    await expect(dev.db.query(`set role anon`).then(() => dev.db.query(`select public.app_error_profile(30)`)).finally(() => dev.db.query(`reset role`))).rejects.toThrow();
  });
});

describe("Pontos fracos e reforço", () => {
  it("ponto fraco = subárea + competência com 3+ respostas e 40%+ de erro, com a taxa real", async () => {
    const p = await rpc(S1, "app_error_profile", 90);
    expect(p.weak_points).toEqual([expect.objectContaining({ subarea: pair.subarea, competency: pair.competency, wrong: 6, attempts: 7 })]);
    expect(p.weak_points[0].rate).toBeCloseTo(6 / 7, 2);
    // outro aluno com poucas respostas não gera ponto fraco
    await attempt(S2, qs[5], wrongOf(qs[5]));
    await attempt(S2, qs[6], wrongOf(qs[6]));
    expect((await rpc(S2, "app_error_profile", 90)).weak_points).toEqual([]);
  });

  it("reforço traz primeiro o que o aluno errou e não superou, depois o que ele ainda não respondeu, sem repetir o que já acertou", async () => {
    const r = await rpc(S1, "app_start_reinforcement", pair.subarea, pair.competency, 50);
    const ids = (await sql(`select question_ids from public.practice_sessions where id = $1`, [r.session_id]))[0].question_ids as string[];
    expect(ids.slice(0, 4).sort()).toEqual([qs[0], qs[1], qs[2], qs[3]].sort()); // os 4 erros pendentes vêm antes
    expect(ids).not.toContain(qs[4]); // acertou por último
    for (const q of qs.slice(5)) expect(ids).toContain(q); // ainda não respondidas
    expect(new Set(ids).size).toBe(ids.length);
    const cfg = (await sql(`select config, kind from public.practice_sessions where id = $1`, [r.session_id]))[0];
    expect(cfg).toMatchObject({ kind: "questoes", config: { reinforcement: true, filters: { subarea: pair.subarea, competency: pair.competency } } });
    expect((await sql(`select user_id from public.practice_sessions where id = $1`, [r.session_id]))[0].user_id).toBe(S1);
  });

  it("superou o erro (acertou por último) → sai do reforço; ponto sem nada novo é recusado; filtro vazio também", async () => {
    await attempt(S1, qs[0], off[qs[0]]);
    const r = await rpc(S1, "app_start_reinforcement", pair.subarea, pair.competency, 50);
    const ids = (await sql(`select question_ids from public.practice_sessions where id = $1`, [r.session_id]))[0].question_ids as string[];
    expect(ids).not.toContain(qs[0]);
    await expect(rpc(S1, "app_start_reinforcement", "", "x", 5)).rejects.toThrow(/Escolha um ponto fraco/);
    await expect(rpc(S1, "app_start_reinforcement", "inexistente", "inexistente", 5)).rejects.toThrow(/Nada novo/);
  });

  it("equivalente já acertado não volta como novidade", async () => {
    const eq = (await sql(`select e1.question_id a, e2.question_id b from public.question_equivalents e1 join public.question_equivalents e2 on e2.group_id = e1.group_id and e2.question_id > e1.question_id
      join public.question_dna d1 on d1.question_id = e1.question_id join public.question_dna d2 on d2.question_id = e2.question_id
      where d1.subarea = d2.subarea and d1.competency = d2.competency and d1.subarea is not null and d1.competency is not null limit 1`))[0];
    if (!eq) return; // sem par equivalente na mesma classificação neste banco
    const d = (await sql(`select subarea, competency from public.question_dna where question_id = $1`, [eq.a]))[0];
    await attempt(S2, eq.a, (await sql(`select correct_option from public.questions where id = $1`, [eq.a]))[0].correct_option);
    const r = await rpc(S2, "app_start_reinforcement", d.subarea, d.competency, 50);
    const ids = (await sql(`select question_ids from public.practice_sessions where id = $1`, [r.session_id]))[0].question_ids as string[];
    expect(ids).not.toContain(eq.a);
    expect(ids).not.toContain(eq.b);
  });
});

describe("Equipe: como os alunos responderam", () => {
  it("só com 5+ alunos; mostra a parcela de cada alternativa; aluno não acessa", async () => {
    const q = qs[8];
    expect(await rpc(ADMIN, "app_distractor_stats", q)).toMatchObject({ students: 0, enough: false });
    for (let i = 0; i < 6; i++) {
      const id = `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`;
      await dev.db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `c${i}@t.dev`]);
      await attempt(id, q, i < 4 ? wrongOf(q) : off[q]);
    }
    const s = await rpc(ADMIN, "app_distractor_stats", q);
    expect(s).toMatchObject({ students: 6, enough: true });
    const byOpt = Object.fromEntries(s.options.map((o: any) => [o.option_id, o]));
    expect(byOpt[wrongOf(q)]).toMatchObject({ count: 4, correct: false });
    expect(byOpt[off[q]]).toMatchObject({ count: 2, correct: true });
    expect(byOpt[wrongOf(q)].share).toBeCloseTo(4 / 6, 2);
    await expect(rpc(S1, "app_distractor_stats", q)).rejects.toThrow(/restrito/);
  });
});
