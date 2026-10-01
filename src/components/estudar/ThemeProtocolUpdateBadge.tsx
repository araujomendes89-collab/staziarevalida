import React from "react";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { ProtocolUpdate } from "../../types/grandesTemas";

interface Props {
  update: ProtocolUpdate;
}

export const ThemeProtocolUpdateBadge: React.FC<Props> = ({ update }) => {
  return (
    <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 sm:p-5 text-amber-200">
      <div className="flex items-center gap-2.5 text-amber-400 font-semibold mb-3">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-400 animate-pulse" />
        <span className="text-sm uppercase tracking-wider font-bold">
          ⚠️ Atualização de Diretriz Oficial ({update.year}) — Alerta Revalida INEP
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-red-400 font-medium mb-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Conduta Anterior (NÃO MARCAR):
          </div>
          <p className="text-zinc-300 text-xs leading-relaxed">{update.previousConduct}</p>
          <div className="text-[11px] text-zinc-500 mt-2 italic font-mono">Fonte antiga: {update.previousDoc}</div>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-600/40 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
            <ArrowRight className="w-4 h-4" />
            Conduta Atualizada / Gabarito Atual:
          </div>
          <p className="text-emerald-100 text-xs leading-relaxed font-medium">{update.currentConduct}</p>
          <div className="text-[11px] text-emerald-400/80 mt-2 font-mono">Diretriz vigente: {update.currentDoc}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-amber-500/20 text-xs text-amber-300/90 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
        <div>
          <span className="font-semibold text-amber-200">Impacto no Revalida: </span>
          {update.revalidaImpact}
        </div>
      </div>
    </div>
  );
};
