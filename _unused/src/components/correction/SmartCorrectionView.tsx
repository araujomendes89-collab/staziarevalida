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
  Scale,
  Send,
  Loader2,
} from "lucide-react";
import { Question, ErrorTaxonomy, QuestionAttempt } from "../../types";
import { AiService, TutorResponse } from "../../services/aiService";

interface SmartCorrectionViewProps {
  question: Question;
  selectedOption: "A" | "B" | "C" | "D";
  onNextQuestion: () => void;
  isLastQuestion: boolean;
  onSaveErrorReflection: (errorReason: ErrorTaxonomy, reflection?: string) => void;
}

export const SmartCorrectionView: React.FC<SmartCorrectionViewProps> = ({
  question,
  selectedOption,
  onNextQuestion,
  isLastQuestion,
  onSaveErrorReflection,
}) => {
  const options = question?.options || [];
  const isCorrect = options.find((o) => o.id === selectedOption)?.isCorrect ?? false;
  const correctOption = options.find((o) => o.isCorrect);

  const [selectedErrorReason, setSelectedErrorReason] = useState<ErrorTaxonomy | null>(null);
  const [userReflectionText] = useState("");
  const [hasSavedReflection, setHasSavedReflection] = useState(false);

  // Gemini AI Tutor state
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"autopsy" | "socratic" | "simplify" | "compare" | "brazil_terminology">("autopsy");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<TutorResponse | null>(null);
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [showSourcesModal, setShowSourcesModal] = useState(false);

  const handleTriggerAi = async (mode: "autopsy" | "socratic" | "simplify" | "compare" | "brazil_terminology", customText?: string) => {
    setAiMode(mode);
    setIsAiDrawerOpen(true);
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
        text: "Erro ao conectar com o Tutor IA. Exibindo comentário do banco editorial.",
        source: "Diretrizes Clínicas Oficiais do Ministério da Saúde",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveReason = (reason: ErrorTaxonomy) => {
    setSelectedErrorReason(reason);
    onSaveErrorReflection(reason, userReflectionText);
    setHasSavedReflection(true);
  };

  return (
    <div className="mt-6 space-y-5 animate-in fade-in duration-300">
      {/* 1. Result Header */}
      <div
        className={`p-5 rounded-[24px] backdrop-blur-2xl border flex items-center justify-between shadow-xl ${
          isCorrect
            ? "bg-emerald-500/15 border-emerald-400 text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
            : "bg-red-500/15 border-red-400 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.15)]"
        }`}
      >
        <div className="flex items-center gap-3">
          {isCorrect ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-red-400 shrink-0" />
          )}
          <div>
            <h4 className="font-bold text-sm">
              {isCorrect ? "Resposta Correta! Competência Fixada." : "Resposta Incorreta."}
            </h4>
            <p className="text-xs opacity-80 mt-0.5">
              Gabarito Oficial: <strong className="font-bold uppercase text-white">Alternativa {correctOption?.id}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={onNextQuestion}
          id="correction-next-btn"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black font-bold text-xs hover:scale-[1.02] transition-transform active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        >
          <span>{isLastQuestion ? "Finalizar Bloco" : "Próxima Questão"}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Autópsia do Erro (Se o usuário errou) */}
      {!isCorrect && (
        <div className="p-5 rounded-[24px] backdrop-blur-2xl bg-amber-500/10 border border-amber-500/30 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Autópsia do Erro — Por que você errou?
              </span>
            </div>
            {hasSavedReflection && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Registrado no Algoritmo
              </span>
            )}
          </div>
          <p className="text-xs text-white/60 mb-3">
            Ajude o algoritmo a calibrar seu plano de estudo identificando o motivo do erro:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: "DISTRACTOR_TRAP", label: "Caí no distrator da banca" },
              { id: "KNOWLEDGE_GAP", label: "Não sabia o conteúdo teórico" },
              { id: "DIAGNOSIS_VS_CONDUCT", label: "Sabia diagnóstico, errei conduta" },
              { id: "READING_HASTE", label: "Li rápido demais / desatenção" },
              { id: "PROTOCOL_CONFUSION", label: "Confundi protocolo SUS / diretriz" },
              { id: "ELIMINATED_RIGHT_ANSWER", label: "Fiquei entre duas e troquei" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleSaveReason(item.id as ErrorTaxonomy)}
                className={`p-2.5 rounded-xl text-left text-xs font-semibold border transition-all ${
                  selectedErrorReason === item.id
                    ? "backdrop-blur-md bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                    : "backdrop-blur-md bg-white/[0.03] border-white/10 text-white/70 hover:border-white/20 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2.5 Banner de Atualização de Diretriz Clínica (Se aplicável) */}
      {question.guidelineUpdate && (
        <div
          className={`p-5 rounded-[24px] backdrop-blur-2xl border shadow-xl ${
            question.guidelineUpdate.status === "OFFICIAL_ANSWER_HISTORICAL" || question.guidelineUpdate.status === "OUTDATED"
              ? "bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-red-500/15 border-amber-400/40 text-amber-100"
              : "bg-purple-500/15 border-purple-400/40 text-purple-100"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider">
                    {question.guidelineUpdate.status === "OFFICIAL_ANSWER_HISTORICAL"
                      ? "⚠️ GABARITO HISTÓRICO PRESERVADO"
                      : "⚡ DIRETRIZ CLÍNICA ATUALIZADA"}
                  </span>
                  <span className="text-xs font-semibold text-white/80">
                    Impacto {question.guidelineUpdate.impactLevel} ({question.guidelineUpdate.institution})
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white">
                  Atenção: A conduta padrão-ouro mudou desde a aplicação desta prova ({question.examYear})!
                </h4>
                <p className="text-xs text-white/80 mt-1 leading-relaxed">
                  <strong>Gabarito Oficial do INEP ({question.examYear}):</strong> Alternativa{" "}
                  <span className="text-amber-300 font-bold">{question.guidelineUpdate.officialHistoricalAnswer}</span>.{" "}
                  <strong>Conduta Recomendada Hoje ({question.guidelineUpdate.guidelineTitle}):</strong> Alternativa{" "}
                  <span className="text-emerald-400 font-bold">{question.guidelineUpdate.currentRecommendedAnswer}</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Progressive Raciocínio Clínico with Dual Explanation Perspective */}
      <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-2xl space-y-4">
        {/* Dual Explanation Tabs if Guideline Update exists */}
        {question.guidelineUpdate ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tab 1: Visão da Época da Prova */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    🏛️ 1. Visão na Época da Prova ({question.examYear})
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-black">
                    Gabarito: Alt. {question.guidelineUpdate.officialHistoricalAnswer}
                  </span>
                </div>
                <p className="text-xs text-white/90 leading-relaxed font-sans">
                  {question.guidelineUpdate.atExamTime}
                </p>
              </div>

              {/* Tab 2: O Que Mudou Hoje */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                    ⚡ 2. O Que Mudou Hoje (2026)
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-black text-[10px] font-black">
                    Conduta Atual: Alt. {question.guidelineUpdate.currentRecommendedAnswer}
                  </span>
                </div>
                <p className="text-xs text-white/90 leading-relaxed font-sans font-medium">
                  {question.guidelineUpdate.currently}
                </p>
              </div>
            </div>

            {/* Scientific Rationale & What to Study Box */}
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs space-y-2">
              <span className="font-bold text-purple-300 uppercase tracking-wider block">
                🔬 Por Que Mudou? (Racional & Ensaios Clínicos)
              </span>
              <p className="text-white/80 leading-relaxed">
                {question.guidelineUpdate.reasonForChange}
              </p>
              <div className="pt-2 border-t border-purple-500/20 text-emerald-300 font-semibold">
                🎯 O Que Estudar Hoje para o Revalida: {question.guidelineUpdate.whatToStudyToday}
              </div>
            </div>
          </div>
        ) : null}

        {/* Pista Principal */}
        <div className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
            🎯 Pista Principal (Key Finding)
          </span>
          <p className="text-xs text-white/90 leading-relaxed font-medium">
            {question.keyFinding}
          </p>
        </div>

        {/* Conduta Esperada */}
        <div className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
            ⚡ Conduta Padrão-Ouro Esperada
          </span>
          <p className="text-xs text-white/90 leading-relaxed">
            {question.expectedConduct}
          </p>
        </div>

        {/* Explicação detalhada alternativa por alternativa */}
        <div>
          <h5 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2.5">
            Análise das Alternativas
          </h5>
          <div className="space-y-2">
            {question.options.map((opt) => (
              <div
                key={opt.id}
                className={`p-3.5 rounded-2xl border text-xs leading-relaxed backdrop-blur-md ${
                  opt.isCorrect
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100 font-medium"
                    : "bg-white/[0.02] border-white/5 text-white/60"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`font-bold px-2 py-0.5 rounded-lg text-[11px] ${
                      opt.isCorrect
                        ? "bg-emerald-500 text-black"
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    {opt.id}
                  </span>
                  <span className="font-semibold text-white/90">
                    {opt.isCorrect ? "Correta" : "Incorreta"}
                  </span>
                </div>
                <p className="mt-1">{opt.explanation}</p>
              </div>
            ))}
          </div>
        </div>

        {/* O que o INEP está testando aqui? */}
        <div className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/10">
          <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-1">
            🏛️ O que a banca do INEP está avaliando aqui?
          </span>
          <p className="text-xs text-white/80 leading-relaxed">
            {question.inepIntent}
          </p>
          {question.brazilContextNote && (
            <div className="mt-2 pt-2 border-t border-white/10 text-xs text-emerald-400 flex items-start gap-1.5 font-medium">
              <span>🇧🇷 Dica SUS:</span>
              <span>{question.brazilContextNote}</span>
            </div>
          )}
        </div>

        {/* AI Action Chips & Sources */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTriggerAi("socratic")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all hover:scale-[1.02] active:scale-95"
            >
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span>Me Faça Raciocinar (Socrático)</span>
            </button>

            <button
              onClick={() => handleTriggerAi("simplify")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all hover:scale-[1.02] active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Explique Mais Simples</span>
            </button>

            <button
              onClick={() => handleTriggerAi("compare")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all hover:scale-[1.02] active:scale-95"
            >
              <Scale className="w-3.5 h-3.5 text-blue-400" />
              <span>Comparar Diagnósticos</span>
            </button>

            <button
              onClick={() => handleTriggerAi("brazil_terminology")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all hover:scale-[1.02] active:scale-95"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Termos & Fluxo SUS</span>
            </button>
          </div>

          <button
            onClick={() => setShowSourcesModal(true)}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white underline transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Ver Fontes Oficiais</span>
          </button>
        </div>
      </div>

      {/* 4. AI Interactive Preceptor Drawer */}
      {isAiDrawerOpen && (
        <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-purple-950/20 border border-purple-500/30 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                Mentor IA Contextual — PRAXIS REVALIDA
              </span>
            </div>
            <button
              onClick={() => setIsAiDrawerOpen(false)}
              className="text-xs text-white/50 hover:text-white"
            >
              Fechar
            </button>
          </div>

          {aiLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/60">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs">Consultando a matriz do Revalida e diretrizes do Ministério da Saúde...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl backdrop-blur-md bg-white/[0.03] border border-white/10 text-xs text-white/90 leading-relaxed whitespace-pre-line font-sans">
                {aiResponse?.text}
              </div>
              {aiResponse?.source && (
                <p className="text-[11px] text-white/40 italic">
                  Fonte: {aiResponse.source}
                </p>
              )}
            </div>
          )}

          {/* Ask specific question to AI Tutor */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              value={customQuestionInput}
              onChange={(e) => setCustomQuestionInput(e.target.value)}
              placeholder="Ex: Por que não seria embolia pulmonar neste caso?"
              className="flex-1 backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && customQuestionInput.trim()) {
                  handleTriggerAi("general" as any, customQuestionInput);
                  setCustomQuestionInput("");
                }
              }}
            />
            <button
              onClick={() => {
                if (customQuestionInput.trim()) {
                  handleTriggerAi("general" as any, customQuestionInput);
                  setCustomQuestionInput("");
                }
              }}
              className="p-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold transition-all shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sources Inspector Modal */}
      {showSourcesModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="backdrop-blur-2xl bg-neutral-950/90 border border-white/10 p-6 rounded-[28px] max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Fontes Oficiais & Confiabilidade</span>
              </h4>
              <button
                onClick={() => setShowSourcesModal(false)}
                className="text-white/40 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {question.sources.map((src, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl backdrop-blur-md bg-white/[0.03] border border-white/10 text-xs space-y-1">
                  <p className="font-bold text-white">{src.title}</p>
                  <p className="text-white/60">
                    Órgão: <strong className="text-white/90">{src.organization}</strong> ({src.year})
                  </p>
                  <span className="inline-block text-[10px] font-bold text-emerald-300 backdrop-blur-md bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30 mt-1">
                    {src.reliability}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSourcesModal(false)}
              className="w-full py-2.5 rounded-xl backdrop-blur-md bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
