import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CreditCard,
  Crown,
  Gem,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import { BillingClient, MySubscriptionResult } from "../../services/billingClient";
import { useEntitlements } from "../../hooks/useEntitlements";
import { useApp } from "../../context/AppContext";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const MySubscriptionView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useApp();
  const { plan: currentPlan, isTrial, trialDaysRemaining, refresh } = useEntitlements();

  const [subscription, setSubscription] = useState<MySubscriptionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    async function loadSub() {
      try {
        setLoading(true);
        const sub = await BillingClient.getMySubscription();
        setSubscription(sub);
      } catch (err) {
        console.warn("[MySubscriptionView] Error loading sub:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSub();
  }, []);

  const handleCancel = async () => {
    if (canceling) return;
    setCanceling(true);
    try {
      const res = await BillingClient.cancelSubscription();
      setCancelSuccessMsg(
        `Sua assinatura foi cancelada. Você continuará tendo acesso completo até ${new Date(res.expiresAt).toLocaleDateString("pt-BR")}.`
      );
      setShowCancelModal(false);
      await refresh();
      // Recarrega detalhes
      const updated = await BillingClient.getMySubscription();
      setSubscription(updated);
    } catch (e: any) {
      alert(e?.message || "Erro ao cancelar.");
    } finally {
      setCanceling(false);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "Não informado";
    try {
      return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const isPro = currentPlan === "pro";
  const isElite = currentPlan === "elite";

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5"
          >
            <span>← Voltar para o início</span>
          </Link>
          <StaziaMedLogo layout="horizontal" size="sm" />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0A1C3E] tracking-tight">
            Minha Assinatura
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gerencie seu plano atual, ciclo de cobrança, renovação e opções de upgrade.
          </p>
        </div>

        {/* Cancel Feedback message */}
        {cancelSuccessMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{cancelSuccessMsg}</span>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white rounded-[32px] border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xl shadow-slate-900/5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              <p className="text-xs text-slate-400 font-semibold">Carregando dados da assinatura...</p>
            </div>
          ) : (
            <>
              {/* Plan Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    isElite ? "bg-slate-900 text-white" : isPro ? "bg-[#0D736A] text-white" : "bg-teal-50 text-teal-700 border border-teal-200"
                  }`}>
                    {isElite ? <Gem className="w-7 h-7" /> : <Crown className="w-7 h-7" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-[#0A1C3E]">
                        {subscription?.planName || `Plano ${currentPlan.toUpperCase()}`}
                      </h2>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                        subscription?.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : subscription?.status === "canceled"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {subscription?.status === "active" ? "Ativo" : subscription?.status === "canceled" ? "Cancelamento Agendado" : "Degustação"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isTrial
                        ? `${trialDaysRemaining} dias restantes de período gratuito`
                        : subscription?.billingCycle === "yearly"
                        ? "Cobrança Anual"
                        : "Cobrança Recorrente Mensal"}
                    </p>
                  </div>
                </div>

                {/* Upgrade Button */}
                {subscription?.canUpgrade && currentPlan !== "elite" && (
                  <Link
                    to="/checkout?plan=elite&cycle=annual"
                    className="py-2.5 px-5 rounded-full bg-[#0A2540] hover:bg-[#07192C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all self-start sm:self-center"
                  >
                    <span>Fazer upgrade para Elite</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              {/* Grid of details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                  <span className="text-slate-400 block mb-1">Início da vigência:</span>
                  <span className="font-bold text-slate-800">{formatDate(subscription?.startsAt)}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                  <span className="text-slate-400 block mb-1">
                    {subscription?.status === "canceled" ? "Acesso válido até:" : "Próxima renovação:"}
                  </span>
                  <span className="font-bold text-slate-800">{formatDate(subscription?.expiresAt || subscription?.trialEndsAt)}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                  <span className="text-slate-400 block mb-1">Valor do ciclo:</span>
                  <span className="font-bold text-[#0A1C3E]">
                    {isTrial
                      ? "R$ 0 (Gratuito)"
                      : subscription?.billingCycle === "yearly"
                      ? `R$ ${subscription?.priceYearly?.toFixed(2)} / ano`
                      : `R$ ${subscription?.priceMonthly?.toFixed(2)} / mês`}
                  </span>
                </div>
              </div>

              {/* Cancellation Option for Paid Plans */}
              {!isTrial && subscription?.status === "active" && (
                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Ao cancelar, você mantém seu acesso até o término do período já faturado.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                  >
                    Cancelar assinatura
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Cancellation */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-[#0A1C3E]">Tem certeza que deseja cancelar?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Você não perderá o acesso imediatamente. Seu plano continuará ativo normalmente até o fim do período já pago ({formatDate(subscription?.expiresAt)}).
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={canceling}
                onClick={handleCancel}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                {canceling ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
