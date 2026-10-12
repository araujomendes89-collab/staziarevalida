/**
 * Busca de fontes oficiais na fila (etapa `source_search` de ch_jobs, sem documento, `scope_key = "search:<id>"`).
 *
 *   1. lê a busca e os sites ativos da lista (ch_worker_source_search_get);
 *   2. chama a função "Busca de fontes oficiais" (busca_fontes) da Central de IAs pelo maestro (tetos, preço por busca e registro
 *      de chamadas valem); a resposta fica guardada no checkpoint do trabalho ANTES de qualquer download;
 *   3. confere cada achado no servidor (verifyFinding: lista de sites, download, SHA-256, repetidos, trecho no texto) e grava os
 *      bons como candidatos "aguardando sua conferência"; o ponto em que está vai para o checkpoint depois de CADA achado;
 *   4. classifica a ATUALIDADE de cada candidato (mais nova, igual ou mais antiga que a biblioteca; currency.ts) e fecha a busca
 *      (concluída, nada encontrada, pendente ou falhou) com os números e os motivos de descarte.
 *
 * "Sempre as fontes mais atuais": o pedido à IA leva o título, o órgão, a versão e as datas das fontes VIGENTES do tema (só isso,
 * nenhum texto) e manda procurar a versão mais recente em vigor, conferir a data na própria página e dizer quando só achou versão
 * antiga. O servidor só aceita como "mais atual" a data que o documento ou a página comprova.
 *
 * Retomada: se o trabalho cai depois da resposta da IA (Cloud Run reinicia, erro de armazenamento), a nova rodada reaproveita a
 * resposta guardada: não paga outra busca e não duplica candidatos. Nada do que é baixado volta para a IA. Nada aqui passa de
 * "aguardando": quem decide é o administrador.
 */
import { runFunction } from "../../ai/maestro";
import { DEFAULT_MAX_SEARCHES, functionChecks, invalidateAiConfig, loadAiConfig } from "../../ai/config";
import { PROMPTS, asDocument } from "../ai/prompts";
import { aiAllowed, registerPromptsOnce } from "../ai/registry";
import type { PipelineDeps, Job } from "../pipeline";
import type { OfficialDomain } from "./officialDomains";
import { reconcileCurrency } from "./currency";
import { verifyFinding } from "./verify";

/** A busca não pode rodar agora (função desligada, IA ou teto): o trabalho fica pendente, sem gastar tentativa. */
export class SearchPending extends Error {}
/** A busca falhou de um jeito que repetir não resolve (a IA não respondeu): o trabalho morre, sem nova tentativa paga. */
export class SearchFailed extends Error {}

const FINAL = ["concluida", "nada_encontrado", "falhou"];

interface SearchRow {
  id: string;
  requested_by: string;
  area: string | null;
  theme: string;
  free_text: string | null;
  status: string;
  domains: OfficialDomain[];
}

interface Discard {
  link: string;
  titulo: string;
  motivo: string;
}

interface Saved {
  documentos: unknown[];
  observacao: string | null;
  run_id: string;
  provider: string;
  model: string;
  web_searches: number;
  cost_usd: number;
  seen_urls: string[];
}

