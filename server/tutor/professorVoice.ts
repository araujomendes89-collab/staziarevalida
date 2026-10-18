/** Qual serviço gera a voz do professor: o Gemini (padrão, a voz do personagem) ou a ElevenLabs (reserva, TUTOR_VOICE_ENGINE=elevenlabs). */
import type { SpeechProvider } from "./speech";
import type { TutorDeps } from "./engine";
import { voiceEngine } from "./officialVoices";
import { OfficialGeminiSpeech } from "./geminiTts";
import { OfficialElevenLabsSpeech } from "./elevenlabsTts";

/** A voz do professor no servidor: a dos testes (deps.speech; null = desligada) ou a oficial, com o ambiente do servidor. */
export function professorSynth(deps: Pick<TutorDeps, "speech" | "elevenEnv" | "fetch">): SpeechProvider | null {
  if (deps.speech !== undefined) return deps.speech;
  const env = deps.elevenEnv ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  return voiceEngine(env) === "elevenlabs" ? new OfficialElevenLabsSpeech(env, fetchImpl) : new OfficialGeminiSpeech(env, fetchImpl);
}
