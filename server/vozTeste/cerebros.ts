/**
 * Voice Tutor — Fase 2 (protótipo). "Cérebros" de texto em fluxo usados pelo Custom LLM e pela bancada:
 *   gemini → Gemini (3.8 Flash) pelo Vertex com a chave de API (server/vozTeste/vertexTexto.ts)
 *   claude → Claude pelo Vertex (publicador anthropic, streamRawPredict) com o token do Google (conta do dono ou do serviço)
 * Nenhuma chave do .env do projeto é usada.
 */
import type { MensagemGemini, PedacoGemini } from "./vertexTexto";
import { geminiEmFluxo } from "./vertexTexto";

export type NomeCerebro = "gemini" | "claude";

export interface PedidoCerebro { sistema: string; contents: MensagemGemini[]; signal?: AbortSignal; maxTokens?: number; temperatura?: number }

/** Lê eventos SSE ("event:"/"data:") de um corpo em fluxo. */
export async function* eventosSse(corpo: ReadableStream<Uint8Array>): AsyncGenerator<{ evento: string | null; dado: string }> {
  const dec = new TextDecoder();
  const reader = corpo.getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const bloco = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let evento: string | null = null;
      const dados: string[] = [];
      for (const l of bloco.split("\n")) {
        if (l.startsWith("event:")) evento = l.slice(6).trim();
        else if (l.startsWith("data:")) dados.push(l.slice(5).trim());
      }
      if (dados.length) yield { evento, dado: dados.join("") };
    }
  }
}

/** Claude pelo Vertex em fluxo. Converte os eventos da Anthropic para o mesmo formato de pedaço do Gemini. */
export async function* claudeEmFluxo(o: PedidoCerebro & { token: string; projeto: string; regiao: string; modelo: string; fetchFn?: typeof fetch }): AsyncGenerator<PedacoGemini> {
  const host = o.regiao === "global" ? "aiplatform.googleapis.com" : `${o.regiao}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${o.projeto}/locations/${o.regiao}/publishers/anthropic/models/${o.modelo}:streamRawPredict`;
  const messages = o.contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map((p) => p.text).join("\n") }));
  const r = await (o.fetchFn ?? fetch)(url, {
    method: "POST",
    signal: o.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.token}` },
    body: JSON.stringify({ anthropic_version: "vertex-2023-10-16", system: o.sistema, messages, max_tokens: o.maxTokens ?? 350, temperature: o.temperatura ?? 0.9, stream: true }),
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    throw new Error(`Claude/Vertex ${o.modelo} respondeu ${r.status}: ${t.slice(0, 200)}`);
  }
  const uso: Record<string, number> = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
  for await (const { dado } of eventosSse(r.body)) {
    let j: any;
    try { j = JSON.parse(dado); } catch { continue; }
    if (j.type === "message_start") {
      const u = j.message?.usage ?? {};
      uso.entrada = u.input_tokens ?? 0; uso.cacheLeitura = u.cache_read_input_tokens ?? 0; uso.cacheEscrita = u.cache_creation_input_tokens ?? 0;
    } else if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
      yield { texto: j.delta.text ?? "", uso: null, fim: null };
    } else if (j.type === "message_delta") {
      uso.saida = j.usage?.output_tokens ?? uso.saida;
      yield { texto: "", uso: { promptTokenCount: uso.entrada + uso.cacheLeitura + uso.cacheEscrita, candidatesTokenCount: uso.saida, totalTokenCount: uso.entrada + uso.saida, claude: { ...uso } }, fim: j.delta?.stop_reason ?? null };
    } else if (j.type === "error") {
      throw new Error(`Claude/Vertex: ${JSON.stringify(j.error).slice(0, 200)}`);
    }
  }
}

export interface ConfigCerebros {
  apiKey?: string;
  apiBase?: string;
  modeloGemini: string;
  modeloClaude: string;
  projeto: string;
  regiaoClaude: string;
  tokenGoogle: () => Promise<string>;
}

export async function* gerarCom(nome: NomeCerebro, c: ConfigCerebros, p: PedidoCerebro): AsyncGenerator<PedacoGemini> {
  if (nome === "claude") {
    yield* claudeEmFluxo({ ...p, token: await c.tokenGoogle(), projeto: c.projeto, regiao: c.regiaoClaude, modelo: c.modeloClaude });
  } else {
    yield* geminiEmFluxo({ apiKey: c.apiKey, apiBase: c.apiBase, modelo: c.modeloGemini, sistema: p.sistema, contents: p.contents, signal: p.signal, maxTokens: p.maxTokens, temperatura: p.temperatura });
  }
}
