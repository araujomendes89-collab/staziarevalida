import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { TermsOfUseView, TERMS_SECTIONS } from "../components/legal/TermsOfUseView";
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

describe("Terms of Use Legal Page (/termos-de-uso)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue(defaultContextValues);
  });

  it("should render public Terms of Use page with document header and company details", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    // Title
    expect(screen.getByRole("heading", { level: 1, name: "TERMOS DE USO" })).toBeInTheDocument();

    // Brand and date
    expect(screen.getAllByText(/04 de setembro de 2026/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/64.964.213\/0001-16/i).length).toBeGreaterThan(0);
  });

  it("should enforce Light Mode Only even if global context is in dark mode", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      ...defaultContextValues,
      isDarkMode: true,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.className).toContain("bg-[#F8FAFC]");
    expect(rootDiv.className).not.toContain("bg-[#08101D]");
  });

  it("should contain exactly 27 legal sections with intact titles and numbering", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    expect(TERMS_SECTIONS).toHaveLength(27);

    // Explicit check for composite sections that must remain combined
    const titles = TERMS_SECTIONS.map((s) => s.title);
    expect(titles).toContain("Planos, Assinaturas e Pagamentos");
    expect(titles).toContain("Comunicações e Suporte");
    expect(titles).toContain("Legislação e Foro");

    // Check all 27 sections
    for (const section of TERMS_SECTIONS) {
      const sectionEl = document.getElementById(section.id);
      expect(sectionEl).toBeInTheDocument();
      expect(sectionEl).toHaveTextContent(section.title.toUpperCase());
    }
  });

  it("should include critical legal disclaimers verbatim", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    // INEP / MEC lack of institutional affiliation
    expect(
      screen.getByText(/não representa, não integra e não possui vínculo institucional com o Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira — INEP/i)
    ).toBeInTheDocument();

    // No approval guarantee
    expect(
      screen.getByText(/não representa promessa ou garantia de aprovação em qualquer etapa do Revalida/i)
    ).toBeInTheDocument();

    // Non-clinical use
    expect(
      screen.getByText(/É proibido utilizar respostas geradas pela plataforma como única base para diagnóstico/i)
    ).toBeInTheDocument();

    // Patient data prohibition
    expect(
      screen.getByText(/É expressamente proibido inserir na plataforma dados identificáveis de pacientes reais/i)
    ).toBeInTheDocument();
  });

  it("should render visible Sair button on top and display new official logo", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    const exitButton = screen.getByRole("button", { name: /Sair da página jurídica/i });
    expect(exitButton).toBeInTheDocument();
    expect(exitButton).toHaveTextContent("Sair");

    // Verify new official logo is rendered
    const logoImgs = screen.getAllByRole("img", { name: /StaziaMed Revalida/i });
    expect(logoImgs.length).toBeGreaterThan(0);
    expect(logoImgs[0]).toHaveAttribute("src", "/images/logo/staziamed_logo_legal.png");
  });

  it("should NOT render any Print button or print action", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    expect(screen.queryByTitle(/Imprimir/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir/i })).not.toBeInTheDocument();
  });

  it("should never trigger signOut or clear session when clicking Sair", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <TermsOfUseView />
      </MemoryRouter>
    );

    const exitButton = screen.getByRole("button", { name: /Sair da página jurídica/i });
    fireEvent.click(exitButton);

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("should cross-navigate to /politica-de-privacidade", () => {
    render(
      <MemoryRouter initialEntries={["/termos-de-uso"]}>
        <Routes>
          <Route path="/termos-de-uso" element={<TermsOfUseView />} />
          <Route path="/politica-de-privacidade" element={<div data-testid="privacy-page">Privacy Policy Rendered</div>} />
        </Routes>
      </MemoryRouter>
    );

    const privacyBtn = screen.getByRole("button", { name: /Política de Privacidade/i });
    fireEvent.click(privacyBtn);

    expect(screen.getByTestId("privacy-page")).toBeInTheDocument();
  });

  it("should navigate to /termos-de-uso when clicking the link in LoginView footer", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/termos-de-uso" element={<div data-testid="terms-page">Terms Page Rendered</div>} />
        </Routes>
      </MemoryRouter>
    );

    const termsLink = screen.getByRole("button", { name: /Termos de Uso/i });
    expect(termsLink).toBeInTheDocument();

    fireEvent.click(termsLink);
    expect(screen.getByTestId("terms-page")).toBeInTheDocument();
  });

  it("should not contain any blocking terms checkbox on Login screen", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginView />
      </MemoryRouter>
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Li e aceito os termos/i)).not.toBeInTheDocument();
  });
});
