import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AdminEditorialView } from "../components/admin/AdminEditorialView";
import { AdminContentEngineView } from "../components/admin/AdminContentEngineView";
import { AdminDesignStudioView } from "../components/admin/AdminDesignStudioView";
import { STUDENT_NAVIGATION_CONFIG } from "../config/navigation";
import {
  SourceDocument,
  StructuredSourceContent,
  GeneratedContentDraft,
  PublishedContent,
  CONTENT_BLOCK_COMPONENT_REGISTRY,
  ContentReferenceRightsType,
} from "../types/adminContentEngine";
import {
  DesignReferenceRightsType,
  DesignBlueprint,
  StaziaDesignTemplate,
  TemplateFamily,
  MEDICAL_EDITORIAL_V1,
} from "../types/adminDesignStudio";
import * as AppContextModule from "../context/AppContext";

// Mock AppContext
const mockUseApp = vi.fn();
vi.spyOn(AppContextModule, "useApp").mockImplementation(() => mockUseApp());

describe("Admin Content Engine & Design Studio Foundation (Etapa 1.27B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Domain Contracts & Types Validation", () => {
    it("should strictly enforce DesignReferenceRightsType to the 4 valid rights values", () => {
      const rights: DesignReferenceRightsType[] = [
        "OWNED",
        "LICENSED",
        "AUTHORIZED",
        "PUBLIC_REFERENCE_ONLY",
      ];
      expect(rights).toHaveLength(4);
      expect(rights).toContain("OWNED");
      expect(rights).toContain("LICENSED");
      expect(rights).toContain("AUTHORIZED");
      expect(rights).toContain("PUBLIC_REFERENCE_ONLY");
    });

    it("should register MEDICAL_EDITORIAL_V1 canonical template metadata", () => {
      expect(MEDICAL_EDITORIAL_V1.id).toBe("template_medical_editorial_v1");
      expect(MEDICAL_EDITORIAL_V1.templateFamily).toBe("MEDICAL_EDITORIAL");
      expect(MEDICAL_EDITORIAL_V1.version).toBe(1);
      expect(MEDICAL_EDITORIAL_V1.status).toBe("DRAFT");
      expect(MEDICAL_EDITORIAL_V1.sourceBlueprintId).toBe("blueprint_staziamed_canonical_hipertensao");
      expect(MEDICAL_EDITORIAL_V1.staziaTokens.primary).toBe("#0D9488");
    });

    it("should define CONTENT_BLOCK_COMPONENT_REGISTRY mapping semantic blocks to Stazia components", () => {
      expect(CONTENT_BLOCK_COMPONENT_REGISTRY.heading).toBe("HeadingBlock");
      expect(CONTENT_BLOCK_COMPONENT_REGISTRY.clinicalAlert).toBe("ClinicalWarningCard");
      expect(CONTENT_BLOCK_COMPONENT_REGISTRY.examTip).toBe("ExamTipCard");
      expect(CONTENT_BLOCK_COMPONENT_REGISTRY.table).toBe("StaziaMedicalTable");
      expect(CONTENT_BLOCK_COMPONENT_REGISTRY.algorithm).toBe("ClinicalAlgorithmSteps");
      expect(CONTENT_BLOCK_COMPONENT_REGISTRY.protocolUpdate).toBe("ProtocolUpdateCard");
    });

    it("should allow canonicalTopicId to be optional in StructuredSourceContent", () => {
      const structuredContentWithoutCanonical: StructuredSourceContent = {
        id: "struct-1",
        sourceDocumentId: "doc-1",
        area: "CLINICA_MEDICA",
        specialty: "CARDIOLOGIA",
        topic: "Hipertensão Arterial",
        sourcePages: [1, 2, 3],
        blocks: [],
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(structuredContentWithoutCanonical.canonicalTopicId).toBeUndefined();

      const structuredContentWithCanonical: StructuredSourceContent = {
        ...structuredContentWithoutCanonical,
        canonicalTopicId: "canonical_topic_has_2026",
      };
      expect(structuredContentWithCanonical.canonicalTopicId).toBe("canonical_topic_has_2026");
    });

    it("should separate SourceDocument and GeneratedContentDraft types cleanly", () => {
      const sourceDoc: SourceDocument = {
        id: "src-1",
        title: "PCDT Hipertensão",
        fileName: "pcdt_has.pdf",
        mimeType: "application/pdf",
        sourceType: "PCDT",
        rightsType: "PUBLIC_REFERENCE_ONLY",
        status: "PENDING",
        createdBy: "admin-1",
        createdAt: new Date().toISOString(),
      };

      const generatedDraft: GeneratedContentDraft = {
        id: "draft-1",
        sourceContentId: "src-1",
        transformationType: "FLASHCARDS",
        content: { totalCards: 10 },
        model: "gemini-2.5-flash",
        createdAt: new Date().toISOString(),
        createdBy: "admin-1",
      };

      expect(sourceDoc.id).not.toBe(generatedDraft.id);
      expect(sourceDoc.sourceType).toBe("PCDT");
      expect(generatedDraft.transformationType).toBe("FLASHCARDS");
    });
  });

  describe("2. Admin UI & Views Integration", () => {
    beforeEach(() => {
      mockUseApp.mockReturnValue({
        user: { id: "admin-1", role: "ADMIN", tier: "PRO_PLUS", name: "Admin Test" },
        firebaseUser: { uid: "admin-1", email: "araujomendes@staziamed.com.br", emailVerified: true },
        isDeveloperAdmin: true,
        questions: [],
        guidelines: [],
        editionsInventory: [],
        knowledgeGraph: [],
        resetUserData: vi.fn(),
        resetAllData: vi.fn(),
        setActiveTab: vi.fn(),
      });
    });

    it("should render Content Engine and Design Studio tabs in AdminEditorialView for ADMIN", () => {
      render(<AdminEditorialView />);

      expect(screen.getByRole("button", { name: /content engine/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /design studio/i })).toBeInTheDocument();
    });

    it("should render AdminContentEngineView and navigate sub-tabs correctly", () => {
      render(<AdminContentEngineView />);

      expect(screen.getByText("StaziaMed Content Engine")).toBeInTheDocument();
      expect(screen.getByText("Motor de Ingestão & Curadoria Médica Estruturada")).toBeInTheDocument();

      // Switch to Import sub-tab
      const importTab = screen.getByRole("button", { name: /importar pdf/i });
      fireEvent.click(importTab);
      expect(screen.getByText("Importar Documento Médico Fonte")).toBeInTheDocument();

      // Click Iniciar Importação and verify foundation notice
      const importBtn = screen.getByRole("button", { name: /iniciar importação & análise/i });
      fireEvent.click(importBtn);
      expect(screen.getByText(/motor de ingestão em preparação/i)).toBeInTheDocument();
    });

    it("should render AdminDesignStudioView and handle clone reference sub-tab correctly", async () => {
      render(<AdminDesignStudioView />);

      expect(screen.getByText("StaziaMed Design Studio")).toBeInTheDocument();
      expect(screen.getByText("Motor de Compreensão Visual & Engenharia de Templates")).toBeInTheDocument();

      // Fill URL input
      const urlInput = screen.getByPlaceholderText(/https:\/\/exemplo.com.br/i);
      expect(urlInput).toBeInTheDocument();
      fireEvent.change(urlInput, { target: { value: "https://diretrizes.cardiol.br/has" } });

      // Click Analisar Referência and verify message from adapter
      const analyzeBtn = screen.getByRole("button", { name: /analisar referência/i });
      await act(async () => {
        fireEvent.click(analyzeBtn);
      });
      expect(screen.getByText(/desconectado|falha|indisponível/i)).toBeInTheDocument();

      // Switch to Templates sub-tab
      const templatesTab = screen.getByRole("button", { name: /templates staziamed/i });
      fireEvent.click(templatesTab);
      expect(screen.getByText(MEDICAL_EDITORIAL_V1.name)).toBeInTheDocument();
      expect(screen.getByText(/DRAFT \/ FOUNDATION/i)).toBeInTheDocument();
    });
  });

  describe("3. Security & Access Control Barriers", () => {
    it("should deny access to AdminEditorialView for STUDENT role", () => {
      mockUseApp.mockReturnValue({
        user: { id: "student-1", role: "STUDENT", tier: "PRO", name: "Student Test" },
        firebaseUser: { uid: "student-1", email: "student@test.com", emailVerified: true },
        questions: [],
        guidelines: [],
        editionsInventory: [],
        knowledgeGraph: [],
        resetUserData: vi.fn(),
        resetAllData: vi.fn(),
        setActiveTab: vi.fn(),
      });

      render(<AdminEditorialView />);

      expect(screen.getByText("Acesso Restrito à Administração")).toBeInTheDocument();
      expect(screen.queryByText("StaziaMed Content Engine")).not.toBeInTheDocument();
      expect(screen.queryByText("StaziaMed Design Studio")).not.toBeInTheDocument();
    });

    it("should ensure student navigation config does NOT contain admin modules", () => {
      const studentNavIds = STUDENT_NAVIGATION_CONFIG.map((s) => s.id);
      expect(studentNavIds).not.toContain("admin");
      expect(studentNavIds).not.toContain("content-engine");
      expect(studentNavIds).not.toContain("design-studio");
    });
  });
});
