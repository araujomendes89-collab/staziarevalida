import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "../components/layout/Sidebar";
import { AdminEditorialView } from "../components/admin/AdminEditorialView";
import * as AppContextModule from "../context/AppContext";

// Mock AppContext
const mockUseApp = vi.fn();
vi.spyOn(AppContextModule, "useApp").mockImplementation(() => mockUseApp());

describe("Admin Menu Runtime Visibility Fix (Etapa 1.27B.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseAdminState = {
    user: {
      id: "usr-admin-master",
      name: "Administrador Chefe",
      email: "araujomendes@staziamed.com.br",
      role: "ADMIN" as const,
      tier: "PRO_PLUS" as const,
      plan: "pro_plus",
    },
    firebaseUser: {
      uid: "usr-admin-master",
      email: "araujomendes@staziamed.com.br",
      emailVerified: true,
    },
    isDeveloperAdmin: true,
    isGuestMode: false,
    profileResolutionStatus: "READY" as const,
    activeTab: "home" as const,
    setActiveTab: vi.fn(),
    flashcards: [],
    setIsSubscriptionModalOpen: vi.fn(),
    setQuestionMode: vi.fn(),
    logout: vi.fn(),
    questions: [],
    guidelines: [],
    editionsInventory: [],
    knowledgeGraph: [],
    resetUserData: vi.fn(),
    resetAllData: vi.fn(),
  };

  describe("1. Visibility in Sidebar based on isDeveloperAdmin", () => {
    it("should render ADMIN menu in Sidebar when role is ADMIN and profile is READY", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        isDeveloperAdmin: true,
      });

      render(<Sidebar />);

      const adminSection = screen.getByTestId("admin-sidebar-section");
      expect(adminSection).toBeInTheDocument();

      const adminButton = screen.getByTestId("nav-admin-panel");
      expect(adminButton).toBeInTheDocument();
      expect(adminButton).toHaveTextContent(/painel de administração/i);

      const exportButton = screen.getByTestId("nav-export-panel");
      expect(exportButton).toBeInTheDocument();
      expect(exportButton).toHaveTextContent(/inventário de provas/i);
    });

    it("should NOT render ADMIN menu in Sidebar for STUDENT role", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: {
          ...baseAdminState.user,
          role: "STUDENT",
        },
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);

      expect(screen.queryByTestId("admin-sidebar-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-export-panel")).not.toBeInTheDocument();
    });

    it("should NOT render ADMIN menu in Sidebar for Guest users", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        isGuestMode: true,
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);

      expect(screen.queryByTestId("admin-sidebar-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should NOT render ADMIN menu when profileResolutionStatus is LOADING", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        profileResolutionStatus: "LOADING",
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);

      expect(screen.queryByTestId("admin-sidebar-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should NOT render ADMIN menu when profileResolutionStatus is ERROR", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        profileResolutionStatus: "ERROR",
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);

      expect(screen.queryByTestId("admin-sidebar-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should NOT render ADMIN menu when profileResolutionStatus is IDLE", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        profileResolutionStatus: "IDLE",
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);

      expect(screen.queryByTestId("admin-sidebar-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });
  });

  describe("2. Navigation Interaction & Mobile Drawer Support", () => {
    it("should trigger setActiveTab('admin') when clicking nav-admin-panel", () => {
      const setActiveTab = vi.fn();
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        setActiveTab,
        isDeveloperAdmin: true,
      });

      render(<Sidebar />);

      const adminButton = screen.getByTestId("nav-admin-panel");
      fireEvent.click(adminButton);

      expect(setActiveTab).toHaveBeenCalledWith("admin");
    });

    it("should call onCloseMobile when rendered inside mobile drawer", () => {
      const onCloseMobile = vi.fn();
      const setActiveTab = vi.fn();
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        setActiveTab,
        isDeveloperAdmin: true,
      });

      render(<Sidebar onCloseMobile={onCloseMobile} />);

      const adminButton = screen.getByTestId("nav-admin-panel");
      fireEvent.click(adminButton);

      expect(setActiveTab).toHaveBeenCalledWith("admin");
      expect(onCloseMobile).toHaveBeenCalledTimes(1);
    });

    it("should display active styling when activeTab === 'admin'", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        activeTab: "admin",
        isDeveloperAdmin: true,
      });

      render(<Sidebar />);

      const adminButton = screen.getByTestId("nav-admin-panel");
      expect(adminButton.className).toContain("bg-teal-600");
    });
  });

  describe("3. AdminEditorialView Authorization Barrier", () => {
    it("should render full AdminEditorialView and admin tabs when isDeveloperAdmin is true", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        isDeveloperAdmin: true,
      });

      render(<AdminEditorialView />);

      expect(screen.getByText(/painel central de administração & infraestrutura/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /content engine/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /design studio/i })).toBeInTheDocument();
      expect(screen.queryByTestId("admin-access-denied")).not.toBeInTheDocument();
    });

    it("should render Access Denied barrier when isDeveloperAdmin is false (STUDENT/GUEST)", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        isDeveloperAdmin: false,
        user: { ...baseAdminState.user, role: "STUDENT" },
      });

      render(<AdminEditorialView />);

      expect(screen.getByText("Acesso Restrito à Administração")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /content engine/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /design studio/i })).not.toBeInTheDocument();
    });
  });

  describe("4. Account Switch & Logout Protection", () => {
    it("should remove admin menu immediately after logout", () => {
      // First render as Admin
      const { rerender } = render(<Sidebar />);
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        isDeveloperAdmin: true,
      });
      rerender(<Sidebar />);
      expect(screen.getByTestId("nav-admin-panel")).toBeInTheDocument();

      // Logout occurs -> state resets to default guest/student
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: {
          id: "usr-default",
          role: "STUDENT",
          tier: "FREE",
          name: "Dr(a). Candidato(a)",
        },
        firebaseUser: null,
        isDeveloperAdmin: false,
        profileResolutionStatus: "IDLE",
      });

      rerender(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should not persist admin menu when switching from ADMIN to STUDENT account", () => {
      const { rerender } = render(<Sidebar />);

      // 1. Logged in as Admin
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        isDeveloperAdmin: true,
      });
      rerender(<Sidebar />);
      expect(screen.getByTestId("nav-admin-panel")).toBeInTheDocument();

      // 2. New login in flight (loading barrier)
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "student-uid-99", role: "STUDENT", tier: "TRIAL", name: "Dra. Aluna" },
        firebaseUser: { uid: "student-uid-99", email: "aluna@med.br", emailVerified: true },
        profileResolutionStatus: "LOADING",
        isDeveloperAdmin: false,
      });
      rerender(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();

      // 3. New login profile resolved as STUDENT
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "student-uid-99", role: "STUDENT", tier: "PRO", name: "Dra. Aluna" },
        firebaseUser: { uid: "student-uid-99", email: "aluna@med.br", emailVerified: true },
        profileResolutionStatus: "READY",
        isDeveloperAdmin: false,
      });
      rerender(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });
  });

  describe("5. Strict Firebase Hardening Guarantees (Etapa 1.27B.1.1)", () => {
    it("should DENY admin access when local cached user has role ADMIN but firebaseUser is null", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "usr-cached-admin", role: "ADMIN", tier: "PRO_PLUS", name: "Cached Admin" },
        firebaseUser: null,
        profileResolutionStatus: "IDLE",
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should DENY admin access when firebaseUser is present but profileResolutionStatus is LOADING", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "usr-admin-master", role: "ADMIN", tier: "PRO_PLUS", name: "Master" },
        firebaseUser: { uid: "usr-admin-master", email: "admin@staziamed.com.br" },
        profileResolutionStatus: "LOADING",
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should DENY admin access when firebaseUser is present but profileResolutionStatus is ERROR", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "usr-admin-master", role: "ADMIN", tier: "PRO_PLUS", name: "Master" },
        firebaseUser: { uid: "usr-admin-master", email: "admin@staziamed.com.br" },
        profileResolutionStatus: "ERROR",
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should ALLOW admin access ONLY when firebaseUser is present, profile is READY, and role is ADMIN", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "usr-admin-master", role: "ADMIN", tier: "PRO_PLUS", name: "Master" },
        firebaseUser: { uid: "usr-admin-master", email: "admin@staziamed.com.br" },
        profileResolutionStatus: "READY",
        isGuestMode: false,
        isDeveloperAdmin: true,
      });

      render(<Sidebar />);
      expect(screen.getByTestId("nav-admin-panel")).toBeInTheDocument();
    });

    it("should DENY admin access when firebaseUser is present, profile is READY, but role is STUDENT", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "usr-student", role: "STUDENT", tier: "PRO_PLUS", name: "Student" },
        firebaseUser: { uid: "usr-student", email: "student@staziamed.com.br" },
        profileResolutionStatus: "READY",
        isGuestMode: false,
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });

    it("should DENY admin access in GUEST mode even if role is ADMIN", () => {
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        user: { id: "usr-guest", role: "ADMIN", tier: "PRO_PLUS", name: "Guest Admin" },
        firebaseUser: null,
        profileResolutionStatus: "IDLE",
        isGuestMode: true,
        isDeveloperAdmin: false,
      });

      render(<Sidebar />);
      expect(screen.queryByTestId("nav-admin-panel")).not.toBeInTheDocument();
    });
  });

  describe("4. Header Master Admin Controls and Badges", () => {
    it("should render Master Admin header with toggle and MASTER badge when isDeveloperAdmin is true", async () => {
      const { Header } = await import("../components/layout/Header");
      const setActiveTab = vi.fn();
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        activeTab: "admin",
        setActiveTab,
        isDeveloperAdmin: true,
      });

      render(<Header onToggleMobileMenu={vi.fn()} isMobileMenuOpen={false} />);

      expect(screen.getByText(/painel de gestão master/i)).toBeInTheDocument();
      expect(screen.getByText("MASTER")).toBeInTheDocument();
      expect(screen.getByText("Visão do Aluno")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Visão do Aluno"));
      expect(setActiveTab).toHaveBeenCalledWith("home");
    });

    it("should render normal student header and study streak when isDeveloperAdmin is false", async () => {
      const { Header } = await import("../components/layout/Header");
      mockUseApp.mockReturnValue({
        ...baseAdminState,
        activeTab: "home",
        isDeveloperAdmin: false,
        user: { ...baseAdminState.user, role: "STUDENT", studyStreakDays: 5 },
      });

      render(<Header onToggleMobileMenu={vi.fn()} isMobileMenuOpen={false} />);

      expect(screen.queryByText(/painel de gestão master/i)).not.toBeInTheDocument();
      expect(screen.queryByText("MASTER")).not.toBeInTheDocument();
      expect(screen.getByText("5 dias")).toBeInTheDocument();
    });
  });
});
