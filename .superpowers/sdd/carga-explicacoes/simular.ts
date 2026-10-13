// Ensaio do pacote da carga das explicações num PGlite com TODAS as migrações e a carga REAL das 1.200 questões do banco
// (scripts/supabase/seed-builder.ts), colando o pacote 2 vezes. Nada aqui toca o banco de produção.
// Uso: npx tsx .superpowers/sdd/carga-explicacoes/simular.ts <pasta do pacote>
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { buildSeedSql } from "../../../scripts/supabase/seed-builder";

const WT = path.resolve(import.meta.dirname, "../../..");
const PAC = process.argv[2];
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
const MIG = path.join(WT, "supabase/migrations");
for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) if (!f.includes("009920")) await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
await db.exec(buildSeedSql());
console.log("questões no banco:", (await db.query<any>("select count(*)::int n from public.questions")).rows[0].n);
const run = async (f: string) => {
  const r = await db.exec(fs.readFileSync(path.join(PAC, f), "utf8"));
  const last = r[r.length - 1]?.rows?.[0] as any;
  return last?.resultado ?? "(sem resultado)";
};
const conferir = async () => (await db.query<any>(fs.readFileSync(path.join(PAC, "0-CONFERIR.sql"), "utf8"))).rows[0].resultado;
const partes = fs.readdirSync(PAC).filter((f) => /^2-Prova-.*\.sql$/.test(f)).sort();
console.log("CONFERIR antes:", (await conferir()).slice(0, 300));
for (let volta = 1; volta <= 2; volta++) {
  console.log(`--- volta ${volta}`);
  console.log("estrutura:", await run("1-Estrutura-carga-das-explicacoes.sql"));
  for (const p of partes) console.log(p, "→", String(await run(p)).slice(0, 260));
  if (fs.existsSync(path.join(PAC, "3-OPCIONAL-regra-B-liberar-direto.sql"))) console.log("regra B →", String(await run("3-OPCIONAL-regra-B-liberar-direto.sql")).slice(0, 260));
  console.log("CONFERIR:", (await conferir()).slice(0, 600));
}
const h = (await db.query<any>("select count(*)::int n from public.question_change_log")).rows[0].n;
console.log("linhas no histórico:", h, "| notas:", (await db.query<any>("select status, count(*)::int n from public.question_update_notes group by 1")).rows);
console.log("em revisão:", (await db.query<any>("select count(*)::int n from public.questions where comment_review is not null")).rows[0].n,
  "| texto diferente do lido:", (await db.query<any>("select count(*)::int n from public.questions where (comment_review->'carga'->>'texto_diferente')::boolean")).rows[0].n);
