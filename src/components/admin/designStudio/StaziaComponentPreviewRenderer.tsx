import React, { useState } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Calculator,
  Calendar,
  Layers,
  Activity,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  StaziaComponentDraft,
  StaziaComponentNode,
} from "../../../types/componentCapture";
import { PreviewViewport } from "./StaziaDesignPreviewRenderer";

interface StaziaComponentPreviewRendererProps {
  draft: StaziaComponentDraft;
  viewport?: PreviewViewport;
  onViewportChange?: (vp: PreviewViewport) => void;
}

export const StaziaComponentPreviewRenderer: React.FC<StaziaComponentPreviewRendererProps> = ({
  draft,
  viewport = "DESKTOP_1440",
  onViewportChange,
}) => {
  const [activeVp, setActiveVp] = useState<PreviewViewport>(viewport);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [openAccordionIdx, setOpenAccordionIdx] = useState<number | null>(0);
  const [calcInputs, setCalcInputs] = useState<Record<string, string>>({});
  const [calcResult, setCalcResult] = useState<string | null>(null);

  const handleVpChange = (vp: PreviewViewport) => {
    setActiveVp(vp);
    if (onViewportChange) onViewportChange(vp);
  };

  const getContainerWidthClass = () => {
    switch (activeVp) {
      case "MOBILE_390":
        return "max-w-[390px]";
      case "TABLET_768":
        return "max-w-[768px]";
      default:
        return "max-w-[1140px]";
    }
  };

  const renderNode = (node: StaziaComponentNode) => {
    switch (node.type) {
      case "StaziaCardGroup":
        return (
          <div
            key={node.id}
            data-testid="stazia-card-group-node"
            className={`grid gap-4 ${
              activeVp === "MOBILE_390"
                ? "grid-cols-1"
                : activeVp === "TABLET_768"
                ? "grid-cols-2"
                : "grid-cols-1 md:grid-cols-3"
            }`}
          >
            {node.children?.map((child) => renderNode(child))}
          </div>
        );

      case "StaziaCard":
        return (
          <div
            key={node.id}
            data-testid="stazia-card-node"
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 uppercase tracking-wider">
                {node.props?.badgeText || "Revalida"}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">StaziaCard</span>
            </div>
            <h4 className="text-sm font-bold text-[#0A192F] leading-snug">
              {node.props?.title || "Título do Cartão Médico"}
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              {node.props?.description || "Descrição de conduta médica e critérios diagnósticos."}
            </p>
            {node.props?.conductTip && (
              <div className="p-2.5 rounded-xl bg-[#FEF9C3] border border-[#FDE047] text-[#713F12] text-[11px] font-medium">
                💡 <strong>Dica de Conduta:</strong> {node.props.conductTip}
              </div>
            )}
            <button
              type="button"
              className="w-full py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>{node.props?.buttonLabel || "Acessar Protocolo"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );

      case "StaziaTable":
        return (
          <div
            key={node.id}
            data-testid="stazia-table-node"
            className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs space-y-2 p-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="text-sm font-bold text-[#0A192F] flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600" />
                {node.props?.title || "Tabela Médica Editorial"}
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                StaziaMedicalTable
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0A192F] text-white">
                    {node.props?.headers?.map((h: string, idx: number) => (
                      <th key={idx} className="p-3 font-semibold text-xs tracking-tight">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {node.props?.rows?.map((row: string[], rIdx: number) => (
                    <tr
                      key={rIdx}
                      className={rIdx % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}
                    >
                      {row.map((cell: string, cIdx: number) => (
                        <td key={cIdx} className="p-3 text-slate-700 font-medium">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "StaziaFilterPanel":
        return (
          <div
            key={node.id}
            data-testid="stazia-filter-panel-node"
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#0A192F] flex items-center gap-1.5 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5 text-teal-600" />
                {node.props?.title || "Painel de Filtros"}
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-700">
                Interactive Panel
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={node.props?.searchPlaceholder || "Buscar termo..."}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-teal-500 text-slate-800"
                />
              </div>

              <select className="py-2 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white text-slate-800 font-medium">
                {node.props?.options?.map((opt: string, idx: number) => (
                  <option key={idx} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Filtrar
              </button>
            </div>
          </div>
        );

      case "StaziaFormLayout":
        return (
          <div
            key={node.id}
            data-testid="stazia-calculator-layout-node"
            className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-[#0A192F] flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-teal-600" />
                  {node.props?.title || "Calculadora Clínica"}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">{node.props?.description}</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                Layout Capturado (Fórmula Nativa Stazia)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {node.props?.inputs?.map((inp: any) => (
                <div key={inp.id} className="space-y-1">
                  <label className="text-xs font-semibold text-[#0A192F] block">{inp.label}</label>
                  <input
                    type={inp.type || "text"}
                    placeholder={inp.placeholder}
                    value={calcInputs[inp.id] || ""}
                    onChange={(e) =>
                      setCalcInputs((prev) => ({ ...prev, [inp.id]: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-teal-500 text-slate-800"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setCalcResult(
                    node.props?.resultPlaceholder ||
                      "Resultado demonstrativo calculado com sucesso."
                  )
                }
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
              >
                {node.props?.buttonLabel || "Calcular Escore"}
              </button>

              {calcResult && (
                <div className="flex-1 p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{calcResult}</span>
                </div>
              )}
            </div>
          </div>
        );

      case "StaziaTabs":
        return (
          <div
            key={node.id}
            data-testid="stazia-tabs-node"
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
              {node.props?.tabs?.map((t: string, idx: number) => {
                const isActive = activeTabIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveTabIndex(idx)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#0A192F] text-white shadow-xs"
                        : "text-slate-600 hover:text-[#0A192F] hover:bg-slate-100"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-100 text-xs text-slate-700 leading-relaxed">
              Conteúdo da aba: <strong>{node.props?.tabs?.[activeTabIndex] || "Aba Ativa"}</strong>. Estrutura isolada pronta para integração editorial.
            </div>
          </div>
        );

      case "StaziaAccordion":
        return (
          <div
            key={node.id}
            data-testid="stazia-accordion-node"
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5"
          >
            {node.props?.items?.map((item: any, idx: number) => {
              const isOpen = openAccordionIdx === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 overflow-hidden bg-[#F8FAFC]"
                >
                  <button
                    type="button"
                    onClick={() => setOpenAccordionIdx(isOpen ? null : idx)}
                    className="w-full p-3.5 text-left flex items-center justify-between gap-3 text-xs font-bold text-[#0A192F] hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span>{item.title}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="p-3.5 pt-0 text-xs text-slate-600 leading-relaxed border-t border-slate-200/60 bg-white">
                      {item.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case "StaziaTimeline":
        return (
          <div
            key={node.id}
            data-testid="stazia-timeline-node"
            className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4"
          >
            <h4 className="text-xs font-bold text-[#0A192F] uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              Linha do Tempo de Conduta Clínica
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {node.props?.steps?.map((step: any, idx: number) => (
                <div key={idx} className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-1.5">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-teal-600 text-white">
                    {step.step}
                  </span>
                  <h5 className="text-xs font-bold text-[#0A192F]">{step.title}</h5>
                  <p className="text-[11px] text-slate-600 leading-snug">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case "StaziaHero":
        return (
          <div
            key={node.id}
            data-testid="stazia-hero-node"
            className="p-8 rounded-2xl bg-gradient-to-br from-[#0A192F] to-[#0F243D] text-white shadow-xl space-y-3"
          >
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 uppercase tracking-widest">
              {node.props?.badge || "StaziaMed"}
            </span>
            <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              {node.props?.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {node.props?.subtitle}
            </p>
          </div>
        );

      default:
        return (
          <div
            key={node.id}
            data-testid="stazia-generic-node"
            className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0A192F]">{node.props?.title || "Bloco StaziaMed"}</h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {node.type}
              </span>
            </div>
            <p className="text-xs text-slate-600">{node.props?.description || "Componente genérico renderizado."}</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4" data-testid="stazia-component-preview-container">
      {/* Viewport bar & metadata badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#091526] border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{draft.name}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
            {draft.componentType}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            {draft.styleProfile}
          </span>
        </div>

        {/* Viewport switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            type="button"
            data-testid="vp-desktop-btn"
            onClick={() => handleVpChange("DESKTOP_1440")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeVp === "DESKTOP_1440"
                ? "bg-teal-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>1440px</span>
          </button>
          <button
            type="button"
            data-testid="vp-tablet-btn"
            onClick={() => handleVpChange("TABLET_768")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeVp === "TABLET_768"
                ? "bg-teal-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span>768px</span>
          </button>
          <button
            type="button"
            data-testid="vp-mobile-btn"
            onClick={() => handleVpChange("MOBILE_390")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeVp === "MOBILE_390"
                ? "bg-teal-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>390px</span>
          </button>
        </div>
      </div>

      {/* Main Preview Frame (Off-white paper background for Medical Editorial) */}
      <div className="w-full bg-[#E2E8F0]/40 p-4 sm:p-8 rounded-2xl border border-slate-300/60 min-h-[380px] flex items-center justify-center overflow-x-auto">
        <div
          className={`w-full ${getContainerWidthClass()} transition-all duration-300`}
        >
          {renderNode(draft.componentTree)}
        </div>
      </div>
    </div>
  );
};
