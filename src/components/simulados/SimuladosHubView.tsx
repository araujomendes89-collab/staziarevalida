import React, { useState, useMemo } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  Play,
  Award,
  AlertCircle,
  BarChart2,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Timer,
  Filter,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";
import { SessionBuilderService } from "../../services/sessionBuilderService";
import { QuestionSessionConfig, ActiveTrainingSession } from "../../types";

export interface SimuladoCardData {
  id: string;
  title: string;
  category: "OFICIAL_INEP" | "INEDITO_AUTORAL" | "TEMATICO" | "TIRO_RAPIDO";
  questionsCount: number;
  timeLimitMinutes: number;
  difficulty: "MÉDIA" | "ALTA" | "PADRÃO_INEP";
  description: string;
  areaDistribution: Record<string, number>;
  status: "DISPONIVEL" | "EM_ANDAMENTO" | "CONCLUIDO";
  score?: number; // 0-100
  totalCorrect?: number;
  completedAt?: string;
  currentQuestionIndex?: number;
  timeSpentSeconds?: number;
}

const DEFAULT_SIMULADOS: SimuladoCardData[] = [
  {
    id: "sim-inep-2026-1",
    title: "Simulado Geral Revalida INEP 2026.1 (1ª Etapa Teórica)",
    category: "OFICIAL_INEP",
    questionsCount: 100,
    timeLimitMinutes: 300,
    difficulty: "PADRÃO_INEP",
    description: "Simulação integral da prova objetiva com 100 questões distribuídas igualmente pelas 5 grandes áreas da Medicina, tempo oficial de 5 horas e nota de corte calculada.",
    areaDistribution: {
      CLINICA_MEDICA: 20,
      CIRURGIA_GERAL: 20,
      GINECOLOGIA_OBSTETRICIA: 20,
      PEDIATRIA: 20,
      MEDICINA_FAMILIA_COMUNIDADE: 20,
    },
    status: "DISPONIVEL",
  },
  {
    id: "sim-inedito-2026",
    title: "Simulado Inédito Praxis 2026 (PCDTs SUS Atualizados)",
    category: "INEDITO_AUTORAL",
    questionsCount: 50,
    timeLimitMinutes: 150,
    difficulty: "ALTA",
    description: "50 questões 100% inéditas com foco nas novas diretrizes do Ministério da Saúde 2025/2026, novas diretrizes de Pré-Eclâmpsia e rastreamento de Câncer de Colo.",
    areaDistribution: {
      CLINICA_MEDICA: 10,
      CIRURGIA_GERAL: 10,
      GINECOLOGIA_OBSTETRICIA: 10,
      PEDIATRIA: 10,
      MEDICINA_FAMILIA_COMUNIDADE: 10,
    },
    status: "EM_ANDAMENTO",
    currentQuestionIndex: 18,
    timeSpentSeconds: 2450,
  },
  {
    id: "sim-clinica-rapido",
    title: "Simulado Temático de Urgências em Clínica Médica",
    category: "TEMATICO",
    questionsCount: 30,
    timeLimitMinutes: 60,
    difficulty: "MÉDIA",
    description: "Foco intensivo em Síndromes Coronarianas, Sepse, AVC isquêmico/hemorrágico, Cetoacidose Diabética e Insuficiência Respiratória Aguda.",
    areaDistribution: {
      CLINICA_MEDICA: 30,
    },
    status: "CONCLUIDO",
    score: 83,
    totalCorrect: 25,
    completedAt: "01/09/2026 às 16:45",
  },
  {
    id: "sim-cirurgia-trauma",
    title: "Simulado Cirurgia Geral & Trauma ATLS 10ª Edição",
    category: "TEMATICO",
    questionsCount: 25,
    timeLimitMinutes: 50,
    difficulty: "PADRÃO_INEP",
    description: "Avaliação do doente politraumatizado, abdome agudo inflamatório e obstrutivo, hérnias da parede abdominal e choque hipovolêmico.",
    areaDistribution: {
      CIRURGIA_GERAL: 25,
    },
    status: "CONCLUIDO",
    score: 76,
    totalCorrect: 19,
    completedAt: "28/08/2026 às 20:10",
  },
  {
    id: "sim-tiro-rapido-1",
    title: "Mini-Simulado de Tiro Rápido (Multidisciplinar)",
    category: "TIRO_RAPIDO",
    questionsCount: 20,
    timeLimitMinutes: 40,
    difficulty: "PADRÃO_INEP",
    description: "20 questões express com 2 minutos por questão para calibração de velocidade de raciocínio clínico e gerenciamento de estresse.",
    areaDistribution: {
      CLINICA_MEDICA: 4,
      CIRURGIA_GERAL: 4,
      GINECOLOGIA_OBSTETRICIA: 4,
      PEDIATRIA: 4,
      MEDICINA_FAMILIA_COMUNIDADE: 4,
    },
    status: "DISPONIVEL",
  },
];

