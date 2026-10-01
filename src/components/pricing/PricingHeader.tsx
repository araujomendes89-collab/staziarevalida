import React from "react";
import { ShieldCheck, CreditCard, Award, TrendingUp } from "lucide-react";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const PricingHeader: React.FC = () => {
  return (
    <div className="w-full text-center space-y-3 pt-6 sm:pt-10 pb-4 max-w-3xl mx-auto">
      {/* Brand Logo in header matching reference */}
      <div className="flex items-center justify-center mb-4">
        <StaziaMedLogo layout="horizontal" size="md" />
      </div>

      <h1 className="text-2xl sm:text-4xl font-black text-[#0A1C3E] tracking-tight">
        Escolha o plano ideal para sua preparação
      </h1>

      <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
        Do teste gratuito ao acompanhamento avançado: escolha o nível certo para acelerar sua aprovação no Revalida e ENAMED.
      </p>
    </div>
  );
};

export const PricingFooter: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto mt-14 pt-8 border-t border-slate-200/80 space-y-6">
      {/* 4 Trust Badges from Reference image */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0A1C3E]">Pagamento seguro</h4>
            <p className="text-[11px] text-slate-500">Seus dados protegidos</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0A1C3E]">Cancele quando quiser</h4>
            <p className="text-[11px] text-slate-500">Sem fidelidade no mensal</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700 shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0A1C3E]">Metodologia Validada</h4>
            <p className="text-[11px] text-slate-500">100% alinhada à matriz INEP</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0A1C3E]">Evolução real</h4>
            <p className="text-[11px] text-slate-500">Do estudo à aprovação</p>
          </div>
        </div>
      </div>

      {/* Mandatory closing statement */}
      <div className="text-center pt-2">
        <p className="text-xs text-slate-500 font-medium">
          Todos os planos foram pensados para transformar desempenho em estratégia de estudo.
        </p>
      </div>
    </div>
  );
};
