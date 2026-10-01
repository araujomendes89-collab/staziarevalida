import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, ShieldCheck, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { BillingClient, PaymentStatusResult } from "../../services/billingClient";
import { useEntitlements } from "../../hooks/useEntitlements";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const PaymentProcessingView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const shouldSimulate = searchParams.get("simulate") === "true";

  const { refresh } = useEntitlements();
  const [pollCount, setPollCount] = useState(0);
  const [statusResult, setStatusResult] = useState<PaymentStatusResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulatingApproval, setIsSimulatingApproval] = useState(false);
  const intervalRef = useRef<any>(null);

  // Função para verificar status no backend
  const checkStatus = async () => {
    if (!paymentId) return;
    try {
      const result = await BillingClient.getPaymentStatus(paymentId);
      setStatusResult(result);

      if (result.status === "paid") {
        clearInterval(intervalRef.current);
        await refresh();
        navigate(`/pagamento/sucesso?payment_id=${paymentId}&plan=${result.plan}`);
        return;
      }

      if (result.status === "failed" || result.status === "canceled") {
        clearInterval(intervalRef.current);
        navigate(`/pagamento/erro?payment_id=${paymentId}&reason=${encodeURIComponent(result.failureReason || "Pagamento não aprovado")}`);
        return;
      }
    } catch (err: any) {
      console.warn("[PaymentProcessingView] Status check error:", err);
    }
  };

  useEffect(() => {
    if (!paymentId) {
      setErrorMessage("Identificador de pagamento não fornecido.");
      return;
    }

    // Primeira verificação imediata
    checkStatus();

    // Polling seguro com intervalo razoável de 3 segundos (máximo 15 tentativas = 45 segundos)
    intervalRef.current = setInterval(() => {
      setPollCount((prev) => {
        if (prev >= 15) {
          clearInterval(intervalRef.current);
          return prev;
        }
        checkStatus();
        return prev + 1;
      });
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paymentId]);

  // Ação para simular aprovação do gateway em ambiente de desenvolvimento/teste
  const handleSimulateApprove = async () => {
    if (!paymentId || isSimulatingApproval) return;
    setIsSimulatingApproval(true);
    try {
      await BillingClient.simulateGatewayAction(paymentId, "approve");
      await checkStatus();
    } catch (e: any) {
      console.error("Simulation error:", e);
    } finally {
      setIsSimulatingApproval(false);
    }
  };

  const handleSimulateReject = async () => {
    if (!paymentId || isSimulatingApproval) return;
    setIsSimulatingApproval(true);
    try {
      await BillingClient.simulateGatewayAction(paymentId, "reject");
      await checkStatus();
    } catch (e: any) {
      console.error("Simulation error:", e);
    } finally {
      setIsSimulatingApproval(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 flex flex-col justify-between items-center p-6 sm:p-10 font-sans">
      <div className="w-full max-w-lg mx-auto flex items-center justify-between">
        <StaziaMedLogo layout="horizontal" size="sm" />
        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Gateway Sandbox</span>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-2xl shadow-slate-900/5 my-auto">
        {/* Animated Loading Spinner */}
        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-teal-100 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#0D736A] animate-spin" />
          <Loader2 className="w-8 h-8 text-[#0D736A] animate-spin" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black text-[#0A1C3E] tracking-tight">
            Estamos confirmando seu pagamento...
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Aguardando a confirmação oficial da operadora ou banco. Este processo normalmente leva apenas alguns segundos.
          </p>
        </div>

        {/* Status Box */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-2 text-left">
          <div className="flex items-center justify-between text-slate-600">
            <span>Status atual:</span>
            <span className="font-bold text-amber-600 uppercase tracking-wider text-[11px] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {statusResult?.status === "processing" ? "Em processamento" : "Aguardando confirmação"}
            </span>
          </div>
          {paymentId && (
            <div className="flex items-center justify-between text-slate-500 text-[11px]">
              <span>ID da Transação:</span>
              <span className="font-mono text-slate-700">{paymentId}</span>
            </div>
          )}
        </div>

        {/* Simulação rápida para Desenvolvimento / Avaliação do Usuário */}
        {shouldSimulate && (
          <div className="p-4 rounded-2xl bg-teal-50/50 border border-teal-200/80 space-y-3 text-left">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Painel de Simulação do Gateway</span>
            </div>
            <p className="text-[11px] text-teal-700">
              Como as credenciais de produção do gateway ainda não estão configuradas, use os botões abaixo para simular o retorno da adquirente:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isSimulatingApproval}
                onClick={handleSimulateApprove}
                className="py-2.5 px-3 rounded-xl bg-[#0D736A] hover:bg-[#0A5F57] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Simular Aprovação</span>
              </button>
              <button
                type="button"
                disabled={isSimulatingApproval}
                onClick={handleSimulateReject}
                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Simular Recusa</span>
              </button>
            </div>
          </div>
        )}

        {/* Se o polling atingiu o limite máximo */}
        {pollCount >= 15 && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Pagamento Pendente</span>
            </div>
            <p className="text-xs text-amber-800">
              Ainda não recebemos a confirmação da sua instituição financeira. Não se preocupe: assim que o banco aprovar a transação, seu plano será liberado automaticamente.
            </p>
            <div className="pt-2">
              <Link
                to="/conta/assinatura"
                className="text-xs font-bold text-teal-800 hover:underline inline-flex items-center gap-1"
              >
                <span>Acompanhar na área da Minha Assinatura</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-400">
        StaziaMed Revalida • Ambiente Criptografado de Pagamentos
      </div>
    </div>
  );
};
