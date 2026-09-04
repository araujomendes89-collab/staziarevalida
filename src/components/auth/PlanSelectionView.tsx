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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8 text-left">
          {/* Option A: Plano Padrão / Inicial */}
          <div
            onClick={() => setSelectedPlan("standard")}
            className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
              selectedPlan === "standard"
                ? "border-[#00D2B4] bg-teal-50/30 shadow-sm"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">
                  Acesso Inicial
                </span>
                <h3 className="text-lg font-bold text-[#0A1C3E] mt-0.5">Plano Padrão</h3>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedPlan === "standard"
                    ? "border-[#00D2B4] bg-[#00D2B4] text-slate-950"
                    : "border-slate-300"
                }`}
              >
                {selectedPlan === "standard" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Ideal para iniciar seu diagnóstico de desempenho e praticar questões oficiais.
            </p>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Banco com 1.200+ questões oficiais</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Diagnóstico inicial por grandes áreas</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Caderno de erros básico</span>
              </li>
            </ul>
          </div>

          {/* Option B: Plano Completo */}
          <div
            onClick={() => setSelectedPlan("complete")}
            className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
              selectedPlan === "complete"
                ? "border-[#00D2B4] bg-teal-50/30 shadow-sm"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">
                  Preparação Avançada
                </span>
                <h3 className="text-lg font-bold text-[#0A1C3E] mt-0.5">Plano Completo</h3>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedPlan === "complete"
                    ? "border-[#00D2B4] bg-[#00D2B4] text-slate-950"
                    : "border-slate-300"
                }`}
              >
                {selectedPlan === "complete" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Recursos de IA avançada, simulador de estações práticas OSCE e flashcards inteligentes.
            </p>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Todos os recursos do plano padrão</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Simulador de Estações Práticas OSCE</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Tutor Socrático e flashcards adaptativos</span>
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
