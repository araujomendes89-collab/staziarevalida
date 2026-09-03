import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  LogOut,
  SlidersHorizontal,
  Database,
  Crown,
  Activity,
  User,
  Settings,
  Bell,
} from "lucide-react";
import { useApp, NavTab } from "../../context/AppContext";
import { STUDENT_NAVIGATION_CONFIG, NavigationSection, SubNavigationItem } from "../../config/navigation";

export const Sidebar: React.FC<{ onCloseMobile?: () => void }> = ({ onCloseMobile }) => {
  const {
    activeTab,
    setActiveTab,
    user,
    firebaseUser,
    flashcards,
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

  // Helper to determine if section or any of its subItems is currently active
  const isSectionActive = (section: NavigationSection): boolean => {
    if (activeTab === section.id) return true;
    if (section.subItems) {
      return section.subItems.some((sub) => isSubItemActive(sub.id));
    }
    return false;
  };

  const isSubItemActive = (subId: NavTab): boolean => {
    if (activeTab === subId) return true;
    // Estudar aliases
    if (subId === "estudar-grandes-temas" && activeTab === "grandes-temas") return true;
    if (subId === "estudar-materiais" && (activeTab === "official-search" || activeTab === "brazil")) return true;
    // Praticar aliases
    if (subId === "praticar-questoes" && activeTab === "questions") return true;
    if (subId === "praticar-simulados" && activeTab === "ineditas") return true;
    if (subId === "praticar-provas" && (activeTab === "provas" || activeTab === "provas-completas")) return true;
    if (subId === "praticar-questoes-ia" && activeTab === "questoes-ia") return true;
    // Revisar aliases
    if (subId === "revisar-flashcards" && activeTab === "review") return true;
    if (subId === "revisar-erros" && (activeTab === "errors" || activeTab === "caderno-de-erros")) return true;
    if (subId === "revisar-atualizacoes" && (activeTab === "guidelines" || activeTab === "radar" || activeTab === "revisar-radar")) return true;
    // Planejamento aliases
    if (subId === "planejamento-calendario" && (activeTab === "calendario-inteligente" || activeTab === "calendar")) return true;
    // Desempenho aliases
    if (subId === "desempenho-geral" && activeTab === "progress") return true;
    if (subId === "desempenho-evolucao" && activeTab === "evolucao") return true;
    if (subId === "desempenho-areas" && activeTab === "desempenho-areas") return true;
    // Tutor aliases
    if (subId === "tutor-conversar" && activeTab === "voice-tutor") return true;
    return false;
  };

  // Find initial active section for single accordion state
  const getActiveSectionId = (): string | null => {
    for (const section of STUDENT_NAVIGATION_CONFIG) {
      if (section.subItems && isSectionActive(section)) {
        return section.id;
      }
    }
    return null;
  };

  // Single active accordion state: only ONE section can remain expanded at a time
  const [expandedSection, setExpandedSection] = useState<string | null>(getActiveSectionId() || "estudar");

  // Synchronize expanded accordion with active route/tab
  useEffect(() => {
    const currentActiveSecId = getActiveSectionId();
    if (currentActiveSecId) {
      setExpandedSection(currentActiveSecId);
    }
  }, [activeTab]);

  const toggleSection = (sectionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSection((prev) => (prev === sectionId ? null : sectionId));
  };

  const handleSelectSection = (section: NavigationSection) => {
    if (section.id === "home") {
      setActiveTab("home");
      setExpandedSection(null);
    } else {
      setActiveTab(section.id);
      // Ensure only this section is expanded
      setExpandedSection(section.id);
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

  const resolveBadge = (badgeKey?: string): string | undefined => {
    if (badgeKey === "dueFlashcards" && dueFlashcardsCount > 0) {
      return `${dueFlashcardsCount}`;
    }
    return undefined;
  };

  return (
    <aside className="w-64 bg-[#0B192C] text-slate-300 flex flex-col h-full lg:min-h-screen select-none border-r border-[#132644] transition-all">
      {/* Brand Header */}
      <div className="p-5 pb-4 flex items-center gap-3 border-b border-[#142847]/70">
        <button
          onClick={() => {
            setActiveTab("home");
            setExpandedSection(null);
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

      {/* Navigation List (7 Main Areas with Single-Open Accordion) */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-700/50">
        {STUDENT_NAVIGATION_CONFIG.map((section) => {
          const Icon = section.icon;
          const isSectionOpen = expandedSection === section.id;
          const hasActiveChild = isSectionActive(section);
          const hasSubItems = section.subItems && section.subItems.length > 0;
          const sectionBadge = resolveBadge(section.badgeKey);

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
                  {sectionBadge && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold bg-teal-500/20 text-teal-300">
                      {sectionBadge}
                    </span>
                  )}
                  {hasSubItems && (
                    <button
                      type="button"
                      onClick={(e) => toggleSection(section.id, e)}
                      className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      aria-label={`Alternar seção ${section.label}`}
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

              {/* Sub-Items List (Single Accordion Expanded) */}
              {hasSubItems && isSectionOpen && (
                <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-white/[0.08] ml-4 my-0.5">
                  {section.subItems?.map((sub: SubNavigationItem) => {
                    const isSubActive = isSubItemActive(sub.id);
                    const SubIcon = sub.icon;
                    const subBadge = resolveBadge(sub.badgeKey);

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
                        {subBadge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-purple-500/20 text-purple-300">
                            {subBadge}
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
