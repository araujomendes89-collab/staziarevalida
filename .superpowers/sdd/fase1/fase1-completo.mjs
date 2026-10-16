// Fase 1 completa: producao simulada (...+ leva 3), depois os PACOTES REAIS: conferencia 0 da leva 4, partes 1-4 da leva 4, conferencia 0 da leva 5,
// partes 1-5 da leva 5, coladas 3 vezes (cada volta = leva 4 inteira e leva 5 inteira). Compara com migracoes diretas e com a ordem inversa.
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva4, sqlLeva5 } from "./lib.mjs";
const D = "/Users/joaopaulomendes/Downloads/";
const P4 = D + "publicacao-staziamed-2026-10-12-leva4", P5 = D + "publicacao-staziamed-2026-10-12-leva5";
const arqs = (dir, rx) => fs.readdirSync(dir).filter((f) => rx.test(f)).sort().map((f) => path.join(dir, f));
const partes4 = arqs(P4, /^[1-4]-colar/), partes5 = arqs(P5, /^[1-5]-colar/);
const conf4 = path.join(P4, "0-CONFERIR-primeiro-nao-altera-nada.sql"), conf5 = path.join(P5, "0-CONFERIR-primeiro-nao-altera-nada.sql");
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
let erros = 0;
async function colaPartes(db, lista, rot, volta) {
  for (const f of lista) {
    let res; try { res = await db.exec(fs.readFileSync(f, "utf8")); } catch (e) { erros++; console.log(`  ${rot} volta ${volta} ${path.basename(f)}: ERRO ${String(e.message).slice(0, 250)}`); continue; }
    const last = res[res.length - 1]?.rows?.[0] ?? {}; const falsos = Object.entries(last).filter(([k, v]) => k !== "resultado" && v !== true).map(([k, v]) => `${k}=${v}`);
    if (!/^OK: /.test(last.resultado ?? "") || falsos.length) { erros++; console.log(`  ${rot} volta ${volta} ${path.basename(f)}: RESULTADO RUIM ${JSON.stringify(last).slice(0, 400)}`); }
    else console.log(`  ${rot} volta ${volta} ${path.basename(f).slice(0, 60)}: ${last.resultado} (${Object.keys(last).length - 1} conferencias true)`);
  }
}
const confere = async (db, f) => (await db.query(fs.readFileSync(f, "utf8"))).rows;
console.log("== A) pacotes reais: 0 leva4, partes leva4, 0 leva5, partes leva5; 3 voltas");
const db = await montaProducao(); const antes = await retrato(db);
const c4 = await confere(db, conf4); console.log("  conferencia 0 da leva 4:", c4.length, "linhas;", c4.filter((r) => /FALTA/.test(String(r.detalhe_1))).length, "FALTA");
const c5 = await confere(db, conf5); console.log("  conferencia 0 da leva 5:", c5.length, "linhas;", c5.filter((r) => /FALTA/.test(String(r.detalhe_1))).length, "FALTA");
const snaps = [];
for (let v = 1; v <= 3; v++) { await colaPartes(db, partes4, "leva4", v); await colaPartes(db, partes5, "leva5", v); snaps.push(await retrato(db)); }
const c5d = await confere(db, conf5), c4d = await confere(db, conf4); console.log("  conferencias 0 depois (rodam sem erro):", c4d.length, c5d.length);
for (const [n, x, y] of [["1a x 2a volta", snaps[0], snaps[1]], ["2a x 3a volta", snaps[1], snaps[2]]]) {
  const dif = secs.flatMap((k) => { const c = compara(x[k], y[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((z) => k + ":" + z); });
  if (dif.length) erros++; console.log(`  ${n}:`, dif.length ? "DIFERE " + dif.slice(0, 6).join(", ") : "nenhuma diferenca (funcoes, gatilhos, politicas, ACL, RLS, colunas, restricoes, indices, dados)");
}
const fin = snaps[2];
const fn = compara(antes.funcoes, fin.funcoes, ["def", "acl"]); console.log(`  funcoes: ${Object.keys(antes.funcoes).length} -> ${Object.keys(fin.funcoes).length}; novas ${fn.novos.length}, removidas ${fn.removidos.length}, mudadas ${fn.mudaram.length}`);
console.log(`  tabelas novas: ${compara(antes.tabelas, fin.tabelas).novos.length}; politicas: +${compara(antes.politicas, fin.politicas).novos.length} -${compara(antes.politicas, fin.politicas).removidos.length}; gatilhos novos: ${compara(antes.gatilhos, fin.gatilhos).novos.length}`);
const mudouDados = Object.keys(antes.dados).filter((t) => JSON.stringify(antes.dados[t]) !== JSON.stringify(fin.dados[t]));
console.log("  dados: tabelas existentes com conteudo diferente:", mudouDados.join(", ") || "nenhuma", "(esperado: as que ganharam coluna/linha de configuracao)");
fs.writeFileSync("/private/tmp/claude-501/fase1/final-pacotes.json", JSON.stringify(fin));
await db.close();
console.log("== B) migracoes diretas: leva 4 -> leva 5 (2 voltas) e leva 5 -> leva 4");
const L4 = sqlLeva4(), L5 = sqlLeva5();
async function direto(ord) { const d = await montaProducao(); for (let v = 0; v < 3; v++) for (const grupo of ord) for (const s of grupo) { try { await d.exec(s); } catch (e) { erros++; console.log("  ERRO", String(e.message).slice(0, 200)); } } const r = await retrato(d); await d.close(); return r; }
const r45 = await direto([L4, L5]), r54 = await direto([L5, L4]);
const cmp = (n, a, b) => { const dif = secs.slice(0, 7).flatMap((k) => { const c = compara(a[k], b[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((z) => k + ":" + z); }); if (dif.length) erros++; console.log(`  ${n}:`, dif.length ? "DIFERE " + dif.slice(0, 8).join(", ") : "mesma estrutura (funcoes, ACL, gatilhos, RLS/politicas, colunas, restricoes, indices)"); };
cmp("pacotes (4 depois 5) x migracoes diretas 4 depois 5", fin, r45); cmp("4 depois 5 x 5 depois 4", r45, r54);
console.log(erros ? `RESULTADO: ${erros} PROBLEMA(S)` : "RESULTADO FINAL: leva 4 e leva 5, pelos pacotes reais, colam 3x sem erro; estado final igual ao das migracoes diretas e ao da ordem inversa");
process.exit(erros ? 1 : 0);
