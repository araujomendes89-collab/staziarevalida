// Rótulos e formatação das telas de treino (sem React, para poder testar sozinho).

export const AREAS = [
  { id: "CLINICA_MEDICA", label: "Clínica Médica", icon: "stethoscope", tone: "--area-clinica" },
  { id: "CIRURGIA_GERAL", label: "Cirurgia", icon: "activity", tone: "--area-cirurgia" },
  { id: "PEDIATRIA", label: "Pediatria", icon: "baby", tone: "--area-pediatria" },
  { id: "GINECOLOGIA_OBSTETRICIA", label: "Gineco & Obstetrícia", icon: "heart-pulse", tone: "--area-go" },
  { id: "MEDICINA_FAMILIA_COMUNIDADE", label: "Preventiva / MFC", icon: "shield-plus", tone: "--area-preventiva" },
];

export const areaOf = (id) => AREAS.find((a) => a.id === id) ?? null;
export const areaLabel = (id) => areaOf(id)?.label ?? "Todas as áreas";

/** "Revalida 2024/1", "ENAMED 2025"; as Questões StaziaMed aparecem como "Questões Inéditas" na lista de provas. */
export function examLabel(exam) {
  if (!exam) return "";
  if (exam.kind === "STAZIAMED") return "Questões Inéditas";
  return `${exam.kind === "ENAMED" ? "ENAMED" : "Revalida"} ${exam.year}${exam.semester ? `/${exam.semester}` : ""}`;
}

/** Questão escrita pela StaziaMed (não é questão oficial do Inep)? */
export const isStaziamed = (q) => q?.exam?.kind === "STAZIAMED" || q?.origin === "staziamed";

/** "Questão Inédita · nº 12" · "Revalida 2024/1 · Q51" */
export function questionRef(q) {
  if (isStaziamed(q)) return `Questão Inédita · nº ${q.number}`;
  return `${examLabel(q?.exam)} · Q${q?.number}`;
}

/** O aviso que acompanha toda Questão Inédita (escrita pela StaziaMed). */
export const STAZIAMED_NOTICE = "Questões criadas pela StaziaMed a partir de fontes oficiais e revisadas por médico. Não é questão oficial do Inep.";

/** 36 → "36 min" · 60 → "1h" · 90 → "1h30" */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return `${Math.floor(total / 60)}h${rest ? String(rest).padStart(2, "0") : ""}`;
}

// Tempo personalizado do simulado: de 1 minuto a 12 horas (o mesmo intervalo que o banco aceita).
export const SIM_MAX_MINUTES = 12 * 60;

/**
 * Horas e minutos digitados pelo aluno → minutos, ou o motivo de não valer.
 * ("1", "30") → { minutes: 90 } · ("", "") → { error } · ("13", "0") → { error }
 */
export function parseDuration(hours, minutes) {
  const read = (value) => (String(value ?? "").trim() === "" ? 0 : Number(value));
  const h = read(hours);
  const m = read(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return { error: "Use horas inteiras e minutos de 0 a 59." };
  const total = h * 60 + m;
  if (total < 1) return { error: "Escolha pelo menos 1 minuto." };
  if (total > SIM_MAX_MINUTES) return { error: "O máximo é 12 horas." };
  return { minutes: total };
}

/** Ritmo por questão: 180 → "3 min por questão" · 150 → "2,5 min por questão" · 45 → "45 s por questão" */
export function paceLabel(secondsPerQuestion) {
  const seconds = Math.max(0, Number(secondsPerQuestion) || 0);
  if (seconds < 60) return `${Math.round(seconds)} s por questão`;
  return `${String(Math.round(seconds / 6) / 10).replace(".", ",")} min por questão`;
}

/** 75 → "01:15" · 3725 → "1:02:05" */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "hoje, 14:32" · "ontem, 09:10" · "12 de set., 18:00" */
export function formatWhen(iso, now = new Date()) {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayOf(now) - dayOf(date)) / 86_400_000);
  if (days === 0) return `hoje, ${time}`;
  if (days === 1) return `ontem, ${time}`;
  if (days === -1) return `amanhã, ${time}`;
  return `${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date)}, ${time}`;
}

