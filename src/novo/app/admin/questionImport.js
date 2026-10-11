// Leitura de arquivos de questões (planilha CSV ou JSON) para a importação do painel de
// administração. Converte para o formato que app_admin_import_questions recebe e aponta,
// linha a linha, o que está errado. O banco valida de novo antes de gravar.
import { citesFigure } from "../../../shared/questions/figure";

const LETTERS = ["A", "B", "C", "D"];

const fold = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// ---------------------------------------------------------------- CSV
/** CSV com separador ";" "," ou tab (detectado na 1ª linha), aspas e quebras de linha dentro de aspas. */
export function parseCsv(text) {
  const source = String(text ?? "").replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length]);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Nomes de coluna aceitos (sem acento, minúsculas) → campo.
const COLUMNS = {
  prova: "prova",
  exame: "prova",
  numero: "numero",
  n: "numero",
  questao: "numero",
  area: "area",
  "grande area": "area",
  tema: "tema",
  subtema: "subtema",
  enunciado: "enunciado",
  "caso clinico": "enunciado",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  "alternativa a": "A",
  "alternativa b": "B",
  "alternativa c": "C",
  "alternativa d": "D",
  gabarito: "gabarito",
  resposta: "gabarito",
  explicacao: "explicacao",
  comentario: "explicacao",
  "explicacao a": "explicacao_A",
  "explicacao b": "explicacao_B",
  "explicacao c": "explicacao_C",
  "explicacao d": "explicacao_D",
  "conduta esperada": "conduta",
  conduta: "conduta",
  "o que avalia": "avalia",
  situacao: "situacao",
  status: "situacao",
  fonte: "fonte",
  "precisa de imagem": "imagem",
  imagem: "imagem",
};

const columnOf = (header) => COLUMNS[fold(header).replace(/[_-]+/g, " ").replace(/\s+/g, " ")] ?? null;

// ---------------------------------------------------------------- valores
const AREA_ALIASES = [
  ["CLINICA_MEDICA", ["clinica medica", "clinica", "cm", "clinica_medica"]],
  ["CIRURGIA_GERAL", ["cirurgia", "cirurgia geral", "cir", "cirurgia_geral"]],
  ["PEDIATRIA", ["pediatria", "ped"]],
  ["GINECOLOGIA_OBSTETRICIA", ["ginecologia e obstetricia", "gineco & obstetricia", "gineco e obstetricia", "go", "ginecologia", "obstetricia", "ginecologia_obstetricia"]],
  ["MEDICINA_FAMILIA_COMUNIDADE", ["medicina de familia e comunidade", "preventiva", "preventiva / mfc", "mfc", "saude coletiva", "medicina preventiva", "medicina_familia_comunidade"]],
];

export function parseArea(value) {
  const v = fold(value);
  if (!v) return null;
  return AREA_ALIASES.find(([, aliases]) => aliases.includes(v))?.[0] ?? null;
}

/** "Revalida 2026/2", "REVALIDA 2026.2", "revalida-2026-2", "ENAMED 2025" → { kind, year, semester } */
export function parseExam(value) {
  const match = fold(value).match(/^(revalida|enamed)(?:\s*inep)?[\s_-]*(\d{4})(?:\s*[/._-]\s*([12]))?$/);
  if (!match) return null;
  return { kind: match[1].toUpperCase(), year: Number(match[2]), semester: match[3] ? Number(match[3]) : null };
}

function parseStatus(value) {
  const v = fold(value);
  if (!v || v === "valida" || v === "valid") return "valid";
  if (v.startsWith("anulad") || v === "annulled") return "annulled";
  if (v.startsWith("alterad") || v === "changed_after_appeal") return "changed_after_appeal";
  return null;
}

function parseYesNo(value) {
  const v = fold(value);
  if (["sim", "s", "true", "1", "x"].includes(v)) return true;
  if (["nao", "n", "false", "0"].includes(v)) return false;
  return null;
}

