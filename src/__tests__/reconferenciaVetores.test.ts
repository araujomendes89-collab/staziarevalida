// @vitest-environment node
/**
 * CC01, rodada de correção 5 (2026-10-10): a fonte nova ganha os vetores da busca por significado ANTES de a reconferência
 * automática entrar na fila.
 *
 * Antes: a etapa que lê a fonte nova (source_index) gravava os trechos sem vetor e já punha a reconferência das afirmações
 * "insuficientes" na fila. A reconferência rodava logo depois, na mesma rodada do processamento, e só achava a fonte nova por
 * palavras, porque os vetores só eram feitos no fim da rodada. O que só se acharia pelo significado continuava "insuficiente", e
 * nada mandava conferir de novo depois.
 *
 * Também aqui: com a busca por significado desligada, parada (erro de configuração do Google já avisado) ou sem responder, a
 * leitura da fonte não trava e a reconferência segue por palavras; cada trecho é vetorizado uma vez só (o fim da rodada não refaz
 * o que a etapa já fez); a etapa dá sinal de vida a cada lote e para quando outro processamento pega o trabalho.
 *
 * Sem rede: o Google é simulado (vetores feitos aqui), a IA é simulada (mock) e o banco é isolado. Os textos são fictícios, feitos
 * só para o teste (não são conteúdo médico).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { MockProvider, type StructuredRequest } from "../../server/contentHub/ai/provider";
import { mockRespond } from "../../server/contentHub/ai/mock";
import { runJob, stepVersions, type Job, type PipelineDeps } from "../../server/contentHub/pipeline";
import { createContentHubWorker } from "../../server/contentHub/worker";
import {
  createEmbedder, EMBEDDING_DIMS, embeddingsConfig, EmbeddingsError, resetEmbeddingsPermission, type EmbedClient, type Embedder,
} from "../../server/contentHub/embeddings";
import type { AuthUser } from "../../src/novo/data/backend";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reconferencia-vetores-"));
let dev: DevDatabase;
let db: ContentDb;
let storage: Storage;
let admin: AuthUser;

const sql = async <T = any>(q: string, params: unknown[] = []) => (await dev.db.query<T>(q, params)).rows;
/** Gerador de arquivos falso (nenhum arquivo): o processamento segue até o fim sem Chromium. */
const renderer = { templateVersion: "t1", brandVersion: "b1", render: async () => [] } as any;
let answer: (req: StructuredRequest) => unknown = mockRespond;
const deps = (): PipelineDeps => {
  const provider = new MockProvider((req) => answer(req));
  return { db, storage, ai: { provider, status: { ready: true, provider: "mock", model: provider.model, isMock: true, pending: null } }, renderer };
};
const depsE = (embedder: Embedder | null, extra: Partial<PipelineDeps> = {}): PipelineDeps => ({ ...deps(), embedder, ...extra });

// ---------------------------------------------------------------- "modelo" simulado: sinônimos caem na mesma dimensão
// A afirmação e o trecho da fonte não têm nenhuma palavra de 4 letras ou mais em comum (a busca por palavras não acha); o número
// com % é igual nos dois (a conferência numérica aceita).
const C1 = "Rubroteste deve ser aquecido quando Verdeteste superar 37%.";
const P1 = "Carmimvalor precisa esquentar se Esmeraldavalor exceder 37%.";
// os outros casos: o trecho da fonte repete a frase da afirmação (a busca por palavras acha); cada frase com palavras só dela
const C2 = "Ambarteste deve ser girado quando Cobreteste tocar 41%.";
const C3 = "Anilteste deve ser dobrado quando Bronzeteste marcar 43%.";
const C4 = "Cianoteste deve ser lavado quando Douradoteste somar 47%.";
const C5 = "Ebanoteste deve ser medido quando Ferroteste passar 53%.";
const C6 = "Grafiteteste deve ser cortado quando Indigoteste atingir 59%.";
const C7 = "Jaspeteste deve ser lixado quando Limaoteste baixar 61%.";

