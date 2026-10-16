// Gera os WAV da bateria fixa com o Gemini TTS pelo Vertex (chave de API; custo de centavos). Não regrava o que já existe.
// Uso: node scripts/voz-teste/gerar-bateria.mjs
import fs from "node:fs";
import path from "node:path";
import { FALAS, INTERRUPCAO, ESTILO_ALUNO, PASTA } from "./bateria.mjs";
import { geminiTts, wav } from "./vertex.mjs";

const dir = path.join(PASTA, "bateria");
fs.mkdirSync(dir, { recursive: true });
const uso = [];
for (const f of [...FALAS, INTERRUPCAO]) {
  const arq = path.join(dir, `${f.id}.wav`);
  if (fs.existsSync(arq)) { console.log("já existe", f.id); continue; }
  const r = await geminiTts({ modelo: "gemini-3.8-flash-tts", voz: f.voz, texto: f.texto, estilo: "" });
  fs.writeFileSync(arq, wav(r.pcm, 24000));
  uso.push({ id: f.id, segundos: +(r.pcm.length / 48000).toFixed(2), usage: r.usage });
  console.log(f.id, (r.pcm.length / 48000).toFixed(2), "s");
}
fs.writeFileSync(path.join(dir, "uso-tts.json"), JSON.stringify(uso, null, 1));
