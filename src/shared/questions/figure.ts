// Detecção de questões que dependem de uma figura. Usada na carga do banco
// (scripts/supabase/seed-builder.ts) e na importação de questões pelo painel de administração.

// Enunciados que remetem a uma figura (imagem, ECG, gráfico, partograma…) que não acompanha
// o texto. Quadros e tabelas ficam de fora: os valores vêm escritos no próprio enunciado.
const PICTURE = "(?:imagem|imagens|figura|foto|fotografia|gr[áa]fico|tra[çc]ado|partograma|genograma|heredograma|eletrocardiograma|ECG)";
const PICTURE_REFERENCES = [
  new RegExp(`(?:^|[^\\p{L}])${PICTURE}\\s+(?:radiol[óo]gica\\s+|tomogr[áa]fica\\s+)?(?:é\\s+|está\\s+)?(?:a seguir|abaixo|apresentad[oa]|exibid[oa]|mostrad[oa])`, "iu"),
  new RegExp(`(?:^|[^\\p{L}])(?:n[ao]|conforme(?:\\s+indica)?(?:\\s+a)?)\\s+${PICTURE}(?:\\s+(?:a seguir|abaixo|radiol[óo]gica|\\d+)|[.,:;])`, "iu"),
  /(?:^|[^\p{L}])Figura\s*(?:\d+\s*)?[:—–-]/u,
  /respectiva imagem/i,
  /exibid[oa] a seguir/i,
  /A seguir,\s+(?:reproduz-se|pode-se observar)/,
];

/** O enunciado cita uma figura que precisa estar à vista para responder? */
export function citesFigure(statement: string): boolean {
  return PICTURE_REFERENCES.some((pattern) => pattern.test(statement));
}
