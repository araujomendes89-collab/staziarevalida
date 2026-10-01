import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminEditorialView } from "../components/admin/AdminEditorialView";
import { GuidelineWatchView } from "../components/guidelines/GuidelineWatchView";
import * as AppContextModule from "../context/AppContext";

// Mock AppContext
const mockUseApp = vi.fn();
vi.spyOn(AppContextModule, "useApp").mockImplementation(() => mockUseApp());

describe("Admin Access Barrier State Machine Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseContext = {
    questions: [],
    guidelines: [],
    guidelineAlerts: [],
    guidelineAuditLogs: [],
    editionsInventory: [],
    knowledgeGraph: [],
    attempts: [],
    flashcards: [],
    hasLegacyFlashcards: false,
    importLegacyFlashcards: vi.fn(),
    dismissLegacyFlashcards: vi.fn(),
    todayMission: null,
    radarUpdates: [],
    activeQuestionIndex: 0,
    setActiveQuestionIndex: vi.fn(),
    questionFilterArea: "ALL",
    setQuestionFilterArea: vi.fn(),
    questionFilterYear: "ALL",
    setQuestionFilterYear: vi.fn(),
    questionFilterStatus: "ALL",
    setQuestionFilterStatus: vi.fn(),
    questionFilterOrigin: "ALL",
    setQuestionFilterOrigin: vi.fn(),
    questionMode: "STUDY",
    setQuestionMode: vi.fn(),
    isStudyForMeOpen: false,
    setIsStudyForMeOpen: vi.fn(),
    isExamConfigOpen: false,
    setIsExamConfigOpen: vi.fn(),
    isOnboardingOpen: false,
    setIsOnboardingOpen: vi.fn(),
    isWhatIfOpen: false,
    setIsWhatIfOpen: vi.fn(),
    isSubscriptionModalOpen: false,
    setIsSubscriptionModalOpen: vi.fn(),
    isOfficialSearchOpen: false,
    setIsOfficialSearchOpen: vi.fn(),
    officialSearchQuery: "",
    openOfficialSearch: vi.fn(),
    selectedOSCEId: null,
    setSelectedOSCEId: vi.fn(),
    isDarkMode: true,
    setIsDarkMode: vi.fn(),
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
    activeTab: "admin",
    setActiveTab: vi.fn(),
    prefilledGenerationParams: null,
    setPrefilledGenerationParams: vi.fn(),
    navigateToAiQuestionGenerator: vi.fn(),
    resetUserData: vi.fn(),
    resetAllData: vi.fn(),
    setUser: vi.fn(),
    exitGuestMode: vi.fn(),
    retryProfileResolution: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInAnonymously: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    sendPasswordReset: vi.fn(),
    logout: vi.fn(),
    addGuidelineAuditLog: vi.fn(),
    approveGuidelineAlert: vi.fn(),
  };

  describe("1. AdminEditorialView State Machine", () => {
    it("1.1. Should render loading boundary when state is IDLE during initial boot (DO NOT DENY)", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_admin_123", email: "admin@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "IDLE",
        isDeveloperAdmin: false,
        user: { id: "usr_default", role: "STUDENT" },
      });

      render(<AdminEditorialView />);

      expect(screen.getByTestId("admin-loading-boundary")).toBeInTheDocument();
      expect(screen.getByText(/Validando credenciais administrativas/i)).toBeInTheDocument();
      expect(screen.queryByTestId("admin-access-denied")).toBeNull();
      expect(screen.queryByText(/Acesso Restrito à Administração/i)).toBeNull();
    });

    it("1.2. Should render loading boundary when state is LOADING during profile resolution (DO NOT DENY)", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_admin_123", email: "admin@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "LOADING",
        isDeveloperAdmin: false,
        user: { id: "usr_default", role: "STUDENT" },
      });

      render(<AdminEditorialView />);

      expect(screen.getByTestId("admin-loading-boundary")).toBeInTheDocument();
      expect(screen.queryByTestId("admin-access-denied")).toBeNull();
      expect(screen.queryByText(/Acesso Restrito à Administração/i)).toBeNull();
    });

    it("1.3. Should render distinct Profile Error boundary when resolution status is ERROR (DO NOT DENY)", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_admin_123", email: "admin@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "ERROR",
        profileError: "Instabilidade de conexão ao carregar permissões.",
        isDeveloperAdmin: false,
        user: { id: "usr_default", role: "STUDENT" },
      });

      render(<AdminEditorialView />);

      expect(screen.getByTestId("admin-profile-error-boundary")).toBeInTheDocument();
      expect(screen.getByText(/Não foi possível confirmar suas permissões/i)).toBeInTheDocument();
      expect(screen.getByText(/Instabilidade de conexão ao carregar permissões/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tentar Novamente/i })).toBeInTheDocument();
      expect(screen.queryByTestId("admin-access-denied")).toBeNull();
      expect(screen.queryByText(/Acesso Restrito à Administração/i)).toBeNull();
    });

    it("1.4. Should render full Admin UI when READY and isDeveloperAdmin is true", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_admin_123", email: "admin@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "READY",
        isDeveloperAdmin: true,
        user: { id: "uid_admin_123", role: "ADMIN", name: "Dr. Admin" },
      });

      render(<AdminEditorialView />);

      expect(screen.queryByTestId("admin-loading-boundary")).toBeNull();
      expect(screen.queryByTestId("admin-profile-error-boundary")).toBeNull();
      expect(screen.queryByTestId("admin-access-denied")).toBeNull();
      expect(screen.getByText(/Painel Central de Administração/i)).toBeInTheDocument();
    });

    it("1.5. Should render Access Denied ONLY when READY and isDeveloperAdmin is false (STUDENT)", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_student_123", email: "student@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "READY",
        isDeveloperAdmin: false,
        user: { id: "uid_student_123", role: "STUDENT", name: "Estudante Revalida" },
      });

      render(<AdminEditorialView />);

      expect(screen.getByTestId("admin-access-denied")).toBeInTheDocument();
      expect(screen.getByText(/Acesso Restrito à Administração/i)).toBeInTheDocument();
      expect(screen.queryByTestId("admin-loading-boundary")).toBeNull();
      expect(screen.queryByTestId("admin-profile-error-boundary")).toBeNull();
    });
  });

  describe("2. GuidelineWatchView State Machine", () => {
    it("2.1. Should render loading boundary when state is IDLE or LOADING (DO NOT DENY)", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_admin_123", email: "admin@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "IDLE",
        isDeveloperAdmin: false,
        user: { id: "usr_default", role: "STUDENT" },
      });

      render(<GuidelineWatchView />);

      expect(screen.getByTestId("guideline-loading-boundary")).toBeInTheDocument();
      expect(screen.queryByTestId("admin-access-denied")).toBeNull();
    });

    it("2.2. Should render profile error boundary when status is ERROR (DO NOT DENY)", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_admin_123", email: "admin@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "ERROR",
        profileError: "Erro de rede.",
        isDeveloperAdmin: false,
        user: { id: "usr_default", role: "STUDENT" },
      });

      render(<GuidelineWatchView />);

      expect(screen.getByTestId("guideline-profile-error-boundary")).toBeInTheDocument();
      expect(screen.getByText(/Não foi possível confirmar suas permissões/i)).toBeInTheDocument();
      expect(screen.queryByTestId("admin-access-denied")).toBeNull();
    });

    it("2.3. Should render Access Denied ONLY when READY and isDeveloperAdmin is false", () => {
      mockUseApp.mockReturnValue({
        ...baseContext,
        firebaseUser: { uid: "uid_student_123", email: "student@staziamed.com.br" },
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "READY",
        isDeveloperAdmin: false,
        user: { id: "uid_student_123", role: "STUDENT" },
      });

      render(<GuidelineWatchView />);

      expect(screen.getByTestId("admin-access-denied")).toBeInTheDocument();
      expect(screen.getByText(/Acesso Restrito à Administração/i)).toBeInTheDocument();
    });
  });
});
