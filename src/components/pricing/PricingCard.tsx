import React from "react";
import { Check, Crown, FlaskConical, BarChart3, Gem } from "lucide-react";
import { CommercialPlanConfig, BillingCycle } from "./pricingTypes";
import { PlanCTA } from "./PlanCTA";
import { PlanCode } from "../../services/entitlementsClient";

interface PricingCardProps {
  plan: CommercialPlanConfig;
  billingCycle: BillingCycle;
  currentPlan: PlanCode;
  isTrial: boolean;
  trialActive: boolean;
  trialUsed: boolean;
  isExpired: boolean;
  isAuthenticated: boolean;
  isLoading?: boolean;
  onSelectPlan: (planCode: "trial" | "pro" | "elite") => void;
}

export const PricingCard: React.FC<PricingCardProps> = ({
  plan,
  billingCycle,
  currentPlan,
  isTrial,
  trialActive,
  trialUsed,
  isExpired,
  isAuthenticated,
  isLoading = false,
  onSelectPlan,
}) => {
  const isPro = plan.code === "pro";
  const isElite = plan.code === "elite";
  const isTrialPlan = plan.code === "trial";

  // Preço exibido conforme o ciclo
  let displayPrice = "";
  let periodText = "";
  let subPriceText = "";

  if (isTrialPlan) {
    displayPrice = "R$ 0";
    periodText = "";
    subPriceText = "Teste gratuito por 7 dias";
  } else if (billingCycle === "monthly") {
    displayPrice = plan.monthlyPriceFormatted;
    periodText = "/mês";
    subPriceText = plan.pricePeriodText; // ex: "ou R$ 897/ano"
  } else {
    // Anual
    displayPrice = plan.annualMonthlyEquivalentFormatted;
    periodText = "/mês";
    subPriceText = `Faturado anualmente (${plan.annualTotalFormatted})`;
  }

  // Ícone temático no cabeçalho do card
  const renderIcon = () => {
    if (isTrialPlan) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
          <FlaskConical className="w-5 h-5" />
        </div>
      );
    }
    if (isPro) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-[#0D736A]">
          <BarChart3 className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[#0A2540]">
        <Gem className="w-5 h-5" />
      </div>
    );
  };

  // Card container styling reproducing reference image
  // Pro is slightly larger, with a prominent teal-green border and soft shadow
  const cardBorderClass = isPro
    ? "border-2 border-[#00BFA5] bg-white shadow-2xl shadow-teal-900/10 lg:-translate-y-2 relative z-10"
    : "border border-slate-200/90 bg-white shadow-lg shadow-slate-900/5";

  return (
    <div
      data-testid={`pricing-card-${plan.code}`}
      className={`rounded-[32px] p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${cardBorderClass}`}
    >
      {/* Top Floating Badge for PRO */}
      {isPro && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <div className="px-4 py-1 rounded-full bg-[#0D736A] text-white text-[11px] font-extrabold tracking-wider uppercase flex items-center gap-1.5 shadow-md">
            <Crown className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            <span>MAIS ESCOLHIDO</span>
          </div>
        </div>
      )}

      {/* Card Header */}
      <div>
        {/* Top row: Icon + Tagline */}
        <div className="flex items-start justify-between mb-4">
          {renderIcon()}
          <span className="text-[9px] font-extrabold tracking-[0.15em] text-slate-400 uppercase text-right max-w-[140px] leading-tight">
            {plan.tagline}
          </span>
        </div>

        {/* Title + Pill Badge */}
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-xl sm:text-2xl font-black text-[#0A1C3E] tracking-tight">
            {plan.name}
          </h3>
          {plan.badge && !isPro && (
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                isTrialPlan
                  ? "bg-teal-50 text-teal-700 border border-teal-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              {plan.badge}
            </span>
          )}
        </div>

        {/* Price Section */}
        <div className="mb-6 pb-6 border-b border-slate-100">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-black text-[#0A1C3E] tracking-tight">
              {displayPrice}
            </span>
            {periodText && (
              <span className="text-xs sm:text-sm font-semibold text-slate-500">
                {periodText}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {subPriceText}
          </p>
        </div>

        {/* Feature List with circular checkmarks from reference image */}
        <div className="space-y-3 mb-8">
          {plan.features.map((feature, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isPro
                    ? "bg-[#00BFA5]/20 text-[#0D736A]"
                    : isElite
                    ? "bg-[#0A2540] text-white"
                    : "bg-teal-50 text-teal-600 border border-teal-200"
                }`}
              >
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span className="text-xs text-slate-700 font-medium leading-tight">
                {feature}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Card Footer with CTA button and note */}
      <div className="space-y-2.5 pt-2">
        <PlanCTA
          plan={plan.code}
          currentPlan={currentPlan}
          isTrial={isTrial}
          trialActive={trialActive}
          trialUsed={trialUsed}
          isExpired={isExpired}
          isAuthenticated={isAuthenticated}
          billingCycle={billingCycle}
          isLoading={isLoading}
          onClick={() => onSelectPlan(plan.code)}
        />
        <p className="text-[11px] text-center text-slate-400 italic">
          {plan.footerNote}
        </p>
      </div>
    </div>
  );
};
