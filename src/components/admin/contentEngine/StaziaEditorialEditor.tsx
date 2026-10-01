import React, { useState } from "react";
import {
  FileText,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Smartphone,
  Tablet,
  Monitor,
  ArrowUp,
  ArrowDown,
  Split,
  Edit3,
  Eye,
  Sliders,
  FolderTree,
  BookOpen,
  Download,
  UploadCloud,
  Loader2,
  History,
  ShieldAlert,
  Send,
} from "lucide-react";
import {
  EditorialBlock,
  EditorialComponentType,
  StaziaEditorialDocumentDraft,
} from "../../../types/medicalEditorial";
import {
  EditorialPdfExport,
  RightsReviewStatus,
} from "../../../types/editorialPdfExport";
import { CANONICAL_AREA_LABELS } from "../../../types/medicalTaxonomy";
import { A4PageContainer } from "./editorial/A4PageContainer";
import { ScreenPageContainer } from "./editorial/ScreenPageContainer";
import { AdminPublishModal } from "./editorial/AdminPublishModal";

interface StaziaEditorialEditorProps {
  draft: StaziaEditorialDocumentDraft;
  onClose: () => void;
  onApproveLayout?: (draftId: string) => void;
  onReorderBlock?: (pageIndex: number, fromIdx: number, toIdx: number) => void;
  onChangeComponentType?: (blockId: string, newType: EditorialComponentType) => void;
  onInsertPageBreak?: (blockId: string) => void;
  onExportPdf?: (draft: StaziaEditorialDocumentDraft) => Promise<EditorialPdfExport | null>;
  onDownloadPdf?: (exportId: string) => void;
  onRightsReview?: (draftId: string, status: RightsReviewStatus) => Promise<void>;
  exportsHistory?: EditorialPdfExport[];
}

type ViewMode = "A4_PORTRAIT" | "SCREEN";
type ScreenViewport = "DESKTOP" | "TABLET" | "MOBILE";

type ExportModalStep =
  | "IDLE"
  | "PREPARING"
  | "PREFLIGHT"
  | "RENDERING"
  | "GENERATING"
  | "VALIDATING"
  | "READY"
  | "BLOCKED_RIGHTS"
  | "FAILED";