// ---------------------------------------------------------------- linha de exemplo do modelo (Q08)
// Os textos de exemplo da linha do modelo. Uma questão que ainda tenha um deles, inteiro, em algum campo é a linha de exemplo
// (ou parte dela) e não pode virar questão (Q08). O banco confere a mesma lista (admin_example_texts, …9501).
export const EXAMPLE_TEXTS = [
  "Tema principal da questão",
  "Subtema (opcional)",
  "Texto completo do enunciado, como está no caderno de prova.",
  "Texto da alternativa A",
  "Texto da alternativa B",
  "Texto da alternativa C",
  "Texto da alternativa D",
  "Por que a alternativa correta está certa (opcional)",
  "Conduta esperada (opcional)",
  "Gabarito oficial definitivo (opcional)",
];
// o texto sem acento, minúsculo e com espaços repetidos tratados como um só (a mesma regra do banco)
const squashFold = (value) => fold(String(value ?? "").replace(/\s+/g, " "));
const EXAMPLE_FOLDED = new Set(EXAMPLE_TEXTS.map(squashFold));
const EXAMPLE_PROBLEM =
  "Esta é a linha de exemplo do modelo de planilha: apague a linha ou troque o texto de exemplo pelos dados reais da questão.";
const isExampleText = (value) => EXAMPLE_FOLDED.has(squashFold(value));

// ---------------------------------------------------------------- conversão
/** Linha (objeto campo → texto) → questão no formato do banco + problemas encontrados. */
function toQuestion(cells) {
  const problems = [];
  const exam = parseExam(cells.prova);
  if (!exam) problems.push(`Prova não reconhecida: "${cells.prova ?? ""}". Use, por exemplo, Revalida 2026/2 ou ENAMED 2025.`);
  const number = Number(String(cells.numero ?? "").trim());
  if (!Number.isInteger(number) || number < 1) problems.push("Número da questão inválido.");
  const area = parseArea(cells.area);
  if (!area) problems.push(`Grande área não reconhecida: "${cells.area ?? ""}".`);
  const topic = String(cells.tema ?? "").trim();
  if (!topic) problems.push("Informe o tema.");
  const statement = String(cells.enunciado ?? "").trim();
  if (statement.length < 20) problems.push("Enunciado vazio ou curto demais.");
  const missing = LETTERS.filter((l) => !String(cells[l] ?? "").trim());
  if (missing.length) problems.push(`Alternativa sem texto: ${missing.join(", ")}.`);

  let status = parseStatus(cells.situacao);
  if (!status) problems.push(`Situação não reconhecida: "${cells.situacao}". Use válida, anulada ou alterada.`);
  const answer = fold(cells.gabarito).toUpperCase();
  let correct = null;
  if (answer.startsWith("ANULAD")) status = "annulled";
  else if (LETTERS.includes(answer)) correct = answer;
  else if (status !== "annulled") problems.push(`Gabarito inválido: "${cells.gabarito ?? ""}". Use A, B, C, D ou ANULADA.`);

  const explanation = String(cells.explicacao ?? "").trim();
  const options = LETTERS.map((id) => ({
    id,
    text: String(cells[id] ?? "").trim(),
    explanation: String(cells[`explicacao_${id}`] ?? (id === correct ? explanation : "")).trim(),
  }));
  // a explicação geral vai para a alternativa do gabarito; em questão anulada não há alternativa correta e ela não é gravada
  const notes = [];
  if (status === "annulled" && explanation) notes.push("A explicação geral não é gravada em questão anulada (nenhuma alternativa é a correta).");
  const declaredImage = parseYesNo(cells.imagem);
  const source = String(cells.fonte ?? "").trim();
  const filled = [cells.tema, cells.subtema, cells.enunciado, ...LETTERS.map((l) => cells[l]), cells.explicacao, ...LETTERS.map((l) => cells[`explicacao_${l}`]), cells.conduta, cells.avalia, cells.fonte];
  if (filled.some(isExampleText)) problems.push(EXAMPLE_PROBLEM);
  const question = {
    kind: exam?.kind ?? null,
    year: exam?.year ?? null,
    semester: exam?.semester ?? null,
    number,
    area,
    topic,
    subtopic: String(cells.subtema ?? "").trim() || null,
    statement,
    options,
    correct_option: correct,
    status: status ?? "valid",
    expected_conduct: String(cells.conduta ?? "").trim() || null,
    inep_intent: String(cells.avalia ?? "").trim() || null,
    needs_image: declaredImage ?? citesFigure(statement),
    // a coluna imagem veio preenchida? Sem ela, needs_image é palpite tirado do enunciado: vale para questão nova, mas
    // "atualizar as que já existem" não troca a marca gravada (a equipe pode tê-la posto ou tirado à mão)
    needs_image_declared: declaredImage !== null,
    sources: source ? [{ title: source }] : [],
  };
  return { question, problems, notes };
}

