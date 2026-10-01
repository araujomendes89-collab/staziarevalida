/**
 * Student Published Topic Renderer (Etapa 1.28F).
 * Renders immutable published topic content natively in responsive continuous screen flow.
 * Reuses the canonical MEDICAL_EDITORIAL_V1 component family without A4 page constraints.
 */

import React from "react";
import {
  ArrowLeft,
  Clock,
  BookOpen,
  Calendar,
  Layers,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  PublishedTopicHeader,
  PublishedTopicContentVersion,
  PublishedEditorialBlock,
} from "../../types/publishedContent";
import { CANONICAL_AREA_LABELS } from "../../types/medicalTaxonomy";
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
  MedicalEditorialHero,
  MedicalFigureCaption,
  MedicalImageBlock,
  ProtocolUpdateCard,
  QuickSummaryStrip,
  ReferenceBlock,
  StaziaMedicalTable,
  StickyNoteCard,
} from "../admin/contentEngine/editorial/EditorialComponents";

interface StudentPublishedTopicRendererProps {
  header: PublishedTopicHeader;
  version: PublishedTopicContentVersion;
  onBack: () => void;
  onOpenQuestions?: (topicName: string) => void;
}

export const StudentPublishedTopicRenderer: React.FC<StudentPublishedTopicRendererProps> = ({
  header,
  version,
  onBack,
  onOpenQuestions,
}) => {
  const areaLabel =
    header.area && (CANONICAL_AREA_LABELS as any)[header.area]
      ? (CANONICAL_AREA_LABELS as any)[header.area]
      : header.area || "Área Médica";

  const formattedUpdateDate = React.useMemo(() => {
    try {
      const date = new Date(header.updatedAt || version.publishedAt);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }, [header.updatedAt, version.publishedAt]);

  const renderPublishedBlock = (block: PublishedEditorialBlock) => {
    switch (block.type) {
      case "MedicalEditorialHero":
        return (
          <MedicalEditorialHero
            area={header.area}
            specialty={header.specialty}
            topic={header.topic}
            subtopics={header.subtopics}
          />
        );
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-20 font-sans animate-in fade-in duration-200">
      {/* 1. Navigation & Metadata Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Grandes Temas</span>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
          <span className="flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200/60 px-2.5 py-1 rounded-lg font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Conteúdo Oficial StaziaMed</span>
          </span>

          <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>~{version.estimatedReadMinutes || header.estimatedReadMinutes || 10} min de leitura</span>
          </span>

          {formattedUpdateDate && (
            <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Atualizado em {formattedUpdateDate}</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Main Medical Editorial Content Paper (Responsive Continuous Flow) */}
      <article className="w-full bg-[#FFFFFF] rounded-3xl border border-slate-200/90 shadow-lg shadow-slate-200/40 p-6 sm:p-10 lg:p-12 text-[#0F172A] leading-relaxed">
        {/* Editorial Hero Header */}
        <div className="mb-8 pb-6 border-b-2 border-slate-200">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-[#0A192F] text-white">
              {areaLabel}
            </span>
            {header.specialty && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30">
                {header.specialty}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#0A192F] tracking-tight leading-tight">
            {header.topic}
          </h1>

          {header.subtopics && header.subtopics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Seções do Tema:
              </span>
              {header.subtopics.map((sub, i) => (
                <span
                  key={i}
                  className="text-xs font-medium px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {sub}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Linear Block Render Flow */}
        <div className="space-y-4">
          {version.blocks.map((block) => (
            <div key={block.id} id={block.id} className="block-container">
              {renderPublishedBlock(block)}
            </div>
          ))}
        </div>

        {/* Clean Student-Safe Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-mono">
          <span>StaziaMed Revalida • Conteúdo Editorial Canônico</span>
          <span>Versão {version.contentVersion}</span>
        </div>
      </article>

      {/* 3. Bottom Practice Trigger Bar */}
      {onOpenQuestions && (
        <div className="p-6 rounded-2xl bg-[#0B192C] text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-bold text-base text-white">
              Fixe o conhecimento em questões reais do INEP
            </h3>
            <p className="text-xs text-slate-300">
              Pratique agora questões comentadas relacionadas a {header.topic}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenQuestions(header.topic)}
            className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition-all cursor-pointer shrink-0"
          >
            Treinar Questões deste Tema
          </button>
        </div>
      )}
    </div>
  );
};