const CONCEPTS: Record<string, number> = {};
for (const [dim, words] of [
  [0, ["rubroteste", "carmimvalor"]],
  [1, ["verdeteste", "esmeraldavalor"]],
  [2, ["aquecido", "esquentar"]],
  [3, ["superar", "exceder"]],
] as [number, string[]][]) for (const w of words) CONCEPTS[w] = dim;
function conceptVector(text: string): number[] {
  const v = new Array(EMBEDDING_DIMS).fill(0);
  for (const w of text.toLowerCase().split(/[^a-zà-ú0-9]+/i).filter(Boolean)) {
    if (w in CONCEPTS) v[CONCEPTS[w]] += 1;
    else {
      let h = 0;
      for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[10 + (h % (EMBEDDING_DIMS - 10))] += 0.15;
    }
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
/** Quantos textos foram mandados ao "Google" (cada um é pago uma vez) e quais. */
const calls = { documents: 0, queries: 0, texts: [] as string[] };
const fakeEmbedder = (delayMs = 0): Embedder => ({
  model: "gemini-embedding-2",
  async embedDocuments(items) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    calls.documents += items.length;
    calls.texts.push(...items.map((it) => it.text));
    return { vectors: items.map((it) => conceptVector(it.text)), tokens: 10 * items.length, costUsd: 0.0001, latencyMs: 1 };
  },
  async embedQuery(text) {
    calls.queries++;
    return conceptVector(text);
  },
});

/** IA da conferência que reconhece a paráfrase (a simulação padrão só compara palavras). */
const paraphrase = (req: StructuredRequest) => {
  if (req.promptId !== "evidence") return mockRespond(req);
  const p = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
  const hit = p.trechos.find((t: any) => String(t.text).includes(P1));
  return hit ? { verdict: "compatible", passage_id: hit.passage_id, quote: P1, rationale: "Simulação: paráfrase (teste)." } : mockRespond(req);
};

async function registerDoc(name: string) {
  const bytes = Buffer.from(`%PDF-1.7 ${name}`);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const key = `documents/${sha}.pdf`;
  await storage.put(key, bytes, "application/pdf");
  return (await db.asUser<{ id: string }>(admin, "app_ch_register_document", { p_doc: { name, sha256: sha, storage_path: key, rights_status: "own" } })).id;
}

/** Material de estudo com uma frase: extração pronta, processamento do começo (classificação) ao fim, com as `d` dadas. */
async function studyDocument(name: string, sentence: string, d: PipelineDeps) {
  const id = await registerDoc(name);
  await db.service("ch_worker_save_extraction", {
    p_document_id: id,
    p_text_kind: "text",
    p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }],
    p_blocks: [
      { page_no: 1, idx: 0, type: "heading", text: `Capítulo fictício ${name}`, bbox: [0, 0, 1, 1] },
      { page_no: 1, idx: 1, type: "paragraph", text: `Texto fictício de teste. ${sentence}`, bbox: [0, 0, 1, 1] },
    ],
  });
  await db.service("ch_worker_next", { p_document_id: id, p_step: "classify", p_versions: stepVersions("classify", d) });
  await createContentHubWorker(d).drain();
  return id;
}

/** PDF de referência (uma página por frase): fonte cadastrada, PDF vinculado e leitura da fonte (source_index) só na fila. */
async function indexSource(name: string, pages: string[], kind = "final") {
  const id = await registerDoc(name);
  await sql(`update public.ch_documents set purpose = 'reference_source' where id = $1`, [id]);
  await db.service("ch_worker_save_extraction", {
    p_document_id: id,
    p_text_kind: "text",
    p_pages: pages.map((_, i) => ({ page_no: i + 1, kind: "text" })),
    p_blocks: [
      { page_no: 1, idx: 0, type: "heading", text: "Recomendações fictícias", bbox: [0, 0, 1, 1] },
      ...pages.map((sentence, i) => ({ page_no: i + 1, idx: 1, type: "paragraph", text: `Texto fictício de teste. ${sentence}`, bbox: [0, 0, 1, 1] })),
    ],
  });
  const src = await db.asUser<{ id: string }>(admin, "app_ch_register_source", { p_source: { title: name, organ: "Órgão fictício", kind, version: "1", published_on: "2026-01-01" } });
  await db.asUser(admin, "app_ch_attach_source_document", { p_source_id: src.id, p_document_id: id });
  await db.service("ch_worker_next", { p_document_id: id, p_step: "source_index", p_versions: {} });
  return { documentId: id, sourceId: src.id };
}
/** Páginas fictícias de preenchimento, cada uma com um texto diferente (cada página vira um trecho). */
const fillerPages = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `Pagina ficticia ${tag} numero ${i + 1} com conteudo neutro de preenchimento.`);

