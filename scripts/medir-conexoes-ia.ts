/**
 * Mede o tempo de chamadas baratas às IAs e conta quantas conexões novas (aperto de mão TCP + TLS) cada uma abriu.
 * Custo: zero (contar tokens na Anthropic e no Gemini e consultar o Supabase/OpenAI não gera texto nem é cobrado).
 * Nunca imprime chave. Lê as chaves do .env da pasta indicada (padrão: a pasta atual).
 *
 *   npx tsx scripts/medir-conexoes-ia.ts            padrão do Node (antes)
 *   npx tsx scripts/medir-conexoes-ia.ts --ajuste   com server/ai/conexoes.ts ligado (depois)
 *   ENV_DIR=/caminho/da/pasta  PAUSA_S=6  CHAMADAS=5
 *
 * Rodada 1: 5 chamadas seguidas a cada serviço. Rodada 2: 5 chamadas com pausa de PAUSA_S segundos entre elas (o aluno
 * pensando), que é onde o padrão do Node (fecha a conexão parada há 4 s) perde a conexão.
 */
import fs from "node:fs";
import path from "node:path";
import diagnostics from "node:diagnostics_channel";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { manterConexoesIaAbertas } from "../server/ai/conexoes";

const dir = process.env.ENV_DIR || process.cwd();
for (const f of [".env", ".env.local"]) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  for (const linha of fs.readFileSync(p, "utf8").split("\n")) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const ajuste = process.argv.includes("--ajuste");
if (ajuste && !manterConexoesIaAbertas()) throw new Error("o ajuste não ligou");
const pausaMs = (Number(process.env.PAUSA_S) || 6) * 1000;

let conexoes = 0;
let maoMs = 0; // tempo gasto só abrindo conexão (TCP + TLS)
let inicio: number | null = null; // as chamadas são uma de cada vez, então basta a última
diagnostics.channel("undici:client:beforeConnect").subscribe(() => (inicio = performance.now()));
diagnostics.channel("undici:client:connected").subscribe(() => {
  conexoes++;
  if (inicio != null) maoMs += performance.now() - inicio;
  inicio = null;
});

const env = process.env;
const servicos: { nome: string; chamar: () => Promise<unknown> }[] = [];
if (env.ANTHROPIC_API_KEY) {
  // cliente novo a cada chamada, como o Tutor faz (server/contentHub/ai/provider.ts)
  servicos.push({ nome: "Anthropic (contar tokens)", chamar: () => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 }).messages.countTokens({ model: "claude-sonnet-5-5", messages: [{ role: "user", content: "ok" }] }) });
}
if (env.VERTEX_API_KEY) {
  servicos.push({ nome: "Gemini no Vertex (contar tokens)", chamar: () => new GoogleGenAI({ vertexai: true, apiKey: env.VERTEX_API_KEY }).models.countTokens({ model: "gemini-3.8-flash", contents: "ok" }) });
}
const supa = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if (supa && env.VITE_SUPABASE_ANON_KEY) {
  servicos.push({
    nome: "Supabase (saúde do login)",
    chamar: async () => {
      const r = await fetch(`${supa}/auth/v1/health`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY! } });
      await r.arrayBuffer();
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
    },
  });
}
if (env.OPENAI_API_KEY) {
  servicos.push({
    nome: "OpenAI (dados de um modelo)",
    chamar: async () => {
      const r = await fetch("https://api.openai.com/v1/models/gpt-4o-mini", { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } });
      await r.arrayBuffer();
      if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    },
  });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function medir(s: (typeof servicos)[number]) {
  const antes = conexoes;
  const maoAntes = maoMs;
  const t = performance.now();
  try {
    await s.chamar();
  } catch (e) {
    return { ms: -1, novas: conexoes - antes, erro: String((e as Error)?.message ?? e).slice(0, 80).replace(/key=[^&\s]+/g, "key=***") };
  }
  return { ms: Math.round(performance.now() - t), novas: conexoes - antes, mao: Math.round(maoMs - maoAntes) };
}

const tabela: Record<string, Record<string, string[]>> = {};
for (const [rodada, pausa] of [["seguidas", 0], [`pausa ${pausaMs / 1000}s`, pausaMs]] as const) {
  if (pausa) await espera(pausa);
  for (let i = 0; i < (Number(process.env.CHAMADAS) || 5); i++) {
    if (i > 0 && pausa) await espera(pausa);
    for (const s of servicos) {
      const r = await medir(s);
      ((tabela[s.nome] ??= {})[rodada] ??= []).push(r.ms < 0 ? `ERRO(${r.erro})` : `${r.ms}ms${r.novas ? `*(${r.mao})` : ""}`);
    }
  }
}
console.log(`\nModo: ${ajuste ? "COM ajuste (conexão aberta 60 s)" : "padrão do Node"}   (* = abriu conexão nova; entre parênteses, ms gastos só no aperto de mão)`);
for (const [nome, rodadas] of Object.entries(tabela)) {
  console.log(`\n${nome}`);
  for (const [rodada, vals] of Object.entries(rodadas)) console.log(`  ${rodada.padEnd(10)} ${vals.join("  ")}`);
}
process.exit(0);
