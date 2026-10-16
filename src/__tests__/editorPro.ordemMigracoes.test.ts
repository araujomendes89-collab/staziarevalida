// @vitest-environment node
/**
 * Ensaio da junção da onda 1 do editor profissional (ramo ed-integra): as 5 migrações do editor
 * (013020, 013030, 013040, 013060, 013080) na ORDEM DE PRODUÇÃO (013080 antes da 013040, que usa as funções dela)
 * e na ordem numérica (a dos testes) dão o MESMO banco; colar tudo de novo não muda nada; e todos os SQL de conferência dão OK.
 * Ordem para colar em produção: /Volumes/StaziaMed/.tmp-aulas/editor-pro/ORDEM-PRODUCAO.md
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations");
const ler = (p: string) => fs.readFileSync(p, "utf8");
const todas = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort();
const ED = {
  "013020": "20261003013020_editor_pro_ricos_aluno.sql",
  "013030": "20261003013030_editor_pro_imagens.sql",
  "013040": "20261003013040_editor_pro_resumo_rico.sql",
  "013060": "20261003013060_editor_pro_historico.sql",
  "013080": "20261003013080_aprovacao_presa_ao_conteudo.sql",
};
const ORDEM_PRODUCAO = ["013020", "013030", "013080", "013040", "013060"].map((k) => ED[k as keyof typeof ED]);
const doEditor = new Set(Object.values(ED));
const conferir = [
  "supabase/conferir/editor-pro-ricos-aluno.sql",
  "supabase/conferir/editor-pro-imagens.sql",
  "supabase/conferir/editor-pro-resumo-rico.sql",
  "supabase/conferir/editor-pro-historico.sql",
].map((p) => [p, ler(path.join(ROOT, p))] as const);
const CONFERIR_013080 = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013080-conferir.sql";
const CONTAR_APROVACOES = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/contar-aprovacoes.sql";

async function montar(ordemEditor: string[] | null) {
  const db = new PGlite();
  await db.exec(ler(path.join(ROOT, "supabase/tests/bootstrap.sql")));
  // como no Supabase: o esquema storage existe antes (a 013030 cria o depósito privado doc-imagens)
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
  `);
  if (!ordemEditor) {
    for (const f of todas) await db.exec(ler(path.join(MIG, f)));
  } else {
    const primeira = ORDEM_PRODUCAO.slice().sort()[0];
    for (const f of todas.filter((f) => f < primeira && !doEditor.has(f))) await db.exec(ler(path.join(MIG, f)));
    for (const f of ordemEditor) await db.exec(ler(path.join(MIG, f)));
    for (const f of todas.filter((f) => f > primeira && !doEditor.has(f))) await db.exec(ler(path.join(MIG, f)));
  }
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
    depositos: await q(`select id, public::text, file_size_limit::text from storage.buckets order by 1`),
  };
}

async function conferirTudo(db: PGlite) {
  for (const [nome, s] of conferir) {
    const r = await db.query<{ resultado: string }>(s);
    expect(`${nome}: ${r.rows[0].resultado}`).toMatch(new RegExp(`^${nome}: OK`));
  }
  // a "conferência rápida de tudo junto" do ORDEM-PRODUCAO.md
  const rapida = await db.query<Record<string, unknown>>(`select
    position('''ricos''' in pg_get_functiondef('public.app_tema_aula(text)'::regprocedure)) > 0 as m0_aluno_le_rico,
    to_regclass('public.ch_doc_assets') is not null as m11a_imagens,
    to_regprocedure('public.ch_conteudo_hash(jsonb)') is not null as r8_hash_de_conteudo,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lessons' and column_name = 'summary_rico') as m13_resumo_rico,
    to_regprocedure('public.app_ch_doc_trava(uuid, text, boolean)') is not null as m8_trava,
    (select count(*) from public.ch_unit_versions where public.ch_conteudo_hash(content) <> content_hash)::int as versoes_com_hash_diferente`);
  expect(rapida.rows[0]).toEqual({ m0_aluno_le_rico: true, m11a_imagens: true, r8_hash_de_conteudo: true, m13_resumo_rico: true, m8_trava: true, versoes_com_hash_diferente: 0 });
  if (fs.existsSync(CONFERIR_013080)) {
    const res = (await db.exec(ler(CONFERIR_013080))).map((r) => r.rows[0]);
    expect(res[0]).toEqual({ tem_hash_de_conteudo: true, tem_registro_formatacao: true, salvar_usa_conteudo: true, publicar_confere_conteudo: true, aula_confere_conteudo: true });
    expect(Number(res[1].versoes_com_hash_diferente)).toBe(0);
  }
  // a consulta só-leitura de antes/depois da 013080 roda (e conta igual ao 013080-conferir)
  if (fs.existsSync(CONTAR_APROVACOES)) {
    const res = await db.exec(ler(CONTAR_APROVACOES));
    expect(res).toHaveLength(3);
    expect(res[0].rows[0]).toHaveProperty("aprovacoes_validas");
    expect(res[2].rows[0]).toHaveProperty("versoes_com_aprovacao_valida");
  }
}

describe("Editor profissional, onda 1: ordem das migrações (ed-integra)", () => {
  let producao: PGlite;
  let numerica: PGlite;

  it("ordem de produção (013020, 013030, 013080, 013040, 013060): aplica e todas as conferências dão OK", async () => {
    producao = await montar(ORDEM_PRODUCAO);
    await conferirTudo(producao);
  }, 300_000);

  it("ordem numérica (a dos testes) dá o mesmo banco que a de produção", async () => {
    numerica = await montar(null);
    await conferirTudo(numerica);
    const a = await retrato(producao);
    const b = await retrato(numerica);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k], k).toEqual(a[k]);
  }, 300_000);

  it("colar as 5 de novo (na ordem de produção) não muda nada", async () => {
    const antes = await retrato(producao);
    for (const f of ORDEM_PRODUCAO) await producao.exec(ler(path.join(MIG, f)));
    expect(await retrato(producao)).toEqual(antes);
    await conferirTudo(producao);
  }, 300_000);

  it("nenhuma migração do editor redefine função mexida depois no main (nivelamento 012300, voz 012800, gamificação 013000, reserva 013010)", () => {
    const funcoes = (f: string) => new Set([...ler(path.join(MIG, f)).matchAll(/function\s+public\.([a-z0-9_]+)\s*\(/gi)].map((m) => m[1].toLowerCase()));
    const doMain = todas.filter((f) => f >= "20261003012300" && !doEditor.has(f)).flatMap((f) => [...funcoes(f)]);
    for (const f of doEditor) for (const fn of funcoes(f)) expect(doMain, `${f} redefine ${fn}`).not.toContain(fn);
  });
});
