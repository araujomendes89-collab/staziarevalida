// CÉREBRO DO TUTOR — bancada de qualidade da busca nova num banco LOCAL (PGlite) com o conteúdo de verdade, lido da produção em
// modo SOMENTE LEITURA (nada é gravado lá). Copia só conteúdo (fontes e vetores da Central, aulas, atualizações, questões, flashcards,
// estações sem o conteúdo, equivalências); NADA pessoal (alunos, tentativas, conversas): a aluna da bancada é inventada aqui.
// Depois roda o indexador de verdade (sem gerar vetor novo: as fontes reaproveitam o da Central) e as 24 perguntas da bancada
// (scripts/voz-teste/perguntas-cerebro.mjs, com os vetores já gerados em embedding-pergunta.json) pela FUNÇÃO de verdade
// (ch_worker_tutor_kb_buscar), mais o material do tema de 4 conversas.
//   node_modules/.bin/tsx scripts/conhecimento/bancada-local.ts --pglite <pasta nova> [--copiar]
// Saída: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/bancada-local.md e .json
// Sem pgvector no PGlite: o tempo daqui NÃO vale como medida de latência (o cosseno é calculado vetor a vetor); a latência está em
// scripts/voz-teste/medir-cerebro.ts (produção, só leitura, HNSW de verdade).
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sincronizar } from "../../server/tutor/conhecimento/indexador";
import { buscarConhecimento } from "../../server/tutor/conhecimento/buscar";
import { pacoteDoTema } from "../../server/tutor/conhecimento/pacote";
import { abrirLeitura } from "../voz-teste/banco-leitura.mjs";

const DIR = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro";
const ROOT = path.resolve(import.meta.dirname, "../..");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const pasta = arg("--pglite");
if (!pasta) { console.error("Uso: tsx scripts/conhecimento/bancada-local.ts --pglite <pasta> [--copiar]"); process.exit(2); }
const nova = !fs.existsSync(pasta);
const pg = new PGlite(path.resolve(pasta));
const ALUNA = "00000000-0000-4000-8000-00000000a001";
const SESSOES = { livre: "00000000-0000-4000-8000-00000000b001", anafilaxia: "00000000-0000-4000-8000-00000000b002", dengue: "00000000-0000-4000-8000-00000000b003", asma: "00000000-0000-4000-8000-00000000b004", sifilis: "00000000-0000-4000-8000-00000000b005" };

if (nova) {
  const M = path.join(ROOT, "supabase/migrations");
  await pg.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(M).filter((f) => f.endsWith(".sql")).sort()) await pg.exec(fs.readFileSync(path.join(M, f), "utf8"));
  console.log("[bancada] banco local criado com as migrações");
}

if (process.argv.includes("--copiar")) {
  const { c } = await abrirLeitura();
  const copiar = async (tabela: string, sql: string, lote = 500) => {
    let total = 0;
    // colunas gravaveis (sem as geradas, como o tsv)
    const cols = (await pg.query<{ c: string }>(`select quote_ident(column_name) as c from information_schema.columns where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`, [tabela])).rows.map((x) => x.c).join(", ");
    for (let off = 0; ; off += lote) {
      const r = await c.query(`${sql} limit ${lote} offset ${off}`);
      if (!r.rows.length) break;
      await pg.query(`insert into public.${tabela} (${cols}) overriding system value select ${cols} from json_populate_recordset(null::public.${tabela}, $1) on conflict do nothing`, [JSON.stringify(r.rows)]);
      total += r.rows.length;
      if (r.rows.length < lote) break;
    }
    console.log(`[bancada] ${tabela}: ${total}`);
  };
  await pg.exec("set session_replication_role = replica"); // sem gatilhos nem chaves estrangeiras: é cópia de conteúdo
  await copiar("ch_sources", "select * from public.ch_sources order by id");
  await copiar("ch_source_passages", "select id, source_id, section, page, population, care_setting, theme, text, reading_kind, literal_check from public.ch_source_passages order by id");
  await copiar("ch_passage_embeddings", "select * from public.ch_passage_embeddings order by passage_id", 300);
  await copiar("ch_units", "select * from public.ch_units order by id");
  await copiar("ch_unit_versions", "select * from public.ch_unit_versions where status in ('published', 'retired') order by id", 50);
  await copiar("ch_publications", "select * from public.ch_publications order by id");
  await copiar("lessons", "select * from public.lessons order by id", 50);
  await copiar("guideline_updates", "select * from public.guideline_updates order by id", 100);
  await copiar("exams", "select * from public.exams order by id");
  await copiar("questions", "select id, code, exam_id, number, booklet, area, specialty, topic, subtopic, statement, options, correct_option, status, key_finding, expected_conduct, inep_intent, images, sources, created_at, updated_at, needs_image, explanations_review, comment_review, origin, retired_at, support, source_quotes from public.questions order by id", 300);
  await copiar("question_official_answers", "select * from public.question_official_answers where is_current order by id");
  await copiar("question_equivalents", "select * from public.question_equivalents order by question_id");
  await copiar("question_relations", "select * from public.question_relations order by id");
  await copiar("flashcards", "select * from public.flashcards where owner_id is null order by id");
  await copiar("checklist_stations", "select * from public.checklist_stations order by id"); // sem checklist_station_contents (roteiro e checklist)
  await c.end();
  await pg.exec("set session_replication_role = origin");
  await pg.query(`insert into auth.users (id, email) values ($1, 'bancada@local') on conflict do nothing`, [ALUNA]);
  await pg.query(`insert into public.tutor_sessions (id, user_id, mode, title, topic, question_id, question_state, personality_id, intensity) values
     ($1, $6, 'livre', 'Livre', null, null, 'none', 'amigavel', 2), ($2, $6, 'livre', 'Anafilaxia', 'Anafilaxia', null, 'none', 'amigavel', 2),
     ($3, $6, 'livre', 'Dengue', 'Dengue', null, 'none', 'amigavel', 2), ($4, $6, 'livre', 'Asma', 'Crise de asma', null, 'none', 'amigavel', 2),
     ($5, $6, 'livre', 'Sífilis', 'Sífilis na gestação', null, 'none', 'amigavel', 2) on conflict do nothing`,
    [SESSOES.livre, SESSOES.anafilaxia, SESSOES.dengue, SESSOES.asma, SESSOES.sifilis, ALUNA]);
}

