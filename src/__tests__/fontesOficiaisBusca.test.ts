// @vitest-environment node
/**
 * Fontes oficiais com IA — a busca na fila (etapa `source_search`): a IA procura (provedor falso), o servidor confere e baixa
 * cada achado (`fetch` falso, sem rede), os bons viram candidatos "aguardando" e o resto vira descarte com motivo. Nenhum teste
 * chama IA real nem a internet.
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
import { todayBR } from "../../server/contentHub/sources/search";
import type { ModelRef } from "../../server/ai/config";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-busca-"));
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

async function resetAi() {
  for (const q of [
    "delete from public.ai_calls",
    "delete from public.ai_functions",
    "delete from public.ai_model_prices",
    "update public.ai_providers set enabled = false, models = '[]'::jsonb, last_status = null",
    "update public.ai_settings set caps_enabled = false, monthly_cap_usd = null, per_run_cap_usd = null, tab_override_enabled = false",
  ]) {
    await t.dev.db.query(q);
  }
  refresh();
}
const turnOn = async () => {
  await t.db.service("ch_worker_ai_set_provider", { p_actor: t.ADMIN, p_provider: "anthropic", p_enabled: true });
  refresh();
};
const saveSearchFn = async (max?: number) => {
  await t.db.service("ch_worker_ai_save_function", {
    p_actor: t.ADMIN,
    p_key: "busca_fontes",
    p_config: { mode: "sozinha", primary_ref: A, fallback_ref: null, reviewers: [], care: "caprichado", ...(max ? { max_searches: max } : {}) },
  });
  refresh();
};
beforeEach(async () => {
  await resetAi();
  await sql("delete from public.ch_jobs where step = 'source_search'");
});

// ---------------------------------------------------------------- dublês
const HTML_HEAD = "text/html; charset=utf-8";
/** Texto de um documento de teste: bem acima de 100 caracteres, com uma frase própria (a que a IA cita). */
/** Linhas curtas (cabem na página do PDF); a frase que a IA cita atravessa duas linhas, como num texto de verdade. */
const lines = (marker: string) => [
  `Protocolo clinico sintetico numero ${marker}.`,
  "A gestante com pre-eclampsia grave deve ser",
  `encaminhada ao centro de referencia ${marker}.`,
  "Texto de apoio para a leitura do arquivo pelo servidor.",
];
const body = (marker: string) => lines(marker).join("\n");
const quoteOf = (marker: string) => `A gestante com pre-eclampsia grave deve ser encaminhada ao centro de referencia ${marker}.`;
const pdfRoute = (marker: string) => ({ headers: { "content-type": "application/pdf" }, body: makePdf([body(marker)], { title: `PCDT ${marker}` }) });
const htmlRoute = (marker: string) => ({ headers: { "content-type": HTML_HEAD }, body: `<html><head><title>Pagina ${marker}</title></head><body><h1>Pagina ${marker}</h1><p>${lines(marker).join(" ")}</p></body></html>` });
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

interface FakeAi {
  aiMaker: (ref: ModelRef) => any;
  calls: any[];
}
/** Provedor falso da busca: devolve `documentos` (ou o que `answer` mandar), com 3 buscas e 100/50 tokens; guarda cada pedido. */
function fakeAi(answer: (call: number) => unknown, use: { webSearches?: number; seenUrls?: string[] } = {}): FakeAi {
  const calls: any[] = [];
  return {
    calls,
    aiMaker: (ref: ModelRef) => ({
      name: ref.provider,
      model: ref.model,
      isMock: false,
      async generate(req: any) {
        calls.push(req);
        const out = answer(calls.length);
        return { output: out, provider: ref.provider, model: ref.model, inputTokens: 100, outputTokens: 50, latencyMs: 1, costUsd: null, webSearches: use.webSearches ?? 3, seenUrls: use.seenUrls ?? [] };
      },
    }),
  };
}
const noAi = { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "IA não configurada." } };
const depsOf = (ai: FakeAi, web: ReturnType<typeof fakeWeb>, over: Record<string, unknown> = {}) =>
  ({ db: t.db, storage, ai: noAi, aiMaker: ai.aiMaker, web: { fetchImpl: web, checkHost: async () => {} }, ...over }) as any;

let seq = 0;
async function startSearch(area: string | null = "CLINICA_MEDICA") {
  const r = await t.db.asUser<any>(t.adminUser, "app_ch_source_search_start", { p_request: { area, theme: `Tema da busca ${++seq}` } });
  const id = r.searches[0].id as string;
  const job = (await sql("select * from public.ch_jobs where scope_key = $1", [`search:${id}`]))[0];
  return { id, job };
}
const searchRow = async (id: string) => (await sql("select * from public.ch_source_searches where id = $1", [id]))[0];
const candidates = async (id: string) => sql("select * from public.ch_source_candidates where search_id = $1 order by created_at", [id]);
const jobOf = async (jobId: string) => (await sql("select status, attempts, error from public.ch_jobs where id = $1", [jobId]))[0];

