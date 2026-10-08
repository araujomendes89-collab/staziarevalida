/**
 * TRANSCRIÇÃO da fala do aluno na Nexus (POST /api/tutor/voice/transcribe): o áudio chega ao servidor (até 4 MB e 45 s), vai
 * ao serviço de transcrição e só o texto volta. O áudio fica só na memória desta requisição: nada grava nem registra o áudio
 * ou o texto (o texto segue como fala do aluno pelo turno normal). O uso entra no registro como tutor_stt, em segundos.
 *
 *   TUTOR_STT_ALLOW_EXTERNAL=1   trava própria: autoriza enviar o áudio do aluno ao serviço de transcrição
 *   TUTOR_STT_MODEL              opcional (padrão STT_DEFAULT_MODEL); usa OPENAI_API_KEY
 *
 * Conferido em 2026-10-08 em developers.openai.com/api/docs/guides/speech-to-text e /api/docs/pricing: gpt-4o-mini-transcribe
 * aceita `language` e `prompt`, recebe mp4 e webm (até 25 MB) e custa US$ 0,003 por minuto (o preço vai no painel,
 * stt_price_per_min_usd). O gpt-transcribe aparece como recomendado (US$ 0,0045/min), mas troca `language` por `languages`
 * e a referência ainda não mostra como mandar esse campo: fica de fora do padrão até ser conferido.
 */
import { TutorError, type TutorDeps } from "./engine";
import { realKey } from "./speech";
import { tutorSettings } from "./settings";
import { voiceCall } from "./realtime";

export interface SttConfig {
  ready: boolean;
  model: string;
  key: string | null;
  pending: string | null;
}

export const STT_DEFAULT_MODEL = "gpt-4o-mini-transcribe";
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 45;
export const STT_FAILED = "Não entendi, pode repetir ou digitar?";
/** Teto por aluno: uma transcrição por vez e até 20 por minuto (cada fala leva mais que 3 s entre gravar, responder e ouvir). */
export const STT_PER_MINUTE = 20;
export const STT_BUSY = "Espere um pouco antes de falar de novo.";
/**
 * O serviço cobra pelo tempo de verdade do áudio, e a duração vem do aparelho: o tamanho tem de caber nela. 64 kB por segundo
 * (512 kbps) fica muito acima da gravação de voz dos navegadores; mais que isso é áudio longo espremido numa duração curta.
 */
export const STT_MAX_BYTES_PER_SECOND = 64_000;
export const audioFitsSeconds = (bytes: number, seconds: number) => bytes <= 32_768 + seconds * STT_MAX_BYTES_PER_SECOND;

/** Formatos que o serviço recebe: o do iPhone (mp4) e o do Chrome/Android (webm), e os comuns. */
const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm", "audio/mp4": "mp4", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3", "audio/mp3": "mp3",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
};
export const audioExtension = (mime: string) => EXTENSIONS[mime.split(";")[0].trim().toLowerCase()] ?? null;

export function sttConfig(env: NodeJS.ProcessEnv = process.env): SttConfig {
  const model = (env.TUTOR_STT_MODEL ?? "").trim() || STT_DEFAULT_MODEL;
  if (env.TUTOR_STT_ALLOW_EXTERNAL !== "1") return { ready: false, model, key: null, pending: "Envio do áudio à transcrição não autorizado: defina TUTOR_STT_ALLOW_EXTERNAL=1 no servidor." };
  const key = realKey(env.OPENAI_API_KEY);
  if (!key) return { ready: false, model, key: null, pending: "OPENAI_API_KEY ausente ou com o texto de exemplo no .env do servidor." };
  return { ready: true, model, key, pending: null };
}

/** Dica para a transcrição: o contexto, os comandos da Nexus e os termos das pronúncias do painel. */
export function sttPrompt(terms: string[]): string {
  return "Conversa de estudo de medicina para o Revalida, em português do Brasil. Comandos: alternativa A, alternativa B, alternativa C, alternativa D, confirmo, cancela, dica, próxima."
    + (terms.length ? ` Termos: ${terms.slice(0, 40).join(", ")}.` : "");
}

const failed = () => Object.assign(new TutorError(STT_FAILED, 502), { code: "stt_failed" });

/** Transcreve um áudio já conferido pela rota (tamanho, duração, conversa de voz e aceite). Nunca registra áudio nem texto. */
export async function transcribe(deps: TutorDeps, userId: string, voiceCallId: string, audio: Buffer, mime: string, seconds: number): Promise<{ text: string }> {
  const cfg = deps.stt ?? sttConfig();
  if (!cfg.ready || !cfg.key) throw new TutorError("A transcrição não está ligada no servidor.", 503);
  const ext = audioExtension(mime);
  if (!ext) throw new TutorError("Formato de áudio não aceito.", 415);
  const settings = await tutorSettings(deps);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `fala.${ext}`);
  form.append("model", cfg.model);
  form.append("language", "pt");
  form.append("prompt", sttPrompt((settings.pronunciations ?? []).map((p) => p.term).filter(Boolean)));
  form.append("response_format", "json");
  let text = "";
  try {
    const r = await (deps.fetch ?? fetch)("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", redirect: "error", headers: { Authorization: `Bearer ${cfg.key}` }, body: form, signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const out = (await r.json()) as { text?: unknown };
    text = typeof out?.text === "string" ? out.text.trim() : "";
  } catch (error) {
    // só o motivo curto: nunca o corpo da resposta, o áudio ou o texto
    deps.log?.(`[tutor] transcrição falhou: ${(error as Error).message.slice(0, 60)}`);
    throw failed();
  }
  if (!text) throw failed();
  const sessionId = await voiceCall(deps, userId, voiceCallId).then((v) => v.session_id).catch(() => null);
  await deps.db.service("ch_worker_tutor_ledger", {
    p_user: userId, p_session_id: sessionId,
    p_entry: { feature: "tutor_stt", provider: "openai", model: cfg.model, duration_seconds: Math.ceil(seconds),
               estimated_cost_usd: Math.round((seconds / 60) * settings.stt_price_per_min_usd * 1e6) / 1e6, meta: { voice_call: voiceCallId } },
  }).catch((error) => deps.log?.(`[tutor] registro da transcrição falhou: ${(error as Error).message.slice(0, 80)}`));
  return { text };
}
