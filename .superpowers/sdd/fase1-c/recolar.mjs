// Grupo C: banco de produção simulado (todas as migrações do main 5d659d1) + as 4 migrações novas coladas 3 vezes.
// Mostra o que mudou (antes × depois da 1a colagem) e prova que colar de novo não muda nada.
// Uso: node recolar.mjs <pasta-de-saida>
import fs from "node:fs"; import path from "node:path";
import { PGlite, MIG, WT, retrato, compara } from "../leva3-final/lib.mjs";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const NOVAS = ["20261003009870_taxonomia_versao_nova_continua.sql", "20261003009871_modo_sombra_segura_o_aluno.sql", "20261003009872_reanalise_e_conferencia_pedidas.sql", "20261003009873_fonte_pdf_ja_enviado.sql"];
const read = (p) => fs.readFileSync(p, "utf8");
const db = new PGlite();
await db.exec(read(path.join(WT, "supabase/tests/bootstrap.sql")));
const base = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql") && !NOVAS.includes(f) && f < "20261003009870").sort();
for (const f of base) await db.exec(read(path.join(MIG, f)));
console.log(`base: ${base.length} migracoes (ate ${base.at(-1)})`);
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
const antes = await retrato(db);
let erros = 0;
const passada = async (n) => { for (const f of NOVAS) { try { await db.exec(read(path.join(MIG, f))); console.log(`  volta ${n} ${f}: ok`); } catch (e) { erros++; console.log(`  volta ${n} ${f}: ERRO ${String(e.message).slice(0, 300)}`); } } };
await passada(1); const d1 = await retrato(db);
await passada(2); const d2 = await retrato(db);
await passada(3); const d3 = await retrato(db);
for (const [nome, x, y] of [["ANTES x 1a colagem (o que muda)", antes, d1], ["1a colagem x 2a colagem", d1, d2], ["2a colagem x 3a colagem", d2, d3]]) {
  console.log(`\n${nome}:`);
  for (const s of secs) { const c = compara(x[s], y[s]); if (c.novos.length + c.removidos.length + c.mudaram.length) console.log(`  ${s}: novos=${c.novos.length} removidos=${c.removidos.length} mudaram=${c.mudaram.length}`, nome.startsWith("ANTES") ? JSON.stringify(c).slice(0, 1800) : JSON.stringify(c).slice(0, 600)); }
}
console.log("\nRESULTADO:", erros ? erros + " erro(s)" : "3 passadas sem erro");
await db.close(); process.exit(erros ? 1 : 0);
