import React, { ReactNode } from "react";
import { Lock, Sparkles, ArrowRight, ShieldAlert } from "lucide-react";
import { useEntitlements } from "../../hooks/useEntitlements";
import { FeatureCode, PlanCode } from "../../services/entitlementsClient";
import { useApp } from "../../context/AppContext";

export interface FeatureGateProps {
  feature: FeatureCode;
  children: ReactNode;
  fallback?: ReactNode;
  showCardFallback?: boolean;
  title?: string;
  description?: string;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback,
  showCardFallback = true,
  title,
  description,
}) => {
  const { canUse, getFeatureDetails, isExpired, isTrial } = useEntitlements();
  const { setIsSubscriptionModalOpen } = useApp();

  const allowed = canUse(feature);

  if (allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showCardFallback) {
    return null;
  }

  const details = getFeatureDetails(feature);
  const requiredPlan: PlanCode = details.requiredPlan || "pro";
  const requiredPlanName = requiredPlan === "elite" ? "Stazia Elite" : "Stazia PRO";

  const defaultTitle = isExpired
    ? "Período de Avaliação Expirado"
    : `Disponível no ${requiredPlanName}`;

  const defaultDesc = isExpired
    ? "Seus 7 dias de avaliação gratuita encerraram. Escolha um plano para reativar o acesso completo a esta ferramenta."
    : `Este recurso avançado faz parte do plano ${requiredPlanName}. Faça upgrade para desbloquear agora.`;

  return (
    <div
      data-testid={`feature-gate-blocked-${feature}`}
      className="p-8 rounded-3xl bg-[#09101D] border border-slate-800/90 shadow-2xl text-center max-w-xl mx-auto my-6 relative overflow-hidden"
    >
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
        {isExpired ? <ShieldAlert className="w-7 h-7 text-rose-400" /> : <Lock className="w-7 h-7" />}
      </div>

      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 inline-block mb-3">
        {isExpired ? "Assinatura Necessária" : `Recurso ${requiredPlanName}`}
      </span>

      <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight mb-2">
        {title || defaultTitle}
      </h3>

      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto mb-6">
        {description || defaultDesc}
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setIsSubscriptionModalOpen(true)}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isExpired ? "Ver Planos Disponíveis" : `Fazer Upgrade para ${requiredPlanName}`}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
