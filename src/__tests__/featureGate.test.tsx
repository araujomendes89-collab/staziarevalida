import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureGate } from "../components/common/FeatureGate";
import * as useEntitlementsModule from "../hooks/useEntitlements";
import * as AppContextModule from "../context/AppContext";

describe("FeatureGate Component Behavior", () => {
  const mockSetIsSubscriptionModalOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      setIsSubscriptionModalOpen: mockSetIsSubscriptionModalOpen,
    } as any);
  });

  it("should render children directly when user is entitled to the feature", () => {
    vi.spyOn(useEntitlementsModule, "useEntitlements").mockReturnValue({
      canUse: vi.fn().mockReturnValue(true),
      getFeatureDetails: vi.fn().mockReturnValue({ enabled: true }),
      isExpired: false,
      isTrial: false,
      plan: "pro",
      subscriptionStatus: "active",
      trialDaysRemaining: 0,
      consume: vi.fn(),
      upgradePlan: vi.fn(),
      refresh: vi.fn(),
      entitlements: null,
      loading: false,
      error: null,
    });

    render(
      <FeatureGate feature="simulations">
        <div data-testid="simulations-content">Conteúdo Liberado de Simulados</div>
      </FeatureGate>
    );

    expect(screen.getByTestId("simulations-content")).toBeInTheDocument();
    expect(screen.queryByTestId("feature-gate-blocked-simulations")).not.toBeInTheDocument();
  });

  it("should render upgrade lock card when user is blocked (Trial trying to access Elite feature)", () => {
    vi.spyOn(useEntitlementsModule, "useEntitlements").mockReturnValue({
      canUse: vi.fn().mockReturnValue(false),
      getFeatureDetails: vi.fn().mockReturnValue({ enabled: false, requiredPlan: "elite" }),
      isExpired: false,
      isTrial: true,
      plan: "trial",
      subscriptionStatus: "trialing",
      trialDaysRemaining: 5,
      consume: vi.fn(),
      upgradePlan: vi.fn(),
      refresh: vi.fn(),
      entitlements: null,
      loading: false,
      error: null,
    });

    render(
      <FeatureGate feature="ai_coach" title="Stazia AI Coach">
        <div data-testid="ai-coach-content">Conteúdo Secreto do Coach</div>
      </FeatureGate>
    );

    expect(screen.queryByTestId("ai-coach-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("feature-gate-blocked-ai_coach")).toBeInTheDocument();
    expect(screen.getByText("Recurso Stazia Elite")).toBeInTheDocument();
    expect(screen.getByText("Fazer Upgrade para Stazia Elite")).toBeInTheDocument();
  });

  it("should show expiration message when trial is expired", () => {
    vi.spyOn(useEntitlementsModule, "useEntitlements").mockReturnValue({
      canUse: vi.fn().mockReturnValue(false),
      getFeatureDetails: vi.fn().mockReturnValue({ enabled: false, requiredPlan: "pro" }),
      isExpired: true,
      isTrial: true,
      plan: "trial",
      subscriptionStatus: "expired",
      trialDaysRemaining: 0,
      consume: vi.fn(),
      upgradePlan: vi.fn(),
      refresh: vi.fn(),
      entitlements: null,
      loading: false,
      error: null,
    });

    render(
      <FeatureGate feature="simulations">
        <div data-testid="simulations-content">Simulados</div>
      </FeatureGate>
    );

    expect(screen.getByText("Período de Avaliação Expirado")).toBeInTheDocument();
  });
});
