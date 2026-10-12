/**
 * Estimativa de custo de IA de um documento (CC05). É o PIOR CASO, pela mesma conta dos tetos de gasto (callEstimateUsd: entrada em
 * caracteres ÷ 4 e a saída máxima que de fato vai para a IA), com o tamanho real do texto já lido do PDF. Não chama IA nenhuma e
 * não grava nada.
 *
 * Nada é inventado: as etapas cuja quantidade de chamadas já se sabe (classificar e extrair afirmações dependem só do texto lido)
 * têm valor; as seguintes dependem de quantas afirmações e temas a IA achar, e só ganham quantidade depois que as afirmações existem.
 * Até lá, a linha mostra o custo de UMA chamada ("cada afirmação conferida: até US$ X") e o total fica marcado como parcial.
 * Sem preço cadastrado para o modelo escolhido, o dinheiro não é calculado (o preço é cadastrado depois, por decisão do dono):
 * ficam os tokens.
 */
import { callEstimateUsd, effectiveMaxOut, envFallbackRef, loadAiConfig, type AiConfig, type AiFunctionKey, type ModelRef } from "../ai/config";
import type { ModelPrice } from "../ai/prices";
import { PROMPTS } from "./ai/prompts";
import { chunkBlocks, type Block } from "./pipeline";
import type { ContentDb } from "./infra";

const MAX_OUT = 8192;
/** Trechos que a conferência de uma afirmação recebe: até 6 de 2.500 caracteres mais a afirmação e as instruções (pipeline.ts). */
const EVIDENCE_PASSAGES_CHARS = 6 * 2500;
const CLASSIFY_TYPES = ["heading", "paragraph", "list", "table", "caption", "footnote"];
const CLAIM_TYPES = ["paragraph", "list", "table", "caption"];

export interface EstimateLine {
  step: "classify" | "claims" | "evidence" | "draft" | "materials" | "review_check";
  label: string;
  function: "criacao" | "verificacao";
  model: string | null;
  /** Quantidade de chamadas; nulo quando ainda não dá para saber (depende das afirmações que a IA vai achar). */
  calls: number | null;
  /** Entrada e saída no pior caso, somadas (nulo junto com `calls`). */
  input_tokens: number | null;
  output_tokens: number | null;
  /** Custo no pior caso desta linha, ou nulo (quantidade desconhecida ou modelo sem preço). */
  usd: number | null;
  /** Custo de UMA chamada típica da etapa (quando há preço). */
  per_call_usd: number | null;
}

export interface DocumentCostEstimate {
  document_id: string;
  pages: number | null;
  text_chars: number;
  claims: number | null;
  themes: number | null;
  lines: EstimateLine[];
  /** Soma das linhas com valor. */
  total_usd: number | null;
  /** O total deixa de fora etapas ainda sem quantidade ou sem preço. */
  partial: boolean;
  /** Modelos sem preço cadastrado (o dinheiro dessas etapas não é calculado). */
  missing_prices: string[];
  /** Funções da Central de IAs sem modelo escolhido. */
  no_model: string[];
  /** Gasto já registrado para este documento (ai_calls), se o banco já tem a atualização. */
  spent_usd: number | null;
  /** Teto por documento (estrutura desligada por padrão). */
  cap: { enabled: boolean; usd: number | null } | null;
  notes: string[];
}

const usable = (b: Block) => b.status === "extracted" && (b.text ?? "").replace(/\s+/g, "").length > 0;
const sumChars = (blocks: Block[], max = Infinity) => blocks.reduce((n, b) => n + Math.min((b.text ?? "").length, max), 0);

function modelOf(cfg: AiConfig, fn: AiFunctionKey): { ref: ModelRef | null; care?: string; price: ModelPrice | null } {
  const fc = cfg.functions[fn];
  const ref = fc?.primary ?? envFallbackRef(fn);
  const price = ref ? cfg.prices.find((p) => p.provider === ref.provider && p.model === ref.model) ?? null : null;
  return { ref, care: fc?.care, price };
}

