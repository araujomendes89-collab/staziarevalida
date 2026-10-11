// @vitest-environment node
/**
 * Polimento da Central de IAs, ponto 3: busca por significado pelo Vertex AI (um texto por pedido, até 4 ao mesmo tempo). Uma
 * falha no meio do lote derrubava o lote inteiro: os vetores que já tinham voltado (e que o Google já cobrou) eram jogados fora,
 * nada era gravado e o custo não ia para o registro (ch_ai_runs). Na rodada seguinte, os mesmos trechos eram pagos de novo.
 * Agora os vetores que deram certo ficam gravados, o custo deles vai para o registro e o erro continua aparecendo.
 * Sem rede: cliente do Google simulado e banco falso.
 */
import { describe, expect, it } from "vitest";
import { createEmbedder, EMBEDDING_DIMS, embeddingsConfig, EmbeddingsError, embedPendingPassages, type EmbedClient } from "../../server/contentHub/embeddings";

const VERTEX = embeddingsConfig({ CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1", CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "P" } as NodeJS.ProcessEnv);
const vec = (seed: number) => Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i === 0 ? seed + 1 : 0.5));
const numberOf = (p: any) => Number(/Trecho (\d+)/.exec(p.contents[0].parts[0].text)?.[1] ?? -1);

/** Vertex simulado: cada pedido leva 5 ms; o trecho `failing` é recusado na hora (403, erro de configuração: sem nova tentativa). */
function vertexClient(failing: number) {
  const ok: number[] = [];
  const sent: number[] = [];
  const client: EmbedClient = {
    models: {
      embedContent: async (p: any) => {
        const n = numberOf(p);
        sent.push(n);
        if (n === failing) throw Object.assign(new Error("PERMISSION_DENIED"), { status: 403 });
        await new Promise((r) => setTimeout(r, 5));
        ok.push(n);
        return { embeddings: [{ values: vec(n) }] };
      },
    },
  };
  return { client, ok, sent };
}
/** Tokens estimados de um texto, como o módulo conta (4 caracteres por token). */
const tokensOf = (n: number) => Math.ceil(`title: none | text: Trecho ${n}`.length / 4);

describe("Vertex AI: falha no meio do lote não perde os vetores que já vieram", () => {
  it("o erro traz os vetores que deram certo (os pedidos em andamento terminam), com os tokens e o custo só deles", async () => {
    const { client, ok, sent } = vertexClient(5);
    const items = Array.from({ length: 10 }, (_, i) => ({ text: `Trecho ${i}` }));
    const err: any = await createEmbedder(VERTEX, client)!.embedDocuments(items).catch((e) => e);
    expect(err).toBeInstanceOf(EmbeddingsError);
    expect(err.status).toBe(403);
    // depois da falha nenhum trecho novo sai
    expect(sent.length).toBeLessThan(10);
    expect(ok.length).toBeGreaterThan(0);
    const partial = err.partial;
    expect(partial.vectors).toHaveLength(10);
    // um vetor (normalizado, na posição certa) para cada pedido que deu certo, e nada para os outros
    partial.vectors.forEach((v: number[] | null, i: number) => {
      if (ok.includes(i)) {
        expect(v).toHaveLength(EMBEDDING_DIMS);
        expect(Math.hypot(...v!)).toBeCloseTo(1, 6);
        expect(v![0] / v![1]).toBeCloseTo(2 * (i + 1), 6); // o vetor deste trecho (o primeiro componente marca o número)
      } else expect(v).toBeNull();
    });
    const tokens = ok.reduce((s, n) => s + tokensOf(n), 0);
    expect(partial.tokens).toBe(tokens);
    expect(partial.costUsd).toBeCloseTo((tokens * 0.2) / 1e6, 9);
  });

  it("o processamento grava os vetores que vieram, registra o custo deles e continua avisando o erro", async () => {
    const { client, ok } = vertexClient(3);
    const batch = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: null, section: null, text: `Trecho ${i}` }));
    const saved: any[] = [];
    const runs: any[] = [];
    const db = {
      mode: "dev",
      async service(name: string, args: any) {
        if (name === "ch_worker_passages_to_embed") return batch;
        if (name === "ch_worker_save_embeddings") {
          saved.push(...args.p_items);
          return args.p_items.length;
        }
        if (name === "ch_worker_log_ai_run") {
          runs.push(args.p_run);
          return "id";
        }
        throw new Error(`função inesperada: ${name}`);
      },
    } as any;
    const logs: string[] = [];
    const err: any = await embedPendingPassages(db, createEmbedder(VERTEX, client)!, { log: (m) => logs.push(m) }).catch((e) => e);
    expect(err).toBeInstanceOf(EmbeddingsError);
    expect(ok.length).toBeGreaterThan(0);
    // os trechos que tiveram vetor ficam gravados, cada um com o seu vetor
    expect(saved.map((s) => s.passage_id).sort()).toEqual(ok.map((n) => `p${n}`).sort());
    for (const s of saved) expect(s.embedding[0] / s.embedding[1]).toBeCloseTo(2 * (Number(s.passage_id.slice(1)) + 1), 6);
    // o custo pago vai para o registro, com a falha
    const tokens = ok.reduce((s, n) => s + tokensOf(n), 0);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ step: "embeddings", provider: "gemini", model: "gemini-embedding-2", status: "failed", input_tokens: tokens, output_tokens: 0 });
    expect(runs[0].cost_usd).toBeCloseTo((tokens * 0.2) / 1e6, 9);
    expect(runs[0].output).toMatchObject({ passages: 8, embedded: ok.length, saved: ok.length });
    expect(runs[0].error).toMatch(/403/);
    expect(logs.join(" ")).toMatch(new RegExp(`${ok.length} de 8 trechos`));
  });

  it("falha antes de qualquer vetor: nada a gravar nem a registrar (como antes)", async () => {
    const { client } = vertexClient(0);
    const one = [{ id: "p0", title: null, section: null, text: "Trecho 0" }];
    const calls: string[] = [];
    const db = {
      mode: "dev",
      async service(name: string) {
        calls.push(name);
        return name === "ch_worker_passages_to_embed" ? one : 0;
      },
    } as any;
    await expect(embedPendingPassages(db, createEmbedder(VERTEX, client)!)).rejects.toBeInstanceOf(EmbeddingsError);
    expect(calls).toEqual(["ch_worker_passages_to_embed"]);
  });
});
