/**
 * Materiais visuais educacionais: modelos, campos, especialidade e validação do conteúdo.
 * O mesmo código valida o formulário (navegador), a rota do servidor e o comando do administrador,
 * para que os três produzam o mesmo resultado e passem pelas mesmas regras.
 *
 * Nada aqui escreve conteúdo clínico: o sistema só usa o que o administrador fornece.
 */
import { SPECIALTY_KEYS, VISUAL_TOKENS, type SpecialtyKey, type SpecialtyPalette } from "./tokens";

/** Modelo visual atual. "visual-1.0" (clássico, pranchas de 2026-10-06) continua disponível por BuildOptions.template. */
export const VISUAL_TEMPLATE_VERSION = "criativo-1";
export const VISUAL_TEMPLATE_VERSIONS = ["criativo-1", "visual-1.0"] as const;
export type VisualTemplateVersion = (typeof VISUAL_TEMPLATE_VERSIONS)[number];

export type VisualModel = "feed" | "a4" | "story" | "flashcard_digital" | "flashcard_a6";
export type VisualSide = "single" | "front" | "back";

export interface ModelInfo {
  id: VisualModel;
  label: string;
  short: string;
  size: string;
  /** Prancha em px CSS (A6: 300 dpi; A4: 96 dpi). */
  width: number;
  height: number;
  sides: VisualSide[];
  formats: ("pdf" | "png")[];
  pair: boolean;
}

export const VISUAL_MODELS: Record<VisualModel, ModelInfo> = {
  feed: { id: "feed", label: "Card para feed", short: "Feed", size: "1080 × 1350 px", width: 1080, height: 1350, sides: ["single"], formats: ["png", "pdf"], pair: false },
  a4: { id: "a4", label: "Página A4", short: "A4", size: "210 × 297 mm", width: 794, height: 1123, sides: ["single"], formats: ["pdf", "png"], pair: false },
  story: { id: "story", label: "Story", short: "Story", size: "1080 × 1920 px", width: 1080, height: 1920, sides: ["single"], formats: ["png", "pdf"], pair: false },
  flashcard_digital: {
    id: "flashcard_digital",
    label: "Flashcard digital (frente e verso)",
    short: "Flashcard digital",
    size: "1080 × 1350 px",
    width: 1080,
    height: 1350,
    sides: ["front", "back"],
    formats: ["png", "pdf"],
    pair: true,
  },
  flashcard_a6: {
    id: "flashcard_a6",
    label: "Flashcard A6 para impressão (frente e verso)",
    short: "Flashcard A6",
    size: "105 × 148 mm (1240 × 1748 px)",
    width: 1240,
    height: 1748,
    sides: ["front", "back"],
    // impressão: só o PDF com os dois lados (nunca um lado sozinho)
    formats: ["pdf"],
    pair: true,
  },
};

export const MODEL_IDS = Object.keys(VISUAL_MODELS) as VisualModel[];

/** Story: zona segura sem conteúdo essencial (interface do aplicativo). */
export const STORY_SAFE = { top: 190, bottom: 150 };
/** A6 a 300 dpi: 1 mm = 11,811 px. Margem segura 5 mm; recuo do conteúdo 7 mm; sangria 3 mm (36 px, arredondada para cima). */
export const A6_PRINT = { mm: 1240 / 105, safe: 59, inset: 84, bleed: 36 };

export const ILLUSTRATION_ICONS = {
  coracao: "Coração com traçado",
  verificacao: "Verificação",
  cruz: "Cruz médica",
  comprimido: "Comprimido",
  cronometro: "Cronômetro",
  prancheta: "Prancheta",
  pulmao: "Pulmões (cena com bacilos)",
  bebe: "Bebê (pediatria)",
} as const;
export type IllustrationIcon = keyof typeof ILLUSTRATION_ICONS;

export type TableRowKind = "normal" | "destaque" | "alerta";

export interface VisualTable {
  titulo: string;
  colunas: string[];
  linhas: { celulas: string[]; tipo: TableRowKind }[];
}