/** Lê o que o banco tiver da atualização do teto; banco sem ela devolve nulo (a estimativa segue sem esses dados). */
async function optional<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export async function estimateDocumentCost(db: ContentDb, documentId: string): Promise<DocumentCostEstimate> {
  const doc = await db.service<{ page_count: number | null } | null>("ch_worker_document", { p_document_id: documentId });
  if (!doc) throw new Error("Documento não encontrado.");
  const blocks = await db.service<Block[]>("ch_worker_blocks", { p_document_id: documentId });
  const cfg = await loadAiConfig(db);
  const creation = modelOf(cfg, "criacao");
  const checking = modelOf(cfg, "verificacao");
  const catalog = await optional(() => db.service<unknown>("ch_worker_catalog"));
  const catalogChars = catalog ? JSON.stringify(catalog).length : 0;
  const claims = await optional(() => db.service<{ status: string; statement: string; proposed_text: string | null; theme_node_id: string | null }[]>("ch_worker_claims", { p_document_id: documentId }));

  const missing = new Set<string>();
  const noModel = new Set<string>();
  const line = (step: EstimateLine["step"], label: string, fn: "criacao" | "verificacao", system: number, inputs: number[] | null, perCallChars: number): EstimateLine => {
    const m = fn === "criacao" ? creation : checking;
    if (!m.ref) noModel.add(fn === "criacao" ? "Criação" : "Verificação");
    const price = m.price;
    if (m.ref && !price && m.ref.provider !== "ollama") missing.add(`${m.ref.provider}/${m.ref.model}`);
    const outEach = m.ref ? effectiveMaxOut(m.ref, MAX_OUT, m.care) : MAX_OUT;
    const costOf = (chars: number) => (m.ref && (price || m.ref.provider === "ollama") ? callEstimateUsd(m.ref, price, chars, MAX_OUT, m.care) : null);
    const perCall = costOf(system + perCallChars);
    if (!inputs) return { step, label, function: fn, model: m.ref?.model ?? null, calls: null, input_tokens: null, output_tokens: null, usd: null, per_call_usd: perCall };
    const parts = inputs.map((chars) => costOf(system + chars));
    return {
      step,
      label,
      function: fn,
      model: m.ref?.model ?? null,
      calls: inputs.length,
      input_tokens: inputs.reduce((n, chars) => n + Math.ceil((system + chars) / 4), 0),
      output_tokens: inputs.length * outEach,
      usd: parts.every((p) => p != null) ? Number(parts.reduce((n, p) => n + (p as number), 0).toFixed(6)) : null,
      per_call_usd: perCall,
    };
  };

  // etapas que dependem só do texto lido
  const classifyChunks = chunkBlocks(blocks.filter((b) => usable(b) && CLASSIFY_TYPES.includes(b.type)), 6000);
  const claimChunks = chunkBlocks(blocks.filter((b) => usable(b) && CLAIM_TYPES.includes(b.type)), 5000);
  const lines: EstimateLine[] = [
    line("classify", "Classificar o texto por tema", "criacao", PROMPTS.classify.system.length + catalogChars, classifyChunks.map((c) => sumChars(c, 2500)), 6000),
    line("claims", "Extrair as afirmações clínicas", "criacao", PROMPTS.claims.system.length, claimChunks.map((c) => sumChars(c)), 5000),
  ];

  // etapas que dependem das afirmações achadas
  const known = claims && claims.length > 0 ? claims : null;
  const texts = (known ?? []).map((c) => (c.proposed_text ?? c.statement ?? "").length);
  const toCheck = known ? known.filter((c) => c.status === "extracted") : null;
  const themeIds = known ? [...new Set(known.map((c) => c.theme_node_id).filter((t): t is string => !!t))] : null;
  const perTheme = known && themeIds ? themeIds.map((t) => known.reduce((n, c, i) => (c.theme_node_id === t ? n + texts[i] + 120 : n), 0)) : null;
  lines.push(
    line("evidence", "Conferir cada afirmação nas fontes oficiais", "verificacao", PROMPTS.evidence.system.length, toCheck ? toCheck.map((c) => (c.proposed_text ?? c.statement ?? "").length + EVIDENCE_PASSAGES_CHARS) : null, EVIDENCE_PASSAGES_CHARS + 300),
    line("draft", "Escrever o rascunho de cada tema", "criacao", PROMPTS.draft.system.length, perTheme, 3000),
    line("materials", "Resumo, flashcards e questões de cada tema", "criacao", PROMPTS.summary.system.length, perTheme ? perTheme.flatMap((chars) => [chars, chars, chars]) : null, 3000),
    line("review_check", "Revisão automática de cada rascunho", "verificacao", PROMPTS.review.system.length, perTheme ? perTheme.map((chars) => chars * 2) : null, 6000)
  );

  const priced = lines.filter((l) => l.usd != null);
  const total = priced.length ? Number(priced.reduce((n, l) => n + (l.usd as number), 0).toFixed(6)) : null;
  const partial = lines.some((l) => l.usd == null);
  const spent = await optional(() => db.service<number | string>("ch_worker_document_spend", { p_document_id: documentId }));
  const settings = await optional(() => db.service<{ document_cap_enabled: boolean; document_cap_usd: number | string | null }>("ch_worker_processing_settings"));
  const notes: string[] = [
    "É o pior caso (cada chamada usando o máximo que a IA pode devolver), pela mesma conta dos tetos de gasto. O custo real costuma ser menor e é gravado em Consumo e custo da IA.",
  ];
  if (!known) notes.push("As etapas de conferência, rascunho, materiais e revisão dependem de quantas afirmações e temas a IA achar no texto: a estimativa delas aparece depois da etapa de afirmações. Até lá, cada linha mostra o custo de uma chamada.");
  if (missing.size) notes.push(`Sem preço cadastrado para ${[...missing].join(", ")}: o valor em dólar dessas etapas não é calculado (os preços são cadastrados na Central de IAs).`);
  if (noModel.size) notes.push(`Sem IA escolhida na Central de IAs para: ${[...noModel].join(", ")}.`);
  return {
    document_id: documentId,
    pages: doc.page_count ?? null,
    text_chars: sumChars(blocks.filter(usable)),
    claims: known ? known.length : null,
    themes: themeIds ? themeIds.length : null,
    lines,
    total_usd: total,
    partial,
    missing_prices: [...missing],
    no_model: [...noModel],
    spent_usd: spent == null ? null : Number(spent),
    cap: settings ? { enabled: settings.document_cap_enabled === true, usd: settings.document_cap_usd == null ? null : Number(settings.document_cap_usd) } : null,
    notes,
  };
}
