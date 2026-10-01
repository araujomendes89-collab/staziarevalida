import React, { useState } from "react";
import { CheckCircle2, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

interface CheckoutSuccessModalProps {
  isOpen: boolean;
  plan: "pro" | "elite";
  onClose: () => void;
  onGoToDashboard: () => void;
}

export const CheckoutSuccessModal: React.FC<CheckoutSuccessModalProps> = ({
  isOpen,
  plan,
  onClose,
  onGoToDashboard,
}) => {
  if (!isOpen) return null;

  const isElite = plan === "elite";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] border border-slate-200 max-w-md w-full p-6 sm:p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
            Pagamento Confirmado
          </span>
          <h3 className="text-2xl font-black text-[#0A1C3E] tracking-tight mt-1">
            {isElite ? "Bem-vindo ao Stazia Elite" : "Seu plano PRO está ativo"}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
            Sua assinatura foi processada e todos os recursos exclusivos do plano{" "}
            <strong>{isElite ? "Stazia Elite" : "Stazia PRO"}</strong> já estão liberados em sua conta.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span>Recursos liberados imediatamente:</span>
          </div>
          <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
            <li>Banco de questões oficiais e inéditas liberado</li>
            <li>Simulados completos e caderno de erros inteligente</li>
            {isElite && <li>Stazia AI Coach e Modo Pareto 80/20 ativados</li>}
          </ul>
        </div>

        <div>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="w-full py-3.5 px-6 rounded-full bg-[#0D736A] hover:bg-[#0A5F57] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-900/20 cursor-pointer transition-all active:scale-[0.98]"
          >
            <span>Ir para a plataforma</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
