/**
 * Qual chave do Google o servidor usa para o Gemini (Central de IAs e busca por significado). Decisão do dono em 2026-10-09:
 * o Gemini passa pelo Vertex AI, que cobra na conta do projeto do Google Cloud (a chave do AI Studio é pré-paga e acabou).
 *
 *   VERTEX_API_KEY                         chave do Vertex AI: manda quando existe (site e processamento)
 *   GEMINI_API_KEY ou GOOGLE_GEMINI_API_KEY chave do AI Studio: vale só sem a do Vertex
 *
 * O áudio dos Podcasts e a voz do Tutor não passam por aqui (usam serviços que só existem no AI Studio ou outro provedor).
 */
export type GoogleAiMode = "vertex" | "studio";

export interface GoogleAiAccess {
  mode: GoogleAiMode;
  key: string;
}

export const GOOGLE_KEY_MISSING = "Chave do Google ausente no servidor: defina VERTEX_API_KEY (Vertex AI) ou GEMINI_API_KEY (AI Studio).";

/** Chave de verdade, não o texto de exemplo do .env ("MY_GEMINI_API_KEY", "your-key", vazio). */
export function realGoogleKey(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length >= 30 && !/\s/.test(v) && !/^(my_|your|changeme|xxx)/i.test(v) ? v : null;
}

export function googleAiAccess(env: NodeJS.ProcessEnv = process.env): GoogleAiAccess | null {
  const vertex = realGoogleKey(env.VERTEX_API_KEY);
  if (vertex) return { mode: "vertex", key: vertex };
  const studio = realGoogleKey(env.GEMINI_API_KEY) ?? realGoogleKey(env.GOOGLE_GEMINI_API_KEY);
  return studio ? { mode: "studio", key: studio } : null;
}

/** Opções da biblioteca do Google (@google/genai) para a chave escolhida. */
export function googleGenAiOptions(access: GoogleAiAccess): { apiKey: string; vertexai?: true } {
  return access.mode === "vertex" ? { vertexai: true, apiKey: access.key } : { apiKey: access.key };
}
