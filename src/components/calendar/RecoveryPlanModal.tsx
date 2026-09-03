import React, { useState } from "react";
import {
  X,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  Flame,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface RecoveryPlanModalProps {
  onClose: () => void;
  onExecuteEvent: (eventType: "MISSED_TODAY" | "LESS_TIME" | "MORE_TIME" | "RECOVERY_PLAN" | "FINAL_SPRINT", adjustment?: number) => void;
}

export const RecoveryPlanModal: React.FC<RecoveryPlanModalProps> = ({
  onClose,
  onExecuteEvent,
}) => {
  const [selectedAction, setSelectedAction] = useState<
    "MISSED_TODAY" | "LESS_TIME" | "MORE_TIME" | "RECOVERY_PLAN" | "FINAL_SPRINT"
  >("MISSED_TODAY");
  const [adjustmentValue, setAdjustmentValue] = useState<number>(-30);

  const handleApply = () => {
    onExecuteEvent(selectedAction, adjustmentValue);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0f1118] border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Replanejamento Automático por Imprevistos
              </h2>
              <p className="text-xs text-zinc-400">
                A IA reorganiza as prioridades sem acumular uma montanha de tarefas atrasadas.
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

        {/* Options */}
        <div className="p-6 space-y-4">
          <div className="space-y-2.5">
            {[
              {
                id: "MISSED_TODAY",
                title: "Hoje não posso estudar (Imprevisto Total)",
                desc: "A IA reorganiza o cronograma. Move apenas revisões críticas FSRS para amanhã e descarta teorias dispensáveis.",
                badge: "Sem Culpa",
                color: "text-amber-400",
              },
              {
                id: "LESS_TIME",
                title: "Tenho menos tempo hoje (-30 min ou -1h)",
                desc: "Enxuga o dia de hoje, mantendo as questões de maior relevância e reduzindo leitura teórica.",
                badge: "Ajuste Rápido",
                color: "text-cyan-400",
              },
              {
                id: "MORE_TIME",
                title: "Tenho mais tempo livre hoje (+1h ou +2h)",
                desc: "A IA aproveita a janela extra para adiantar revisões de temas de alto peso no Revalida.",
                badge: "Aceleração",
                color: "text-emerald-400",
              },
              {
                id: "RECOVERY_PLAN",
                title: "Modo Faltei Vários Dias (Recovery Plan)",
                desc: "Não acumula o passado. A IA analisa o que ainda vale recuperar e gera um novo plano limpo a partir de hoje.",
                badge: "Reset Inteligente",
                color: "text-purple-400",
              },
              {
                id: "FINAL_SPRINT",
                title: "Recalcular Modo Reta Final (< 30 dias)",
                desc: "Corta teorias extensas. Transforma o plano em 100% questões INEP, pontos de alta retenção e flashcards.",
                badge: "Imersão Máxima",
                color: "text-rose-400",
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setSelectedAction(opt.id as any);
                  if (opt.id === "LESS_TIME") setAdjustmentValue(-30);
                  if (opt.id === "MORE_TIME") setAdjustmentValue(60);
                }}
                className={`w-full p-3.5 rounded-xl text-left border transition-all ${
                  selectedAction === opt.id
                    ? "bg-white/[0.08] border-emerald-500 shadow-md"
                    : "bg-white/[0.02] border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${opt.color}`}>
                    {opt.title}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/10 text-white/80">
                    {opt.badge}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {opt.desc}
                </p>
              </button>
            ))}
          </div>

          {/* Value controls for LESS_TIME / MORE_TIME */}
          {selectedAction === "LESS_TIME" && (
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-between text-xs">
              <span className="text-zinc-300">Quanto tempo a menos hoje?</span>
              <div className="flex items-center gap-2">
                {[-15, -30, -60].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAdjustmentValue(v)}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      adjustmentValue === v ? "bg-cyan-500 text-black" : "bg-zinc-800 text-white"
                    }`}
                  >
                    {v} min
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedAction === "MORE_TIME" && (
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-between text-xs">
              <span className="text-zinc-300">Quanto tempo a mais hoje?</span>
              <div className="flex items-center gap-2">
                {[30, 60, 120].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAdjustmentValue(v)}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      adjustmentValue === v ? "bg-emerald-500 text-black" : "bg-zinc-800 text-white"
                    }`}
                  >
                    +{v} min
                  </button>
                ))}
              </div>
            </div>
          )}
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
            onClick={handleApply}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Aplicar e Recalcular Agora</span>
          </button>
        </div>
      </div>
    </div>
  );
};
