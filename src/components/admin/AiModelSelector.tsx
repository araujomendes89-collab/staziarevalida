import React, { useState, useEffect } from "react";
import { Sparkles, Cpu, Zap, Shield, CheckCircle2, Server, HelpCircle } from "lucide-react";
import { AiService, SupportedModelId, AiModelConfig } from "../../services/aiService";

interface AiModelSelectorProps {
  onModelChange?: (model: SupportedModelId) => void;
  compact?: boolean;
}

export const AiModelSelector: React.FC<AiModelSelectorProps> = ({
  onModelChange,
  compact = false,
}) => {
  const [activeModel, setActiveModel] = useState<SupportedModelId>(AiService.getActiveModel());
  const [models, setModels] = useState<AiModelConfig[]>([]);
  const [backendStatus, setBackendStatus] = useState<{
    gcpProject: string;
    gcpRegion: string;
    defaultModel: string;
  } | null>(null);

  useEffect(() => {
    AiService.getAvailableModels().then(setModels);
    fetch("/api/ai/health") // detalhes só para administrador (a /api/health pública mostra apenas "ok")
      .then((r) => r.json())
      .then((data) => {
        if (data.gcpProject) {
          setBackendStatus({
            gcpProject: data.gcpProject,
            gcpRegion: data.gcpRegion || "global",
            defaultModel: data.defaultAiModel || "claude-sonnet-5",
          });
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const handleSelect = (modelId: SupportedModelId) => {
    setActiveModel(modelId);
    AiService.setActiveModel(modelId);
    if (onModelChange) {
      onModelChange(modelId);
    }
  };

  const getModelIcon = (id: SupportedModelId) => {
    switch (id) {
      case "sonnet":
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case "opus":
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case "gemini":
        return <Zap className="w-4 h-4 text-amber-400" />;
    }
  };

  const getBadgeStyle = (id: SupportedModelId) => {
    switch (id) {
      case "sonnet":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "opus":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "gemini":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] border border-white/10 rounded-xl">
        {models.map((m) => {
          const isSelected = activeModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelect(m.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? "bg-white/15 text-white font-bold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title={m.description}
            >
              {getModelIcon(m.id)}
              <span>{m.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Motor de Inteligência Artificial (Vertex AI)
          </span>
        </div>
        <span className="text-[10px] text-zinc-400">
          Execução 100% segura no backend Node.js
        </span>
      </div>

      {backendStatus && (
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>GCP Project: <strong className="text-zinc-200">{backendStatus.gcpProject}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span>Região: <strong className="text-zinc-300">{backendStatus.gcpRegion}</strong></span>
            <span>·</span>
            <span>Auth: <strong className="text-emerald-300">ADC / Cloud Run</strong></span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {models.map((m) => {
          const isSelected = activeModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelect(m.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                isSelected
                  ? "bg-white/10 border-emerald-500/60 text-white shadow-lg ring-1 ring-emerald-500/30"
                  : "bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.06] hover:border-white/20"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                      {getModelIcon(m.id)}
                    </div>
                    <span className="text-xs font-bold text-white tracking-tight">
                      {m.name}
                    </span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                </div>

                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${getBadgeStyle(m.id)}`}>
                    {m.badge}
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate">
                    {m.provider}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                  {m.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
