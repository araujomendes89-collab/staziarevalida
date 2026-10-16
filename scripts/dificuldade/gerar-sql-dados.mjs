#!/usr/bin/env node
/**
 * Gera a migração SQL com a carga de dados da classificação de dificuldade por agentes
 * (Gemini + conferência Claude), a partir de arquivo CSV.
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
const CSV_PADRAO = "/Volumes/StaziaMed/.tmp-aulas/dificuldade/classificacao.csv";
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

/**
 * Valida os dados de cada linha do CSV e formata os campos para a tupla SQL.
 */
export function validarELimparLinha(row) {
  const id = row.id ? String(row.id).trim() : null;
  if (!id) {
    throw new Error(`Linha ${row._linhaCsv}: campo "id" da questão é obrigatório.`);
  }

  // Nível final (1 a 5)
  const rawNota = row.nota_final != null ? String(row.nota_final).trim() : "";
  const level = parseInt(rawNota, 10);
  if (!rawNota || isNaN(level) || !Number.isInteger(Number(rawNota)) || level < 1 || level > 5) {
    throw new Error(
      `Linha ${row._linhaCsv} (questão ${id}): nota_final "${row.nota_final}" inválida. Deve ser um número inteiro de 1 a 5.`
    );
  }

  // Faixa (facil, media, dificil)
  const band = row.faixa != null ? String(row.faixa).trim().toLowerCase() : "";
  if (!["facil", "media", "dificil"].includes(band)) {
    throw new Error(
      `Linha ${row._linhaCsv} (questão ${id}): faixa "${row.faixa}" inválida. Deve ser "facil", "media" ou "dificil".`
    );
  }

  // Coerência faixa x nível
  const coerente =
    ((level === 1 || level === 2) && band === "facil") ||
    (level === 3 && band === "media") ||
    ((level === 4 || level === 5) && band === "dificil");
  if (!coerente) {
    throw new Error(
      `Linha ${row._linhaCsv} (questão ${id}): nível ${level} incompatível com faixa "${band}". Esperado: níveis 1 e 2 = facil, nível 3 = media, níveis 4 e 5 = dificil.`
    );
  }

  // Confiança (alta, media, baixa)
  const confidence = row.confianca != null ? String(row.confianca).trim().toLowerCase() : "";
  if (!["alta", "media", "baixa"].includes(confidence)) {
    throw new Error(
      `Linha ${row._linhaCsv} (questão ${id}): confiança "${row.confianca}" inválida. Deve ser "alta", "media" ou "baixa".`
    );
  }

  // Motivo (até 600 caracteres)
  let reason = row.motivo != null ? String(row.motivo).trim() : null;
  if (reason === "" || reason === "NULL") reason = null;
  if (reason && reason.length > 600) {
    throw new Error(
      `Linha ${row._linhaCsv} (questão ${id}): motivo excede o limite de 600 caracteres (${reason.length} caracteres).`
    );
  }

  // gemini_level: coluna gemini_pro se preenchida, senão gemini_flash
  const rawGemini =
    row.gemini_pro != null && String(row.gemini_pro).trim() !== "" && String(row.gemini_pro).trim() !== "NULL"
      ? String(row.gemini_pro).trim()
      : row.gemini_flash != null &&
        String(row.gemini_flash).trim() !== "" &&
        String(row.gemini_flash).trim() !== "NULL"
      ? String(row.gemini_flash).trim()
      : null;

  let geminiLevel = null;
  if (rawGemini != null) {
    geminiLevel = parseInt(rawGemini, 10);
    if (isNaN(geminiLevel) || geminiLevel < 1 || geminiLevel > 5) {
      throw new Error(
        `Linha ${row._linhaCsv} (questão ${id}): nível Gemini "${rawGemini}" inválido. Deve ser entre 1 e 5 ou nulo.`
      );
    }
  }

  // Claude: conferido e ajustado
  const claudeChecked = /^(true|t|1|sim|s)$/i.test(String(row.conferido_claude ?? "").trim());
  const claudeAdjusted = /^(true|t|1|sim|s)$/i.test(String(row.ajustado_claude ?? "").trim());

  // Modelo
  let model = row.modelo != null ? String(row.modelo).trim() : null;
  if (model === "" || model === "NULL") model = null;

  return {
    questionId: id,
    level,
    band,
    reason,
    confidence,
    geminiLevel,
    claudeChecked,
    claudeAdjusted,
    model,
  };
}

/**
 * Constrói o script SQL de inserção/atualização a partir dos registros validados.
 */
export function construirSql(registros, caminhoCsv) {
  const agora = new Date().toISOString();
  const linhasValores = registros.map((r) => {
    const qId = escapeSql(r.questionId);
    const lvl = `${r.level}::smallint`;
    const bnd = escapeSql(r.band);
    const rsn = r.reason != null ? escapeSql(r.reason) : "null";
    const cnf = escapeSql(r.confidence);
    const gmn = r.geminiLevel != null ? `${r.geminiLevel}::smallint` : "null::smallint";
    const chk = `${r.claudeChecked}::boolean`;
    const adj = `${r.claudeAdjusted}::boolean`;
    const mdl = r.model != null ? escapeSql(r.model) : "null";

    return `    (${qId}, ${lvl}, ${bnd}, ${rsn}, ${cnf}, ${gmn}, ${chk}, ${adj}, ${mdl})`;
  });

  return `-- Dificuldade das questões CLASSIFICADA POR AGENTES (carga de dados).
-- NÃO é validação humana e NUNCA aparece como "validada pela equipe".
-- Total de linhas: ${registros.length}
-- Data de geração: ${agora}
-- Origem dos dados: ${caminhoCsv}

insert into public.question_difficulty_agents (question_id, level, band, reason, confidence, gemini_level, claude_checked, claude_adjusted, model)
select v.* from (
  values
${linhasValores.join(",\n")}
) as v(question_id, level, band, reason, confidence, gemini_level, claude_checked, claude_adjusted, model)
join public.questions q on q.id = v.question_id
on conflict (question_id) do update set
  level = excluded.level,
  band = excluded.band,
  reason = excluded.reason,
  confidence = excluded.confidence,
  gemini_level = excluded.gemini_level,
  claude_checked = excluded.claude_checked,
  claude_adjusted = excluded.claude_adjusted,
  model = excluded.model,
  classified_at = now();
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
  const distribuicao = { facil: 0, media: 0, dificil: 0 };

  const vistos = new Set();
  for (const row of linhasCruas) {
    const item = validarELimparLinha(row);
    if (vistos.has(item.questionId)) {
      console.error(`Erro: a questão ${item.questionId} aparece mais de uma vez no CSV (linha ${row._linhaCsv}).`);
      process.exit(1);
    }
    vistos.add(item.questionId);
    registrosValidados.push(item);
    distribuicao[item.band] = (distribuicao[item.band] || 0) + 1;
  }

  const sqlGerado = construirSql(registrosValidados, caminhoCsv);
  fs.mkdirSync(path.dirname(caminhoSaida), { recursive: true });
  fs.writeFileSync(caminhoSaida, sqlGerado, "utf8");

  const total = registrosValidados.length;
  console.log(`Sucesso: ${total} linhas geradas a partir do CSV.`);
  console.log("Distribuição por faixa:");
  console.log(`- fácil: ${distribuicao.facil} (${((distribuicao.facil / total) * 100).toFixed(1)}%)`);
  console.log(`- média: ${distribuicao.media} (${((distribuicao.media / total) * 100).toFixed(1)}%)`);
  console.log(`- difícil: ${distribuicao.dificil} (${((distribuicao.dificil / total) * 100).toFixed(1)}%)`);
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
