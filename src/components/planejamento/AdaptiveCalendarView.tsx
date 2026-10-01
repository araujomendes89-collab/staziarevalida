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
  Layers,
  ChevronRight,
  Info,
  Sliders,
  X,
  Compass,
  CalendarDays,
  Flame,
  Check,
  Download,
  ExternalLink,
  Mail,
  CalendarClock,
  BookOpen,
  EyeOff,
  MoreHorizontal,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  ADAPTIVE_SCHEDULE_DAYS,
  DEFAULT_STUDENT_PROFILE,
  NEXT_BEST_ACTION,
  ERROR_AUTOPSY_DISTRIBUTION,
  DEPRIORITIZED_TOPICS_SAMPLE,
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
import { StudyPriorityScoreItem } from "../../services/studyPlannerEngine";
import { WeeklyBulletinModal } from "./WeeklyBulletinModal";
import { WhyThisBlockModal } from "./WhyThisBlockModal";
import { TimeBoxModal } from "./TimeBoxModal";
import { GuidedStudySessionModal } from "./GuidedStudySessionModal";
import { ScheduleConfigModal } from "./ScheduleConfigModal";
import { RecoveryPlanModal } from "./RecoveryPlanModal";
import { FeatureGate } from "../common/FeatureGate";

const AREA_LABELS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina Preventiva & SUS",
};

export type CalendarSubView =
  | "TODAY"
  | "WEEK"
  | "ROADMAP"
  | "DEPRIORITIZED"
  | "QUADRANTS"
  | "AUTOPSY";

