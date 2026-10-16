// As 5 grandes áreas do Revalida no Treinamento em Dupla: código, nome em cada tela e o token de cor.
// A cor base de cada área é a do app (--area-*, tokens/semantic.css); o resto vem de tokens/dupla.css.

/**
 * @typedef {"CM" | "CR" | "GO" | "PED" | "MFC"} AreaCode
 * @typedef {"clinica" | "cirurgia" | "go" | "pediatria" | "preventiva"} AreaToken
 * @typedef {{ code: AreaCode, label: string, card: string, chip: string, token: AreaToken }} Area
 */

/**
 * `label` = área como está gravada no Banco de estações; `card` = nome no cartão da estação;
 * `chip` = nome nos chips do perfil de estudo. A Medicina de Família usa as cores de `preventiva`, como o resto do app.
 * @type {Area[]}
 */
export const AREAS = [
  { code: "CM", label: "Clínica Médica", card: "Clínica Médica", chip: "Clínica Médica", token: "clinica" },
  { code: "CR", label: "Cirurgia Geral", card: "Cirurgia", chip: "Cirurgia", token: "cirurgia" },
  { code: "GO", label: "Ginecologia e Obstetrícia", card: "Ginecologia e Obstetrícia", chip: "GO", token: "go" },
  { code: "PED", label: "Pediatria", card: "Pediatria", chip: "Pediatria", token: "pediatria" },
  { code: "MFC", label: "Medicina de Família e Comunidade", card: "Medicina de Família", chip: "MFC", token: "preventiva" },
];

/**
 * @param {string} code "CM", "CR", "GO", "PED" ou "MFC"
 * @returns {Area | null}
 */
export function areaByCode(code) {
  return AREAS.find((area) => area.code === code) ?? null;
}

/**
 * @param {string} label área como está no Banco de estações (ex.: "Cirurgia Geral")
 * @returns {Area | null}
 */
export function areaByLabel(label) {
  return AREAS.find((area) => area.label === label) ?? null;
}

/**
 * Cores da área para usar em `style`, como referências `var(--…)`:
 *  - `base`: a cor da área (barras, números grandes, gráficos);
 *  - `soft`: fundo claro; `ink`: texto sobre o fundo claro;
 *  - `solid`: fundo de selo ou número com texto `--surface-card`. De dia, Cirurgia e Pediatria usam um tom mais escuro
 *    que a base, porque o texto branco sobre a base não chega a 4,5:1 (as outras áreas usam a própria base).
 * Código desconhecido devolve tons neutros do app, para a tela não quebrar.
 * @param {string} code
 * @returns {{ base: string, soft: string, ink: string, solid: string }}
 */
export function areaVars(code) {
  const area = areaByCode(code);
  if (!area) {
    return { base: "var(--text-tertiary)", soft: "var(--surface-sunken)", ink: "var(--text-secondary)", solid: "var(--text-secondary)" };
  }
  const name = `--area-${area.token}`;
  return { base: `var(${name})`, soft: `var(${name}-soft)`, ink: `var(${name}-ink)`, solid: `var(${name}-solid)` };
}
