/**
 * CÉREBRO DO TUTOR — vetor da pergunta do aluno (gemini-embedding-2, 768 dimensões, o mesmo modelo dos vetores do índice).
 *
 *  - Na PONTE de voz (Cloud Run): `VetorDaPonte` gera pelo Vertex AI com a conta de serviço que a ponte já tem (a mesma do Live), na
 *    multirregião "us", com cache em memória (LRU, 5 mil perguntas, 24 h) e PRAZO (padrão 400 ms): passou disso, a busca segue só por
 *    palavras (o vetor que chegar depois ainda entra no cache, para a próxima vez).
 *  - No APP (Vercel, sem conta de serviço do Google): `vetorPelaPonte` pede à ponte (POST /vetor, assinado), com o mesmo prazo.
 * O formato do texto é o mesmo de contentHub/embeddings.ts (embedQuery): "task: search result | query: …", e o vetor é normalizado.
 * Arquivo sem dependência pesada: também vai no pacote da ponte.
 */
import { CABECALHO_ASSINATURA, corpoAssinado } from "./assinatura";
import { chaveDaConsulta } from "./consulta";
import type { VetorConsulta } from "./tipos";

export const MODELO_VETOR = "gemini-embedding-2";
export const DIMENSOES = 768;
export const PRAZO_VETOR_MS = 400;

/** LRU simples por ordem de inserção do Map. */
export class CacheLRU<V> {
  private m = new Map<string, { v: V; ate: number }>();
  constructor(private max = 5000, private validadeMs = 24 * 3600_000) {}
  get(k: string, agora = Date.now()): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.ate < agora) { this.m.delete(k); return undefined; }
    this.m.delete(k);
    this.m.set(k, e);
    return e.v;
  }
  set(k: string, v: V, agora = Date.now()) {
    this.m.delete(k);
    this.m.set(k, { v, ate: agora + this.validadeMs });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  get tamanho() { return this.m.size; }
}

const normalizarVetor = (v: number[]) => {
  const n = Math.hypot(...v);
  return n > 0 ? v.map((x) => x / n) : v;
};

/** Endereço REST do Vertex para embedContent (o mesmo que a biblioteca @google/genai usa para os modelos gemini-embedding-*). */
export function urlVertexEmbed(projeto: string, local: string, modelo = MODELO_VETOR): string {
  const base = local === "global" ? "https://aiplatform.googleapis.com" : ["us", "eu"].includes(local) ? `https://aiplatform.${local}.rep.googleapis.com` : `https://${local}-aiplatform.googleapis.com`;
  return `${base}/v1/projects/${projeto}/locations/${local}/publishers/google/models/${modelo}:embedContent`;
}

export interface OpcoesVertex {
  projeto: string;
  local?: string;
  modelo?: string;
  tokenGoogle: () => Promise<string>;
  fetchFn?: typeof fetch;
}

/** Um vetor pelo Vertex (sem prazo; quem chama decide). Lança erro com o código HTTP. */
export async function vetorVertex(texto: string, o: OpcoesVertex, sinal?: AbortSignal): Promise<number[]> {
  const token = await o.tokenGoogle();
  const r = await (o.fetchFn ?? fetch)(urlVertexEmbed(o.projeto, o.local ?? "us", o.modelo ?? MODELO_VETOR), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: { role: "user", parts: [{ text: `task: search result | query: ${texto.slice(0, 2000)}` }] }, embedContentConfig: { outputDimensionality: DIMENSOES } }),
    signal: sinal,
  });
  if (!r.ok) throw Object.assign(new Error(`Vertex respondeu ${r.status}`), { status: r.status });
  const j = (await r.json()) as { embedding?: { values?: number[] }; embeddings?: { values?: number[] }[]; predictions?: { embeddings?: { values?: number[] } }[] };
  const v = j.embedding?.values ?? j.embeddings?.[0]?.values ?? j.predictions?.[0]?.embeddings?.values;
  if (!Array.isArray(v) || v.length !== DIMENSOES) throw Object.assign(new Error("Vertex devolveu vetor com tamanho diferente de 768"), { status: 502 });
  return normalizarVetor(v.map(Number));
}

