// As 4 partes da leva (Questoes, Aulas, Podcasts, Planos) sao independentes? Cola nas 24 ordens possiveis e compara o resultado final.
import { montaProducao, retrato, compara, sqlLeva } from "./lib.mjs";
const S = sqlLeva(); const G = { Q: S.slice(0, 3), A: S.slice(3, 5), P: S.slice(5, 7), PL: S.slice(7, 10) };
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
let ref = null, erros = 0;
for (const ordem of perms(["Q", "A", "P", "PL"])) {
  const db = await montaProducao();
  try { for (const g of ordem) for (const s of G[g]) await db.exec(s); } catch (e) { erros++; console.log(ordem.join(">"), "ERRO", String(e.message).slice(0, 150)); await db.close(); continue; }
  const r = await retrato(db); await db.close();
  if (!ref) { ref = r; console.log(ordem.join(">"), "(referencia)"); continue; }
  const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"].flatMap((k) => { const c = compara(ref[k], r[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
  if (dif.length) erros++;
  console.log(ordem.join(">"), dif.length ? "DIFERE: " + dif.slice(0, 5).join(", ") : "igual");
}
console.log(erros ? erros + " problema(s)" : "RESULTADO: as 24 ordens colam sem erro e dao a mesma estrutura (funcoes, gatilhos, politicas, permissoes)");
