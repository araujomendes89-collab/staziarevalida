/**
 * Amostras de VOZ NEURAL para o Stazia Tutor (Gemini TTS): o mesmo texto dito por professores diferentes, para ouvir antes de decidir.
 * Gera arquivos .wav e uma página com os players em .data/tutor-voz/ (pasta fora do Git). Mede o tempo de espera e o custo.
 *
 *   npx tsx scripts/tutor/voice-samples.ts                    só mostra o que seria feito
 *   npx tsx scripts/tutor/voice-samples.ts --allow-external   gera as amostras (o texto é enviado ao Google; custa menos de 1 centavo de dólar)
 *
 * Endpoint e formato: https://ai.google.dev/gemini-api/docs/speech-generation (API "interactions").
 */
import dotenv from "dotenv";
dotenv.config({ quiet: true });
import fs from "fs";
import path from "path";

const MODEL = process.env.TUTOR_VOICE_MODEL || "gemini-3.8-flash-tts";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
// preço do modelo até 31/12/2026 (por milhão de tokens); a página oficial avisa que dobra em 01/01/2027
const PRICE = { input: 0.5, audio: 9 };
const AUDIO_TOKENS_PER_SECOND = 25;

const TEXT = "Olha, você chegou perto. O raciocínio começou bem, mas tem um detalhe no caso que muda tudo. Lê de novo o enunciado e me diz o que você vê.";

const SAMPLES = [
  { id: "amigavel", name: "Professor Amigável", voice: "Sulafat", style: "Warm, calm and encouraging teacher talking to a student sitting right next to them. Natural, unhurried, conversational Brazilian Portuguese." },
  { id: "rabugento", name: "Professor Rabugento", voice: "Algenib", style: "Grumpy, slightly impatient older professor. Dry, low and a bit gravelly, with theatrical exasperation, but he clearly cares. Natural conversational Brazilian Portuguese." },
  { id: "xingao", name: "Professor Xingão", voice: "Fenrir", style: "Loud, energetic, irreverent coach who is rooting for the student. Fast, punchy and a little amused. Natural conversational Brazilian Portuguese." },
];

if (!process.argv.includes("--allow-external")) {
  console.log(`Amostras de voz neural (${MODEL}): ${SAMPLES.length} professores dizendo o mesmo texto.`);
  console.log("O texto de teste seria enviado ao Google. Custo estimado: menos de 1 centavo de dólar.");
  console.log("Para gerar: npx tsx scripts/tutor/voice-samples.ts --allow-external");
  process.exit(0);
}
const key = (process.env.GEMINI_API_KEY ?? "").trim();
if (key.length < 30) {
  console.log("GEMINI_API_KEY ausente ou com formato inválido no .env.");
  process.exit(1);
}

/** Procura o áudio na resposta (o formato exato do campo pode variar entre versões da API). */
function findAudio(node: any): { data: string; mime: string } | null {
  if (!node || typeof node !== "object") return null;
  if (typeof node.data === "string" && node.data.length > 1000) return { data: node.data, mime: String(node.mime_type ?? node.mimeType ?? "audio/wav") };
  for (const v of Object.values(node)) {
    const hit = findAudio(v);
    if (hit) return hit;
  }
  return null;
}

/** Duração de um WAV PCM 16 bits mono 24 kHz (o padrão do serviço), em segundos. */
function wavSeconds(buf: Buffer): number {
  const riff = buf.subarray(0, 4).toString("latin1") === "RIFF";
  const rate = riff ? buf.readUInt32LE(24) : 24000;
  const bytesPerSecond = riff ? buf.readUInt32LE(28) : rate * 2;
  const dataBytes = riff ? buf.length - 44 : buf.length;
  return dataBytes / bytesPerSecond;
}

function wrapWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1"); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8, "latin1"); h.write("fmt ", 12, "latin1");
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1"); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const body = (voice: string, style: string, stream = false) => ({
  model: MODEL,
  input: [{ type: "user_input", content: [{ type: "text", text: TEXT, annotations: [{ type: "speech_metadata", style }] }] }],
  response_format: { type: "audio" },
  generation_config: { speech_config: [{ voice }] },
  ...(stream ? { stream: true } : {}),
});
const headers = { "Content-Type": "application/json", "x-goog-api-key": key };
const safe = (t: string) => t.replace(key, "[chave]").slice(0, 400);

