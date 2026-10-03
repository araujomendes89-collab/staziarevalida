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

/** "Revalida 2024/1", "ENAMED 2025" */
export function examLabel(exam) {
  if (!exam) return "";
  return `${exam.kind === "ENAMED" ? "ENAMED" : "Revalida"} ${exam.year}${exam.semester ? `/${exam.semester}` : ""}`;
}

/** 36 → "36 min" · 60 → "1h" · 90 → "1h30" */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return `${Math.floor(total / 60)}h${rest ? String(rest).padStart(2, "0") : ""}`;
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
