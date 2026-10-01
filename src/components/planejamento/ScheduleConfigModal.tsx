import React, { useState } from "react";
import {
  X,
  Sliders,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Target,
  Sparkles,
  ShieldCheck,
  Plus,
  Trash2,
} from "lucide-react";
import {
  CalendarMode,
  DayAvailabilityConfig,
  StudentOnboardingProfile,
  StudyIntensity,
} from "../../types/adaptiveCalendar";
import { MedicalArea } from "../../types";

interface ScheduleConfigModalProps {
  initialProfile: StudentOnboardingProfile;
  onClose: () => void;
  onSaveProfile: (profile: StudentOnboardingProfile) => void;
}

const DEFAULT_DAYS: DayAvailabilityConfig[] = [
  { dayOfWeek: "SEG", dayName: "Segunda-feira", availableMinutes: 120, enabled: true },
  { dayOfWeek: "TER", dayName: "Terça-feira", availableMinutes: 90, enabled: true },
  { dayOfWeek: "QUA", dayName: "Quarta-feira", availableMinutes: 120, enabled: true },
  { dayOfWeek: "QUI", dayName: "Quinta-feira", availableMinutes: 90, enabled: true },
  { dayOfWeek: "SEX", dayName: "Sexta-feira", availableMinutes: 60, enabled: true },
  { dayOfWeek: "SAB", dayName: "Sábado", availableMinutes: 240, enabled: true },
  { dayOfWeek: "DOM", dayName: "Domingo", availableMinutes: 120, enabled: false, blockedReason: "Descanso" },
];