/**
 * Uma execução da tarefa do Cloud Run, como scripts/content-hub/worker-job.ts: primeiro esvazia a fila e só depois faz os vetores
 * que faltam (a falha dos vetores do fim não derruba a execução).
 */
async function cloudRunRound(d: PipelineDeps, opts: { embed?: boolean } = {}) {
  const w = createContentHubWorker(d);
  let jobs = 0;
  while (await w.tick()) jobs++;
  const vectors =
    opts.embed === false ? null : await w.embed().catch((e: Error) => ({ embedded: 0, tokens: 0, costUsd: 0, error: e.message }));
  return { jobs, vectors };
}

const claimOf = async (doc: string) => {
  const [c] = await sql(`select id, statement, status from public.ch_claims where document_id = $1`, [doc]);
  return c;
};
const evidenceOf = async (claim: string) => sql(`select source_id, verdict, stale from public.ch_evidence where claim_id = $1 order by created_at`, [claim]);
/** O trabalho mais novo da etapa. */
const stepJob = async (doc: string, step: string) =>
  (await sql(`select id, status, finished_at, metrics from public.ch_jobs where document_id = $1 and step = $2 order by created_at desc limit 1`, [doc, step]))[0];
const evidenceJob = async (doc: string) => stepJob(doc, "evidence");
const docStatus = async (doc: string) => (await sql(`select status from public.ch_documents where id = $1`, [doc]))[0].status as string;
/** Registros de vetores (custo) da etapa. */
const embeddingRuns = async (jobId: string) =>
  (await sql(`select count(*)::int as n from public.ch_ai_runs where step = 'embeddings' and job_id = $1`, [jobId]))[0].n as number;
/** Trechos da fonte com vetor do modelo. */
const vectorsOf = async (sourceId: string) =>
  (
    await sql(
      `select count(*)::int as n from public.ch_passage_embeddings e join public.ch_source_passages p on p.id = e.passage_id where p.source_id = $1 and e.model = 'gemini-embedding-2'`,
      [sourceId]
    )
  )[0].n as number;
/** Outro processamento pega ESTE trabalho (como ch_worker_claim faz, mas sem escolher outro da fila). */
const claimJob = async (id: string) =>
  (
    await sql(
      `update public.ch_jobs as j set status = 'running', attempts = j.attempts + 1, locked_at = now(), started_at = coalesce(j.started_at, now())
        where j.id = $1 and j.status = 'queued' returning to_jsonb(j) as job`,
      [id]
    )
  )[0].job as Job;
/** Os outros trabalhos da fila esperam (a "execução nova" do teste só pode pegar este). Devolve quem os solta. */
const parkQueue = async (except: string) => {
  const parked = (await sql(`update public.ch_jobs set run_after = now() + interval '1 day' where status = 'queued' and id <> $1 returning id`, [except])).map((r: any) => r.id);
  return async () => {
    await sql(`update public.ch_jobs set run_after = now() where id = any($1::uuid[])`, [parked]);
  };
};
/** Banco visto pelo processamento: registra as chamadas e, antes de cada uma, roda `before` (pode lançar erro). */
const spyDb = (seen: { fn: string; args: Record<string, unknown> }[], before?: (fn: string, args: Record<string, unknown>) => Promise<void>): ContentDb => ({
  ...db,
  service: async <T,>(fn: string, args: Record<string, unknown> = {}) => {
    seen.push({ fn, args });
    if (before) await before(fn, args);
    return db.service<T>(fn, args);
  },
});
/** Prefixo do aviso da etapa quando os vetores da fonte nova falham. */
const FAILED = /^Busca por significado indisponível ao ler a fonte \(a reconferência desta fonte foi só por palavras\): /;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  storage = localStorageDir(path.join(tmp, "files"));
  admin = await dev.core.createAccount("Admin Teste", "admin@reconferencia-vetores.local", "senha-forte-123", true);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => resetEmbeddingsPermission());