// Fim de frase: ponto, interrogação ou exclamação (com aspas/parêntese opcional) + espaço + maiúscula. Nas questões com figura ou
// tabela, também ":" + espaço + maiúscula: é a frase que apresenta a figura ("Os exames ... revelam:"), que é do caso, não da pergunta.
// Sem figura o ":" não conta (ex.: "KDIGO (Kidney Disease: Improving ...").
const FIM_DE_FRASE = /[.?!]["”’)]?\s+(?=\p{Lu})/gu;
const FIM_DE_FRASE_COM_FIGURA = /(?:[.?!]["”’)]?|:)\s+(?=\p{Lu})/gu;
const PERGUNTA_MIN = 12;
const PERGUNTA_MAX = 320;

/** Posição onde começa a pergunta (a última frase), a partir de `desde`; -1 se não houver fronteira. */
function inicioDaPergunta(text, { comFigura = false, desde = 0 } = {}) {
  let cut = -1;
  for (const match of text.matchAll(comFigura ? FIM_DE_FRASE_COM_FIGURA : FIM_DE_FRASE)) {
    const fim = match.index + match[0].length;
    if (fim > desde) cut = fim;
  }
  return cut;
}

const tamanhoDePergunta = (ask) => ask.length >= PERGUNTA_MIN && ask.length <= PERGUNTA_MAX;

/**
 * Separa o comando da questão (a última frase) do caso clínico, só para dar destaque
 * visual: o texto é o mesmo, na mesma ordem. Sem uma divisão clara, fica tudo no caso.
 * `comFigura`: a questão tem figura ou tabela (aí ":" também fecha frase).
 */
export function splitStatement(statement, { comFigura = false } = {}) {
  const text = String(statement ?? "").trim();
  const cut = inicioDaPergunta(text, { comFigura });
  if (cut <= 0) return { stem: text, ask: "" };
  const ask = text.slice(cut).trim();
  if (!tamanhoDePergunta(ask)) return { stem: text, ask: "" };
  return { stem: text.slice(0, cut).trim(), ask };
}

/** O trecho de posição da figura no enunciado: "vazio" | "ausente" | "repetido" | "ok" (aparece exatamente uma vez). */
export function situacaoDoTrecho(statement, apos) {
  const text = String(statement ?? "").trim();
  const trecho = typeof apos === "string" ? apos.trim() : "";
  if (!trecho) return "vazio";
  const primeira = text.indexOf(trecho);
  if (primeira < 0) return "ausente";
  return text.indexOf(trecho, primeira + 1) >= 0 ? "repetido" : "ok";
}

/** A figura tem posição válida? Só quando `apos` aparece exatamente UMA vez no enunciado. Devolve o fim do trecho, ou -1. */
function posicaoDaFigura(text, image) {
  if (situacaoDoTrecho(text, image?.apos) !== "ok") return -1;
  const apos = image.apos.trim();
  return text.indexOf(apos) + apos.length;
}

/**
 * Monta o enunciado na ordem da prova: blocos { tipo: "texto", texto } | { tipo: "figuras", indices } | { tipo: "apoio" } |
 * { tipo: "pergunta", texto }. `indices` são as posições ORIGINAIS em `images` (o endereço da figura é buscado por elas).
 * - Figura com `apos` válido (trecho exato que aparece uma vez): logo depois do trecho.
 * - Figura sem `apos`, com trecho que sumiu ou se repete, e a tabela de apoio: no lugar de sempre (depois do caso, antes da pergunta).
 * - A pergunta é a última frase depois da última figura posicionada; se depois dela só houver uma frase, ela é a pergunta.
 * O texto não muda nem troca de ordem: juntando os textos com espaço, volta o enunciado.
 */
export function montarEnunciado({ statement, images = [], support = null } = {}) {
  const text = String(statement ?? "").trim();
  const lista = Array.isArray(images) ? images : [];
  const comFigura = lista.length > 0 || Boolean(support);
  const posicoes = lista.map((image) => posicaoDaFigura(text, image));
  const ultimaAncora = Math.max(-1, ...posicoes);

  // pergunta: depois da última figura posicionada
  let cut = inicioDaPergunta(text, { comFigura, desde: ultimaAncora > 0 ? ultimaAncora : 0 });
  if (cut < 0 && ultimaAncora > 0 && ultimaAncora < text.length && /^\s*\p{Lu}/u.test(text.slice(ultimaAncora))) cut = ultimaAncora;
  let ask = cut > 0 ? text.slice(cut).trim() : "";
  if (!tamanhoDePergunta(ask)) {
    ask = "";
    cut = -1;
  }
  const fimDoCaso = cut > 0 ? cut : text.length;

  // pontos de corte: cada figura posicionada no seu trecho; as demais (e a tabela de apoio) no fim do caso
  const pontos = lista.map((_, indice) => ({ pos: posicoes[indice] >= 0 ? posicoes[indice] : fimDoCaso, indice }));
  pontos.sort((a, b) => a.pos - b.pos || a.indice - b.indice);

  const blocos = [];
  const texto = (de, ate) => {
    const t = text.slice(de, ate).trim();
    if (t) blocos.push({ tipo: "texto", texto: t });
  };
  const figuras = (indice) => {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo?.tipo === "figuras") ultimo.indices.push(indice);
    else blocos.push({ tipo: "figuras", indices: [indice] });
  };
  let de = 0;
  for (const { pos, indice } of pontos) {
    texto(de, pos);
    de = Math.max(de, pos);
    figuras(indice);
  }
  texto(de, fimDoCaso);
  if (support) blocos.push({ tipo: "apoio" });
  if (ask) blocos.push({ tipo: "pergunta", texto: ask });
  return blocos;
}

/** Percentual inteiro, sem dividir por zero. */
export const percent = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
