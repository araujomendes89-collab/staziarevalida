import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  ShieldCheck,
  Sparkles,
  Bot,
  Brain,
  FileCheck,
  Send,
  HelpCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Tag,
  Stethoscope,
  BookOpen,
} from "lucide-react";
import { Question } from "../../types";

export type QuestoesIAStatus =
  | "Gerada"
  | "Fonte verificada"
  | "Em auditoria"
  | "Aprovada"
  | "Publicada"
  | "Ambígua"
  | "Gabarito divergente"
  | "Muito semelhante"
  | "Desatualizada"
  | "Rejeitada";

interface GeneratedQuestionCardProps {
  question: Question;
  onApprove?: (id: string) => void;
  onPublish?: (id: string) => void;
  onReject?: (id: string, reason: string) => void;
  onAudit?: (question: Question) => void;
  onEdit?: (question: Question) => void;
  isExpandedDefault?: boolean;
}

export const getStatusBadge = (status?: string) => {
  switch (status) {
    case "PUBLISHED":
    case "Publicada":
      return {
        label: "Publicada",
        bg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        icon: CheckCircle2,
      };
    case "APPROVED":
    case "Aprovada":
      return {
        label: "Aprovada",
        bg: "bg-teal-500/15 text-teal-300 border-teal-500/30",
        icon: ShieldCheck,
      };
    case "Fonte verificada":
      return {
        label: "Fonte verificada",
        bg: "bg-blue-500/15 text-blue-300 border-blue-500/30",
        icon: FileCheck,
      };
    case "Em auditoria":
    case "MEDICAL_REVIEW":
      return {
        label: "Em auditoria",
        bg: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        icon: Clock,
      };
    case "Ambígua":
      return {
        label: "Ambígua",
        bg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
        icon: HelpCircle,
      };
    case "Gabarito divergente":
      return {
        label: "Gabarito divergente",
        bg: "bg-rose-500/20 text-rose-300 border-rose-500/40",
        icon: AlertTriangle,
      };
    case "Muito semelhante":
      return {
        label: "Muito semelhante",
        bg: "bg-orange-500/20 text-orange-300 border-orange-500/40",
        icon: Layers,
      };
    case "Desatualizada":
      return {
        label: "Desatualizada",
        bg: "bg-purple-500/20 text-purple-300 border-purple-500/40",
        icon: AlertTriangle,
      };
    case "REJECTED":
    case "Rejeitada":
      return {
        label: "Rejeitada",
        bg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        icon: XCircle,
      };
    case "AI_GENERATED":
    case "Gerada":
    default:
      return {
        label: "Gerada",
        bg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
        icon: Sparkles,
      };
  }
};

