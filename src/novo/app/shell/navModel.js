// Modelo do menu (casca nova, ondas 0 e 1 das Novas telas): só dados e funções puras, sem tela.
// Os endereços (rotas) e os nomes são exatamente os do menu anterior; muda só a forma de mostrar (sanfona, barra de abas, barra de baixo).
import { aulasParaAluno } from "../features.js";

// [rota, ícone, nome]
export const GROUPS_FASE1 = [
  { id: "jornada", label: "Minha jornada", short: "Início", icon: "house", items: [["home", "house", "Visão Geral"], ["hoje", "list-checks", "Plano de Hoje"], ["trilha", "route", "Minha Trilha"]] },
  { id: "aprender", label: "Aprender", short: "Aprender", icon: "book-open", items: [["aulas", "tv", "Aulas"], ["temas", "book-open", "Temas Essenciais"], ["atualizacoes", "newspaper", "Diretrizes e Atualizações"], ["mapas", "network", "Mapas Mentais"]] },
  { id: "praticar", label: "Praticar", short: "Praticar", icon: "file-question", items: [["questoes", "file-question", "Banco de Questões"], ["simulados", "timer", "Simulados"]] },
  { id: "revisar", label: "Revisar", short: "Revisar", icon: "layers", items: [["flash", "layers", "Flashcards"], ["erros", "notebook-pen", "Caderno de Erros"]] },
  { id: "arena", label: "Stazia Arena", short: "Arena", icon: "trophy", items: [["missoes", "target", "Missões"], ["classificacao", "trophy", "Ranking"], ["conquistas", "award", "Conquistas"]] },
  { id: "evolucao", label: "Minha evolução", short: "Evolução", icon: "chart-column", items: [["desempenho", "chart-column", "Desempenho"], ["analise", "chart-pie", "Análise Inteligente"], ["plano", "calendar-days", "Planejamento"]] },
  { id: "tutor", label: "Tutor com IA", short: "Tutor", icon: "sparkles", direct: "tutor", badgeText: "IA", items: [["tutor", "sparkles", "Tutor com IA"]] },
];

// 2ª fase (só a equipe a vê por enquanto)
export const GROUPS_FASE2 = [
  { id: "menu2", label: "Menu", short: "Menu", icon: "house", items: [["home2", "house", "Início"], ["teoria2", "book-open", "Teoria"], ["estacoes", "clipboard-list", "Estações"], ["dupla", "users", "Praticar"], ["peps", "list-checks", "Meus PEPs"]] },
  { id: "treino2", label: "Treino com IA", short: "Treino", icon: "message-circle-heart", direct: "paciente", items: [["paciente", "message-circle-heart", "Paciente simulado"]] },
  { id: "analise2", label: "Análise", short: "Análise", icon: "chart-column", direct: "desempenho2", items: [["desempenho2", "chart-column", "Desempenho"]] },
];

/** Grupos da fase, sem "Aulas" quando as aulas estão fechadas ao aluno (features.js; lido na hora de desenhar). */
export function groupsOf(phase, { staff = false } = {}) {
  const base = phase === 2 ? GROUPS_FASE2 : GROUPS_FASE1;
  return base
    .map((g) => ({ ...g, items: g.items.filter(([id]) => id !== "aulas" || aulasParaAluno() || staff) }))
    .filter((g) => g.items.length > 0);
}

/** Grupo ao qual a rota pertence (ou null: Conta, Meu Plano, Administração...). */
export function groupOfRoute(route, phase = 1) {
  const g = (phase === 2 ? GROUPS_FASE2 : GROUPS_FASE1).find((x) => x.items.some(([id]) => id === route));
  return g ? g.id : null;
}

/** Selos reais (nunca inventados): só o que o app já sabe. */
export function badgeOf(id, info = {}) {
  if (id === "flash") return info.flashcardsDue || null;
  if (id === "admin") return info.radarGraves || null;
  return null;
}
export function groupBadge(group, info) {
  const sum = group.items.reduce((n, [id]) => n + (Number(badgeOf(id, info)) || 0), 0);
  return sum || null;
}

/** Itens de "Configurações" (fim do menu): Administração (equipe) ou Revisão médica (revisor), Meu Plano, Conta. */
export function configItems(info = {}) {
  const out = [];
  if (info.isStaff) out.push(["admin", "users", "Administração"]);
  else if (info.isReviewer) out.push(["admin", "stamp", "Revisão médica"]);
  out.push(["planos", "crown", "Meu Plano"]);
  return out;
}

/** Abas da barra de baixo do celular. [rota, ícone, nome, grupo que a deixa acesa]. */
export function mobileTabs(phase) {
  if (phase === 2) return [["home2", "house", "Início", "menu2"], ["estacoes", "clipboard-list", "Estações", null], ["peps", "list-checks", "PEPs", null], ["desempenho2", "chart-column", "Dados", "analise2"], ["paciente", "sparkles", "Paciente IA", "treino2"]];
  return [["home", "house", "Início", "jornada"], ["questoes", "file-question", "Questões", "praticar"], ["flash", "layers", "Revisar", "revisar"], ["tutor", "sparkles", "Tutor", "tutor"]];
}

/** Telas sem menu (tela cheia). */
export const FULL = ["sessao", "estacao"];
