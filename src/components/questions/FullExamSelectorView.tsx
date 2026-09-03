import React, { useState } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Shield,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Trophy,
  Printer,
  FileDown,
  BookOpen,
  UploadCloud,
} from "lucide-react";
import { Question, QuestionAttempt, RevalidaEditionInventory } from "../../types";
import { InventoryValidatorService } from "../../services/inventoryValidatorService";
import { BookletIngestionModal } from "../modals/BookletIngestionModal";

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
  onOpenInventory,
  onBack,
}) => {
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [selectedTargetEditionId, setSelectedTargetEditionId] = useState<string>("rev-2024-2");

  // Compute attempts for each exam using canonical matcher
  const safeEditions = Array.isArray(editionsInventory) ? editionsInventory : REVALIDA_EDITIONS_INVENTORY;
  const safeQuestions = Array.isArray(allQuestions) ? allQuestions : [];
  const safeAttempts = Array.isArray(attempts) ? attempts : [];

  const examStats = React.useMemo(() => {
    const map: Record<
      string,
      { totalQuestions: number; loadedCount: number; answeredCount: number; correctCount: number; questions: Question[] }
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#0c1220] via-[#0f172a] to-[#0a0f1d] border border-blue-500/20 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider border border-blue-500/30">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Revalida Real (2020–2026/1 & ENAMED 2025)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Provas Oficiais na Íntegra (INEP)
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
            Resolva as edições históricas completas com cartão-resposta, cronômetro de 4 horas e gabarito oficial validado.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition-all cursor-pointer"
            >
              Voltar
            </button>
          )}
        </div>
      </div>

      {/* Grid of Exam Editions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {editionsInventory.map((ed) => {
          const stats = examStats[ed.id] || { totalQuestions: 100, loadedCount: 0, answeredCount: 0, correctCount: 0, questions: [] };
          const progressPercent = stats.loadedCount > 0 ? Math.round((stats.answeredCount / stats.loadedCount) * 100) : 0;
          const scorePercent =
            stats.answeredCount > 0
              ? Math.round((stats.correctCount / stats.answeredCount) * 100)
              : 0;

          const isCompleted = stats.answeredCount >= stats.loadedCount && stats.loadedCount > 0;
          const isStarted = stats.answeredCount > 0 && !isCompleted;

          return (
            <div
              key={ed.id}
              className="p-5 sm:p-6 rounded-3xl bg-[#0f1424] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-xl"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold font-mono px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {ed.year}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30">
                      {stats.loadedCount} questões ativas
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {ed.stage}
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white tracking-tight">{ed.editionLabel}</h3>
                <p className="text-xs text-slate-300">
                  {ed.officialNotice} · {ed.objectiveCount} questões objetivas
                </p>

                {/* Booklet tag */}
                {ed.booklets && ed.booklets.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-slate-400" />
                      Caderno:
                    </span>
                    <span className="text-[11px] text-slate-200 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                      {ed.booklets[0]?.color} ({ed.booklets[0]?.code})
                    </span>
                  </div>
                )}

                {/* Progress bar if started */}
                {stats.answeredCount > 0 && (
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">
                        {stats.answeredCount}/{stats.loadedCount} resolvidas
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {scorePercent}% acerto
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full"
                        style={{ width: `${Math.min(100, progressPercent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom CTA Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  ~4h estimadas
                </span>

                <div className="flex items-center gap-2">
                  {onPrintExam && (
                    <button
                      type="button"
                      disabled={stats.loadedCount === 0}
                      onClick={() => onPrintExam(ed.editionLabel, ed.year, ed.id)}
                      title={stats.loadedCount === 0 ? "Nenhuma questão cadastrada para esta edição" : "Gerar Caderno de Prova Padrão INEP em PDF para Impressão"}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-blue-400" />
                      <span>Imprimir PDF (INEP)</span>
                    </button>
                  )}

                  <button
                    disabled={stats.loadedCount === 0}
                    onClick={() => onStartExam(ed.editionLabel, ed.year, ed.id)}
                    title={stats.loadedCount === 0 ? "Nenhuma questão disponível nesta edição" : undefined}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
                  >
                    <span>{stats.loadedCount === 0 ? "Sem Questões" : isStarted ? "Continuar Prova" : isCompleted ? "Refazer Prova" : "Iniciar Prova"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Booklet Ingestion Modal */}
      <BookletIngestionModal
        isOpen={ingestModalOpen}
        onClose={() => setIngestModalOpen(false)}
        preselectedEditionId={selectedTargetEditionId}
      />
    </div>
  );
};

