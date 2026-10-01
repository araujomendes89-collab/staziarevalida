import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Sparkles,
  ArrowRight,
  Database,
  Globe2,
  Layers,
  Building2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Scale,
  Brain,
  HelpCircle,
  Copy,
  Check,
} from "lucide-react";
import { Question } from "../../types";
import {
  QuestionAuditService,
  QuestionAuditPipelineResult,
} from "../../services/questionAuditService";

interface QuestionAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: Question;
}

export const QuestionAuditModal: React.FC<QuestionAuditModalProps> = ({
  isOpen,
  onClose,
  question,
}) => {
  const [loading, setLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [auditResult, setAuditResult] = useState<QuestionAuditPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const correctOption = question.options.find((o) => o.isCorrect)?.id || "A";

  const handleStartAudit = async () => {
    setLoading(true);
    setError(null);
    setAuditResult(null);
    setCurrentStepIndex(1);

    // Visual step sequence animation
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < 4 ? prev + 1 : prev));
    }, 650);

    try {
      const result = await QuestionAuditService.auditQuestion(question);
      clearInterval(stepInterval);
      setCurrentStepIndex(5);
      setAuditResult(result);
    } catch (err: any) {
      clearInterval(stepInterval);
      setError(err.message || "Falha ao executar auditoria.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAudit = () => {
    if (!auditResult) return;
    const { opusFinalAudit, officialKey, ragProtocolMatch } = auditResult;
    const text = `📋 AUDITORIA DE QUESTÃO — StaziaMed Revalida 2026
Questão: ${question.id} (${question.specialty || "Clínica Médica"} - ${question.examYear || "2026"})
Gabarito Oficial: ${officialKey}

🎯 CONCLUSÃO DA IA:
${opusFinalAudit.aiConclusionText}
Confiança: ${opusFinalAudit.concurrenceRatePercent}%

🏛️ BASE OFICIAL:
${opusFinalAudit.officialStandardBase.map((b) => `- ${b}`).join("\n")}

🔍 DISTRATORES:
${opusFinalAudit.distractorsBreakdown.map((d) => `${d.optionId} — ${d.verdict}: ${d.clinicalReason}`).join("\n")}

${opusFinalAudit.alertNote}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-3xl max-h-[92vh] bg-[#070b12] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-y-auto scrollbar-thin p-5 sm:p-7 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                AUDITORIA DE GABARITO & DIRETRIZES
              </span>
              <span className="text-xs text-zinc-400 font-medium">
                {question.specialty} · Prova {question.examYear || "INEP"}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              Auditoria Multi-Modelo da Questão
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Question Mini Statement */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-zinc-300 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300">Enunciado Clínico:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              Gabarito Oficial: Opção {correctOption}
            </span>
          </div>
          <p className="line-clamp-3 italic text-zinc-200">
            "{question.clinicalCase}"
          </p>
        </div>

        {/* Interactive Pipeline Diagram (The User-Requested Architecture Flow) */}
        <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Fluxo Sequencial de Auditoria
            </span>
            {loading && (
              <span className="text-[11px] text-emerald-400 animate-pulse font-semibold">
                Executando pipeline...
              </span>
            )}
          </div>

          {/* Stepper Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[10px]">
            {/* Step 1 */}
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                currentStepIndex >= 1
                  ? "bg-purple-950/40 border-purple-500/50 text-purple-200 shadow-md shadow-purple-950/50"
                  : "bg-white/[0.02] border-white/5 text-zinc-500"
              }`}
            >
              <div className="font-black text-xs text-white mb-0.5">1. Sonnet 5</div>
              <p className="line-clamp-1">Análise Clínica</p>
            </div>

            {/* Step 2 */}
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                currentStepIndex >= 2
                  ? "bg-blue-950/40 border-blue-500/50 text-blue-200 shadow-md shadow-blue-950/50"
                  : "bg-white/[0.02] border-white/5 text-zinc-500"
              }`}
            >
              <div className="font-black text-xs text-white mb-0.5">2. RAG</div>
              <p className="line-clamp-1">Busca PCDT</p>
            </div>

            {/* Step 3 */}
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                currentStepIndex >= 3
                  ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-200 shadow-md shadow-cyan-950/50"
                  : "bg-white/[0.02] border-white/5 text-zinc-500"
              }`}
            >
              <div className="font-black text-xs text-white mb-0.5">3. Web Grounding</div>
              <p className="line-clamp-1">Atualização 2026</p>
            </div>

            {/* Step 4 */}
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                currentStepIndex >= 4
                  ? "bg-teal-950/40 border-teal-500/50 text-teal-200 shadow-md shadow-teal-950/50"
                  : "bg-white/[0.02] border-white/5 text-zinc-500"
              }`}
            >
              <div className="font-black text-xs text-white mb-0.5">4. Gabarito</div>
              <p className="line-clamp-1">Confrontação</p>
            </div>

            {/* Step 5 */}
            <div
              className={`p-2.5 rounded-xl border col-span-2 sm:col-span-1 transition-all ${
                currentStepIndex >= 5
                  ? "bg-amber-950/40 border-amber-500/50 text-amber-200 shadow-md shadow-amber-950/50"
                  : "bg-white/[0.02] border-white/5 text-zinc-500"
              }`}
            >
              <div className="font-black text-xs text-white mb-0.5">5. Opus 5</div>
              <p className="line-clamp-1">Audita Divergência</p>
            </div>
          </div>
        </div>

        {/* Start Action Button (if not run yet) */}
        {!auditResult && !loading && (
          <div className="text-center py-4 space-y-3">
            <button
              onClick={handleStartAudit}
              className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-2xl shadow-xl shadow-emerald-950/50 transition-all flex items-center gap-2.5 mx-auto cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>Iniciar Auditoria Completa da Questão</span>
            </button>
            <p className="text-xs text-zinc-400">
              Cruza Claude Sonnet 5, RAG de PCDTs, Google Search Grounding em <strong>.gov.br</strong> e auditoria final com Claude Opus 5.
            </p>
          </div>
        )}

        {/* Loading Animation */}
        {loading && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
            <p className="text-sm font-bold text-white">
              Processando fluxo multi-modelo...
            </p>
            <p className="text-xs text-zinc-400">
              Verificando consistência com as diretrizes do Ministério da Saúde e Revalida 2026.
            </p>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* AUDIT RESULTS VIEW (Matching the User's Exact Specification) */}
        {auditResult && !loading && (
          <div className="space-y-6 animate-fadeIn">
            {/* 1. Big High-Impact Verdict Banner */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#090d15] border border-emerald-500/30 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Gabarito oficial:</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-black text-sm border border-emerald-500/40">
                    {auditResult.officialKey}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Confiança da Auditoria:</span>
                  <span className="px-3 py-1 rounded-full bg-emerald-500 text-black font-black text-xs shadow-md">
                    {auditResult.opusFinalAudit.concurrenceRatePercent}%
                  </span>
                </div>
              </div>

              {/* Conclusão da IA */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Conclusão da IA:
                </h4>
                <p className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  {auditResult.opusFinalAudit.aiConclusionText}
                </p>
              </div>

              {/* Base Normativa */}
              <div className="space-y-1.5 pt-2">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Base Normativa Oficial:
                </h4>
                <div className="space-y-1 text-xs text-zinc-200">
                  {auditResult.opusFinalAudit.officialStandardBase.map((base, bIdx) => (
                    <div key={bIdx} className="flex items-center gap-2 text-emerald-300/90 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{base}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alert Box (E.g. Nenhuma atualização posterior encontrada que invalide o gabarito) */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span className="font-semibold">{auditResult.opusFinalAudit.alertNote}</span>
              </div>
            </div>

            {/* 2. Distratores Breakdown (Alternativa A, B, C, D) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Autópsia dos Distratores & Alternativas
              </h3>

              <div className="space-y-2">
                {auditResult.opusFinalAudit.distractorsBreakdown.map((item) => {
                  const isCorrect = item.verdict === "CORRETA";
                  return (
                    <div
                      key={item.optionId}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCorrect
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-100"
                          : "bg-white/[0.02] border-white/10 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`w-6 h-6 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${
                            isCorrect
                              ? "bg-emerald-500 text-black font-black"
                              : "bg-white/10 text-zinc-300"
                          }`}
                        >
                          {item.optionId}
                        </span>

                        <div className="space-y-1 flex-1 min-w-0 text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold ${
                                isCorrect ? "text-emerald-300" : "text-zinc-200"
                              }`}
                            >
                              Alternativa {item.optionId}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                isCorrect
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-rose-500/20 text-rose-300"
                              }`}
                            >
                              {item.verdict}
                            </span>
                          </div>
                          <p className="text-zinc-300 leading-relaxed">
                            {item.clinicalReason}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Detailed Multi-Engine Telemetry Accordion */}
            <div className="border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <span className="font-semibold flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  Ver telemetria do pipeline multi-modelo (Sonnet 5 + RAG + Opus 5)
                </span>
                {showTechnicalDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showTechnicalDetails && (
                <div className="mt-3 p-4 rounded-2xl bg-black/50 border border-white/5 space-y-3 text-xs text-zinc-300 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <strong className="text-purple-300 block">Decomposição Claude Sonnet 5:</strong>
                      <p className="text-[11px] text-zinc-400">
                        Hipótese: {auditResult.sonnetClinicalAnalysis.diagnosticHypothesis}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Nível de Atenção: {auditResult.sonnetClinicalAnalysis.susLevelOfCare}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <strong className="text-cyan-300 block">RAG & Web Grounding:</strong>
                      <p className="text-[11px] text-zinc-400">
                        Protocolo: {auditResult.ragProtocolMatch.matchedPcdtName}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Fontes: {auditResult.webSearchGrounding.sourcesChecked.join(", ")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyAudit}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer border border-white/10"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Relatório Copiado!" : "Copiar Relatório de Auditoria"}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
