/**
 * Central de IAs: lê a configuração salva pelo administrador (quais IAs estão ligadas, modelos, modo de cada função,
 * tetos), cria os provedores a partir dela e confere se a configuração de uma função está pronta para uso.
 * Ligar uma IA no menu é a autorização de envio ao provedor externo.
 */
import type { ContentDb } from "../contentHub/infra";
import { OllamaProvider } from "../contentHub/ai/ollama";
import { anthropicMaxTokens, familyOfModel, geminiOutputLimit, geminiThinkingReserve, resolveProviderKind, type AiProvider } from "../contentHub/ai/provider";
import { openAiMaxCompletionTokens } from "../contentHub/ai/openai";
import type { PromptKey } from "../contentHub/ai/prompts";
import type { AiProviderId } from "./models";
import { estimateCostUsd, type ModelPrice } from "./prices";
import { googleAiAccess, GOOGLE_KEY_MISSING } from "./googleKey";

export type AiFunctionKey = "criacao" | "verificacao" | "engenharia_reversa" | "assistente_preencher" | "assistente_conferir" | "assistente_revisar" | "busca_fontes" | "similaridade" | "analise_mudancas";
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
  /** Máximo de buscas na internet por pedido (só `busca_fontes`; nulo: o padrão, DEFAULT_MAX_SEARCHES). */
  max_searches: number | null;
}

export interface AiConfig {
  providers: Record<AiProviderId, { enabled: boolean; models: { id: string; label: string }[]; status: string | null }>;
  functions: Partial<Record<AiFunctionKey, FunctionConfig>>;
  settings: { monthly_cap_usd: number | null; per_run_cap_usd: number | null; caps_enabled: boolean; tab_override_enabled: boolean; overall_monthly_cap_usd?: number | null; overall_cap_enabled?: boolean };
  prices: ModelPrice[];
}

export const PROVIDER_IDS: AiProviderId[] = ["anthropic", "openai", "gemini", "ollama"];
/** Nomes das IAs na tela. */
export const PROVIDER_NAMES: Record<AiProviderId, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", ollama: "Ollama" };
export const DEFAULT_MODELS: Partial<Record<AiProviderId, string>> = { anthropic: "claude-sonnet-5-5", gemini: "gemini-2.5-pro" };
const CACHE_MS = 10_000;
/** Máximo de buscas na internet por pedido quando a função de busca não tem um salvo. */
export const DEFAULT_MAX_SEARCHES = 5;
/** O que a função de busca diz quando não tem configuração salva (ela nunca usa as variáveis de ambiente). */
export const SEARCH_OFF = "Desligada: configure esta função na Central de IAs.";
/** A busca de fontes oficiais recusa o Gemini (principal e reserva): a API dele não limita a pesquisa aos sites oficiais nem o número de buscas. */
export const SEARCH_NO_GEMINI = "A busca de fontes oficiais não funciona com o Gemini: ele não consegue limitar a pesquisa aos sites oficiais. Escolha Claude ou OpenAI.";

/** Funções que buscam na internet: só modo sozinha, sem Ollama, com máximo de buscas e preço por busca. */
export const isSearchFunction = (fn: AiFunctionKey): boolean => fn === "busca_fontes";
/**
 * Funções que só rodam com a configuração SALVA na Central de IAs e a Análise do que mudou da Vigilância científica (sem ela ficam desligadas; as variáveis de ambiente nunca as
 * definem): a busca de fontes oficiais e as Questões parecidas (similaridade: vetores das questões e classificação dos pares
 * duvidosos; começa desligada por decisão do dono, 2026-10-12).
 */
export const requiresSavedConfig = (fn: AiFunctionKey): boolean => isSearchFunction(fn) || fn === "similaridade" || fn === "analise_mudancas";

export const isProviderId = (v: unknown): v is AiProviderId => PROVIDER_IDS.includes(v as AiProviderId);

/**
 * O limite de saída que de fato vai para a IA, pela mesma conta de cada provedor: no Gemini, o pedido mais a folga do raciocínio
 * (geminiOutputLimit); no Claude, no mínimo 8.192 (anthropicMaxTokens); na OpenAI, no mínimo 4.096 (openAiMaxCompletionTokens);
 * no Ollama, o pedido. Revisão rodada 5: antes só o Gemini contava, e um corte do Claude nas Aulas e nos assistentes (6.000
 * pedidos, 8.192 mandados) custava mais que a estimativa: o valor que a tela sugeria não deixava a reserva socorrer.
 */
