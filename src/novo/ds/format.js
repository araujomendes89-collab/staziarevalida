// Formato de números e de tempo do app novo (pt-BR). Uma função só para nota, pontos e porcentagem,
// para a vírgula decimal ser a mesma em todas as telas ("7,25 / 10,00", "61,4%", "72%").
const formats = new Map();

function numberFormat(digits) {
  let format = formats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formats.set(digits, format);
  }
  return format;
}

/**
 * Número com vírgula decimal e `digits` casas: 7.25 → "7,25"; 10 → "10,00"; (61.4, 1) → "61,4"; (72, 0) → "72".
 * Sem número (null, undefined, NaN) devolve "—": nunca se inventa um zero. Zero sai sem sinal ("0,00", nunca "-0,00").
 * @param {number} value
 * @param {number} [digits]
 * @returns {string}
 */
export function formatDecimal(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const text = numberFormat(digits).format(value);
  // -0 e negativo pequeno que o arredondamento zera: o Intl devolve "-0,00"
  return /^[-\u2212][0.,]*$/.test(text) ? text.slice(1) : text;
}

/**
 * Tempo em minutos e segundos, ao segundo mais próximo: 452000 → "7 min 32 s"; 600000 → "10 min"; 45000 → "45 s".
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}
