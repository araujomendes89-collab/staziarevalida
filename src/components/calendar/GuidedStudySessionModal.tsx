import React, { useState, useEffect } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  Brain,
  FileQuestion,
  Layers,
  Sparkles,
  HelpCircle,
  Eye,
  AlertTriangle,
  Award,
  ChevronRight,
  Volume2,
} from "lucide-react";
import { CalendarBlock, NextBestActionRecommendation } from "../../types/adaptiveCalendar";
import { useApp } from "../../context/AppContext";

interface GuidedStudySessionModalProps {
  sessionRecommendation?: NextBestActionRecommendation;
  customBlocks?: CalendarBlock[];
  onClose: () => void;
  onFinishSession: () => void;
}

export const GuidedStudySessionModal: React.FC<GuidedStudySessionModalProps> = ({
  sessionRecommendation,
  customBlocks,
  onClose,
  onFinishSession,
}) => {
  const { setActiveTab } = useApp();
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const [activeRecallRevealed, setActiveRecallRevealed] = useState<boolean>(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [selectedErrorType, setSelectedErrorType] = useState<string>("");
  const [userReflectiveNotes, setUserReflectiveNotes] = useState<string>("");

  const steps = sessionRecommendation?.steps || (customBlocks ? customBlocks.map((b, i) => ({
    stepNumber: i + 1,
    name: b.title,
    durationMinutes: b.durationMinutes,
    type: b.type,
    actionTarget: b.type.includes("QUESTOES") ? "QUESTIONS" : b.type.includes("FLASHCARDS") ? "FLASHCARDS" : "GRANDES_TEMAS" as const,
  })) : [
    { stepNumber: 1, name: "Recuperação Ativa & Flashcards Críticos", durationMinutes: 15, type: "ACTIVE_RECALL", actionTarget: "FLASHCARDS" as const },
    { stepNumber: 2, name: "Estudo Direcionado (Critérios 2026)", durationMinutes: 25, type: "DIRECTED_STUDY", actionTarget: "GRANDES_TEMAS" as const },
    { stepNumber: 3, name: "Questões Oficiais INEP", durationMinutes: 45, type: "OFFICIAL_QUESTIONS", actionTarget: "QUESTIONS" as const },
    { stepNumber: 4, name: "Autópsia Profunda dos Erros", durationMinutes: 25, type: "ERROR_AUTOPSY", actionTarget: "ERROR_AUTOPSY" as const },
    { stepNumber: 5, name: "Consolidação & Reteste", durationMinutes: 10, type: "CONSOLIDATION" },
  ]);

  const currentStep = steps[currentStepIndex] || steps[0];

  useEffect(() => {
    if (currentStep) {
      setSecondsRemaining(currentStep.durationMinutes * 60);
      setIsTimerRunning(true);
      setActiveRecallRevealed(false);
    }
  }, [currentStepIndex]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, secondsRemaining]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleNextStep = () => {
    if (!completedSteps.includes(currentStepIndex)) {
      setCompletedSteps([...completedSteps, currentStepIndex]);
    }
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      onFinishSession();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="bg-[#090b11] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Bar */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 font-bold">
                  Sessão Guiada por IA • Etapa {currentStepIndex + 1} de {steps.length}
                </span>
                <span className="text-xs text-zinc-400 hidden sm:inline">
                  {sessionRecommendation?.title || "Estudo Adaptativo de Alta Retenção"}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
                {currentStep.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer Display */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-xl font-mono text-emerald-400 font-bold text-sm sm:text-base">
              <span>{formatTimer(secondsRemaining)}</span>
              <button
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="text-zinc-400 hover:text-white p-0.5"
                title={isTimerRunning ? "Pausar" : "Continuar"}
              >
                {isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Steps Progress Bar */}
        <div className="grid grid-cols-5 border-b border-white/[0.08] bg-zinc-950/40">
          {steps.map((s, idx) => {
            const isDone = completedSteps.includes(idx);
            const isCurrent = idx === currentStepIndex;
            return (
              <button
                key={idx}
                onClick={() => setCurrentStepIndex(idx)}
                className={`py-2 px-3 text-center border-b-2 transition-all text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  isCurrent
                    ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 font-bold"
                    : isDone
                    ? "border-emerald-500/50 text-zinc-300"
                    : "border-transparent text-zinc-400 hover:text-zinc-300"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <span className="font-mono text-[10px]">{idx + 1}.</span>
                )}
                <span className="truncate hidden sm:inline">{s.name.split(":")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Step Content */}
        <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Step 1: Active Recall */}
          {currentStepIndex === 0 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                  <Brain className="w-4 h-4" />
                  Pergunta de Resgate Ativo (Recuperação sem consulta)
                </div>
                <p className="text-base text-white font-medium leading-relaxed">
                  {sessionRecommendation?.activeRecallPrompt ||
                    "Antes de abrir o material: Quais são os 4 sinais de iminência de eclâmpsia e qual a conduta imediata para prevenção de convulsões segundo o PCDT?"}
                </p>
                <div className="pt-2">
                  {!activeRecallRevealed ? (
                    <button
                      onClick={() => setActiveRecallRevealed(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Revelar Resposta Modelo & Critérios</span>
                    </button>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-purple-500/40 text-xs text-purple-200 leading-relaxed space-y-2 animate-in fade-in">
                      <div className="font-bold text-emerald-400">Resposta Modelo INEP:</div>
                      <div>
                        1. Cefaleia occipital refratária • 2. Escotomas cintilantes / turvação visual • 3. Epigastralgia ou dor em hipocôndrio direito (distensão da cápsula de Glisson) • 4. Hiper-reflexia patelar.
                      </div>
                      <div className="text-zinc-300 font-semibold pt-1">
                        Conduta imediata: Sulfato de Magnésio (Esquema de Zuspan: 4g IV ataque em 20 min + 1g/h manutenção contínua).
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-xs text-zinc-300">
                  Resgate ativo prévio aumenta a retenção em <strong>+64%</strong> ao preparar o cérebro para receber a informação.
                </div>
                <button
                  onClick={() => {
                    setActiveTab("review");
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-white hover:bg-zinc-700 transition-colors border border-white/10 shrink-0"
                >
                  Abrir Flashcards FSRS
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Directed Study / Grandes Temas */}
          {currentStepIndex === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Estudo Direcionado • O Que o INEP Realmente Cobra
                  </span>
                  <span className="text-[10px] text-amber-300 px-2 py-0.5 rounded bg-amber-500/20">
                    25 minutos focados
                  </span>
                </div>
                <div className="space-y-2 text-xs text-zinc-200 leading-relaxed">
                  <p>
                    <strong>Foco Principal:</strong> Diferenciação entre Pré-eclâmpsia sem sinais de gravidade vs com sinais de gravidade, critérios de interrupção da gestação (34 vs 37 semanas) e manejo anti-hipertensivo (Hidralazina IV ou Nifedipino VO).
                  </p>
                  <p className="text-zinc-400">
                    Evite ler 50 páginas de fisiologia. Concentre-se nas 3 pegadinhas mais recorrentes nas provas de 2021 a 2026.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab("grandes-temas");
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Abrir Grande Tema Completo no Módulo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Questions */}
          {currentStepIndex === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <FileQuestion className="w-4 h-4" />
                    Bateria de Questões Oficiais & Irmãs
                  </span>
                  <span className="text-[10px] font-mono text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20">
                    16 questões selecionadas
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Resolva as questões sem pausar para simular a velocidade da prova oficial (meta: 2.2 minutos por questão). Ao final, o sistema abrirá a autópsia dos erros automaticamente.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => {
                      setActiveTab("questions");
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Iniciar Caderno de Questões Agora</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Error Autopsy */}
          {currentStepIndex === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-3">
                <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Autópsia e Classificação da Falha
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Identifique a causa raiz de cada erro para que o Calendário programe a intervenção correta (flashcard vs caso clínico vs teoria):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    { id: "LACUNA_CONCEITUAL", label: "Lacuna Conceitual", desc: "Não sabia o critério" },
                    { id: "MEMORIA", label: "Falha de Memória", desc: "Esqueci a dose/escala" },
                    { id: "INTERPRETACAO", label: "Interpretação / Leitura", desc: "Ignorou palavra-chave" },
                    { id: "DISTRAÇÃO", label: "Distração / Pegadinha", desc: "Caiu em distrator atraente" },
                    { id: "RACIOCINIO", label: "Raciocínio Clínico", desc: "Confundiu hipóteses" },
                    { id: "GESTAO_TEMPO", label: "Gestão de Tempo", desc: "Respondeu na pressa" },
                  ].map((err) => (
                    <button
                      key={err.id}
                      onClick={() => setSelectedErrorType(err.id)}
                      className={`p-2.5 rounded-xl text-left border text-xs transition-all ${
                        selectedErrorType === err.id
                          ? "bg-rose-500/20 border-rose-500 text-white font-bold"
                          : "bg-white/[0.02] border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="font-semibold">{err.label}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">{err.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Consolidation */}
          {currentStepIndex === 4 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-3">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Fechamento & Registro de Reteste Programado
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Sessão concluída com sucesso! Seu domínio no tema subiu de <strong>41% para 68%</strong>. O algoritmo programou automaticamente um reteste de verificação para daqui a <strong>3 dias</strong> (Fase FSRS).
                </p>
                <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-300">
                  <strong>Ganho Estimado:</strong> +4.2 pontos consolidados na sua nota projetada.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-zinc-950 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={() => {
              if (currentStepIndex > 0) setCurrentStepIndex(currentStepIndex - 1);
            }}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Voltar Etapa
          </button>

          <button
            onClick={handleNextStep}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <span>{currentStepIndex === steps.length - 1 ? "Concluir Sessão & Salvar" : "Concluir Etapa e Avançar"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