export const ScheduleConfigModal: React.FC<ScheduleConfigModalProps> = ({
  initialProfile,
  onClose,
  onSaveProfile,
}) => {
  const [examDate, setExamDate] = useState<string>(initialProfile.examDate || "2026-09-13");
  const [mode, setMode] = useState<CalendarMode>(initialProfile.calendarMode || "FLEXIVEL");
  const [intensity, setIntensity] = useState<StudyIntensity>(initialProfile.intensity || "MODERADO");
  const [weeklySchedule, setWeeklySchedule] = useState<DayAvailabilityConfig[]>(
    initialProfile.weeklySchedule?.length ? initialProfile.weeklySchedule : DEFAULT_DAYS
  );
  const [quickWeeklyHours, setQuickWeeklyHours] = useState<number>(14);
  const [useQuickHours, setUseQuickHours] = useState<boolean>(false);

  // Time commitments blocks
  const [timeBlocks, setTimeBlocks] = useState(
    initialProfile.timeBlocks || [
      { name: "Plantão Hospitalar", dayOfWeek: "SEX", startTime: "19:00", endTime: "07:00" },
      { name: "Faculdade / Trabalho", dayOfWeek: "SEG", startTime: "08:00", endTime: "17:00" },
    ]
  );

  const totalWeeklyMinutes = weeklySchedule
    .filter((d) => d.enabled)
    .reduce((acc, d) => acc + d.availableMinutes, 0);
  const totalWeeklyHours = (totalWeeklyMinutes / 60).toFixed(1);

  const handleToggleDay = (idx: number) => {
    setWeeklySchedule((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const handleMinutesChange = (idx: number, minutes: number) => {
    setWeeklySchedule((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, availableMinutes: Math.max(15, minutes) } : d))
    );
  };

  const handleDistributeWeeklyHours = () => {
    const dailyMin = Math.round((quickWeeklyHours * 60) / 6);
    setWeeklySchedule((prev) =>
      prev.map((d, i) => ({
        ...d,
        enabled: i !== 6, // Domingo descanso
        availableMinutes: i === 5 ? dailyMin * 1.5 : dailyMin,
      }))
    );
    setUseQuickHours(false);
  };

  const handleSave = () => {
    const updated: StudentOnboardingProfile = {
      ...initialProfile,
      examDate,
      calendarMode: mode,
      intensity,
      dailyAvailableMinutes: Math.round(totalWeeklyMinutes / 7),
      weeklyStudyDays: weeklySchedule.filter((d) => d.enabled).length,
      weeklySchedule,
      timeBlocks,
    };
    onSaveProfile(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0e1017] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Configuração de Disponibilidade & Ritmo
              </h2>
              <p className="text-xs text-zinc-400">
                A IA adapta a carga para seu tempo real sem criar planos impossíveis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Data da Prova */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Data Prevista da Prova Oficial
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="bg-zinc-900 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              />
              <span className="text-xs text-zinc-400">
                (Ex: 13/09/2026 para 2026.2 ou 07/06/2027 para 2027.1)
              </span>
            </div>
          </div>

          {/* 2. Modo do Calendário (Fixo vs Flexível) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Tipo de Planejamento
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("FLEXIVEL")}
                className={`p-3.5 rounded-xl text-left border transition-all ${
                  mode === "FLEXIVEL"
                    ? "bg-emerald-500/10 border-emerald-500 text-white font-bold"
                    : "bg-white/[0.02] border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]"
                }`}
              >
                <div className="text-xs font-bold text-white">Calendário Flexível</div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  Você define a quantidade de horas no dia. Estude no seu horário livre.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("FIXO")}
                className={`p-3.5 rounded-xl text-left border transition-all ${
                  mode === "FIXO"
                    ? "bg-emerald-500/10 border-emerald-500 text-white font-bold"
                    : "bg-white/[0.02] border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]"
                }`}
              >
                <div className="text-xs font-bold text-white">Calendário Fixo (Horários)</div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  Defina janelas exatas (ex: 06:30–07:30 e 19:00–20:00).
                </div>
              </button>
            </div>
          </div>

          {/* 3. Ritmo de Intensidade */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Intensidade Desejada
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "LEVE", label: "Leve", sub: "~1h/dia" },
                { id: "MODERADO", label: "Moderado", sub: "~2h/dia" },
                { id: "INTENSIVO", label: "Intensivo", sub: "~4h/dia" },
                { id: "RETA_FINAL", label: "Reta Final", sub: "Imersão" },
              ].map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setIntensity(it.id as StudyIntensity)}
                  className={`py-2 px-1.5 rounded-xl text-center border transition-all ${
                    intensity === it.id
                      ? "bg-amber-500/20 border-amber-500 text-white font-bold"
                      : "bg-white/[0.02] border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="text-xs font-bold text-white">{it.label}</div>
                  <div className="text-[10px] text-zinc-400">{it.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Dias Disponíveis e Horas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Disponibilidade por Dia da Semana ({totalWeeklyHours}h semanais)
              </label>
              <button
                type="button"
                onClick={() => setUseQuickHours(!useQuickHours)}
                className="text-[11px] text-cyan-400 hover:underline font-semibold"
              >
                {useQuickHours ? "Configurar dias individualmente" : "Definir total semanal rápido"}
              </button>
            </div>

            {useQuickHours ? (
              <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300">Tenho aproximadamente:</span>
                  <span className="text-sm font-bold text-cyan-400">{quickWeeklyHours} horas / semana</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={quickWeeklyHours}
                  onChange={(e) => setQuickWeeklyHours(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <button
                  type="button"
                  onClick={handleDistributeWeeklyHours}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-colors"
                >
                  Distribuir Automaticamente pela IA
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {weeklySchedule.map((d, idx) => (
                  <div
                    key={d.dayOfWeek}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                      d.enabled
                        ? "bg-white/[0.03] border-white/[0.08]"
                        : "bg-black/40 border-white/[0.04] opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={() => handleToggleDay(idx)}
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">{d.dayName}</div>
                        {!d.enabled && d.blockedReason && (
                          <div className="text-[10px] text-zinc-400">Bloqueio: {d.blockedReason}</div>
                        )}
                      </div>
                    </div>

                    {d.enabled ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={15}
                          max={480}
                          step={15}
                          value={d.availableMinutes}
                          onChange={(e) => handleMinutesChange(idx, Number(e.target.value))}
                          className="w-16 bg-zinc-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white text-right font-mono"
                        />
                        <span className="text-xs text-zinc-400">min ({(d.availableMinutes / 60).toFixed(1)}h)</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">Livre de estudos</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Bloqueios de Tempo (Plantão, Trabalho, etc.) */}
          <div className="space-y-2 pt-2 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Compromissos Bloqueados (Plantão / Trabalho / Faculdade)
              </label>
            </div>
            <div className="space-y-1.5">
              {timeBlocks.map((b, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.06] flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-zinc-200">{b.name}</span>
                  <div className="flex items-center gap-3 text-zinc-400">
                    <span className="font-mono text-[11px]">{b.dayOfWeek} • {b.startTime} às {b.endTime}</span>
                    <button
                      onClick={() => setTimeBlocks(timeBlocks.filter((_, i) => i !== idx))}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Salvar & Recalcular Calendário</span>
          </button>
        </div>
      </div>
    </div>
  );
};
