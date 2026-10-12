// Fase 1, grupo A: banco de teste com as migrações de 5d659d1 (o que está em produção) + as 5 migrações do grupo A coladas 3x.
// Compara o retrato do banco depois da 1ª, 2ª e 3ª colagem (funções, gatilhos, políticas, permissões, colunas, restrições, índices, dados).
// Uso: node colagem-3x.mjs <pasta-de-saida>
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { montaLib } from "./lib-retrato.mjs";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const { WT, PGlite, retrato, compara } = await montaLib();
const MIG = path.join(WT, "supabase/migrations");
const GRUPO_A = ["20261003009840_documentos_equipe_ve_todos.sql", "20261003009841_documento_sem_rascunhos.sql", "20261003009842_pausa_sem_credito.sql", "20261003009843_teto_por_documento_desligado.sql", "20261003009844_tirar_marcas_de_terceiros.sql"];
const base = execFileSync("git", ["-C", WT, "--no-optional-locks", "ls-tree", "--name-only", "5d659d1", "supabase/migrations/"], { encoding: "utf8" }).trim().split("\n");
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
for (const f of base) await db.exec(execFileSync("git", ["-C", WT, "--no-optional-locks", "show", `5d659d1:${f}`], { encoding: "utf8", maxBuffer: 1 << 28 }));
console.log(`base 5d659d1: ${base.length} migracoes`);
const antes = await retrato(db); fs.writeFileSync(path.join(OUT, "antes.json"), JSON.stringify(antes));
const sqls = GRUPO_A.map((f) => fs.readFileSync(path.join(MIG, f), "utf8")); let erros = 0;
const passada = async (n) => { for (let i = 0; i < sqls.length; i++) { try { await db.exec(sqls[i]); console.log(`  volta ${n} ${GRUPO_A[i]}: ok`); } catch (e) { erros++; console.log(`  volta ${n} ${GRUPO_A[i]}: ERRO ${String(e.message).slice(0, 300)}`); } } };
await passada(1); const d1 = await retrato(db);
await passada(2); const d2 = await retrato(db);
await passada(3); const d3 = await retrato(db);
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
for (const [nome, x, y] of [["1a colagem vs 2a colagem", d1, d2], ["2a colagem vs 3a colagem", d2, d3]]) {
  const alvo = secs.map((s) => [s, compara(x[s], y[s])]).filter(([, c]) => c.novos.length + c.removidos.length + c.mudaram.length);
  console.log(`${nome}: ${alvo.length ? "DIFERENCAS" : "nenhuma diferenca (funcoes, gatilhos, politicas, permissoes, colunas, restricoes, indices, dados)"}`);
  for (const [s, c] of alvo) console.log("   ", s, JSON.stringify(c).slice(0, 600));
}
const a = compara(antes.funcoes, d1.funcoes);
console.log(`Funcoes antes x depois: ${Object.keys(antes.funcoes).length} -> ${Object.keys(d1.funcoes).length}: novas ${a.novos.length}, removidas ${a.removidos.length}, existentes que mudam ${a.mudaram.length}`);
console.log("  novas:", a.novos.join(" | ")); console.log("  mudam:", a.mudaram.join(" | "));
const t = compara(antes.tabelas, d1.tabelas); console.log("Tabelas novas:", t.novos.join(", ") || "nenhuma");
const p = compara(antes.politicas, d1.politicas); console.log("Politicas novas:", p.novos.join(" | ") || "nenhuma", "| removidas:", p.removidos.join(" | ") || "nenhuma", "| mudaram:", p.mudaram.join(" | ") || "nenhuma");
const r = compara(antes.restricoes, d1.restricoes); console.log("Restricoes novas:", r.novos.join(" | ") || "nenhuma", "| removidas:", r.removidos.join(" | ") || "nenhuma", "| mudaram:", r.mudaram.join(" | ") || "nenhuma");
// nenhuma ACL de funcao ja existente pode mudar
const acl = a.mudaram.filter((k) => antes.funcoes[k].acl !== d1.funcoes[k].acl); console.log("ACL de funcao existente que mudou:", acl.join(", ") || "nenhuma");
// dados: nenhuma tabela existente muda
const dd = compara(antes.dados, d1.dados); console.log("Dados de tabelas existentes que mudaram:", dd.mudaram.join(", ") || "nenhum", "| tabelas novas com dados:", dd.novos.join(", ") || "nenhuma");
console.log("Permissoes das funcoes novas e das que mudam (quem pode executar):");
for (const k of [...a.novos, ...a.mudaram]) console.log("   ", k, "->", d1.funcoes[k].acl, "| security definer:", d1.funcoes[k].secdef, "| search_path:", d1.funcoes[k].cfg);
console.log("RESULTADO:", erros ? erros + " erro(s)" : "3 passadas sem erro");
await db.close(); process.exit(erros ? 1 : 0);
