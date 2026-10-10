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
import { googleAiAccess, GOOGLE_KEY_MISSING } from "./googleKey";

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
/** Nomes das IAs na tela. */
export const PROVIDER_NAMES: Record<AiProviderId, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", ollama: "Ollama" };
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

/**
 * Modelo/IA das variáveis de ambiente, usado quando a função não tem configuração salva. Sem a escolha da tela (uiKind):
 * criação, engenharia reversa e assistentes seguem CONTENT_HUB_AI_PROVIDER_CREATE, depois CONTENT_HUB_AI_PROVIDER;
 * a verificação segue CONTENT_HUB_VERIFIER_PROVIDER, depois CONTENT_HUB_AI_PROVIDER; o padrão é o Claude. Valor que não é
 * uma das 4 IAs (ex.: "mock") é pulado na cadeia. CONTENT_HUB_MODEL_CREATE só vale junto da IA de
 * CONTENT_HUB_AI_PROVIDER_CREATE (ou do Claude padrão quando nenhuma variável de IA está definida, como fazia o
 * resolveCreatorProvider); se a IA veio de CONTENT_HUB_AI_PROVIDER, o modelo é CONTENT_HUB_<IA>_MODEL ou o padrão dela.
 */
export function envFallbackRef(fn: AiFunctionKey, env: NodeJS.ProcessEnv = process.env, uiKind?: AiProviderId): ModelRef | null {
  const get = (k: string) => (env[k] ?? "").trim();
  const assistant = fn.startsWith("assistente_");
  const modelFor = (id: AiProviderId, ...first: string[]) => {
    const up = id.toUpperCase();
    const chain = [...first, `CONTENT_HUB_${up}_MODEL`];
    for (const k of chain) if (get(k)) return get(k);
    return DEFAULT_MODELS[id] ?? "";
  };
  /** A primeira variável da lista com uma das 4 IAs (pula o que não é IA, como "mock"); sem nenhuma, o Claude. */
  const chooseAi = (...names: string[]): { id: AiProviderId; from: string | null } => {
    for (const name of names) if (isProviderId(get(name))) return { id: get(name) as AiProviderId, from: name };
    return { id: "anthropic", from: null };
  };
  let id: AiProviderId;
  let model: string;
  if (uiKind) {
    if (!isProviderId(uiKind)) return null;
    id = uiKind;
    const up = uiKind.toUpperCase();
    model = assistant ? modelFor(uiKind, `LESSON_ASSIST_${up}_MODEL`, `PODCAST_${up}_MODEL`) : modelFor(uiKind, `PODCAST_${up}_MODEL`);
  } else if (fn === "verificacao") {
    id = chooseAi("CONTENT_HUB_VERIFIER_PROVIDER", "CONTENT_HUB_AI_PROVIDER").id;
    model = modelFor(id);
  } else {
    const chosen = chooseAi("CONTENT_HUB_AI_PROVIDER_CREATE", "CONTENT_HUB_AI_PROVIDER");
    id = chosen.id;
    const ownModel = chosen.from === "CONTENT_HUB_AI_PROVIDER_CREATE" || (chosen.from === null && !get("CONTENT_HUB_AI_PROVIDER_CREATE") && !get("CONTENT_HUB_AI_PROVIDER"));
    model = (ownModel && get("CONTENT_HUB_MODEL_CREATE")) || modelFor(id);
  }
  return model ? { provider: id, model } : null;
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

/**
 * Chave da IA ausente NESTE servidor, conferida pelo env recebido (sem criar provedor, sem rede), com as mesmas regras e
 * mensagens de resolveProviderKind. A tela só enxerga as variáveis do servidor que responde (o site): ausente aqui não
 * quer dizer ausente no processamento da Central (Cloud Run), por isso isto é só aviso, nunca bloqueio. O Ollama não tem chave.
 */
export function keyPending(id: AiProviderId, env: NodeJS.ProcessEnv = process.env): string | null {
  if (id === "anthropic") return (env.ANTHROPIC_API_KEY ?? "").trim() ? null : "ANTHROPIC_API_KEY vazia no servidor.";
  if (id === "gemini") return googleAiAccess(env) ? null : GOOGLE_KEY_MISSING;
  if (id === "openai") return (env.OPENAI_API_KEY ?? "").trim() ? null : "OPENAI_API_KEY vazia no servidor.";
  return null;
}

/** Aviso de função: a IA está sem chave neste servidor (o site). */
const keyWarning = (id: AiProviderId) => `${PROVIDER_NAMES[id]}: sem chave neste servidor (site). O processamento da Central (Cloud Run) usa as chaves de lá; Aulas e Podcasts rodam no site e precisam da chave aqui.`;

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
  // Linha de produção e Comitê ainda não chamam conferentes nem membros: o uso real é principal e reserva (correção IA04, 2026-10-10)
  if (fc.mode === "linha" || fc.mode === "comite") {
    const who = fc.mode === "linha" ? "os conferentes da Linha de produção" : "os membros do Comitê";
    warnings.push(
      fc.key === "verificacao"
        ? `No processamento a Verificação usa só a IA principal e a reserva (sempre de outra empresa); ${who} ${fc.mode === "linha" ? "só rodam na conferência de rascunhos feita por comando" : "ainda não rodam"}.`
        : `Nesta etapa a função usa só a IA principal e a reserva: ${who} ainda não rodam.`
    );
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

/**
 * Função salva: além da validação da configuração, confere o que ESTE servidor consegue chamar. Bloqueia só o que não
 * roda em nenhum servidor publicado (Ollama no site publicado ou sem resposta). Nesta etapa todo uso real passa pelo
 * adaptador do maestro, que usa só a principal e a reserva, qualquer que seja o modo: nem a principal nem a reserva
 * rodando é problema; só a principal não rodando é aviso (a reserva responde). Conferente ou membro que não roda é aviso
 * (no comitê, a IA desligada também diz o motivo). O aviso fixo de que Linha e Comitê ainda não chamam conferentes vem de validateFunctionConfig.
 * Chave ausente neste servidor é só aviso (o processamento roda no Cloud Run com as chaves de lá). IA desligada já é
 * problema em validateFunctionConfig e não se repete como problema.
 */
function savedFunctionCheck(saved: FunctionConfig, cfg: AiConfig, env: NodeJS.ProcessEnv): FunctionCheck {
  const { problems, warnings } = validateFunctionConfig(saved, cfg);
  const add = (list: string[], m: string) => {
    if (!list.includes(m)) list.push(m);
  };
  interface RefState {
    ref: ModelRef;
    /** Por que a ref não roda: IA desligada ou Ollama fora do Mac (null: roda). */
    reason: string | null;
    /** Por que não roda em nenhum servidor publicado (null: roda, ou a IA está desligada, o que já é problema). */
    why: string | null;
    runs: boolean;
  }
  const state = (ref: ModelRef): RefState => {
    const reason = providerPending(ref, cfg, env);
    return { ref, reason, why: cfg.providers[ref.provider]?.enabled === true ? reason : null, runs: reason === null };
  };
  const cannot = (s: RefState, reason: string | null, prefix = "") => `${prefix}${PROVIDER_NAMES[s.ref.provider] ?? s.ref.provider} ${s.ref.model} não pode rodar aqui (${reason})`;
  const primary = saved.primary ? state(saved.primary) : null;
  const fallback = saved.fallback ? state(saved.fallback) : null;
  const others = saved.reviewers.map(state);

  if (primary?.why) {
    if (fallback?.runs) add(warnings, `A principal não pode rodar aqui (${primary.why}); a reserva vai responder.`);
    else {
      add(problems, primary.why);
      if (fallback?.why) add(problems, fallback.why);
    }
  } else if (fallback?.why) {
    add(warnings, cannot(fallback, fallback.why, "A reserva "));
  }
  // conferentes (linha) e membros (comitê); no comitê a IA desligada também diz o motivo
  for (const o of others) {
    const reason = saved.mode === "comite" ? o.reason : o.why;
    if (reason) add(warnings, cannot(o, reason));
  }

  // chave ausente neste servidor: só aviso, um por IA ligada que o servidor deixa chamar
  for (const s of [primary, fallback, ...others]) {
    if (s?.runs && keyPending(s.ref.provider, env)) add(warnings, keyWarning(s.ref.provider));
  }
  return { source: "banco", ready: problems.length === 0, ref: saved.primary, problems, warnings };
}

/** Situação de cada uma das 6 funções: pronta ou o motivo. Função sem configuração salva usa as variáveis de ambiente. */
export function functionChecks(cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): Record<AiFunctionKey, FunctionCheck> {
  const out = {} as Record<AiFunctionKey, FunctionCheck>;
  for (const key of FUNCTION_KEYS) {
    const saved = cfg.functions[key];
    if (saved) {
      out[key] = savedFunctionCheck(saved, cfg, env);
      continue;
    }
    const ref = envFallbackRef(key, env);
    const problems: string[] = [];
    const warnings: string[] = [];
    if (!ref) problems.push("Nenhuma IA definida: configure a função.");
    else {
      problems.push(...refProblems(ref, cfg));
      const pending = providerPending(ref, cfg, env);
      if (pending && !problems.includes(pending)) problems.push(pending);
      // chave ausente neste servidor (o site): só aviso, como nas funções salvas
      if (!pending && keyPending(ref.provider, env)) warnings.push(keyWarning(ref.provider));
    }
    out[key] = { source: "variaveis", ready: problems.length === 0, ref, problems, warnings };
  }
  // conferência por outra empresa (decisão do dono, 2026-10-10): o processamento troca sozinho (maestroCheckerProvider). A
  // empresa vem da IA cadastrada; a Criação conta a principal e a reserva salvas
  const checker = out.verificacao?.ref;
  const writers = [out.criacao?.ref, cfg.functions.criacao?.fallback].filter(Boolean) as ModelRef[];
  if (checker && writers.some((w) => w.provider === checker.provider)) {
    const name = PROVIDER_NAMES[checker.provider] ?? checker.provider;
    const others = (["gemini", "anthropic", "openai"] as AiProviderId[]).filter((id) => id !== checker.provider).map((id) => PROVIDER_NAMES[id]);
    out.verificacao.warnings.push(
      `Verificação e Criação são da mesma empresa (${name}): no processamento, a conferência usa a reserva da Verificação se ela for de outra empresa; senão troca sozinha para ${others.join(" ou ")} (nesta ordem).`
    );
  }
  return out;
}

/**
 * Para a tela: o que impede este servidor de chamar cada IA, sem rede e sem olhar o interruptor Ligada/Desligada (isso já
 * aparece no cartão e no seletor). `blocks` quer dizer que não roda em nenhum servidor publicado (Ollama no site
 * publicado ou sem resposta): o seletor desabilita. Sem `blocks`, `pending` é só a chave ausente NESTE servidor (o site):
 * a IA continua escolhível, porque o processamento da Central roda no Cloud Run com as chaves de lá.
 */
export function providerChecks(cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): Record<AiProviderId, { pending: string | null; blocks: boolean }> {
  const out = {} as Record<AiProviderId, { pending: string | null; blocks: boolean }>;
  for (const id of PROVIDER_IDS) {
    // confere como se a IA estivesse ligada
    const on: AiConfig = { ...cfg, providers: { ...cfg.providers, [id]: { ...cfg.providers[id], enabled: true } } };
    const block = providerPending({ provider: id, model: "" }, on, env);
    out[id] = { pending: block ?? keyPending(id, env), blocks: block !== null };
  }
  return out;
}
