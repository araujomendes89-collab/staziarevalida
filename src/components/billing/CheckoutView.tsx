import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ShieldCheck, Lock, ArrowLeft, ArrowRight, Loader2, AlertCircle, CheckCircle2, Crown, Gem, Sparkles } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useEntitlements } from "../../hooks/useEntitlements";
import { COMMERCIAL_PLANS, BillingCycle, getPurchaseIntent, clearPurchaseIntent } from "../pricing/pricingTypes";
import { BillingClient } from "../../services/billingClient";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const CheckoutView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, firebaseUser, isGuestMode } = useApp();
  const { plan: currentPlan } = useEntitlements();

  // Obter plano e ciclo da URL ou da intenção salva
  const queryPlan = searchParams.get("plan");
  const queryCycle = searchParams.get("cycle");
  const savedIntent = getPurchaseIntent();

  const targetPlanCode = (queryPlan === "elite" || savedIntent?.plan === "elite") ? "elite" : "pro";
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    (queryCycle === "annual" || savedIntent?.billingCycle === "annual") ? "annual" : "monthly"
  );

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const planConfig = COMMERCIAL_PLANS.find((p) => p.code === targetPlanCode) || COMMERCIAL_PLANS[1];
  const isAnnual = billingCycle === "annual";
  const displayAmount = isAnnual ? planConfig.annualTotalFormatted : `${planConfig.monthlyPriceFormatted}/mês`;
  const isUpgrade = currentPlan === "pro" && targetPlanCode === "elite";

  useEffect(() => {
    if (savedIntent) {
      clearPurchaseIntent();
    }
  }, [savedIntent]);

  const handleStartPayment = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Chamar o backend para criar o registro de checkout
      const result = await BillingClient.startCheckout(targetPlanCode, billingCycle);

      // 2. Redirecionar para a tela de processamento/gateway com o paymentId real
      navigate(`/pagamento/processando?payment_id=${result.paymentId}&simulate=true`);
    } catch (err: any) {
      console.error("[CheckoutView] Error starting checkout:", err);
      setErrorMessage(err?.message || "Não foi possível iniciar o checkout. Tente novamente.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 py-10 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Navigation Back */}
        <div className="flex items-center justify-between">
          <Link
            to="/planos"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para todos os planos</span>
          </Link>
          <StaziaMedLogo layout="horizontal" size="sm" />
        </div>

        {/* Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-extrabold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Checkout Seguro SSL 256-bit</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0A1C3E] tracking-tight">
            {isUpgrade ? "Upgrade para Stazia Elite" : `Finalizar assinatura Stazia ${planConfig.name}`}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
            Confirme os detalhes da sua assinatura para ter acesso imediato à preparação completa.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Grid: Order Details & Payment Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Plan Benefits & Cycle Selector (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-[32px] border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xl shadow-slate-900/5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  targetPlanCode === "elite" ? "bg-slate-900 text-white" : "bg-[#0D736A] text-white"
                }`}>
                  {targetPlanCode === "elite" ? <Gem className="w-6 h-6" /> : <Crown className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0A1C3E]">Plano {planConfig.name}</h3>
                  <p className="text-xs text-slate-400 font-semibold">{planConfig.tagline}</p>
                </div>
              </div>
              <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                100% INEP
              </span>
            </div>

            {/* Ciclo de Cobrança Selector */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">Selecione o ciclo de cobrança:</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    billingCycle === "monthly"
                      ? "border-[#00BFA5] bg-teal-50/40 ring-2 ring-[#00BFA5]/20 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <span className="text-xs font-bold text-slate-800 block">Mensal</span>
                  <span className="text-sm font-black text-[#0A1C3E] block mt-0.5">{planConfig.monthlyPriceFormatted}<span className="text-xs font-normal text-slate-500">/mês</span></span>
                  <span className="text-[10px] text-slate-500 mt-1 block">Cancele quando quiser</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingCycle("annual")}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    billingCycle === "annual"
                      ? "border-[#00BFA5] bg-teal-50/40 ring-2 ring-[#00BFA5]/20 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <span className="absolute -top-2.5 right-3 text-[9px] font-black uppercase px-2 py-0.5 bg-emerald-500 text-white rounded-full">
                    Economize 30%
                  </span>
                  <span className="text-xs font-bold text-slate-800 block">Anual</span>
                  <span className="text-sm font-black text-[#0A1C3E] block mt-0.5">{planConfig.annualMonthlyEquivalentFormatted}<span className="text-xs font-normal text-slate-500">/mês</span></span>
                  <span className="text-[10px] text-slate-500 mt-1 block">{planConfig.annualTotalFormatted} faturado à vista</span>
                </button>
              </div>
            </div>

            {/* Inclusões do Plano */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-slate-700 block">Recursos liberados imediatamente:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                {planConfig.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="truncate">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary & Pay Action (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-[32px] border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xl shadow-slate-900/5">
            <h3 className="text-base font-black text-[#0A1C3E]">Resumo do Pedido</h3>

            {/* User Details */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1">
              <span className="text-slate-400 font-medium block text-[11px]">Conta conectada:</span>
              <p className="font-bold text-slate-800 truncate">{user.name || "Candidato StaziaMed"}</p>
              <p className="text-slate-500 truncate">{user.email || firebaseUser?.email}</p>
            </div>

            {/* Price Calculations */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal ({isAnnual ? "Plano Anual" : "Plano Mensal"}):</span>
                <span className="font-semibold">{displayAmount}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Ativação e taxas:</span>
                <span className="font-semibold text-emerald-600">Grátis</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <span className="text-sm font-bold text-slate-900">Total a pagar:</span>
                <span className="text-2xl font-black text-[#0A1C3E]">{displayAmount}</span>
              </div>
            </div>

            {/* Pay Button */}
            <div>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleStartPayment}
                className="w-full py-4 px-6 rounded-full bg-[#0D736A] hover:bg-[#0A5F57] text-white font-black text-sm shadow-xl shadow-teal-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Iniciando ambiente seguro...</span>
                  </>
                ) : (
                  <>
                    <span>Continuar para pagamento</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-4 border-t border-slate-100 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Garantia de 7 dias ou seu dinheiro de volta</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Cobrança segura e transparente. Ao confirmar, você concorda com os Termos de Uso do StaziaMed Revalida.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
