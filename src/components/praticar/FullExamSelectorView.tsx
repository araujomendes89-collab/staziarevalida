import React, { useState, useMemo } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  ArrowRight,
  Shield,
  Printer,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { Question, QuestionAttempt, RevalidaEditionInventory } from "../../types";
import { InventoryValidatorService } from "../../services/inventoryValidatorService";
import { REVALIDA_EDITIONS_INVENTORY } from "../../data/revalidaInventoryData";

interface FullExamSelectorViewProps {
  editionsInventory?: RevalidaEditionInventory[];
  allQuestions?: Question[];
  attempts?: QuestionAttempt[];
  onStartExam?: (editionLabel: string, year: number, editionId?: string) => void;
  onPrintExam?: (editionLabel: string, year: number, editionId?: string) => void;
  onOpenInventory?: () => void;
  onBack?: () => void;
}

export const FullExamSelectorView: React.FC<FullExamSelectorViewProps> = ({
  editionsInventory = REVALIDA_EDITIONS_INVENTORY,
  allQuestions = [],
  attempts = [],
  onStartExam,
  onPrintExam,
  onBack,
}) => {
  const safeEditions = Array.isArray(editionsInventory)
    ? editionsInventory
    : REVALIDA_EDITIONS_INVENTORY;
  const safeQuestions = Array.isArray(allQuestions) ? allQuestions : [];
  const safeAttempts = Array.isArray(attempts) ? attempts : [];

  // Compute stats for each exam using canonical matcher
  const examStats = useMemo(() => {
    const map: Record<
      string,
      {
        totalQuestions: number;
        loadedCount: number;
        answeredCount: number;
        correctCount: number;
        questions: Question[];
      }
    > = {};

    for (const ed of safeEditions) {
      const edQuestions = safeQuestions.filter((q) =>
        InventoryValidatorService.matchesEdition(q, ed)
      );

      const qIds = new Set(edQuestions.map((q) => q.id));
      const userAttempts = safeAttempts.filter((a) => qIds.has(a.questionId));
      const correctAttempts = userAttempts.filter((a) => a.isCorrect);

      map[ed.id] = {
        totalQuestions: ed.objectiveCount || 100,
        loadedCount: edQuestions.length,
        answeredCount: userAttempts.length,
        correctCount: correctAttempts.length,
        questions: edQuestions,
      };
    }

    return map;
  }, [safeEditions, safeQuestions, safeAttempts]);

  // Extract compact edition tag (e.g. "2026/1", "2025/2", "2021")
  const getEditionShortTag = (ed: RevalidaEditionInventory) => {
    if (ed.editionLabel.includes("2026/1")) return "2026/1";
    if (ed.editionLabel.includes("2025/2")) return "2025/2";
    if (ed.editionLabel.includes("2025/1")) return "2025/1";
    if (ed.editionLabel.includes("2024/2")) return "2024/2";
    if (ed.editionLabel.includes("2024/1")) return "2024/1";
    if (ed.editionLabel.includes("2023/2")) return "2023/2";
    if (ed.editionLabel.includes("2023/1")) return "2023/1";
    if (ed.editionLabel.includes("2022/2")) return "2022/2";
    if (ed.editionLabel.includes("2022/1")) return "2022/1";
    if (ed.editionLabel.includes("ENAMED")) return "ENAMED 2025";
    return ed.year ? `${ed.year}` : ed.id;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* 1. CABEÇALHO COMPACTO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
              Revalida INEP
            </span>
            <span className="text-xs text-slate-400">2020 → 2026/1</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Provas Oficiais
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Resolva edições completas na ordem original da prova com cartão-resposta.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 shrink-0">
          <Shield className="w-4 h-4 text-teal-600" />
          <span className="font-bold text-slate-900">
            {safeEditions.length} edições oficiais
          </span>
        </div>
      </div>

      {/* 2. CABEÇALHO DA LISTA DE EDIÇÕES */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Edições Disponíveis
        </span>
        <span className="text-xs text-slate-500 font-medium">
          {safeEditions.length} cadernos cadastrados
        </span>
      </div>

      {/* 3. GRID DE 2 COLUNAS DE PROVAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {safeEditions.map((ed) => {
          const stats = examStats[ed.id] || {
            totalQuestions: 100,
            loadedCount: 0,
            answeredCount: 0,
            correctCount: 0,
            questions: [],
          };
          const isAvailable = stats.loadedCount > 0;
          const progressPercent = isAvailable
            ? Math.round((stats.answeredCount / stats.loadedCount) * 100)
            : 0;
          const scorePercent =
            stats.answeredCount > 0
              ? Math.round((stats.correctCount / stats.answeredCount) * 100)
              : 0;

          const isCompleted =
            stats.answeredCount >= stats.loadedCount && isAvailable;
          const isStarted = stats.answeredCount > 0 && !isCompleted;
          const shortTag = getEditionShortTag(ed);
          const bookletColor = ed.booklets?.[0]?.color || "Caderno Oficial";

          return (
            <div
              key={ed.id}
              className={`p-5 rounded-2xl bg-white border transition-all flex flex-col justify-between space-y-4 shadow-xs ${
                isAvailable
                  ? "border-slate-200/90 hover:border-teal-400 hover:shadow-sm"
                  : "border-slate-200/60 opacity-80"
              }`}
            >
              <div className="space-y-2.5">
                {/* Topo do Card: Tag da Edição + Status da Disponibilidade */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold font-mono px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                    {shortTag}
                  </span>

                  {isAvailable ? (
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/60">
                      {stats.loadedCount} questões
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200/60">
                      Indisponível
                    </span>
                  )}
                </div>

                {/* Título da Prova */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-snug">
                    {ed.editionLabel}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                    {ed.stage} • {ed.objectiveCount} questões objetivas
                  </p>
                </div>

                {/* Linha Compacta de Informações Técnicas */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap pt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-slate-400" />
                    {bookletColor}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-slate-400" />
                    ~4h
                  </span>
                  {ed.officialNotice && (
                    <>
                      <span>•</span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[150px]" title={ed.officialNotice}>
                        {ed.officialNotice}
                      </span>
                    </>
                  )}
                </div>

                {/* Barra de Progresso se já iniciada */}
                {stats.answeredCount > 0 && (
                  <div className="space-y-1 pt-1.5 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium">
                        {stats.answeredCount}/{stats.loadedCount} resolvidas
                      </span>
                      <span className="font-mono text-teal-700 font-bold">
                        {scorePercent}% acerto
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-teal-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, progressPercent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé de Ações: [ Iniciar prova ] e [ Imprimir ] */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                {onPrintExam && (
                  <button
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => onPrintExam(ed.editionLabel, ed.year, ed.id)}
                    title={
                      !isAvailable
                        ? "Nenhuma questão cadastrada para esta edição"
                        : "Gerar Caderno de Prova Padrão INEP em PDF para Impressão"
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                    <span>Imprimir</span>
                  </button>
                )}

                {onStartExam && (
                  <button
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => onStartExam(ed.editionLabel, ed.year, ed.id)}
                    title={
                      !isAvailable
                        ? "Nenhuma questão disponível nesta edição"
                        : undefined
                    }
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer"
                  >
                    <span>
                      {!isAvailable
                        ? "Indisponível"
                        : isStarted
                        ? "Continuar Prova"
                        : isCompleted
                        ? "Refazer Prova"
                        : "Iniciar Prova"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
