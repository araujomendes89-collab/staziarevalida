import React, { useState } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Headphones,
  FileText,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FastForward,
  Activity,
  Award,
} from "lucide-react";
import { AudioSummaryService } from "../../services/audioSummaryService";
import { ClinicalAudioSummary, MedicalArea } from "../../types";

const AREA_COLORS: Record<MedicalArea, { bg: string; text: string; border: string }> = {
  CLINICA_MEDICA: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  CIRURGIA_GERAL: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  GINECOLOGIA_OBSTETRICIA: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  PEDIATRIA: { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/20" },
  MEDICINA_FAMILIA_COMUNIDADE: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

export const FlashAudioPlayerView: React.FC = () => {
  const audioSummaries = AudioSummaryService.getCuratedAudioSummaries();
  const [activeAudio, setActiveAudio] = useState<ClinicalAudioSummary>(audioSummaries[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.05);
  const [showScript, setShowScript] = useState<boolean>(false);

  const handlePlayToggle = (audio: ClinicalAudioSummary) => {
    if (activeAudio.id === audio.id && isPlaying) {
      AudioSummaryService.stop();
      setIsPlaying(false);
      return;
    }

    setActiveAudio(audio);
    setIsPlaying(true);

    AudioSummaryService.speak(audio.audioScript, {
      rate: playbackRate,
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  };

  const handleStop = () => {
    AudioSummaryService.stop();
    setIsPlaying(false);
  };

  const handleChangeRate = (rate: number) => {
    setPlaybackRate(rate);
    if (isPlaying) {
      AudioSummaryService.speak(activeAudio.audioScript, {
        rate,
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#111420] to-[#0c0e17] border border-emerald-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                Flash-Audio Revalida
              </span>
              <span className="text-xs text-zinc-400 font-medium">Estudos em Deslocamento & Plantão</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">Resumos Clínicos Sintetizados em Áudio</h2>
            <p className="text-xs text-zinc-300 mt-1 max-w-xl">
              Áudios de 2 a 3 minutos com os protocolos do SUS e esquemas terapêuticos mais recorrentes nas provas teóricas e práticas (OSCE) do INEP.
            </p>
          </div>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] shrink-0">
          {[1.0, 1.25, 1.5, 1.75].map((rate) => (
            <button
              key={rate}
              onClick={() => handleChangeRate(rate)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
                playbackRate === rate
                  ? "bg-emerald-500 text-black font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Active Track Player Box */}
      <div className="p-5 rounded-2xl bg-[#111420] border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePlayToggle(activeAudio)}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform active:scale-95 shrink-0 ${
                isPlaying
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                  : "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
              }`}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${AREA_COLORS[activeAudio.area].bg} ${AREA_COLORS[activeAudio.area].text} ${AREA_COLORS[activeAudio.area].border}`}>
                  {activeAudio.theme}
                </span>
                <span className="text-xs text-zinc-400 font-mono">~{Math.round(activeAudio.durationSeconds / 60)} min</span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">{activeAudio.title}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScript(!showScript)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                showScript
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-white/[0.03] text-zinc-400 border-white/[0.08] hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{showScript ? "Ocultar Transcrição" : "Ver Transcrição"}</span>
            </button>
            {isPlaying && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span>Parar</span>
              </button>
            )}
          </div>
        </div>

        {/* High Yield Key Formula Banner */}
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-300">Padrão-Ouro / Dose INEP: </span>
            <span className="text-zinc-200">{activeAudio.highYieldDoseOrProtocol}</span>
            <span className="text-zinc-400 ml-2 font-mono">({activeAudio.guidelineRef})</span>
          </div>
        </div>

        {/* Key Points Bullet List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
          {activeAudio.keyPoints.map((pt, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300 bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{pt}</span>
            </div>
          ))}
        </div>

        {/* Transcription Drawer */}
        {showScript && (
          <div className="p-4 rounded-xl bg-black/40 border border-white/[0.08] text-xs text-zinc-300 leading-relaxed font-sans mt-2 space-y-2">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Transcrição Integral:</div>
            <p className="whitespace-pre-line">{activeAudio.audioScript}</p>
          </div>
        )}
      </div>

      {/* Playlist Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>Faixas Disponíveis por Área</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {audioSummaries.map((audio) => {
            const isSelected = activeAudio.id === audio.id;
            const isPlayingThis = isSelected && isPlaying;
            return (
              <div
                key={audio.id}
                onClick={() => handlePlayToggle(audio)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? "bg-white/[0.08] border-emerald-500/50 shadow-md shadow-emerald-500/10"
                    : "bg-[#111420] border-white/[0.08] hover:bg-white/[0.04]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${AREA_COLORS[audio.area].bg} ${AREA_COLORS[audio.area].text} ${AREA_COLORS[audio.area].border}`}>
                      {audio.theme}
                    </span>
                    <span className="text-[11px] text-zinc-400">~{Math.round(audio.durationSeconds / 60)} min</span>
                  </div>
                  <h4 className="text-xs font-bold text-white truncate">{audio.title}</h4>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">{audio.highYieldDoseOrProtocol}</p>
                </div>

                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isPlayingThis ? "bg-amber-500 text-black" : "bg-white/10 text-white hover:bg-emerald-500 hover:text-black"
                }`}>
                  {isPlayingThis ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