export interface VisualIllustration {
  tipo: "icone" | "imagem" | "nenhuma";
  icone: IllustrationIcon;
  /** Imagem enviada pela equipe: nome no depósito (sha256 + extensão). */
  imagem: string;
  legenda: string;
  alt: string;
}

/** Conteúdo validado e normalizado (é o que fica gravado em cada versão). */
export interface VisualContent {
  model: VisualModel;
  specialty: { key: SpecialtyKey; label: string };
  card_id: string;
  ordem: number;
  lote: string;
  titulo: string;
  subtitulo: string;
  resumo: string;
  resumo_paragrafo: string;
  dado_chave: string;
  pontos_chave: string[];
  tabela: VisualTable | null;
  ilustracao: VisualIllustration;
  pegadinha: string;
  tome_nota: string;
  fonte: string;
  atualizacao: string;
  selo_prova: string;
  paginacao: string;
  bloco: { titulo: string; itens: string[] } | null;
  mnemonico: { titulo: string; itens: { letra: string; texto: string }[] } | null;
  nivel: string;
  tema: string;
  pergunta: string;
  resposta: string;
  explicacao: string;
  como_lembrar: string;
  referencia: string;
}

export type FieldKey =
  | "titulo"
  | "subtitulo"
  | "resumo"
  | "resumo_paragrafo"
  | "dado_chave"
  | "pontos_chave"
  | "tabela"
  | "ilustracao"
  | "pegadinha"
  | "tome_nota"
  | "fonte"
  | "atualizacao"
  | "selo_prova"
  | "paginacao"
  | "bloco"
  | "mnemonico"
  | "card_id"
  | "ordem"
  | "lote"
  | "nivel"
  | "tema"
  | "pergunta"
  | "resposta"
  | "explicacao"
  | "como_lembrar"
  | "referencia";

export const FIELD_LABELS: Record<FieldKey, string> = {
  titulo: "Título do tema",
  subtitulo: "Subtítulo",
  resumo: "Resumo em uma linha",
  resumo_paragrafo: "Resumo em parágrafo",
  dado_chave: "Dado-chave",
  pontos_chave: "Pontos-chave",
  tabela: "Tabela",
  ilustracao: "Ilustração",
  pegadinha: "Pegadinha de prova",
  tome_nota: "Tome nota",
  fonte: "Fonte",
  atualizacao: "Atualização",
  selo_prova: "Selo da prova",
  paginacao: "Número da peça",
  bloco: "Bloco de lista",
  mnemonico: "Mnemônico ou resumo final",
  card_id: "ID do card",
  ordem: "Ordem no lote",
  lote: "Lote",
  nivel: "Nível",
  tema: "Tema",
  pergunta: "Pergunta",
  resposta: "Resposta",
  explicacao: "Explicação",
  como_lembrar: "Como lembrar",
  referencia: "Referência",
};

const COMMON_PIECE: FieldKey[] = ["titulo", "subtitulo", "resumo", "selo_prova", "atualizacao", "paginacao", "pontos_chave", "ilustracao", "dado_chave", "tabela", "pegadinha", "tome_nota", "fonte"];

/** Campos que cada modelo mostra (o resto fica guardado, mas não aparece na peça). */
export const MODEL_FIELDS: Record<VisualModel, FieldKey[]> = {
  feed: COMMON_PIECE,
  story: COMMON_PIECE,
  a4: [...COMMON_PIECE, "resumo_paragrafo", "bloco", "mnemonico"],
  // ilustracao nos flashcards: só escolhe a cena do cabeçalho do modelo criativo (opcional)
  flashcard_digital: ["card_id", "ordem", "lote", "nivel", "tema", "pergunta", "resposta", "explicacao", "pegadinha", "fonte", "atualizacao", "ilustracao"],
  flashcard_a6: ["card_id", "ordem", "lote", "nivel", "tema", "pergunta", "resposta", "como_lembrar", "pegadinha", "referencia", "fonte", "atualizacao", "ilustracao"],
};

export const REQUIRED_FIELDS: Record<VisualModel, FieldKey[]> = {
  feed: ["titulo"],
  a4: ["titulo"],
  story: ["titulo"],
  flashcard_digital: ["pergunta", "resposta"],
  flashcard_a6: ["pergunta", "resposta"],
};

