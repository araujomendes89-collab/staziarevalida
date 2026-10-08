/** ElevenLabs oficial: transporte TTS, sem ferramentas, histórico, prompt médico ou geração de resposta. */
import type { SpeechAudio, SpeechProvider, VoiceProfile } from "./speech";
import { elevenLabsVoiceSettings, type SpeechDirection } from "./speechDirector";
import { OFFICIAL_VOICES, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { elevenLabsConfiguration, elevenLabsReadiness, officialVoiceForPersonality, voiceFingerprint } from "./officialVoices";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Tags escolhidas pelo Stazia, nunca interpretadas de prompts ou histórico pelo provedor. */
export function officialSpeechDirection(id: OfficialVoice, direction: SpeechDirection = {}, model = "eleven_v3") {
  const intensity = Number.isFinite(direction.intensity) ? clamp(Number(direction.intensity), 0, 1) : 0;
  const base = OFFICIAL_VOICES[id];
  const settings = elevenLabsVoiceSettings({ ...direction, intensity, speed: base.speed });
  settings.speed = clamp(settings.speed, 0.85, 1.12);
  let tag = "";
  if (model === "eleven_v3") {
    // v3 usa estabilidade discreta; não aceita os valores contínuos do diretor v2.
    settings.stability = 0.5;
    const emotion = direction.emotion;
    if (id === "durona" && intensity >= 0.4) {
      tag = emotion === "angry" ? "[angry]" : ["irritated", "impatient"].includes(emotion ?? "") ? "[frustrated]" : "";
    } else if (id === "tranquilo" && intensity >= 0.4 && ["irritated", "impatient", "disappointed"].includes(emotion ?? "")) {
      tag = "[sighs]";
    }
    if (!tag && ["pleased", "encouraged", "impressed"].includes(emotion ?? "")) tag = "[encouraging]";
    const { use_speaker_boost: _unused, ...v3Settings } = settings;
    return { tag, settings: v3Settings };
  }
  return { tag, settings };
}

export class OfficialElevenLabsSpeech implements SpeechProvider {
  readonly name = "elevenlabs";
  readonly isMock = false;
  readonly model: string;
  readonly cacheIdentity: string;
  readonly pricePerMinute: number;
  private config: ReturnType<typeof elevenLabsConfiguration>;
  constructor(private env: NodeJS.ProcessEnv = process.env, private fetchImpl: typeof fetch = fetch, private preview = false) {
    this.env = { ...env };
    this.config = elevenLabsConfiguration(env);
    this.model = this.config.model;
    this.cacheIdentity = Object.keys(OFFICIAL_VOICES).map((id) => voiceFingerprint(id as OfficialVoice, env)).join(":");
    const price = Number(env.ELEVENLABS_PRICE_PER_MIN || env.TUTOR_VOICE_PRICE_PER_MIN);
    // Zero significa não configurado, não gratuidade. Não inventar tarifa por minuto de plano por caracteres.
    this.pricePerMinute = Number.isFinite(price) && price > 0 ? price : 0;
  }

  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    const id = officialVoiceForPersonality(voice.personality);
    if (!id) throw new Error("Esta personalidade ainda não tem voz oficial ElevenLabs associada.");
    const readiness = elevenLabsReadiness(this.env);
    const row = readiness.rows.find((item) => item.id === id)!;
    if (!row.ready || (!this.preview && !readiness.releaseReady)) throw new Error(row.pending || readiness.pending || "Voz ainda não aprovada.");
    if (!text.trim() || text.length > 4000) throw new Error("Texto de voz vazio ou acima de 4.000 caracteres.");
    const { tag, settings } = officialSpeechDirection(id, voice.direction, this.model);
    // Colchetes vindos do texto não podem virar instruções de áudio do provedor. Preserva as palavras.
    const literal = text.replaceAll("[", "(").replaceAll("]", ")");
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.config.voices[id])}?output_format=${this.config.format}`, {
        method: "POST", redirect: "error",
        headers: { "Content-Type": "application/json", "xi-api-key": this.env.ELEVENLABS_API_KEY!.trim() },
        body: JSON.stringify({ text: tag ? `${tag} ${literal}` : literal, model_id: this.model,
          ...(this.model === "eleven_v3" ? { language_code: "pt" } : {}), voice_settings: settings }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error("ElevenLabs indisponível ou tempo de resposta excedido.");
    }
    // Não registrar corpo/headers do fornecedor: podem conter chave ou texto da resposta.
    if (!response.ok) throw new Error(`ElevenLabs respondeu HTTP ${response.status}. Confira chave, permissões e créditos no painel.`);
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("audio/")) throw new Error("ElevenLabs respondeu sem áudio válido.");
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > 8 * 1024 * 1024) throw new Error("Áudio ElevenLabs vazio ou acima do limite.");
    return { audio, mime: "audio/mpeg" };
  }
}
