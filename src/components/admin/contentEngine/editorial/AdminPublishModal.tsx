/**
 * Admin Content Publication Modal (Etapa 1.28F).
 * Provides explicit admin review, canonical topic confirmation,
 * live preflight gate inspection, and publication execution.
 */

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  BookOpen,
  ArrowRight,
  Layers,
  Sparkles,
  FileText,
  Clock,
  Send,
} from "lucide-react";
import { StaziaEditorialDocumentDraft } from "../../../../types/medicalEditorial";
import {
  STAZIAMED_CANONICAL_TOPICS,
  CanonicalTopicDefinition,
  CANONICAL_AREA_LABELS,
} from "../../../../types/medicalTaxonomy";
import {
  PublicationPreflightReport,
  PublicationJobState,
  PublicationJobResult,
} from "../../../../types/publishedContent";
import { PublicationPreflightService } from "../../../../services/publicationPreflightService";
import { AdminContentPublicationClientService } from "../../../../services/adminContentPublicationClientService";

interface AdminPublishModalProps {
  draft: StaziaEditorialDocumentDraft;
  isOpen: boolean;
  onClose: () => void;
  onPublishedSuccess?: (result: PublicationJobResult) => void;
}

export const AdminPublishModal: React.FC<AdminPublishModalProps> = ({
  draft,
  isOpen,
  onClose,
  onPublishedSuccess,
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(() => {
    return draft.canonicalTopicId || "top_has";
  });
  const [preflightReport, setPreflightReport] = useState<PublicationPreflightReport | null>(null);
  const [jobState, setJobState] = useState<PublicationJobState>("PUBLICATION_QUEUED");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Auto-run preflight whenever modal opens or selected topic changes
  useEffect(() => {
    if (isOpen) {
      const report = PublicationPreflightService.runPreflight(draft, selectedTopicId);
      setPreflightReport(report);
      setJobState("PUBLICATION_QUEUED");
      setErrorMessage(null);
    }
  }, [isOpen, draft, selectedTopicId]);

  if (!isOpen) return null;

  const selectedTopicDef = STAZIAMED_CANONICAL_TOPICS.find((t) => t.id === selectedTopicId);
  const totalBlocks = draft.pages.flatMap((p) => p.blocks).length;

  const handleExecutePublish = async () => {
    setIsPublishing(true);
    setErrorMessage(null);
    setJobState("PUBLICATION_VALIDATING");

    try {
      // Trigger live progress visual states
      setTimeout(() => setJobState("PUBLICATION_CREATING_ASSETS"), 300);
      setTimeout(() => setJobState("PUBLICATION_COMMITTING"), 600);

      const result = await AdminContentPublicationClientService.publishEditorialDraft(
        draft,
        selectedTopicId
      );

      if (result.state === "PUBLISHED") {
        setJobState("PUBLISHED");
        setIsPublishing(false);
        if (onPublishedSuccess) {
          onPublishedSuccess(result);
        }
      } else {
        setJobState(result.state);
        setErrorMessage(result.error || "Falha na publicação do conteúdo.");
        setIsPublishing(false);
      }
    } catch (err: any) {
      setJobState("PUBLICATION_FAILED");
      setErrorMessage(err?.message || "Erro inesperado ao publicar.");
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0B192C] border border-slate-700/80 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-slate-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                <Send className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Publicar Conteúdo no StaziaMed Revalida
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Destino do conteúdo publicado: <strong className="text-teal-300">ESTUDAR &gt; Grandes Temas</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 1. Canonical Topic Confirmation Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-teal-400" />
            <span>Confirmar Tema Canônico (STAZIAMED_CANONICAL_TOPICS)</span>
          </label>
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            disabled={isPublishing || jobState === "PUBLISHED"}
            className="w-full bg-[#071322] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium cursor-pointer"
          >
            {STAZIAMED_CANONICAL_TOPICS.map((topic) => (
              <option key={topic.id} value={topic.id}>
                [{CANONICAL_AREA_LABELS[topic.area] || topic.area}] {topic.name} ({topic.id})
              </option>
            ))}
          </select>
          {selectedTopicDef && (
            <p className="text-[11px] text-slate-400 flex items-center gap-2 pl-1">
              <span>Especialidade: <strong className="text-slate-200">{selectedTopicDef.specialty}</strong></span>
              <span>•</span>
              <span>Área: <strong className="text-slate-200">{CANONICAL_AREA_LABELS[selectedTopicDef.area]}</strong></span>
            </p>
          )}
        </div>

        {/* 2. Publication Preflight Gates Checklist */}
        <div className="space-y-3 p-4 rounded-2xl bg-[#071322] border border-slate-800">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
            <span>Preflight Gates de Publicação</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono ${
                preflightReport?.passed
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}
            >
              {preflightReport?.passed ? "PREFLIGHT PASS" : "PREFLIGHT BLOCKED"}
            </span>
          </div>

          <div className="space-y-2">
            {preflightReport?.checks.map((check) => (
              <div
                key={check.gate}
                className="flex items-start gap-2 text-xs"
              >
                {check.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-mono text-[11px] text-slate-300 font-bold">
                    {check.gate}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-snug">
                    {check.message}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Total de Blocos: <strong className="text-white">{totalBlocks}</strong></span>
            <span>Leitura Estimada: <strong className="text-white">~{preflightReport?.estimatedReadMinutes || 10} min</strong></span>
          </div>
        </div>

        {/* 3. Job State & Errors */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Publicação Bloqueada:</span>
              <p className="text-[11px] text-rose-200/90 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {jobState === "PUBLISHED" && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-white">Conteúdo Publicado com Sucesso!</p>
              <p className="text-[11px] text-emerald-200">
                O tema já está disponível nativamente para os alunos em Grandes Temas.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            {jobState === "PUBLISHED" ? "Fechar" : "Cancelar"}
          </button>

          {jobState !== "PUBLISHED" && (
            <button
              type="button"
              disabled={isPublishing || !preflightReport?.passed}
              onClick={handleExecutePublish}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publicando Snapshot...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirmar & Publicar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
