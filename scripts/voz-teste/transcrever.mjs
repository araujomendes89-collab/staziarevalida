// Transcreve WAVs curtos com o Gemini (Vertex, chave lida por vertex.mjs, nunca impressa): confere se a gravação diz só a fala.
// Uso: node scripts/voz-teste/transcrever.mjs <wav...>
import fs from "node:fs";
import { vertexEnv } from "./vertex.mjs";
const { apiKey, apiBase } = vertexEnv();
const modelo = process.env.MODELO_TRANSCRICAO || "gemini-3.8-flash";
let tokens = 0;
for (const f of process.argv.slice(2)) {
  const r = await fetch(`${apiBase}/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: f.endsWith(".mp3") ? "audio/mpeg" : "audio/wav", data: fs.readFileSync(f).toString("base64") } }, { text: "Transcreva TUDO o que se ouve neste áudio, do começo ao fim, em português, com o tempo (segundos) do começo de cada trecho; inclua sons sem palavras entre colchetes (risada, respiração, suspiro, murmúrio) e pausas longas." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.log(f.split("/").pop(), "ERRO", r.status, String(d?.error?.message ?? "").slice(0, 160)); continue; }
  tokens += d.usageMetadata?.totalTokenCount ?? 0;
  console.log(JSON.stringify({ arquivo: f.split("/").pop(), texto: (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim(), uso: d.usageMetadata?.promptTokensDetails }));
  await new Promise((s) => setTimeout(s, 1500));
}
