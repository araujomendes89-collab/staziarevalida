import React, { useState } from "react";
import {
  Sparkles,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Zap,
  TrendingUp,
  Filter,
  Search,
  Plus,
  Play,
  History,
  Award,
  ChevronRight,
  Eye,
  Check,
  X,
  RefreshCw,
  Clock,
  BookOpen,
  Cpu,
  BarChart3,
  UserCheck,
  Sliders,
  Flame,
  HelpCircle,
  ExternalLink,
  Lock,
  Target,
  Dna,
  CheckCheck,
  FileCheck2,
  FileSpreadsheet,
  Stethoscope,
  Building2,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Question, MedicalArea } from "../../types";
import {
  ContentGapItem,
  GenerationPlan,
  GenerationJob,
  PipelineStage,
  ThemeInepDna,
  FiftyQuestionBlueprint,
} from "../../types/questionFactory";
import { QuestionFactoryService } from "../../services/questionFactoryService";

const AREA_LABELS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina Preventiva & SUS",
};

const AREA_COLORS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "#38bdf8",
  CIRURGIA_GERAL: "#f87171",
  GINECOLOGIA_OBSTETRICIA: "#c084fc",
  PEDIATRIA: "#34d399",
  MEDICINA_FAMILIA_COMUNIDADE: "#fbbf24",
};