/** Limites de tamanho (caracteres). O encaixe na peça (linhas, corte) é conferido na prévia e na geração. */
export const TEXT_LIMITS: Record<string, number> = {
  titulo: 90,
  subtitulo: 80,
  resumo: 110,
  resumo_paragrafo: 420,
  dado_chave: 40,
  ponto: 170,
  pegadinha: 230,
  tome_nota: 170,
  fonte: 130,
  atualizacao: 30,
  selo_prova: 32,
  paginacao: 12,
  bloco_titulo: 60,
  bloco_item: 110,
  mnemonico_titulo: 60,
  mnemonico_letra: 4,
  mnemonico_texto: 40,
  tabela_titulo: 60,
  tabela_coluna: 40,
  tabela_celula: 70,
  card_id: 24,
  lote: 80,
  nivel: 24,
  tema: 60,
  pergunta: 220,
  resposta: 100,
  explicacao: 640,
  como_lembrar: 420,
  referencia: 220,
  legenda: 70,
  alt: 160,
  especialidade: 60,
};

/** Quantidade de itens por modelo (sistema visual: 3 pontos e 2 linhas; 4 no A4). */
export const COUNT_LIMITS: Record<VisualModel, { pontos: number; linhas: number }> = {
  feed: { pontos: 3, linhas: 2 },
  story: { pontos: 3, linhas: 3 },
  a4: { pontos: 4, linhas: 4 },
  flashcard_digital: { pontos: 0, linhas: 0 },
  flashcard_a6: { pontos: 0, linhas: 0 },
};

// ---------------------------------------------------------------------------- especialidade
const fold = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Nomes aceitos para cada chave (comparação sem acento e sem maiúsculas). */
const SPECIALTY_ALIASES: Record<Exclude<SpecialtyKey, "fallback">, string[]> = {
  ginecologia: ["ginecologia", "ginecologia e obstetricia", "go", "ginecologia obstetricia", "obstetricia"],
  pediatria: ["pediatria", "ped"],
  clinica_medica: ["clinica medica", "clinica_medica", "cm"],
  cirurgia: ["cirurgia", "cirurgia geral", "cir"],
  preventiva_mfc: ["preventiva mfc", "preventiva", "mfc", "medicina de familia e comunidade", "medicina preventiva", "saude coletiva", "preventiva e mfc", "medicina preventiva e social"],
};

export interface ResolvedSpecialty {
  key: SpecialtyKey;
  label: string;
  palette: SpecialtyPalette;
  /** A chave veio do nome/chave informado (true) ou caiu no padrão turquesa/petróleo (false). */
  matched: boolean;
}

/**
 * Lê a especialidade informada (chave ou nome por extenso) e escolhe a paleta.
 * Sem correspondência: paleta "fallback" (turquesa/petróleo) e o NOME informado continua escrito na peça.
 */
export function resolveSpecialty(value: unknown, name?: unknown): ResolvedSpecialty {
  const raw = String(value ?? "").trim();
  const given = String(name ?? "").trim();
  const f = fold(raw);
  let key: SpecialtyKey | null = null;
  if ((SPECIALTY_KEYS as string[]).includes(raw)) key = raw as SpecialtyKey;
  else {
    for (const [k, aliases] of Object.entries(SPECIALTY_ALIASES)) if (aliases.includes(f)) key = k as SpecialtyKey;
  }
  if (key && key !== "fallback") {
    return { key, label: given || VISUAL_TOKENS.specialties[key].label, palette: VISUAL_TOKENS.specialties[key], matched: true };
  }
  // "fallback" pedido de propósito usa o nome informado; nome desconhecido vira o próprio rótulo
  const label = given || (key === "fallback" ? "" : raw);
  return { key: "fallback", label, palette: VISUAL_TOKENS.specialties.fallback, matched: key === "fallback" };
}

export function paletteOf(key: string): SpecialtyPalette {
  return VISUAL_TOKENS.specialties[(SPECIALTY_KEYS as string[]).includes(key) ? (key as SpecialtyKey) : "fallback"];
}

