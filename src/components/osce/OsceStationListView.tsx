import React from "react";
import {
  Stethoscope,
  Clock,
  Play,
  CheckCircle2,
  Tag,
  Award,
} from "lucide-react";
import { SEED_OSCE_STATIONS } from "../../data/osceStationsData";
import { useApp } from "../../context/AppContext";
import { OSCEStation } from "../../types";

interface OsceStationListViewProps {
  onSelectStation: (station: OSCEStation) => void;
}

export const OsceStationListView: React.FC<OsceStationListViewProps> = ({
  onSelectStation,
}) => {
  const { osceAttempts } = useApp();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#111420] border border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Stethoscope className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Prova Prática (OSCE) · 2ª Etapa Revalida
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Estações Clínicas
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
            Simulação prática com anamnese, solicitação de exames e checklist oficial INEP.
          </p>
        </div>

        <div className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-300 whitespace-nowrap self-start sm:self-center">
          10 min por estação
        </div>
      </div>

      {/* Stations List */}
      <div className="space-y-3">
        {SEED_OSCE_STATIONS.map((station) => {
          const pastAttempt = osceAttempts.find((a) => a.stationId === station.id);

          return (
            <div
              key={station.id}
              className="p-5 rounded-2xl bg-[#111420] border border-white/[0.08] hover:border-white/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                {/* Meta Top Line: Area / Time / Case Type / Difficulty */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                    {station.area.replace(/_/g, " ")}
                  </span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {Math.round(station.timeLimitSeconds / 60)} min
                  </span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">
                    {station.caseType || "Oficial INEP"}
                  </span>
                  {station.difficulty && (
                    <>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">
                        Dificuldade: <strong className="text-zinc-200">{station.difficulty}</strong>
                      </span>
                    </>
                  )}
                </div>

                {/* Station Title */}
                <h3 className="text-base font-semibold text-white">
                  {station.title}
                </h3>

                {/* Brief description (1 to 2 lines) */}
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {station.scenarioDescription}
                </p>

                {/* Competencies Tags */}
                {station.competencies && station.competencies.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-zinc-500 font-medium">Competências:</span>
                    {station.competencies.map((comp, i) => (
                      <span
                        key={i}
                        className="text-[10px] text-zinc-300 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md"
                      >
                        {comp}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Station CTA & History */}
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                <div className="text-right">
                  {pastAttempt ? (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Nota: {pastAttempt.score}/100
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">Nunca realizada</span>
                  )}
                </div>

                <button
                  onClick={() => onSelectStation(station)}
                  id={`prepare-osce-${station.id}`}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors cursor-pointer min-h-[44px]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preparar estação</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
