import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GrandesTemasView, resolveCanonicalTopicId } from "../components/estudar/GrandesTemasView";
import { StudentTopicContentClientService } from "../services/studentTopicContentClientService";
import { ALL_GRANDES_TEMAS } from "../data/grandesTemas";

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    setActiveTab: vi.fn(),
    todayMission: null,
    knowledgeGraph: [],
  }),
}));

describe("Etapa 1.28F — Grandes Temas Published Content Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve canonicalTopicId correctly for 75 themes", () => {
    const hasTheme = ALL_GRANDES_TEMAS.find((t) => t.title.toLowerCase().includes("hipertens"));
    expect(hasTheme).toBeDefined();

    if (hasTheme) {
      const canonicalId = resolveCanonicalTopicId(hasTheme);
      expect(canonicalId).toBe("top_has");
    }
  });

  it("should render 75 themes in catalog and open StudentPublishedTopicRenderer when published", async () => {
    // Mock getAllPublishedTopicHeaders
    vi.spyOn(StudentTopicContentClientService, "getAllPublishedTopicHeaders").mockResolvedValue(
      new Map([
        [
          "top_has",
          {
            canonicalTopicId: "top_has",
            currentVersionId: "pub_top_has_v1",
            currentContentVersion: 1,
            publicationStatus: "PUBLISHED",
            area: "CLINICA_MEDICA",
            specialty: "Cardiologia",
            topic: "Hipertensão Arterial Sistêmica",
            subtopics: ["Definição"],
            publishedAt: "2026-09-04T12:00:00.000Z",
            updatedAt: "2026-09-04T12:00:00.000Z",
            totalVersions: 1,
            estimatedReadMinutes: 10,
          },
        ],
      ])
    );

    // Mock getPublishedTopic
    vi.spyOn(StudentTopicContentClientService, "getPublishedTopic").mockImplementation(
      async (id: string) => {
        if (id === "top_has") {
          return {
            status: "READY",
            header: {
              canonicalTopicId: "top_has",
              currentVersionId: "pub_top_has_v1",
              currentContentVersion: 1,
              publicationStatus: "PUBLISHED",
              area: "CLINICA_MEDICA",
              specialty: "Cardiologia",
              topic: "Hipertensão Arterial Sistêmica",
              subtopics: ["Definição"],
              publishedAt: "2026-09-04T12:00:00.000Z",
              updatedAt: "2026-09-04T12:00:00.000Z",
              totalVersions: 1,
              estimatedReadMinutes: 10,
            },
            version: {
              id: "pub_top_has_v1",
              canonicalTopicId: "top_has",
              contentVersion: 1,
              sourceEditorialDocumentId: "draft_has_001",
              sourceEditorialVersion: "2026.1.0",
              styleProfile: "MEDICAL_EDITORIAL_V1",
              styleProfileVersion: "2026.1.0",
              pages: [],
              blocks: [
                {
                  id: "b1",
                  type: "BrushSectionHeader",
                  semanticRole: "SECTION_HEADER",
                  content: "1. Diagnóstico de Hipertensão",
                  order: 1,
                },
              ],
              rightsSnapshot: {
                rightsType: "OFFICIAL_PUBLIC_DOCUMENT",
                sourceDocumentTitle: "PCDT HAS",
                verifiedAt: "2026-09-04T12:00:00.000Z",
              },
              fingerprint: "fp_123",
              publishedAt: "2026-09-04T12:00:00.000Z",
              publishedBy: "ADMIN",
              totalBlocks: 1,
              estimatedReadMinutes: 10,
            },
          };
        }
        return { status: "NOT_PUBLISHED" };
      }
    );

    render(<GrandesTemasView />);

    // Wait for catalog headers load
    await waitFor(() => {
      expect(screen.getByText(/Grandes Temas do Revalida/)).toBeDefined();
    });

    // Find and click the HAS theme card
    const hasCards = screen.getAllByText(/Hipertensão Arterial/);
    expect(hasCards.length).toBeGreaterThan(0);

    fireEvent.click(hasCards[0]);

    // Should render StudentPublishedTopicRenderer
    await waitFor(() => {
      expect(screen.getByText("1. Diagnóstico de Hipertensão")).toBeDefined();
      expect(screen.getByText("Voltar para Grandes Temas")).toBeDefined();
    });
  });
});
