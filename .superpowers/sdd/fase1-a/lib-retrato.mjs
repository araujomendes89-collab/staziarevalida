import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
export async function montaLib() {
  const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
  return { WT, PGlite, retrato, compara };
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
