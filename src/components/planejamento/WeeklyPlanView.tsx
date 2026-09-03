import React, { useState, useMemo } from "react";
import {
  CalendarCheck,
  BookOpen,
  FileQuestion,
  Layers,
  Clock,
  ArrowRight,
  ChevronRight,
  Info,
  Calendar,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { SpacedRepetitionService } from "../../services/spacedRepetitionService";
import { ADAPTIVE_SCHEDULE_DAYS } from "../../data/adaptiveCalendarData";
import { ScheduledDayItem } from "../../types/adaptiveCalendar";
import { Flashcard } from "../../types";
import { formatMedicalArea } from "../../utils/formatters";

export interface WeeklyPlanDay {
  id: string;
  dateKey: string; // YYYY-MM-DD
  dayOfWeek: string; // "QUI", "SEX", etc.
  fullDayName: string; // "Quinta-feira", etc.
  dayNumber: number; // 3, 4, etc.
  monthLabel: string; // "SET", "OUT", etc.
  formattedDate: string; // "03/09"
  isToday: boolean;
  studyTheme: string;
  studyArea: string;
  studyDurationMinutes: number;
  practiceTitle: string;
  practiceQuestionCount: number;
  practiceDurationMinutes: number;
  reviewCount: number;
  reviewMinutes: number;
  totalEstimatedMinutes: number;
  status: "TODAY" | "UPCOMING" | "DONE";
}

const DAY_NAMES_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const DAY_ABBR_PT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTH_ABBR_PT = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

export function generateWeeklyPlanDays(
  now: Date = new Date(),
  flashcards: Flashcard[] = [],
  scheduleDays: ScheduledDayItem[] = ADAPTIVE_SCHEDULE_DAYS
): WeeklyPlanDay[] {
  const todayKey = SpacedRepetitionService.toLocalDateKey(now);
  const reviewLoadByDate = SpacedRepetitionService.getFlashcardReviewLoadByDate(flashcards, now);

  const days: WeeklyPlanDay[] = [];

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateKey = SpacedRepetitionService.toLocalDateKey(dayDate);
    const isToday = i === 0;

    const dayOfWeekIndex = dayDate.getDay();
    const dayAbbr = DAY_ABBR_PT[dayOfWeekIndex];
    const fullDayName = DAY_NAMES_PT[dayOfWeekIndex];
    const dayNumber = dayDate.getDate();
    const monthLabel = MONTH_ABBR_PT[dayDate.getMonth()];
    const formattedDate = `${String(dayNumber).padStart(2, "0")}/${String(
      dayDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const template = scheduleDays[i % scheduleDays.length];

    const studyBlock =
      template?.blocks.find(
        (b) =>
          b.type === "GRANDE_TEMA" ||
          b.type === "TEORIA_COMPLETA" ||
          b.type === "TEORIA_DIRECIONADA" ||
          b.type === "TEORIA_EXPRESSA"
      ) || template?.blocks[0];

    const practiceBlock = template?.blocks.find(
      (b) =>
        b.type === "QUESTOES_OFICIAIS" ||
        b.type === "QUESTOES_IRMAS" ||
        b.type === "SIMULADO_PARCIAL" ||
        b.type === "SIMULADO_COMPLETO" ||
        b.type === "EXECUCAO_PROVA"
    );

    const dayLoad = isToday
      ? reviewLoadByDate[todayKey] || { count: 0, estimatedMinutes: 0 }
      : reviewLoadByDate[dateKey] || { count: 0, estimatedMinutes: 0 };

    const studyMinutes = studyBlock?.durationMinutes || 45;
    const practiceMinutes = practiceBlock?.durationMinutes || 30;
    const reviewMinutes = dayLoad.estimatedMinutes;
    const totalEstimatedMinutes = studyMinutes + practiceMinutes + reviewMinutes;

    days.push({
      id: `week-day-${dateKey}`,
      dateKey,
      dayOfWeek: dayAbbr,
      fullDayName,
      dayNumber,
      monthLabel,
      formattedDate,
      isToday,
      studyTheme: template?.focusTheme || template?.primaryTopicName || "Estudo Estruturado",
      studyArea: template?.primaryArea || "CLINICA_MEDICA",
      studyDurationMinutes: studyMinutes,
      practiceTitle: practiceBlock?.title || "Sessão de Questões Objetivas",
      practiceQuestionCount: practiceBlock?.questionCount || 20,
      practiceDurationMinutes: practiceMinutes,
      reviewCount: dayLoad.count,
      reviewMinutes,
      totalEstimatedMinutes,
      status: isToday ? "TODAY" : "UPCOMING",
    });
  }

  return days;
}

export const WeeklyPlanView: React.FC = () => {
  const { setActiveTab, flashcards } = useApp();

  const now = useMemo(() => new Date(), []);
  const weeklyDays = useMemo(
    () => generateWeeklyPlanDays(now, flashcards || []),
    [now, flashcards]
  );

  const [selectedDayKey, setSelectedDayKey] = useState<string>(weeklyDays[0]?.dateKey || "");

  const selectedDay = useMemo(() => {
    return weeklyDays.find((d) => d.dateKey === selectedDayKey) || weeklyDays[0];
  }, [weeklyDays, selectedDayKey]);

  const todayItem = weeklyDays[0];

  const formatDurationHours = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}min` : `${hours}h`;
  };

  const totalWeeklyMinutes = useMemo(() => {
    return weeklyDays.reduce((acc, d) => acc + d.totalEstimatedMinutes, 0);
  }, [weeklyDays]);

  // Period label: e.g. "03–09 SET"
  const periodLabel = useMemo(() => {
    if (weeklyDays.length === 0) return "";
    const first = weeklyDays[0];
    const last = weeklyDays[weeklyDays.length - 1];
    if (first.monthLabel === last.monthLabel) {
      return `${String(first.dayNumber).padStart(2, "0")}–${String(last.dayNumber).padStart(
        2,
        "0"
      )} ${first.monthLabel}`;
    }
    return `${String(first.dayNumber).padStart(2, "0")} ${first.monthLabel} – ${String(
      last.dayNumber
    ).padStart(2, "0")} ${last.monthLabel}`;
  }, [weeklyDays]);

  return (
    <div className="space-y-6">
      {/* COMPACT CLEAN HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50" />
              <span>Plano Semanal</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {periodLabel}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Seus próximos 7 dias de estudo • Carga total planejada:{" "}
            <strong className="text-zinc-200">{formatDurationHours(totalWeeklyMinutes)}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("planejamento-calendario")}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <span>Ver Calendário Completo</span>
          </button>
        </div>
      </div>

      {/* 7 DAYS TIMELINE / DAY SELECTOR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {weeklyDays.map((day) => {
          const isSelected = day.dateKey === selectedDay.dateKey;
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => setSelectedDayKey(day.dateKey)}
              className={`p-3.5 rounded-2xl text-left border transition-all flex flex-col justify-between min-h-[140px] cursor-pointer ${
                isSelected
                  ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/40"
                  : day.isToday
                  ? "bg-zinc-900/90 border-emerald-500/40 hover:bg-zinc-800/80"
                  : "bg-zinc-950 border-zinc-800/80 hover:bg-zinc-900/50"
              }`}
            >
              <div>
                {/* Day header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    {day.dayOfWeek}
                  </span>
                  {day.isToday && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      HOJE
                    </span>
                  )}
                </div>

                <div className="text-sm font-black text-white mt-0.5">
                  {day.formattedDate}
                </div>

                {/* Content theme */}
                <div className="mt-2 text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-snug">
                  {day.studyTheme}
                </div>
              </div>

              {/* Load & review footer */}
              <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
                {day.reviewCount > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span>
                      {day.reviewCount} {day.reviewCount === 1 ? "revisão" : "revisões"}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                  <span>{formatDurationHours(day.totalEstimatedMinutes)}</span>
                  <span className="text-zinc-500">{day.practiceQuestionCount}q</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* SELECTED DAY OPERATIONAL BREAKDOWN (CLEAN ROWS INSTEAD OF NESTED CARDS) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {selectedDay.fullDayName}, {selectedDay.formattedDate}
              </h2>
              {selectedDay.isToday && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  HOJE
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Carga total estimada:{" "}
              <strong className="text-zinc-200">
                {formatDurationHours(selectedDay.totalEstimatedMinutes)}
              </strong>
            </p>
          </div>

          {selectedDay.isToday ? (
            <div className="flex items-center gap-2">
              {todayItem.reviewCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("revisar-flashcards")}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer"
                >
                  Revisar Flashcards ({todayItem.reviewCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("estudar-plano-hoje")}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-900/20"
              >
                <span>Começar Plano de Hoje</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-zinc-400 italic">
              Programação prevista para os próximos dias
            </span>
          )}
        </div>

        {/* 3 Core Activities in Clean Divider Rows */}
        <div className="space-y-3">
          {/* 1. ESTUDAR */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">
                    1. ESTUDAR
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-900 text-zinc-300">
                    {formatMedicalArea(selectedDay.studyArea)}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">
                  {selectedDay.studyTheme}
                </h3>
              </div>
            </div>
            <div className="self-end sm:self-center font-mono text-zinc-400 text-xs shrink-0">
              {selectedDay.studyDurationMinutes} min
            </div>
          </div>

          {/* 2. PRATICAR */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <FileQuestion className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <span className="font-bold text-blue-400 uppercase tracking-wider text-[10px]">
                  2. PRATICAR
                </span>
                <h3 className="text-sm font-bold text-white">
                  {selectedDay.practiceTitle}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  {selectedDay.practiceQuestionCount} questões objetivas direcionadas
                </p>
              </div>
            </div>
            <div className="self-end sm:self-center font-mono text-zinc-400 text-xs shrink-0">
              {selectedDay.practiceDurationMinutes} min
            </div>
          </div>

          {/* 3. REVISAR */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <span className="font-bold text-purple-400 uppercase tracking-wider text-[10px]">
                  3. REVISAR (REVISÃO ESPAÇADA)
                </span>
                {selectedDay.reviewCount > 0 ? (
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {selectedDay.reviewCount}{" "}
                      {selectedDay.reviewCount === 1
                        ? "flashcard programado"
                        : "flashcards programados"}
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Fixação espaçada calculada para retenção de 90%.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-400">
                      Revisão em dia
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Nenhum flashcard pendente agendado para esta data.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="self-end sm:self-center font-mono text-zinc-400 text-xs shrink-0">
              {selectedDay.reviewMinutes > 0 ? `${selectedDay.reviewMinutes} min` : "0 min"}
            </div>
          </div>
        </div>

        {!selectedDay.isToday && (
          <p className="text-[11px] text-zinc-500 pt-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              As revisões futuras se ajustam dinamicamente conforme seu desempenho diário.
            </span>
          </p>
        )}
      </div>
    </div>
  );
};
