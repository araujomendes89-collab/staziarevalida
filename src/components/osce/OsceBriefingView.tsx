import React, { useState } from "react";
import {
  Stethoscope,
  Clock,
  Mic,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowLeft,
  User,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { OSCEStation } from "../../types";

interface OsceBriefingViewProps {
  station: OSCEStation;
  onStartStation: () => void;
  onCancel: () => void;
}

export const OsceBriefingView: React.FC<OsceBriefingViewProps> = ({
  station,
  onStartStation,
  onCancel,
}) => {
  const [micTestPassed, setMicTestPassed] = useState(true);
  const [hasConfirmedRead, setHasConfirmedRead] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          id="osce-briefing-back-btn"
          className="flex items-center gap-2 text-xs font-bold text-white/60 hover:text-white transition-colors px-3 py-2 rounded-xl backdrop-blur-md bg-white/5 border border-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Lista de Estações</span>
        </button>

        <div className="flex items-center gap-2 backdrop-blur-md bg-purple-500/15 border border-purple-500/30 px-3.5 py-1.5 rounded-full text-xs font-semibold text-purple-200">
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>Duração: {Math.round(station.timeLimitSeconds / 60)} minutos</span>
        </div>
      </div>

      {/* Main Briefing Card */}
      <div className="p-6 sm:p-8 rounded-[32px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-2xl space-y-6">
        {/* Title & Badge */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-purple-300 backdrop-blur-md bg-purple-500/15 px-3 py-1 rounded-full border border-purple-500/30 uppercase tracking-wider">
              {station.area.replace("_", " ")}
            </span>
            <span className="text-xs text-white/50 font-semibold">
              Padrão Oficial INEP / Revalida 2ª Etapa
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {station.title}
          </h1>
        </div>

        {/* Clinical Scenario Box */}
        <div className="p-5 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 uppercase tracking-wider">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>Cenário & Instruções da Estação</span>
          </div>
          <p className="text-sm text-white/90 leading-relaxed font-sans">
            {station.scenarioDescription}
          </p>
        </div>

        {/* Patient Profile Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white/70">
              <User className="w-4 h-4 text-purple-400" />
              <span>Identificação do Paciente Virtual</span>
            </div>
            <p className="text-sm font-bold text-white">
              {station.patient.name}, {station.patient.age}
            </p>
            <p className="text-xs text-white/60">
              <strong className="text-white/80">Comportamento: </strong>
              {station.patient.personality}
            </p>
          </div>

          <div className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Recursos & Ferramentas na Sala</span>
            </div>
            <ul className="text-xs text-white/70 space-y-1">
              <li>• Voz interativa em tempo real com o paciente</li>
              <li>• Solicitação de exame físico direcionado</li>
              <li>• Solicitação e visualização de laudos de exames</li>
              <li>• Checklist invisível corrigido pela banca ao final</li>
            </ul>
          </div>
        </div>

        {/* Hardware / Audio Check */}
        <div className="p-4 rounded-2xl backdrop-blur-md bg-purple-500/10 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Reconhecimento de Voz & Áudio</p>
              <p className="text-[11px] text-white/60">
                Você pode falar diretamente pelo microfone ou digitar suas falas no chat clínico.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 backdrop-blur-md bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4" />
            <span>Sistema Pronto</span>
          </div>
        </div>

        {/* Confirmation Checkbox */}
        <div className="pt-2">
          <label className="flex items-center gap-3 cursor-pointer select-none text-xs text-white/80 hover:text-white">
            <input
              type="checkbox"
              id="osce-briefing-confirm-check"
              checked={hasConfirmedRead}
              onChange={(e) => setHasConfirmedRead(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-black/40 border-white/20"
            />
            <span>
              Li as instruções do caso clínico e compreendi que a contagem regressiva de 10 minutos iniciará imediatamente.
            </span>
          </label>
        </div>

        {/* Start Button CTA */}
        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            Você poderá finalizar ou pausar a estação a qualquer momento.
          </p>

          <button
            onClick={onStartStation}
            disabled={!hasConfirmedRead}
            id="osce-briefing-start-btn"
            className={`w-full sm:w-auto px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl ${
              hasConfirmedRead
                ? "bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 text-white hover:scale-[1.02] active:scale-95 shadow-purple-950/50 cursor-pointer"
                : "bg-white/10 text-white/30 cursor-not-allowed border border-white/10"
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Entrar na Sala Virtual & Iniciar (10 min)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
