// Fontes vinculadas (9900): o pacote do dono numa cópia SIMULADA da produção (base 23d53c1 + pacote 11/10 + colados + leva 3), sem rede.
// A) antes da leva 4: a conferência diz FALTA e o arquivo 1 para com aviso, sem mudar nada;
// B) depois das levas 4 e 5 (pacotes reais da pasta Downloads): o arquivo 1 colado 3 vezes, conferências "true", 2a = 3a volta;
//    só coisas novas (nenhuma função, política ou tabela existente muda); o 0-CONFERIR diz OK; igual à migração colada direto.
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva4, sqlLeva5, MIG } from "./lib.mjs";
const D = "/Users/joaopaulomendes/Downloads/";
const P = D + "publicacao-staziamed-2026-10-12-fontes-vinculadas/";
const P4 = D + "publicacao-staziamed-2026-10-12-leva4", P5 = D + "publicacao-staziamed-2026-10-12-leva5";
const arqs = (dir, rx) => fs.readdirSync(dir).filter((f) => rx.test(f)).sort().map((f) => path.join(dir, f));
const ler = (f) => fs.readFileSync(f, "utf8");
const UM = ler(P + "1-Fontes-vinculadas.sql"), CONF = ler(P + "0-CONFERIR.sql");
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
let erros = 0;
const ok = (cond, msg) => { if (!cond) erros++; console.log(`  ${cond ? "ok " : "ERRO"} ${msg}`); };
const conferir = async (db) => (await db.query(CONF)).rows[0].resultado;
const difs = (a, b, ss = secs) => ss.flatMap((k) => { const c = compara(a[k], b[k]); return [...c.novos.map((z) => `${k}+${z}`), ...c.removidos.map((z) => `${k}-${z}`), ...c.mudaram.map((z) => `${k}~${z}`)]; });

const db = await montaProducao();
console.log("== A) antes da leva 4");
const c0 = await conferir(db); ok(/^FALTA: a leva 4/.test(c0), `0-CONFERIR: ${c0.slice(0, 120)}`);
const r0 = await retrato(db);
let parou = null; try { await db.exec(UM); } catch (e) { parou = e.message; }
ok(parou && /Cole antes a fonte complementar \(9620\), a leva 3 e a leva 4/.test(parou), `arquivo 1 para com aviso: ${String(parou).slice(0, 110)}`);
ok(difs(r0, await retrato(db)).length === 0, "nada mudou no banco");

console.log("== B) depois das levas 4 e 5 (pacotes reais)");
for (const f of [...arqs(P4, /^[1-4]-colar/), ...arqs(P5, /^[1-5]-colar/)]) await db.exec(ler(f));
const antes = await retrato(db);
const c1 = await conferir(db); ok(/^FALTA: as duas tabelas/.test(c1) && !/leva 4/.test(c1), `0-CONFERIR antes de colar: ${c1.slice(0, 100)}…`);
const snaps = [];
for (let v = 1; v <= 3; v++) {
  const res = await db.exec(UM); const last = res[res.length - 1].rows[0];
  const falsos = Object.entries(last).filter(([k, x]) => k !== "resultado" && x !== true).map(([k]) => k);
  ok(last.resultado === "OK: Fontes vinculadas colada" && falsos.length === 0, `volta ${v}: ${last.resultado} (${Object.keys(last).length - 1} conferências true${falsos.length ? "; FALSE: " + falsos.join(",") : ""})`);
  snaps.push(await retrato(db));
}
ok(difs(snaps[0], snaps[1]).length === 0, "1a x 2a volta: nenhuma diferença (funções, gatilhos, políticas, ACL, RLS, colunas, restrições, índices, dados)");
ok(difs(snaps[1], snaps[2]).length === 0, "2a x 3a volta: nenhuma diferença");
const d = difs(antes, snaps[2]);
const mudou = d.filter((x) => !x.includes("+"));
ok(mudou.length === 0, `só coisas novas (nada existente mudou ou sumiu)${mudou.length ? ": " + mudou.slice(0, 5).join(", ") : ""}`);
console.log("     novos:", d.filter((x) => x.startsWith("funcoes+")).map((x) => x.slice(8)).join(", "));
console.log("     tabelas novas:", d.filter((x) => x.startsWith("tabelas+")).map((x) => x.slice(8)).join(", "), "| políticas novas:", d.filter((x) => x.startsWith("politicas+")).length, "| gatilhos novos:", d.filter((x) => x.startsWith("gatilhos+")).length);
const c2 = await conferir(db); ok(/^OK: /.test(c2), `0-CONFERIR depois: ${c2}`);
await db.close();

console.log("== C) pacote x migração colada direto (mesma estrutura)");
const d2 = await montaProducao();
for (const s of [...sqlLeva4(), ...sqlLeva5()]) await d2.exec(s);
await d2.exec(ler(path.join(MIG, "20261003009900_fontes_vinculadas.sql")));
const direto = await retrato(d2); await d2.close();
const dd = difs(snaps[2], direto, secs.slice(0, 8));
ok(dd.length === 0, `pacote x migração direta: ${dd.length ? "DIFERE " + dd.slice(0, 6).join(", ") : "mesma estrutura"}`);
console.log(erros ? `RESULTADO: ${erros} PROBLEMA(S)` : "RESULTADO FINAL: o pacote cola 3x sem erro sobre a produção simulada com as levas 4 e 5, só cria coisas novas, e o 0-CONFERIR responde OK");
process.exit(erros ? 1 : 0);
