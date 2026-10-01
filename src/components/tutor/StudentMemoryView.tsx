import React, { useState } from "react";
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Edit3,
  BookOpen,
  Send,
  Sliders,
  Zap,
  Check,
  ShieldCheck,
  HelpCircle,
  Copy,
  ChevronRight,
} from "lucide-react";
import {
  StudentMemoryService,
  StudentCognitiveProfile,
  RecurrentErrorItem,
} from "../../services/studentMemoryService";
import { AiService, TutorResponse } from "../../services/aiService";
import { Question } from "../../types";
import { useApp } from "../../context/AppContext";

interface StudentMemoryViewProps {
  onStartRemediationSession?: (topic: string) => void;
  onNavigateToQuestions?: () => void;
}

export const StudentMemoryView: React.FC<StudentMemoryViewProps> = ({
  onStartRemediationSession,
  onNavigateToQuestions,
}) => {
  const { questions } = useApp();
  const [profile, setProfile] = useState<StudentCognitiveProfile>(() =>
    StudentMemoryService.getProfile()
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.studentName);
  const [selectedError, setSelectedError] = useState<RecurrentErrorItem | null>(
    profile.recurrentErrors && profile.recurrentErrors.length > 0
      ? profile.recurrentErrors[0]
      : null
  );
  const [simulatedAiQuery, setSimulatedAiQuery] = useState(
    "Quais os critérios para diferenciar pré-eclâmpsia de hipertensão gestacional?"
  );
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [liveAiResponse, setLiveAiResponse] = useState<TutorResponse | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeModel, setActiveModel] = useState<"sonnet" | "opus" | "gemini">("sonnet");

  const handleSaveName = () => {
    const updated = StudentMemoryService.setStudentName(nameInput);
    setProfile(updated);
    setIsEditingName(false);
  };

  const handleSelectError = (item: RecurrentErrorItem) => {
    setSelectedError(item);
    if (item.id === "rec-preeclampsia") {
      setSimulatedAiQuery(
        "Quais os critérios para diferenciar pré-eclâmpsia de hipertensão gestacional?"
      );
    } else if (item.id === "rec-gasometria") {
      setSimulatedAiQuery(
        "Como calcular a compensação respiratória na acidose metabólica pela fórmula de Winter?"
      );
    } else if (item.id === "rec-vacinacao") {
      setSimulatedAiQuery(
        "Gestante de 14 semanas pode tomar vacina de febre amarela ou tríplice viral?"
      );
    } else if (item.id === "rec-tuberculose") {
      setSimulatedAiQuery(
        "Quando suspender o esquema RIPE por hepatotoxicidade na atenção básica?"
      );
    } else {
      setSimulatedAiQuery(
        "Qual a rotina de exames do Ministério da Saúde para o 2º trimestre de gestação?"
      );
    }
    setLiveAiResponse(null);
  };

  const handleRunAiWithMemory = async () => {
    setIsAiLoading(true);
    setLiveAiResponse(null);

    // Find real question from the questions pool
    const realQuestion =
      questions.find((q) => selectedError?.questionIds?.includes(q.id)) ||
      questions.find((q) => q.area === selectedError?.area) ||
      questions[0];

    try {
      const response = await AiService.askTutor({
        mode: "autopsy",
        questionContext: realQuestion,
        userAnswer: realQuestion?.options?.find((o) => !o.isCorrect)?.id || "A",
        correctAnswer: realQuestion?.correctAnswer || "B",
        userQuery: simulatedAiQuery,
        preferredModel: activeModel,
      });
      setLiveAiResponse(response);
    } catch (e: any) {
      setLiveAiResponse({
        text: `> 🧠 **Memória Cognitiva Ativa:** *"Baseando-se no seu histórico de estudos e nos critérios do Ministério da Saúde, vamos revisar a conduta recomendada."*\n\n### 🩺 Raciocínio Clínico Direcionado\n\nNo Revalida INEP, o diagnóstico e a conduta seguem estritamente os protocolos clínicos do Ministério da Saúde (PCDT) e a Atenção Primária no SUS.`,
        source: `Motor IA: ${activeModel.toUpperCase()} · Memória Cognitiva do Aluno`,
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopyPrompt = () => {
    const prompt = StudentMemoryService.getCognitivePromptInjection();
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleResetProfile = () => {
    if (window.confirm("Deseja reinicializar a memória cognitiva para o estado padrão do seu perfil?")) {
      const reset = StudentMemoryService.getDefaultProfile(profile.studentName);
      StudentMemoryService.saveProfile(reset);
      setProfile(reset);
      setSelectedError(null);
    }
  };

  const { specialtiesMastery, recurrentErrors } = profile;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-zinc-900 via-[#12141f] to-zinc-900 border border-white/10 shadow-lg">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
            <Brain className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Memória Real do Estudante
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30">
                Cognitive Memory Engine
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Diferente de um chat genérico descartável, este sistema monitora seu histórico
              real de tentativas, taxas de acerto por especialidade e padrões de confusão recorrentes.
            </p>
          </div>
        </div>

        {/* Student Identity Card */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 shrink-0">
          {isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="bg-black/60 border border-purple-500/50 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                placeholder="Nome do Aluno"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="p-1.5 rounded-lg bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center">
                {profile.studentName.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{profile.studentName}</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Editar nome do estudante"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </p>
                <p className="text-[10px] text-zinc-400 font-mono">
                  {profile.targetExam} · {profile.totalQuestionsAnswered} questões
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Specialty Mastery (ASCII + Visual) & Recurrent Errors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Specialty Mastery with Precision ASCII Bars */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-[#0b0d14] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Domínio por Grande Área</span>
              </h2>
              <span className="text-[10px] text-zinc-400 font-mono">
                ASCII & Percentual Real
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              O sistema calcula e memoriza a densidade de retenção cirúrgica em cada uma das 5 grandes áreas:
            </p>

            <div className="space-y-3 font-mono">
              {Object.values(specialtiesMastery).map((item) => (
                <div
                  key={item.areaKey}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-sans font-semibold text-white">{item.label}</span>
                    <span
                      className={`font-bold ${
                        item.percentage >= 80
                          ? "text-emerald-400"
                          : item.percentage >= 60
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {item.percentage}%
                    </span>
                  </div>
                  <div
                    className={`text-xs tracking-wider select-all font-mono ${
                      item.percentage >= 80
                        ? "text-emerald-400/90"
                        : item.percentage >= 60
                        ? "text-amber-400/90"
                        : "text-rose-400/90"
                    }`}
                  >
                    {item.asciiBar}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick action: Cognitive prompt preview */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedPrompt ? "Prompt Copiado!" : "Copiar Injeção de Prompt IA"}</span>
              </button>
              <button
                type="button"
                onClick={handleResetProfile}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Restaurar Padrão
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Recurrent Error Patterns (Cognitive Blindspots) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-2xl bg-[#0b0d14] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white">
                  Erros Recorrentes Identificados (Pontos Cegos)
                </h2>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                {recurrentErrors.length} {recurrentErrors.length === 1 ? "tema mapeado" : "temas mapeados"}
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              O sistema detecta automaticamente repetições de falha em conceitos específicos e
              alimenta o preceptor de IA para intervir proativamente:
            </p>

            {/* List of Recurrent Errors or Clean Empty State */}
            {recurrentErrors.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 mx-auto flex items-center justify-center">
                  <Brain className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-bold text-white">Memória Pronta para Aprendizado</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Nenhum ponto cego registrado até o momento. Conforme você resolver questões oficiais e registrar suas dúvidas, o motor neural mapeará automaticamente suas lacunas cognitivas.
                </p>
                {onNavigateToQuestions && (
                  <button
                    type="button"
                    onClick={onNavigateToQuestions}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Resolver Questões Oficiais
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {recurrentErrors.map((err) => {
                  const isSelected = selectedError?.id === err.id;
                  return (
                    <div
                      key={err.id}
                      onClick={() => handleSelectError(err)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-purple-950/40 border-purple-500/60 shadow-md ring-1 ring-purple-500/30"
                          : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xs font-bold text-white capitalize">
                                • {err.topic}
                              </h3>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                                  err.errorCount >= 3
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                }`}
                              >
                                {err.errorCount} erros
                              </span>
                            </div>
                            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                              {err.specificConfusion}
                            </p>
                          </div>
                        </div>

                        <ChevronRight
                          className={`w-4 h-4 shrink-0 transition-transform ${
                            isSelected ? "text-purple-400 rotate-90" : "text-zinc-600"
                          }`}
                        />
                      </div>

                      {/* Simulated Tutor quote */}
                      <div className="mt-2.5 pt-2.5 border-t border-white/5 flex items-start gap-2 text-xs text-purple-300 italic bg-purple-950/20 p-2.5 rounded-lg">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                        <span>"{err.tutorRecommendation}"</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive AI Memory Demonstration & Live Simulator */}
      <div className="p-6 rounded-2xl bg-[#0e101a] border border-purple-500/30 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Simulador do Tutor com Memória Ativa
              </h3>
              <p className="text-xs text-zinc-400">
                Veja a diferença radical entre um chat comum sem memória e a intervenção personalizada baseada no seu histórico.
              </p>
            </div>
          </div>

          {/* Model Selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 text-xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveModel("sonnet")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                activeModel === "sonnet"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Claude Sonnet 5
            </button>
            <button
              type="button"
              onClick={() => setActiveModel("opus")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                activeModel === "opus"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Claude Opus 5
            </button>
            <button
              type="button"
              onClick={() => setActiveModel("gemini")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                activeModel === "gemini"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Gemini 3.7
            </button>
          </div>
        </div>

        {/* Side by side comparison: Chat Tradicional vs Memória Real */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chat Tradicional (Generic) */}
          <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2 opacity-70">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
              <span>❌ Chat Tradicional (Sem Memória)</span>
              <span className="text-[10px] text-zinc-500">Genérico</span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 leading-relaxed font-sans">
              "Olá! Sou seu assistente de estudos. Como posso ajudar com suas dúvidas médicas hoje? Qual tema você quer praticar?"
            </div>
            <p className="text-[11px] text-zinc-500 italic">
              Não sabe quem é o aluno, não lembra dos erros prévios e trata cada pergunta isoladamente.
            </p>
          </div>

          {/* Memória Real (StaziaMed Revalida) */}
          <div className="p-4 rounded-xl bg-purple-950/25 border border-purple-500/40 space-y-2">
            <div className="flex items-center justify-between text-xs text-purple-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                ✅ Memória Real do Estudante
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-purple-500/30 text-purple-200">
                Hipercontextualizado
              </span>
            </div>
            <div className="p-3 rounded-lg bg-purple-900/30 border border-purple-500/30 text-xs text-purple-100 font-medium leading-relaxed font-sans">
              {selectedError
                ? `“Você já errou ${selectedError.errorCount} questões envolvendo ${selectedError.specificConfusion}. Vou priorizar esse tema na revisão.”`
                : `“Olá, ${profile.studentName}. Seu perfil cognitivo está pronto. Conforme você resolver questões oficiais, mapearei suas vulnerabilidades clínicas.”`}
            </div>
            <p className="text-[11px] text-purple-300/80">
              Cruza em tempo real o histórico de <strong>{profile.studentName}</strong> e aplica intervenção cirúrgica na matriz do INEP.
            </p>
          </div>
        </div>

        {/* Live Interactive Query Input */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-bold text-zinc-300">
            Testar Pergunta com Memória Ativa no Tema:{" "}
            <span className="text-purple-400">"{selectedError?.topic || "Diagnóstico Clínico / Dúvida Geral"}"</span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={simulatedAiQuery}
              onChange={(e) => setSimulatedAiQuery(e.target.value)}
              className="flex-1 bg-black/60 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              placeholder="Digite uma dúvida sobre este tema..."
            />

            <button
              type="button"
              onClick={handleRunAiWithMemory}
              disabled={isAiLoading}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer shadow-md"
            >
              {isAiLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Consultando Memória...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Executar Preceptor IA</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live AI Response Output */}
        {liveAiResponse && (
          <div className="p-4 rounded-xl bg-[#090b12] border border-purple-500/40 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-white">Resposta com Memória Ativa</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">
                {liveAiResponse.source}
              </span>
            </div>

            <div className="prose prose-invert prose-xs max-w-none text-zinc-200 text-xs leading-relaxed whitespace-pre-line">
              {liveAiResponse.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
