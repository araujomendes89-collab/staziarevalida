// Rótulos e formatadores da 2ª fase (habilidades clínicas).
// Sem dependência de React para poder ser testado isoladamente.

export const AREAS = [
  { name: "Clínica Médica", color: "clinica", token: "--area-clinica", bgToken: "--area-clinica-bg", textToken: "--area-clinica-text", sigla: "CM" },
  { name: "Cirurgia Geral", color: "cirurgia", token: "--area-cirurgia", bgToken: "--area-cirurgia-bg", textToken: "--area-cirurgia-text", sigla: "CG" },
  { name: "Ginecologia e Obstetrícia", color: "go", token: "--area-go", bgToken: "--area-go-bg", textToken: "--area-go-text", sigla: "GO" },
  { name: "Pediatria", color: "pediatria", token: "--area-pediatria", bgToken: "--area-pediatria-bg", textToken: "--area-pediatria-text", sigla: "PED" },
  { name: "Medicina de Família e Comunidade", color: "preventiva", token: "--area-preventiva", bgToken: "--area-preventiva-bg", textToken: "--area-preventiva-text", sigla: "MFC" },
];

export const AREA_MAP = Object.fromEntries(AREAS.map((a) => [a.name, a]));

export function getArea(name) {
  return AREA_MAP[name] ?? { name: name || "Área geral", color: "clinica", token: "--area-clinica", bgToken: "--area-clinica-bg", textToken: "--area-clinica-text", sigla: "—" };
}

/** Formata nota na escala de 0 a 10 com vírgula decimal (ex.: 7,4; null -> "—"). */
export function fmtScore(n) {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

/** Converte duração em milissegundos para minutos (ex.: 600000 -> "10 min"). */
export function fmtMinutes(ms) {
  if (ms == null || ms === "" || Number.isNaN(Number(ms))) return "—";
  const num = Number(ms);
  if (num <= 0) return "—";
  const minutes = Math.round(num >= 1000 ? num / 60000 : num);
  return `${minutes} min`;
}

export const ORIGIN_LABEL = {
  solo: "Sozinho",
  dupla: "Em dupla",
};

export const GRADE_LABEL = {
  correct: "Adequado",
  partial: "Parcial",
  incorrect: "Inadequado",
  a: "Adequado",
  p: "Parcial",
  i: "Inadequado",
};
