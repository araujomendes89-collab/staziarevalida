import { NavTab } from "../context/AppContext";

/**
 * Canonical URL path for each NavTab
 */
export const TAB_TO_PATH: Record<NavTab, string> = {
  // Início
  home: "/",

  // Estudar
  estudar: "/estudar",
  "estudar-plano-hoje": "/estudar/plano-de-hoje",
  "estudar-aulas": "/estudar/aulas",
  "estudar-grandes-temas": "/estudar/grandes-temas",
  "estudar-materiais": "/estudar/materiais",

  // Praticar
  praticar: "/praticar",
  "praticar-questoes": "/praticar/questoes",
  "praticar-simulados": "/praticar/simulados",
  "praticar-provas": "/praticar/provas-completas",
  "praticar-questoes-ia": "/praticar/questoes-ia",

  // Revisar
  revisar: "/revisar",
  "revisar-flashcards": "/revisar/flashcards",
  "revisar-erros": "/revisar/erros",
  "revisar-atualizacoes": "/revisar/atualizacoes",
  "revisar-radar": "/revisar/radar",
  "revisar-audio": "/revisar/audio",

  // Planejamento
  planejamento: "/planejamento",
  "planejamento-calendario": "/planejamento/calendario",
  "planejamento-semanal": "/planejamento/semanal",
  "planejamento-ate-prova": "/planejamento/ate-prova",
  "planejamento-disponibilidade": "/planejamento/disponibilidade",
  "planejamento-replanejamento": "/planejamento/replanejamento",

  // Desempenho
  desempenho: "/desempenho",
  "desempenho-geral": "/desempenho/geral",
  "desempenho-evolucao": "/desempenho/evolucao",
  "desempenho-matriz": "/desempenho/matriz",
  "desempenho-tendencias": "/desempenho/tendencias",
  "desempenho-areas": "/desempenho/areas",

  // Tutor IA
  "tutor-ia": "/tutor",
  "tutor-conversar": "/tutor/conversar",
  "tutor-transito": "/tutor/transito",
  "tutor-historico": "/tutor/historico",

  // Outros módulos
  profile: "/perfil",
  settings: "/perfil",
  admin: "/admin",
  export: "/export",
  inventory: "/export",
  subscription: "/planos",
  osce: "/osce",
  "student-memory": "/memoria",
  agent: "/agente",

  // Legacy aliases
  "calendario-inteligente": "/planejamento/calendario",
  "questoes-ia": "/praticar/questoes-ia",
  "grandes-temas": "/estudar/grandes-temas",
  questions: "/questoes",
  "voice-tutor": "/tutor/conversar",
  review: "/revisar/flashcards",
  progress: "/desempenho/geral",
  calendar: "/planejamento/calendario",
  "pattern-engine": "/desempenho/tendencias",
  ineditas: "/praticar/simulados",
  guidelines: "/revisar/radar",
  errors: "/revisar/erros",
  radar: "/revisar/radar",
  matrix: "/desempenho/matriz",
  brazil: "/estudar/materiais",
  "official-search": "/estudar/materiais",
};

/**
 * Path-to-NavTab dictionary including shortcuts, direct paths, and legacy aliases
 */
