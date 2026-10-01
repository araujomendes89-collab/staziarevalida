import React, { useState, useEffect } from "react";
import {
  Brain,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Code,
  Layers,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  BookOpen,
  Calendar,
  Search,
  Zap,
  Globe,
  Database,
  Cpu,
  RefreshCw,
  Sliders,
  BookmarkCheck,
  Check,
  HelpCircle,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  FunctionCallingService,
  AgentRunResponse,
  ToolExecutionStep,
  ToolCatalogItem,
} from "../../services/functionCallingService";

export const FunctionCallingAgentView: React.FC = () => {
  const { setActiveTab } = useApp();

  const [prompt, setPrompt] = useState(
    "Monte uma prova de 30 questões focada nas matérias em que estou pior."
  );
  const [selectedModel, setSelectedModel] = useState<"gemini" | "sonnet" | "opus">("gemini");
  const [enableGoogleSearch, setEnableGoogleSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTabMode, setActiveTabMode] = useState<"agent" | "tools">("agent");

  const [agentResult, setAgentResult] = useState<AgentRunResponse | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogItem[]>([]);
  const [selectedToolForTest, setSelectedToolForTest] = useState<ToolCatalogItem | null>(null);
  const [testToolArgs, setTestToolArgs] = useState("{}");
  const [testToolResult, setTestToolResult] = useState<any>(null);
  const [isTestingTool, setIsTestingTool] = useState(false);

  // Quick Preset Queries
  const promptPresets = [
    {
      label: "🎯 Prova em Pontos Fracos (30Q)",
      prompt: "Monte uma prova de 30 questões focada nas matérias em que estou pior.",
      description: "Consulta desempenho ➔ Identifica pontos fracos ➔ Seleciona 30 questões ➔ Cria e salva simulado.",
    },
    {
      label: "📋 Protocolo + 2 Flashcards",
      prompt: "Busque o protocolo oficial de Pré-Eclâmpsia e crie 2 flashcards de conduta imediata para revisão SM-2.",
      description: "Consulta PCDT do MS ➔ Estrutura 2 flashcards de memorização ativa.",
    },
    {
      label: "🔍 Questões Difíceis de Clínica",
      prompt: "Consulte meu desempenho e busque 15 questões de alta dificuldade de Clínica Médica com foco em Gasometria e Tuberculose.",
      description: "Filtra questões difíceis para treino aprofundado.",
    },
    {
      label: "📅 Plano de Estudo (3 Semanas)",
      prompt: "Analise minhas vulnerabilidades e monte um plano de estudo de 3 semanas focado em Preventiva e Clínica.",
      description: "Calcula horas diárias, metas de questões e cronograma espaçado.",
    },
    {
      label: "🔄 Atualizações PCDT 2026",
      prompt: "Busque atualizações de diretrizes 2026 em Tuberculose e esquema RIPE e verifique novidades para a prova.",
      description: "Pesquisa normas recentes e diretrizes ministeriais atualizadas.",
    },
  ];

  useEffect(() => {
    FunctionCallingService.getToolCatalog().then((tools) => {
      setToolCatalog(tools);
    });
  }, []);

  const handleRunAgent = async (customPrompt?: string) => {
    const targetPrompt = customPrompt || prompt;
    if (!targetPrompt.trim() || isLoading) return;

    setIsLoading(true);
    setAgentResult(null);

    try {
      const result = await FunctionCallingService.runAgent(targetPrompt, {
        preferredModel: selectedModel,
        enableGoogleSearch,
      });

      setAgentResult(result);

      // Auto expand all steps
      const newExpanded: Record<number, boolean> = {};
      result.executionTrace.forEach((s) => {
        newExpanded[s.stepNumber] = true;
      });
      setExpandedSteps(newExpanded);
    } catch (error: any) {
      console.error("Agent execution error:", error);
      alert(`Erro na execução do agente: ${error?.message || "Tente novamente"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStepExpand = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }));
  };

  const handleStartGeneratedExam = () => {
    setActiveTab("questions");
  };

  const handleRunDirectTool = async () => {
    if (!selectedToolForTest) return;
    setIsTestingTool(true);
    setTestToolResult(null);

    try {
      const parsedArgs = JSON.parse(testToolArgs || "{}");
      const res = await FunctionCallingService.executeToolDirectly(selectedToolForTest.name, parsedArgs);
      setTestToolResult(res);
    } catch (err: any) {
      setTestToolResult({ error: err?.message || "JSON inválido ou erro de execução" });
    } finally {
      setIsTestingTool(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* 1. HERO HEADER */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d101f] via-[#11162b] to-[#0d101f] border border-purple-500/30 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Agente Autônomo & Function Calling
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold">
                  Gemini 3.7 & Claude Tools
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 mt-1">
                A IA pode consultar seu desempenho, diagnosticar pontos cegos, buscar no banco oficial e montar simulados autonomamente via ferramentas internas.
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center p-1 rounded-xl bg-black/40 border border-white/10 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTabMode("agent")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTabMode === "agent"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Console do Agente</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTabMode("tools")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTabMode === "tools"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Catálogo de Ferramentas ({toolCatalog.length})</span>
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Modelo Principal:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as any)}
                className="bg-black/60 border border-white/20 rounded-lg px-2.5 py-1 text-purple-200 font-medium text-xs focus:outline-none focus:border-purple-400 cursor-pointer"
              >
                <option value="gemini">Gemini 3.7 Flash (Function Calling Nativo + Velocidade)</option>
                <option value="sonnet">Claude Sonnet 5 (Vertex AI Raciocínio Clínico)</option>
                <option value="opus">Claude Opus 5 (Máxima Profundidade Diagnóstica)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableGoogleSearch}
                onChange={(e) => setEnableGoogleSearch(e.target.checked)}
                className="rounded border-zinc-700 text-purple-600 focus:ring-purple-500 bg-black/50"
              />
              <span className="flex items-center gap-1 text-xs">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                Combinar com Google Search Grounding (Diretrizes 2026)
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px]">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>12 Ferramentas Médicas Prontas</span>
          </div>
        </div>
      </div>

      {activeTabMode === "agent" ? (
        <>
          {/* 2. PROMPT PRESETS & INPUT */}
          <div className="p-5 rounded-2xl bg-[#0f111a] border border-white/10 shadow-lg space-y-4">
            <div>
              <label className="text-xs font-bold text-zinc-300 mb-2 block uppercase tracking-wider">
                Exemplos de Comandos Autônomos (Clique para testar):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {promptPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(preset.prompt);
                      handleRunAgent(preset.prompt);
                    }}
                    className="p-3 rounded-xl bg-white/5 hover:bg-purple-950/40 border border-white/5 hover:border-purple-500/40 text-left transition-all cursor-pointer group"
                  >
                    <div className="font-bold text-xs text-white group-hover:text-purple-300 flex items-center justify-between">
                      <span>{preset.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400" />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input Field */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                Ou digite seu comando livre para o Preceptor IA:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ex: Monte uma prova de 30 questões focada nas matérias em que estou pior..."
                    rows={2}
                    className="w-full bg-black/60 border border-white/15 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none resize-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={isLoading || !prompt.trim()}
                  onClick={() => handleRunAgent()}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Executando Ferramentas...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Executar Autonomamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 3. AUTONOMOUS DAG EXECUTION VISUALIZER */}
          {isLoading && (
            <div className="p-8 rounded-2xl bg-[#0f111a] border border-purple-500/30 text-center space-y-4 animate-pulse">
              <div className="inline-flex p-3 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
                <Brain className="w-8 h-8 animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Preceptor IA Orquestrando Ferramentas...
                </h3>
                <p className="text-xs text-purple-200 mt-1">
                  Consultando base do aluno, filtrando questões no banco oficial e montando sessão adaptativa.
                </p>
              </div>
              <div className="max-w-md mx-auto flex items-center justify-center gap-2 text-xs font-mono text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                <span>Chamando Function Calling em tempo real...</span>
              </div>
            </div>
          )}

          {agentResult && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* DAG Execution Steps */}
              <div className="p-5 rounded-2xl bg-[#0f111a] border border-purple-500/30 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        Cadeia de Execução Autônoma ({agentResult.executionTrace.length} Etapas)
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Ferramentas chamadas pelo modelo em ordem sequencial com dados reais do estudante.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Duração total: {agentResult.totalDurationMs}ms</span>
                  </div>
                </div>

                {/* Flow Pills Visualizer */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 overflow-x-auto">
                  <div className="flex items-center gap-2 min-w-max">
                    {agentResult.executionTrace.map((step, idx) => (
                      <React.Fragment key={step.stepNumber}>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-950/50 border border-purple-500/30 text-xs font-mono text-purple-200">
                          <span className="w-4 h-4 rounded-full bg-purple-500/30 text-white font-bold text-[10px] flex items-center justify-center">
                            {step.stepNumber}
                          </span>
                          <span className="font-semibold">{step.toolName}()</span>
                          <span className="text-[10px] text-zinc-400">({step.durationMs}ms)</span>
                        </div>
                        {idx < agentResult.executionTrace.length - 1 && (
                          <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Step-by-Step Breakdown Accordion */}
                <div className="space-y-2">
                  {agentResult.executionTrace.map((step) => {
                    const isExpanded = expandedSteps[step.stepNumber];
                    return (
                      <div
                        key={step.stepNumber}
                        className="rounded-xl border border-white/10 bg-black/30 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleStepExpand(step.stepNumber)}
                          className="w-full p-3.5 text-left flex items-center justify-between gap-3 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold text-xs flex items-center justify-center border border-purple-500/30">
                              {step.stepNumber}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-purple-300">
                                  {step.toolLabel}
                                </span>
                                <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  Sucesso
                                </span>
                              </div>
                              <p className="text-xs text-zinc-300 mt-0.5">{step.summary}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            <span className="font-mono text-[11px]">{step.durationMs}ms</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-4 border-t border-white/10 bg-black/50 space-y-3 text-xs font-mono">
                            <div>
                              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                                Argumentos Enviados:
                              </span>
                              <pre className="p-2.5 rounded-lg bg-black/70 border border-white/10 text-emerald-300 overflow-x-auto text-[11px]">
                                {JSON.stringify(step.arguments, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                                Retorno da Ferramenta:
                              </span>
                              <pre className="p-2.5 rounded-lg bg-black/70 border border-white/10 text-purple-200 overflow-x-auto text-[11px] max-h-64">
                                {JSON.stringify(step.result, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. FINAL SYNTHESIS & ARTIFACT ACTION CARD */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-[#120f29] via-[#0f111f] to-[#120f29] border border-purple-500/40 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Síntese Pedagógica do Preceptor IA
                    </h3>
                    <span className="text-xs text-zinc-400">
                      Decisão orientada por métricas cognitivas e matriz INEP 2026
                    </span>
                  </div>
                </div>

                {/* Preceptor Output Text */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {agentResult.finalResponse}
                </div>

                {/* Actionable Artifacts Ready to Use */}
                {agentResult.artifacts?.simulado && (
                  <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300">
                        <FileQuestion className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {agentResult.artifacts.simulado.titulo}
                          </span>
                          <span className="px-2 py-0.2 rounded-full bg-purple-500/30 text-purple-200 text-xs font-mono font-bold">
                            {agentResult.artifacts.simulado.totalQuestoes} Questões
                          </span>
                        </div>
                        <p className="text-xs text-purple-200 mt-0.5">
                          {agentResult.artifacts.simulado.foco} · Duração recomendada: {agentResult.artifacts.simulado.duracaoMinutos} minutos
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartGeneratedExam}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Iniciar Simulado Agora</span>
                    </button>
                  </div>
                )}

                {agentResult.artifacts?.flashcards && agentResult.artifacts.flashcards.length > 0 && (
                  <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300">
                        <BookmarkCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-white text-sm">
                          {agentResult.artifacts.flashcards.length} Flashcards Gerados no Baralho SM-2
                        </span>
                        <p className="text-xs text-indigo-200 mt-0.5">
                          Prontos para repetição espaçada e memorização ativa.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab("review")}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Ver Flashcards na Revisão</span>
                    </button>
                  </div>
                )}

                {agentResult.artifacts?.planoEstudo && (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-white text-sm">
                          Plano Estratégico de {agentResult.artifacts.planoEstudo.semanas} Semanas
                        </span>
                        <p className="text-xs text-emerald-200 mt-0.5">
                          Meta de {agentResult.artifacts.planoEstudo.cronograma.reduce((acc, c) => acc + c.metaQuestoes, 0)} questões com foco em {agentResult.artifacts.planoEstudo.focoAreas.join(", ")}.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab("calendar")}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Abrir no Calendário</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* 5. TOOL CATALOG & PLAYGROUND TAB */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {toolCatalog.map((tool) => (
              <div
                key={tool.name}
                className="p-4 rounded-xl bg-[#0f111a] border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between gap-3 group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-purple-300 group-hover:text-purple-200">
                      {tool.label}
                    </span>
                    <span className="px-2 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono">
                      Native Tool
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                    {tool.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Parâmetros: {tool.parameters?.properties ? Object.keys(tool.parameters.properties).length : 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedToolForTest(tool);
                      setTestToolArgs(
                        tool.name === "consultar_desempenho"
                          ? '{\n  "area": "PREVENTIVA"\n}'
                          : tool.name === "buscar_questoes"
                          ? '{\n  "areas": ["PREVENTIVA", "CLINICA_MEDICA"],\n  "quantidade": 5\n}'
                          : tool.name === "buscar_protocolo"
                          ? '{\n  "tema": "Pré-eclâmpsia"\n}'
                          : '{\n  "limite": 3\n}'
                      );
                      setTestToolResult(null);
                    }}
                    className="text-xs text-purple-400 hover:text-white font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Testar Ferramenta</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Tool Test Modal / Box */}
          {selectedToolForTest && (
            <div className="p-5 rounded-2xl bg-black/60 border border-purple-500/40 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">
                    Testar Ferramenta: <span className="font-mono text-purple-300">{selectedToolForTest.name}()</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedToolForTest(null)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Fechar Teste
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1">
                    Argumentos JSON (Input):
                  </label>
                  <textarea
                    value={testToolArgs}
                    onChange={(e) => setTestToolArgs(e.target.value)}
                    rows={6}
                    className="w-full bg-black/80 border border-white/20 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    disabled={isTestingTool}
                    onClick={handleRunDirectTool}
                    className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 cursor-pointer transition-all"
                  >
                    {isTestingTool ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Executando...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Executar Diretamente</span>
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1">
                    Retorno da Ferramenta (Output):
                  </label>
                  <pre className="w-full h-44 bg-black/80 border border-white/20 rounded-xl p-3 text-xs font-mono text-purple-200 overflow-auto">
                    {testToolResult ? JSON.stringify(testToolResult, null, 2) : "// Clique em 'Executar Diretamente' para testar a resposta."}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
