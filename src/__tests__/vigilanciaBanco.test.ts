// @vitest-environment node
/**
 * Vigilância científica no banco (migrações 9940, 9941 e 9960), com o processamento de verdade (worker) e uma "internet" que
 * só serve arquivos REAIS (src/__tests__/fixtures/vigilancia). Fontes, questão e trecho reais (reais.json). Sem chave de IA.
 *   vigia: mudança só quando o conteúdo muda; data da página não conta; PDF com o mesmo texto não conta; 304; fora do ar.
 *   retratação: bloqueia a evidência e manda o que dependia para revisão.
 *   regras de publicação automática: a automação nunca muda o clínico; o gabarito oficial nunca por automação.
 *   contrato do painel, aluno e anônimo barrados, dossiê por tema, documento novo por página-índice e o portão.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";
import { fakeWeb } from "./helpers/fontesFixtures";
import { createContentHubWorker } from "../../server/contentHub/worker";
import { indexItems } from "../../server/contentHub/vigilance/pageFacts";
import { parseCrossref } from "../../server/contentHub/vigilance/crossref";

vi.setConfig({ testTimeout: 120_000 });

const FX = path.join(__dirname, "fixtures/vigilancia");
const REAIS = JSON.parse(fs.readFileSync(path.join(FX, "reais.json"), "utf8"));
const page = (f: string) => zlib.gunzipSync(fs.readFileSync(path.join(FX, "paginas", f))).toString("utf8");
const crossref = (f: string) => JSON.parse(fs.readFileSync(path.join(FX, "crossref", f), "utf8"));
const INEP_URL = "https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/revalida/provas-e-gabaritos/2025";
const NT_URL = "https://www.gov.br/saude/pt-br/assuntos/notas-tecnicas/2025/nota-tecnica-no-626-2025-cgcan-decan-saes-ms.pdf";
const INEP_HTML = page("inep-revalida-provas-2025.html.gz");
const BEFORE_HTML = INEP_HTML.replace(/<a [^>]*href="https:\/\/download\.inep\.gov\.br\/revalida\/provas_e_gabaritos\/2025_2_gabarito_caderno_1\.pdf"[^>]*>[\s\S]*?<\/a>/, "");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vigilancia-"));
let t: FontesDb;
const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
const admin = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.adminUser, fn, args);
const editor = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.editorUser, fn, args);
const student = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.studentUser, fn, args);
const fonte = (id: string) => REAIS.fontes.find((f: any) => f.id === id);

async function register(f: { titulo: string; instituicao: string; url: string; versao?: string | null }, level = "A") {
  const r = await admin("app_ch_register_source", { p_source: { title: f.titulo, organ: f.instituicao, kind: "final", url: f.url, version: f.versao ?? null, editorial_approved: true } });
  await admin("app_ch_set_source_authority", { p_source_id: r.id, p_level: level }).catch(() => undefined);
  return r.id as string;
}
const worker = (web: ReturnType<typeof fakeWeb>) => createContentHubWorker({ db: t.db } as any, { fetchImpl: web, checkHost: async () => {} });
const due = (id: string) => sql("update public.ch_source_watch set next_check_at = now() - interval '1 minute', checking_since = null where source_id = $1", [id]);
const watchRow = async (id: string) => (await sql("select * from public.ch_source_watch where source_id = $1", [id]))[0];
/** itens da fila da fonte (sem o aviso "fonte nova" que todo cadastro gera) */
const items = async (id: string) => sql("select * from public.ch_vigilance_items where source_id = $1 and kind <> 'fonte_nova' order by detected_at", [id]);
const allItems = async (id: string) => sql("select * from public.ch_vigilance_items where source_id = $1 order by detected_at", [id]);

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
}, 300_000);
afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