const PATH_TO_TAB_MAP: Record<string, NavTab> = {
  "/": "home",
  "/inicio": "home",
  "/home": "home",

  // Estudar
  "/estudar": "estudar",
  "/estudar/plano-hoje": "estudar-plano-hoje",
  "/estudar/plano-de-hoje": "estudar-plano-hoje",
  "/plano-hoje": "estudar-plano-hoje",
  "/plano-de-hoje": "estudar-plano-hoje",
  "/estudar/aulas": "estudar-aulas",
  "/aulas": "estudar-aulas",
  "/estudar/grandes-temas": "estudar-grandes-temas",
  "/grandes-temas": "estudar-grandes-temas",
  "/temas": "estudar-grandes-temas",
  "/estudar/materiais": "estudar-materiais",
  "/materiais": "estudar-materiais",

  // Praticar
  "/praticar": "praticar",
  "/praticar/questoes": "praticar-questoes",
  "/questoes": "praticar-questoes",
  "/questions": "praticar-questoes",
  "/praticar/simulados": "praticar-simulados",
  "/simulados": "praticar-simulados",
  "/praticar/provas": "praticar-provas",
  "/praticar/provas-completas": "praticar-provas",
  "/provas": "praticar-provas",
  "/provas-completas": "praticar-provas",
  "/praticar/questoes-ia": "praticar-questoes-ia",
  "/questoes-ia": "praticar-questoes-ia",
  "/ineditas": "praticar-simulados",

  // Revisar
  "/revisar": "revisar",
  "/revisar/flashcards": "revisar-flashcards",
  "/flashcards": "revisar-flashcards",
  "/revisar/erros": "revisar-erros",
  "/erros": "revisar-erros",
  "/caderno-de-erros": "revisar-erros",
  "/revisar/atualizacoes": "revisar-atualizacoes",
  "/atualizacoes": "revisar-atualizacoes",
  "/revisar/radar": "revisar-radar",
  "/radar": "revisar-radar",
  "/guidelines": "revisar-radar",
  "/revisar/audio": "revisar-audio",
  "/flash-audio": "revisar-audio",
  "/audio": "revisar-audio",

  // Planejamento
  "/planejamento": "planejamento",
  "/planejamento/calendario": "planejamento-calendario",
  "/calendario": "planejamento-calendario",
  "/calendario-inteligente": "planejamento-calendario",
  "/planejamento/semanal": "planejamento-semanal",
  "/plano-semanal": "planejamento-semanal",
  "/planejamento/ate-prova": "planejamento-ate-prova",
  "/plano-ate-a-prova": "planejamento-ate-prova",
  "/planejamento/disponibilidade": "planejamento-disponibilidade",
  "/disponibilidade": "planejamento-disponibilidade",
  "/planejamento/replanejamento": "planejamento-replanejamento",
  "/replanejamento": "planejamento-replanejamento",

  // Desempenho
  "/desempenho": "desempenho",
  "/desempenho/geral": "desempenho-geral",
  "/desempenho/evolucao": "desempenho-evolucao",
  "/evolucao": "desempenho-evolucao",
  "/desempenho/matriz": "desempenho-matriz",
  "/matriz": "desempenho-matriz",
  "/desempenho/tendencias": "desempenho-tendencias",
  "/tendencias": "desempenho-tendencias",
  "/desempenho/areas": "desempenho-areas",

  // Tutor IA
  "/tutor": "tutor-ia",
  "/tutor-ia": "tutor-ia",
  "/tutor/conversar": "tutor-conversar",
  "/tutor/transito": "tutor-transito",
  "/tutor/historico": "tutor-historico",

  // Outros módulos
  "/perfil": "profile",
  "/profile": "profile",
  "/ajustes": "profile",
  "/configuracoes": "profile",
  "/admin": "admin",
  "/administracao": "admin",
  "/export": "export",
  "/exportar": "export",
  "/inventario": "export",
  "/planos": "subscription",
  "/precos": "subscription",
  "/subscription": "subscription",
  "/assinatura": "subscription",
  "/osce": "osce",
  "/memoria": "student-memory",
  "/student-memory": "student-memory",
  "/agente": "agent",
  "/agent": "agent",
};

/**
 * Returns the canonical URL path for a given NavTab.
 */
export function tabToPath(tab: NavTab): string {
  return TAB_TO_PATH[tab] || "/";
}

/**
 * Maps any URL path into a valid NavTab.
 */
export function pathToTab(pathname: string): NavTab {
  const cleanPath = pathname.toLowerCase().trim().replace(/\/+$/, "") || "/";
  if (PATH_TO_TAB_MAP[cleanPath]) {
    return PATH_TO_TAB_MAP[cleanPath];
  }
  // Try matching prefix if deeper route
  for (const [key, tab] of Object.entries(PATH_TO_TAB_MAP)) {
    if (key !== "/" && cleanPath.startsWith(key)) {
      return tab;
    }
  }
  return "home";
}

