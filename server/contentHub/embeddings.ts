/**
 * BUSCA POR SIGNIFICADO (embeddings) da Central de Conteúdo. Pendência da Administração resolvida em 2026-10-06 com o modelo
 * escolhido pelo dono: Gemini Embedding 2 (`gemini-embedding-2`, 768 dimensões). Os trechos das fontes viram vetores no
 * processamento (tarefa do Cloud Run), em lotes; a busca de evidências junta palavras e significado no banco
 * (ch_semantic_candidates e fusão das posições, migração 5000).
 *
 *   CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1   autoriza enviar os textos das fontes e as buscas ao Google (sem isso, só palavras)
 *   CONTENT_HUB_EMBEDDINGS_MODEL              padrão gemini-embedding-2; "off" desliga
 *   VERTEX_API_KEY (Vertex AI, manda) ou GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY (AI Studio)
 *   CONTENT_LAB_ENABLED=false                 desliga também (como toda a Central)
 *   CONTENT_HUB_EMBEDDINGS_MIN_SIMILARITY     opcional (0 a 1): piso de semelhança para um trecho entrar só pelo significado
 *   AI_COST_CONFIG {"gemini-embedding-2":{"input":0.2}}   US$ por milhão de tokens (padrão 0,20)
 *
 * Trocar de modelo: os vetores antigos deixam de valer (espaços diferentes); o processamento refaz todos aos poucos e, até
 * lá, a busca usa os que já existem do modelo novo mais as palavras.
 */
import crypto from "crypto";
import type { ContentDb } from "./infra";
import { aiAllowed } from "./ai/registry";
import { googleAiAccess, googleGenAiOptions, type GoogleAiMode } from "../ai/googleKey";

export const EMBEDDING_DIMS = 768;
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
/** Versão do formato do texto enviado ao modelo (fica registrada em cada execução). */
export const EMBEDDING_FORMAT_VERSION = "1";
const BATCH = 50;
const MAX_CHARS = 8_000;
const PRICE_PER_MTOK: Record<string, number> = { "gemini-embedding-2": 0.2, "gemini-embedding-001": 0.15 };

export interface EmbeddingsConfig {
  ready: boolean;
  model: string | null;
  key: string | null;
  /** Vertex AI (VERTEX_API_KEY) ou AI Studio (GEMINI_API_KEY). */
  mode: GoogleAiMode | null;
  pending: string | null;
}


export function embeddingsConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingsConfig {
  const raw = (env.CONTENT_HUB_EMBEDDINGS_MODEL ?? "").trim();
  if (raw.toLowerCase() === "off" || /^(false|0|off)$/i.test((env.CONTENT_LAB_ENABLED ?? "").trim())) {
    return { ready: false, model: null, key: null, mode: null, pending: "Busca por significado desligada no servidor: a busca de evidências usa só palavras." };
  }
  const model = raw || DEFAULT_EMBEDDING_MODEL;
  const access = googleAiAccess(env);
  const key = access?.key ?? null;
  const pending =
    env.CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL !== "1"
      ? "Busca por significado ainda desligada: falta autorizar o envio dos textos das fontes ao Google (CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1 no servidor e no processamento). Enquanto isso, a busca de evidências usa palavras."
      : !key
        ? "Busca por significado sem chave: defina VERTEX_API_KEY (ou GEMINI_API_KEY) no servidor e no processamento. Enquanto isso, a busca de evidências usa palavras."
        : null;
  return { ready: !pending, model, key: pending ? null : key, mode: pending ? null : (access?.mode ?? null), pending };
}

/** Preço por milhão de tokens do modelo (AI_COST_CONFIG manda; senão a tabela daqui). */
export function embeddingPrice(model: string, env: NodeJS.ProcessEnv = process.env): number {
  try {
    const cfg = JSON.parse(env.AI_COST_CONFIG || "{}") as Record<string, { input?: number }>;
    const v = Number(cfg[model]?.input);
    if (Number.isFinite(v) && v >= 0) return v;
  } catch {
    // configuração ilegível: tabela padrão
  }
  return PRICE_PER_MTOK[model] ?? 0.2;
}

