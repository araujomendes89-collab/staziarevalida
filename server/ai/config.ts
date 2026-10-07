/**
 * Central de IAs: lê a configuração salva pelo administrador (quais IAs estão ligadas, modelos, modo de cada função,
 * tetos), cria os provedores a partir dela e confere se a configuração de uma função está pronta para uso.
 * Ligar uma IA no menu é a autorização de envio ao provedor externo.
 */
import type { ContentDb } from "../contentHub/infra";
import { OllamaProvider } from "../contentHub/ai/ollama";
import { familyOfModel, resolveProviderKind, type AiProvider } from "../contentHub/ai/provider";
import type { PromptKey } from "../contentHub/ai/prompts";
import type { AiProviderId } from "./models";
import type { ModelPrice } from "./prices";

export type AiFunctionKey = "criacao" | "verificacao" | "engenharia_reversa" | "assistente_preencher" | "assistente_conferir" | "assistente_revisar";
export type AiMode = "sozinha" | "linha" | "comite";

export interface ModelRef {
  provider: AiProviderId;
  model: string;
}

export interface FunctionConfig {
  key: AiFunctionKey;
  mode: AiMode;
  primary: ModelRef | null;
  fallback: ModelRef | null;
  reviewers: ModelRef[];
  care: "rapido" | "caprichado";
}

export interface AiConfig {
  providers: Record<AiProviderId, { enabled: boolean; models: { id: string; label: string }[]; status: string | null }>;
  functions: Partial<Record<AiFunctionKey, FunctionConfig>>;
  settings: { monthly_cap_usd: number | null; per_run_cap_usd: number | null; caps_enabled: boolean; tab_override_enabled: boolean };
  prices: ModelPrice[];
}

export const PROVIDER_IDS: AiProviderId[] = ["anthropic", "openai", "gemini", "ollama"];
const PROVIDER_NAMES: Record<AiProviderId, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", ollama: "Ollama" };
export const DEFAULT_MODELS: Partial<Record<AiProviderId, string>> = { anthropic: "claude-sonnet-5-5", gemini: "gemini-2.5-pro" };
const CACHE_MS = 10_000;

export const isProviderId = (v: unknown): v is AiProviderId => PROVIDER_IDS.includes(v as AiProviderId);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toRef = (v: any): ModelRef | null => (v && isProviderId(v.provider) && typeof v.model === "string" && v.model ? { provider: v.provider, model: v.model } : null);

function convert(raw: any): AiConfig {
  const providers = {} as AiConfig["providers"];
  for (const id of PROVIDER_IDS) providers[id] = { enabled: false, models: [], status: null };
  for (const p of raw?.providers ?? []) {
    if (!isProviderId(p?.id)) continue;
    providers[p.id] = {
      enabled: p.enabled === true,
      models: Array.isArray(p.models) ? p.models.map((m: any) => ({ id: String(m.id), label: String(m.label ?? m.id) })) : [],
      status: p.last_status ?? null,
    };
  }
  const functions: AiConfig["functions"] = {};
  for (const f of raw?.functions ?? []) {
    functions[f.key as AiFunctionKey] = {
      key: f.key,
      mode: f.mode,
      primary: toRef(f.primary_ref),
      fallback: toRef(f.fallback_ref),
      reviewers: Array.isArray(f.reviewers) ? (f.reviewers.map(toRef).filter(Boolean) as ModelRef[]) : [],
      care: f.care === "rapido" ? "rapido" : "caprichado",
    };
  }
  const s = raw?.settings ?? {};
  const prices: ModelPrice[] = (raw?.prices ?? []).map((p: any) => ({
    provider: p.provider,
    model: p.model,
    input_per_mtok: Number(p.input_per_mtok),
    output_per_mtok: Number(p.output_per_mtok),
    source_url: p.source_url ?? "",
    checked_on: p.checked_on ? String(p.checked_on).slice(0, 10) : "",
  }));
  return {
    providers,
    functions,
    settings: {
      monthly_cap_usd: num(s.monthly_cap_usd),
      per_run_cap_usd: num(s.per_run_cap_usd),
      caps_enabled: s.caps_enabled === true,
      tab_override_enabled: s.tab_override_enabled === true,
    },
    prices,
  };
}

