// As 5 partes da leva 5 (F suporte, A documentos, B publicar, C taxonomia/reanalise, E planos/microfone) sao independentes? Cola nas 120 ordens e compara.
import { montaProducao, retrato, compara, sqlLeva, LEVA, GRUPOS } from "./lib.mjs";
const S = sqlLeva(); const G = Object.fromEntries(Object.entries(GRUPOS).map(([g, nums]) => [g, nums.map((n) => S[LEVA.findIndex((f) => f.includes("_" + n.slice(2)) || f.slice(8, 14) === n)])]));
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
let ref = null, erros = 0, n = 0;
for (const ordem of perms(Object.keys(G))) {
  const db = await montaProducao(); n++;
  try { for (const g of ordem) for (const s of G[g]) await db.exec(s); } catch (e) { erros++; console.log(ordem.join(">"), "ERRO", String(e.message).slice(0, 150)); await db.close(); continue; }
  const r = await retrato(db); await db.close();
  if (!ref) { ref = r; console.log(ordem.join(">"), "(referencia)"); continue; }
  const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"].flatMap((k) => { const c = compara(ref[k], r[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
  if (dif.length) { erros++; console.log(ordem.join(">"), "DIFERE: " + dif.slice(0, 5).join(", ")); }
}
console.log(erros ? erros + " problema(s) em " + n + " ordens" : `RESULTADO: as ${n} ordens possiveis das 5 partes colam sem erro e dao a mesma estrutura (funcoes, gatilhos, politicas, permissoes, colunas, restricoes, indices)`);