export const GeneratedQuestionCard: React.FC<GeneratedQuestionCardProps> = ({
  question,
  onApprove,
  onPublish,
  onReject,
  onAudit,
  onEdit,
  isExpandedDefault = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isExpandedDefault);
  const [showDistractors, setShowDistractors] = useState(false);

  const statusInfo = getStatusBadge(question.generationStatus || "Gerada");
  const StatusIcon = statusInfo.icon;

  const areaName =
    question.area === "CLINICA_MEDICA"
      ? "Clínica Médica"
      : question.area === "CIRURGIA_GERAL"
      ? "Cirurgia"
      : question.area === "PEDIATRIA"
      ? "Pediatria"
      : question.area === "GINECOLOGIA_OBSTETRICIA"
      ? "Ginecologia e Obstetrícia"
      : "Medicina Preventiva e SUS";

  const generatorModel = question.generatorModel || "Claude Sonnet 5 (Geração INEP)";
  const auditorModel = question.reviewModel || "Claude Opus 5 (Auditoria Adversarial)";
  const sourceTitle = question.sources?.[0]?.title || "PCDT Ministério da Saúde / Diretrizes SUS 2026";
  const sourceOrg = question.sources?.[0]?.organization || "Ministério da Saúde / CONITEC";

  return (
    <div
      id={`generated-q-${question.id}`}
      className="p-5 rounded-2xl bg-[#0d1017] border border-white/10 hover:border-white/20 transition-all space-y-4 shadow-lg"
    >
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Badge */}
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${statusInfo.bg}`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            <span>{statusInfo.label}</span>
          </span>

          {/* Área */}
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-white/5 text-zinc-300 border border-white/10">
            {areaName}
          </span>

          {/* Dificuldade */}
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Dificuldade: {question.difficulty || "MÉDIA"}
          </span>

          {/* Competência */}
          {question.reasoningType && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20">
              {question.reasoningType}
            </span>
          )}
        </div>

        {/* Code & Actions Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-300">
            {question.code || `INED-${question.id.slice(-6).toUpperCase()}`}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? "Recolher detalhes" : "Expandir detalhes"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Tema & Subtema */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-zinc-300 font-bold">
          <Tag className="w-3.5 h-3.5 text-emerald-400" />
          <span>{question.topic || "Grande Tema Revalida"}</span>
          {question.subtopic && (
            <>
              <span className="text-zinc-400">›</span>
              <span className="text-zinc-300 font-normal">{question.subtopic}</span>
            </>
          )}
        </div>
      </div>

      {/* Clinical Vignette (Stem) */}
      <div className="text-sm text-zinc-200 leading-relaxed bg-[#08090e] p-4 rounded-xl border border-white/5">
        <p className="whitespace-pre-line">
          {isExpanded ? question.clinicalCase : question.clinicalCase.slice(0, 240) + (question.clinicalCase.length > 240 ? "..." : "")}
        </p>
      </div>

      {/* Expanded Content (Options, Distractor Analysis, Models) */}
      {isExpanded && (
        <div className="space-y-4 pt-2 border-t border-white/5 animate-fadeIn">
          {/* Alternatives */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Alternativas e Justificativas</span>
              <span className="text-[10px] text-zinc-300 font-normal">
                (Gabarito Oficial: <strong className="text-emerald-400">{question.correctAnswer}</strong>)
              </span>
            </h4>

            <div className="space-y-2">
              {question.options.map((opt) => {
                const isCorrect = opt.isCorrect || opt.id === question.correctAnswer;
                return (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-xl border text-xs leading-relaxed transition-colors ${
                      isCorrect
                        ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-200"
                        : "bg-white/[0.02] border-white/5 text-zinc-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 ${
                          isCorrect
                            ? "bg-emerald-500 text-black"
                            : "bg-white/10 text-zinc-300"
                        }`}
                      >
                        {opt.id}
                      </span>
                      <div className="space-y-1 flex-1">
                        <p className="font-medium text-white">{opt.text}</p>
                        {opt.explanation && (
                          <p className="text-[11px] text-zinc-300 mt-1 pl-2 border-l-2 border-white/10">
                            {opt.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key Finding & Expected Conduct */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {question.keyFinding && (
              <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 text-blue-200 space-y-1">
                <span className="font-bold text-blue-400 flex items-center gap-1">
                  <Stethoscope className="w-3.5 h-3.5" />
                  Pista Diagnóstica (Key Finding):
                </span>
                <p className="text-[11px] text-blue-100">{question.keyFinding}</p>
              </div>
            )}
            {question.expectedConduct && (
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 space-y-1">
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Conduta Esperada no SUS:
                </span>
                <p className="text-[11px] text-emerald-100">{question.expectedConduct}</p>
              </div>
            )}
          </div>

          {/* INEP Intent & SUS Context */}
          {question.inepIntent && (
            <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-200 text-xs space-y-1">
              <span className="font-bold text-purple-400 flex items-center gap-1">
                <Brain className="w-3.5 h-3.5" />
                Matriz de Intenção INEP:
              </span>
              <p className="text-[11px] text-purple-100">{question.inepIntent}</p>
            </div>
          )}

          {/* Distractor Analysis Matrix */}
          {question.distractorAnalysis && question.distractorAnalysis.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowDistractors(!showDistractors)}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Análise de Padrão de Distratores ({question.distractorAnalysis.length})</span>
                {showDistractors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showDistractors && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {question.distractorAnalysis.map((dist, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/25 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                        <span>Opção {dist.optionId}</span>
                        <span className="text-[10px] text-amber-400/80 font-mono">
                          Plausib: {dist.plausibilityScore || 75}%
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-200/90 font-mono">
                        {dist.trapType}
                      </p>
                      <p className="text-[11px] text-zinc-300">
                        {dist.clinicalJustification}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Models & Protocol Attributions */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-300">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-zinc-300">Gerador:</span>
                <span className="text-white font-mono font-semibold">{generatorModel}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-zinc-300">Auditor:</span>
                <span className="text-white font-mono font-semibold">{auditorModel}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-300">Fonte:</span>
                <span className="text-amber-200 font-semibold">{sourceTitle} ({sourceOrg})</span>
              </div>
            </div>

            {question.is2026Ready && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ✓ 2026 Ready
              </span>
            )}
          </div>
        </div>
      )}

      {/* Card Actions Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isExpanded ? "Recolher" : "Ver detalhes completos"}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAudit && (
            <button
              type="button"
              onClick={() => onAudit(question)}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Auditar com Opus 5</span>
            </button>
          )}

          {onApprove && question.generationStatus !== "APPROVED" && question.generationStatus !== "PUBLISHED" && (
            <button
              type="button"
              onClick={() => onApprove(question.id)}
              className="px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Aprovar</span>
            </button>
          )}

          {onPublish && question.generationStatus !== "PUBLISHED" && (
            <button
              type="button"
              onClick={() => onPublish(question.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publicar no Banco</span>
            </button>
          )}

          {onReject && question.generationStatus !== "REJECTED" && (
            <button
              type="button"
              onClick={() => onReject(question.id, "Ambiguidade / Divergência")}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Rejeitar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
