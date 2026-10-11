/** ElevenLabs oficial: transporte TTS, sem ferramentas, histórico, prompt médico ou geração de resposta. */
import type { SpeechAudio, SpeechProvider, VoiceProfile } from "./speech";
import type { TutorDeps } from "./engine";
import { elevenLabsVoiceSettings, SPEED_RANGE, TAG_RULES, type SpeechDirection } from "./speechDirector";
import { OFFICIAL_VOICES, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { elevenLabsConfiguration, elevenLabsReadiness, officialVoiceForPersonality, voiceFingerprint } from "./officialVoices";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Tags escolhidas pelo Stazia, nunca interpretadas de prompts ou histórico pelo provedor. */
export function officialSpeechDirection(id: OfficialVoice, direction: SpeechDirection = {}, model = "eleven_v3") {
  const intensity = Number.isFinite(direction.intensity) ? clamp(Number(direction.intensity), 0, 1) : 0;
  const base = OFFICIAL_VOICES[id];
  const settings = elevenLabsVoiceSettings({ ...direction, intensity, speed: base.speed });
  settings.speed = clamp(settings.speed, SPEED_RANGE[0], SPEED_RANGE[1]);
  let tag = "";
  if (model === "eleven_v3") {
    // v3 usa estabilidade discreta; não aceita os valores contínuos do diretor v2.
    settings.stability = 0.5;
    const emotion = direction.emotion ?? "";
    const own: Record<string, string> = id === "durona" ? TAG_RULES.durona : id === "tranquilo" ? TAG_RULES.tranquilo : {};
    if (intensity >= TAG_RULES.minIntensity && Object.hasOwn(own, emotion)) tag = own[emotion];
    if (!tag && Object.hasOwn(TAG_RULES.good, emotion)) tag = TAG_RULES.good[emotion as keyof typeof TAG_RULES.good];
    const { use_speaker_boost: _unused, ...v3Settings } = settings;
    return { tag, settings: v3Settings };
  }
  return { tag, settings };
}

/**
 * Voz do professor: o transporte só exige a voz configurada (chave, consentimento, voice_id próprio, modelo e formato).
 * Quem decide se a voz já pode falar com alunos (aprovação no painel, "só equipe", limites) é o servidor, antes de chamar.
 */
export class OfficialElevenLabsSpeech implements SpeechProvider {
  readonly name = "elevenlabs";
  readonly isMock = false;
  readonly model: string;
  readonly cacheIdentity: string;
  private config: ReturnType<typeof elevenLabsConfiguration>;
  constructor(private env: NodeJS.ProcessEnv = process.env, private fetchImpl: typeof fetch = fetch) {
    this.env = { ...env };
    this.config = elevenLabsConfiguration(env);
    this.model = this.config.model;
    this.cacheIdentity = Object.keys(OFFICIAL_VOICES).map((id) => voiceFingerprint(id as OfficialVoice, env)).join(":");
  }

  async synthesize(text: string, voice: VoiceProfile): Promise<SpeechAudio> {
    const id = officialVoiceForPersonality(voice.personality);
    if (!id) throw new Error("Esta personalidade ainda não tem voz oficial ElevenLabs associada.");
    const readiness = elevenLabsReadiness(this.env);
    const row = readiness.rows.find((item) => item.id === id)!;
    // o aviso é em português simples; o detalhe técnico (nome da variável) segue no erro, que só vai para o registro do servidor
    if (!row.ready) throw new Error([row.pending || readiness.pending || "Voz oficial não configurada.", row.detail || readiness.detail].filter(Boolean).join(" "));
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

/** A voz do professor no servidor: a dos testes (deps.speech; null = desligada) ou a oficial, com o ambiente do servidor. */
export function elevenSynth(deps: Pick<TutorDeps, "speech" | "elevenEnv" | "fetch">): SpeechProvider | null {
  if (deps.speech !== undefined) return deps.speech;
  return new OfficialElevenLabsSpeech(deps.elevenEnv ?? process.env, deps.fetch ?? fetch);
}
