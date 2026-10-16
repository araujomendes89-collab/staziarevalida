/**
 * Treino em Dupla: converte as 10 estações do INEP 2020 do pacote de design
 * (ui_kits/treino-dupla/stations-inep2020.js) para o formato publicado do Banco de estações (Station[]).
 *
 * SÓ PARA TESTE: os ids são `teste-inep2020-eNN` e a carga do Supabase recusa esse prefixo
 * (scripts/supabase/seed-builder.ts, assertNoTestStations). O resultado vai para
 * server/dupla/data/teste-inep2020.json, usado só pelos testes e pelo banco local de desenvolvimento.
 *
 * Segurança: o arquivo do pacote é lido como TEXTO e percorrido com a árvore sintática do TypeScript.
 * Nada dele é executado (sem eval, sem import, sem vm). Só são avaliados literais, as chamadas C(...)/R(...)
 * do próprio arquivo e constantes de texto dele (origin: ORIGIN). Qualquer outra forma é um erro com a posição.
 *
 * Aceita o pacote de 11/10 (o atual) e o de 08/10. O que o pacote de 11/10 acrescenta:
 *   - `candidateImage` (folha única do candidato) na estação: a imagem NÃO é lida nem copiada; vale como marca de que o
 *     impresso da posição 1 (o relato do caso) é visível desde o início -> `initially_visible: true`, gravado no dado;
 *   - `displayIndex` no impresso: número que a pessoa vê na tela -> `display_number` (a posição na prova -> `source_number`);
 *   - `img` no impresso: ignorada (imagem do pacote);
 *   - a constante ACTOR_SCRIPT_1 (roteiro do ator da estação 1, 10 blocos) -> `actor_script`, uma linha "RÓTULO: texto" por bloco.
 *   Os campos novos só são gravados nas estações que usam alguma dessas marcas (hoje, só a estação 1); as demais ficam como estavam.
 *
 * Nada é inventado nem corrigido: o que o pacote não traz fica vazio.
 *   TODO(dono): roteiro do ator das outras 9 estações (vem do PEP, pela Montagem, com revisão médica) -> actor_script "".
 *   TODO(dono): imagens dos impressos e da folha do candidato vêm da Montagem; nenhuma imagem do pacote é copiada -> image_url null.
 *   Os critérios do PEP foram lidos por OCR pelo autor do pacote; conferir contra o PEP oficial antes de publicar.
 *
 * Uso: npx tsx scripts/dupla/converter-inep2020.ts "<pacote>/ui_kits/treino-dupla/stations-inep2020.js" server/dupla/data/teste-inep2020.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";
import { loadStations } from "../../src/shared/checklistBank/catalog";
import type { Station } from "../../src/shared/checklistBank/types";

/** Código do pacote -> rótulo da área do Banco de estações (…0400_checklist_bank.sql:14). */
export const AREA_BY_CODE: Record<string, Station["area"]> = {
  CM: "Clínica Médica",
  CR: "Cirurgia Geral",
  GO: "Ginecologia e Obstetrícia",
  PED: "Pediatria",
  MFC: "Medicina de Família e Comunidade",
};

/** Propriedades do pacote que o formato publicado não usa: não são avaliadas. */
const SKIPPED_STATION_PROPS = new Set(["origin", "difficulty", "short"]);
/** Variáveis do pacote que só servem à vitrine (páginas, PEP escaneado, seções, numeração): ignoradas. */
const IGNORED_CONSTS = new Set(["PAGES", "PEP", "SECTIONS", "NUMS"]);
const CREATED_AT = "2026-10-01T00:00:00.000Z"; // o mesmo carimbo fixo do catálogo (normalizeStation)

interface Criterion {
  title: string;
  max: number;
  part: number | null;
  extra: Record<string, unknown>;
}

class ConvertError extends Error {}

