import React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { BillingCycle } from "./pricingTypes";
import { PlanCode } from "../../services/entitlementsClient";

export interface PlanCTAProps {
  plan: "trial" | "pro" | "elite";
  currentPlan: PlanCode;
  isTrial: boolean;
  trialActive: boolean;
  trialUsed: boolean;
  isExpired: boolean;
  isAuthenticated: boolean;
  billingCycle: BillingCycle;
  isLoading?: boolean;
  onClick: () => void;
}

export const PlanCTA: React.FC<PlanCTAProps> = ({
  plan,
  currentPlan,
  isTrial,
  trialActive,
  trialUsed,
  isExpired,
  isAuthenticated,
  billingCycle,
  isLoading = false,
  onClick,
}) => {
  // Determinar texto e estilo do botão
  let label = "";
  let disabled = false;
  let variant: "trial" | "pro" | "elite" | "current" | "disabled" = "trial";

  if (!isAuthenticated) {
    if (plan === "trial") {
      label = "Começar grátis";
      variant = "trial";
    } else if (plan === "pro") {
      label = "Assinar PRO";
      variant = "pro";
    } else {
      label = "Assinar Elite";
      variant = "elite";
    }
  } else {
    // Usuário autenticado
    if (currentPlan === "elite") {
      if (plan === "elite") {
        label = "Seu plano atual";
        disabled = true;
        variant = "current";
      } else {
        label = "Incluído no seu Elite";
        disabled = true;
        variant = "disabled";
      }
    } else if (currentPlan === "pro") {
      if (plan === "trial") {
        label = "Trial já utilizado";
        disabled = true;
        variant = "disabled";
      } else if (plan === "pro") {
        label = "Seu plano atual";
        disabled = true;
        variant = "current";
      } else {
        label = "Fazer upgrade para Elite";
        variant = "elite";
      }
    } else {
      // Usuário Trial ou Sem Assinatura
      if (plan === "trial") {
        if (trialActive) {
          label = "Acessar plataforma";
          variant = "trial";
        } else if (trialUsed || isExpired) {
          label = "Escolher um plano";
          disabled = true;
          variant = "disabled";
        } else {
          label = "Começar grátis";
          variant = "trial";
        }
      } else if (plan === "pro") {
        label = "Assinar PRO";
        variant = "pro";
      } else {
        label = "Assinar Elite";
        variant = "elite";
      }
    }
  }

  // Estilos conforme a referência visual
  // Trial: Botão pill com borda fina teal/cyan, fundo branco, texto escuro
  // PRO: Botão pill verde petróleo/teal escuro sólido (#0D6B63 / #008779) preenchido
  // Elite: Botão pill azul marinho escuro profundo (#0B2545 / #091C36) preenchido
  let buttonClass = "";
  if (variant === "trial") {
    buttonClass =
      "bg-white hover:bg-slate-50 border border-[#00BFA5] text-[#0A2540] hover:border-[#00897B] shadow-xs active:scale-[0.98]";
  } else if (variant === "pro") {
    buttonClass =
      "bg-[#0D736A] hover:bg-[#0A5F57] text-white shadow-md hover:shadow-lg shadow-teal-900/20 active:scale-[0.98]";
  } else if (variant === "elite") {
    buttonClass =
      "bg-[#0A2540] hover:bg-[#07192C] text-white shadow-md hover:shadow-lg shadow-slate-900/25 active:scale-[0.98]";
  } else if (variant === "current") {
    buttonClass =
      "bg-emerald-50 border border-emerald-300 text-emerald-800 cursor-default opacity-90";
  } else {
    buttonClass =
      "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed";
  }

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      onClick={onClick}
      aria-label={`${label} para o plano ${plan.toUpperCase()}`}
      className={`w-full py-3 px-6 rounded-full font-bold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${buttonClass}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processando...</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          {!disabled && <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
        </>
      )}
    </button>
  );
};