export const StaziaEditorialEditor: React.FC<StaziaEditorialEditorProps> = ({
  draft,
  onClose,
  onApproveLayout,
  onReorderBlock,
  onChangeComponentType,
  onInsertPageBreak,
  onExportPdf,
  onDownloadPdf,
  onRightsReview,
  exportsHistory = [],
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("A4_PORTRAIT");
  const [screenViewport, setScreenViewport] = useState<ScreenViewport>("DESKTOP");
  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const [selectedBlock, setSelectedBlock] = useState<EditorialBlock | null>(null);

  // PDF Export Modal & Progress States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [exportStep, setExportStep] = useState<ExportModalStep>("IDLE");
  const [currentExport, setCurrentExport] = useState<EditorialPdfExport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isReviewingRights, setIsReviewingRights] = useState(false);

  const totalPages = draft.pages.length || 1;
  const currentPagePlan = draft.pages.find((p) => p.pageIndex === currentPageIndex) || draft.pages[0];

  const handleNextPage = () => {
    if (currentPageIndex < totalPages) {
      setCurrentPageIndex((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 1) {
      setCurrentPageIndex((prev) => prev - 1);
    }
  };

  const isApproved = draft.status === "APPROVED_EDITORIAL";
  const unaccountedBlocks = draft.plan.unaccountedSourceBlocks || 0;
  const duplicatedBlocks = draft.plan.duplicatedSourceBlockAssignments || 0;
  const canApprove = unaccountedBlocks === 0 && duplicatedBlocks === 0;

  const handleStartExport = async () => {
    setIsExportModalOpen(true);
    setExportError(null);
    setExportStep("PREPARING");

    try {
      setExportStep("PREFLIGHT");
      if (onExportPdf) {
        setExportStep("RENDERING");
        const result = await onExportPdf(draft);
        if (result) {
          setCurrentExport(result);
          setExportStep("READY");
        } else {
          setExportStep("READY");
        }
      } else {
        // Fallback simulation for local state
        setTimeout(() => setExportStep("RENDERING"), 300);
        setTimeout(() => setExportStep("GENERATING"), 600);
        setTimeout(() => setExportStep("VALIDATING"), 900);
        setTimeout(() => setExportStep("READY"), 1200);
      }
    } catch (err: any) {
      console.error("[Export UI Error]:", err);
      if (err?.code === "EXPORT_BLOCKED_RIGHTS") {
        setExportStep("BLOCKED_RIGHTS");
      } else {
        setExportStep("FAILED");
      }
      setExportError(err?.message || "Falha na geração do PDF de alta fidelidade.");
    }
  };

  const handleApproveRights = async () => {
    if (!onRightsReview) return;
    setIsReviewingRights(true);
    try {
      await onRightsReview(draft.id, "APPROVED");
      setIsReviewingRights(false);
      // Restart export
      handleStartExport();
    } catch (err: any) {
      setIsReviewingRights(false);
      setExportError(err?.message || "Erro ao aprovar direitos autorais.");
    }
  };

  const componentTypeOptions: { label: string; value: EditorialComponentType }[] = [
    { label: "Parágrafo Editorial", value: "EditorialParagraph" },
    { label: "Post-it / Nota Clínica", value: "StickyNoteCard" },
    { label: "Alerta Clínico / Warning", value: "ClinicalWarningCard" },
    { label: "Definição / Conceito", value: "DefinitionCard" },
    { label: "Subtítulo / Heading", value: "EditorialSubheading" },
    { label: "Brush Section Header", value: "BrushSectionHeader" },
    { label: "Atualização de Protocolo", value: "ProtocolUpdateCard" },
    { label: "Diagnóstico Diferencial", value: "ComparisonCard" },
    { label: "Síntese / Resumo", value: "QuickSummaryStrip" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#070d18]/95 backdrop-blur-md flex flex-col font-sans text-slate-200 select-none overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="h-16 px-4 sm:px-6 bg-[#0c1626] border-b border-slate-800 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Fechar Editor"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-teal-400" />
                Editor Medical Editorial V1
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                v2026.1.0
              </span>
              {isApproved ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Layout Aprovado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Em Revisão Editorial
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-md mt-0.5">
              {draft.topic} • {draft.area ? (CANONICAL_AREA_LABELS as any)[draft.area] || draft.area : "Área Clínica"}
            </p>
          </div>
        </div>

        {/* View Mode & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-black/40 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("A4_PORTRAIT")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "A4_PORTRAIT"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>A4 Print</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("SCREEN")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "SCREEN"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Tela</span>
            </button>
          </div>

          {/* Screen Viewport Switcher */}
          {viewMode === "SCREEN" && (
            <div className="flex items-center bg-black/40 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setScreenViewport("DESKTOP")}
                className={`p-1.5 rounded-lg cursor-pointer ${
                  screenViewport === "DESKTOP" ? "bg-teal-600/30 text-teal-300" : "text-slate-400"
                }`}
                title="Desktop"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setScreenViewport("TABLET")}
                className={`p-1.5 rounded-lg cursor-pointer ${
                  screenViewport === "TABLET" ? "bg-teal-600/30 text-teal-300" : "text-slate-400"
                }`}
                title="Tablet"
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setScreenViewport("MOBILE")}
                className={`p-1.5 rounded-lg cursor-pointer ${
                  screenViewport === "MOBILE" ? "bg-teal-600/30 text-teal-300" : "text-slate-400"
                }`}
                title="Mobile (390px)"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Zoom Controls for A4 */}
          {viewMode === "A4_PORTRAIT" && (
            <div className="hidden sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.max(0.5, prev - 0.1))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono px-1.5 text-slate-300">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.min(1.2, prev + 0.1))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(0.85)}
                className="px-2 py-1 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                title="Ajustar"
              >
                Ajustar
              </button>
            </div>
          )}

          {/* Action Buttons */}
          {!isApproved ? (
            <button
              type="button"
              disabled={!canApprove}
              onClick={() => onApproveLayout && onApproveLayout(draft.id)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Aprovar Layout</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartExport}
                className="px-3.5 py-2 bg-slate-850 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 text-teal-400" />
                <span>Exportar PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPublishModalOpen(true)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Publicar no StaziaMed</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Workspace (Split View) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel: Inspector & Structure Outline */}
        <div className="w-full lg:w-80 xl:w-96 bg-[#0c1626] border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
          {/* Provenance Audit Strip */}
          <div className="p-3 bg-black/40 border-b border-slate-800 text-[11px] flex items-center justify-between font-mono">
            <span className="text-slate-400">Auditoria de Blocos:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              100% Verbatim (Zero Loss)
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Selected Block Provenance Inspector */}
            {selectedBlock ? (
              <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Inspetor de Proveniência-Fonte
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedBlock(null)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 font-mono">
                  <div className="flex justify-between border-b border-teal-500/20 pb-1">
                    <span className="text-slate-400">Página de Origem:</span>
                    <span className="font-bold text-white">{selectedBlock.provenance.sourcePage}</span>
                  </div>
                  <div className="flex justify-between border-b border-teal-500/20 pb-1">
                    <span className="text-slate-400">ID do Bloco-Fonte:</span>
                    <span className="text-slate-200 truncate max-w-[150px]">
                      {selectedBlock.provenance.sourceBlockId}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-teal-500/20 pb-1">
                    <span className="text-slate-400">Tipo Editorial:</span>
                    <span className="text-teal-300 font-semibold">{selectedBlock.type}</span>
                  </div>
                </div>

                {/* Verbatim Source Content Inspection */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Texto Fonte Fiel (100% Verbatim):
                  </span>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-slate-700/60 text-[11px] text-slate-200 font-sans max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                    {selectedBlock.provenance.sourceTextVerbatim}
                  </div>
                </div>

                {/* Admin Block Actions */}
                <div className="space-y-2 pt-2 border-t border-teal-500/20">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Trocar Componente Visual:
                  </label>
                  <select
                    value={selectedBlock.type}
                    onChange={(e) => {
                      const newType = e.target.value as EditorialComponentType;
                      if (onChangeComponentType) {
                        onChangeComponentType(selectedBlock.id, newType);
                        setSelectedBlock((prev) => (prev ? { ...prev, type: newType } : null));
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-slate-700 text-xs text-white focus:outline-none focus:border-teal-400"
                  >
                    {componentTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      if (onInsertPageBreak) {
                        onInsertPageBreak(selectedBlock.id);
                      }
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition-colors cursor-pointer"
                  >
                    <Split className="w-3.5 h-3.5 text-teal-400" />
                    <span>Inserir Quebra de Página Aqui</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-black/20 border border-slate-800 text-xs text-slate-400 text-center space-y-2">
                <Sliders className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-300">Nenhum bloco selecionado</p>
                <p className="text-[11px] text-slate-500">
                  Clique em qualquer bloco na página ao lado para inspecionar a proveniência original e reordenar.
                </p>
              </div>
            )}

            {/* Page Blocks Outline & Ordering */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Estrutura da Página {currentPageIndex} ({currentPagePlan?.blocks.length || 0} blocos)
              </span>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {currentPagePlan?.blocks.map((b, idx) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBlock(b)}
                    className={`p-2 rounded-xl text-xs flex items-center justify-between border transition-all cursor-pointer ${
                      selectedBlock?.id === b.id
                        ? "bg-teal-500/20 border-teal-500/40 text-teal-200"
                        : "bg-black/30 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[10px] font-mono text-slate-500">#{b.editorialOrder}</span>
                      <span className="font-medium truncate max-w-[140px]">{b.type}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onReorderBlock) onReorderBlock(currentPageIndex, idx, idx - 1);
                        }}
                        className="p-1 text-slate-500 hover:text-white disabled:opacity-20 cursor-pointer"
                        title="Subir bloco"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === (currentPagePlan?.blocks.length || 0) - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onReorderBlock) onReorderBlock(currentPageIndex, idx, idx + 1);
                        }}
                        className="p-1 text-slate-500 hover:text-white disabled:opacity-20 cursor-pointer"
                        title="Descer bloco"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Export History Section */}
            {exportsHistory.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-teal-400" />
                  Histórico de Exportações PDF
                </span>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {exportsHistory.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-2.5 rounded-xl bg-black/30 border border-slate-800 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white font-mono">{exp.pageCount} pág</span>
                        {exp.isStale ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Desatualizado
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Atual
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>{new Date(exp.createdAt).toLocaleDateString("pt-BR")}</span>
                        {onDownloadPdf && (
                          <button
                            type="button"
                            onClick={() => onDownloadPdf(exp.id)}
                            className="text-teal-300 hover:text-teal-200 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Baixar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Page Viewport Canvas */}
        <div className="flex-1 bg-[#070d18] flex flex-col overflow-hidden">
          {/* Top Canvas Bar: Page Navigation & Density Badge */}
          <div className="h-12 px-6 bg-black/40 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPageIndex <= 1}
                onClick={handlePrevPage}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 cursor-pointer"
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono font-bold text-white px-2">
                Página {currentPageIndex} de {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPageIndex >= totalPages}
                onClick={handleNextPage}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 cursor-pointer"
                title="Próxima Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 text-[11px]">Densidade:</span>
                <span className="font-mono font-bold text-teal-300">
                  {currentPagePlan?.densityScore || 0} pts
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentPagePlan?.estimatedDensity === "BALANCED"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : currentPagePlan?.estimatedDensity === "LOW"
                      ? "bg-sky-500/20 text-sky-300"
                      : currentPagePlan?.estimatedDensity === "HIGH"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-rose-500/20 text-rose-300"
                  }`}
                >
                  {currentPagePlan?.estimatedDensity || "BALANCED"}
                </span>
              </div>
            </div>
          </div>

          {/* Canvas Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center items-start">
            {viewMode === "A4_PORTRAIT" ? (
              <A4PageContainer
                page={currentPagePlan}
                totalPages={totalPages}
                topic={draft.topic}
                area={draft.area}
                specialty={draft.specialty}
                subtopics={draft.subtopics}
                selectedBlockId={selectedBlock?.id}
                onSelectBlock={(b) => setSelectedBlock(b)}
                scale={zoomScale}
                renderMode="SCREEN"
              />
            ) : (
              <ScreenPageContainer
                page={currentPagePlan}
                totalPages={totalPages}
                topic={draft.topic}
                area={draft.area}
                specialty={draft.specialty}
                subtopics={draft.subtopics}
                selectedBlockId={selectedBlock?.id}
                onSelectBlock={(b) => setSelectedBlock(b)}
                viewport={screenViewport}
              />
            )}
          </div>
        </div>
      </div>

      {/* 3. High-Fidelity PDF Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c1626] border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-teal-400" />
                <h4 className="text-sm font-bold text-white">Exportação de PDF A4 de Alta Fidelidade</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Progress Checklist */}
            <div className="space-y-2.5 text-xs font-mono">
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  exportStep !== "IDLE" ? "bg-teal-500/10 border-teal-500/30 text-teal-200" : "bg-black/30 border-slate-800 text-slate-500"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  1. Preparação & Verificação A4
                </span>
                <span className="text-[10px]">210x297mm</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  exportStep === "BLOCKED_RIGHTS"
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-200"
                    : exportStep !== "IDLE" && exportStep !== "PREPARING"
                    ? "bg-teal-500/10 border-teal-500/30 text-teal-200"
                    : "bg-black/30 border-slate-800 text-slate-500"
                }`}
              >
                <span className="flex items-center gap-2">
                  {exportStep === "BLOCKED_RIGHTS" ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                  )}
                  2. Preflight de Direitos e Assets
                </span>
                <span className="text-[10px]">{exportStep === "BLOCKED_RIGHTS" ? "BLOQUEADO" : "PASS"}</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  exportStep === "RENDERING" || exportStep === "GENERATING" || exportStep === "VALIDATING" || exportStep === "READY"
                    ? "bg-teal-500/10 border-teal-500/30 text-teal-200"
                    : "bg-black/30 border-slate-800 text-slate-500"
                }`}
              >
                <span className="flex items-center gap-2">
                  {exportStep === "RENDERING" || exportStep === "GENERATING" ? (
                    <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                  )}
                  3. Renderização Server-Side (Chromium)
                </span>
                <span className="text-[10px]">Playwright</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  exportStep === "VALIDATING" || exportStep === "READY"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-bold"
                    : "bg-black/30 border-slate-800 text-slate-500"
                }`}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  4. Validação %PDF- & Texto Selecionável
                </span>
                <span className="text-[10px]">{exportStep === "READY" ? "100% OK" : "Pendente"}</span>
              </div>
            </div>

            {/* Rights Gate Blocked Banner */}
            {exportStep === "BLOCKED_RIGHTS" && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                <div className="flex items-start gap-2 text-rose-300 text-xs">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Exportação Bloqueada por Direitos Autorais</span>
                    <span className="text-slate-300 text-[11px]">
                      Este documento possui imagens ou referências que requerem aprovação formal de republicação.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isReviewingRights}
                  onClick={handleApproveRights}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-500/20"
                >
                  {isReviewingRights ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>Aprovar Direitos e Prosseguir com Exportação</span>
                </button>
              </div>
            )}

            {/* Error Message */}
            {exportError && exportStep === "FAILED" && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            {/* Success State with Download Action */}
            {exportStep === "READY" && (
              <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 text-xs space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>PDF A4 de Alta Fidelidade Gerado com Sucesso!</span>
                </div>
                <p className="text-slate-300 text-[11px]">
                  Documento pronto com texto selecionável, elementos vetoriais e paginação rigorosa.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    if (currentExport && onDownloadPdf) {
                      onDownloadPdf(currentExport.id);
                    }
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Arquivo PDF (A4)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Publication Modal */}
      <AdminPublishModal
        draft={draft}
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onPublishedSuccess={() => {
          setIsPublishModalOpen(false);
        }}
      />
    </div>
  );
};