export function convertInep2020(sourceText: string, fileName = "stations-inep2020.js"): Station[] {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const fail = (node: ts.Node, message: string): never => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    throw new ConvertError(`${fileName}:${line + 1}:${character + 1}: ${message}`);
  };

  const constants = new Map<string, unknown>();
  let actorScript1: [string, string][] | null = null;

  const evaluate = (node: ts.Node): unknown => {
    if (ts.isParenthesizedExpression(node)) return evaluate(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
      return -Number(node.operand.text);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map((e) => (ts.isSpreadElement(e) ? fail(e, "espalhamento (...) não é aceito") : evaluate(e)));
    }
    if (ts.isObjectLiteralExpression(node)) {
      const out: Record<string, unknown> = {};
      for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p)) fail(p, "só propriedades simples (nome: valor) são aceitas");
        const prop = p as ts.PropertyAssignment;
        if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) fail(prop.name, "nome de propriedade não aceito");
        out[(prop.name as ts.Identifier | ts.StringLiteral).text] = evaluate(prop.initializer);
      }
      return out;
    }
    if (ts.isIdentifier(node)) {
      if (node.text === "undefined") return undefined;
      if (constants.has(node.text)) return constants.get(node.text);
      return fail(node, `nome desconhecido "${node.text}"`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const args = node.arguments;
      if (node.expression.text === "C") {
        // C(title, max, part, extra) — ver stations-inep2020.js:4
        if (args.length < 2 || args.length > 4) fail(node, "C(...) espera de 2 a 4 argumentos");
        const [title, max, part, extra] = args.map(evaluate) as [unknown, unknown, unknown, unknown];
        if (typeof title !== "string" || typeof max !== "number") fail(node, "C(...) precisa de título (texto) e pontos (número)");
        if (part !== undefined && part !== null && typeof part !== "number") fail(node, "C(...): a nota parcial precisa ser número ou null");
        if (extra !== undefined && (typeof extra !== "object" || extra === null || Array.isArray(extra))) fail(node, "C(...): o quarto argumento precisa ser um objeto");
        const result: Criterion = { title: title as string, max: max as number, part: (part as number | null | undefined) ?? null, extra: (extra as Record<string, unknown>) ?? {} };
        return result;
      }
      if (node.expression.text === "R") {
        // R(...pares) — ver stations-inep2020.js:5
        return args.map((a) => {
          const pair = evaluate(a);
          if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") {
            fail(a, "R(...) espera pares [nível, texto]");
          }
          return pair as [string, string];
        });
      }
      return fail(node, `chamada não aceita: ${node.expression.text}(...)`);
    }
    return fail(node, `forma não aceita (${ts.SyntaxKind[node.kind]})`);
  };

  // O arquivo é uma função imediata: (function () { ... })();
  const top = sf.statements.filter((s) => !ts.isEmptyStatement(s));
  const iife = top.length === 1 && ts.isExpressionStatement(top[0]) ? top[0].expression : null;
  const call = iife && ts.isCallExpression(iife) ? iife : null;
  const fn = call && ts.isParenthesizedExpression(call.expression) ? call.expression.expression : null;
  if (!call || call.arguments.length !== 0 || !fn || !ts.isFunctionExpression(fn)) {
    return fail(top[0] ?? sf, "esperava o arquivo inteiro como (function () { ... })();");
  }

  const isWindowStations = (n: ts.Node) =>
    ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "window" && n.name.text === "SZ_INEP2020";
  let rawStations: unknown[] | null = null;

  for (const stmt of fn.body.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) fail(decl, "declaração não aceita");
        const name = (decl.name as ts.Identifier).text;
        if (name === "O" || name === "C" || name === "R") {
          if (!ts.isArrowFunction(decl.initializer)) fail(decl, `"${name}" deveria ser uma função de seta do próprio arquivo`);
        } else if (IGNORED_CONSTS.has(name)) {
          // só serve à vitrine do pacote
        } else if (name === "ORIGIN") {
          constants.set(name, evaluate(decl.initializer));
        } else if (name === "ACTOR_SCRIPT_1") {
          // roteiro do ator da estação 1: lista de pares [rótulo, texto]
          const value = evaluate(decl.initializer);
          const valid =
            Array.isArray(value) &&
            value.length > 0 &&
            value.every((pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string" && pair[0].trim() && pair[1].trim());
          if (!valid) fail(decl, "ACTOR_SCRIPT_1 precisa ser uma lista de pares [rótulo, texto], ambos preenchidos");
          actorScript1 = value as [string, string][];
        } else {
          fail(decl, `constante não aceita "${name}"`);
        }
      }
    } else if (ts.isExpressionStatement(stmt)) {
      const e = stmt.expression;
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && isWindowStations(e.left)) {
        if (rawStations) fail(stmt, "window.SZ_INEP2020 atribuído duas vezes");
        const list = e.right;
        if (!ts.isArrayLiteralExpression(list)) return fail(list, "window.SZ_INEP2020 precisa ser uma lista");
        rawStations = list.elements.map((el) => {
          if (!ts.isObjectLiteralExpression(el)) return fail(el, "cada estação precisa ser um objeto");
          const station: Record<string, unknown> = {};
          for (const p of (el as ts.ObjectLiteralExpression).properties) {
            if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) fail(p, "só propriedades simples são aceitas");
            const prop = p as ts.PropertyAssignment;
            const key = (prop.name as ts.Identifier | ts.StringLiteral).text;
            if (SKIPPED_STATION_PROPS.has(key)) continue;
            station[key] = evaluate(prop.initializer);
          }
          return station;
        });
      } else if (
        ts.isCallExpression(e) &&
        ts.isPropertyAccessExpression(e.expression) &&
        e.expression.name.text === "forEach" &&
        isWindowStations(e.expression.expression)
      ) {
        // acrescenta imagens das páginas, PEP escaneado, numeração e seções da vitrine: não entram no formato publicado
      } else {
        fail(stmt, "instrução não aceita");
      }
    } else {
      fail(stmt, "instrução não aceita");
    }
  }
  if (!rawStations) return fail(fn, "window.SZ_INEP2020 não encontrado");

  const stations = (rawStations as Record<string, any>[]).map((s) => toStation(s, fail, sf));
  if (actorScript1) {
    const first = stations.find((st) => st.id === "teste-inep2020-e01");
    if (!first) return fail(sf, "ACTOR_SCRIPT_1 existe, mas a estação 1 não");
    first.actor_script = (actorScript1 as [string, string][]).map(([label, text]) => `${label.trim()}: ${text.trim()}`).join("\n");
  }
  loadStations(stations); // só valida (soma 10,00 por estação etc.): lança com o motivo e nada é corrigido
  return stations;
}