describe("CC01, rodada de correção 5: a fonte nova ganha os vetores antes da reconferência automática", () => {
  // precisa ser o primeiro caso: confere "nenhuma evidência" antes da fonte e conta todos os vetores feitos
  it("fonte nova e reconferência na mesma rodada: a busca por significado já enxerga a fonte nova", async () => {
    calls.documents = 0;
    const doc = await studyDocument("Apostila conferida pelo significado", C1, depsE(fakeEmbedder()));
    const claim = await claimOf(doc);
    expect(claim.status).toBe("insufficient");
    expect(await evidenceOf(claim.id)).toEqual([]);

    const { documentId, sourceId } = await indexSource("Manual fictício com outras palavras", [P1]);
    answer = paraphrase;
    let round!: Awaited<ReturnType<typeof cloudRunRound>>;
    try {
      round = await cloudRunRound(depsE(fakeEmbedder()));
    } finally {
      answer = mockRespond;
    }

    // 1) a reconferência da mesma rodada achou o trecho pelo significado
    expect((await claimOf(doc)).status).toBe("compatible");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: sourceId, verdict: "compatible", stale: false }]);
    expect((await evidenceJob(doc)).metrics).toMatchObject({ auto_recheck: true, rechecked: 1, became_compatible: 1 });
    // 2) os vetores saíram na própria leitura da fonte, antes da reconferência
    const index = await stepJob(documentId, "source_index");
    expect(index.status).toBe("succeeded");
    expect(index.metrics).toMatchObject({ passages: 1, vectors: 1, recheck_documents: 1 });
    expect(index.metrics).not.toHaveProperty("vectors_error");
    expect(index.metrics).not.toHaveProperty("vectors_pending");
    // o custo dos vetores fica no registro da etapa (ch_ai_runs), não no custo das chamadas de IA da etapa
    expect(index.metrics.vectors_cost_usd).toBeCloseTo(0.0001, 6);
    expect(index.metrics.cost_usd ?? null).toBeNull();
    // 3) sem trabalho repetido: cada trecho foi vetorizado uma vez só, e o fim da rodada não refez nada
    expect(calls.documents).toBe(1);
    expect(round.vectors).toMatchObject({ embedded: 0 });
    expect(await embeddingRuns(index.id)).toBe(1);
    expect(await vectorsOf(sourceId)).toBe(1);
  }, 300_000);

  it("busca por significado desligada: nada muda, a reconferência entra na hora e acha por palavras", async () => {
    calls.documents = 0;
    const doc = await studyDocument("Apostila sem busca por significado", C2, depsE(null));
    expect((await claimOf(doc)).status).toBe("insufficient");
    const { documentId, sourceId } = await indexSource("Manual fictício sem vetores", [C2]);
    const round = await cloudRunRound(depsE(null));
    const index = await stepJob(documentId, "source_index");
    expect(index.status).toBe("succeeded");
    expect(index.metrics.recheck_documents).toBeGreaterThanOrEqual(1);
    for (const key of ["vectors", "vectors_error", "vectors_pending", "vectors_cost_usd"]) expect(index.metrics).not.toHaveProperty(key);
    expect((await claimOf(doc)).status).toBe("compatible");
    expect(calls.documents).toBe(0);
    expect(round.vectors).toMatchObject({ embedded: 0 });
    expect(await vectorsOf(sourceId)).toBe(0);
  }, 300_000);

  it("Google recusa os vetores (chave sem permissão): a leitura da fonte não para e a reconferência segue por palavras", async () => {
    const KEY = "AIza" + "r".repeat(35);
    let google = 0;
    const denied: EmbedClient = {
      models: {
        embedContent: async () => {
          google++;
          throw Object.assign(new Error(`PERMISSION_DENIED chave ${KEY}`), { status: 403 });
        },
      },
    };
    const embedder = createEmbedder(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: KEY }), denied)!;
    const doc = await studyDocument("Apostila com o Google recusando", C3, depsE(null));
    expect((await claimOf(doc)).status).toBe("insufficient");
    const { documentId, sourceId } = await indexSource("Manual fictício com o Google recusando", [C3]);
    const logs: string[] = [];
    const round = await cloudRunRound(depsE(embedder, { log: (m) => logs.push(m) }));
    const index = await stepJob(documentId, "source_index");
    // a etapa termina e a fonte fica pronta para revisão (não "Falhou"): não roda de novo nem paga os trechos outra vez
    expect(index.status).toBe("succeeded");
    expect(await docStatus(documentId)).toBe("awaiting_review");
    expect(index.metrics.vectors_error).toMatch(FAILED);
    expect(index.metrics.vectors_error).toMatch(/403/);
    expect(index.metrics.vectors_error).not.toContain(KEY);
    expect(index.metrics).not.toHaveProperty("vectors");
    expect(logs.filter((m) => m.startsWith("[central] vetores da fonte nova:"))).toHaveLength(1);
    // a reconferência entrou na fila e achou por palavras
    expect(index.metrics.recheck_documents).toBeGreaterThanOrEqual(1);
    expect((await claimOf(doc)).status).toBe("compatible");
    // nada foi gravado nem pago; o Google foi chamado (e recusou) ao menos na leitura da fonte
    expect(google).toBeGreaterThanOrEqual(1);
    expect(await embeddingRuns(index.id)).toBe(0);
    expect(await vectorsOf(sourceId)).toBe(0);
    // os vetores do fim da rodada também falham, e a execução segura o erro
    expect(round.vectors).toHaveProperty("error");
  }, 300_000);

  it("busca por significado parada (erro de configuração já avisado): nada vai ao Google, o motivo simples fica na etapa", async () => {
    // como o vetorizador da Central de IAs (LEVA 1) depois de um erro de configuração: `problem` com o motivo em português simples
    // e cada pedido recusado na hora, sem ir ao Google (erro "quiet")
    const REASON = "o modelo gemini-embedding-2 não foi encontrado nesse acesso ao Google (código 404). Confira o modelo e o tipo de acesso.";
    let attempts = 0;
    const quiet = () => Object.assign(new EmbeddingsError("Busca por significado: o Google recusou (404): NOT_FOUND", 404), { quiet: true });
    const paused = {
      model: "gemini-embedding-2",
      problem: REASON,
      async embedDocuments() {
        attempts++;
        throw quiet();
      },
      async embedQuery() {
        attempts++;
        throw quiet();
      },
    } as Embedder;
    const doc = await studyDocument("Apostila com a busca parada", C4, depsE(null));
    const { documentId } = await indexSource("Manual fictício com a busca parada", [C4]);
    const logs: string[] = [];
    await cloudRunRound(depsE(paused, { log: (m) => logs.push(m) }), { embed: false });
    const index = await stepJob(documentId, "source_index");
    expect(index.status).toBe("succeeded");
    expect(index.metrics.vectors_error).toMatch(FAILED);
    expect(index.metrics.vectors_error.replace(FAILED, "")).toBe(REASON);
    // o aviso já saiu uma vez: não se repete no registro
    expect(logs.some((m) => m.startsWith("[central] vetores da fonte nova:"))).toBe(false);
    expect(index.metrics.recheck_documents).toBeGreaterThanOrEqual(1);
    expect((await claimOf(doc)).status).toBe("compatible");
    expect(await embeddingRuns(index.id)).toBe(0);
    expect(attempts).toBeGreaterThanOrEqual(1);
  }, 300_000);

  it("Google sem responder: a etapa não trava, para no tempo dela e a reconferência segue por palavras", async () => {
    const before = process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS;
    process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS = "1";
    try {
      const stuck: Embedder = {
        model: "gemini-embedding-2",
        embedDocuments: () => new Promise(() => undefined), // nunca responde
        embedQuery: async () => {
          throw new EmbeddingsError("Busca por significado: o Google recusou (503): UNAVAILABLE", 503);
        },
      };
      const doc = await studyDocument("Apostila com o Google parado", C6, depsE(null));
      const { documentId } = await indexSource("Manual fictício com o Google parado", [C6]);
      const t0 = Date.now();
      await cloudRunRound(depsE(stuck), { embed: false });
      const index = await stepJob(documentId, "source_index");
      expect(index.status).toBe("succeeded");
      expect(index.metrics.ms).toBeLessThan(60_000);
      expect(index.metrics.vectors_error).toMatch(FAILED);
      expect(index.metrics.vectors_error).toMatch(/não respondeu/);
      expect(index.metrics.recheck_documents).toBeGreaterThanOrEqual(1);
      expect((await claimOf(doc)).status).toBe("compatible");
      expect(Date.now() - t0).toBeLessThan(240_000);
    } finally {
      if (before === undefined) delete process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS;
      else process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS = before;
    }
  }, 300_000);

  it("fonte grande e tempo da etapa esgotado: para entre lotes, anota o que ficou e o fim da rodada faz só o resto", async () => {
    const before = process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS;
    process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS = "3";
    try {
      calls.texts = [];
      const doc = await studyDocument("Apostila da fonte grande", C7, depsE(null));
      const { documentId, sourceId } = await indexSource("Manual fictício grande", [C7, ...fillerPages(59, "grande")]);
      // cada lote leva 3,5 s: o primeiro (50 trechos) termina e grava; o prazo da etapa (3 s) já passou e ela para ali
      const round = await cloudRunRound(depsE(fakeEmbedder(3_500)));
      const index = await stepJob(documentId, "source_index");
      expect(index.status).toBe("succeeded");
      expect(index.metrics).toMatchObject({ passages: 60, vectors: 50 });
      expect(index.metrics.recheck_documents).toBeGreaterThanOrEqual(1);
      expect(index.metrics.vectors_pending).toMatch(/Parte dos trechos ficou sem vetor/);
      expect(index.metrics).not.toHaveProperty("vectors_error");
      expect((await claimOf(doc)).status).toBe("compatible");
      // cada trecho foi pago uma vez só: 50 na etapa e os 10 que faltavam no fim da rodada (o fim da rodada também faz os
      // trechos que os casos anteriores deixaram sem vetor, de outras fontes)
      const mine = calls.texts.filter((t) => t.includes("Jaspeteste") || t.includes("ficticia grande"));
      expect(mine).toHaveLength(60);
      expect(new Set(mine).size).toBe(60);
      expect((round.vectors as { embedded: number }).embedded).toBeGreaterThanOrEqual(10);
      expect(await vectorsOf(sourceId)).toBe(60);
    } finally {
      if (before === undefined) delete process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS;
      else process.env.CONTENT_HUB_SOURCE_EMBED_SECONDS = before;
    }
  }, 300_000);

  it("banco sem a atualização nova da 9540: a leitura da fonte continua e a etapa diz o que falta", async () => {
    const doc = await studyDocument("Apostila com o banco antigo", C5, depsE(null));
    const { documentId } = await indexSource("Manual fictício banco antigo", [C5]);
    const seen: { fn: string; args: Record<string, unknown> }[] = [];
    const oldDb = spyDb(seen, async (fn) => {
      if (fn === "ch_worker_source_passages_to_embed") {
        throw new Error("function public.ch_worker_source_passages_to_embed(p_source_id => uuid, p_model => text, p_limit => integer) does not exist");
      }
    });
    await cloudRunRound(depsE(fakeEmbedder(), { db: oldDb }));
    const index = await stepJob(documentId, "source_index");
    expect(index.status).toBe("succeeded");
    expect(index.metrics.vectors_error).toMatch(/migração 9540/);
    expect(index.metrics.recheck_documents).toBeGreaterThanOrEqual(1);
    expect((await claimOf(doc)).status).toBe("compatible");
  }, 300_000);

  describe("sinal de vida a cada lote e trabalho perdido (rodada de correção 4)", () => {
    it("fonte com 120 trechos: um sinal de vida por lote de 50", async () => {
      calls.documents = 0;
      const { documentId, sourceId } = await indexSource("Manual fictício com sinal de vida", fillerPages(120, "sinal"));
      const id = (await stepJob(documentId, "source_index")).id as string;
      const seen: { fn: string; args: Record<string, unknown> }[] = [];
      const release = await parkQueue(id);
      let result!: Awaited<ReturnType<typeof runJob>>;
      try {
        result = await runJob(depsE(fakeEmbedder(), { db: spyDb(seen) }), await claimJob(id));
      } finally {
        await release();
      }
      expect(result.status).toBe("succeeded");
      const beats = seen.filter((c) => c.fn === "ch_worker_checkpoint" && c.args.p_job_id === id);
      expect(beats.length).toBeGreaterThanOrEqual(3);
      // o sinal vai com o dono do trabalho
      expect(beats.every((c) => typeof c.args.p_lease === "string")).toBe(true);
      expect(calls.documents).toBe(120);
      expect(await vectorsOf(sourceId)).toBe(120);
      expect((await stepJob(documentId, "source_index")).metrics).toMatchObject({ passages: 120, vectors: 120 });
      await cloudRunRound(depsE(null), { embed: false });
    }, 300_000);

    it("outro processamento pega a leitura da fonte no meio dos vetores: este para sem pôr a reconferência na fila nem registrar o fim", async () => {
      calls.documents = 0;
      const { documentId } = await indexSource("Manual fictício retomado por outro processamento", fillerPages(120, "perdido"));
      const id = (await stepJob(documentId, "source_index")).id as string;
      const seen: { fn: string; args: Record<string, unknown> }[] = [];
      const other: { job: Job | null } = { job: null };
      let saves = 0;
      const release = await parkQueue(id);
      let first!: Awaited<ReturnType<typeof runJob>>;
      try {
        // no 2º lote, este processamento fica 2 horas sem sinal (a chamada travou) e uma execução nova da tarefa pega o trabalho
        const stuck = spyDb(seen, async (fn) => {
          if (fn !== "ch_worker_save_embeddings" || ++saves !== 2) return;
          await sql(`update public.ch_jobs set locked_at = locked_at - interval '2 hours' where id = $1`, [id]);
          other.job = await db.service<Job | null>("ch_worker_claim", { p_stale_seconds: 1800 });
        });
        first = await runJob(depsE(fakeEmbedder(), { db: stuck }), await claimJob(id));
      } finally {
        await release();
      }
      expect(other.job?.id).toBe(id);
      expect(first.status).toBe("lost");
      // parou de vetorizar e não pôs a reconferência na fila nem registrou o fim do trabalho que agora é do outro
      expect(calls.documents).toBeLessThanOrEqual(100);
      expect(seen.some((c) => c.fn === "ch_worker_recheck_insufficient")).toBe(false);
      expect(seen.some((c) => c.fn === "ch_worker_finish")).toBe(false);
      expect((await stepJob(documentId, "source_index")).status).toBe("running");
      // quem pegou o trabalho termina
      expect(await runJob(depsE(fakeEmbedder()), other.job!)).toMatchObject({ status: "succeeded" });
      expect((await stepJob(documentId, "source_index")).status).toBe("succeeded");
      await cloudRunRound(depsE(null), { embed: false });
    }, 300_000);
  });

  it("a função nova é só do servidor (nem a equipe chama direto) e a 9540 pode ser colada de novo", async () => {
    const id = crypto.randomUUID();
    for (const role of ["authenticated", "anon"]) {
      const attempt = dev.db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query(`select public.ch_worker_source_passages_to_embed('${id}'::uuid, 'm', 5)`);
      });
      await expect(attempt, role).rejects.toThrow(/permission denied/);
    }
    const [grants] = await sql(
      `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authenticated`,
      ["public.ch_worker_source_passages_to_embed(uuid, text, integer)"]
    );
    expect(grants).toEqual({ anon: false, authenticated: false });
    const [def] = await sql(
      `select p.prosecdef as definer, p.proconfig as config from pg_proc p where p.proname = 'ch_worker_source_passages_to_embed' and p.pronamespace = 'public'::regnamespace`
    );
    expect(def.definer).toBe(true);
    expect(def.config).toEqual(['search_path=""']);
    const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003009540_reconferir_insuficientes.sql"), "utf8");
    await dev.db.exec(MIGRATION);
    await dev.db.exec(MIGRATION);
    expect(await db.service("ch_worker_source_passages_to_embed", { p_source_id: id, p_model: "gemini-embedding-2", p_limit: 5 })).toEqual([]);
  }, 300_000);
});
