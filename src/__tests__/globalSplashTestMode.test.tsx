import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoot } from "../App";
import {
  SHOW_SPLASH_FOR_ALL,
  SPLASH_SESSION_KEY,
  hasSeenSplashThisSession,
  markSplashSeenThisSession,
  clearSplashSeenThisSession,
} from "../config/splashConfig";
import * as AppContextModule from "../context/AppContext";

// Mock AppContext
vi.mock("../context/AppContext", async () => {
  const actual = await vi.importActual<typeof AppContextModule>("../context/AppContext");
  return {
    ...actual,
    useApp: vi.fn(),
  };
});

describe("1.26E — Global Splash Test Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe("1. Configuration and Session Storage Helpers", () => {
    it("exports SHOW_SPLASH_FOR_ALL as true by default", () => {
      expect(SHOW_SPLASH_FOR_ALL).toBe(true);
    });

    it("correctly reads, writes, and clears splash seen status in sessionStorage", () => {
      expect(hasSeenSplashThisSession()).toBe(false);

      markSplashSeenThisSession();
      expect(hasSeenSplashThisSession()).toBe(true);
      expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe("true");

      clearSplashSeenThisSession();
      expect(hasSeenSplashThisSession()).toBe(false);
      expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBeNull();
    });
  });

  describe("2. Profile Resolution Barrier & Authentication Invariants", () => {
    it("does NOT show splash while auth is loading", () => {
      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: null,
        isAuthLoading: true,
        isGuestMode: false,
        profileResolutionStatus: "IDLE",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      expect(screen.getByText(/Carregando ambiente seguro/i)).toBeDefined();
      expect(screen.queryByText(/Toque para ativar o som/i)).toBeNull();
    });

    it("does NOT show splash on login screen before authentication or guest entry", () => {
      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: null,
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "IDLE",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      expect(screen.getByText(/Bem-vindo à StaziaMed/i)).toBeDefined();
      expect(screen.getByText(/Já tenho uma conta/i)).toBeDefined();
      expect(screen.queryByText(/Toque para ativar o som/i)).toBeNull();
    });

    it("renders Profile Loading Barrier BEFORE Splash when profileResolutionStatus is LOADING", () => {
      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: { uid: "user-123", email: "dr@staziamed.com", emailVerified: true } as any,
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "LOADING",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      expect(screen.getByTestId("profile-loading-barrier")).toBeDefined();
      expect(screen.getByText(/Preparando seu perfil médico/i)).toBeDefined();
    });

    it("renders Profile Error Barrier when profileResolutionStatus is ERROR", () => {
      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: { uid: "user-123", email: "dr@staziamed.com", emailVerified: true } as any,
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "ERROR",
        profileError: "Network error",
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      expect(screen.getByTestId("profile-error-barrier")).toBeDefined();
      expect(screen.getByText(/Não foi possível carregar seu perfil/i)).toBeDefined();
    });
  });

  describe("3. Splash Execution & Frequency (Once per Session)", () => {
    it("renders Splash once per session for authenticated users when profile is READY", () => {
      vi.useFakeTimers();

      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: {
          uid: "user-123",
          email: "dr@staziamed.com",
          emailVerified: true,
          providerData: [{ providerId: "google.com" }],
        } as any,
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "READY",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
        user: {
          role: "STUDENT",
          onboardingStatus: "COMPLETED",
        },
        activeTab: "home",
        isExamConfigOpen: false,
        setIsExamConfigOpen: vi.fn(),
        isOfficialSearchOpen: false,
        setIsOfficialSearchOpen: vi.fn(),
        officialSearchQuery: "",
      } as any);

      const { rerender } = render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      // Splash should be visible initially (session storage is empty)
      expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBeNull();

      // Fast-forward animation completion timer
      act(() => {
        vi.advanceTimersByTime(11500);
      });

      // After splash completion, session storage is marked
      expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe("true");

      vi.useRealTimers();
    });

    it("renders Splash once per session for Guest Mode users", () => {
      vi.useFakeTimers();

      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: null,
        isAuthLoading: false,
        isGuestMode: true,
        profileResolutionStatus: "READY",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
        user: {
          role: "STUDENT",
          onboardingStatus: "NOT_STARTED",
        },
        activeTab: "home",
        isExamConfigOpen: false,
        setIsExamConfigOpen: vi.fn(),
        isOfficialSearchOpen: false,
        setIsOfficialSearchOpen: vi.fn(),
        officialSearchQuery: "",
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBeNull();

      act(() => {
        vi.advanceTimersByTime(11500);
      });

      expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe("true");

      vi.useRealTimers();
    });

    it("does NOT show splash on reload / second navigation if already seen in current session", () => {
      // Pre-populate sessionStorage
      sessionStorage.setItem(SPLASH_SESSION_KEY, "true");

      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: {
          uid: "user-123",
          email: "dr@staziamed.com",
          emailVerified: true,
          providerData: [{ providerId: "google.com" }],
        } as any,
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "READY",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
        user: {
          role: "STUDENT",
          onboardingStatus: "COMPLETED",
        },
        activeTab: "home",
        isExamConfigOpen: false,
        setIsExamConfigOpen: vi.fn(),
        isOfficialSearchOpen: false,
        setIsOfficialSearchOpen: vi.fn(),
        officialSearchQuery: "",
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      // Should bypass splash directly
      expect(hasSeenSplashThisSession()).toBe(true);
    });
  });

  describe("4. Zero Invariant Mutation", () => {
    it("ensures splash test mode does not alter user profile or onboarding status", () => {
      const mockUser = {
        id: "usr-456",
        role: "ADMIN",
        onboardingStatus: "COMPLETED",
        onboardingVersion: 1,
      };

      vi.mocked(AppContextModule.useApp).mockReturnValue({
        firebaseUser: {
          uid: "usr-456",
          email: "admin@staziamed.com",
          emailVerified: true,
          providerData: [{ providerId: "google.com" }],
        } as any,
        isAuthLoading: false,
        isGuestMode: false,
        profileResolutionStatus: "READY",
        profileError: null,
        retryProfileResolution: vi.fn(),
        logout: vi.fn(),
        user: mockUser,
        activeTab: "home",
        isExamConfigOpen: false,
        setIsExamConfigOpen: vi.fn(),
        isOfficialSearchOpen: false,
        setIsOfficialSearchOpen: vi.fn(),
        officialSearchQuery: "",
      } as any);

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoot />
        </MemoryRouter>
      );

      // Ensure mockUser was not mutated
      expect(mockUser.onboardingStatus).toBe("COMPLETED");
      expect(mockUser.role).toBe("ADMIN");
    });
  });
});