describe("vigia (estende ch_source_watch, sem IA)", () => {
  let inep: string;
  it("frequência pelo site: Inep todo dia; link fora da lista não é baixado", async () => {
    inep = await register({ titulo: "Revalida: provas e gabaritos 2025 (página do Inep)", instituicao: "Inep", url: INEP_URL });
    await admin("app_ch_watch_source", { p_source_id: inep, p_url: INEP_URL, p_interval_days: 30 });
    const w = await watchRow(inep);
    expect(w.interval_days).toBe(1); // a regra do site manda (www.gov.br/inep = 1 dia), não os 30 pedidos
    expect((await sql("select address from public.ch_official_domains where id = $1", [w.domain_id]))[0].address).toBe("www.gov.br/inep");
  });

  it("primeira leitura vira base; trocar só a data da página não é mudança; link novo é versão nova", async () => {
    const web1 = fakeWeb({ [INEP_URL]: { headers: { "content-type": "text/html; charset=utf-8", etag: '"v1"' }, body: BEFORE_HTML } });
    expect(await worker(web1).checkSources()).toEqual({ checked: 1, changed: 0, unreachable: 0 });
    expect((await watchRow(inep)).hash_method).toBe("html-texto-v2");

    await due(inep);
    const sameButDate = BEFORE_HTML.replace("20/07/2026 12h34", "13/10/2026 08h05");
    const web2 = fakeWeb({ [INEP_URL]: { headers: { "content-type": "text/html; charset=utf-8" }, body: sameButDate } });
    expect((await worker(web2).checkSources()).changed).toBe(0);
    expect(web1.calls[0].headers["If-None-Match"]).toBeUndefined();
    expect(await items(inep)).toEqual([]);

    await due(inep);
    const web3 = fakeWeb({ [INEP_URL]: { headers: { "content-type": "text/html; charset=utf-8" }, body: INEP_HTML } });
    expect((await worker(web3).checkSources()).changed).toBe(1);
    const it = (await items(inep))[0];
    expect(it.kind).toBe("nova_versao");
    expect(it.version_candidates).toEqual([{ url: "https://download.inep.gov.br/revalida/provas_e_gabaritos/2025_2_gabarito_caderno_1.pdf", titulo: "Prova Objetiva – Revalida 2025/2 — Gabarito do caderno 01", data: null, ato: null }]);
    const ch = (await sql("select * from public.ch_source_changes where source_id = $1", [inep]))[0];
    expect(ch.version_candidates).toHaveLength(1);
  });

  it("pedido condicional: 304 não baixa de novo e não é mudança", async () => {
    await sql("update public.ch_source_watch set etag = '\"v2\"' where source_id = $1", [inep]);
    await due(inep);
    const web = fakeWeb({ [INEP_URL]: { status: 304 } });
    expect(await worker(web).checkSources()).toEqual({ checked: 1, changed: 0, unreachable: 0 });
    expect(web.calls[0].headers["If-None-Match"]).toBe('"v2"');
  });

  it("fora do ar duas vezes seguidas vira item; voltou, o item fecha sozinho", async () => {
    await due(inep);
    await worker(fakeWeb({})).checkSources();
    expect((await items(inep)).filter((i) => i.kind === "fora_do_ar")).toHaveLength(0);
    await due(inep);
    await worker(fakeWeb({})).checkSources();
    const open = (await items(inep)).filter((i) => i.kind === "fora_do_ar");
    expect(open).toHaveLength(1);
    expect(open[0].summary).toMatch(/não respondeu em 2 conferências seguidas \(HTTP 404\)/);
    await due(inep);
    await worker(fakeWeb({ [INEP_URL]: { headers: { "content-type": "text/html" }, body: INEP_HTML } })).checkSources();
    expect((await items(inep)).find((i) => i.kind === "fora_do_ar").status).toBe("resolvida");
  });

  it("PDF real: cópia com bytes diferentes e o MESMO texto (Nota Técnica 626/2025) não é mudança", async () => {
    const nt = await register({ titulo: "Nota Técnica nº 626/2025-CGCAN/DECAN/SAES/MS", instituicao: "Ministério da Saúde", url: NT_URL });
    await admin("app_ch_watch_source", { p_source_id: nt, p_url: NT_URL, p_interval_days: 1 });
    const pdf = (f: string) => ({ headers: { "content-type": "application/pdf" }, body: fs.readFileSync(path.join(FX, "pdf", f)) });
    await worker(fakeWeb({ [NT_URL]: pdf("nt-626-2025-pdfium.pdf") })).checkSources();
    expect((await watchRow(nt)).text_hash).toMatch(/^[0-9a-f]{64}$/);
    await due(nt);
    const r = await worker(fakeWeb({ [NT_URL]: pdf("nt-626-2025-wkhtmltopdf.pdf") })).checkSources();
    expect(r.changed).toBe(0);
    expect(await items(nt)).toEqual([]);
  });

  it("tarefa antiga do Cloud Run continua funcionando (ch_worker_watch_result) sem acusar mudança falsa", async () => {
    const before = await watchRow(inep);
    const r = await t.db.service<any>("ch_worker_watch_result", { p_source_id: inep, p_hash: "a".repeat(64), p_status: "ok" });
    expect(r.changed).toBe(false); // método diferente (antigo): vira base nova
    expect((await watchRow(inep)).hash_method).toBeNull();
    expect(before.hash_method).toBe("html-texto-v2");
  });
});

