// @vitest-environment node
/**
 * SQIE fase 2: QUESTÃO → AFIRMAÇÃO → EVIDÊNCIA → FONTE. As fontes abaixo são SINTÉTICAS (só para testar o
 * caminho): não há ainda acervo oficial real cadastrado, e nenhum resultado daqui vale como conferência médica.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie2-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const STUDENT = "00000000-0000-4000-8000-00000000000a";
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });

let q1: string, q2: string, q3: string, claim1: string;

async function publishFake(questionId: string) {
  // análise "publicada" criada só para o teste (modelo de teste, não a simulação)
  const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash, reviewed_at, temporal_status)
    values ($1, 1, 'Pergunta real de teste', 'published', 'modelo-de-teste', 'x', now(), 'CURRENT') returning id`, [questionId]))[0];
  for (const id of ["A", "B", "C", "D"]) {
    await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning) values ($1, $2, $3, $4, $5, 'análise de teste')`, [a.id, questionId, id, id === "A", id === "A" ? "CORRECT" : "WRONG"]);
  }
  await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status) values ($1, $2, 1, 'full', '{}'::jsonb, 'h', 'published')`, [questionId, a.id]);
  await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [STUDENT, questionId]);
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 's@t.dev')`, [ADMIN, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  const qs = (await sql(`select question_id from public.question_claims order by question_id limit 40`)).map((r) => r.question_id);
  [q1, q2, q3] = [qs[0], qs[10], qs[20]];
  // q1 e q2 exigem a MESMA afirmação (mesma decisão clínica); q3 é independente
  const d1 = (await sql(`select detail ->> 'clinical_decision' d from public.question_dna where question_id = $1`, [q1]))[0].d;
  await sql(`update public.question_dna set detail = jsonb_set(detail, '{clinical_decision}', to_jsonb($2::text)) where question_id = $1`, [q2, d1]);
  for (const st of buildEngineStatements().filter((s) => s.includes("public.question_claims") || s.includes("origin = 'question_dna'"))) await dev.db.exec(st);
  claim1 = (await sql(`select c.id from public.question_claims qc join public.ch_claims c on c.id = qc.claim_id where qc.question_id = $1 and qc.role = 'solves' and md5(lower(btrim(c.statement))) = md5(lower(btrim($2)))`, [q1, d1]))[0].id;
  for (const q of [q1, q2, q3]) await publishFake(q);
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Afirmações que nascem das questões", () => {
  it("toda questão válida tem pelo menos uma afirmação que ela exige; a mesma decisão vira uma só afirmação", async () => {
    const r = (await sql(`select (select count(*)::int from public.question_dna) dna, (select count(distinct question_id)::int from public.question_claims where role = 'solves') ligadas,
      (select count(*)::int from public.ch_claims where origin = 'question_dna') afirmacoes, (select count(*)::int from public.question_claims) ligacoes`))[0];
    expect(r.ligadas).toBe(r.dna);
    expect(r.afirmacoes).toBeLessThanOrEqual(r.dna);
    const shared = (await sql(`select count(*)::int n from public.question_claims where claim_id = $1`, [claim1]))[0].n;
    expect(shared).toBe(2);
    const k = (await as(ADMIN, (q) => q(`select public.app_question_knowledge($1) r`, [q1])))[0].r;
    expect(k.claims.find((c: any) => c.claim_id === claim1)).toMatchObject({ role: "solves", status: "extracted", origin: "question_dna", shared_with: 1 });
  });

  it("reaplicar a carga não duplica afirmações nem ligações", async () => {
    const before = (await sql(`select (select count(*)::int from public.ch_claims) c, (select count(*)::int from public.question_claims) l`))[0];
    for (const st of buildEngineStatements().filter((s) => s.includes("public.question_claims") || s.includes("origin = 'question_dna'"))) await dev.db.exec(st);
    expect((await sql(`select (select count(*)::int from public.ch_claims) c, (select count(*)::int from public.question_claims) l`))[0]).toEqual(before);
  });

  it("sem evidência, nenhuma questão tem fonte para mostrar ao aluno", async () => {
    const out = (await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [q1])))[0].r;
    expect(out.sources).toEqual([]);
    expect(out.sources_checked_at).toBeNull();
    expect((await as(ADMIN, (q) => q(`select public.app_question_update_summary() r`)))[0].r.claims_with_official_evidence).toBe(0);
  });
});

describe("Evidência e fonte (sintéticas)", () => {
  let official: string, book: string;
  const statement = async () => (await sql(`select statement from public.ch_claims where id = $1`, [claim1]))[0].statement as string;

  it("só fonte oficial vigente (A–D, documento final) aparece para o aluno; apostila (E) nunca", async () => {
    official = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, published_on) values ('Documento oficial SINTÉTICO', 'Órgão de teste', 'final', '1', 'A', '2025-01-01') returning id`))[0].id;
    book = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Apostila SINTÉTICA', 'Curso de teste', 'final', '1', 'E') returning id`))[0].id;
    const text = await statement();
    const link = (src: string, label: string) => db.service("ch_worker_link_evidence", { p_claim_id: claim1, p_evidence: { source_id: src, section: label, page: 12, quote: text, verdict: "compatible", model: "teste" } });
    await link(book, "apostila");
    expect((await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [q1])))[0].r.sources).toEqual([]);
    await link(official, "oficial");
    const out = (await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [q1])))[0].r;
    expect(out.sources).toEqual([expect.objectContaining({ title: "Documento oficial SINTÉTICO", organ: "Órgão de teste", version: "1", page: 12 })]);
    expect(out.sources_checked_at).not.toBeNull();
    // a mesma afirmação sustenta a questão que a compartilha, e só ela
    expect((await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [q2])))[0].r.sources).toHaveLength(1);
    expect((await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [q3])))[0].r.sources).toEqual([]);
    const k = (await as(ADMIN, (q) => q(`select public.app_question_knowledge($1) r`, [q1])))[0].r.claims.find((c: any) => c.claim_id === claim1);
    expect(k.status).toBe("compatible");
    expect(k.evidence.map((e: any) => e.official).sort()).toEqual([false, true]);
  });

  it("mudou a fonte: só as questões ligadas à afirmação entram na fila; a atualidade deixa de estar conferida", async () => {
    await sql(`update public.question_analysis set temporal_status = 'CURRENT' where question_id in ($1, $2, $3)`, [q1, q2, q3]);
    const r = (await as(ADMIN, (q) => q(`select public.app_ch_register_source('{"title":"Documento oficial SINTÉTICO","organ":"Órgão de teste","kind":"final","version":"2"}'::jsonb) r`)))[0].r;
    expect(r.superseded).toBe(official);
    const queued = (await sql(`select question_id, change_type, impact_level, status, old_claim_id from public.question_updates order by question_id`));
    expect(queued.map((u) => u.question_id).sort()).toEqual([q1, q2].sort());
    for (const u of queued) expect(u).toMatchObject({ change_type: "SOURCE_CHANGED", impact_level: "UNDETERMINED", status: "queued", old_claim_id: claim1 });
    const t = Object.fromEntries((await sql(`select question_id, temporal_status from public.question_analysis where is_current`)).map((x) => [x.question_id, x.temporal_status]));
    expect(t[q1]).toBe("REQUIRES_MEDICAL_REVIEW");
    expect(t[q2]).toBe("REQUIRES_MEDICAL_REVIEW");
    expect(t[q3]).toBe("CURRENT"); // questão sem ligação com a fonte não é tocada
    expect((await sql(`select freshness_status, status from public.ch_sources where id = $1`, [official]))[0]).toEqual({ freshness_status: "SOURCE_CHANGED", status: "superseded" });
    expect((await sql(`select status from public.ch_claims where id = $1`, [claim1]))[0].status).toBe("needs_review");
  });

  it("a fonte substituída some do que o aluno vê; reprocessar o aviso não duplica a fila", async () => {
    expect((await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [q1])))[0].r.sources).toEqual([]);
    await dev.db.query(`select public.ch_flag_dependents($1, 'de novo')`, [official]);
    expect((await sql(`select count(*)::int n from public.question_updates`))[0].n).toBe(2);
  });

  it("painel de alertas e leitura da questão: só equipe; o aluno não vê a fila", async () => {
    const s = (await as(ADMIN, (q) => q(`select public.app_question_update_summary() r`)))[0].r;
    expect(s.by_status).toEqual({ queued: 2 });
    expect(s.by_impact).toEqual({ UNDETERMINED: 2 });
    const k = (await as(ADMIN, (q) => q(`select public.app_question_knowledge($1) r`, [q1])))[0].r;
    expect(k.updates).toHaveLength(1);
    await expect(as(STUDENT, (q) => q(`select public.app_question_knowledge($1)`, [q1]))).rejects.toThrow(/restrito/);
    await expect(as(STUDENT, (q) => q(`select public.app_question_update_summary()`))).rejects.toThrow(/restrito/);
    expect(await as(STUDENT, (q) => q(`select * from public.question_updates`))).toEqual([]);
  });

  it("monitoramento: mudança do arquivo da fonte vigente também enfileira as questões afetadas", async () => {
    const cur = (await sql(`select id from public.ch_sources where title = 'Documento oficial SINTÉTICO' and status = 'current'`))[0].id;
    const text = await statement();
    await dev.db.query(`update public.ch_claims set status = 'extracted' where id = $1`, [claim1]);
    await db.service("ch_worker_link_evidence", { p_claim_id: claim1, p_evidence: { source_id: cur, page: 3, quote: text, verdict: "compatible", model: "teste" } });
    await as(ADMIN, (q) => q(`select public.app_ch_watch_source($1, 'https://exemplo.invalid/doc.pdf', 7)`, [cur]));
    await db.service("ch_worker_watch_result", { p_source_id: cur, p_hash: "a".repeat(64), p_status: "ok" });
    const r = await db.service<{ changed: boolean }>("ch_worker_watch_result", { p_source_id: cur, p_hash: "b".repeat(64), p_status: "ok" });
    expect(r.changed).toBe(true);
    const n = (await sql(`select count(*)::int n from public.question_updates where old_source_id = $1`, [cur]))[0].n;
    expect(n).toBe(2);
  });
});
