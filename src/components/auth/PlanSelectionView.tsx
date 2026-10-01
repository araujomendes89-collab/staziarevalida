import React, { useState } from "react";
import { Check, ArrowRight, ShieldCheck, Sparkles, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useApp } from "../../context/AppContext";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

export const PlanSelectionView: React.FC = () => {
  const navigate = useNavigate();
  const { setActiveTab } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<string>("standard");

  const handleContinue = () => {
    setActiveTab("home");
    navigate("/");
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 font-sans relative overflow-hidden bg-[#F8FAFC] text-slate-800 selection:bg-teal-500/30 selection:text-teal-900">
      {/* Subtle Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[450px] bg-[#00D2B4]/8 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-[500px] h-[350px] bg-[#0284C7]/6 rounded-full blur-3xl" />
      </div>

      {/* Top Brand Area */}
      <div className="w-full max-w-4xl flex items-center justify-center pt-2 sm:pt-4 z-10">
        <StaziaMedLogo layout="vertical" size="sm" />
      </div>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl my-auto flex flex-col items-center text-center p-6 sm:p-10 rounded-3xl bg-white border border-slate-200/90 shadow-xl shadow-slate-900/5 z-10"
      >
        {/* Headline & Subheadline */}
        <div className="space-y-2 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/60 text-teal-800 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Conta criada com sucesso</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0A1C3E]">
            Escolha como quer começar.
          </h1>
          <p className="text-sm font-normal text-slate-600 max-w-md mx-auto leading-relaxed">
            Selecione o plano que melhor combina com sua preparação para o Revalida.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full mb-8 text-left">
          {/* Option A: Trial 7 Dias */}
          <div
            onClick={() => setSelectedPlan("trial")}
            className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
              selectedPlan === "trial"
                ? "border-[#00D2B4] bg-teal-50/40 shadow-sm"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">
                  Degustação Gratuita
                </span>
                <h3 className="text-base font-bold text-[#0A1C3E] mt-0.5">Trial 7 Dias</h3>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedPlan === "trial"
                    ? "border-[#00D2B4] bg-[#00D2B4] text-slate-950"
                    : "border-slate-300"
                }`}
              >
                {selectedPlan === "trial" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Avaliação inicial com até 100 questões oficiais e 1 prova demonstrativa.
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Até 100 questões no período</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>1 prova completa oficial</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Até 20 flashcards e 10 IAs</span>
              </li>
            </ul>
          </div>

          {/* Option B: Stazia PRO */}
          <div
            onClick={() => setSelectedPlan("pro")}
            className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
              selectedPlan === "pro"
                ? "border-[#00D2B4] bg-teal-50/40 shadow-sm"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">
                  Plano Principal
                </span>
                <h3 className="text-base font-bold text-[#0A1C3E] mt-0.5">Stazia PRO</h3>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedPlan === "pro"
                    ? "border-[#00D2B4] bg-[#00D2B4] text-slate-950"
                    : "border-slate-300"
                }`}
              >
                {selectedPlan === "pro" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Banco completo ilimitado, caderno inteligente e cronograma.
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Questões ilimitadas + ENAMED</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Caderno de erros inteligente</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Flashcards FSRS ilimitados</span>
              </li>
            </ul>
          </div>

          {/* Option C: Stazia Elite */}
          <div
            onClick={() => setSelectedPlan("elite")}
            className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
              selectedPlan === "elite"
                ? "border-purple-500 bg-purple-50/40 shadow-sm"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">
                  Nível Premium
                </span>
                <h3 className="text-base font-bold text-[#0A1C3E] mt-0.5">Stazia Elite</h3>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedPlan === "elite"
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-slate-300"
                }`}
              >
                {selectedPlan === "elite" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Tudo do PRO + AI Coach socrático, Modo Pareto e simulados adaptativos.
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Stazia AI Coach & Pareto</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Simulados adaptativos calibrados</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Grupo VIP & Mentoria direta</span>
              </li>
            </ul>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          id="btn-confirm-plan"
          onClick={handleContinue}
          className="w-full max-w-sm min-h-[50px] py-3.5 px-6 rounded-xl bg-[#0A1C3E] hover:bg-[#0E2856] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99]"
        >
          <span>Começar preparação</span>
          <ArrowRight className="w-4 h-4 text-[#00D2B4]" />
        </button>
      </motion.div>

      {/* Legal Footer */}
      <div className="w-full max-w-md text-center py-2 z-10">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Ao continuar, você concorda com nossos{" "}
          <button
            type="button"
            onClick={() => navigate("/termos-de-uso")}
            className="font-semibold text-slate-700 hover:text-teal-600 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Termos de Uso
          </button>{" "}
          e{" "}
          <button
            type="button"
            onClick={() => navigate("/politica-de-privacidade")}
            className="font-semibold text-slate-700 hover:text-teal-600 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Política de Privacidade
          </button>
          .
        </p>
      </div>
    </div>
  );
};
