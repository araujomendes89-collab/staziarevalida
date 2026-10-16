/**
 * Treino em Dupla: gera a FOLHA DO CANDIDATO (imagem) das estações, com o mesmo gerador do servidor (server/dupla/folha.ts).
 *
 * Usa o banco e o depósito do ambiente, como o servidor e o processamento (server/contentHub/index.ts):
 *   - sem as chaves do Supabase no ambiente: banco de desenvolvimento (.data/dev-db) e pasta .data/content-hub;
 *   - com SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY: o projeto do Supabase (PRODUÇÃO). Só rode assim
 *     com a migração 013390 aplicada e a autorização do dono.
 * Precisa do Chromium do Playwright (npx playwright install chromium).
 *
 * Uso:
 *   npm run dupla:folhas -- --simular            lista o que seria gerado (pedidas + aprovadas sem folha valendo), sem gerar
 *   npm run dupla:folhas                         gera só as pedidas na Administração › Estações
 *   npm run dupla:folhas -- --todas              gera também as das estações aprovadas sem folha (ou com folha desatualizada)
 *   npm run dupla:folhas -- --estacao <id>       gera (ou regera) uma estação
 *   --max <n>                                    no máximo n estações por rodada (padrão 50)
 *   --producao                                   obrigatório para GRAVAR no Supabase (sem ele, com o Supabase no ambiente, só
 *                                                --simular roda)
 */
import { buildContentHubDeps } from "../../server/contentHub/index";
import { duplaStorage } from "../../server/dupla/router";
import { gerarFolha, gerarFolhasPendentes } from "../../server/dupla/folha";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  process.env.CONTENT_HUB_WORKER = "0";
  const simular = process.argv.includes("--simular");
  const todas = process.argv.includes("--todas") || simular;
  const estacao = arg("--estacao");
  const max = Number(arg("--max")) > 0 ? Number(arg("--max")) : 50;

  const { deps, pending } = await buildContentHubDeps();
  if (!deps) throw new Error(`sem banco: ${pending}`);
  console.log(`[folha] banco: ${deps.db.mode === "supabase" ? "SUPABASE (produção)" : "desenvolvimento (.data/dev-db)"} · gerador de imagem: ${deps.renderer ? "pronto" : "indisponível"}`);
  if (deps.db.mode === "supabase" && !simular && !process.argv.includes("--producao")) {
    throw new Error("o ambiente aponta para o Supabase (produção). Para gravar lá, rode de novo com --producao (com a migração 013390 aplicada e a autorização do dono); para só ver a lista, use --simular.");
  }
  const folhaDeps = { db: deps.db, storage: duplaStorage(deps.db.mode), renderer: deps.renderer ?? null, log: (m: string) => console.log(m) };
  try {
    if (estacao) {
      const r = await gerarFolha(folhaDeps, estacao, null);
      console.log(`[folha] ${estacao}: ${r.width}×${r.height} px, ${r.bytes} bytes → ${r.path}`);
      return;
    }
    const r = await gerarFolhasPendentes(folhaDeps, { todas, max, simular });
    if (simular) {
      console.log(`[folha] seriam geradas ${r.estacoes.length} estação(ões): ${r.estacoes.join(", ") || "nenhuma"}`);
      return;
    }
    console.log(`[folha] geradas ${r.geradas.length} de ${r.estacoes.length}${r.falhas.length ? ` · falhas: ${r.falhas.map((f) => `${f.station_id} (${f.erro})`).join("; ")}` : ""}`);
    if (r.falhas.length) process.exitCode = 1;
  } finally {
    await deps.renderer?.close().catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(`[folha] falhou: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 300));
