// Se a leva 4 (ramo leva4, commitado) for colada ANTES da leva 5 (e tambem no sentido contrario): ordem de colagem, conflitos de funcao e de estrutura.
import { montaProducao, retrato, compara, sqlLeva, sqlLeva4, LEVA, LEVA4 } from "./lib.mjs";
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
const L5 = sqlLeva(), L4 = sqlLeva4(); let erros = 0;
async function cola(db, lista, nomes, rot, voltas) { for (let v = 1; v <= voltas; v++) for (let i = 0; i < lista.length; i++) { try { await db.exec(lista[i]); } catch (e) { erros++; console.log(`  ${rot} volta ${v} ${nomes[i]}: ERRO ${String(e.message).slice(0, 300)}`); } } }
const defs = async (db) => Object.fromEntries((await db.query(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) || coalesce(p.proacl::text,'') as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')`)).rows.map((x) => [x.sig, x.def]));
async function cenario(nome, primeiro, segundo) {
  console.log("== " + nome);
  const db = await montaProducao(); const a0 = await defs(db);
  await cola(db, primeiro[0], primeiro[1], primeiro[2], 2); const a1 = await defs(db);
  await cola(db, segundo[0], segundo[1], segundo[2], 3);
  const a2 = await defs(db);
  const mudouNaSegunda = Object.keys(a2).filter((k) => k in a1 && a1[k] !== a2[k]);
  console.log("  funcoes que a segunda leva REDEFINE (ja existiam depois da primeira):", mudouNaSegunda.length ? mudouNaSegunda.join(", ") : "nenhuma");
  const r1 = await retrato(db);
  // volta a colar a primeira e depois a segunda: o resultado deve ser o mesmo
  await cola(db, primeiro[0], primeiro[1], primeiro[2], 1); await cola(db, segundo[0], segundo[1], segundo[2], 1);
  const r2 = await retrato(db);
  const dif = secs.flatMap((k) => { const c = compara(r1[k], r2[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
  console.log("  recolar a primeira e a segunda depois:", dif.length ? "DIFERE " + dif.slice(0, 8).join(", ") : "tudo igual");
  if (dif.length) erros++;
  await db.close(); return r1;
}
const x = await cenario("leva 4 depois leva 5", [L4, LEVA4, "leva4"], [L5, LEVA, "leva5"]);
const y = await cenario("leva 5 depois leva 4", [L5, LEVA, "leva5"], [L4, LEVA4, "leva4"]);
const dif = secs.slice(0, 7).flatMap((k) => { const c = compara(x[k], y[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((z) => k + ":" + z); });
console.log("== estado final: 4>5 versus 5>4:", dif.length ? "DIFERE " + dif.join(", ") : "mesma estrutura (funcoes, gatilhos, politicas, permissoes, colunas, restricoes, indices)");
console.log(erros ? "RESULTADO: " + erros + " problema(s)" : "RESULTADO: leva 4 e leva 5 coladas em qualquer ordem, sem erro");
process.exit(erros ? 1 : 0);
