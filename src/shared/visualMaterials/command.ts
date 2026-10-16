/**
 * Comando do administrador para gerar material visual. O mesmo texto serve ao campo "Colar comando"
 * do formulário e ao comando de terminal (scripts/content-hub/material-visual.ts); os dois chegam à
 * mesma validação (validateVisualInput) e à mesma rotina de geração.
 *
 * Formato (um campo por linha; o texto pode continuar nas linhas seguintes):
 *
 *   modelo: flashcard_a6
 *   especialidade: cirurgia
 *   tema: …
 *   pergunta: …
 *   resposta: …
 *   pontos_chave:
 *   - primeiro ponto
 *   - segundo ponto
 *   tabela:
 *   | Coluna A | Coluna B | Coluna C |
 *   | Linha 1 | valor | valor |
 *   | !alerta Linha 2 | valor | valor |
 *   ilustracao.icone: coracao
 *   ilustracao.legenda: …
 *
 * Também aceita JSON com os mesmos nomes de campo. Nomes com acento ou espaço valem
 * ("Título", "Tome nota", "Como lembrar", "ID do card").
 */

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");

/** Nome escrito pela pessoa → campo do formulário. */
const KEY_ALIASES: Record<string, string> = {
  modelo: "modelo",
  model: "modelo",
  especialidade: "especialidade",
  especialidade_nome: "especialidade_nome",
  nome_da_especialidade: "especialidade_nome",
  titulo: "titulo",
  tema_titulo: "titulo",
  titulo_do_tema: "titulo",
  subtitulo: "subtitulo",
  resumo: "resumo",
  resumo_em_uma_linha: "resumo",
  resumo_paragrafo: "resumo_paragrafo",
  paragrafo: "resumo_paragrafo",
  contexto: "resumo_paragrafo",
  dado_chave: "dado_chave",
  pontos_chave: "pontos_chave",
  pontos: "pontos_chave",
  tabela: "tabela",
  tabela_titulo: "tabela_titulo",
  titulo_da_tabela: "tabela_titulo",
  ilustracao: "ilustracao.legenda",
  ilustracao_tipo: "ilustracao.tipo",
  "ilustracao.tipo": "ilustracao.tipo",
  ilustracao_icone: "ilustracao.icone",
  "ilustracao.icone": "ilustracao.icone",
  icone: "ilustracao.icone",
  ilustracao_legenda: "ilustracao.legenda",
  "ilustracao.legenda": "ilustracao.legenda",
  legenda: "ilustracao.legenda",
  "ilustracao.imagem": "ilustracao.imagem",
  "ilustracao.alt": "ilustracao.alt",
  pegadinha: "pegadinha",
  pegadinha_de_prova: "pegadinha",
  tome_nota: "tome_nota",
  fonte: "fonte",
  atualizacao: "atualizacao",
  atualizado: "atualizacao",
  selo_prova: "selo_prova",
  selo_da_prova: "selo_prova",
  selo: "selo_prova",
  paginacao: "paginacao",
  numero_da_peca: "paginacao",
  pagina: "paginacao",
  bloco: "bloco.itens",
  bloco_titulo: "bloco.titulo",
  "bloco.titulo": "bloco.titulo",
  bloco_itens: "bloco.itens",
  "bloco.itens": "bloco.itens",
  mnemonico: "mnemonico.itens",
  mnemonico_titulo: "mnemonico.titulo",
  "mnemonico.titulo": "mnemonico.titulo",
  mnemonico_itens: "mnemonico.itens",
  "mnemonico.itens": "mnemonico.itens",
  card_id: "card_id",
  id_do_card: "card_id",
  numero_do_card: "card_id",
  ordem: "ordem",
  ordem_no_lote: "ordem",
  lote: "lote",
  nivel: "nivel",
  tema: "tema",
  pergunta: "pergunta",
  resposta: "resposta",
  resposta_curta: "resposta",
  explicacao: "explicacao",
  justificativa: "explicacao",
  resposta_completa: "explicacao",
  como_lembrar: "como_lembrar",
  referencia: "referencia",
  tema_cor: "tema_cor",
  cor_do_tema: "tema_cor",
  cor_tema: "tema_cor",
};

const LIST_KEYS = new Set(["pontos_chave", "bloco.itens", "mnemonico.itens"]);

export interface ParsedCommand {
  input: Record<string, any>;
  problems: { line: number; message: string }[];
}

export function commandKey(name: string): string | null {
  return KEY_ALIASES[fold(name)] ?? null;
}

/** Coloca um valor no objeto do formulário, aceitando "ilustracao.icone" etc. */
export function setField(input: Record<string, any>, key: string, value: unknown) {
  const [head, sub] = key.split(".");
  if (!sub) input[head] = value;
  else input[head] = { ...(typeof input[head] === "object" && input[head] ? input[head] : {}), [sub]: value };
}

