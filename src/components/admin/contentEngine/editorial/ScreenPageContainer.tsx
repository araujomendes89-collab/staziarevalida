import React from "react";
import { EditorialBlock, EditorialPagePlan } from "../../../../types/medicalEditorial";
import { EditorialBlockRenderer } from "./EditorialBlockRenderer";
import { MedicalEditorialHero, StaziaEditorialFooter } from "./EditorialComponents";

interface ScreenPageContainerProps {
  page: EditorialPagePlan;
  totalPages: number;
  topic: string;
  area?: string;
  specialty?: string;
  subtopics?: string[];
  selectedBlockId?: string | null;
  onSelectBlock?: (block: EditorialBlock) => void;
  viewport?: "DESKTOP" | "TABLET" | "MOBILE";
}

export const ScreenPageContainer: React.FC<ScreenPageContainerProps> = ({
  page,
  totalPages,
  topic,
  area,
  specialty,
  subtopics,
  selectedBlockId,
  onSelectBlock,
  viewport = "DESKTOP",
}) => {
  const isFirstPage = page.pageIndex === 1;

  const getContainerWidth = () => {
    switch (viewport) {
      case "MOBILE":
        return "w-[390px] max-w-full p-4";
      case "TABLET":
        return "w-[680px] max-w-full p-6 sm:p-8";
      case "DESKTOP":
      default:
        return "w-full max-w-3xl p-8 sm:p-10";
    }
  };

  return (
    <div
      className={`bg-[#FFFFFF] text-[#0F172A] shadow-xl rounded-2xl border border-slate-200 font-sans mx-auto transition-all ${getContainerWidth()}`}
    >
      {/* Main Content Area */}
      <div className="space-y-3.5">
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

        <div className="space-y-3">
          {page.blocks.map((block) => (
            <EditorialBlockRenderer
              key={block.id}
              block={block}
              isSelected={selectedBlockId === block.id}
              onSelect={onSelectBlock}
            />
          ))}
        </div>
      </div>

      <StaziaEditorialFooter
        pageIndex={page.pageIndex}
        totalPages={totalPages}
        topic={topic}
      />
    </div>
  );
};
