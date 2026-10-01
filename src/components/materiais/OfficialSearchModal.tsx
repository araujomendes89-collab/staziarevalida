import React from "react";
import { X, ShieldCheck } from "lucide-react";
import { OfficialMedicalSearchView } from "./OfficialMedicalSearchView";

interface OfficialSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const OfficialSearchModal: React.FC<OfficialSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery = "",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-[#070b12] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-y-auto scrollbar-thin p-4 sm:p-6">
        {/* Close Button */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Auditoria de Diretriz 2026
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search View Body */}
        <OfficialMedicalSearchView initialQuery={initialQuery} />
      </div>
    </div>
  );
};
