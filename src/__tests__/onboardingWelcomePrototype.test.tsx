import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingWelcomeView } from "../components/onboarding/OnboardingWelcomeView";
import { OnboardingHeroIllustration } from "../components/onboarding/OnboardingHeroIllustration";
import { OnboardingProgressiveText } from "../components/onboarding/OnboardingProgressiveText";
import {
  MOTION_DELAYS,
  MOTION_DURATIONS,
  createFadeUpVariant,
  createFadeInVariant,
  REDUCED_MOTION_STATIC_VARIANT,
} from "../components/onboarding/motionTokens";

describe("Onboarding Welcome View Prototype (Tela 01 — Abertura Imersiva)", () => {
  it("should render full opening screen with brand, headline, subheadline and CTA", () => {
    render(
      <MemoryRouter>
        <OnboardingWelcomeView />
      </MemoryRouter>
    );

    // Brand logo
    expect(screen.getByText("Stazia")).toBeInTheDocument();
    expect(screen.getByText("Med")).toBeInTheDocument();
    expect(screen.getByText("REVALIDA")).toBeInTheDocument();

    // Primary headline
    const headline = screen.getByRole("heading", { level: 1 });
    expect(headline).toHaveTextContent("Sua preparação para o Revalida começa agora.");

    // Subheadline
    expect(
      screen.getByText("Organize o que estudar, praticar e revisar ao longo da sua preparação.")
    ).toBeInTheDocument();

    // Primary CTA
    const ctaButton = screen.getByRole("button", { name: /Começar minha preparação/i });
    expect(ctaButton).toBeInTheDocument();
  });

  it("should trigger onStart callback when CTA button is clicked", () => {
    const handleStart = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingWelcomeView onStart={handleStart} />
      </MemoryRouter>
    );

    const ctaButton = screen.getByRole("button", { name: /Começar minha preparação/i });
    fireEvent.click(ctaButton);

    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it("should render accessible SVG hero illustration with aria-hidden and role presentation", () => {
    const { container } = render(<OnboardingHeroIllustration />);

    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("role", "presentation");

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 560 280");
  });

  it("should contain the 5 semantic medical area accent colors in hero nodes", () => {
    const { container } = render(<OnboardingHeroIllustration />);
    const circles = container.querySelectorAll("circle");
    const circleColors = Array.from(circles).map((c) => c.getAttribute("fill"));

    // 5 Medical areas colors
    expect(circleColors).toContain("#2563eb"); // Clínica Médica
    expect(circleColors).toContain("#ea580c"); // Cirurgia
    expect(circleColors).toContain("#0d9488"); // Pediatria
    expect(circleColors).toContain("#e11d48"); // Ginecologia e Obstetrícia
    expect(circleColors).toContain("#059669"); // Preventiva
  });

  it("should provide consistent motion tokens and instant transitions for reduced motion", () => {
    expect(MOTION_DELAYS.logo).toBeLessThan(MOTION_DELAYS.headline);
    expect(MOTION_DELAYS.headline).toBeLessThan(MOTION_DELAYS.subheadline);
    expect(MOTION_DELAYS.subheadline).toBeLessThan(MOTION_DELAYS.cta);

    // Reduced motion static variant has duration 0
    expect(REDUCED_MOTION_STATIC_VARIANT.visible).toHaveProperty("transition");
    expect((REDUCED_MOTION_STATIC_VARIANT.visible as any).transition.duration).toBe(0);

    const fadeUp = createFadeUpVariant(1.5, 0.4);
    expect(fadeUp.hidden).toHaveProperty("opacity", 0);
    expect(fadeUp.visible).toHaveProperty("opacity", 1);
  });

  it("should render OnboardingProgressiveText independently with CTA callback", () => {
    const onStartMock = vi.fn();
    render(<OnboardingProgressiveText onStart={onStartMock} />);

    expect(screen.getByText("Sua preparação para o Revalida começa agora.")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Começar minha preparação/i });
    fireEvent.click(btn);
    expect(onStartMock).toHaveBeenCalledTimes(1);
  });
});