/**
 * Dynamic document title based on the active NavTab.
 */
export function tabToTitle(tab: NavTab): string {
  switch (tab) {
    case "home":
      return "StaziaMed Revalida | Início";
    case "praticar-questoes":
    case "questions":
      return "StaziaMed Revalida | Questões";
    case "praticar-simulados":
    case "ineditas":
      return "StaziaMed Revalida | Simulados";
    case "praticar-provas":
      return "StaziaMed Revalida | Provas Completas";
    case "praticar-questoes-ia":
    case "questoes-ia":
      return "StaziaMed Revalida | Questões por IA";
    case "praticar":
      return "StaziaMed Revalida | Praticar";
    case "estudar":
      return "StaziaMed Revalida | Estudar";
    case "estudar-plano-hoje":
      return "StaziaMed Revalida | Plano de Hoje";
    case "estudar-aulas":
      return "StaziaMed Revalida | Videoaulas";
    case "estudar-grandes-temas":
    case "grandes-temas":
      return "StaziaMed Revalida | Grandes Temas";
    case "estudar-materiais":
    case "official-search":
      return "StaziaMed Revalida | Materiais Oficiais";
    case "revisar":
      return "StaziaMed Revalida | Revisar";
    case "revisar-flashcards":
    case "review":
      return "StaziaMed Revalida | Flashcards";
    case "revisar-erros":
    case "errors":
      return "StaziaMed Revalida | Caderno de Erros";
    case "revisar-atualizacoes":
      return "StaziaMed Revalida | Atualizações 2026";
    case "revisar-radar":
    case "radar":
    case "guidelines":
      return "StaziaMed Revalida | Radar de Diretrizes";
    case "revisar-audio":
      return "StaziaMed Revalida | Flash-Audio";
    case "planejamento":
      return "StaziaMed Revalida | Planejamento";
    case "planejamento-calendario":
    case "calendario-inteligente":
    case "calendar":
      return "StaziaMed Revalida | Calendário Inteligente";
    case "planejamento-semanal":
      return "StaziaMed Revalida | Plano Semanal";
    case "planejamento-ate-prova":
      return "StaziaMed Revalida | Plano Até a Prova";
    case "planejamento-disponibilidade":
      return "StaziaMed Revalida | Disponibilidade de Estudo";
    case "planejamento-replanejamento":
      return "StaziaMed Revalida | Replanejamento";
    case "desempenho":
      return "StaziaMed Revalida | Desempenho";
    case "desempenho-geral":
    case "progress":
      return "StaziaMed Revalida | Visão Geral de Desempenho";
    case "desempenho-evolucao":
      return "StaziaMed Revalida | Evolução";
    case "desempenho-matriz":
    case "matrix":
      return "StaziaMed Revalida | Matriz de Competências";
    case "desempenho-tendencias":
    case "pattern-engine":
      return "StaziaMed Revalida | Tendências INEP";
    case "desempenho-areas":
      return "StaziaMed Revalida | Desempenho por Área";
    case "tutor-ia":
      return "StaziaMed Revalida | Tutor IA";
    case "tutor-conversar":
    case "voice-tutor":
      return "StaziaMed Revalida | Conversar com Tutor IA";
    case "tutor-transito":
      return "StaziaMed Revalida | Modo Trânsito";
    case "tutor-historico":
      return "StaziaMed Revalida | Histórico de Dúvidas";
    case "profile":
    case "settings":
      return "StaziaMed Revalida | Meu Perfil";
    case "admin":
      return "StaziaMed Revalida | Administração";
    case "export":
    case "inventory":
      return "StaziaMed Revalida | Inventário & Exportação";
    case "subscription":
      return "StaziaMed Revalida | Planos & Assinatura";
    case "osce":
      return "StaziaMed Revalida | Estações Clínicas OSCE";
    case "student-memory":
      return "StaziaMed Revalida | Memória Cognitiva";
    case "agent":
      return "StaziaMed Revalida | Agente Autônomo";
    default:
      return "StaziaMed Revalida";
  }
}
