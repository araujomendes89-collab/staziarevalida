/**
 * Vigilância científica: "Análise do que mudou" (etapa `source_change_analysis` de ch_jobs, sem documento,
 * scope_key = "vigilancia:<item>"). Só existe quando a EQUIPE pede no painel e a função analise_mudancas está ligada na Central
 * de IAs. A IA recebe só dados (metadados, versões candidatas e os trechos antes/depois já comparados pelo sistema) e devolve uma
 * SUGESTÃO que fica no próprio item da fila. Nada é publicado, nenhuma questão, gabarito ou aula muda (regra também no banco).
 * Sem texto comparável guardado (ex.: PDF mudou), não chama a IA (não gasta) e diz por quê.
 */
import { runFunction } from "../../ai/maestro";
import { functionChecks, invalidateAiConfig, loadAiConfig } from "../../ai/config";
import { PROMPTS, asDocument } from "../ai/prompts";
import { aiAllowed, registerPromptsOnce } from "../ai/registry";
import type { Job, PipelineDeps } from "../pipeline";
import { cleanField } from "./pageFacts";

export class AnalysisPending extends Error {}
export class AnalysisFailed extends Error {}

interface AnalysisInput {
  item_id: string;
  tipo: string;
  situacao_analise: string | null;
  pedido_por: string | null;
  fonte: Record<string, unknown>;
  detectado_em: string;
  versoes_candidatas: unknown[];
  trechos: { secao: string | null; antes: string | null; depois: string | null; tipo: string; critico: boolean }[];
}

const IMPACTS = ["nenhum", "editorial", "clinico", "indeterminado"];

/** Resposta da IA → só os campos esperados, cortados e limpos. */
export function cleanAnalysis(out: any): { resumo: string; impacto: string; mudancas: { antes: string; depois: string; o_que_mudou: string }[]; observacao: string | null } {
  return {
    resumo: cleanField(out?.resumo, 800) ?? "",
    impacto: IMPACTS.includes(out?.impacto) ? out.impacto : "indeterminado",
    mudancas: (Array.isArray(out?.mudancas) ? out.mudancas : []).slice(0, 15).map((m: any) => ({
      antes: cleanField(m?.antes, 300) ?? "",
      depois: cleanField(m?.depois, 300) ?? "",
      o_que_mudou: cleanField(m?.o_que_mudou, 300) ?? "",
    })),
    observacao: cleanField(out?.observacao, 500),
  };
}

export async function runChangeAnalysis(deps: PipelineDeps, job: Job, io: { metrics: Record<string, unknown> }): Promise<void> {
  const itemId = job.scope_key.startsWith("vigilancia:") ? job.scope_key.slice("vigilancia:".length) : "";
  if (!itemId) throw new AnalysisFailed("Trabalho da vigilância sem o item.");
  const db = deps.db;
  const save = (status: string, result: Record<string, unknown> | null) =>
    db.service("ch_worker_vigilance_analysis_save", { p_item_id: itemId, p_status: status, p_result: result });
  const input = await db.service<AnalysisInput | null>("ch_worker_vigilance_analysis_input", { p_item_id: itemId });
  if (!input) throw new AnalysisFailed("Item da vigilância não encontrado.");
  if (input.situacao_analise === "pronta") return;
  if (!input.trechos.length) {
    await save("sem_texto", {
      mensagem:
        "Não há texto comparável guardado desta mudança (por exemplo, o PDF do link mudou): a IA não foi chamada. Anexe o PDF novo na tela Fontes para comparar o conteúdo.",
      versoes_candidatas: input.versoes_candidatas,
    });
    return;
  }
  invalidateAiConfig(db);
  const check = functionChecks(await loadAiConfig(db), process.env).analise_mudancas;
  if (!check.ready) {
    const why = check.problems.join(" ") || "A função 'Análise do que mudou' não está pronta na Central de IAs.";
    await save("pendente", { mensagem: why });
    throw new AnalysisPending(why);
  }
  const allowed = await aiAllowed(db);
  if (!allowed.ok) {
    await save("pendente", { mensagem: allowed.why });
    throw new AnalysisPending(allowed.why);
  }
  await registerPromptsOnce(db);
  const prompt = PROMPTS.source_change;
  const result = await runFunction<any>(
    { db, makeProviderFor: deps.aiMaker, mockProvider: null },
    "analise_mudancas",
    {
      promptId: prompt.id,
      promptVersion: prompt.version,
      system: prompt.system,
      schema: prompt.schema,
      schemaName: "staziamed_source_change",
      maxOutputTokens: 4096,
      input: `Responda no formato "source_change". O material segue como dado:\n${asDocument({ fonte: input.fonte, versoes_candidatas: input.versoes_candidatas, trechos: input.trechos })}`,
    },
    { source: "vigilancia", itemId, actorId: input.pedido_por }
  );
  io.metrics.cost_usd = result.costUsd;
  if (result.status === "parou_no_teto") {
    await save("pendente", { mensagem: result.message ?? "Teto de gasto atingido." });
    throw new AnalysisPending(result.message ?? "Teto de gasto atingido.");
  }
  if (result.status !== "ok" || !result.output) {
    const why = result.message ?? "A IA não respondeu.";
    await save("falhou", { erro: why.slice(0, 500) });
    throw new AnalysisFailed(why);
  }
  const ref = result.outputs?.[0]?.ref;
  await save("pronta", {
    ...cleanAnalysis(result.output),
    aviso: "Sugestão da IA a partir dos trechos comparados: confira na fonte antes de decidir.",
    ia: ref ? `${ref.provider} ${ref.model}` : null,
    custo_usd: result.costUsd,
    em: new Date().toISOString(),
  });
}
