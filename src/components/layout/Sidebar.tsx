import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  LogOut,
  SlidersHorizontal,
  Database,
  Crown,
  User,
  Settings,
  Bell,
  ShieldCheck,
  BookOpen,
  Palette,
  Lock,
  Sparkles,
} from "lucide-react";
import { useApp, NavTab } from "../../context/AppContext";
import { STUDENT_NAVIGATION_CONFIG, NavigationSection, SubNavigationItem } from "../../config/navigation";
import { SpacedRepetitionService } from "../../services/spacedRepetitionService";
import { queueProfileNavigation } from "../../utils/profileNavigation";
import { useEntitlements } from "../../hooks/useEntitlements";
import { FeatureCode } from "../../services/entitlementsClient";

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
    isDeveloperAdmin,
  } = useApp();

  const dueFlashcardsCount = SpacedRepetitionService.getDueFlashcards(flashcards || []).length;

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
    if (subId === "praticar-checklists" && (activeTab === "praticar-checklists" || activeTab === "osce" || activeTab === "checklists")) return true;
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

  // In Admin Master mode, student sections can be collapsed or toggled as inspection mode
  const [studentPreviewExpanded, setStudentPreviewExpanded] = useState<boolean>(false);

  // Synchronize expanded accordion with active route/tab
  useEffect(() => {
    const currentActiveSecId = getActiveSectionId();
    if (currentActiveSecId) {
      setExpandedSection(currentActiveSecId);
      // Auto-expand student preview if an academic route is directly opened
      if (isDeveloperAdmin) {
        setStudentPreviewExpanded(true);
      }
    }
  }, [activeTab, isDeveloperAdmin]);

  const toggleSection = (sectionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSection((prev) => (prev === sectionId ? null : sectionId));
  };

  const openAccountSettings = () => {
    queueProfileNavigation({ section: "account" });
    setActiveTab("profile");
    if (onCloseMobile) onCloseMobile();
  };

  const openAppSettings = (focus?: "alerts") => {
    queueProfileNavigation({ section: focus === "alerts" ? "alerts" : "app", focus });
    setActiveTab("settings");
    if (onCloseMobile) onCloseMobile();
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

  const {
    plan,
    isTrial,
    isExpired,
    trialDaysRemaining,
    canUse,
    getFeatureDetails,
  } = useEntitlements();

  // Map subId to feature requirement
  const getSubItemFeatureRequirement = (subId: NavTab): { feature?: FeatureCode; requiredPlan?: "pro" | "elite"; isLocked: boolean } => {
    let feature: FeatureCode | undefined;
    if (subId === "praticar-simulados") feature = "simulations";
    else if (subId === "praticar-provas") feature = "full_exams";
    else if (subId === "praticar-questoes-ia") feature = "ai_question_generation";
    else if (subId === "estudar-grandes-temas") feature = "great_topics";
    else if (subId === "planejamento-calendario") feature = "smart_schedule";
    else if (subId === "planejamento-semanal") feature = "daily_adaptive_plan";
    else if (subId === "planejamento-ate-prova") feature = "final_review";
    else if (subId === "desempenho-areas") feature = "revalida_dna";
    else if (subId === "desempenho-evolucao") feature = "weakness_map";
    else if (subId === "tutor-conversar") feature = "ai_coach";

    if (!feature) return { isLocked: false };

    const details = getFeatureDetails(feature);
    const hasAccess = canUse(feature);
    return {
      feature,
      requiredPlan: details.requiredPlan,
      isLocked: !hasAccess,
    };
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
          <img
            src="/brand/horizontal-escuro-320w.png"
            alt="StaziaMed Revalida"
            width={127}
            height={40}
            className="h-10 w-auto shrink-0 group-hover:scale-[1.02] transition-transform"
            draggable={false}
          />
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700/50">
        {/* ============================================================ */}
        {/* 1. MASTER ADMIN NAVIGATION CONTROLS (Top Priority for Admins) */}
        {/* ============================================================ */}
        {isDeveloperAdmin && (
          <div className="space-y-1 pb-3 mb-2 border-b border-[#142847]/80" data-testid="admin-sidebar-section">
            <div className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-500/15 to-emerald-500/10 border border-teal-500/30 flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="text-[10px] font-black tracking-wider text-teal-300 uppercase truncate">
                  Admin Master
                </span>
              </div>
              <span className="text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-teal-500/30 text-teal-200">
                Painel
              </span>
            </div>

            {/* Painel Principal de Administração */}
            <button
              id="nav-admin-panel"
              data-testid="nav-admin-panel"
              onClick={() => {
                setActiveTab("admin");
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                activeTab === "admin"
                  ? "bg-teal-600 text-white font-semibold shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0 text-teal-300" />
              <span>Painel de Administração</span>
            </button>

            {/* Content Engine Direct Tab */}
            <button
              id="nav-content-engine"
              data-testid="nav-content-engine"
              onClick={() => {
                setActiveTab("admin");
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-slate-300 hover:text-white hover:bg-white/[0.05]"
            >
              <BookOpen className="w-4 h-4 shrink-0 text-purple-400" />
              <span>Content Engine & OCR</span>
            </button>

            {/* Design Studio Direct Tab */}
            <button
              id="nav-design-studio"
              data-testid="nav-design-studio"
              onClick={() => {
                setActiveTab("admin");
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-slate-300 hover:text-white hover:bg-white/[0.05]"
            >
              <Palette className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Design Studio</span>
            </button>

            {/* Inventário Canônico de Provas */}
            <button
              id="nav-export-panel"
              data-testid="nav-export-panel"
              onClick={() => {
                setActiveTab("export");
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                activeTab === "export"
                  ? "bg-teal-600 text-white font-semibold shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Database className="w-4 h-4 shrink-0 text-cyan-300" />
              <span>Inventário de Provas</span>
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* 2. STUDENT NAVIGATION (Direct for students, Inspection for Admin) */}
        {/* ============================================================ */}
        {isDeveloperAdmin ? (
          <div>
            <button
              type="button"
              onClick={() => setStudentPreviewExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold tracking-wider text-slate-400 hover:text-slate-200 uppercase cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                Área do Aluno (Visualização)
              </span>
              {studentPreviewExpanded ? (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-400" />
              )}
            </button>

            {studentPreviewExpanded && (
              <div className="space-y-1 mt-1 pt-1 border-t border-white/[0.04]">
                {STUDENT_NAVIGATION_CONFIG.map((section) => {
                  const Icon = section.icon;
                  const isSectionOpen = expandedSection === section.id;
                  const hasActiveChild = isSectionActive(section);
                  const hasSubItems = section.subItems && section.subItems.length > 0;
                  const sectionBadge = resolveBadge(section.badgeKey);

                  return (
                    <div key={section.id} className="space-y-0.5">
                      <div
                        onClick={() => handleSelectSection(section)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
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

                      {hasSubItems && isSectionOpen && (
                        <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-white/[0.08] ml-4 my-0.5">
                          {section.subItems?.map((sub: SubNavigationItem) => {
                            const isSubActive = isSubItemActive(sub.id);
                            const SubIcon = sub.icon;
                            const subBadge = resolveBadge(sub.badgeKey);
                            const req = getSubItemFeatureRequirement(sub.id);

                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleSelectSubItem(sub.id)}
                                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer text-left ${
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
                                <div className="flex items-center gap-1 shrink-0">
                                  {req.isLocked && (
                                    <span className={`text-[8px] font-bold px-1 py-0.2 rounded-sm uppercase tracking-wider flex items-center gap-0.5 ${
                                      req.requiredPlan === "elite"
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    }`}>
                                      <Lock className="w-2.5 h-2.5" />
                                      {req.requiredPlan === "elite" ? "Elite" : "Pro"}
                                    </span>
                                  )}
                                  {subBadge && (
                                    <span className="text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-purple-500/20 text-purple-300">
                                      {subBadge}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          STUDENT_NAVIGATION_CONFIG.map((section) => {
            const Icon = section.icon;
            const isSectionOpen = expandedSection === section.id;
            const hasActiveChild = isSectionActive(section);
            const hasSubItems = section.subItems && section.subItems.length > 0;
            const sectionBadge = resolveBadge(section.badgeKey);

            return (
              <div key={section.id} className="space-y-0.5">
                <div
                  onClick={() => handleSelectSection(section)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer group ${
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

                {hasSubItems && isSectionOpen && (
                  <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-white/[0.08] ml-4 my-0.5">
                    {section.subItems?.map((sub: SubNavigationItem) => {
                      const isSubActive = isSubItemActive(sub.id);
                      const SubIcon = sub.icon;
                      const subBadge = resolveBadge(sub.badgeKey);
                      const req = getSubItemFeatureRequirement(sub.id);

                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleSelectSubItem(sub.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer text-left ${
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
                          <div className="flex items-center gap-1 shrink-0">
                            {req.isLocked && (
                              <span className={`text-[8px] font-bold px-1 py-0.2 rounded-sm uppercase tracking-wider flex items-center gap-0.5 ${
                                req.requiredPlan === "elite"
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              }`}>
                                <Lock className="w-2.5 h-2.5" />
                                {req.requiredPlan === "elite" ? "Elite" : "Pro"}
                              </span>
                            )}
                            {subBadge && (
                              <span className="text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-purple-500/20 text-purple-300">
                                {subBadge}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Area: Perfil & Configurações Footer */}
      <div className="p-3 pt-2 space-y-2 border-t border-[#142847]/70 bg-[#091526]">
        {/* Dynamic Plan Badge Banner */}
        <div className={`p-3 rounded-2xl border space-y-1.5 ${
          plan === "elite"
            ? "bg-purple-950/30 border-purple-500/30"
            : plan === "pro"
            ? "bg-[#0F223D] border-teal-500/20"
            : isExpired
            ? "bg-rose-950/30 border-rose-500/30"
            : "bg-amber-950/20 border-amber-500/20"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {plan === "elite" ? (
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              ) : plan === "pro" ? (
                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              )}
              <span className="text-xs font-bold text-white">
                {plan === "elite"
                  ? "Stazia Elite"
                  : plan === "pro"
                  ? "Stazia PRO"
                  : isExpired
                  ? "Trial Expirado"
                  : `Trial (${trialDaysRemaining}d restantes)`}
              </span>
            </div>
            {plan !== "elite" && (
              <button
                type="button"
                onClick={() => setIsSubscriptionModalOpen(true)}
                className="text-[10px] text-teal-300 hover:underline font-bold"
              >
                {plan === "pro" ? "Upgrade →" : "Assinar →"}
              </button>
            )}
          </div>
        </div>

        {/* User Account Controls */}
        <div className="p-2 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
          {/* User Profile Bar - Clickable to open Profile */}
          <button
            type="button"
            onClick={() => {
              openAccountSettings();
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
                openAccountSettings();
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-teal-300 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[11px]"
              title="Minha Conta"
            >
              <User className="w-3.5 h-3.5" />
              <span>Conta</span>
            </button>
            <button
              type="button"
              onClick={() => {
                openAppSettings();
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-teal-300 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[11px]"
              title="Preferências"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Ajustes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                openAppSettings("alerts");
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-teal-300 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[11px]"
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
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer text-[11px]"
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
