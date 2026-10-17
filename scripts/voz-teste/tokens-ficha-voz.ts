// Tokens da ficha nas instruções da voz ao vivo (revisão de 17/10): ficha inteira (texto) × ficha da voz, contados pelo Vertex
// (countTokens do gemini-3.8-flash; chave lida de ~/.config/vertex-staziamed/vertex.env, nunca impressa). Sem custo de geração.
// Uso: npx tsx scripts/voz-teste/tokens-ficha-voz.ts
import { lerEnv, VERTEX_ENV } from "./vertex.mjs";
import { FICHAS, fichaTexto, fichaVoz, type FichaId } from "../../server/tutor/fichas";

const env = lerEnv(VERTEX_ENV) as Record<string, string>;
const key = process.env.VERTEX_API_KEY || env.VERTEX_API_KEY;
const base = process.env.VERTEX_API_BASE || env.VERTEX_API_BASE || "https://aiplatform.googleapis.com/v1/publishers/google/models";
async function tokens(t: string): Promise<number> {
  const r = await fetch(`${base}/gemini-3.8-flash:countTokens?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: t }] }] }) });
  const d = (await r.json()) as { totalTokens?: number };
  return Number(d.totalTokens ?? NaN);
}
const limites = { palavrao: "moderate" as const, gritos: true };
for (const id of Object.keys(FICHAS) as FichaId[]) {
  const [a, b] = await Promise.all([tokens(fichaTexto(FICHAS[id], limites)), tokens(fichaVoz(FICHAS[id], limites))]);
  console.log(JSON.stringify({ personalidade: id, ficha_inteira: a, ficha_voz: b, economia: a - b }));
}
