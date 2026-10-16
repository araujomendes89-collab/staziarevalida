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

/**
 * Selos reais (nunca inventados), como no pacote: Plano de Hoje "feitas/total", Missões "feitas/total" (cinza), Caderno de Erros
 * com as questões erradas para revisar (vermelho), Administração com os avisos graves do Radar (vermelho). Os números vêm de
 * useShellCounts (banco) e de info; sem número, sem selo. Flashcards não tem selo no pacote (a contagem segue na tela de Flashcards).
 */
export function badgeOf(id, info = {}) {
  if (id === "hoje") return info.planTotal ? `${info.planDone ?? 0}/${info.planTotal}` : null;
  if (id === "missoes") return info.missionsTotal ? `${info.missionsDone ?? 0}/${info.missionsTotal}` : null;
  if (id === "erros") return info.wrongPending || null;
  if (id === "admin") return info.radarGraves || null;
  return null;
}
/** Tom do selo: "danger" (vermelho: pendências) ou "neutral" (cinza: progresso do dia). */
export function badgeKind(id) {
  return id === "erros" || id === "admin" ? "danger" : "neutral";
}
/** Selo do grupo fechado (pacote: o primeiro item do grupo que tem selo) ou "IA" no Tutor. {text, kind} ou null. */
export function groupBadge(group, info) {
  if (group.badgeText) return { text: group.badgeText, kind: "ai" };
  for (const [id] of group.items) {
    const text = badgeOf(id, info);
    if (text != null) return { text, kind: badgeKind(id) };
  }
  return null;
}

/** Itens de "Configurações" (fim do menu): Administração (equipe) ou Revisão médica (revisor), Meu Plano, Conta. */
export function configItems(info = {}) {
  const out = [];
  if (info.isStaff) out.push(["admin", "users", "Administração"]);
  else if (info.isReviewer) out.push(["admin", "stamp", "Revisão médica"]);
  out.push(["planos", "crown", "Meu Plano"]);
  return out;
}

/** Abas da barra de baixo do celular. [rota, ícone, nome, grupo que a deixa acesa, rota cujo selo a aba mostra]. */
export function mobileTabs(phase) {
  if (phase === 2) return [["home2", "house", "Início", "menu2"], ["estacoes", "clipboard-list", "Estações", null], ["peps", "list-checks", "PEPs", null], ["desempenho2", "chart-column", "Dados", "analise2"], ["paciente", "sparkles", "Paciente IA", "treino2"]];
  // pacote (HomeMobileCompact): Início, Questões, Tutor (botão redondo roxo no meio), Revisar, Mais. O selo do Revisar é o do Caderno de Erros.
  return [["home", "house", "Início", "jornada"], ["questoes", "file-question", "Questões", "praticar"], ["tutor", "sparkles", "Tutor", "tutor"], ["flash", "layers", "Revisar", "revisar", "erros"]];
}

/** Telas sem menu (tela cheia). */
export const FULL = ["sessao", "estacao"];

/**
 * Seções da página "Mais" (celular e tablet), no desenho do pacote: Estudar, Aprender, Stazia Arena, Minha evolução.
 * Cada item: [rota, ícone, nome, selo-chave]; o selo-chave ("hoje", "missoes", "flash") diz qual contagem real mostrar (ou nenhuma).
 * "Aulas" só entra quando o app já a mostra ao aluno (ou para a equipe); o que o pacote não põe em tela (Banco de Questões, Flashcards
 * e Caderno de Erros, que ficam nas abas) vai numa seção a mais para nada ficar sem caminho. 2ª fase: os grupos do próprio menu.
 */
export function maisSections(phase, { staff = false } = {}) {
  if (phase === 2) return groupsOf(2, { staff }).map((g) => ({ id: g.id, label: g.label, tone: "estudar", items: g.items.map(([id, ic, l]) => [id, ic, l, null]) }));
  const aulas = aulasParaAluno() || staff;
  return [
    { id: "estudar", label: "Estudar", tone: "estudar", items: [["hoje", "list-checks", "Plano de Hoje", "hoje"], ["trilha", "route", "Minha Trilha", null], ["simulados", "timer", "Simulados", null]] },
    {
      id: "aprender",
      label: "Aprender",
      tone: "aprender",
      items: [...(aulas ? [["aulas", "tv", "Aulas", null]] : []), ["temas", "book-open", "Temas Essenciais", null], ["atualizacoes", "newspaper", "Diretrizes e Atualizações", null], ["mapas", "network", "Mapas Mentais", null]],
    },
    { id: "arena", label: "Stazia Arena", tone: "arena", items: [["missoes", "target", "Missões", "missoes"], ["classificacao", "trophy", "Ranking", null], ["conquistas", "award", "Conquistas", null]] },
    { id: "evolucao", label: "Minha evolução", tone: "evolucao", items: [["desempenho", "chart-column", "Desempenho", null], ["analise", "chart-pie", "Análise Inteligente", null], ["plano", "calendar-days", "Planejamento", null]] },
    { id: "praticar", label: "Praticar e revisar", tone: "estudar", items: [["questoes", "file-question", "Banco de Questões", null], ["flash", "layers", "Flashcards", "flash"], ["erros", "notebook-pen", "Caderno de Erros", null]] },
  ];
}

/**
 * Seções da folha "Mais" do celular (pacote MobileMais): Jornada e prática, Aprender, Stazia Arena, Minha evolução e Configurações.
 * Cada item: [rota, ícone, nome]; "prefs" abre Preferências dentro da folha. Configurações: Administração só para a equipe,
 * Revisão médica só para revisor, Meu Plano e Preferências para todos. Sem "Buscar no app" (decisão do dono).
 * Banco de Questões, Flashcards e Caderno de Erros ficam nas abas Questões e Revisar, como no pacote.
 */
export function maisSheetSections(phase, info = {}) {
  const cfg = [...configItems(info).filter(([id]) => id === "admin"), ["planos", "crown", "Meu Plano"], ["prefs", "settings", "Preferências"]];
  if (phase === 2) return [...groupsOf(2, { staff: info.isStaff }).map((g) => ({ id: g.id, label: g.label, items: g.items })), { id: "config", label: "Configurações", items: cfg }];
  const aulas = aulasParaAluno() || info.isStaff;
  return [
    { id: "jornada", label: "Jornada e prática", items: [["hoje", "list-checks", "Plano de Hoje"], ["trilha", "route", "Minha Trilha"], ["simulados", "timer", "Simulados"]] },
    { id: "aprender", label: "Aprender", items: [...(aulas ? [["aulas", "tv", "Aulas"]] : []), ["temas", "book-open", "Temas Essenciais"], ["atualizacoes", "newspaper", "Diretrizes e Atualizações"], ["mapas", "network", "Mapas Mentais"]] },
    { id: "arena", label: "Stazia Arena", items: [["missoes", "target", "Missões"], ["classificacao", "trophy", "Ranking"], ["conquistas", "award", "Conquistas"]] },
    { id: "evolucao", label: "Minha evolução", items: [["desempenho", "chart-column", "Desempenho"], ["analise", "chart-pie", "Análise Inteligente"], ["plano", "calendar-days", "Planejamento"]] },
    { id: "config", label: "Configurações", items: cfg },
  ];
}
