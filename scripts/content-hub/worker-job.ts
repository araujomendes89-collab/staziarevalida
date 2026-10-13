/**
 * Processamento da Central de Conteúdo como TAREFA (Google Cloud Run Job): esvazia a fila durável (ch_jobs) do Supabase,
 * confere as fontes oficiais vencidas e termina. O agendador do Google dispara a tarefa de tempos em tempos; com a fila
 * vazia ela sai em segundos, então só se paga pelo tempo de processamento de verdade.
 *
 *   CONTENT_HUB_JOB_BUDGET_MIN   tempo máximo pegando trabalho novo (padrão 50; a tarefa tem 60 min no Cloud Run)
 *   CONTENT_HUB_STALE_SECONDS    depois de quanto tempo sem sinal um trabalho "rodando" volta para a fila (padrão 1800,
 *                                acima dos 20 min que cada faixa de páginas pode levar)
 *
 * Depois da fila e das fontes, gera os vetores que faltam para a busca por significado (quando ligada: embeddings.ts).
 *
 * Mesmas regras do servidor: Supabase obrigatório em produção, chaves só no ambiente da tarefa.
 */
import { buildContentHubDeps } from "../../server/contentHub/index";
import { aiAvailable, createContentHubWorker } from "../../server/contentHub/worker";
import { aiSummaryLine, probeProcessing, reportProcessing } from "../../server/contentHub/capabilities";
import { runScheduledReanalysis, type ScheduledReanalysis } from "../../server/contentHub/reanalysisRun";

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
  // o painel da Central mostra este relato (o servidor do site não processa); a IA é conferida na Central de IAs, com as chaves daqui
  const report = await probeProcessing(deps);
  console.log(`[central] tarefa: banco ${deps.db.mode === "supabase" ? "Supabase" : "desenvolvimento"} · ${aiSummaryLine(report.ai)} · gerador de PDF ${deps.renderer ? "pronto" : "indisponível"}`);
  if (report.pending.length) console.log(`[central] pendências do processamento: ${report.pending.join(" | ")}`);
  await reportProcessing(deps, report, { started_at: new Date(t0).toISOString() });
  const worker = createContentHubWorker(deps, { staleSeconds });
  // trabalhos parados por falta de IA voltam para a fila quando o dono liga alguma IA na Central de IAs
  if (await aiAvailable(deps)) await deps.db.service("ch_worker_unblock").catch(() => undefined);
  // questões parecidas: com a função ligada na Central de IAs, as questões que mudaram entram na fila (falhar aqui não derruba a tarefa)
  await deps.db.service("ch_worker_similarity_autoqueue").catch((error: Error) => console.error(`[central] questões parecidas: ${error.message.slice(0, 200)}`));
  let jobs = 0;
  while (Date.now() - t0 < budgetMs && (await worker.tick())) jobs++;
  const sources = await worker.checkSources();
  // Vigilância científica: retratações no Crossref (semanal por fonte, sem chave) e quarentena em dia (falhar aqui não derruba a tarefa)
  const identifiers = await worker.checkIdentifiers().catch((error: Error) => {
    console.error(`[central] retratações (Crossref): ${error.message.slice(0, 200)}`);
    return { checked: 0, retracted: 0 };
  });
  const pages = await worker.checkIndexPages().catch((error: Error) => {
    console.error(`[central] páginas-índice: ${error.message.slice(0, 200)}`);
    return { checked: 0, discovered: 0 };
  });
  await worker.vigilanceSync().catch((error: Error) => console.error(`[central] quarentena da vigilância: ${error.message.slice(0, 200)}`));
  // reanálise das questões cuja fonte mudou: só quando o administrador pediu na tela ou a "Análise automática" está ligada (falhar aqui não derruba a tarefa)
  const reanalysis: ScheduledReanalysis = await runScheduledReanalysis(deps).catch((error: Error) => {
    console.error(`[central] reanálise de questões: ${error.message.slice(0, 200)}`);
    return { ran: false, manual: false };
  });
  // busca por significado: os vetores que faltam, no tempo que sobrou (falhar aqui não derruba a tarefa)
  const vectors = await worker.embed({ deadline: t0 + budgetMs }).catch((error: Error) => {
    console.error(`[central] vetores da busca por significado: ${error.message.slice(0, 200)}`);
    return { embedded: 0, tokens: 0, costUsd: 0, error: error.message.slice(0, 200) };
  });
  await deps.renderer?.close().catch(() => undefined);
  // a busca por significado pode ter parado na rodada (erro de configuração do Google): o relato final mostra o motivo
  const finalReport = deps.embedder?.problem ? await probeProcessing(deps) : report;
  await reportProcessing(deps, finalReport, { started_at: new Date(t0).toISOString(), finished_at: new Date().toISOString(), jobs, sources, vectors, reanalysis: { ran: reanalysis.ran, manual: reanalysis.manual } });
  console.log(`[central] tarefa concluída: ${jobs} trabalho(s) da fila · fontes conferidas ${sources.checked} (mudaram ${sources.changed}, inacessíveis ${sources.unreachable}) · DOI conferidos ${identifiers.checked} (retratados ${identifiers.retracted}) · páginas-índice ${pages.checked} (documentos novos ${pages.discovered}) · vetores novos ${vectors.embedded} · reanálise ${reanalysis.ran ? `${reanalysis.report?.saved ?? 0} proposta(s)` : "não rodou"} · ${Math.round((Date.now() - t0) / 1000)} s`);
}

main()
  .catch((error) => {
    console.error(`[central] tarefa falhou: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
