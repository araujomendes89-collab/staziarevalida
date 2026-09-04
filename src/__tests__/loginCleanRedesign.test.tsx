import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginView } from "../components/auth/LoginView";
import { PlanSelectionView } from "../components/auth/PlanSelectionView";
import * as AppContextModule from "../context/AppContext";

// Mock AppContext
const mockSignInWithGoogle = vi.fn();
const mockSignInWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();
const mockSendPasswordReset = vi.fn();
const mockEnterGuestMode = vi.fn();
const mockSetActiveTab = vi.fn();
const mockUpdateUserProfile = vi.fn();

const defaultContextValues = {
  signInWithGoogle: mockSignInWithGoogle,
  signInWithEmail: mockSignInWithEmail,
  signUpWithEmail: mockSignUpWithEmail,
  sendPasswordReset: mockSendPasswordReset,
  enterGuestMode: mockEnterGuestMode,
  setActiveTab: mockSetActiveTab,
  updateUserProfile: mockUpdateUserProfile,
  user: { id: "test", name: "Dr. Test", role: "STUDENT", tier: "TRIAL" },
  firebaseUser: null,
  isGuestMode: false,
  isAuthLoading: false,
} as any;

const renderLoginView = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/auth/select-plan" element={<div data-testid="select-plan-page">Plan Selection Page</div>} />
        <Route path="/termos-de-uso" element={<div data-testid="terms-view">Termos de Uso</div>} />
        <Route path="/politica-de-privacidade" element={<div data-testid="privacy-view">Política de Privacidade</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("1.25A — Clean Auth Entry + Login + Signup Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue(defaultContextValues);
  });

  /* ------------------------------------------------------------- */
  /* 1. INITIAL ENTRY SCREEN                                       */
  /* ------------------------------------------------------------- */
  it("should render initial Entry screen with StaziaMed logo and two main choice CTAs", () => {
    renderLoginView();

    // Brand logo exactly once
    expect(screen.getAllByAltText("StaziaMed Revalida")).toHaveLength(1);

    // Headline & Subheadline
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo à StaziaMed.");
    expect(screen.getByText("Escolha como deseja continuar.")).toBeInTheDocument();

    // Two main choice CTAs
    expect(screen.getByRole("button", { name: /Já tenho uma conta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar uma nova conta/i })).toBeInTheDocument();

    // Discrete guest link
    expect(screen.getByRole("button", { name: /Explorar como visitante/i })).toBeInTheDocument();

    // Legal links
    expect(screen.getByRole("button", { name: /Termos de Uso/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Política de Privacidade/i })).toBeInTheDocument();
  });

  /* ------------------------------------------------------------- */
  /* 2. LOGIN FLOW (Já tenho uma conta)                            */
  /* ------------------------------------------------------------- */
  it("should navigate to LOGIN flow, render Google and Email/Password fields, and support login", async () => {
    mockSignInWithEmail.mockResolvedValueOnce({ uid: "user_login_1" });
    renderLoginView();

    // Click "Já tenho uma conta"
    fireEvent.click(screen.getByRole("button", { name: /Já tenho uma conta/i }));

    // Headline
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo de volta.");
    expect(screen.getByText("Entre para continuar sua preparação.")).toBeInTheDocument();

    // Google button
    expect(screen.getByRole("button", { name: /Continuar com Google/i })).toBeInTheDocument();

    // Form inputs with proper autocomplete attributes
    const emailInput = screen.getByPlaceholderText("seu@email.com.br");
    const passwordInput = screen.getByPlaceholderText("Sua senha");
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("autocomplete", "email");
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

    // Toggle password visibility
    const showPasswordBtn = screen.getByLabelText("Exibir senha");
    expect(showPasswordBtn).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(showPasswordBtn);
    expect(passwordInput).toHaveAttribute("type", "text");
    const hidePasswordBtn = screen.getByLabelText("Ocultar senha");
    fireEvent.click(hidePasswordBtn);
    expect(passwordInput).toHaveAttribute("type", "password");

    // Fill form and submit
    fireEvent.change(emailInput, { target: { value: "medico@revalida.com.br" } });
    fireEvent.change(passwordInput, { target: { value: "senhaSegura123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith("medico@revalida.com.br", "senhaSegura123");
      expect(mockSetActiveTab).toHaveBeenCalledWith("home");
    });
  });

  it("should trigger Google Sign-In and handle errors gracefully in LOGIN state", async () => {
    mockSignInWithGoogle.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: /Já tenho uma conta/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar com Google/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Falha de comunicação com os servidores. Verifique sua conexão com a internet.")
      ).toBeInTheDocument();
    });
  });

  it("should return to Entry screen when clicking 'Voltar' from LOGIN", () => {
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: /Já tenho uma conta/i }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo de volta.");

    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo à StaziaMed.");
  });

  /* ------------------------------------------------------------- */
  /* 3. SIGNUP FLOW (Criar uma nova conta)                         */
  /* ------------------------------------------------------------- */
  it("should navigate to SIGNUP flow, validate password match, create user and navigate directly to home", async () => {
    mockSignUpWithEmail.mockResolvedValueOnce({ uid: "user_signup_1" });
    renderLoginView();

    // Click "Criar uma nova conta"
    fireEvent.click(screen.getByRole("button", { name: /Criar uma nova conta/i }));

    // Headline
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pronto para começar sua preparação?");
    expect(screen.getByText("Crie sua conta e organize seus estudos para o Revalida.")).toBeInTheDocument();

    // Fields
    const nameInput = screen.getByPlaceholderText("Dr(a). Seu Nome");
    const emailInput = screen.getByPlaceholderText("seu@email.com.br");
    const passInput = screen.getByPlaceholderText("Crie uma senha (mín. 6 caracteres)");
    const confirmInput = screen.getByPlaceholderText("Confirme sua senha");

    expect(nameInput).toHaveAttribute("autocomplete", "name");
    expect(emailInput).toHaveAttribute("autocomplete", "email");
    expect(passInput).toHaveAttribute("autocomplete", "new-password");
    expect(confirmInput).toHaveAttribute("autocomplete", "new-password");

    // 1. Password mismatch validation
    fireEvent.change(nameInput, { target: { value: "Dr. Carlos" } });
    fireEvent.change(emailInput, { target: { value: "carlos@medicina.com" } });
    fireEvent.change(passInput, { target: { value: "123456" } });
    fireEvent.change(confirmInput, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar minha conta/i }));

    expect(screen.getByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();

    // 2. Fix password and submit
    fireEvent.change(confirmInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar minha conta/i }));

    await waitFor(() => {
      expect(mockSignUpWithEmail).toHaveBeenCalledWith("carlos@medicina.com", "123456", "Dr. Carlos");
      expect(mockSetActiveTab).toHaveBeenCalledWith("home");
    });
  });

  it("should trigger Google Sign-In in SIGNUP state and route to home on success", async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({ uid: "user_google_signup" });
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: /Criar uma nova conta/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar com Google/i }));

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
      expect(mockSetActiveTab).toHaveBeenCalledWith("home");
    });
  });

  /* ------------------------------------------------------------- */
  /* 4. FORGOT PASSWORD (Recuperação de Senha)                     */
  /* ------------------------------------------------------------- */
  it("should navigate to FORGOT_PASSWORD and show neutral confirmation message", async () => {
    mockSendPasswordReset.mockResolvedValueOnce(undefined);
    renderLoginView();

    // Go to Login, then Forgot Password
    fireEvent.click(screen.getByRole("button", { name: /Já tenho uma conta/i }));
    fireEvent.click(screen.getByText("Esqueci minha senha"));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Recuperar senha");

    const emailInput = screen.getByPlaceholderText("seu@email.com.br");
    fireEvent.change(emailInput, { target: { value: "esqueci@medicina.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar instruções/i }));

    await waitFor(() => {
      expect(mockSendPasswordReset).toHaveBeenCalledWith("esqueci@medicina.com");
      // Neutral message preventing email enumeration
      expect(
        screen.getByText("Se houver uma conta vinculada a este e-mail, enviaremos as instruções de recuperação.")
      ).toBeInTheDocument();
    });
  });

  /* ------------------------------------------------------------- */
  /* 5. GUEST MODE                                                 */
  /* ------------------------------------------------------------- */
  it("should allow entering guest mode from Entry screen", () => {
    renderLoginView();

    const guestBtn = screen.getByRole("button", { name: /Explorar como visitante/i });
    fireEvent.click(guestBtn);

    expect(mockEnterGuestMode).toHaveBeenCalledTimes(1);
    expect(mockSetActiveTab).toHaveBeenCalledWith("home");
  });

  /* ------------------------------------------------------------- */
  /* 6. PLAN SELECTION VIEW (Standalone / Prototype)              */
  /* ------------------------------------------------------------- */
  it("should render PlanSelectionView with headline and allow continuing to preparation", () => {
    render(
      <MemoryRouter initialEntries={["/auth/select-plan"]}>
        <PlanSelectionView />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Escolha como quer começar.");
    expect(
      screen.getByText("Selecione o plano que melhor combina com sua preparação para o Revalida.")
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Começar preparação/i });
    expect(confirmBtn).toBeInTheDocument();

    fireEvent.click(confirmBtn);
    expect(mockSetActiveTab).toHaveBeenCalledWith("home");
  });

  /* ------------------------------------------------------------- */
  /* 7. SECURITY & LIGHT-ONLY THEME                                */
  /* ------------------------------------------------------------- */
  it("should NOT render dark mode toggle in the auth screen and not contain Apple or QR code buttons", () => {
    renderLoginView();

    expect(screen.queryByRole("button", { name: /Alternar tema visual/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Apple/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/QR Code/i)).not.toBeInTheDocument();
  });
});
