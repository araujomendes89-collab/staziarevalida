/**
 * Gemini TTS falso para os testes da voz do professor (sem rede): devolve, como o Vertex, PCM 16 bits mono 24 kHz em base64 e
 * o uso em tokens. O som depende só do texto (um tom com silêncio nas pontas), então o mesmo texto dá sempre o mesmo MP3.
 */
import { geminiTtsCost } from "../../../server/tutor/geminiTts";

/** Ambiente da voz do professor (padrão: Gemini pelo Vertex). A chave é falsa e nunca pode aparecer em resposta nenhuma. */
export const GEMINI_VOZ_ENV = { VERTEX_API_KEY: "chave-vertex-falsa-de-teste-" + "x".repeat(30), TUTOR_VOICE_ALLOW_EXTERNAL: "1" };

export const segundosDe = (texto: string) => Math.min(1.5, 0.3 + texto.length * 0.004);
/** Uso em tokens que o Google informaria: texto de entrada ~4 caracteres por token; áudio de saída 25 tokens por segundo. */
export const usoDe = (texto: string) => {
  const textIn = Math.ceil(texto.length / 4);
  const audioOut = Math.round(segundosDe(texto) * 25);
  return { promptTokenCount: textIn, candidatesTokenCount: audioOut, totalTokenCount: textIn + audioOut,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: textIn }], candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: audioOut }] };
};
/** O custo que o servidor deve registrar para este texto (preço do Gemini TTS pelos tokens). */
export const custoDe = (texto: string) => geminiTtsCost("gemini-3.8-flash-tts", usoDe(texto))!;

export function pcmDe(texto: string, taxa = 24_000): Buffer {
  const n = Math.round(segundosDe(texto) * taxa);
  const borda = Math.round(0.1 * taxa);
  const f = 180 + (texto.length % 40) * 5;
  const b = Buffer.alloc(n * 2);
  for (let i = borda; i < n - borda; i++) b.writeInt16LE(Math.round(0.2 * 0x7fff * Math.sin((2 * Math.PI * f * i) / taxa)), i * 2);
  return b;
}

export const respostaGemini = (texto: string) => new Response(JSON.stringify({
  candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcmDe(texto).toString("base64") } }] } }],
  usageMetadata: usoDe(texto),
}), { headers: { "Content-Type": "application/json" } });

/** O texto e a voz que o servidor pediu ao Gemini. */
export const pedidoGemini = (init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  return { body, text: body.contents?.[0]?.parts?.[0]?.text as string, voice: body.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName as string };
};
