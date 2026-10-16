#!/usr/bin/env node
/**
 * Gera a migração SQL com a carga da dificuldade na escala do Inep (p de acerto; faixas do Enade),
 * a partir do CSV montado por scripts/dificuldade/recalibrar.py (medidas dos microdados + estimadas pela rubrica).
 *
 * NÃO altera e NÃO toca em question_difficulty_review (validação humana).
 * Apenas insere ou atualiza question_difficulty_agents.
 *
 * Uso:
 *   node scripts/dificuldade/gerar-sql-dados.mjs [caminho/para/classificacao.csv]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const CSV_PADRAO = "/Volumes/StaziaMed/.tmp-aulas/dificuldade/recalibracao/dificuldade-inep.csv";
const SAIDA_SQL_PADRAO = path.join(
  RAIZ,
  "supabase/migrations/20261003012601_dificuldade_classificada_agentes_dados.sql"
);

/**
 * Parser CSV simples e correto (trata aspas duplas, quebras de linha e aspas dobradas).
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = String(text).replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const cleanRows = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (cleanRows.length === 0) return [];

  const [head, ...body] = cleanRows;
  const keys = head.map((h) => h.trim().toLowerCase());

  return body.map((r, rowIndex) => {
    const obj = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const val = r[i];
      obj[k] = val === undefined || val === "" || val === "NULL" ? null : val;
    }
    obj._linhaCsv = rowIndex + 2;
    return obj;
  });
}

/**
 * Escapa literais de texto para SQL (aspas simples dobradas).
 */
