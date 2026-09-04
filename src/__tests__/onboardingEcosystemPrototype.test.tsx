import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { OnboardingEcosystemView } from "../components/onboarding/OnboardingEcosystemView";
import { EcosystemCarousel } from "../components/onboarding/EcosystemCarousel";
import { EcosystemFeatureIllustration } from "../components/onboarding/EcosystemFeatureIllustration";
import { EcosystemProgress } from "../components/onboarding/EcosystemProgress";
import { ECOSYSTEM_FEATURES } from "../components/onboarding/ecosystemData";
import { OnboardingWelcomeView } from "../components/onboarding/OnboardingWelcomeView";
import { createCarouselSlideVariant } from "../components/onboarding/motionTokens";

describe("Onboarding Ecosystem Carousel Prototype (Tela 02 — Ecossistema StaziaMed)", () => {
  it("should contain exactly 6 immutable feature definitions", () => {
    expect(ECOSYSTEM_FEATURES).toHaveLength(6);
    expect(ECOSYSTEM_FEATURES.map((f) => f.id)).toEqual([
      "plano-de-hoje",
      "questoes-e-provas",
      "grandes-temas",
      "revisoes-e-flashcards",
      "atualizacoes-e-diretrizes",
      "materiais-oficiais",
    ]);
  });

  it("should render initial feature (Plano de Hoje) with headline, subheadline and progress", () => {
    render(
      <MemoryRouter>
        <OnboardingEcosystemView />
      </MemoryRouter>
    );

    // Headline & Subheadline
    expect(
      screen.getByText("Tudo organizado para você saber o que estudar.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Conheça as ferramentas que vão acompanhar sua preparação para o Revalida."
      )
    ).toBeInTheDocument();

    // Progress
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    // Feature 01 info
    expect(screen.getByText("01 — Plano de Hoje")).toBeInTheDocument();
    expect(screen.getByText("PLANO DE HOJE")).toBeInTheDocument();
    expect(
      screen.getByText("Veja o que estudar, praticar e revisar agora.")
    ).toBeInTheDocument();

    // Initial button labels
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar/i })).toBeInTheDocument();
  });

  it("should navigate sequentially forward across all 6 features", () => {
    render(
      <MemoryRouter>
        <EcosystemCarousel />
      </MemoryRouter>
    );

    const nextBtn = () => screen.getByRole("button", { name: /Continuar/i });

    // Step 1 -> Step 2
    fireEvent.click(nextBtn());
    expect(screen.getByText("02 — Questões e Provas")).toBeInTheDocument();
    expect(screen.getByText("QUESTÕES E PROVAS")).toBeInTheDocument();
    expect(
      screen.getByText("Pratique com questões, simulados e provas completas.")
    ).toBeInTheDocument();

    // Step 2 -> Step 3
    fireEvent.click(nextBtn());
    expect(screen.getByText("03 — Grandes Temas")).toBeInTheDocument();
    expect(screen.getByText("GRANDES TEMAS")).toBeInTheDocument();
    expect(
      screen.getByText("Revise os principais temas organizados pelas grandes áreas.")
    ).toBeInTheDocument();

    // Step 3 -> Step 4
    fireEvent.click(nextBtn());
    expect(screen.getByText("04 — Revisões e Flashcards")).toBeInTheDocument();
    expect(screen.getByText("REVISÕES E FLASHCARDS")).toBeInTheDocument();
    expect(
      screen.getByText("Retome conteúdos no momento certo com revisão espaçada.")
    ).toBeInTheDocument();

    // Step 4 -> Step 5
    fireEvent.click(nextBtn());
    expect(screen.getByText("05 — Atualizações & Diretrizes")).toBeInTheDocument();
    expect(screen.getByText("ATUALIZAÇÕES & DIRETRIZES")).toBeInTheDocument();
    expect(
      screen.getByText("Acompanhe mudanças relevantes de protocolos e condutas.")
    ).toBeInTheDocument();

    // Step 5 -> Step 6 (Last step)
    fireEvent.click(nextBtn());
    expect(screen.getByText("06 — Materiais Oficiais")).toBeInTheDocument();
    expect(screen.getByText("MATERIAIS OFICIAIS")).toBeInTheDocument();
    expect(
      screen.getByText("Consulte diretrizes, PCDTs e documentos de fontes oficiais.")
    ).toBeInTheDocument();

    // Last Step CTA transformation
    expect(screen.getByRole("button", { name: /Quero experimentar/i })).toBeInTheDocument();
  });

  it("should trigger onComplete callback when clicking 'Quero experimentar' on last slide", () => {
    const handleComplete = vi.fn();
    render(
      <MemoryRouter>
        <EcosystemCarousel onComplete={handleComplete} />
      </MemoryRouter>
    );

    // Advance to step 6
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    }

    const finalBtn = screen.getByRole("button", { name: /Quero experimentar/i });
    fireEvent.click(finalBtn);

    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it("should navigate backwards correctly and trigger onBackToWelcome on first slide", () => {
    const handleBackToWelcome = vi.fn();
    render(
      <MemoryRouter>
        <EcosystemCarousel onBackToWelcome={handleBackToWelcome} />
      </MemoryRouter>
    );

    // On slide 1, clicking Voltar triggers onBackToWelcome
    const backBtn = screen.getByRole("button", { name: /Voltar/i });
    fireEvent.click(backBtn);
    expect(handleBackToWelcome).toHaveBeenCalledTimes(1);

    // Advance to slide 2
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(screen.getByText("02 — Questões e Provas")).toBeInTheDocument();

    // Clicking Voltar on slide 2 returns to slide 1
    fireEvent.click(backBtn);
    expect(screen.getByText("01 — Plano de Hoje")).toBeInTheDocument();
  });

  it("should render all 6 feature illustrations with aria-hidden and role presentation", () => {
    ECOSYSTEM_FEATURES.forEach((feature) => {
      const { container } = render(
        <EcosystemFeatureIllustration type={feature.illustrationType} />
      );
      const wrapper = container.querySelector('[aria-hidden="true"]');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveAttribute("role", "presentation");
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("viewBox", "0 0 320 200");
    });
  });

  it("should connect Welcome View CTA to Ecosystem route", () => {
    const handleStart = vi.fn();
    render(
      <MemoryRouter initialEntries={["/onboarding/welcome"]}>
        <OnboardingWelcomeView onStart={handleStart} />
      </MemoryRouter>
    );

    const cta = screen.getByRole("button", { name: /Começar minha preparação/i });
    fireEvent.click(cta);
    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it("should provide instant reduced-motion transitions for carousel sliding", () => {
    const reducedVariant = createCarouselSlideVariant(true);
    expect(reducedVariant.enter).toHaveProperty("opacity", 0);
    expect((reducedVariant.center as any).transition.duration).toBeLessThanOrEqual(0.2);

    const normalVariant = createCarouselSlideVariant(false);
    expect(typeof normalVariant.enter).toBe("function");
    expect(typeof normalVariant.exit).toBe("function");
  });

  it("should display user-facing microcopy and no internal FSRS algorithm jargon in flashcard illustration", () => {
    const { container } = render(
      <EcosystemFeatureIllustration type="REVISOES_FLASHCARDS" />
    );

    // Shows user-facing scheduled review badge
    expect(container.textContent).toContain("Revisão programada");

    // Strictly does NOT expose internal algorithm labels
    expect(container.textContent).not.toContain("FSRS");
    expect(container.textContent).not.toContain("stability");
    expect(container.textContent).not.toContain("scheduler");
    expect(container.textContent).not.toContain("intervalDays");
    expect(container.textContent).not.toContain("easeFactor");
  });
});
