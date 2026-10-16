// Biblioteca da verificacao final da leva 3: monta o estado de producao simulado em PGlite e tira "retratos" completos do banco.
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url"; import { execFileSync } from "node:child_process";
export const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const DL = "/Users/joaopaulomendes/Downloads";
export const PACOTE = DL + "/publicacao-staziamed-2026-10-11";
export const MIG = path.join(WT, "supabase/migrations");
export const LEVA3 = ["009700_questoes_figura", "009701_questoes_comentario_em_revisao", "009702_questoes_historico", "009710_aulas_apagar_arquivo", "009711_aulas_xp_ate_o_fim",
  "009720_podcasts_aprovacao_revisor", "009721_podcasts_arquivos_esquecidos", "009730_teste_vencido_trava_pago", "009731_elite_beneficios", "009732_cadastro_sem_teste"].map((n) => `20261003${n}.sql`);
export const LEVA = ["009800_questoes_staziamed", "009801_questoes_staziamed_aluno", "009810_analise_ia_pedidos", "009820_fontes_atualidade", "009830_fechamento_leva4"].map((n) => `20261003${n}.sql`);
export const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const read = (p) => fs.readFileSync(p, "utf8");
export const sqlLeva = () => LEVA.map((f) => read(path.join(MIG, f)));
export const sqlLeva3 = () => LEVA3.map((f) => read(path.join(MIG, f)));
export async function montaProducao(log = () => {}) {
  const base = execFileSync("git", ["-C", WT, "--no-optional-locks", "ls-tree", "--name-only", "23d53c1", "supabase/migrations/"], { encoding: "utf8" }).trim().split("\n");
  const db = new PGlite();
  await db.exec(read(path.join(WT, "supabase/tests/bootstrap.sql")));
  for (const f of base) await db.exec(execFileSync("git", ["-C", WT, "--no-optional-locks", "show", `23d53c1:${f}`], { encoding: "utf8", maxBuffer: 1 << 28 }));
  log(`base 23d53c1: ${base.length} migracoes`);
  const partes = fs.readdirSync(PACOTE).filter((f) => /^[1-7]-/.test(f)).sort();
  for (const p of partes) await db.exec(read(path.join(PACOTE, p)));
  log(`pacote 2026-10-11: ${partes.length} partes (${partes.map((p) => p[0]).join(",")})`);
  for (const f of ["COLAR-arena-equipe-fora-do-ranking.sql", "DESLIGAR-tetos-de-IA.sql", "COLAR-fontes-oficiais-9610.sql", "COLAR-fonte-complementar-9620-9621.sql"]) { await db.exec(read(path.join(DL, f))); log("colado: " + f); }
  for (const f of LEVA3) { await db.exec(read(path.join(MIG, f))); }
  log("leva 3: 10 migracoes");
  return db;
}
// Retrato completo (estrutura + permissoes + gatilhos + politicas + resumo dos dados).
export async function retrato(db) {
  const q = async (s) => (await db.query(s)).rows;
  const r = {};
  r.funcoes = Object.fromEntries((await q(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def, p.proacl::text as acl, p.prosecdef as secdef, p.proconfig::text as cfg, p.provolatile::text as vol
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by 1`)).map((x) => [x.sig, x]));
  r.gatilhos = Object.fromEntries((await q(`select t.tgrelid::regclass::text || ' :: ' || t.tgname as k, pg_get_triggerdef(t.oid) as def, t.tgenabled::text as en
      from pg_trigger t where not t.tgisinternal and t.tgrelid::regclass::text !~ '^(pg_|information_schema)' order by 1`)).map((x) => [x.k, x]));
  r.politicas = Object.fromEntries((await q(`select schemaname||'.'||tablename||' :: '||policyname as k, permissive||' '||roles::text||' '||cmd||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'') as def from pg_policies order by 1`)).map((x) => [x.k, x]));
  r.tabelas = Object.fromEntries((await q(`select c.oid::regclass::text as k, c.relkind::text as kind, c.relrowsecurity as rls, c.relforcerowsecurity as frls, c.relacl::text as acl
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','S','p') order by 1`)).map((x) => [x.k, x]));
  r.colunas = Object.fromEntries((await q(`select c.relname||'.'||a.attname as k, format_type(a.atttypid,a.atttypmod) as tipo, a.attnotnull as nn, pg_get_expr(d.adbin,d.adrelid) as dflt, a.attacl::text as acl
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped order by 1`)).map((x) => [x.k, x]));
  r.restricoes = Object.fromEntries((await q(`select conrelid::regclass::text||' :: '||conname as k, pg_get_constraintdef(oid) as def from pg_constraint where connamespace='public'::regnamespace order by 1`)).map((x) => [x.k, x]));
  r.indices = Object.fromEntries((await q(`select indexname as k, indexdef as def from pg_indexes where schemaname='public' order by 1`)).map((x) => [x.k, x]));
  r.enums = Object.fromEntries((await q(`select t.typname as k, string_agg(e.enumlabel, ',' order by e.enumsortorder) as def from pg_type t join pg_enum e on e.enumtypid=t.oid group by 1 order by 1`)).map((x) => [x.k, x]));
  // dados: contagem e impressao digital (md5) de cada tabela do public
  const dados = {};
  for (const t of Object.keys(r.tabelas).filter((k) => r.tabelas[k].kind === "r")) {
    try { const x = (await q(`select count(*)::int n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') h from ${t} t`))[0]; dados[t] = { n: x.n, h: x.h }; } catch (e) { dados[t] = { erro: String(e.message).slice(0, 80) }; }
  }
  r.dados = dados;
  return r;
}
// Compara duas secoes de retrato: { novos, removidos, mudaram }
export function compara(a, b, campos = null) {
  const novos = Object.keys(b).filter((k) => !(k in a)), removidos = Object.keys(a).filter((k) => !(k in b));
  const mudaram = Object.keys(b).filter((k) => k in a && JSON.stringify(campos ? campos.map((c) => a[k][c]) : a[k]) !== JSON.stringify(campos ? campos.map((c) => b[k][c]) : b[k]));
  return { novos, removidos, mudaram };
}