const cache = new WeakMap<ContentDb, { at: number; value: Promise<AiConfig> }>();

/** Lê a configuração do banco; o resultado vale 10 s por conexão. */
export function loadAiConfig(db: ContentDb): Promise<AiConfig> {
  const hit = cache.get(db);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = db.service<any>("ch_worker_ai_config").then(convert);
  const entry = { at: Date.now(), value };
  cache.set(db, entry);
  value.catch(() => {
    if (cache.get(db) === entry) cache.delete(db);
  });
  return value;
}

export function invalidateAiConfig(db: ContentDb): void {
  cache.delete(db);
}

export function functionForPrompt(key: PromptKey): AiFunctionKey {
  switch (key) {
    case "evidence":
    case "review":
    case "solve":
    case "currency":
    case "redteam":
      return "verificacao";
    case "qanalysis":
    case "qreanalysis":
      return "engenharia_reversa";
    default:
      return "criacao";
  }
}

/** Modelo/IA das variáveis de ambiente, usado quando a função não tem configuração salva. */
export function envFallbackRef(fn: AiFunctionKey, env: NodeJS.ProcessEnv = process.env, uiKind?: AiProviderId): ModelRef | null {
  const get = (k: string) => (env[k] ?? "").trim();
  const assistant = fn.startsWith("assistente_");
  const modelFor = (id: AiProviderId, ...first: string[]) => {
    const up = id.toUpperCase();
    const chain = [...first, `CONTENT_HUB_${up}_MODEL`];
    for (const k of chain) if (get(k)) return get(k);
    return DEFAULT_MODELS[id] ?? "";
  };
  let id: string;
  let model: string;
  if (uiKind) {
    if (!isProviderId(uiKind)) return null;
    id = uiKind;
    const up = uiKind.toUpperCase();
    model = assistant ? modelFor(uiKind, `LESSON_ASSIST_${up}_MODEL`, `PODCAST_${up}_MODEL`) : modelFor(uiKind, `PODCAST_${up}_MODEL`);
  } else if (fn === "verificacao") {
    id = get("CONTENT_HUB_VERIFIER_PROVIDER") || "anthropic";
    if (!isProviderId(id)) return null;
    model = modelFor(id);
  } else {
    id = get("CONTENT_HUB_AI_PROVIDER_CREATE") || "anthropic";
    if (!isProviderId(id)) return null;
    model = get("CONTENT_HUB_MODEL_CREATE") || modelFor(id);
  }
  if (!isProviderId(id) || !model) return null;
  return { provider: id, model };
}

/** Motivo pelo qual a IA não pode ser chamada agora (desligada, Ollama fora do Mac), ou null. */
export function providerPending(ref: ModelRef, cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): string | null {
  const name = PROVIDER_NAMES[ref.provider] ?? ref.provider;
  const p = cfg.providers[ref.provider];
  if (p?.enabled !== true) return `${name} está desligada na Central de IAs.`;
  if (ref.provider === "ollama" && (env.NODE_ENV === "production" || p.status === "so_no_mac")) return "Ollama roda só no Mac.";
  return null;
}

export function makeProvider(ref: ModelRef, cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): { provider: AiProvider | null; pending: string | null } {
  const pending = providerPending(ref, cfg, env);
  if (pending) return { provider: null, pending };
  if (ref.provider === "ollama") return { provider: new OllamaProvider((env.OLLAMA_BASE_URL || "http://localhost:11434").trim(), ref.model), pending: null };
  const r = resolveProviderKind(ref.provider, undefined, ref.model, { allowExternal: true });
  return { provider: r.provider, pending: r.status.pending };
}