describe("retratação (Crossref) e confiabilidade", () => {
  let ic: string, lancet: string, claim: string;
  it("cadeia real: questão ENAMED 2025 Q1 → afirmação → evidência no PCDT de IC (p. 13) → fonte", async () => {
    const f = fonte("ms-pcdt-ic-fer-2024");
    ic = await register(f);
    const q = REAIS.questao;
    await sql("insert into public.exams (id, kind, year, title) values ('enamed-2025', 'ENAMED', 2025, 'ENAMED 2025') on conflict do nothing");
    await sql(`insert into public.questions (id, code, exam_id, number, area, specialty, topic, subtopic, statement, options, correct_option)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (id) do nothing`,
      [q.id, q.code, q.exam_id, q.number, q.area, q.specialty, q.topic, q.subtopic, q.statement, JSON.stringify(q.options), q.correct_option]);
    const quote = "No Brasil, o único antagonista da aldosterona disponível é a espironolactona, o qual está disponível no SUS.";
    expect(REAIS.pcdt_ic_pagina_13.replace(/\s+/g, " ")).toContain(quote);
    claim = (await sql(`insert into public.ch_claims (statement, origin, status) values ($1, 'manual', 'compatible') returning id`, [q.options[0].explanation]))[0].id;
    await sql("insert into public.question_claims (question_id, claim_id) values ($1, $2)", [q.id, claim]);
    await sql("insert into public.ch_evidence (claim_id, source_id, page, quote, verdict, source_version) values ($1, $2, 13, $3, 'compatible', $4)", [claim, ic, quote, f.versao]);
    const quality = await admin("app_admin_source_quality", { p_source_id: ic });
    // pontos: cada dimensão vai de 0 ao peso; total = soma (correspondência clínica nula no nível da fonte)
    expect(quality.dimensoes).toMatchObject({ autenticidade: 25, correspondencia_clinica: null });
    const soma = ["autenticidade", "situacao_normativa", "metodologia", "rastreabilidade"].reduce((n, k) => n + Number(quality.dimensoes[k]), 0);
    expect(Number(quality.total)).toBeCloseTo(soma, 1);
    expect(quality).toMatchObject({ quarentena: false, bloqueada: false, retratada: false, retratacao: null, sobreposicao: null });
  });

  it("artigo retratado real (Lancet 2020): sai das vigentes, evidência desatualizada, nenhuma evidência nova o sustenta", async () => {
    const cr = crossref("retratado-lancet-2020.json").message.items[0];
    lancet = await register({ titulo: cr.title[0], instituicao: cr.publisher, url: "https://doi.org/10.1016/S0140-6736(20)31180-6" }, "D");
    await sql("update public.ch_sources set doi = '10.1016/s0140-6736(20)31180-6' where id = $1", [lancet]);
    const c2 = (await sql("insert into public.ch_claims (statement, origin, status) values ($1, 'manual', 'compatible') returning id", [cr.title[0]]))[0].id;
    await sql("insert into public.question_claims (question_id, claim_id) values ($1, $2)", [REAIS.questao.id, c2]);
    await sql("insert into public.ch_evidence (claim_id, source_id, quote, verdict) values ($1, $2, $3, 'compatible')", [c2, lancet, cr.title[0]]);
    const dueIds = await t.db.service<any[]>("ch_worker_identifiers_due", { p_limit: 20 });
    expect(dueIds.map((d) => d.source_id)).toContain(lancet);
    await t.db.service("ch_worker_identifier_report", { p_source_id: lancet, p_report: parseCrossref(crossref("retratado-lancet-2020.json"), "10.1016/s0140-6736(20)31180-6") });
    const s = (await sql("select status, retracted_at::text, retraction_notice_doi from public.ch_sources where id = $1", [lancet]))[0];
    expect(s).toEqual({ status: "withdrawn", retracted_at: "2020-06-05", retraction_notice_doi: "10.1016/s0140-6736(20)31324-6" });
    expect((await sql("select stale from public.ch_evidence where source_id = $1", [lancet])).every((e: any) => e.stale)).toBe(true);
    expect((await sql("select status from public.ch_claims where id = $1", [c2]))[0].status).toBe("needs_review");
    expect((await sql("select count(*)::int n from public.question_updates where old_source_id = $1", [lancet]))[0].n).toBe(1);
    // processamento: nova evidência entra só como "insuficiente"; pessoa da equipe: recusa com o motivo
    await sql("insert into public.ch_evidence (claim_id, source_id, quote, verdict) values ($1, $2, $3, 'compatible')", [c2, lancet, cr.title[0]]);
    expect((await sql("select verdict, numeric_check ->> 'fonte_bloqueada' b from public.ch_evidence where source_id = $1 and not stale", [lancet]))[0]).toEqual({ verdict: "insufficient", b: "retratada" });
    await expect(admin("app_ch_link_evidence", { p_claim_id: c2, p_evidence: { source_id: lancet, quote: cr.title[0], verdict: "compatible" } })).rejects.toThrow(/retirada|retratada/);
    const q = await admin("app_admin_source_quality", { p_source_id: lancet });
    expect(q).toMatchObject({ bloqueada: true, retratada: true, retratacao: { data: "2020-06-05" } });
    const fila = await admin("app_admin_vigilance_queue", { p_filter: "retratadas" });
    expect(fila.items[0]).toMatchObject({ tipo: "retratada", situacao: "pendente", fonte: { id: lancet, status: "withdrawn", nivel: "D" }, questoes_afetadas: 1 });
    await expect(admin("app_admin_vigilance_mark", { p_id: fila.items[0].id, p_action: "desbloquear", p_note: "tentativa de desbloqueio" })).rejects.toThrow(/retratado continua bloqueado/);
  });

  it("diretrizes reais do catálogo seguem 'ok' no Crossref (DOI confirmado, sem bloqueio)", async () => {
    const sbc = await register({ titulo: "Diretriz Brasileira de Hipertensão Arterial – 2025", instituicao: "Sociedade Brasileira de Cardiologia", url: "https://abccardiol.org/article/diretriz-brasileira-de-hipertensao-arterial-2025/" }, "B");
    await sql("update public.ch_sources set doi = '10.36660/abc.20250624' where id = $1", [sbc]);
    await t.db.service("ch_worker_identifier_report", { p_source_id: sbc, p_report: parseCrossref(crossref("sbc-hipertensao-2025.json"), "10.36660/abc.20250624") });
    expect((await sql("select crossref_status from public.ch_source_vigilance where source_id = $1", [sbc]))[0].crossref_status).toBe("ok");
    expect((await sql("select status from public.ch_sources where id = $1", [sbc]))[0].status).toBe("current");
  });

  it("bloquear na fila bloqueia a FONTE (editor pode); desbloquear devolve a vigente", async () => {
    const it = (await items((await sql("select source_id from public.ch_vigilance_items where kind = 'nova_versao' limit 1"))[0].source_id))[0];
    await expect(editor("app_admin_vigilance_mark", { p_id: it.id, p_action: "bloquear", p_note: "curta" })).rejects.toThrow(/pelo menos 10/);
    const r = await editor("app_admin_vigilance_mark", { p_id: it.id, p_action: "bloquear", p_note: "Página mudou: conferir antes de usar." });
    expect(r).toMatchObject({ situacao: "bloqueada", fonte: { status: "withdrawn" } });
    const r2 = await editor("app_admin_vigilance_mark", { p_id: it.id, p_action: "desbloquear", p_note: null });
    expect(r2).toMatchObject({ situacao: "resolvida", fonte: { status: "current" } });
    expect((await sql("select count(*)::int n from public.admin_audit_log where action = 'vigilance.mark'"))[0].n).toBeGreaterThanOrEqual(2);
  });

  it("quarentena: fonte sem origem conferível; a equipe decide com nota", async () => {
    const semOrigem = (await sql("insert into public.ch_sources (title, organ, kind, authority_level) values ('Protocolo Clínico e Diretrizes Terapêuticas da Insuficiência Cardíaca com Fração de Ejeção Reduzida (cópia sem link)', 'Ministério da Saúde (SAES e SECTICS)', 'final', 'A') returning id"))[0].id;
    expect((await admin("app_admin_source_quality", { p_source_id: semOrigem })).quarentena).toBe(true);
    await t.db.service("ch_worker_vigilance_sync");
    expect((await allItems(semOrigem)).map((i) => i.kind).sort()).toEqual(["fonte_nova", "quarentena"]);
    const q = await editor("app_admin_source_quality_override", { p_source_id: semOrigem, p_quarentena: false, p_note: "PDF conferido no site do MS pela equipe." });
    expect(q).toMatchObject({ quarentena: false, sobreposicao: { quarentena: false, por: "ed@t.dev" } });
    expect((await items(semOrigem)).find((i) => i.kind === "quarentena").status).toBe("resolvida");
  });
});

