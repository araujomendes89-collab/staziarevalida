import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { OnboardingWelcomeView } from "../components/onboarding/OnboardingWelcomeView";
import { OnboardingPersonalizationView } from "../components/onboarding/OnboardingPersonalizationView";
import { OnboardingFinishView } from "../components/onboarding/OnboardingFinishView";
import { OnboardingSplashView } from "../components/onboarding/OnboardingSplashView";
import * as AppContextModule from "../context/AppContext";
import { OnboardingPersistenceService } from "../services/onboardingPersistenceService";
import { CURRENT_ONBOARDING_VERSION } from "../types/onboarding";
import { SHOW_SPLASH_FOR_ALL } from "../config/splashConfig";

// Mock motion tokens and heavy visual illustrations
vi.mock("../components/onboarding/OnboardingHeroIllustration", () => ({
  OnboardingHeroIllustration: () => <div data-testid="hero-illustration">HeroIllustration</div>,
}));
vi.mock("../components/onboarding/OnboardingDirectionIllustration", () => ({
  OnboardingDirectionIllustration: () => (
    <div data-testid="direction-illustration">DirectionIllustration</div>
  ),
}));

describe("1.26D — Onboarding UI Persistence Wiring", () => {
  const mockRetryProfileResolution = vi.fn();

  const persistentUserContext = {
    user: {
      id: "user-persistent-123",
      name: "Dr. Candidato",
      role: "STUDENT" as const,
      tier: "TRIAL" as const,
      onboarding: {
        version: CURRENT_ONBOARDING_VERSION,
        status: "REQUIRED" as const,
      },
    },
    firebaseUser: { uid: "user-persistent-123", email: "candidato@test.com" } as any,
    isGuestMode: false,
    profileResolutionStatus: "READY" as const,
    retryProfileResolution: mockRetryProfileResolution,
  } as any;

  const inProgressContext = {
    ...persistentUserContext,
    user: {
      ...persistentUserContext.user,
      onboarding: {
        version: CURRENT_ONBOARDING_VERSION,
        status: "IN_PROGRESS" as const,
      },
    },
  };

  const completedUserContext = {
    ...persistentUserContext,
    user: {
      ...persistentUserContext.user,
      onboarding: {
        version: CURRENT_ONBOARDING_VERSION,
        status: "COMPLETED" as const,
        completedAt: "2026-09-01T10:00:00Z",
      },
    },
  };

  const guestUserContext = {
    user: { id: "guest-user", role: "STUDENT" as const, tier: "TRIAL" as const },
    firebaseUser: null,
    isGuestMode: true,
    profileResolutionStatus: "IDLE" as const,
    retryProfileResolution: mockRetryProfileResolution,
  } as any;

  const legacyUserContext = {
    user: { id: "legacy-user", role: "STUDENT" as const, tier: "TRIAL" as const },
    firebaseUser: { uid: "legacy-user" } as any,
    isGuestMode: false,
    profileResolutionStatus: "READY" as const,
    retryProfileResolution: mockRetryProfileResolution,
  } as any;

  const adminUserContext = {
    user: {
      id: "admin-user",
      role: "ADMIN" as const,
      tier: "ADMIN" as const,
      onboarding: { version: 1, status: "REQUIRED" as const },
    },
    firebaseUser: { uid: "admin-user" } as any,
    isGuestMode: false,
    profileResolutionStatus: "READY" as const,
    retryProfileResolution: mockRetryProfileResolution,
  } as any;

  const setMockContext = (contextVal: any) => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue(contextVal);
    vi.spyOn(AppContextModule, "useAppOptional").mockReturnValue(contextVal);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ------------------------------------------------------------- */
  /* 1. WELCOME VIEW WIRING                                        */
  /* ------------------------------------------------------------- */
  describe("1. Welcome View (beginOnboarding wiring)", () => {
    it("should NOT call beginOnboarding on render/mount", () => {
      const beginSpy = vi.spyOn(OnboardingPersistenceService, "beginOnboarding");
      setMockContext(persistentUserContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/welcome"]}>
          <Routes>
            <Route path="/onboarding/welcome" element={<OnboardingWelcomeView />} />
          </Routes>
        </MemoryRouter>
      );

      expect(beginSpy).not.toHaveBeenCalled();
    });

    it("PERSISTENT: should call beginOnboarding on CTA click and navigate on success", async () => {
      const beginSpy = vi
        .spyOn(OnboardingPersistenceService, "beginOnboarding")
        .mockResolvedValueOnce({
          success: true,
          status: "IN_PROGRESS",
          startedAt: "2026-09-04T10:00:00Z",
          isNewTransition: true,
        });

      setMockContext(persistentUserContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/welcome"]}>
          <Routes>
            <Route path="/onboarding/welcome" element={<OnboardingWelcomeView />} />
            <Route
              path="/onboarding/ecosystem"
              element={<div data-testid="ecosystem-view">Ecosystem Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      const startCta = screen.getByTestId("welcome-start-cta");
      fireEvent.click(startCta);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(beginSpy).toHaveBeenCalledWith("user-persistent-123");

      await waitFor(() => {
        expect(screen.getByTestId("ecosystem-view")).toBeInTheDocument();
      });
    });

    it("PENDING: should disable CTA and show pending microcopy while begin is in-flight", async () => {
      let resolvePromise: (val: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.spyOn(OnboardingPersistenceService, "beginOnboarding").mockReturnValueOnce(promise as any);

      setMockContext(persistentUserContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/welcome"]}>
          <Routes>
            <Route path="/onboarding/welcome" element={<OnboardingWelcomeView />} />
          </Routes>
        </MemoryRouter>
      );

      const startCta = screen.getByTestId("welcome-start-cta");
      fireEvent.click(startCta);

      expect(startCta).toBeDisabled();
      expect(screen.getByText("Começando...")).toBeInTheDocument();

      // Resolve
      await act(async () => {
        resolvePromise!({ success: true, status: "IN_PROGRESS" });
      });
    });

    it("PERSISTENT: should block navigation and show error message on beginOnboarding failure", async () => {
      vi.spyOn(OnboardingPersistenceService, "beginOnboarding").mockResolvedValueOnce({
        success: false,
        code: "TRANSACTION_ERROR",
        error: "Firestore network error",
      });

      setMockContext(persistentUserContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/welcome"]}>
          <Routes>
            <Route path="/onboarding/welcome" element={<OnboardingWelcomeView />} />
            <Route
              path="/onboarding/ecosystem"
              element={<div data-testid="ecosystem-view">Ecosystem Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      const startCta = screen.getByTestId("welcome-start-cta");
      fireEvent.click(startCta);

      await waitFor(() => {
        expect(screen.getByTestId("welcome-error-message")).toBeInTheDocument();
        expect(
          screen.getByText("Não foi possível iniciar agora. Tente novamente.")
        ).toBeInTheDocument();
      });

      expect(screen.queryByTestId("ecosystem-view")).not.toBeInTheDocument();
    });

    it("IN_PROGRESS: should be idempotent and proceed to ecosystem smoothly", async () => {
      const beginSpy = vi
        .spyOn(OnboardingPersistenceService, "beginOnboarding")
        .mockResolvedValueOnce({
          success: true,
          status: "IN_PROGRESS",
          startedAt: "2026-09-04T09:00:00Z",
          isNewTransition: false,
        });

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/welcome"]}>
          <Routes>
            <Route path="/onboarding/welcome" element={<OnboardingWelcomeView />} />
            <Route
              path="/onboarding/ecosystem"
              element={<div data-testid="ecosystem-view">Ecosystem Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      const startCta = screen.getByTestId("welcome-start-cta");
      fireEvent.click(startCta);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByTestId("ecosystem-view")).toBeInTheDocument();
      });
    });

    it("SAFE PREVIEW (Guest/Legacy/Admin/Completed): should navigate without calling beginOnboarding", async () => {
      const beginSpy = vi.spyOn(OnboardingPersistenceService, "beginOnboarding");

      for (const ctx of [guestUserContext, legacyUserContext, adminUserContext, completedUserContext]) {
        beginSpy.mockClear();
        setMockContext(ctx);

        const { unmount } = render(
          <MemoryRouter initialEntries={["/onboarding/welcome"]}>
            <Routes>
              <Route path="/onboarding/welcome" element={<OnboardingWelcomeView />} />
              <Route
                path="/onboarding/ecosystem"
                element={<div data-testid="ecosystem-view">Ecosystem Page</div>}
              />
            </Routes>
          </MemoryRouter>
        );

        const startCta = screen.getByTestId("welcome-start-cta");
        fireEvent.click(startCta);

        expect(beginSpy).not.toHaveBeenCalled();
        await waitFor(() => {
          expect(screen.getByTestId("ecosystem-view")).toBeInTheDocument();
        });
        unmount();
      }
    });
  });

  /* ------------------------------------------------------------- */
  /* 2. PERSONALIZATION VIEW WIRING                                */
  /* ------------------------------------------------------------- */
  describe("2. Personalization View (saveOnboardingPersonalization wiring)", () => {
    it("PERSISTENT: should save validated personalization at Summary step and advance to progress-preview", async () => {
      const saveSpy = vi
        .spyOn(OnboardingPersistenceService, "saveOnboardingPersonalization")
        .mockResolvedValueOnce({
          success: true,
          currentSection: "PROGRESS_PREVIEW",
          personalization: {
            version: 1,
            preparationStage: "COMECO",
            dailyStudyAvailability: "1_A_2H",
            studyDays: ["SEG"],
            variableRoutine: false,
            selfReportedWeakAreas: ["CLINICA_MEDICA"],
            dontKnowWeakAreas: false,
            examIntent: "PROXIMA",
            savedAt: "2026-09-04T10:00:00Z",
          },
        });

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/personalize"]}>
          <Routes>
            <Route
              path="/onboarding/personalize"
              element={<OnboardingPersonalizationView />}
            />
            <Route
              path="/onboarding/progress-preview"
              element={<div data-testid="progress-preview-view">Progress Preview Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      // Advance Intro -> Stage
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Q1 Stage: Select first option ("COMECO")
      fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Q2 Daily Time: Select "1 a 2 horas"
      fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Q3 Days: Select "Seg"
      fireEvent.click(screen.getByText("Seg").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Q4 Weak Areas: Select "Clínica Médica"
      fireEvent.click(screen.getByText("Clínica Médica").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Q5 Exam Intent: Select "Próxima edição"
      fireEvent.click(screen.getByText("Próxima edição").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Now at SUMMARY step!
      expect(screen.getByText("Perfeito. Já temos o essencial.")).toBeInTheDocument();

      // Click Final CTA
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        "user-persistent-123",
        expect.objectContaining({
          preparationStage: "COMECO",
          dailyStudyAvailability: "1_A_2H",
          studyDays: ["SEG"],
          variableRoutine: false,
          selfReportedWeakAreas: ["CLINICA_MEDICA"],
          dontKnowWeakAreas: false,
          examIntent: "PROXIMA",
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId("progress-preview-view")).toBeInTheDocument();
      });
    });

    it("PENDING: should show 'Salvando...' and disable button while saving is in-flight", async () => {
      let resolveSave: (val: any) => void;
      const savePromise = new Promise((resolve) => {
        resolveSave = resolve;
      });
      vi.spyOn(OnboardingPersistenceService, "saveOnboardingPersonalization").mockReturnValueOnce(
        savePromise as any
      );

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/personalize"]}>
          <Routes>
            <Route
              path="/onboarding/personalize"
              element={<OnboardingPersonalizationView />}
            />
          </Routes>
        </MemoryRouter>
      );

      // Advance to summary
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Seg").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Clínica Médica").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Próxima edição").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      const cta = screen.getByTestId("personalization-next-cta");
      fireEvent.click(cta);

      expect(cta).toBeDisabled();
      expect(screen.getByText("Salvando...")).toBeInTheDocument();

      await act(async () => {
        resolveSave!({ success: true });
      });
    });

    it("PERSISTENT: should block navigation and keep draft preserved if saveOnboardingPersonalization fails", async () => {
      vi.spyOn(OnboardingPersistenceService, "saveOnboardingPersonalization").mockResolvedValueOnce({
        success: false,
        code: "TRANSACTION_ERROR",
        error: "Firestore write error",
      });

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/personalize"]}>
          <Routes>
            <Route
              path="/onboarding/personalize"
              element={<OnboardingPersonalizationView />}
            />
            <Route
              path="/onboarding/progress-preview"
              element={<div data-testid="progress-preview-view">Progress Preview Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      // Advance through questions
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Seg").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Clínica Médica").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Próxima edição").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Verify at summary
      expect(screen.getByText("Perfeito. Já temos o essencial.")).toBeInTheDocument();

      // Click Final CTA
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      await waitFor(() => {
        expect(screen.getByTestId("personalization-error-message")).toBeInTheDocument();
        expect(
          screen.getByText("Não foi possível salvar suas respostas. Tente novamente.")
        ).toBeInTheDocument();
      });

      expect(screen.queryByTestId("progress-preview-view")).not.toBeInTheDocument();
    });

    it("SAFE PREVIEW (Guest/Legacy/Admin): should navigate without calling saveOnboardingPersonalization", async () => {
      const saveSpy = vi.spyOn(OnboardingPersistenceService, "saveOnboardingPersonalization");
      setMockContext(guestUserContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/personalize"]}>
          <Routes>
            <Route
              path="/onboarding/personalize"
              element={<OnboardingPersonalizationView />}
            />
            <Route
              path="/onboarding/progress-preview"
              element={<div data-testid="progress-preview-view">Progress Preview Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      // Advance through questions
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Estou começando agora").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("1 a 2 horas").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Seg").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Clínica Médica").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));
      fireEvent.click(screen.getByText("Próxima edição").closest("button")!);
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      // Final CTA in guest mode
      fireEvent.click(screen.getByTestId("personalization-next-cta"));

      expect(saveSpy).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByTestId("progress-preview-view")).toBeInTheDocument();
      });
    });
  });

  /* ------------------------------------------------------------- */
  /* 3. FINISH VIEW WIRING                                         */
  /* ------------------------------------------------------------- */
  describe("3. Finish View (completeOnboarding wiring)", () => {
    it("PERSISTENT: should call completeOnboarding, sync profile, and navigate to '/' on success", async () => {
      const completeSpy = vi
        .spyOn(OnboardingPersistenceService, "completeOnboarding")
        .mockResolvedValueOnce({
          success: true,
          status: "COMPLETED",
          completedAt: "2026-09-04T10:15:00Z",
          isNewTransition: true,
        });

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/finish"]}>
          <Routes>
            <Route path="/onboarding/finish" element={<OnboardingFinishView />} />
            <Route path="/" element={<div data-testid="dashboard-root">Dashboard Root</div>} />
          </Routes>
        </MemoryRouter>
      );

      const finishCta = screen.getByTestId("finish-complete-cta");
      fireEvent.click(finishCta);

      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledWith("user-persistent-123");

      await waitFor(() => {
        expect(mockRetryProfileResolution).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("dashboard-root")).toBeInTheDocument();
      });
    });

    it("PENDING: should show 'Finalizando...' and disable button while completing is in-flight", async () => {
      let resolveComplete: (val: any) => void;
      const completePromise = new Promise((resolve) => {
        resolveComplete = resolve;
      });
      vi.spyOn(OnboardingPersistenceService, "completeOnboarding").mockReturnValueOnce(
        completePromise as any
      );

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/finish"]}>
          <Routes>
            <Route path="/onboarding/finish" element={<OnboardingFinishView />} />
          </Routes>
        </MemoryRouter>
      );

      const finishCta = screen.getByTestId("finish-complete-cta");
      fireEvent.click(finishCta);

      expect(finishCta).toBeDisabled();
      expect(screen.getByText("Finalizando...")).toBeInTheDocument();

      await act(async () => {
        resolveComplete!({ success: true, status: "COMPLETED" });
      });
    });

    it("ORDER OF EXECUTION: completeOnboarding resolves -> profile refreshes -> navigation happens", async () => {
      const orderLogs: string[] = [];

      vi.spyOn(OnboardingPersistenceService, "completeOnboarding").mockImplementation(async () => {
        orderLogs.push("COMPLETE_ONBOARDING");
        return { success: true, status: "COMPLETED", completedAt: "2026-09-04T10:15:00Z", isNewTransition: true };
      });

      mockRetryProfileResolution.mockImplementation(async () => {
        orderLogs.push("RETRY_PROFILE_RESOLUTION");
      });

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/finish"]}>
          <Routes>
            <Route path="/onboarding/finish" element={<OnboardingFinishView />} />
            <Route path="/" element={<div data-testid="dashboard-root">Dashboard Root</div>} />
          </Routes>
        </MemoryRouter>
      );

      const finishCta = screen.getByTestId("finish-complete-cta");
      fireEvent.click(finishCta);

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-root")).toBeInTheDocument();
      });

      expect(orderLogs).toEqual(["COMPLETE_ONBOARDING", "RETRY_PROFILE_RESOLUTION"]);
    });

    it("DIRECT FINISH PROTECTION: should block navigation and show error when personalization is missing", async () => {
      vi.spyOn(OnboardingPersistenceService, "completeOnboarding").mockResolvedValueOnce({
        success: false,
        code: "MISSING_PERSONALIZATION",
        error: "Direct finish prohibited: initial personalization has not been saved.",
      });

      setMockContext(inProgressContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/finish"]}>
          <Routes>
            <Route path="/onboarding/finish" element={<OnboardingFinishView />} />
            <Route path="/" element={<div data-testid="dashboard-root">Dashboard Root</div>} />
          </Routes>
        </MemoryRouter>
      );

      const finishCta = screen.getByTestId("finish-complete-cta");
      fireEvent.click(finishCta);

      await waitFor(() => {
        expect(screen.getByTestId("finish-error-message")).toBeInTheDocument();
        expect(
          screen.getByText(/Complete as etapas anteriores de personalização/i)
        ).toBeInTheDocument();
      });

      expect(mockRetryProfileResolution).not.toHaveBeenCalled();
      expect(screen.queryByTestId("dashboard-root")).not.toBeInTheDocument();
    });

    it("SAFE PREVIEW (Guest/Legacy/Admin): should navigate to '/' without calling completeOnboarding", async () => {
      const completeSpy = vi.spyOn(OnboardingPersistenceService, "completeOnboarding");
      setMockContext(guestUserContext);

      render(
        <MemoryRouter initialEntries={["/onboarding/finish"]}>
          <Routes>
            <Route path="/onboarding/finish" element={<OnboardingFinishView />} />
            <Route path="/" element={<div data-testid="dashboard-root">Dashboard Root</div>} />
          </Routes>
        </MemoryRouter>
      );

      const finishCta = screen.getByTestId("finish-complete-cta");
      fireEvent.click(finishCta);

      expect(completeSpy).not.toHaveBeenCalled();
      expect(mockRetryProfileResolution).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-root")).toBeInTheDocument();
      });
    });
  });

  /* ------------------------------------------------------------- */
  /* 4. SPLASH REGRESSION AND NON-INTERFERENCE                     */
  /* ------------------------------------------------------------- */
  describe("4. Splash non-interference and invariants", () => {
    it("ensures SHOW_SPLASH_FOR_ALL is enabled and splash never invokes beginOnboarding", () => {
      expect(SHOW_SPLASH_FOR_ALL).toBe(true);
      const beginSpy = vi.spyOn(OnboardingPersistenceService, "beginOnboarding");

      render(
        <MemoryRouter initialEntries={["/onboarding/splash"]}>
          <OnboardingSplashView />
        </MemoryRouter>
      );

      expect(beginSpy).not.toHaveBeenCalled();
    });
  });
});
