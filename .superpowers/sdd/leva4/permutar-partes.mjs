// As partes da leva 4 podem ser coladas em outra ordem? P1 = 9800, P2 = 9801, P3 = 9810+9830, P4 = 9820. O fechamento (P3) exige P1 e P2 antes (recusa com aviso);
// P1, P2 e P4 são independentes entre si. Cola as 24 ordens: as que respeitam isso têm de dar a MESMA estrutura; as outras têm de recusar com o aviso em português.
import { montaProducao, retrato, compara, sqlLeva } from "./lib.mjs";
const S = sqlLeva(); const G = { P1: [S[0]], P2: [S[1]], P3: [S[2], S[4]], P4: [S[3]] };
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
let ref = null, erros = 0;
for (const ordem of perms(["P1", "P2", "P3", "P4"])) {
  const db = await montaProducao(); let msg = null;
  try { for (const g of ordem) for (const s of G[g]) await db.exec(s); } catch (e) { msg = String(e.message).slice(0, 110); }
  const comeca = ordem.indexOf("P3") > ordem.indexOf("P1") && ordem.indexOf("P3") > ordem.indexOf("P2"); // o fechamento (parte 3) exige as partes 1 e 2 antes
  if (msg) { const ok = !comeca && /Cole antes a migração/.test(msg); if (!ok) erros++; console.log(ordem.join(">"), ok ? "recusa com aviso: " + msg : "ERRO inesperado: " + msg); await db.close(); continue; }
  if (!comeca) { erros++; console.log(ordem.join(">"), "colou fora de ordem (deveria recusar)"); await db.close(); continue; }
  const r = await retrato(db); await db.close();
  if (!ref) { ref = r; console.log(ordem.join(">"), "(referencia)"); continue; }
  const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"].flatMap((k) => { const c = compara(ref[k], r[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
  if (dif.length) erros++;
  console.log(ordem.join(">"), dif.length ? "DIFERE: " + dif.slice(0, 5).join(", ") : "igual");
}
console.log(erros ? erros + " problema(s)" : "RESULTADO: as ordens que colocam a parte 3 depois das partes 1 e 2 dão a mesma estrutura; as outras recusam com aviso");
