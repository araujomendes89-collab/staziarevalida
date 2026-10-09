/**
 * Lista de modelos que cada empresa oferece (Central de IAs). Só `fetch`; chaves lidas do ambiente do servidor e
 * nunca devolvidas (nem em `detail`, nem em mensagens). Ollama não tem chave: sem resposta = "só no Mac".
 */
export type AiProviderId = "anthropic" | "openai" | "gemini" | "ollama";
export type ProviderStatus = "pronta" | "sem_chave" | "chave_recusada" | "so_no_mac" | "erro";
export interface ModelEntry {
  id: string;
  label: string;
}
export interface ModelList {
  status: ProviderStatus;
  detail: string | null;
  models: ModelEntry[];
}

import { googleAiAccess } from "./googleKey";
import { PRICE_SEED } from "./prices";
const TIMEOUT_MS = 10_000;
const OPENAI_EXCLUDE = ["embedding", "tts", "whisper", "dall-e", "image", "audio", "realtime", "transcribe", "moderation", "search"];
const GEMINI_EXCLUDE = ["embedding", "imagen", "veo", "tts", "live", "aqa"];
// modelos de busca (nomic-embed-text, mxbai-embed-large...) não geram texto
const OLLAMA_EXCLUDE = ["embed"];

const fail = (status: ProviderStatus, detail: string): ModelList => ({ status, detail, models: [] });
const clean = (v: string | undefined) => (v ?? "").trim();
const excluded = (id: string, words: string[]) => words.some((w) => id.toLowerCase().includes(w));
const byId = (a: ModelEntry, b: ModelEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const BAD_FORMAT = "Resposta da empresa em formato inesperado.";

export async function listModels(id: AiProviderId, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<ModelList> {
  // Vertex AI: a chave do Vertex não lista modelos; vale a lista dos modelos Gemini com preço cadastrado (todos conferidos no
  // Vertex do projeto em 2026-10-09). Sem chamar a internet.
  if (id === "gemini" && googleAiAccess(env)?.mode === "vertex") {
    const models = PRICE_SEED.filter((p) => p.provider === "gemini").map((p) => ({ id: p.model, label: p.model }));
    return { status: "pronta", detail: "Gemini pelo Vertex AI: lista dos modelos com preço cadastrado.", models: models.sort(byId) };
  }
  let url: string;
  let headers: Record<string, string> = {};
  if (id === "ollama") {
    url = `${(clean(env.OLLAMA_BASE_URL) || "http://localhost:11434").replace(/\/+$/, "")}/api/tags`;
  } else {
    const key = id === "anthropic" ? clean(env.ANTHROPIC_API_KEY) : id === "openai" ? clean(env.OPENAI_API_KEY) : clean(env.GEMINI_API_KEY) || clean(env.GOOGLE_GEMINI_API_KEY);
    if (!key) return fail("sem_chave", "Chave não configurada no servidor.");
    if (id === "anthropic") {
      url = "https://api.anthropic.com/v1/models";
      headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };
    } else if (id === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { Authorization: `Bearer ${key}` };
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(key)}`;
    }
  }

  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return id === "ollama" ? fail("so_no_mac", "Ollama não respondeu: ele roda só no Mac.") : fail("erro", "Não foi possível falar com a empresa.");
  }
  if (res.status === 401 || res.status === 403) return fail("chave_recusada", `A empresa recusou a chave (${res.status}).`);
  if (id === "gemini" && res.status === 400) {
    const text = await res.text().catch(() => "");
    if (text.includes("API_KEY_INVALID")) return fail("chave_recusada", "A empresa recusou a chave (400).");
  }
  if (!res.ok) return fail("erro", `A empresa respondeu ${res.status}.`);
  let data = (await res.json().catch(() => null)) as any;
  if (!data || typeof data !== "object") return fail("erro", BAD_FORMAT);

  let models: ModelEntry[];
  let incomplete = false;
  if (id === "anthropic") {
    if (!Array.isArray(data.data)) return fail("erro", BAD_FORMAT);
    models = data.data.filter((m: any) => typeof m?.id === "string").map((m: any) => ({ id: m.id, label: m.display_name || m.id }));
    // A Anthropic devolve poucos por página: segue as páginas seguintes (até 10).
    for (let page = 0; data.has_more && data.last_id && page < 10; page++) {
      let next: any;
      try {
        const r2 = await fetchImpl(`${url}?after_id=${encodeURIComponent(String(data.last_id))}&limit=1000`, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        next = r2.ok ? await r2.json().catch(() => null) : null;
      } catch {
        next = null;
      }
      if (!next || !Array.isArray(next.data)) {
        incomplete = true;
        break;
      }
      models.push(...next.data.filter((m: any) => typeof m?.id === "string").map((m: any) => ({ id: m.id, label: m.display_name || m.id })));
      data = next;
    }
  } else if (id === "openai") {
    if (!Array.isArray(data.data)) return fail("erro", BAD_FORMAT);
    models = data.data.filter((m: any) => typeof m?.id === "string" && !excluded(m.id, OPENAI_EXCLUDE)).map((m: any) => ({ id: m.id, label: m.id }));
  } else if (id === "gemini") {
    if (!Array.isArray(data.models)) return fail("erro", BAD_FORMAT);
    models = data.models
      .filter((m: any) => typeof m?.name === "string" && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => ({ id: String(m.name).replace(/^models\//, ""), label: m.displayName || String(m.name).replace(/^models\//, "") }))
      .filter((m: ModelEntry) => !excluded(m.id, GEMINI_EXCLUDE));
  } else {
    if (!Array.isArray(data.models)) return fail("erro", BAD_FORMAT);
    models = data.models.filter((m: any) => typeof m?.name === "string" && !excluded(m.name, OLLAMA_EXCLUDE)).map((m: any) => ({ id: m.name, label: m.name }));
  }
  return { status: "pronta", detail: incomplete ? "Lista possivelmente incompleta." : null, models: models.sort(byId) };
}
