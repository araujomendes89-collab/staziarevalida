import React, { useState, useMemo } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Filter,
  Brain,
  Layers,
  Search,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Save,
  Clock,
  Sparkles,
  Stethoscope,
  X,
  Play,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";
import { ErrorTaxonomy, MedicalArea, Question } from "../../types";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../../services/sessionBuilderService";

const TAXONOMY_OPTIONS: { id: ErrorTaxonomy; label: string; desc: string }[] = [
  { id: "DISTRACTOR_TRAP", label: "Pegadinha / Distrator", desc: "Alternativa atraente com termo incorreto" },
  { id: "KNOWLEDGE_GAP", label: "Lacuna Teórica", desc: "Conceito fisiopatológico ou critério esquecido" },
  { id: "DIAGNOSIS_VS_CONDUCT", label: "Diagnóstico vs Conduta", desc: "Acertou o quadro clínico, mas errou a conduta ouro" },
  { id: "READING_HASTE", label: "Desatenção / Leitura Rápida", desc: "Não notou palavra-chave (ex: 'exceto', 'incorreta')" },
  { id: "PROTOCOL_CONFUSION", label: "Protocolo SUS", desc: "Confusão entre linha de cuidado municipal/estadual" },
  { id: "ELIMINATED_RIGHT_ANSWER", label: "Trocou a Certa", desc: "Estava na dúvida entre duas e marcou a errada" },
  { id: "TIME_PRESSURE", label: "Pressão de Tempo", desc: "Respondeu com pressa devido ao cronômetro" },
  { id: "OUTDATED_GUIDELINE", label: "Diretriz Antiga", desc: "Aplicou conduta anterior à atualização recente" },
];

