// Simulado TRI (estimativa StaziaMed): textos fixos e formatação (sem React, para poder testar sozinho).
// Regras do dono (14/10/2026): modo opcional; escala PRÓPRIA 50 + 10·θ (nunca a do Inep); faixa de incerteza sempre visível;
// rótulo fixo; nada de "aprovado".

export const TRI_LABEL = "Estimativa StaziaMed, não é a nota do Inep";

/** Os dois modos de correção do simulado (o clássico é o padrão). */
export const SCORING_MODES = [
  {
    value: "classic",
    title: "Clássico — por acertos",
    badge: "Padrão",
    text: "Sua nota é acertos ÷ questões válidas. É a conta mais simples e era a correção do Revalida até 2026/1.",
  },
  {
    value: "irt",
    title: "TRI — estimativa StaziaMed",
    badge: "Opcional",
    text:
      "Usa o mesmo tipo de modelo do Inep (Rasch): cada questão tem uma dificuldade e acertar as difíceis mostra mais. Dá uma nota de 0 a 100 com faixa de incerteza. É uma estimativa StaziaMed, não é a nota do Inep. Fica mais precisa com 100 questões.",
  },
];

export const TRI_MIN_QUESTIONS = 30;

/** Aviso fixo do rodapé do resultado. */
export const TRI_NOTICE =
  "O Inep usa o mesmo tipo de modelo, mas não publica a dificuldade das questões; esta estimativa usa as respostas de alunos do StaziaMed e uma régua própria (50 é o meio).";

/** "O que é isso?" — explicação em linguagem simples. */
export const TRI_EXPLANATION = [
  "A TRI (Teoria de Resposta ao Item) coloca você e as questões na mesma régua. Cada questão tem uma dificuldade; quanto mais acima da dificuldade de uma questão você está, maior a chance de acertá-la.",
  "Como cada aluno faz um simulado diferente, a TRI compara simulados mais fáceis e mais difíceis de forma justa: acertar 80% de questões difíceis vale mais do que acertar 80% de questões fáceis. Num mesmo simulado, quem acerta o mesmo número de questões fica com a mesma nota.",
  "A nota vai de 0 a 100: 50 é o meio da régua e cada 10 pontos é um degrau. A faixa mostra a incerteza: com 95% de confiança, sua proficiência está dentro dela. Com poucas questões a faixa fica larga.",
  "A dificuldade de cada questão vem das respostas dos alunos do StaziaMed. Ela é provisória enquanto há poucas respostas (vem do percentual de acerto ou do nível da questão) e passa a calibrada com 100 respostas ou mais. Questão anulada fica fora da conta.",
  "Não é a nota do Inep: o Inep usa o mesmo tipo de modelo (Rasch), mas não publica a dificuldade das questões e a régua dele é outra. Esta nota não prevê o resultado da prova oficial; use para acompanhar a sua evolução.",
];

/** 62.3 → "62,3" (uma casa, vírgula). */
export function formatNota(value) {
  return Number(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Acertos da área comparados ao esperado pelo modelo (com a nota geral): "acima", "abaixo" ou "dentro". */
export function tendencia({ n_correct, expected, n_items }) {
  const diferenca = Number(n_correct) - Number(expected);
  const limiar = Math.max(1, 0.1 * (Number(n_items) || 0));
  return diferenca > limiar ? "acima" : diferenca < -limiar ? "abaixo" : "dentro";
}

export const TENDENCIA = {
  acima: { label: "acima do esperado", tone: "success" },
  abaixo: { label: "abaixo do esperado", tone: "warning" },
  dentro: { label: "dentro do esperado", tone: "neutral" },
};
