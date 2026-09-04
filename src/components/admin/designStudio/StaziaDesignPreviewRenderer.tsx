import React from "react";
import {
  ShieldAlert,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
  ChevronRight,
  HelpCircle,
  Stethoscope,
  Pill,
  Activity,
  Bookmark,
  Pin,
  Flame,
  FileText,
  Clock,
  Check,
} from "lucide-react";
import { StaziaDesignTemplate } from "../../../types/adminDesignStudio";

export type PreviewViewport = "DESKTOP_1440" | "TABLET_768" | "MOBILE_390";

export interface StaziaDesignPreviewRendererProps {
  template: StaziaDesignTemplate;
  viewport?: PreviewViewport;
}

export const StaziaDesignPreviewRenderer: React.FC<StaziaDesignPreviewRendererProps> = ({
  template,
  viewport = "DESKTOP_1440",
}) => {
  const isMobile = viewport === "MOBILE_390";
  const isTablet = viewport === "TABLET_768";

  const getContainerMaxWidth = () => {
    if (isMobile) return "max-w-[390px]";
    if (isTablet) return "max-w-[768px]";
    return "max-w-[1280px]";
  };

  const tokens = template.staziaTokens || {};
  const isLightEditorial = tokens.pageMode === "LIGHT_EDITORIAL" || !tokens.pageMode;

  // Calibrated Editorial Colors (Light Paper-like)
  const pageBg = isLightEditorial ? (tokens.background || "#F8FAFC") : (tokens.background || "#06101E");
  const surfaceBg = isLightEditorial ? (tokens.surface || "#FFFFFF") : (tokens.surface || "#0B192C");
  const textPrimary = isLightEditorial ? (tokens.textPrimary || "#0A192F") : "#F8FAFC";
  const textSecondary = isLightEditorial ? (tokens.textSecondary || "#334155") : "#94A3B8";
  const borderCol = isLightEditorial ? (tokens.border || "#E2E8F0") : "#1E293B";
  const primaryTeal = tokens.primary || "#0D9488";
  const secondaryBlue = tokens.secondary || "#2563EB";
  const navyHeader = tokens.navy || "#0A192F";

  return (
    <div className="w-full flex flex-col items-center justify-center p-2 sm:p-4 bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden transition-all duration-300">
      {/* Editorial Mode Badge */}
      <div className="w-full flex items-center justify-between px-2 pb-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 font-bold">
            Style: MEDICAL EDITORIAL V1
          </span>
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 font-semibold">
            Mode: LIGHT EDITORIAL
          </span>
        </div>
        <span className="font-mono text-[10px]">Viewport: {viewport.replace("_", " ")}</span>
      </div>

      {/* Main Viewport Container */}
      <div
        style={{ backgroundColor: pageBg, color: textPrimary }}
        className={`w-full ${getContainerMaxWidth()} min-h-[550px] border border-slate-300 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300 font-sans`}
      >
        {/* 1. STAZIA EDITORIAL NAVY HEADER */}
        <header
          style={{ backgroundColor: navyHeader }}
          className="px-4 py-3 text-white flex items-center justify-between gap-3 shrink-0 shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-teal-500/20 border border-teal-400/40 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-teal-300" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-300 block">
                StaziaMed Editorial Revalida
              </span>
              <span className="text-xs font-bold text-white block -mt-0.5 truncate max-w-[200px] sm:max-w-xs">
                {template.name || "Diretrizes Clínicas 2026"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-teal-400 text-slate-950 font-bold">
              INEP 2026-READY
            </span>
          </div>
        </header>

        {/* 2. BRUSH SECTION HEADER */}
        <div className="px-4 sm:px-6 pt-5 pb-2">
          <div className="flex items-center gap-2 pb-1 border-b-2 border-teal-600/30 relative">
            <div className="w-2 h-5 bg-teal-600 rounded-xs" />
            <h1 style={{ color: navyHeader }} className="text-base sm:text-lg font-extrabold tracking-tight">
              Manejo da Hipertensão Arterial Resistente (HAR) no SUS
            </h1>
            <span className="ml-auto text-[10px] uppercase font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              Cardiologia • PCDT Oficial
            </span>
          </div>
        </div>

        {/* 3. QUICK SUMMARY STRIP */}
        <div className="px-4 sm:px-6 py-2">
          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <div className="flex items-center gap-1.5 font-semibold text-teal-800">
              <Check className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Tríade inicial otimizada</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-sky-800">
              <Check className="w-4 h-4 text-sky-600 shrink-0" />
              <span>4ª droga: Espironolactona</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-amber-800">
              <Check className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Descartar Avental Branco (MAPA)</span>
            </div>
          </div>
        </div>

        {/* 4. MAIN EDITORIAL BODY */}
        <div className={`px-4 sm:px-6 py-3 flex-1 flex ${isMobile ? "flex-col" : isTablet ? "flex-col" : "flex-row"} gap-5`}>
          {/* Left / Main Column */}
          <main className="flex-1 space-y-4">
            {/* EDITORIAL HERO BLOCK */}
            <div
              style={{ backgroundColor: surfaceBg, borderColor: borderCol }}
              className="p-4 sm:p-5 rounded-xl border shadow-xs space-y-2"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 inline-block">
                Definição Operacional
              </span>
              <p style={{ color: textSecondary }} className="text-xs leading-relaxed">
                A Hipertensão Arterial Resistente (HAR) é definida quando a PA permanece acima das metas recomendadas a despeito do uso de <strong>3 anti-hipertensivos de classes distintas</strong>, incluindo obrigatoriamente um bloqueador do SRAA, um BCC e um diurético tiazídico em doses máximas toleradas.
              </p>
            </div>

            {/* CLINICAL CARDS (Crisp White with Slate/Teal Accents) */}
            <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-3`}>
              {/* Card 1: Diagnostic Step */}
              <div
                style={{ backgroundColor: surfaceBg, borderColor: borderCol }}
                className="p-4 rounded-xl border shadow-xs space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-teal-50 border border-teal-200">
                    <Activity className="w-4 h-4 text-teal-700" />
                  </div>
                  <h3 style={{ color: navyHeader }} className="text-xs font-bold">
                    Critérios Diagnósticos
                  </h3>
                </div>
                <p style={{ color: textSecondary }} className="text-xs leading-relaxed">
                  Avaliar adesão terapêutica rigorosa e excluir causas de pseudo-resistência antes de introduzir nova classe medicamentosa.
                </p>
              </div>

              {/* Card 2: Pharmacological Step */}
              <div
                style={{ backgroundColor: surfaceBg, borderColor: borderCol }}
                className="p-4 rounded-xl border shadow-xs space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-blue-50 border border-blue-200">
                    <Pill className="w-4 h-4 text-blue-700" />
                  </div>
                  <h3 style={{ color: navyHeader }} className="text-xs font-bold">
                    4ª Droga de Escolha
                  </h3>
                </div>
                <p style={{ color: textSecondary }} className="text-xs leading-relaxed">
                  A <strong>Espironolactona (25–50 mg/dia)</strong> é a 4ª droga de escolha no SUS, atuando no bloqueio da aldosterona e retenção volêmica.
                </p>
              </div>
            </div>

            {/* CLINICAL WARNINGS (ATTENTION & HIGH RISK) */}
            <div className="space-y-2.5">
              {/* Variant: ATTENTION / EXAM TIP */}
              <div
                style={{
                  backgroundColor: tokens.examTipBackground || "#FFFBEB",
                  borderColor: tokens.examTipBorder || "#FBBF24",
                }}
                className="p-3.5 rounded-xl border shadow-xs flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800 block">
                    Dica de Prova • Pegadinha INEP
                  </span>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Antes de rotular o paciente como portador de HAR, é mandatória a realização de MAPA ou MRPA para descartar o efeito do avental branco.
                  </p>
                </div>
              </div>

              {/* Variant: HIGH RISK / CONTRAINDICATION */}
              <div
                style={{
                  backgroundColor: tokens.highRiskBackground || "#FEF2F2",
                  borderColor: tokens.highRiskBorder || "#EF4444",
                }}
                className="p-3.5 rounded-xl border shadow-xs flex items-start gap-2.5"
              >
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-red-800 block">
                    Alerta Clínico / Contraindicação
                  </span>
                  <p className="text-xs text-red-950 leading-relaxed">
                    Evitar Espironolactona se ritmo de filtração glomerular &lt; 30 mL/min/1,73m² ou Potássio sérico &gt; 5,0 mEq/L devido ao risco fatal de hipercalemia.
                  </p>
                </div>
              </div>
            </div>

            {/* EDITORIAL MEDICAL TABLE (Navy Header + Light Body) */}
            <div
              style={{ backgroundColor: surfaceBg, borderColor: borderCol }}
              className="rounded-xl border shadow-xs overflow-hidden"
            >
              <div
                style={{ backgroundColor: navyHeader }}
                className="px-3.5 py-2.5 text-white flex items-center justify-between"
              >
                <span className="text-xs font-bold">Quadro Sinóptico Farmacológico</span>
                <span className="text-[10px] text-teal-300 font-semibold">Tabela Editorial Stazia</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-800 divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-slate-700 text-[11px] uppercase font-bold">
                    <tr>
                      <th className="px-3.5 py-2">Fármaco</th>
                      <th className="px-3.5 py-2">Classe</th>
                      <th className="px-3.5 py-2">Posologia Inicial</th>
                      <th className="px-3.5 py-2">Ponto de Atenção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-slate-900">Espironolactona</td>
                      <td className="px-3.5 py-2.5 text-slate-600">Antagonista da Aldosterona</td>
                      <td className="px-3.5 py-2.5 font-semibold text-teal-700">25 mg 1x/dia</td>
                      <td className="px-3.5 py-2.5 text-red-700 font-medium">Monitorar K+ e Cr</td>
                    </tr>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-slate-900">Clonidina</td>
                      <td className="px-3.5 py-2.5 text-slate-600">Agonista Alfa-2 Central</td>
                      <td className="px-3.5 py-2.5 text-slate-700">0,100 mg 2x/dia</td>
                      <td className="px-3.5 py-2.5 text-amber-700 font-medium">Efeito rebote se suspensa</td>
                    </tr>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-slate-900">Doxazosina</td>
                      <td className="px-3.5 py-2.5 text-slate-600">Bloqueador Alfa-1</td>
                      <td className="px-3.5 py-2.5 text-slate-700">2 mg à noite</td>
                      <td className="px-3.5 py-2.5 text-slate-600">Hipotensão postural</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </main>

          {/* Right Column: Sticky Note & Protocol Update Card */}
          <aside className={`${isMobile || isTablet ? "w-full" : "w-64"} space-y-4 shrink-0`}>
            {/* STICKY NOTE (Yellow Post-It Effect) */}
            <div
              style={{
                backgroundColor: tokens.noteBackground || "#FEF9C3",
                borderColor: tokens.noteBorder || "#FDE047",
                color: tokens.noteText || "#713F12",
              }}
              className="p-4 rounded-xl border-2 shadow-md relative transform -rotate-1 transition-transform hover:rotate-0"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-yellow-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1 text-yellow-900">
                  <Pin className="w-3 h-3 text-yellow-800" />
                  Nota de Consultório
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-yellow-300/60 text-yellow-900">
                  Prática SUS
                </span>
              </div>
              <p className="text-xs leading-relaxed pt-2 font-medium">
                Na atenção primária, reforçar sempre a restrição de sódio (&lt; 2g/dia) e incentivo à cessação do tabagismo como pilares não-farmacológicos essenciais.
              </p>
            </div>

            {/* PROTOCOL UPDATE CARD (Purple / Teal Accent) */}
            <div
              style={{
                backgroundColor: tokens.updateBackground || "#FAF5FF",
                borderColor: tokens.updateBorder || "#C084FC",
              }}
              className="p-4 rounded-xl border shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-purple-800 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  Atualização 2026
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold border border-teal-300">
                  CONITEC / SBC
                </span>
              </div>
              <p className="text-xs text-purple-950 leading-relaxed font-medium">
                Inclusão formal de combinações em dose fixa tripla no elenco de medicamentos estratégicos da RENAME para otimização da adesão.
              </p>
            </div>
          </aside>
        </div>

        {/* 5. EDITORIAL FOOTER */}
        <footer
          style={{ backgroundColor: surfaceBg, borderColor: borderCol }}
          className="px-4 py-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 shrink-0"
        >
          <span>StaziaMed Revalida • Sistema de Design Editorial Médico</span>
          <span className="font-mono text-[10px] text-slate-400">Template: {template.id}</span>
        </footer>
      </div>
    </div>
  );
};
