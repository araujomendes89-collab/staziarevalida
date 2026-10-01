import React from "react";
import { Play, Pause, Square, AlertCircle, Clock } from "lucide-react";

interface SimulationTimerHUDProps {
  totalSeconds: number; // Current seconds for the simulation
  isPaused: boolean;
  onTogglePause: () => void;
  onFinish: () => void;
  modeLabel?: string;
  isCountDown?: boolean;
}

export const SimulationTimerHUD: React.FC<SimulationTimerHUDProps> = ({
  totalSeconds,
  isPaused,
  onTogglePause,
  onFinish,
  modeLabel = "Simulado INEP",
  isCountDown = false,
}) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="w-full flex flex-col items-center justify-center my-2 sm:my-3">
      {/* Dark elevated HUD card inspired by Hardwork Medicina */}
      <div className="relative bg-[#0A1C3E] text-white px-8 sm:px-14 py-3.5 sm:py-4 rounded-2xl shadow-xl border border-slate-700/60 flex flex-col items-center select-none">
        {/* Left/Right actions: Pausar e Encerrar */}
        <div className="w-full flex items-center justify-between gap-6 sm:gap-12 min-w-[280px] sm:min-w-[340px]">
          {/* Action: Pausar / Retomar */}
          <button
            type="button"
            onClick={onTogglePause}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              isPaused
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md animate-pulse"
                : "bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10"
            }`}
            title={isPaused ? "Retomar simulado" : "Pausar simulado"}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Retomar</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar</span>
              </>
            )}
          </button>

          {/* Central Timer Display */}
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1 font-mono font-black text-2xl sm:text-4xl tracking-wider text-white">
              {hours > 0 && (
                <>
                  <span>{pad(hours)}</span>
                  <span className="text-teal-400 text-xl sm:text-2xl font-bold animate-pulse">:</span>
                </>
              )}
              <span>{pad(minutes)}</span>
              <span className="text-teal-400 text-xl sm:text-2xl font-bold animate-pulse">:</span>
              <span>{pad(seconds)}</span>
            </div>

            <div className="flex items-center justify-center gap-4 text-[9px] uppercase tracking-wider text-slate-400 font-bold px-1 mt-0.5">
              {hours > 0 && <span>Horas</span>}
              <span>Minutos</span>
              <span>Segundos</span>
            </div>

            {/* Subtitle tag: Modo / Restante ou Decorrido */}
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-teal-400/90 font-medium">
              <Clock className="w-2.5 h-2.5" />
              <span>{isCountDown ? "Tempo Restante" : "Tempo Decorrido"}</span>
              {modeLabel && <span className="text-slate-400">• {modeLabel}</span>}
            </div>
          </div>

          {/* Action: Encerrar */}
          <button
            type="button"
            onClick={onFinish}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 transition-all cursor-pointer"
            title="Encerrar e finalizar simulado"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Encerrar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
