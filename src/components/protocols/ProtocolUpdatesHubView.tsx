import React, { useState, useMemo } from "react";
import {
  Flame,
  AlertTriangle,
  Layers,
  Sparkles,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  RotateCcw,
  Check,
  X,
  FileCheck,
  Stethoscope,
  Clock,
  Calendar,
  AlertOctagon,
  Scale,
  Award,
  Zap,
} from "lucide-react";
import { PROTOCOL_UPDATES_2025_2026 } from "../../data/protocolUpdatesData";
import {
  ProtocolUpdate,
  UpdatePriority,
  UpdateYearTag,
  MedicalArea,
  ProtocolIneditaQuestion,
  ProtocolFlashcard,
} from "../../types";
import { useApp } from "../../context/AppContext";

export type ProtocolSubTab =
  | "overview"
  | "mudou_2025"
  | "mudou_2026"
  | "tabela_comparativa"
  | "questoes_antigas"
  | "questoes_ineditas"
  | "flashcards";

export const ProtocolUpdatesHubView: React.FC<{ initialTab?: ProtocolSubTab }> = ({
  initialTab = "overview",
}) => {
  const { questions, setActiveTab } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<ProtocolSubTab>(initialTab);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");
  const [selectedYearTag, setSelectedYearTag] = useState<string>("ALL");

  // Selected Protocol Modal for "Estudar Atualização"
  const [studyingProtocol, setStudyingProtocol] = useState<ProtocolUpdate | null>(null);

  // Interactive Inéditas Questions State
  const [selectedInedita, setSelectedInedita] = useState<ProtocolIneditaQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // Flashcards Study State
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [flashcardTypeFilter, setFlashcardTypeFilter] = useState<string>("ALL");

  // Aggregated Inéditas Questions
  const allIneditas = useMemo(() => {
    const list: (ProtocolIneditaQuestion & { protocolTitle: string; area: MedicalArea })[] = [];
    PROTOCOL_UPDATES_2025_2026.forEach((p) => {
      if (p.ineditas) {
        p.ineditas.forEach((q) => {
          list.push({ ...q, protocolTitle: p.tema, area: p.area });
        });
      }
    });
    return list;
  }, []);

  // Aggregated Flashcards
  const allFlashcards = useMemo(() => {
    const list: (ProtocolFlashcard & { protocolTitle: string; area: MedicalArea })[] = [];
    PROTOCOL_UPDATES_2025_2026.forEach((p) => {
      if (p.flashcards) {
        p.flashcards.forEach((f) => {
          list.push({ ...f, protocolTitle: p.tema, area: p.area });
        });
      }
    });
    return list;
  }, []);

  // Filtered Flashcards
  const filteredFlashcards = useMemo(() => {
    return allFlashcards.filter((f) => {
      if (flashcardTypeFilter === "ALL") return true;
      return f.type === flashcardTypeFilter;
    });
  }, [allFlashcards, flashcardTypeFilter]);

  // Filtered Protocols
  const filteredProtocols = useMemo(() => {
    return PROTOCOL_UPDATES_2025_2026.filter((p) => {
      const matchSearch =
        searchQuery === "" ||
        p.tema.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.subtema.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.instituicao.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.conduta_vigente.toLowerCase().includes(searchQuery.toLowerCase());

      const matchArea = selectedArea === "ALL" || p.area === selectedArea;
      const matchPriority = selectedPriority === "ALL" || p.nivel_prioridade === selectedPriority;
      const matchYear =
        selectedYearTag === "ALL" ||
        (selectedYearTag === "2025" && (p.tag_ano === "ATUALIZACAO_2025" || p.tag_ano === "ATUALIZADO_2025_E_2026")) ||
        (selectedYearTag === "2026" && (p.tag_ano === "ATUALIZACAO_2026" || p.tag_ano === "ATUALIZADO_2025_E_2026"));

      return matchSearch && matchArea && matchPriority && matchYear;
    });
  }, [searchQuery, selectedArea, selectedPriority, selectedYearTag]);

  // Protocols specifically changed in 2025
  const protocols2025 = useMemo(() => {
    return PROTOCOL_UPDATES_2025_2026.filter(
      (p) => p.tag_ano === "ATUALIZACAO_2025" || p.tag_ano === "ATUALIZADO_2025_E_2026"
    );
  }, []);

  // Protocols specifically changed in 2026
  const protocols2026 = useMemo(() => {
    return PROTOCOL_UPDATES_2025_2026.filter(
      (p) => p.tag_ano === "ATUALIZACAO_2026" || p.tag_ano === "ATUALIZADO_2025_E_2026"
    );
  }, []);

  // Questions from historical exams affected
  const affectedHistoricalQuestions = useMemo(() => {
    const list: {
      update: ProtocolUpdate;
      item: NonNullable<ProtocolUpdate["affected_exam_questions"]>[0];
    }[] = [];
    PROTOCOL_UPDATES_2025_2026.forEach((p) => {
      if (p.affected_exam_questions) {
        p.affected_exam_questions.forEach((q) => {
          list.push({ update: p, item: q });
        });
      }
    });
    return list;
  }, []);

  const getPriorityBadge = (priority: UpdatePriority) => {
    switch (priority) {
      case "PRIORIDADE_1_MUITO_ALTA":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            🔴 Prioridade 1 (Muito Alta)
          </span>
        );
      case "PRIORIDADE_2_ALTA":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            🟠 Prioridade 2 (Alta)
          </span>
        );
      case "PRIORIDADE_3_MODERADA":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            🟡 Prioridade 3 (Moderada)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">
            ⚪ Prioridade 4 (Baixa)
          </span>
        );
    }
  };

  const getYearBadge = (tag: UpdateYearTag) => {
    switch (tag) {
      case "ATUALIZADO_2025_E_2026":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-200 border border-amber-500/30">
            🔄 2025 & 2026
          </span>
        );
      case "ATUALIZACAO_2026":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            🔥 2026
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ⚠️ 2025
          </span>
        );
    }
  };

  const getAreaLabel = (area: MedicalArea) => {
    switch (area) {
      case "CLINICA_MEDICA":
        return "Clínica Médica";
      case "CIRURGIA_GERAL":
        return "Cirurgia Geral";
      case "PEDIATRIA":
        return "Pediatria";
      case "GINECOLOGIA_OBSTETRICIA":
        return "Ginecologia e Obstetrícia";
      case "MEDICINA_FAMILIA_COMUNIDADE":
        return "MFC & Saúde Coletiva";
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#121524] via-[#0d101d] to-[#180e1e] border border-white/10 p-6 sm:p-8 shadow-2xl">
        <div className="absolute -right-10 -top-10 w-72 h-72 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                Base Oficial Viva
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-white/80">
                PCDT • MS • CONITEC • PNI • ANVISA • CFM
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              🔥 ATUALIZAÇÕES REVALIDA 2025–2026
            </h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Mapeamento sistemático de todos os novos protocolos, diretrizes, esquemas vacinais,
              fluxos diagnósticos e pegadinhas com alta probabilidade de cobrança no Revalida INEP.
            </p>
          </div>

          <div className="flex flex-row md:flex-col items-center md:items-end gap-3 shrink-0">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-center min-w-[130px]">
              <p className="text-[11px] text-zinc-400 font-medium">Protocolos Ativos</p>
              <p className="text-2xl font-black text-emerald-400">
                {PROTOCOL_UPDATES_2025_2026.length}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center min-w-[130px]">
              <p className="text-[11px] text-rose-300 font-medium">Prioridade 1 (🔴)</p>
              <p className="text-2xl font-black text-rose-400">
                {PROTOCOL_UPDATES_2025_2026.filter((p) => p.nivel_prioridade === "PRIORIDADE_1_MUITO_ALTA").length}
              </p>
            </div>
          </div>
        </div>

        {/* Global Navigation Tabs (7 Specialized Tabs) */}
        <div className="mt-8 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab("overview")}
            id="tab-protocol-overview"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "overview"
                ? "bg-white text-black shadow-lg shadow-white/10"
                : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => setActiveSubTab("mudou_2025")}
            id="tab-protocol-2025"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "mudou_2025"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-extrabold"
                : "bg-white/[0.04] text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>⚠️ O QUE MUDOU EM 2025</span>
          </button>

          <button
            onClick={() => setActiveSubTab("mudou_2026")}
            id="tab-protocol-2026"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "mudou_2026"
                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20 font-extrabold"
                : "bg-white/[0.04] text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>🔥 O QUE MUDOU EM 2026</span>
          </button>

          <button
            onClick={() => setActiveSubTab("tabela_comparativa")}
            id="tab-protocol-tabela"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "tabela_comparativa"
                ? "bg-white text-black shadow-lg shadow-white/10"
                : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>2024 × 2025 × 2026</span>
          </button>

          <button
            onClick={() => setActiveSubTab("questoes_antigas")}
            id="tab-protocol-questoes-antigas"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "questoes_antigas"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 font-bold"
                : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>📚 Provas Antigas</span>
          </button>

          <button
            onClick={() => setActiveSubTab("questoes_ineditas")}
            id="tab-protocol-questoes-ineditas"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "questoes_ineditas"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 font-bold"
                : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>✨ Questões Inéditas</span>
          </button>

          <button
            onClick={() => setActiveSubTab("flashcards")}
            id="tab-protocol-flashcards"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              activeSubTab === "flashcards"
                ? "bg-teal-500 text-black shadow-lg shadow-teal-500/20 font-bold"
                : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>🗂️ Flashcards</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: VISÃO GERAL & DESTAQUES
      ===================================================================== */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          {/* Core Principles Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-zinc-900/60 to-teal-950/40 border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Regra de Ouro Editorial do Revalida INEP
                </h3>
                <p className="text-xs text-zinc-300 mt-1">
                  1. <strong>Nunca ensinar como atual uma recomendação substituída</strong> por protocolo oficial publicado em 2025 ou 2026.
                  <br />
                  2. <strong>Nunca alterar o gabarito histórico original</strong> de provas passadas — exibir comparativo transparente com a conduta vigente.
                </p>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 rounded-2xl bg-[#0e111d] border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por tema, conduta, fármaco, vacina ou órgão..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="px-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-rose-500/50"
              >
                <option value="ALL" className="bg-zinc-900 text-white">Todas as Áreas</option>
                <option value="CLINICA_MEDICA" className="bg-zinc-900 text-white">Clínica Médica</option>
                <option value="CIRURGIA_GERAL" className="bg-zinc-900 text-white">Cirurgia Geral</option>
                <option value="PEDIATRIA" className="bg-zinc-900 text-white">Pediatria</option>
                <option value="GINECOLOGIA_OBSTETRICIA" className="bg-zinc-900 text-white">Ginecologia e Obstetrícia</option>
                <option value="MEDICINA_FAMILIA_COMUNIDADE" className="bg-zinc-900 text-white">MFC & Coletiva</option>
              </select>

              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="px-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-rose-500/50"
              >
                <option value="ALL" className="bg-zinc-900 text-white">Todas Prioridades</option>
                <option value="PRIORIDADE_1_MUITO_ALTA" className="bg-zinc-900 text-white">🔴 Prioridade 1 (Muito Alta)</option>
                <option value="PRIORIDADE_2_ALTA" className="bg-zinc-900 text-white">🟠 Prioridade 2 (Alta)</option>
                <option value="PRIORIDADE_3_MODERADA" className="bg-zinc-900 text-white">🟡 Prioridade 3 (Moderada)</option>
                <option value="PRIORIDADE_4_BAIXA" className="bg-zinc-900 text-white">⚪ Prioridade 4 (Baixa)</option>
              </select>
            </div>
          </div>

          {/* Protocols List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProtocols.map((protocol) => (
              <div
                key={protocol.id}
                className="p-5 rounded-2xl bg-[#0f1322] border border-white/10 hover:border-rose-500/30 transition-all flex flex-col justify-between space-y-4 shadow-lg group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {getAreaLabel(protocol.area)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {getYearBadge(protocol.tag_ano)}
                      {getPriorityBadge(protocol.nivel_prioridade)}
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-rose-300 transition-colors leading-snug">
                    {protocol.tema}
                  </h3>

                  <p className="text-xs text-zinc-400 line-clamp-2">
                    {protocol.nome_documento} • {protocol.instituicao} ({protocol.data_publicacao})
                  </p>

                  {/* Quick Before vs After Pill */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-zinc-400">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase shrink-0 mt-0.5">Antes:</span>
                      <p className="line-clamp-1">{protocol.recomendacao_pre_2025}</p>
                    </div>
                    <div className="flex items-start gap-2 text-emerald-300 font-medium">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase shrink-0 mt-0.5">Vigente:</span>
                      <p className="line-clamp-2">{protocol.conduta_vigente}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">
                      Verificado: {protocol.ultima_verificacao}
                    </span>
                  </div>

                  <button
                    onClick={() => setStudyingProtocol(protocol)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white transition-all cursor-pointer"
                  >
                    <span>Estudar Atualização</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: O QUE MUDOU EM 2025
      ===================================================================== */}
      {activeSubTab === "mudou_2025" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/40 via-zinc-900 to-black border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" />
              Diretrizes & PCDTs Publicados em 2025
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              ⚠️ O QUE MUDOU EM 2025
            </h2>
            <p className="text-xs text-zinc-300 mt-1 max-w-3xl">
              Confira todas as transições clínicas implementadas no ano de 2025.
              Cada item detalha a recomendação prévia versus a nova conduta adotada oficialmente pelo SUS.
            </p>
          </div>

          <div className="space-y-4">
            {protocols2025.map((prot) => (
              <div
                key={prot.id}
                className="p-6 rounded-2xl bg-[#0d101c] border border-amber-500/20 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                      {getAreaLabel(prot.area)} • {prot.subtema}
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      {prot.tema}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPriorityBadge(prot.nivel_prioridade)}
                  </div>
                </div>

                {/* Timeline Grid (Antes -> Depois) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 uppercase">
                      <X className="w-3.5 h-3.5" />
                      Recomendação Anterior (Antes de 2025)
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {prot.recomendacao_pre_2025}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase">
                      <Check className="w-3.5 h-3.5" />
                      Atualização de 2025 & Conduta Vigente
                    </div>
                    <p className="text-xs text-emerald-100 font-medium leading-relaxed">
                      {prot.atualizacao_2025}
                    </p>
                  </div>
                </div>

                {/* Impacto Revalida & Pegadinha */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-amber-300">🎯 Como o INEP cobra: </span>
                    <span className="text-zinc-300">{prot.impacto_revalida}</span>
                  </div>
                  <button
                    onClick={() => setStudyingProtocol(prot)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-all shrink-0 cursor-pointer"
                  >
                    Estudar Atualização
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: O QUE MUDOU EM 2026
      ===================================================================== */}
      {activeSubTab === "mudou_2026" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-rose-950/60 via-purple-950/40 to-black border border-rose-500/40 shadow-xl shadow-rose-950/20">
            <div className="flex items-center gap-2 text-rose-400 font-black text-sm uppercase tracking-wider">
              <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
              Diretrizes & Consensos Recentes de 2026
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              🔥 O QUE MUDOU EM 2026
            </h2>
            <p className="text-xs text-zinc-300 mt-1 max-w-3xl">
              Protocolos de altíssima probabilidade na próxima edição do Revalida INEP.
              Mudanças publicadas durante 2026 com impacto direto na formulação de novas questões e gabaritos.
            </p>
          </div>

          <div className="space-y-4">
            {protocols2026.map((prot) => (
              <div
                key={prot.id}
                className="p-6 rounded-2xl bg-[#110e1a] border border-rose-500/30 space-y-4 shadow-lg shadow-rose-950/10"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                      {getAreaLabel(prot.area)} • {prot.instituicao} ({prot.data_publicacao})
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      {prot.tema}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500 text-white">
                      NOVA DIRETRIZ 2026
                    </span>
                    {getPriorityBadge(prot.nivel_prioridade)}
                  </div>
                </div>

                {/* Triple Timeline: Antes -> 2025 -> 2026 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-white/5 space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">1. Antes de 2025</span>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">{prot.recomendacao_pre_2025}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/20 space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">2. Mudança em 2025</span>
                    <p className="text-amber-200 text-[11px] leading-relaxed">{prot.atualizacao_2025}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-1">
                    <span className="text-[10px] font-bold text-rose-300 uppercase">3. ✅ Conduta 2026 Vigente</span>
                    <p className="text-rose-100 text-[11px] font-semibold leading-relaxed">
                      {prot.atualizacao_2026 || prot.conduta_vigente}
                    </p>
                  </div>
                </div>

                {/* Traps & Action */}
                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-rose-300 font-bold flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      Pegadinha Provável do INEP:
                    </div>
                    <p className="text-zinc-300">{prot.pegadinha}</p>
                  </div>

                  <button
                    onClick={() => setStudyingProtocol(prot)}
                    className="px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition-all shrink-0 cursor-pointer"
                  >
                    Estudar Atualização
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: TABELA COMPARATIVA (2024 × 2025 × 2026)
      ===================================================================== */}
      {activeSubTab === "tabela_comparativa" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#0f121d] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                Matriz Comparativa Temporal: 2024 × 2025 × 2026
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Consolidado dinâmico de condutas antigas versus novos padrões do SUS.
              </p>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-zinc-200"
              >
                <option value="ALL" className="bg-zinc-900">Todas as Áreas</option>
                <option value="CLINICA_MEDICA" className="bg-zinc-900">Clínica Médica</option>
                <option value="CIRURGIA_GERAL" className="bg-zinc-900">Cirurgia</option>
                <option value="PEDIATRIA" className="bg-zinc-900">Pediatria</option>
                <option value="GINECOLOGIA_OBSTETRICIA" className="bg-zinc-900">G&O</option>
                <option value="MEDICINA_FAMILIA_COMUNIDADE" className="bg-zinc-900">MFC / Coletiva</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0a0c14] shadow-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/10 text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                  <th className="p-3.5 min-w-[160px]">Tema & Área</th>
                  <th className="p-3.5 min-w-[200px] text-red-300/80">Antes de 2025</th>
                  <th className="p-3.5 min-w-[200px] text-amber-300/80">Mudança 2025</th>
                  <th className="p-3.5 min-w-[200px] text-rose-300/80">Mudança 2026</th>
                  <th className="p-3.5 min-w-[240px] text-emerald-300 font-bold">✅ Conduta Vigente</th>
                  <th className="p-3.5 min-w-[120px] text-center">Prioridade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredProtocols.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3.5 align-top">
                      <p className="font-bold text-white text-xs">{p.tema}</p>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">
                        {getAreaLabel(p.area)}
                      </span>
                    </td>
                    <td className="p-3.5 align-top text-zinc-400 leading-relaxed text-[11px]">
                      {p.recomendacao_pre_2025}
                    </td>
                    <td className="p-3.5 align-top text-amber-200/90 leading-relaxed text-[11px]">
                      {p.atualizacao_2025}
                    </td>
                    <td className="p-3.5 align-top text-rose-200/90 leading-relaxed text-[11px]">
                      {p.atualizacao_2026 || "—"}
                    </td>
                    <td className="p-3.5 align-top text-emerald-300 font-medium leading-relaxed text-[11px]">
                      {p.conduta_vigente}
                    </td>
                    <td className="p-3.5 align-top text-center">
                      {getPriorityBadge(p.nivel_prioridade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: BANCO DE QUESTÕES ANTIGAS IMPACTADAS
      ===================================================================== */}
      {activeSubTab === "questoes_antigas" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#111424] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <BookOpen className="w-4 h-4" />
              Auditoria de Provas Anteriores (2020 a 2024)
            </div>
            <h2 className="text-xl font-black text-white">
              📚 Questões com Gabarito Histórico vs. Conduta Atual
            </h2>
            <p className="text-xs text-zinc-300">
              O gabarito oficial histórico da prova original <strong>nunca é alterado</strong>.
              Abaixo você vê exatamente o que o INEP considerou correto na época e qual é a resposta esperada sob os protocolos de 2025/2026.
            </p>
          </div>

          <div className="space-y-4">
            {affectedHistoricalQuestions.map(({ update, item }) => (
              <div
                key={item.questionId}
                className="p-6 rounded-2xl bg-[#0c0f1d] border border-white/10 space-y-4"
              >
                {/* Standard Warning Banner */}
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-amber-300 uppercase tracking-wide">
                      ⚠️ CONTEÚDO DESATUALIZADO NA PROVA HISTÓRICA
                    </h4>
                    <p className="text-xs text-amber-100/90 leading-relaxed">
                      {item.aviso_desatualizacao}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg text-xs font-bold bg-white/10 text-white">
                      {item.examCode} • Questão #{item.questionNumber} ({item.year})
                    </span>
                    <span className="text-xs text-zinc-400">{update.tema}</span>
                  </div>
                  {getPriorityBadge(update.nivel_prioridade)}
                </div>

                {/* Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase">
                      <FileCheck className="w-4 h-4 text-zinc-400" />
                      📚 Gabarito Original Oficial na Data da Prova:
                    </div>
                    <p className="text-xs text-white font-mono bg-black/40 p-2.5 rounded-lg border border-white/5">
                      {item.gabarito_original}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ✅ Conduta Vigente Atualmente (2025/2026):
                    </div>
                    <p className="text-xs text-emerald-200 font-mono bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-500/20">
                      {item.conduta_vigente}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-zinc-300">
                  <span className="font-bold text-white">O que mudou: </span>
                  {item.o_que_mudou_2025} {item.o_que_mudou_2026 && `• ${item.o_que_mudou_2026}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: QUESTÕES INÉDITAS CALIBRADAS
      ===================================================================== */}
      {activeSubTab === "questoes_ineditas" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/50 via-zinc-900 to-black border border-indigo-500/30">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              Treinamento Calibrado no Padrão Revalida
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              ✨ Questões Inéditas Baseadas nas Atualizações 2025–2026
            </h2>
            <p className="text-xs text-zinc-300 mt-1 max-w-3xl">
              Casos clínicos inéditos formulados para testar as novas diretrizes do SUS e blindar o candidato contra pegadinhas de protocolos desatualizados.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left list of ineditas */}
            <div className="lg:col-span-1 space-y-3">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Selecione um Caso Clínico
              </p>
              <div className="space-y-2">
                {allIneditas.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      setSelectedInedita(q);
                      setSelectedOption(null);
                      setIsSubmitted(false);
                    }}
                    className={`w-full p-4 rounded-xl text-left transition-all border ${
                      selectedInedita?.id === q.id
                        ? "bg-indigo-600/20 border-indigo-500 text-white"
                        : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                      <span>Caso #{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-white/10 font-bold">
                        {q.difficulty}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white line-clamp-2">
                      {q.protocolTitle}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Question Card */}
            <div className="lg:col-span-2">
              {selectedInedita ? (
                <div className="p-6 rounded-2xl bg-[#0f1322] border border-white/10 space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-400">
                      {selectedInedita.protocolo} ({selectedInedita.ano_atualizacao})
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                      Nível: {selectedInedita.difficulty}
                    </span>
                  </div>

                  <p className="text-sm text-zinc-200 leading-relaxed font-serif">
                    {selectedInedita.statement}
                  </p>

                  {/* Options */}
                  <div className="space-y-2.5">
                    {selectedInedita.options.map((opt) => {
                      const isChosen = selectedOption === opt.id;
                      const isCorrect = selectedInedita.correctAnswer === opt.id;

                      let optClasses =
                        "p-4 rounded-xl border text-xs flex items-start gap-3 transition-all cursor-pointer ";
                      if (isSubmitted) {
                        if (isCorrect) {
                          optClasses += "bg-emerald-950/40 border-emerald-500 text-emerald-200 font-semibold";
                        } else if (isChosen && !isCorrect) {
                          optClasses += "bg-rose-950/40 border-rose-500 text-rose-200";
                        } else {
                          optClasses += "bg-white/[0.02] border-white/5 text-zinc-500 opacity-60";
                        }
                      } else {
                        if (isChosen) {
                          optClasses += "bg-indigo-600/20 border-indigo-500 text-white font-medium";
                        } else {
                          optClasses += "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06]";
                        }
                      }

                      return (
                        <div
                          key={opt.id}
                          onClick={() => !isSubmitted && setSelectedOption(opt.id)}
                          className={optClasses}
                        >
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isChosen
                                ? "bg-indigo-500 text-white"
                                : "bg-white/10 text-zinc-400"
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="space-y-1">
                            <p>{opt.text}</p>
                            {isSubmitted && (
                              <p className="text-[11px] text-zinc-400 pt-1 border-t border-white/5">
                                {opt.justification}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Buttons */}
                  {!isSubmitted ? (
                    <button
                      onClick={() => setIsSubmitted(true)}
                      disabled={!selectedOption}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs transition-all cursor-pointer"
                    >
                      Confirmar Resposta & Ver Justificativas
                    </button>
                  ) : (
                    <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2 text-xs">
                      <div className="flex items-center gap-2 font-bold text-indigo-300">
                        <Award className="w-4 h-4" />
                        Comentário do Especialista:
                      </div>
                      <p className="text-zinc-200 leading-relaxed">
                        {selectedInedita.commentary}
                      </p>
                      <p className="text-[11px] text-zinc-400 pt-2">
                        Fonte: {selectedInedita.fonte_oficial} • Protocolo: {selectedInedita.protocolo}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 rounded-2xl bg-[#0c0f1d] border border-white/10 text-center text-zinc-500 text-xs">
                  Selecione uma questão inédita ao lado para iniciar o treino interativo.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 7: FLASHCARDS DE ATUALIZAÇÕES
      ===================================================================== */}
      {activeSubTab === "flashcards" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-teal-950/50 via-zinc-900 to-black border border-teal-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
                <Layers className="w-4 h-4" />
                Memorização Ativa & Repetição Espaçada
              </div>
              <h2 className="text-xl font-black text-white mt-1">
                🗂️ Flashcards de Atualizações
              </h2>
              <p className="text-xs text-zinc-300">
                Fixação ultrarrápida dos 3 tipos essenciais: "O que mudou?", "Data / Protocolo" e "Pegadinha Revalida".
              </p>
            </div>

            {/* Filter by Type */}
            <div className="flex items-center gap-2">
              <select
                value={flashcardTypeFilter}
                onChange={(e) => {
                  setFlashcardTypeFilter(e.target.value);
                  setCurrentFlashcardIndex(0);
                  setIsFlipped(false);
                }}
                className="px-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-zinc-200"
              >
                <option value="ALL" className="bg-zinc-900">Todos os Tipos</option>
                <option value="O_QUE_MUDOU" className="bg-zinc-900">O que mudou?</option>
                <option value="DATA_PROTOCOLO" className="bg-zinc-900">Data / Protocolo</option>
                <option value="PEGADINHA" className="bg-zinc-900">Pegadinha Revalida</option>
              </select>
            </div>
          </div>

          {filteredFlashcards.length > 0 && (() => {
            const activeFlashcard = filteredFlashcards[currentFlashcardIndex] || filteredFlashcards[0];
            if (!activeFlashcard) return null;
            return (
              <div className="max-w-xl mx-auto space-y-6">
                {/* Flashcard 3D Box */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="min-h-[260px] p-8 rounded-3xl bg-gradient-to-br from-[#121829] to-[#0a0d18] border border-white/10 hover:border-teal-500/40 shadow-2xl flex flex-col justify-between cursor-pointer transition-all duration-300 select-none relative overflow-hidden group"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-teal-300">
                      {activeFlashcard.type === "O_QUE_MUDOU"
                        ? "🔄 O que mudou?"
                        : activeFlashcard.type === "PEGADINHA"
                        ? "🎯 Pegadinha Revalida"
                        : "📅 Data & Protocolo"}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {Math.min(currentFlashcardIndex + 1, filteredFlashcards.length)} de {filteredFlashcards.length}
                    </span>
                  </div>

                  <div className="my-6 text-center space-y-3">
                    {!isFlipped ? (
                      <>
                        <p className="text-xs text-zinc-400 font-medium">Pergunta:</p>
                        <h3 className="text-lg sm:text-xl font-bold text-white leading-relaxed">
                          {activeFlashcard.front}
                        </h3>
                        <p className="text-[11px] text-teal-400/80 pt-2">
                          (Clique no card para virar e ver a resposta)
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-emerald-400 font-bold">✅ Conduta Vigente / Resposta:</p>
                        <h3 className="text-lg sm:text-xl font-bold text-emerald-200 leading-relaxed">
                          {activeFlashcard.back}
                        </h3>
                        <p className="text-[11px] text-zinc-400 pt-2">
                          {activeFlashcard.protocolTitle}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="text-center text-[10px] text-zinc-500">
                    Tag: {activeFlashcard.tag}
                  </div>
                </div>

                {/* Navigation Controls */}
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentFlashcardIndex((prev) =>
                        prev === 0 ? filteredFlashcards.length - 1 : prev - 1
                      );
                    }}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-xs font-bold text-white transition-all cursor-pointer"
                  >
                    Anterior
                  </button>

                  <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black text-xs font-black transition-all cursor-pointer"
                  >
                    {isFlipped ? "Ocultar Resposta" : "Virar Flashcard"}
                  </button>

                  <button
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentFlashcardIndex((prev) =>
                        prev === filteredFlashcards.length - 1 ? 0 : prev + 1
                      );
                    }}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-xs font-bold text-white transition-all cursor-pointer"
                  >
                    Próximo
                  </button>
                </div>
              </div>
            );
          })()}
          {filteredFlashcards.length === 0 && (
            <div className="p-8 text-center text-zinc-400 text-xs">
              Nenhum flashcard encontrado para o filtro selecionado.
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL: "ESTUDAR ATUALIZAÇÃO" / MICROAULA
      ===================================================================== */}
      {studyingProtocol && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[#0d101d] border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-white/[0.02]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getYearBadge(studyingProtocol.tag_ano)}
                  {getPriorityBadge(studyingProtocol.nivel_prioridade)}
                  <span className="text-xs text-zinc-400">
                    {getAreaLabel(studyingProtocol.area)}
                  </span>
                </div>
                <h2 className="text-xl font-black text-white">
                  {studyingProtocol.tema}
                </h2>
              </div>
              <button
                onClick={() => setStudyingProtocol(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed">
              {/* Document Reference */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1">
                <p className="font-bold text-white text-sm">
                  {studyingProtocol.nome_documento}
                </p>
                <p className="text-zinc-400">
                  Instituição: <strong>{studyingProtocol.instituicao}</strong> • Publicação:{" "}
                  <strong>{studyingProtocol.data_publicacao}</strong>
                </p>
                <a
                  href={studyingProtocol.url_oficial}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline pt-1 text-[11px]"
                >
                  <span>Acessar documento oficial da diretriz</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* 4 Core Questions Breakdown */}
              <div className="space-y-4">
                {/* 1. O que o Revalida cobrava antes? */}
                <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/20 space-y-1.5">
                  <h4 className="font-black text-red-400 text-xs uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    1. O que o Revalida cobrava anteriormente (Antes de 2025)?
                  </h4>
                  <p className="text-zinc-300">
                    {studyingProtocol.recomendacao_pre_2025}
                  </p>
                </div>

                {/* 2. O que mudou em 2025? */}
                <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1.5">
                  <h4 className="font-black text-amber-400 text-xs uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    2. O que mudou em 2025?
                  </h4>
                  <p className="text-zinc-300">
                    {studyingProtocol.atualizacao_2025}
                  </p>
                </div>

                {/* 3. O que mudou em 2026? */}
                {studyingProtocol.atualizacao_2026 && (
                  <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-1.5">
                    <h4 className="font-black text-rose-400 text-xs uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      3. O que mudou em 2026?
                    </h4>
                    <p className="text-zinc-300">
                      {studyingProtocol.atualizacao_2026}
                    </p>
                  </div>
                )}

                {/* 4. Qual conduta está vigente hoje? */}
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-1.5">
                  <h4 className="font-black text-emerald-400 text-xs uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    4. Qual conduta está vigente hoje no SUS?
                  </h4>
                  <p className="text-emerald-100 font-semibold leading-relaxed">
                    {studyingProtocol.conduta_vigente}
                  </p>
                </div>
              </div>

              {/* INEP Trap & Exam Impact */}
              <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-3">
                <div>
                  <h5 className="font-bold text-rose-400 uppercase text-[11px]">
                    🎯 Como a banca do INEP vai tentar te induzir ao erro (Pegadinha):
                  </h5>
                  <p className="text-zinc-300 mt-1">{studyingProtocol.pegadinha}</p>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <h5 className="font-bold text-indigo-300 uppercase text-[11px]">
                    📊 Impacto Clínico & Justificativa:
                  </h5>
                  <p className="text-zinc-300 mt-1">{studyingProtocol.impacto_clinico}</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">
                Status: {studyingProtocol.status === "VALIDADO_OFICIAL_SUS" ? "✅ Validado Oficial SUS" : "⚠️ Em Validação"}
              </span>
              <button
                onClick={() => setStudyingProtocol(null)}
                className="px-6 py-2 rounded-xl bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-all cursor-pointer"
              >
                Concluir Estudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
