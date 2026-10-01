import React from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  X,
  Zap,
  Award,
  Clock,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

export const PricingModal: React.FC = () => {
  const { isSubscriptionModalOpen, setIsSubscriptionModalOpen, user, updateUserProfile } = useApp();

  if (!isSubscriptionModalOpen) return null;

  const handleSelectTier = (tier: "PRO" | "ELITE") => {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    updateUserProfile({
      tier: tier === "ELITE" ? "PRO_PLUS" : "PRO",
      plan: tier === "ELITE" ? "elite" : "pro",
      subscriptionExpiresAt: thirtyDaysLater,
      planUpdatedAt: now.toISOString(),
    });
    setIsSubscriptionModalOpen(false);
  };

  // Calculate days remaining on trial if applicable
  const now = new Date().getTime();
  const trialEndsTimestamp = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() : 0;
  const isTrialActive = (user.tier === "TRIAL" || user.plan === "trial" || user.tier === "FREE") && trialEndsTimestamp > now;
  const isExpired = user.tier === "EXPIRED" || user.plan === "expired" || (trialEndsTimestamp > 0 && trialEndsTimestamp <= now && user.tier !== "PRO" && user.tier !== "PRO_PLUS" && user.tier !== "ADMIN");
  
  const daysLeft = trialEndsTimestamp > now ? Math.ceil((trialEndsTimestamp - now) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="backdrop-blur-2xl bg-[#09101D] border border-slate-800 rounded-[32px] max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest backdrop-blur-md bg-teal-500/20 px-2.5 py-0.5 rounded-full border border-teal-500/30">
                Planos Oficiais StaziaMed Revalida
              </span>
              {isExpired && (
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest backdrop-blur-md bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Trial Expirado
                </span>
              )}
              {isTrialActive && (
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest backdrop-blur-md bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {daysLeft} {daysLeft === 1 ? "dia restante" : "dias restantes"} de Trial
                </span>
              )}
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-2">
              {isExpired
                ? "Seu Período de Teste Gratuito de 7 Dias Encerrou"
                : "Escolha o Nível Ideal para sua Preparação"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isExpired
                ? "Selecione um plano abaixo para reativar o banco completo de questões, IA e ferramentas de estudo."
                : "Acesso completo e direcionado para a aprovação no Revalida INEP e ENAMED."}
            </p>
          </div>
          <button
            onClick={() => setIsSubscriptionModalOpen(false)}
            className="p-2 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Expiration Banner if expired */}
        {isExpired && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-200">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              O período Trial encerrou. Assine o plano <strong>Stazia PRO</strong> ou <strong>Stazia ELITE</strong> para continuar sua preparação sem bloqueios.
            </span>
          </div>
        )}

        {/* 3 Canonical Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. TRIAL 7 DIAS */}
          <div className="p-5 sm:p-6 rounded-[28px] bg-[#050B14] border border-slate-800 flex flex-col justify-between space-y-5 shadow-xl transition-all opacity-85">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-300 text-base">TRIAL 7 DIAS</h4>
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-3xl font-extrabold text-white mt-2">R$ 0</p>
              <p className="text-xs text-slate-500 mt-1">7 dias corridos de avaliação</p>

              <div className="space-y-2 mt-5 text-xs text-slate-300 font-sans">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Até 100 questões oficiais</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>1 prova completa demonstrativa</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Comentários das questões</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Até 20 flashcards FSRS</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Até 10 interações com IA</span>
                </p>
                <p className="flex items-center gap-2 text-slate-600 line-through">
                  <span>Cronograma Inteligente</span>
                </p>
                <p className="flex items-center gap-2 text-slate-600 line-through">
                  <span>Modo Pareto & AI Coach</span>
                </p>
              </div>
            </div>

            <div className="w-full py-2.5 rounded-2xl text-xs font-bold text-center bg-slate-800/60 text-slate-400 border border-slate-700/60 cursor-default">
              {isExpired ? "Trial Expirado" : isTrialActive ? "Trial em Andamento" : "Avaliação Concluída"}
            </div>
          </div>

          {/* 2. STAZIA PRO */}
          <div className="p-5 sm:p-6 rounded-[28px] bg-[#0A182F] border-2 border-teal-500/50 relative flex flex-col justify-between space-y-5 shadow-2xl hover:border-teal-400 transition-all">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black text-teal-300 bg-teal-950 border border-teal-500/60 px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
              Mais Escolhido • Principal
            </span>

            <div>
              <h4 className="font-bold text-white text-base">STAZIA PRO</h4>
              <p className="text-3xl font-extrabold text-white mt-2">R$ 99,90<span className="text-xs font-normal text-slate-400">/mês</span></p>
              <p className="text-xs text-teal-300/90 mt-1">ou R$ 897/ano • Estudo Inteligente</p>

              <div className="space-y-2 mt-5 text-xs text-slate-200 font-sans">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Banco completo (Revalida + ENAMED)</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Provas anteriores na íntegra</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Caderno de erros inteligente</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Flashcards FSRS ilimitados</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Grandes Temas & Resumos</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Cronograma inteligente & Revisão</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>IA para explicar e criar questões</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Comunidade exclusiva Stazia PRO</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectTier("PRO")}
              className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                user.plan === "pro"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 cursor-default"
                  : "bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold shadow-lg shadow-teal-500/20 active:scale-95"
              }`}
            >
              {user.plan === "pro" ? "Plano Atual Ativo" : "Assinar Stazia PRO"}
            </button>
          </div>

          {/* 3. STAZIA ELITE */}
          <div className="p-5 sm:p-6 rounded-[28px] bg-[#120F2A] border border-purple-500/40 flex flex-col justify-between space-y-5 shadow-2xl hover:border-purple-400 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-purple-300 text-base">STAZIA ELITE</h4>
                <Sparkles className="w-4 h-4 text-purple-300" />
              </div>
              <p className="text-3xl font-extrabold text-white mt-2">R$ 179,90<span className="text-xs font-normal text-slate-400">/mês</span></p>
              <p className="text-xs text-purple-300/80 mt-1">ou R$ 1.497/ano • Nível Premium com AI Coach & Pareto</p>

              <div className="space-y-2 mt-5 text-xs text-slate-200 font-sans">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Tudo incluso do plano PRO</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span><strong>Stazia AI Coach</strong> socrático</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span><strong>Modo Pareto (80/20)</strong> avançado</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Plano diário adaptativo contínuo</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Simulados adaptativos calibrados</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Radar de preparação com probabilidade</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Revisão personalizada de reta final</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Grupo VIP com mentoria direta</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectTier("ELITE")}
              className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                user.plan === "elite"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 cursor-default"
                  : "bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold shadow-lg shadow-purple-500/25 active:scale-95"
              }`}
            >
              {user.plan === "elite" ? "Plano Atual Ativo" : "Assinar Stazia ELITE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
