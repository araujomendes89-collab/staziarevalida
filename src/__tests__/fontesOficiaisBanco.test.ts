// @vitest-environment node
/**
 * Fontes oficiais com IA — banco (supabase/migrations/…6400_fontes_oficiais_ia.sql): lista de sites oficiais (a equipe lê, só o
 * administrador grava), pedido de busca (uma busca por tema, na fila sem documento, sem repetir a que ainda está andando),
 * candidatos só para o administrador, repetidos por link normalizado e por SHA-256, a regra única de substituição e a função
 * "Busca de fontes oficiais" (`busca_fontes`) na Central de IAs.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-banco-"));
let t: FontesDb;

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
}, 300_000);

afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const RESTRITO = /Acesso restrito a administradores/;
const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
/** SHA-256 de mentira, mas no formato certo (64 caracteres hexadecimais). */
const sha = (n: number) => n.toString(16).padStart(64, "0");
const asAdmin = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.adminUser, fn, args);
const known = (url: string | null, sha256: string | null) => t.db.service<string | null>("ch_worker_source_known", { p_url: url, p_sha256: sha256 });
const norm = async (url: string) => (await sql(`select public.ch_url_norm($1) as v`, [url]))[0].v as string | null;

/** Lê uma tabela direto, como a pessoa (papel authenticated + claims), com o RLS valendo. */
async function selectAs(userId: string, q: string) {
  return t.dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    return (await tx.query<any>(q)).rows;
  });
}

let themeSeq = 0;
/** Pede uma busca de um tema novo (sem repetir nenhuma outra do arquivo) e devolve o id. */
async function newSearch(area: string | null = "CLINICA_MEDICA"): Promise<string> {
  const r = await asAdmin("app_ch_source_search_start", { p_request: { area, theme: `Tema de teste ${++themeSeq}` } });
  return r.searches[0].id;
}

/** Candidato criado como o processamento cria (ch_worker_source_candidate_create), no site gov.br/saude por padrão. */
async function createCandidate(over: Record<string, unknown> = {}) {
  const site = (await sql(`select id from public.ch_official_domains where address = 'gov.br/saude'`))[0];
  const searchId = await newSearch();
  const n = ++themeSeq;
  const link = `https://www.gov.br/saude/pt-br/documento-${n}.pdf`;
  return t.db.service<{ id: string; duplicate: boolean }>("ch_worker_source_candidate_create", {
    p_candidate: {
      search_id: searchId,
      domain_id: site.id,
      requested_url: link,
      final_url: link,
      ai_title: `Protocolo Clínico ${n}`,
      ai_institution: "Ministério da Saúde",
      ai_published: "2025-03-14",
      ai_nature: "PCDT",
      ai_kind: "final",
      ai_level: "A",
      ai_reason: "Documento oficial do tema pedido.",
      file_title: `Protocolo Clínico ${n}`,
      file_date: "2025-03-14",
      quote: "Gestantes com pré-eclâmpsia grave devem ser encaminhadas ao centro de referência.",
      quote_page: 2,
      seen_in_search: true,
      file_kind: "pdf",
      sha256: sha(0x100000 + n),
      size_bytes: 123456,
      page_count: 12,
      storage_path: `source-candidates/${sha(0x100000 + n)}.pdf`,
      preview: "Texto das primeiras páginas.",
      suggested_level: "A",
      suggested_kind: "final",
      suggested_nature: "PCDT",
      ...over,
    },
  });
}

