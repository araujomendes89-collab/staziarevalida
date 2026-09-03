import {
  Home,
  BookOpen,
  HelpCircle,
  FileText,
  Tv,
  Target,
  FolderOpen,
  Brain,
  Layers,
  BookMarked,
  Flame,
  Calendar,
  CalendarCheck,
  TrendingUp,
  BarChart2,
  Mic,
  MessageSquare,
} from "lucide-react";
import { NavTab } from "../context/AppContext";

export interface SubNavigationItem {
  id: NavTab;
  label: string;
  icon?: any;
  badgeKey?: string;
}

export interface NavigationSection {
  id: NavTab;
  label: string;
  icon: any;
  badgeKey?: string;
  subItems?: SubNavigationItem[];
}

/**
 * Centralized navigation definition for the student sidebar.
 * Strictly presents the reorganized information architecture (Etapa 1.1).
 */
export const STUDENT_NAVIGATION_CONFIG: NavigationSection[] = [
  {
    id: "home",
    label: "Início",
    icon: Home,
  },
  {
    id: "estudar",
    label: "Estudar",
    icon: BookOpen,
    subItems: [
      { id: "estudar-plano-hoje", label: "Plano de hoje", icon: CalendarCheck },
      { id: "estudar-aulas", label: "Aulas", icon: Tv },
      { id: "estudar-grandes-temas", label: "Grandes Temas", icon: Target },
      { id: "estudar-materiais", label: "Materiais oficiais", icon: FolderOpen },
    ],
  },
  {
    id: "praticar",
    label: "Praticar",
    icon: HelpCircle,
    subItems: [
      { id: "praticar-questoes", label: "Questões", icon: HelpCircle },
      { id: "praticar-simulados", label: "Simulados", icon: FileText },
      { id: "praticar-provas", label: "Provas completas", icon: FileText },
      { id: "praticar-questoes-ia", label: "Questões por IA", icon: Brain },
    ],
  },
  {
    id: "revisar",
    label: "Revisar",
    icon: Layers,
    badgeKey: "dueFlashcards",
    subItems: [
      { id: "revisar-erros", label: "Caderno de erros", icon: BookMarked },
      { id: "revisar-flashcards", label: "Flashcards", icon: Layers, badgeKey: "dueFlashcards" },
      { id: "revisar-atualizacoes", label: "Atualizações & Diretrizes", icon: Flame },
    ],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    icon: Calendar,
    subItems: [
      { id: "planejamento-calendario", label: "Calendário", icon: Calendar },
      { id: "planejamento-semanal", label: "Plano semanal", icon: CalendarCheck },
      { id: "planejamento-ate-prova", label: "Até a prova", icon: TrendingUp },
    ],
  },
  {
    id: "desempenho",
    label: "Desempenho",
    icon: BarChart2,
    subItems: [
      { id: "desempenho-geral", label: "Visão geral", icon: BarChart2 },
      { id: "desempenho-areas", label: "Por área", icon: Layers },
      { id: "desempenho-evolucao", label: "Evolução", icon: TrendingUp },
    ],
  },
  {
    id: "tutor-ia",
    label: "Tutor IA",
    icon: Mic,
    subItems: [
      { id: "tutor-conversar", label: "Conversar", icon: MessageSquare },
    ],
  },
];
