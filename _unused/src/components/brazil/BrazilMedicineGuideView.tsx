import React, { useState } from "react";
import {
  BookMarked,
  Languages,
  Building2,
  Syringe,
  AlertTriangle,
  Search,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import {
  BRAZIL_MEDICAL_TERMS,
  BRAZIL_SUS_CONCEPTS,
  COMPULSORY_NOTIFICATION_DISEASES,
  PNI_VACCINES,
} from "../../data/brazilMedicineData";

export const BrazilMedicineGuideView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"TERMS" | "SUS" | "SINAN" | "PNI">("TERMS");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTerms = BRAZIL_MEDICAL_TERMS.filter((t) => {
    if (!searchQuery.trim()) return true;
    return (
      t.spanishTerm.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.portugueseBrazilTerm.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.contextInep.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <BookMarked className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest backdrop-blur-md bg-indigo-500/15 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              Medicina no Brasil & Dicionário Médico
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Adaptação Terminológica & SUS para o Revalida
          </h2>
          <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-xl">
            Projetado especialmente para médicos formados no exterior (Bolívia, Paraguai, Argentina, Cuba, etc.) dominarem o vocabulário, as siglas e o fluxo oficial do SUS.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-2 overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: "TERMS", label: "Dicionário ES ➔ PT-BR", icon: Languages },
          { id: "SUS", label: "Estrutura do SUS & APS", icon: Building2 },
          { id: "SINAN", label: "Notificação SINAN", icon: AlertTriangle },
          { id: "PNI", label: "Calendário PNI", icon: Syringe },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  : "backdrop-blur-md bg-white/[0.03] text-white/60 hover:text-white border border-white/10 hover:border-white/20"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content 1: Medical Terms Dictionary */}
      {activeTab === "TERMS" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 backdrop-blur-2xl bg-white/[0.03] px-4 py-3 rounded-2xl border border-white/10 shadow-lg">
            <Search className="w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar termo em espanhol ou português..."
              className="bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none w-full font-sans"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTerms.map((term, idx) => (
              <div
                key={idx}
                className="p-5 rounded-[24px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 space-y-2.5 shadow-xl hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-white/60 backdrop-blur-md bg-white/10 px-2.5 py-0.5 rounded-md border border-white/10">
                    {term.category}
                  </span>
                  <span className="text-[10px] text-amber-300 font-bold backdrop-blur-md bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">Pegadinha Revalida</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex-1">
                    <p className="text-[10px] text-white/40 uppercase font-semibold">Espanhol (Exterior)</p>
                    <p className="text-xs font-bold text-white/80">{term.spanishTerm}</p>
                  </div>
                  <span className="text-indigo-400 font-extrabold text-sm">➔</span>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] text-emerald-400/80 uppercase font-bold">Brasil (INEP/SUS)</p>
                    <p className="text-xs font-bold text-emerald-300">{term.portugueseBrazilTerm}</p>
                  </div>
                </div>

                <p className="text-xs text-white/60 pt-2.5 border-t border-white/10 leading-relaxed font-sans">
                  💡 {term.contextInep}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content 2: SUS Concepts */}
      {activeTab === "SUS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BRAZIL_SUS_CONCEPTS.map((concept, idx) => (
            <div key={idx} className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 space-y-2.5 shadow-2xl hover:border-white/20 transition-all">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-emerald-300 backdrop-blur-md bg-emerald-500/15 px-3 py-1 rounded-xl border border-emerald-500/30">
                  {concept.acronym}
                </span>
                <h3 className="text-sm font-bold text-white">{concept.fullName}</h3>
              </div>
              <p className="text-xs text-white/70 leading-relaxed mt-2 font-sans">{concept.description}</p>
              <div className="mt-3.5 p-3.5 rounded-2xl backdrop-blur-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                🎯 <strong>Cai no INEP como:</strong> {concept.relevanceForInep}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content 3: SINAN Compulsory Notifications */}
      {activeTab === "SINAN" && (
        <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 space-y-4 shadow-2xl">
          <h3 className="text-sm font-bold text-white">
            Lista de Doenças de Notificação Compulsória (Portaria GM/MS)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMPULSORY_NOTIFICATION_DISEASES.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 flex items-center justify-between hover:bg-white/[0.04] transition-all"
              >
                <span className="text-xs font-bold text-white/90">{item.disease}</span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-md ${
                    item.timeframe === "IMMEDIATE"
                      ? "bg-red-500/20 text-red-300 border-red-500/30"
                      : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                  }`}
                >
                  {item.timeframe === "IMMEDIATE" ? "IMEDIATA (até 24h)" : "SEMANAL"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content 4: PNI Vaccines */}
      {activeTab === "PNI" && (
        <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 space-y-4 shadow-2xl">
          <h3 className="text-sm font-bold text-white">
            Calendário Nacional de Vacinação do Brasil (PNI)
          </h3>
          <div className="space-y-2.5">
            {PNI_VACCINES.map((v, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 flex items-center justify-between gap-3 text-xs hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-indigo-300 backdrop-blur-md bg-indigo-500/20 px-2.5 py-1 rounded-xl border border-indigo-500/30">
                    {v.age}
                  </span>
                  <span className="font-bold text-white/90">{v.vaccine}</span>
                </div>
                <span className="text-white/50">{v.protectsAgainst}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
