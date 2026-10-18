// @vitest-environment node
/**
 * Ensaio da junção da EXPANSÃO do editor profissional (ramo ed-expansao-integra): as 6 migrações novas
 * (013100 figuras no PDF, 013110 base dos campos, 013120 Questões, 013130 Atualizações, 013140 Podcasts, 013160 Central + Aulas).
 * Produção já tem tudo do main, INCLUSIVE a 013200 (número maior). Prova que:
 *   - na ordem de produção (main inteiro, depois as 6) e na ordem numérica (a dos testes) o banco final é IDÊNTICO;
 *   - nenhuma das 6 redefine função/gatilho de migração de número maior que já está no main (a 013200);
 *   - colar as 6 de novo não muda nada; todos os SQL de conferir dão OK;
 *   - os SQL de desfazer, na ordem inversa, devolvem o banco de antes (funções, colunas, gatilhos, regras, políticas).
 * Ordem para colar: /Volumes/StaziaMed/.tmp-aulas/editor-pro/RELATORIO-EXPANSAO.md
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations");
const SQL = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql";
const ler = (p: string) => fs.readFileSync(p, "utf8");
const todas = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort();
const NUMEROS = ["013100", "013110", "013120", "013130", "013140", "013160"];
const EXPANSAO = NUMEROS.map((n) => todas.find((f) => f.startsWith(`20261003${n}_`))!);
const daExpansao = new Set(EXPANSAO);
// Migrações escritas DEPOIS que a expansão já estava em produção (produção ia até a 013900): em produção vêm depois da expansão e
// podem usar o que ela criou (ex.: 013940 comunicados usa ch_formatacao_valida da 013110). Ficam no fim nas duas ordens e são
// desfeitas antes da expansão no ensaio do desfazer.
const POSTERIORES = todas.filter((f) => f.slice(0, 14) > "20261003013900" && !daExpansao.has(f));
const posterior = new Set(POSTERIORES);
const temSql = fs.existsSync(SQL);

async function montar(ordem: "producao" | "numerica") {
  const db = new PGlite();
  await db.exec(ler(path.join(ROOT, "supabase/tests/bootstrap.sql")));
  // como no Supabase: o esquema storage existe antes (a 013030 cria o depósito privado doc-imagens)
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
  `);
  const lista = ordem === "numerica" ? todas : [...todas.filter((f) => !daExpansao.has(f) && !posterior.has(f)), ...EXPANSAO, ...POSTERIORES];
  for (const f of lista) await db.exec(ler(path.join(MIG, f)));
  return db;
}

async function montarSemExpansao() {
  const db = new PGlite();
  await db.exec(ler(path.join(ROOT, "supabase/tests/bootstrap.sql")));
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
  `);
  for (const f of todas.filter((f) => !daExpansao.has(f) && !posterior.has(f))) await db.exec(ler(path.join(MIG, f)));
  return db;
}

async function retrato(db: PGlite) {
  const q = async (s: string) => (await db.query<Record<string, string>>(s)).rows.map((r) => Object.values(r).join(" | "));
  return {
    funcoes: await q(`select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)), coalesce(array_to_string(p.proacl, ','), '')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`),
    colunas: await q(`select table_name, column_name, data_type, coalesce(column_default, '') from information_schema.columns
                        where table_schema = 'public' order by 1, 2`),
    gatilhos: await q(`select c.relname, t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                        join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal order by 1, 2`),
    regras: await q(`select conrelid::regclass::text, conname, md5(pg_get_constraintdef(oid)) from pg_constraint
                      where connamespace = 'public'::regnamespace order by 1, 2`),
    politicas: await q(`select tablename, policyname, cmd, coalesce(qual, ''), coalesce(with_check, '') from pg_policies where schemaname = 'public' order by 1, 2`),
    grantsColunas: await q(`select table_name, column_name, grantee, privilege_type from information_schema.column_privileges
                             where table_schema = 'public' and column_name in ('formatacao', 'key_points_rico') order by 1, 2, 3, 4`),
  };
}

// Todo valor booleano de todo resultado tem de ser true; "resultado" (texto) tem de começar com OK.
async function conferir(db: PGlite, n: string) {
  const res = await db.exec(ler(path.join(SQL, `${n}-conferir.sql`)));
  expect(res.length, `${n}: sem resultado`).toBeGreaterThan(0);
  for (const r of res)
    for (const linha of r.rows as Record<string, unknown>[])
      for (const [k, v] of Object.entries(linha)) {
        if (typeof v === "boolean") expect(v, `${n}-conferir: ${k} (${JSON.stringify(linha)})`).toBe(true);
        if (k === "resultado") expect(String(v), `${n}-conferir`).toMatch(/^OK/);
      }
}

describe("Editor profissional, expansão: ordem das migrações (ed-expansao-integra)", () => {
  let producao: PGlite;

  it("as 6 migrações existem e nenhuma redefine função de migração de número maior já no main (013200)", () => {
    expect(EXPANSAO.every(Boolean)).toBe(true);
    const funcoes = (f: string) => new Set([...ler(path.join(MIG, f)).matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)].map((m) => m[1].toLowerCase()));
    for (const f of EXPANSAO) {
      const depois = todas.filter((g) => g > f && !daExpansao.has(g) && !posterior.has(g)).flatMap((g) => [...funcoes(g)]);
      for (const fn of funcoes(f)) expect(depois, `${f} redefine ${fn}, que uma migração de número maior também define`).not.toContain(fn);
    }
  });

  it("ordem de produção (main inteiro com a 013200, depois 013100 → 013160): aplica e todas as conferências dão OK", async () => {
    producao = await montar("producao");
    const r = await retrato(producao);
    for (const c of ["questions | formatacao", "draft_questions | formatacao", "guideline_updates | formatacao", "lessons | key_points_rico"])
      expect(r.colunas.some((x) => x.startsWith(c + " |")), c).toBe(true);
    expect(r.grantsColunas.filter((x) => /\| (anon|authenticated) \| SELECT$/.test(x) && /^(questions|guideline_updates) \|/.test(x)), "aluno não lê a coluna formatacao").toEqual([]);
    expect(temSql).toBe(true);
    if (temSql) for (const n of NUMEROS) await conferir(producao, n);
  }, 600_000);

  it("ordem numérica (a dos testes) dá o mesmo banco que a de produção", async () => {
    const numerica = await montar("numerica");
    const a = await retrato(producao);
    const b = await retrato(numerica);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k], k).toEqual(a[k]);
    await numerica.close();
  }, 600_000);

  it("colar as 6 de novo (e a 013200 de novo) não muda nada", async () => {
    const antes = await retrato(producao);
    for (const f of [...EXPANSAO, todas.find((f) => f.startsWith("20261003013200_"))!]) await producao.exec(ler(path.join(MIG, f)));
    expect(await retrato(producao)).toEqual(antes);
    if (temSql) for (const n of NUMEROS) await conferir(producao, n);
  }, 600_000);

  it.skipIf(!temSql)("desfazer na ordem inversa (013160 → 013100) devolve o banco de antes da expansão", async () => {
    for (const f of [...POSTERIORES].reverse()) await producao.exec(ler(path.join(ROOT, "supabase/desfazer", f.replace(/\.sql$/, ".desfazer.sql"))));
    for (const n of [...NUMEROS].reverse()) await producao.exec(ler(path.join(SQL, `${n}-desfazer.sql`)));
    const base = await montarSemExpansao();
    const a = await retrato(base);
    const b = await retrato(producao);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k], k).toEqual(a[k]);
    await base.close();
  }, 600_000);
});
