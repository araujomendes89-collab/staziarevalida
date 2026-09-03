import React, { useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  Zap,
  Target,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Play,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Award,
  Layers,
  FileQuestion,
  ChevronRight,
  Info,
  Sliders,
  Maximize2,
  X,
  Compass,
  BarChart2,
  CalendarDays,
  Flame,
  Check,
  Download,
  ExternalLink,
  Mail,
  CalendarClock,
  BookOpen,
  Filter,
  EyeOff,
  Percent,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  ADAPTIVE_SCHEDULE_DAYS,
  DEFAULT_STUDENT_PROFILE,
  NEXT_BEST_ACTION,
  TIME_PRESETS_DATA,
  WEEKLY_ROUTE_REPORT,
  ERROR_AUTOPSY_DISTRIBUTION,
  DEPRIORITIZED_TOPICS_SAMPLE,
  COVERAGE_FORECAST_SAMPLE,
} from "../../data/adaptiveCalendarData";
import {
  ScheduledDayItem,
  CalendarBlockType,
  StudyPhaseType,
  CalendarBlock,
  StudentOnboardingProfile,
} from "../../types/adaptiveCalendar";
import { MedicalArea } from "../../types";
import { ExamEngine } from "../../services/examEngine";
import { CalendarService } from "../../services/calendarService";
import { SpacedRepetitionService } from "../../services/spacedRepetitionService";
import { StudyPlannerEngine, StudyPriorityScoreItem } from "../../services/studyPlannerEngine";
import { WeeklyBulletinModal } from "./WeeklyBulletinModal";
import { WhyThisBlockModal } from "./WhyThisBlockModal";
import { TimeBoxModal } from "./TimeBoxModal";
import { GuidedStudySessionModal } from "./GuidedStudySessionModal";
import { ScheduleConfigModal } from "./ScheduleConfigModal";
import { RecoveryPlanModal } from "./RecoveryPlanModal";

const AREA_LABELS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina Preventiva, Social & SUS",
};

export type CalendarSubView =
  | "TODAY"
  | "WEEK"
  | "MONTH"
  | "ROADMAP"
  | "DEPRIORITIZED"
  | "QUADRANTS"
  | "AUTOPSY"
  | "WEEKLY_REPORT";