describe("Busca na fila", () => {
  it("busca completa com achados misturados: 2 candidatos aguardando e 4 descartes com motivo", async () => {
    await turnOn();
    await saveSearchFn();
    const { id, job } = await startSearch();
    // repetido: já existe candidato com este link
    const site = (await sql("select id from public.ch_official_domains where address = 'gov.br/saude'"))[0];
    const dupLink = "https://www.gov.br/saude/repetido.pdf";
    await t.db.service("ch_worker_source_candidate_create", {
      p_candidate: {
        domain_id: site.id, requested_url: dupLink, final_url: dupLink, ai_title: "Anterior", ai_institution: "Ministério da Saúde", quote: quoteOf("antigo"),
        file_kind: "pdf", sha256: "a".repeat(64), size_bytes: 1000, suggested_level: "A", suggested_kind: "final",
      },
    });
    const web = fakeWeb({
      "https://www.gov.br/saude/pcdt-a.pdf": pdfRoute("alfa"),
      "https://bvsms.saude.gov.br/pagina-b": htmlRoute("beta"),
      "https://www.gov.br/saude/pcdt-c.pdf": pdfRoute("gama"), // o trecho da IA não está neste arquivo
      "https://www.gov.br/saude/escaneado.pdf": { headers: { "content-type": "application/pdf" }, body: makePdf([""]) },
    });
    const docs = [
      finding("https://www.gov.br/saude/pcdt-a.pdf", "alfa"),
      finding("https://bvsms.saude.gov.br/pagina-b", "beta"),
      finding("https://exemplo.com/x.pdf", "fora"),
      finding("https://www.gov.br/saude/pcdt-c.pdf", "gama", { trecho: quoteOf("outro assunto totalmente diferente") }),
      finding(dupLink, "repetido"),
      finding("https://www.gov.br/saude/escaneado.pdf", "escaneado"),
    ];
    const ai = fakeAi(() => ({ documentos: docs, observacao: null }), { seenUrls: ["https://www.gov.br/saude/pcdt-a.pdf"] });
    const worker = createContentHubWorker(depsOf(ai, web));
    expect(await worker.drain()).toBe(1);

    const s = await searchRow(id);
    expect(s).toMatchObject({ status: "concluida", verified_count: 2, discarded_count: 4, web_searches: 3, found_count: 6, provider: "anthropic", model: A.model });
    const cands = await candidates(id);
    expect(cands.map((c) => c.status)).toEqual(["aguardando", "aguardando"]);
    expect(cands.map((c) => c.file_kind).sort()).toEqual(["html", "pdf"]);
    const why = (s.discarded as any[]).map((d) => d.motivo).join(" | ");
    expect(why).toMatch(/fora da lista/);
    expect(why).toMatch(/trecho citado pela IA não está no arquivo/);
    expect(why).toMatch(/Repetido: candidato aguardando/);
    expect(why).toMatch(/Sem texto/);
    expect((s.discarded as any[]).every((d) => d.link && d.motivo)).toBe(true);
    expect((await jobOf(job.id)).status).toBe("succeeded");
    // a chamada à IA vai para o registro com a origem "fontes" e a busca como item
    const calls = await sql("select source, item_id, function_key, web_searches, outcome from public.ai_calls");
    expect(calls).toEqual([{ source: "fontes", item_id: id, function_key: "busca_fontes", web_searches: 3, outcome: "ok" }]);
    // o resultado fica no registro de auditoria em nome de quem pediu
    expect((await sql("select actor_id from public.ch_audit where action = 'source_search.result' and target = $1", [id]))[0].actor_id).toBe(t.ADMIN);
    // o pedido à IA leva a data de hoje, a lista de sites e o tema como dado, e a busca fica limitada aos sites da lista
    const sent = ai.calls[0];
    expect(sent.input).toContain("<documento>");
    expect(sent.input).toContain(todayBR(new Date()));
    expect(sent.input).toContain("gov.br/saude");
    expect(sent.webSearch.allowedDomains).toContain("who.int");
    expect(sent.webSearch.maxSearches).toBe(5);
    // nada do que foi baixado foi para a IA
    expect(sent.input).not.toContain("alfa");
  });

  it("o texto baixado de uma busca não entra no pedido de outra busca à IA", async () => {
    await turnOn();
    await saveSearchFn();
    const first = await startSearch();
    const web = fakeWeb({ "https://www.gov.br/saude/marcador.pdf": pdfRoute("MARCADOR-SECRETO-123") });
    const ai = fakeAi((n) => ({ documentos: n === 1 ? [finding("https://www.gov.br/saude/marcador.pdf", "MARCADOR-SECRETO-123")] : [], observacao: null }));
    const worker = createContentHubWorker(depsOf(ai, web));
    await worker.drain();
    expect((await candidates(first.id)).length).toBe(1);
    const second = await startSearch();
    await worker.drain();
    expect((await searchRow(second.id)).status).toBe("nada_encontrado");
    expect(ai.calls).toHaveLength(2);
    for (const c of ai.calls) expect(JSON.stringify(c)).not.toContain("MARCADOR-SECRETO-123");
  });

  it("nada encontrado é resultado válido", async () => {
    await turnOn();
    await saveSearchFn();
    const { id, job } = await startSearch();
    const ai = fakeAi(() => ({ documentos: [], observacao: "Não achei PCDT vigente nos sites da lista." }));
    await createContentHubWorker(depsOf(ai, fakeWeb({}))).drain();
    expect(await searchRow(id)).toMatchObject({ status: "nada_encontrado", message: "Não achei PCDT vigente nos sites da lista.", found_count: 0, verified_count: 0 });
    expect((await jobOf(job.id)).status).toBe("succeeded");
    expect(await candidates(id)).toHaveLength(0);
  });

  it("achados que a IA devolveu mas todos descartados: concluída com 0 conferidos", async () => {
    await turnOn();
    await saveSearchFn();
    const { id } = await startSearch();
    const ai = fakeAi(() => ({ documentos: [finding("https://exemplo.com/a.pdf", "x")], observacao: null }));
    await createContentHubWorker(depsOf(ai, fakeWeb({}))).drain();
    expect(await searchRow(id)).toMatchObject({ status: "concluida", verified_count: 0, discarded_count: 1, found_count: 1 });
  });

  it("função desligada: pendente com o motivo, sem gastar tentativa; ligada, destrava e conclui", async () => {
    await turnOn(); // IA ligada, mas a função busca_fontes sem configuração
    const { id, job } = await startSearch();
    const ai = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/pcdt-a.pdf", "alfa")], observacao: null }));
    const web = fakeWeb({ "https://www.gov.br/saude/pcdt-a.pdf": pdfRoute("alfa") });
    const worker = createContentHubWorker(depsOf(ai, web));
    await worker.drain();
    expect((await searchRow(id)).status).toBe("pendente");
    expect((await searchRow(id)).message).toMatch(/Desligada/);
    expect(await jobOf(job.id)).toMatchObject({ status: "blocked", attempts: 0 });
    expect(ai.calls).toHaveLength(0);
    expect(await sql("select 1 from public.ai_calls")).toHaveLength(0);

    await saveSearchFn();
    await t.db.service("ch_worker_unblock");
    await worker.drain();
    expect((await searchRow(id)).status).toBe("concluida");
    expect(ai.calls).toHaveLength(1);
  });

  it("teto atingido: pendente com o motivo, o provedor não é chamado", async () => {
    await turnOn();
    await t.db.service("ch_worker_ai_save_price", {
      p_actor: t.ADMIN, p_provider: "anthropic", p_model: A.model,
      p_price: { input_per_mtok: 2, output_per_mtok: 10, per_search_usd: 0.01, source_url: "https://exemplo.com", checked_on: "2026-10-07" },
    });
    await t.db.service("ch_worker_ai_save_settings", { p_actor: t.ADMIN, p_settings: { monthly_cap_usd: 10, per_run_cap_usd: 0.01, caps_enabled: true } });
    await saveSearchFn();
    const { id, job } = await startSearch();
    const ai = fakeAi(() => ({ documentos: [], observacao: null }));
    await createContentHubWorker(depsOf(ai, fakeWeb({}))).drain();
    const s = await searchRow(id);
    expect(s.status).toBe("pendente");
    expect(s.message).toMatch(/teto/);
    expect(await jobOf(job.id)).toMatchObject({ status: "blocked", attempts: 0 });
    expect(ai.calls).toHaveLength(0);
  });

  it("IA fora do ar sem reserva: a busca falha, a tarefa morre e não há nova rodada paga", async () => {
    await turnOn();
    await saveSearchFn();
    const { id, job } = await startSearch();
    const ai = fakeAi(() => {
      throw new Error("Serviço fora do ar.");
    });
    const worker = createContentHubWorker(depsOf(ai, fakeWeb({})));
    await worker.drain();
    expect(await jobOf(job.id)).toMatchObject({ status: "dead" });
    expect(await searchRow(id)).toMatchObject({ status: "falhou" });
    expect((await searchRow(id)).message).toMatch(/fora do ar/);
    expect(ai.calls).toHaveLength(2); // a principal e a nova tentativa do maestro, e mais nenhuma
    await sql("update public.ch_jobs set run_after = now() where id = $1", [job.id]);
    await worker.drain();
    expect(ai.calls).toHaveLength(2);
    // busca que falhou não bloqueia repetir o mesmo pedido
    const again = await t.db.asUser<any>(t.adminUser, "app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: (await searchRow(id)).theme } });
    expect(again.searches[0].duplicate).toBe(false);
  });

  it("interrompida depois da resposta da IA: retoma sem pagar de novo e sem duplicar candidatos", async () => {
    await turnOn();
    await saveSearchFn();
    const { id, job } = await startSearch();
    const web = fakeWeb({ "https://www.gov.br/saude/um.pdf": pdfRoute("um"), "https://www.gov.br/saude/dois.pdf": pdfRoute("dois") });
    const ai = fakeAi(() => ({ documentos: [finding("https://www.gov.br/saude/um.pdf", "um"), finding("https://www.gov.br/saude/dois.pdf", "dois")], observacao: null }));
    let puts = 0;
    const flaky: Storage = { ...storage, put: async (key, data, type) => {
      if (++puts === 2) throw new Error("Falha de armazenamento.");
      return storage.put(key, data, type);
    } };
    const worker = createContentHubWorker(depsOf(ai, web, { storage: flaky }));
    await worker.drain();
    expect((await jobOf(job.id)).status).toBe("queued");
    expect((await candidates(id)).length).toBe(1);
    expect((await searchRow(id)).status).toBe("conferindo");
    // a função é desligada enquanto isso: a retomada termina a conferência com a resposta guardada (F12)
    await t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: "busca_fontes", p_config: null });
    refresh();
    await sql("update public.ch_jobs set run_after = now() where id = $1", [job.id]);
    await worker.drain();
    expect(ai.calls).toHaveLength(1);
    expect((await candidates(id)).length).toBe(2);
    expect(await searchRow(id)).toMatchObject({ status: "concluida", verified_count: 2, discarded_count: 0 });
    expect((await sql("select count(*)::int as n from public.ai_calls where item_id = $1", [id]))[0].n).toBe(1);
  });

  it("mesmo arquivo por dois links na mesma busca: um candidato, o outro vira descarte Repetido", async () => {
    await turnOn();
    await saveSearchFn();
    const { id } = await startSearch();
    const same = pdfRoute("espelho");
    const web = fakeWeb({ "https://bvsms.saude.gov.br/a.pdf": same, "https://www.gov.br/saude/b.pdf": same });
    const ai = fakeAi(() => ({ documentos: [finding("https://bvsms.saude.gov.br/a.pdf", "espelho"), finding("https://www.gov.br/saude/b.pdf", "espelho")], observacao: null }));
    await createContentHubWorker(depsOf(ai, web)).drain();
    expect((await candidates(id)).length).toBe(1);
    const s = await searchRow(id);
    expect(s).toMatchObject({ status: "concluida", verified_count: 1, discarded_count: 1 });
    expect((s.discarded as any[])[0].motivo).toMatch(/Repetido/);
  });

  it("busca já terminada não roda de novo (trabalho repetido)", async () => {
    await turnOn();
    await saveSearchFn();
    const { id, job } = await startSearch();
    const ai = fakeAi(() => ({ documentos: [], observacao: null }));
    const worker = createContentHubWorker(depsOf(ai, fakeWeb({})));
    await worker.drain();
    expect(ai.calls).toHaveLength(1);
    await sql("update public.ch_jobs set status = 'queued', attempts = 0, run_after = now(), finished_at = null where id = $1", [job.id]);
    await worker.drain();
    expect(ai.calls).toHaveLength(1);
    expect((await searchRow(id)).status).toBe("nada_encontrado");
  });

  it("máximo de buscas da função vai no pedido", async () => {
    await turnOn();
    await saveSearchFn(3);
    await startSearch();
    const ai = fakeAi(() => ({ documentos: [], observacao: null }));
    await createContentHubWorker(depsOf(ai, fakeWeb({}))).drain();
    expect(ai.calls[0].webSearch.maxSearches).toBe(3);
  });
});

describe("todayBR", () => {
  it("usa o fuso de Brasília", () => {
    expect(todayBR(new Date("2026-10-11T01:30:00Z"))).toBe("2026-10-10");
    expect(todayBR(new Date("2026-10-11T12:00:00Z"))).toBe("2026-10-11");
  });
});
