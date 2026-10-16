// E se o dono colar DE NOVO, depois da leva 3, algum arquivo ja colado antes? Para cada arquivo: monta producao + leva (2x), cola o arquivo
// e lista as funcoes/gatilhos da leva que voltaram para a versao antiga ou mudaram.
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva, DL, PACOTE } from "./lib.mjs";
const arquivos = [
  ...fs.readdirSync(PACOTE).filter((f) => /^[1-7]-/.test(f)).sort().map((f) => path.join(PACOTE, f)),
  ...["COLAR-arena-equipe-fora-do-ranking.sql", "COLAR-fontes-oficiais-9610.sql", "COLAR-fonte-complementar-9620-9621.sql", "DESLIGAR-tetos-de-IA.sql"].map((f) => path.join(DL, f)),
];
for (const f of arquivos) {
  const db = await montaProducao(); for (let v = 0; v < 2; v++) for (const s of sqlLeva()) await db.exec(s);
  const a = await retrato(db); let erro = null;
  try { await db.exec(fs.readFileSync(f, "utf8")); } catch (e) { erro = String(e.message).slice(0, 200); }
  const b = await retrato(db);
  const fn = compara(a.funcoes, b.funcoes, ["def", "acl"]), tg = compara(a.gatilhos, b.gatilhos, ["def", "en"]), pol = compara(a.politicas, b.politicas), tb = compara(a.tabelas, b.tabelas, ["rls", "acl"]);
  console.log(`${path.basename(f)}: ${erro ? "ERRO " + erro : "colou"}; funcoes que mudam: ${fn.mudaram.length ? fn.mudaram.join(", ") : "nenhuma"}; novas: ${fn.novos.length}; gatilhos removidos/mudados: ${[...tg.removidos, ...tg.mudaram].join(", ") || "nenhum"}; politicas/tabelas mudadas: ${[...pol.mudaram, ...pol.removidos, ...tb.mudaram].join(", ") || "nenhuma"}`);
  await db.close();
}
