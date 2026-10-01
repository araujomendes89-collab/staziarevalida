import React, { useState } from "react";
import {
  BrainCircuit,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  BarChart3,
  BookOpenCheck,
  AlertCircle,
  FileText,
  Search,
  Cpu,
  RefreshCw,
  TrendingUp,
  Stethoscope,
} from "lucide-react";
import { ALL_GRANDES_TEMAS } from "../../data/grandesTemas";
import { QuestionFactoryService } from "../../services/questionFactoryService";
import { GrandeTema } from "../../types/grandesTemas";

export const PIPELINE_STEPS = [
  { id: 1, label: "Provas Históricas", icon: FileText, desc: "2011-2026/1 INEP" },
  { id: 2, label: "Questões do Tema", icon: Layers, desc: "Recorrência e frequência" },
  { id: 3, label: "Gabaritos Oficiais", icon: CheckCircle2, desc: "Padrão de acerto da banca" },
  { id: 4, label: "Análise da Estrutura", icon: Search, desc: "Vinhetas SUS e dados clínicos" },
  { id: 5, label: "Identificação da Competência", icon: Stethoscope, desc: "Diagnóstico vs Conduta" },
  { id: 6, label: "Matriz Cognitiva", icon: Cpu, desc: "Estratificação e prioridades" },
  { id: 7, label: "Padrões de Distratores", icon: AlertCircle, desc: "Pegadinhas e plausibilidade" },
  { id: 8, label: "Padrão de Cobrança do INEP", icon: BrainCircuit, desc: "DNA de estilo e comandos" },
  { id: 9, label: "Protocolos Vigentes", icon: ShieldCheck, desc: "PCDT SUS & Diretrizes 2026" },
  { id: 10, label: "Geração de Casos Novos", icon: Sparkles, desc: "Sonnet 5 + Gemini 3.7" },
  { id: 11, label: "Criação das Alternativas", icon: BarChart3, desc: "1 gabarito + 3 distratores" },
  { id: 12, label: "Auditoria Adversarial", icon: ShieldCheck, desc: "Opus 5 validação cega" },
  { id: 13, label: "Aprovação & Publicação", icon: CheckCircle2, desc: "100% calibrada para o aluno" },
];

export const LIVE_PROCESSING_STAGES = [
  "1. Analisando banco histórico...",
  "2. Identificando padrões do INEP...",
  "3. Construindo matriz cognitiva...",
  "4. Consultando protocolo...",
  "5. Criando caso clínico...",
  "6. Criando distratores...",
  "7. Validando gabarito...",
  "8. Verificando originalidade...",
  "9. Auditando questão...",
  "10. Finalizando...",
];

interface ReverseEngineeringFlowProps {
  onSelectThemeForGeneration?: (areaName: string, themeTitle: string) => void;
}

