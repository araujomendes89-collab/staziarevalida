// CÉREBRO DO TUTOR — medição da busca nova (ch_worker_tutor_kb_buscar, migração 013620) na PRODUÇÃO, só leitura.
// A migração ainda não está no banco (e nada pode ser gravado lá): a busca é SIMULADA com um SELECT só, sobre as fontes oficiais que já
// têm vetor (ch_source_passages + ch_passage_embeddings, HNSW de verdade), com a mesma forma da função: palavras (tsquery montada por
// consulta.ts) + significado (HNSW sem filtro de distância, ef_search 120, varredura iterativa) + fusão RRF k=60 + portão de aprovação
// linha a linha (inclusive o md5 da versão) + travas do aluno (questões travadas e respondidas) + no máximo 2 por fonte + 5 resultados.
// Compara com a busca de hoje do Tutor (ch_worker_search_official_passages só por palavras, 3 resultados) e com "select 1" (rede).
// Também confere a regressão do "1 mg" na anafilaxia (a dose do adulto IM é 0,5 mg).
// Sessão READ ONLY (banco-leitura.mjs): qualquer escrita daria erro no próprio banco.
//   node_modules/.bin/tsx scripts/voz-teste/medir-cerebro.ts            (PASSADAS=3 por padrão)
// Saída: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/medicao-cerebro.json e medicao-cerebro.md
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sourceQuery } from "../../server/tutor/engine";
import { tsqueryDe } from "../../server/tutor/conhecimento/consulta";
import { abrirLeitura, estatistica } from "./banco-leitura.mjs";

const DIR = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro";
const PASSADAS = Math.max(1, Number(process.env.PASSADAS) || 3);
const dados = JSON.parse(fs.readFileSync(path.join(DIR, "embedding-pergunta.json"), "utf8")) as { modelo_dos_vetores: string; vetores: { pergunta: string; values: number[] }[] };
const V = "extensions.vector(768)";
const dist = `((e.embedding::${V}) operator(extensions.<=>) ($2::${V}))`;

// $1 tsquery · $2 vetor · $3 modelo · $4 aluno · $5 consulta crua
const BUSCA_NOVA = `
with q as (select case when coalesce($1, '') = '' then websearch_to_tsquery('portuguese', $5) else to_tsquery('portuguese', $1) end as q),
lex as (
  select p.id, row_number() over (order by ts_rank(p.tsv, q.q) desc, p.id) as rk
    from public.ch_source_passages p, q where p.tsv @@ q.q order by ts_rank(p.tsv, q.q) desc, p.id limit 60),
sem as (
  select x.passage_id as id, row_number() over (order by x.d, x.passage_id) as rk, x.d
    from (select e.passage_id, e.model, ${dist}::float8 as d from public.ch_passage_embeddings e order by ${dist} limit 120) x where x.model = $3),
fused as (
  select u.id, sum(1.0 / (60 + u.rk)) as score, min(u.d) as d
    from (select id, rk, null::float8 as d from lex union all select id, rk, d from sem) u group by u.id),
travadas as (
  select coalesce(array_agg(distinct z.id), '{}') as ids from (
    select unnest(ps.question_ids) as id from public.practice_sessions ps where ps.user_id = $4 and ps.finished_at is null and ps.kind in ('simulado', 'prova')) z),
resp as (select coalesce(array_agg(distinct a.question_id), '{}') as ids from public.question_attempts a where a.user_id = $4),
cand as (
  select fu.score, fu.d, p.id, p.source_id, p.section, p.page, p.text, s.title, s.organ, extract(year from coalesce(s.published_on, s.effective_date))::int as ano,
         md5(s.title || '|' || coalesce(s.organ, '') || '|' || coalesce(p.section, '') || '|' || coalesce(p.page::text, '') || '|' || p.text) as versao,
         (s.status = 'current' and s.audience is distinct from 'complementar' and s.retracted_at is null and (s.valid_until is null or s.valid_until >= current_date)
          and ((s.kind = 'final' and s.authority_level in ('A','B','C','D')) or (s.kind = 'society_guideline' and s.editorial_approved and coalesce(s.authority_level, 'A') in ('A','B','C','D')))
          and s.editorial_approved) as vale
    from fused fu join public.ch_source_passages p on p.id = fu.id join public.ch_sources s on s.id = p.source_id
   order by fu.score desc, p.id limit 180),
ok as (
  select c.*, row_number() over (partition by c.source_id order by c.score desc, c.id) as rg from cand c, travadas, resp where c.vale and c.versao is not null)
select coalesce(jsonb_agg(jsonb_build_object('citacao', x.title || ' · ' || split_part(split_part(x.organ, ' / ', 1), ' (', 1) || coalesce(' (' || x.ano || ')', '')
                                             || coalesce(', seção "' || case when x.section ~* '^p[áa]gina [0-9]+ do pdf' then null else x.section end || '"', '') || coalesce(', p. ' || x.page, ''),
                                             'texto', left(x.text, 1200), 'semelhanca', round((1 - x.d)::numeric, 3)) order by x.score desc), '[]'::jsonb) as r
  from (select * from ok where rg <= 2 order by score desc, id limit 5) x`;

