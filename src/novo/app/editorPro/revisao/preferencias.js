// Preferências de revisão de quem edita (ortografia e autocorreção). Ficam só no navegador da pessoa da equipe (nunca no documento
// nem no que o aluno recebe). Se o navegador bloquear o armazenamento, vale o padrão e tudo continua funcionando.
export const CHAVE_ARMAZENAMENTO = "stazia.editorPro.revisao.v1";

export const REGRAS_AUTOCORRECAO = [
  { id: "aspas", rotulo: "Aspas curvas (“ ”)", exemplo: "\"texto\" → “texto”" },
  { id: "travessao", rotulo: "Travessão", exemplo: "-- → —" },
  { id: "setas", rotulo: "Setas", exemplo: "-> → →   <- → ←" },
  { id: "reticencias", rotulo: "Reticências", exemplo: "... → …" },
  { id: "comparacao", rotulo: "Sinais de comparação", exemplo: ">= → ≥   <= → ≤   +/- → ±" },
];

const padrao = () => ({
  ortografia: true,
  autocorrecao: true,
  regras: Object.fromEntries(REGRAS_AUTOCORRECAO.map((r) => [r.id, true])),
});

function ler() {
  const base = padrao();
  try {
    const bruto = typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE_ARMAZENAMENTO) : null;
    if (!bruto) return base;
    const p = JSON.parse(bruto);
    if (typeof p?.ortografia === "boolean") base.ortografia = p.ortografia;
    if (typeof p?.autocorrecao === "boolean") base.autocorrecao = p.autocorrecao;
    for (const r of REGRAS_AUTOCORRECAO) if (typeof p?.regras?.[r.id] === "boolean") base.regras[r.id] = p.regras[r.id];
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return base;
}

let atual = ler();
const ouvintes = new Set();

export const prefs = () => atual;

export function definirPrefs(mudanca) {
  const novo = {
    ortografia: mudanca.ortografia ?? atual.ortografia,
    autocorrecao: mudanca.autocorrecao ?? atual.autocorrecao,
    regras: { ...atual.regras, ...(mudanca.regras || {}) },
  };
  atual = novo;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(novo));
  } catch {
    /* ignora */
  }
  ouvintes.forEach((f) => f());
}

export function assinarPrefs(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

// Só para testes.
export function restaurarPrefsPadrao() {
  atual = padrao();
  ouvintes.forEach((f) => f());
}
