// Grau de dificuldade das estações da 2ª fase (pedido do dono de 17/10). Quem define é o revisor médico da área (ou o
// administrador), na montagem, em Administração › Estações › Conferir, pela rubrica fixa abaixo. A rubrica completa, com o
// porquê de cada item, está em docs/estacoes/dificuldade-estacoes.md. Depois, com as notas dos alunos, o grau poderá ser
// recalibrado (a coluna já existe no banco, migração 013410; a recalibração fica para depois).
// Os códigos (facil, medio, dificil e os dos critérios) são os mesmos que o banco aceita: mudar aqui exige mudar lá.

/** Os três graus, na ordem. */
export const DIFICULDADES = [
  { value: "facil", label: "Fácil" },
  { value: "medio", label: "Médio" },
  { value: "dificil", label: "Difícil" },
];

/** Rótulo do grau gravado; sem grau (ou código desconhecido): null, para a tela não mostrar selo nenhum. */
export function dificuldadeLabel(code) {
  return DIFICULDADES.find((d) => d.value === code)?.label ?? null;
}

/** Rubrica fixa: cada item é sim ou não, conferido no roteiro, nos impressos e no checklist da estação. */
export const CRITERIOS = [
  { value: "tarefas", label: "Quatro tarefas ou mais", hint: "O enunciado pede 4 tarefas ou mais ao candidato." },
  { value: "raciocinio", label: "Raciocínio em etapas", hint: "O diagnóstico ou a conduta só sai juntando anamnese, exame e impressos; não vem pronto no enunciado." },
  { value: "procedimento", label: "Procedimento ou manobra", hint: "Pede demonstrar um procedimento ou uma manobra de exame físico específica." },
  { value: "conduta_dose", label: "Conduta com dose", hint: "Pede prescrever com dose, via e intervalo, ou fazer um cálculo (por peso, hidratação, gotejamento)." },
  { value: "comunicacao", label: "Comunicação difícil", hint: "Má notícia, recusa, conflito, suspeita de violência, sigilo ou paciente resistente." },
  { value: "tempo", label: "Tempo apertado", hint: "Checklist com 12 itens ou mais para os 10 minutos da estação." },
];

/** Grau que a rubrica indica pelo número de itens marcados: 0–1 Fácil, 2–3 Médio, 4–6 Difícil. */
export function dificuldadeSugerida(marcados) {
  const n = Array.isArray(marcados) ? new Set(marcados.filter((c) => CRITERIOS.some((x) => x.value === c))).size : 0;
  return n >= 4 ? "dificil" : n >= 2 ? "medio" : "facil";
}
