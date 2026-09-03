import React, { useState, useMemo } from "react";
import {
  BrainCircuit,
  Sparkles,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  Bot,
  RotateCcw,
  BookOpenCheck,
  Database,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
  Download,
  Info,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Question, MedicalArea } from "../../types";
import { GeneratedQuestionCard } from "./GeneratedQuestionCard";
import { GenerationConfigModal } from "./GenerationConfigModal";
import { ReverseEngineeringFlow } from "./ReverseEngineeringFlow";
import { QuestionAuditLab } from "./QuestionAuditLab";
import { ProblemQuestionsView } from "./ProblemQuestionsView";
import { SEED_INEDITAS_QUESTIONS } from "../../data/ineditasData";

export type QuestoesIATab =
  | "GERAR"
  | "ENGENHARIA_REVERSA"
  | "AUDITAR"
  | "BANCO_GERADO"
  | "PROBLEMAS";

export const QuestoesIAView: React.FC = () => {
  const {
    user,
    questions,
    addGeneratedQuestion,
    approveIneditaQuestion,
    rejectIneditaQuestion,
    editIneditaQuestion,
    prefilledGenerationParams,
    setPrefilledGenerationParams,
    setActiveTab,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<QuestoesIATab>("GERAR");
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(user?.role === "ADMIN");

  // Filter state in Bank view
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<MedicalArea | "ALL">("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Last generation result batch summary state
  const [lastBatchResult, setLastBatchResult] = useState<{
    total: number;
    approved: number;
    review: number;
    rejected: number;
    generatedQuestions: Question[];
  } | null>(null);

  // Collect all generated/inéditas questions from both questions state and seed data
  const allGeneratedQuestions = useMemo(() => {
    // Start with all questions from state that are inedita / platform generated
    const fromState = questions.filter(
      (q) =>
        q.origin === "PLATFORM_ORIGINAL" ||
        q.origin === "INEDITA_PRAXIS" ||
        q.generationStatus !== undefined
    );

    // Merge with seed ineditas if not already in state
    const ids = new Set(fromState.map((q) => q.id));
    const extraSeeds = SEED_INEDITAS_QUESTIONS.filter((s) => !ids.has(s.id));
    return [...fromState, ...extraSeeds];
  }, [questions]);

  // Real Database Metric Counts
  const totalGeneratedCount = allGeneratedQuestions.length;

  const awaitingAuditCount = allGeneratedQuestions.filter((q) => {
    const s = String(q.generationStatus || "");
    return (
      s === "AI_GENERATED" ||
      s === "Gerada" ||
      s === "Fonte verificada" ||
      s === "Em auditoria" ||
      s === "MEDICAL_REVIEW"
    );
  }).length;

  const approvedCount = allGeneratedQuestions.filter((q) => {
    const s = String(q.generationStatus || "");
    return (
      s === "APPROVED" ||
      s === "Aprovada" ||
      s === "AUTO_VALIDATED"
    );
  }).length;

  const publishedCount = allGeneratedQuestions.filter((q) => {
    const s = String(q.generationStatus || "");
    return (
      s === "PUBLISHED" ||
      s === "Publicada"
    );
  }).length;

  const problemCount = allGeneratedQuestions.filter((q) => {
    const s = String(q.generationStatus || "");
    return (
      s === "Ambígua" ||
      s === "Gabarito divergente" ||
      s === "Muito semelhante" ||
      s === "Desatualizada" ||
      s === "REJECTED" ||
      s === "Rejeitada" ||
      q.officialStatus === "annulled"
    );
  }).length;

  // Filtered list for "Banco Gerado"
  const filteredBankQuestions = useMemo(() => {
    return allGeneratedQuestions.filter((q) => {
      if (selectedAreaFilter !== "ALL" && q.area !== selectedAreaFilter) {
        return false;
      }
      if (selectedStatusFilter !== "ALL") {
        if (selectedStatusFilter === "PUBLISHED" && q.generationStatus !== "PUBLISHED") {
          return false;
        }
        if (
          selectedStatusFilter === "APPROVED" &&
          String(q.generationStatus || "") !== "APPROVED" &&
          String(q.generationStatus || "") !== "Aprovada"
        ) {
          return false;
        }
        if (
          selectedStatusFilter === "PENDING" &&
          String(q.generationStatus || "") !== "AI_GENERATED" &&
          String(q.generationStatus || "") !== "MEDICAL_REVIEW" &&
          String(q.generationStatus || "") !== "Em auditoria"
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const qLower = searchQuery.toLowerCase();
        const matchesTopic = q.topic?.toLowerCase().includes(qLower);
        const matchesCase = q.clinicalCase?.toLowerCase().includes(qLower);
        const matchesCode = q.code?.toLowerCase().includes(qLower);
        return matchesTopic || matchesCase || matchesCode;
      }
      return true;
    });
  }, [allGeneratedQuestions, selectedAreaFilter, selectedStatusFilter, searchQuery]);

  // Handlers
  const handleApprove = (id: string) => {
    approveIneditaQuestion(id, "Dr. Revisor Especialista Revalida");
  };

  const handlePublish = (id: string) => {
    approveIneditaQuestion(id, "Publicação Oficial no Banco do Aluno");
  };

  const handleReject = (id: string, reason: string) => {
    rejectIneditaQuestion(id, reason);
  };

  const handleGenerateSuccess = (result: {
    generatedQuestions: Question[];
    approvedCount: number;
    reviewCount: number;
    rejectedCount: number;
  }) => {
    // Add all generated questions to the state
    result.generatedQuestions.forEach((q) => {
      addGeneratedQuestion(q);
    });

    setLastBatchResult({
      total: result.generatedQuestions.length,
      approved: result.approvedCount,
      review: result.reviewCount,
      rejected: result.rejectedCount,
      generatedQuestions: result.generatedQuestions,
    });
  };

  const handlePublishApprovedBatch = () => {
    if (!lastBatchResult) return;
    const approvedItems = lastBatchResult.generatedQuestions.filter(
      (q) => String(q.generationStatus || "") === "APPROVED" || String(q.generationStatus || "") === "Aprovada"
    );
    approvedItems.forEach((q) => {
      handlePublish(q.id);
    });
    setLastBatchResult((prev) => (prev ? { ...prev, approved: 0 } : null));
  };

  const handleSelectThemeForGeneration = (areaName: string, themeTitle: string) => {
    setPrefilledGenerationParams({ area: areaName, theme: themeTitle });
    setIsConfigModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Main Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c101d] via-[#0e1324] to-[#12182c] border border-blue-500/20 p-6 sm:p-8 shadow-2xl">
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-blue-400" />
                <span>Central de Produção & Auditoria de Conteúdo</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                INEP 2026 Ready
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              QUESTÕES IA
            </h1>
            <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
              Crie questões inéditas utilizando engenharia reversa do padrão Revalida, com matriz cognitiva, PCDT SUS 2026 e auditoria adversarial de resposta única.
            </p>

            {/* AI Models Attribution Chips */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
                <span>Geração: <strong className="text-white">Claude Sonnet 5</strong></span>
              </div>
              <span className="text-zinc-600">•</span>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>Auditoria: <strong className="text-white">Claude Opus 5</strong></span>
              </div>
              <span className="text-zinc-600">•</span>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Diretrizes: <strong className="text-white">Gemini 3.7 Flash</strong></span>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              id="btn-open-generator-modal"
              onClick={() => {
                setPrefilledGenerationParams(null);
                setIsConfigModalOpen(true);
              }}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-blue-500/20 hover:shadow-blue-500/40 transition-all hover:scale-105 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>+ Gerar novas questões</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Real Metric Dashboard Cards with Contextual Tooltips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* 1. Questões Geradas */}
        <div
          title="Origem: Geradas por IA (Claude Sonnet 5) via matriz cognitiva e PCDT SUS 2026 • Sincronizado com o Firestore em tempo real"
          className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 space-y-1.5 shadow-md cursor-help group hover:border-blue-500/30 transition-colors"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Questões Geradas</span>
              <Info className="w-3 h-3 text-zinc-500 group-hover:text-blue-400 transition-colors" />
            </span>
            <BrainCircuit className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {totalGeneratedCount}
          </div>
          <p className="text-[10px] text-zinc-400">Total gerado por IA (Sincronizado)</p>
        </div>

        {/* 2. Aguardando Auditoria */}
        <div
          title="Origem: Questões submetidas para auditoria adversarial e checagem de gabarito • Atualizado em tempo real"
          className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 space-y-1.5 shadow-md cursor-help group hover:border-amber-500/30 transition-colors"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Aguardando Auditoria</span>
              <Info className="w-3 h-3 text-zinc-500 group-hover:text-amber-400 transition-colors" />
            </span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300 font-mono">
            {awaitingAuditCount}
          </div>
          <p className="text-[10px] text-zinc-400">Em validação técnica (Claude Opus 5)</p>
        </div>

        {/* 3. Aprovadas */}
        <div
          title="Origem: Questões com 100% de conformidade com gabarito único e matriz INEP • Prontas para entrar em simulados"
          className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 space-y-1.5 shadow-md cursor-help group hover:border-teal-500/30 transition-colors"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Aprovadas</span>
              <Info className="w-3 h-3 text-zinc-500 group-hover:text-teal-400 transition-colors" />
            </span>
            <ShieldCheck className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-teal-300 font-mono">
            {approvedCount}
          </div>
          <p className="text-[10px] text-zinc-400">Prontas para publicação oficial</p>
        </div>

        {/* 4. Publicadas */}
        <div
          title="Origem: Itens liberados ativamente no banco de questões do aluno com gabarito comentado"
          className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 space-y-1.5 shadow-md cursor-help group hover:border-emerald-500/30 transition-colors"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Publicadas</span>
              <Info className="w-3 h-3 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300 font-mono">
            {publishedCount}
          </div>
          <p className="text-[10px] text-zinc-400">Ativas no banco de treino</p>
        </div>

        {/* 5. Com Problemas */}
        <div
          title="Origem: Questões identificadas com ambiguidade, distrator dúbio ou desatualização clínica para ajuste"
          className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 space-y-1.5 shadow-md col-span-2 sm:col-span-1 cursor-help group hover:border-rose-500/30 transition-colors"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Com Problemas</span>
              <Info className="w-3 h-3 text-zinc-500 group-hover:text-rose-400 transition-colors" />
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono">
            {problemCount}
          </div>
          <p className="text-[10px] text-zinc-400">Ambíguas / divergentes</p>
        </div>
      </div>

      {/* Generation Result Banner (if a batch was generated) */}
      {lastBatchResult && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/40 via-emerald-950/30 to-[#0e121a] border border-emerald-500/30 space-y-4 shadow-xl animate-fadeIn">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Lote de Questões Produzido com Sucesso
              </span>
              <h3 className="text-base font-bold text-white">
                QUESTÕES GERADAS: {lastBatchResult.total} questões produzidas
              </h3>
              <p className="text-xs text-zinc-300">
                <strong className="text-emerald-300">{lastBatchResult.approved}</strong> aprovadas pela auditoria ·{" "}
                <strong className="text-amber-300">{lastBatchResult.review}</strong> precisa de revisão ·{" "}
                <strong className="text-rose-300">{lastBatchResult.rejected}</strong> rejeitada por ambiguidade
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab("BANCO_GERADO")}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Revisar questões
              </button>

              {lastBatchResult.rejected > 0 && (
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/40 text-rose-200 border border-rose-500/40 text-xs font-bold transition-colors cursor-pointer"
                >
                  Gerar novamente as rejeitadas
                </button>
              )}

              {lastBatchResult.approved > 0 && (
                <button
                  type="button"
                  onClick={handlePublishApprovedBatch}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all hover:scale-105 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar aprovadas para o banco</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Navigation Sub-Tabs */}
      <div className="border-b border-white/10 flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-2">
          {[
            { id: "GERAR" as QuestoesIATab, label: "Gerar Questões", icon: Sparkles },
            { id: "BANCO_GERADO" as QuestoesIATab, label: "Banco de Inéditas", icon: Database, count: totalGeneratedCount },
          ].map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-4 py-3 rounded-t-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  isActive
                    ? "text-white border-blue-500 bg-white/[0.04]"
                    : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-white/[0.02]"
                }`}
              >
                <TabIcon className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-zinc-400"}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-zinc-300">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Advanced / Editorial Tools (if unlocked or user is Admin) */}
          {showAdvancedTools && (
            <>
              {[
                { id: "ENGENHARIA_REVERSA" as QuestoesIATab, label: "Engenharia Reversa", icon: BrainCircuit },
                { id: "AUDITAR" as QuestoesIATab, label: "Auditar Questões", icon: ShieldCheck, count: awaitingAuditCount },
                { id: "PROBLEMAS" as QuestoesIATab, label: "Questões com Problemas", icon: AlertTriangle, count: problemCount },
              ].map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`px-3 py-3 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                      isActive
                        ? "text-purple-300 border-purple-500 bg-purple-500/10"
                        : "text-zinc-400 border-transparent hover:text-purple-200 hover:bg-white/[0.02]"
                    }`}
                  >
                    <TabIcon className={`w-3.5 h-3.5 ${isActive ? "text-purple-400" : "text-zinc-400"}`} />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                          tab.id === "PROBLEMAS"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-purple-500/20 text-purple-300"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Toggle Advanced / Editorial area */}
        <button
          type="button"
          onClick={() => setShowAdvancedTools(!showAdvancedTools)}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
            showAdvancedTools
              ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
          title="Ferramentas avançadas de auditoria clínica e engenharia reversa"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{showAdvancedTools ? "Ocultar Área Avançada" : "Área Avançada / Editorial"}</span>
        </button>
      </div>

      {/* TAB CONTENT VIEWS */}
      {/* 1. GERAR QUESTÕES */}
      {activeSubTab === "GERAR" && (
        <div className="space-y-6">
          <div className="p-8 rounded-3xl bg-[#0d1017] border border-white/10 text-center space-y-4 max-w-2xl mx-auto my-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mx-auto shadow-xl">
              <BrainCircuit className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">
                Pronto para gerar questões inéditas com Padrão Revalida INEP?
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Selecione a área médica, um dos 75 Grandes Temas, a quantidade e o modo de Engenharia Reversa Avançada para iniciar a produção automatizada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className="px-8 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white font-bold text-sm inline-flex items-center gap-2 shadow-xl hover:scale-105 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Abrir Assistente de Geração</span>
            </button>
          </div>

          {/* Quick theme shortcuts to generate */}
          <ReverseEngineeringFlow
            onSelectThemeForGeneration={handleSelectThemeForGeneration}
          />
        </div>
      )}

      {/* 2. ENGENHARIA REVERSA */}
      {activeSubTab === "ENGENHARIA_REVERSA" && (
        <ReverseEngineeringFlow
          onSelectThemeForGeneration={handleSelectThemeForGeneration}
        />
      )}

      {/* 3. AUDITAR QUESTÕES */}
      {activeSubTab === "AUDITAR" && (
        <QuestionAuditLab
          questions={allGeneratedQuestions.filter(
            (q) => q.generationStatus !== "PUBLISHED"
          )}
          onApprove={handleApprove}
          onPublish={handlePublish}
          onReject={handleReject}
        />
      )}

      {/* 4. BANCO GERADO */}
      {activeSubTab === "BANCO_GERADO" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Area Filter */}
              <select
                value={selectedAreaFilter}
                onChange={(e) => setSelectedAreaFilter(e.target.value as any)}
                className="bg-[#151923] text-xs text-white border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">Todas as Áreas</option>
                <option value="CLINICA_MEDICA">Clínica Médica</option>
                <option value="CIRURGIA_GERAL">Cirurgia Geral</option>
                <option value="PEDIATRIA">Pediatria</option>
                <option value="GINECOLOGIA_OBSTETRICIA">Ginecologia e Obstetrícia</option>
                <option value="MEDICINA_FAMILIA_COMUNIDADE">Preventiva & SUS</option>
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="bg-[#151923] text-xs text-white border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">Todos os Status</option>
                <option value="PUBLISHED">Apenas Publicadas</option>
                <option value="APPROVED">Apenas Aprovadas</option>
                <option value="PENDING">Aguardando Auditoria</option>
              </select>
            </div>

            {/* Search */}
            <div className="relative min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar no banco gerado..."
                className="w-full bg-[#151923] text-xs text-white border border-white/10 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Questions Grid / List */}
          <div className="space-y-4">
            {filteredBankQuestions.map((question) => (
              <GeneratedQuestionCard
                key={question.id}
                question={question}
                onApprove={handleApprove}
                onPublish={handlePublish}
                onReject={handleReject}
              />
            ))}
          </div>
        </div>
      )}

      {/* 5. QUESTÕES COM PROBLEMAS */}
      {activeSubTab === "PROBLEMAS" && (
        <ProblemQuestionsView
          questions={allGeneratedQuestions}
          onRegenerateQuestion={(q) => {
            setPrefilledGenerationParams({
              area: q.area,
              theme: q.topic,
              subtheme: q.subtopic,
            });
            setIsConfigModalOpen(true);
          }}
          onApprove={handleApprove}
          onReject={handleReject}
          onPublish={handlePublish}
        />
      )}

      {/* Generation Config & Execution Modal */}
      <GenerationConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onGenerateSuccess={handleGenerateSuccess}
        initialArea={prefilledGenerationParams?.area}
        initialTheme={prefilledGenerationParams?.theme}
        initialSubtheme={prefilledGenerationParams?.subtheme}
      />
    </div>
  );
};
