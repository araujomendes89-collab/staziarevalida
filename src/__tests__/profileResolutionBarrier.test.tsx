import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoot } from "../App";
import * as AppContextModule from "../context/AppContext";

// Mock sub-views and heavy components to keep barrier test focused and lightweight
vi.mock("../components/layout/Header", () => ({
  Header: () => <header data-testid="app-header">Header</header>,
}));
vi.mock("../components/layout/Sidebar", () => ({
  Sidebar: () => <nav data-testid="app-sidebar">Sidebar</nav>,
}));
vi.mock("../components/layout/BottomNav", () => ({
  BottomNav: () => <nav data-testid="app-bottom-nav">BottomNav</nav>,
}));
vi.mock("../components/dashboard/DashboardView", () => ({
  DashboardView: () => <div data-testid="main-content-stage">DashboardView</div>,
}));
vi.mock("../components/auth/LoginView", () => ({
  LoginView: () => <div data-testid="login-view">LoginView</div>,
}));
vi.mock("../components/auth/EmailVerificationRequiredView", () => ({
  EmailVerificationRequiredView: () => (
    <div data-testid="email-verification-required-view">EmailVerificationRequiredView</div>
  ),
}));

describe("1.26B — Authenticated Profile Resolution Barrier", () => {
  const mockRetryProfileResolution = vi.fn();
  const mockLogout = vi.fn();

  const baseContext = {
    user: { id: "test-uid", name: "Dr. Test", email: "doc@test.com", tier: "TRIAL", plan: "trial" },
    firebaseUser: null,
    isAuthLoading: false,
    profileResolutionStatus: "IDLE" as const,
    profileError: null,
    retryProfileResolution: mockRetryProfileResolution,
    logout: mockLogout,
    isGuestMode: false,
    activeTab: "home",
    setActiveTab: vi.fn(),
    isExamConfigOpen: false,
    setIsExamConfigOpen: vi.fn(),
    isOfficialSearchOpen: false,
    setIsOfficialSearchOpen: vi.fn(),
    officialSearchQuery: "",
    setOfficialSearchQuery: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem("staziamed_splash_seen_session", "true");
  });

  it("1. AUTH LOADING: should render auth loading screen and block MainContent", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      isAuthLoading: true,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.getByText("Carregando ambiente seguro...")).toBeInTheDocument();
    expect(screen.queryByTestId("main-content-stage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-view")).not.toBeInTheDocument();
  });

  it("2. UNAUTHENTICATED NON-GUEST: should render LoginView and block MainContent", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      firebaseUser: null,
      isGuestMode: false,
      isAuthLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.getByTestId("login-view")).toBeInTheDocument();
    expect(screen.queryByTestId("main-content-stage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("profile-loading-barrier")).not.toBeInTheDocument();
  });

  it("3. AUTHENTICATED & PROFILE LOADING: should render Profile Loading Barrier and block MainContent", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      firebaseUser: { uid: "user-123", email: "user@test.com", emailVerified: true } as any,
      isGuestMode: false,
      isAuthLoading: false,
      profileResolutionStatus: "LOADING",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.getByTestId("profile-loading-barrier")).toBeInTheDocument();
    expect(screen.getByText("Preparando seu perfil médico")).toBeInTheDocument();
    expect(
      screen.getByText("Sincronizando dados acadêmicos e plano de estudos...")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("main-content-stage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-view")).not.toBeInTheDocument();
  });

  it("4. AUTHENTICATED & PROFILE ERROR: should render Profile Error Barrier with retry and logout actions", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      firebaseUser: { uid: "user-123", email: "user@test.com", emailVerified: true } as any,
      isGuestMode: false,
      isAuthLoading: false,
      profileResolutionStatus: "ERROR",
      profileError: "Erro de permissão no Firestore (permission-denied)",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.getByTestId("profile-error-barrier")).toBeInTheDocument();
    expect(screen.getByText("Não foi possível carregar seu perfil")).toBeInTheDocument();
    expect(
      screen.getByText("Erro de permissão no Firestore (permission-denied)")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("main-content-stage")).not.toBeInTheDocument();

    // Verify Retry Button
    const retryBtn = screen.getByTestId("retry-profile-button");
    fireEvent.click(retryBtn);
    expect(mockRetryProfileResolution).toHaveBeenCalledTimes(1);

    // Verify Logout Button
    const logoutBtn = screen.getByTestId("logout-profile-button");
    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("5. AUTHENTICATED & PROFILE READY: should render MainContent when email is verified", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      firebaseUser: { uid: "user-123", email: "user@test.com", emailVerified: true } as any,
      isGuestMode: false,
      isAuthLoading: false,
      profileResolutionStatus: "READY",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("profile-loading-barrier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("profile-error-barrier")).not.toBeInTheDocument();
    expect(screen.getByTestId("main-content-stage")).toBeInTheDocument();
  });

  it("6. AUTHENTICATED UNVERIFIED EMAIL: should render EmailVerificationRequiredView even when profile is READY", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      firebaseUser: {
        uid: "user-123",
        email: "unverified@test.com",
        emailVerified: false,
        providerData: [{ providerId: "password" }],
      } as any,
      isGuestMode: false,
      isAuthLoading: false,
      profileResolutionStatus: "READY",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.getByTestId("email-verification-required-view")).toBeInTheDocument();
    expect(screen.queryByTestId("main-content-stage")).not.toBeInTheDocument();
  });

  it("7. GUEST MODE: should bypass Profile Resolution Barrier and render MainContent", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...baseContext,
      firebaseUser: null,
      isGuestMode: true,
      isAuthLoading: false,
      profileResolutionStatus: "IDLE",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoot />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("profile-loading-barrier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("profile-error-barrier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("main-content-stage")).toBeInTheDocument();
  });
});