const KNOWN_STATION_KEYS = new Set(["id", "n", "name", "area", "code", "duration", "tags", "scenario", "tasks", "prints", "criteria", "candidateImage"]);
const KNOWN_PRINT_KEYS = new Set(["title", "body", "displayIndex", "img"]);
const KNOWN_EXTRA_KEYS = new Set(["hint", "items", "rubric"]);
const LEVEL: Record<string, "incorrect" | "partial" | "correct"> = {
  Inadequado: "incorrect",
  "Parcialmente adequado": "partial",
  Adequado: "correct",
};

function toStation(raw: Record<string, any>, fail: (node: ts.Node, message: string) => never, sf: ts.SourceFile): Station {
  const problem = (message: string): never => fail(sf, `${raw.id ?? "(sem id)"}: ${message}`);
  for (const key of Object.keys(raw)) if (!KNOWN_STATION_KEYS.has(key)) problem(`propriedade desconhecida "${key}"`);
  if (!Number.isInteger(raw.n) || raw.n < 1 || raw.n > 99) problem("número da estação inválido");
  const nn = String(raw.n).padStart(2, "0");
  if (raw.id !== `inep20-${nn}`) problem(`id esperado inep20-${nn}`);
  const area = AREA_BY_CODE[String(raw.code)];
  if (!area) problem(`código de área desconhecido "${raw.code}"`);
  if (raw.area !== area) problem(`a área "${raw.area}" não bate com o código ${raw.code}`);
  for (const f of ["name", "scenario"]) if (typeof raw[f] !== "string" || !raw[f]) problem(`falta o texto "${f}"`);
  if (!Number.isInteger(raw.duration) || raw.duration <= 0) problem("duração inválida");
  for (const f of ["tags", "tasks", "prints", "criteria"]) if (!Array.isArray(raw[f])) problem(`"${f}" precisa ser uma lista`);

  const id = `teste-inep2020-e${nn}`;

  // Tarefas: "1. …\n2. …". A "Observação: …" do caderno não é uma tarefa: entra sem número, em linha própria.
  let taskNumber = 0;
  const doctor_tasks = (raw.tasks as unknown[])
    .map((t) => {
      if (typeof t !== "string") return problem("tarefa precisa ser texto");
      return /^Observação:/.test(t) ? t : `${++taskNumber}. ${t}`;
    })
    .join("\n");

  if (raw.candidateImage !== undefined && (typeof raw.candidateImage !== "string" || !raw.candidateImage)) problem("candidateImage precisa ser texto");
  const hasCandidateSheet = raw.candidateImage !== undefined;
  const usesNewFormat = hasCandidateSheet || (raw.prints as any[]).some((p) => p && p.displayIndex !== undefined);
  const pressings = (raw.prints as any[]).map((p, i) => {
    for (const key of Object.keys(p)) if (!KNOWN_PRINT_KEYS.has(key)) problem(`impresso ${i + 1}: propriedade desconhecida "${key}"`);
    if (typeof p.title !== "string" || typeof p.body !== "string") problem(`impresso ${i + 1}: título e texto são obrigatórios`);
    if (p.displayIndex !== undefined && (!Number.isInteger(p.displayIndex) || p.displayIndex < 1)) problem(`impresso ${i + 1}: displayIndex precisa ser inteiro a partir de 1`);
    if (p.img !== undefined && typeof p.img !== "string") problem(`impresso ${i + 1}: img precisa ser texto`);
    // TODO(dono): imagem do impresso e da folha do candidato (`img`, `candidateImage`) vêm da Montagem; nada do pacote é copiado -> image_url null
    const base = { id: `${id}-p${i + 1}`, name: p.title, content: p.body, image_url: null };
    if (!usesNewFormat) return base;
    return {
      ...base,
      source_number: i + 1, // posição na prova
      display_number: (p.displayIndex as number | undefined) ?? i + 1, // o que a pessoa vê na tela
      initially_visible: hasCandidateSheet && i === 0, // regra explícita gravada no dado: a folha única traz o relato (impresso 1)
    };
  });

  const checklist_items = (raw.criteria as Criterion[]).map((c, i) => {
    const k = i + 1;
    const where = `item ${k}`;
    for (const key of Object.keys(c.extra)) if (!KNOWN_EXTRA_KEYS.has(key)) problem(`${where}: propriedade desconhecida "${key}"`);
    const criteria: { correct: string; partial?: string; incorrect: string } = { correct: "", incorrect: "" };
    if (c.extra.rubric !== undefined) {
      if (!Array.isArray(c.extra.rubric)) problem(`${where}: rubric precisa ser R(...)`);
      const seen = new Set<string>();
      for (const [label, text] of c.extra.rubric as [string, string][]) {
        const level = LEVEL[label];
        if (!level) problem(`${where}: nível desconhecido "${label}"`);
        if (seen.has(level)) problem(`${where}: nível repetido "${label}"`);
        seen.add(level);
        if (level === "partial" && c.part === null) problem(`${where}: critério parcial sem nota parcial`);
        criteria[level] = text;
      }
    }
    const items = c.extra.items;
    if (items !== undefined && (!Array.isArray(items) || items.some((t) => typeof t !== "string"))) problem(`${where}: items precisa ser lista de textos`);
    if (c.extra.hint !== undefined && typeof c.extra.hint !== "string") problem(`${where}: hint precisa ser texto`);
    return {
      id: `${id}-i${k}`,
      order: k,
      phase: "PEP",
      content: c.title,
      tip: (c.extra.hint as string | undefined) ?? "",
      grades: { correct: c.max, partial: c.part, incorrect: 0 },
      criteria: {
        correct: criteria.correct,
        ...(criteria.partial ? { partial: criteria.partial } : {}),
        incorrect: criteria.incorrect,
      },
      subitems: ((items as string[] | undefined) ?? []).map((text, j) => ({ id: `${id}-i${k}-s${j + 1}`, text })),
      auto_grade_rule: null,
    };
  });

  return {
    id,
    name: raw.name,
    topic: raw.name,
    area,
    setting: null,
    taxonomy_path: [area, raw.name],
    goal: "Revalida",
    institution: "INEP",
    year: "2020",
    styles: raw.tags,
    is_pro_only: false,
    medical_review: "approved",
    max_score: 10,
    duration_ms: raw.duration * 1000,
    created_at: CREATED_AT,
    actor_script: "", // a estação 1 recebe o roteiro de ACTOR_SCRIPT_1 depois; TODO(dono): roteiro das outras vem da Montagem (PEP)
    doctor_scene: raw.scenario,
    doctor_tasks,
    pressings,
    checklist_items,
    summary: [],
    // fora do tipo Station, mas gravado no conteúdo (RoomContent.station.version, plano da Tarefa 4)
    version: "teste",
  } as Station;
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Uso: npx tsx scripts/dupla/converter-inep2020.ts "<pacote>/ui_kits/treino-dupla/stations-inep2020.js" server/dupla/data/teste-inep2020.json');
    process.exit(2);
  }
  try {
    const stations = convertInep2020(fs.readFileSync(input, "utf8"), path.basename(input));
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(stations, null, 2)}\n`);
    const items = stations.reduce((n, s) => n + s.checklist_items.length, 0);
    console.log(`[converter-inep2020] ${stations.length} estações, ${items} itens -> ${output}`);
  } catch (e) {
    console.error(`[converter-inep2020] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