/** Linhas do CSV → questões. A 1ª linha é o cabeçalho. */
export function questionsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], fileError: "A planilha precisa do cabeçalho e de pelo menos uma questão." };
  const header = rows[0].map(columnOf);
  const required = ["prova", "numero", "area", "tema", "enunciado", "A", "B", "C", "D", "gabarito"];
  const absent = required.filter((c) => !header.includes(c));
  if (absent.length) return { items: [], fileError: `Faltam colunas: ${absent.join(", ")}. Baixe o modelo para ver o formato.` };
  const items = rows.slice(1).map((row, index) => {
    const cells = {};
    header.forEach((field, k) => {
      if (field) cells[field] = row[k];
    });
    return { line: index + 2, ...toQuestion(cells) };
  });
  return { items, fileError: null };
}

/** JSON: lista de questões (ou { questions: [...] }) com os mesmos nomes de coluna do CSV. */
export function questionsFromJson(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? "").replace(/^﻿/, ""));
  } catch {
    return { items: [], fileError: "O arquivo JSON está mal formado." };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!list?.length) return { items: [], fileError: "O JSON deve ser uma lista de questões." };
  const items = list.map((raw, index) => {
    const cells = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      const field = columnOf(key);
      if (field) cells[field] = typeof value === "string" || typeof value === "number" ? String(value) : value;
    }
    // alternativas também podem vir como lista: [{ id/letra, texto/text, explicacao/explanation }] ou ["texto A", …]
    const alternatives = raw?.alternativas ?? raw?.options;
    if (Array.isArray(alternatives)) {
      alternatives.forEach((alt, k) => {
        const id = String(alt?.id ?? alt?.letra ?? LETTERS[k]).toUpperCase();
        if (!LETTERS.includes(id)) return;
        cells[id] = typeof alt === "string" ? alt : (alt?.texto ?? alt?.text ?? "");
        const why = typeof alt === "string" ? "" : (alt?.explicacao ?? alt?.explanation ?? "");
        if (why) cells[`explicacao_${id}`] = why;
      });
    }
    return { line: index + 1, ...toQuestion(cells) };
  });
  return { items, fileError: null };
}

export function questionsFromFile(name, text) {
  return /\.json$/i.test(name) ? questionsFromJson(text) : questionsFromCsv(text);
}

/** Questões repetidas (mesma prova e número) dentro do próprio arquivo. */
export function markDuplicates(items) {
  const seen = new Map();
  for (const item of items) {
    const q = item.question;
    const key = `${q.kind}-${q.year}-${q.semester ?? ""}-${q.number}`;
    if (seen.has(key)) item.problems.push(`Repetida no arquivo (mesma prova e número da linha ${seen.get(key)}).`);
    else seen.set(key, item.line);
  }
  return items;
}

// ---------------------------------------------------------------- modelos
const TEMPLATE_HEADER = ["prova", "numero", "area", "tema", "subtema", "enunciado", "A", "B", "C", "D", "gabarito", "explicacao", "conduta esperada", "situacao", "fonte"];
const [EX_TOPIC, EX_SUBTOPIC, EX_STATEMENT, EX_A, EX_B, EX_C, EX_D, EX_EXPLANATION, EX_CONDUCT, EX_SOURCE] = EXAMPLE_TEXTS;
const TEMPLATE_ROW = [
  "Revalida 2026/2",
  "1",
  "Clínica Médica",
  EX_TOPIC,
  EX_SUBTOPIC,
  EX_STATEMENT,
  EX_A,
  EX_B,
  EX_C,
  EX_D,
  "B",
  EX_EXPLANATION,
  EX_CONDUCT,
  "válida",
  EX_SOURCE,
];

const csvCell = (value) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function csvTemplate() {
  return "﻿" + [TEMPLATE_HEADER, TEMPLATE_ROW].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function jsonTemplate() {
  const example = Object.fromEntries(TEMPLATE_HEADER.map((key, k) => [key, TEMPLATE_ROW[k]]));
  return JSON.stringify([example], null, 2) + "\n";
}