export const AdaptiveCalendarView: React.FC = () => {
  const { setActiveTab, user, flashcards } = useApp();

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
  const [isOptionsOpen, setIsOptionsOpen] = useState<boolean>(false);

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
  const [isSyncingGoogle, setIsSyncingGoogle] = useState<boolean>(false);

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

  const priorityListSample: StudyPriorityScoreItem[] = [
    {
      topicId: "cm-01",
      topicName: "Hipertensão Arterial e Emergências",
      area: "CLINICA_MEDICA",
      irsScore: 95,
      masteryPct: 45,
      forgettingRiskPct: 65,
      temporalUrgencyMultiplier: 1.1,
      finalPpsScore: 88,
      recommendedAction: "QUESTOES",
      reason: "Alta incidência histórica no Revalida INEP.",
    },
  ];

  const handleSyncToGoogleCalendar = async () => {
    setIsSyncingGoogle(true);
    try {
      const gCalUrl = CalendarService.createGoogleCalendarEventUrl(selectedDay);
      window.open(gCalUrl, "_blank");
      setCalendarSyncSuccess(true);
      setNotificationMsg("📅 Evento aberto no Google Agenda para confirmação rápida.");
      setTimeout(() => setCalendarSyncSuccess(false), 4000);
      setIsSyncingGoogle(false);
    } catch {
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
      setNotificationMsg("📅 Calendário reorganizado! Revisões remanejadas sem sobrecarga.");
    } else if (eventType === "LESS_TIME") {
      setNotificationMsg(`⚡ Cronograma enxugado (${adjustment || -30} min)! Foco em alto ganho.`);
    } else if (eventType === "MORE_TIME") {
      setNotificationMsg(`🚀 Tempo extra (+${adjustment || 60} min) alocado para temas de alta incidência.`);
    } else if (eventType === "RECOVERY_PLAN") {
      setNotificationMsg("🔄 Reset concluído! O plano parte limpo com o melhor aproveitamento.");
    } else if (eventType === "FINAL_SPRINT") {
      setNotificationMsg("🔥 Modo Reta Final ativado! 100% foco em questões oficiais e revisão.");
    }
    setTimeout(() => setNotificationMsg(null), 6000);
  };

  const totalMinutesToday = todayDay.blocks.reduce((acc, b) => acc + b.durationMinutes, 0);

  return (
    <FeatureGate
      feature="smart_schedule"
      title="Cronograma Inteligente & Calendário Adaptativo"
      description="O cronograma inteligente de estudos com reorganização automática de blocos e cálculo de prioridade é um recurso dos planos Stazia PRO e Elite."
    >
      <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notificationMsg}</span>
          </div>
          <button
            onClick={() => setNotificationMsg(null)}
            className="text-emerald-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* COMPACT CLEAN HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50" />
            <span>Calendário de Estudos</span>
          </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{examInfo?.targetEdition || "Revalida INEP"}</span>
            <span>•</span>
              <span className="text-emerald-700 font-semibold">
              {examInfo.hasConfiguredDate ? `${examInfo.daysRemaining} dias para a prova` : "Data a definir"}
            </span>
            <span>•</span>
            <span>14h planejadas na semana</span>
            <span>•</span>
              <span className={todayDueCount > 0 ? "text-purple-700 font-medium" : "text-slate-500"}>
              {todayDueCount > 0 ? `${todayDueCount} ${todayDueCount === 1 ? "revisão" : "revisões"} hoje` : "Revisão em dia"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ajustar disponibilidade</span>
          </button>
        </div>
      </div>

      {/* HERO: PLANO DE HOJE (SINGLE DOMINANT PRIMARY CTA) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Plano de Hoje
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              {formatDayDate(todayDay)}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            {todayDay.focusTheme || todayDay.primaryTopicName || "Estudo Estruturado"}
          </h2>
          <p className="text-xs text-zinc-400">
            {(totalMinutesToday / 60).toFixed(1)}h programadas • {todayDay.blocks.length} blocos de estudo
            {todayDueCount > 0 && ` • ${todayDueCount} revisões espaçadas`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => setIsTimeBoxModalOpen(true)}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer text-left sm:text-right"
          >
            Tenho menos tempo hoje →
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomSessionBlocks(undefined);
              setIsGuidedSessionOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Começar Plano de Hoje</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW SELECTOR + MORE OPTIONS DROPDOWN */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTabSubView("TODAY")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTabSubView === "TODAY"
                ? "bg-emerald-600 text-white shadow-xs font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setActiveTabSubView("WEEK")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTabSubView === "WEEK"
                ? "bg-emerald-600 text-white shadow-xs font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Visão Semanal
          </button>
        </div>

        {/* Secondary options dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOptionsOpen(!isOptionsOpen)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MoreHorizontal className="w-4 h-4 text-zinc-400" />
            <span>Mais opções</span>
          </button>

          {isOptionsOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-30 space-y-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setIsRecoveryModalOpen(true);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 text-amber-300 flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Replanejar Imprevistos</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  handleSyncToGoogleCalendar();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 flex items-center gap-2 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Sincronizar Google Agenda</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  handleExportICS();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Exportar .ICS</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setShowWeeklyBulletinModal(true);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 text-purple-300 flex items-center gap-2 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-purple-400" />
                <span>Boletim de Prontidão (PPS)</span>
              </button>
              <div className="border-t border-zinc-800 my-1" />
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setActiveTabSubView("ROADMAP");
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white flex items-center gap-2 cursor-pointer text-[11px]"
              >
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span>Previsão de Cobertura</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setActiveTabSubView("QUADRANTS");
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white flex items-center gap-2 cursor-pointer text-[11px]"
              >
                <Target className="w-3 h-3 text-cyan-400" />
                <span>Matriz de Prioridade</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setActiveTabSubView("DEPRIORITIZED");
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white flex items-center gap-2 cursor-pointer text-[11px]"
              >
                <EyeOff className="w-3 h-3 text-zinc-400" />
                <span>O Que Não Estudar Agora</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  setActiveTabSubView("AUTOPSY");
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white flex items-center gap-2 cursor-pointer text-[11px]"
              >
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>Autópsia de Falhas</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 1. SUBVIEW TODAY: CLEAN ROTEIRO DO DIA */}
      {activeTabSubView === "TODAY" && (
        <div className="space-y-4">
          {/* Flashcards load if due */}
          {todayDueCount > 0 && (
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    {todayDueCount} {todayDueCount === 1 ? "flashcard para revisão" : "flashcards para revisão hoje"}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Fixação espaçada calculada para retenção de 90%.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("revisar-flashcards")}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer self-start sm:self-center"
              >
                Revisar Flashcards
              </button>
            </div>
          )}

          {/* Daily study blocks */}
          <div className="space-y-2.5">
            {todayDay.blocks.map((block, idx) => (
              <div
                key={block.id}
                className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleBlockCompleted(todayDay.id, block.id)}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 transition-colors shrink-0 cursor-pointer ${
                      block.completed
                        ? "bg-emerald-500 border-emerald-400 text-black font-bold"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                    }`}
                  >
                    {block.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-500 text-[10px]">0{idx + 1}</span>
                      <span className="font-bold text-white">{block.title}</span>
                      {block.area && (
                        <span className="text-[10px] text-zinc-400 font-medium">
                          ({AREA_LABELS[block.area]})
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug line-clamp-1">
                      {block.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-zinc-400 font-mono text-[11px]">{block.durationMinutes} min</span>
                  <button
                    type="button"
                    onClick={() => setInspectingBlock(block)}
                    className="text-zinc-400 hover:text-white text-[11px] font-medium cursor-pointer"
                  >
                    Por que este tema?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (block.type.includes("QUESTOES")) setActiveTab("questions");
                      else if (block.type.includes("FLASHCARDS")) setActiveTab("review");
                      else setActiveTab("grandes-temas");
                    }}
                    className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-[11px] transition-colors cursor-pointer"
                  >
                    Abrir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SUBVIEW WEEK: COMPACT 7-DAY OVERVIEW */}
      {activeTabSubView === "WEEK" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {scheduleDays.slice(0, 7).map((d, dIndex) => {
              const isSelected = d.id === selectedDayId;
              const completedCount = d.blocks.filter((b) => b.completed).length;
              const dayLoad = getDayReviewLoad(d, dIndex);
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDayId(d.id)}
                  className={`p-3.5 rounded-2xl text-left border transition-all flex flex-col justify-between min-h-[140px] cursor-pointer ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/10"
                      : "bg-zinc-950 border-zinc-800/80 hover:bg-zinc-900/50"
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

          {/* Selected Day Details */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-sm font-bold text-white">
                {formatDayDate(selectedDay)} ({selectedDay.dayOfWeek || "SEG"}) • {selectedDay.focusTheme || selectedDay.primaryTopicName}
              </h3>
              <span className="text-xs text-zinc-400">
                Meta: {selectedDay.targetMinutes || 120} min
              </span>
            </div>
            <div className="space-y-2">
              {selectedDay.blocks.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-zinc-200">{b.title}</span>
                  <span className="text-zinc-400 font-mono">{b.durationMinutes} min</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. SUBVIEW ROADMAP & COVERAGE */}
      {activeTabSubView === "ROADMAP" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Previsão de Cobertura dos Grandes Temas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <div className="text-xs font-bold text-emerald-400">Alta Prioridade (IRS &gt; 80)</div>
                <div className="text-xl font-black text-emerald-300">94% Coberto</div>
              </div>
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-1">
                <div className="text-xs font-bold text-cyan-400">Média Prioridade (IRS 50–79)</div>
                <div className="text-xl font-black text-cyan-300">72% Coberto</div>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="text-xs font-bold text-zinc-400">Baixa Prioridade (IRS &lt; 50)</div>
                <div className="text-xl font-black text-zinc-300">38% Coberto</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SUBVIEW DEPRIORITIZED */}
      {activeTabSubView === "DEPRIORITIZED" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-zinc-400" />
              O Que Não Estudar Agora
            </h2>
            <p className="text-xs text-zinc-400">
              Assuntos com baixo custo-benefício para economizar seu tempo de estudo.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEPRIORITIZED_TOPICS_SAMPLE.map((top) => (
              <div key={top.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 text-xs">
                <div className="text-emerald-400 font-semibold">{top.timeSavedMinutes} min poupados</div>
                <h3 className="font-bold text-white">{top.title}</h3>
                <p className="text-zinc-400 text-[11px]">"{top.reason}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. SUBVIEW QUADRANTS */}
      {activeTabSubView === "QUADRANTS" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              Matriz Estratégica de Prioridade
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
              <span className="font-bold text-rose-400">Quadrante A (Prioridade Máxima)</span>
              <p className="text-zinc-300 text-[11px]">Alta incidência na prova com necessidade de ganho de domínio.</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-1">
              <span className="font-bold text-amber-400">Quadrante B (Manutenção)</span>
              <p className="text-zinc-300 text-[11px]">Revisão espaçada ativa para reter temas dominados.</p>
            </div>
          </div>
        </div>
      )}

      {/* 6. SUBVIEW AUTOPSY */}
      {activeTabSubView === "AUTOPSY" && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Autópsia de Falhas Recentes
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ERROR_AUTOPSY_DISTRIBUTION.map((err, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                <div className="font-bold text-white flex justify-between">
                  <span>{err.label}</span>
                  <span className="text-rose-400 font-mono">{err.count} erros</span>
                </div>
                <p className="text-zinc-400 text-[11px]">{err.recommendedIntervention}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS PRESERVED INTACT */}
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
            setNotificationMsg("🎉 Sessão concluída! Seu progresso foi atualizado.");
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
            setNotificationMsg("✅ Disponibilidade atualizada!");
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
    </FeatureGate>
  );
};
