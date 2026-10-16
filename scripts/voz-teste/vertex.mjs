// Bancada de voz do Voice Tutor (Fase 2): utilitários do Vertex sem expor segredo.
// - chave de API (texto e Gemini TTS) lida de ~/.config/vertex-staziamed/vertex.env, nunca impressa;
// - Gemini Live só aceita a conta do Google: token do gcloud com o projeto certo (como em teste-live/live.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function lerEnv(arquivo) {
  const out = {};
  if (!fs.existsSync(arquivo)) return out;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export const VERTEX_ENV = path.join(os.homedir(), ".config/vertex-staziamed/vertex.env");
export function vertexEnv() {
  const e = { ...lerEnv(VERTEX_ENV), ...process.env };
  return {
    apiKey: e.VERTEX_API_KEY,
    apiBase: e.VERTEX_API_BASE || "https://aiplatform.googleapis.com/v1/publishers/google/models",
    projeto: e.GCLOUD_PROJECT_VERTEX || "staziamed-revalida-prod",
    regiaoLive: e.VOZ_LIVE_REGIAO || "us-central1",
  };
}

let tokenCache = { valor: "", ate: 0 };
/** Token do gcloud (conta do dono) para o Live. Fica 45 min em memória; nunca vai para o navegador nem para log. */
export function tokenGcloud() {
  if (tokenCache.valor && Date.now() < tokenCache.ate) return tokenCache.valor;
  const valor = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  tokenCache = { valor, ate: Date.now() + 45 * 60 * 1000 };
  return valor;
}

export function liveUrl(regiao) {
  return `wss://${regiao}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;
}

// ---------------------------------------------------------------- áudio
export function lerWav(f) {
  const b = fs.readFileSync(f);
  // procura o bloco "data" (os WAV do Gemini TTS têm cabeçalho de 44 bytes, mas não confiamos nisso)
  let p = 12, rate = b.readUInt32LE(24);
  while (p < b.length - 8) {
    const id = b.toString("ascii", p, p + 4), tam = b.readUInt32LE(p + 4);
    if (id === "fmt ") rate = b.readUInt32LE(p + 12);
    if (id === "data") return { rate, pcm: b.subarray(p + 8, p + 8 + tam) };
    p += 8 + tam;
  }
  return { rate, pcm: b.subarray(44) };
}
export function reamostrar(pcm, de, para) {
  if (de === para) return Buffer.from(pcm);
  const n = pcm.length / 2, m = Math.floor((n * para) / de), out = Buffer.alloc(m * 2);
  for (let i = 0; i < m; i++) {
    const x = (i * de) / para, j = Math.floor(x), t = x - j;
    const a = pcm.readInt16LE(Math.min(j, n - 1) * 2), c = pcm.readInt16LE(Math.min(j + 1, n - 1) * 2);
    out.writeInt16LE(Math.round(a + (c - a) * t), i * 2);
  }
  return out;
}
export function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---------------------------------------------------------------- Gemini TTS (chave de API)
/** Gera fala com o Gemini TTS. Devolve { pcm (24 kHz), usage, ms }. `estilo` vai como instrução antes do texto. */
export async function geminiTts({ modelo, voz, texto, estilo = "" }) {
  const { apiKey, apiBase } = vertexEnv();
  if (!apiKey) throw new Error("VERTEX_API_KEY ausente em ~/.config/vertex-staziamed/vertex.env");
  const t0 = Date.now();
  const r = await fetch(`${apiBase}/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: estilo ? `${estilo}\n\n${texto}` : texto }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`TTS ${modelo} ${r.status}: ${String(d?.error?.message ?? "").slice(0, 200)}`);
  const parts = d.candidates?.[0]?.content?.parts ?? [];
  const pcm = Buffer.concat(parts.filter((p) => p.inlineData?.data).map((p) => Buffer.from(p.inlineData.data, "base64")));
  return { pcm, usage: d.usageMetadata ?? null, ms: Date.now() - t0 };
}

/** Texto em fluxo (SSE) pelo Vertex com a chave: devolve um iterador de pedaços de texto e o uso no fim. */
export async function* geminiTextoStream({ modelo, sistema, contents, temperatura = 0.9, maxTokens = 400, signal }) {
  const { apiKey, apiBase } = vertexEnv();
  if (!apiKey) throw new Error("VERTEX_API_KEY ausente");
  const r = await fetch(`${apiBase}/${modelo}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
      contents,
      generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!r.ok || !r.body) throw new Error(`texto ${modelo} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const dec = new TextDecoder();
  let buf = "";
  for await (const pedaco of r.body) {
    buf += dec.decode(pedaco, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      const dado = ev.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!dado) continue;
      const j = JSON.parse(dado);
      const texto = (j.candidates?.[0]?.content?.parts ?? []).map((p) => (p.thought ? "" : p.text ?? "")).join("");
      yield { texto, usage: j.usageMetadata ?? null, fim: j.candidates?.[0]?.finishReason ?? null };
    }
  }
}
