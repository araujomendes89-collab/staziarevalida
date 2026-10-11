/**
 * BUSCA POR SIGNIFICADO (embeddings) da Central de Conteúdo. Pendência da Administração resolvida em 2026-10-06 com o modelo
 * escolhido pelo dono: Gemini Embedding 2 (`gemini-embedding-2`, 768 dimensões). Os trechos das fontes viram vetores no
 * processamento (tarefa do Cloud Run), em lotes; a busca de evidências junta palavras e significado no banco
 * (ch_semantic_candidates e fusão das posições, migração 5000).
 *
 *   CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1   autoriza enviar os textos das fontes e as buscas ao Google (sem isso, só palavras)
 *   CONTENT_HUB_EMBEDDINGS_MODEL              padrão gemini-embedding-2; "off" desliga
 *   CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT     projeto do Google Cloud: Vertex AI completo pela conta de serviço (manda; sem chave).
 *                                             Só no processamento (Cloud Run): o site (Vercel) não tem conta de serviço do Google;
 *                                             lá, sem credencial, a busca fica parada com o motivo, sem nova tentativa
 *   CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION    global (padrão), us ou eu
 *   GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY    chave do AI Studio (sem o projeto acima)
 *   A VERTEX_API_KEY NÃO serve aqui: é do modo expresso do Vertex AI, que não tem modelo de busca por significado (o Google
 *   respondia 404; falha vista em produção em 2026-10-09). Só com ela, a busca fica parada com o motivo e segue por palavras.
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
import { googleEmbeddingsAccess, realGoogleKey } from "../ai/googleKey";

export const EMBEDDING_DIMS = 768;
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
/** Versão do formato do texto enviado ao modelo (fica registrada em cada execução). */
export const EMBEDDING_FORMAT_VERSION = "1";
const BATCH = 50;
const MAX_CHARS = 8_000;
const PRICE_PER_MTOK: Record<string, number> = { "gemini-embedding-2": 0.2, "gemini-embedding-001": 0.15 };
/** Vertex AI: pedidos de 1 texto (a biblioteca do Google não aceita mais no Vertex), no máximo estes ao mesmo tempo. */
const VERTEX_PARALLEL = 4;
/** Erro de configuração (pedido inválido, sem chave válida, sem crédito, sem permissão, modelo inexistente): repetir não resolve. */
const CONFIG_ERRORS = new Set([400, 401, 402, 403, 404]);
/** Depois de um erro de configuração, a busca por significado para por este tempo (nada vai ao Google) e segue por palavras. */
const CONFIG_PAUSE_MS = 10 * 60_000;
/**
 * A biblioteca de autenticação do Google (google-auth-library) não achou credencial neste ambiente: lança um Error comum, sem status
 * HTTP. Acontece com o Vertex AI por projeto onde não há conta de serviço do Google (o site na Vercel). É configuração: repetir não
 * resolve, e cada tentativa ainda gasta o tempo da procura da credencial.
 */
const NO_CREDENTIAL = /could not load the default credentials|unable to find credentials in current environment|unable to detect a project id/i;
const NO_CREDENTIAL_REASON =
  "sem credencial do Google neste ambiente. O Vertex AI por projeto (CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT) usa a conta de serviço, que só existe no processamento (Cloud Run); no site, tire essa variável e use a GEMINI_API_KEY (AI Studio), ou fique com a busca por palavras.";

/**
 * Motivo de um erro de configuração do Google (400, 401, 402, 403, 404) em português simples, pelo código. É o texto que o painel
 * (/status) e o relato do processamento mostram ao dono; a mensagem crua da biblioteca do Google (inglês, JSON) fica só no log.
 */