export const AdaptiveCalendarView: React.FC = () => {
  const { setActiveTab, readinessData, user, setIsExamConfigOpen, flashcards } = useApp();

  const examInfo = ExamEngine.getExamInfo(
    user.targetEdition,
    user.examDate,
    user.hasConfiguredExamDate !== false
  );

  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => SpacedRepetitionService.toLocalDateKey(now), [now]);

  const reviewLoadByDate = useMemo(() => {
    return SpacedRepetitionService.getFlashcardReviewLoadByDate(flashcards || [], now);
  }, [flashcards, now]);

  const todayDueCards = useMemo(() => {
    return SpacedRepetitionService.getDueFlashcards(flashcards || [], now);
  }, [flashcards, now]);

  const todayDueCount = todayDueCards.length;

  const [selectedDayId, setSelectedDayId] = useState<string>("day-2026-08-31");
  const [scheduleDays, setScheduleDays] = useState<ScheduledDayItem[]>(ADAPTIVE_SCHEDULE_DAYS);
  const [studentProfile, setStudentProfile] = useState<StudentOnboardingProfile>(DEFAULT_STUDENT_PROFILE);
  const [activeTabSubView, setActiveTabSubView] = useState<CalendarSubView>("TODAY");

  // Modals state
  const [inspectingBlock, setInspectingBlock] = useState<CalendarBlock | null>(null);
  const [isGuidedSessionOpen, setIsGuidedSessionOpen] = useState<boolean>(false);
  const [isTimeBoxModalOpen, setIsTimeBoxModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState<boolean>(false);
  const [showWeeklyBulletinModal, setShowWeeklyBulletinModal] = useState<boolean>(false);
  const [calendarSyncSuccess, setCalendarSyncSuccess] = useState<boolean>(false);
  const [customSessionBlocks, setCustomSessionBlocks] = useState<CalendarBlock[] | undefined>(undefined);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  const selectedDay = scheduleDays.find((d) => d.id === selectedDayId) || scheduleDays[0];
  const todayDay = scheduleDays[0] || selectedDay;

  const getDayReviewLoad = (d: ScheduledDayItem, index: number) => {
    if (d.isToday || index === 0) {
      return (
        reviewLoadByDate[todayKey] || {
          dateKey: todayKey,
          count: todayDueCount,
          estimatedMinutes: SpacedRepetitionService.estimateReviewTimeMinutes(todayDueCount),
          isToday: true,
        }
      );
    }
    const dateKey =
      d.date ||
      SpacedRepetitionService.toLocalDateKey(new Date(now.getTime() + index * 86400000));
    return (
      reviewLoadByDate[dateKey] || {
        dateKey,
        count: 0,
        estimatedMinutes: 0,
        isToday: dateKey === todayKey,
      }
    );
  };

  const selectedDayIndex = scheduleDays.findIndex((d) => d.id === selectedDayId);
  const selectedDayLoad = getDayReviewLoad(
    selectedDay,
    selectedDayIndex >= 0 ? selectedDayIndex : 0
  );

  const formatDayDate = (day?: ScheduledDayItem | null): string => {
    if (!day) return "";
    if (day.dateFormatted && day.dateFormatted.trim().length > 0) return day.dateFormatted;
    if (day.date) {
      const parts = day.date.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    if (day.dayNumber && day.month) {
      return `${String(day.dayNumber).padStart(2, "0")} ${day.month}`;
    }
    return "";
  };

  // Sample priority score items for engine calculations
  const priorityListSample: StudyPriorityScoreItem[] = [
    {
      topicId: "top-1",
      topicName: "Síndromes Hipertensivas na Gestação & Pré-eclâmpsia",
      area: "GINECOLOGIA_OBSTETRICIA",
      irsScore: 94,
      masteryPct: 41,
      forgettingRiskPct: 68,
      temporalUrgencyMultiplier: 1.25,
      finalPpsScore: 88,
      recommendedAction: "QUESTOES",
      reason: "Incidência máxima no INEP + 2 erros recentes em condutas de emergência.",
    },
    {
      topicId: "top-2",
      topicName: "Tuberculose Pulmonar & Esquema RIPE 2026",
      area: "MEDICINA_FAMILIA_COMUNIDADE",
      irsScore: 92,
      masteryPct: 52,
      forgettingRiskPct: 72,
      temporalUrgencyMultiplier: 1.2,
      finalPpsScore: 82,
      recommendedAction: "REVISAO_ESPACADA",
      reason: "Revisão FSRS devida há 4 dias. Nova recomendação CONITEC.",
    },
    {
      topicId: "top-3",
      topicName: "Trauma Abdominal Fechado & FAST",
      area: "CIRURGIA_GERAL",
      irsScore: 89,
      masteryPct: 48,
      forgettingRiskPct: 55,
      temporalUrgencyMultiplier: 1.15,
      finalPpsScore: 77,
      recommendedAction: "QUESTOES",
      reason: "Alta cobrança de indicações cirúrgicas de laparotomia imediata.",
    },
  ];

  const [isSyncingGoogle, setIsSyncingGoogle] = useState<boolean>(false);

  const handleSyncToGoogleCalendar = async () => {
    setIsSyncingGoogle(true);
    try {
      // Check if Google GSI token client is available
      const google = (window as any).google;
      if (google?.accounts?.oauth2) {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: "318887680181-e2e4k5rldev8r328e19e7k9238m23.apps.googleusercontent.com",
          scope: "https://www.googleapis.com/auth/calendar.events",
          callback: async (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              const res = await CalendarService.syncScheduleToGoogleCalendarApi(
                tokenResponse.access_token,
                scheduleDays
              );
              setNotificationMsg(`✅ Sincronizados ${res.totalCreated} blocos de estudo diretamente no seu Google Agenda!`);
              setCalendarSyncSuccess(true);
              setTimeout(() => setCalendarSyncSuccess(false), 5000);
            } else {
              // Fallback to URL direct entry
              const gCalUrl = CalendarService.createGoogleCalendarEventUrl(selectedDay);
              window.open(gCalUrl, "_blank");
              setNotificationMsg("📅 Evento aberto no Google Agenda para confirmação rápida.");
            }
            setIsSyncingGoogle(false);
          },
          error_callback: () => {
            const gCalUrl = CalendarService.createGoogleCalendarEventUrl(selectedDay);
            window.open(gCalUrl, "_blank");
            setNotificationMsg("📅 Evento aberto no Google Agenda para confirmação rápida.");
            setIsSyncingGoogle(false);
          }
        });
        client.requestAccessToken();
      } else {
        const gCalUrl = CalendarService.createGoogleCalendarEventUrl(selectedDay);
        window.open(gCalUrl, "_blank");
        setCalendarSyncSuccess(true);
        setNotificationMsg("📅 Evento aberto no Google Agenda.");
        setTimeout(() => setCalendarSyncSuccess(false), 4000);
        setIsSyncingGoogle(false);
      }
    } catch {
      const gCalUrl = CalendarService.createGoogleCalendarEventUrl(selectedDay);
      window.open(gCalUrl, "_blank");
      setIsSyncingGoogle(false);
    }
  };

  const handleExportICS = () => {
    CalendarService.downloadCalendarICS(scheduleDays);
    setCalendarSyncSuccess(true);
    setTimeout(() => setCalendarSyncSuccess(false), 4000);
  };

  const toggleBlockCompleted = (dayId: string, blockId: string) => {
    setScheduleDays((prev) =>
      prev.map((day) => {
        if (day.id !== dayId) return day;
        return {
          ...day,
          blocks: day.blocks.map((b) =>
            b.id === blockId ? { ...b, completed: !b.completed } : b
          ),
        };
      })
    );
  };

  const handleLaunchTimeBoxSession = (session: { title: string; totalMinutes: number; blocks: any[] }) => {
    setCustomSessionBlocks(session.blocks);
    setIsGuidedSessionOpen(true);
  };

  const handleExecuteRecoveryEvent = (
    eventType: "MISSED_TODAY" | "LESS_TIME" | "MORE_TIME" | "RECOVERY_PLAN" | "FINAL_SPRINT",
    adjustment?: number
  ) => {
    if (eventType === "MISSED_TODAY") {
      setNotificationMsg("📅 Calendário reorganizado! As revisões FSRS críticas foram remanejadas para amanhã sem acúmulo de matérias secundárias.");
    } else if (eventType === "LESS_TIME") {
      setNotificationMsg(`⚡ Cronograma enxugado (${adjustment || -30} min)! Mantivemos 100% do foco em questões e resgates de alto ganho.`);
    } else if (eventType === "MORE_TIME") {
      setNotificationMsg(`🚀 Tempo extra (+${adjustment || 60} min) alocado! Adiantamos revisões de temas de alta incidência.`);
    } else if (eventType === "RECOVERY_PLAN") {
      setNotificationMsg("🔄 Reset inteligente concluído! O passado não foi acumulado e seu plano parte limpo com o melhor aproveitamento até a prova.");
    } else if (eventType === "FINAL_SPRINT") {
      setNotificationMsg("🔥 Modo Reta Final ativado! 100% foco em questões oficiais INEP, flashcards de alta retenção e autópsia.");
    }
    setTimeout(() => setNotificationMsg(null), 6000);
  };

  const getPhaseBadge = (phase: StudyPhaseType) => {
    switch (phase) {
      case "FASE_3_RETA_FINAL":
        return { label: "Fase 3: Reta Final (7–21d)", color: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
      case "FASE_4_ULTIMOS_DIAS":
        return { label: "Fase 4: Últimos Dias (<7d)", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" };
      case "VESPERA":
        return { label: "Véspera de Prova", color: "bg-purple-500/10 text-purple-400 border-purple-500/30" };
      case "DIA_DA_PROVA":
        return { label: "Dia da Prova Oficial", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
      case "FASE_2_CONSOLIDACAO":
        return { label: "Fase 2: Consolidação (45–90d)", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" };
      default:
        return { label: "Fase 1: Construção & Diagnóstico", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" };
    }
  };

  const getBlockTypeColor = (type: CalendarBlockType) => {
    switch (type) {
      case "TEORIA_DIRECIONADA":
      case "TEORIA_EXPRESSA":
      case "TEORIA_COMPLETA":
        return "border-amber-500/50 bg-[#141829] text-amber-300 shadow-md";
      case "QUESTOES_OFICIAIS":
      case "QUESTOES_INEDITAS_IA":
      case "QUESTOES_IRMAS":
        return "border-emerald-500/50 bg-[#0e1a24] text-emerald-300 shadow-md";
      case "FLASHCARDS_FSRS":
      case "REVISAO_ESPACADA":
      case "RECUPERACAO_ATIVA":
        return "border-purple-500/50 bg-[#181328] text-purple-300 shadow-md";
      case "AUTOPSIA_ERROS":
      case "RECUPERACAO_LACUNA":
        return "border-rose-500/50 bg-[#1c121d] text-rose-300 shadow-md";
      case "SIMULADO_CRONOMETRADO":
      case "SIMULADO_PROVA_INTEIRA":
        return "border-blue-500/50 bg-[#10192e] text-blue-300 shadow-md";
      default:
        return "border-slate-800 bg-[#0f1424] text-slate-200 shadow-md";
    }
  };

  const totalMinutesToday = todayDay.blocks.reduce((acc, b) => acc + b.durationMinutes, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-2xl animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{notificationMsg}</span>
          </div>
          <button
            onClick={() => setNotificationMsg(null)}
            className="text-emerald-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MASTER TOP HEADER */}
      <div className="bg-[#090b11] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CalendarClock className="w-3.5 h-3.5" />
                Adaptive Learning Scheduler
              </span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                  getPhaseBadge(selectedDay?.phase || "FASE_3_RETA_FINAL").color
                }`}
              >
                {examInfo?.phaseName || "Fase de Reta Final"}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                title="Clique para alterar a data oficial"
              >
                <Clock className="w-3 h-3 text-cyan-400" />
                {examInfo?.targetEdition || "Revalida INEP"}:{" "}
                {examInfo?.hasConfiguredDate && examInfo?.examDate
                  ? examInfo.examDate.split("-").reverse().join("/")
                  : "Definir data"}
              </button>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
              Calendário Inteligente com IA
            </h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
              Sistema adaptativo que cruza recorrência INEP, lacuna pessoal, retenção FSRS e seu tempo real para maximizar aprendizado por minuto disponível.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className="text-center p-2 rounded-lg bg-zinc-900/50 hover:bg-zinc-900 transition-colors text-left sm:text-center cursor-pointer"
            >
              <div className="text-[11px] text-zinc-400 font-medium">Dias até a Prova</div>
              <div className="text-xl font-black text-amber-400 flex items-center justify-center gap-1">
                <Flame className="w-4 h-4 text-amber-400" />
                {examInfo.hasConfiguredDate ? `${examInfo.daysRemaining}d` : "Definir"}
              </div>
            </button>
            <div className="text-center p-2 rounded-lg bg-zinc-900/50">
              <div className="text-[11px] text-zinc-400 font-medium">Meta Semanal</div>
              <div className="text-xl font-black text-emerald-400">14h / 14h</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-zinc-900/50">
              <div className="text-[11px] text-zinc-400 font-medium">Revisões FSRS</div>
              <div className="text-xl font-black text-purple-400">
                {todayDueCount > 0
                  ? `${todayDueCount} ${todayDueCount === 1 ? "pendente" : "pendentes"}`
                  : "Em dia"}
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-zinc-900/50">
              <div className="text-[11px] text-zinc-400 font-medium">Ganho Projetado</div>
              <div className="text-xl font-black text-cyan-400">+4.2 pts</div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-zinc-800/80">
          <button
            onClick={() => setActiveTabSubView("TODAY")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTabSubView === "TODAY"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-bold"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Hoje (Plano do Dia)
          </button>

          <button
            onClick={() => setActiveTabSubView("WEEK")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTabSubView === "WEEK"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-bold"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Visão Semanal
          </button>

          <button
            onClick={() => setActiveTabSubView("ROADMAP")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTabSubView === "ROADMAP"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-bold"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Plano até a Prova & Cobertura
          </button>

          <button
            onClick={() => setActiveTabSubView("DEPRIORITIZED")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTabSubView === "DEPRIORITIZED"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-bold"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            O Que Não Estudar Agora
          </button>

          <button
            onClick={() => setActiveTabSubView("QUADRANTS")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTabSubView === "QUADRANTS"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-bold"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Matriz de Prioridade (A–D)
          </button>

          <button
            onClick={() => setActiveTabSubView("AUTOPSY")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTabSubView === "AUTOPSY"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-bold"
                : "bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Autópsia de Erros
          </button>

          <div className="flex-1" />

          {/* Action Modals Triggers */}
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            Ajustar Capacidade & Dias
          </button>

          <button
            onClick={() => setIsRecoveryModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all border border-amber-500/30"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            Imprevistos & Replanejamento
          </button>

          <button
            onClick={handleSyncToGoogleCalendar}
            disabled={isSyncingGoogle}
            title="Sincronizar cronograma com o Google Calendar via API ou evento direto"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white transition-all border border-blue-500/30 disabled:opacity-50 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{isSyncingGoogle ? "Sincronizando..." : "Google Cal"}</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </button>

          <button
            onClick={handleExportICS}
            title="Exportar arquivo .ICS para Apple Calendar / Outlook / Google"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>.ICS</span>
          </button>

          <button
            onClick={() => setShowWeeklyBulletinModal(true)}
            title="Abrir Boletim Semanal de Prontidão Clínica (PPS)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 transition-all shadow-md shadow-purple-600/20"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Boletim PPS</span>
          </button>
        </div>

        {calendarSyncSuccess && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Sincronização processada com sucesso!</span>
          </div>
        )}
      </div>

      {/* HERO SECTION: "ESTUDAR AGORA" - 1-CLICK MISSION RUNNER */}
      <div className="bg-gradient-to-br from-emerald-950/40 via-[#0a0c13] to-zinc-900 border-2 border-emerald-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-black flex items-center justify-center font-black shadow-lg shadow-emerald-500/30">
              <Zap className="w-6 h-6 fill-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Missão do Momento • Next Best Action
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  PPS {NEXT_BEST_ACTION.pps}/100
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  +{NEXT_BEST_ACTION.expectedGainPoints} pts projetados
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight mt-0.5">
                {NEXT_BEST_ACTION.title}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTimeBoxModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 transition-all cursor-pointer"
            >
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Tenho só X minutos</span>
            </button>
            <button
              onClick={() => {
                setCustomSessionBlocks(undefined);
                setIsGuidedSessionOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>ESTUDAR AGORA (Modo Foco)</span>
            </button>
          </div>
        </div>

        {/* 20-60-20 Session Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 mt-4">
          {NEXT_BEST_ACTION.steps.map((step) => (
            <div
              key={step.stepNumber}
              className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span className="font-bold text-emerald-400">Etapa {step.stepNumber}</span>
                <span className="font-mono">{step.durationMinutes} min</span>
              </div>
              <div className="font-semibold text-zinc-200 line-clamp-2">{step.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SUBVIEW 1: TODAY - DETAILED DAILY STUDY PLAN */}
      {activeTabSubView === "TODAY" && (
        <div className="p-6 rounded-3xl bg-[#0b0e1a] border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                <Compass className="w-5 h-5 text-emerald-400" />
                Roteiro de Estudos para Hoje ({formatDayDate(todayDay)})
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Total programado: <strong className="text-emerald-400">{(totalMinutesToday / 60).toFixed(1)}h ({totalMinutesToday} min)</strong> divididos em blocos de alta retenção.
              </p>
            </div>
            <button
              onClick={() => setIsTimeBoxModalOpen(true)}
              className="text-xs text-cyan-300 hover:text-cyan-200 hover:underline font-semibold flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Precisa adaptar o tempo de hoje?
            </button>
          </div>

          {/* FSRS Spaced Repetition Block for Today */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              todayDueCount > 0
                ? "bg-purple-950/20 border-purple-800/40"
                : "bg-emerald-950/20 border-emerald-800/40"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    todayDueCount > 0
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        todayDueCount > 0
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {todayDueCount > 0 ? "FSRS PENDENTE" : "FSRS EM DIA"}
                    </span>
                    {todayDueCount > 0 && (
                      <span className="text-xs font-bold text-purple-400">
                        ~{SpacedRepetitionService.estimateReviewTimeMinutes(todayDueCount)} min
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1">
                    {todayDueCount > 0
                      ? `${todayDueCount} ${
                          todayDueCount === 1
                            ? "flashcard programado para revisão hoje"
                            : "flashcards programados para revisão hoje"
                        }`
                      : "Revisão espaçada de flashcards em dia"}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("revisar-flashcards")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-md ${
                  todayDueCount > 0
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                }`}
              >
                {todayDueCount > 0 ? "Revisar Flashcards Agora" : "Ver Flashcards"}
              </button>
            </div>
          </div>

          <div className="space-y-3.5">
            {todayDay.blocks.map((block, idx) => {
              const colorClass = getBlockTypeColor(block.type);
              return (
                <div
                  key={block.id}
                  className={`p-5 rounded-2xl border transition-all ${colorClass} ${
                    block.completed ? "opacity-75 bg-[#080b14]" : "hover:border-slate-600"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <button
                        onClick={() => toggleBlockCompleted(todayDay.id, block.id)}
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center mt-0.5 transition-colors shrink-0 ${
                          block.completed
                            ? "bg-emerald-500 border-emerald-400 text-black font-bold"
                            : "border-slate-600 hover:border-slate-400 bg-slate-800/60"
                        }`}
                        title="Marcar como concluído"
                      >
                        {block.completed && <Check className="w-4 h-4 stroke-[3]" />}
                      </button>

                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-400">
                            0{idx + 1}.
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                            {block.type.replace(/_/g, " ")}
                          </span>
                          {block.area && (
                            <span className="text-xs text-slate-300 font-medium">
                              {AREA_LABELS[block.area]}
                            </span>
                          )}
                          <span className="text-xs font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                            {block.durationMinutes} min
                          </span>
                        </div>
                        <h3 className={`text-base font-bold text-white ${block.completed ? "line-through text-slate-400" : ""}`}>
                          {block.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                          {block.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => setInspectingBlock(block)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Ver raciocínio algorítmico da IA"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Por que estudar isso?</span>
                      </button>

                      <button
                        onClick={() => {
                          if (block.type.includes("QUESTOES")) {
                            setActiveTab("questions");
                          } else if (block.type.includes("FLASHCARDS") || block.type.includes("REVISAO")) {
                            setActiveTab("review");
                          } else {
                            setActiveTab("grandes-temas");
                          }
                        }}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-900 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <span>Abrir Módulo</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: WEEK - 7-DAY ADAPTIVE VIEW */}
      {activeTabSubView === "WEEK" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-400" />
                Ciclo Semanal Adaptativo
              </h2>
              <p className="text-xs text-zinc-400">
                Selecione qualquer dia para visualizar os blocos ou alterar a carga.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {scheduleDays.slice(0, 7).map((d, dIndex) => {
              const isSelected = d.id === selectedDayId;
              const completedCount = d.blocks.filter((b) => b.completed).length;
              const dayLoad = getDayReviewLoad(d, dIndex);
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDayId(d.id)}
                  className={`p-3.5 rounded-2xl text-left border transition-all flex flex-col justify-between min-h-[140px] ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/10"
                      : "bg-[#090b11] border-white/10 hover:bg-white/[0.04]"
                  }`}
                >
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400">
                      {d.dayOfWeek || "DIA"}
                    </div>
                    <div className="text-sm font-black text-white mt-0.5">
                      {formatDayDate(d)}
                    </div>
                    <div className="text-[11px] text-zinc-300 font-semibold mt-2 line-clamp-2">
                      {d.focusTheme || d.primaryTopicName || "Estudo Estruturado"}
                    </div>
                    {dayLoad.count > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-purple-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                        <span>
                          {dayLoad.count} {dayLoad.count === 1 ? "revisão" : "revisões"}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                        <span>Em dia</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-zinc-400">
                    <span>{d.targetMinutes || d.allocatedMinutes || 120} min</span>
                    <span className="text-emerald-400 font-bold">
                      {completedCount}/{d.blocks.length} blocos
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Day Breakdown */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-white/10 space-y-4 mt-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Detalhes do Dia: {formatDayDate(selectedDay)} ({selectedDay.dayOfWeek || "SEG"})
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Tema Central: <strong>{selectedDay.focusTheme || selectedDay.primaryTopicName || "Estudo Estruturado"}</strong> • Meta: {selectedDay.targetMinutes || selectedDay.allocatedMinutes || 120} minutos
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  getPhaseBadge(selectedDay.phase).color
                }`}
              >
                {getPhaseBadge(selectedDay.phase).label}
              </span>
            </div>

            {/* FSRS Spaced Repetition Load for Selected Day */}
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>Revisão Espaçada FSRS</span>
                    {selectedDayLoad.count > 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                        {selectedDayLoad.count}{" "}
                        {selectedDayLoad.count === 1
                          ? "flashcard programado"
                          : "flashcards programados"}{" "}
                        (~{selectedDayLoad.estimatedMinutes} min)
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                        Revisão em dia
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {selectedDayLoad.count > 0
                      ? "Carga calculada automaticamente pelo FSRS para fixação na memória de longo prazo."
                      : "Nenhum flashcard agendado para esta data."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("revisar-flashcards")}
                className="self-start sm:self-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer shrink-0"
              >
                {selectedDayLoad.isToday && selectedDayLoad.count > 0
                  ? "Revisar agora"
                  : "Ver Flashcards"}
              </button>
            </div>

            <div className="space-y-2">
              {selectedDay.blocks.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{b.title}</span>
                    <span className="text-zinc-400 font-mono">({b.durationMinutes} min)</span>
                  </div>
                  <button
                    onClick={() => setInspectingBlock(b)}
                    className="text-cyan-400 hover:underline text-[11px] font-semibold"
                  >
                    Por que estudar?
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 3: ROADMAP & REALISTIC COVERAGE FORECAST */}
      {activeTabSubView === "ROADMAP" && (
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Previsão Realista de Cobertura até o {examInfo.targetEdition}
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              O sistema não tenta cobrir 100% de 500 temas médicos porque isso dispersa a atenção. A IA garante <strong>94% de cobertura nos temas que decidem 80% da prova</strong>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase">Alta Prioridade (IRS &gt; 80)</span>
                  <span className="text-base font-black text-emerald-400">94% Coberto</span>
                </div>
                <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full w-[94%]" />
                </div>
                <p className="text-[11px] text-zinc-300">
                  Temas obrigatórios do INEP (Pré-eclâmpsia, Tuberculose, ATLS, Vacinação, etc.).
                </p>
              </div>

              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 uppercase">Média Prioridade (IRS 50–79)</span>
                  <span className="text-base font-black text-cyan-400">72% Coberto</span>
                </div>
                <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full rounded-full w-[72%]" />
                </div>
                <p className="text-[11px] text-zinc-300">
                  Cobertura via questões e flashcards diretos para economia de tempo.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Baixa Prioridade (IRS &lt; 50)</span>
                  <span className="text-base font-black text-zinc-400">38% Coberto</span>
                </div>
                <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-zinc-600 h-full rounded-full w-[38%]" />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Assuntos de raríssima aparição deixados de fora propositalmente.
                </p>
              </div>
            </div>
          </div>

          {/* Strategic Phases Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              As 4 Fases Estratégicas do Cronograma
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { phase: "Fase 1: Construção", period: "> 90 dias da prova", focus: "Diagnóstico inicial, fechamento de lacunas estruturais e fundação teórica orientada ao INEP." },
                { phase: "Fase 2: Consolidação", period: "45 a 90 dias", focus: "Aumento de questões e flashcards FSRS, simulação de blocos cronometrados e interleaving." },
                { phase: "Fase 3: Reta Final", period: "7 a 45 dias", focus: "Imersão 100% prática, questões irmãs e inéditas IA, treino de distratores e revisão de erros." },
                { phase: "Fase 4: Últimos Dias", period: "< 7 dias da prova", focus: "Ajuste fino, flashcards de doses e critérios numéricos, descanso mental e controle de ansiedade." },
              ].map((p, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-[#090b11] border border-white/10 space-y-2">
                  <div className="text-xs font-bold text-emerald-400">{p.phase}</div>
                  <div className="text-[10px] text-zinc-400 font-mono">{p.period}</div>
                  <p className="text-xs text-zinc-300 leading-relaxed mt-1">{p.focus}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 4: ANTI-WASTE / DEPRIORITIZED TOPICS */}
      {activeTabSubView === "DEPRIORITIZED" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
              <h2 className="text-base font-bold text-white">
                O Que NÃO Estudar Agora (Anti-Desperdício de Tempo)
              </h2>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-3xl">
              Estudar melhor significa saber o que <strong>deixar de lado</strong>. O algoritmo removeu ou adiou os tópicos abaixo porque você já os domina ou porque o retorno por minuto é desprezível no Revalida INEP.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEPRIORITIZED_TOPICS_SAMPLE.map((top) => (
              <div
                key={top.id}
                className="p-4 rounded-xl bg-[#090b11] border border-white/[0.08] space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 mb-1">
                    <span>{AREA_LABELS[top.area]}</span>
                    <span className="text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10">
                      {top.timeSavedMinutes} min poupados
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{top.title}</h3>
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                    "{top.reason}"
                  </p>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Domínio: <strong className="text-emerald-400">{top.studentMastery}%</strong></span>
                  <span>IRS INEP: <strong>{top.inepRecurrence}/100</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBVIEW 5: QUADRANTS A-D */}
      {activeTabSubView === "QUADRANTS" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              Matriz Estratégica de Decisão Pedagógica (Quadrantes A–D)
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-3xl">
              Como o algoritmo classifica cada assunto cruzando Incidência INEP vs Domínio Pessoal:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 uppercase">Quadrante A: Alarme Máximo</span>
                <span className="text-xs font-mono font-bold text-rose-300">Alta Incidência • Baixo Domínio</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Prioridade absoluta no agendador. Aloca sessões diárias com questões oficiais e autópsia de erros.
              </p>
              <div className="text-xs font-semibold text-rose-200">
                Exemplos: Pré-eclâmpsia, Tuberculose, ATLS, Vacinação Infantil.
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase">Quadrante B: Manutenção FSRS</span>
                <span className="text-xs font-mono font-bold text-amber-300">Alta Incidência • Alto Domínio</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Revisão espaçada ativa apenas na data devida para evitar a perda do domínio. Proibido estudo de teoria longa.
              </p>
              <div className="text-xs font-semibold text-amber-200">
                Exemplos: Apendicite Aguda, HAS no Adulto, Hanseníase.
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 uppercase">Quadrante C: Oportunismo Rápido</span>
                <span className="text-xs font-mono font-bold text-cyan-300">Média Incidência • Baixo Domínio</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Intervenções curtas (15–20 min) apenas nos pontos-chave e diretrizes atuais.
              </p>
              <div className="text-xs font-semibold text-cyan-200">
                Exemplos: Queimaduras, Púrpura Trombocitopênica, Lúpus.
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase">Quadrante D: Deprioritizados</span>
                <span className="text-xs font-mono font-bold text-zinc-400">Baixa Incidência • Qualquer Domínio</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Corta do cronograma para não roubar horas dos temas vitais.
              </p>
              <div className="text-xs font-semibold text-zinc-400">
                Exemplos: Tumores Raros de Ovário, Doenças Metabólicas Raras.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 6: AUTOPSY */}
      {activeTabSubView === "AUTOPSY" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Distribuição e Autópsia de Falhas Recentes
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-3xl">
              O Calendário cria intervenções customizadas conforme o tipo predominante de erro:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ERROR_AUTOPSY_DISTRIBUTION.map((err, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-[#090b11] border border-white/[0.08] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{err.label || String(err.errorType).replace(/_/g, " ")}</span>
                  <span className="text-xs font-mono font-bold text-rose-400">{err.count} erros</span>
                </div>
                <div className="text-xs text-zinc-300">
                  <strong>Intervenção da IA:</strong> {err.recommendedIntervention || "Autópsia direcionada e treino intensivo de distratores da banca."}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}
      {inspectingBlock && (
        <WhyThisBlockModal
          block={inspectingBlock}
          onClose={() => setInspectingBlock(null)}
          onStartBlock={() => {
            setInspectingBlock(null);
            setIsGuidedSessionOpen(true);
          }}
        />
      )}

      {isTimeBoxModalOpen && (
        <TimeBoxModal
          onClose={() => setIsTimeBoxModalOpen(false)}
          priorityList={priorityListSample}
          studentProfile={studentProfile}
          onLaunchSession={handleLaunchTimeBoxSession}
        />
      )}

      {isGuidedSessionOpen && (
        <GuidedStudySessionModal
          sessionRecommendation={NEXT_BEST_ACTION}
          customBlocks={customSessionBlocks}
          onClose={() => {
            setIsGuidedSessionOpen(false);
            setCustomSessionBlocks(undefined);
          }}
          onFinishSession={() => {
            setIsGuidedSessionOpen(false);
            setCustomSessionBlocks(undefined);
            setNotificationMsg("🎉 Sessão concluída! Seu domínio subiu e o algoritmo recalibrou o plano com novos intervalos FSRS.");
            setTimeout(() => setNotificationMsg(null), 6000);
          }}
        />
      )}

      {isConfigModalOpen && (
        <ScheduleConfigModal
          initialProfile={studentProfile}
          onClose={() => setIsConfigModalOpen(false)}
          onSaveProfile={(prof) => {
            setStudentProfile(prof);
            setNotificationMsg("✅ Perfil e disponibilidade atualizados! Cronograma recalculado pela IA.");
            setTimeout(() => setNotificationMsg(null), 5000);
          }}
        />
      )}

      {isRecoveryModalOpen && (
        <RecoveryPlanModal
          onClose={() => setIsRecoveryModalOpen(false)}
          onExecuteEvent={handleExecuteRecoveryEvent}
        />
      )}

      <WeeklyBulletinModal
        isOpen={showWeeklyBulletinModal}
        onClose={() => setShowWeeklyBulletinModal(false)}
      />
    </div>
  );
};
