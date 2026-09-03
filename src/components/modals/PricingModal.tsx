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

  const handleSelectTier = (tier: "PRO" | "PRO_PLUS") => {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    updateUserProfile({
      tier,
      plan: tier === "PRO_PLUS" ? "pro_plus" : "pro",
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
      <div className="backdrop-blur-2xl bg-slate-900/90 border border-white/15 rounded-[32px] max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest backdrop-blur-md bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                Planos PRAXIS REVALIDA
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
                ? "Seu Período de Teste Gratuito Encerrou"
                : "Desbloqueie todo o Potencial da sua Preparação"}
            </h3>
            <p className="text-xs text-white/60 mt-1">
              {isExpired
                ? "Escolha um plano abaixo para reativar o Mentor IA, gerador de questões e o simulador OSCE sem restrições."
                : "Sem renovações automáticas ocultas. Cancele quando quiser com 1 clique."}
            </p>
          </div>
          <button
            onClick={() => setIsSubscriptionModalOpen(false)}
            className="p-2 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 text-white/50 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Expiration Banner if expired */}
        {isExpired && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-200">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              As funções de inteligência artificial (tutor socrático, autópsias, gerador de questões e áudio) estão bloqueadas. Assine o plano <strong>PRO</strong> ou <strong>PRO+ OSCE</strong> para continuar.
            </span>
          </div>
        )}

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* TRIAL 7 DIAS */}
          <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between space-y-5 shadow-xl transition-all opacity-80">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white/80 text-base">TRIAL 7 DIAS</h4>
                <Clock className="w-4 h-4 text-white/40" />
              </div>
              <p className="text-3xl font-extrabold text-white mt-2">R$ 0</p>
              <p className="text-xs text-white/50 mt-1">7 dias de avaliação inicial</p>

              <div className="space-y-2.5 mt-5 text-xs text-white/80 font-sans">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Acesso por 7 dias corridos</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>10 consultas de IA / dia</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>GPS de estudo básico</span>
                </p>
                <p className="flex items-center gap-2 text-white/30 line-through">
                  <span>Uso ilimitado após 7 dias</span>
                </p>
                <p className="flex items-center gap-2 text-white/30 line-through">
                  <span>OSCE por Voz Ilimitado</span>
                </p>
              </div>
            </div>

            <div className="w-full py-2.5 rounded-2xl text-xs font-bold text-center backdrop-blur-md bg-white/5 text-white/40 border border-white/5 cursor-default">
              {isExpired ? "Trial Expirado" : isTrialActive ? "Em Andamento" : "Degustação Única"}
            </div>
          </div>

          {/* PRO */}
          <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-emerald-500/10 border border-emerald-500/30 relative flex flex-col justify-between space-y-5 shadow-2xl hover:border-emerald-500/50 transition-all">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-300 backdrop-blur-md bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
              Mais Popular (1ª Etapa)
            </span>

            <div>
              <h4 className="font-bold text-white text-base">PRO</h4>
              <p className="text-3xl font-extrabold text-white mt-2">R$ 67<span className="text-xs font-normal text-white/50">/mês</span></p>
              <p className="text-xs text-emerald-300/80 mt-1">Preparação Teórica Completa</p>

              <div className="space-y-2.5 mt-5 text-xs text-white/90 font-sans">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Questões Ilimitadas</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Caderno Automático de Erros</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Mentor IA Ilimitado (Claude + Gemini)</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Auditoria Oficial & Diretrizes SUS</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleSelectTier("PRO")}
              className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all ${
                user.tier === "PRO"
                  ? "backdrop-blur-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default"
                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95"
              }`}
            >
              {user.tier === "PRO" ? "Plano Atual Ativo" : "Assinar Plano PRO"}
            </button>
          </div>

          {/* PRO+ OSCE */}
          <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-indigo-500/10 border border-indigo-500/30 flex flex-col justify-between space-y-5 shadow-2xl hover:border-indigo-500/50 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-indigo-300 text-base">PRO+ OSCE</h4>
                <Sparkles className="w-4 h-4 text-indigo-300" />
              </div>
              <p className="text-3xl font-extrabold text-white mt-2">R$ 119<span className="text-xs font-normal text-white/50">/mês</span></p>
              <p className="text-xs text-indigo-300/80 mt-1">1ª + 2ª Etapa Prática</p>

              <div className="space-y-2.5 mt-5 text-xs text-white/90 font-sans">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Tudo do plano PRO</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Simulador OSCE com Paciente IA</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Voz em tempo real & microfone</span>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Checklist Invisível do INEP</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleSelectTier("PRO_PLUS")}
              className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all ${
                user.tier === "PRO_PLUS"
                  ? "backdrop-blur-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 cursor-default"
                  : "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-bold shadow-lg active:scale-95"
              }`}
            >
              {user.tier === "PRO_PLUS" ? "Plano Atual Ativo" : "Assinar PRO+ OSCE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