export const ReverseEngineeringFlow: React.FC<ReverseEngineeringFlowProps> = ({
  onSelectThemeForGeneration,
}) => {
  const [selectedThemeId, setSelectedThemeId] = useState<string>(ALL_GRANDES_TEMAS[0]?.id || "cm-01");
  const [filterArea, setFilterArea] = useState<string>("todas");

  const selectedTheme: GrandeTema | undefined = ALL_GRANDES_TEMAS.find(
    (t) => t.id === selectedThemeId
  );

  const themeDna = selectedTheme
    ? QuestionFactoryService.getThemeDna(selectedTheme.title)
    : null;

  const filteredThemes = ALL_GRANDES_TEMAS.filter((t) => {
    if (filterArea === "todas") return true;
    return t.areaId === filterArea;
  });

  return (
    <div className="space-y-6">
      {/* Visual Pipeline Flowchart Header */}
      <div className="p-6 rounded-2xl bg-[#101827] border border-slate-700 space-y-4 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-blue-400" />
              <span>Pipeline de Engenharia Reversa Avançada</span>
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl">
              Geração de questões inéditas guiada por 13 etapas de desconstrução das provas históricas do Revalida INEP, validação de diretrizes SUS 2026 e auditoria adversarial com Claude Opus 5.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-900 text-blue-200 border border-blue-500/60 w-fit">
            INEP Reverse Engine v4.2
          </span>
        </div>

        {/* 13-Step Flow Diagram */}
        <div className="overflow-x-auto pb-3 pt-2">
          <div className="flex items-center gap-1.5 min-w-[980px]">
            {PIPELINE_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <React.Fragment key={step.id}>
                  <div className="flex-1 min-w-[110px] p-2.5 rounded-xl bg-[#1a2638] border border-slate-600 hover:border-blue-400 transition-colors group">
                    <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                      <StepIcon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-mono font-bold text-slate-300">
                        {String(step.id).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-50 truncate" title={step.label}>
                      {step.label}
                    </div>
                    <div className="text-[10px] text-slate-300 truncate mt-0.5" title={step.desc}>
                      {step.desc}
                    </div>
                  </div>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Theme DNA Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Theme Selector */}
        <div className="p-5 rounded-2xl bg-[#0d1017] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <BookOpenCheck className="w-4 h-4 text-emerald-400" />
              <span>Matriz dos 75 Grandes Temas</span>
            </h4>
            <span className="text-xs text-zinc-400 font-mono">
              {filteredThemes.length} temas
            </span>
          </div>

          {/* Area Selector Filter */}
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            className="w-full bg-[#151923] text-xs text-zinc-200 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="todas">Todas as 5 Áreas Médicas</option>
            <option value="clinica-medica">Clínica Médica</option>
            <option value="cirurgia-geral">Cirurgia Geral</option>
            <option value="pediatria">Pediatria</option>
            <option value="ginecologia-obstetricia">Ginecologia e Obstetrícia</option>
            <option value="medicina-preventiva">Medicina Preventiva & SUS</option>
          </select>

          {/* Themes List */}
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {filteredThemes.map((tema, idx) => {
              const isSelected = tema.id === selectedThemeId;
              return (
                <button
                  key={tema.id}
                  type="button"
                  onClick={() => setSelectedThemeId(tema.id)}
                  className={`w-full text-left p-3 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer border ${
                    isSelected
                      ? "bg-blue-600/20 border-blue-500/50 text-white font-bold"
                      : "bg-white/[0.02] border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="truncate mr-2">
                    <span className="text-[10px] font-mono text-zinc-400 mr-1.5">
                      #{idx + 1}
                    </span>
                    <span>{tema.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {tema.recurrence === "altissima" && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-300 font-mono">
                        Alta
                      </span>
                    )}
                    {tema.hasProtocolUpdate && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono">
                        2026
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed DNA & Reverse Engineering Blueprint */}
        {selectedTheme && (
          <div className="lg:col-span-2 space-y-4">
            <div className="p-6 rounded-2xl bg-[#0d1017] border border-white/10 space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {selectedTheme.areaName}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      Recorrência: <strong>{selectedTheme.recurrence.toUpperCase()}</strong>
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{selectedTheme.title}</h3>
                </div>

                {onSelectThemeForGeneration && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectThemeForGeneration(selectedTheme.areaName, selectedTheme.title)
                    }
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg transition-all hover:scale-105"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Gerar Questões Deste Tema</span>
                  </button>
                )}
              </div>

              {/* Cognitive Distribution in INEP */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <span>Distribuição de Cobrança Histórica no INEP</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <span className="text-[11px] text-zinc-400">Diagnóstico Clínico</span>
                    <div className="text-base font-bold text-white">
                      {Math.round((themeDna?.historical_patterns?.diagnosis || 0.25) * 100)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <span className="text-[11px] text-zinc-400">Conduta Inicial no SUS</span>
                    <div className="text-base font-bold text-emerald-400">
                      {Math.round((themeDna?.historical_patterns?.initial_management || 0.35) * 100)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <span className="text-[11px] text-zinc-400">Reconhecimento de Risco</span>
                    <div className="text-base font-bold text-amber-400">
                      {Math.round((themeDna?.historical_patterns?.severity_recognition || 0.25) * 100)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <span className="text-[11px] text-zinc-400">Farmacologia / PCDT</span>
                    <div className="text-base font-bold text-purple-400">
                      {Math.round((themeDna?.historical_patterns?.pharmacology_protocol || 0.15) * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Distractor Archetypes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>Padrões de Distratores da Banca INEP</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-300">Conduta correta, mas intempestiva</span>
                    <p className="text-[11px] text-zinc-300">
                      Oferece o tratamento definitivo antes da estabilização hemodinâmica ou exame confirmatório essencial.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-300">Diagnóstico Diferencial Clássico</span>
                    <p className="text-[11px] text-zinc-300">
                      Apresenta sinais sugestivos de patologia similar sem atender aos critérios mínimos de definição de caso.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-300">Diretriz Desatualizada</span>
                    <p className="text-[11px] text-zinc-300">
                      Prescrição de conduta padrão em diretrizes antigas (ex: antibióticos de 2ª linha ou cortes laboratoriais obsoletos).
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-300">Violação de Fluxo SUS</span>
                    <p className="text-[11px] text-zinc-300">
                      Encaminhamento terciário direto sem esgotar as competências resolutivas da Atenção Básica / UBS.
                    </p>
                  </div>
                </div>
              </div>

              {/* Protocol Grounding */}
              <div className="p-4 rounded-xl bg-[#08090e] border border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Protocolo de Referência SUS Atualizado
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Verificado para Revalida 2026
                  </span>
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">
                  {selectedTheme.summary}
                </p>
                <div className="text-[11px] text-zinc-400 pt-1 border-t border-white/5 flex items-center justify-between">
                  <span>Diagnóstico mais cobrado: <strong className="text-white">{selectedTheme.inepInsights.mostTestedDiagnosis}</strong></span>
                  <span>Conduta: <strong className="text-emerald-300">{selectedTheme.inepInsights.mostTestedConduct}</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