export function effectiveMaxOut(ref: ModelRef, maxOut: number, care?: string): number {
  if (ref.provider === "gemini") return geminiOutputLimit(ref.model, care, maxOut);
  if (ref.provider === "anthropic") return anthropicMaxTokens(maxOut);
  if (ref.provider === "openai") return openAiMaxCompletionTokens(maxOut);
  return maxOut;
}

/**
 * Pior caso de uma chamada pelo preço cadastrado (entrada em caracteres ÷ 4 e a saída máxima que de fato vai para a IA, mais o
 * máximo de buscas na internet vezes o preço por busca), a mesma conta dos tetos. Ollama e modelo sem preço: 0. Não conta os
 * tokens das buscas (os resultados voltam como entrada e não se sabem de antemão); o gasto real é gravado como veio.
 */
export function callEstimateUsd(ref: ModelRef, price: ModelPrice | null, chars: number, maxOut: number, care?: string, searches = 0): number {
  if (ref.provider === "ollama" || !price) return 0;
  return estimateCostUsd(price, chars, effectiveMaxOut(ref, maxOut, care), searches) ?? 0;
}

/** Uma chamada típica de um uso da função: a saída pedida no código e a entrada que costuma ir (em caracteres). */
export interface TypicalCall {
  use: string;
  inputChars: number;
  maxOut: number;
  /** Máximo de buscas na internet da chamada (só a função de busca). */
  searches?: number;
}

/**
 * Chamadas típicas de cada função, para o aviso do teto por chamada (revisão rodada 3). A saída é a pedida no código (a
 * estimativa usa o que cada provedor de fato manda, effectiveMaxOut: no Claude, 6.000 viram 8.192); a entrada é o material que
 * costuma ir, com o texto de instruções:
 *   etapas da Central de Conteúdo: 8.192 (pipeline.ts); trechos de até 6.000 caracteres mais o catálogo e as instruções (~30 mil).
 *   Aulas: 6.000 (lessons/assist.ts); até 80 mil caracteres de material.
 *   Podcasts: 16.000 (podcasts/script.ts); até 120 mil caracteres de material.
 *   Questões: 12.000 (questionAnalysis.ts); enunciado, alternativas e instruções (~8 mil).
 *   assistentes: 6.000 (adminAssistant/engine.ts); até 60 mil caracteres de material mais os trechos oficiais.
 */
export const TYPICAL_CALLS: Record<AiFunctionKey, TypicalCall[]> = {
  criacao: [
    { use: "etapas da Central de Conteúdo", inputChars: 30_000, maxOut: 8192 },
    { use: "Aulas", inputChars: 85_000, maxOut: 6000 },
    { use: "Podcasts", inputChars: 125_000, maxOut: 16_000 },
  ],
  verificacao: [{ use: "etapas da Central de Conteúdo", inputChars: 30_000, maxOut: 8192 }],
  engenharia_reversa: [{ use: "Questões", inputChars: 8_000, maxOut: 12_000 }],
  assistente_preencher: [{ use: "assistentes", inputChars: 70_000, maxOut: 6000 }],
  assistente_conferir: [{ use: "assistentes", inputChars: 70_000, maxOut: 6000 }],
  assistente_revisar: [{ use: "assistentes", inputChars: 70_000, maxOut: 6000 }],
  // busca de fontes oficiais (sources/search.ts): o pedido, a lista de sites e as instruções (~6 mil caracteres), 8.192 de saída
  // e o máximo de buscas (o salvo na função, senão DEFAULT_MAX_SEARCHES)
  busca_fontes: [{ use: "busca de fontes oficiais", inputChars: 6_000, maxOut: 8192, searches: DEFAULT_MAX_SEARCHES }],
  // Questões parecidas (similarity/classifier.ts): 4 pares por chamada, com enunciado, alternativas e perfil (~24 mil caracteres)
  similaridade: [{ use: "pares duvidosos de questões parecidas", inputChars: 24_000, maxOut: 4096 }],
  // Vigilância científica (vigilance/analysis.ts): os trechos que mudaram (até 40 de 3 mil caracteres) e as instruções
  analise_mudancas: [{ use: "análise do que mudou (Vigilância científica)", inputChars: 40_000, maxOut: 4096 }],
};