/** Corre contra o prazo: devolve null se passar (a promessa original continua e pode preencher o cache depois). */
export async function comPrazo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<null>((ok) => { t = setTimeout(() => ok(null), ms); })]);
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Gerador de vetores da ponte: cache em memória + prazo + pausa depois de erro de configuração/cota. */
export class VetorDaPonte {
  readonly cache = new CacheLRU<number[]>();
  private pausaAte = 0;
  readonly medidas = { pedidos: 0, cache: 0, prazo: 0, erros: 0 };
  constructor(private o: OpcoesVertex & { prazoMs?: number; log?: (x: Record<string, unknown>) => void }) {}

  async vetor(texto: string, prazoMs = this.o.prazoMs ?? PRAZO_VETOR_MS): Promise<VetorConsulta | null> {
    const chave = chaveDaConsulta(texto);
    if (!chave) return null;
    this.medidas.pedidos++;
    const emCache = this.cache.get(chave);
    if (emCache) { this.medidas.cache++; return { model: this.o.modelo ?? MODELO_VETOR, values: emCache }; }
    if (Date.now() < this.pausaAte) return null;
    const p = vetorVertex(texto, this.o).then(
      (v) => { this.cache.set(chave, v); return v; },
      (e: { status?: number; message?: string }) => {
        this.medidas.erros++;
        // cota (429) ou configuração (400-404): para de pedir por um tempo; a busca segue por palavras
        if (e?.status === 429) this.pausaAte = Date.now() + 15_000;
        else if (e?.status && e.status >= 400 && e.status < 500) this.pausaAte = Date.now() + 10 * 60_000;
        this.o.log?.({ ponte: "vetor_falhou", status: e?.status ?? null, erro: String(e?.message ?? e).slice(0, 120) });
        throw e;
      },
    );
    const v = await comPrazo(p, prazoMs);
    if (!v) { this.medidas.prazo++; p.catch(() => undefined); return null; }
    return { model: this.o.modelo ?? MODELO_VETOR, values: v };
  }
}

/** Endereço HTTP da ponte a partir do WebSocket (wss://host/ponte → https://host). */
export function urlHttpDaPonte(wss: string | null | undefined): string | null {
  const m = String(wss ?? "").trim().match(/^wss:\/\/([^/\s]+)/);
  return m ? `https://${m[1]}` : null;
}

const cacheApp = new CacheLRU<number[]>(2000, 6 * 3600_000);
/**
 * App (Tutor por texto, reserva OpenAI): pede o vetor à ponte, com prazo. Sem ponte configurada, sem resposta no prazo ou com erro:
 * null (a busca segue por palavras). Nunca lança.
 */
export async function vetorPelaPonte(texto: string, env: NodeJS.ProcessEnv = process.env, o: { prazoMs?: number; fetchFn?: typeof fetch } = {}): Promise<VetorConsulta | null> {
  const chave = chaveDaConsulta(texto);
  if (!chave) return null;
  const emCache = cacheApp.get(chave);
  if (emCache) return { model: MODELO_VETOR, values: emCache };
  const base = urlHttpDaPonte(env.VOZ_PONTE_URL);
  const segredo = (env.VOZ_PONTE_SEGREDO ?? "").trim();
  if (!base || segredo.length < 32 || env.TUTOR_CONHECIMENTO_VETOR === "0") return null;
  try {
    const { corpo, assinatura } = corpoAssinado({ texto: texto.slice(0, 2000) }, segredo);
    const prazo = o.prazoMs ?? PRAZO_VETOR_MS + 250; // a ida até a ponte soma ao prazo dela
    const r = await (o.fetchFn ?? fetch)(`${base}/vetor`, {
      method: "POST", headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinatura }, body: corpo, signal: AbortSignal.timeout(prazo),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { model?: string; values?: number[] } | null;
    if (!j || !Array.isArray(j.values) || j.values.length !== DIMENSOES || typeof j.model !== "string") return null;
    cacheApp.set(chave, j.values);
    return { model: j.model, values: j.values };
  } catch {
    return null;
  }
}
