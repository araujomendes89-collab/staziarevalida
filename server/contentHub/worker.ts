/**
 * Worker da Central de Conteúdo: consome a fila durável (ch_jobs) e confere periodicamente as
 * fontes oficiais monitoradas. Trabalho interrompido (queda do servidor) volta para a fila
 * sozinho pelo tempo-limite de ch_worker_claim; tentativas são limitadas por trabalho.
 */
import crypto from "crypto";
import { runJob, type Job, type PipelineDeps } from "./pipeline";
import { snapshotPassages, type Passage } from "./sourceDiff";
import { compareSnapshots } from "./sourceCompare";

export interface WorkerOptions {
  pollMs?: number;
  staleSeconds?: number;
  watchEveryMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ContentHubWorker {
  readonly running: boolean;
  tick(): Promise<boolean>;
  drain(max?: number): Promise<number>;
  checkSources(): Promise<{ checked: number; changed: number; unreachable: number }>;
  start(): void;
  stop(): Promise<void>;
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
        const res = await fetchImpl(w.url, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        const type = res.headers.get("content-type") ?? "";
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
      if (Date.now() - lastWatch > watchEveryMs) {
        lastWatch = Date.now();
        busy = checkSources();
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
    start() {
      if (running) return;
      running = true;
      void (async () => {
        // IA disponível: o que estava pendente por falta de configuração volta para a fila.
        if (deps.ai.provider) await deps.db.service("ch_worker_unblock").catch(() => undefined);
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
