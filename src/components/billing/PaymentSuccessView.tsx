import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ArrowRight, Sparkles, Crown, Gem, BookOpen, Layers, MessageSquare } from "lucide-react";
import { useEntitlements } from "../../hooks/useEntitlements";
import { useApp } from "../../context/AppContext";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const PaymentSuccessView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get("plan");
  const isElite = planParam === "elite";

  const { refresh } = useEntitlements();
  const { updateUserProfile, setActiveTab } = useApp();

  useEffect(() => {
    // Atualiza imediatamente o perfil e os entitlements
    refresh();
    updateUserProfile({
      plan: isElite ? "elite" : "pro",
      tier: isElite ? "ELITE" : "PRO",
    });
  }, [isElite]);

  const handleGoToPlatform = () => {
    setActiveTab("home");
    navigate("/");
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 flex flex-col justify-between items-center p-6 sm:p-10 font-sans">
      <div className="w-full max-w-lg mx-auto flex items-center justify-between">
        <StaziaMedLogo layout="horizontal" size="sm" />
        <span className="text-xs text-emerald-600 font-bold uppercase tracking-wider bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          Pagamento Aprovado
        </span>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 p-8 sm:p-10 max-w-lg w-full text-center space-y-6 shadow-2xl shadow-slate-900/5 my-auto relative overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Success Icon */}
        <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-md">
          <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
        </div>

        {/* Title and Subtitle */}
        <div className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
            Assinatura Ativada
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0A1C3E] tracking-tight mt-2">
            {isElite ? "Bem-vindo ao Stazia Elite" : "Seu Stazia PRO está ativo"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
            {isElite
              ? "Seu pagamento foi confirmado e todos os recursos Elite já estão liberados em sua conta."
              : "Seu pagamento foi confirmado e os recursos do plano PRO já estão disponíveis para a sua preparação."}
          </p>
        </div>

        {/* Unlocked Features Highlights */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 text-left space-y-3 text-xs">
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span>Recursos liberados imediatamente:</span>
          </div>
          <div className="space-y-2 text-slate-600">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Banco de questões oficiais (Revalida + ENAMED) e inéditas</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Caderno de erros inteligente e cronograma adaptativo</span>
            </div>
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Inteligência Artificial para explicações e resolução passo a passo</span>
            </div>
            {isElite && (
              <div className="flex items-center gap-2.5 font-semibold text-slate-900">
                <Gem className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Stazia AI Coach socrático e Modo Pareto (80/20) ativados</span>
              </div>
            )}
          </div>
        </div>

        {/* Go to Dashboard CTA */}
        <div>
          <button
            type="button"
            onClick={handleGoToPlatform}
            className="w-full py-4 px-6 rounded-full bg-[#0D736A] hover:bg-[#0A5F57] text-white font-black text-sm shadow-xl shadow-teal-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <span>{isElite ? "Acessar o Stazia Elite" : "Ir para a plataforma"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="text-center text-xs text-slate-400">
        StaziaMed Revalida • Sua aprovação com estratégia e inteligência
      </div>
    </div>
  );
};