/** AAAA-MM-DD no fuso de Brasília (a data de hoje que a IA recebe). */
export function todayBR(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function runSourceSearch(
  deps: PipelineDeps,
  job: Job,
  io: { checkpoint(data: Record<string, unknown>): Promise<void>; metrics: Record<string, unknown> }
): Promise<void> {
  const searchId = job.scope_key.startsWith("search:") ? job.scope_key.slice("search:".length) : "";
  if (!searchId) throw new SearchFailed("Trabalho de busca sem identificação da busca.");
  const db = deps.db;
  const update = (patch: Record<string, unknown>) => db.service("ch_worker_source_search_update", { p_search_id: searchId, p_patch: patch });
  const row = await db.service<SearchRow | null>("ch_worker_source_search_get", { p_search_id: searchId });
  if (!row) throw new SearchFailed("Busca não encontrada.");
  if (FINAL.includes(row.status)) return; // já terminou (trabalho repetido): nada a fazer

  const cp = (job.checkpoint ?? {}) as { ai?: Saved; done?: number; verified?: number; discarded?: Discard[] };
  let saved = cp.ai ?? null;

  // ---- 1. a IA procura (só uma vez: a resposta fica no checkpoint). Retomada confere antes de exigir a função pronta (F12).
  if (!saved) {
    invalidateAiConfig(db);
    const checks = functionChecks(await loadAiConfig(db), process.env);
    const ready = checks.busca_fontes;
    const stop = async (why: string): Promise<never> => {
      await update({ status: "pendente", message: why.slice(0, 1000) });
      throw new SearchPending(why);
    };
    if (!ready.ready) await stop(ready.problems.join(" ") || "A função Busca de fontes oficiais não está pronta.");
    const allowed = await aiAllowed(db);
    if (!allowed.ok) await stop(allowed.why);

    await update({ status: "buscando", message: null });
    await registerPromptsOnce(db);
    const prompt = PROMPTS.source_search;
    const now = (deps.web?.now ?? (() => new Date()))();
    // fontes vigentes do tema na biblioteca (título, órgão, versão, datas): a IA procura versão mais nova delas. Servidor novo com
    // SQL antigo (função ausente): segue sem a lista, a busca não pode parar por isso.
    const library = await db.service<unknown[]>("ch_worker_source_library_for_theme", { p_theme: row.theme }).catch(() => []);
    const sites = row.domains.map((d) => ({ endereco: d.address, instituicao: d.institution, tipo: d.kind }));
    const result = await runFunction<{ documentos: unknown[]; observacao: string | null }>(
      // a simulação de desenvolvimento nunca é usada aqui: busca na internet só com IA de verdade
      { db, makeProviderFor: deps.aiMaker, mockProvider: null },
      "busca_fontes",
      {
        promptId: prompt.id,
        promptVersion: prompt.version,
        system: prompt.system,
        schema: prompt.schema,
        schemaName: "staziamed_source_search",
        maxOutputTokens: 8192,
        input: `Responda no formato "source_search". O pedido segue como dado:\n${asDocument({ area: row.area, tema: row.theme, texto_livre: row.free_text, hoje: todayBR(now), sites, biblioteca: Array.isArray(library) ? library : [] })}`,
        // o máximo real vem da função (maestro); aqui só o padrão
        webSearch: { allowedDomains: row.domains.map((d) => d.address), maxSearches: DEFAULT_MAX_SEARCHES },
      },
      { source: "fontes", itemId: searchId, actorId: row.requested_by }
    );
    io.metrics.web_searches = result.webSearches;
    io.metrics.cost_usd = result.costUsd;
    const spent = { web_searches: result.webSearches, cost_usd: result.costUsd, run_id: result.runId };
    if (result.status === "parou_no_teto") {
      await update({ ...spent, status: "pendente", message: (result.message ?? "Teto de gasto atingido.").slice(0, 1000) });
      throw new SearchPending(result.message ?? "Teto de gasto atingido.");
    }
    if (result.status !== "ok" || !result.output) {
      const why = result.message ?? "A IA não respondeu.";
      await update({ ...spent, status: "falhou", message: why.slice(0, 1000) });
      throw new SearchFailed(why);
    }
    const ref = result.outputs[0]?.ref;
    saved = {
      documentos: Array.isArray(result.output.documentos) ? result.output.documentos : [],
      observacao: typeof result.output.observacao === "string" ? result.output.observacao : null,
      run_id: result.runId,
      provider: ref?.provider ?? "",
      model: ref?.model ?? "",
      web_searches: result.webSearches,
      cost_usd: result.costUsd,
      seen_urls: result.seenUrls,
    };
    // a resposta paga fica guardada antes de qualquer download
    await io.checkpoint({ ai: saved, done: 0, verified: 0, discarded: [] });
    cp.done = 0;
    cp.verified = 0;
    cp.discarded = [];
  }

  const found = saved.documentos.length;
  await update({
    status: "conferindo",
    provider: saved.provider || null,
    model: saved.model || null,
    run_id: saved.run_id,
    web_searches: saved.web_searches,
    cost_usd: saved.cost_usd,
    found_count: found,
  });

  // ---- 2. nada encontrado é um resultado válido
  if (found === 0) {
    await update({ status: "nada_encontrado", message: text(saved.observacao, 1000) || "A IA não encontrou documentos oficiais para este pedido." });
    return;
  }

  // ---- 3. confere cada achado, do ponto em que parou
  let done = Math.max(0, Math.min(Number(cp.done ?? 0) || 0, found));
  let verified = Number(cp.verified ?? 0) || 0;
  const discarded: Discard[] = Array.isArray(cp.discarded) ? cp.discarded : [];
  const resumedAt = done;
  for (let i = done; i < found; i++) {
    const item = saved.documentos[i] as Record<string, unknown> | null;
    // retomada: o achado em que a rodada anterior parou pode já ter virado candidato desta busca (o ponto não chegou a ser
    // guardado); conta como conferido, não como "Repetido" dele mesmo
    const link = text(item?.link, 2000);
    if (cp.ai && i === resumedAt && link && (await db.service<boolean>("ch_worker_source_search_has_candidate", { p_search_id: searchId, p_url: link }))) {
      verified++;
      done = i + 1;
      await io.checkpoint({ ai: saved, done, verified, discarded });
      await update({ verified_count: verified, discarded });
      continue;
    }
    const outcome = await verifyFinding(item, {
      db,
      storage: deps.storage,
      searchId,
      domains: row.domains,
      seenUrls: saved.seen_urls,
      fetchImpl: deps.web?.fetchImpl ?? fetch,
      checkHost: deps.web?.checkHost,
    });
    if (outcome.ok === true) verified++;
    else discarded.push({ link: text(item?.link, 2000), titulo: text(item?.titulo, 300), motivo: String((outcome as { motivo?: string }).motivo ?? "Descartado.").slice(0, 500) });
    done = i + 1;
    // o ponto em que está vai para o checkpoint depois de cada achado (queda no meio retoma daqui)
    await io.checkpoint({ ai: saved, done, verified, discarded });
    await update({ verified_count: verified, discarded });
  }

  // ---- 4. atualidade dos candidatos (a falha aqui não derruba uma busca já paga) e fecha a busca
  try {
    io.metrics.currency_updated = await reconcileCurrency(db, searchId);
  } catch (error) {
    io.metrics.currency_error = (error instanceof Error ? error.message : String(error)).slice(0, 200);
  }
  const note = text(saved.observacao, 600);
  const summary = `${verified} para conferir, ${discarded.length} descartado${discarded.length === 1 ? "" : "s"}.`;
  await update({ status: "concluida", verified_count: verified, discarded, message: note ? `${summary} ${note}` : summary });
  io.metrics.found = found;
  io.metrics.verified = verified;
  io.metrics.discarded = discarded.length;
}