// ---------------------------------------------------------------------------- validação
export interface VisualProblem {
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  content: VisualContent;
  problems: VisualProblem[];
  /** Avisos que não impedem salvar (ex.: campo preenchido que o modelo não mostra). */
  warnings: VisualProblem[];
}

const str = (v: unknown) =>
  String(v ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    // caracteres de controle (menos quebra de linha e tabulação) não entram na peça
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const oneLine = (v: unknown) => str(v).replace(/\s*\n\s*/g, " ");

const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => oneLine(typeof x === "object" && x ? (x as any).texto ?? (x as any).text ?? "" : x)).filter(Boolean);
  return str(v)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
};

const ROW_KINDS: TableRowKind[] = ["normal", "destaque", "alerta"];

/** Tabela em JSON ({ colunas, linhas }) ou em linhas "A | B | C"; a 1ª linha é o cabeçalho. "!destaque" ou "!alerta" no início marcam a linha. */
export function parseTable(v: unknown, titulo?: unknown): VisualTable | null {
  if (v == null || v === "") return null;
  let colunas: string[] = [];
  let linhas: { celulas: string[]; tipo: TableRowKind }[] = [];
  let title = oneLine(titulo);
  if (typeof v === "object" && !Array.isArray(v)) {
    const t = v as any;
    title = oneLine(t.titulo ?? t.title ?? title);
    colunas = (Array.isArray(t.colunas ?? t.columns) ? (t.colunas ?? t.columns) : []).map(oneLine);
    linhas = (Array.isArray(t.linhas ?? t.rows) ? (t.linhas ?? t.rows) : []).map((r: any) => {
      const cells = Array.isArray(r) ? r : Array.isArray(r?.celulas ?? r?.cells) ? (r.celulas ?? r.cells) : [];
      const tipo = ROW_KINDS.includes(r?.tipo) ? r.tipo : "normal";
      return { celulas: cells.map(oneLine), tipo };
    });
  } else {
    const rows = str(v)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^\|?\s*:?-{2,}/.test(l));
    const cells = (l: string) =>
      l
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
    if (rows.length) colunas = cells(rows[0]);
    linhas = rows.slice(1).map((l) => {
      const m = /^\|?\s*!(destaque|alerta)\s+/i.exec(l);
      const tipo = (m ? m[1].toLowerCase() : "normal") as TableRowKind;
      return { celulas: cells(m ? l.replace(/!(destaque|alerta)\s+/i, "") : l), tipo };
    });
  }
  if (!colunas.length && !linhas.length) return null;
  return { titulo: title, colunas, linhas };
}

/**
 * Valida e normaliza o que veio do formulário, do comando ou da API. Os nomes dos campos são os do
 * formulário (pt-BR). Problemas impedem salvar; avisos só informam.
 */
