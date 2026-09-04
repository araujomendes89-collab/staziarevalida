import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Layers,
  RotateCcw,
  ArrowLeft,
  FileText,
  Table as TableIcon,
  List as ListIcon,
  ShieldCheck,
  Award,
  Check,
  X,
  Clock,
  HelpCircle,
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
import { getAreaVisualTheme, CANONICAL_AREA_DISPLAY_LABELS } from "../../config/areaThemes";

export type ProtocolSubTab =
  | "overview"
  | "mudou_2025"
  | "mudou_2026"
  | "tabela_comparativa"
  | "questoes_antigas"
  | "questoes_ineditas"
  | "flashcards";

export const ProtocolUpdatesHubView: React.FC<{ initialTab?: ProtocolSubTab }> = () => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<"LIST" | "TABLE">("LIST");
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [selectedYearTag, setSelectedYearTag] = useState<string>("ALL");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");

  // Selected Protocol for Detailed View
  const selectedProtocol = useMemo(() => {
    if (!selectedProtocolId) return null;
    return PROTOCOL_UPDATES_2025_2026.find((p) => p.id === selectedProtocolId) || null;
  }, [selectedProtocolId]);

  // Accordion state for Historical Questions in Detail View
  const [isHistoricalQuestionsOpen, setIsHistoricalQuestionsOpen] = useState<boolean>(false);

  // Interactive Question State (Local Preview)
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [isQuestionSubmitted, setIsQuestionSubmitted] = useState<boolean>(false);

  // Interactive Flashcard State (Local Preview)
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);
  const [isCardFlipped, setIsCardFlipped] = useState<boolean>(false);

  // Reset interactive states when changing protocol
  const handleSelectProtocol = (protocol: ProtocolUpdate | null) => {
    setSelectedProtocolId(protocol ? protocol.id : null);
    setIsHistoricalQuestionsOpen(false);
    setSelectedOption(null);
    setIsQuestionSubmitted(false);
    setActiveCardIndex(0);
    setIsCardFlipped(false);
    // Scroll top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filtered Protocols List
  const filteredProtocols = useMemo(() => {
    return PROTOCOL_UPDATES_2025_2026.filter((p) => {
      const matchSearch =
        searchQuery === "" ||
        p.tema.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.subtema.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.instituicao.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.conduta_vigente.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.recomendacao_pre_2025.toLowerCase().includes(searchQuery.toLowerCase());

      const matchArea = selectedArea === "ALL" || p.area === selectedArea;
      const matchPriority = selectedPriority === "ALL" || p.nivel_prioridade === selectedPriority;
      const matchYear =
        selectedYearTag === "ALL" ||
        (selectedYearTag === "2025" &&
          (p.tag_ano === "ATUALIZACAO_2025" || p.tag_ano === "ATUALIZADO_2025_E_2026")) ||
        (selectedYearTag === "2026" &&
          (p.tag_ano === "ATUALIZACAO_2026" || p.tag_ano === "ATUALIZADO_2025_E_2026"));

      return matchSearch && matchArea && matchPriority && matchYear;
    });
  }, [searchQuery, selectedArea, selectedPriority, selectedYearTag]);

  // Helper labels
  const getAreaLabel = (area: MedicalArea | string) => {
    if (area === "CLINICA_MEDICA") return CANONICAL_AREA_DISPLAY_LABELS.CLINICA_MEDICA;
    if (area === "CIRURGIA_GERAL") return CANONICAL_AREA_DISPLAY_LABELS.CIRURGIA_GERAL;
    if (area === "PEDIATRIA") return CANONICAL_AREA_DISPLAY_LABELS.PEDIATRIA;
    if (area === "GINECOLOGIA_OBSTETRICIA") return CANONICAL_AREA_DISPLAY_LABELS.GINECOLOGIA_OBSTETRICIA;
    if (area === "MEDICINA_FAMILIA_COMUNIDADE") return CANONICAL_AREA_DISPLAY_LABELS.MEDICINA_PREVENTIVA;
    return "Área Médica";
  };

  const getYearBadge = (tag: UpdateYearTag) => {
    switch (tag) {
      case "ATUALIZADO_2025_E_2026":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
            Atualizado 2025 & 2026
          </span>
        );
      case "ATUALIZACAO_2026":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30">
            Diretriz 2026
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30">
            Atualização 2025
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: UpdatePriority) => {
    if (priority === "PRIORIDADE_1_MUITO_ALTA") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20">
          Prioridade editorial: Muito Alta
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20">
        Prioridade editorial: Alta
      </span>
    );
  };

  // =========================================================================
  // VIEW: DETALHE DA ATUALIZAÇÃO (O QUE MUDOU PROTAGONISTA)
  // =========================================================================
  if (selectedProtocol) {
    const areaTheme = getAreaVisualTheme(selectedProtocol.area);
    const affectedQuestions = selectedProtocol.affected_exam_questions || [];
    const flashcards = selectedProtocol.flashcards || [];
    const ineditas = selectedProtocol.ineditas || [];
    const currentInedita = ineditas[0] || null;
    const currentFlashcard = flashcards[activeCardIndex] || flashcards[0] || null;

    return (
      <div className="space-y-6 pb-24 max-w-5xl mx-auto animate-in fade-in duration-200">
        {/* Navigation Breadcrumb / Back Button */}
        <div>
          <button
            onClick={() => handleSelectProtocol(null)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para todas as atualizações</span>
          </button>
        </div>

        {/* Protocol Detail Header */}
        <div
          className={`p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#0f1322] border border-slate-200 dark:border-white/10 shadow-sm border-l-4 ${areaTheme.borderLeft} space-y-4`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${areaTheme.badgeBg} ${areaTheme.badgeText} border ${areaTheme.badgeBorder}`}
            >
              {getAreaLabel(selectedProtocol.area)}
            </span>
            {getYearBadge(selectedProtocol.tag_ano)}
            {getPriorityBadge(selectedProtocol.nivel_prioridade)}
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
              {selectedProtocol.tema}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400">
              {selectedProtocol.subtema} • {selectedProtocol.instituicao} ({selectedProtocol.data_publicacao})
            </p>
          </div>
        </div>

        {/* ===================================================================
            1. PROTAGONISTA: O QUE MUDOU? (ANTES × AGORA)
        =================================================================== */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-800 dark:text-zinc-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-bold">O que mudou na conduta médica?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ANTES (Conduta Anterior) */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Conduta Anterior (Antes de 2025)</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                {selectedProtocol.recomendacao_pre_2025}
              </p>
            </div>

            {/* AGORA (Conduta Vigente) */}
            <div className="p-5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Conduta Vigente (Padrão Atual Oficial)</span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-emerald-950 dark:text-emerald-100 leading-relaxed">
                {selectedProtocol.conduta_vigente}
              </p>
            </div>
          </div>

          {/* Detailed chronological changes if applicable */}
          {(selectedProtocol.atualizacao_2025 || selectedProtocol.atualizacao_2026) && (
            <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 space-y-2 text-xs text-slate-700 dark:text-zinc-300">
              <span className="font-bold text-slate-900 dark:text-white block">
                Detalhes da Transição Normativa:
              </span>
              {selectedProtocol.atualizacao_2025 && (
                <p>
                  <strong className="text-amber-700 dark:text-amber-300">2025:</strong>{" "}
                  {selectedProtocol.atualizacao_2025}
                </p>
              )}
              {selectedProtocol.atualizacao_2026 && (
                <p>
                  <strong className="text-rose-700 dark:text-rose-300">2026:</strong>{" "}
                  {selectedProtocol.atualizacao_2026}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ===================================================================
            2. PARA O REVALIDA (O QUE LEMBRAR NA PROVA)
        =================================================================== */}
        <div className="p-5 sm:p-6 rounded-2xl bg-slate-50 dark:bg-[#0c0f1d] border border-slate-200 dark:border-white/10 space-y-4">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              O que lembrar para o Revalida INEP
            </h3>
          </div>

          <div className="space-y-3 text-xs sm:text-sm">
            <div className="space-y-1">
              <span className="font-bold text-slate-900 dark:text-amber-300">
                🎯 Como o INEP cobra na prova:
              </span>
              <p className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                {selectedProtocol.impacto_revalida}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 dark:bg-rose-950/20 border border-rose-500/20 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Alerta de Pegadinha da Banca:</span>
              </div>
              <p className="text-xs text-rose-900 dark:text-zinc-300 leading-relaxed">
                {selectedProtocol.pegadinha}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/5">
              <span className="font-bold text-slate-800 dark:text-zinc-300 text-xs">
                📊 Impacto Clínico & Justificativa:
              </span>
              <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                {selectedProtocol.impacto_clinico}
              </p>
            </div>
          </div>
        </div>

        {/* ===================================================================
            3. FONTE & ATRIBUIÇÃO PRIMÁRIA
        =================================================================== */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0e111d] border border-slate-200 dark:border-white/10 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 dark:text-zinc-200 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Fonte Oficial & Documento Primário</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-500">
              Verificado: {selectedProtocol.ultima_verificacao}
            </span>
          </div>

          <p className="text-slate-700 dark:text-zinc-300">
            <strong>{selectedProtocol.nome_documento}</strong> — {selectedProtocol.instituicao} ({selectedProtocol.data_publicacao})
          </p>

          <div className="pt-1">
            <a
              href={selectedProtocol.url_oficial}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-emerald-400 hover:underline min-h-[44px]"
            >
              <span>Abrir documento oficial primário</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* ===================================================================
            4. QUESTÕES HISTÓRICAS AFETADAS (ACCORDION)
        =================================================================== */}
        {affectedQuestions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c0f1d] overflow-hidden">
            <button
              onClick={() => setIsHistoricalQuestionsOpen(!isHistoricalQuestionsOpen)}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer min-h-[48px]"
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Questões Históricas da Prova Afetadas ({affectedQuestions.length})
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 font-medium">
                <span>{isHistoricalQuestionsOpen ? "Ocultar" : "Ver questões"}</span>
                {isHistoricalQuestionsOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {isHistoricalQuestionsOpen && (
              <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 space-y-4 bg-slate-50/50 dark:bg-black/20">
                {affectedQuestions.map((q) => (
                  <div
                    key={q.questionId}
                    className="p-4 rounded-xl bg-white dark:bg-[#111424] border border-slate-200 dark:border-white/10 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white">
                        {q.examCode} • Questão #{q.questionNumber} ({q.year})
                      </span>
                    </div>

                    {/* Outdated Notice */}
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-100">
                        <strong className="block text-amber-800 dark:text-amber-300 font-semibold mb-0.5">
                          Aviso de Atualização:
                        </strong>
                        {q.aviso_desatualizacao}
                      </div>
                    </div>

                    {/* Historical vs Current Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-white/5 space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">
                          Gabarito Original Oficial da Prova:
                        </span>
                        <p className="text-slate-800 dark:text-zinc-200 font-medium">
                          {q.gabarito_original}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 space-y-1">
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                          Conduta Vigente Atual:
                        </span>
                        <p className="text-emerald-950 dark:text-emerald-200 font-medium">
                          {q.conduta_vigente}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            5. REVISÃO ATIVA & PRÁTICA (COMPLEMENTAR / PREVIEW)
        =================================================================== */}
        {(currentInedita || currentFlashcard) && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-slate-800 dark:text-zinc-200">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Revisão Ativa & Prática Focalizada
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Interactive Inédita Question */}
              {currentInedita && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#0f1322] border border-slate-200 dark:border-white/10 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        ✨ Questão Inédita Comentada
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-400">
                        Nível {currentInedita.difficulty}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-800 dark:text-zinc-200 leading-relaxed">
                      {currentInedita.statement}
                    </p>

                    {/* Options */}
                    <div className="space-y-2 pt-1">
                      {currentInedita.options.map((opt) => {
                        const isChosen = selectedOption === opt.id;
                        const isCorrect = currentInedita.correctAnswer === opt.id;

                        let optClass =
                          "p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all cursor-pointer ";
                        if (isQuestionSubmitted) {
                          if (isCorrect) {
                            optClass +=
                              "bg-emerald-500/10 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-medium";
                          } else if (isChosen && !isCorrect) {
                            optClass +=
                              "bg-rose-500/10 border-rose-500 text-rose-950 dark:text-rose-200";
                          } else {
                            optClass +=
                              "bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 text-slate-400 dark:text-zinc-500 opacity-60";
                          }
                        } else {
                          if (isChosen) {
                            optClass +=
                              "bg-indigo-50 dark:bg-indigo-600/20 border-indigo-500 text-indigo-950 dark:text-white font-medium";
                          } else {
                            optClass +=
                              "bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]";
                          }
                        }

                        return (
                          <div
                            key={opt.id}
                            onClick={() => !isQuestionSubmitted && setSelectedOption(opt.id as any)}
                            className={optClass}
                          >
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
                                isChosen
                                  ? "bg-indigo-600 text-white"
                                  : "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-300"
                              }`}
                            >
                              {opt.id}
                            </span>
                            <div className="space-y-1">
                              <p>{opt.text}</p>
                              {isQuestionSubmitted && (
                                <p className="text-[11px] text-slate-600 dark:text-zinc-400 pt-1 border-t border-slate-200 dark:border-white/5">
                                  {opt.justification}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2">
                    {!isQuestionSubmitted ? (
                      <button
                        onClick={() => setIsQuestionSubmitted(true)}
                        disabled={!selectedOption}
                        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs transition-all cursor-pointer min-h-[44px]"
                      >
                        Confirmar Resposta & Ver Justificativas
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 text-xs space-y-1 text-slate-800 dark:text-zinc-200">
                        <strong className="text-indigo-700 dark:text-indigo-300 block">
                          Comentário do Especialista:
                        </strong>
                        <p>{currentInedita.commentary}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Interactive Flashcard */}
              {currentFlashcard && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#0f1322] border border-slate-200 dark:border-white/10 space-y-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Flashcard de Fixação
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-500">
                      {activeCardIndex + 1} de {flashcards.length}
                    </span>
                  </div>

                  {/* Flip Card Surface */}
                  <div
                    onClick={() => setIsCardFlipped(!isCardFlipped)}
                    className="min-h-[160px] p-5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-white/10 hover:border-teal-500/40 transition-all flex flex-col justify-between cursor-pointer select-none"
                  >
                    {!isCardFlipped ? (
                      <div className="space-y-2 text-center my-auto">
                        <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-zinc-500">
                          Pergunta:
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                          {currentFlashcard.front}
                        </p>
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 block pt-1">
                          (Clique no card para virar)
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2 text-center my-auto">
                        <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                          ✅ Resposta / Conduta Vigente:
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-emerald-950 dark:text-emerald-200 leading-relaxed">
                          {currentFlashcard.back}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Flashcard Controls */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => {
                        setIsCardFlipped(false);
                        setActiveCardIndex((prev) => (prev === 0 ? flashcards.length - 1 : prev - 1));
                      }}
                      disabled={flashcards.length <= 1}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all cursor-pointer min-h-[40px]"
                    >
                      Anterior
                    </button>

                    <button
                      onClick={() => setIsCardFlipped(!isCardFlipped)}
                      className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all cursor-pointer min-h-[40px]"
                    >
                      {isCardFlipped ? "Ocultar Resposta" : "Virar Card"}
                    </button>

                    <button
                      onClick={() => {
                        setIsCardFlipped(false);
                        setActiveCardIndex((prev) => (prev === flashcards.length - 1 ? 0 : prev + 1));
                      }}
                      disabled={flashcards.length <= 1}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all cursor-pointer min-h-[40px]"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW: TABELA COMPARATIVA (MODO SECUNDÁRIO)
  // =========================================================================
  if (viewMode === "TABLE") {
    return (
      <div className="space-y-6 pb-24 max-w-6xl mx-auto animate-in fade-in duration-200">
        {/* Header with return toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#0f121d] border border-slate-200 dark:border-white/10 shadow-sm">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-indigo-500" />
              Matriz Comparativa de Atualizações (Antes × Agora)
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Visualização consolidada de condutas anteriores e diretrizes vigentes no SUS.
            </p>
          </div>

          <button
            onClick={() => setViewMode("LIST")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-all cursor-pointer min-h-[44px]"
          >
            <ListIcon className="w-4 h-4" />
            <span>Voltar para Lista de Atualizações</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-zinc-200 focus:outline-none min-h-[40px]"
          >
            <option value="ALL">Todas as Áreas</option>
            <option value="CLINICA_MEDICA">Clínica Médica</option>
            <option value="CIRURGIA_GERAL">Cirurgia Geral</option>
            <option value="PEDIATRIA">Pediatria</option>
            <option value="GINECOLOGIA_OBSTETRICIA">Ginecologia e Obstetrícia</option>
            <option value="MEDICINA_FAMILIA_COMUNIDADE">Medicina Preventiva & SUS</option>
          </select>

          <select
            value={selectedYearTag}
            onChange={(e) => setSelectedYearTag(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-zinc-200 focus:outline-none min-h-[40px]"
          >
            <option value="ALL">Todos os Anos</option>
            <option value="2025">Ano 2025</option>
            <option value="2026">Ano 2026</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a0c14] shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 uppercase font-bold text-[10px] tracking-wider">
                <th className="p-3.5 min-w-[160px]">Tema & Área</th>
                <th className="p-3.5 min-w-[200px]">Conduta Anterior</th>
                <th className="p-3.5 min-w-[220px] text-emerald-600 dark:text-emerald-400">
                  Conduta Vigente
                </th>
                <th className="p-3.5 min-w-[100px] text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredProtocols.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="p-3.5 align-top">
                    <p className="font-bold text-slate-900 dark:text-white text-xs">{p.tema}</p>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5">
                      {getAreaLabel(p.area)}
                    </span>
                  </td>
                  <td className="p-3.5 align-top text-slate-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                    {p.recomendacao_pre_2025}
                  </td>
                  <td className="p-3.5 align-top text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed text-[11px]">
                    {p.conduta_vigente}
                  </td>
                  <td className="p-3.5 align-top text-center">
                    <button
                      onClick={() => handleSelectProtocol(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 dark:text-rose-300 hover:bg-blue-50 dark:hover:bg-white/10 transition-colors cursor-pointer min-h-[36px]"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: HOME — LISTA COMPACTA DE ATUALIZAÇÕES (PADRÃO)
  // =========================================================================
  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto animate-in fade-in duration-200">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-7 rounded-3xl bg-white dark:bg-[#0f1322] border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              Diretrizes & PCDTs
            </span>
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              {PROTOCOL_UPDATES_2025_2026.length} atualizações catalogadas
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Atualizações & Diretrizes
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 max-w-2xl">
            Mudanças clínicas e normativas que podem alterar sua resposta na prova do Revalida.
          </p>
        </div>

        {/* Secondary View Toggle: Tabela Comparativa */}
        <div className="shrink-0">
          <button
            onClick={() => setViewMode("TABLE")}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer min-h-[44px]"
          >
            <TableIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
            <span>Modo Tabela Comparativa</span>
          </button>
        </div>
      </div>

      {/* Compact Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0e111d] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por tema, conduta, fármaco, vacina ou órgão..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 min-h-[40px]"
          />
        </div>

        {/* Year Filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedYearTag}
            onChange={(e) => setSelectedYearTag(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-zinc-200 focus:outline-none min-h-[40px]"
          >
            <option value="ALL">Todos os Anos</option>
            <option value="2025">Ano 2025</option>
            <option value="2026">Ano 2026</option>
          </select>

          {/* Area Filter */}
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-zinc-200 focus:outline-none min-h-[40px]"
          >
            <option value="ALL">Todas as Áreas</option>
            <option value="CLINICA_MEDICA">Clínica Médica</option>
            <option value="CIRURGIA_GERAL">Cirurgia Geral</option>
            <option value="PEDIATRIA">Pediatria</option>
            <option value="GINECOLOGIA_OBSTETRICIA">Ginecologia e Obstetrícia</option>
            <option value="MEDICINA_FAMILIA_COMUNIDADE">Medicina Preventiva & SUS</option>
          </select>
        </div>
      </div>

      {/* Filter summary when filtering is active */}
      {(searchQuery !== "" || selectedArea !== "ALL" || selectedYearTag !== "ALL") && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 px-1">
          <span>
            Exibindo <strong>{filteredProtocols.length}</strong> de{" "}
            <strong>{PROTOCOL_UPDATES_2025_2026.length}</strong> atualizações
          </span>
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedArea("ALL");
              setSelectedYearTag("ALL");
              setSelectedPriority("ALL");
            }}
            className="text-blue-600 dark:text-rose-400 hover:underline cursor-pointer font-medium"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {/* High-Scanability List of Updates */}
      <div className="space-y-3.5">
        {filteredProtocols.map((protocol) => {
          const areaTheme = getAreaVisualTheme(protocol.area);
          const affectedCount = protocol.affected_exam_questions?.length || 0;

          return (
            <div
              key={protocol.id}
              className={`p-5 rounded-2xl bg-white dark:bg-[#0f1322] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-sm border-l-4 ${areaTheme.borderLeft} flex flex-col md:flex-row md:items-center justify-between gap-4`}
            >
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${areaTheme.badgeBg} ${areaTheme.badgeText} border ${areaTheme.badgeBorder}`}
                  >
                    {getAreaLabel(protocol.area)}
                  </span>
                  {getYearBadge(protocol.tag_ano)}
                  {getPriorityBadge(protocol.nivel_prioridade)}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {protocol.tema}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {protocol.subtema} • {protocol.instituicao}
                  </p>
                </div>

                {/* Short excerpt of what changed */}
                <p className="text-xs text-slate-700 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white">Conduta vigente: </strong>
                  {protocol.conduta_vigente}
                </p>

                {/* Secondary Badges / Quick Indicators */}
                {affectedCount > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      <BookOpen className="w-3 h-3" />
                      {affectedCount} questão(ões) da prova com gabarito histórico afetado
                    </span>
                  </div>
                )}
              </div>

              {/* Action CTA */}
              <div className="shrink-0 flex items-center md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-white/5">
                <button
                  onClick={() => handleSelectProtocol(protocol)}
                  className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-rose-500/10 hover:dark:bg-rose-500 text-white dark:text-rose-300 hover:dark:text-white transition-all cursor-pointer min-h-[44px]"
                >
                  <span>Ver atualização</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredProtocols.length === 0 && (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#0c0f1d] border border-slate-200 dark:border-white/10 space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
              Nenhuma atualização encontrada para os filtros selecionados.
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Tente alterar os termos de busca ou selecionar "Todas as Áreas" e "Todos os Anos".
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