export function googleRefusalReason(status: number, cfg: Pick<EmbeddingsConfig, "mode" | "model" | "project" | "location">): string {
  const vertex = cfg.mode === "vertex_project";
  const access = vertex ? `Vertex AI do projeto ${cfg.project ?? ""} (local ${cfg.location || "global"})` : "chave do AI Studio (GEMINI_API_KEY)";
  const end = " O detalhe técnico fica no registro (log).";
  switch (status) {
    case 400:
      return `o Google recusou o pedido (código 400). Confira o modelo escolhido (${cfg.model ?? "CONTENT_HUB_EMBEDDINGS_MODEL"}).${end}`;
    case 401:
    case 403:
      return vertex
        ? `sem permissão no Google (código ${status}): a conta de serviço da tarefa não pode usar o ${access}. Ela precisa do papel roles/aiplatform.user e da API do Vertex AI ligada no projeto (o script do Cloud Run faz isso com EMBEDDINGS_VERTEX=1).${end}`
        : `chave recusada ou sem permissão no Google (código ${status}): confira a ${access}.${end}`;
    case 402:
      return vertex
        ? `sem crédito no Google (código 402): o projeto ${cfg.project ?? ""} está sem crédito ou sem cobrança ativa.${end}`
        : `sem crédito no Google (código 402): a conta da ${access} está sem crédito. Ponha crédito ou troque a chave.${end}`;
    case 404:
      return `o modelo ${cfg.model ?? ""} não foi encontrado nesse acesso ao Google (código 404, ${access}). Confira o modelo e o tipo de acesso.${end}`;
    default:
      return `o Google recusou o pedido (código ${status}).${end}`;
  }
}

export interface EmbeddingsConfig {
  ready: boolean;
  model: string | null;
  key: string | null;
  /** Vertex AI completo pela conta de serviço (projeto e local) ou AI Studio (GEMINI_API_KEY). */
  mode: "vertex_project" | "studio" | null;
  project?: string | null;
  location?: string | null;
  pending: string | null;
}

const NOT_ALLOWED =
  "Busca por significado ainda desligada: falta autorizar o envio dos textos das fontes ao Google (CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1 no servidor e no processamento). Enquanto isso, a busca de evidências usa palavras.";
// O Vertex AI por projeto usa a conta de serviço do Google, que só existe no processamento (Cloud Run): no site (Vercel), só a chave
// do AI Studio serve. As mensagens não mandam pôr o projeto no site.
const EXPRESS_ONLY =
  "Busca por significado parada: a chave do Vertex AI no modo expresso (VERTEX_API_KEY) não tem modelo de busca por significado. Para ligar: no site, a chave do AI Studio com crédito (GEMINI_API_KEY); no processamento (Cloud Run), o Vertex AI completo pela conta de serviço da tarefa (CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT) ou a mesma GEMINI_API_KEY. Enquanto isso, a busca de evidências usa palavras.";
const NO_ACCESS =
  "Busca por significado sem acesso ao Google: no site, defina GEMINI_API_KEY (AI Studio); no processamento (Cloud Run), CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT (Vertex AI pela conta de serviço da tarefa) ou GEMINI_API_KEY. Enquanto isso, a busca de evidências usa palavras.";

export function embeddingsConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingsConfig {
  const raw = (env.CONTENT_HUB_EMBEDDINGS_MODEL ?? "").trim();
  if (raw.toLowerCase() === "off" || /^(false|0|off)$/i.test((env.CONTENT_LAB_ENABLED ?? "").trim())) {
    return { ready: false, model: null, key: null, mode: null, pending: "Busca por significado desligada no servidor: a busca de evidências usa só palavras." };
  }
  const model = raw || DEFAULT_EMBEDDING_MODEL;
  const access = googleEmbeddingsAccess(env);
  const pending = env.CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL !== "1" ? NOT_ALLOWED : !access ? (realGoogleKey(env.VERTEX_API_KEY) ? EXPRESS_ONLY : NO_ACCESS) : null;
  if (pending || !access) return { ready: false, model, key: null, mode: null, project: null, location: null, pending };
  return access.mode === "studio"
    ? { ready: true, model, key: access.key, mode: "studio", project: null, location: null, pending: null }
    : { ready: true, model, key: null, mode: "vertex_project", project: access.project, location: access.location, pending: null };
}

