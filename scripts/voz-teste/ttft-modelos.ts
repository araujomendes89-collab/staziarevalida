// Compara o tempo até a 1ª palavra (texto em fluxo pelo Vertex, chave de API) entre modelos, com o MESMO prompt da Durona.
// Uso: npx tsx scripts/voz-teste/ttft-modelos.ts <repetições> <modelo...>
import fs from "node:fs";
import path from "node:path";
import { instrucoesDurona } from "../../server/vozTeste/durona";
import { geminiEmFluxo } from "../../server/vozTeste/vertexTexto";
import { vertexEnv, tokenGcloud } from "./vertex.mjs";
import { PASTA } from "./bateria.mjs";
const [repStr = "3", ...modelos] = process.argv.slice(2);
const { apiKey, apiBase } = vertexEnv();
const sistema = instrucoesDurona({ nivel: "forte", canal: "texto" });
const curto = process.env.CURTO === "1";
const arq = path.join(PASTA, "custom-llm", "ttft-modelos.jsonl");
for (const modelo of modelos) for (let k = 0; k < Number(repStr); k++) {
  const t0 = performance.now(); let p1: number | null = null; let uso: unknown = null; let txt = "";
  try {
    const regiao = process.env.REGIAO; const regional = regiao ? { token: tokenGcloud(), projeto: vertexEnv().projeto, regiao } : undefined;
    for await (const p of geminiEmFluxo({ apiKey: apiKey!, apiBase, regional, modelo, pensamento: process.env.PENS, sistema: curto ? "Você é uma professora de medicina. Responda em uma frase." : sistema,
      contents: [{ role: "user", parts: [{ text: "Professora, na anafilaxia eu daria corticoide primeiro. Tá certo?" }] }] })) {
      if (p.texto && p1 == null) p1 = performance.now() - t0; txt += p.texto; if (p.uso) uso = p.uso;
    }
    const r = { modelo, pensamento: process.env.PENS ?? "0", regiao: regiao ?? "express", curto, primeira_palavra_ms: p1 && Math.round(p1), total_ms: Math.round(performance.now() - t0), uso, texto: txt.slice(0, 120) };
    fs.appendFileSync(arq, JSON.stringify(r) + "\n"); console.log(modelo, regiao ?? "express", "pens=" + (process.env.PENS ?? "0"), curto ? "(prompt curto)" : "", r.primeira_palavra_ms, "ms", r.total_ms, "ms");
  } catch (e) { console.log(modelo, "FALHA", String((e as Error).message).slice(0, 150)); }
}
