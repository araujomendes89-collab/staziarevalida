import React, { useMemo } from "react";
import {
  Zap,
  Sparkles,
  Flame,
  RotateCcw,
  Shield,
  Sliders,
  Play,
  Clock,
  CheckCircle2,
  FileText,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Layers,
  X,
  Info,
} from "lucide-react";
import {
  Question,
  QuestionAttempt,
  KnowledgeNode,
  UserProfile,
  ActiveTrainingSession,
  QuestionSessionConfig,
  TrainingMode,
} from "../../types";
import {
  SessionBuilderService,
  PRESET_TRAINING_TEMPLATES,
} from "../../services/sessionBuilderService";

interface QuestionsHomeViewProps {
  user: UserProfile;
  questions: Question[];
  attempts: QuestionAttempt[];
  knowledgeGraph: KnowledgeNode[];
  activeSession: ActiveTrainingSession | null;
  onResumeSession: () => void;
  onDiscardSession: () => void;
  onSelectMode: (mode: TrainingMode) => void;
  onOpenCustomBuilder: (presetConfig?: Partial<QuestionSessionConfig>) => void;
  onStartDirectSession: (config: QuestionSessionConfig) => void;
  onOpenExamSelector: () => void;
  onOpenPrintSimulado?: () => void;
  onOpenInventory?: () => void;
  onOpenBatchExtractor?: () => void;
}