/** Opções da biblioteca do Google: Vertex AI completo (projeto e local; a credencial é a conta de serviço do ambiente) ou a chave do AI Studio. */
export function embeddingsClientOptions(cfg: EmbeddingsConfig): { apiKey: string } | { vertexai: true; project: string; location: string } {
  if (cfg.mode === "vertex_project") return { vertexai: true, project: cfg.project ?? "", location: cfg.location || "global" };
  return { apiKey: cfg.key ?? "" };
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
  /** `quiet`: a busca já estava parada por erro de configuração e nada foi ao Google (o aviso já saiu uma vez). */
  constructor(message: string, readonly status: number, readonly quiet = false) {
    super(message);
  }
}

export interface Embedder {
  readonly model: string;
  /** Trechos de fonte (título + texto), um vetor por item, na mesma ordem. */
  embedDocuments(items: { title?: string | null; text: string }[]): Promise<{ vectors: number[][]; tokens: number; costUsd: number; latencyMs: number }>;
  /** A pergunta de uma busca. */
  embedQuery(text: string): Promise<number[]>;
  /** Último erro de configuração do Google (ex.: 404), até um pedido seguinte dar certo; senão null (o relato mostra a busca parada). */
  readonly problem?: string | null;
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
  const vertex = cfg.mode === "vertex_project";
  let ai: EmbedClient | null = client ?? null;
  // erro de configuração (ex.: 404): a busca por significado para por um tempo e o motivo fica guardado para o relato
  let problem: { message: string; reason: string; status: number; until: number } | null = null;
  const getClient = async () => {
    if (!ai) {
      const { GoogleGenAI } = await import("@google/genai");
      ai = new GoogleGenAI(embeddingsClientOptions(cfg)) as unknown as EmbedClient;
    }
    return ai;
  };
  const call = async (texts: string[]): Promise<number[][]> => {
    if (problem && Date.now() < problem.until) throw new EmbeddingsError(problem.message, problem.status, true);
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
        problem = null;
        return out.map(normalize);
      } catch (error: any) {
        if (error instanceof EmbeddingsError) throw error;
        // sem credencial do Google aqui (erro sem status): configuração, sem nova tentativa, e a busca para com o motivo
        if (error?.status == null && NO_CREDENTIAL.test(String(error?.message ?? ""))) {
          const failure = new EmbeddingsError(`Busca por significado: ${NO_CREDENTIAL_REASON}`, 401);
          problem = { message: failure.message, reason: NO_CREDENTIAL_REASON, status: 401, until: Date.now() + CONFIG_PAUSE_MS };
          throw failure;
        }
        const status = Number(error?.status ?? error?.code ?? 502) || 502;
        const msg = String(error?.message ?? error).split(cfg.key ?? "\u0000").join("[chave]").slice(0, 240);
        // limite por minuto ou instabilidade: espera e tenta de novo (duas vezes)
        if ((status === 429 || status >= 500) && attempt < 2) {
          attempt++;
          await new Promise((r) => setTimeout(r, attempt * 1500));
          continue;
        }
        // a mensagem do erro vai só para o log: leva o texto cru do Google (inglês, JSON), útil para investigar
        const failure = new EmbeddingsError(`Busca por significado: o Google recusou (${status}): ${msg}`, status);
        // configuração: sem nova tentativa e a busca para (nada de dezenas de pedidos recusados na mesma rodada); o motivo que o
        // painel e o relato mostram é o texto simples, pelo código
        if (CONFIG_ERRORS.has(status)) problem = { message: failure.message, reason: googleRefusalReason(status, cfg), status, until: Date.now() + CONFIG_PAUSE_MS };
        throw failure;
      }
    }
  };
  /** Os vetores de vários textos, na ordem: AI Studio em lotes; Vertex AI um texto por pedido, poucos ao mesmo tempo. */
  const embedTexts = async (texts: string[]): Promise<number[][]> => {
    if (!vertex) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) vectors.push(...(await call(texts.slice(i, i + BATCH))));
      return vectors;
    }
    const vectors = new Array<number[]>(texts.length);
    let next = 0;
    let failed = false;
    const worker = async () => {
      while (!failed && next < texts.length) {
        const i = next++;
        try {
          vectors[i] = (await call([texts[i]]))[0];
        } catch (error) {
          failed = true; // os outros param de pegar textos novos
          throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(VERTEX_PARALLEL, texts.length) }, worker));
    return vectors;
  };
  return {
    model,
    get problem() {
      return problem?.reason ?? null;
    },
    async embedDocuments(items) {
      const t0 = Date.now();
      const texts = items.map((it) => `title: ${clip(it.title ?? "") || "none"} | text: ${clip(it.text)}`);
      const vectors = await embedTexts(texts);
      const tokens = tokensOf(texts);
      return { vectors, tokens, costUsd: Math.round(((tokens * embeddingPrice(model)) / 1_000_000) * 1e6) / 1e6, latencyMs: Date.now() - t0 };
    },
    async embedQuery(text) {
      return (await embedTexts([`task: search result | query: ${clip(text)}`]))[0];
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
    // parada por erro de configuração já avisado: segue por palavras sem repetir o aviso a cada busca
    if (!(error instanceof EmbeddingsError && error.quiet)) log?.(`[central] busca por significado indisponível agora (seguiu por palavras): ${(error as Error).message.slice(0, 200)}`);
    return null;
  }
}

