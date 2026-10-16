/**
 * Voice Tutor — Fase 2 (protótipo). Texto em fluxo pelo Vertex (chave de API, endereço "express" sem projeto e sem região:
 * ver ~/.config/vertex-staziamed/AGENTE-VERTEX.md). Sem SDK: um fetch com SSE (streamGenerateContent?alt=sse).
 */
export interface MensagemGemini { role: "user" | "model"; parts: { text: string }[] }
export interface PedacoGemini { texto: string; uso: Record<string, unknown> | null; fim: string | null }

export async function* geminiEmFluxo(o: {
  apiKey?: string;
  /** Alternativa à chave: token do Google (conta/serviço) + projeto e região → endereço regional do Vertex. */
  regional?: { token: string; projeto: string; regiao: string };
  apiBase?: string;
  modelo: string;
  sistema: string;
  contents: MensagemGemini[];
  temperatura?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  /** "0" = thinkingBudget 0 (padrão); "minimal" | "low" = thinkingLevel (modelos 3.x); "nenhum" = não manda thinkingConfig. */
  pensamento?: string;
}): AsyncGenerator<PedacoGemini> {
  const pens = o.pensamento ?? "0";
  const thinkingConfig = pens === "nenhum" ? undefined : pens === "0" ? { thinkingBudget: 0 } : { thinkingLevel: pens };
  const base = o.apiBase || "https://aiplatform.googleapis.com/v1/publishers/google/models";
  const rg = o.regional;
  const host = rg ? (rg.regiao === "global" ? "aiplatform.googleapis.com" : `${rg.regiao}-aiplatform.googleapis.com`) : "";
  const url = rg
    ? `https://${host}/v1/projects/${rg.projeto}/locations/${rg.regiao}/publishers/google/models/${o.modelo}:streamGenerateContent?alt=sse`
    : `${base}/${o.modelo}:streamGenerateContent?alt=sse&key=${encodeURIComponent(o.apiKey ?? "")}`;
  const r = await (o.fetchFn ?? fetch)(url, {
    method: "POST",
    signal: o.signal,
    headers: { "Content-Type": "application/json", ...(rg ? { Authorization: `Bearer ${rg.token}` } : {}) },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.sistema }] },
      contents: o.contents,
      // sem "pensamento": cada token de raciocínio atrasa a primeira palavra (a voz espera por ela)
      generationConfig: { temperature: o.temperatura ?? 0.9, maxOutputTokens: o.maxTokens ?? 350, ...(thinkingConfig ? { thinkingConfig } : {}) },
    }),
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    throw new Error(`Vertex ${o.modelo} respondeu ${r.status}: ${t.slice(0, 200)}`);
  }
  const dec = new TextDecoder();
  let buf = "";
  const reader = r.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const dado = ev.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!dado) continue;
      const j = JSON.parse(dado);
      const c = j.candidates?.[0];
      const texto = ((c?.content?.parts ?? []) as { text?: string; thought?: boolean }[]).map((p) => (p.thought ? "" : p.text ?? "")).join("");
      yield { texto, uso: j.usageMetadata ?? null, fim: c?.finishReason ?? null };
    }
  }
}
