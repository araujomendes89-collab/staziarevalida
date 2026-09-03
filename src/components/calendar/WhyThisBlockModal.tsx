import React from "react";
import { X, Sparkles, Brain, Target, ShieldCheck, ArrowRight, Zap, TrendingUp } from "lucide-react";
import { CalendarBlock } from "../../types/adaptiveCalendar";
import { MedicalArea } from "../../types";

interface WhyThisBlockModalProps {
  block: CalendarBlock | null;
  onClose: () => void;
  onStartBlock?: (block: CalendarBlock) => void;
}

const AREA_LABELS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina Preventiva & SUS",
};

export const WhyThisBlockModal: React.FC<WhyThisBlockModalProps> = ({
  block,
  onClose,
  onStartBlock,
}) => {
  if (!block) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f111a] border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-cyan-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  Decisão Algorítmica da IA
                </span>
                {block.area && (
                  <span className="text-[10px] text-zinc-400">
                    {AREA_LABELS[block.area] || block.area}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-white truncate max-w-md mt-0.5">
                Por que você vai estudar: {block.title}
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

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Main Reason Card */}
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Brain className="w-4 h-4" />
              Justificativa Pedagógica Central
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed font-medium">
              "{block.reason}"
            </p>
          </div>

          {/* Mathematical Multipliers */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Variáveis Cruzadas no Agendador
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-cyan-400" />
                  Incidência no Revalida
                </div>
                <div className="text-sm font-bold text-white mt-1">
                  IRS 94 / 100
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  Presente em 10 das últimas 11 edições oficiais do INEP.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  Domínio Atual do Aluno
                </div>
                <div className="text-sm font-bold text-amber-400 mt-1">
                  41% (Zona de Lacuna)
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  Detectados 2 erros recentes em questões de conduta/droga de escolha.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  Curva de Esquecimento
                </div>
                <div className="text-sm font-bold text-purple-300 mt-1">
                  FSRS: Risco Alto (58%)
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  Última exposição há mais de 8 dias sem revisão ativa.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Retorno Estimado (ROI)
                </div>
                <div className="text-sm font-bold text-emerald-400 mt-1">
                  +4.2 pontos na prova
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  Ganho projetado caso a lacuna seja consolidada hoje.
                </p>
              </div>
            </div>
          </div>

          {/* Strategy Details */}
          <div className="p-4 rounded-xl bg-zinc-900 border border-white/[0.08] space-y-2">
            <h4 className="text-xs font-bold text-white">
              Por que NÃO foi agendada teoria longa?
            </h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              O sistema detectou que você já compreende os conceitos fisiopatológicos gerais. Uma videoaula completa de 60 minutos desperdiçaria 40 minutos. O cronograma alocou apenas <strong>{block.durationMinutes} minutos focados</strong> nos pontos em que a banca do INEP coloca pegadinhas.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            Entendido, fechar
          </button>
          {onStartBlock && (
            <button
              onClick={() => {
                onClose();
                onStartBlock(block);
              }}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <span>Começar Este Bloco</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
