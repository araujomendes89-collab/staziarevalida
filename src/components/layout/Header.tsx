import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Menu,
  X,
  Flame,
  Bell,
  ChevronDown,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ExamEngine } from "../../services/examEngine";
import { AiQuotaIndicator } from "./AiQuotaIndicator";

interface HeaderProps {
  onToggleMobileMenu: () => void;
  isMobileMenuOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu, isMobileMenuOpen }) => {
  const {
    user,
    firebaseUser,
    setIsExamConfigOpen,
    setActiveTab,
    isDeveloperAdmin,
    activeTab,
    isDarkMode,
    setIsDarkMode,
    guidelineAlerts = [],
  } = useApp();
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [readAlertIds, setReadAlertIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("stazia_read_header_alerts") || "[]");
    } catch {
      return [];
    }
  });
  const [deletedAlertIds, setDeletedAlertIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("stazia_deleted_header_alerts") || "[]");
    } catch {
      return [];
    }
  });
  const alertsPopoverRef = useRef<HTMLDivElement | null>(null);

  const examInfo = ExamEngine.getExamInfo(
    user.targetEdition,
    user.examDate,
    user.hasConfiguredExamDate !== false
  );

  const rawName = user?.name || firebaseUser?.displayName || "Doutor(a)";
  const userName = rawName.replace("Dr. ", "").replace("Dra. ", "");
  const userInitial = userName.charAt(0).toUpperCase() || "D";
  const streakDays = user?.studyStreakDays ?? 0;
  const headerAlerts = useMemo(
    () =>
      guidelineAlerts
        .filter((alert) => !deletedAlertIds.includes(alert.id))
        .slice(0, 5)
        .map((alert) => ({
          id: alert.id,
          title: "Nova atualização de uma diretriz",
          message: alert.guidelineTitle,
          detail: alert.summary,
          date: alert.detectedDate,
          isRead: readAlertIds.includes(alert.id),
        })),
    [deletedAlertIds, guidelineAlerts, readAlertIds]
  );
  const unreadAlertsCount = headerAlerts.filter((alert) => !alert.isRead).length;

  useEffect(() => {
    localStorage.setItem("stazia_read_header_alerts", JSON.stringify(readAlertIds));
  }, [readAlertIds]);

  useEffect(() => {
    localStorage.setItem("stazia_deleted_header_alerts", JSON.stringify(deletedAlertIds));
  }, [deletedAlertIds]);

  useEffect(() => {
    if (!isAlertsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        alertsPopoverRef.current &&
        event.target instanceof Node &&
        !alertsPopoverRef.current.contains(event.target)
      ) {
        setIsAlertsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isAlertsOpen]);

  const markAlertAsRead = (alertId: string) => {
    setReadAlertIds((prev) => (prev.includes(alertId) ? prev : [...prev, alertId]));
  };

  const deleteHeaderAlert = (alertId: string) => {
    setDeletedAlertIds((prev) => (prev.includes(alertId) ? prev : [...prev, alertId]));
  };

  const contextLabel =
    activeTab === "home"
      ? "Início"
      : activeTab.includes("quest") || activeTab === "praticar"
      ? "Questões"
      : activeTab.startsWith("praticar")
      ? "Praticar"
      : activeTab.includes("tema") || activeTab.startsWith("estudar")
      ? "Estudar"
      : activeTab.startsWith("planejamento") || activeTab === "calendar"
      ? "Planejamento"
      : activeTab.startsWith("desempenho") || activeTab === "progress" || activeTab === "matrix"
      ? "Desempenho"
      : activeTab.includes("revisar") || activeTab === "review" || activeTab === "errors"
      ? "Revisar"
      : activeTab.includes("tutor") || activeTab === "voice-tutor"
      ? "Tutor IA"
      : "StaziaMed Revalida";

  return (
    <header className="sticky top-0 z-30 bg-[#F6F8FB]/90 dark:bg-[#07101d]/95 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left Side: Mobile Brand Logo / Desktop Greeting */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-xl bg-[#0B192C] text-teal-400 flex items-center justify-center font-black text-xs shadow-xs shrink-0">
            R
          </div>
            <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight truncate">
            Revalida INEP
          </span>
        </div>

        {/* Desktop Left: Navigation Context / Master Control Panel */}
        <div className="hidden md:block flex-1 min-w-0">
          {isDeveloperAdmin ? (
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  Painel de Gestão Master
                  <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 border border-teal-500/30">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                    Admin
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Controle total da plataforma: Content Engine, Design Studio, Usuários e Auditoria.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {contextLabel}
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Preparação orientada para a aprovação no Revalida INEP.
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Quick Actions, AI Quota, Notifications, Avatar & Mobile Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Quick Toggle for Admin: Alternar entre Painel e Visão do Aluno */}
          {isDeveloperAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "admin" ? "home" : "admin")}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                activeTab === "admin"
                  ? "bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100"
                  : "bg-slate-900 text-teal-300 border-slate-700 hover:bg-slate-800"
              }`}
              title="Alternar entre Painel de Controle e Área do Aluno"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{activeTab === "admin" ? "Visão do Aluno" : "Painel Master"}</span>
            </button>
          )}

          {/* Streak Pill (Hidden in Admin mode or on mobile) */}
          {!isDeveloperAdmin && (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-xs text-xs font-medium text-slate-700"
              title="Sequência de estudos diários"
            >
              <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-orange-500">
                <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
              </div>
              <div className="flex items-baseline gap-1 text-left">
                <span className="text-[11px] text-slate-400 hidden lg:inline">Sequência</span>
                <span className="font-bold text-slate-800 text-xs">{streakDays} dias</span>
              </div>
            </div>
          )}

          {/* AI Quota & Ledger Indicator (Hidden on mobile) */}
          <div className="hidden md:flex">
            <AiQuotaIndicator />
          </div>

          <button
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full bg-white dark:bg-[#0c1626] border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition-colors shadow-xs flex items-center justify-center min-h-[38px] min-w-[38px]"
            title={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
            aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Button */}
          <div className="relative" ref={alertsPopoverRef}>
            <button
              type="button"
              onClick={() => setIsAlertsOpen((open) => !open)}
              className="relative p-2 rounded-full bg-white dark:bg-[#0c1626] border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition-colors shadow-xs flex items-center justify-center min-h-[38px] min-w-[38px]"
              title="Alertas"
              aria-label="Abrir alertas"
              aria-expanded={isAlertsOpen}
            >
              <Bell className="w-4 h-4 text-slate-600 dark:text-slate-200" />
              {unreadAlertsCount > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-teal-600 text-white font-bold text-[9px] rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#07101d]">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {isAlertsOpen && (
              <div className="absolute right-0 top-11 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1626] shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">Alertas</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Atualizações importantes da plataforma e diretrizes.
                  </p>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {headerAlerts.length === 0 ? (
                    <div className="p-5 text-center">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Nenhum alerta novo.
                      </p>
                    </div>
                  ) : (
                    headerAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-4 border-b last:border-b-0 border-slate-100 dark:border-slate-800 ${
                          alert.isRead ? "bg-white dark:bg-[#0c1626]" : "bg-teal-50/70 dark:bg-teal-950/20"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${alert.isRead ? "bg-slate-300 dark:bg-slate-600" : "bg-teal-500"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-900 dark:text-white">
                              {alert.title}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {alert.message}
                            </p>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                              {alert.detail}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold text-slate-400">
                                {alert.date}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => markAlertAsRead(alert.id)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                  Lido
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteHeaderAlert(alert.id)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer"
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile / Avatar Button */}
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            id="header-user-profile-btn"
            className={`flex items-center gap-1.5 p-1 sm:pl-1 sm:pr-2 sm:py-1 rounded-full bg-white border shadow-xs text-xs transition-colors min-h-[38px] min-w-[38px] justify-center ${
              isDeveloperAdmin ? "border-teal-500/50 ring-2 ring-teal-500/20" : "border-slate-200/80 hover:border-slate-300"
            }`}
            title={firebaseUser ? `Conectado: ${firebaseUser.email || userName} (ADMIN MASTER)` : "Configurações e Perfil"}
            aria-label="Perfil do Usuário"
          >
            {firebaseUser?.photoURL ? (
              <img
                src={firebaseUser.photoURL}
                alt="Avatar"
                className="w-7 h-7 rounded-full object-cover border border-slate-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-xs ${
                isDeveloperAdmin ? "bg-teal-700" : "bg-slate-900"
              }`}>
                {userInitial}
              </div>
            )}
            {isDeveloperAdmin && (
              <span className="hidden sm:inline-block text-[10px] font-black uppercase text-teal-700 px-1">
                MASTER
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-xl bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-50 min-h-[38px] min-w-[38px] flex items-center justify-center shadow-xs"
            id="mobile-menu-toggle-btn"
            aria-label="Abrir Menu de Navegação"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </header>
  );
};
