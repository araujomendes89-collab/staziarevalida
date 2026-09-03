import React from "react";
import {
  Menu,
  X,
  Flame,
  Bell,
  ChevronDown,
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
  } = useApp();

  const examInfo = ExamEngine.getExamInfo(
    user.targetEdition,
    user.examDate,
    user.hasConfiguredExamDate !== false
  );

  const rawName = user?.name || firebaseUser?.displayName || "Doutor(a)";
  const userName = rawName.replace("Dr. ", "").replace("Dra. ", "");
  const userInitial = userName.charAt(0).toUpperCase() || "D";
  const streakDays = user?.studyStreakDays ?? 0;

  return (
    <header className="sticky top-0 z-30 bg-[#F6F8FB]/90 backdrop-blur-md border-b border-slate-200/60 px-4 sm:px-6 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left Side: Mobile Brand Logo / Desktop Greeting */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-xl bg-[#0B192C] text-teal-400 flex items-center justify-center font-black text-xs shadow-xs shrink-0">
            R
          </div>
          <span className="font-bold text-slate-900 text-sm tracking-tight truncate">
            Revalida INEP
          </span>
        </div>

        {/* Desktop Left: Greeting & Motivational Message */}
        <div className="hidden md:block flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              Olá, {userName}! <span className="inline-block hover:rotate-12 transition-transform cursor-default">👋</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
            Continue firme no seu propósito. Cada estudo te aproxima da aprovação.
          </p>
        </div>

        {/* Right Side: Streak & AI Quota (Desktop only), Notifications, Avatar & Mobile Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Streak Pill (Hidden on mobile) */}
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

          {/* AI Quota & Ledger Indicator (Hidden on mobile) */}
          <div className="hidden md:flex">
            <AiQuotaIndicator />
          </div>

          {/* Notifications Button */}
          <button
            type="button"
            onClick={() => setActiveTab("official-search")}
            className="relative p-2 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-600 transition-colors shadow-xs flex items-center justify-center min-h-[38px] min-w-[38px]"
            title="Notificações e Atualizações do INEP"
            aria-label="Notificações"
          >
            <Bell className="w-4 h-4 text-slate-600" />
            <span className="absolute top-1 right-1 w-4 h-4 bg-teal-600 text-white font-bold text-[9px] rounded-full flex items-center justify-center ring-2 ring-white">
              3
            </span>
          </button>

          {/* User Profile / Avatar Button */}
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            id="header-user-profile-btn"
            className="flex items-center gap-1.5 p-1 sm:pl-1 sm:pr-2 sm:py-1 rounded-full bg-white border border-slate-200/80 hover:border-slate-300 shadow-xs text-xs transition-colors min-h-[38px] min-w-[38px] justify-center"
            title={firebaseUser ? `Conectado: ${firebaseUser.email || userName}` : "Configurações e Perfil"}
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
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {userInitial}
              </div>
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