/** As chamadas típicas da função; a de busca usa o máximo de buscas salvo nela (senão o padrão). */
export function typicalCallsOf(key: AiFunctionKey, maxSearches?: number | null): TypicalCall[] {
  const calls = TYPICAL_CALLS[key] ?? [];
  if (!isSearchFunction(key)) return calls;
  return calls.map((c) => ({ ...c, searches: maxSearches ?? DEFAULT_MAX_SEARCHES }));
}

/**
 * Conferência de rascunhos da Verificação (por comando, draftChecks.ts; revisão rodada 5): é o único lugar em que os conferentes
 * da Linha e os membros do Comitê rodam. Cada papel (fontes, atualidade, revisão clínica) é uma execução própria com o conferente
 * do papel, 4.096 de saída e SEM o Cuidado da função (maestroRoleProvider não passa a configuração da função). Entrada: até 6
 * trechos oficiais de 2.500 caracteres, a afirmação e as instruções (~20 mil caracteres).
 */
export const DRAFT_REVIEW_CALL: TypicalCall = { use: "conferência de rascunhos", inputChars: 20_000, maxOut: 4096 };

/** Estimativa (pior caso, a mesma dos tetos) de uma chamada típica com esta IA. */
export function typicalCallEstimate(ref: ModelRef, price: ModelPrice | null, call: TypicalCall, care?: string): number {
  return callEstimateUsd(ref, price, call.inputChars, call.maxOut, care, call.searches ?? 0);
}

const usd = (n: number) => String(Number(n.toFixed(4))).replace(".", ",");
/** Valor mínimo sugerido: arredondado para cima no centavo, com dois decimais (US$ 0,70). */
const cents = (n: number) => (Math.ceil(Number((n * 100).toFixed(6))) / 100).toFixed(2).replace(".", ",");
const listPt = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}` : items.join(""));
const ROLE_OF: Record<string, string> = { principal: "da principal", reserva: "da reserva", conferente: "do conferente", membro: "do membro" };
const aiName = (ref: ModelRef) => `${PROVIDER_NAMES[ref.provider] ?? ref.provider} ${ref.model}`;
const priceOf = (cfg: AiConfig, ref: ModelRef) => cfg.prices.find((p) => p.provider === ref.provider && p.model === ref.model) ?? null;
/** Modelo pago (tudo menos o Ollama, que custa zero) sem preço cadastrado: o gasto dele apareceria como US$ 0 (IA09). */
const lacksPrice = (ref: ModelRef, cfg: AiConfig) => ref.provider !== "ollama" && !priceOf(cfg, ref);
const PRICE_WHERE = `tabela "Preços por milhão de tokens" ou "Atualizar lista" da IA`;
/** Aviso, no que já está salvo e rodando: nada para, mas o dono vê o que falta. */
const noPriceWarning = (ref: ModelRef) => `${aiName(ref)}: sem preço cadastrado. O gasto dele aparece como US$ 0 até o preço ser cadastrado (${PRICE_WHERE}).`;
/** Problema, ao salvar a função: o preço é exigido para ligar um modelo pago, com ou sem teto. */
const noPriceProblem = (ref: ModelRef) => `${aiName(ref)}: sem preço cadastrado. Cadastre o preço antes de usar este modelo (${PRICE_WHERE}); sem ele o gasto aparece como US$ 0.`;
const hasFolga = (ref: ModelRef, care: string | undefined) => ref.provider === "gemini" && geminiThinkingReserve(ref.model, care) > 0;
const FOLGA = ", já com a folga do raciocínio do Gemini";

/** Uma IA que a função de fato chama, as chamadas típicas dela e o Cuidado que vai junto (undefined: sem o Cuidado da função). */
interface CapMember {
  ref: ModelRef;
  role: keyof typeof ROLE_OF;
  calls: TypicalCall[];
  care: string | undefined;
}

/**
 * Aviso antes de parar (revisão rodada 3): com os tetos ligados, cada IA da função cuja chamada típica (já com a folga do
 * raciocínio do Gemini) passa do teto por chamada. Sem o aviso, o dono só descobria pelos trabalhos parados e pelas linhas
 * "teto" do Histórico. Aqui cada IA conta como uma chamada sozinha; o "pelo menos" é o valor para essa chamada rodar, não para
 * nada parar (rodada 4): depois de uma falha cobrada, a soma com a reserva e a nova tentativa vem de failureChainWarning.
 * Cada IA traz as próprias chamadas (rodada 5): conferentes e membros só na conferência de rascunhos da Verificação.
 */
function perRunCapWarnings(members: CapMember[], cfg: AiConfig): string[] {
  const { caps_enabled, per_run_cap_usd: cap } = cfg.settings;
  if (!caps_enabled || cap === null) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { ref, role, calls, care } of members) {
    const id = `${role}:${ref.provider}:${ref.model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const price = priceOf(cfg, ref);
    const over = calls.map((call) => ({ call, est: typicalCallEstimate(ref, price, call, care) })).filter((x) => x.est > cap + 1e-9);
    if (!over.length) continue;
    const list = listPt(over.map((x) => `${x.call.use} (US$ ${usd(x.est)})`));
    const need = Math.max(...over.map((x) => x.est));
    const folga = hasFolga(ref, care) ? FOLGA : "";
    const stops = over.length > 1 ? "essas tentativas param" : "essa tentativa para";
    out.push(
      `Teto por chamada de US$ ${usd(cap)} abaixo da estimativa de uma tentativa ${ROLE_OF[role]} ${aiName(ref)} em ${list}${folga}: ${stops} no teto sem chamar a IA. Para essa tentativa rodar, o teto por chamada precisa ser de pelo menos US$ ${cents(need)}.`
    );
  }
  return out;
}

