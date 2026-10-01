import React, { useState } from "react";
import {
  ShieldAlert,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  History,
  Scale,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  Stethoscope,
  ArrowRight,
  Sliders,
  Check,
  X,
  Clock,
  Layers,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  MedicalGuideline,
  GuidelineAuditLog,
  GuidelineWatchAlert,
  ContentStatus,
  GuidelineImpactLevel,
  Question,
} from "../../types";
import { GroundedGuidelineRadarView } from "./GroundedGuidelineRadarView";

export const GuidelineWatchView: React.FC = () => {
  const {
    guidelines,
    guidelineAlerts,
    guidelineAuditLogs,
    questions,
    addGuidelineAuditLog,
    approveGuidelineAlert,
    setActiveTab,
    setActiveQuestionIndex,
    user,
    isAuthLoading,
    isGuestMode,
    isDeveloperAdmin,
    firebaseUser,
    profileResolutionStatus,
    profileError,
    retryProfileResolution,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<"student_hub" | "grounded_radar" | "audit_queue" | "repository" | "logs">("student_hub");
  const [selectedGuidelineFilter, setSelectedGuidelineFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Microaula / Sessão de Atualização modal state
  const [activeMicroLesson, setActiveMicroLesson] = useState<{
    isOpen: boolean;
    question: Question | null;
    currentStep: number;
    quizAnswer: string | null;
    isQuizSubmitted: boolean;
  }>({
    isOpen: false,
    question: null,
    currentStep: 1,
    quizAnswer: null,
    isQuizSubmitted: false,
  });

  // Review Queue state for medical review
  const [reviewingAlert, setReviewingAlert] = useState<GuidelineWatchAlert | null>(null);
  const [reviewJustification, setReviewJustification] = useState<string>("");
  const [selectedNewStatus, setSelectedNewStatus] = useState<ContentStatus>("OFFICIAL_ANSWER_HISTORICAL");
  const [selectedImpact, setSelectedImpact] = useState<GuidelineImpactLevel>("ALTO");
  const [reviewerName, setReviewerName] = useState<string>("Dr. Rodrigo Valente Mendes (CRM-SP 184.920)");

  // 1. Loading boundary: wait while auth is initializing or profile is in-flight/unresolved
  if (
    isAuthLoading ||
    (firebaseUser &&
      profileResolutionStatus !== "READY" &&
      profileResolutionStatus !== "ERROR")
  ) {
    return (
      <div
        data-testid="guideline-loading-boundary"
        className="max-w-xl mx-auto my-24 p-8 rounded-[28px] bg-slate-950/80 border border-slate-800 text-center space-y-4 shadow-2xl backdrop-blur-2xl"
      >
        <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
        <p className="text-xs text-slate-300 font-semibold">
          Validando credenciais administrativas com o servidor...
        </p>
      </div>
    );
  }

  // 2. Profile resolution error boundary: infrastructure failure is distinct from access denied
  if (profileResolutionStatus === "ERROR") {
    return (
      <div
        data-testid="guideline-profile-error-boundary"
        className="max-w-xl mx-auto my-12 p-8 rounded-[28px] bg-slate-950/90 border border-amber-500/30 text-center space-y-5 shadow-2xl backdrop-blur-2xl"
      >
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center border border-amber-500/30">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Não foi possível confirmar suas permissões
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
            {profileError ||
              "Ocorreu uma instabilidade na verificação de privilégios com o servidor. Suas credenciais não puderam ser validadas no momento."}
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => retryProfileResolution?.()}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar Novamente
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
          >
            Voltar para a Área do Aluno
          </button>
        </div>
      </div>
    );
  }

  // 3. Stabilized Access Denied: only rendered when resolution completed (READY) and user is not ADMIN
  if (!isDeveloperAdmin) {
    return (
      <div
        id="admin-access-denied"
        data-testid="admin-access-denied"
        className="max-w-xl mx-auto my-12 p-8 rounded-[28px] bg-slate-950/90 border border-rose-500/30 text-center space-y-5 shadow-2xl backdrop-blur-2xl"
      >
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Acesso Restrito à Administração
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
            Esta área exige confirmação de privilégios <code className="text-rose-300 font-mono">ADMIN</code> validados pelo servidor.
            O Radar de Diretrizes e a Fila de Auditoria Editorial são restritos à equipe médica gestora.
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
          >
            Voltar para a Área do Aluno
          </button>
        </div>
      </div>
    );
  }

  // Questions with guideline updates
  const updatedQuestions = questions.filter((q) => q.guidelineUpdate);

  const handleOpenMicroLesson = (q: Question) => {
    setActiveMicroLesson({
      isOpen: true,
      question: q,
      currentStep: 1,
      quizAnswer: null,
      isQuizSubmitted: false,
    });
  };

  const handleCompleteReview = () => {
    if (!reviewingAlert) return;
    const targetQ = updatedQuestions[0] || questions[0];
    if (!targetQ) return;

    addGuidelineAuditLog({
      questionId: targetQ.id,
      questionCode: targetQ.code,
      previousStatus: targetQ.guidelineUpdate?.status || "CURRENT",
      newStatus: selectedNewStatus,
      guidelineTitle: reviewingAlert.guidelineTitle,
      changedBy: reviewerName,
      approvedBy: "Conselho Editorial StaziaMed Revalida",
      reason: reviewJustification || "Revisão e homologação de diretriz médica atualizada.",
      impactLevel: selectedImpact,
    });

    approveGuidelineAlert(reviewingAlert.id);
    setReviewingAlert(null);
    setReviewJustification("");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.04] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-purple-300" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-purple-300">
                Protocolo Permanente de Vigilância Clínica (2021–2026)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Guideline Watch & O Que Mudou na Medicina?
            </h1>
            <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
              Sistema contínuo de monitoramento de mudanças em consensos clínicos (SBC, SBD, MS, FEBRASGO, GINA).
              Preservamos o gabarito oficial histórico do INEP sem nunca induzir o aluno ao erro hoje.
            </p>
          </div>

          {/* Subtabs Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-black/40 border border-white/10 self-start md:self-auto">
            <button
              onClick={() => setActiveSubTab("student_hub")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "student_hub"
                  ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>O Que Mudou? (Aluno)</span>
            </button>

            <button
              onClick={() => setActiveSubTab("grounded_radar")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "grounded_radar"
                  ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                  : "text-purple-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
              <span>Radar Grounded SUS</span>
            </button>

            <button
              onClick={() => setActiveSubTab("audit_queue")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "audit_queue"
                  ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Fila de Revisão Médica</span>
              {guidelineAlerts.filter((a) => a.status === "PENDING_REVIEW" || a.status === "REVIEWED").length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-black">
                  {guidelineAlerts.filter((a) => a.status === "PENDING_REVIEW" || a.status === "REVIEWED").length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSubTab("repository")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "repository"
                  ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Diretrizes ({guidelines.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab("logs")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "logs"
                  ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Log de Auditoria</span>
            </button>
          </div>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Monitoradas</span>
            <span className="text-xl font-black text-white mt-0.5 block">4.827</span>
            <span className="text-[10px] text-emerald-400 font-semibold">100% das provas</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[11px] text-emerald-300 font-medium block">Atuais e Vigentes</span>
            <span className="text-xl font-black text-emerald-200 mt-0.5 block">4.612</span>
            <span className="text-[10px] text-emerald-400/80 font-semibold">95,5% do banco</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <span className="text-[11px] text-blue-300 font-medium block">Novas Diretrizes</span>
            <span className="text-xl font-black text-blue-200 mt-0.5 block">74</span>
            <span className="text-[10px] text-blue-400 font-semibold">SBC / SBD / GINA</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] text-amber-300 font-medium block">Em Revisão Médica</span>
            <span className="text-xl font-black text-amber-200 mt-0.5 block">32</span>
            <span className="text-[10px] text-amber-400 font-semibold">Corpo de especialistas</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20">
            <span className="text-[11px] text-orange-300 font-medium block">Gabarito Histórico</span>
            <span className="text-xl font-black text-orange-200 mt-0.5 block">18</span>
            <span className="text-[10px] text-orange-400 font-semibold">Conduta atual mudou</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20">
            <span className="text-[11px] text-red-300 font-medium block">Desatualizadas (Críticas)</span>
            <span className="text-xl font-black text-red-200 mt-0.5 block">5</span>
            <span className="text-[10px] text-red-400 font-semibold">Ex: VOP substituída</span>
          </div>
        </div>
      </div>

      {/* 1. STUDENT HUB VIEW: "O Que Mudou na Medicina?" */}
      {activeSubTab === "student_hub" && (
        <div className="space-y-6">
          {/* Personalized Alert Banner */}
          <div className="p-5 rounded-[24px] backdrop-blur-2xl bg-gradient-to-r from-purple-500/15 via-blue-500/15 to-emerald-500/15 border border-purple-400/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Radar Personalizado: Novas Diretrizes 2026 afetam seus estudos
                </h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Detectamos 3 questões do Revalida que você já resolveu com condutas que foram recentemente atualizadas
                  (Hipertensão SBC 2026, PNI Vacinas 2026 e Diabetes SBD 2026).
                </p>
              </div>
            </div>

            <button
              onClick={() => handleOpenMicroLesson(updatedQuestions[0] || questions[0])}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shrink-0 transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(147,51,234,0.4)]"
            >
              <span>Iniciar Sessão de Atualização Clínica</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Cards of Questions with Clinical Updates */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Questões Oficiais com Alertas de Atualização Clínica
              </h3>
              <span className="text-xs text-white/50">
                {updatedQuestions.length} questões com dupla explicação cadastrada
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {updatedQuestions.map((q) => {
                const upd = q.guidelineUpdate!;
                return (
                  <div
                    key={q.id}
                    className="p-5 rounded-[24px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 hover:border-purple-400/40 transition-all shadow-xl flex flex-col justify-between"
                  >
                    <div>
                      {/* Badge and Status */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-400/30">
                            {q.code}
                          </span>
                          <span className="text-xs font-semibold text-white/70">
                            {q.examEdition}
                          </span>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            upd.impactLevel === "CRITICO"
                              ? "bg-red-500/20 border-red-500/40 text-red-300"
                              : upd.impactLevel === "ALTO"
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                              : "bg-blue-500/20 border-blue-500/40 text-blue-300"
                          }`}
                        >
                          Impacto {upd.impactLevel}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white mb-2 line-clamp-2">
                        {q.topic} — {q.subtopic}
                      </h4>

                      {/* Before vs Now Summary Box */}
                      <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/40 border border-white/10 mb-3 text-xs">
                        <div className="border-r border-white/10 pr-2">
                          <span className="text-[10px] font-bold text-white/40 uppercase block mb-0.5">
                            Época da Prova ({q.examYear})
                          </span>
                          <span className="text-amber-300 font-bold block mb-1">
                            Gabarito: Alt. {upd.officialHistoricalAnswer}
                          </span>
                          <p className="text-[11px] text-white/60 line-clamp-2">
                            {upd.atExamTime}
                          </p>
                        </div>

                        <div className="pl-1">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-0.5">
                            Diretriz Atual (2026)
                          </span>
                          <span className="text-emerald-300 font-bold block mb-1">
                            Conduta: Alt. {upd.currentRecommendedAnswer}
                          </span>
                          <p className="text-[11px] text-white/80 line-clamp-2">
                            {upd.currently}
                          </p>
                        </div>
                      </div>

                      {/* Guideline source & Reviewer */}
                      <div className="flex items-center gap-1.5 text-[11px] text-white/50 mb-4">
                        <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="truncate">{upd.guidelineTitle} ({upd.institution})</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleOpenMicroLesson(q)}
                        className="px-3.5 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 border border-purple-400/30 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ver Microaula Interativa</span>
                      </button>

                      <button
                        onClick={() => {
                          const idx = questions.findIndex((item) => item.id === q.id);
                          if (idx !== -1) {
                            setActiveQuestionIndex(idx);
                            setActiveTab("questions");
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all flex items-center gap-1"
                      >
                        <span>Resolver no Treinador</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. GROUNDED RADAR VIEW */}
      {activeSubTab === "grounded_radar" && <GroundedGuidelineRadarView />}

      {/* 3. MEDICAL AUDIT & REVIEW QUEUE */}
      {activeSubTab === "audit_queue" && (
        <div className="space-y-6">
          <div className="p-5 rounded-[24px] backdrop-blur-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileCheck className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-amber-200">
                  Fila Editorial de Homologação Médica (Guideline Watch)
                </h3>
                <p className="text-xs text-white/60">
                  Alertas de potenciais mudanças em diretrizes detectados pelo robô de vigilância aguardando parecer de médico especialista.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {guidelineAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-5 rounded-[24px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-white/10 text-white">
                      {alert.institution}
                    </span>
                    <span className="text-xs text-white/50">Detectado em: {alert.detectedDate}</span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider self-start ${
                      alert.status === "APPLIED"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {alert.status === "APPLIED" ? "Homologado e Aplicado" : "Pendente de Parecer"}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white mb-1.5">{alert.guidelineTitle}</h4>
                <p className="text-xs text-white/70 mb-3">{alert.summary}</p>

                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 mb-4 text-xs">
                  <span className="text-purple-300 font-bold block mb-0.5">Ação Editorial Recomendada:</span>
                  <span className="text-white/80">{alert.actionRequired}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                  <span className="text-xs text-white/60">
                    Impacta <strong>{alert.affectedQuestionsCount} questões</strong> ({alert.criticalChangesCount} com divergência de gabarito)
                  </span>

                  {alert.status !== "APPLIED" ? (
                    <button
                      onClick={() => setReviewingAlert(alert)}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)] flex items-center gap-1.5"
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Emitir Parecer Médico Especialista</span>
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Diretriz ativa no algoritmo de questões
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. GUIDELINES REPOSITORY */}
      {activeSubTab === "repository" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por sociedade, tema, ano..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs placeholder:text-white/40 focus:outline-none focus:border-purple-400"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
              {["ALL", "Cardiologia", "Endocrinologia & Clínica Médica", "Pediatria & Saúde Coletiva", "Ginecologia e Obstetrícia"].map((spec) => (
                <button
                  key={spec}
                  onClick={() => setSelectedGuidelineFilter(spec)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedGuidelineFilter === spec
                      ? "bg-purple-600 text-white"
                      : "bg-white/5 text-white/60 hover:text-white"
                  }`}
                >
                  {spec === "ALL" ? "Todas as Especialidades" : spec}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guidelines
              .filter((g) => {
                if (selectedGuidelineFilter !== "ALL" && !g.specialty.includes(selectedGuidelineFilter)) return false;
                if (searchQuery && !g.title.toLowerCase().includes(searchQuery.toLowerCase()) && !g.institution.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                return true;
              })
              .map((g) => (
                <div
                  key={g.id}
                  className="p-5 rounded-[24px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-400/30">
                        {g.institution}
                      </span>
                      <span className="text-[11px] text-white/50">{g.publicationYear} • Versão {g.version}</span>
                    </div>

                    <h4 className="text-sm font-bold text-white mb-2">{g.title}</h4>
                    <p className="text-xs text-white/60 mb-3">
                      <strong>Tópico:</strong> {g.topic} ({g.specialty})
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-semibold">
                      {g.affectedQuestionsCount} questões vinculadas
                    </span>
                    <a
                      href={g.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-300 hover:text-purple-200 underline flex items-center gap-1"
                    >
                      <span>Fonte Oficial</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 4. AUDIT LOGS */}
      {activeSubTab === "logs" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs">
            <span className="text-white/70">
              Registro imutável de todas as revisões, homologações e alterações de status clínico.
            </span>
            <span className="text-white/40">{guidelineAuditLogs.length} eventos registrados</span>
          </div>

          <div className="space-y-3">
            {guidelineAuditLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-purple-300">{log.questionCode}</span>
                    <span className="text-white/40">•</span>
                    <span className="text-white/70 font-semibold">{log.guidelineTitle}</span>
                  </div>
                  <span className="text-[11px] text-white/40">{log.timestamp ? log.timestamp.split("T")[0] : ""}</span>
                </div>

                <p className="text-white/90 leading-relaxed">{log.reason}</p>

                <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between text-[11px] text-white/50 gap-2">
                  <span>Revisado por: <strong className="text-white/80">{log.changedBy}</strong></span>
                  <span>Aprovado por: <strong className="text-emerald-400">{log.approvedBy}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Sessão de Atualização Clínica (Microaula Passo a Passo) */}
      {activeMicroLesson.isOpen && activeMicroLesson.question && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[32px] bg-[#0c0c12] border border-purple-500/40 p-6 sm:p-8 shadow-[0_0_60px_rgba(147,51,234,0.2)] text-white space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">
                    Microaula Interativa de Atualização Clínica
                  </span>
                  <h3 className="text-lg font-bold">
                    {activeMicroLesson.question.topic} — {activeMicroLesson.question.subtopic}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setActiveMicroLesson((prev) => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper navigation */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { step: 1, label: "1. Antes vs Agora" },
                { step: 2, label: "2. Por Que Mudou?" },
                { step: 3, label: "3. O Que o INEP Cobra" },
                { step: 4, label: "4. Quick Quiz" },
              ].map((s) => (
                <button
                  key={s.step}
                  onClick={() => setActiveMicroLesson((prev) => ({ ...prev, currentStep: s.step }))}
                  className={`py-2 px-3 rounded-xl text-xs font-bold text-center border transition-all ${
                    activeMicroLesson.currentStep === s.step
                      ? "bg-purple-600 text-white border-purple-400 shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                      : "bg-white/[0.02] text-white/50 border-white/10 hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Step Content */}
            {activeMicroLesson.currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block mb-1">
                    Enunciado da Questão Oficial ({activeMicroLesson.question.code})
                  </span>
                  <p className="text-xs text-white/80 leading-relaxed line-clamp-3">
                    {activeMicroLesson.question.clinicalCase}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Left: Época da Prova */}
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-300 uppercase">
                        🏛️ Na Época da Prova ({activeMicroLesson.question.examYear})
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-black">
                        Gabarito: Alt. {activeMicroLesson.question.guidelineUpdate?.officialHistoricalAnswer}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 leading-relaxed">
                      {activeMicroLesson.question.guidelineUpdate?.atExamTime}
                    </p>
                  </div>

                  {/* Right: Diretriz Vigente */}
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-300 uppercase">
                        ⚡ Diretriz Atual (2026)
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-black text-[10px] font-black">
                        Conduta: Alt. {activeMicroLesson.question.guidelineUpdate?.currentRecommendedAnswer}
                      </span>
                    </div>
                    <p className="text-xs text-white/90 leading-relaxed font-medium">
                      {activeMicroLesson.question.guidelineUpdate?.currently}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeMicroLesson.currentStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                    🔬 Racional Fisiopatológico & Novos Ensaios Clínicos
                  </span>
                  <p className="text-xs text-white/90 leading-relaxed">
                    {activeMicroLesson.question.guidelineUpdate?.reasonForChange}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-white/70 space-y-1">
                  <span className="font-bold text-white block">Fonte & Publicação:</span>
                  <p>{activeMicroLesson.question.guidelineUpdate?.guidelineTitle}</p>
                  <p>Instituição: {activeMicroLesson.question.guidelineUpdate?.institution}</p>
                  <p>Última revisão médica: {activeMicroLesson.question.guidelineUpdate?.knowledgeLastReviewedAt} por {activeMicroLesson.question.guidelineUpdate?.reviewedBy}</p>
                </div>
              </div>
            )}

            {activeMicroLesson.currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-5 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2">
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider block">
                    🎯 O que memorizar para o Revalida 2026:
                  </span>
                  <p className="text-xs text-white/90 leading-relaxed font-semibold">
                    {activeMicroLesson.question.guidelineUpdate?.whatToStudyToday}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                  <span className="font-bold text-emerald-300 block">🇧🇷 Particularidade no SUS:</span>
                  <p className="text-white/80">
                    {activeMicroLesson.question.guidelineUpdate?.divergentGuidelineNote || activeMicroLesson.question.brazilContextNote}
                  </p>
                </div>
              </div>
            )}

            {activeMicroLesson.currentStep === 4 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-xs">
                  <span className="font-bold text-purple-300 block mb-1">
                    ⚡ Teste Rápido de Fixação da Nova Conduta:
                  </span>
                  <p className="text-white/90 font-medium">
                    Se este caso clínico caísse na prova do Revalida 2026/1 hoje, qual seria a alternativa CORRETA?
                  </p>
                </div>

                <div className="space-y-2">
                  {activeMicroLesson.question.options.map((opt) => (
                    <button
                      key={opt.id}
                      disabled={activeMicroLesson.isQuizSubmitted}
                      onClick={() =>
                        setActiveMicroLesson((prev) => ({
                          ...prev,
                          quizAnswer: opt.id,
                        }))
                      }
                      className={`w-full p-3.5 rounded-2xl text-left text-xs border transition-all flex items-start gap-2.5 ${
                        activeMicroLesson.quizAnswer === opt.id
                          ? "bg-purple-600/30 border-purple-400 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]"
                          : "bg-white/[0.02] border-white/10 text-white/70 hover:border-white/20"
                      }`}
                    >
                      <span className="px-2 py-0.5 rounded-lg bg-white/10 font-bold text-white text-[11px] shrink-0">
                        {opt.id}
                      </span>
                      <span>{opt.text}</span>
                    </button>
                  ))}
                </div>

                {!activeMicroLesson.isQuizSubmitted ? (
                  <button
                    onClick={() =>
                      setActiveMicroLesson((prev) => ({
                        ...prev,
                        isQuizSubmitted: true,
                      }))
                    }
                    disabled={!activeMicroLesson.quizAnswer}
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-[0_0_20px_rgba(147,51,234,0.4)]"
                  >
                    Confirmar Resposta Atualizada
                  </button>
                ) : (
                  <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-xs space-y-1">
                    <span className="font-bold block flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      Excelente! Conduta de 2026 fixada com sucesso.
                    </span>
                    <p className="text-white/80">
                      Você compreendeu a mudança de protocolo e está 100% blindado contra desatualizações na prova.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <button
                onClick={() =>
                  setActiveMicroLesson((prev) => ({
                    ...prev,
                    currentStep: Math.max(1, prev.currentStep - 1),
                  }))
                }
                disabled={activeMicroLesson.currentStep === 1}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-xs font-semibold text-white transition-all"
              >
                Voltar
              </button>

              {activeMicroLesson.currentStep < 4 ? (
                <button
                  onClick={() =>
                    setActiveMicroLesson((prev) => ({
                      ...prev,
                      currentStep: Math.min(4, prev.currentStep + 1),
                    }))
                  }
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center gap-1"
                >
                  <span>Próximo Passo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setActiveMicroLesson((prev) => ({ ...prev, isOpen: false }))}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                >
                  Concluir Microaula
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Emissão de Parecer Médico Especialista */}
      {reviewingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-[32px] bg-[#0c0c12] border border-amber-500/40 p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.2)] text-white space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold">Parecer Médico & Homologação de Diretriz</h3>
              </div>
              <button
                onClick={() => setReviewingAlert(null)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-white/60 font-semibold block mb-1">Diretriz em Análise:</label>
                <input
                  type="text"
                  readOnly
                  value={reviewingAlert.guidelineTitle}
                  className="w-full p-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/60 font-semibold block mb-1">Novo Status da Questão:</label>
                  <select
                    value={selectedNewStatus}
                    onChange={(e) => setSelectedNewStatus(e.target.value as ContentStatus)}
                    className="w-full p-2.5 rounded-xl bg-black/60 border border-white/20 text-white"
                  >
                    <option value="OFFICIAL_ANSWER_HISTORICAL">OFFICIAL_ANSWER_HISTORICAL (Gabarito Preservado)</option>
                    <option value="UPDATED_GUIDELINE">UPDATED_GUIDELINE (Diretriz Atualizada)</option>
                    <option value="OUTDATED">OUTDATED (Desatualizada)</option>
                    <option value="PARTIALLY_OUTDATED">PARTIALLY_OUTDATED (Parcialmente Desatualizada)</option>
                    <option value="CURRENT">CURRENT (Mantida como Vigente)</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/60 font-semibold block mb-1">Nível de Impacto no Revalida:</label>
                  <select
                    value={selectedImpact}
                    onChange={(e) => setSelectedImpact(e.target.value as GuidelineImpactLevel)}
                    className="w-full p-2.5 rounded-xl bg-black/60 border border-white/20 text-white"
                  >
                    <option value="CRITICO">CRÍTICO (Mudança direta de gabarito)</option>
                    <option value="ALTO">ALTO (Nova classe recomendada)</option>
                    <option value="MEDIO">MÉDIO (Ajuste de dosagem ou critério)</option>
                    <option value="BAIXO">BAIXO (Atualização de redação)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-white/60 font-semibold block mb-1">Parecer e Justificativa Médica:</label>
                <textarea
                  rows={3}
                  placeholder="Descreva a fundamentação clínica da homologação da nova conduta..."
                  value={reviewJustification}
                  onChange={(e) => setReviewJustification(e.target.value)}
                  className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-white/60 font-semibold block mb-1">Médico Especialista Responsável:</label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setReviewingAlert(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleCompleteReview}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
              >
                Homologar Parecer e Gravar no Log de Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
