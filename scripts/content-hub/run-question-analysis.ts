/**
 * SQIE fase 1: gera a análise das questões históricas (pergunta real, dados-chave, armadilha, regra para lembrar,
 * análise das 4 alternativas) e roda a conferência por software. Nada é publicado: o aluno só vê o que um revisor
 * médico da área aprovar.
 *
 *   npx tsx scripts/content-hub/run-question-analysis.ts --limit 5 --dry-run
 *   npx tsx scripts/content-hub/run-question-analysis.ts --limit 5 --exam revalida-2021 --allow-external
 *
 * --dry-run         só estima chamadas e tokens (não grava nem envia)
 * --allow-external  autoriza, só nesta execução, enviar o texto das questões ao provedor de IA
 */
import dotenv from "dotenv";
dotenv.config({ quiet: true });
import { getDevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, supabaseContentDb } from "../../server/contentHub/infra";
import { usesSupabase } from "../../server/contentHub";
import { runQuestionAnalysis } from "../../server/contentHub/questionAnalysis";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const value = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (flag("allow-external")) process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL = "1";

const db = usesSupabase() ? supabaseContentDb() : devContentDb(() => getDevDatabase());
console.log(`Banco: ${db.mode === "supabase" ? "Supabase" : "desenvolvimento"}${flag("dry-run") ? " | ESTIMATIVA (nada é gravado nem enviado)" : ""}`);
const r = await runQuestionAnalysis({ db, log: console.log }, { limit: Number(value("limit") ?? 5), exam: value("exam"), dryRun: flag("dry-run") });
const pin = Number(process.env.CONTENT_HUB_PRICE_INPUT_PER_MTOK);
const pout = Number(process.env.CONTENT_HUB_PRICE_OUTPUT_PER_MTOK);
console.log(`\nquestões consideradas: ${r.considered} | gravadas: ${r.saved} | puladas: ${r.skipped}`);
if (Object.keys(r.verdicts).length) console.log("conferência por software:", JSON.stringify(r.verdicts));
if (r.estimate) console.log(`estimativa: ${r.estimate.calls} chamadas, ~${r.estimate.inputTokens} tokens de entrada, ~${r.estimate.outputTokens} de saída${pin && pout ? ` | ≈ US$ ${((r.estimate.inputTokens * pin + r.estimate.outputTokens * pout) / 1e6).toFixed(2)}` : ""}`);
if (r.spend.calls) console.log(`gasto real: ${r.spend.calls} chamadas, ${r.spend.inputTokens} tokens de entrada, ${r.spend.outputTokens} de saída${r.spend.costUsd != null ? `, US$ ${r.spend.costUsd.toFixed(4)}` : ""}`);
if (r.pending) console.log(`PENDENTE: ${r.pending}`);
process.exit(0);
