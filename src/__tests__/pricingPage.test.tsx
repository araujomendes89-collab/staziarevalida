import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { PricingPage } from "../components/pricing/PricingPage";
import { COMMERCIAL_PLANS, savePurchaseIntent, getPurchaseIntent, clearPurchaseIntent } from "../components/pricing/pricingTypes";

// Mock AppContext
const mockSetActiveTab = vi.fn();
const mockNavigate = vi.fn();
let mockUser: any = { id: "user_test_1", email: "aluno@staziamed.com.br", plan: "trial", tier: "TRIAL" };
let mockFirebaseUser: any = { uid: "user_test_1", email: "aluno@staziamed.com.br" };
let mockIsGuestMode = false;

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    user: mockUser,
    firebaseUser: mockFirebaseUser,
    isGuestMode: mockIsGuestMode,
    setActiveTab: mockSetActiveTab,
  }),
}));

// Mock react-router-dom navigate
vi.mock("react-router-dom", async () => {
  const actual: any = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/planos" }),
  };
});

// Mock useEntitlements
let mockEntitlements = {
  plan: "trial",
  isTrial: true,
  isExpired: false,
  trialActive: true,
  trialUsed: false,
  trialDaysRemaining: 5,
  refreshEntitlements: vi.fn(),
  canUse: vi.fn(),
  getFeatureDetails: vi.fn(),
};

vi.mock("../hooks/useEntitlements", () => ({
  useEntitlements: () => mockEntitlements,
}));

describe("PricingPage — Visual and Functional Compliance with Reference Design", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPurchaseIntent();
    mockUser = { id: "user_test_1", email: "aluno@staziamed.com.br", plan: "trial", tier: "TRIAL" };
    mockFirebaseUser = { uid: "user_test_1", email: "aluno@staziamed.com.br" };
    mockIsGuestMode = false;
    mockEntitlements = {
      plan: "trial",
      isTrial: true,
      isExpired: false,
      trialActive: true,
      trialUsed: false,
      trialDaysRemaining: 5,
      refreshEntitlements: vi.fn(),
      canUse: vi.fn(),
      getFeatureDetails: vi.fn(),
    };
  });

  it("renders all 3 tier cards: TRIAL, PRO, and ELITE with accurate titles and tags", () => {
    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    expect(screen.getByText("TRIAL")).toBeInTheDocument();
    expect(screen.getByText("PRO")).toBeInTheDocument();
    expect(screen.getByText("ELITE")).toBeInTheDocument();

    // PRO should have top badge "MAIS ESCOLHIDO"
    expect(screen.getByText("MAIS ESCOLHIDO")).toBeInTheDocument();

    // Taglines from reference image
    expect(screen.getByText(/DÊ O PRIMEIRO PASSO HOJE/i)).toBeInTheDocument();
    expect(screen.getByText(/ESTUDO INTELIGENTE RESULTADOS REAIS/i)).toBeInTheDocument();
    expect(screen.getByText(/MÁXIMO POTENCIAL ATÉ A APROVAÇÃO/i)).toBeInTheDocument();
  });

  it("renders 4 trust badges in footer matching reference image", () => {
    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    expect(screen.getByText("Pagamento seguro")).toBeInTheDocument();
    expect(screen.getByText("Cancele quando quiser")).toBeInTheDocument();
    expect(screen.getByText("Metodologia Validada")).toBeInTheDocument();
    expect(screen.getByText("Evolução real")).toBeInTheDocument();
    expect(
      screen.getByText(/Todos os planos foram pensados para transformar desempenho em estratégia de estudo/i)
    ).toBeInTheDocument();
  });

  it("toggles between monthly and annual billing cycle recalculating prices", () => {
    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    // Default monthly
    expect(screen.getByText("R$ 99,90")).toBeInTheDocument();
    expect(screen.getByText("R$ 179,90")).toBeInTheDocument();

    // Toggle to annual
    const annualBtn = screen.getByRole("radio", { name: /Anual/i });
    fireEvent.click(annualBtn);

    // In annual, PRO monthly equivalent is R$ 74,75 and Elite is R$ 124,75
    expect(screen.getByText("R$ 74,75")).toBeInTheDocument();
    expect(screen.getByText("R$ 124,75")).toBeInTheDocument();
  });

  it("saves purchase intent and redirects to /login when unauthenticated visitor clicks CTA", () => {
    mockFirebaseUser = null;
    mockIsGuestMode = false;

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    const proButton = screen.getByRole("button", { name: /Assinar PRO para o plano PRO/i });
    fireEvent.click(proButton);

    const savedIntent = getPurchaseIntent();
    expect(savedIntent).not.toBeNull();
    expect(savedIntent?.plan).toBe("pro");
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("allows active trial user to navigate directly to platform", () => {
    mockEntitlements.plan = "trial";
    mockEntitlements.trialActive = true;

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    const trialButton = screen.getByRole("button", { name: /Acessar plataforma para o plano TRIAL/i });
    fireEvent.click(trialButton);

    expect(mockSetActiveTab).toHaveBeenCalledWith("home");
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("disables trial button if trial is expired and displays 'Escolher um plano'", () => {
    mockEntitlements.plan = "trial";
    mockEntitlements.trialActive = false;
    mockEntitlements.trialUsed = true;
    mockEntitlements.isExpired = true;

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    const trialButton = screen.getByRole("button", { name: /Escolher um plano para o plano TRIAL/i });
    expect(trialButton).toBeDisabled();
  });

  it("shows 'Seu plano atual' on PRO card and upgrade option on ELITE card for PRO subscriber", () => {
    mockEntitlements.plan = "pro";
    mockEntitlements.isTrial = false;
    mockEntitlements.trialActive = false;

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    const proBtn = screen.getByRole("button", { name: /Seu plano atual para o plano PRO/i });
    expect(proBtn).toBeDisabled();

    const eliteBtn = screen.getByRole("button", { name: /Fazer upgrade para Elite para o plano ELITE/i });
    expect(eliteBtn).not.toBeDisabled();
  });

  it("navigates to /checkout when clicking subscribe button", () => {
    mockEntitlements.plan = "trial";
    mockEntitlements.trialActive = true;

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    const proButton = screen.getByRole("button", { name: /Assinar PRO para o plano PRO/i });
    fireEvent.click(proButton);

    expect(mockNavigate).toHaveBeenCalledWith("/checkout?plan=pro&cycle=monthly");
  });
});