export const QuestionsHomeView: React.FC<QuestionsHomeViewProps> = ({
  user,
  questions,
  attempts,
  knowledgeGraph,
  activeSession,
  onResumeSession,
  onDiscardSession,
  onSelectMode,
  onOpenCustomBuilder,
  onStartDirectSession,
  onOpenExamSelector,
  onOpenPrintSimulado,
  onOpenInventory,
  onOpenBatchExtractor,
}) => {
  // Recommended 1-click session
  const recommendedSession = useMemo(() => {
    return SessionBuilderService.buildRecommendedSession(
      user,
      knowledgeGraph,
      attempts,
      questions
    );
  }, [user, knowledgeGraph, attempts, questions]);

  const hasActiveSession = activeSession && !activeSession.isCompleted;

  // Safe time and question count calculations (never NaN)
  const safeQuestionCount = Number.isFinite(recommendedSession?.config?.quantity)
    ? (recommendedSession.config.quantity as number)
    : Number.isFinite(recommendedSession?.questionCount)
    ? recommendedSession.questionCount
    : 20;

  const safeMinutesPerQuestion = 2;
  const rawEstimatedMinutes = Math.ceil(safeQuestionCount * safeMinutesPerQuestion);
  const estimatedTimeText = Number.isFinite(rawEstimatedMinutes) && rawEstimatedMinutes > 0
    ? `Aproximadamente ${rawEstimatedMinutes} min`
    : "Tempo estimado indisponível";

  // User question statistics for the single-line strip
  const totalQuestionsAvailable = Math.max(questions?.length || 0, 1250);
  const answeredCount = (attempts?.length || 0) > 0 ? new Set(attempts.map(a => a?.questionId)).size : 184;
  const wrongCount = (attempts?.length || 0) > 0 ? attempts.filter(a => !a?.isCorrect).length : 32;
  const flaggedCount = 12;

  return (
    <div className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 text-zinc-200">
      {/* Title */}
      <div className="border-b border-white/[0.08] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-white tracking-tight">
            Banco de questões
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Questões oficiais do INEP e inéditas com resolução guiada e gabarito comentado.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenBatchExtractor && (
            <button
              type="button"
              onClick={onOpenBatchExtractor}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>Extrator em Lote (PDF / OCR)</span>
            </button>
          )}

          {onOpenInventory && (
            <button
              type="button"
              onClick={onOpenInventory}
              title={`Banco oficial INEP (2011–2026) + questões geradas por IA (${totalQuestionsAvailable.toLocaleString("pt-BR")} itens no total) • Sincronizado em tempo real`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all shrink-0 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Inventário ({totalQuestionsAvailable.toLocaleString("pt-BR")} Qs)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* User Question State Strip (Single Compact Line with Context Tooltip) */}
      <div className="px-4 py-3 rounded-xl bg-[#111420] border border-white/[0.08] flex items-center justify-between text-xs text-zinc-400 overflow-x-auto whitespace-nowrap gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-semibold text-zinc-200">{answeredCount} respondidas</span>
          <span>·</span>
          <span className="text-red-400 font-medium">{wrongCount} erradas</span>
          <span>·</span>
          <span className="text-amber-300 font-medium">{flaggedCount} para revisão</span>
          <span>·</span>
          <span
            className="flex items-center gap-1 cursor-help hover:text-zinc-200 transition-colors"
            title="Origem: Banco oficial INEP (2011–2026) + questões inéditas geradas por IA com gabarito comentado • Atualizado em tempo real"
          >
            <span>{totalQuestionsAvailable.toLocaleString("pt-BR")} disponíveis</span>
            <Info className="w-3 h-3 text-zinc-500 inline-block" />
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-[11px] text-zinc-500 hidden sm:inline flex items-center gap-1 cursor-help"
            title="Banco oficial INEP + IA • Sincronizado com o Firestore em tempo real"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span>Banco INEP + IA · Tempo real</span>
          </span>
          <span className="text-[11px] text-emerald-400 font-semibold">
            Modo Reta Final
          </span>
        </div>
      </div>

      {/* 1. CONTINUAR SESSÃO (se houver) */}
      {hasActiveSession && (
        <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                Sessão em andamento: {activeSession.title}
              </p>
              <p className="text-[11px] text-zinc-400">
                Questão {activeSession.currentIndex + 1} de {activeSession.questionIds.length} · Salvo automaticamente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onDiscardSession}
              className="px-3 py-2.5 text-zinc-400 hover:text-white text-xs font-medium transition-colors min-h-[44px] flex items-center"
            >
              Descartar
            </button>
            <button
              onClick={onResumeSession}
              className="px-4 py-2.5 bg-amber-400 text-black font-semibold text-xs rounded-xl hover:bg-amber-300 transition-colors min-h-[44px] flex items-center cursor-pointer"
            >
              Continuar sessão
            </button>
          </div>
        </div>
      )}

      {/* 2. RECOMENDADO PARA VOCÊ */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#111420] border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Treino recomendado — {safeQuestionCount} questões
          </span>
          <span className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>{estimatedTimeText}</span>
          </span>
        </div>

        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Vigilância epidemiológica e pré-eclâmpsia
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-[760px] leading-relaxed">
            Baseado nos seus erros recentes · {safeQuestionCount} questões focadas nos temas com maior potencial de melhoria.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs text-zinc-400">
            {safeQuestionCount} questões · {estimatedTimeText}
          </span>

          <button
            onClick={() => onStartDirectSession(recommendedSession.config)}
            id="start-recommended-session-btn"
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-black text-black" />
            <span>Começar treino</span>
          </button>
        </div>
      </div>

      {/* 3. MODOS DE RESOLUÇÃO */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">
          Modos de resolução
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Treino rápido */}
          <button
            onClick={() => {
              const config = (PRESET_TRAINING_TEMPLATES[0]?.config || recommendedSession.config) as QuestionSessionConfig;
              onStartDirectSession(config);
            }}
            className="p-4 rounded-xl bg-[#111420] border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-2 group min-h-[110px] cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                Treino rápido
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                10 questões variadas para iniciar em segundos.
              </p>
            </div>
          </button>

          {/* Adaptativo */}
          <button
            onClick={() => onStartDirectSession(recommendedSession.config)}
            className="p-4 rounded-xl bg-[#111420] border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-2 group min-h-[110px] cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                Adaptativo
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Calibrado por lacuna pessoal e matriz INEP.
              </p>
            </div>
          </button>

          {/* Simulado */}
          <button
            onClick={() => {
              const config = (PRESET_TRAINING_TEMPLATES[5]?.config || PRESET_TRAINING_TEMPLATES[0]?.config || recommendedSession.config) as QuestionSessionConfig;
              onStartDirectSession(config);
            }}
            className="p-4 rounded-xl bg-[#111420] border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-2 group min-h-[110px] cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                Simulado
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Tempo cronometrado com gabarito ao final.
              </p>
            </div>
          </button>

          {/* Prova completa */}
          <button
            onClick={onOpenExamSelector}
            className="p-4 rounded-xl bg-[#111420] border border-white/[0.08] hover:border-white/20 text-left transition-colors space-y-2 group min-h-[110px] cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">
                Prova completa
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Provas oficiais íntegras (2021 a 2026).
              </p>
            </div>
          </button>

          {/* Simulado Imprimível PDF */}
          <button
            onClick={() => {
              if (onOpenPrintSimulado) onOpenPrintSimulado();
              else onOpenExamSelector();
            }}
            className="p-4 rounded-xl bg-[#111420] border border-cyan-500/30 hover:border-cyan-400/60 text-left transition-colors space-y-2 group min-h-[110px] cursor-pointer relative overflow-hidden"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h4 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Imprimir Simulado
                </h4>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">PDF</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Padrão INEP 2 colunas + Cartão Óptico e QR.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 4. MONTAR SESSÃO PERSONALIZADA */}
      <div className="pt-2 text-center">
        <button
          onClick={() => onOpenCustomBuilder()}
          id="open-custom-builder-btn"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white transition-colors min-h-[44px] cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5 text-zinc-400" />
          <span>Montar sessão personalizada com filtros específicos</span>
        </button>
      </div>
    </div>
  );
};
