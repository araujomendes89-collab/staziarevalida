import React, { useState } from "react";
import {
  Network,
  TrendingUp,
  Target,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { MedicalArea } from "../../types";

export const KnowledgeGraphView: React.FC = () => {
  const { knowledgeGraph, setActiveTab, setQuestionFilterArea } = useApp();

  const [selectedArea, setSelectedArea] = useState<MedicalArea | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNodes = knowledgeGraph.filter((node) => {
    if (selectedArea !== "ALL" && node.area !== selectedArea) return false;
    if (searchQuery.trim()) {
      return (
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  // Sort by Expected Point Gain (ROI do tempo de estudo)
  const sortedNodes = [...filteredNodes].sort((a, b) => b.expectedPointGain - a.expectedPointGain);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Network className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest backdrop-blur-md bg-indigo-500/15 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              Matriz do Revalida INEP
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Microcompetências & Ganho Esperado de Pontos
          </h2>
          <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-xl">
            Algoritmo que cruza a incidência histórica das provas do INEP com o seu domínio pessoal para calcular onde cada hora de estudo rende mais pontos.
          </p>
        </div>

        <div className="text-xs backdrop-blur-md bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-white/80 font-medium shrink-0">
          Total de Microcompetências: <strong className="text-emerald-400">{knowledgeGraph.length}</strong>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-xl">
        <div className="flex items-center gap-2.5 backdrop-blur-md bg-white/[0.03] px-4 py-2.5 rounded-2xl border border-white/10 flex-1 max-w-md">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar tema (ex: pré-eclâmpsia, SINAN, apendicite)..."
            className="bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none w-full font-sans"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: "ALL", label: "Todas" },
            { id: "CLINICA_MEDICA", label: "Clínica" },
            { id: "CIRURGIA_GERAL", label: "Cirurgia" },
            { id: "GINECOLOGIA_OBSTETRICIA", label: "GO" },
            { id: "PEDIATRIA", label: "Pediatria" },
            { id: "MEDICINA_FAMILIA_COMUNIDADE", label: "SUS / MFC" },
          ].map((area) => (
            <button
              key={area.id}
              onClick={() => setSelectedArea(area.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedArea === area.id
                  ? "bg-white text-black font-bold shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                  : "backdrop-blur-md bg-white/5 text-white/60 hover:text-white border border-white/10 hover:border-white/20"
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nodes Table / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedNodes.map((node) => {
          const isHighROI = node.expectedPointGain >= 3.0;

          return (
            <div
              key={node.id}
              className={`p-6 rounded-[28px] backdrop-blur-2xl border transition-all flex flex-col justify-between space-y-4 shadow-2xl ${
                isHighROI
                  ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50"
                  : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-[10px] font-bold text-white/60 backdrop-blur-md bg-white/10 px-2.5 py-1 rounded-lg border border-white/10">
                    {node.area.replace("_", " ")}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300 backdrop-blur-md bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/30">
                    +{node.expectedPointGain.toFixed(1)} pts esperados
                  </span>
                </div>

                <h3 className="text-base font-bold text-white">{node.name}</h3>
                <p className="text-xs text-white/60 mt-1 leading-relaxed font-sans">
                  {node.description}
                </p>

                {/* Mastery Bar */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-white/50">
                    <span>Domínio Atual</span>
                    <span className="font-bold text-white/90">{node.userMastery}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${
                        node.userMastery < 60
                          ? "bg-amber-400"
                          : node.userMastery < 80
                          ? "bg-blue-400"
                          : "bg-emerald-400"
                      }`}
                      style={{ width: `${node.userMastery}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] text-amber-400 font-medium">
                  Incidência: {"★".repeat(node.incidenceWeight)}
                </span>

                <button
                  onClick={() => {
                    setQuestionFilterArea(node.area);
                    setActiveTab("questions");
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl backdrop-blur-md bg-white/10 hover:bg-white text-white hover:text-black text-xs font-bold transition-all active:scale-95 border border-white/15"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Estudar Tema</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
