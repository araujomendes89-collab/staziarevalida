import React, { useState } from "react";
import { ShieldCheck, CreditCard, Lock, X, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { BillingCycle, CommercialPlanConfig } from "./pricingTypes";

interface CheckoutModalProps {
  isOpen: boolean;
  plan: CommercialPlanConfig;
  billingCycle: BillingCycle;
  userEmail?: string;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  plan,
  billingCycle,
  userEmail,
  onClose,
  onPaymentSuccess,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAnnual = billingCycle === "annual";
  const priceFormatted = isAnnual ? plan.annualTotalFormatted : `${plan.monthlyPriceFormatted}/mês`;
  const periodLabel = isAnnual ? "Cobrança Anual Única" : "Cobrança Recorrente Mensal";

  const handleSimulatePayment = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Chamar o webhook oficial de confirmação de pagamento do servidor
      const response = await fetch("/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: plan.code,
          billingCycle,
          email: userEmail,
          source: "direct_checkout",
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.processed) {
        throw new Error(data.message || data.error || "Falha ao processar confirmação de pagamento.");
      }

      // Sucesso confirmado pelo backend
      onPaymentSuccess();
    } catch (err: any) {
      console.error("[CheckoutModal] Payment error:", err);
      setErrorMessage(
        err?.message || "Não foi possível concluir a transação. Verifique seus dados e tente novamente."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] border border-slate-200 max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          type="button"
          disabled={isProcessing}
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-extrabold uppercase tracking-wider mb-1">
            <Lock className="w-3 h-3" />
            <span>Ambiente de Checkout Seguro</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-[#0A1C3E] tracking-tight">
            Finalizar assinatura {plan.name}
          </h3>
          <p className="text-xs text-slate-500">
            Você está prestes a desbloquear o plano <strong>{plan.name}</strong> com acesso imediato.
          </p>
        </div>

        {/* Summary Box */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">Plano selecionado:</span>
            <span className="font-bold text-[#0A1C3E]">{plan.name}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">Ciclo:</span>
            <span className="font-bold text-[#0A1C3E]">{periodLabel}</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
            <span className="text-slate-900 font-bold">Total a pagar:</span>
            <span className="text-lg font-black text-[#0D736A]">{priceFormatted}</span>
          </div>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Security badges */}
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 py-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>SSL 256 bits</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-teal-600" />
            <span>Cartão / PIX</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-slate-600" />
            <span>Dados Criptografados</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleSimulatePayment}
            className="w-full py-3.5 px-6 rounded-full bg-[#0D736A] hover:bg-[#0A5F57] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-900/20 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando pagamento com o gateway...</span>
              </>
            ) : (
              <>
                <span>Confirmar e Assinar Agora ({priceFormatted})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
          >
            Cancelar e voltar
          </button>
        </div>
      </div>
    </div>
  );
};