const db = {
  mode: "dev" as const,
  async service<T>(fn: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args);
    const r = await pg.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0]?.result as T;
  },
};
const deps = { db, log: (m: string) => console.log(m) };

const t0 = Date.now();
const rel = await sincronizar(db, { dirMapas: path.join(ROOT, "src/novo/app/mapas/dados"), log: (m) => console.log(m) });
console.log(`[bancada] indexador: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const situacao = await db.service<Record<string, unknown>>("ch_worker_tutor_kb_situacao", {});

const dados = JSON.parse(fs.readFileSync(path.join(DIR, "embedding-pergunta.json"), "utf8")) as { modelo_dos_vetores: string; vetores: { pergunta: string; values: number[] }[] };
const resultados: { pergunta: string; ms: number; trechos: { tipo: string; citacao: string; por?: string }[]; texto: string }[] = [];
for (const v of dados.vetores) {
  const t = performance.now();
  const r = await buscarConhecimento(deps, { userId: ALUNA, sessionId: SESSOES.livre, pergunta: v.pergunta, vetor: { model: dados.modelo_dos_vetores, values: v.values }, via: "texto" });
  resultados.push({ pergunta: v.pergunta, ms: Math.round(performance.now() - t), trechos: r.trechos.map((x) => ({ tipo: x.tipo, citacao: x.citacao, por: x.por })), texto: r.trechos.map((x) => x.texto).join("\n") });
}
const pacotes: { sessao: string; chars: number; tipos: string[]; citacoes: string[] }[] = [];
for (const [nome, sid] of Object.entries(SESSOES).filter(([n]) => n !== "livre")) {
  const p = await pacoteDoTema(deps, { userId: ALUNA, sessionId: sid });
  pacotes.push({ sessao: nome, chars: p.chars, tipos: p.trechos.map((x) => x.tipo), citacoes: p.trechos.map((x) => x.citacao) });
}
await pg.close();

const anaf = resultados.find((r) => /adrenalina/.test(r.pergunta))!;
const tiposTodos = resultados.flatMap((r) => r.trechos.map((t) => t.tipo));
const contaTipos = Object.fromEntries([...new Set(tiposTodos)].map((t) => [t, tiposTodos.filter((x) => x === t).length]));
const saida = { quando: new Date().toISOString(), indexador: rel, situacao, contaTipos, anafilaxia: { tem_0_5_mg: /0[,.]5\s?mg/i.test(anaf.texto), tem_1_mg: /(?<![0-9,.])1\s?mg(?!\/)/i.test(anaf.texto), trechos: anaf.trechos }, resultados, pacotes };
fs.writeFileSync(path.join(DIR, "bancada-local.json"), JSON.stringify(saida, null, 1));
const md = [
  "# Bancada local do cérebro do Tutor (conteúdo real lido da produção, banco PGlite)",
  "",
  `Data: ${saida.quando}. Conteúdo copiado da produção em sessão SOMENTE LEITURA; nada pessoal. Indexador de verdade, sem gerar vetor novo (fontes com o vetor da Central; aulas, atualizações, questões e flashcards só por palavras até gerar os vetores). Tempo do PGlite não é medida de latência (sem pgvector).`,
  "",
  "## O que entrou no índice (regras padrão do dono)",
  "",
  "```json",
  JSON.stringify(situacao, null, 1),
  "```",
  "",
  `Origens recusadas pelo banco na gravação: ${Object.entries(rel.tipos).map(([t, x]) => `${t} ${x.recusadas}`).join(", ")}. Linhas com cara de comando retiradas: ${Object.values(rel.tipos).reduce((n, x) => n + x.comandosRetirados, 0)}.`,
  "",
  `## Tipos devolvidos nas 24 perguntas (5 por pergunta): ${JSON.stringify(contaTipos)}`,
  "",
  `## Regressão do "1 mg" na anafilaxia: 0,5 mg ${saida.anafilaxia.tem_0_5_mg ? "presente" : "AUSENTE"}; "1 mg" ${saida.anafilaxia.tem_1_mg ? "PRESENTE (conferir)" : "ausente"}`,
  ...anaf.trechos.map((t) => `- [${t.tipo}] ${t.citacao}`),
  "",
  "## Material do tema (abertura) por conversa",
  "",
  ...pacotes.map((p) => `- **${p.sessao}**: ${p.chars} caracteres; ${p.citacoes.map((c, i) => `[${p.tipos[i]}] ${c}`).join(" · ") || "(vazio)"}`),
  "",
  "## Os 5 primeiros de cada pergunta",
  "",
  ...resultados.flatMap((r) => [`**${r.pergunta}**  `, ...r.trechos.map((t) => `- [${t.tipo}, ${t.por}] ${t.citacao}`), ""]),
].join("\n");
fs.writeFileSync(path.join(DIR, "bancada-local.md"), md);
console.log(md.split("\n").slice(0, 60).join("\n"));
