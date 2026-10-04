/**
 * Montagem da Central de Conteúdo no servidor.
 *
 *   Desenvolvimento: banco do servidor (.data/dev-db) e arquivos em .data/content-hub.
 *   Produção: Supabase com a chave de serviço (só no servidor). Sem essa configuração, as rotas
 *             respondem 503 com o motivo — nada é simulado.
 *
 * CONTENT_HUB_WORKER=0 desliga o worker neste processo (ex.: worker em processo separado).
 */
import { getDevDatabase } from "../devDb/devDatabase";
import { mockRespond } from "./ai/mock";
import { resolveProvider } from "./ai/provider";
import { devContentDb, localStorageDir, supabaseContentDb, supabaseStorage } from "./infra";
import type { PipelineDeps } from "./pipeline";
import { createRenderer } from "./render";
import { createContentHubRouter } from "./router";
import { createContentHubWorker, type ContentHubWorker } from "./worker";

export async function buildContentHubDeps(): Promise<{ deps: PipelineDeps | null; pending: string | null }> {
  const production = process.env.NODE_ENV === "production";
  const ai = resolveProvider(production ? undefined : mockRespond);
  try {
    const db = production ? supabaseContentDb() : devContentDb(() => getDevDatabase());
    const storage = production ? supabaseStorage() : localStorageDir();
    const renderer = await createRenderer();
    return { deps: { db, storage, ai, renderer, log: (m) => console.log(m) }, pending: null };
  } catch (error) {
    return { deps: null, pending: (error as Error).message };
  }
}

export async function setupContentHub() {
  const { deps, pending } = await buildContentHubDeps();
  let worker: ContentHubWorker | null = null;
  if (deps && process.env.CONTENT_HUB_WORKER !== "0") {
    worker = createContentHubWorker(deps);
    worker.start();
  }
  if (deps) console.log(`[central] IA: ${deps.ai.status.ready ? `${deps.ai.status.provider} (${deps.ai.status.model})` : `pendente — ${deps.ai.status.pending}`}`);
  else console.warn(`[central] desligada: ${pending}`);
  return { router: createContentHubRouter(deps, { pending, worker }), worker };
}
