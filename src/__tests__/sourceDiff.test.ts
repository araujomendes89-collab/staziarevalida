// @vitest-environment node
/**
 * SQIE fase 3: comparação de CONTEÚDO entre versões de uma fonte e impacto por afirmação.
 * Textos e fontes abaixo são SINTÉTICOS (só testam o caminho); não há acervo oficial real cadastrado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { claimImpacts, diffPassages, negationsOf, numbersOf, snapshotPassages } from "../../server/contentHub/sourceDiff";
import { compareSourceVersions, worstPerClaim } from "../../server/contentHub/sourceCompare";
import { createContentHubWorker } from "../../server/contentHub/worker";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import type { PipelineDeps } from "../../server/contentHub/pipeline";

const P = (text: string, id?: string) => ({ id, text });

describe("Comparador de conteúdo (puro)", () => {
  it("lê números com unidade e negações", () => {
    expect(numbersOf("Usar 10 mg/kg/dia por 5 dias, máximo 500 mg.")).toEqual(["10mg/kg/dia", "5dias", "500mg"].sort());
    expect(numbersOf("Repetir a cada dois anos")).toEqual(["dois"]);
    expect(negationsOf("Não usar em menores de 2 anos; contraindicado na gestação.")).toEqual(["contraindicado", "nao"]);
    expect(negationsOf("Usar em adultos com febre persistente.")).toEqual([]);
  });

  it("separa forma de sentido: idêntico, editorial, redação, número, negação, reescrita, removido, novo", () => {
    const base = "O rastreamento do câncer de colo do útero deve começar aos 25 anos em mulheres que já iniciaram atividade sexual.";
    const oldP = [
      P(base),
      P("Amoxicilina 50 mg/kg/dia dividida em três tomadas por dez dias na otite média aguda."),
      P("Gestantes devem receber a vacina dTpa a cada gestação entre vinte e sete e trinta e seis semanas."),
      P("A orientação anterior tratava a hipertensão arterial com diurético tiazídico como primeira escolha."),
      P("Parágrafo antigo sobre um tema que deixou de constar do documento oficial desta publicação específica."),
    ];
    const newP = [
      P(base.replace("anos em", "anos, em")),
      P("Amoxicilina 90 mg/kg/dia dividida em três tomadas por dez dias na otite média aguda."),
      P("Gestantes não devem receber a vacina dTpa a cada gestação entre vinte e sete e trinta e seis semanas."),
      P("Hipertensão arterial: nova diretriz com combinação inicial de dois fármacos em dose fixa para todos os adultos."),
      P("Capítulo novo sobre telemedicina na atenção primária e registro no prontuário eletrônico do paciente."),
    ];
    const d = diffPassages(oldP, newP);
    const kinds = d.items.map((i) => i.kind);
    expect(kinds.slice(0, 3)).toEqual(["EDITORIAL", "NUMERIC", "NEGATION"]);
    expect(d.summary.REMOVED + d.summary.SUBSTANTIVE).toBeGreaterThanOrEqual(1);
    expect(d.summary.ADDED + d.summary.SUBSTANTIVE).toBeGreaterThanOrEqual(1);
    expect(d.items[1].critical).toBe(true);
    expect(d.items[2].critical).toBe(true);
    expect(d.items[0].critical).toBe(false);
    expect(diffPassages([P(base)], [P(base)]).summary.UNCHANGED).toBe(1);
  });

  it("impacto por afirmação: trecho idêntico = sem impacto; número mudou = reanálise crítica; não localizado = indeterminado", () => {
    const a = "Dose de ataque de 10 mg por via oral em dose única na primeira consulta de acompanhamento ambulatorial.";
    const b = "Intervalo de rastreamento de dois anos para mulheres entre cinquenta e sessenta e nove anos de idade.";
    const oldP = [P(a, "pa"), P(b, "pb")];
    const newP = [P(a.replace("10 mg", "20 mg")), P(b)];
    const diff = diffPassages(oldP, newP);
    const imp = claimImpacts(
      [
        { evidenceId: "e1", claimId: "c1", passageId: "pa", quote: "Dose de ataque de 10 mg por via oral" },
        { evidenceId: "e2", claimId: "c2", quote: "intervalo de rastreamento de dois anos" },
        { evidenceId: "e3", claimId: "c3", quote: "algo que nunca esteve no texto comparado" },
      ],
      oldP,
      diff,
    );
    expect(imp.map((i) => [i.claimId, i.level, i.critical, i.kind])).toEqual([
      ["c1", "UNDETERMINED", true, "NUMERIC"],
      ["c2", "NO_IMPACT", false, "UNCHANGED"],
      ["c3", "UNDETERMINED", true, "NOT_LOCATED"],
    ]);
    // várias evidências da mesma afirmação: vale a pior
    const worst = worstPerClaim([...imp, { ...imp[1], claimId: "c1", evidenceId: "e9" }]);
    expect(worst.find((i) => i.claimId === "c1")?.level).toBe("UNDETERMINED");
  });

  it("leitura de página: só parágrafos de texto, sem script nem menu", () => {
    const html = `<html><script>x()</script><nav>Menu</nav><p>Este é um parágrafo suficientemente longo de uma página oficial sintética.</p><p>curto</p><div>Outro parágrafo igualmente longo para a leitura da página de teste.</div></html>`;
    expect(snapshotPassages(html, "text/html").map((p) => p.text)).toEqual([
      "Este é um parágrafo suficientemente longo de uma página oficial sintética.",
      "Outro parágrafo igualmente longo para a leitura da página de teste.",
    ]);
  });
});

describe("Comparação no banco e vigia (fontes sintéticas)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie3-"));
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
  let q1: string, q3: string, claim1: string, claim3: string, v1: string, v2: string;

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    for (const st of buildEngineStatements()) await dev.db.exec(st);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 's@t.dev')`, [ADMIN, STUDENT]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    const qs = (await sql(`select question_id from public.question_claims where role = 'solves' order by question_id limit 40`)).map((r) => r.question_id);
    [q1, q3] = [qs[0], qs[20]];
    claim1 = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q1]))[0].claim_id;
    claim3 = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q3]))[0].claim_id;
    for (const q of [q1, q3]) {
      const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash, reviewed_at, temporal_status)
        values ($1, 1, 'Pergunta de teste', 'published', 'modelo-de-teste', 'x', now(), 'CURRENT') returning id`, [q]))[0];
      void a;
    }
  }, 300_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const statement = async (id: string) => (await sql(`select statement from public.ch_claims where id = $1`, [id]))[0].statement as string;

  it("duas versões da fonte: só a afirmação cujo trecho mudou vira crítica; o trecho idêntico só pede confirmação", async () => {
    v1 = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Documento SINTÉTICO fase 3', 'Órgão de teste', 'final', '1', 'A') returning id`))[0].id;
    const [s1, s3] = [await statement(claim1), await statement(claim3)];
    const pass = async (src: string, text: string, page: number) => (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, $2, $3) returning id`, [src, page, text]))[0].id as string;
    const p1 = await pass(v1, `${s1} Dose habitual de 10 mg uma vez ao dia.`, 1);
    const p3 = await pass(v1, `${s3} Conduta mantida sem alterações nesta seção do documento.`, 2);
    await db.service("ch_worker_link_evidence", { p_claim_id: claim1, p_evidence: { source_id: v1, passage_id: p1, quote: s1, verdict: "compatible", model: "teste" } });
    await db.service("ch_worker_link_evidence", { p_claim_id: claim3, p_evidence: { source_id: v1, passage_id: p3, quote: s3, verdict: "compatible", model: "teste" } });
    // nova versão cadastrada → a fila nasce "indeterminada" para as duas
    v2 = (await as(ADMIN, (q) => q(`select public.app_ch_register_source('{"title":"Documento SINTÉTICO fase 3","organ":"Órgão de teste","kind":"final","version":"2"}'::jsonb) r`)))[0].r.id;
    expect((await sql(`select impact_level, status from public.question_updates where old_source_id = $1`, [v1])).every((u) => u.impact_level === "UNDETERMINED" && u.status === "queued")).toBe(true);
    await pass(v2, `${s1} Dose habitual de 20 mg uma vez ao dia.`, 1);
    await pass(v2, `${s3} Conduta mantida sem alterações nesta seção do documento.`, 2);

    const r = await compareSourceVersions(db, v1, v2);
    expect(r.claims).toBe(2);
    const rows = await sql(`select question_id, impact_level, status, critical, triage_kind, diff_id from public.question_updates where old_source_id = $1 order by question_id`, [v1]);
    const of = (q: string) => rows.filter((u) => u.question_id === q);
    expect(of(q1).length).toBeGreaterThan(0);
    for (const u of of(q1)) expect(u).toMatchObject({ impact_level: "UNDETERMINED", status: "review_required", critical: true, triage_kind: "NUMERIC" });
    for (const u of of(q3)) expect(u).toMatchObject({ impact_level: "NO_IMPACT", status: "review_required", critical: false, triage_kind: "UNCHANGED" });
    expect(rows.every((u) => u.diff_id)).toBe(true);
    // nada é decidido sozinho: continua exigindo revisão e a atualidade segue "requer revisão médica"
    expect((await sql(`select temporal_status from public.question_analysis where question_id = $1 and is_current`, [q1]))[0].temporal_status).toBe("REQUIRES_MEDICAL_REVIEW");
  });

  it("repetir a comparação não reescreve a triagem já feita; painel e leitura mostram os críticos; aluno não vê nada", async () => {
    const before = (await sql(`select count(*)::int n from public.ch_source_diffs`))[0].n;
    await compareSourceVersions(db, v1, v2);
    expect((await sql(`select count(*)::int n from public.ch_source_diffs`))[0].n).toBe(before + 1);
    expect((await sql(`select count(distinct diff_id)::int n from public.question_updates where old_source_id = $1`, [v1]))[0].n).toBe(1);
    const s = (await as(ADMIN, (q) => q(`select public.app_question_update_summary() r`)))[0].r;
    expect(s.critical_open).toBeGreaterThan(0);
    expect(s.with_content_diff).toBeGreaterThan(s.critical_open - 1);
    const diffs = (await as(ADMIN, (q) => q(`select public.app_source_diffs($1) r`, [v1])))[0].r;
    expect(diffs[0].items.map((i: any) => i.kind)).toContain("NUMERIC");
    expect(diffs[0].items.every((i: any) => i.kind !== "UNCHANGED")).toBe(true);
    const k = (await as(ADMIN, (q) => q(`select public.app_question_knowledge($1) r`, [q1])))[0].r;
    expect(k.updates[0]).toMatchObject({ critical: true, triage_kind: "NUMERIC" });
    await expect(as(STUDENT, (q) => q(`select public.app_source_diffs($1)`, [v1]))).rejects.toThrow(/restrito/);
    expect(await as(STUDENT, (q) => q(`select * from public.ch_source_diffs`))).toEqual([]);
    await expect(as(STUDENT, (q) => q(`select public.ch_worker_record_source_diff('{}'::jsonb)`))).rejects.toThrow();
  });

  it("predecessora: a função do worker aponta a versão que foi substituída", async () => {
    expect(await db.service("ch_worker_predecessor_source", { p_source_id: v2 })).toBe(v1);
    expect(await db.service("ch_worker_predecessor_source", { p_source_id: v1 })).toBeNull();
  });

  it("comparar versão sem trechos cadastrados é recusado (não finge que comparou)", async () => {
    const empty = (await sql(`insert into public.ch_sources (title, organ, kind, version) values ('Sem trechos', 'Órgão de teste', 'final', '1') returning id`))[0].id;
    await expect(compareSourceVersions(db, v1, empty)).rejects.toThrow(/trechos/);
  });

  it("vigia (página HTML): mudou o texto → compara com a leitura anterior e tria as afirmações; PDF fica só com a impressão digital", async () => {
    const src = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, url) values ('Página oficial SINTÉTICA', 'Órgão de teste', 'final', '1', 'A', 'https://exemplo.invalid/p') returning id`))[0].id;
    const s = await statement(claim3);
    await db.service("ch_worker_link_evidence", { p_claim_id: claim3, p_evidence: { source_id: src, quote: s, verdict: "compatible", model: "teste" } });
    await as(ADMIN, (q) => q(`select public.app_ch_watch_source($1, 'https://exemplo.invalid/p', 7)`, [src]));
    let html = `<p>${s} Prazo de dois dias entre as doses nesta página oficial sintética.</p>`;
    const fetchImpl = (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const deps = { db, storage: null, ai: { provider: null, status: { ready: false } }, renderer: null } as unknown as PipelineDeps;
    const worker = createContentHubWorker(deps, { fetchImpl, resolver: async () => ["93.184.216.34"] });
    expect(await worker.checkSources()).toMatchObject({ checked: 1, changed: 0 });
    expect(await sql(`select 1 from public.ch_source_diffs where source_id = $1`, [src])).toHaveLength(0);
    html = `<p>${s} Prazo de cinco dias entre as doses nesta página oficial sintética.</p>`;
    await sql(`update public.ch_source_watch set next_check_at = now() where source_id = $1`, [src]);
    expect(await worker.checkSources()).toMatchObject({ checked: 1, changed: 1 });
    const d = (await sql(`select origin, summary from public.ch_source_diffs where source_id = $1`, [src]))[0];
    expect(d.origin).toBe("snapshot");
    expect(d.summary.critical).toBeGreaterThan(0);
    const u = await sql(`select impact_level, critical, status from public.question_updates where old_source_id = $1`, [src]);
    expect(u.length).toBeGreaterThan(0);
    for (const x of u) expect(x).toMatchObject({ impact_level: "UNDETERMINED", critical: true, status: "review_required" });
    // a leitura guardada pelo vigia não vai para o navegador
    const listed = (await as(ADMIN, (q) => q(`select public.app_ch_sources() r`)))[0].r.find((x: any) => x.id === src);
    expect(listed.watch.snapshot).toBeUndefined();
    expect(listed).toMatchObject({ freshness: "SOURCE_CHANGED", changes: 1, diffs: 1 });
  });

  it("frescor e ciclo da mudança: não monitorada → conferida → mudou → analisada (evidência continua exigindo reconferência)", async () => {
    const fresh = async (id: string) => (await as(ADMIN, (q) => q(`select public.app_ch_sources() r`)))[0].r.find((x: any) => x.id === id).freshness;
    const page = (await sql(`select id from public.ch_sources where title = 'Página oficial SINTÉTICA'`))[0].id;
    const plain = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Fonte SINTÉTICA sem vigia', 'Órgão de teste', 'final', '1', 'A') returning id`))[0].id;
    expect(await fresh(plain)).toBe("UNKNOWN");
    await as(ADMIN, (q) => q(`select public.app_ch_watch_source($1, 'https://exemplo.invalid/x.pdf', 7)`, [plain]));
    expect(await fresh(plain)).toBe("CHECK_DUE");
    await db.service("ch_worker_watch_result", { p_source_id: plain, p_hash: "a".repeat(64), p_status: "ok" });
    expect(await fresh(plain)).toBe("FRESH");
    expect((await sql(`select freshness_status from public.ch_sources where id = $1`, [plain]))[0].freshness_status).toBe("FRESH");
    await db.service("ch_worker_watch_result", { p_source_id: plain, p_hash: null, p_status: "unreachable" });
    expect(await fresh(plain)).toBe("CHECK_DUE");
    await sql(`update public.ch_source_watch set next_check_at = now() - interval '1 day', last_status = 'ok' where source_id = $1`, [plain]);
    expect(await fresh(plain)).toBe("CHECK_DUE"); // prazo vencido

    // a página que mudou: só uma pessoa encerra, com nota; a evidência antiga continua desatualizada
    await expect(as(STUDENT, (q) => q(`select public.app_ch_resolve_source_change($1, 'analisei a mudança toda')`, [page]))).rejects.toThrow();
    await expect(as(ADMIN, (q) => q(`select public.app_ch_resolve_source_change($1, 'ok')`, [page]))).rejects.toThrow(/analisado/);
    expect((await as(ADMIN, (q) => q(`select public.app_ch_resolve_source_change($1, 'Prazo entre as doses mudou; questões enviadas à revisão.') r`, [page])))[0].r).toBe(1);
    expect(await fresh(page)).toBe("REVIEW_REQUIRED");
    expect((await sql(`select stale from public.ch_evidence where source_id = $1`, [page])).every((e) => e.stale)).toBe(true);
    await expect(as(ADMIN, (q) => q(`select public.app_ch_resolve_source_change($1, 'de novo, sem mudança pendente')`, [page]))).rejects.toThrow(/pendente/);
    // nova conferência da evidência (pessoa/worker) devolve o frescor
    await db.service("ch_worker_link_evidence", { p_claim_id: claim3, p_evidence: { source_id: page, quote: await statement(claim3), verdict: "compatible", model: "teste" } });
    expect(await fresh(page)).toBe("FRESH");
  });

  it("registro da fonte: só administrador; país validado; campos gravados e auditados", async () => {
    const id = (await sql(`select id from public.ch_sources where title = 'Fonte SINTÉTICA sem vigia'`))[0].id;
    const fields = { country: "BR", applies_to_sus: true, specialty: "Pediatria", theme: "Imunização", effective_date: "2025-03-01", revision_date: "2025-06-15", update_in_progress: true };
    await expect(as(STUDENT, (q) => q(`select public.app_ch_set_source_registry($1, $2::jsonb)`, [id, JSON.stringify(fields)]))).rejects.toThrow();
    await expect(as(ADMIN, (q) => q(`select public.app_ch_set_source_registry($1, '{"country":"Brasil"}'::jsonb)`, [id]))).rejects.toThrow(/sigla/);
    await as(ADMIN, (q) => q(`select public.app_ch_set_source_registry($1, $2::jsonb)`, [id, JSON.stringify(fields)]));
    const row = (await sql(`select country, applies_to_sus, specialty, theme, effective_date::text, revision_date::text, update_in_progress from public.ch_sources where id = $1`, [id]))[0];
    expect(row).toEqual(fields);
    // atualização parcial não apaga o resto
    await as(ADMIN, (q) => q(`select public.app_ch_set_source_registry($1, '{"update_in_progress":false}'::jsonb)`, [id]));
    expect((await sql(`select specialty, update_in_progress from public.ch_sources where id = $1`, [id]))[0]).toEqual({ specialty: "Pediatria", update_in_progress: false });
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'source.registry' and target = $1`, [id]))[0].n).toBe(2);
  });
});
