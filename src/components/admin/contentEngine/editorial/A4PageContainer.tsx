import React from "react";
import { EditorialBlock, EditorialPagePlan } from "../../../../types/medicalEditorial";
import { CANONICAL_A4_PRINT_CONFIG } from "../../../../types/editorialPdfExport";
import { EditorialBlockRenderer } from "./EditorialBlockRenderer";
import { MedicalEditorialHero, StaziaEditorialFooter } from "./EditorialComponents";

export interface A4PageContainerProps {
  page: EditorialPagePlan;
  totalPages: number;
  topic: string;
  area?: string;
  specialty?: string;
  subtopics?: string[];
  selectedBlockId?: string | null;
  onSelectBlock?: (block: EditorialBlock) => void;
  scale?: number; // Zoom scaling (e.g. 0.5, 0.75, 1.0)
  renderMode?: "SCREEN" | "PRINT";
}

export const A4PageContainer: React.FC<A4PageContainerProps> = ({
  page,
  totalPages,
  topic,
  area,
  specialty,
  subtopics,
  selectedBlockId,
  onSelectBlock,
  scale = 1.0,
  renderMode = "SCREEN",
}) => {
  const isFirstPage = page.pageIndex === 1;
  const isPrint = renderMode === "PRINT";

  const containerStyle: React.CSSProperties = isPrint
    ? {
        width: CANONICAL_A4_PRINT_CONFIG.width,
        minHeight: CANONICAL_A4_PRINT_CONFIG.height,
        height: CANONICAL_A4_PRINT_CONFIG.height,
        paddingTop: CANONICAL_A4_PRINT_CONFIG.safeTop,
        paddingRight: CANONICAL_A4_PRINT_CONFIG.safeRight,
        paddingBottom: CANONICAL_A4_PRINT_CONFIG.safeBottom,
        paddingLeft: CANONICAL_A4_PRINT_CONFIG.safeLeft,
        boxSizing: "border-box",
        pageBreakAfter: "always",
        breakAfter: "page",
      }
    : {
        width: CANONICAL_A4_PRINT_CONFIG.width,
        minHeight: CANONICAL_A4_PRINT_CONFIG.height,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        boxSizing: "border-box",
      };

  const content = (
    <div
      data-page-index={page.pageIndex}
      data-render-mode={renderMode}
      className={`bg-[#FFFFFF] text-[#0F172A] font-sans mx-auto relative flex flex-col justify-between ${
        isPrint
          ? "a4-print-page overflow-hidden"
          : "w-[210mm] min-h-[297mm] max-w-full rounded-sm p-10 sm:p-14 border border-slate-300 select-text"
      }`}
      style={containerStyle}
    >
      {/* Main Content Area */}
      <div className="flex-1 space-y-3">
        {/* Header on Page 1 vs Subsequent Pages */}
        {isFirstPage ? (
          <MedicalEditorialHero
            area={area}
            specialty={specialty}
            topic={topic}
            subtopics={subtopics}
          />
        ) : (
          <div className="pb-3 mb-4 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>{topic}</span>
            <span>{area || "StaziaMed Revalida"}</span>
          </div>
        )}

        {/* Render Page Editorial Blocks */}
        <div className="space-y-3">
          {page.blocks.map((block) => (
            <EditorialBlockRenderer
              key={block.id}
              block={block}
              isSelected={!isPrint && selectedBlockId === block.id}
              onSelect={!isPrint ? onSelectBlock : undefined}
              renderMode={renderMode}
            />
          ))}
        </div>
      </div>

      {/* Editorial Footer */}
      <StaziaEditorialFooter
        pageIndex={page.pageIndex}
        totalPages={totalPages}
        topic={topic}
      />
    </div>
  );

  if (isPrint) {
    return content;
  }

  return (
    <div
      style={{
        transform: scale !== 1.0 ? `scale(${scale})` : undefined,
        transformOrigin: "top center",
      }}
      className="transition-transform duration-150"
    >
      {content}
    </div>
  );
};
