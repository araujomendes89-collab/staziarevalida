// @vitest-environment node
/**
 * SQIE, fechamento: tipos de alteração clínica, frescor e selo, verificar ao servir, eventos, conflito entre fontes,
 * painel de questões atualizadas e motivos declarados pelo aluno. Fontes e análises sintéticas, só para testar o caminho.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { clinicalChange, diffPassages } from "../../server/contentHub/sourceDiff";
import { compareSourceVersions } from "../../server/contentHub/sourceCompare";
import { createContentHubWorker } from "../../server/contentHub/worker";
import type { PipelineDeps } from "../../server/contentHub/pipeline";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const P = (text: string) => ({ text });
const type = (a: string, b: string) => diffPassages([P(a)], [P(b)]).items[0].changeType;

describe("Tipos de alteração clínica (regras, sem IA)", () => {
  it("dose, ponto de corte, faixa etária, idade gestacional, rastreamento, tempo, seguimento, contraindicação", () => {
    expect(type("Administrar amoxicilina 50 mg/kg/dia dividida em três tomadas por dez dias na otite.", "Administrar amoxicilina 90 mg/kg/dia dividida em três tomadas por dez dias na otite.")).toBe("DOSE_CHANGED");
    expect(type("Considerar hipertensão quando a pressão arterial for maior ou igual a 140 mmHg na consulta de rotina do adulto.", "Considerar hipertensão quando a pressão arterial for maior ou igual a 130 mmHg na consulta de rotina do adulto.")).toBe("CUT_OFF_CHANGED");
    expect(type("O rastreamento do câncer de colo do útero começa aos 25 anos em mulheres com vida sexual ativa.", "O rastreamento do câncer de colo do útero começa aos 30 anos em mulheres com vida sexual ativa.")).toBe("SCREENING_CHANGED");
    expect(type("A vacina é indicada para crianças na faixa etária a partir de 9 anos de idade nesta campanha nacional.", "A vacina é indicada para crianças na faixa etária a partir de 12 anos de idade nesta campanha nacional.")).toBe("AGE_RANGE_CHANGED");
    expect(type("Gestantes devem receber a vacina dTpa a partir de 20 semanas de gestação em cada gestação nova.", "Gestantes devem receber a vacina dTpa a partir de 27 semanas de gestação em cada gestação nova.")).toBe("GESTATIONAL_AGE_CHANGED");
    expect(type("Iniciar o antibiótico em até 3 horas após o diagnóstico de sepse em paciente internado.", "Iniciar o antibiótico em até 1 horas após o diagnóstico de sepse em paciente internado.")).toBe("TIMING_CHANGED");
    expect(type("No seguimento, o retorno do paciente deve ocorrer em 30 dias após a alta hospitalar.", "No seguimento, o retorno do paciente deve ocorrer em 15 dias após a alta hospitalar.")).toBe("FOLLOW_UP_CHANGED");
    expect(type("Este medicamento é usado em gestantes com acompanhamento regular no pré-natal de rotina.", "Este medicamento é contraindicado em gestantes com acompanhamento regular no pré-natal de rotina.")).toBe("CONTRAINDICATION_CHANGED");
  });

  it("guarda o valor antigo e o novo; trecho removido, novo, só forma ou palavra trocada", () => {
    const d = diffPassages([P("Amoxicilina 50 mg/kg/dia por dez dias na otite média aguda do lactente pequeno.")], [P("Amoxicilina 90 mg/kg/dia por dez dias na otite média aguda do lactente pequeno.")]);
    expect(d.items[0]).toMatchObject({ oldValues: ["50mg/kg/dia"], newValues: ["90mg/kg/dia"] });
    const r = diffPassages([P("Parágrafo antigo sobre um tema que deixou de constar do documento oficial desta publicação.")], [P("Capítulo novo sobre telemedicina na atenção primária e registro no prontuário eletrônico do paciente.")]);
    expect(r.items.map((i) => i.changeType).sort()).toEqual(["NEW_RECOMMENDATION", "REMOVED_RECOMMENDATION"]);
    expect(type("Usar o esquema com acompanhamento regular, sem outras restrições nesta fase do estudo.", "Usar o esquema com acompanhamento regular, sem outras restrições nesta fase do estudo")).toBe("NO_CLINICAL_IMPACT");
    expect(clinicalChange({ kind: "MINOR_WORDING", oldText: "a", newText: "b", numbersOld: [], numbersNew: [] }).type).toBe("TERMINOLOGY_CHANGED");
  });
});

describe("Frescor, verificar ao servir, eventos, conflito, painel (fontes sintéticas)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie6-"));
  let dev: DevDatabase;
  let db: ContentDb;
  const ADMIN = "00000000-0000-4000-8000-0000000000ad";
  const STUDENT = "00000000-0000-4000-8000-00000000000a";
  const REVIEWER = "00000000-0000-4000-8000-0000000000e1";
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
  const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
    dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
    });
  const rpc = async (uid: string, fn: string, ...args: unknown[]) => (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;
  let q1: string, claim1: string, v1: string, statement1: string;

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    for (const st of buildEngineStatements()) await dev.db.exec(st);
    await dev.db.exec(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`); // CC19: o aluno só recebe com o modo sombra desligado e a publicação ligada
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 's@t.dev'), ($3, 'r@t.dev')`, [ADMIN, STUDENT, REVIEWER]);
    // o vigia só baixa endereço da lista de sites oficiais (Vigilância científica, migração 9940): o site de teste entra na lista
    await dev.db.query(`insert into public.ch_official_domains (address, institution, kind) values ('exemplo.invalid', 'Site de teste', 'governo') on conflict do nothing`);
    // frequência do site de teste = a que este arquivo usa (a regra do site manda na frequência)
    await dev.db.query(`update public.ch_official_domains set watch_interval_days = 10 where address = 'exemplo.invalid'`);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    q1 = (await sql(`select question_id from public.question_claims where role = 'solves' order by question_id limit 1`))[0].question_id;
    claim1 = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q1]))[0].claim_id;
    statement1 = (await sql(`select statement from public.ch_claims where id = $1`, [claim1]))[0].statement;
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, $2)`, [REVIEWER, (await sql(`select public.question_area_code($1) a`, [q1]))[0].a]);
    const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash, reviewed_at) values ($1, 1, 'Pergunta de teste', 'published', 'modelo-de-teste', 'x', now()) returning id`, [q1]))[0];
    const off = (await sql(`select correct_option from public.questions where id = $1`, [q1]))[0].correct_option;
    for (const id of ["A", "B", "C", "D"]) await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning) values ($1, $2, $3, $4, $5, 'x')`, [a.id, q1, id, id === off, id === off ? "CORRECT" : "WRONG"]);
    await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status) values ($1, $2, 1, 'full', '{}'::jsonb, 'h', 'published')`, [q1, a.id]);
    await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [STUDENT, q1]);
    v1 = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Documento SINTÉTICO fechamento', 'Órgão de teste', 'final', '1', 'A') returning id`))[0].id;
    const p = (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2) returning id`, [v1, `${statement1} Dose habitual de 10 mg uma vez ao dia.`]))[0].id;
    await rpc(ADMIN, "app_ch_link_evidence", claim1, { source_id: v1, passage_id: p, quote: statement1, verdict: "compatible", page: 1 });
  }, 300_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const fresh = async () => (await rpc(STUDENT, "app_question_commentary", q1)).freshness;
  const deps = () => ({ db, storage: null, ai: { provider: null, status: { ready: false } }, renderer: null }) as unknown as PipelineDeps;

  it("fonte não monitorada: frescor 40 e nenhum selo, mesmo com atualidade confirmada pelo revisor", async () => {
    expect((await fresh()).score).toBe(40);
    expect(await rpc(REVIEWER, "app_question_confirm_currency", q1, "Conferi a afirmação no documento oficial v1.")).toBe(true);
    const c = await rpc(STUDENT, "app_question_commentary", q1);
    expect(c.temporal_status).toBe("CURRENT");
    expect(c.seal).toBeNull();
  });

  it("monitorada e conferida agora: frescor 100 e selo; passada a metade do intervalo cai para 80 (ainda com selo)", async () => {
    await rpc(ADMIN, "app_ch_watch_source", v1, "https://exemplo.invalid/doc.pdf", 10);
    await db.service("ch_worker_watch_result", { p_source_id: v1, p_hash: "a".repeat(64), p_status: "ok" });
    expect(await fresh()).toMatchObject({ score: 100, sources: 1 });
    expect((await rpc(STUDENT, "app_question_commentary", q1)).seal).toBe("UPDATED");
    await sql(`update public.ch_source_watch set next_check_at = now() + interval '3 days' where source_id = $1`, [v1]);
    expect((await fresh()).score).toBe(80);
    expect((await rpc(STUDENT, "app_question_commentary", q1)).seal).toBe("UPDATED");
  });

  it("conferência vencida: frescor 60 e o selo some; verificar ao servir pede a conferência uma vez só e o worker atende", async () => {
    await sql(`update public.ch_source_watch set next_check_at = now() - interval '1 hour' where source_id = $1`, [v1]);
    expect((await fresh()).score).toBe(60);
    expect((await rpc(STUDENT, "app_question_commentary", q1)).seal).toBeNull();
    expect(await rpc(STUDENT, "app_question_verify_on_serve", q1)).toBe(1);
    expect(await rpc(STUDENT, "app_question_verify_on_serve", q1)).toBe(0); // já pedido: não repete
    expect((await sql(`select freshness_status from public.ch_sources where id = $1`, [v1]))[0].freshness_status).toBe("CHECKING");
    expect((await sql(`select public.ch_worker_watch_requested() n`))[0].n).toBe(1);
    // quem não respondeu a questão não dispara verificação
    expect(await rpc(REVIEWER, "app_question_verify_on_serve", q1)).toBe(0);
    const worker = createContentHubWorker(deps(), { resolver: async () => ["93.184.216.34"], fetchImpl: (async () => new Response("%PDF-1.7 igual", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch });
    await sql(`update public.ch_source_watch set requested_at = now(), last_hash = $2 where source_id = $1`, [v1, (await import("../../server/contentHub/worker")).publicationHash(Buffer.from("%PDF-1.7 igual"), "application/pdf")]);
    expect(await worker.checkSources()).toMatchObject({ checked: 1, changed: 0 });
    expect((await sql(`select requested_at from public.ch_source_watch where source_id = $1`, [v1]))[0].requested_at).toBeNull();
    expect((await fresh()).score).toBe(100);
  });

  it("publicação mudou: a evidência perde a validade (frescor 0, com motivo) e o selo some", async () => {
    await db.service("ch_worker_watch_result", { p_source_id: v1, p_hash: "c".repeat(64), p_status: "ok" });
    expect(await fresh()).toMatchObject({ score: 0, reason: "sem evidência oficial conferida por pessoa" });
    expect((await rpc(STUDENT, "app_question_commentary", q1)).seal).toBeNull();
  });

  it("eventos: guideline.updated, question.impacted e question.review_required nascem sozinhos; só a equipe lê", async () => {
    const ev = await rpc(ADMIN, "app_sqie_events", null, 100);
    const types = ev.map((e: any) => e.type);
    expect(types).toContain("guideline.updated");
    expect(types).toContain("question.impacted");
    expect(ev.find((e: any) => e.type === "question.impacted")).toMatchObject({ question_id: q1, source_id: v1 });
    await expect(rpc(STUDENT, "app_sqie_events", null, 10)).rejects.toThrow(/restrito/);
    expect(await as(STUDENT, (q) => q(`select * from public.sqie_events`))).toEqual([]);
  });

  it("comparação gera diff_ready, tipo de mudança por item e painel 'Questões atualizadas'", async () => {
    const v2 = (await rpc(ADMIN, "app_ch_register_source", { title: "Documento SINTÉTICO fechamento", organ: "Órgão de teste", kind: "final", version: "2" })).id;
    await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2)`, [v2, `${statement1} Dose habitual de 20 mg uma vez ao dia.`]);
    await compareSourceVersions(db, v1, v2);
    expect((await rpc(ADMIN, "app_sqie_events", "guideline.diff_ready", 10)).length).toBe(1);
    const u = (await sql(`select change_type, triage_kind from public.question_updates where question_id = $1 and old_source_id = $2`, [q1, v1]))[0];
    expect(u).toEqual({ change_type: "DOSE_CHANGED", triage_kind: "NUMERIC" });
    const diffs = await rpc(ADMIN, "app_source_diffs", v1);
    expect(diffs[0].items[0]).toMatchObject({ change_type: "DOSE_CHANGED", old_values: ["10mg"], new_values: ["20mg"] });
    const panel = await rpc(REVIEWER, "app_updated_questions", {}, 30, 0);
    expect(panel.total).toBeGreaterThan(0);
    const row = panel.items.find((i: any) => i.question_id === q1);
    expect(row).toMatchObject({ change_type: "DOSE_CHANGED", status: "review_required", critical: true, source: "Documento SINTÉTICO fechamento" });
    expect(row.official_answer).toBeTruthy();
    expect((await rpc(REVIEWER, "app_updated_questions", { status: "reviewed" }, 30, 0)).items.find((i: any) => i.question_id === q1)).toBeUndefined();
    expect((await rpc(REVIEWER, "app_updated_questions", { area: "inexistente" }, 30, 0)).total).toBe(0);
    await expect(rpc(STUDENT, "app_updated_questions", {}, 30, 0)).rejects.toThrow(/restrito/);
  });

  it("conflito entre fontes oficiais vigentes: aparece como conflito e impede 'evidência pronta'", async () => {
    const s = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Outro documento SINTÉTICO', 'Outro órgão de teste', 'final', '1', 'A') returning id`))[0].id;
    const cur = (await sql(`select id from public.ch_sources where title = 'Documento SINTÉTICO fechamento' and status = 'current'`))[0].id;
    await rpc(ADMIN, "app_ch_set_source_authority", cur, "A");
    const pv = (await sql(`select id from public.ch_source_passages where source_id = $1`, [cur]))[0].id;
    const po = (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2) returning id`, [s, `${statement1} Em outra orientação, a conduta é diferente.`]))[0].id;
    await rpc(ADMIN, "app_ch_link_evidence", claim1, { source_id: cur, passage_id: pv, quote: statement1, verdict: "compatible", page: 1 });
    expect((await sql(`select public.question_evidence_ready($1) r`, [q1]))[0].r).toBe(true);
    await rpc(ADMIN, "app_ch_link_evidence", claim1, { source_id: s, passage_id: po, quote: `${statement1} Em outra orientação, a conduta é diferente.`, verdict: "conflicting", page: 1 });
    expect((await sql(`select public.question_evidence_ready($1) r`, [q1]))[0].r).toBe(false);
    const conflicts = await rpc(ADMIN, "app_question_conflicts");
    expect(conflicts.find((c: any) => c.claim_id === claim1).sources.map((x: any) => x.verdict).sort()).toEqual(["compatible", "conflicting"]);
  });
});

describe("Motivos declarados pelo aluno", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie6b-"));
  let dev: DevDatabase;
  const S = "00000000-0000-4000-8000-0000000000a1";
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    for (const st of buildEngineStatements()) await dev.db.exec(st);
    await dev.db.exec(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`); // CC19: o aluno só recebe com o modo sombra desligado e a publicação ligada
    await dev.db.query(`insert into auth.users (id, email) values ($1, 's@t.dev')`, [S]);
  }, 300_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it("conta só o que o aluno declarou no caderno de erros, nas questões que ele errou", async () => {
    const qs = (await sql(`select id, correct_option from public.questions where status <> 'annulled' order by id limit 3`));
    for (const q of qs) await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, $3)`, [S, q.id, ["A", "B", "C", "D"].find((x) => x !== q.correct_option)]);
    await sql(`insert into public.error_notes (user_id, question_id, reason) values ($1, $2, 'conhecimento'), ($1, $3, 'conhecimento'), ($1, $4, 'atencao')`, [S, qs[0].id, qs[1].id, qs[2].id]);
    const r = (await dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: S })]);
      return (await tx.query<any>(`select public.app_error_reasons(90) r`)).rows;
    }))[0].r;
    expect(r).toEqual({ wrong_questions: 3, declared: { conhecimento: 2, atencao: 1 } });
  });
});
