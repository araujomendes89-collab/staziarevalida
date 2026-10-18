/**
 * VOZ DO PROFESSOR pelo Gemini TTS (gemini-3.8-flash-tts), pelo Vertex AI (VERTEX_API_KEY; sem ela, a chave do AI Studio): a
 * mesma voz do personagem na voz ao vivo e nas frases de espera (officialVoices.ts → personagens.js). Só transporte: sem
 * ferramentas, histórico, prompt médico nem geração de resposta.
 *
 * O pedido leva SÓ o texto da fala. Medido em 17/10/2026 nas frases de espera: o gemini-3.8-flash-tts LÊ EM VOZ ALTA qualquer
 * instrução de tom que venha junto ("Fale num tom…: frase", "[tag] frase") e recusa systemInstruction. O jeito de cada
 * personalidade vem do próprio texto (palavras e pontuação) e, no Stazi, do afinador (+3 semitons).
 *
 * O áudio volta em PCM 16 bits mono 24 kHz e recebe aqui o acabamento das frases de espera (vozAcabamento.ts): afinação,
 * pontas aparadas, volume igual e MP3. O custo vem dos tokens que o próprio Google informa (usageMetadata).
 */
import type { SpeechAudio, SpeechProvider, VoiceProfile } from "./speech";
import { OFFICIAL_VOICES, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { googleAiAccess } from "../ai/googleKey";
import { GEMINI_TTS_MODEL, geminiVoiceOf, officialVoiceForPersonality, voiceFingerprint, voiceReadiness } from "./officialVoices";
import { acabarVoz, LUFS_ALVO } from "./vozAcabamento";

/** Preço do Gemini TTS (US$ por 1 milhão de tokens, ai.google.dev/gemini-api/docs/pricing de 15/10/2026): promocional até 31/12/2026. */
export function geminiTtsPrice(model: string, now = new Date()): { textIn: number; audioOut: number } | null {
  if (model !== "gemini-3.8-flash-tts") return null;
  return now.getTime() < Date.UTC(2027, 0, 1) ? { textIn: 0.5, audioOut: 9.0 } : { textIn: 1.0, audioOut: 18.0 };
}

interface Usage { promptTokenCount?: number; candidatesTokenCount?: number; promptTokensDetails?: { modality?: string; tokenCount?: number }[]; candidatesTokensDetails?: { modality?: string; tokenCount?: number }[] }
/** Custo de uma geração pelos tokens: texto de entrada e áudio de saída (sem detalhe por modalidade, a saída conta como áudio). */
export function geminiTtsCost(model: string, usage: Usage | null | undefined, now = new Date()): number | null {
  const price = geminiTtsPrice(model, now);
  if (!price || !usage) return null;
  const sum = (list: Usage["promptTokensDetails"], modality: string) => (list ?? []).filter((d) => d.modality === modality).reduce((s, d) => s + (d.tokenCount ?? 0), 0);
  const textIn = usage.promptTokensDetails ? sum(usage.promptTokensDetails, "TEXT") : usage.promptTokenCount ?? 0;
  const audioOut = usage.candidatesTokensDetails ? sum(usage.candidatesTokensDetails, "AUDIO") : usage.candidatesTokenCount ?? 0;
  if (!textIn && !audioOut) return null;
  return Math.round(((textIn * price.textIn + audioOut * price.audioOut) / 1e6) * 1e6) / 1e6;
}

const endpoint = (mode: "vertex" | "studio", model: string) => mode === "vertex"
  ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`
  : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * Voz do professor (Gemini): o transporte só exige a voz pronta (chave, consentimento). Quem decide se a voz já pode falar com
 * alunos (aprovação no painel, "só equipe", limites) é o servidor, antes de chamar.
 */
export class OfficialGeminiSpeech implements SpeechProvider {
  readonly name = "gemini";
  readonly isMock = false;
  readonly model = GEMINI_TTS_MODEL;
  readonly cacheIdentity: string;
  constructor(private env: NodeJS.ProcessEnv = process.env, private fetchImpl: typeof fetch = fetch) {
    // esta classe é sempre o Gemini: a prontidão e a versão são as dele
    this.env = { ...env, TUTOR_VOICE_ENGINE: "gemini" };
    this.cacheIdentity = Object.keys(OFFICIAL_VOICES).map((id) => voiceFingerprint(id as OfficialVoice, this.env)).join(":");
  }

  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    const id = officialVoiceForPersonality(voice.personality);
    if (!id) throw new Error("Esta personalidade ainda não tem voz oficial associada.");
    const readiness = voiceReadiness(this.env);
    const row = readiness.rows.find((item) => item.id === id)!;
    if (!row.ready) throw new Error([row.pending || readiness.pending || "Voz oficial não configurada.", row.detail || readiness.detail].filter(Boolean).join(" "));
    if (!text.trim() || text.length > 4000) throw new Error("Texto de voz vazio ou acima de 4.000 caracteres.");
    const access = googleAiAccess(this.env)!;
    const g = geminiVoiceOf(id);
    // Colchetes do texto não podem virar marcação de áudio do serviço (ex.: "[laughs]"): preserva as palavras.
    const literal = text.replaceAll("[", "(").replaceAll("]", ")");
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint(access.mode, this.model), {
        method: "POST", redirect: "error",
        // a chave vai no cabeçalho, nunca no endereço (endereços aparecem em registros)
        headers: { "Content-Type": "application/json", "x-goog-api-key": access.key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: literal }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: g.voice } } } },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error("Gemini TTS indisponível ou tempo de resposta excedido.");
    }
    // Não registrar corpo/headers do fornecedor: podem conter a chave ou o texto da resposta.
    if (!response.ok) throw new Error(`Gemini TTS respondeu HTTP ${response.status}. Confira a chave, as permissões e o crédito do projeto.`);
    const data = await response.json().catch(() => null) as { candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]; usageMetadata?: Usage } | null;
    const parts = (data?.candidates?.[0]?.content?.parts ?? []).filter((p) => p.inlineData?.data && (p.inlineData.mimeType ?? "").toLowerCase().startsWith("audio/"));
    const pcm = Buffer.concat(parts.map((p) => Buffer.from(p.inlineData!.data!, "base64")));
    if (!pcm.length) throw new Error(`Gemini TTS respondeu sem áudio válido${data?.candidates?.[0]?.finishReason ? ` (${String(data.candidates[0].finishReason).slice(0, 40)})` : ""}.`);
    if (pcm.length > 16 * 1024 * 1024) throw new Error("Áudio do Gemini TTS acima do limite.");
    const rate = Number(/rate=(\d+)/i.exec(parts[0].inlineData!.mimeType ?? "")?.[1]) || 24_000;
    const done = await acabarVoz(pcm, rate, { semitons: g.semitons, lufs: LUFS_ALVO[id] });
    if (!done.mp3.length || done.mp3.length > 8 * 1024 * 1024) throw new Error("Áudio do Gemini TTS vazio ou acima do limite.");
    return { audio: done.mp3, mime: "audio/mpeg", costUsd: geminiTtsCost(this.model, data?.usageMetadata) ?? undefined, seconds: Math.round(done.segundos * 100) / 100 };
  }
}
