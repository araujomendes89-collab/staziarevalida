import React, { useMemo } from "react";
import {
  TrendingUp,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Sparkles,
  Layers,
  HelpCircle,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";
import { MedicalArea } from "../../types";

const MEDICAL_AREAS: MedicalArea[] = [
  "CLINICA_MEDICA",
  "CIRURGIA_GERAL",
  "GINECOLOGIA_OBSTETRICIA",
  "PEDIATRIA",
  "MEDICINA_FAMILIA_COMUNIDADE",
];

export const UnifiedProgressView: React.FC = () => {
  const { user, attempts, questions, readinessData, setActiveTab, setIsWhatIfOpen } = useApp();

  const totalAttempts = attempts?.length ?? user?.totalQuestionsSolved ?? 0;
  const correctAttempts = attempts?.filter((a) => a.isCorrect).length ?? 0;
  const overallAccuracy =
    totalAttempts > 0
      ? Math.round((correctAttempts / totalAttempts) * 100)
      : Math.round(readinessData?.score ?? 0);

  // Dynamic Area Breakdown from real attempts
  const areaBreakdown = useMemo(() => {
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return MEDICAL_AREAS.map((area) => {
      const areaAttempts = attempts.filter((att) => {
        const q = questionMap.get(att.questionId);
        return q?.area === area;
      });

      const total = areaAttempts.length;
      const correct = areaAttempts.filter((a) => a.isCorrect).length;
      const accuracy =
        total > 0
          ? Math.round((correct / total) * 100)
          : Math.round(readinessData?.areaBreakdown?.[area] || 0);

      return {
        area,
        accuracy,
        total,
      };
    });
  }, [attempts, questions, readinessData]);

  // Find lowest accuracy area for recommended action
  const weakestArea = useMemo(() => {
    if (areaBreakdown.length === 0) return null;
    return [...areaBreakdown].sort((a, b) => a.accuracy - b.accuracy)[0];
  }, [areaBreakdown]);

  const recentTrend = readinessData?.trend ?? 0;

  return (
    <div className="space-y-6 pb-12">
      {/* COMPACT CLEAN HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs shadow-cyan-400/50" />
              <span>Visão Geral do Desempenho</span>
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
              Dados Reais
            </span>
          </div>
            <p className="text-xs text-slate-500 mt-1">
            Seu desempenho consolidado com base nas questões resolvidas no banco de treino.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsWhatIfOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Simular Prova</span>
          </button>
        </div>
      </div>

      {/* 1. STATUS PRINCIPAL & 3 INDICADORES ESSENCIAIS */}
      {totalAttempts === 0 ? (
        /* Empty State */
        <div className="p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-base font-bold text-white">Ainda não há dados suficientes</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Resolva questões para que o sistema calcule sua acurácia real, evolução temporal e diagnóstico por área.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("praticar-questoes")}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer inline-flex items-center gap-2 shadow-md"
          >
            <span>Começar a Praticar Questões</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Active Data Metrics Grid */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Taxa de Acertos */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-1">
            <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              Taxa Geral de Acertos
            </span>
            <div className="text-3xl font-black text-white flex items-baseline gap-1.5">
              <span>{overallAccuracy}%</span>
              <span className="text-xs text-zinc-500 font-normal">acertos</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Calculado sobre {totalAttempts} questões respondidas.
            </p>
          </div>

          {/* Questões Respondidas */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-1">
            <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              Questões Registradas
            </span>
            <div className="text-3xl font-black text-cyan-400">
              {totalAttempts}
            </div>
            <p className="text-[11px] text-zinc-400">
              {correctAttempts} acertos e {totalAttempts - correctAttempts} erros analisados.
            </p>
          </div>

          {/* Evolução Recente */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-1">
            <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              Evolução Recente (14d)
            </span>
            <div className="text-3xl font-black text-emerald-400 flex items-baseline gap-1">
              <span>+{recentTrend}%</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Variação de acurácia nos últimos 14 dias.
            </p>
          </div>
        </div>
      )}

      {/* 2. RESUMO DAS 5 GRANDES ÁREAS */}
      <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Desempenho por Grande Área</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Acurácia consolidada nas 5 disciplinas oficiais do Revalida.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("desempenho-areas")}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer self-start sm:self-center"
          >
            <span>Ver detalhes por área</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 5 Area Progress Rows */}
        <div className="space-y-3 pt-1">
          {areaBreakdown.map((item) => (
            <div
              key={item.area}
              className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center justify-between sm:w-1/3">
                <span className="font-bold text-white">{formatMedicalArea(item.area)}</span>
                <span
                  className={`font-mono font-bold sm:hidden ${
                    item.accuracy >= 70 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {item.accuracy}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 flex items-center gap-3">
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.accuracy >= 70 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${item.accuracy}%` }}
                  />
                </div>
                <span
                  className={`hidden sm:inline font-mono font-bold text-xs min-w-[36px] text-right ${
                    item.accuracy >= 70 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {item.accuracy}%
                </span>
              </div>

              <div className="text-[11px] text-zinc-400 sm:w-28 text-right shrink-0">
                {item.total > 0 ? `${item.total}q respondidas` : "Sem dados"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. PRÓXIMO PASSO RECOMENDADO */}
      {weakestArea && totalAttempts > 0 && (
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Próximo Passo Recomendado</span>
            </span>
            <h3 className="text-sm font-bold text-white">
              Sua área com menor rendimento atual é {formatMedicalArea(weakestArea.area)} ({weakestArea.accuracy}%).
            </h3>
            <p className="text-xs text-zinc-400">
              Reforçar questões dessa área traz o maior ganho marginal imediato para sua aprovação.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("desempenho-areas")}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <span>Ver Pontos para Melhorar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