/** O cliente do Google, na forma que este módulo usa (os testes trocam por um simulado). */
export interface EmbedClient {
  models: {
    embedContent(params: { model: string; contents: unknown; config?: Record<string, unknown> }): Promise<{ embeddings?: { values?: number[] }[] }>;
  };
}

export class EmbeddingsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface Embedder {
  readonly model: string;
  /** Trechos de fonte (título + texto), um vetor por item, na mesma ordem. */
  embedDocuments(items: { title?: string | null; text: string }[]): Promise<{ vectors: number[][]; tokens: number; costUsd: number; latencyMs: number }>;
  /** A pergunta de uma busca. */
  embedQuery(text: string): Promise<number[]>;
}

const normalize = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 0 ? v.map((x) => x / n) : v;
};
/** Estimativa de tokens (português: ~4 caracteres por token); a conta do Google é a que vale. */
const tokensOf = (texts: string[]) => texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);

export function createEmbedder(cfg: EmbeddingsConfig, client?: EmbedClient): Embedder | null {
  if (!cfg.ready || !cfg.model) return null;
  const model = cfg.model;
  let ai: EmbedClient | null = client ?? null;
  const getClient = async () => {
    if (!ai) {
      const { GoogleGenAI } = await import("@google/genai");
      ai = new GoogleGenAI(googleGenAiOptions({ mode: cfg.mode ?? "studio", key: cfg.key! })) as unknown as EmbedClient;
    }
    return ai;
  };
  const call = async (texts: string[]): Promise<number[][]> => {
    const c = await getClient();
    let attempt = 0;
    for (;;) {
      try {
        // cada texto num Content separado: um vetor por texto (vários textos no mesmo Content viram um vetor só)
        const r = await c.models.embedContent({ model, contents: texts.map((text) => ({ parts: [{ text }] })), config: { outputDimensionality: EMBEDDING_DIMS } });
        const out = (r.embeddings ?? []).map((e) => e.values ?? []);
        if (out.length !== texts.length || out.some((v) => v.length !== EMBEDDING_DIMS)) {
          throw new EmbeddingsError(`O Google devolveu ${out.length} vetor(es) para ${texts.length} texto(s) ou um vetor com tamanho diferente de ${EMBEDDING_DIMS}.`, 502);
        }
        return out.map(normalize);
      } catch (error: any) {
        if (error instanceof EmbeddingsError) throw error;
        const status = Number(error?.status ?? error?.code ?? 502) || 502;
        const msg = String(error?.message ?? error).split(cfg.key ?? "\u0000").join("[chave]").slice(0, 240);
        // limite por minuto ou instabilidade: espera e tenta de novo (duas vezes)
        if ((status === 429 || status >= 500) && attempt < 2) {
          attempt++;
          await new Promise((r) => setTimeout(r, attempt * 1500));
          continue;
        }
        throw new EmbeddingsError(`Busca por significado: o Google recusou (${status}): ${msg}`, status);
      }
    }
  };
  return {
    model,
    async embedDocuments(items) {
      const t0 = Date.now();
      const texts = items.map((it) => `title: ${clip(it.title ?? "") || "none"} | text: ${clip(it.text)}`);
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) vectors.push(...(await call(texts.slice(i, i + BATCH))));
      const tokens = tokensOf(texts);
      return { vectors, tokens, costUsd: Math.round(((tokens * embeddingPrice(model)) / 1_000_000) * 1e6) / 1e6, latencyMs: Date.now() - t0 };
    },
    async embedQuery(text) {
      return (await call([`task: search result | query: ${clip(text)}`]))[0];
    },
  };
}

