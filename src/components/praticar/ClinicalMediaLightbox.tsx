import React, { useState, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface ClinicalMediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  caption?: string;
}

export const ClinicalMediaLightbox: React.FC<ClinicalMediaLightboxProps> = ({
  isOpen,
  onClose,
  imageUrl,
  caption,
}) => {
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.3, 0.7));
  const handleResetZoom = () => setScale(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in select-none"
      onClick={onClose}
    >
      {/* Top Floating Controls */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-2 py-1 shadow-lg text-white">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Reduzir zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono font-bold px-1 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white"
            title="Resetar tamanho"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2.5 bg-slate-900/90 hover:bg-rose-900/80 border border-slate-700 text-white hover:text-rose-200 rounded-xl transition-all shadow-lg cursor-pointer"
          title="Fechar (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image Container */}
      <div
        className="w-full h-full flex flex-col items-center justify-center p-4 overflow-auto cursor-zoom-out"
        onClick={onClose}
      >
        <div
          className="relative max-w-5xl max-h-[85vh] transition-transform duration-200 ease-out cursor-default"
          style={{ transform: `scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageUrl}
            alt={caption || "Imagem clínica ampliada"}
            className="max-h-[82vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800 bg-white"
            referrerPolicy="no-referrer"
          />
          {caption && (
            <p className="mt-3 text-center text-xs text-slate-300 font-medium bg-slate-900/90 py-1.5 px-4 rounded-full max-w-lg mx-auto border border-slate-800">
              {caption}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
