import React, { useState, useMemo } from "react";
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Flag,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Award,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  ActiveTrainingSession,
  SessionSummaryReport,
  Question,
  MedicalArea,
} from "../../types";
import { SessionBuilderService } from "../../services/sessionBuilderService";
import { formatMedicalArea } from "../../utils/formatters";

interface SessionResultsViewProps {
  session: ActiveTrainingSession;
  allQuestions: Question[];
  onRetrySession?: () => void;
  onStartErrorsSession?: (errorQuestionIds: string[]) => void;
  onStartSisterSession?: (errorQuestionIds: string[]) => void;
  onBackToHome?: () => void;
  onReviewAnswers?: () => void;
  onClose?: () => void;
}

export const SessionResultsView: React.FC<SessionResultsViewProps> = ({
  session,
  allQuestions,
  onRetrySession,
  onStartErrorsSession,
  onStartSisterSession,
  onBackToHome,
  onReviewAnswers,
  onClose,
}) => {
  const [reviewFilter, setReviewFilter] = useState<"ALL" | "ERRORS" | "FLAGGED">("ERRORS");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Compute summary using standard service
  const summary: SessionSummaryReport = useMemo(() => {
    return SessionBuilderService.generateSummaryReport(session, allQuestions);
  }, [session, allQuestions]);

  // Map session question items with answers
  const sessionQuestionItems = useMemo(() => {
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));
    return (session.questionIds || [])
      .map((qId, index) => {
        const question = qMap.get(qId);
        const answer = session.answers?.[qId];
        const isFlagged = (session.flaggedQuestionIds || []).includes(qId);
        const isAnnulled = Boolean(
          question &&
            (question.correctAnswer === "ANNULLED" ||
              question.answerFinal === "ANNULLED" ||
              question.officialStatus === "annulled")
        );

        return {
          questionIndex: index + 1,
          questionId: qId,
          question,
          answer,
          isFlagged,
          isAnnulled,
          isCorrect: isAnnulled ? false : answer?.isCorrect ?? false,
          isAnswered: Boolean(answer && answer.selectedOption),
        };
      })
      .filter((item) => Boolean(item.question));
  }, [session, allQuestions]);

  // Counts
  const totalCount = sessionQuestionItems.length;
  const answeredCount = sessionQuestionItems.filter((i) => i.isAnswered).length;
  const correctCount = sessionQuestionItems.filter((i) => i.isCorrect).length;
  const annulledCount = sessionQuestionItems.filter((i) => i.isAnnulled).length;
  const wrongCount = sessionQuestionItems.filter(
    (i) => i.isAnswered && !i.isCorrect && !i.isAnnulled
  ).length;

  const errorQuestionIds = useMemo(() => {
    return sessionQuestionItems
      .filter((i) => i.isAnswered && !i.isCorrect && !i.isAnnulled)
      .map((i) => i.questionId);
  }, [sessionQuestionItems]);

  const flaggedQuestionIds = useMemo(() => {
    return sessionQuestionItems.filter((i) => i.isFlagged).map((i) => i.questionId);
  }, [sessionQuestionItems]);

  // Filtered review list
  const filteredReviewItems = useMemo(() => {
    if (reviewFilter === "ERRORS") {
      return sessionQuestionItems.filter((i) => !i.isCorrect && !i.isAnnulled && i.isAnswered);
    }
    if (reviewFilter === "FLAGGED") {
      return sessionQuestionItems.filter((i) => i.isFlagged);
    }
    return sessionQuestionItems;
  }, [sessionQuestionItems, reviewFilter]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}h ${remMins}min`;
    }
    return `${mins}min ${remainingSecs.toString().padStart(2, "0")}s`;
  };

  const isFullExam = session.config?.objective === "FULL_EXAM";
  const isSimulado = session.mode === "SIMULADO";
  const scorePercent = summary.scorePercentage;

  const handleExit = () => {
    if (onClose) {
      onClose();
    } else if (onBackToHome) {
      onBackToHome();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
      {/* 1. CABEÇALHO PRINCIPAL DO RESULTADO */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/60">
              {isFullExam
                ? "Prova Oficial Concluída"
                : isSimulado
                ? "Simulado Concluído"
                : "Treino Concluído"}
            </span>
            <span className="text-xs text-slate-400">
              {session.title || "Sessão de Questões"}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Resultado da Sessão
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {correctCount} de {totalCount} {totalCount === 1 ? "questão correta" : "questões corretas"}
            {annulledCount > 0 && ` • ${annulledCount} anulada${annulledCount > 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Score Badge */}
        <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 border border-slate-200 shrink-0 min-w-[140px] text-center shadow-2xs">
          <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
            {scorePercent}%
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
            Taxa de Acerto
          </span>
        </div>
      </div>

      {/* 2. INDICADORES ESSENCIAIS (Métricas Limpas) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Acertos */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1 text-center">
          <div className="flex items-center justify-center text-emerald-600 gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Acertos</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono block">
            {correctCount}
          </span>
          <span className="text-[11px] text-slate-400 block">
            {totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0}% do total
          </span>
        </div>

        {/* Erros */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1 text-center">
          <div className="flex items-center justify-center text-rose-600 gap-1.5">
            <XCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Erros</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono block">
            {wrongCount}
          </span>
          <span className="text-[11px] text-slate-400 block">
            {totalCount > 0 ? Math.round((wrongCount / totalCount) * 100) : 0}% do total
          </span>
        </div>

        {/* Anuladas ou Marcadas */}
        {annulledCount > 0 ? (
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1 text-center">
            <div className="flex items-center justify-center text-amber-600 gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Anuladas</span>
            </div>
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono block">
              {annulledCount}
            </span>
            <span className="text-[11px] text-slate-400 block">Pela banca oficial</span>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1 text-center">
            <div className="flex items-center justify-center text-amber-600 gap-1.5">
              <Flag className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Marcadas</span>
            </div>
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono block">
              {flaggedQuestionIds.length}
            </span>
            <span className="text-[11px] text-slate-400 block">Para revisão</span>
          </div>
        )}

        {/* Tempo Total */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1 text-center">
          <div className="flex items-center justify-center text-teal-600 gap-1.5">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Tempo Total</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono block">
            {formatTimer(summary.totalTimeSeconds || session.totalDurationSeconds || 0)}
          </span>
          <span className="text-[11px] text-slate-400 block">
            ~{summary.avgTimePerQuestion || 0}s por questão
          </span>
        </div>
      </div>

      {/* 3. DESEMPENHO POR GRANDE ÁREA (Barras horizontais limpas) */}
      {summary.areaPerformance && Object.keys(summary.areaPerformance).length > 0 && (
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <span>Desempenho por Grande Área</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium">
              Baseado exclusivamente nas questões desta sessão
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {(Object.keys(summary.areaPerformance) as MedicalArea[]).map((areaKey) => {
              const data = summary.areaPerformance[areaKey];
              if (!data || data.total === 0) return null;
              const areaName = formatMedicalArea(areaKey);

              return (
                <div key={areaKey} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{areaName}</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {data.correct}/{data.total}{" "}
                      <span className="text-slate-400 font-normal">({data.percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        data.percentage >= 70
                          ? "bg-teal-600"
                          : data.percentage >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.max(4, data.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. QUESTÕES PARA REVISAR (Lista Compacta com Filtros) */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Questões da Sessão
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Revise suas respostas e o gabarito oficial com comentários editoriais.
            </p>
          </div>

          {/* Filtros da Revisão */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
            {[
              { id: "ERRORS" as const, label: `Erros (${wrongCount})` },
              { id: "FLAGGED" as const, label: `Marcadas (${flaggedQuestionIds.length})` },
              { id: "ALL" as const, label: `Todas (${totalCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReviewFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  reviewFilter === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Itens */}
        {filteredReviewItems.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/60 space-y-1">
            <CheckCircle2 className="w-8 h-8 text-teal-600 mx-auto" />
            <p className="text-xs font-bold text-slate-900">
              {reviewFilter === "ERRORS"
                ? "Nenhum erro registrado neste treino! Parabéns!"
                : reviewFilter === "FLAGGED"
                ? "Nenhuma questão foi marcada com flag durante a sessão."
                : "Nenhuma questão para exibir."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            {filteredReviewItems.map((item) => {
              const isExpanded = expandedQuestionId === item.questionId;
              const q = item.question!;
              const correctOption = q.options?.find((o) => o.isCorrect);

              return (
                <div
                  key={item.questionId}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-all overflow-hidden"
                >
                  <div
                    onClick={() =>
                      setExpandedQuestionId(isExpanded ? null : item.questionId)
                    }
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-xs font-extrabold font-mono text-slate-800 flex items-center justify-center shrink-0 shadow-2xs">
                        Q{item.questionIndex}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.isAnnulled ? (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                              Anulada pela Banca
                            </span>
                          ) : item.isCorrect ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Correta
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              Incorreta
                            </span>
                          )}

                          <span className="text-xs text-slate-600 font-medium truncate">
                            {formatMedicalArea(q.area)}
                            {q.topic ? ` • ${q.topic}` : ""}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                          {q.clinicalCase}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.isFlagged && (
                        <Flag className="w-3.5 h-3.5 text-amber-500 fill-current" />
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Detalhe Expandido da Questão */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 bg-white border-t border-slate-200/80 space-y-4 text-xs">
                      {/* Caso Clínico Completo */}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Enunciado
                        </span>
                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {q.clinicalCase}
                        </p>
                      </div>

                      {/* Resposta do Usuário vs Gabarito Oficial */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">
                            Sua Resposta
                          </span>
                          <span
                            className={`text-sm font-bold mt-0.5 block ${
                              item.isCorrect ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            Alternativa {item.answer?.selectedOption || "Não respondida"}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-200/60">
                          <span className="text-[10px] font-bold text-teal-700 uppercase block">
                            Gabarito Oficial
                          </span>
                          <span className="text-sm font-bold text-teal-900 mt-0.5 block">
                            {item.isAnnulled ? "Questão Anulada" : `Alternativa ${q.correctAnswer || correctOption?.id || "-"}`}
                          </span>
                        </div>
                      </div>

                      {/* Comentário Editorial StaziaMed */}
                      {correctOption?.explanation && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                            Comentário Editorial StaziaMed
                          </span>
                          <p className="text-slate-700 leading-relaxed">
                            {correctOption.explanation}
                          </p>
                        </div>
                      )}

                      {/* Matriz INEP se existir */}
                      {q.inepIntent && (
                        <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/60 space-y-0.5">
                          <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                            Matriz INEP — O que a banca avalia
                          </span>
                          <p className="text-blue-900 leading-relaxed">
                            {q.inepIntent}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. PRÓXIMAS AÇÕES */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={handleExit}
          className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer text-center"
        >
          {isFullExam ? "Voltar às Provas" : isSimulado ? "Voltar aos Simulados" : "Voltar ao Banco"}
        </button>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {errorQuestionIds.length > 0 && onStartErrorsSession && (
            <button
              type="button"
              onClick={() => onStartErrorsSession(errorQuestionIds)}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Treinar {errorQuestionIds.length} Questões Erradas</span>
            </button>
          )}

          {onRetrySession && (
            <button
              type="button"
              onClick={onRetrySession}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Refazer Este Treino</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
