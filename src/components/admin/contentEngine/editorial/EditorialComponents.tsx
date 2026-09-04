import React from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle2,
  FileText,
  HelpCircle,
  Pin,
  Bookmark,
  Sparkles,
  ArrowRight,
  Layers,
  ChevronRight,
} from "lucide-react";
import {
  EditorialBlock,
  MEDICAL_EDITORIAL_TOKENS,
} from "../../../../types/medicalEditorial";
import { CANONICAL_AREA_LABELS } from "../../../../types/medicalTaxonomy";

/**
 * 1. MedicalEditorialHero
 */
export const MedicalEditorialHero: React.FC<{
  area?: string;
  specialty?: string;
  topic: string;
  subtopics?: string[];
}> = ({ area, specialty, topic, subtopics }) => {
  const areaLabel = area && (CANONICAL_AREA_LABELS as any)[area] ? (CANONICAL_AREA_LABELS as any)[area] : area || "Área Médica";

  return (
    <div className="mb-6 pb-5 border-b-2 border-slate-200">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#0A192F] text-white">
          {areaLabel}
        </span>
        {specialty && (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30">
            {specialty}
          </span>
        )}
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0A192F] tracking-tight leading-tight">
        {topic}
      </h1>

      {subtopics && subtopics.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Seções:</span>
          {subtopics.map((sub, i) => (
            <span
              key={i}
              className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
            >
              {sub}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 2. BrushSectionHeader (CSS/SVG Vector Brush Effect)
 */
export const BrushSectionHeader: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="my-5 relative">
      <div className="flex items-center gap-2.5">
        <div className="w-2.5 h-6 bg-[#0D9488] rounded-sm" />
        <h2 className="text-lg sm:text-xl font-bold text-[#0A192F] tracking-tight">
          {title}
        </h2>
      </div>
      {/* Decorative subtle Teal underline vector */}
      <svg className="w-full h-1.5 mt-1 text-[#0D9488]/40" viewBox="0 0 100 4" preserveAspectRatio="none">
        <path d="M0,2 Q50,4 100,1" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
};

/**
 * 3. EditorialSubheading
 */
export const EditorialSubheading: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="my-3 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
      <h3 className="text-sm sm:text-base font-bold text-[#0A192F] tracking-tight">
        {title}
      </h3>
    </div>
  );
};

/**
 * 4. EditorialParagraph
 */
export const EditorialParagraph: React.FC<{ text: string }> = ({ text }) => {
  return (
    <p className="my-2 text-[13px] leading-[1.65] text-[#0F172A] font-normal text-justify">
      {text}
    </p>
  );
};

/**
 * 5. EditorialList
 */
export const EditorialList: React.FC<{ items?: string[]; rawText?: string }> = ({ items, rawText }) => {
  const list = items && items.length > 0 ? items : (rawText || "").split("\n").filter((l) => l.trim().length > 0);

  return (
    <ul className="my-3 space-y-1.5 pl-1 text-[13px] text-[#0F172A]">
      {list.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] mt-2 shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
};

/**
 * 6. StickyNoteCard (Yellow Post-it with paper feel)
 */
export const StickyNoteCard: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-4 p-4 rounded-xl bg-[#FEF9C3] border border-amber-200/80 shadow-md shadow-amber-500/5 text-[#713F12] relative transform -rotate-[0.5deg]">
      <div className="flex items-center gap-2 mb-1.5 font-bold text-xs uppercase tracking-wider text-amber-900">
        <Pin className="w-3.5 h-3.5 text-amber-700" />
        <span>Ponto de Atenção & Nota Clínica</span>
      </div>
      <p className="text-[12.5px] leading-relaxed font-sans text-amber-950 whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
};

/**
 * 7. StaziaMedicalTable
 */
export const StaziaMedicalTable: React.FC<{ tableData?: any; caption?: string }> = ({ tableData, caption }) => {
  if (!tableData || !tableData.cells || tableData.cells.length === 0) {
    return (
      <div className="my-3 p-3 rounded-lg border border-dashed border-slate-300 text-slate-500 text-xs italic text-center">
        Tabela sem dados estruturados disponíveis.
      </div>
    );
  }

  const [headerRow, ...bodyRows] = tableData.cells;

  return (
    <div className="my-4 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {caption && (
        <div className="px-3.5 py-1.5 bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700">
          {caption}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px] border-collapse">
          <thead>
            <tr className="bg-[#0A192F] text-white font-bold">
              {headerRow.map((cell: string, idx: number) => (
                <th key={idx} className="p-2.5 border-r border-[#0A192F]/40 last:border-r-0">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {bodyRows.map((row: string[], rIdx: number) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                {row.map((cell: string, cIdx: number) => (
                  <td key={cIdx} className="p-2.5 border-r border-slate-100 last:border-r-0 text-slate-800 leading-snug">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 8. ClinicalWarningCard
 */
export const ClinicalWarningCard: React.FC<{
  text: string;
  variant?: "ATTENTION" | "HIGH_RISK" | "EMERGENCY";
}> = ({ text, variant = "HIGH_RISK" }) => {
  const isEmergency = variant === "EMERGENCY";
  const isHighRisk = variant === "HIGH_RISK";

  const containerClasses = isEmergency
    ? "bg-[#FEF2F2] border-2 border-rose-500 text-rose-950"
    : isHighRisk
    ? "bg-[#FEF2F2] border border-rose-300 text-rose-900"
    : "bg-[#FFF7ED] border border-amber-300 text-amber-900";

  const badgeClasses = isEmergency
    ? "bg-rose-600 text-white"
    : isHighRisk
    ? "bg-rose-500 text-white"
    : "bg-amber-500 text-white";

  const IconComponent = isEmergency ? ShieldAlert : AlertTriangle;
  const label = isEmergency ? "EMERGÊNCIA CLÍNICA / CONDUTA CRÍTICA" : isHighRisk ? "ALTO RISCO CARDIOVASCULAR" : "ATENÇÃO CLÍNICA";

  return (
    <div className={`my-4 p-4 rounded-xl shadow-sm ${containerClasses}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider flex items-center gap-1 ${badgeClasses}`}>
          <IconComponent className="w-3 h-3" />
          <span>{label}</span>
        </span>
      </div>
      <p className="text-[12.5px] leading-relaxed font-medium whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
};

/**
 * 9. ProtocolUpdateCard
 */
export const ProtocolUpdateCard: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-4 p-4 rounded-xl bg-[#FAF5FF] border border-purple-200 text-purple-950 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5 text-[11px] font-bold text-purple-800 uppercase tracking-wider">
        <Info className="w-3.5 h-3.5 text-purple-600" />
        <span>Atualização de Protocolo Oficial (MS / Diretriz)</span>
      </div>
      <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
};

/**
 * 10. DefinitionCard
 */
export const DefinitionCard: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-3 p-3.5 rounded-xl bg-slate-50 border-l-4 border-[#0A192F] border-y border-r border-slate-200 text-slate-800">
      <div className="text-[10px] font-extrabold uppercase text-[#0A192F] tracking-wider mb-1">
        Conceito & Definição
      </div>
      <p className="text-[12.5px] leading-relaxed font-medium italic">
        {text}
      </p>
    </div>
  );
};

/**
 * 11. ClinicalAlgorithmSteps
 */
export const ClinicalAlgorithmSteps: React.FC<{ text: string }> = ({ text }) => {
  const steps = text.split(/\n(?=\d+\.|\bPasso|\bEtapa)/i).filter((s) => s.trim().length > 0);

  return (
    <div className="my-4 p-4 rounded-xl bg-white border border-teal-200 shadow-sm">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-teal-100 text-[11px] font-bold text-[#0D9488] uppercase tracking-wider">
        <Layers className="w-3.5 h-3.5" />
        <span>Fluxograma / Algoritmo de Decisão Clínica</span>
      </div>

      <div className="space-y-2.5">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-teal-50/50 border border-teal-100/70 text-[12.5px] text-slate-800">
            <span className="w-6 h-6 rounded-full bg-[#0D9488] text-white font-bold text-xs flex items-center justify-center shrink-0">
              {idx + 1}
            </span>
            <div className="leading-relaxed whitespace-pre-wrap pt-0.5">{step.replace(/^\d+\.\s*/, "")}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 12. ComparisonCard
 */
export const ComparisonCard: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-4 p-4 rounded-xl bg-slate-50 border border-slate-300 shadow-sm text-slate-900">
      <div className="flex items-center gap-2 mb-2 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
        <span>Diagnóstico Diferencial / Comparação Clínica</span>
      </div>
      <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
};

/**
 * 13. MedicalImageBlock & Caption
 */
export const MedicalImageBlock: React.FC<{ figureData?: any; caption?: string; text?: string }> = ({
  figureData,
  caption,
  text,
}) => {
  const captionText = caption || figureData?.captionCandidate || text;

  return (
    <div className="my-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center">
      <div className="w-full h-44 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 font-mono text-xs">
        [ Visualização de Imagem / Figura Clínica do PDF ]
      </div>
      {captionText && (
        <p className="mt-2 text-[11px] text-slate-600 italic">
          Figura: {captionText}
        </p>
      )}
    </div>
  );
};

/**
 * 14. QuickSummaryStrip
 */
export const QuickSummaryStrip: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-4 p-3.5 rounded-xl bg-teal-50/80 border-t-4 border-[#0D9488] border-x border-b border-teal-200 text-teal-950">
      <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-[#0D9488] mb-1">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Síntese / Pontos-Chave da Fonte</span>
      </div>
      <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-slate-800">
        {text}
      </p>
    </div>
  );
};

/**
 * 15. ReferenceBlock
 */
export const ReferenceBlock: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-3 p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-500 font-mono leading-normal">
      <span className="font-bold text-slate-600">[Fonte/Referência]: </span>
      {text}
    </div>
  );
};

/**
 * 16. EditorialSourceWarning (Table unresolved / review warning)
 */
export const EditorialSourceWarning: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="my-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <div>
        <span className="font-bold">Aviso Editorial de Estrutura: </span>
        <span>{text || "Revisão de estrutura da tabela/figura necessária."}</span>
      </div>
    </div>
  );
};

/**
 * 17. StaziaEditorialFooter
 */
export const StaziaEditorialFooter: React.FC<{
  pageIndex: number;
  totalPages: number;
  topic: string;
}> = ({ pageIndex, totalPages, topic }) => {
  return (
    <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono">
      <span>StaziaMed Revalida • {topic}</span>
      <span>
        Página {pageIndex} de {totalPages}
      </span>
    </div>
  );
};