describe("regras de publicação automática (no banco)", () => {
  it("a vigilância nunca muda enunciado, alternativa ou justificativa", async () => {
    await expect(t.dev.db.transaction(async (tx) => {
      await tx.query("select set_config('staziamed.automacao', 'vigilancia', true)");
      await tx.query("update public.questions set expected_conduct = 'x' where id = $1", [REAIS.questao.id]);
    })).rejects.toThrow(/nunca muda por automação/);
  });
  it("gabarito oficial: nenhuma automação (chave de serviço) muda; pessoa da equipe registra", async () => {
    await expect(t.dev.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      await tx.query("insert into public.question_official_answers (question_id, answer, answer_status, source) values ($1, 'B', 'FINAL', 'teste')", [REAIS.questao.id]);
    })).rejects.toThrow(/Gabarito oficial do Inep/);
    await expect(t.dev.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      await tx.query("update public.questions set correct_option = 'B' where id = $1", [REAIS.questao.id]);
    })).rejects.toThrow(/Gabarito oficial do Inep/);
    expect((await sql("select correct_option from public.questions where id = $1", [REAIS.questao.id]))[0].correct_option).toBe("A");
  });
  it("a tabela 7 não deixa ligar automação clínica nem pelo editor SQL", async () => {
    await expect(sql("update public.ch_auto_change_policy set automatic = true where kind = 'gabarito_oficial'")).rejects.toThrow(/clinico_nunca/);
  });
});

