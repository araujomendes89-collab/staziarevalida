import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PrivacyPolicyView, PRIVACY_SECTIONS } from "../components/legal/PrivacyPolicyView";
import { LoginView } from "../components/auth/LoginView";
import * as AppContextModule from "../context/AppContext";

const mockSignOut = vi.fn();
const defaultContextValues = {
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  enterGuestMode: vi.fn(),
  signOut: mockSignOut,
  setActiveTab: vi.fn(),
  isDarkMode: false,
  setIsDarkMode: vi.fn(),
  user: { id: "test", name: "Dr. Test" },
  firebaseUser: null,
  isGuestMode: false,
  isAuthLoading: false,
} as any;

describe("Privacy Policy Legal Page (/politica-de-privacidade)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue(defaultContextValues);
  });

  it("should render public Privacy Policy page with document header, controller details, and CNPJ", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    // Title
    expect(screen.getByRole("heading", { level: 1, name: "POLÍTICA DE PRIVACIDADE" })).toBeInTheDocument();

    // Controller and date
    expect(screen.getAllByText(/04 de setembro de 2026/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/64.964.213\/0001-16/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/INFORMAÇÕES DO CONTROLADOR/i).length).toBeGreaterThan(0);
  });

  it("should enforce Light Mode Only even if global context is in dark mode", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...defaultContextValues,
      isDarkMode: true,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.className).toContain("bg-[#F8FAFC]");
    expect(rootDiv.className).not.toContain("bg-[#08101D]");
  });

  it("should contain exactly 21 privacy sections with intact titles and numbering", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    expect(PRIVACY_SECTIONS).toHaveLength(21);

    // Check all 21 sections
    for (const section of PRIVACY_SECTIONS) {
      const sectionEl = document.getElementById(section.id);
      expect(sectionEl).toBeInTheDocument();
      expect(sectionEl).toHaveTextContent(section.title.toUpperCase());
    }
  });

  it("should include critical LGPD principles and disclaimers verbatim", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    // LGPD mention
    expect(
      screen.getAllByText(/Lei nº 13.709\/2018 — Lei Geral de Proteção de Dados Pessoais/i).length
    ).toBeGreaterThanOrEqual(1);

    // Patient data prohibition
    expect(
      screen.getByText(/A StaziaMed Revalida possui finalidade educacional e não foi desenvolvida para armazenar prontuários médicos ou informações clínicas identificáveis de pacientes reais/i)
    ).toBeInTheDocument();

    // No list selling
    expect(
      screen.getByText(/A StaziaMed Revalida não comercializa listas de dados pessoais dos usuários/i)
    ).toBeInTheDocument();

    // Account deletion path
    expect(
      screen.getByText(/Perfil → Excluir conta → confirmação da exclusão/i)
    ).toBeInTheDocument();
  });

  it("should render visible Sair button on top and display new official logo", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    const exitButton = screen.getByRole("button", { name: /Sair da página jurídica/i });
    expect(exitButton).toBeInTheDocument();
    expect(exitButton).toHaveTextContent("Sair");

    expect(screen.getByRole("button", { name: /Termos de Uso/i })).toBeInTheDocument();

    // Verify new official logo is rendered
    const logoImgs = screen.getAllByRole("img", { name: /StaziaMed Revalida/i });
    expect(logoImgs.length).toBeGreaterThan(0);
    expect(logoImgs[0]).toHaveAttribute("src", "/images/logo/staziamed_logo_legal.png");
  });

  it("should NOT render any Print button or print action", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    expect(screen.queryByTitle(/Imprimir/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir/i })).not.toBeInTheDocument();
  });

  it("should never trigger signOut or clear session when clicking Sair", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <PrivacyPolicyView />
      </MemoryRouter>
    );

    const exitButton = screen.getByRole("button", { name: /Sair da página jurídica/i });
    fireEvent.click(exitButton);

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("should cross-navigate to /termos-de-uso", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <Routes>
          <Route path="/politica-de-privacidade" element={<PrivacyPolicyView />} />
          <Route path="/termos-de-uso" element={<div data-testid="terms-page">Terms Page Rendered</div>} />
        </Routes>
      </MemoryRouter>
    );

    const termsBtn = screen.getByRole("button", { name: /Termos de Uso/i });
    fireEvent.click(termsBtn);

    expect(screen.getByTestId("terms-page")).toBeInTheDocument();
  });

  it("should navigate to /politica-de-privacidade when clicking the link in LoginView footer", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/politica-de-privacidade" element={<div data-testid="privacy-page">Privacy Page Rendered</div>} />
        </Routes>
      </MemoryRouter>
    );

    const privacyLink = screen.getByRole("button", { name: /Política de Privacidade/i });
    expect(privacyLink).toBeInTheDocument();

    fireEvent.click(privacyLink);
    expect(screen.getByTestId("privacy-page")).toBeInTheDocument();
  });
});
