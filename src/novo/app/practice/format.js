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

/** "Questão StaziaMed · nº 12" · "Revalida 2024/1 · Q51" */
export function questionRef(q) {
  if (isStaziamed(q)) return `Questão StaziaMed · nº ${q.number}`;
  return `${examLabel(q?.exam)} · Q${q?.number}`;
}

/** O aviso que acompanha toda Questão StaziaMed. */
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

/**
 * Separa o comando da questão (a última frase) do caso clínico, só para dar destaque
 * visual: o texto é o mesmo, na mesma ordem. Sem uma divisão clara, fica tudo no caso.
 */
export function splitStatement(statement) {
  const text = String(statement ?? "").trim();
  let cut = -1;
  for (const match of text.matchAll(/[.?!]["”’)]?\s+(?=\p{Lu})/gu)) cut = match.index + match[0].length;
  if (cut <= 0) return { stem: text, ask: "" };
  const ask = text.slice(cut).trim();
  if (ask.length < 12 || ask.length > 320) return { stem: text, ask: "" };
  return { stem: text.slice(0, cut).trim(), ask };
}

/** Percentual inteiro, sem dividir por zero. */
export const percent = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