const out = path.resolve(".data/tutor-voz");
fs.mkdirSync(out, { recursive: true });
const rows: { name: string; voice: string; file: string; seconds: number; ms: number }[] = [];
let totalSeconds = 0;
let shapeShown = false;

console.log(`Modelo: ${MODEL}\nTexto: "${TEXT}"\n`);
for (const s of SAMPLES) {
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body(s.voice, s.style)), signal: AbortSignal.timeout(120_000) });
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.log(`${s.name}: ERRO ${res.status} — ${safe(await res.text())}`);
    continue;
  }
  const json: any = await res.json();
  if (!shapeShown) {
    console.log(`campos da resposta: ${Object.keys(json).join(", ")}${json.usage ? ` | uso: ${JSON.stringify(json.usage)}` : ""}`);
    shapeShown = true;
  }
  const audio = findAudio(json);
  if (!audio) {
    console.log(`${s.name}: resposta sem áudio — ${safe(JSON.stringify(json))}`);
    continue;
  }
  let buf = Buffer.from(audio.data, "base64");
  if (buf.subarray(0, 4).toString("latin1") !== "RIFF") buf = wrapWav(buf);
  const file = `${s.id}.wav`;
  fs.writeFileSync(path.join(out, file), buf);
  const seconds = wavSeconds(buf);
  totalSeconds += seconds;
  rows.push({ name: s.name, voice: s.voice, file, seconds, ms });
  console.log(`${s.name} (voz ${s.voice}): ${seconds.toFixed(1)} s de áudio · gerado em ${(ms / 1000).toFixed(1)} s · ${(buf.length / 1024).toFixed(0)} KB`);
}

// tempo até o PRIMEIRO pedaço de áudio com transmissão em fluxo (é o que o aluno sente como espera)
if (rows.length) {
  const s = SAMPLES[1];
  const t0 = Date.now();
  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body(s.voice, s.style, true)), signal: AbortSignal.timeout(120_000) });
    if (!res.ok || !res.body) console.log(`\nfluxo: ERRO ${res.status} — ${safe(await res.text())}`);
    else {
      const reader = res.body.getReader();
      let first: number | null = null;
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (first === null && value?.length) first = Date.now() - t0;
        bytes += value?.length ?? 0;
      }
      console.log(`\nfluxo (${s.name}): primeiro pedaço em ${((first ?? 0) / 1000).toFixed(1)} s · tudo em ${((Date.now() - t0) / 1000).toFixed(1)} s · ${(bytes / 1024).toFixed(0)} KB recebidos`);
      totalSeconds += rows[1]?.seconds ?? 0;
    }
  } catch (error) {
    console.log(`\nfluxo: falhou (${safe((error as Error).message)})`);
  }
}

const audioTokens = Math.round(totalSeconds * AUDIO_TOKENS_PER_SECOND);
const cost = (audioTokens * PRICE.audio) / 1e6 + ((SAMPLES.length + 1) * 120 * PRICE.input) / 1e6;
console.log(`\nTotal: ${totalSeconds.toFixed(1)} s de áudio ≈ ${audioTokens} tokens de áudio ≈ US$ ${cost.toFixed(4)} (estimado pela duração, a ${AUDIO_TOKENS_PER_SECOND} tokens por segundo)`);

const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Stazia Tutor · amostras de voz</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1a1a}h1{font-size:22px}section{border:1px solid #ddd;border-radius:14px;padding:16px;margin:14px 0}audio{width:100%;margin-top:8px}small{color:#666}blockquote{margin:12px 0;padding:10px 14px;background:#f6f6f6;border-radius:10px}</style>
<h1>Stazia Tutor · amostras de voz neural</h1>
<p>Os três professores dizem o mesmo texto. Modelo: ${MODEL}.</p><blockquote>${TEXT}</blockquote>
${rows.map((r) => `<section><b>${r.name}</b> <small>· voz ${r.voice} · ${r.seconds.toFixed(1)} s de áudio · gerado em ${(r.ms / 1000).toFixed(1)} s</small><audio controls preload="auto" src="${r.file}"></audio></section>`).join("\n")}
<p><small>Gerado em ${new Date().toLocaleString("pt-BR")}. Arquivos nesta pasta, fora do Git.</small></p></html>`;
fs.writeFileSync(path.join(out, "index.html"), html);
console.log(`\nAmostras em: ${out}`);
