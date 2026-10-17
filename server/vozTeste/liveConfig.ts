/**
 * Voice Tutor — Fase 2 (protótipo). Configuração do Gemini Live (Vertex) usada pela bancada e pelo proxy da prévia.
 * "padrao": detector de fala do Google sem ajuste. "rapido": fim de fala mais sensível e silêncio curto (tenta baixar a latência
 * sem cortar a hesitação do aluno; a bancada mede as duas).
 */
export type ConfigVad = "padrao" | "rapido";

export const MODELO_LIVE = "gemini-3.8-live";
/** Vozes da prévia; Zubenelgenubi é a do Stazi e Kore a da Stazia (manifest do app, personagens.js). */
export const VOZES_LIVE = ["Kore", "Aoede", "Leda", "Zephyr", "Charon", "Puck", "Zubenelgenubi"] as const;
export type VozLive = (typeof VOZES_LIVE)[number];
export const vozValida = (v: unknown): VozLive => (VOZES_LIVE.includes(v as VozLive) ? (v as VozLive) : "Kore");

export function configVad(cfg: ConfigVad): Record<string, unknown> {
  if (cfg !== "rapido") return {};
  return {
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
        endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
        prefixPaddingMs: 100,
        silenceDurationMs: 400,
      },
    },
  };
}

/** Preço oficial do Gemini 3.8 Live (US$ por 1 milhão de tokens; Gemini API e Vertex, consultado em 15/10/2026). */
export const PRECO_LIVE = { textoEntrada: 0.75, audioEntrada: 3.0, textoSaida: 4.5, audioSaida: 12.0 };

export interface UsoLive { textoEntrada: number; audioEntrada: number; textoSaida: number; audioSaida: number; total: number }

/** Lê um usageMetadata do Live (por modalidade). */
export function usoDe(u: Record<string, unknown> | null | undefined): UsoLive {
  const out: UsoLive = { textoEntrada: 0, audioEntrada: 0, textoSaida: 0, audioSaida: 0, total: Number(u?.totalTokenCount ?? 0) };
  type D = { modality?: string; tokenCount?: number };
  for (const d of (u?.promptTokensDetails as D[] | undefined) ?? []) {
    if (d.modality === "AUDIO") out.audioEntrada += d.tokenCount ?? 0; else out.textoEntrada += d.tokenCount ?? 0;
  }
  for (const d of [...((u?.responseTokensDetails as D[] | undefined) ?? []), ...((u?.candidatesTokensDetails as D[] | undefined) ?? [])]) {
    if (d.modality === "AUDIO") out.audioSaida += d.tokenCount ?? 0; else out.textoSaida += d.tokenCount ?? 0;
  }
  return out;
}

export function somarUso(a: UsoLive, b: UsoLive): UsoLive {
  return { textoEntrada: a.textoEntrada + b.textoEntrada, audioEntrada: a.audioEntrada + b.audioEntrada, textoSaida: a.textoSaida + b.textoSaida, audioSaida: a.audioSaida + b.audioSaida, total: a.total + b.total };
}

export function custoLiveUsd(u: UsoLive): number {
  const p = PRECO_LIVE;
  return (u.textoEntrada * p.textoEntrada + u.audioEntrada * p.audioEntrada + u.textoSaida * p.textoSaida + u.audioSaida * p.audioSaida) / 1e6;
}
