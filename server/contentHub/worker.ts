/**
 * Worker da Central de Conteúdo: consome a fila durável (ch_jobs) e confere periodicamente as
 * fontes oficiais monitoradas. Trabalho interrompido (queda do servidor) volta para a fila
 * sozinho pelo tempo-limite de ch_worker_claim; tentativas são limitadas por trabalho.
 */
import crypto from "crypto";
import { runJob, type Job, type PipelineDeps } from "./pipeline";
import { snapshotPassages, type Passage } from "./sourceDiff";
import { compareSnapshots } from "./sourceCompare";
import { embedderAllowed, embedPendingPassages } from "./embeddings";
import { fetchBytes, type Resolver } from "../podcasts/extract";
import { linkProblem, OFFICIAL_FETCH } from "./sources/officialDomains";
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

/** Limites do download do monitor de fontes: os mesmos do download das Fontes oficiais (50 MB), com 30 s para tudo. */
const WATCH_FETCH = { ...OFFICIAL_FETCH, timeoutMs: 30_000 } as const;

export interface ContentHubWorker {
  readonly running: boolean;
  tick(): Promise<boolean>;
  drain(max?: number): Promise<number>;
  checkSources(): Promise<{ checked: number; changed: number; unreachable: number }>;
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

  const tick = async () => {
    const job = await deps.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: staleSeconds });
    if (!job) return false;
    await runJob(deps, job);
    return true;
  };

  const checkSources = async () => {
    const due = await deps.db.service<{ source_id: string; url: string }[]>("ch_worker_watch_due");
    let changed = 0;
    let unreachable = 0;
    for (const w of due) {
      let hash: string | null = null;
      let snapshot: Passage[] | null = null;
      try {
        if (!/^https:\/\//.test(w.url)) throw new Error("endereço sem https");
        // Mesmas proteções de rede das Fontes oficiais, mas sem lista de sites (o endereço pode ser de qualquer órgão): nada de
        // endereço interno (conexão ao IP já conferido), cada redirecionamento (até 3) conferido de novo (https, porta 443,
        // sem usuário e senha), corpo lido em pedaços e cortado em 50 MB, 30 s para tudo.
        const got = await fetchBytes(w.url, fetchImpl, {
          ...WATCH_FETCH,
          checkUrl: (u) => linkProblem(u.href),
          checkHost: opts.checkHost,
          resolver: opts.resolver,
          acceptAnyType: true,
          statusMessage: (status) => `HTTP ${status}`,
        });
        const body = got.body;
        const type = got.contentType;
        hash = publicationHash(body, type);
        if (!/pdf/i.test(type) && body.subarray(0, 5).toString("latin1") !== "%PDF-") snapshot = snapshotPassages(body.toString("utf8"), type);
      } catch (error) {
        deps.log?.(`[central] fonte inacessível (${w.url}): ${(error as Error).message}`);
      }
      const r = await deps.db.service<{ changed: boolean } | null>("ch_worker_watch_result", { p_source_id: w.source_id, p_hash: hash, p_status: hash ? "ok" : "unreachable" });
      if (!hash) unreachable++;
      else if (r?.changed) changed++;
      if (hash && snapshot) {
        // HTML/texto: guarda a leitura e, se mudou, compara o conteúdo com a anterior (PDF segue só com a impressão digital)
        try {
          const before = await deps.db.service<Passage[] | null>("ch_worker_watch_snapshot", { p_source_id: w.source_id, p_passages: snapshot });
          if (r?.changed && before?.length) await compareSnapshots(deps.db, w.source_id, before, snapshot, { new: hash });
        } catch (error) {
          deps.log?.(`[central] comparação de conteúdo falhou (${w.url}): ${(error as Error).message}`);
        }
      }
    }
    return { checked: due.length, changed, unreachable };
  };

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
