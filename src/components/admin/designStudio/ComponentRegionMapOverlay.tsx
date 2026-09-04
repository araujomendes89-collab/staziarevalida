import React, { useState } from "react";
import {
  Layers,
  Layout,
  CheckCircle2,
  Sliders,
  Table,
  Cpu,
  Eye,
  Info,
  ChevronRight,
  Shield,
  HelpCircle,
  FileCode,
  Zap,
} from "lucide-react";
import {
  DetectedComponentCandidate,
  ComponentClassification,
} from "../../../types/componentCapture";

interface ComponentRegionMapOverlayProps {
  candidates: DetectedComponentCandidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidate: DetectedComponentCandidate) => void;
  onTransformSelected: () => void;
  isTransforming?: boolean;
}

export const ComponentRegionMapOverlay: React.FC<ComponentRegionMapOverlayProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onTransformSelected,
  isTransforming = false,
}) => {
  const [inspectCandidate, setInspectCandidate] = useState<DetectedComponentCandidate | null>(null);

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) || null;

  const getClassificationBadge = (classification: ComponentClassification) => {
    switch (classification) {
      case "FUNCTIONAL_TOOL":
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Ferramenta / Calculadora (Layout Apenas)
          </span>
        );
      case "INTERACTIVE_COMPONENT":
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            Componente Interativo
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
            Componente Visual
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" data-testid="component-region-map-container">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#091526] border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              {candidates.length} Componentes Detectados na Referência
            </span>
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Mapa de Regiões & Seleção de Componentes
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Clique em uma região ou candidato na lista abaixo para isolar e reconstruir com a identidade StaziaMed.
          </p>
        </div>

        <div>
          <button
            type="button"
            data-testid="btn-transform-selected-component"
            onClick={onTransformSelected}
            disabled={!selectedCandidate || isTransforming}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
              selectedCandidate && !isTransforming
                ? "bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-teal-500/20"
                : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
            }`}
          >
            <Zap className="w-4 h-4" />
            {isTransforming
              ? "Transformando Componente..."
              : selectedCandidate
              ? `Transformar: ${selectedCandidate.type}`
              : "Selecione um Componente"}
          </button>
        </div>
      </div>

      {/* Main layout: Visual Region Map (Left/Top) + Candidates List (Right/Bottom) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Map (Diagram of page wireframe with bounding boxes) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Layout className="w-3.5 h-3.5 text-teal-400" />
              Diagrama Estrutural da Página (Overlay de Regiões)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Viewport: 1440x900
            </span>
          </div>

          <div
            data-testid="visual-wireframe-overlay"
            className="w-full bg-[#06101E] border border-slate-800 rounded-2xl p-4 min-h-[380px] relative overflow-hidden flex flex-col gap-3 shadow-inner"
          >
            {/* Top Bar / Header Region */}
            {candidates
              .filter((c) => c.type === "HEADER" || c.type === "TOPBAR" || c.type === "NAV")
              .map((c) => {
                const isSelected = selectedCandidateId === c.id;
                return (
                  <div
                    key={c.id}
                    data-testid={`region-box-${c.id}`}
                    onClick={() => onSelectCandidate(c)}
                    className={`w-full p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-teal-500/20 border-teal-400 shadow-md shadow-teal-500/10 ring-2 ring-teal-400/30"
                        : "bg-slate-900/80 border-slate-700 hover:border-slate-500 hover:bg-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                      <span className="text-xs font-bold text-white">{c.label}</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {c.type}
                    </span>
                  </div>
                );
              })}

            {/* Middle Region (Sidebar + Main Content sections) */}
            <div className="flex-1 grid grid-cols-12 gap-3 min-h-[220px]">
              {/* Sidebar column if detected */}
              {candidates.some((c) => c.type === "SIDEBAR") ? (
                candidates
                  .filter((c) => c.type === "SIDEBAR")
                  .map((c) => {
                    const isSelected = selectedCandidateId === c.id;
                    return (
                      <div
                        key={c.id}
                        data-testid={`region-box-${c.id}`}
                        onClick={() => onSelectCandidate(c)}
                        className={`col-span-4 p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "bg-teal-500/20 border-teal-400 shadow-md ring-2 ring-teal-400/30"
                            : "bg-slate-900/80 border-slate-700 hover:border-slate-500"
                        }`}
                      >
                        <div>
                          <span className="text-xs font-bold text-white block">{c.label}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                            {c.hierarchyPath}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-300 self-start">
                          {c.type}
                        </span>
                      </div>
                    );
                  })
              ) : null}

              {/* Main Content Area */}
              <div
                className={`${
                  candidates.some((c) => c.type === "SIDEBAR") ? "col-span-8" : "col-span-12"
                } flex flex-col gap-2.5`}
              >
                {candidates
                  .filter(
                    (c) =>
                      c.type !== "HEADER" &&
                      c.type !== "TOPBAR" &&
                      c.type !== "NAV" &&
                      c.type !== "SIDEBAR" &&
                      c.type !== "FOOTER"
                  )
                  .map((c) => {
                    const isSelected = selectedCandidateId === c.id;
                    return (
                      <div
                        key={c.id}
                        data-testid={`region-box-${c.id}`}
                        onClick={() => onSelectCandidate(c)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-teal-500/20 border-teal-400 shadow-md ring-2 ring-teal-400/30"
                            : "bg-slate-900/80 border-slate-700 hover:border-slate-500 hover:bg-slate-800/80"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate">{c.label}</span>
                            {c.classification === "FUNCTIONAL_TOOL" && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                                TOOL
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block truncate">
                            {c.hierarchyPath} ({c.childCount} nós)
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-300 shrink-0">
                          {c.type}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Candidates List (Right Column) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-teal-400" />
              Lista de Candidatos Detectados
            </span>
            <span className="text-[10px] text-slate-400">Clique para selecionar</span>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
            {candidates.map((c) => {
              const isSelected = selectedCandidateId === c.id;
              return (
                <div
                  key={c.id}
                  data-testid={`candidate-item-${c.id}`}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? "bg-[#0f243d] border-teal-400 shadow-md"
                      : "bg-[#0c1626] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{c.label}</span>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        Tipo: <strong className="text-teal-300">{c.type}</strong>
                      </span>
                    </div>

                    {getClassificationBadge(c.classification)}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
                    <button
                      type="button"
                      data-testid={`btn-select-${c.id}`}
                      onClick={() => onSelectCandidate(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? "bg-teal-600 text-white"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      }`}
                    >
                      {isSelected ? "Selecionado" : "Selecionar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectCandidate(c)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      Ver estrutura
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Structure Inspection Modal */}
      {inspectCandidate && (
        <div
          data-testid="candidate-structure-modal"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full bg-[#0c1626] border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-white">Estrutura do Componente</h4>
                <p className="text-xs text-slate-400">{inspectCandidate.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectCandidate(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300">
              <p>ID: {inspectCandidate.id}</p>
              <p>Tipo: {inspectCandidate.type}</p>
              <p>Classificação: {inspectCandidate.classification}</p>
              <p>Hierarquia: {inspectCandidate.hierarchyPath}</p>
              <p>Elementos filhos: {inspectCandidate.childCount}</p>
              <p>Interações observadas: {inspectCandidate.interactionTypes.join(", ")}</p>
              <p>Layout hint: {inspectCandidate.structuralSummary.layoutHint || "grid"}</p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onSelectCandidate(inspectCandidate);
                  setInspectCandidate(null);
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Selecionar Este Componente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