/** Problemas de uma ref: IA desligada, modelo fora da lista (não vazia) e modelo pago sem preço com os tetos ligados. */
export function refProblems(ref: ModelRef, cfg: AiConfig): string[] {
  const out: string[] = [];
  const name = PROVIDER_NAMES[ref.provider] ?? ref.provider;
  const p = cfg.providers[ref.provider];
  if (p?.enabled !== true) out.push(`${name} está desligada na Central de IAs.`);
  if (p && p.models.length > 0 && !p.models.some((m) => m.id === ref.model)) out.push(`${name} ${ref.model}: modelo não está mais na lista.`);
  if (cfg.settings.caps_enabled && ref.provider !== "ollama" && !cfg.prices.some((x) => x.provider === ref.provider && x.model === ref.model)) {
    out.push(`${name} ${ref.model}: sem preço cadastrado, e os tetos estão ligados.`);
  }
  return out;
}

export function validateFunctionConfig(fc: FunctionConfig, cfg: AiConfig): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const add = (m: string) => {
    if (!problems.includes(m)) problems.push(m);
  };

  const checkRef = (ref: ModelRef) => {
    for (const m of refProblems(ref, cfg)) add(m);
  };

  if (!fc.primary) add("Escolha a IA principal.");
  const reviewers = fc.reviewers ?? [];
  if (fc.mode === "sozinha") {
    if (reviewers.length > 0) add("No modo sozinha não há conferentes.");
  } else if (fc.mode === "linha") {
    if (reviewers.length < 1) add("Escolha de 1 a 3 conferentes.");
    if (reviewers.length > 3) add("A linha de montagem aceita no máximo 3 conferentes.");
  } else if (fc.mode === "comite") {
    const total = (fc.primary ? 1 : 0) + reviewers.length;
    if (total < 2) add("O comitê precisa de pelo menos 2 membros.");
    if (total > 4) add("O comitê aceita no máximo 4 membros.");
  } else {
    add("Escolha o modo da função.");
  }

  for (const r of [fc.primary, fc.fallback, ...reviewers]) if (r) checkRef(r);

  if (fc.mode === "linha") {
    for (const rv of reviewers) {
      for (const [label, creator] of [["criadora", fc.primary], ["reserva", fc.fallback]] as const) {
        if (creator && familyOfModel(rv.model) === familyOfModel(creator.model)) {
          add(`Conferente ${rv.model} é da mesma família da ${label} ${creator.model}.`);
        }
      }
    }
  } else if (fc.mode === "comite") {
    const members = [fc.primary, ...reviewers].filter(Boolean) as ModelRef[];
    const fams = members.map((m) => familyOfModel(m.model));
    if (new Set(fams).size < fams.length) warnings.push("Há membros da mesma família no comitê: não é independente.");
  }
  return { problems, warnings };
}

export interface FunctionCheck {
  source: "banco" | "variaveis";
  ready: boolean;
  ref: ModelRef | null;
  problems: string[];
  warnings: string[];
}

export const FUNCTION_KEYS: AiFunctionKey[] = ["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar"];

/** Situação de cada uma das 6 funções: pronta ou o motivo. Função sem configuração salva usa as variáveis de ambiente. */
export function functionChecks(cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): Record<AiFunctionKey, FunctionCheck> {
  const out = {} as Record<AiFunctionKey, FunctionCheck>;
  for (const key of FUNCTION_KEYS) {
    const saved = cfg.functions[key];
    if (saved) {
      const { problems, warnings } = validateFunctionConfig(saved, cfg);
      out[key] = { source: "banco", ready: problems.length === 0, ref: saved.primary, problems, warnings };
      continue;
    }
    const ref = envFallbackRef(key, env);
    const problems: string[] = [];
    if (!ref) problems.push("Nenhuma IA definida: configure a função.");
    else {
      problems.push(...refProblems(ref, cfg));
      const pending = providerPending(ref, cfg, env);
      if (pending && !problems.includes(pending)) problems.push(pending);
    }
    out[key] = { source: "variaveis", ready: problems.length === 0, ref, problems, warnings: [] };
  }
  return out;
}
