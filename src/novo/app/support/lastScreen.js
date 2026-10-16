// Em qual tela o aluno estava antes de abrir a Conta: o relato "Relatar um problema" já vem com essa tela escolhida.
export const SCREEN_NAMES = {
  home: "Início",
  hoje: "Plano de hoje",
  aulas: "Aulas",
  temas: "Grandes Temas",
  atualizacoes: "Atualizações",
  questoes: "Questões",
  sessao: "Resolvendo questões",
  simulados: "Simulados",
  flash: "Flashcards",
  erros: "Caderno de erros",
  plano: "Planejamento",
  desempenho: "Desempenho",
  analise: "Análise",
  tutor: "Tutor",
  trilha: "Trilha",
  classificacao: "Classificação",
  missoes: "Missões",
  conquistas: "Conquistas",
  perfil: "Conta",
};
export const OTHER_SCREEN = "Outra tela ou não sei";

let current = null;
let previous = null;

/** Chamado pelo app a cada tela que o aluno abre. */
export function rememberScreen(route) {
  if (!route || route === current) return;
  previous = current;
  current = route;
}

/** Nome da tela anterior à Conta (ou da atual, se não for a Conta); null quando não dá para saber. */
export function screenBeforeAccount() {
  const route = current === "perfil" ? previous : current;
  return (route && SCREEN_NAMES[route] && route !== "perfil" && SCREEN_NAMES[route]) || null;
}

export function resetRememberedScreens() {
  current = null;
  previous = null;
}