const { c, regiao } = await abrirLeitura();
const aluno = randomUUID(); // ninguém: as travas do aluno rodam, mas sem dado pessoal
const tempo = async (sql: string, args: unknown[]) => { const t = performance.now(); const r = await c.query(sql, args); return { ms: performance.now() - t, rows: r.rows }; };
const explicar = async (sql: string, args: unknown[]) => {
  const r = await c.query(`explain (analyze, format json) ${sql}`, args);
  const plano = r.rows[0]["QUERY PLAN"][0];
  return { ms: plano["Execution Time"] as number, hnsw: JSON.stringify(plano).includes("ch_passage_embeddings_hnsw") };
};
const transacao = async <T>(fn: () => Promise<T>) => {
  await c.query("begin read only");
  try {
    await c.query("set local hnsw.ef_search = 120");
    await c.query("set local hnsw.iterative_scan = relaxed_order");
    return await fn();
  } finally {
    await c.query("commit");
  }
};

const m = { nova_cli: [] as number[], nova_srv: [] as number[], antiga_cli: [] as number[], antiga_srv: [] as number[], um: [] as number[] };
let hnsw = 0;
let execs = 0;
const resultados: { pergunta: string; tsquery: string; nova: { citacao: string; semelhanca: number | null; texto: string }[]; antiga: string[] }[] = [];
await c.query("select 1");
for (let passada = 0; passada < PASSADAS; passada++) {
  for (const v of dados.vetores) {
    const tsq = tsqueryDe(v.pergunta);
    const args = [tsq, `[${v.values.join(",")}]`, dados.modelo_dos_vetores, aluno, v.pergunta];
    const nova = await transacao(async () => {
      const e = await explicar(BUSCA_NOVA, args);
      const t = await tempo(BUSCA_NOVA, args);
      return { e, t };
    });
    m.nova_srv.push(nova.e.ms);
    m.nova_cli.push(nova.t.ms);
    execs++;
    if (nova.e.hnsw) hnsw++;
    const antigaSql = "select public.ch_worker_search_official_passages($1, 3, null) as r";
    const aArgs = [sourceQuery(v.pergunta)];
    const ae = await c.query(`explain (analyze, format json) ${antigaSql}`, aArgs);
    m.antiga_srv.push(ae.rows[0]["QUERY PLAN"][0]["Execution Time"]);
    const at = await tempo(antigaSql, aArgs);
    m.antiga_cli.push(at.ms);
    m.um.push((await tempo("select 1", [])).ms);
    if (passada === 0) resultados.push({
      pergunta: v.pergunta, tsquery: tsq,
      nova: (nova.t.rows[0].r as { citacao: string; semelhanca: number | null; texto: string }[]),
      antiga: ((at.rows[0].r ?? []) as { source: string; page: number | null }[]).map((p) => `${p.source}${p.page != null ? `, p. ${p.page}` : ""}`),
    });
  }
}
// pergunta da regressão do "1 mg" (anafilaxia): a dose do adulto IM é 0,5 mg
const anaf = resultados.find((r) => /adrenalina/.test(r.pergunta))!;
const anafTexto = anaf.nova.map((x) => x.texto).join("\n");
const contagem = (await c.query(`select
   (select count(*) from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id where s.status = 'current' and s.kind = 'final' and s.authority_level in ('A','B','C','D') and s.editorial_approved and s.audience is distinct from 'complementar') as fontes_tutor,
   (select count(*) from public.ch_passage_embeddings) as vetores`)).rows[0];
