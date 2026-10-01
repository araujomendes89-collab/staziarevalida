import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import {
  OnboardingSplashView,
  SPLASH_DURATION_MS,
  REDUCED_MOTION_DURATION_MS,
} from "../components/onboarding/OnboardingSplashView";
import { StaziaMascotSplashIllustration } from "../components/onboarding/StaziaMascotSplashIllustration";

// Helper component to track route transitions in tests
const RouteTracker: React.FC = () => {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}</div>;
};

describe("Onboarding Cinematic Splash View Prototype (Tela 00 — Splash Animado)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default matchMedia for tests
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should render full splash screen with mascot illustration, pure vector brand logo and load bar", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView />
      </MemoryRouter>
    );

    // StaziaMed Revalida Vector Brand
    expect(screen.getByText("Stazia")).toBeInTheDocument();
    expect(screen.getByText("Med")).toBeInTheDocument();
    expect(screen.getByText("REVALIDA")).toBeInTheDocument();

    // SVG elements present
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 400 700");

    // Pure vector icon and gradients (no raster/base64)
    expect(svg?.querySelector("#brandIcon")).toBeInTheDocument();
    expect(svg?.querySelector("#iconGrad")).toBeInTheDocument();
    expect(container.querySelector("image")).toBeNull();

    // Load bar container present
    const progressTrack = container.querySelector('[aria-hidden="true"]');
    expect(progressTrack).toBeInTheDocument();
  });

  it("should have SPLASH_DURATION_MS defined as 7500ms", () => {
    expect(SPLASH_DURATION_MS).toBe(7500);
    expect(REDUCED_MOTION_DURATION_MS).toBe(1000);
  });

  it("should automatically navigate to /onboarding/welcome upon splash completion when no onComplete provided", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <RouteTracker />
        <Routes>
          <Route path="/onboarding/splash" element={<OnboardingSplashView />} />
          <Route path="/onboarding/welcome" element={<div data-testid="welcome-screen">Welcome Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("current-location")).toHaveTextContent("/onboarding/splash");

    // Advance right before splash finishes
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS - 500);
    });
    expect(screen.getByTestId("current-location")).toHaveTextContent("/onboarding/splash");

    // Advance past SPLASH_DURATION_MS
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByTestId("current-location")).toHaveTextContent("/onboarding/welcome");
    expect(screen.getByTestId("welcome-screen")).toBeInTheDocument();
  });

  it("should call onComplete callback exactly once upon animation completion", async () => {
    const onCompleteMock = vi.fn();

    render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView onComplete={onCompleteMock} />
      </MemoryRouter>
    );

    expect(onCompleteMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS + 100);
    });

    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });

  it("should respect prefers-reduced-motion and complete in ~1000ms", async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onCompleteMock = vi.fn();

    render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView onComplete={onCompleteMock} />
      </MemoryRouter>
    );

    // Advance 1s (reduced motion timeout)
    act(() => {
      vi.advanceTimersByTime(REDUCED_MOTION_DURATION_MS + 50);
    });

    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });

  it("should render StaziaMascotSplashIllustration with all core graphic elements", () => {
    const { container } = render(
      <StaziaMascotSplashIllustration isAnimating={true} reduceMotion={false} />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();

    // Check for mascot, coat, stethoscope, dizzy stars, books, logo group, vector brand icon
    expect(svg?.querySelector("#mascot")).toBeInTheDocument();
    expect(svg?.querySelector("#coat")).toBeInTheDocument();
    expect(svg?.querySelector("#stetho")).toBeInTheDocument();
    expect(svg?.querySelector("#dizzyStars")).toBeInTheDocument();
    expect(svg?.querySelector("#books")).toBeInTheDocument();
    expect(svg?.querySelector("#logoGroup")).toBeInTheDocument();
    expect(svg?.querySelector("#brandIcon")).toBeInTheDocument();
  });

  it("should clean up timers and not error on unmount", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView />
      </MemoryRouter>
    );

    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it("should handle user interaction click to unlock audio without throwing", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView />
      </MemoryRouter>
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.click(rootDiv);
    }).not.toThrow();
  });

  it("should show 'Ativar som' button when AudioContext starts suspended and unlock on click", async () => {
    let isUserGesture = false;
    let mockState = "suspended";
    const resumeMock = vi.fn().mockImplementation(async () => {
      if (isUserGesture) {
        mockState = "running";
      }
    });
    const closeMock = vi.fn().mockResolvedValue(undefined);

    class MockAudioContextSuspended {
      get state() {
        return mockState;
      }
      sampleRate = 44100;
      currentTime = 0;
      destination = {};
      createGain = vi.fn().mockReturnValue({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1.0 },
        connect: vi.fn(),
      });
      createOscillator = vi.fn().mockReturnValue({
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 0 },
        detune: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      });
      createBiquadFilter = vi.fn().mockReturnValue({
        type: "lowpass",
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: vi.fn(),
      });
      createBuffer = vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(100)),
      });
      createConvolver = vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
      });
      resume = resumeMock;
      close = closeMock;
    }

    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContextSuspended;

    render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView />
      </MemoryRouter>
    );

    // Let any pending microtasks resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Context initialized suspended, expect "Ativar som" button
    const soundButton = screen.getByRole("button", { name: /ativar áudio/i });
    expect(soundButton).toBeInTheDocument();
    expect(screen.getByText("Ativar som")).toBeInTheDocument();

    // Click sound button with user gesture
    isUserGesture = true;
    await act(async () => {
      fireEvent.click(soundButton);
      await Promise.resolve();
    });

    expect(resumeMock).toHaveBeenCalled();
  });

  it("should clean up AudioContext properly on unmount", async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    class MockAudioContextRunning {
      state = "running";
      sampleRate = 44100;
      currentTime = 0;
      destination = {};
      createGain = vi.fn().mockReturnValue({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1.0 },
        connect: vi.fn(),
      });
      createOscillator = vi.fn().mockReturnValue({
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 0 },
        detune: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      });
      createBiquadFilter = vi.fn().mockReturnValue({
        type: "lowpass",
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: vi.fn(),
      });
      createBuffer = vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(100)),
      });
      createConvolver = vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
      });
      resume = vi.fn().mockResolvedValue(undefined);
      close = closeMock;
    }

    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContextRunning;

    const { unmount } = render(
      <MemoryRouter initialEntries={["/onboarding/splash"]}>
        <OnboardingSplashView />
      </MemoryRouter>
    );

    unmount();
    expect(closeMock).toHaveBeenCalled();
  });
});
