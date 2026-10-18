/**
 * Gera o SQL da carga de UMA estação da Montagem do INEP (ver cargaEstacaoInep.ts). Não conecta em banco nenhum: só escreve o SQL.
 * Uso: npx tsx scripts/dupla/carga-estacao-inep.ts <pasta-da-estacao> > carga.sql
 *   ex.: npx tsx scripts/dupla/carga-estacao-inep.ts /Volumes/StaziaMed/.tmp-aulas/estacoes-inep/2025-1/07
 */
import fs from "node:fs";
import path from "node:path";
import { buildCargaEstacao } from "./cargaEstacaoInep";

const pasta = process.argv[2];
if (!pasta) {
  console.error("Informe a pasta da estação (com estacao-app.json e aprovacao-dono.md).");
  process.exit(2);
}
const { station, sql } = buildCargaEstacao(
  fs.readFileSync(path.join(pasta, "estacao-app.json"), "utf8"),
  fs.readFileSync(path.join(pasta, "aprovacao-dono.md"), "utf8")
);
process.stdout.write(sql);
console.error(`${station.id}: ${station.checklist_items.length} itens do PEP, ${station.pressings.length} impressos, versão ${station.version}`);