export function parseVisualCommand(text: string): ParsedCommand {
  const src = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (src.startsWith("{")) {
    try {
      const json = JSON.parse(src);
      if (!json || typeof json !== "object" || Array.isArray(json)) return { input: {}, problems: [{ line: 1, message: "O JSON precisa ser um objeto com os campos." }] };
      const input: Record<string, any> = {};
      for (const [k, v] of Object.entries(json)) {
        const key = commandKey(k) ?? (["ilustracao", "bloco", "mnemonico", "tabela"].includes(k) ? k : null);
        if (key) setField(input, key, v);
      }
      return { input, problems: [] };
    } catch (error) {
      return { input: {}, problems: [{ line: 1, message: `JSON inválido: ${(error as Error).message}` }] };
    }
  }
  const input: Record<string, any> = {};
  const problems: ParsedCommand["problems"] = [];
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (!current) return;
    const raw = buffer.join("\n").trim();
    if (LIST_KEYS.has(current)) {
      const items = raw
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
      setField(input, current, items);
    } else if (current === "ordem") setField(input, current, raw === "" ? "" : Number(raw));
    else setField(input, current, raw);
    current = null;
    buffer = [];
  };
  src.split("\n").forEach((line, i) => {
    const m = /^\s*([A-Za-zÀ-ÿ_.][A-Za-zÀ-ÿ0-9_. -]{0,40}?)\s*:\s?(.*)$/.exec(line);
    const key = m && !/^\s*[|!-]/.test(line) ? commandKey(m[1]) : null;
    if (key) {
      flush();
      current = key;
      buffer = m![2] ? [m![2]] : [];
      return;
    }
    if (current) buffer.push(line);
    else if (line.trim()) problems.push({ line: i + 1, message: `Linha ${i + 1} fora de um campo: comece com "campo: valor".` });
  });
  flush();
  return { input, problems };
}

/** Texto de comando a partir do conteúdo (para o administrador copiar, guardar ou repetir no terminal). */
export function visualCommandText(input: Record<string, any>): string {
  const out: string[] = [];
  const put = (k: string, v: unknown) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
    if (Array.isArray(v)) out.push(`${k}:`, ...v.map((x) => `- ${typeof x === "object" && x ? [x.letra, x.texto].filter(Boolean).join(" — ") : x}`));
    else out.push(`${k}: ${String(v)}`);
  };
  put("modelo", input.modelo ?? input.model);
  put("especialidade", input.especialidade ?? input.specialty?.key);
  put("especialidade_nome", input.especialidade_nome ?? (input.specialty?.key === "fallback" ? input.specialty.label : ""));
  for (const k of ["card_id", "ordem", "lote", "nivel", "tema", "titulo", "subtitulo", "selo_prova", "atualizacao", "paginacao", "resumo", "resumo_paragrafo", "dado_chave", "pergunta", "resposta", "explicacao", "como_lembrar"]) {
    if (k === "ordem" && Number(input.ordem ?? 1) === 1) continue;
    put(k, input[k]);
  }
  put("pontos_chave", input.pontos_chave);
  const t = input.tabela;
  if (t && typeof t === "object" && (t.linhas ?? []).length) {
    if (t.titulo) out.push(`tabela_titulo: ${t.titulo}`);
    out.push("tabela:", `| ${(t.colunas ?? []).join(" | ")} |`, ...(t.linhas ?? []).map((r: any) => `| ${r.tipo && r.tipo !== "normal" ? `!${r.tipo} ` : ""}${(r.celulas ?? []).join(" | ")} |`));
  } else if (typeof t === "string" && t.trim()) out.push("tabela:", t.trim());
  const il = input.ilustracao;
  if (il && typeof il === "object" && il.tipo !== "nenhuma") {
    put("ilustracao.tipo", il.tipo);
    if (il.tipo === "icone") put("ilustracao.icone", il.icone);
    if (il.tipo === "imagem") put("ilustracao.imagem", il.imagem);
    put("ilustracao.legenda", il.legenda);
    put("ilustracao.alt", il.alt);
  }
  put("pegadinha", input.pegadinha);
  put("tome_nota", input.tome_nota);
  if (input.bloco && typeof input.bloco === "object") {
    put("bloco.titulo", input.bloco.titulo);
    put("bloco.itens", input.bloco.itens);
  }
  if (input.mnemonico && typeof input.mnemonico === "object") {
    put("mnemonico.titulo", input.mnemonico.titulo);
    put("mnemonico.itens", input.mnemonico.itens);
  }
  put("referencia", input.referencia);
  put("tema_cor", input.tema_cor);
  put("fonte", input.fonte);
  return out.join("\n");
}