await c.end();

const sNova = estatistica(m.nova_srv), cNova = estatistica(m.nova_cli), sAnt = estatistica(m.antiga_srv), cAnt = estatistica(m.antiga_cli), um = estatistica(m.um);
const saida = {
  quando: new Date().toISOString(), regiao_do_banco: regiao, passadas: PASSADAS, perguntas: dados.vetores.length, execucoes: execs,
  hnsw_em_uso: `${hnsw}/${execs}`, contagem,
  busca_nova: { banco_ms: sNova, cliente_ms: cNova }, busca_antiga_palavras: { banco_ms: sAnt, cliente_ms: cAnt }, rede_select_1_ms: um,
  anafilaxia: { pergunta: anaf.pergunta, tem_0_5_mg: /0[,.]5\s?mg/i.test(anafTexto), tem_1_mg_isolado: /(?<![0-9,.])1\s?mg(?!\/)/i.test(anafTexto), citacoes: anaf.nova.map((x) => x.citacao) },
  brutos: { nova_banco: m.nova_srv.map((x) => +x.toFixed(1)), nova_cliente: m.nova_cli.map((x) => +x.toFixed(1)) },
  resultados,
};
fs.writeFileSync(path.join(DIR, "medicao-cerebro.json"), JSON.stringify(saida, null, 1));
const linha = (n: string, s: ReturnType<typeof estatistica>) => `| ${n} | ${s.p50} | ${s.p95} | ${s.min} | ${s.max} |`;
const md = [
  "# Medição da busca nova do cérebro do Tutor (produção, só leitura)",
  "",
  `Data: ${saida.quando}. Banco: ${regiao} (Supabase), medido deste Mac. Sessão SOMENTE LEITURA. ${dados.vetores.length} perguntas × ${PASSADAS} passadas = ${execs} buscas.`,
  "A função nova ainda não existe na produção (a migração 013620 não foi aplicada): a busca foi **simulada num SELECT só** com a mesma forma da função, sobre as fontes oficiais que já têm vetor.",
  `Trechos de fonte que o Tutor pode usar com a regra padrão (aprovação editorial): **${contagem.fontes_tutor}**; vetores na Central: ${contagem.vetores}.`,
  "",
  "## Tempo (ms)",
  "",
  "| Medida | p50 | p95 | mín. | máx. |",
  "|---|---|---|---|---|",
  linha("Busca nova: só o banco (EXPLAIN ANALYZE)", sNova),
  linha("Busca nova: ida e volta deste Mac", cNova),
  linha("Busca de hoje (só palavras, 3 trechos): só o banco", sAnt),
  linha("Busca de hoje: ida e volta deste Mac", cAnt),
  linha("select 1 (só a rede)", um),
  "",
  `Índice HNSW em uso na parte por significado: **${saida.hnsw_em_uso}** buscas (proteção contra a volta do filtro de distância).`,
  "",
  "## Regressão do \"1 mg\" na anafilaxia",
  "",
  `Pergunta: "${anaf.pergunta}". 0,5 mg nos trechos: **${saida.anafilaxia.tem_0_5_mg ? "sim" : "não"}**; "1 mg" isolado: **${saida.anafilaxia.tem_1_mg_isolado ? "sim (conferir)" : "não"}**.`,
  ...anaf.nova.map((x) => `- ${x.citacao} (semelhança ${x.semelhanca ?? "—"})`),
  "",
  "## Os 5 primeiros de cada pergunta (busca nova) e os 3 da busca de hoje",
  "",
  ...resultados.flatMap((r) => [`**${r.pergunta}**  `, `nova: ${r.nova.map((x) => x.citacao).join(" · ") || "(nada)"}  `, `hoje: ${r.antiga.join(" · ") || "(nada)"}`, ""]),
].join("\n");
fs.writeFileSync(path.join(DIR, "medicao-cerebro.md"), md);
console.log(md.split("\n").slice(0, 22).join("\n"));