export const ErrorNotebookView: React.FC = () => {
  const {
    attempts,
    questions,
    errorAutopsies,
    updateErrorAutopsyReflection,
    setActiveTab,
    setQuestionMode,
  } = useApp();

  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"ALL" | "PENDING" | "REMEDIATED">("ALL");
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<MedicalArea | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [reflectionTexts, setReflectionTexts] = useState<Record<string, string>>({});
  const [savedReflections, setSavedReflections] = useState<Set<string>>(new Set());

  // Derive wrong attempts list with linked question
  const wrongAttemptItems = useMemo(() => {
    const qMap = new Map(questions.map((q) => [q.id, q]));
    
    // Sort chronologically descending (most recent first)
    const sorted = [...attempts]
      .filter((a) => !a.isCorrect)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return sorted
      .map((att) => {
        const question = qMap.get(att.questionId);
        const autopsy = errorAutopsies?.find((ea) => ea.questionId === att.questionId || ea.id === att.id);
        const hasLaterCorrectAttempt = attempts.some(
          (other) =>
            other.questionId === att.questionId &&
            other.isCorrect &&
            new Date(other.timestamp).getTime() > new Date(att.timestamp).getTime()
        );

        return {
          attempt: att,
          question,
          autopsy,
          isRemediated: hasLaterCorrectAttempt || autopsy?.resolutionStatus === "REMEDIATED" || autopsy?.resolutionStatus === "MASTERED",
          reflection: reflectionTexts[att.id] ?? autopsy?.userReflection ?? att.userReflection ?? "",
        };
      })
      .filter((item) => Boolean(item.question));
  }, [attempts, questions, errorAutopsies, reflectionTexts]);

  // Recurrent error topics analysis
  const recurrentTopicsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of wrongAttemptItems) {
      const topic = item.question?.topic || "Geral";
      counts[topic] = (counts[topic] || 0) + 1;
    }
    return counts;
  }, [wrongAttemptItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    return wrongAttemptItems.filter((item) => {
      const q = item.question!;
      
      // Status filter
      if (selectedStatusFilter === "PENDING" && item.isRemediated) return false;
      if (selectedStatusFilter === "REMEDIATED" && !item.isRemediated) return false;

      // Area filter
      if (selectedAreaFilter !== "ALL" && q.area !== selectedAreaFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTopic = q.topic?.toLowerCase().includes(query);
        const matchesSubtopic = q.subtopic?.toLowerCase().includes(query);
        const matchesCase = q.clinicalCase?.toLowerCase().includes(query);
        const matchesCode = q.code?.toLowerCase().includes(query);
        if (!matchesTopic && !matchesSubtopic && !matchesCase && !matchesCode) {
          return false;
        }
      }

      return true;
    });
  }, [wrongAttemptItems, selectedStatusFilter, selectedAreaFilter, searchQuery]);

  // Stats
  const totalErrors = wrongAttemptItems.length;
  const pendingErrors = wrongAttemptItems.filter((i) => !i.isRemediated).length;
  const remediatedErrors = wrongAttemptItems.filter((i) => i.isRemediated).length;
  const recurrentTopicsCount = Object.values(recurrentTopicsMap).filter((c) => c >= 2).length;

  // Handle Save Reflection
  const handleSaveReflection = async (attemptId: string, questionId: string, text: string) => {
    setReflectionTexts((prev) => ({ ...prev, [attemptId]: text }));
    if (updateErrorAutopsyReflection) {
      const autopsy = errorAutopsies?.find((ea) => ea.questionId === questionId);
      if (autopsy) {
        await updateErrorAutopsyReflection(autopsy.id, autopsy.resolutionStatus, text);
      }
    }
    setSavedReflections((prev) => new Set(prev).add(attemptId));
    setTimeout(() => {
      setSavedReflections((prev) => {
        const next = new Set(prev);
        next.delete(attemptId);
        return next;
      });
    }, 2500);
  };

  // Start Training Session with all filtered error questions
  const handleTrainErrorQuestions = (itemsToTrain = filteredItems) => {
    const errorQIds = Array.from(new Set(itemsToTrain.map((i) => i.attempt.questionId)));
    if (errorQIds.length === 0) return;

    const config = {
      ...DEFAULT_SESSION_CONFIG,
      title: "Treino de Caderno de Erros",
      mode: "ESTUDO" as const,
      objective: "TREINO_ERROS" as any,
      quantity: errorQIds.length,
      feedbackMode: "IMMEDIATE" as const,
      timerMode: "FREE" as const,
    };

    const newSession = {
      id: `error-session-${Date.now()}`,
      title: config.title,
      subtitle: `${errorQIds.length} questões do Caderno de Erros`,
      mode: "ESTUDO" as const,
      config,
      questionIds: errorQIds,
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(newSession);
    setQuestionMode("EXAM");
    setActiveTab("praticar-questoes");
  };

  // Retrain single question
  const handleRetrainSingleQuestion = (questionId: string) => {
    const config = {
      ...DEFAULT_SESSION_CONFIG,
      title: "Revisão de Questão",
      mode: "SIMULADO" as const,
      quantity: 1,
      feedbackMode: "IMMEDIATE" as const,
      timerMode: "FREE" as const,
    };

    const newSession = {
      id: `single-retrain-${Date.now()}`,
      title: "Revisão de Questão",
      subtitle: "1 questão para fixação",
      mode: "SIMULADO" as const,
      config,
      questionIds: [questionId],
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(newSession);
    setQuestionMode("EXAM");
    setActiveTab("praticar-questoes");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* 1. CABEÇALHO COMPACTO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
              Revisão Ativa
            </span>
            <span className="text-xs text-slate-400">
              {totalErrors} {totalErrors === 1 ? "erro registrado" : "erros registrados"}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Caderno de Erros
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Revise os pontos que mais estão custando questões e elimine lacunas clínicas.
          </p>
        </div>

        {pendingErrors > 0 && (
          <button
            type="button"
            onClick={() => handleTrainErrorQuestions()}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition-all hover:scale-[1.02] cursor-pointer shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>TREINAR {pendingErrors} ERROS PENDENTES</span>
          </button>
        )}
      </div>

      {/* 2. RESUMO SUPERIOR (3 Indicadores Úteis) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Para Revisar
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono block">
            {pendingErrors}
          </span>
          <p className="text-xs text-slate-400">
            Erros ainda não superados em novos testes
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Temas Recorrentes
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono block">
            {recurrentTopicsCount}
          </span>
          <p className="text-xs text-slate-400">
            Temas com 2 ou mais erros no histórico
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Questões Superadas
            </span>
            <span className="w-2 h-2 rounded-full bg-teal-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono block">
            {remediatedErrors}
          </span>
          <p className="text-xs text-slate-400">
            Acertadas em tentativas subsequentes
          </p>
        </div>
      </div>

      {/* 3. FILTROS & BUSCA */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
            {[
              { id: "ALL" as const, label: `Todos (${totalErrors})` },
              { id: "PENDING" as const, label: `Para Revisar (${pendingErrors})` },
              { id: "REMEDIATED" as const, label: `Superados (${remediatedErrors})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedStatusFilter === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por tema, subtema ou enunciado..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Area Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1 shrink-0">
            Área:
          </span>
          {[
            { id: "ALL" as const, label: "Todas" },
            { id: "CLINICA_MEDICA" as const, label: "Clínica Médica" },
            { id: "CIRURGIA_GERAL" as const, label: "Cirurgia Geral" },
            { id: "PEDIATRIA" as const, label: "Pediatria" },
            { id: "GINECOLOGIA_OBSTETRICIA" as const, label: "Ginecologia & Obstetrícia" },
            { id: "MEDICINA_FAMILIA_COMUNIDADE" as const, label: "Preventiva / SUS" },
          ].map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setSelectedAreaFilter(area.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedAreaFilter === area.id
                  ? "bg-slate-900 text-white font-bold shadow-2xs"
                  : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. LISTA DE ERROS / ESTADO VAZIO */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {totalErrors === 0
                ? "Nenhuma questão no seu Caderno de Erros"
                : "Nenhum erro encontrado com os filtros selecionados"}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {totalErrors === 0
                ? "Continue praticando! Conforme você responder simulados e treinos, os pontos que merecem revisão aparecerão organizados aqui."
                : "Tente redefinir a busca ou selecionar outra área médica."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("praticar-questoes")}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
          >
            Resolver Questões
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const q = item.question!;
            const isExpanded = expandedAttemptId === item.attempt.id;
            const topicErrors = recurrentTopicsMap[q.topic || "Geral"] || 0;
            const isRecurrent = topicErrors >= 2;
            const isSaved = savedReflections.has(item.attempt.id);
            const correctOption = q.options?.find((o) => o.isCorrect);

            return (
              <div
                key={item.attempt.id}
                className="rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 shadow-xs transition-all overflow-hidden"
              >
                {/* Compact Card Header */}
                <div
                  onClick={() =>
                    setExpandedAttemptId(isExpanded ? null : item.attempt.id)
                  }
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {q.code || `Q${q.originalNumber || 1}`}
                      </span>

                      <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                        {formatMedicalArea(q.area)}
                      </span>

                      {isRecurrent && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          ⚠️ {topicErrors} erros neste tema
                        </span>
                      )}

                      {item.isRemediated && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                          ✓ Superado
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                      {q.topic} {q.subtopic ? `• ${q.subtopic}` : ""}
                    </h4>

                    <p className="text-xs text-slate-500 line-clamp-1">
                      {q.clinicalCase}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-xs text-rose-700 font-bold block">
                        Marcou {item.attempt.selectedOption}
                      </span>
                      <span className="text-[11px] text-teal-700 font-semibold block">
                        Gabarito: {q.correctAnswer || correctOption?.id || "-"}
                      </span>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-5 bg-slate-50/70 border-t border-slate-200/80 space-y-4 text-xs">
                    {/* Caso Clínico Completo */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Caso Clínico Integral
                      </span>
                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {q.clinicalCase}
                      </p>
                    </div>

                    {/* Resposta Marcada vs Gabarito Oficial */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80">
                        <span className="text-[10px] font-bold text-rose-800 uppercase block">
                          Sua Resposta Registrada
                        </span>
                        <span className="text-sm font-bold text-rose-900 mt-0.5 block">
                          Alternativa {item.attempt.selectedOption} (Incorreta)
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-teal-50 border border-teal-200/80">
                        <span className="text-[10px] font-bold text-teal-800 uppercase block">
                          Gabarito Oficial (INEP)
                        </span>
                        <span className="text-sm font-bold text-teal-900 mt-0.5 block">
                          Alternativa {q.correctAnswer || correctOption?.id || "-"}
                        </span>
                      </div>
                    </div>

                    {/* Comentário Editorial StaziaMed */}
                    {correctOption?.explanation && (
                      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                          Comentário Editorial StaziaMed
                        </span>
                        <p className="text-slate-700 leading-relaxed">
                          {correctOption.explanation}
                        </p>
                      </div>
                    )}

                    {/* Reflexão do Aluno: POR QUE EU ERREI? */}
                    <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
                          Por que eu errei esta questão? (Reflexão Pessoal)
                        </label>
                        {isSaved && (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                            ✓ Salvo com sucesso
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        value={item.reflection}
                        onChange={(e) =>
                          setReflectionTexts((prev) => ({
                            ...prev,
                            [item.attempt.id]: e.target.value,
                          }))
                        }
                        placeholder="Ex: Confundi os critérios de internação para pneumonia; não me atentei à frequência respiratória no enunciado."
                        className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                      />

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveReflection(
                              item.attempt.id,
                              q.id,
                              item.reflection
                            )
                          }
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Reflexão</span>
                        </button>
                      </div>
                    </div>

                    {/* Ações do Card */}
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Registrado em {new Date(item.attempt.timestamp).toLocaleDateString("pt-BR")}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRetrainSingleQuestion(q.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Refazer Esta Questão</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