describe("contrato do painel e acesso", () => {
  const fns: [string, Record<string, unknown>][] = [
    ["app_admin_vigilance_summary", {}], ["app_admin_vigilance_queue", {}], ["app_admin_vigilance_mark", { p_id: "00000000-0000-4000-8000-000000000000", p_action: "vista" }],
    ["app_admin_vigilance_set_interval", { p_domain: "www.gov.br/inep", p_interval_days: 2 }], ["app_admin_source_quality", { p_source_id: "00000000-0000-4000-8000-000000000000" }],
    ["app_admin_source_quality_override", { p_source_id: "00000000-0000-4000-8000-000000000000", p_quarentena: true, p_note: "xxxxxxxxxxxx" }],
    ["app_admin_vigilance_request_analysis", { p_item_id: "00000000-0000-4000-8000-000000000000" }], ["app_admin_topics", {}],
    ["app_admin_topic", { p_theme_node_id: "00000000-0000-4000-8000-000000000000" }], ["app_admin_vigilance_set_gate", { p_mode: "aviso" }], ["app_admin_index_pages", {}],
  ];
  it("aluno é barrado em todas as funções e não lê nenhuma tabela da vigilância", async () => {
    for (const [fn, args] of fns) await expect(student(fn, args), fn).rejects.toThrow(/restrito/i);
    const rows = await t.dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: t.STUDENT, role: "authenticated" })]);
      const n: number[] = [];
      for (const tb of ["ch_vigilance_items", "ch_source_vigilance", "ch_vigilance_config", "ch_auto_change_policy", "ch_topic_dossiers", "ch_topic_sources", "ch_index_pages"])
        n.push((await tx.query<any>(`select count(*)::int n from public.${tb}`)).rows[0].n);
      return n;
    });
    expect(rows.every((n) => n === 0)).toBe(true);
  });
  it("anônimo não executa nada", async () => {
    const r = await t.dev.db.query<any>(`select count(*)::int n from pg_proc p where p.proname like 'app_admin_vigilance%' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(r.rows[0].n).toBe(0);
  });
  it("resumo e frequência por site", async () => {
    const s = await editor("app_admin_vigilance_summary");
    for (const k of ["novas_fontes", "em_revisao", "bloqueadas", "quarentena", "vigiadas", "links_fora_do_ar", "proxima_verificacao", "ultima_execucao", "funcao_analise_ligada", "por_dominio"]) expect(s).toHaveProperty(k);
    expect(s.funcao_analise_ligada).toBe(false);
    expect(s.bloqueadas).toBeGreaterThanOrEqual(1);
    expect(await editor("app_admin_vigilance_set_interval", { p_domain: "www.gov.br/inep", p_interval_days: 2 })).toEqual({ dominio: "www.gov.br/inep", intervalo_dias: 2 });
    await expect(editor("app_admin_vigilance_set_interval", { p_domain: "www.gov.br/inep", p_interval_days: 91 })).rejects.toThrow(/1 a 90/);
  });
  it("pedir análise: só mudança/versão nova; função desligada = a mensagem do contrato", async () => {
    const nova = (await sql("select id from public.ch_vigilance_items where kind = 'nova_versao' limit 1"))[0].id;
    await expect(editor("app_admin_vigilance_request_analysis", { p_item_id: nova })).rejects.toThrow("A função 'Análise do que mudou' está desligada na Central de IAs.");
    const ret = (await sql("select id from public.ch_vigilance_items where kind = 'retratada' limit 1"))[0].id;
    await expect(editor("app_admin_vigilance_request_analysis", { p_item_id: ret })).rejects.toThrow(/só existe para mudança/);
    await sql("update public.ai_providers set enabled = true where id = 'anthropic'");
    await t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: "analise_mudancas", p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-sonnet-5-5" } } });
    const r = await editor("app_admin_vigilance_request_analysis", { p_item_id: nova });
    expect(r).toMatchObject({ pedido: true });
    expect((await sql("select step, status from public.ch_jobs where id = $1", [r.job_id]))[0]).toEqual({ step: "source_change_analysis", status: "queued" });
    await t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: "analise_mudancas", p_config: null });
  });
});

describe("vigilância por tema: dossiê, documento novo e portão", () => {
  let tb: string;
  it("dossiê da Tuberculose com as fontes reais da aula GR-001", async () => {
    tb = (await sql("select theme_node_id from public.ch_topic_dossiers d join public.ch_taxonomy_nodes n on n.id = d.theme_node_id where n.name = 'Tuberculose'"))[0].theme_node_id;
    for (const id of ["gvs-6ed-rev-v2", "tb-manual-controle-2ed-2019", "tb-nota-informativa-5-2024"]) {
      const s = await register(fonte(id));
      await editor("app_admin_topic_set_source", { p_theme_node_id: tb, p_source_id: s, p_role: "principal" });
    }
    let d = await editor("app_admin_topic", { p_theme_node_id: tb });
    expect(d.fontes).toHaveLength(3);
    expect(d.situacao.status).toBe("vencido"); // nunca conferido pela equipe
    d = await editor("app_admin_topic_verified", { p_theme_node_id: tb, p_note: "Fontes da aula GR-001 conferidas." });
    expect(d.situacao).toMatchObject({ status: "ok", motivos: [] });
  });

  it("caso real: a Nota Informativa nº 2/2026 (BPaLM) aparece na página de notas 2026 e vira 'documento novo' da Tuberculose", async () => {
    const page26 = (await sql("select id from public.ch_index_pages where url = 'https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2026'"))[0].id;
    const all = indexItems(page("aids-notas-informativas-2026.html.gz"), "https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2026");
    const sem = all.filter((i) => !/Nº 2\/2026/.test(i.titulo)); // leitura anterior: antes de 30/09/2026 a nota 2/2026 não estava na lista
    expect((await t.db.service<any>("ch_worker_index_page_report", { p_page_id: page26, p_report: { status: "ok", items: sem } })).base).toBe(true);
    const r = await t.db.service<any>("ch_worker_index_page_report", { p_page_id: page26, p_report: { status: "ok", items: all } });
    expect(r).toMatchObject({ novos_na_pagina: 1, avisos: 1 });
    const it = (await sql("select * from public.ch_vigilance_items where index_page_id = $1", [page26]))[0];
    expect(it).toMatchObject({ kind: "fonte_nova", theme_node_id: tb, source_id: null });
    expect(it.summary).toMatch(/Tuberculose.*NOTA INFORMATIVA Nº 2\/2026-CGTM.*BPaLM/);
    const fila = await editor("app_admin_vigilance_queue", { p_filter: "todas", p_limit: 200 });
    const item = fila.items.find((x: any) => x.id === it.id);
    expect(item).toMatchObject({ tipo: "fonte_nova", fonte: { id: null, status: "descoberto", url: "https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2026/nota-informativa-no-2_2026_cgtm_dathi_svsa_ms.pdf" }, tema: { id: tb } });
    expect(item.versoes_candidatas[0]).toMatchObject({ data: "2026-09-30" });
    // ler a mesma página de novo não repete o aviso
    expect((await t.db.service<any>("ch_worker_index_page_report", { p_page_id: page26, p_report: { status: "ok", items: all } })).avisos).toBe(0);
    // o tema passa a ter mudança pendente
    expect(await editor("app_admin_topic", { p_theme_node_id: tb })).toMatchObject({ situacao: { status: "mudanca_pendente" } });
  });

  it("caso real: Nota Informativa nº 25/2025 (TPT com rifampicina) na página de 2025", async () => {
    const page25 = (await sql("select id from public.ch_index_pages where url like '%notas-informativas/2025'"))[0].id;
    const all = indexItems(page("aids-notas-informativas-2025.html.gz"), "https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2025");
    await t.db.service("ch_worker_index_page_report", { p_page_id: page25, p_report: { status: "ok", items: all.filter((i) => !/Nº 25\/2025/.test(i.titulo)) } });
    const r = await t.db.service<any>("ch_worker_index_page_report", { p_page_id: page25, p_report: { status: "ok", items: all } });
    expect(r.avisos).toBe(1);
    const it = (await sql("select summary, details from public.ch_vigilance_items where index_page_id = $1", [page25]))[0];
    expect(it.summary).toMatch(/NOTA INFORMATIVA Nº 25\/2025/);
    expect(it.details.palavras).toEqual(expect.arrayContaining(["TPT", "rifampicina"]));
  });

  it("portão: desligado (padrão) não diz nada; aviso mostra o motivo à equipe; bloqueia trava a publicação; só o administrador muda", async () => {
    const unit = (await sql("insert into public.ch_units (theme_node_id, title) values ($1, 'GR-001 Tuberculose pulmonar') returning id", [tb]))[0].id;
    const ver = (await sql("insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash) values ($1, 1, 'independent', 'approved', '{}'::jsonb, 'x') returning id", [unit]))[0].id;
    const problems = async () => (await sql("select public.ch_publish_problems($1) p", [ver]))[0].p as string[];
    const base = await problems();
    expect(base.some((p) => /Vigilância científica/.test(p))).toBe(false);
    expect((await admin("app_ch_publish_preview", { p_version_id: ver })).tema).toEqual({ modo: "desligado" });
    await expect(editor("app_admin_vigilance_set_gate", { p_mode: "bloqueia" })).rejects.toThrow(/administradores/);
    await admin("app_admin_vigilance_set_gate", { p_mode: "aviso" });
    expect((await admin("app_ch_publish_preview", { p_version_id: ver })).tema).toMatchObject({ modo: "aviso", status: "mudanca_pendente" });
    expect((await problems()).length).toBe(base.length);
    await admin("app_admin_vigilance_set_gate", { p_mode: "bloqueia" });
    expect((await problems()).some((p) => /Tema "Tuberculose" com evidência com mudança pendente/.test(p))).toBe(true);
    expect(await editor("app_admin_unit_topic", { p_unit_id: unit })).toMatchObject({ modo: "bloqueia", status: "mudanca_pendente" });
    await admin("app_admin_vigilance_set_gate", { p_mode: "desligado" });
  });
});
