/**
 * Roda as camadas de conferência dos rascunhos inéditos.
 *
 *   npx tsx scripts/content-hub/run-draft-checks.ts --layers software
 *   npx tsx scripts/content-hub/run-draft-checks.ts --layers sources,currency,redteam --limit 10 --dry-run
 *   npx tsx scripts/content-hub/run-draft-checks.ts --layers redteam --limit 10 --allow-external
 *
 * Camadas: software (grátis) · sources · currency · redteam.
 * --dry-run         só estima chamadas e tokens; não grava nem chama IA
 * --allow-external  autoriza, só nesta execução, enviar o texto dos rascunhos ao provedor de IA
 * --reference-dir   pasta com os PDFs citados (para medir cópia do material-fonte)
 * Banco: Supabase se VITE_SUPABASE_URL/ANON_KEY estiverem no .env; senão o banco de desenvolvimento.
 */
import dotenv from "dotenv";
dotenv.config({ quiet: true });
import { getDevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, supabaseContentDb } from "../../server/contentHub/infra";
import { usesSupabase } from "../../server/contentHub";
import { runDraftChecks, type Layer } from "../../server/contentHub/draftChecks";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const layers = (value("layers") ?? "software").split(",").map((l) => l.trim()).filter(Boolean) as Layer[];
const bad = layers.filter((l) => !["software", "sources", "currency", "redteam"].includes(l));
if (bad.length) {
  console.error(`Camada desconhecida: ${bad.join(", ")}`);
  process.exit(2);
}
if (flag("allow-external")) process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL = "1";

const db = usesSupabase() ? supabaseContentDb() : devContentDb(() => getDevDatabase());
console.log(`Banco: ${db.mode === "supabase" ? "Supabase" : "desenvolvimento"} | camadas: ${layers.join(", ")}${flag("dry-run") ? " | ESTIMATIVA (nada é gravado nem enviado)" : ""}`);

const reports = await runDraftChecks({ db, log: console.log }, { layers, limit: Number(value("limit") ?? 50), batch: value("batch"), dryRun: flag("dry-run"), referenceDir: value("reference-dir") });
const pin = Number(process.env.CONTENT_HUB_PRICE_INPUT_PER_MTOK);
const pout = Number(process.env.CONTENT_HUB_PRICE_OUTPUT_PER_MTOK);
for (const r of reports) {
  console.log(`\n[${r.layer}] rascunhos considerados: ${r.considered} | gravados: ${r.saved}`);
  if (Object.keys(r.verdicts).length) console.log("  resultado:", JSON.stringify(r.verdicts));
  if (r.estimate) {
    const cost = pin && pout ? ` | custo estimado ≈ US$ ${((r.estimate.inputTokens * pin + r.estimate.outputTokens * pout) / 1e6).toFixed(2)}` : " | custo: defina CONTENT_HUB_PRICE_INPUT_PER_MTOK e _OUTPUT_PER_MTOK para estimar";
    console.log(`  estimativa: ${r.estimate.calls} chamadas, ~${r.estimate.inputTokens} tokens de entrada, ~${r.estimate.outputTokens} de saída${cost}`);
  }
  if (r.spend.calls) console.log(`  gasto real: ${r.spend.calls} chamadas, ${r.spend.inputTokens} tokens de entrada, ${r.spend.outputTokens} de saída${r.spend.costUsd != null ? `, US$ ${r.spend.costUsd.toFixed(4)}` : ""}`);
  if (r.pending) console.log(`  PENDENTE: ${r.pending}`);
}
process.exit(0);
