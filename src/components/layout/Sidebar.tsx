import React, { useState, useEffect } from "react";
import {
  Home,
  BookOpen,
  HelpCircle,
  FileText,
  Tv,
  Layers,
  Target,
  Calendar,
  BarChart2,
  BookMarked,
  FolderOpen,
  Brain,
  Mic,
  Activity,
  SlidersHorizontal,
  Database,
  Crown,
  ChevronRight,
  ChevronDown,
  LogOut,
  Sparkles,
  CalendarCheck,
  TrendingUp,
  Clock,
  RotateCcw,
  Compass,
  PieChart,
  Car,
  History,
  ShieldAlert,
  Flame,
  Volume2,
  User,
  Settings,
  Bell,
} from "lucide-react";
import { useApp, NavTab } from "../../context/AppContext";

interface SubNavItem {
  id: NavTab;
  label: string;
  badge?: string;
  icon?: React.ElementType;
}

interface NavSection {
  id: NavTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
  subItems?: SubNavItem[];
}

export const Sidebar: React.FC<{ onCloseMobile?: () => void }> = ({ onCloseMobile }) => {
  const {
    activeTab,
    setActiveTab,
    user,
    firebaseUser,
    flashcards,
    setIsExamConfigOpen,
    setIsSubscriptionModalOpen,
    setQuestionMode,
    logout,
  } = useApp();

  const dueFlashcardsCount = (flashcards || []).filter(
    (f) => new Date(f.dueDate) <= new Date()
  ).length;

  const rawName = user?.name || "Doutor(a)";
  const userName = rawName.replace("Dr. ", "").replace("Dra. ", "");
  const userInitial = userName.charAt(0).toUpperCase() || "D";

  // Manage open state for collapsible parent sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    estudar: true,
    praticar: true,
    revisar: false,
    planejamento: false,
    desempenho: false,
    "tutor-ia": false,
  });

  const toggleSection = (sectionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  // The 7 Official Navigation Areas
  const navSections: NavSection[] = [
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
      badge: dueFlashcardsCount > 0 ? `${dueFlashcardsCount}` : undefined,
      subItems: [
        { id: "revisar-flashcards", label: "Flashcards", icon: Layers, badge: dueFlashcardsCount > 0 ? `${dueFlashcardsCount}` : undefined },
        { id: "revisar-erros", label: "Caderno de erros", icon: BookMarked },
        { id: "revisar-atualizacoes", label: "Atualizações", icon: Flame },
        { id: "revisar-radar", label: "Radar de diretrizes", icon: ShieldAlert },
        { id: "revisar-audio", label: "Flash-Audio", icon: Volume2 },
      ],
    },
    {
      id: "planejamento",
      label: "Planejamento",
      icon: Calendar,
      subItems: [
        { id: "planejamento-calendario", label: "Calendário", icon: Calendar },
        { id: "planejamento-semanal", label: "Plano semanal", icon: CalendarCheck },
        { id: "planejamento-ate-prova", label: "Plano até a prova", icon: TrendingUp },
        { id: "planejamento-disponibilidade", label: "Disponibilidade", icon: Clock },
        { id: "planejamento-replanejamento", label: "Replanejamento", icon: RotateCcw },
      ],
    },
    {
      id: "desempenho",
      label: "Desempenho",
      icon: BarChart2,
      subItems: [
        { id: "desempenho-geral", label: "Visão geral", icon: BarChart2 },
        { id: "desempenho-evolucao", label: "Evolução", icon: TrendingUp },
        { id: "desempenho-matriz", label: "Matriz de competências", icon: Compass },
        { id: "desempenho-tendencias", label: "Tendências INEP", icon: PieChart },
        { id: "desempenho-areas", label: "Desempenho por área", icon: Layers },
      ],
    },
    {
      id: "tutor-ia",
      label: "Tutor IA",
      icon: Mic,
      subItems: [
        { id: "tutor-conversar", label: "Conversar com tutor", icon: Mic },
        { id: "tutor-transito", label: "Modo trânsito", icon: Car },
        { id: "tutor-historico", label: "Histórico", icon: History },
      ],
    },
  ];

  // Helper to determine if section or any of its subItems is currently active
  const isSectionActive = (section: NavSection): boolean => {
    if (activeTab === section.id) return true;
    if (section.subItems) {
      return section.subItems.some((sub) => {
        if (activeTab === sub.id) return true;
        // Legacy tab mappings
        if (sub.id === "estudar-aulas" && activeTab === "grandes-temas") return false;
        if (sub.id === "estudar-grandes-temas" && activeTab === "grandes-temas") return true;
        if (sub.id === "estudar-materiais" && activeTab === "official-search") return true;
        if (sub.id === "praticar-questoes" && activeTab === "questions") return true;
        if (sub.id === "praticar-simulados" && activeTab === "ineditas") return true;
        if (sub.id === "praticar-questoes-ia" && activeTab === "questoes-ia") return true;
        if (sub.id === "revisar-flashcards" && activeTab === "review") return true;
        if (sub.id === "revisar-erros" && activeTab === "errors") return true;
        if (sub.id === "revisar-radar" && (activeTab === "guidelines" || activeTab === "radar")) return true;
        if (sub.id === "planejamento-calendario" && (activeTab === "calendario-inteligente" || activeTab === "calendar")) return true;
        if (sub.id === "desempenho-geral" && activeTab === "progress") return true;
        if (sub.id === "desempenho-matriz" && activeTab === "matrix") return true;
        if (sub.id === "desempenho-tendencias" && activeTab === "pattern-engine") return true;
        if (sub.id === "tutor-conversar" && activeTab === "voice-tutor") return true;
        return false;
      });
    }
    return false;
  };

  // Automatically expand section when its child or section is active
  useEffect(() => {
    navSections.forEach((section) => {
      if (section.subItems && isSectionActive(section)) {
        setOpenSections((prev) => ({ ...prev, [section.id]: true }));
      }
    });
  }, [activeTab]);

  const isSubItemActive = (subId: NavTab): boolean => {
    if (activeTab === subId) return true;
    if (subId === "estudar-grandes-temas" && activeTab === "grandes-temas") return true;
    if (subId === "estudar-materiais" && activeTab === "official-search") return true;
    if (subId === "praticar-questoes" && activeTab === "questions") return true;
    if (subId === "praticar-simulados" && activeTab === "ineditas") return true;
    if (subId === "praticar-questoes-ia" && activeTab === "questoes-ia") return true;
    if (subId === "revisar-flashcards" && activeTab === "review") return true;
    if (subId === "revisar-erros" && activeTab === "errors") return true;
    if (subId === "revisar-radar" && (activeTab === "guidelines" || activeTab === "radar")) return true;
    if (subId === "planejamento-calendario" && (activeTab === "calendario-inteligente" || activeTab === "calendar")) return true;
    if (subId === "desempenho-geral" && activeTab === "progress") return true;
    if (subId === "desempenho-matriz" && activeTab === "matrix") return true;
    if (subId === "desempenho-tendencias" && activeTab === "pattern-engine") return true;
    if (subId === "tutor-conversar" && activeTab === "voice-tutor") return true;
    return false;
  };

  const handleSelectSection = (section: NavSection) => {
    if (section.id === "home") {
      setActiveTab("home");
    } else {
      setActiveTab(section.id);
      // Ensure section is expanded
      setOpenSections((prev) => ({ ...prev, [section.id]: true }));
    }
    if (onCloseMobile) onCloseMobile();
  };

  const handleSelectSubItem = (subId: NavTab) => {
    if (subId === "praticar-questoes") {
      setQuestionMode("STUDY");
    } else if (subId === "praticar-simulados") {
      setQuestionMode("EXAM");
    }
    setActiveTab(subId);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside className="w-64 bg-[#0B192C] text-slate-300 flex flex-col h-full lg:min-h-screen select-none border-r border-[#132644] transition-all">
      {/* Brand Header */}
      <div className="p-5 pb-4 flex items-center gap-3 border-b border-[#142847]/70">
        <button
          onClick={() => {
            setActiveTab("home");
            if (onCloseMobile) onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left group min-h-[40px] focus:outline-hidden cursor-pointer"
          id="sidebar-brand-btn"
        >
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Activity className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold tracking-tight text-white text-base">
                Stazia<span className="text-teal-400">Med</span>
              </span>
            </div>
            <span className="text-[9px] font-bold text-teal-400 tracking-widest uppercase block mt-0.5">
              REVALIDA
            </span>
          </div>
        </button>
      </div>

      {/* Navigation List (7 Main Areas) */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-700/50">
        {navSections.map((section) => {
          const Icon = section.icon;
          const isSectionOpen = !!openSections[section.id];
          const hasActiveChild = isSectionActive(section);
          const hasSubItems = section.subItems && section.subItems.length > 0;

          return (
            <div key={section.id} className="space-y-0.5">
              {/* Parent Nav Item Button */}
              <div
                onClick={() => handleSelectSection(section)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                  hasActiveChild && (!hasSubItems || activeTab === section.id)
                    ? "bg-teal-600 text-white shadow-xs"
                    : hasActiveChild
                    ? "bg-white/[0.08] text-white"
                    : "text-slate-300/90 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      hasActiveChild ? "text-teal-300 group-hover:text-white" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span className="truncate">{section.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {section.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold bg-teal-500/20 text-teal-300">
                      {section.badge}
                    </span>
                  )}
                  {hasSubItems && (
                    <button
                      type="button"
                      onClick={(e) => toggleSection(section.id, e)}
                      className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {isSectionOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-Items List */}
              {hasSubItems && isSectionOpen && (
                <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-white/[0.08] ml-4 my-0.5">
                  {section.subItems?.map((sub) => {
                    const isSubActive = isSubItemActive(sub.id);
                    const SubIcon = sub.icon;

                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSelectSubItem(sub.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer text-left ${
                          isSubActive
                            ? "bg-teal-500/20 text-teal-200 font-bold border border-teal-500/30"
                            : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {SubIcon && (
                            <SubIcon className={`w-3 h-3 shrink-0 ${isSubActive ? "text-teal-300" : "text-slate-500"}`} />
                          )}
                          <span className="truncate">{sub.label}</span>
                        </div>
                        {sub.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-purple-500/20 text-purple-300">
                            {sub.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Administration Links (if ADMIN confirmed by server) */}
        {user?.role === "ADMIN" && (
          <div className="pt-3 mt-2 border-t border-[#142847]/70 space-y-1">
            <p className="px-3 text-[10px] font-bold tracking-wider text-teal-400 uppercase">
              Administração do Sistema
            </p>
            <button
              id="nav-admin-panel"
              onClick={() => {
                setActiveTab("admin");
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                activeTab === "admin"
                  ? "bg-teal-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0" />
              <span>Painel de Administração</span>
            </button>
            <button
              id="nav-export-panel"
              onClick={() => {
                setActiveTab("export");
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                activeTab === "export"
                  ? "bg-teal-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <span>Inventário de Provas</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Area: Perfil & Configurações Footer */}
      <div className="p-3 pt-2 space-y-2 border-t border-[#142847]/70 bg-[#091526]">
        {/* Seja Premium Banner */}
        <div className="p-3 rounded-2xl bg-[#0F223D] border border-teal-500/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-white">StaziaMed Pro</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSubscriptionModalOpen(true)}
              className="text-[10px] text-teal-300 hover:underline font-bold"
            >
              Planos →
            </button>
          </div>
        </div>

        {/* User Account Controls */}
        <div className="p-2 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
          {/* User Profile Bar - Clickable to open Profile */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("profile");
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-between p-1.5 text-left rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt="Avatar"
                  className="w-7 h-7 rounded-full object-cover border border-slate-600 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {userInitial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {userName}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{firebaseUser?.email || "Meu Perfil"}</p>
              </div>
            </div>
            <span className="text-[10px] text-teal-400 font-semibold shrink-0">Ver</span>
          </button>

          {/* Quick Profile / Preferences / Logout actions */}
          <div className="grid grid-cols-4 gap-1 pt-1 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => {
                setActiveTab("profile");
                if (onCloseMobile) onCloseMobile();
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-teal-300 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[9px]"
              title="Minha Conta"
            >
              <User className="w-3.5 h-3.5" />
              <span>Conta</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("profile");
                if (onCloseMobile) onCloseMobile();
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-teal-300 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[9px]"
              title="Preferências"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Ajustes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("profile");
                if (onCloseMobile) onCloseMobile();
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-teal-300 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[9px]"
              title="Notificações"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Alertas</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await logout();
                } catch (e) {
                  console.error("Logout error", e);
                }
              }}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[9px]"
              title="Sair da Conta"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