// A chave "IA ligada" do painel (e o desligamento no servidor) vale também para a busca por significado: desligada, nada vai
// ao Google e a busca segue só por palavras. Conferida a cada 30 s no máximo.
let permission: { db: ContentDb; at: number; ok: boolean } | null = null;
export async function embedderAllowed(db: ContentDb, embedder: Embedder | null | undefined): Promise<Embedder | null> {
  if (!embedder) return null;
  if (!permission || permission.db !== db || Date.now() - permission.at > 30_000) {
    const r = await aiAllowed(db).catch(() => ({ ok: false }));
    permission = { db, at: Date.now(), ok: r.ok };
  }
  return permission.ok ? embedder : null;
}
/** Testes: esquece a última conferência da chave. */
export const resetEmbeddingsPermission = () => {
  permission = null;
};

/** Vetor de uma busca no formato que o banco recebe; falhou: null (a busca segue só por palavras). */
export async function queryEmbedding(
  embedder: Embedder | null | undefined, text: string, log?: (m: string) => void, env: NodeJS.ProcessEnv = process.env
): Promise<{ model: string; values: number[]; min_similarity?: number } | null> {
  if (!embedder || !text.trim()) return null;
  try {
    const floor = Number(env.CONTENT_HUB_EMBEDDINGS_MIN_SIMILARITY);
    return { model: embedder.model, values: await embedder.embedQuery(text), ...(floor > 0 && floor < 1 ? { min_similarity: floor } : {}) };
  } catch (error) {
    log?.(`[central] busca por significado indisponível agora (seguiu por palavras): ${(error as Error).message.slice(0, 200)}`);
    return null;
  }
}

/**
 * Gera os vetores dos trechos que ainda não têm (ou têm de outro modelo), em lotes, até acabar, até `max` trechos ou até o
 * prazo. Cada lote fica registrado em ch_ai_runs (etapa "embeddings", tokens estimados e custo).
 */
export async function embedPendingPassages(
  db: ContentDb, embedder: Embedder, opts: { max?: number; deadline?: number; log?: (m: string) => void } = {}
): Promise<{ embedded: number; tokens: number; costUsd: number }> {
  const max = opts.max ?? 2_000;
  let embedded = 0;
  let tokens = 0;
  let costUsd = 0;
  while (embedded < max && (!opts.deadline || Date.now() < opts.deadline)) {
    const batch = await db.service<{ id: string; title: string | null; section: string | null; text: string }[]>("ch_worker_passages_to_embed", {
      p_model: embedder.model, p_limit: Math.min(BATCH, max - embedded),
    });
    if (!batch?.length) break;
    const r = await embedder.embedDocuments(batch.map((p) => ({ title: [p.title, p.section].filter(Boolean).join(" — ") || null, text: p.text })));
    const saved = await db.service<number>("ch_worker_save_embeddings", {
      p_model: embedder.model, p_items: batch.map((p, i) => ({ passage_id: p.id, embedding: r.vectors[i] })),
    });
    await db
      .service("ch_worker_log_ai_run", {
        p_run: {
          step: "embeddings", provider: "gemini", model: embedder.model, prompt_id: "passage_embedding", prompt_version: EMBEDDING_FORMAT_VERSION,
          schema_version: `${EMBEDDING_DIMS}d`, input_hash: crypto.createHash("sha256").update(batch.map((p) => p.id).join(",")).digest("hex"),
          status: "ok", output: { passages: batch.length, saved }, input_tokens: r.tokens, output_tokens: 0, cost_usd: r.costUsd, latency_ms: r.latencyMs,
        },
      })
      .catch(() => undefined);
    embedded += batch.length;
    tokens += r.tokens;
    costUsd += r.costUsd;
    if (!saved) break; // nada gravado (trechos apagados no meio do caminho): não insiste no mesmo lote
  }
  if (embedded) opts.log?.(`[central] busca por significado: ${embedded} trecho(s) com vetor novo (~${tokens} tokens, US$ ${costUsd.toFixed(4)})`);
  return { embedded, tokens, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}
