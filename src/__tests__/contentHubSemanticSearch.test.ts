// @vitest-environment node
/**
 * Busca por significado da Central (migração 5000 e server/contentHub/embeddings.ts), com o Google SIMULADO (nenhuma chamada
 * externa). Pendência da Administração resolvida em 2026-10-06 com o modelo escolhido pelo dono, Gemini Embedding 2:
 * - configuração e consentimento; texto no formato do modelo (documento e pergunta), um vetor por texto, lotes, vetores
 *   normalizados, nova tentativa no limite por minuto e nada de chave no erro;
 * - vetores dos trechos gravados em lotes, com o custo registrado; troca de modelo refaz os vetores;
 * - a busca junta palavras e significado, mantém os filtros e as regras das fontes e, sem vetor, é a mesma de antes;
 * - com pgvector (Supabase) o índice existe e o resultado é o mesmo; a chave "IA ligada" do painel desliga tudo;
 * - rota de busca da equipe e situação no painel; permissões.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { createContentHubRouter } from "../../server/contentHub/router";
import { createContentHubWorker } from "../../server/contentHub/worker";
import {
  createEmbedder, EMBEDDING_DIMS, embeddingPrice, embeddingsConfig, EmbeddingsError, embedPendingPassages, queryEmbedding,
  resetEmbeddingsPermission, type EmbedClient, type Embedder,
} from "../../server/contentHub/embeddings";

const ROOT = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hub-significado-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e2";
const STUDENT = "00000000-0000-4000-8000-0000000000b2";
const GKEY = "AIza" + "e".repeat(35);

// ---------------------------------------------------------------- "modelo" simulado: sinônimos caem na mesma dimensão
const CONCEPTS: Record<string, number> = {};
for (const [dim, words] of [
  [0, ["infarto", "miocárdio", "cardíaco", "coração", "coronária", "coronariana"]],
  [1, ["febre", "febril", "hipertermia", "temperatura"]],
  [2, ["lactente", "lactentes", "criança", "crianças", "bebê", "pediátrico"]],
  [3, ["dose", "mg", "posologia"]],
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
const calls = { documents: 0, queries: 0 };
const fakeEmbedder = (model = "gemini-embedding-2"): Embedder => ({
  model,
  async embedDocuments(items) {
    calls.documents += items.length;
    return { vectors: items.map((it) => conceptVector(it.text)), tokens: items.reduce((s, it) => s + Math.ceil(it.text.length / 4), 0), costUsd: 0.0002, latencyMs: 5 };
  },
  async embedQuery(text) {
    calls.queries++;
    return conceptVector(text);
  },
});

// ---------------------------------------------------------------- banco de desenvolvimento (migrações e carga reais)
let dev: DevDatabase;
let db: ContentDb;
let editorToken: string;
let studentToken: string;
const ids: Record<string, string> = {};
const rpc = async (uid: string, fn: string, args: Record<string, unknown>) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    const keys = Object.keys(args);
    return tx.query<any>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k]));
  })).rows[0].r;
const search = (query: string, embedding: unknown = null, filters: Record<string, unknown> = {}) =>
  rpc(EDITOR, "app_ch_search_passages", { p_query: query, p_filters: filters, p_limit: 10, p_embedding: embedding });
const meaningOf = (q: string, extra: Record<string, unknown> = {}) => ({ model: "gemini-embedding-2", values: conceptVector(q), ...extra });

async function addSource(title: string, extra: Record<string, unknown>, passages: { text: string; population?: string }[]) {
  const cols = ["title", "organ", ...Object.keys(extra)];
  const vals = [title, "Ministério da Saúde", ...Object.values(extra)];
  const id = (await dev.db.query<{ id: string }>(`insert into public.ch_sources (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, vals)).rows[0].id;
  await db.service("ch_worker_replace_passages", { p_source_id: id, p_passages: passages });
  return id;
}
const passageId = async (start: string) => (await dev.db.query<{ id: string }>(`select id from public.ch_source_passages where text like $1`, [`${start}%`])).rows[0].id;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed2@t.dev'), ($2, 'al2@t.dev')`, [EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  editorToken = await dev.createSession(EDITOR);
  studentToken = await dev.createSession(STUDENT);
  ids.oficial = await addSource("Protocolo de dor torácica", { kind: "final", authority_level: "A" }, [
    { text: "Infarto agudo do miocárdio: dar AAS 300 mg mastigado logo na chegada.", population: "adultos" },
    { text: "Febre em lactentes menores de 3 meses: avaliar internação.", population: "lactentes" },
  ]);
  ids.sociedade = await addSource("Diretriz de sociedade ainda não aprovada", { kind: "society_guideline" }, [
    { text: "Coronária e coração: recomendação da sociedade sem aprovação editorial." },
  ]);
  ids.preliminar = await addSource("Relatório preliminar", { kind: "preliminary" }, [{ text: "Infarto: texto preliminar que não vale como evidência." }]);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => resetEmbeddingsPermission());

describe("Configuração e chamada ao Google (simulado)", () => {
  it("só liga com o envio autorizado e a chave; modelo padrão Gemini Embedding 2; off desliga", () => {
    expect(embeddingsConfig({}).pending).toMatch(/CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1/);
    expect(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1" }).pending).toMatch(/GEMINI_API_KEY/);
    expect(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: "MY_GEMINI_API_KEY" }).ready).toBe(false); // texto de exemplo
    expect(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GOOGLE_GEMINI_API_KEY: GKEY })).toMatchObject({ ready: true, model: "gemini-embedding-2" });
    expect(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GKEY, CONTENT_HUB_EMBEDDINGS_MODEL: "off" }).ready).toBe(false);
    expect(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GKEY, CONTENT_LAB_ENABLED: "false" }).ready).toBe(false);
    expect(createEmbedder(embeddingsConfig({}))).toBeNull();
    expect(embeddingPrice("gemini-embedding-2", {})).toBe(0.2);
    expect(embeddingPrice("gemini-embedding-2", { AI_COST_CONFIG: '{"gemini-embedding-2":{"input":0.1}}' })).toBe(0.1);
  });

  it("documento e pergunta no formato do modelo, um vetor por texto, em lotes de 50, normalizados; custo estimado", async () => {
    const sent: any[] = [];
    const client: EmbedClient = {
      models: {
        embedContent: async (p: any) => {
          sent.push(p);
          return { embeddings: p.contents.map(() => ({ values: new Array(EMBEDDING_DIMS).fill(2) })) };
        },
      },
    };
    const e = createEmbedder(embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GKEY }), client)!;
    const items = Array.from({ length: 120 }, (_, i) => ({ title: i ? `Fonte ${i}` : null, text: `Trecho   ${i}\n com espaço` }));
    const r = await e.embedDocuments(items);
    expect(sent.map((p) => p.contents.length)).toEqual([50, 50, 20]);
    expect(sent[0]).toMatchObject({ model: "gemini-embedding-2", config: { outputDimensionality: 768 } });
    expect(sent[0].contents[0]).toEqual({ parts: [{ text: "title: none | text: Trecho 0 com espaço" }] });
    expect(sent[0].contents[1]).toEqual({ parts: [{ text: "title: Fonte 1 | text: Trecho 1 com espaço" }] });
    expect(r.vectors).toHaveLength(120);
    expect(Math.hypot(...r.vectors[0])).toBeCloseTo(1, 6);
    expect(r.tokens).toBeGreaterThan(0);
    expect(r.costUsd).toBeCloseTo((r.tokens * 0.2) / 1e6, 6);
    sent.length = 0;
    expect(await e.embedQuery("dor no peito")).toHaveLength(768);
    expect(sent[0].contents).toEqual([{ parts: [{ text: "task: search result | query: dor no peito" }] }]);
    // piso de semelhança opcional vai junto com o vetor da busca
    expect(await queryEmbedding(e, "dor", undefined, { CONTENT_HUB_EMBEDDINGS_MIN_SIMILARITY: "0.4" })).toMatchObject({ model: "gemini-embedding-2", min_similarity: 0.4 });
    expect(await queryEmbedding(null, "dor")).toBeNull();
  });

  it("limite por minuto: tenta de novo; recusa: erro sem a chave; resposta torta: erro claro; falha na busca: segue por palavras", async () => {
    let n = 0;
    const flaky: EmbedClient = {
      models: {
        embedContent: async (p: any) => {
          if (n++ === 0) throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
          return { embeddings: p.contents.map(() => ({ values: new Array(EMBEDDING_DIMS).fill(1) })) };
        },
      },
    };
    const cfg = embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GKEY });
    expect(await createEmbedder(cfg, flaky)!.embedQuery("x")).toHaveLength(768);
    expect(n).toBe(2);
    const denied: EmbedClient = { models: { embedContent: async () => { throw Object.assign(new Error(`PERMISSION_DENIED chave ${GKEY}`), { status: 403 }); } } };
    const err = await createEmbedder(cfg, denied)!.embedQuery("x").catch((e) => e);
    expect(err).toBeInstanceOf(EmbeddingsError);
    expect(err.status).toBe(403);
    expect(err.message).not.toContain(GKEY);
    const short: EmbedClient = { models: { embedContent: async () => ({ embeddings: [{ values: [1, 2, 3] }] }) } };
    await expect(createEmbedder(cfg, short)!.embedQuery("x")).rejects.toThrow(/tamanho diferente de 768/);
    const logs: string[] = [];
    expect(await queryEmbedding(createEmbedder(cfg, denied), "x", (m) => logs.push(m))).toBeNull();
    expect(logs[0]).toMatch(/seguiu por palavras/);
  });
});

describe("Vetores dos trechos (processamento)", () => {
  it("gera os que faltam em lotes, registra o custo e não refaz; trecho apagado some junto", async () => {
    calls.documents = 0;
    const r = await embedPendingPassages(db, fakeEmbedder());
    expect(r.embedded).toBe(4); // inclusive da sociedade e do preliminar: a busca é que filtra
    expect(calls.documents).toBe(4);
    const runs = await dev.db.query<any>(`select step, provider, model, status, input_tokens, cost_usd::float c, output from public.ch_ai_runs where step = 'embeddings'`);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]).toMatchObject({ provider: "gemini", model: "gemini-embedding-2", status: "ok", c: 0.0002, output: { passages: 4, saved: 4 } });
    expect(await embedPendingPassages(db, fakeEmbedder())).toMatchObject({ embedded: 0 });
    const stats = await db.service<any>("ch_worker_embedding_stats", { p_model: "gemini-embedding-2" });
    expect(stats).toEqual({ passages: 4, embedded: 4, vector_index: false });
    // vetor errado não entra
    await expect(db.service("ch_worker_save_embeddings", { p_model: "m", p_items: [{ passage_id: await passageId("Febre"), embedding: [1, 2, 3] }] })).rejects.toThrow();
  });

  it("a busca junta palavras e significado; sem vetor é a de antes; filtros e regras das fontes valem para os dois", async () => {
    const infarto = await passageId("Infarto agudo");
    const febre = await passageId("Febre");
    const find = (r: any[], id: string) => r.find((x) => x.passage_id === id);
    // só palavras (como antes; a busca da equipe mostra também a fonte preliminar, com a situação dela)
    let r = await search("infarto");
    expect(find(r, infarto)).toMatchObject({ match: "palavras", similarity: null });
    expect(r.every((x: any) => x.match === "palavras")).toBe(true);
    // "ataque cardíaco" não tem palavra em comum com o trecho: só o significado acha
    expect(await search("ataque cardíaco")).toEqual([]);
    r = await search("ataque cardíaco", meaningOf("ataque cardíaco"));
    expect(find(r, infarto)).toMatchObject({ match: "significado", source: "Protocolo de dor torácica" });
    expect(find(r, infarto).similarity).toBeGreaterThan(0.5);
    expect(r.findIndex((x: any) => x.passage_id === infarto)).toBeLessThan(r.findIndex((x: any) => x.passage_id === febre)); // o parecido antes
    // nas duas listas: "ambos"
    r = await search("infarto", meaningOf("infarto do coração"));
    expect(find(r, infarto)).toMatchObject({ match: "ambos" });
    // regras das fontes: sociedade sem aprovação editorial nunca aparece, nem pelo significado
    expect(r.some((x: any) => /sociedade/.test(x.text))).toBe(false);
    // filtros valem para o significado também
    r = await search("ataque cardíaco", meaningOf("ataque cardíaco"), { population: "lactentes" });
    expect(r.some((x: any) => x.passage_id === infarto)).toBe(false);
    // piso de semelhança: o que é pouco parecido sai
    r = await search("ataque cardíaco", meaningOf("ataque cardíaco", { min_similarity: 0.99 }));
    expect(r).toEqual([]);
    // vetor de outro modelo não mistura espaços
    expect(await search("ataque cardíaco", { ...meaningOf("ataque cardíaco"), model: "outro-modelo" })).toEqual([]);
    await expect(search("x", { model: "gemini-embedding-2", values: [1, 2] })).rejects.toThrow(/tamanho diferente de 768/);
  });

  it("busca de evidências do processamento: só fontes que valem; a das fontes oficiais exige nível A–D e versão final", async () => {
    const infarto = await passageId("Infarto agudo");
    const ev = await db.service<any[]>("ch_worker_search_passages", { p_query: "ataque cardíaco", p_limit: 5, p_embedding: meaningOf("ataque cardíaco") });
    expect(ev[0].passage_id).toBe(infarto);
    expect(ev.some((x) => /preliminar|sociedade/.test(x.text))).toBe(false);
    const off = await db.service<any[]>("ch_worker_search_official_passages", { p_query: "ataque cardíaco", p_limit: 5, p_embedding: meaningOf("ataque cardíaco") });
    expect(off[0]).toMatchObject({ passage_id: infarto, authority_level: "A" });
    expect(await db.service<any[]>("ch_worker_search_official_passages", { p_query: "ataque cardíaco", p_limit: 5 })).toEqual([]); // sem vetor: só palavras
  });

  it("troca de modelo: refaz todos os vetores; a busca só usa os do modelo da pergunta", async () => {
    expect(await embedPendingPassages(db, fakeEmbedder("modelo-novo"))).toMatchObject({ embedded: 4 });
    expect(await search("ataque cardíaco", meaningOf("ataque cardíaco"))).toEqual([]); // os do modelo antigo foram trocados
    expect((await search("ataque cardíaco", { ...meaningOf("ataque cardíaco"), model: "modelo-novo" }))[0].match).toBe("significado");
    expect(await embedPendingPassages(db, fakeEmbedder())).toMatchObject({ embedded: 4 }); // volta ao modelo de antes
  });

  it("a chave \"IA ligada\" do painel desliga a busca por significado (nada vai ao Google)", async () => {
    const worker = createContentHubWorker({ db, storage: localStorageDir(path.join(tmp, "files")), ai: { provider: null, status: { ready: false } }, embedder: fakeEmbedder("mais-um") } as any);
    await dev.db.query(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    calls.documents = 0;
    expect(await worker.embed()).toMatchObject({ embedded: 0 });
    expect(calls.documents).toBe(0);
    await dev.db.query(`update public.ch_flags set value = true where key = 'ai_enabled'`);
    resetEmbeddingsPermission();
    expect(await worker.embed({ max: 2 })).toMatchObject({ embedded: 2 });
    await embedPendingPassages(db, fakeEmbedder()); // volta tudo ao modelo padrão
  });

  it("permissões: aluno não busca; funções do processamento e a tabela de vetores fechadas para quem entra no app", async () => {
    await expect(rpc(STUDENT, "app_ch_search_passages", { p_query: "infarto", p_filters: {}, p_limit: 5, p_embedding: null })).rejects.toThrow(/restrit/i);
    const asStudent = (q: string) =>
      dev.db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: STUDENT })]);
        return tx.query<any>(q);
      });
    await expect(asStudent(`select public.ch_worker_passages_to_embed('m', 5)`)).rejects.toThrow(/permission denied/);
    await expect(asStudent(`select public.ch_worker_save_embeddings('m', '[]'::jsonb)`)).rejects.toThrow(/permission denied/);
    await expect(asStudent(`select * from public.ch_semantic_candidates('{}'::jsonb, 5)`)).rejects.toThrow(/permission denied/);
    expect((await asStudent(`select * from public.ch_passage_embeddings`)).rows).toEqual([]);
  });
});

describe("Com pgvector (como no Supabase)", () => {
  it("cria a extensão e o índice HNSW; a busca dá o mesmo resultado", async () => {
    const pg = new PGlite({ extensions: { vector } });
    try {
      await pg.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
      for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) {
        await pg.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
      }
      expect((await pg.query(`select 1 from pg_indexes where indexname = 'ch_passage_embeddings_hnsw'`)).rows).toHaveLength(1);
      const src = (await pg.query<{ id: string }>(`insert into public.ch_sources (title, organ, authority_level) values ('Protocolo', 'MS', 'A') returning id`)).rows[0].id;
      await pg.query(`select public.ch_worker_replace_passages($1, $2::jsonb)`, [src, JSON.stringify([{ text: "Infarto agudo do miocárdio: AAS 300 mg." }, { text: "Febre em lactentes: avaliar." }])]);
      const ps = (await pg.query<{ id: string; text: string }>(`select id, text from public.ch_source_passages`)).rows;
      await pg.query(`select public.ch_worker_save_embeddings('gemini-embedding-2', $1::jsonb)`, [JSON.stringify(ps.map((p) => ({ passage_id: p.id, embedding: conceptVector(p.text) })))]);
      const r = (await pg.query<{ r: any[] }>(`select public.ch_worker_search_official_passages('ataque cardíaco', 5, $1::jsonb) r`, [JSON.stringify(meaningOf("ataque cardíaco"))])).rows[0].r;
      expect(r[0].text).toMatch(/^Infarto/);
      const stats = (await pg.query<{ s: any }>(`select public.ch_worker_embedding_stats('gemini-embedding-2') s`)).rows[0].s;
      expect(stats).toEqual({ passages: 2, embedded: 2, vector_index: true });
    } finally {
      await pg.close();
    }
  }, 300_000);
});

// ---------------------------------------------------------------- rota da equipe e painel
const servers: Server[] = [];
const listen = (embedder: Embedder | null) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use("/api/content-hub", createContentHubRouter({ db, storage: localStorageDir(path.join(tmp, "files")), ai: { provider: null, status: { ready: false, pending: "sem IA" } }, renderer: null, embedder } as any, { worker: null }));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub`));
    servers.push(srv);
  });
const post = async (base: string, body: unknown, token = editorToken) => {
  const r = await fetch(`${base}/search`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

describe("Rota de busca da equipe e situação no painel", () => {
  it("o servidor faz o vetor da pergunta (só para a equipe) e devolve como cada trecho foi achado", async () => {
    const base = await listen(fakeEmbedder());
    calls.queries = 0;
    const s = await post(base, { query: "ataque cardíaco", limit: 5 });
    expect(s.status).toBe(200);
    expect(s.body.mode).toBe("palavras e significado");
    expect(s.body.results.every((x: any) => x.match === "significado")).toBe(true);
    expect(s.body.results.some((x: any) => x.source === "Protocolo de dor torácica")).toBe(true);
    expect(calls.queries).toBe(1);
    expect((await post(base, { query: "  " })).status).toBe(400);
    const st = await post(base, { query: "infarto" }, studentToken);
    expect(st.status).toBe(403);
    expect(calls.queries).toBe(1); // aluno não gasta com vetor
    const status = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${editorToken}` } })).json();
    expect(status.embeddings).toEqual({ ready: true, model: "gemini-embedding-2", passages: 4, embedded: 4, vector_index: false });
    expect(status.pending.some((p: string) => /Busca por significado/.test(p))).toBe(false);
  });

  it("sem a busca ligada: só palavras e a pendência explica como ligar", async () => {
    const base = await listen(null);
    const s = await post(base, { query: "infarto" });
    expect(s.body.mode).toBe("palavras");
    expect(s.body.results.length).toBeGreaterThan(0);
    expect(s.body.results.every((x: any) => x.match === "palavras")).toBe(true);
    const status = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${editorToken}` } })).json();
    expect(status.embeddings).toMatchObject({ ready: false, model: "gemini-embedding-2", passages: 4 });
    expect(status.pending.some((p: string) => /Busca por significado ainda desligada: falta autorizar/.test(p))).toBe(true);
  });
});