export function validateVisualInput(input: unknown): ValidationResult {
  const problems: VisualProblem[] = [];
  const warnings: VisualProblem[] = [];
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const modelRaw = String(raw.modelo ?? raw.model ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const MODEL_ALIASES: Record<string, VisualModel> = {
    feed: "feed",
    card: "feed",
    card_feed: "feed",
    a4: "a4",
    pagina_a4: "a4",
    story: "story",
    stories: "story",
    flashcard_digital: "flashcard_digital",
    flashcard: "flashcard_digital",
    digital: "flashcard_digital",
    flashcard_a6: "flashcard_a6",
    a6: "flashcard_a6",
    flashcard_impressao: "flashcard_a6",
  };
  const model = MODEL_ALIASES[modelRaw];
  if (!model) problems.push({ field: "modelo", message: `Escolha o modelo: ${MODEL_IDS.join(", ")}.` });

  const spRaw = raw.especialidade ?? raw.specialty_key ?? raw.specialty?.key ?? "";
  const spName = raw.especialidade_nome ?? raw.specialty?.label ?? "";
  const sp = resolveSpecialty(spRaw, spName);
  if (!String(spRaw).trim() && !String(spName).trim()) problems.push({ field: "especialidade", message: "Informe a especialidade." });
  else if (!sp.label) problems.push({ field: "especialidade_nome", message: "Escreva o nome da especialidade por extenso (a cor nunca é o único identificador)." });
  else if (sp.label.length > TEXT_LIMITS.especialidade) problems.push({ field: "especialidade_nome", message: `Nome da especialidade com até ${TEXT_LIMITS.especialidade} caracteres.` });

  const text = (key: string, value: unknown, limit = TEXT_LIMITS[key], multi = false) => {
    const s = multi ? str(value) : oneLine(value);
    if (limit && s.length > limit) problems.push({ field: key, message: `${FIELD_LABELS[key as FieldKey] ?? key}: até ${limit} caracteres (tem ${s.length}).` });
    return s;
  };

  const ilRaw = raw.ilustracao;
  const ilObj = ilRaw && typeof ilRaw === "object" ? ilRaw : { legenda: ilRaw };
  const icone = (Object.keys(ILLUSTRATION_ICONS).includes(ilObj.icone) ? ilObj.icone : "coracao") as IllustrationIcon;
  const imagem = String(ilObj.imagem ?? "").trim();
  if (imagem && !/^[0-9a-f]{64}\.(png|jpg|webp)$/.test(imagem)) problems.push({ field: "ilustracao", message: "Imagem inválida: envie a imagem pelo formulário (PNG, JPEG ou WebP)." });
  const legenda = text("legenda", ilObj.legenda);
  let tipo: VisualIllustration["tipo"] = ["icone", "imagem", "nenhuma"].includes(ilObj.tipo) ? ilObj.tipo : imagem ? "imagem" : legenda || ilObj.icone ? "icone" : "nenhuma";
  if (tipo === "imagem" && !imagem) {
    problems.push({ field: "ilustracao", message: "Escolha a imagem da ilustração ou troque o tipo para ícone." });
    tipo = "nenhuma";
  }
  const ilustracao: VisualIllustration = { tipo, icone, imagem: tipo === "imagem" ? imagem : "", legenda, alt: text("alt", ilObj.alt) };

  const tabela = parseTable(raw.tabela, raw.tabela_titulo);
  if (tabela) {
    if (tabela.titulo.length > TEXT_LIMITS.tabela_titulo) problems.push({ field: "tabela", message: `Título da tabela: até ${TEXT_LIMITS.tabela_titulo} caracteres.` });
    if (tabela.colunas.length < 2 || tabela.colunas.length > 3) problems.push({ field: "tabela", message: "A tabela tem 2 ou 3 colunas." });
    if (tabela.colunas.some((c) => c.length > TEXT_LIMITS.tabela_coluna)) problems.push({ field: "tabela", message: `Nome de coluna com até ${TEXT_LIMITS.tabela_coluna} caracteres.` });
    if (!tabela.linhas.length) problems.push({ field: "tabela", message: "A tabela precisa de pelo menos uma linha além do cabeçalho." });
    for (const r of tabela.linhas) {
      if (r.celulas.length !== tabela.colunas.length) problems.push({ field: "tabela", message: "Cada linha da tabela precisa ter o mesmo número de colunas do cabeçalho." });
      if (r.celulas.some((c) => c.length > TEXT_LIMITS.tabela_celula)) problems.push({ field: "tabela", message: `Célula da tabela com até ${TEXT_LIMITS.tabela_celula} caracteres.` });
    }
  }

  const blocoRaw = raw.bloco;
  const bloco =
    blocoRaw && (typeof blocoRaw === "object" ? (blocoRaw.titulo || (blocoRaw.itens ?? []).length) : String(blocoRaw).trim())
      ? { titulo: text("bloco_titulo", typeof blocoRaw === "object" ? blocoRaw.titulo : ""), itens: list(typeof blocoRaw === "object" ? blocoRaw.itens : blocoRaw) }
      : null;
  if (bloco) {
    if (bloco.itens.length > 3) problems.push({ field: "bloco", message: "O bloco de lista tem até 3 itens." });
    if (bloco.itens.some((i) => i.length > TEXT_LIMITS.bloco_item)) problems.push({ field: "bloco", message: `Item do bloco com até ${TEXT_LIMITS.bloco_item} caracteres.` });
  }

  const mnRaw = raw.mnemonico;
  let mnemonico: VisualContent["mnemonico"] = null;
  if (mnRaw && (typeof mnRaw === "object" ? (mnRaw.titulo || (mnRaw.itens ?? []).length) : String(mnRaw).trim())) {
    const itensRaw = typeof mnRaw === "object" ? mnRaw.itens : mnRaw;
    const itens = (Array.isArray(itensRaw) ? itensRaw : list(itensRaw))
      .map((it: any) => {
        if (typeof it === "object" && it) return { letra: oneLine(it.letra), texto: oneLine(it.texto) };
        const m = /^(.{1,4}?)\s*[—:=-]\s*(.+)$/.exec(String(it));
        return m ? { letra: m[1].trim(), texto: m[2].trim() } : { letra: "", texto: oneLine(it) };
      })
      .filter((it: { letra: string; texto: string }) => it.letra || it.texto);
    mnemonico = { titulo: text("mnemonico_titulo", typeof mnRaw === "object" ? mnRaw.titulo : ""), itens };
    if (itens.length > 4) problems.push({ field: "mnemonico", message: "O mnemônico tem até 4 itens." });
    if (itens.some((i: { letra: string; texto: string }) => i.letra.length > TEXT_LIMITS.mnemonico_letra || i.texto.length > TEXT_LIMITS.mnemonico_texto))
      problems.push({ field: "mnemonico", message: `Mnemônico: letra com até ${TEXT_LIMITS.mnemonico_letra} e texto com até ${TEXT_LIMITS.mnemonico_texto} caracteres.` });
  }

  const pontos = list(raw.pontos_chave ?? raw.pontos);
  if (pontos.some((p) => p.length > TEXT_LIMITS.ponto)) problems.push({ field: "pontos_chave", message: `Cada ponto-chave com até ${TEXT_LIMITS.ponto} caracteres.` });

  const cardId = oneLine(raw.card_id ?? raw.id_do_card ?? "");
  if (cardId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/.test(cardId))
    problems.push({ field: "card_id", message: "ID do card: até 24 letras, números, ponto, hífen ou sublinhado, sem espaço (ex.: CIR-0012)." });
  const ordemRaw = raw.ordem ?? raw.order ?? 1;
  const ordem = Number(ordemRaw === "" ? 1 : ordemRaw);
  if (!Number.isInteger(ordem) || ordem < 1 || ordem > 9999) problems.push({ field: "ordem", message: "Ordem no lote: número inteiro de 1 a 9999." });

  const content: VisualContent = {
    model: model ?? "feed",
    specialty: { key: sp.key, label: sp.label },
    card_id: cardId,
    ordem: Number.isInteger(ordem) ? ordem : 1,
    lote: text("lote", raw.lote),
    titulo: text("titulo", raw.titulo ?? raw.tema_titulo),
    subtitulo: text("subtitulo", raw.subtitulo),
    resumo: text("resumo", raw.resumo),
    resumo_paragrafo: text("resumo_paragrafo", raw.resumo_paragrafo, TEXT_LIMITS.resumo_paragrafo, true),
    dado_chave: text("dado_chave", raw.dado_chave),
    pontos_chave: pontos,
    tabela,
    ilustracao,
    pegadinha: text("pegadinha", raw.pegadinha, TEXT_LIMITS.pegadinha, true),
    tome_nota: text("tome_nota", raw.tome_nota, TEXT_LIMITS.tome_nota, true),
    fonte: text("fonte", raw.fonte),
    atualizacao: text("atualizacao", raw.atualizacao),
    selo_prova: text("selo_prova", raw.selo_prova),
    paginacao: text("paginacao", raw.paginacao),
    bloco,
    mnemonico,
    nivel: text("nivel", raw.nivel),
    tema: text("tema", raw.tema),
    pergunta: text("pergunta", raw.pergunta, TEXT_LIMITS.pergunta, true),
    // "resposta completa" do pacote = explicação (o verso mostra a resposta curta em destaque)
    resposta: text("resposta", raw.resposta ?? raw.resposta_curta),
    explicacao: text("explicacao", raw.explicacao ?? raw.resposta_completa ?? raw.justificativa, TEXT_LIMITS.explicacao, true),
    como_lembrar: text("como_lembrar", raw.como_lembrar, TEXT_LIMITS.como_lembrar, true),
    referencia: text("referencia", raw.referencia, TEXT_LIMITS.referencia, true),
  };

  if (model) {
    for (const f of REQUIRED_FIELDS[model]) {
      if (!filled(content, f)) problems.push({ field: f, message: `Preencha: ${FIELD_LABELS[f]}.` });
    }
    const lim = COUNT_LIMITS[model];
    if (MODEL_FIELDS[model].includes("pontos_chave") && pontos.length > lim.pontos)
      problems.push({ field: "pontos_chave", message: `${VISUAL_MODELS[model].short}: até ${lim.pontos} pontos-chave.` });
    if (MODEL_FIELDS[model].includes("tabela") && tabela && tabela.linhas.length > lim.linhas)
      problems.push({ field: "tabela", message: `${VISUAL_MODELS[model].short}: tabela com até ${lim.linhas} linhas.` });
    if (!VISUAL_MODELS[model].pair && content.card_id) warnings.push({ field: "card_id", message: "O ID do card só vale para flashcards." });
    for (const f of Object.keys(FIELD_LABELS) as FieldKey[]) {
      if (["card_id", "ordem", "lote"].includes(f)) continue;
      if (!MODEL_FIELDS[model].includes(f) && filled(content, f)) warnings.push({ field: f, message: `"${FIELD_LABELS[f]}" não aparece no modelo ${VISUAL_MODELS[model].short}.` });
    }
    if (model === "story" && tabela && tabela.linhas.length && ilustracao.tipo === "imagem")
      warnings.push({ field: "tabela", message: "No story, a área flexível mostra a imagem; a tabela fica de fora." });
  }
  if (!sp.matched && sp.label) warnings.push({ field: "especialidade", message: `"${sp.label}" não tem cor própria: usa a paleta padrão turquesa/petróleo.` });

  // o conteúdo volta mesmo com problemas: a prévia mostra o que já dá para mostrar
  return { ok: problems.length === 0, content, problems, warnings };
}

export function filled(c: VisualContent, f: FieldKey): boolean {
  const v = (c as any)[f];
  if (f === "ilustracao") return c.ilustracao.tipo !== "nenhuma";
  if (f === "ordem") return true;
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return f === "tabela" ? (v.linhas?.length ?? 0) > 0 : Boolean(v.titulo || v.itens?.length);
  return String(v).trim().length > 0;
}

/** Nome que identifica o material na lista. */
export function visualTitle(c: VisualContent): string {
  const t = VISUAL_MODELS[c.model]?.pair ? c.tema || c.pergunta : c.titulo;
  return (t || VISUAL_MODELS[c.model]?.label || "Material visual").slice(0, 200);
}

/** Texto do selo "Atualizado": aceita "2025" ou "Atualizado em 2025". */
export function updatedLabel(atualizacao: string): string {
  const a = atualizacao.trim();
  if (!a) return "";
  return /^atualiz/i.test(a) ? a : `Atualizado ${a}`;
}

/** Linha de fonte/atualização do rodapé (flashcards não têm o selo "Atualizado"). */
export function sourceLine(c: VisualContent, withUpdate: boolean): string {
  return [c.fonte, withUpdate ? updatedLabel(c.atualizacao) : ""].filter(Boolean).join(" · ");
}

const slug = (s: string) =>
  fold(s)
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/-+$/, "") || "material";

export const SIDE_FILE_LABEL: Record<string, string> = { single: "", front: "frente", back: "verso", pair: "frente-e-verso" };

/** Nome do arquivo para baixar: ID do card (ou título), modelo, versão e lado. */
export function visualFileName(c: { model: string; card_id?: string | null; title?: string }, version: number, side: string, format: string): string {
  const base = c.card_id || slug(c.title ?? "");
  const model = String(c.model).replace(/_/g, "-");
  return [base, model, `v${version}`, SIDE_FILE_LABEL[side]].filter(Boolean).join("_") + `.${format}`;
}
