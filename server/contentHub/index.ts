/**
 * Montagem da Central de Conteúdo no servidor.
 *
 *   Com o Supabase configurado (as mesmas chaves que fazem o app usar o Supabase): banco e
 *   arquivos do projeto, com a chave de serviço, que fica só no servidor.
 *   Sem Supabase, em desenvolvimento: banco do servidor (.data/dev-db) e arquivos em .data/content-hub.
 *   Sem Supabase, em produção: as rotas respondem 503 com o motivo — nada é simulado.
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

/** Mesma regra de src/novo/data/index.ts: com a URL e a chave pública, o app inteiro usa o Supabase. */
export function usesSupabase(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.VITE_SUPABASE_URL || env.SUPABASE_URL) && env.VITE_SUPABASE_ANON_KEY);
}

export async function buildContentHubDeps(): Promise<{ deps: PipelineDeps | null; pending: string | null }> {
  const production = process.env.NODE_ENV === "production";
  const remote = usesSupabase();
  if (!remote && production) {
    return { deps: null, pending: "Central de Conteúdo sem banco: configure o Supabase no servidor (SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY)." };
  }
  // A simulação de IA só existe com o banco de desenvolvimento: nunca grava no projeto real.
  const ai = resolveProvider(production || remote ? undefined : mockRespond);
  if (remote && (process.env.CONTENT_HUB_AI_PROVIDER ?? "").trim() === "mock") {
    ai.status.pending = "A simulação de IA só funciona com o banco de desenvolvimento. Com o Supabase, configure um provedor real (anthropic ou gemini).";
  }
  try {
    const db = remote ? supabaseContentDb() : devContentDb(() => getDevDatabase());
    const storage = remote ? supabaseStorage() : localStorageDir();
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
  if (deps) console.log(`[central] banco: ${deps.db.mode === "supabase" ? "Supabase" : "desenvolvimento (.data/dev-db)"}`);
  if (deps) console.log(`[central] IA: ${deps.ai.provider?.isMock ? "simulação" : "definida em Administração › Central de IAs"}`);
  else console.warn(`[central] desligada: ${pending}`);
  return { router: createContentHubRouter(deps, { pending, worker }), worker, deps, pending };
}
