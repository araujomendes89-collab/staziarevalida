/**
 * Qual chave do Google o servidor usa para o Gemini (Central de IAs e busca por significado). Decisão do dono em 2026-10-09:
 * o Gemini passa pelo Vertex AI, que cobra na conta do projeto do Google Cloud (a chave do AI Studio é pré-paga e acabou).
 *
 *   VERTEX_API_KEY                         chave do Vertex AI: manda quando existe (site e processamento)
 *   GEMINI_API_KEY ou GOOGLE_GEMINI_API_KEY chave do AI Studio: vale só sem a do Vertex
 *
 * O áudio dos Podcasts e a voz do Tutor não passam por aqui (usam serviços que só existem no AI Studio ou outro provedor).
 *
 * A busca por significado (vetores) tem caminho próprio (googleEmbeddingsAccess): a VERTEX_API_KEY é do modo expresso do Vertex
 * AI, que não tem nenhum modelo de busca por significado (o Google respondia 404, falha vista em produção em 2026-10-09).
 *
 *   CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT   projeto do Google Cloud: Vertex AI completo pela conta de serviço (sem chave)
 *   CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION  global (padrão), us ou eu
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

/** Caminho do Google para a busca por significado: Vertex AI completo (projeto, conta de serviço) ou a chave do AI Studio. */
export type GoogleEmbeddingsAccess = { mode: "vertex_project"; project: string; location: string } | { mode: "studio"; key: string };

const EMBEDDINGS_LOCATIONS = ["global", "us", "eu"];

/**
 * Qual caminho a busca por significado usa: o projeto do Vertex AI completo (CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT) manda; senão a
 * chave do AI Studio. A VERTEX_API_KEY não serve (modo expresso, sem modelo de busca por significado): sozinha, devolve null.
 */
export function googleEmbeddingsAccess(env: NodeJS.ProcessEnv = process.env): GoogleEmbeddingsAccess | null {
  const project = (env.CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT ?? "").trim();
  if (/^[\w.:-]{1,100}$/.test(project)) {
    const raw = (env.CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION ?? "").trim().toLowerCase();
    return { mode: "vertex_project", project, location: EMBEDDINGS_LOCATIONS.includes(raw) ? raw : "global" };
  }
  const studio = realGoogleKey(env.GEMINI_API_KEY) ?? realGoogleKey(env.GOOGLE_GEMINI_API_KEY);
  return studio ? { mode: "studio", key: studio } : null;
}

/** Opções da biblioteca do Google (@google/genai) para a chave escolhida. */
export function googleGenAiOptions(access: GoogleAiAccess): { apiKey: string; vertexai?: true } {
  return access.mode === "vertex" ? { vertexai: true, apiKey: access.key } : { apiKey: access.key };
}
