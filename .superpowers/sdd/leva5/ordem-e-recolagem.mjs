// Producao simulada (base 23d53c1 + partes 1-7 + Arena + DESLIGAR tetos + 9610 + 9620/9621 + leva 3 completa 9700-9732) + as 18 migracoes da leva 5
// na ordem global, coladas 3 vezes. Tambem registra QUAL migracao muda QUAL funcao (inventario real de funcoes redefinidas).
// Uso: node ordem-e-recolagem.mjs <pasta-de-saida>
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva, LEVA } from "./lib.mjs";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const db = await montaProducao((m) => console.log("  " + m));
const antes = await retrato(db); fs.writeFileSync(path.join(OUT, "antes.json"), JSON.stringify(antes));
const sqls = sqlLeva(); let erros = 0;
const defs = async () => Object.fromEntries((await db.query(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) || coalesce(p.proacl::text,'') as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')`)).rows.map((x) => [x.sig, x.def]));
const quemMuda = {}; // funcao -> [migracoes (1a volta) que a criaram/mudaram]
let prev = await defs();
const passada = async (n) => { for (let i = 0; i < sqls.length; i++) { try { await db.exec(sqls[i]); console.log(`  volta ${n} ${LEVA[i]}: ok`); } catch (e) { erros++; console.log(`  volta ${n} ${LEVA[i]}: ERRO ${String(e.message).slice(0, 300)}`); }
  if (n === 1) { const cur = await defs(); for (const k of Object.keys(cur)) if (prev[k] !== cur[k]) (quemMuda[k] ??= []).push(LEVA[i].slice(8, 14) + (k in prev ? "" : "(nova)")); prev = cur; } } };
await passada(1); const d1 = await retrato(db); fs.writeFileSync(path.join(OUT, "depois1.json"), JSON.stringify(d1));
fs.writeFileSync(path.join(OUT, "quem-muda-funcao.json"), JSON.stringify(quemMuda, null, 1));
await passada(2); const d2 = await retrato(db); fs.writeFileSync(path.join(OUT, "depois2.json"), JSON.stringify(d2));
await passada(3); const d3 = await retrato(db); fs.writeFileSync(path.join(OUT, "depois3.json"), JSON.stringify(d3));
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
for (const [nome, x, y] of [["1a colagem vs 2a colagem", d1, d2], ["2a colagem vs 3a colagem", d2, d3]]) {
  const alvo = secs.map((s) => [s, compara(x[s], y[s])]).filter(([, c]) => c.novos.length + c.removidos.length + c.mudaram.length);
  console.log(`${nome}: ${alvo.length ? "DIFERENCAS" : "nenhuma diferenca (funcoes, gatilhos, politicas, permissoes, colunas, restricoes, indices, dados)"}`);
  if (alvo.length) erros++;
  for (const [s, c] of alvo) console.log("   ", s, JSON.stringify(c).slice(0, 800));
}
const multi = Object.entries(quemMuda).filter(([, l]) => l.length > 1);
console.log("funcoes mudadas por MAIS DE UMA migracao da leva 5 (na 1a volta):");
for (const [k, l] of multi) console.log("   ", k, l.join(" > "));
console.log("RESULTADO:", erros ? erros + " erro(s)/diferenca(s)" : "3 passadas sem erro");
await db.close(); process.exit(erros ? 1 : 0);
