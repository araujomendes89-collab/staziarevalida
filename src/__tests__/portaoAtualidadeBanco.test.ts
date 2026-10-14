// @vitest-environment node
/**
 * Portão de atualidade (migração 9990) no banco de desenvolvimento, com as migrações todas:
 *   100 dossiês dos Grandes Temas com a evidência de cada vínculo; regra "em dia / atenção / desatualizado / sem dossiê" com prazo por tipo;
 *   o portão da Central entende os 100 temas; questão inédita; explicações da Fila (só avisa); gabarito oficial intacto; funções da tela.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";

vi.setConfig({ testTimeout: 120_000 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portao-"));
let t: FontesDb;
const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
const admin = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.adminUser, fn, args);
const editor = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.editorUser, fn, args);
const student = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.studentUser, fn, args);
const fresh = async (tema: string) => (await sql("select public.ch_gt_freshness($1) f", [tema]))[0].f;

async function register(url: string, title: string, organ = "Ministério da Saúde") {
  const r = await admin("app_ch_register_source", { p_source: { title, organ, kind: "final", url, editorial_approved: true } });
  return r.id as string;
}

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
}, 300_000);
afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

describe("dossiês dos 100 Grandes Temas", () => {
  it("os 100 temas entram, cada vínculo guarda a evidência, e o que não tem fonte principal fica 'sem dossiê'", async () => {
    expect((await sql("select count(*)::int n from public.ch_gt_dossiers"))[0].n).toBe(100);
    expect((await sql("select count(*)::int n from public.ch_gt_fontes where jsonb_array_length(evidencia) = 0"))[0].n).toBe(0);
    expect((await sql("select count(*)::int n from public.ch_gt_fontes where papel = 'principal' and url !~ '^https://'"))[0].n).toBe(0);
    const lista = await editor("app_admin_gt_list");
    expect(lista.temas).toHaveLength(100);
    expect(lista.modo_portao).toBe("desligado");
    // nenhuma fonte está cadastrada neste banco de teste: todos sem dossiê, e a tela diz o que falta
    expect(lista.resumo.sem_dossie).toBe(100);
    const gr1 = await editor("app_admin_gt", { p_tema_id: "GR-001" });
    expect(gr1.fontes.some((f: any) => f.papel === "principal" && /tubercul/i.test(f.titulo))).toBe(true);
    expect(gr1.palavras_chave).toEqual(expect.arrayContaining(["BPaLM", "TPT"]));
  });
  it("aluno e visitante não chegam nas funções da tela", async () => {
    await expect(student("app_admin_gt_list")).rejects.toThrow();
    await expect(student("app_admin_gt", { p_tema_id: "GR-001" })).rejects.toThrow();
    const anon = await sql("select count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'app_admin_gt%' or p.proname like 'ch_gt_%' or p.proname = 'ch_question_atualidade') and has_function_privilege('anon', p.oid, 'execute')");
    expect(anon[0].n).toBe(0);
  });
});

describe("regra 'em dia'", () => {
  let principais: { id: string; url: string; titulo: string }[];
  it("com as fontes principais cadastradas o tema sai de 'sem dossiê' e precisa ser conferido", async () => {
    principais = (await sql("select catalogo_id id, url, titulo from public.ch_gt_fontes where tema_id = 'GR-001' and papel = 'principal' and not removida")) as any;
    expect(principais.length).toBeGreaterThan(0);
    for (const p of principais) await register(p.url, p.titulo);
    const f = await fresh("GR-001");
    expect(f).toMatchObject({ status: "vencido", nivel: "desatualizado" });
    expect(f.motivos.join(" ")).toMatch(/nunca foi conferido/);
  });
  it("'Marcar conferido' pede nome e o que foi conferido; depois o tema fica em dia (ou com atenção por fonte indicada sem cadastro)", async () => {
    await expect(editor("app_admin_gt_verified", { p_tema_id: "GR-001", p_name: "", p_note: "Fontes conferidas na página oficial." })).rejects.toThrow(/nome/);
    await expect(editor("app_admin_gt_verified", { p_tema_id: "GR-001", p_name: "Dra. Teste", p_note: "curto" })).rejects.toThrow(/pelo menos 10/);
    const d = await editor("app_admin_gt_verified", { p_tema_id: "GR-001", p_name: "Dra. Teste", p_note: "Fontes principais conferidas nas páginas oficiais." });
    expect(d.verificado_nome).toBe("Dra. Teste");
    expect(["em_dia", "atencao"]).toContain(d.nivel);
    expect(d.status).toBe("ok");
    await expect(student("app_admin_gt_verified", { p_tema_id: "GR-001", p_name: "Aluno", p_note: "Conferi tudo agora mesmo." })).rejects.toThrow();
  });
  it("prazo por tipo: órgão oficial 90 dias; conferência velha vira desatualizada; perto de vencer vira atenção; prazo fixo da equipe vale", async () => {
    expect((await fresh("GR-001")).prazo_dias).toBe(90);
    await sql("update public.ch_gt_dossiers set last_verified_at = now() - interval '80 days' where tema_id = 'GR-001'");
    expect((await fresh("GR-001")).nivel).toBe("atencao");
    await sql("update public.ch_gt_dossiers set last_verified_at = now() - interval '100 days' where tema_id = 'GR-001'");
    expect(await fresh("GR-001")).toMatchObject({ status: "vencido", nivel: "desatualizado" });
    await editor("app_admin_gt_save", { p_tema_id: "GR-001", p_keywords: null, p_max_age_days: 200 });
    expect((await fresh("GR-001")).nivel).toBe("em_dia");
    await editor("app_admin_gt_save", { p_tema_id: "GR-001", p_keywords: null, p_clear_age: true });
    await sql("update public.ch_gt_dossiers set last_verified_at = now() where tema_id = 'GR-001'");
    expect((await fresh("GR-001")).nivel).not.toBe("desatualizado");
  });
  it("fonte principal vencida, substituída ou retratada deixa o tema desatualizado; versão antiga fica só como histórico", async () => {
    const s = (await sql("select id from public.ch_sources where public.ch_url_norm(url) = public.ch_url_norm($1)", [principais[0].url]))[0].id;
    await sql("update public.ch_sources set valid_until = current_date - 1 where id = $1", [s]);
    expect(await fresh("GR-001")).toMatchObject({ nivel: "desatualizado" });
    expect((await fresh("GR-001")).motivos.join(" ")).toMatch(/passou da validade/);
    await sql("update public.ch_sources set valid_until = null where id = $1", [s]);
    await sql("update public.ch_sources set status = 'superseded' where id = $1", [s]);
    expect((await fresh("GR-001")).motivos.join(" ")).toMatch(/substituída por versão nova/);
    await sql("update public.ch_sources set status = 'current' where id = $1", [s]);
    expect((await fresh("GR-001")).nivel).not.toBe("desatualizado");
    // fonte histórica nunca pesa
    await sql("update public.ch_gt_fontes set papel = 'historica' where tema_id = 'GR-001' and catalogo_id = $1 and (select count(*) from public.ch_gt_fontes x where x.tema_id = 'GR-001' and x.papel = 'principal') > 1", [principais[0].id]);
  });
  it("documento oficial novo que casa com as palavras-chave do tema vira mudança pendente; ler de novo não repete", async () => {
    const pg = (await sql("select id from public.ch_index_pages where url like '%notas-informativas/2026'"))[0].id;
    const base = [{ url: "https://www.gov.br/aids/pt-br/x/a.pdf", titulo: "Nota sobre outro assunto", data: "2026-01-02" }];
    await t.db.service("ch_worker_index_page_report", { p_page_id: pg, p_report: { status: "ok", items: base } });
    const novo = [...base, { url: "https://www.gov.br/aids/pt-br/x/bpalm.pdf", titulo: "Nota Informativa nº 2/2026: esquema BPaLM para tuberculose resistente", data: "2026-09-30" }];
    const r = await t.db.service<any>("ch_worker_index_page_report", { p_page_id: pg, p_report: { status: "ok", items: novo } });
    expect(r.avisos).toBeGreaterThan(0);
    const it = (await sql("select * from public.ch_vigilance_items where gt_tema_id = 'GR-001' and kind = 'fonte_nova'"))[0];
    expect(it.summary).toMatch(/BPaLM/);
    expect(await fresh("GR-001")).toMatchObject({ status: "mudanca_pendente", nivel: "desatualizado" });
    expect((await t.db.service<any>("ch_worker_index_page_report", { p_page_id: pg, p_report: { status: "ok", items: novo } })).avisos).toBe(0);
  });
});

describe("descoberta para um tema sem dossiê antigo", () => {
  it("documento novo sobre sífilis vira aviso só do tema GR-008 (sem nó da taxonomia)", async () => {
    const pg = (await sql("select id from public.ch_index_pages where url like '%notas-tecnicas'"))[0].id;
    const base = [{ url: "https://www.gov.br/aids/pt-br/x/b.pdf", titulo: "Outro assunto", data: "2026-01-02" }];
    await t.db.service("ch_worker_index_page_report", { p_page_id: pg, p_report: { status: "ok", items: base } });
    await t.db.service("ch_worker_index_page_report", { p_page_id: pg, p_report: { status: "ok", items: [...base, { url: "https://www.gov.br/aids/pt-br/x/sif.pdf", titulo: "Nota técnica: sífilis adquirida e penicilina benzatina", data: "2026-10-01" }] } });
    const it = (await sql("select * from public.ch_vigilance_items where gt_tema_id = 'GR-008' and kind = 'fonte_nova'"))[0];
    expect(it).toMatchObject({ theme_node_id: null, source_id: null });
    expect(it.summary).toMatch(/GR-008.*Sífilis adquirida/);
  });
});

describe("encaixe nos pontos de publicação", () => {
  it("portão da Central: nome de nó dos 100 temas é entendido; desligado não diz nada; bloqueia trava aula do tema desatualizado e do tema sem dossiê", async () => {
    const parent = (await sql("select n.parent_id p, n.version_id v from public.ch_taxonomy_nodes n where n.name = 'Tuberculose' limit 1"))[0];
    const node = (await sql("insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name) values ($1, $2, 'theme', 'Tuberculose pulmonar') returning id", [parent.v, parent.p]))[0].id;
    const unit = (await sql("insert into public.ch_units (theme_node_id, title) values ($1, 'GR-001') returning id", [node]))[0].id;
    const ver = (await sql("insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash) values ($1, 1, 'independent', 'approved', '{}'::jsonb, 'x') returning id", [unit]))[0].id;
    const problems = async () => (await sql("select public.ch_publish_problems($1) p", [ver]))[0].p as string[];
    const base = (await problems()).length;
    expect((await admin("app_ch_publish_preview", { p_version_id: ver })).tema).toEqual({ modo: "desligado" });
    await admin("app_admin_vigilance_set_gate", { p_mode: "aviso" });
    expect((await admin("app_ch_publish_preview", { p_version_id: ver })).tema).toMatchObject({ modo: "aviso", grande_tema: "GR-001", status: "mudanca_pendente" });
    expect((await problems()).length).toBe(base);
    await admin("app_admin_vigilance_set_gate", { p_mode: "bloqueia" });
    expect((await problems()).some((p) => /evidência com mudança pendente/.test(p) && /BPaLM/.test(p))).toBe(true);
    // tema fora dos 100 e sem dossiê também trava
    const outro = (await sql("insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name) values ($1, $2, 'theme', 'Tema que não existe nos cem') returning id", [parent.v, parent.p]))[0].id;
    expect(await editor("app_admin_unit_topic", { p_unit_id: (await sql("insert into public.ch_units (theme_node_id, title) values ($1, 'x') returning id", [outro]))[0].id })).toMatchObject({ modo: "bloqueia", status: "sem_dossie" });
    await admin("app_admin_vigilance_set_gate", { p_mode: "desligado" });
  });
  it("questão inédita: com o portão bloqueando, a aprovação/publicação do rascunho do tema desatualizado para; desligado não muda nada", async () => {
    const id = (await sql(`insert into public.draft_questions (batch, source_id, slot, area, subarea, title, stem, alternatives, correct_answer, explanation, alternative_explanations, source_citations, content_hash)
      values ('lote_portao', 'p1', 1, 'CLINICA_MEDICA', 'Tuberculose pulmonar', 'Tuberculose pulmonar: início do tratamento', 'Enunciado.', '{"A":"a","B":"b","C":"c","D":"d"}'::jsonb, 'A', 'Explicação.', '{}'::jsonb, '[]'::jsonb, 'hp1') returning id`))[0].id;
    const blk = async () => (await sql("select public.draft_approval_blockers($1) b", [id]))[0].b as string[];
    const off = (await blk()).length;
    expect((await blk()).some((b) => /Portão de atualidade/.test(b))).toBe(false);
    await admin("app_admin_vigilance_set_gate", { p_mode: "bloqueia" });
    expect((await blk()).some((b) => /Portão de atualidade.*mudança pendente/.test(b))).toBe(true);
    await admin("app_admin_vigilance_set_gate", { p_mode: "aviso" });
    expect((await blk()).length).toBe(off);
    await admin("app_admin_vigilance_set_gate", { p_mode: "desligado" });
  });
  it("explicações da Fila de revisão: avisa quando a fonte citada tem mudança pendente, nunca bloqueia e nunca toca no gabarito", async () => {
    const q = (await sql("select id, correct_option::text c from public.questions limit 1"))[0];
    const s = (await sql("select id from public.ch_sources order by created_at limit 1"))[0].id;
    await sql("insert into public.question_source_links (question_id, source_id, role, temporal, status) values ($1, $2, 'conduta', 'vigente', 'em_revisao')", [q.id, s]);
    expect((await editor("app_admin_comment_atualidade", { p_question_id: q.id })).total).toBe(0);
    await sql("insert into public.ch_vigilance_items (source_id, kind, summary) values ($1, 'mudanca', 'A página da fonte mudou.')", [s]);
    const av = await editor("app_admin_comment_atualidade", { p_question_id: q.id });
    expect(av.total).toBe(1);
    expect(av.avisos[0]).toMatch(/mudança pendente/);
    await admin("app_admin_vigilance_set_gate", { p_mode: "bloqueia" });
    expect((await editor("app_admin_comment_atualidade", { p_question_id: q.id })).total).toBe(1); // continua só informando
    await admin("app_admin_vigilance_set_gate", { p_mode: "desligado" });
    await student("app_admin_comment_atualidade", { p_question_id: q.id }).then(() => { throw new Error("aluno não pode"); }, () => undefined);
    expect((await sql("select correct_option::text c from public.questions where id = $1", [q.id]))[0].c).toBe(q.c);
  });
  it("colar de novo a migração não muda os dossiês nem a conferência", async () => {
    const migr = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003009990_portao_atualidade.sql"), "utf8");
    const antes = await sql("select count(*)::int n, count(last_verified_at)::int v from public.ch_gt_dossiers");
    await t.dev.db.exec(migr);
    expect(await sql("select count(*)::int n, count(last_verified_at)::int v from public.ch_gt_dossiers")).toEqual(antes);
    expect((await sql("select count(*)::int n from pg_proc where proname like '%_antes_atual'"))[0].n).toBe(3);
  });
});
