import React from "react";
import { BillingCycle } from "./pricingTypes";

interface BillingCycleToggleProps {
  billingCycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
}

export const BillingCycleToggle: React.FC<BillingCycleToggleProps> = ({
  billingCycle,
  onChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 my-6">
      <div
        role="group"
        aria-label="Ciclo de cobrança"
        className="inline-flex p-1.5 rounded-full bg-slate-100/90 border border-slate-200 shadow-inner"
      >
        <button
          type="button"
          role="radio"
          aria-checked={billingCycle === "monthly"}
          onClick={() => onChange("monthly")}
          className={`px-6 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
            billingCycle === "monthly"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Mensal
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={billingCycle === "annual"}
          onClick={() => onChange("annual")}
          className={`px-6 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            billingCycle === "annual"
              ? "bg-[#0A1C3E] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>Anual</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-black tracking-wide">
            ECONOMIZE ATÉ 30%
          </span>
        </button>
      </div>
    </div>
  );
};
