import React from "react";
import { EditorialBlock } from "../../../../types/medicalEditorial";
import {
  BrushSectionHeader,
  ClinicalAlgorithmSteps,
  ClinicalWarningCard,
  ComparisonCard,
  DefinitionCard,
  EditorialList,
  EditorialParagraph,
  EditorialSourceWarning,
  EditorialSubheading,
  MedicalFigureCaption,
  MedicalImageBlock,
  ProtocolUpdateCard,
  QuickSummaryStrip,
  ReferenceBlock,
  StaziaMedicalTable,
  StickyNoteCard,
} from "./EditorialComponents";

interface EditorialBlockRendererProps {
  block: EditorialBlock;
  isSelected?: boolean;
  onSelect?: (block: EditorialBlock) => void;
  renderMode?: "SCREEN" | "PRINT";
}

export const EditorialBlockRenderer: React.FC<EditorialBlockRendererProps> = ({
  block,
  isSelected,
  onSelect,
  renderMode = "SCREEN",
}) => {
  const isPrint = renderMode === "PRINT";

  const handleClick = (e: React.MouseEvent) => {
    if (isPrint) return;
    e.stopPropagation();
    if (onSelect) {
      onSelect(block);
    }
  };

  const renderComponent = () => {
    switch (block.type) {
      case "BrushSectionHeader":
        return <BrushSectionHeader title={block.content} />;
      case "EditorialSubheading":
        return <EditorialSubheading title={block.content} />;
      case "EditorialParagraph":
        return <EditorialParagraph text={block.content} />;
      case "EditorialList":
        return <EditorialList items={block.listItems} rawText={block.content} />;
      case "StickyNoteCard":
        return <StickyNoteCard text={block.content} />;
      case "StaziaMedicalTable":
        return <StaziaMedicalTable tableData={block.tableData} caption={block.content} />;
      case "ClinicalWarningCard":
        return <ClinicalWarningCard text={block.content} variant={block.warningSeverity} />;
      case "ProtocolUpdateCard":
        return <ProtocolUpdateCard text={block.content} />;
      case "ComparisonCard":
        return <ComparisonCard text={block.content} />;
      case "ClinicalAlgorithmSteps":
        return <ClinicalAlgorithmSteps text={block.content} />;
      case "MedicalImageBlock":
        return <MedicalImageBlock figureData={block.figureData} text={block.content} />;
      case "MedicalFigureCaption":
        return <p className="text-[11px] text-slate-500 italic my-1">{block.content}</p>;
      case "DefinitionCard":
        return <DefinitionCard text={block.content} />;
      case "QuickSummaryStrip":
        return <QuickSummaryStrip text={block.content} />;
      case "ReferenceBlock":
        return <ReferenceBlock text={block.content} />;
      case "EditorialSourceWarning":
        return <EditorialSourceWarning text={block.content} />;
      default:
        return <EditorialParagraph text={block.content} />;
    }
  };

  if (isPrint) {
    return (
      <div
        id={block.id}
        data-block-id={block.id}
        data-block-type={block.type}
        className="editorial-print-block break-inside-avoid"
        style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
      >
        {renderComponent()}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`relative transition-all cursor-pointer group rounded-lg ${
        isSelected
          ? "ring-2 ring-teal-500 bg-teal-50/20"
          : "hover:ring-1 hover:ring-teal-400/40"
      }`}
    >
      {renderComponent()}

      {/* Floating provenance tag on hover */}
      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0A192F] text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none z-10">
        Pág {block.provenance.sourcePage} • #{block.sourceOrder}
      </div>
    </div>
  );
};