describe("Banco", () => {
  it("sites oficiais: 11 sementes, a equipe lê, só administrador grava", async () => {
    const list = await t.db.asUser<any[]>(t.editorUser, "app_ch_official_domains");
    expect(list).toHaveLength(11);
    // governo, internacional, sociedade; dentro de cada tipo, pelo endereço
    expect(list.map((d) => [d.kind, d.address])).toEqual([
      ["governo", "bvsms.saude.gov.br"],
      ["governo", "gov.br/anvisa"],
      ["governo", "gov.br/conitec"],
      ["governo", "gov.br/inca"],
      ["governo", "gov.br/saude"],
      ["internacional", "iris.paho.org"],
      ["internacional", "paho.org"],
      ["internacional", "who.int"],
      ["sociedade", "febrasgo.org.br"],
      ["sociedade", "portal.cardiol.br"],
      ["sociedade", "sbp.com.br"],
    ]);
    expect(list.find((d) => d.address === "gov.br/saude")).toMatchObject({ institution: "Ministério da Saúde", active: true });
    expect(list.find((d) => d.address === "iris.paho.org")).toMatchObject({ institution: "Repositório IRIS da OPAS" });
    expect(list.find((d) => d.address === "portal.cardiol.br")).toMatchObject({ institution: "Sociedade Brasileira de Cardiologia" });
    await expect(t.db.asUser(t.studentUser, "app_ch_official_domains")).rejects.toThrow(/restrito/);
    await expect(
      t.db.asUser(t.editorUser, "app_ch_save_official_domain", { p_domain: { address: "exemplo.gov.br", institution: "Exemplo", kind: "governo" } })
    ).rejects.toThrow(RESTRITO);
    // RLS: a equipe lê a tabela; o aluno não
    expect((await selectAs(t.EDITOR, "select id from public.ch_official_domains")).length).toBe(11);
    expect(await selectAs(t.STUDENT, "select id from public.ch_official_domains")).toEqual([]);
  });

  it("endereço do site: tira https:// e barra final, recusa acento", async () => {
    const save = (p_domain: Record<string, unknown>) => asAdmin("app_ch_save_official_domain", { p_domain });
    const saved = await save({ address: "https://Exemplo.gov.br/Saude/", institution: "Exemplo", kind: "governo" });
    expect(saved).toMatchObject({ address: "exemplo.gov.br/saude", institution: "Exemplo", kind: "governo", active: true, created_by: t.ADMIN });
    await expect(save({ address: "saúde.gov.br", institution: "Exemplo", kind: "governo" })).rejects.toThrow(/use só letras sem acento/);
    await expect(save({ address: "exemplo gov.br", institution: "Exemplo", kind: "governo" })).rejects.toThrow(/use só letras sem acento/);
    await expect(save({ address: "exemplo", institution: "Exemplo", kind: "governo" })).rejects.toThrow(/Endereço do site inválido/);
    await expect(save({ address: "exemplo2.gov.br", institution: "Exemplo", kind: "estadual" })).rejects.toThrow(/governo, internacional ou sociedade/);
    await expect(save({ address: "exemplo2.gov.br", institution: " ", kind: "governo" })).rejects.toThrow(/instituição/);
    await expect(save({ address: "EXEMPLO.gov.br/saude", institution: "Outro", kind: "governo" })).rejects.toThrow(/já está na lista/);
    // editar: desativar o mesmo site
    const off = await save({ id: saved.id, address: saved.address, institution: "Exemplo", kind: "governo", active: false });
    expect(off).toMatchObject({ id: saved.id, active: false, updated_by: t.ADMIN });
    const log = await sql(`select details from public.ch_audit where action = 'source_domain.save' and target = $1 order by id`, [saved.id]);
    expect(log.map((l) => l.details.active)).toEqual([true, false]);
  });

  it("pedido de busca cria a busca e o trabalho sem documento; igual na fila não repete", async () => {
    const r = await asAdmin("app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "Dengue", top_themes: null, free_text: "PCDT mais recente" } });
    expect(r.searches).toHaveLength(1);
    expect(r.searches[0]).toMatchObject({ theme: "Dengue", duplicate: false });
    const id = r.searches[0].id;
    const [s] = await sql(`select * from public.ch_source_searches where id = $1`, [id]);
    expect(s).toMatchObject({ requested_by: t.ADMIN, area: "CLINICA_MEDICA", theme: "Dengue", free_text: "PCDT mais recente", origin: "tema", status: "na_fila", web_searches: 0 });
    const [job] = await sql(`select * from public.ch_jobs where id = $1`, [s.job_id]);
    expect(job).toMatchObject({ step: "source_search", document_id: null, scope_key: `search:${id}`, idempotency_key: `source_search:${id}`, max_attempts: 2, status: "queued" });
    const jobs = async () => Number((await sql(`select count(*) as n from public.ch_jobs where step = 'source_search'`))[0].n);
    const before = await jobs();

    // o mesmo pedido (sem caixa e com espaços) não repete
    const again = await asAdmin("app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "  dengue ", free_text: "pcdt MAIS recente" } });
    expect(again.searches).toEqual([{ id, theme: "Dengue", duplicate: true }]);
    expect(await jobs()).toBe(before);
    // outra área, ou outro texto livre, é outra busca
    const other = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: "Dengue", free_text: "PCDT mais recente" } });
    expect(other.searches[0].duplicate).toBe(false);
    expect(await jobs()).toBe(before + 1);

    // busca que falhou não bloqueia repetir o mesmo pedido
    await t.db.service("ch_worker_source_search_update", { p_search_id: id, p_patch: { status: "falhou", message: "IA fora do ar." } });
    const retry = await asAdmin("app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "Dengue", free_text: "PCDT mais recente" } });
    expect(retry.searches[0].duplicate).toBe(false);
    expect(retry.searches[0].id).not.toBe(id);

    const log = await sql(`select actor_id, details from public.ch_audit where action = 'source_search.request' and target = $1`, [id]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_id: t.ADMIN, details: { theme: "Dengue", origin: "tema" } });

    const start = (p_request: Record<string, unknown>) => asAdmin("app_ch_source_search_start", { p_request });
    await expect(start({ area: "CLINICA_MEDICA", theme: "Dengue", top_themes: 5 })).rejects.toThrow(/Escolha um tema ou 'temas mais cobrados'/);
    await expect(start({ area: "CLINICA_MEDICA" })).rejects.toThrow(/Escolha um tema ou 'temas mais cobrados'/);
    await expect(start({ area: "CLINICA_MEDICA", theme: "  " })).rejects.toThrow(/Escolha um tema ou 'temas mais cobrados'/);
    await expect(start({ area: "CLINICA_MEDICA", top_themes: 11 })).rejects.toThrow(/de 1 a 10/);
    await expect(start({ area: "CARDIOLOGIA", theme: "Dengue" })).rejects.toThrow(/Área inválida/);
    await expect(start({ area: "CLINICA_MEDICA", theme: "x".repeat(121) })).rejects.toThrow(/120 caracteres/);
    await expect(start({ area: "CLINICA_MEDICA", theme: "Dengue", free_text: "x".repeat(301) })).rejects.toThrow(/300 caracteres/);
    expect(await jobs()).toBe(before + 2);
  });

  it("temas mais cobrados: uma busca por tema, no máximo o que a área tem", async () => {
    const jobs = async () => Number((await sql(`select count(*) as n from public.ch_jobs where step = 'source_search'`))[0].n);
    const inc = await asAdmin("app_incidence", { p_dimension: "topic", p_area: "PEDIATRIA" });
    const keys: string[] = inc.rows.map((r: any) => r.key);
    const n = keys.length;
    expect(n).toBeGreaterThan(0);
    const before = await jobs();
    const r = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", top_themes: 10 } });
    expect(r.searches).toHaveLength(Math.min(10, n));
    expect(r.searches.map((s: any) => s.theme)).toEqual(keys.slice(0, 10));
    expect(r.searches.every((s: any) => s.duplicate === false)).toBe(true);
    const rows = await sql(`select origin, area from public.ch_source_searches where id = any($1::uuid[])`, [r.searches.map((s: any) => s.id)]);
    expect(rows.every((x) => x.origin === "incidencia" && x.area === "PEDIATRIA")).toBe(true);
    expect(await jobs()).toBe(before + Math.min(10, n));

    const saved = await sql(`select id, status from public.questions where area in ('PEDIATRIA', 'CIRURGIA_GERAL')`);
    const restore = () => sql(`update public.questions q set status = b.status from jsonb_to_recordset($1::jsonb) as b(id text, status text) where q.id = b.id`, [JSON.stringify(saved)]);
    try {
      // a área passa a ter só 2 temas válidos: pedir 10 cria só 2
      await sql(`update public.questions set status = 'annulled' where area = 'PEDIATRIA' and topic <> all($1::text[])`, [keys.slice(0, 2)]);
      const few = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", top_themes: 10, free_text: "segunda rodada" } });
      expect(few.searches.map((s: any) => [s.theme, s.duplicate])).toEqual(keys.slice(0, 2).map((k) => [k, false]));

      // área sem nenhuma questão válida: mensagem clara e nada na fila
      await sql(`update public.questions set status = 'annulled' where area = 'CIRURGIA_GERAL'`);
      const mid = await jobs();
      await expect(asAdmin("app_ch_source_search_start", { p_request: { area: "CIRURGIA_GERAL", top_themes: 5 } })).rejects.toThrow(
        /Não há questões oficiais catalogadas nesta área para escolher os temas mais cobrados/
      );
      expect(await jobs()).toBe(mid);
      expect(await sql(`select id from public.ch_source_searches where area = 'CIRURGIA_GERAL'`)).toEqual([]);
    } finally {
      await restore();
    }
  });

  it("busca_fontes na Central: só sozinha, sem Ollama, máximo de 1 a 10", async () => {
    const C = { provider: "anthropic", model: "claude-x" };
    const save = (key: string, config: unknown) => t.db.service<any>("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: key, p_config: config });
    try {
      await expect(save("busca_fontes", { mode: "linha", primary_ref: C })).rejects.toThrow(/A busca de fontes oficiais só usa o modo sozinha/);
      await expect(save("busca_fontes", { mode: "comite", primary_ref: C })).rejects.toThrow(/só usa o modo sozinha/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: { provider: "ollama", model: "llama-x" } })).rejects.toThrow(/Ollama não busca na internet/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, fallback_ref: { provider: "ollama", model: "llama-x" } })).rejects.toThrow(/Ollama não busca/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, reviewers: [{ provider: "openai", model: "gpt-x" }] })).rejects.toThrow(/conferentes/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, max_searches: 11 })).rejects.toThrow(/de 1 a 10/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, max_searches: 0 })).rejects.toThrow(/de 1 a 10/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, max_searches: 2.5 })).rejects.toThrow(/de 1 a 10/);
      expect((await t.db.service<any>("ch_worker_ai_config")).functions).toEqual([]);

      const v = await save("busca_fontes", { mode: "sozinha", primary_ref: C, fallback_ref: { provider: "openai", model: "gpt-x" }, max_searches: 3 });
      expect(v).toMatchObject({ key: "busca_fontes", mode: "sozinha", max_searches: 3 });
      expect((await t.db.service<any>("ch_worker_ai_config")).functions.find((f: any) => f.key === "busca_fontes").max_searches).toBe(3);
      // sem máximo: nulo (o servidor usa o padrão)
      expect((await save("busca_fontes", { mode: "sozinha", primary_ref: C })).max_searches).toBeNull();
      // nas outras funções o máximo de buscas fica nulo
      expect((await save("criacao", { mode: "sozinha", primary_ref: C, max_searches: 4 })).max_searches).toBeNull();

      const s = await t.db.asUser<any>(t.editorUser, "app_ai_summary");
      expect(s.functions).toHaveLength(7);
      expect(s.functions.map((f: any) => f.key)).toEqual(["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes"]);
      expect(s.functions.find((f: any) => f.key === "busca_fontes")).toMatchObject({ configured: true, mode: "sozinha" });

      // tirar a configuração só desliga (a linha sai)
      expect(await save("busca_fontes", null)).toBeNull();
      expect((await t.db.service<any>("ch_worker_ai_config")).functions.map((f: any) => f.key)).toEqual(["criacao"]);
      // a regra da tabela aceita as 7 chaves e nenhuma outra
      await expect(sql(`insert into public.ai_functions (key, mode) values ('outra_funcao', 'sozinha')`)).rejects.toThrow(/ai_functions_key_check/);
    } finally {
      await save("busca_fontes", null);
      await save("criacao", null);
    }
  });

  it("ai_calls guarda web_searches; preço por busca preservado quando não vem", async () => {
    const call = { function_key: "busca_fontes", mode: "sozinha", role: "principal", provider: "anthropic", model: "claude-x", cost_usd: 0.05, outcome: "ok", source: "fontes-teste" };
    expect(await t.db.service<number>("ch_worker_ai_log_calls", { p_calls: [{ ...call, item_id: "a", web_searches: 4 }, { ...call, item_id: "b" }] })).toBe(2);
    expect(await sql(`select item_id, web_searches from public.ai_calls where source = 'fontes-teste' order by item_id`)).toEqual([
      { item_id: "a", web_searches: 4 },
      { item_id: "b", web_searches: 0 },
    ]);
    await expect(t.db.service("ch_worker_ai_log_calls", { p_calls: [{ ...call, item_id: "c", web_searches: -1 }] })).rejects.toThrow();

    const price = (p_price: Record<string, unknown>) =>
      t.db.service<any>("ch_worker_ai_save_price", { p_actor: t.ADMIN, p_provider: "anthropic", p_model: "claude-x", p_price });
    expect(Number((await price({ input_per_mtok: 3, output_per_mtok: 15, per_search_usd: 0.01 })).per_search_usd)).toBe(0.01);
    const kept = await price({ input_per_mtok: 4, output_per_mtok: 16 });
    expect(Number(kept.input_per_mtok)).toBe(4);
    expect(Number(kept.per_search_usd)).toBe(0.01);
    const cfg = await t.db.service<any>("ch_worker_ai_config");
    expect(Number(cfg.prices.find((p: any) => p.model === "claude-x").per_search_usd)).toBe(0.01);
    await expect(price({ input_per_mtok: 4, output_per_mtok: 16, per_search_usd: -0.01 })).rejects.toThrow();
    expect((await price({ input_per_mtok: 4, output_per_mtok: 16, per_search_usd: null })).per_search_usd).toBeNull();
    const log = await sql(`select details from public.admin_audit_log where action = 'ai.price' and target = 'anthropic:claude-x' order by id`);
    expect(log.map((l) => (l.details.per_search_usd === null ? null : Number(l.details.per_search_usd)))).toEqual([0.01, 0.01, null]);
    await sql(`delete from public.ai_calls where source = 'fontes-teste'`);
    await sql(`delete from public.ai_model_prices where model = 'claude-x'`);
  });

  it("buscas e candidatos: só administrador lê", async () => {
    const c = await createCandidate();
    expect(c.duplicate).toBe(false);
    // RLS: leitura direta da tabela
    expect(await selectAs(t.EDITOR, "select id from public.ch_source_searches")).toEqual([]);
    expect(await selectAs(t.EDITOR, "select id from public.ch_source_candidates")).toEqual([]);
    expect((await selectAs(t.ADMIN, "select id from public.ch_source_searches")).length).toBeGreaterThan(0);
    expect((await selectAs(t.ADMIN, "select id from public.ch_source_candidates")).length).toBeGreaterThan(0);
    // funções da tela
    for (const [fn, args] of [
      ["app_ch_source_searches", {}],
      ["app_ch_source_candidates", {}],
      ["app_ch_source_candidate", { p_candidate_id: c.id }],
      ["app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { level: "B" } }],
      ["app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "Sífilis" } }],
    ] as const) {
      await expect(t.db.asUser(t.editorUser, fn, args), fn).rejects.toThrow(RESTRITO);
      await expect(t.db.asUser(t.studentUser, fn, args), fn).rejects.toThrow(RESTRITO);
    }
    const searches = await asAdmin<any[]>("app_ch_source_searches", { p_limit: 5 });
    expect(searches).toHaveLength(5);
    expect(searches[0]).toMatchObject({ status: "na_fila", job_status: "queued", job_error: null });
    expect(new Date(searches[0].created_at).getTime()).toBeGreaterThanOrEqual(new Date(searches[4].created_at).getTime());
  });

  it("ch_url_norm tira #, utm_*, :443 e a caixa do host", async () => {
    expect(await norm("https://WWW.Gov.BR:443/Saude/X.pdf?utm_source=a&id=2#p3")).toBe("https://www.gov.br/Saude/X.pdf?id=2");
    expect(await norm("HTTPS://gov.br/a?utm_medium=x&UTM_Campaign=y")).toBe("https://gov.br/a");
    expect(await norm("https://gov.br/a?")).toBe("https://gov.br/a");
    expect(await norm("https://gov.br/A/B?x=1&Y=%20z")).toBe("https://gov.br/A/B?x=1&Y=%20z");
    expect(await norm("https://gov.br:8443/a")).toBe("https://gov.br:8443/a");
    expect(await norm("  https://who.int/x#")).toBe("https://who.int/x");
  });

  it("repetidos por link e por SHA-256", async () => {
    const L = "https://www.gov.br/saude/pt-br/pcdt-hepatite-c.pdf";
    const S = sha(0xabc);
    const c = await createCandidate({ requested_url: L, final_url: "https://www.gov.br/saude/arquivos/pcdt-hepatite-c-final.pdf", sha256: S, storage_path: `source-candidates/${S}.pdf` });
    expect(c.duplicate).toBe(false);
    const [row] = await sql(`select url_norm, final_url_norm, status from public.ch_source_candidates where id = $1`, [c.id]);
    expect(row).toEqual({ url_norm: L, final_url_norm: "https://www.gov.br/saude/arquivos/pcdt-hepatite-c-final.pdf", status: "aguardando" });

    expect(await known(L + "#x", null)).toBe("Repetido: candidato aguardando sua conferência.");
    expect(await known("https://www.gov.br/saude/arquivos/pcdt-hepatite-c-final.pdf?utm_source=busca", null)).toBe("Repetido: candidato aguardando sua conferência.");
    expect(await known("https://outro.gov.br/x.pdf", S)).toBe("Repetido: candidato aguardando sua conferência.");
    // criar de novo pelo mesmo link ou pelo mesmo arquivo não duplica
    expect(await createCandidate({ requested_url: L, final_url: L })).toEqual({ id: c.id, duplicate: true });
    expect(await createCandidate({ sha256: S })).toEqual({ id: c.id, duplicate: true });

    await sql(`update public.ch_source_candidates set status = 'aprovado' where id = $1`, [c.id]);
    expect(await known(L, null)).toBe("Repetido: já aprovado antes.");
    await sql(`update public.ch_source_candidates set status = 'rejeitado' where id = $1`, [c.id]);
    expect(await known(null, S)).toBe("Repetido: rejeitado antes.");

    // fonte cadastrada pelo link (normalizado) ou pelo SHA-256: vem antes do candidato
    const L2 = "https://bvsms.saude.gov.br/bvs/publicacoes/manual-x.pdf";
    await asAdmin("app_ch_register_source", { p_source: { title: "Manual X", organ: "Ministério da Saúde", url: L2 } });
    expect(await known("https://BVSMS.saude.gov.br/bvs/publicacoes/manual-x.pdf?utm_source=busca", null)).toBe("Repetido: fonte já cadastrada.");
    await asAdmin("app_ch_register_source", { p_source: { title: "Mesmo arquivo", organ: "Ministério da Saúde", sha256: S } });
    expect(await known("https://outro.gov.br/y.pdf", S)).toBe("Repetido: fonte já cadastrada.");

    // endereço vigiado e documento já na Central
    const watched = await asAdmin("app_ch_register_source", { p_source: { title: "Fonte vigiada", organ: "Conitec" } });
    await sql(`insert into public.ch_source_watch (source_id, url) values ($1, 'https://www.gov.br/conitec/pt-br/relatorio.pdf')`, [watched.id]);
    expect(await known("https://www.gov.br/conitec/pt-br/relatorio.pdf#page=2", null)).toBe("Repetido: endereço já vigiado.");
    const S3 = sha(0xdddd);
    await sql(`insert into public.ch_documents (owner_id, name, sha256) values ($1, 'Documento enviado à mão', $2)`, [t.ADMIN, S3]);
    expect(await known("https://www.gov.br/saude/novo.pdf", S3)).toBe("Repetido: documento já está na Central.");

    // link novo e arquivo novo
    expect(await known("https://www.gov.br/saude/pt-br/inedito.pdf", sha(0xeeee))).toBeNull();
    expect(await known(null, null)).toBeNull();
  });

  it("lista de candidatos: governo primeiro, depois os mais recentes; contadores; substituição pela regra única", async () => {
    await sql(`update public.ch_source_candidates set status = 'rejeitado' where status = 'aguardando'`);
    const soc = (await sql(`select id from public.ch_official_domains where address = 'sbp.com.br'`))[0].id;
    const old = await createCandidate({ ai_published: "2019-05-01", file_date: null });
    const socNew = await createCandidate({ domain_id: soc, ai_published: "2026-01-10", ai_institution: "Sociedade Brasileira de Pediatria" });
    const recent = await createCandidate({ ai_published: null, file_date: "2025-12-01" });
    const list = await asAdmin("app_ch_source_candidates");
    expect(list.items.map((i: any) => i.id)).toEqual([recent.id, old.id, socNew.id]);
    expect(list.items[2]).toMatchObject({ site_address: "sbp.com.br", site_kind: "sociedade", site_institution: "Sociedade Brasileira de Pediatria" });
    expect(list.items[0].search).toMatchObject({ area: "CLINICA_MEDICA", provider: null, model: null });
    expect(list.items[0].search.theme).toMatch(/^Tema de teste/);
    const counts = await sql(`select status, count(*)::int as n from public.ch_source_candidates group by status`);
    expect(list.counts).toEqual({ aguardando: 3, aprovado: counts.find((c) => c.status === "aprovado")?.n ?? 0, rejeitado: counts.find((c) => c.status === "rejeitado")?.n ?? 0 });
    expect((await asAdmin("app_ch_source_candidates", { p_status: "rejeitado" })).items.every((i: any) => i.status === "rejeitado")).toBe(true);
    await expect(asAdmin("app_ch_source_candidates", { p_status: "talvez" })).rejects.toThrow(/Situação inválida/);

    // substituição: mesmo título e órgão (sem caixa, editado antes do que a IA disse) E arquivo ou versão diferente
    const src = await asAdmin("app_ch_register_source", { p_source: { title: "PCDT Dengue", organ: "Ministério da Saúde", version: "2024", sha256: sha(0x2024) } });
    let item = await asAdmin("app_ch_source_candidate", { p_candidate_id: recent.id });
    expect(item).toMatchObject({ id: recent.id, status: "aguardando", replaces: null });
    // a IA disse outro título; o administrador corrige (a caixa não conta)
    await asAdmin("app_ch_source_candidate_save", { p_candidate_id: recent.id, p_fields: { title: "pcdt DENGUE", institution: "ministério da saúde", version: "2025" } });
    item = await asAdmin("app_ch_source_candidate", { p_candidate_id: recent.id });
    expect(item.replaces).toEqual({ id: src.id, title: "PCDT Dengue", version: "2024" });
    expect((await asAdmin("app_ch_source_candidates")).items.find((i: any) => i.id === recent.id).replaces).toEqual({ id: src.id, title: "PCDT Dengue", version: "2024" });
    // mesmo arquivo e mesma versão: não substitui
    await sql(`update public.ch_source_candidates set sha256 = $2 where id = $1`, [recent.id, sha(0x2024)]);
    await asAdmin("app_ch_source_candidate_save", { p_candidate_id: recent.id, p_fields: { version: "2024" } });
    item = await asAdmin("app_ch_source_candidate", { p_candidate_id: recent.id });
    expect(item.replaces).toBeNull();
    // a mesma regra vale no cadastro: mesmo arquivo e versão não substitui; versão nova substitui
    const y1 = await asAdmin("app_ch_register_source", { p_source: { title: "Manual Y", organ: "Anvisa", version: "1", sha256: sha(0x3001) } });
    expect((await asAdmin("app_ch_register_source", { p_source: { title: "MANUAL Y", organ: "anvisa", version: "1", sha256: sha(0x3001) } })).superseded).toBeNull();
    expect((await sql(`select status from public.ch_sources where id = $1`, [y1.id]))[0].status).toBe("current");
    const v2 = await asAdmin("app_ch_register_source", { p_source: { title: "PCDT Dengue", organ: "ministério da saúde", version: "2025", sha256: sha(0x2025) } });
    expect(v2.superseded).toBe(src.id);
    expect((await sql(`select status, superseded_by from public.ch_sources where id = $1`, [src.id]))[0]).toEqual({ status: "superseded", superseded_by: v2.id });
    await expect(asAdmin("app_ch_source_candidate", { p_candidate_id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/Candidato não encontrado/);
  });

  it("editar candidato: mescla só as chaves da conferência, nível E recusado, só enquanto aguarda", async () => {
    const c = await createCandidate();
    const edit = (p_fields: Record<string, unknown>) => asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields });
    const r = await edit({ title: "  PCDT Sífilis  ", level: "b", kind: "society_guideline", nature: "GUIDELINE", area: "GINECOLOGIA_OBSTETRICIA", published_on: "2025-02-28", outra: "x" });
    expect(r.edited).toEqual({ title: "PCDT Sífilis", level: "B", kind: "society_guideline", nature: "GUIDELINE", area: "GINECOLOGIA_OBSTETRICIA", published_on: "2025-02-28" });
    // vazio tira a chave
    expect((await edit({ published_on: "", theme: "Sífilis congênita", valid_until: "2027-12-31" })).edited).toEqual({
      title: "PCDT Sífilis", level: "B", kind: "society_guideline", nature: "GUIDELINE", area: "GINECOLOGIA_OBSTETRICIA", theme: "Sífilis congênita", valid_until: "2027-12-31",
    });
    await expect(edit({ level: "E" })).rejects.toThrow(/Nível E não entra pela busca: escolha de A a D\./);
    await expect(edit({ level: "Z" })).rejects.toThrow(/Escolha o nível de A a D/);
    await expect(edit({ kind: "artigo" })).rejects.toThrow(/Tipo de fonte inválido/);
    await expect(edit({ nature: "Diretriz qualquer" })).rejects.toThrow(/Natureza da fonte inválida/);
    await expect(edit({ area: "CARDIOLOGIA" })).rejects.toThrow(/Área inválida/);
    await expect(edit({ published_on: "2024" })).rejects.toThrow(/AAAA-MM-DD/);
    await expect(edit({ published_on: "2024-02-30" })).rejects.toThrow(/AAAA-MM-DD/);
    await expect(edit({ valid_until: "31/12/2027" })).rejects.toThrow(/AAAA-MM-DD/);
    await expect(edit({ title: "x".repeat(301) })).rejects.toThrow(/300 caracteres/);
    await expect(asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: ["nível B"] })).rejects.toThrow(/Dados inválidos/);
    const log = await sql(`select actor_id from public.ch_audit where action = 'source_candidate.edit' and target = $1`, [c.id]);
    expect(log).toHaveLength(2);
    expect(log[0].actor_id).toBe(t.ADMIN);
    await sql(`update public.ch_source_candidates set status = 'rejeitado' where id = $1`, [c.id]);
    await expect(edit({ level: "A" })).rejects.toThrow(/Este candidato já foi decidido/);
    // nível E também não entra pelo processamento
    await expect(createCandidate({ ai_level: "E" })).rejects.toThrow();
    await expect(createCandidate({ suggested_level: "E" })).rejects.toThrow();
  });

  it("processamento: lê a busca com os sites ativos e grava o resultado com quem pediu", async () => {
    const id = await newSearch(null);
    const got = await t.db.service<any>("ch_worker_source_search_get", { p_search_id: id });
    expect(got).toMatchObject({ id, area: null, status: "na_fila", requested_by: t.ADMIN });
    // o site desativado no teste do endereço não entra
    expect(got.domains.map((d: any) => d.address)).not.toContain("exemplo.gov.br/saude");
    expect(got.domains).toHaveLength(11);
    expect(got.domains[0]).toEqual({ id: expect.any(String), address: "bvsms.saude.gov.br", institution: "Biblioteca Virtual em Saúde do Ministério da Saúde", kind: "governo" });
    expect(await t.db.service("ch_worker_source_search_get", { p_search_id: "00000000-0000-4000-8000-000000000000" })).toBeNull();

    const update = (p_patch: Record<string, unknown>) => t.db.service("ch_worker_source_search_update", { p_search_id: id, p_patch });
    await update({ status: "buscando" });
    let [s] = await sql(`select * from public.ch_source_searches where id = $1`, [id]);
    expect(s).toMatchObject({ status: "buscando", finished_at: null });
    const runId = "11111111-1111-4111-8111-111111111111";
    await update({
      status: "concluida", provider: "anthropic", model: "claude-x", run_id: runId, web_searches: 3, cost_usd: 0.0475, found_count: 3, verified_count: 1,
      discarded: [{ link: "https://exemplo.com/a.pdf", titulo: "A", motivo: "Site fora da lista de sites oficiais." }, { link: "https://www.gov.br/saude/b.pdf", titulo: "B", motivo: "O trecho citado pela IA não está no arquivo." }],
      message: "1 conferido, 2 descartados.",
    });
    [s] = await sql(`select * from public.ch_source_searches where id = $1`, [id]);
    expect(s).toMatchObject({ status: "concluida", provider: "anthropic", model: "claude-x", run_id: runId, web_searches: 3, found_count: 3, verified_count: 1, discarded_count: 2, message: "1 conferido, 2 descartados." });
    expect(Number(s.cost_usd)).toBe(0.0475);
    expect(s.finished_at).toBeTruthy();
    const audit = await sql(`select actor_id, details from public.ch_audit where action = 'source_search.result' and target = $1`, [id]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: t.ADMIN, details: { status: "concluida", verified_count: 1, discarded_count: 2 } });
    await expect(update({ status: "talvez" })).rejects.toThrow(/Situação da busca inválida/);
    await expect(update({ discarded: { link: "x" } })).rejects.toThrow();
    await expect(t.db.service("ch_worker_source_search_update", { p_search_id: "00000000-0000-4000-8000-000000000000", p_patch: { status: "buscando" } })).rejects.toThrow(/Busca não encontrada/);
  });

  it("ch_jobs aceita source_search e continua aceitando visual_render (e as etapas dos outros ramos)", async () => {
    try {
      for (const step of ["source_search", "visual_render", "source_index", "station_pages", "station_segment", "station_draft", "question_generate", "question_check", "question_source"]) {
        await sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ($1, 'teste', $2)`, [step, `teste-etapa:${step}`]);
      }
      await expect(sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ('nada', 'teste', 'teste-etapa:nada')`)).rejects.toThrow(/ch_jobs_step_check/);
    } finally {
      await sql(`delete from public.ch_jobs where idempotency_key like 'teste-etapa:%'`);
    }
  });

  it("tabelas com RLS e funções de serviço fechadas para anon e authenticated", async () => {
    const open = await sql(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and relname in ('ch_official_domains', 'ch_source_searches', 'ch_source_candidates') and not relrowsecurity`
    );
    expect(open).toEqual([]);
    const fns = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'ch\\_worker\\_source\\_%' or p.proname like 'ch\\_worker\\_ai\\_%' or p.proname in ('ch_url_norm', 'ch_source_replacement', 'ch_source_candidate_item'))`
    );
    expect(fns.map((f) => f.proname)).toEqual(expect.arrayContaining(["ch_url_norm", "ch_worker_source_known", "ch_worker_source_candidate_create", "ch_worker_source_search_get", "ch_worker_source_search_update", "ch_source_replacement", "ch_source_candidate_item"]));
    const leaking = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'ch\\_worker\\_source\\_%' or p.proname like 'ch\\_worker\\_ai\\_%' or p.proname in ('ch_url_norm', 'ch_source_replacement', 'ch_source_candidate_item'))
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`
    );
    expect(leaking).toEqual([]);
    const anon = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'app\\_ch\\_source\\_%' or p.proname like 'app\\_ch\\_%official\\_domain%')
          and has_function_privilege('anon', p.oid, 'execute')`
    );
    expect(anon).toEqual([]);
  });
});