/**
 * Aviso da soma (revisão rodada 4): desde a rodada 3, a nova tentativa e a reserva passam pelo teto por chamada com o gasto real
 * da falha. Uma resposta cortada custa quase a estimativa inteira e o tempo esgotado grava a estimativa inteira; a resposta fora
 * do formato também é cobrada e ainda tem uma nova tentativa antes da reserva. Por isso, por uso típico da função:
 *   a reserva socorre um corte ou tempo esgotado só com o teto ≥ principal + reserva;
 *   socorre também depois da nova tentativa só com o teto ≥ 2 × principal + reserva (sem reserva: 2 × principal).
 * Conta só a principal e a reserva, que é o que roda hoje em todos os modos (a soma da Linha e do Comitê inteiros só vale pelo
 * runFunction, que nenhuma tela nem tarefa usa). Reserva sem custo (Ollama) passa sempre pelo teto: sem aviso.
 */
/** Por uso típico da função: a principal (p), a reserva (r), principal + reserva e duas da principal + reserva (a conta do aviso). */
function chainRows(key: AiFunctionKey, primary: ModelRef, fallback: ModelRef | null, care: string | undefined, cfg: AiConfig, maxSearches?: number | null) {
  return typicalCallsOf(key, maxSearches).map((call) => {
    const p = typicalCallEstimate(primary, priceOf(cfg, primary), call, care);
    const r = fallback ? typicalCallEstimate(fallback, priceOf(cfg, fallback), call, care) : 0;
    return { use: call.use, p, r, rescue: p + r, full: 2 * p + r };
  });
}

/**
 * Guia para escolher o teto por chamada (IA01): o valor mínimo para nenhuma função parar no teto com as IAs de hoje, por função e o
 * maior de todos. É a mesma conta do aviso da tela (duas tentativas da principal mais a reserva, no pior uso típico), pelo preço
 * cadastrado, arredondada para cima no centavo: nada é inventado, e nada é ligado nem gravado por isso. Função sem configuração salva
 * usa as variáveis do servidor (IA e reserva), como o maestro. Entram só as funções com custo conhecido (modelo pago com preço).
 */
export function capGuidance(cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): { per_call_min_usd: number | null; by_function: { key: AiFunctionKey; min_usd: number }[] } {
  const by_function: { key: AiFunctionKey; min_usd: number }[] = [];
  for (const key of FUNCTION_KEYS) {
    const saved = cfg.functions[key];
    const primary = saved ? saved.primary : envFallbackRef(key, env);
    if (!primary) continue;
    const fallback = saved ? saved.fallback : envReserveRef(primary, env);
    const paid = chainRows(key, primary, fallback, saved?.care, cfg, saved?.max_searches).filter((x) => x.p > 0);
    if (!paid.length) continue;
    by_function.push({ key, min_usd: Math.ceil(Number((Math.max(...paid.map((x) => x.full)) * 100).toFixed(6))) / 100 });
  }
  return { per_call_min_usd: by_function.length ? Math.max(...by_function.map((x) => x.min_usd)) : null, by_function };
}

