// @vitest-environment node
/**
 * Fontes oficiais, atualidade: a busca na fila (IA e internet de mentira, banco de verdade em memória) classifica cada candidato
 * em relação à biblioteca e aos outros achados; o pedido à IA leva a instrução de "versão mais recente em vigor" e os títulos e
 * datas das fontes vigentes; a lista vem com os mais atuais primeiro; aprovar versão mais antiga exige confirmação própria;
 * nada vira fonte sem aprovação. Nenhuma IA nem rede reais.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";
import { fakeWeb, makePdf } from "./helpers/fontesFixtures";
import { createContentHubWorker } from "../../server/contentHub/worker";
import { localStorageDir, type Storage } from "../../server/contentHub/infra";
import { invalidateAiConfig } from "../../server/ai/config";
import type { ModelRef } from "../../server/ai/config";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-atual-"));
let t: FontesDb;
let storage: Storage;
const A: ModelRef = { provider: "anthropic", model: "claude-sonnet-5-5" };

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
  storage = localStorageDir(path.join(tmp, "files"));
}, 300_000);
afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
const refresh = () => invalidateAiConfig(t.db);
const asAdmin = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.adminUser, fn, args);

async function setupAi() {
  for (const q of ["delete from public.ai_calls", "delete from public.ai_functions", "delete from public.ai_model_prices", "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null"]) await t.dev.db.query(q);
  await t.db.service("ch_worker_ai_set_provider", { p_actor: t.ADMIN, p_provider: "anthropic", p_enabled: true });
  await t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: "busca_fontes", p_config: { mode: "sozinha", primary_ref: A, fallback_ref: null, reviewers: [], care: "caprichado" } });
  refresh();
}
beforeEach(async () => {
  await sql("delete from public.ch_jobs where step = 'source_search'");
  await sql("delete from public.ch_source_candidates");
  await sql("delete from public.ch_source_searches");
  await sql("delete from public.ch_sources");
  await setupAi();
});

// ---------------------------------------------------------------- dublês
const lines = (marker: string, dated?: string) => [
  `Protocolo clinico sintetico numero ${marker}.`,
  "A gestante com pre-eclampsia grave deve ser",
  `encaminhada ao centro de referencia ${marker}.`,
  ...(dated ? [`Publicado em ${dated}.`] : []),
  "Texto de apoio para a leitura do arquivo pelo servidor.",
];
const quoteOf = (marker: string) => `A gestante com pre-eclampsia grave deve ser encaminhada ao centro de referencia ${marker}.`;
/** PDF cujo texto traz a data escrita como `dated` (ou nenhuma) e, opcionalmente, a data interna dos metadados. */
const pdfRoute = (marker: string, dated?: string, creationDate?: string) => ({
  headers: { "content-type": "application/pdf" },
  body: makePdf([lines(marker, dated).join("\n")], { title: `PCDT ${marker}`, ...(creationDate ? { creationDate } : {}) }),
});
const htmlRoute = (marker: string, meta = "") => ({
  headers: { "content-type": "text/html; charset=utf-8" },
  body: `<html><head><title>Pagina ${marker}</title>${meta}</head><body><h1>Pagina ${marker}</h1><p>${lines(marker).join(" ")}</p></body></html>`,
});
const finding = (link: string, marker: string, over: Record<string, unknown> = {}) => ({
  titulo: `PCDT ${marker}`,
  instituicao: "Ministério da Saúde",
  link,
  data_publicacao: "2025-03-14",
  natureza: "PCDT",
  tipo: "final",
  nivel_sugerido: "A",
  motivo: "Documento oficial do tema pedido.",
  trecho: quoteOf(marker),
  ...over,
});
function fakeAi(answer: (call: number) => unknown) {
  const calls: any[] = [];
  return {
    calls,
    aiMaker: (ref: ModelRef) => ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate(req: any) {
        calls.push(req);
        return { output: answer(calls.length), provider: ref.provider, model: ref.model, inputTokens: 100, outputTokens: 50, latencyMs: 1, costUsd: null, webSearches: 2, seenUrls: [] };
      },
    }),
  };
}
const noAi = { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada." } };
const depsOf = (ai: ReturnType<typeof fakeAi>, web: ReturnType<typeof fakeWeb>, over: Record<string, unknown> = {}) => ({ db: t.db, storage, ai: noAi, aiMaker: ai.aiMaker, web: { fetchImpl: web, checkHost: async () => {} }, ...over }) as any;

let seq = 0;
async function startSearch(theme = `Tema ${++seq}`, area: string | null = "CLINICA_MEDICA") {
  const r = await asAdmin("app_ch_source_search_start", { p_request: { area, theme } });
  return r.searches[0].id as string;
}
const library = async (title: string, published_on: string | null, version = "2019") =>
  (await asAdmin("app_ch_register_source", { p_source: { title, organ: "Ministério da Saúde", kind: "final", version, published_on } })).id as string;
const cands = async (searchId?: string) => sql(`select * from public.ch_source_candidates ${searchId ? "where search_id = $1" : ""} order by created_at, id`, searchId ? [searchId] : []);
const byTitle = async (title: string) => (await sql("select * from public.ch_source_candidates where ai_title = $1 order by created_at", [title]))[0];

describe("pedido à IA: versão mais recente em vigor e fontes vigentes do tema", () => {
  it("o prompt manda buscar a versão mais nova e conferir a data; a entrada leva título, órgão, versão e datas das fontes vigentes do tema (sem texto de documento)", async () => {
    await library("PCDT Hepatite C", "2019-03-01", "2019");
    await library("PCDT Asma", "2020-01-01", "2020");
    await sql("update public.ch_sources set valid_until = '2024-12-31' where title = 'PCDT Hepatite C'");
    const id = await startSearch("Hepatite C");
    const ai = fakeAi(() => ({ documentos: [], observacao: "Só achei a versão de 2019, sem data de atualização." }));
    await createContentHubWorker(depsOf(ai, fakeWeb({}))).drain();
    const sent = ai.calls[0];
    expect(sent.promptVersion).toBe("1.1.0");
    for (const re of [/MAIS RECENTE EM VIGOR/, /PCDT, diretriz, protocolo, nota técnica/, /data de publicação ou de atualização e a vigência/, /Procure ativamente se existe versão MAIS NOVA/, /Não afirme que uma versão é a mais atual sem que a página ou o documento mostre a data/, /só achou versão antiga/, /vigente_ate/]) {
      expect(sent.system).toMatch(re);
    }
    const doc = JSON.parse(/<documento>\n([\s\S]*)\n<\/documento>/.exec(sent.input)![1]);
    // só a fonte do tema entra, só com título, órgão, versão e datas
    expect(doc.biblioteca).toEqual([{ titulo: "PCDT Hepatite C", orgao: "Ministério da Saúde", versao: "2019", publicada_em: "2019-03-01", vigente_ate: "2024-12-31" }]);
    // a observação da IA sobre versão antiga chega ao dono
    expect((await sql("select message, status from public.ch_source_searches where id = $1", [id]))[0]).toMatchObject({ status: "nada_encontrado", message: "Só achei a versão de 2019, sem data de atualização." });
  });

  it("biblioteca vazia vai como lista vazia; função de apoio ausente (servidor novo com SQL antigo) não derruba a busca", async () => {
    const id = await startSearch("Tema sem biblioteca");
    const ai = fakeAi(() => ({ documentos: [], observacao: null }));
    await createContentHubWorker(depsOf(ai, fakeWeb({}))).drain();
    expect(JSON.parse(/<documento>\n([\s\S]*)\n<\/documento>/.exec(ai.calls[0].input)![1]).biblioteca).toEqual([]);

    const flaky = { ...t.db, service: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "ch_worker_source_library_for_theme" || fn.startsWith("ch_worker_source_currency_")) throw new Error(`Could not find the function public.${fn} in the schema cache`);
      return t.db.service(fn, args);
    } } as any;
    const id2 = await startSearch("Tema com SQL antigo");
    const web = fakeWeb({ "https://www.gov.br/saude/a.pdf": pdfRoute("alfa", "14/03/2025") });
    const ai2 = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/a.pdf", "alfa")], observacao: null }));
    await createContentHubWorker(depsOf(ai2, web, { db: flaky })).drain();
    expect((await sql("select status, verified_count from public.ch_source_searches where id = $1", [id2]))[0]).toEqual({ status: "concluida", verified_count: 1 });
    const c = (await cands(id2))[0];
    expect(c).toMatchObject({ status: "aguardando", currency: null, currency_date: "2025-03-14" });
    expect(id).not.toBe(id2);
  });
});

