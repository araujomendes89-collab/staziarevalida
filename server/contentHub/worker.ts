/**
 * Worker da Central de Conteúdo: consome a fila durável (ch_jobs) e confere periodicamente as
 * fontes oficiais monitoradas. Trabalho interrompido (queda do servidor) volta para a fila
 * sozinho pelo tempo-limite de ch_worker_claim; tentativas são limitadas por trabalho.
 */
import crypto from "crypto";
import { runJob, type Job, type PipelineDeps } from "./pipeline";
import type { Passage } from "./sourceDiff";
import { compareSnapshots } from "./sourceCompare";
import { embedderAllowed, embedPendingPassages } from "./embeddings";
import type { Resolver } from "../podcasts/extract";
import type { OfficialDomain } from "./sources/officialDomains";
import { checkDoi, readIndexPage, readPublication, type WatchDue } from "./vigilance/watch";
import { reconcilePendingCurrency } from "./sources/currency";

export interface WorkerOptions {
  pollMs?: number;
  staleSeconds?: number;
  watchEveryMs?: number;
  fetchImpl?: typeof fetch;
  /** Só para testes: resolve o nome do servidor (padrão: DNS do sistema), para simular endereços sem rede. */
  resolver?: Resolver;
  /** Só para testes: substitui a conferência do servidor (no uso real, nunca é informado). */
  checkHost?: (host: string) => Promise<void>;
}

export interface ContentHubWorker {
  readonly running: boolean;
  tick(): Promise<boolean>;
  drain(max?: number): Promise<number>;
  checkSources(): Promise<{ checked: number; changed: number; unreachable: number }>;
  /** Retratações no Crossref (DOI das fontes, semanal). */
  checkIdentifiers(): Promise<{ checked: number; retracted: number }>;
  /** Páginas-índice oficiais (documento novo por tema). */
  checkIndexPages(): Promise<{ checked: number; discovered: number }>;
  /** Quarentena da Vigilância científica em dia com a nota das fontes (sem IA). */
  vigilanceSync(): Promise<{ quarentena_nova: number; quarentena_fechada: number }>;
  /** Refaz a classificação de atualidade pendente (sem IA). Devolve quantas buscas foram refeitas. */
  reconcilePendingCurrency(): Promise<number>;
  /** Vetores dos trechos que faltam (busca por significado); sem a busca ligada, não faz nada. */
  embed(opts?: { max?: number; deadline?: number }): Promise<{ embedded: number; tokens: number; costUsd: number }>;
  start(): void;
  stop(): Promise<void>;
}

/**
 * Há IA para destravar a fila? A simulação (só desenvolvimento) ou alguma IA ligada na Central de IAs.
 * Uma chave nas variáveis de ambiente não autoriza nada sozinha. Com os tetos ligados e o gasto do mês já no teto mensal
 * a fila não é destravada (senão cada rodada reenfileira os parados e eles bloqueiam de novo no teto, gravando linhas de
 * teto): volta quando o mês virar ou o teto subir. Erro ao ler o banco = não.
 */