/**
 * Gera os vetores dos trechos que ainda não têm (ou têm de outro modelo), em lotes, até acabar, até `max` trechos ou até o
 * prazo. Cada lote fica registrado em ch_ai_runs (etapa "embeddings", tokens estimados e custo).
 */
export async function embedPendingPassages(
  db: ContentDb, embedder: Embedder,
  opts: {
    max?: number; deadline?: number; log?: (m: string) => void;
    /** Só os trechos desta fonte (etapa source_index: a fonte nova ganha os vetores antes da reconferência). Sem ele, todos os que faltam. */
    sourceId?: string;
    /** Depois de cada lote gravado (sinal de vida do trabalho). Se lançar erro, o erro sobe e a geração para ali. */
    onBatch?: (embedded: number) => Promise<unknown>;
    /** Campos a mais no registro de ch_ai_runs (ex.: job_id e document_id da etapa que pediu). */
    run?: Record<string, unknown>;
  } = {}
): Promise<{ embedded: number; tokens: number; costUsd: number }> {
  const max = opts.max ?? 2_000;
  let embedded = 0;
  let tokens = 0;
  let costUsd = 0;
  while (embedded < max && (!opts.deadline || Date.now() < opts.deadline)) {
    const limit = Math.min(BATCH, max - embedded);
    const batch = await db.service<{ id: string; title: string | null; section: string | null; text: string }[]>(
      opts.sourceId ? "ch_worker_source_passages_to_embed" : "ch_worker_passages_to_embed",
      opts.sourceId ? { p_source_id: opts.sourceId, p_model: embedder.model, p_limit: limit } : { p_model: embedder.model, p_limit: limit }
    );
    if (!batch?.length) break;
    const r = await embedder.embedDocuments(batch.map((p) => ({ title: [p.title, p.section].filter(Boolean).join(" — ") || null, text: p.text })));
    const saved = await db.service<number>("ch_worker_save_embeddings", {
      p_model: embedder.model, p_items: batch.map((p, i) => ({ passage_id: p.id, embedding: r.vectors[i] })),
    });
    await db
      .service("ch_worker_log_ai_run", {
        p_run: {
          ...opts.run,
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
    await opts.onBatch?.(embedded);
  }
  if (embedded) opts.log?.(`[central] busca por significado: ${embedded} trecho(s) com vetor novo (~${tokens} tokens, US$ ${costUsd.toFixed(4)})`);
  return { embedded, tokens, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}