export const SimuladosHubView: React.FC = () => {
  const { setActiveTab, setQuestionMode, questions, attempts, knowledgeGraph } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<"DISPONIVEIS" | "EM_ANDAMENTO" | "CONCLUIDOS">("DISPONIVEIS");
  const [simuladosList, setSimuladosList] = useState<SimuladoCardData[]>(DEFAULT_SIMULADOS);

  // Group by tab
  const disponiveis = useMemo(() => simuladosList.filter((s) => s.status === "DISPONIVEL"), [simuladosList]);
  const emAndamento = useMemo(() => simuladosList.filter((s) => s.status === "EM_ANDAMENTO"), [simuladosList]);
  const concluidos = useMemo(() => simuladosList.filter((s) => s.status === "CONCLUIDO"), [simuladosList]);

  const handleStartSimulado = (simulado: SimuladoCardData) => {
    // Config session
    const config: QuestionSessionConfig = {
      title: simulado.title,
      mode: "SIMULADO",
      objective: simulado.category === "INEDITO_AUTORAL" ? "INEDITAS" : "OFICIAIS",
      areas: ["ALL"],
      topics: [],
      competencies: [],
      years: ["ALL"],
      origin: simulado.category === "INEDITO_AUTORAL" ? "INEDITAS" : "INEP_OFICIAL",
      difficulty: "ALL",
      inepRelevance: "ALL",
      smartFilters: {
        onlyUnanswered: false,
        onlyWrong: false,
        onlyCorrect: false,
        onlyFlagged: false,
        onlyReincidentErrors: false,
        onlyWithUpdatedGuideline: false,
        onlyHighInepPattern: false,
        excludeMastered: false,
      },
      quantity: simulado.questionsCount,
      feedbackMode: "END_OF_SESSION",
      timerMode: "EXAM_STRICT",
      showComments: false,
      ordering: "ORIGINAL_ORDER",
    };
    
    const matchedQuestions = SessionBuilderService.buildQuestionSession(config, questions, attempts, knowledgeGraph);
    const selectedQuestions = matchedQuestions.slice(0, simulado.questionsCount);
    
    const newSession = {
      id: `simulado-${Date.now()}`,
      title: simulado.title,
      subtitle: `${selectedQuestions.length} questões • Simulado Oficial`,
      mode: config.mode,
      config,
      questionIds: selectedQuestions.map((q) => q.id),
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
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Main Banner */}
      <div className="bg-gradient-to-br from-[#0b1424] via-[#0d1a30] to-[#091120] border border-blue-500/20 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
              <FileText className="w-3.5 h-3.5" />
              <span>Ambiente Oficial de Simulação Revalida INEP</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Central de Simulados
            </h1>
            <p className="text-zinc-300 text-sm max-w-2xl leading-relaxed">
              Treine em condições reais de prova com cronômetro regressivo, 100 questões ponderadas pelas 5 grandes áreas, cálculo de nota de corte e análise de tempo por questão.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 shrink-0">
            <div className="text-center px-2">
              <div className="text-xl font-bold text-blue-400">{disponiveis.length}</div>
              <div className="text-[10px] text-zinc-400">Disponíveis</div>
            </div>
            <div className="text-center border-x border-zinc-800 px-2">
              <div className="text-xl font-bold text-amber-400">{emAndamento.length}</div>
              <div className="text-[10px] text-zinc-400">Em Curso</div>
            </div>
            <div className="text-center px-2">
              <div className="text-xl font-bold text-emerald-400">{concluidos.length}</div>
              <div className="text-[10px] text-zinc-400">Concluídos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-zinc-800 flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: "DISPONIVEIS" as const, label: "Disponíveis", count: disponiveis.length, icon: FileText },
          { id: "EM_ANDAMENTO" as const, label: "Em Andamento", count: emAndamento.length, icon: Timer },
          { id: "CONCLUIDOS" as const, label: "Concluídos", count: concluidos.length, icon: CheckCircle2 },
        ].map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-5 py-3 rounded-t-xl text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                isActive
                  ? "text-white border-blue-500 bg-white/[0.04]"
                  : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-white/[0.02]"
              }`}
            >
              <TabIcon className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-zinc-400"}`} />
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive ? "bg-blue-500/20 text-blue-300" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: DISPONÍVEIS */}
      {activeSubTab === "DISPONIVEIS" && (
        <div className="space-y-4">
          {disponiveis.map((simulado) => (
            <div
              key={simulado.id}
              className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 hover:border-blue-500/40 transition-all shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-6"
            >
              <div className="space-y-3 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    {simulado.category === "OFICIAL_INEP" ? "Simulado Oficial INEP" : simulado.category === "TIRO_RAPIDO" ? "Tiro Rápido" : "Simulado Autoral"}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Dificuldade: {simulado.difficulty}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    {simulado.timeLimitMinutes} min ({Math.round(simulado.timeLimitMinutes / 60)}h)
                  </span>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">{simulado.title}</h3>
                  <p className="text-xs text-zinc-300 leading-relaxed mt-1">{simulado.description}</p>
                </div>

                {/* Area Breakdown Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  {Object.entries(simulado.areaDistribution).map(([areaKey, count]) => (
                    <span key={areaKey} className="px-2 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300">
                      <strong>{count}q</strong> {formatMedicalArea(areaKey)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartSimulado(simulado)}
                  className="px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-105"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Iniciar Simulado</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: EM ANDAMENTO */}
      {activeSubTab === "EM_ANDAMENTO" && (
        <div className="space-y-4">
          {emAndamento.length === 0 ? (
            <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-zinc-600 mx-auto" />
              <h3 className="text-white font-bold text-sm">Nenhum simulado em andamento</h3>
              <p className="text-xs text-zinc-400">Escolha um simulado na aba "Disponíveis" para iniciar.</p>
            </div>
          ) : (
            emAndamento.map((simulado) => (
              <div
                key={simulado.id}
                className="p-6 rounded-3xl bg-[#0c1424] border border-amber-500/30 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 animate-pulse">
                      Em Andamento
                    </span>
                    <span className="text-xs text-zinc-400">
                      Questão {simulado.currentQuestionIndex || 1} de {simulado.questionsCount}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white">{simulado.title}</h3>
                  <p className="text-xs text-zinc-300">{simulado.description}</p>

                  <div className="w-full max-w-md space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Progresso do Caderno</span>
                      <span className="text-amber-300 font-bold">
                        {Math.round(((simulado.currentQuestionIndex || 1) / simulado.questionsCount) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.round(((simulado.currentQuestionIndex || 1) / simulado.questionsCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartSimulado(simulado)}
                    className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-105"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Continuar Simulado</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: CONCLUÍDOS */}
      {activeSubTab === "CONCLUIDOS" && (
        <div className="space-y-4">
          {concluidos.map((simulado) => {
            const isApproved = (simulado.score || 0) >= 60;
            return (
              <div
                key={simulado.id}
                className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                        isApproved
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {isApproved ? "APROVADO (≥60%)" : "ABAIXO DO CORTE (<60%)"}
                    </span>
                    <span className="text-xs text-zinc-400">Concluído em: {simulado.completedAt}</span>
                  </div>

                  <h3 className="text-base font-bold text-white">{simulado.title}</h3>
                  <p className="text-xs text-zinc-300">
                    Acertos: <strong>{simulado.totalCorrect}/{simulado.questionsCount} questões</strong> ({simulado.score}%)
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-2xl font-black ${isApproved ? "text-emerald-400" : "text-rose-400"}`}>
                      {simulado.score}%
                    </div>
                    <div className="text-[10px] text-zinc-400">Desempenho Geral</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("revisar-erros");
                    }}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Ver Gabarito & Erros
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