export async function aiAvailable(deps: PipelineDeps): Promise<boolean> {
  if (deps.ai.provider?.isMock === true) return true;
  try {
    const cfg = await deps.db.service<{ providers?: { enabled?: boolean }[]; settings?: { caps_enabled?: boolean; monthly_cap_usd?: number | string | null } } | null>("ch_worker_ai_config");
    if (!cfg?.providers?.some((p) => p.enabled)) return false;
    const cap = cfg.settings?.caps_enabled === true && cfg.settings.monthly_cap_usd != null ? Number(cfg.settings.monthly_cap_usd) : NaN;
    if (Number.isFinite(cap)) {
      const spent = Number(await deps.db.service<unknown>("ch_worker_ai_month_spend", { p_now: new Date().toISOString() })) || 0;
      if (spent >= cap) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Conteúdo comparável de uma publicação: bytes de um PDF; texto visível de uma página HTML. */
export function publicationHash(body: Buffer, contentType: string): string {
  let data: Buffer | string = body;
  if (!/pdf/i.test(contentType) && body.subarray(0, 5).toString("latin1") !== "%PDF-") {
    data = body
      .toString("utf8")
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function createContentHubWorker(deps: PipelineDeps, opts: WorkerOptions = {}): ContentHubWorker {
  const pollMs = opts.pollMs ?? 3000;
  const staleSeconds = opts.staleSeconds ?? 900;
  const watchEveryMs = opts.watchEveryMs ?? 30 * 60_000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let running = false;
  let busy: Promise<unknown> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let lastWatch = 0;
  let lastPending = 0;
  let lastEmbed = 0;
  let lastSimilarity = 0;

  const tick = async () => {
    const job = await deps.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: staleSeconds });
    if (!job) return false;
    await runJob(deps, job);
    return true;
  };

  const net = () => ({ fetchImpl, resolver: opts.resolver, checkHost: opts.checkHost });

  // Vigia (Vigilância científica, migração 9920): lote de fontes vencidas, só sites da lista oficial ativa, sem IA.
  const checkSources = async () => {
    const due = await deps.db.service<WatchDue[]>("ch_worker_watch_due", { p_limit: 40 });
    if (!due.length) return { checked: 0, changed: 0, unreachable: 0 };
    const domains = await deps.db.service<OfficialDomain[]>("ch_worker_vigilance_domains");
    let changed = 0;
    let unreachable = 0;
    for (const w of due) {
      const reading = await readPublication(w, domains, net());
      if (reading.report.status === "unreachable") deps.log?.(`[central] fonte inacessível (${w.url}): ${reading.report.error}`);
      const r = await deps.db.service<{ changed: boolean } | null>("ch_worker_watch_report", { p_source_id: w.source_id, p_report: reading.report });
      if (reading.report.status === "unreachable") unreachable++;
      else if (r?.changed) changed++;
      if (reading.snapshot && reading.report.status === "ok") {
        // HTML/texto: guarda a leitura e, se mudou, compara o conteúdo com a anterior (PDF segue só com as impressões digitais)
        try {
          const before = await deps.db.service<Passage[] | null>("ch_worker_watch_snapshot", { p_source_id: w.source_id, p_passages: reading.snapshot });
          if (r?.changed && before?.length) await compareSnapshots(deps.db, w.source_id, before, reading.snapshot, { new: String(reading.report.hash) });
        } catch (error) {
          deps.log?.(`[central] comparação de conteúdo falhou (${w.url}): ${(error as Error).message}`);
        }
      }
    }
    return { checked: due.length, changed, unreachable };
  };

  // Retratações: DOI das fontes no Crossref (semanal por fonte, API pública sem chave).
  const checkIdentifiers = async () => {
    const due = await deps.db.service<{ source_id: string; doi: string }[]>("ch_worker_identifiers_due", { p_limit: 20 });
    let retracted = 0;
    for (const d of due) {
      const report = await checkDoi(d.doi, net());
      await deps.db.service("ch_worker_identifier_report", { p_source_id: d.source_id, p_report: report });
      if (report.status === "retratada") retracted++;
    }
    return { checked: due.length, retracted };
  };

  // Páginas-índice oficiais: documento novo que casa com as palavras-chave de um tema vira item da fila (sem IA).
  const checkIndexPages = async () => {
    const due = await deps.db.service<{ id: string; url: string }[]>("ch_worker_index_pages_due", { p_limit: 10 });
    if (!due.length) return { checked: 0, discovered: 0 };
    const domains = await deps.db.service<OfficialDomain[]>("ch_worker_vigilance_domains");
    let discovered = 0;
    for (const p of due) {
      const reading = await readIndexPage(p.url, domains, net());
      const r = await deps.db.service<{ avisos?: number } | null>("ch_worker_index_page_report", { p_page_id: p.id, p_report: reading });
      discovered += Number(r?.avisos ?? 0);
    }
    return { checked: due.length, discovered };
  };

  const vigilanceSync = () => deps.db.service<{ quarentena_nova: number; quarentena_fechada: number }>("ch_worker_vigilance_sync");

  const embed = async (o: { max?: number; deadline?: number } = {}) => {
    const embedder = await embedderAllowed(deps.db, deps.embedder);
    return embedder ? embedPendingPassages(deps.db, embedder, { ...o, log: deps.log }) : { embedded: 0, tokens: 0, costUsd: 0 };
  };

  // Falha seguida (ex.: chave do Supabase recusada): avisa uma vez, espera cada vez mais (até 5 min)
  // e avisa de novo quando volta ao normal. Nada de repetir a mesma linha a cada poucos segundos.
  let failures = 0;
  let lastError = "";
  const loop = async () => {
    if (!running) return;
    let worked = false;
    try {
      busy = tick();
      worked = Boolean(await busy);
      // verificar ao servir: alguém abriu uma questão com a fonte vencida; atende já, sem esperar a rodada de 30 minutos
      const requested = Date.now() - lastWatch > 10_000 && (await deps.db.service<number>("ch_worker_watch_requested")) > 0;
      if (requested || Date.now() - lastWatch > watchEveryMs) {
        lastWatch = Date.now();
        busy = checkSources();
        await busy;
        busy = checkIdentifiers().catch((error: Error) => deps.log?.(`[central] retratações (Crossref): ${error.message}`));
        await busy;
        busy = checkIndexPages().catch((error: Error) => deps.log?.(`[central] páginas-índice: ${error.message}`));
        await busy;
        busy = vigilanceSync().catch((error: Error) => deps.log?.(`[central] quarentena da vigilância: ${error.message}`));
        await busy;
      }
      // atualidade pendente (a classificação de uma busca falhou ou o SQL chegou depois): refaz, sem IA, a cada rodada de 30 minutos
      if (!worked && Date.now() - lastPending > watchEveryMs) {
        lastPending = Date.now();
        busy = reconcilePendingCurrency(deps.db, deps.log);
        await busy;
      }
      // fila vazia: vetores que faltam para a busca por significado (um lote por vez, no máximo a cada 2 minutos)
      if (!worked && deps.embedder && Date.now() - lastEmbed > 120_000) {
        lastEmbed = Date.now();
        busy = embed({ max: 200 });
        await busy;
      }
      // questões parecidas: com a função ligada na Central de IAs, o que mudou entra na fila sozinho (no máximo a cada 10 minutos)
      if (!worked && Date.now() - lastSimilarity > 10 * 60_000) {
        lastSimilarity = Date.now();
        busy = deps.db.service<boolean>("ch_worker_similarity_autoqueue").catch(() => false);
        await busy;
      }
      if (failures > 0) deps.log?.("[central] worker voltou ao normal.");
      failures = 0;
      lastError = "";
    } catch (error) {
      failures++;
      const message = (error as Error).message;
      if (message !== lastError) {
        lastError = message;
        deps.log?.(`[central] erro no worker: ${message} (novas tentativas com espera crescente, sem repetir este aviso)`);
      }
    } finally {
      busy = null;
    }
    const wait = failures > 0 ? Math.min(pollMs * 2 ** Math.min(failures, 7), 5 * 60_000) : worked ? 0 : pollMs;
    if (running) timer = setTimeout(loop, wait);
  };

  return {
    get running() {
      return running;
    },
    tick,
    async drain(max = 200) {
      let n = 0;
      while (n < max && (await tick())) n++;
      return n;
    },
    checkSources,
    checkIdentifiers,
    checkIndexPages,
    vigilanceSync,
    reconcilePendingCurrency: () => reconcilePendingCurrency(deps.db, deps.log),
    embed,
    start() {
      if (running) return;
      running = true;
      void (async () => {
        // IA disponível: o que estava pendente por falta de configuração volta para a fila.
        if (await aiAvailable(deps)) await deps.db.service("ch_worker_unblock").catch(() => undefined);
        void loop();
      })();
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      await busy?.catch(() => undefined);
      await deps.renderer?.close();
    },
  };
}
