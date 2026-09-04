import React from "react";
import { Check } from "lucide-react";

interface PersonalizationOptionCardProps {
  id: string;
  label: string;
  sublabel?: string;
  letter?: string;
  colorAccent?: string;
  isSelected: boolean;
  isMultiSelect?: boolean;
  onClick: () => void;
  className?: string;
}

export const PersonalizationOptionCard: React.FC<PersonalizationOptionCardProps> = ({
  id,
  label,
  sublabel,
  letter,
  colorAccent,
  isSelected,
  isMultiSelect = false,
  onClick,
  className = "",
}) => {
  return (
    <button
      onClick={onClick}
      type="button"
      role={isMultiSelect ? "checkbox" : "radio"}
      aria-checked={isSelected}
      className={`group w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-150 cursor-pointer min-h-[48px] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 ${
        isSelected
          ? "bg-[#0F2E42] border-teal-500 text-white shadow-sm shadow-teal-500/10"
          : "bg-[#132644]/70 border-slate-700/60 text-slate-200 hover:border-slate-600 hover:bg-[#162d50]"
      } ${className}`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Letter Indicator (A, B, C, D) if provided */}
        {letter && (
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
              isSelected
                ? "bg-teal-500 text-slate-900 border-teal-400"
                : "bg-slate-800 text-slate-400 border-slate-700 group-hover:text-slate-200"
            }`}
          >
            {letter}
          </div>
        )}

        {/* Color Accent Dot for Medical Areas */}
        {colorAccent && (
          <div
            className="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-900 shadow-xs"
            style={{ backgroundColor: colorAccent }}
            aria-hidden="true"
          />
        )}

        {/* Text Details */}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug">{label}</div>
          {sublabel && (
            <div className="text-xs text-slate-400 mt-0.5 leading-normal">{sublabel}</div>
          )}
        </div>
      </div>

      {/* Selection Checkmark Indicator for Multiselect or Radio */}
      <div
        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ml-3 transition-colors ${
          isSelected
            ? "bg-teal-500 border-teal-400 text-slate-900"
            : "border-slate-600 bg-slate-800/40 text-transparent"
        }`}
      >
        <Check className="w-3.5 h-3.5 stroke-[3]" />
      </div>
    </button>
  );
};