describe("atualidade dos candidatos", () => {
  async function runMixed() {
    await library("PCDT alfa", "2019-03-01");
    await library("PCDT beta", "2025-03-14");
    await library("PCDT gama", "2025-03-14");
    const id = await startSearch("Pré-eclâmpsia");
    const web = fakeWeb({
      "https://www.gov.br/saude/alfa.pdf": pdfRoute("alfa", "14/03/2025"),
      "https://www.gov.br/saude/beta.pdf": pdfRoute("beta", "14 de MARCO de 2025"),
      "https://www.gov.br/saude/gama.pdf": pdfRoute("gama", "01/01/2018"),
      "https://www.gov.br/saude/delta.pdf": pdfRoute("delta"), // a IA diz 2025-03-14, o texto não traz data
      "https://www.gov.br/saude/eps-velho.pdf": pdfRoute("eps1", "01/01/2020"),
      "https://www.gov.br/saude/eps-novo.pdf": pdfRoute("eps2", "01/06/2024"),
      "https://www.gov.br/saude/zeta.pdf": pdfRoute("zeta", "20/02/2023"),
      "https://www.gov.br/saude/eta.pdf": pdfRoute("eta", undefined, "D:20260101000000"), // só a data interna do PDF
    });
    const docs = [
      finding("https://www.gov.br/saude/alfa.pdf", "alfa"),
      finding("https://www.gov.br/saude/beta.pdf", "beta"),
      finding("https://www.gov.br/saude/gama.pdf", "gama", { data_publicacao: "2018-01-01" }),
      finding("https://www.gov.br/saude/delta.pdf", "delta"),
      finding("https://www.gov.br/saude/eps-velho.pdf", "eps1", { titulo: "PCDT epsilon", data_publicacao: "2020-01-01" }),
      finding("https://www.gov.br/saude/eps-novo.pdf", "eps2", { titulo: "PCDT epsilon", data_publicacao: "2024-06-01" }),
      finding("https://www.gov.br/saude/zeta.pdf", "zeta", { data_publicacao: "2023-02-20", vigente_ate: "2030-01-01" }),
      finding("https://www.gov.br/saude/eta.pdf", "eta", { data_publicacao: null }),
    ];
    const ai = fakeAi(() => ({ documentos: docs, observacao: null }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    return id;
  }

  it("classifica: mais nova, mesma versão, mais antiga, outra mais nova, data não comprovada e documento novo", async () => {
    const id = await runMixed();
    const s = (await sql("select status, verified_count from public.ch_source_searches where id = $1", [id]))[0];
    expect(s).toEqual({ status: "concluida", verified_count: 8 });
    const state = async (title: string) => (await byTitle(title)).currency;
    expect(await state("PCDT alfa")).toBe("versao_mais_nova");
    expect(await state("PCDT beta")).toBe("mesma_versao");
    expect(await state("PCDT gama")).toBe("versao_mais_antiga");
    expect(await state("PCDT delta")).toBe("data_nao_comprovada");
    expect(await state("PCDT zeta")).toBe("sem_comparacao");
    expect(await state("PCDT eta")).toBe("data_nao_comprovada");
    const eps = await sql("select currency, final_url from public.ch_source_candidates where ai_title = 'PCDT epsilon' order by final_url");
    expect(eps.map((e) => e.currency)).toEqual(["sem_comparacao", "outra_mais_nova"]); // eps-novo (sem comparação), eps-velho (outra mais nova)
    const alfa = await byTitle("PCDT alfa");
    expect(alfa.currency_date).toBe("2025-03-14");
    expect(alfa.currency_info).toMatchObject({ basis: "texto", library: { title: "PCDT alfa", published_on: "2019-03-01" } });
    expect(alfa.currency_info.note).toMatch(/Mais nova que a fonte vigente "PCDT alfa" \(versão 2019\)/);
    // vigência da IA: guardada; só "comprovada" se estiver no texto (aqui não está)
    const zeta = await byTitle("PCDT zeta");
    expect(zeta.ai_valid_until).toBe("2030-01-01");
    expect(zeta.currency_info).toMatchObject({ valid_until: "2030-01-01", valid_until_proven: false });
    // data da IA fora do texto e metadado de PDF: nunca viram data comprovada, e o motivo fica escrito
    const delta = await byTitle("PCDT delta");
    expect(delta.currency_date).toBeNull();
    expect(delta.currency_info.notes.join(" ")).toMatch(/dita pela IA \(14\/03\/2025\) não aparece no documento/);
    const eta = await byTitle("PCDT eta");
    expect(eta.currency_date).toBeNull();
    expect(eta.currency_info.notes.join(" ")).toMatch(/data interna \(01\/01\/2026\), que não prova/);
    // nada vira fonte sem aprovação: só as 3 da biblioteca existem
    expect((await sql("select count(*)::int as n from public.ch_sources"))[0].n).toBe(3);
    expect((await sql("select count(*)::int as n from public.ch_source_candidates where status <> 'aguardando'"))[0].n).toBe(0);
  });

  it("a lista vem com os mais atuais primeiro", async () => {
    await runMixed();
    const list = await asAdmin("app_ch_source_candidates", { p_status: "aguardando" });
    const order = list.items.map((c: any) => c.currency);
    expect(order[0]).toBe("versao_mais_nova");
    expect(order.at(-1)).toBe("versao_mais_antiga");
    const rank = (c: string) => ["versao_mais_nova", "sem_comparacao", "mesma_versao", "data_nao_comprovada", "outra_mais_nova", "versao_mais_antiga"].indexOf(c);
    expect(order.map(rank)).toEqual([...order.map(rank)].sort((a, b) => a - b));
    // o item traz o estado, a data comprovada e a fonte da biblioteca que seria substituída
    expect(list.items[0]).toMatchObject({ ai_title: "PCDT alfa", currency: "versao_mais_nova", currency_date: "2025-03-14", replaces: { title: "PCDT alfa" } });
  });

  it("achado mais novo de OUTRA busca vira 'outra mais nova' para o candidato antigo que ainda aguarda", async () => {
    const first = await startSearch("Tema A");
    const web = fakeWeb({ "https://www.gov.br/saude/velho.pdf": pdfRoute("v1", "01/01/2020"), "https://www.gov.br/saude/novo.pdf": pdfRoute("v2", "01/06/2024") });
    const ai1 = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/velho.pdf", "v1", { titulo: "PCDT doc", data_publicacao: "2020-01-01" })], observacao: null }));
    await createContentHubWorker(depsOf(ai1, web)).drain();
    expect((await cands(first))[0].currency).toBe("sem_comparacao");
    const second = await startSearch("Tema B");
    const ai2 = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/novo.pdf", "v2", { titulo: "PCDT doc", data_publicacao: "2024-06-01" })], observacao: null }));
    await createContentHubWorker(depsOf(ai2, web)).drain();
    expect((await cands(first))[0]).toMatchObject({ currency: "outra_mais_nova" });
    expect((await cands(first))[0].currency_info.newer.date).toBe("2024-06-01");
    expect((await cands(second))[0].currency).toBe("sem_comparacao");
    // rodar a conferência de novo não muda nada
    expect(await t.db.service("ch_worker_source_currency_set", { p_updates: [] })).toBe(0);
  });

  it("página web que declara a data comprova; sem declaração, fica sem prova", async () => {
    await library("Pagina web1", "2019-01-01");
    await library("Pagina web2", "2019-01-01");
    const id = await startSearch("Tema web");
    const web = fakeWeb({
      "https://bvsms.saude.gov.br/web1": htmlRoute("web1", '<meta property="article:published_time" content="2024-02-01T10:00:00Z">'),
      "https://bvsms.saude.gov.br/web2": htmlRoute("web2"),
    });
    const ai = fakeAi(() => ({
      documentos: [
        finding("https://bvsms.saude.gov.br/web1", "web1", { titulo: "Pagina web1", data_publicacao: null }),
        finding("https://bvsms.saude.gov.br/web2", "web2", { titulo: "Pagina web2", data_publicacao: null }),
      ],
      observacao: null,
    }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    expect(await byTitle("Pagina web1")).toMatchObject({ currency: "versao_mais_nova", currency_date: "2024-02-01" });
    expect((await byTitle("Pagina web1")).currency_info.basis).toBe("pagina");
    expect(await byTitle("Pagina web2")).toMatchObject({ currency: "data_nao_comprovada", currency_date: null });
    expect(id).toBeTruthy();
  });
});

describe("aprovar versão mais antiga", () => {
  const approve = (id: string, fields: Record<string, unknown> = {}) => asAdmin("app_ch_source_candidate_approve", { p_candidate_id: id, p_fields: { checked: true, level: "A", ...fields } });

  it("mais antiga que a biblioteca: pede confirmação própria, diz que substitui a mais nova e só então aprova; fica no registro", async () => {
    const libId = await library("PCDT gama", "2025-03-14");
    await startSearch("Tema antigo");
    const web = fakeWeb({ "https://www.gov.br/saude/gama.pdf": pdfRoute("gama", "01/01/2018") });
    const ai = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/gama.pdf", "gama", { data_publicacao: "2018-01-01" })], observacao: null }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    const c = await byTitle("PCDT gama");
    expect(c.currency).toBe("versao_mais_antiga");
    await expect(approve(c.id)).rejects.toThrow(/Confirme a versão mais antiga: esta fonte \(01\/01\/2018\) é mais antiga que a vigente "PCDT gama" \(versão 2019, 14\/03\/2025\) e aprovar vai SUBSTITUIR a mais nova pela mais antiga/);
    // a confirmação da substituição sozinha não basta
    await expect(approve(c.id, { confirm_replace: true })).rejects.toThrow(/Confirme a versão mais antiga/);
    expect((await sql("select status from public.ch_sources where id = $1", [libId]))[0].status).toBe("current");
    expect((await byTitle("PCDT gama")).status).toBe("aguardando");
    const r = await approve(c.id, { confirm_older: true });
    expect(r.superseded).toBe(libId);
    expect((await sql("select status from public.ch_sources where id = $1", [libId]))[0].status).toBe("superseded");
    expect((await byTitle("PCDT gama")).status).toBe("aprovado");
    const log = (await sql("select details from public.ch_audit where action = 'source_candidate.approve' and target = $1", [c.id]))[0].details;
    expect(log).toMatchObject({ currency: "versao_mais_antiga", confirmed_older: true });
  });

  it("'outra mais nova' sem fonte na biblioteca também pede a confirmação; a data do dono anterior à da biblioteca também", async () => {
    await startSearch("Tema doc");
    const web = fakeWeb({ "https://www.gov.br/saude/velho.pdf": pdfRoute("v1", "01/01/2020"), "https://www.gov.br/saude/novo.pdf": pdfRoute("v2", "01/06/2024") });
    const ai = fakeAi(() => ({
      documentos: [
        finding("https://www.gov.br/saude/velho.pdf", "v1", { titulo: "PCDT doc", data_publicacao: "2020-01-01" }),
        finding("https://www.gov.br/saude/novo.pdf", "v2", { titulo: "PCDT doc", data_publicacao: "2024-06-01" }),
      ],
      observacao: null,
    }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    const rows = await sql("select id, currency from public.ch_source_candidates order by currency");
    const old = rows.find((r) => r.currency === "outra_mais_nova")!;
    const fresh = rows.find((r) => r.currency === "sem_comparacao")!;
    await expect(approve(old.id)).rejects.toThrow(/Confirme a versão mais antiga: a busca achou outra versão mais nova deste mesmo documento/);
    // a mais nova aprova sem essa confirmação
    await expect(approve(fresh.id)).resolves.toMatchObject({ source_id: expect.any(String) });
  });

  it("mais nova que a biblioteca aprova como sempre (só a confirmação da substituição); sem estado também", async () => {
    const libId = await library("PCDT alfa", "2019-03-01");
    await startSearch("Tema novo");
    const web = fakeWeb({ "https://www.gov.br/saude/alfa.pdf": pdfRoute("alfa", "14/03/2025") });
    const ai = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/alfa.pdf", "alfa")], observacao: null }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    const c = await byTitle("PCDT alfa");
    await expect(approve(c.id)).rejects.toThrow(/Confirme a substituição: esta aprovação substitui a fonte vigente "PCDT alfa"/);
    const r = await approve(c.id, { confirm_replace: true });
    expect(r.superseded).toBe(libId);
    expect((await sql("select details from public.ch_audit where action = 'source_candidate.approve' and target = $1", [c.id]))[0].details).toMatchObject({ currency: "versao_mais_nova", confirmed_older: false });
  });
});

describe("pedir busca a partir de uma aba: verificação prévia e andamento", () => {
  it("só administrador chama; acha busca do mesmo tema nos últimos 7 dias e candidatos aguardando", async () => {
    await expect(t.db.asUser(t.editorUser, "app_ch_source_search_check", { p_area: "CLINICA_MEDICA", p_theme: "Asma" })).rejects.toThrow(/administradores/);
    await expect(t.db.asUser(t.studentUser, "app_ch_source_search_check", { p_area: null, p_theme: "Asma" })).rejects.toThrow();
    const empty = await asAdmin("app_ch_source_search_check", { p_area: "CLINICA_MEDICA", p_theme: "Asma" });
    expect(empty).toEqual({ recent: [], waiting: 0, search: null });

    const id = await startSearch("Asma", "CLINICA_MEDICA");
    const web = fakeWeb({ "https://www.gov.br/saude/asma.pdf": pdfRoute("asma", "14/03/2025") });
    const ai = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/asma.pdf", "asma")], observacao: null }));
    const before = await asAdmin("app_ch_source_search_check", { p_area: "CLINICA_MEDICA", p_theme: " ASMA ", p_search_id: id });
    expect(before.recent).toHaveLength(1);
    expect(before.search).toMatchObject({ id, status: "na_fila", verified_count: 0 });
    await createContentHubWorker(depsOf(ai, web)).drain();
    const after = await asAdmin("app_ch_source_search_check", { p_area: "CLINICA_MEDICA", p_theme: "asma", p_search_id: id });
    expect(after.recent[0]).toMatchObject({ id, status: "concluida", verified_count: 1 });
    expect(after.waiting).toBe(1);
    expect(after.search).toMatchObject({ status: "concluida", found_count: 1, verified_count: 1, discarded_count: 0 });
    // área diferente não casa; área nula casa com qualquer
    expect((await asAdmin("app_ch_source_search_check", { p_area: "PEDIATRIA", p_theme: "Asma" })).recent).toEqual([]);
    expect((await asAdmin("app_ch_source_search_check", { p_area: null, p_theme: "Asma" })).recent).toHaveLength(1);
    // busca de mais de 7 dias não conta; busca que falhou também não
    await sql("update public.ch_source_searches set created_at = now() - interval '8 days' where id = $1", [id]);
    expect((await asAdmin("app_ch_source_search_check", { p_area: null, p_theme: "Asma" })).recent).toEqual([]);
    expect((await asAdmin("app_ch_source_search_check", { p_area: null, p_theme: "Asma" })).waiting).toBe(1);
    await sql("update public.ch_source_searches set created_at = now(), status = 'falhou' where id = $1", [id]);
    expect((await asAdmin("app_ch_source_search_check", { p_area: null, p_theme: "Asma" })).recent).toEqual([]);
    // tema vazio: nada
    expect(await asAdmin("app_ch_source_search_check", { p_area: null, p_theme: "  " })).toEqual({ recent: [], waiting: 0, search: null });
  });
});

describe("migração 9820", () => {
  it("pode ser colada de novo sem apagar nada, e as funções de apoio são fechadas para quem chama de fora", async () => {
    await library("PCDT migr", "2019-03-01");
    await startSearch("Tema colar");
    const web = fakeWeb({ "https://www.gov.br/saude/migr.pdf": pdfRoute("migr", "14/03/2025") });
    const ai = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/migr.pdf", "migr")], observacao: null }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    const before = await byTitle("PCDT migr");
    const file = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003009820_fontes_atualidade.sql"), "utf8");
    await t.dev.db.exec(file);
    await t.dev.db.exec(file);
    const after = await byTitle("PCDT migr");
    expect(after).toMatchObject({ currency: before.currency, currency_date: before.currency_date, status: "aguardando" });
    // só o servidor chama as funções internas; a função da tela é de quem entrou e confere o papel dentro
    for (const call of ["ch_worker_source_library_for_theme('x')", "ch_worker_source_currency_context(gen_random_uuid())", "ch_worker_source_currency_set('[]'::jsonb)"]) {
      for (const role of ["authenticated", "anon"]) {
        await expect(t.dev.db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query(`select public.${call}`);
        }), `${role} ${call}`).rejects.toThrow(/permission denied/);
      }
    }
    // rejeitar não depende da atualidade: o candidato some da lista de aguardando e o estado fica
    const r = await asAdmin("app_ch_source_candidate_reject", { p_candidate_id: after.id, p_reason: "Motivo qualquer de teste." });
    expect(r).toHaveProperty("storage_path");
    expect((await asAdmin("app_ch_source_candidates", { p_status: "rejeitado" })).items[0]).toMatchObject({ currency: "versao_mais_nova" });
  });
});
