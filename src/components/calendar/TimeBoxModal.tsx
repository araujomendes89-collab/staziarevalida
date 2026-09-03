import React, { useState } from "react";
import { X, Zap, Clock, Sparkles, Play, ArrowRight, CheckCircle2, BookOpen, Layers, Target, AlertTriangle } from "lucide-react";
import { StudyPlannerEngine, StudyPriorityScoreItem } from "../../services/studyPlannerEngine";
import { StudentOnboardingProfile } from "../../types/adaptiveCalendar";

interface TimeBoxModalProps {
  onClose: () => void;
  priorityList: StudyPriorityScoreItem[];
  studentProfile: StudentOnboardingProfile;
  onLaunchSession: (session: { title: string; totalMinutes: number; blocks: any[] }) => void;
}

export const TimeBoxModal: React.FC<TimeBoxModalProps> = ({
  onClose,
  priorityList,
  studentProfile,
  onLaunchSession,
}) => {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(20);
  const [customMinutes, setCustomMinutes] = useState<number>(35);
  const [isCustom, setIsCustom] = useState<boolean>(false);

  const activeMinutes = isCustom ? customMinutes : selectedMinutes;
  const session = StudyPlannerEngine.generateTimeBoxedSession(activeMinutes, priorityList, studentProfile);

  const presetOptions = [10, 20, 30, 45, 60];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0e1017] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-cyan-950/40 via-zinc-900 to-emerald-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  Modo Oportunista
                </span>
                <span className="text-[10px] text-zinc-400">
                  Retorno Máximo por Minuto
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Tenho Só {activeMinutes} Minutos Disponíveis
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Quick Select Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">
              Quanto tempo você tem livre agora?
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {presetOptions.map((min) => (
                <button
                  key={min}
                  onClick={() => {
                    setSelectedMinutes(min);
                    setIsCustom(false);
                  }}
                  className={`py-3 px-2 rounded-xl text-center font-bold text-sm transition-all border ${
                    !isCustom && selectedMinutes === min
                      ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20 scale-[1.02]"
                      : "bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {min} min
                </button>
              ))}
              <button
                onClick={() => setIsCustom(true)}
                className={`py-3 px-2 rounded-xl text-center font-bold text-xs transition-all border ${
                  isCustom
                    ? "bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/20 scale-[1.02]"
                    : "bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]"
                }`}
              >
                Outro
              </button>
            </div>

            {isCustom && (
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(Number(e.target.value))}
                  className="flex-1 accent-cyan-400"
                />
                <span className="text-sm font-bold text-cyan-400 w-16 text-right">
                  {customMinutes} min
                </span>
              </div>
            )}
          </div>

          {/* AI Pedagogical Strategy Blueprint */}
          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Estratégia Gerada pela IA para {activeMinutes} min
                </h3>
              </div>
              <span className="text-[11px] font-mono font-bold text-emerald-400">
                +1.8 pts ROI
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-medium">
              {session.summaryAdvice}
            </p>
          </div>

          {/* Micro-Blocks Sequence */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Roteiro de Execução Passo a Passo
            </h4>
            <div className="space-y-2">
              {session.blocks.map((b, idx) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 font-mono text-xs font-bold flex items-center justify-center">
                      0{idx + 1}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {b.title}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {b.description}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                      {b.durationMinutes} min
                    </span>
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
            onClick={() => {
              onClose();
              onLaunchSession(session);
            }}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Iniciar Sessão de {activeMinutes} Minutos</span>
          </button>
        </div>
      </div>
    </div>
  );
};
