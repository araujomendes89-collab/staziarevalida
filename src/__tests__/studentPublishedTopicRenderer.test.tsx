import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StudentPublishedTopicRenderer } from "../components/grandesTemas/StudentPublishedTopicRenderer";
import { PublishedTopicHeader, PublishedTopicContentVersion } from "../types/publishedContent";

const MOCK_HEADER: PublishedTopicHeader = {
  canonicalTopicId: "top_has",
  currentVersionId: "pub_top_has_v1",
  currentContentVersion: 1,
  publicationStatus: "PUBLISHED",
  area: "CLINICA_MEDICA",
  specialty: "Cardiologia",
  topic: "Hipertensão Arterial Sistêmica",
  subtopics: ["Definição", "Classificação", "Tratamento"],
  publishedAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:00:00.000Z",
  totalVersions: 1,
  estimatedReadMinutes: 12,
};

const MOCK_VERSION: PublishedTopicContentVersion = {
  id: "pub_top_has_v1",
  canonicalTopicId: "top_has",
  contentVersion: 1,
  sourceEditorialDocumentId: "draft_has_001",
  sourceEditorialVersion: "2026.1.0",
  styleProfile: "MEDICAL_EDITORIAL_V1",
  styleProfileVersion: "2026.1.0",
  pages: [],
  rightsSnapshot: {
    rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
    sourceDocumentTitle: "PCDT HAS 2024",
    verifiedAt: "2026-09-04T12:00:00.000Z",
  },
  fingerprint: "fp_123",
  publishedAt: "2026-09-04T12:00:00.000Z",
  publishedBy: "ADMIN",
  totalBlocks: 8,
  estimatedReadMinutes: 12,
  blocks: [
    {
      id: "b1",
      type: "BrushSectionHeader",
      semanticRole: "SECTION_HEADER",
      content: "1. Diagnóstico e Metas Pressóricas",
      order: 1,
    },
    {
      id: "b2",
      type: "EditorialParagraph",
      semanticRole: "BODY",
      content: "A hipertensão arterial sistêmica deve ser diagnosticada após medições repetidas.",
      order: 2,
    },
    {
      id: "b3",
      type: "StickyNoteCard",
      semanticRole: "NOTE",
      content: "Atenção: O manguito deve ser adequado à circunferência do braço do paciente.",
      order: 3,
    },
    {
      id: "b4",
      type: "StaziaMedicalTable",
      semanticRole: "TABLE",
      content: "Classificação Pressórica no Adulto",
      tableData: {
        id: "tbl_1",
        pageIndex: 1,
        title: "Tabela 1",
        cells: [
          ["Classificação", "PAS (mmHg)", "PAD (mmHg)"],
          ["Ótima", "< 120", "< 80"],
          ["HAS Estágio 1", "140 - 159", "90 - 99"],
          ["HAS Estágio 2", "160 - 179", "100 - 109"],
        ],
        confidence: 0.99,
        structureReliability: "HIGH",
      },
      order: 4,
    },
    {
      id: "b5",
      type: "ClinicalWarningCard",
      semanticRole: "WARNING",
      content: "Em emergência hipertensiva com dissecção de aorta, a meta é PAS < 120 em 20 min.",
      warningSeverity: "EMERGENCY",
      order: 5,
    },
    {
      id: "b6",
      type: "ClinicalAlgorithmSteps",
      semanticRole: "ALGORITHM",
      content: "1. Confirmar diagnóstico com MAPA/MRPA\n2. Avaliar lesão de órgão-alvo\n3. Iniciar monoterapia ou combinação dupla",
      order: 6,
    },
    {
      id: "b7",
      type: "QuickSummaryStrip",
      semanticRole: "SOURCE_SUMMARY",
      content: "Síntese: IECA ou BRA + BCC ou Diurético Tiazídico são as drogas de primeira linha.",
      order: 7,
    },
    {
      id: "b8",
      type: "ReferenceBlock",
      semanticRole: "REFERENCE",
      content: "Diretrizes Brasileiras de Hipertensão Arterial — SBC 2024 / PCDT MS.",
      order: 8,
    },
  ],
};

describe("Etapa 1.28F — StudentPublishedTopicRenderer", () => {
  it("should render full continuous native layout with header, metadata, and all blocks", () => {
    const handleBack = vi.fn();
    const handleOpenQuestions = vi.fn();

    render(
      <StudentPublishedTopicRenderer
        header={MOCK_HEADER}
        version={MOCK_VERSION}
        onBack={handleBack}
        onOpenQuestions={handleOpenQuestions}
      />
    );

    // Header & Meta
    expect(screen.getByText("Hipertensão Arterial Sistêmica")).toBeDefined();
    expect(screen.getByText("Clínica Médica")).toBeDefined();
    expect(screen.getByText("Cardiologia")).toBeDefined();
    expect(screen.getByText(/~12 min de leitura/)).toBeDefined();

    // Blocks
    expect(screen.getByText("1. Diagnóstico e Metas Pressóricas")).toBeDefined();
    expect(screen.getByText(/A hipertensão arterial sistêmica deve ser diagnosticada/)).toBeDefined();
    expect(screen.getByText(/O manguito deve ser adequado à circunferência/)).toBeDefined();
    expect(screen.getByText("HAS Estágio 1")).toBeDefined();
    expect(screen.getByText(/Em emergência hipertensiva com dissecção de aorta/)).toBeDefined();
    expect(screen.getByText(/Confirmar diagnóstico com MAPA\/MRPA/)).toBeDefined();
    expect(screen.getByText(/IECA ou BRA \+ BCC ou Diurético Tiazídico/)).toBeDefined();
    expect(screen.getByText(/Diretrizes Brasileiras de Hipertensão Arterial/)).toBeDefined();

    // Zero iframe check
    const iframes = document.querySelectorAll("iframe");
    expect(iframes.length).toBe(0);

    // Callbacks
    const backBtn = screen.getByText("Voltar para Grandes Temas");
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);

    const questionsBtn = screen.getByText("Treinar Questões deste Tema");
    fireEvent.click(questionsBtn);
    expect(handleOpenQuestions).toHaveBeenCalledWith("Hipertensão Arterial Sistêmica");
  });
});