function failureChainWarning(key: AiFunctionKey, primary: ModelRef | null, fallback: ModelRef | null, care: string | undefined, cfg: AiConfig, maxSearches?: number | null): string | null {
  const { caps_enabled, per_run_cap_usd: cap } = cfg.settings;
  if (!caps_enabled || cap === null || !primary) return null;
  const rows = chainRows(key, primary, fallback, care, cfg, maxSearches);
  const paid = rows.filter((x) => x.p > 0);
  if (!paid.length) return null;
  const folga = hasFolga(primary, care) || (fallback && hasFolga(fallback, care)) ? FOLGA : "";
  const fullNeed = Math.max(...paid.map((x) => x.full));
  const list = (items: typeof paid, pick: (x: (typeof paid)[number]) => number) => listPt(items.map((x) => `${x.use} (US$ ${usd(pick(x))})`));
  const head = `Teto por chamada de US$ ${usd(cap)} abaixo`;
  if (!fallback) {
    const over = paid.filter((x) => x.full > cap + 1e-9);
    if (!over.length) return null;
    return `${head} de duas tentativas da principal ${aiName(primary)} em ${list(over, (x) => x.full)}${folga}: depois de uma falha cobrada da principal (resposta fora do formato), a nova tentativa não roda e o trabalho falha. Para não parar no teto por chamada, o teto precisa ser de pelo menos US$ ${cents(fullNeed)}.`;
  }
  if (!paid.some((x) => x.r > 0)) return null;
  const noRescue = paid.filter((x) => x.rescue > cap + 1e-9);
  if (noRescue.length) {
    const rescueNeed = Math.max(...noRescue.map((x) => x.rescue));
    return `${head} da principal ${aiName(primary)} mais a reserva ${aiName(fallback)} em ${list(noRescue, (x) => x.rescue)}${folga}: depois de uma falha cobrada da principal (resposta cortada ou tempo esgotado), a reserva não socorre e o trabalho falha. Para a reserva socorrer, o teto por chamada precisa ser de pelo menos US$ ${cents(rescueNeed)}; para socorrer também depois da nova tentativa (resposta fora do formato), pelo menos US$ ${cents(fullNeed)}.`;
  }
  const over = paid.filter((x) => x.full > cap + 1e-9);
  if (!over.length) return null;
  return `${head} de duas tentativas da principal ${aiName(primary)} mais a reserva ${aiName(fallback)} em ${list(over, (x) => x.full)}${folga}: depois de uma resposta fora do formato e da nova tentativa, a reserva não socorre e o trabalho falha. Para não parar no teto por chamada, o teto precisa ser de pelo menos US$ ${cents(fullNeed)}.`;
}
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
      max_searches: num(f.max_searches),
    };
  }
  const s = raw?.settings ?? {};
  const prices: ModelPrice[] = (raw?.prices ?? []).map((p: any) => ({
    provider: p.provider,
    model: p.model,
    input_per_mtok: Number(p.input_per_mtok),
    output_per_mtok: Number(p.output_per_mtok),
    per_search_usd: num(p.per_search_usd),
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
      // IA02: teto geral do mês (tudo junto); só avisa na tela, nada para por causa dele. Nasce desligado e sem valor.
      overall_monthly_cap_usd: num(s.overall_monthly_cap_usd),
      overall_cap_enabled: s.overall_cap_enabled === true,
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
    case "staziamed_pedagogia":
      return "verificacao";
    case "qanalysis":
    case "qreanalysis":
      return "engenharia_reversa";
    case "source_search":
      return "busca_fontes";
    case "source_change":
      return "analise_mudancas";
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
 * A função de busca na internet (busca_fontes) não tem modelo nas variáveis: sem configuração salva fica desligada (null).
 */
export function envFallbackRef(fn: AiFunctionKey, env: NodeJS.ProcessEnv = process.env, uiKind?: AiProviderId): ModelRef | null {
  if (requiresSavedConfig(fn)) return null; // a busca na internet e as Questões parecidas só rodam com configuração salva; as variáveis nunca as definem
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

/** Reserva das variáveis de ambiente (CONTENT_HUB_AI_FALLBACK_PROVIDER), usada quando a função não tem configuração salva. */
export function envReserveRef(primary: ModelRef | null, env: NodeJS.ProcessEnv = process.env): ModelRef | null {
  const id = (env.CONTENT_HUB_AI_FALLBACK_PROVIDER ?? "").trim();
  if (!isProviderId(id) || id === primary?.provider) return null;
  const model = (env[`CONTENT_HUB_${id.toUpperCase()}_MODEL`] ?? "").trim() || DEFAULT_MODELS[id];
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

/**
 * Problemas de uma ref: IA desligada, modelo fora da lista (não vazia) e modelo pago sem preço com os tetos ligados.
 * Para uma função de busca (`fn`): o Ollama não busca na internet, o Gemini não limita a busca aos sites oficiais e, com os tetos ligados, o modelo precisa de preço por busca
 * (sem ele, o teto não enxergaria o custo das buscas).
 */
export function refProblems(ref: ModelRef, cfg: AiConfig, fn?: AiFunctionKey): string[] {
  const out: string[] = [];
  const name = PROVIDER_NAMES[ref.provider] ?? ref.provider;
  const p = cfg.providers[ref.provider];
  const price = cfg.prices.find((x) => x.provider === ref.provider && x.model === ref.model);
  if (p?.enabled !== true) out.push(`${name} está desligada na Central de IAs.`);
  if (p && p.models.length > 0 && !p.models.some((m) => m.id === ref.model)) out.push(`${name} ${ref.model}: modelo não está mais na lista.`);
  if (cfg.settings.caps_enabled && ref.provider !== "ollama" && !price) {
    out.push(`${name} ${ref.model}: sem preço cadastrado, e os tetos estão ligados.`);
  }
  if (fn && isSearchFunction(fn)) {
    if (ref.provider === "ollama") out.push("Ollama não busca na internet.");
    else if (ref.provider === "gemini") out.push(SEARCH_NO_GEMINI);
    else if (cfg.settings.caps_enabled && price && (price.per_search_usd ?? null) === null) {
      out.push(`${name} ${ref.model}: sem preço por busca cadastrado, e os tetos estão ligados.`);
    }
  }
  return out;
}

export function validateFunctionConfig(fc: FunctionConfig, cfg: AiConfig, opts: { requirePrice?: boolean } = {}): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const add = (m: string) => {
    if (!problems.includes(m)) problems.push(m);
  };

  const checkRef = (ref: ModelRef) => {
    for (const m of refProblems(ref, cfg, fc.key)) add(m);
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

  // busca na internet: só o modo sozinha (principal + reserva) e um máximo de buscas inteiro de 1 a 10 (nulo: o padrão)
  if (isSearchFunction(fc.key)) {
    if (fc.mode !== "sozinha") add("A busca de fontes oficiais só usa o modo sozinha.");
    const max = fc.max_searches;
    if (max !== null && max !== undefined && !(Number.isInteger(max) && max >= 1 && max <= 10)) add("Máximo de buscas por pedido: de 1 a 10.");
  }

  // modelo pago sem preço (IA09). Com os tetos ligados, refProblems já bloqueia. Com os tetos desligados o gasto dele apareceria
  // como US$ 0: ao SALVAR a função (requirePrice, a rota) é problema, porque o preço é exigido para ligar o modelo; no que já está
  // salvo e rodando é só aviso, porque um problema aqui pararia uma função que hoje funciona (o maestro não olha este aviso)
  if (!cfg.settings.caps_enabled) {
    const seen = new Set<string>();
    for (const r of [fc.primary, fc.fallback, ...reviewers]) {
      if (!r || !lacksPrice(r, cfg) || seen.has(`${r.provider}:${r.model}`)) continue;
      seen.add(`${r.provider}:${r.model}`);
      if (opts.requirePrice) add(noPriceProblem(r));
      else warnings.push(noPriceWarning(r));
    }
  }

  // busca sem preço por busca e com os tetos desligados: roda, mas as buscas aparecem como US$ 0 no gasto (com os tetos ligados
  // isso já é problema, em refProblems)
  if (isSearchFunction(fc.key) && !cfg.settings.caps_enabled) {
    const seen = new Set<string>();
    for (const r of [fc.primary, fc.fallback]) {
      if (!r || r.provider === "ollama" || seen.has(`${r.provider}:${r.model}`)) continue;
      seen.add(`${r.provider}:${r.model}`);
      const pr = priceOf(cfg, r);
      if (pr && (pr.per_search_usd ?? null) === null) {
        warnings.push(`${aiName(r)}: sem preço por busca cadastrado. As buscas aparecem como US$ 0 no gasto até o preço ser cadastrado (${PRICE_WHERE}).`);
      }
    }
  }

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
        ? `No processamento a Verificação usa só a IA principal e a reserva (sempre de outra empresa); ${who} só rodam na conferência de rascunhos feita por comando.`
        : `Nesta etapa a função usa só a IA principal e a reserva: ${who} ainda não rodam.`
    );
  }
  // teto por chamada abaixo de uma chamada típica: avisa antes, em vez de o trabalho parar sem explicação. Conferentes e membros
  // só rodam na conferência de rascunhos da Verificação (maestroRoleProvider), com o perfil dela; fora da Verificação o uso real
  // chama só a principal e a reserva, e o aviso deles mandava subir o teto por uma chamada que não existe (revisão rodada 5)
  const uses = typicalCallsOf(fc.key, fc.max_searches);
  const others = fc.key !== "verificacao" ? null : fc.mode === "linha" ? "conferente" : fc.mode === "comite" ? "membro" : null;
  const members: CapMember[] = [
    ...(fc.primary ? [{ ref: fc.primary, role: "principal" as const, calls: uses, care: fc.care }] : []),
    ...(fc.fallback ? [{ ref: fc.fallback, role: "reserva" as const, calls: uses, care: fc.care }] : []),
    ...(others ? reviewers.map((ref) => ({ ref, role: others, calls: [DRAFT_REVIEW_CALL], care: undefined })) : []),
  ];
  for (const w of perRunCapWarnings(members, cfg)) if (!warnings.includes(w)) warnings.push(w);
  // depois de uma falha cobrada da principal: a nova tentativa e a reserva com o gasto já feito (rodada 4)
  const chain = failureChainWarning(fc.key, fc.primary, fc.fallback, fc.care, cfg, fc.max_searches);
  if (chain && !warnings.includes(chain)) warnings.push(chain);
  return { problems, warnings };
}

export interface FunctionCheck {
  source: "banco" | "variaveis";
  ready: boolean;
  ref: ModelRef | null;
  problems: string[];
  warnings: string[];
}

export const FUNCTION_KEYS: AiFunctionKey[] = ["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes", "similaridade", "analise_mudancas"];

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

/**
 * Situação de cada uma das 8 funções: pronta ou o motivo. Função sem configuração salva usa as variáveis de ambiente, menos a
 * de busca na internet, que sem configuração fica desligada.
 */
export function functionChecks(cfg: AiConfig, env: NodeJS.ProcessEnv = process.env): Record<AiFunctionKey, FunctionCheck> {
  const out = {} as Record<AiFunctionKey, FunctionCheck>;
  for (const key of FUNCTION_KEYS) {
    const saved = cfg.functions[key];
    if (saved) {
      out[key] = savedFunctionCheck(saved, cfg, env);
      continue;
    }
    if (requiresSavedConfig(key)) {
      out[key] = { source: "variaveis", ready: false, ref: null, problems: [SEARCH_OFF], warnings: [] };
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
      // a reserva das variáveis (CONTENT_HUB_AI_FALLBACK_PROVIDER), a mesma que o maestro usa sem configuração salva
      const reserve = envReserveRef(ref, env);
      // modelo pago sem preço, com os tetos desligados (com eles ligados é problema, acima): o gasto aparece como US$ 0 (IA09)
      if (!cfg.settings.caps_enabled) for (const r of [ref, reserve]) if (r && lacksPrice(r, cfg)) warnings.push(noPriceWarning(r));
      const uses = TYPICAL_CALLS[key] ?? [];
      warnings.push(...perRunCapWarnings([{ ref, role: "principal", calls: uses, care: undefined }, ...(reserve ? [{ ref: reserve, role: "reserva" as const, calls: uses, care: undefined }] : [])], cfg));
      const chain = failureChainWarning(key, ref, reserve, undefined, cfg);
      if (chain) warnings.push(chain);
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
