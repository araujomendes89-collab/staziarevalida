import React, { useState } from "react";
import {
  FileText,
  Layers,
  Image as ImageIcon,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  X,
  Copy,
  Check,
  Database,
  Hash,
  FileSearch,
  Sparkles,
  GitCompare,
  Edit3,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { SourceDocument, ExtractedPdfPage } from "../../../types/pdfIngestion";
import { ResolvedSourcePage, ManualReviewAction } from "../../../types/pdfOcr";

interface SourceDocumentPreviewProps {
  document: SourceDocument;
  onClose: () => void;
  onManualReview?: (pageNumber: number, action: ManualReviewAction, editedText?: string) => void;
}

type LayerViewMode = "ORIGINAL_NATIVE" | "OCR_EXTRACTION" | "RESOLVED_SOURCE";

export const SourceDocumentPreview: React.FC<SourceDocumentPreviewProps> = ({
  document,
  onClose,
  onManualReview,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [viewMode, setLayerViewMode] = useState<LayerViewMode>("RESOLVED_SOURCE");
  const [copiedText, setCopiedText] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const extracted = document.extractedDocument;
  const pages: ExtractedPdfPage[] = extracted?.pages || [];
  const resolvedPages: ResolvedSourcePage[] = document.resolvedPages || [];

  const currentNativePage: ExtractedPdfPage | undefined = pages[currentPageIndex];
  const currentResolvedPage: ResolvedSourcePage | undefined = resolvedPages[currentPageIndex];

  const handleCopyPageText = () => {
    let textToCopy = "";
    if (viewMode === "ORIGINAL_NATIVE") textToCopy = currentNativePage?.text || "";
    else if (viewMode === "OCR_EXTRACTION") textToCopy = currentResolvedPage?.ocrExtraction?.text || "";
    else textToCopy = currentResolvedPage?.resolvedText || currentNativePage?.text || "";

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const getContentModeBadge = () => {
    switch (document.contentMode) {
      case "TEXT_PDF":
        return {
          label: "PDF Nativo (Texto Direto)",
          color: "bg-teal-500/20 text-teal-300 border-teal-500/30",
        };
      case "SCANNED_PDF":
        return {
          label: "PDF Escaneado (Imagem)",
          color: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        };
      case "MIXED_PDF":
        return {
          label: "PDF Misto (Texto + Scan)",
          color: "bg-sky-500/20 text-sky-300 border-sky-500/30",
        };
    }
  };

  const getResolutionMethodBadge = () => {
    const method = currentResolvedPage?.resolutionMethod;
    switch (method) {
      case "NATIVE_ONLY":
        return (
          <span className="text-[10px] font-bold text-teal-300 bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-teal-400" />
            Fonte Nativa
          </span>
        );
      case "OCR_ONLY":
        return (
          <span className="text-[10px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            OCR Concluído
          </span>
        );
      case "NATIVE_WITH_OCR_COMPLEMENT":
        return (
          <span className="text-[10px] font-bold text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <Layers className="w-3 h-3 text-sky-400" />
            Nativo + Complemento OCR
          </span>
        );
      case "MANUAL_REVIEW_REQUIRED":
        return (
          <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Revisão Necessária
          </span>
        );
      default:
        return currentNativePage?.hasNativeText ? (
          <span className="text-[10px] font-bold text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-lg">
            Nativo
          </span>
        ) : (
          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
            OCR Necessário
          </span>
        );
    }
  };

  const modeBadge = getContentModeBadge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-[24px] bg-[#0c1626] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 bg-[#09111e]/90 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1">
                <FileSearch className="w-3 h-3" />
                Source Document Preview (3 Layers)
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${modeBadge.color}`}>
                {modeBadge.label}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                {document.sourceType}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                {document.rightsType}
              </span>
            </div>

            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-400 shrink-0" />
              <span>{document.title}</span>
            </h3>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Hash className="w-3 h-3 text-slate-500" />
                SHA: {document.documentFingerprint ? `${document.documentFingerprint.slice(0, 12)}...` : "N/A"}
              </span>
              <span>•</span>
              <span>Arquivo: {document.fileName}</span>
              <span>•</span>
              <span>Tamanho: {(document.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
              <span>•</span>
              <span>Total Páginas: {document.pageCount}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Layer View Switcher Tab Bar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-black/40 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setLayerViewMode("RESOLVED_SOURCE");
                setIsEditing(false);
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "RESOLVED_SOURCE"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>1. Fonte Resolvida (Reconciled)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLayerViewMode("ORIGINAL_NATIVE");
                setIsEditing(false);
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "ORIGINAL_NATIVE"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>2. Extração Nativa</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLayerViewMode("OCR_EXTRACTION");
                setIsEditing(false);
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "OCR_EXTRACTION"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>3. Extração OCR / Multimodal</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {getResolutionMethodBadge()}
          </div>
        </div>

        {/* Page Content Viewer */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-4">
            {/* Page Navigator Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-black/30 border border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={currentPageIndex === 0}
                  onClick={() => {
                    setCurrentPageIndex((prev) => Math.max(0, prev - 1));
                    setIsEditing(false);
                  }}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs font-bold text-white px-2">
                  Página {currentPageIndex + 1} de {pages.length || 1}
                </span>

                <button
                  type="button"
                  aria-label="Página seguinte"
                  disabled={currentPageIndex >= (pages.length || 1) - 1}
                  onClick={() => {
                    setCurrentPageIndex((prev) => Math.min((pages.length || 1) - 1, prev + 1));
                    setIsEditing(false);
                  }}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPageText}
                  className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copiar Texto</span>
                    </>
                  )}
                </button>

                {/* Manual Review Actions */}
                <button
                  type="button"
                  onClick={() => {
                    onManualReview?.(currentPageIndex + 1, "SOURCE_APPROVED");
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Aprovar Fonte</span>
                </button>
              </div>
            </div>

            {/* Conflict or Warning Banner */}
            {currentResolvedPage?.warnings && currentResolvedPage.warnings.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Avisos de Reconciliação / Conflito</span>
                </div>
                {currentResolvedPage.warnings.map((w, idx) => (
                  <p key={idx} className="text-slate-300">{w}</p>
                ))}
              </div>
            )}

            {/* Verbatim Text Representation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-semibold text-slate-300">
                  {viewMode === "ORIGINAL_NATIVE"
                    ? "Texto Nativo Bruto (Sem OCR)"
                    : viewMode === "OCR_EXTRACTION"
                    ? "Texto Transcrito via OCR Multimodal"
                    : "Texto da Fonte Reconciliado (Verbatim Fidelity)"}
                </span>
                <span className="font-mono text-[10px]">SOURCE FIRST — Zero Generative AI</span>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={8}
                    className="w-full p-4 rounded-2xl bg-black/70 border border-teal-500 text-slate-200 text-xs font-mono leading-relaxed focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onManualReview?.(currentPageIndex + 1, "NEEDS_MANUAL_CORRECTION", editText);
                        setIsEditing(false);
                      }}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs"
                    >
                      Salvar Correção Manual
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-black/60 border border-slate-800 text-slate-200 text-xs leading-relaxed font-mono whitespace-pre-wrap max-h-[360px] overflow-y-auto select-text">
                  {viewMode === "ORIGINAL_NATIVE"
                    ? currentNativePage?.text?.trim() || "[Nenhum texto nativo extraído nesta página]"
                    : viewMode === "OCR_EXTRACTION"
                    ? currentResolvedPage?.ocrExtraction?.text?.trim() || "[Nenhum texto OCR disponível]"
                    : currentResolvedPage?.resolvedText?.trim() || currentNativePage?.text?.trim() || "[Sem conteúdo textual]"}
                </div>
              )}
            </div>

            {/* Tables Container */}
            {(() => {
              const displayTables =
                currentResolvedPage && currentResolvedPage.resolvedTables.length > 0
                  ? currentResolvedPage.resolvedTables
                  : currentNativePage?.tables || [];

              if (displayTables.length === 0) return null;

              return (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                    <TableIcon className="w-3.5 h-3.5" />
                    Tabelas Detectadas / Reconciliadas ({displayTables.length})
                  </span>

                  <div className="space-y-3">
                    {displayTables.map((table) => (
                      <div
                        key={table.tableId}
                        className="p-3 rounded-2xl bg-sky-950/20 border border-sky-800/40 overflow-x-auto text-xs"
                      >
                        <table className="w-full text-left border-collapse">
                          <tbody>
                            {table.cells.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={
                                  rIdx === 0
                                    ? "bg-sky-500/15 font-bold text-sky-200"
                                    : "border-t border-slate-800/60 text-slate-300"
                                }
                              >
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2 border-r border-slate-800/40 last:border-r-0">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Figures Container (with strict RAW_UNINTERPRETED note) */}
            {(() => {
              const displayFigures =
                currentResolvedPage && currentResolvedPage.resolvedFigures.length > 0
                  ? currentResolvedPage.resolvedFigures
                  : (currentNativePage?.images || []).map((img) => ({
                      figureId: img.assetId,
                      pageNumber: img.pageNumber,
                      caption: img.captionCandidate,
                      captionRelation: img.captionCandidate ? ("ATTACHED" as const) : ("CAPTION_RELATION_UNCERTAIN" as const),
                      ocrVisibleText: "Elemento visual da página",
                      interpretationStatus: "RAW_UNINTERPRETED" as const,
                    }));

              if (displayFigures.length === 0) return null;

              return (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Elementos Visuais & Figuras ({displayFigures.length})
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {displayFigures.map((fig) => (
                      <div
                        key={fig.figureId}
                        className="p-3 rounded-xl bg-purple-950/20 border border-purple-800/40 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-200">Figura: {fig.figureId}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold font-mono">
                            {fig.interpretationStatus}
                          </span>
                        </div>
                        {fig.caption && (
                          <p className="text-slate-300 italic">Legenda: "{fig.caption}"</p>
                        )}
                        {fig.ocrVisibleText && (
                          <p className="text-slate-400 text-[11px] font-mono">
                            Texto Visível: {fig.ocrVisibleText}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-[#09111e]/90 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-mono text-[11px] truncate max-w-xs sm:max-w-md">
              {document.storagePath}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition-all cursor-pointer"
          >
            Fechar Visualização
          </button>
        </div>
      </div>
    </div>
  );
};