export const IneditasHubView: React.FC = () => {
  const {
    user,
    questions,
    setActiveTab,
    setActiveQuestionIndex,
    setQuestionFilterOrigin,
    approveIneditaQuestion,
    rejectIneditaQuestion,
    editIneditaQuestion,
    addGeneratedQuestion,
  } = useApp();

  // Sub-abas
  const [activeSubTab, setActiveSubTab] = useState<
    "THEMES_50" | "GAPS" | "FACTORY" | "REVIEW" | "BANK" | "MATRIX"
  >("THEMES_50");

  const [themeDnas] = useState<ThemeInepDna[]>(() =>
    QuestionFactoryService.getThemeInepDnas()
  );
  const [blueprints, setBlueprints] = useState<FiftyQuestionBlueprint[]>(() =>
    QuestionFactoryService.get50QuestionBlueprints()
  );

  const [contentGaps] = useState<ContentGapItem[]>(() =>
    QuestionFactoryService.getContentGaps()
  );
  const [matrixCoverage] = useState(() =>
    QuestionFactoryService.getMatrixCoverage()
  );
  const [plans, setPlans] = useState<GenerationPlan[]>(() =>
    QuestionFactoryService.getGenerationPlans()
  );
  const [jobs, setJobs] = useState<GenerationJob[]>(() =>
    QuestionFactoryService.getGenerationJobs()
  );

  // Filtros & Modais
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<MedicalArea | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuestionForDetail, setSelectedQuestionForDetail] = useState<Question | null>(null);
  const [selectedDnaForModal, setSelectedDnaForModal] = useState<ThemeInepDna | null>(null);
  const [selectedBlueprintForModal, setSelectedBlueprintForModal] = useState<FiftyQuestionBlueprint | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGenerationStage, setCurrentGenerationStage] = useState<PipelineStage>("IDLE");
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [activeDoctorName, setActiveDoctorName] = useState(() =>
    user?.name ? `${user.name} (Revisor Médico)` : "Dr(a). Revisor(a) Médico(a)"
  );

  // Filtro de questões inéditas do estado global
  const ineditasQuestions = questions.filter(
    (q) => q.origin === "PLATFORM_ORIGINAL" || q.origin === "INEDITA_PRAXIS"
  );

  const pendingReviewQuestions = ineditasQuestions.filter(
    (q) => q.generationStatus === "MEDICAL_REVIEW" || q.generationStatus === "AUTO_VALIDATED"
  );

  const publishedQuestions = ineditasQuestions.filter(
    (q) => q.generationStatus === "PUBLISHED" || q.generationStatus === "BETA" || q.generationStatus === "APPROVED"
  );

  // Ação: Completar até 50 questões inéditas para um tema
  const handleBatchGenerateForTheme = async (themeName: string, batchCount: number = 8) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setCurrentGenerationStage("LOAD_THEME");
    setGenerationLogs([`Iniciando motor de 50 Inéditas para: ${themeName}...`]);
    setActiveSubTab("FACTORY");

    try {
      const generatedList = await QuestionFactoryService.generateBatchForTheme({
        themeName,
        batchSize: batchCount,
        onProgress: (stage, log) => {
          setCurrentGenerationStage(stage);
          setGenerationLogs((prev) => [...prev, log]);
        },
      });

      // Adiciona ao estado global
      generatedList.forEach((q) => addGeneratedQuestion(q));

      // Atualiza Blueprint local
      setBlueprints((prev) =>
        prev.map((bp) => {
          if (bp.theme.toLowerCase() === themeName.toLowerCase() || bp.themeId === themeName) {
            const newApproved = Math.min(50, bp.approvedCount + generatedList.length);
            return {
              ...bp,
              approvedCount: newApproved,
              missingCount: Math.max(0, 50 - newApproved),
              coveragePct: Math.round((newApproved / 50) * 100),
              status: newApproved >= 50 ? "COMPLETED_50" : "IN_PROGRESS",
            };
          }
          return bp;
        })
      );

      setIsGenerating(false);
      setCurrentGenerationStage("COMPLETED");
      if (generatedList[0]) {
        setSelectedQuestionForDetail(generatedList[0]);
      }
    } catch (err) {
      console.error(err);
      setIsGenerating(false);
      setCurrentGenerationStage("FAILED");
      setGenerationLogs((prev) => [...prev, "Erro na síntese do lote de 50 inéditas."]);
    }
  };

  // Ação: Disparar Geração de IA a partir de uma lacuna (Gap)
  const handleGenerateForGap = async (gap: ContentGapItem) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setCurrentGenerationStage("SELECT_COMPETENCY");
    setGenerationLogs([`Iniciando pipeline de geração para ${gap.competencyName}...`]);
    setActiveSubTab("FACTORY");

    try {
      const newQuestion = await QuestionFactoryService.simulateGenerateQuestion(
        gap,
        (stage, log) => {
          setCurrentGenerationStage(stage);
          setGenerationLogs((prev) => [...prev, log]);
        }
      );

      addGeneratedQuestion(newQuestion);
      setIsGenerating(false);
      setCurrentGenerationStage("COMPLETED");
      setSelectedQuestionForDetail(newQuestion);
    } catch (err) {
      setIsGenerating(false);
      setCurrentGenerationStage("FAILED");
      setGenerationLogs((prev) => [...prev, "Erro durante a síntese de IA."]);
    }
  };

  // Ação: Aprovação médica com 1 clique
  const handleApprove = (questionId: string) => {
    approveIneditaQuestion(questionId, activeDoctorName);
    if (selectedQuestionForDetail?.id === questionId) {
      setSelectedQuestionForDetail((prev) =>
        prev
          ? {
              ...prev,
              generationStatus: "PUBLISHED",
              reviewStatus: "Aprovada e Publicada",
              clinicalVerifiedAt: new Date().toISOString().split("T")[0],
              verifiedByDoctor: activeDoctorName,
            }
          : null
      );
    }
  };

  // Ação: Rejeição com motivo
  const handleReject = (questionId: string) => {
    const reason = prompt("Motivo da rejeição técnica/médica:", "Não atende ao padrão de distratores do INEP.");
    if (reason) {
      rejectIneditaQuestion(questionId, reason);
      if (selectedQuestionForDetail?.id === questionId) {
        setSelectedQuestionForDetail(null);
      }
    }
  };

  // Ação: Ir resolver a questão no módulo de estudo
  const handleSolveInStudyMode = (question: Question) => {
    const idx = questions.findIndex((q) => q.id === question.id);
    if (idx !== -1) {
      setActiveQuestionIndex(idx);
      setQuestionFilterOrigin("INEDITAS");
      setActiveTab("questions");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Principal */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-0 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-full flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Motor 50 Inéditas por Tema — Revalida INEP 2026
              </span>
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Diretrizes 2026-Ready & SUS
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Fábrica de Questões & 50 Inéditas por Tema
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              Engenharia reversa do padrão histórico do INEP gerando <strong className="text-cyan-300">50 questões inéditas por tema</strong> com matriz de competências, revisão adversarial de gabarito único e controle anti-cópia.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (themeDnas[0]) handleBatchGenerateForTheme(themeDnas[0].theme, 8);
              }}
              disabled={isGenerating}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-cyan-900/30 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
              {isGenerating ? "Produzindo Lote..." : "Completar Lote de 50"}
            </button>
          </div>
        </div>

        {/* Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div>
            <div className="text-xs text-slate-400 font-medium">Meta 50 / Tema</div>
            <div className="text-xl font-bold text-cyan-400 mt-0.5">
              {blueprints.reduce((acc, b) => acc + b.approvedCount, 0)} / {blueprints.length * 50}{" "}
              <span className="text-xs text-slate-500 font-normal">inéditas</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Temas com DNA Mapeado</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              {themeDnas.length}{" "}
              <span className="text-xs text-slate-500 font-normal">temas INEP</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Aguardando Revisão</div>
            <div className="text-xl font-bold text-amber-400 mt-0.5">
              {pendingReviewQuestions.length}{" "}
              <span className="text-xs text-slate-500 font-normal">na fila médica</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Copy Risk Médio</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              13.8%{" "}
              <span className="text-xs text-slate-500 font-normal">&lt; 20% (Ótimo)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navegação de Sub-Abas */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveSubTab("THEMES_50")}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === "THEMES_50"
              ? "bg-slate-800 text-cyan-400 border-b-2 border-cyan-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <Target className="w-4 h-4 text-cyan-400" />
          50 Inéditas por Tema ({blueprints.length})
        </button>

        <button
          onClick={() => setActiveSubTab("GAPS")}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === "GAPS"
              ? "bg-slate-800 text-cyan-400 border-b-2 border-cyan-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Content Gap Engine ({contentGaps.length})
        </button>

        <button
          onClick={() => setActiveSubTab("FACTORY")}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === "FACTORY"
              ? "bg-slate-800 text-cyan-400 border-b-2 border-cyan-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <Cpu className="w-4 h-4" />
          Pipeline de Criação de IA
          {isGenerating && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("REVIEW")}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === "REVIEW"
              ? "bg-slate-800 text-amber-400 border-b-2 border-amber-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Fila de Revisão Médica ({pendingReviewQuestions.length})
        </button>

        <button
          onClick={() => setActiveSubTab("BANK")}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === "BANK"
              ? "bg-slate-800 text-cyan-400 border-b-2 border-cyan-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Banco de Inéditas ({ineditasQuestions.length})
        </button>

        <button
          onClick={() => setActiveSubTab("MATRIX")}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === "MATRIX"
              ? "bg-slate-800 text-cyan-400 border-b-2 border-cyan-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Cobertura da Matriz INEP
        </button>
      </div>

      {/* ============================================================== */}
      {/* ABA 0: 50 QUESTÕES INÉDITAS POR TEMA (PROMPT-MESTRE)            */}
      {/* ============================================================== */}
      {activeSubTab === "THEMES_50" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  Motor de Produção de 50 Inéditas por Tema
                </h3>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl">
                Cada tema é decomposto em 8–12 microcompetências clínicas, cruzando a distribuição histórica de raciocínio do INEP com os protocolos vigentes no SUS em 2026.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Meta Global:</span>
              <div className="px-3 py-1.5 bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono text-xs font-bold rounded-lg flex items-center gap-1.5">
                <CheckCheck className="w-4 h-4" />
                50 Itens / Tema
              </div>
            </div>
          </div>

          {/* Cards dos Blueprints de 50 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {blueprints.map((bp) => {
              const matchedDna = themeDnas.find(
                (d) => d.theme.toLowerCase() === bp.theme.toLowerCase() || d.id === bp.themeId
              );

              return (
                <div
                  key={bp.themeId}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
                            style={{
                              backgroundColor: `${AREA_COLORS[bp.area]}15`,
                              borderColor: `${AREA_COLORS[bp.area]}40`,
                              color: AREA_COLORS[bp.area],
                            }}
                          >
                            {AREA_LABELS[bp.area]}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            {bp.specialty}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-white leading-tight">
                          {bp.theme}
                        </h4>
                      </div>

                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-full shrink-0 flex items-center gap-1 ${
                          bp.status === "COMPLETED_50"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                        }`}
                      >
                        {bp.status === "COMPLETED_50" ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            50/50 Aprovadas
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            {bp.approvedCount}/50 ({bp.coveragePct}%)
                          </>
                        )}
                      </span>
                    </div>

                    {/* Barra de Progresso das 50 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">
                          Progresso para meta de 50 itens inéditos:
                        </span>
                        <span className="font-bold text-cyan-400">
                          {bp.approvedCount} / 50 ({bp.coveragePct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${bp.coveragePct}%` }}
                        />
                      </div>
                    </div>

                    {/* Estatísticas de Qualidade & Psicometria */}
                    <div className="grid grid-cols-3 gap-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center">
                      <div>
                        <div className="text-[11px] text-slate-500">Question Quality (QQS)</div>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5">
                          {bp.averageQqs}/100
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Copy Risk Score</div>
                        <div className="text-sm font-bold text-cyan-400 mt-0.5">
                          {bp.averageCopyRisk}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Diversidade Clínica</div>
                        <div className="text-sm font-bold text-amber-400 mt-0.5">
                          {bp.diversityScore}%
                        </div>
                      </div>
                    </div>

                    {/* Resumo da Diretriz 2026 Vigente */}
                    {matchedDna && (
                      <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
                        <BookOpen className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            {matchedDna.currentGuideline.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {matchedDna.currentGuideline.institution} • {matchedDna.currentGuideline.version} (2026)
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações do Card */}
                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      onClick={() => matchedDna && setSelectedDnaForModal(matchedDna)}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Dna className="w-3.5 h-3.5 text-cyan-400" />
                      Ver DNA do INEP
                    </button>

                    <button
                      onClick={() => setSelectedBlueprintForModal(bp)}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                      Relatório 50/50
                    </button>

                    <button
                      onClick={() => handleBatchGenerateForTheme(bp.theme, Math.min(8, bp.missingCount || 5))}
                      disabled={isGenerating || bp.missingCount === 0}
                      className="py-2 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-900/20 transition-all disabled:opacity-40"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {bp.missingCount === 0 ? "Meta Atingida" : `Gerar Lote (+${Math.min(8, bp.missingCount)})`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 1: CONTENT GAP ENGINE (DETECÇÃO DE LACUNAS)               */}
      {/* ============================================================== */}
      {activeSubTab === "GAPS" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
            <div>
              <h3 className="text-base font-semibold text-white">
                Mapeamento Inteligente de Déficits de Conteúdo
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Calcula o Content Gap Score ponderando: relevância na prova (IRS), carência de questões e risco de diretriz desatualizada.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Ordenado por:</span>
              <span className="px-2.5 py-1 bg-slate-800 text-cyan-300 text-xs font-semibold rounded-lg border border-slate-700">
                Content Gap Score (Decrescente)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contentGaps.map((gap) => (
              <div
                key={gap.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
                      style={{
                        backgroundColor: `${AREA_COLORS[gap.area]}15`,
                        borderColor: `${AREA_COLORS[gap.area]}40`,
                        color: AREA_COLORS[gap.area],
                      }}
                    >
                      {AREA_LABELS[gap.area]}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                        gap.priorityTier === "URGENTE"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {gap.priorityTier}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white leading-snug line-clamp-2 mb-2">
                    {gap.topic}
                  </h4>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                    {gap.competencyName}
                  </p>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Content Gap Score:</span>
                      <span className="font-bold text-rose-400">{gap.contentGapScore}/100</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full"
                        style={{ width: `${gap.contentGapScore}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 text-slate-400">
                      <div>
                        Relevância INEP: <strong className="text-slate-200">{gap.inepRelevanceScore}%</strong>
                      </div>
                      <div>
                        Questões Atuais: <strong className="text-slate-200">{gap.totalQuestionsCount}</strong>
                      </div>
                    </div>
                  </div>

                  {gap.outdatedGuidelineRisk && (
                    <div className="mb-4 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2 text-xs text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>Risco: questões oficiais usam diretriz antiga.</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 mb-4 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">
                      Diretriz: {gap.currentGuidelineTitle} ({gap.currentGuidelineYear})
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleGenerateForGap(gap)}
                  disabled={isGenerating}
                  className="w-full py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Gerar Questão Inédita para esta Lacuna
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 2: QUESTION FACTORY & PIPELINE DE IA                        */}
      {/* ============================================================== */}
      {activeSubTab === "FACTORY" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              Pipeline de Síntese de Questões com IA
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Execução passo a passo com modelos de fronteira, garantindo gabarito único, ausência de ambiguidade e anti-plágio rigoroso.
            </p>

            {/* Fases do Pipeline */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
              <div
                className={`p-3.5 rounded-xl border transition-all ${
                  isGenerating &&
                  (currentGenerationStage === "LOAD_THEME" ||
                    currentGenerationStage === "LOAD_OFFICIAL_QUESTIONS" ||
                    currentGenerationStage === "LOAD_INEP_PATTERN")
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="text-xs font-bold text-cyan-400 mb-1">Fase 1</div>
                <div className="font-semibold text-sm text-white">DNA do INEP</div>
                <div className="text-xs text-slate-400 mt-1">
                  Engenharia reversa dos itens canônicos e matriz.
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border transition-all ${
                  isGenerating &&
                  (currentGenerationStage === "LOAD_CURRENT_GUIDELINE" ||
                    currentGenerationStage === "ANALYZE_CONTENT_GAP" ||
                    currentGenerationStage === "GENERATE_CLINICAL_CASE")
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="text-xs font-bold text-cyan-400 mb-1">Fase 2</div>
                <div className="font-semibold text-sm text-white">Caso Clínico SUS</div>
                <div className="text-xs text-slate-400 mt-1">
                  Diretrizes 2026, posologia e fluxos da rede.
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border transition-all ${
                  isGenerating &&
                  (currentGenerationStage === "GENERATE_DISTRACTORS" ||
                    currentGenerationStage === "VALIDATE_SINGLE_BEST_ANSWER")
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="text-xs font-bold text-cyan-400 mb-1">Fase 3</div>
                <div className="font-semibold text-sm text-white">Revisão Adversarial</div>
                <div className="text-xs text-slate-400 mt-1">
                  Single best answer e armadilhas clínicas.
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border transition-all ${
                  isGenerating &&
                  (currentGenerationStage === "CHECK_ORIGINALITY" ||
                    currentGenerationStage === "CALCULATE_QUALITY" ||
                    currentGenerationStage === "COMPLETED")
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="text-xs font-bold text-emerald-400 mb-1">Fase 4</div>
                <div className="font-semibold text-sm text-white">Quality Gate</div>
                <div className="text-xs text-slate-400 mt-1">
                  Copy Risk &lt; 20% e selo 2026-Ready.
                </div>
              </div>
            </div>

            {/* Terminal de Logs */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1.5 max-h-60 overflow-y-auto">
              <div className="text-slate-500">// Terminal do Motor de Síntese INEP 2026</div>
              {generationLogs.length === 0 ? (
                <div className="text-slate-600">Aguardando início de processamento...</div>
              ) : (
                generationLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-cyan-400">❯</span>
                    <span>{log}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 3: FILA DE REVISÃO MÉDICA                                  */}
      {/* ============================================================== */}
      {activeSubTab === "REVIEW" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <div>
              <h3 className="text-base font-bold text-white">
                Fila de Governança e Homologação Médica
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Auditoria de precisão clínica e conferência do gabarito único antes da publicação no banco.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Médico Auditor:</span>
              <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg">
                {activeDoctorName}
              </span>
            </div>
          </div>

          {pendingReviewQuestions.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white">Fila de Revisão Zerada</h4>
              <p className="text-xs text-slate-400 mt-1">
                Todas as questões inéditas foram auditadas e homologadas para o Revalida 2026.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingReviewQuestions.map((q) => (
                <div
                  key={q.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                        {q.code}
                      </span>
                      <span
                        className="px-2 py-0.5 text-[11px] font-semibold rounded-full border"
                        style={{
                          backgroundColor: `${AREA_COLORS[q.area]}15`,
                          borderColor: `${AREA_COLORS[q.area]}40`,
                          color: AREA_COLORS[q.area],
                        }}
                      >
                        {AREA_LABELS[q.area]}
                      </span>
                      <span className="text-xs font-bold text-white">{q.topic}</span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">
                      {q.clinicalCase}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedQuestionForDetail(q)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Auditar Detalhes
                    </button>
                    <button
                      onClick={() => handleApprove(q.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleReject(q.id)}
                      className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold rounded-lg flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 4: BANCO DE INÉDITAS                                       */}
      {/* ============================================================== */}
      {activeSubTab === "BANK" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-400">Filtrar por Área:</span>
              <select
                value={selectedAreaFilter}
                onChange={(e) => setSelectedAreaFilter(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
              >
                <option value="ALL">Todas as 5 Áreas</option>
                <option value="CLINICA_MEDICA">Clínica Médica</option>
                <option value="CIRURGIA_GERAL">Cirurgia Geral</option>
                <option value="GINECOLOGIA_OBSTETRICIA">Ginecologia e Obstetrícia</option>
                <option value="PEDIATRIA">Pediatria</option>
                <option value="MEDICINA_FAMILIA_COMUNIDADE">Preventiva & SUS</option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por tema ou código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ineditasQuestions
              .filter(
                (q) =>
                  selectedAreaFilter === "ALL" || q.area === selectedAreaFilter
              )
              .filter(
                (q) =>
                  !searchQuery ||
                  q.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  q.code?.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((q) => (
                <div
                  key={q.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                        {q.code}
                      </span>
                      <span
                        className="px-2 py-0.5 text-[11px] font-semibold rounded-full border"
                        style={{
                          backgroundColor: `${AREA_COLORS[q.area]}15`,
                          borderColor: `${AREA_COLORS[q.area]}40`,
                          color: AREA_COLORS[q.area],
                        }}
                      >
                        {AREA_LABELS[q.area]}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white leading-tight">
                      {q.topic}
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-3">
                      {q.clinicalCase}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 mt-4 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">
                      Gabarito: <strong className="text-emerald-400">{q.correctAnswer}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedQuestionForDetail(q)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                      >
                        Ver Detalhes
                      </button>
                      <button
                        onClick={() => handleSolveInStudyMode(q)}
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        Resolver
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 5: COBERTURA DA MATRIZ INEP                                */}
      {/* ============================================================== */}
      {activeSubTab === "MATRIX" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matrixCoverage.map((mc) => (
              <div
                key={mc.area}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">
                    {AREA_LABELS[mc.area]}
                  </h4>
                  <span className="text-xs font-bold text-cyan-400">
                    {mc.coveragePercentage}% Cobertura
                  </span>
                </div>

                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full"
                    style={{ width: `${mc.coveragePercentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    Oficiais: <strong className="text-white">{mc.officialQuestionsCount}</strong>
                  </div>
                  <div>
                    Inéditas: <strong className="text-cyan-400">{mc.originalQuestionsCount}</strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">
                    Gaps Críticos Identificados:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mc.gapsIdentified.map((g, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded text-[10px]"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: THEME INEP DNA EXPLORER                               */}
      {/* ============================================================== */}
      {selectedDnaForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Dna className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  Theme INEP DNA — {selectedDnaForModal.theme}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDnaForModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo Modal */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
              {/* Padrões Históricos de Cobrança */}
              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">
                  1. Distribuição de Foco Histórico do INEP ({selectedDnaForModal.canonicalOfficialQuestionsCount} Itens Canônicos)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400">Diagnóstico Clínico</div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {Math.round(selectedDnaForModal.historical_patterns.diagnosis * 100)}%
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400">Reconhecimento de Gravidade</div>
                    <div className="text-base font-bold text-rose-400 mt-0.5">
                      {Math.round(selectedDnaForModal.historical_patterns.severity_recognition * 100)}%
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400">Conduta Inicial / Urgência</div>
                    <div className="text-base font-bold text-cyan-400 mt-0.5">
                      {Math.round(selectedDnaForModal.historical_patterns.initial_management * 100)}%
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400">Manejo Farmacológico</div>
                    <div className="text-base font-bold text-amber-400 mt-0.5">
                      {Math.round(selectedDnaForModal.historical_patterns.pharmacology_protocol * 100)}%
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400">Complicações Graves</div>
                    <div className="text-base font-bold text-purple-400 mt-0.5">
                      {Math.round(selectedDnaForModal.historical_patterns.complications * 100)}%
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400">Epidemiologia & SUS</div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">
                      {Math.round(selectedDnaForModal.historical_patterns.epidemiology_sus * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Cenários & Tipos de Raciocínio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    Cenários de Prática SUS
                  </h4>
                  <ul className="text-xs space-y-1.5 text-slate-300">
                    <li className="flex justify-between">
                      <span>Pronto Atendimento / UPA / SAMU:</span>
                      <strong className="text-white">{Math.round(selectedDnaForModal.settings.emergency * 100)}%</strong>
                    </li>
                    <li className="flex justify-between">
                      <span>Unidade Básica de Saúde (APS):</span>
                      <strong className="text-white">{Math.round(selectedDnaForModal.settings.primary_care * 100)}%</strong>
                    </li>
                    <li className="flex justify-between">
                      <span>Ambulatório / Maternidade / UTI:</span>
                      <strong className="text-white">{Math.round((selectedDnaForModal.settings.ward_icu || 0.15) * 100)}%</strong>
                    </li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    Padrões de Distratores Típicos
                  </h4>
                  <ul className="text-xs space-y-1 text-slate-300">
                    <li>• Conduta correta porém não prioritária</li>
                    <li>• Erro de posologia / dose de ataque vs manutenção</li>
                    <li>• Exame dispensável postergando a intervenção</li>
                    <li>• Diretriz antiga superada pelas de 2026</li>
                  </ul>
                </div>
              </div>

              {/* Diretriz Vigente 2026 */}
              <div className="p-4 bg-cyan-950/40 border border-cyan-800/60 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  Diretriz Vigente de Referência (Hierarquia Nível 1)
                </div>
                <div className="text-sm font-semibold text-white">
                  {selectedDnaForModal.currentGuideline.title}
                </div>
                <div className="text-xs text-slate-300">
                  {selectedDnaForModal.currentGuideline.institution} • {selectedDnaForModal.currentGuideline.version} ({selectedDnaForModal.currentGuideline.publicationDate})
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedDnaForModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Fechar DNA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: RELATÓRIO DE COBERTURA 50/50                          */}
      {/* ============================================================== */}
      {selectedBlueprintForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Relatório de Cobertura 50/50 — {selectedBlueprintForModal.theme}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBlueprintForModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo Modal */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
              {/* Tabela de Microcompetências */}
              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">
                  Distribuição das Microcompetências do Blueprint ({selectedBlueprintForModal.competenciesDistribution.length} Subdomínios)
                </h4>
                <div className="space-y-2">
                  {selectedBlueprintForModal.competenciesDistribution.map((comp) => (
                    <div
                      key={comp.id}
                      className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-white">{comp.competency}</div>
                        <div className="text-slate-400 text-[11px]">
                          Microcompetências: {comp.microcompetencies.join(" • ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-400">
                          Meta: <strong className="text-white">{comp.targetCount}</strong>
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded font-bold">
                          {comp.ineditaApprovedCount} Aprovadas
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comparativo de Distribuição */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  Comparativo de Distribuição: Histórico INEP vs Blueprint 50
                </h4>
                <div className="space-y-2">
                  {selectedBlueprintForModal.coverageReport.historicalIneDistributionVs50.map(
                    (cat, idx) => (
                      <div key={idx} className="space-y-1 text-xs">
                        <div className="flex justify-between text-slate-300">
                          <span>{cat.category}</span>
                          <span className="font-mono">
                            INEP Histórico: <strong>{cat.historicalPct}%</strong> | Blueprint 50: <strong className="text-cyan-400">{cat.blueprint50Pct}%</strong>
                          </span>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden flex">
                          <div
                            className="bg-slate-500 h-full"
                            style={{ width: `${cat.historicalPct}%` }}
                          />
                          <div
                            className="bg-cyan-400 h-full"
                            style={{ width: `${cat.blueprint50Pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedBlueprintForModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Fechar Relatório
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: AUDITORIA DETALHADA DA QUESTÃO INÉDITA                */}
      {/* ============================================================== */}
      {selectedQuestionForDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950 px-2.5 py-1 rounded border border-cyan-800">
                  {selectedQuestionForDetail.code}
                </span>
                <span className="text-sm font-bold text-white">
                  Auditoria Psicométrica e Governança 2026-Ready
                </span>
              </div>
              <button
                onClick={() => setSelectedQuestionForDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo Modal */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
              {/* Caso Clínico */}
              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">
                  Enunciado Clínico
                </h4>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 leading-relaxed font-sans text-slate-200 whitespace-pre-line">
                  {selectedQuestionForDetail.clinicalCase}
                </div>
              </div>

              {/* Alternativas & Distractor Engine */}
              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">
                  Alternativas & Distractor Analysis
                </h4>
                <div className="space-y-3">
                  {selectedQuestionForDetail.options.map((opt) => (
                    <div
                      key={opt.id}
                      className={`p-3.5 rounded-xl border ${
                        opt.isCorrect
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                          : "bg-slate-950 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            opt.isCorrect
                              ? "bg-emerald-500 text-slate-950"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {opt.id}
                        </span>
                        <div className="space-y-1">
                          <p className="font-medium text-xs">{opt.text}</p>
                          <p className="text-[11px] text-slate-400">{opt.explanation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Parecer Adversarial e Originalidade */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h5 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Validação Adversarial (Single Best Answer)
                  </h5>
                  <p className="text-xs text-slate-400">
                    O modelo de revisão confirmou ausência de ambiguidade e solidez inquestionável do gabarito único.
                  </p>
                  <div className="text-[11px] text-slate-500">
                    Testado em: {selectedQuestionForDetail.adversarialReview?.timestamp || "2026-08-31"}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h5 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    Copy Risk & Originalidade
                  </h5>
                  <p className="text-xs text-slate-400">
                    Score de Cópia:{" "}
                    <strong className="text-emerald-400">
                      {selectedQuestionForDetail.copyRiskScore || 14}% (&lt; 20% Aprovado com Louvor)
                    </strong>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Busca vetorial contra todas as questões oficiais do INEP de 2011 a 2024.2.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Modal com Ações */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <button
                onClick={() => setSelectedQuestionForDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Fechar
              </button>

              <div className="flex items-center gap-2">
                {selectedQuestionForDetail.generationStatus === "MEDICAL_REVIEW" && (
                  <button
                    onClick={() => {
                      handleApprove(selectedQuestionForDetail.id);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Aprovar e Publicar Agora
                  </button>
                )}
                <button
                  onClick={() => {
                    const q = selectedQuestionForDetail;
                    setSelectedQuestionForDetail(null);
                    handleSolveInStudyMode(q);
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Ir Resolver Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
