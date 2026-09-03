import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Brain,
  HelpCircle,
  FileText,
  ShieldCheck,
  AlertOctagon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  BookOpen,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Layers,
  Send,
  Loader2,
  Copy,
  Check,
  Flame,
  Scale,
} from "lucide-react";
import { Question, ErrorTaxonomy, ConfidenceLevel, SisterQuestionMatch } from "../../types";
import { AiService, TutorResponse } from "../../services/aiService";
import { SessionBuilderService } from "../../services/sessionBuilderService";
import { StudentMemoryService } from "../../services/studentMemoryService";
import { QuestionAuditModal } from "./QuestionAuditModal";

interface LayeredCorrectionFeedbackProps {
  question: Question;
  selectedOption: "A" | "B" | "C" | "D";
  confidence?: ConfidenceLevel;
  allQuestions: Question[];
  onNextQuestion: () => void;
  isLastQuestion: boolean;
  onSaveErrorReflection: (errorReason: ErrorTaxonomy, reflection?: string) => void;
  onStartSisterTraining?: (sisterQuestionIds: string[]) => void;
}

export const LayeredCorrectionFeedback: React.FC<LayeredCorrectionFeedbackProps> = ({
  question,
  selectedOption,
  allQuestions,
  onNextQuestion,
  isLastQuestion,
  onSaveErrorReflection,
  onStartSisterTraining,
}) => {
  const isCorrect = question.options.find((o) => o.id === selectedOption)?.isCorrect ?? false;
  const correctOption = question.options.find((o) => o.isCorrect);

  // Layer toggle states (progressive disclosure)
  const [activeTab, setActiveTab] = useState<"REASONING" | "DISTRACTORS" | "SUMMARY" | "AI_TUTOR">("REASONING");
  const [selectedErrorReason, setSelectedErrorReason] = useState<ErrorTaxonomy | null>(null);
  const [hasSavedReflection, setHasSavedReflection] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Gemini AI Tutor state
  const [aiMode, setAiMode] = useState<"autopsy" | "socratic" | "simplify" | "compare" | "brazil_terminology">("autopsy");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<TutorResponse | null>(null);
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Sister Questions
  const sisterQuestions: SisterQuestionMatch[] = React.useMemo(() => {
    return SessionBuilderService.getSisterQuestions(question, allQuestions);
  }, [question, allQuestions]);

  // Cognitive Student Memory Matching
  const recurrentError = React.useMemo(() => {
    return StudentMemoryService.findMatchingRecurrentError(question.clinicalCase, question.topic);
  }, [question]);

  // Record attempt in student cognitive memory on answer
  React.useEffect(() => {
    StudentMemoryService.recordAttempt(question, selectedOption, isCorrect);
  }, [question.id, selectedOption, isCorrect]);

  const handleSaveReason = (reason: ErrorTaxonomy) => {
    setSelectedErrorReason(reason);
    onSaveErrorReflection(reason);
    setHasSavedReflection(true);
  };

  const handleTriggerAi = async (mode: "autopsy" | "socratic" | "simplify" | "compare" | "brazil_terminology", customText?: string) => {
    setAiMode(mode);
    setActiveTab("AI_TUTOR");
    setAiLoading(true);

    try {
      const response = await AiService.askTutor({
        mode,
        questionContext: question,
        userAnswer: selectedOption,
        correctAnswer: correctOption?.id || "A",
        userQuery: customText || undefined,
      });
      setAiResponse(response);
    } catch {
      setAiResponse({
        text: "Erro ao conectar com o Tutor IA. Exibindo comentário do banco editorial oficial.",
        source: "Diretrizes Clínicas Oficiais do Ministério da Saúde",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyFinding = () => {
    if (question.keyFinding) {
      navigator.clipboard.writeText(question.keyFinding);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="space-y-4 max-w-[780px] mx-auto animate-in fade-in duration-200">
      {/* CAMADA 1: Resposta Rápida (Status do Acerto + Gabarito) */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
          isCorrect
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100"
            : "bg-red-500/10 border-red-500/30 text-red-100"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isCorrect
                ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                : "bg-red-500/20 border-red-400 text-red-300"
            }`}
          >
            {isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-white">
                {isCorrect ? "Resposta Correta" : "Resposta Incorreta"}
              </h4>
              <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-white/10 text-white">
                Gabarito: <strong className="text-emerald-400 uppercase">Opção {correctOption?.id}</strong>
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
              {isCorrect
                ? "Conduta alinhada ao padrão-ouro exigido pelo INEP."
                : `Você marcou a opção ${selectedOption}. Veja a justificativa abaixo para neutralizar este erro.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            id="audit-question-pipeline-btn"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs transition-all shadow-sm cursor-pointer"
            title="Executar auditoria multi-modelo (Sonnet 5 + RAG + Web + Opus 5)"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Auditar Questão</span>
          </button>

          <button
            onClick={onNextQuestion}
            id="layered-correction-next-btn"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm shrink-0 cursor-pointer"
          >
            <span>{isLastQuestion ? "Finalizar Treino" : "Próxima Questão"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Proactive Cognitive Memory Alert */}
      {recurrentError && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/50 via-indigo-950/40 to-purple-900/30 border border-purple-500/40 text-purple-200 text-xs flex items-start gap-3 shadow-md animate-in fade-in duration-200">
          <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 shrink-0 border border-purple-500/30">
            <Brain className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-bold text-white text-xs">Memória Real do Estudante</span>
              <span className="px-2 py-0.2 rounded-full bg-purple-500/30 text-purple-200 text-[10px] font-mono font-bold border border-purple-500/40">
                {recurrentError.errorCount} erros neste padrão
              </span>
              <span className="text-[10px] text-purple-300/70">
                Tema: {recurrentError.topic}
              </span>
            </div>
            <p className="text-purple-100 font-medium leading-relaxed text-xs">
              "{recurrentError.tutorRecommendation}"
            </p>
          </div>
        </div>
      )}

      {/* Autópsia do Erro (se o usuário errou) */}
      {!isCorrect && (
        <div className="p-4 rounded-xl bg-[#111420] border border-amber-500/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">
                Autópsia do Erro — Qual foi o motivo do erro?
              </span>
            </div>
            {hasSavedReflection && (
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Registrado
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: "DISTRACTOR_TRAP", label: "Caí no distrator da banca" },
              { id: "KNOWLEDGE_GAP", label: "Não sabia o conteúdo" },
              { id: "DIAGNOSIS_VS_CONDUCT", label: "Sabia diagnóstico, errei conduta" },
              { id: "READING_HASTE", label: "Desatenção / Leitura rápida" },
              { id: "PROTOCOL_CONFUSION", label: "Confundi protocolo SUS" },
              { id: "ELIMINATED_RIGHT_ANSWER", label: "Fiquei entre duas e troquei" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleSaveReason(item.id as ErrorTaxonomy)}
                className={`p-2.5 rounded-lg text-left text-xs font-medium border transition-colors ${
                  selectedErrorReason === item.id
                    ? "bg-amber-500/20 border-amber-400 text-amber-200"
                    : "bg-white/[0.02] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Banner de Atualização de Diretriz Clínica (se houver) */}
      {question.guidelineUpdate && (
        <div
          className={`p-4 sm:p-5 rounded-2xl border shadow-lg ${
            question.guidelineUpdate.status === "OFFICIAL_ANSWER_HISTORICAL"
              ? "bg-amber-500/15 border-amber-400/40 text-amber-100"
              : "bg-purple-500/15 border-purple-400/40 text-purple-100"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-amber-300" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider">
                  {question.guidelineUpdate.status === "OFFICIAL_ANSWER_HISTORICAL"
                    ? "⚠️ GABARITO HISTÓRICO PRESERVADO"
                    : "⚡ DIRETRIZ CLÍNICA ATUALIZADA"}
                </span>
                <span className="text-xs text-white/80 font-medium">
                  {question.guidelineUpdate.institution} ({question.guidelineUpdate.publicationYear}) · Impacto {question.guidelineUpdate.impactLevel}
                </span>
              </div>
              <h5 className="text-xs sm:text-sm font-bold text-white">
                A conduta padrão-ouro mudou desde a prova original ({question.examYear})!
              </h5>
              <div className="text-xs text-white/80 space-y-1 pt-1">
                <p>
                  <strong>Gabarito Histórico na Época:</strong> Alternativa <span className="font-bold text-amber-300">{question.guidelineUpdate.officialHistoricalAnswer}</span> ({question.guidelineUpdate.atExamTime})
                </p>
                <p>
                  <strong>Conduta Recomendada Hoje:</strong> Alternativa <span className="font-bold text-emerald-400">{question.guidelineUpdate.currentRecommendedAnswer}</span> ({question.guidelineUpdate.currently})
                </p>
                <p className="text-[11px] text-white/60 italic pt-1">
                  O que estudar hoje: {question.guidelineUpdate.whatToStudyToday}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TABS DE FEEDBACK PROGRESSIVO */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl overflow-hidden shadow-2xl">
        {/* Navigation Tab Bar */}
        <div className="flex items-center gap-1 p-2 bg-white/[0.03] border-b border-white/10 overflow-x-auto scrollbar-none">
          {[
            { id: "REASONING", label: "Raciocínio Clínico", icon: Brain },
            { id: "DISTRACTORS", label: "Autópsia das Alternativas", icon: AlertOctagon },
            { id: "SUMMARY", label: "Pontos de Alto Rendimento", icon: FileText },
            { id: "AI_TUTOR", label: "Tutor IA Gemini", icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isTabActive
                    ? "bg-white text-black shadow-md scale-[1.01]"
                    : "text-white/60 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: RACIOCÍNIO CLÍNICO */}
        {activeTab === "REASONING" && (
          <div className="p-5 sm:p-6 space-y-5 animate-in fade-in duration-200">
            {/* Pista Decisiva */}
            {question.keyFinding && (
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Pista Diagnóstica Decisiva (Gatilho)
                  </span>
                  <p className="text-xs sm:text-sm text-white/90 font-medium leading-relaxed">
                    {question.keyFinding}
                  </p>
                </div>
                <button
                  onClick={handleCopyFinding}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all shrink-0"
                  title="Copiar achado decisivo"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            {/* Conduta Esperada */}
            {question.expectedConduct && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Conduta Padrão-Ouro do SUS / INEP
                </h5>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs sm:text-sm text-white/80 leading-relaxed font-sans">
                  {question.expectedConduct}
                </div>
              </div>
            )}

            {/* O que a banca do INEP está avaliando */}
            {question.inepIntent && (
              <div className="space-y-1.5">
                <h5 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  Matriz INEP — O que a banca está avaliando
                </h5>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs sm:text-sm text-white/80 leading-relaxed">
                  {question.inepIntent}
                </div>
              </div>
            )}

            {/* Contexto Brasil / SUS */}
            {question.brazilContextNote && (
              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-200/90 leading-relaxed">
                <strong className="text-emerald-300">Nota sobre o Contexto SUS:</strong> {question.brazilContextNote}
              </div>
            )}

            {/* Fontes Oficiais */}
            {question.sources && question.sources.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <span className="text-[11px] font-semibold text-white/50 block mb-1.5">
                  Referências e Diretrizes Oficiais:
                </span>
                <div className="flex flex-wrap gap-2">
                  {question.sources.map((src, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-white/70 flex items-center gap-1.5"
                    >
                      <BookOpen className="w-3 h-3 text-white/40" />
                      <span>{src.title} ({src.organization}, {src.year})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AUTÓPSIA DAS ALTERNATIVAS & DISTRATORES */}
        {activeTab === "DISTRACTORS" && (
          <div className="p-5 sm:p-6 space-y-3.5 animate-in fade-in duration-200">
            <p className="text-xs text-white/60 mb-2">
              Comentário analítico detalhado de cada opção de resposta e suas armadilhas conceituais:
            </p>

            <div className="space-y-3">
              {question.options.map((opt) => {
                const isSelected = selectedOption === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`p-4 rounded-xl border transition-all ${
                      opt.isCorrect
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100"
                        : isSelected
                        ? "bg-red-500/10 border-red-500/30 text-red-100"
                        : "bg-white/[0.02] border-white/10 text-white/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold ${
                            opt.isCorrect
                              ? "bg-emerald-500 text-black"
                              : isSelected
                              ? "bg-red-500 text-white"
                              : "bg-white/10 text-white/70"
                          }`}
                        >
                          {opt.id}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {opt.isCorrect ? "Gabarito Correto" : "Distrator"}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 font-medium text-white/80">
                            Sua escolha
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs font-medium text-white/90 mb-2 leading-relaxed">
                      {opt.text}
                    </p>

                    <div className="text-xs text-white/70 bg-black/20 p-2.5 rounded-lg border border-white/5 leading-relaxed">
                      <strong className="text-white/90">Justificativa:</strong> {opt.explanation}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: MICRO-RESUMO & PONTOS DE ALTO RENDIMENTO */}
        {activeTab === "SUMMARY" && (
          <div className="p-5 sm:p-6 space-y-4 animate-in fade-in duration-200">
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                Resumo Essencial para Revisão Rápida
              </h5>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-xs sm:text-sm text-white/90 space-y-2 leading-relaxed">
                <p>
                  <strong>Tema:</strong> {question.topic} {question.subtopic ? `· ${question.subtopic}` : ""}
                </p>
                <p>
                  <strong>Grande Área:</strong> {question.area.replace(/_/g, " ")}
                </p>
                <p>
                  <strong>Competência Revalida:</strong> {question.competencyDescription}
                </p>
                <p className="pt-2 border-t border-white/10 text-white/80">
                  {question.keyFinding ? `Lembre-se sempre: ${question.keyFinding}` : "Fixe o algoritmo de conduta oficial."}
                </p>
              </div>
            </div>

            {/* Questões Irmãs (Sister Questions) */}
            {sisterQuestions.length > 0 && (
              <div className="pt-3 border-t border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Questões Irmãs ({sisterQuestions.length} encontradas no banco)
                  </span>
                  {onStartSisterTraining && (
                    <button
                      onClick={() =>
                        onStartSisterTraining(sisterQuestions.map((sq) => sq.question.id))
                      }
                      className="text-[11px] text-cyan-300 hover:text-cyan-200 font-bold underline"
                    >
                      Treinar este padrão
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sisterQuestions.map((item) => (
                    <div
                      key={item.question.id}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all text-xs"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono text-[10px] text-white/60 font-bold">
                          {item.question.code}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold">
                          {item.similarityScore}% Similar
                        </span>
                      </div>
                      <p className="text-white/80 font-medium line-clamp-2">
                        {item.question.topic}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TUTOR IA GEMINI */}
        {activeTab === "AI_TUTOR" && (
          <div className="p-5 sm:p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "autopsy", label: "Autópsia Socrática" },
                { id: "simplify", label: "Explicar Simples" },
                { id: "compare", label: "Comparar Opções" },
                { id: "brazil_terminology", label: "Termos SUS & Brasil" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleTriggerAi(m.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    aiMode === m.id
                      ? "bg-purple-500/20 border-purple-400 text-purple-200 shadow-sm"
                      : "bg-white/[0.02] border-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* AI Response Output */}
            {aiLoading ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                <span className="text-xs text-white/60">
                  O Tutor IA está analisando a fisiopatologia e diretrizes oficiais...
                </span>
              </div>
            ) : aiResponse ? (
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs sm:text-sm text-purple-100 space-y-3 leading-relaxed">
                <p className="whitespace-pre-line">{aiResponse.text}</p>
                {aiResponse.source && (
                  <p className="text-[11px] text-purple-300/60 pt-2 border-t border-purple-500/20">
                    Fonte: {aiResponse.source}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-white/40 text-xs">
                Selecione um modo acima ou faça uma pergunta específica ao Tutor IA.
              </div>
            )}

            {/* Custom Query Input */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <input
                type="text"
                placeholder="Faça uma pergunta sobre esta questão ou conduta..."
                value={customQuestionInput}
                onChange={(e) => setCustomQuestionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customQuestionInput.trim()) {
                    handleTriggerAi("autopsy", customQuestionInput.trim());
                  }
                }}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={() => {
                  if (customQuestionInput.trim()) {
                    handleTriggerAi("autopsy", customQuestionInput.trim());
                  }
                }}
                disabled={!customQuestionInput.trim() || aiLoading}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Perguntar</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Model Audit Pipeline Modal */}
      <QuestionAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        question={question}
      />
    </div>
  );
};
