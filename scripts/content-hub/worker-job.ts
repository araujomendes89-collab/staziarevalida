/**
 * Processamento da Central de Conteúdo como TAREFA (Google Cloud Run Job): esvazia a fila durável (ch_jobs) do Supabase,
 * confere as fontes oficiais vencidas e termina. O agendador do Google dispara a tarefa de tempos em tempos; com a fila
 * vazia ela sai em segundos, então só se paga pelo tempo de processamento de verdade.
 *
 *   CONTENT_HUB_JOB_BUDGET_MIN   tempo máximo pegando trabalho novo (padrão 50; a tarefa tem 60 min no Cloud Run)
 *   CONTENT_HUB_STALE_SECONDS    depois de quanto tempo sem sinal um trabalho "rodando" volta para a fila (padrão 1800,
 *                                acima dos 20 min que cada faixa de páginas pode levar)
 *
 * Mesmas regras do servidor: Supabase obrigatório em produção, chaves só no ambiente da tarefa.
 */
import { buildContentHubDeps } from "../../server/contentHub/index";
import { createContentHubWorker } from "../../server/contentHub/worker";

const budgetMs = (Number(process.env.CONTENT_HUB_JOB_BUDGET_MIN) > 0 ? Number(process.env.CONTENT_HUB_JOB_BUDGET_MIN) : 50) * 60_000;
const staleSeconds = Number(process.env.CONTENT_HUB_STALE_SECONDS) > 0 ? Number(process.env.CONTENT_HUB_STALE_SECONDS) : 1800;

async function main() {
  const t0 = Date.now();
  const { deps, pending } = await buildContentHubDeps();
  if (!deps) {
    console.error(`[central] tarefa sem banco: ${pending}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[central] tarefa: banco ${deps.db.mode === "supabase" ? "Supabase" : "desenvolvimento"} · IA ${deps.ai.status.ready ? deps.ai.status.provider : `pendente (${deps.ai.status.pending})`} · gerador de PDF ${deps.renderer ? "pronto" : "indisponível"}`);
  const worker = createContentHubWorker(deps, { staleSeconds });
  let jobs = 0;
  while (Date.now() - t0 < budgetMs && (await worker.tick())) jobs++;
  const sources = await worker.checkSources();
  await deps.renderer?.close().catch(() => undefined);
  console.log(`[central] tarefa concluída: ${jobs} trabalho(s) da fila · fontes conferidas ${sources.checked} (mudaram ${sources.changed}, inacessíveis ${sources.unreachable}) · ${Math.round((Date.now() - t0) / 1000)} s`);
}

main()
  .catch((error) => {
    console.error(`[central] tarefa falhou: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
