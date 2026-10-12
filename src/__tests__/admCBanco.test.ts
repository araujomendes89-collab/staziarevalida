// @vitest-environment node
/**
 * Fase 1 do gerenciamento, grupo C (Central de Conteúdo), parte do banco: CC26 (taxonomia nova segue os temas), CC27 (mensagens de
 * apelido em português), CC19 (modo sombra segura o que vai ao aluno), CC18 (reanálise pedida pela tela e automática) e CC23
 * (conferência das fontes monitoradas pedida). Textos e fontes SINTÉTICOS; a IA é simulada. Cada migração é colada de novo no
 * fim para provar que pode ser colada mais de uma vez.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { compareSourceVersions } from "../../server/contentHub/sourceCompare";
import { runScheduledReanalysis } from "../../server/contentHub/reanalysisRun";
import type { Proposal } from "../../server/contentHub/questionReanalysis";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "admc-"));
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const FILES = ["20261003009870_taxonomia_versao_nova_continua.sql", "20261003009871_modo_sombra_segura_o_aluno.sql", "20261003009872_reanalise_e_conferencia_pedidas.sql", "20261003009873_fonte_pdf_ja_enviado.sql"];
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
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
const setFlag = (key: string, value: boolean) => rpc(ADMIN, "app_ch_set_flag", key, value, "Teste automático do grupo C.");
const pasteAgain = async () => {
  for (const f of FILES) await dev.db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
};

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 'e@t.dev'), ($3, 's@t.dev'), ($4, 'r@t.dev')`, [ADMIN, EDITOR, STUDENT, REVIEWER]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------------------------- CC26 e CC27
describe("CC26: publicar uma versão nova da taxonomia leva os temas junto", () => {
  let theme: any, subtheme: any, area: any, sub: any;
  let unit: string, claim: string, block: string, suggested: string;

  it("monta o cenário: unidade, afirmação, marca de tema no bloco e apelido, tudo na versão publicada", async () => {
    const pub = await rpc(EDITOR, "app_ch_taxonomy");
    theme = pub.nodes.find((n: any) => n.level === "theme" && pub.nodes.some((c: any) => c.parent_id === n.id && c.level === "subtheme"));
    subtheme = pub.nodes.find((n: any) => n.parent_id === theme.id);
    sub = pub.nodes.find((n: any) => n.id === theme.parent_id);
    area = pub.nodes.find((n: any) => n.id === sub.parent_id);
    unit = (await sql(`insert into public.ch_units (theme_node_id, title) values ($1, 'Unidade de teste') returning id`, [theme.id]))[0].id;
    claim = (await sql(`insert into public.ch_claims (theme_node_id, statement) values ($1, 'Afirmação de teste.') returning id`, [theme.id]))[0].id;
    const doc = (await sql(`insert into public.ch_documents (owner_id, name, sha256) values ($1, 'Doc de teste', repeat('a', 64)) returning id`, [ADMIN]))[0].id;
    await sql(`insert into public.ch_pages (document_id, page_no, kind) values ($1, 1, 'text')`, [doc]);
    block = (await sql(`insert into public.ch_blocks (document_id, page_no, idx, type, original_text) values ($1, 1, 0, 'paragraph', 'Texto de teste.') returning id`, [doc]))[0].id;
    await sql(`insert into public.ch_block_nodes (block_id, node_id) values ($1, $2)`, [block, subtheme.id]);
    await rpc(EDITOR, "app_ch_taxonomy_add_alias", theme.id, "HAS de teste");
    expect(unit && claim && block).toBeTruthy();
  });

  it("rascunho aberto, tema renomeado, subtema novo e um tema que a IA sugeriu DEPOIS de aberto o rascunho", async () => {
    const v = await rpc(EDITOR, "app_ch_taxonomy_draft");
    expect(v).toBeGreaterThan(1);
    const draft = await rpc(EDITOR, "app_ch_taxonomy", v);
    const dTheme = draft.nodes.find((n: any) => n.name === theme.name && n.level === "theme");
    await rpc(EDITOR, "app_ch_taxonomy_save_node", { id: dTheme.id, name: `${theme.name} (renomeado)` });
    await rpc(EDITOR, "app_ch_taxonomy_save_node", { parent_id: dTheme.id, name: "Subtema criado no rascunho" });
    // o rascunho guarda de onde cada tema veio
    expect((await sql(`select origin_node_id from public.ch_taxonomy_nodes where id = $1`, [dTheme.id]))[0].origin_node_id).toBe(theme.id);
    // sugestão da IA na versão publicada, depois de aberto o rascunho (não está no rascunho)
    suggested = await db.service<string>("ch_worker_suggest_node", { p_parent: sub.id, p_name: "Tema sugerido depois do rascunho" });
    await sql(`insert into public.ch_block_nodes (block_id, node_id) values ($1, $2)`, [block, suggested]);
  });

  it("só o administrador publica; ao publicar, unidade, afirmação, marca do bloco e apelido seguem para a versão nova", async () => {
    await expect(rpc(EDITOR, "app_ch_taxonomy_publish", "tentativa")).rejects.toThrow(/administradores/);
    const before = (await sql(`select count(*)::int n from public.ch_taxonomy_nodes`))[0].n;
    const v = await rpc(ADMIN, "app_ch_taxonomy_publish", "Versão de teste do grupo C.");
    expect(v).toBeGreaterThan(1);
    const published = (await sql(`select id from public.ch_taxonomy_versions where status = 'published'`))[0].id;
    const nodeOf = async (id: string) => (await sql(`select n.name, n.version_id, n.status from public.ch_taxonomy_nodes n where n.id = $1`, [id]))[0];
    const u = (await sql(`select theme_node_id from public.ch_units where id = $1`, [unit]))[0].theme_node_id;
    expect(await nodeOf(u)).toMatchObject({ name: `${theme.name} (renomeado)`, version_id: published });
    const c = (await sql(`select theme_node_id from public.ch_claims where id = $1`, [claim]))[0].theme_node_id;
    expect(c).toBe(u);
    // o bloco: o subtema antigo virou o subtema da versão nova (mesmo nome, filho do tema renomeado) e a sugestão da IA entrou na versão nova
    const marks = await sql(`select n.name, n.version_id, n.status from public.ch_block_nodes bn join public.ch_taxonomy_nodes n on n.id = bn.node_id where bn.block_id = $1 order by n.name`, [block]);
    expect(marks).toHaveLength(2);
    expect(marks.every((m: any) => m.version_id === published)).toBe(true);
    expect(marks.map((m: any) => m.name).sort()).toEqual([subtheme.name, "Tema sugerido depois do rascunho"].sort());
    expect(marks.find((m: any) => m.name === "Tema sugerido depois do rascunho").status).toBe("suggested");
    // apelido segue o tema renomeado (não vira "tema não existe mais")
    const aliases = await rpc(EDITOR, "app_ch_taxonomy_aliases");
    expect(aliases).toEqual([expect.objectContaining({ alias: "HAS de teste", orphan: false })]);
    expect(aliases[0].path).toContain("(renomeado)");
    // os temas da versão arquivada continuam lá (nada foi apagado); a versão nova tem os temas novos
    expect((await sql(`select count(*)::int n from public.ch_taxonomy_nodes`))[0].n).toBeGreaterThan(before);
    expect((await sql(`select count(*)::int n from public.ch_taxonomy_nodes where version_id = $1 and name = 'Subtema criado no rascunho'`, [published]))[0].n).toBe(1);
    // buscar o tema novo acha o apelido
    const found = await rpc(EDITOR, "app_ch_taxonomy_find", "HAS de teste");
    expect(found[0]).toMatchObject({ via: "alias" });
  });

  it("temas de versão arquivada que ainda tinham algo ligado são levados quando colam a migração de novo (e colar mais vezes não muda nada)", async () => {
    const archived = (await sql(`select n.id from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id
                                  where v.status = 'archived' and n.level = 'area' and n.name <> $1 limit 1`, [area.name]))[0].id;
    const strayUnit = (await sql(`insert into public.ch_units (theme_node_id, title) values ($1, 'Unidade que ficou na versão antiga') returning id`, [archived]))[0].id;
    await pasteAgain();
    const moved = (await sql(`select n.version_id, v.status, n.name from public.ch_units u join public.ch_taxonomy_nodes n on n.id = u.theme_node_id join public.ch_taxonomy_versions v on v.id = n.version_id where u.id = $1`, [strayUnit]))[0];
    expect(moved.status).toBe("published");
    const snapshot = JSON.stringify(await sql(`select id, theme_node_id from public.ch_units order by id`));
    await pasteAgain();
    await pasteAgain();
    expect(JSON.stringify(await sql(`select id, theme_node_id from public.ch_units order by id`))).toBe(snapshot);
  });

  it("CC27: as mensagens de apelido saem em português (apelido, não alias)", async () => {
    const pub = await rpc(EDITOR, "app_ch_taxonomy");
    const n = pub.nodes.find((x: any) => x.level === "theme");
    await expect(rpc(EDITOR, "app_ch_taxonomy_add_alias", n.id, "   ")).rejects.toThrow(/Informe o apelido/);
    await expect(rpc(EDITOR, "app_ch_taxonomy_add_alias", n.id, n.name)).rejects.toThrow(/O apelido é igual ao nome do tema/);
    await rpc(EDITOR, "app_ch_taxonomy_add_alias", n.id, "Sigla repetida");
    await expect(rpc(EDITOR, "app_ch_taxonomy_add_alias", n.id, " sigla repetida ")).rejects.toThrow(/Esse apelido já pertence a/);
    await expect(rpc(EDITOR, "app_ch_taxonomy_remove_alias", "00000000-0000-4000-8000-000000000999")).rejects.toThrow(/Apelido não encontrado/);
    await expect(rpc(STUDENT, "app_ch_taxonomy_add_alias", n.id, "xyz")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------- CC19
describe("CC19: o modo sombra segura o que vai ao aluno", () => {
  let q: string;
  const seed = async () => {
    q = (await sql(`select id from public.questions where status <> 'annulled' and correct_option is not null order by id limit 1`))[0].id;
    const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, status, generated_by_model, basis_hash, reviewed_at, temporal_status, reviewed_by)
      values ($1, 1, 'Pergunta de teste', 'published', 'modelo-de-teste', 'x', now(), 'REQUIRES_MEDICAL_REVIEW', $2) returning id`, [q, ADMIN]))[0];
    const off = (await sql(`select correct_option from public.questions where id = $1`, [q]))[0].correct_option;
    for (const id of ["A", "B", "C", "D"]) {
      await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning) values ($1, $2, $3, $4, $5, 'análise de teste')`, [a.id, q, id, id === off, id === off ? "CORRECT" : "WRONG"]);
    }
    await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status) values ($1, $2, 1, 'full', '{}'::jsonb, 'h', 'published')`, [q, a.id]);
    await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [STUDENT, q]);
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, public.question_area_code($2))`, [REVIEWER, q]);
  };

  it("padrão de fábrica (modo sombra ligado, publicação desligada): o aluno não recebe a análise aprovada; a equipe e o revisor recebem", async () => {
    await seed();
    expect(await rpc(ADMIN, "app_ch_flags")).toMatchObject({ shadow_mode: true, publish_enabled: false });
    expect(await rpc(STUDENT, "app_question_commentary", q)).toBeNull();
    expect(await rpc(STUDENT, "app_question_timeline", q)).toEqual([]);
    expect(await rpc(ADMIN, "app_question_commentary", q)).toMatchObject({ question_id: q });
    expect(await rpc(EDITOR, "app_question_commentary", q)).toMatchObject({ question_id: q });
    expect(await rpc(REVIEWER, "app_question_commentary", q)).toMatchObject({ question_id: q });
    expect((await rpc(ADMIN, "app_question_timeline", q)).some((e: any) => e.type === "ANALYSIS_PUBLISHED")).toBe(true);
  });

  it("só ligar a publicação não basta, e só desligar o modo sombra também não: as duas chaves juntas liberam", async () => {
    await setFlag("publish_enabled", true);
    expect(await rpc(STUDENT, "app_question_commentary", q)).toBeNull();
    await setFlag("publish_enabled", false);
    await setFlag("shadow_mode", false);
    expect(await rpc(STUDENT, "app_question_commentary", q)).toBeNull();
    await setFlag("publish_enabled", true);
    expect(await rpc(STUDENT, "app_question_commentary", q)).toMatchObject({ question_id: q });
    expect((await rpc(STUDENT, "app_question_timeline", q)).some((e: any) => e.type === "ANALYSIS_PUBLISHED")).toBe(true);
  });

  it("voltar ao modo sombra recolhe de novo, sem apagar nada", async () => {
    await setFlag("shadow_mode", true);
    expect(await rpc(STUDENT, "app_question_commentary", q)).toBeNull();
    expect((await sql(`select count(*)::int n from public.question_analysis where question_id = $1 and status = 'published'`, [q]))[0].n).toBe(1);
    await setFlag("publish_enabled", false);
  });

  it("o diagnóstico do erro do aluno também fica retido enquanto o modo sombra está ligado", async () => {
    const rows = await sql(`select * from public.student_chosen_option_analysis($1, $2, 'B')`, [STUDENT, q]);
    expect(rows).toHaveLength(0);
    await setFlag("shadow_mode", false);
    await setFlag("publish_enabled", true);
    expect((await sql(`select * from public.student_chosen_option_analysis($1, $2, 'B')`, [STUDENT, q])).length).toBeGreaterThan(0);
    await setFlag("shadow_mode", true);
    await setFlag("publish_enabled", false);
  });
});

// ---------------------------------------------------------------------------------------------------------------- CC18 e CC23
describe("CC18: reanálise das questões pedida pela tela ou automática", () => {
  let v1: string, v2: string, q1: string, claim1: string;
  const quote = "Dose habitual de 20 mg uma vez ao dia";
  const respond = (): Proposal => ({
    assessment: "UPDATED_BUT_SAME_ANSWER", impact_level: "COMMENT_ONLY", current_answer: "NONE",
    what_changed: "A dose habitual do documento passou de 10 mg para 20 mg uma vez ao dia.", why_it_matters: "O comentário precisa citar a dose nova.",
    options_affected: [], citations: [{ ref: "M1.novo", quote }], confidence: 70,
  });

  it("sem questão esperando, o status mostra zero e o pedido é recusado com mensagem clara", async () => {
    const s = await rpc(EDITOR, "app_ch_reanalysis_status");
    expect(s).toMatchObject({ waiting: 0, auto: false, requested_at: null });
    await expect(rpc(ADMIN, "app_ch_reanalysis_request")).rejects.toThrow(/Nenhuma questão está esperando reanálise/);
    expect(await db.service("ch_worker_reanalysis_claim")).toEqual({ run: false, manual: false });
  });

  it("monta uma mudança de fonte (v1 → v2) e a questão passa a esperar reanálise", async () => {
    const qs = (await sql(`select question_id from public.question_claims where role = 'solves' order by question_id limit 5`)).map((r) => r.question_id);
    q1 = qs[0];
    claim1 = (await sql(`select claim_id from public.question_claims where question_id = $1 and role = 'solves'`, [q1]))[0].claim_id;
    const st = (await sql(`select statement from public.ch_claims where id = $1`, [claim1]))[0].statement as string;
    v1 = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, published_on) values ('Documento SINTÉTICO grupo C', 'Órgão de teste', 'final', '1', 'A', '2025-01-01') returning id`))[0].id;
    const p1 = (await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2) returning id`, [v1, `${st} Dose habitual de 10 mg uma vez ao dia.`]))[0].id;
    await rpc(ADMIN, "app_ch_link_evidence", claim1, { source_id: v1, passage_id: p1, quote: st, verdict: "compatible", page: 1 });
    v2 = (await rpc(ADMIN, "app_ch_register_source", { title: "Documento SINTÉTICO grupo C", organ: "Órgão de teste", kind: "final", version: "2" })).id;
    await rpc(ADMIN, "app_ch_set_source_authority", v2, "A");
    await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 1, $2)`, [v2, `${st} ${quote}.`]);
    await compareSourceVersions(db, v1, v2);
    const s = await rpc(EDITOR, "app_ch_reanalysis_status");
    expect(s.waiting).toBe(1);
  });

  it("só o administrador pede; pedir de novo não duplica; a equipe e o revisor veem a situação, o aluno não", async () => {
    await expect(rpc(EDITOR, "app_ch_reanalysis_request")).rejects.toThrow(/administradores/);
    await expect(rpc(STUDENT, "app_ch_reanalysis_status")).rejects.toThrow(/restrito/);
    expect(await rpc(ADMIN, "app_ch_reanalysis_request")).toEqual({ waiting: 1, already: false });
    expect(await rpc(ADMIN, "app_ch_reanalysis_request")).toEqual({ waiting: 1, already: true });
    expect((await rpc(REVIEWER, "app_ch_reanalysis_status")).requested_at).not.toBeNull();
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'question_analysis.reanalysis_request'`))[0].n).toBe(1);
  });

  it("sem a chave automática e sem pedido, nada roda; com o pedido, o processamento reanalisa, grava a proposta e o resultado fica na tela", async () => {
    process.env.CONTENT_HUB_AI_PROVIDER_CREATE = "mock";
    const run = await runScheduledReanalysis({ db, mockRespond: respond });
    expect(run).toMatchObject({ ran: true, manual: true });
    expect(run.report).toMatchObject({ considered: 1, saved: 1 });
    expect((await sql(`select status, proposal is not null p from public.question_updates where question_id = $1 and proposal is not null`, [q1]))[0]).toMatchObject({ status: "review_required", p: true });
    const s = await rpc(ADMIN, "app_ch_reanalysis_status");
    expect(s).toMatchObject({ waiting: 0, requested_at: null, last_manual: true });
    expect(s.last_finished_at).not.toBeNull();
    expect(s.last_summary).toMatchObject({ considered: 1, saved: 1, skipped: 0 });
    // o aluno continua sem ver nada: a IA só propõe
    expect(await runScheduledReanalysis({ db, mockRespond: respond })).toMatchObject({ ran: false });
  });

  it("rejeitar a proposta devolve a questão à espera; com a chave 'Análise automática' ligada o processamento reanalisa sozinho", async () => {
    const updateId = (await sql(`select id from public.question_updates where question_id = $1 and proposal is not null`, [q1]))[0].id;
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, public.question_area_code($2)) on conflict do nothing`, [REVIEWER, q1]);
    await rpc(REVIEWER, "app_question_update_decide", updateId, "reject_proposal", "A proposta não cita a tabela do documento.", null);
    expect((await rpc(EDITOR, "app_ch_reanalysis_status")).waiting).toBe(1);
    expect(await runScheduledReanalysis({ db, mockRespond: respond })).toMatchObject({ ran: false, manual: false });
    await setFlag("auto_analysis_enabled", true);
    expect((await rpc(EDITOR, "app_ch_reanalysis_status")).auto).toBe(true);
    const auto = await runScheduledReanalysis({ db, mockRespond: respond });
    expect(auto).toMatchObject({ ran: true, manual: false });
    expect(auto.report?.saved).toBe(1);
    expect((await rpc(ADMIN, "app_ch_reanalysis_status")).last_manual).toBe(false);
    await setFlag("auto_analysis_enabled", false);
  });

  it("se a IA para (ex.: desligada), o motivo vai para a tela e o pedido não fica preso", async () => {
    const updateId = (await sql(`select id from public.question_updates where question_id = $1 and proposal is not null`, [q1]))[0].id;
    await rpc(REVIEWER, "app_question_update_decide", updateId, "reject_proposal", "Pedi outra reanálise com mais cuidado.", null);
    await rpc(ADMIN, "app_ch_reanalysis_request");
    await rpc(ADMIN, "app_ch_set_flag", "ai_enabled", false, "Teste: IA desligada para ver o aviso.");
    const r = await runScheduledReanalysis({ db, mockRespond: respond });
    expect(r.report?.saved).toBe(0);
    const s = await rpc(ADMIN, "app_ch_reanalysis_status");
    expect(s.requested_at).toBeNull();
    expect(s.last_summary.pending).toMatch(/desligada/i);
    await rpc(ADMIN, "app_ch_set_flag", "ai_enabled", true, "Teste: IA religada depois do aviso.");
  });
});

describe("CC23: conferir as fontes monitoradas pelo site publicado", () => {
  let src: string;
  it("o administrador marca o pedido em cada fonte monitorada; o processamento enxerga e o resultado encerra o pedido", async () => {
    src = (await rpc(ADMIN, "app_ch_register_source", { title: "Fonte monitorada de teste", organ: "Órgão de teste", kind: "final", version: "1" })).id;
    expect(await rpc(ADMIN, "app_ch_request_sources_check")).toBe(0);
    await rpc(ADMIN, "app_ch_watch_source", src, "https://exemplo.invalid/doc.pdf", 30);
    await expect(rpc(EDITOR, "app_ch_request_sources_check")).rejects.toThrow(/administradores/);
    await expect(rpc(STUDENT, "app_ch_request_sources_check")).rejects.toThrow();
    expect(await rpc(ADMIN, "app_ch_request_sources_check")).toBeGreaterThanOrEqual(1);
    expect(await db.service<number>("ch_worker_watch_requested")).toBeGreaterThanOrEqual(1);
    expect((await db.service<any[]>("ch_worker_watch_due")).map((w) => w.source_id)).toContain(src);
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'source.check_request'`))[0].n).toBeGreaterThanOrEqual(1);
    await db.service("ch_worker_watch_result", { p_source_id: src, p_hash: "b".repeat(64), p_status: "ok" });
    expect(await db.service<number>("ch_worker_watch_requested")).toBe(0);
  });
});

describe("CC24 (banco): leitura de um arquivo já enviado", () => {
  it("devolve o andamento da leitura e a quantidade de trechos de texto lidos", async () => {
    const doc = (await sql(`insert into public.ch_documents (owner_id, name, sha256) values ($1, 'Outro doc', repeat('b', 64)) returning id`, [ADMIN]))[0].id;
    expect(await db.service("ch_worker_document_extraction", { p_document_id: doc })).toEqual({ extract_status: null, blocks: 0 });
    await db.service("ch_worker_enqueue", { p_document_id: doc, p_step: "extract", p_scope_key: "", p_versions: { a: 1 }, p_max_attempts: 3 });
    expect(await db.service("ch_worker_document_extraction", { p_document_id: doc })).toMatchObject({ extract_status: "queued" });
    await db.service("ch_worker_save_extraction", { p_document_id: doc, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text", width: 1, height: 1 }], p_blocks: [{ page_no: 1, idx: 0, type: "paragraph", text: "Texto.", bbox: [0, 0, 1, 1] }] });
    expect(await db.service("ch_worker_document_extraction", { p_document_id: doc })).toMatchObject({ blocks: 1 });
  });
});

describe("As migrações podem ser coladas mais de uma vez", () => {
  it("três colagens seguidas não dão erro e não mudam as funções nem os dados", async () => {
    const fns = async () => JSON.stringify(await sql(`select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'ch_taxonomy%' or p.proname like '%reanalysis%' or p.proname in ('question_analysis_fits', 'ch_card_shows', 'ch_student_released', 'ch_raw_app_question_timeline', 'app_ch_request_sources_check', 'ch_worker_document_extraction')) order by 1`));
    const before = await fns();
    const data = JSON.stringify(await sql(`select * from public.ch_reanalysis_control`));
    await pasteAgain();
    await pasteAgain();
    expect(await fns()).toBe(before);
    expect(JSON.stringify(await sql(`select * from public.ch_reanalysis_control`))).toBe(data);
  });
});
