export type EcosystemIllustrationType =
  | "PLANO_DE_HOJE"
  | "QUESTOES_PROVAS"
  | "GRANDES_TEMAS"
  | "REVISOES_FLASHCARDS"
  | "ATUALIZACOES_DIRETRIZES"
  | "MATERIAIS_OFICIAIS";

export interface EcosystemFeatureItem {
  id: string;
  stepNumber: number;
  title: string;
  badgeLabel: string;
  description: string;
  illustrationType: EcosystemIllustrationType;
}

export const ECOSYSTEM_FEATURES: readonly EcosystemFeatureItem[] = [
  {
    id: "plano-de-hoje",
    stepNumber: 1,
    title: "PLANO DE HOJE",
    badgeLabel: "01 — Plano de Hoje",
    description: "Veja o que estudar, praticar e revisar agora.",
    illustrationType: "PLANO_DE_HOJE",
  },
  {
    id: "questoes-e-provas",
    stepNumber: 2,
    title: "QUESTÕES E PROVAS",
    badgeLabel: "02 — Questões e Provas",
    description: "Pratique com questões, simulados e provas completas.",
    illustrationType: "QUESTOES_PROVAS",
  },
  {
    id: "grandes-temas",
    stepNumber: 3,
    title: "GRANDES TEMAS",
    badgeLabel: "03 — Grandes Temas",
    description: "Revise os principais temas organizados pelas grandes áreas.",
    illustrationType: "GRANDES_TEMAS",
  },
  {
    id: "revisoes-e-flashcards",
    stepNumber: 4,
    title: "REVISÕES E FLASHCARDS",
    badgeLabel: "04 — Revisões e Flashcards",
    description: "Retome conteúdos no momento certo com revisão espaçada.",
    illustrationType: "REVISOES_FLASHCARDS",
  },
  {
    id: "atualizacoes-e-diretrizes",
    stepNumber: 5,
    title: "ATUALIZAÇÕES & DIRETRIZES",
    badgeLabel: "05 — Atualizações & Diretrizes",
    description: "Acompanhe mudanças relevantes de protocolos e condutas.",
    illustrationType: "ATUALIZACOES_DIRETRIZES",
  },
  {
    id: "materiais-oficiais",
    stepNumber: 6,
    title: "MATERIAIS OFICIAIS",
    badgeLabel: "06 — Materiais Oficiais",
    description: "Consulte diretrizes, PCDTs e documentos de fontes oficiais.",
    illustrationType: "MATERIAIS_OFICIAIS",
  },
] as const;