export function escapeSql(valor) {
  return "'" + String(valor).replace(/'/g, "''") + "'";
}

const FAIXAS = ["muito_facil", "facil", "medio", "dificil", "muito_dificil"];
/** Faixa do Inep (Enade, Relatório Síntese de Área 1.5.1) pelo p arredondado a 2 casas: 1 muito fácil ... 5 muito difícil. */
export function nivelInep(p) {
  // igual ao check do banco: p é gravado com 4 casas e round(p, 2) arredonda metade para longe do zero
  const k = Math.round(Number(Number(p).toFixed(4)) * 10000);
  return k >= 8550 ? 1 : k >= 6050 ? 2 : k >= 4050 ? 3 : k >= 1550 ? 4 : 5;
}
const faixaCurta = (n) => (n <= 2 ? "facil" : n === 3 ? "media" : "dificil");
const num = (v) => (v == null || String(v).trim() === "" ? null : Number(v));

/**
 * Valida uma linha do CSV (colunas: id, p, p_low, p_high, method, source, n_respondents, irt_b, point_biserial,
 * confidence, reason, rubric) e devolve o registro já com nível e faixas calculados pelo p.
 */
export function validarELimparLinha(row) {
  const onde = `Linha ${row._linhaCsv} (questão ${row.id ?? "?"})`;
  const id = row.id ? String(row.id).trim() : "";
  if (!id) throw new Error(`Linha ${row._linhaCsv}: campo "id" da questão é obrigatório.`);
  const p = num(row.p), pLow = num(row.p_low), pHigh = num(row.p_high);
  if (p == null || !(p >= 0 && p <= 1)) throw new Error(`${onde}: p "${row.p}" inválido (0 a 1).`);
  const method = String(row.method ?? "").trim();
  if (!["medida", "estimada"].includes(method)) throw new Error(`${onde}: method deve ser "medida" ou "estimada".`);
  const source = String(row.source ?? "").trim();
  if (source.length < 3 || source.length > 400) throw new Error(`${onde}: source ausente ou longo demais.`);
  const n = num(row.n_respondents), b = num(row.irt_b), pb = num(row.point_biserial);
  if (method === "medida" && !(Number.isInteger(n) && n > 0)) throw new Error(`${onde}: medida exige n_respondents.`);
  if (method === "medida" && (pLow != null || pHigh != null)) throw new Error(`${onde}: medida não leva intervalo.`);
  if (method === "estimada") {
    if (n != null || b != null || pb != null) throw new Error(`${onde}: estimada não leva n, b nem bisserial.`);
    if (pLow == null || pHigh == null || !(pLow <= p && p <= pHigh) || pLow < 0 || pHigh > 1)
      throw new Error(`${onde}: estimada exige intervalo p_low <= p <= p_high.`);
  }
  if (b != null && !(b >= -10 && b <= 10)) throw new Error(`${onde}: irt_b fora de -10 a 10.`);
  if (pb != null && !(pb >= -1 && pb <= 1)) throw new Error(`${onde}: bisserial fora de -1 a 1.`);
  const confidence = String(row.confidence ?? "").trim();
  if (!["alta", "media", "baixa"].includes(confidence)) throw new Error(`${onde}: confiança inválida.`);
  const reason = row.reason ? String(row.reason).trim().slice(0, 600) : null;
  let rubric = null;
  if (row.rubric) {
    try { rubric = JSON.parse(row.rubric); } catch { throw new Error(`${onde}: rubric não é JSON válido.`); }
  }
  const level = nivelInep(p);
  return { questionId: id, level, inepBand: FAIXAS[level - 1], band: faixaCurta(level), p, pLow, pHigh, method, source,
           n, b, pb, confidence, reason, rubric };
}

const lit = (v) => (v == null ? "null" : escapeSql(v));
const numLit = (v, tipo) => (v == null ? `null::${tipo}` : `${v}::${tipo}`);

/** Monta o SQL idempotente (insert ... on conflict do update), só para questões que existem no banco. */
export function construirSql(registros, caminhoCsv) {
  const cont = { medida: 0, estimada: 0 };
  for (const r of registros) cont[r.method]++;
  const linhasValores = registros.map((r) =>
    `    (${escapeSql(r.questionId)}, ${r.level}::smallint, ${escapeSql(r.inepBand)}, ${escapeSql(r.band)}, ${numLit(r.p.toFixed(4), "numeric")}, ` +
    `${numLit(r.pLow?.toFixed(4), "numeric")}, ${numLit(r.pHigh?.toFixed(4), "numeric")}, ${escapeSql(r.method)}, ${escapeSql(r.source)}, ` +
    `${numLit(r.n, "integer")}, ${r.b == null ? "null::text" : "'rasch'"}, ${numLit(r.b, "double precision")}, ${numLit(r.pb, "double precision")}, ` +
    `${escapeSql(r.confidence)}, ${lit(r.reason)}, ${r.rubric ? `${escapeSql(JSON.stringify(r.rubric))}::jsonb` : "null::jsonb"})`
  );
  return `-- Dificuldade das questões na escala do Inep (índice de facilidade p; faixas do Enade) — carga de dados.
-- NÃO é validação humana. medida = p dos microdados do Inep; estimada = rubrica médica calibrada contra as medidas.
-- Total de linhas: ${registros.length} (medidas: ${cont.medida}; estimadas: ${cont.estimada})
-- Origem dos dados: ${path.basename(caminhoCsv)}
-- Idempotente: pode rodar de novo; só grava questões que existem; não toca na dificuldade validada pela equipe.

insert into public.question_difficulty_agents (question_id, level, inep_band, band, p, p_low, p_high, method, source,
  n_respondents, irt_model, irt_b, point_biserial, confidence, reason, rubric)
select v.* from (
  values
${linhasValores.join(",\n")}
) as v(question_id, level, inep_band, band, p, p_low, p_high, method, source, n_respondents, irt_model, irt_b, point_biserial,
       confidence, reason, rubric)
join public.questions q on q.id = v.question_id
on conflict (question_id) do update set
  level = excluded.level, inep_band = excluded.inep_band, band = excluded.band, p = excluded.p, p_low = excluded.p_low,
  p_high = excluded.p_high, method = excluded.method, source = excluded.source, n_respondents = excluded.n_respondents,
  irt_model = excluded.irt_model, irt_b = excluded.irt_b, point_biserial = excluded.point_biserial,
  confidence = excluded.confidence, reason = excluded.reason, rubric = excluded.rubric, classified_at = now();
`;
}

/**
 * Executa o processamento do CSV e geração do SQL.
 */
export function executar(caminhoCsv = CSV_PADRAO, caminhoSaida = SAIDA_SQL_PADRAO) {
  if (!fs.existsSync(caminhoCsv)) {
    console.error(`Erro: arquivo CSV não encontrado em "${caminhoCsv}".`);
    process.exit(1);
  }

  const conteudoCsv = fs.readFileSync(caminhoCsv, "utf8");
  const linhasCruas = parseCsv(conteudoCsv);

  if (linhasCruas.length === 0) {
    console.error(`Erro: o arquivo CSV em "${caminhoCsv}" está vazio.`);
    process.exit(1);
  }

  const registrosValidados = [];
  const distribuicao = {};

  const vistos = new Set();
  for (const row of linhasCruas) {
    const item = validarELimparLinha(row);
    if (vistos.has(item.questionId)) {
      console.error(`Erro: a questão ${item.questionId} aparece mais de uma vez no CSV (linha ${row._linhaCsv}).`);
      process.exit(1);
    }
    vistos.add(item.questionId);
    registrosValidados.push(item);
    distribuicao[`${item.method}:${item.inepBand}`] = (distribuicao[`${item.method}:${item.inepBand}`] || 0) + 1;
  }

  const sqlGerado = construirSql(registrosValidados, caminhoCsv);
  fs.mkdirSync(path.dirname(caminhoSaida), { recursive: true });
  fs.writeFileSync(caminhoSaida, sqlGerado, "utf8");

  const total = registrosValidados.length;
  console.log(`Sucesso: ${total} linhas geradas a partir do CSV.`);
  console.log("Distribuição por origem e faixa do Inep:");
  for (const [k, v] of Object.entries(distribuicao).sort()) console.log(`- ${k}: ${v} (${((v / total) * 100).toFixed(1)}%)`);
  console.log(`Arquivo SQL gravado em: ${caminhoSaida}`);
}

// Execução direta via CLI
const args = process.argv.slice(2);
let csvArg = CSV_PADRAO;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--csv" && args[i + 1]) {
    csvArg = args[i + 1];
    i++;
  } else if (!args[i].startsWith("-")) {
    csvArg = args[i];
  }
}

// Se executado diretamente pelo Node, roda o fluxo principal
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  executar(csvArg, SAIDA_SQL_PADRAO);
}
