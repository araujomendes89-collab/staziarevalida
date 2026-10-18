// Para quem vai um comunicado da equipe (migração 013830, comunicado_alunos): os mesmos valores do banco, em português.
export const PUBLICOS = [
  { value: "todos", label: "Todos os alunos" },
  { value: "plano", label: "Um plano" },
  { value: "fase", label: "Uma fase" },
];
export const FILTROS = {
  plano: [
    { value: "pro", label: "PRO" },
    { value: "pratica", label: "PRÁTICA" },
    { value: "elite", label: "ELITE" },
    { value: "teste", label: "Em teste grátis" },
  ],
  fase: [
    { value: "teoria", label: "1ª fase (teoria)" },
    { value: "pratica", label: "2ª fase (prática)" },
  ],
};

/** "Todos os alunos", "Alunos do PRO", "Alunos em teste grátis", "Alunos com acesso à 2ª fase (prática)". */
export function publicoRotulo(publico, filtro) {
  if (publico === "todos") return "Todos os alunos";
  if (publico === "plano") {
    if (filtro === "teste") return "Alunos em teste grátis";
    const f = FILTROS.plano.find((x) => x.value === filtro);
    return f ? `Alunos do ${f.label}` : "Alunos de um plano";
  }
  if (publico === "fase") {
    const f = FILTROS.fase.find((x) => x.value === filtro);
    return f ? `Alunos com acesso à ${f.label}` : "Alunos de uma fase";
  }
  return "";
}
