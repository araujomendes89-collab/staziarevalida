import React from "react";
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  RotateCcw,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Brain,
  Layers,
  FileCheck,
  ChevronRight,
} from "lucide-react";
import {
  ActiveTrainingSession,
  SessionSummaryReport,
  Question,
  MedicalArea,
  ErrorTaxonomy,
} from "../../types";
import { SessionBuilderService } from "../../services/sessionBuilderService";

interface SessionResultsViewProps {
  session: ActiveTrainingSession;
  allQuestions: Question[];
  onRetrySession: () => void;
  onStartErrorsSession: (errorQuestionIds: string[]) => void;
  onStartSisterSession: (errorQuestionIds: string[]) => void;
  onBackToHome: () => void;
  onReviewAnswers: () => void;
}

export const SessionResultsView: React.FC<SessionResultsViewProps> = ({
  session,
  allQuestions,
  onRetrySession,
  onStartErrorsSession,
  onStartSisterSession,
  onBackToHome,
  onReviewAnswers,
}) => {
  const summary: SessionSummaryReport = React.useMemo(() => {
    return SessionBuilderService.generateSummaryReport(session, allQuestions);
  }, [session, allQuestions]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs.toString().padStart(2, "0")}s`;
  };

  const getTaxonomyLabel = (tax: ErrorTaxonomy): string => {
    const map: Record<ErrorTaxonomy, string> = {
      DISTRACTOR_TRAP: "Distrator da Banca",
      KNOWLEDGE_GAP: "Lacuna Teórica",
      DIAGNOSIS_VS_CONDUCT: "Diagnóstico vs Conduta",
      READING_HASTE: "Desatenção / Leitura Rápida",
      PROTOCOL_CONFUSION: "Confusão de Protocolo SUS",
      ELIMINATED_RIGHT_ANSWER: "Trocou a Certa na Dúvida",
      TIME_PRESSURE: "Pressão de Tempo",
      OUTDATED_GUIDELINE: "Diretriz Antiga",
      GUESS: "Chute",
    };
    return map[tax] || tax;
  };

  const areaNames: Record<MedicalArea, string> = {
    CLINICA_MEDICA: "Clínica Médica",
    CIRURGIA_GERAL: "Cirurgia Geral",
    GINECOLOGIA_OBSTETRICIA: "Ginecologia & Obstetrícia",
    PEDIATRIA: "Pediatria",
    MEDICINA_FAMILIA_COMUNIDADE: "Medicina de Família & SUS",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
      {/* 1. HERO HEADER CARD */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black/40 border border-white/15 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sessão Concluída</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              {summary.scorePercentage >= 70 ? "Excelente Desempenho!" : "Treino Registrado no Algoritmo"}
            </h2>
            <p className="text-xs sm:text-sm text-white/70 max-w-xl">
              {summary.scorePercentage >= 70
                ? "Seu aproveitamento nesta sessão supera a nota de corte histórica do Revalida INEP (60–67%)."
                : "Cada erro diagnosticado calibra sua curva de retenção e elimina pontos cegos na matriz do exame."}
            </p>
          </div>

          {/* Big Score Gauge */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white/[0.04] border border-white/10 shrink-0 w-36 sm:w-44 text-center">
            <span className="text-3xl sm:text-4xl font-black text-white font-mono">
              {summary.scorePercentage}%
            </span>
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider mt-1">
              Aproveitamento
            </span>
            <span className="text-xs font-semibold text-emerald-400 mt-0.5">
              {summary.correctCount} de {summary.totalQuestions} acertos
            </span>
          </div>
        </div>
      </div>

      {/* 2. STATS OVERVIEW GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-1">
          <div className="flex items-center justify-center text-emerald-400 gap-1.5 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Acertos</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-white font-mono">
            {summary.correctCount}
          </span>
          <p className="text-[11px] text-white/40 font-medium">Competências fixadas</p>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-1">
          <div className="flex items-center justify-center text-red-400 gap-1.5 mb-1">
            <XCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Erros</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-white font-mono">
            {summary.wrongCount}
          </span>
          <p className="text-[11px] text-white/40 font-medium">Caderno de erros</p>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-1">
          <div className="flex items-center justify-center text-cyan-400 gap-1.5 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Tempo Total</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-white font-mono">
            {formatTimer(summary.totalTimeSeconds)}
          </span>
          <p className="text-[11px] text-white/40 font-medium">Duração da sessão</p>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-1">
          <div className="flex items-center justify-center text-amber-400 gap-1.5 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Média / Item</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-white font-mono">
            {summary.avgTimePerQuestion}s
          </span>
          <p className="text-[11px] text-white/40 font-medium">Ritmo de prova</p>
        </div>
      </div>

      {/* 3. CARD DE PRÓXIMA MELHOR AÇÃO (1 CLIQUE) */}
      {summary.recommendedNextAction && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-black/40 border border-purple-500/30 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Próxima Melhor Ação Recomendada
              </span>
              <h4 className="text-base sm:text-lg font-extrabold text-white">
                {summary.recommendedNextAction.title}
              </h4>
              <p className="text-xs sm:text-sm text-white/70 max-w-xl">
                {summary.recommendedNextAction.description}
              </p>
            </div>

            {summary.wrongCount > 0 && summary.recommendedNextAction.questionIds && (
              <button
                onClick={() =>
                  onStartErrorsSession(summary.recommendedNextAction.questionIds || [])
                }
                className="px-5 py-3 rounded-2xl bg-white text-black font-bold text-xs hover:scale-105 transition-all shadow-xl flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <span>Treinar Erros Agora</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. PERFORMANCE BREAKDOWN BY MEDICAL AREA */}
      <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          Aproveitamento por Grande Área Médica
        </h3>

        <div className="space-y-3">
          {(summary?.areaPerformance ? (Object.keys(summary.areaPerformance) as MedicalArea[]) : []).map((area) => {
            const data = summary?.areaPerformance?.[area];
            if (!data || data.total === 0) return null;

            return (
              <div key={area} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white/80">{areaNames[area] || area}</span>
                  <span className="font-mono text-white/90">
                    {data.correct}/{data.total} ({data.percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.percentage >= 70
                        ? "bg-emerald-500"
                        : data.percentage >= 50
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${data.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. TAXONOMY OF ERRORS (AUTÓPSIA COGNITIVA) */}
      {(summary?.wrongCount ?? 0) > 0 && (
        <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-400" />
            Autópsia dos Erros Desta Sessão
          </h3>
          <p className="text-xs text-white/60">
            Distribuição das razões declaradas para os itens que você errou:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(summary?.errorTaxonomyBreakdown ? (Object.keys(summary.errorTaxonomyBreakdown) as ErrorTaxonomy[]) : []).map((tax) => {
              const count = summary?.errorTaxonomyBreakdown?.[tax];
              if (!count || count === 0) return null;

              return (
                <div
                  key={tax}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between"
                >
                  <span className="text-xs text-white/70 font-medium">{getTaxonomyLabel(tax)}</span>
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. BOTTOM ACTION BUTTONS */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
        <button
          onClick={onBackToHome}
          className="px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-bold transition-all"
        >
          Voltar ao Banco de Questões
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onReviewAnswers}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white border border-white/10 text-xs font-bold transition-all"
          >
            <FileCheck className="w-4 h-4 text-cyan-400" />
            <span>Revisar Gabarito Completo</span>
          </button>

          <button
            onClick={onRetrySession}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:scale-105 transition-transform shadow-lg"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Refazer Este Treino</span>
          </button>
        </div>
      </div>
    </div>
  );
};
