import React from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, RefreshCw, ArrowLeft, ShieldAlert } from "lucide-react";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const PaymentErrorView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const reason = searchParams.get("reason") || "A operadora não autorizou a transação.";

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 flex flex-col justify-between items-center p-6 sm:p-10 font-sans">
      <div className="w-full max-w-lg mx-auto flex items-center justify-between">
        <StaziaMedLogo layout="horizontal" size="sm" />
        <span className="text-xs text-rose-600 font-bold uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
          Pagamento Não Concluído
        </span>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-2xl shadow-slate-900/5 my-auto">
        {/* Error Icon */}
        <div className="w-20 h-20 rounded-3xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto shadow-md">
          <AlertTriangle className="w-10 h-10 stroke-[2.5]" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-[#0A1C3E] tracking-tight">
            Não foi possível confirmar seu pagamento.
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Nenhuma cobrança definitiva foi efetuada e seu plano permanece inalterado.
          </p>
        </div>

        {/* Reason Box */}
        <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100 text-left space-y-1.5 text-xs text-rose-900">
          <span className="font-bold block">Motivo informado pelo banco:</span>
          <p className="text-rose-700">{reason}</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/checkout")}
            className="w-full py-4 px-6 rounded-full bg-[#0D736A] hover:bg-[#0A5F57] text-white font-bold text-sm shadow-xl shadow-teal-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tentar novamente</span>
          </button>

          <Link
            to="/planos"
            className="w-full py-3.5 px-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Escolher outro plano ou método</span>
          </Link>
        </div>
      </div>

      <div className="text-center text-xs text-slate-400">
        Dúvidas? Entre em contato com nossa equipe em suporte@staziamed.com.br
      </div>
    </div>
  );
};
