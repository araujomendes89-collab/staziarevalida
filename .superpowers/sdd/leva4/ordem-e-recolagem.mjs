// Tarefa 1: producao simulada + as 10 migracoes da leva 3 coladas 2x (e uma 3a vez so para provar que nada muda).
// Uso: node ordem-e-recolagem.mjs <pasta-de-saida>
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva, LEVA } from "./lib.mjs";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const db = await montaProducao((m) => console.log("  " + m));
const antes = await retrato(db); fs.writeFileSync(path.join(OUT, "antes.json"), JSON.stringify(antes));
const sqls = sqlLeva(); let erros = 0;
const passada = async (n) => { for (let i = 0; i < sqls.length; i++) { try { await db.exec(sqls[i]); console.log(`  volta ${n} ${LEVA[i]}: ok`); } catch (e) { erros++; console.log(`  volta ${n} ${LEVA[i]}: ERRO ${String(e.message).slice(0, 300)}`); } } };
await passada(1); const d1 = await retrato(db); fs.writeFileSync(path.join(OUT, "depois1.json"), JSON.stringify(d1));
await passada(2); const d2 = await retrato(db); fs.writeFileSync(path.join(OUT, "depois2.json"), JSON.stringify(d2));
await passada(3); const d3 = await retrato(db); fs.writeFileSync(path.join(OUT, "depois3.json"), JSON.stringify(d3));
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
for (const [nome, x, y] of [["1a colagem vs 2a colagem", d1, d2], ["2a colagem vs 3a colagem", d2, d3]]) {
  const alvo = secs.map((s) => [s, compara(x[s], y[s])]).filter(([, c]) => c.novos.length + c.removidos.length + c.mudaram.length);
  console.log(`${nome}: ${alvo.length ? "DIFERENCAS" : "nenhuma diferenca (funcoes, gatilhos, politicas, permissoes, colunas, restricoes, indices, dados)"}`);
  for (const [s, c] of alvo) console.log("   ", s, JSON.stringify(c).slice(0, 600));
}
console.log("RESULTADO:", erros ? erros + " erro(s)" : "3 passadas sem erro");
await db.close(); process.exit(erros ? 1 : 0);
