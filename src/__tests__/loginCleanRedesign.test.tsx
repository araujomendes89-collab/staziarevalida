import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginView } from "../components/auth/LoginView";
import { PlanSelectionView } from "../components/auth/PlanSelectionView";
import * as AppContextModule from "../context/AppContext";

const { mockSetAuthRememberMe } = vi.hoisted(() => ({
  mockSetAuthRememberMe: vi.fn(),
}));

vi.mock("../lib/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/firebase")>()),
  setAuthRememberMe: mockSetAuthRememberMe,
}));

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

// Login e cadastro ficam montados ao mesmo tempo (como no STEA Code Drop #002);
// a seção inativa recebe aria-hidden, então as consultas usam a região visível.
const loginRegion = () => screen.getByRole("region", { name: "Entrar" });
const registerRegion = () => screen.getByRole("region", { name: "Criar conta" });

describe("1.25A — Clean Auth Entry + Login + Signup Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetAuthRememberMe.mockResolvedValue(undefined);
    vi.spyOn(AppContextModule, "useApp").mockReturnValue(defaultContextValues);
  });

  /* ------------------------------------------------------------- */
  /* 1. INITIAL SCREEN (dual panel, opens on LOGIN)                */
  /* ------------------------------------------------------------- */
  it("should open on LOGIN with the side panel offering signup and the legal links", () => {
    renderLoginView();

    // Only the active form is exposed to assistive tech
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo de volta");
    expect(within(loginRegion()).getByText("Entre para continuar na sua conta.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Criar conta" })).not.toBeInTheDocument();

    // Side panel (hero) offers signup
    expect(screen.getByRole("heading", { level: 2, name: "Olá!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastre-se" })).toBeInTheDocument();

    // Guest mode / visitor link is removed
    expect(screen.queryByRole("button", { name: /Explorar como visitante/i })).not.toBeInTheDocument();

    // Legal links
    expect(screen.getByRole("button", { name: /Termos de Uso/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Política de Privacidade/i })).toBeInTheDocument();
  });

  /* ------------------------------------------------------------- */
  /* 2. LOGIN FLOW                                                 */
  /* ------------------------------------------------------------- */
  it("should render Google and Email/Password fields in LOGIN, and support login", async () => {
    mockSignInWithEmail.mockResolvedValueOnce({ uid: "user_login_1" });
    renderLoginView();
    const login = within(loginRegion());

    // Google button
    expect(screen.getByRole("button", { name: /Continuar com Google/i })).toBeInTheDocument();

    // Form inputs with proper autocomplete attributes
    const emailInput = login.getByLabelText("E-mail");
    const passwordInput = login.getByLabelText("Senha");
    expect(emailInput).toHaveAttribute("autocomplete", "email");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

    // Toggle password visibility
    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(login.getByLabelText("Exibir senha"));
    expect(passwordInput).toHaveAttribute("type", "text");
    fireEvent.click(login.getByLabelText("Ocultar senha"));
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

  it("should show field errors and not call Firebase when LOGIN is submitted empty", () => {
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    expect(within(loginRegion()).getByText("Informe seu endereço de e-mail.")).toBeInTheDocument();
    expect(within(loginRegion()).getByText("Informe sua senha de acesso.")).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it("should trigger Google Sign-In and handle errors gracefully in LOGIN state", async () => {
    mockSignInWithGoogle.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: /Continuar com Google/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Falha de comunicação com os servidores. Verifique sua conexão com a internet."
      );
    });
  });

  it("should apply 'Lembrar de mim' as session-only persistence when unchecked", async () => {
    mockSignInWithEmail.mockResolvedValueOnce({ uid: "user_login_2" });
    renderLoginView();

    const remember = screen.getByRole("checkbox", { name: "Lembrar de mim" });
    expect(remember).toBeChecked();
    expect(mockSetAuthRememberMe).not.toHaveBeenCalled();

    fireEvent.click(remember);
    expect(mockSetAuthRememberMe).toHaveBeenLastCalledWith(false);

    const login = within(loginRegion());
    fireEvent.change(login.getByLabelText("E-mail"), { target: { value: "medico@revalida.com.br" } });
    fireEvent.change(login.getByLabelText("Senha"), { target: { value: "senhaSegura123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith("medico@revalida.com.br", "senhaSegura123");
    });

    // Signup always keeps the persistent session
    fireEvent.click(screen.getByRole("button", { name: "Cadastre-se" }));
    expect(mockSetAuthRememberMe).toHaveBeenLastCalledWith(true);
  });

  it("should switch between LOGIN and SIGNUP using the side panel buttons", () => {
    renderLoginView();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo de volta");

    fireEvent.click(screen.getByRole("button", { name: "Cadastre-se" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Criar conta");
    expect(screen.queryByRole("region", { name: "Entrar" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo de volta");
  });

  /* ------------------------------------------------------------- */
  /* 3. SIGNUP FLOW                                                */
  /* ------------------------------------------------------------- */
  it("should validate password length in SIGNUP, create user and navigate directly to home", async () => {
    mockSignUpWithEmail.mockResolvedValueOnce({ uid: "user_signup_1" });
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: "Cadastre-se" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Criar conta");
    const register = within(registerRegion());
    expect(register.getByText("Crie sua conta e comece sua jornada.")).toBeInTheDocument();

    // Fields (same three as the STEA model: name, e-mail, password)
    const nameInput = register.getByLabelText("Nome completo");
    const emailInput = register.getByLabelText("E-mail");
    const passInput = register.getByLabelText("Senha");
    expect(register.queryByLabelText("Confirmar senha")).not.toBeInTheDocument();

    expect(nameInput).toHaveAttribute("autocomplete", "name");
    expect(emailInput).toHaveAttribute("autocomplete", "email");
    expect(passInput).toHaveAttribute("autocomplete", "new-password");

    // 1. Short password validation
    fireEvent.change(nameInput, { target: { value: "Dr. Carlos" } });
    fireEvent.change(emailInput, { target: { value: "carlos@medicina.com" } });
    fireEvent.change(passInput, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(register.getByText("A senha deve conter no mínimo 6 caracteres.")).toBeInTheDocument();
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();

    // 2. Fix password and submit
    fireEvent.change(passInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(mockSignUpWithEmail).toHaveBeenCalledWith("carlos@medicina.com", "123456", "Dr. Carlos");
      expect(mockSetActiveTab).toHaveBeenCalledWith("home");
    });
  });

  it("should trigger Google Sign-In in SIGNUP state and route to home on success", async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({ uid: "user_google_signup" });
    renderLoginView();

    fireEvent.click(screen.getByRole("button", { name: "Cadastre-se" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Esqueceu a senha?" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Recuperar senha");

    const forgot = within(screen.getByRole("region", { name: "Recuperar senha" }));
    fireEvent.change(forgot.getByLabelText("E-mail cadastrado"), { target: { value: "esqueci@medicina.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar instruções/i }));

    await waitFor(() => {
      expect(mockSendPasswordReset).toHaveBeenCalledWith("esqueci@medicina.com");
      // Neutral message preventing email enumeration
      expect(
        forgot.getByText("Se houver uma conta vinculada a este e-mail, enviaremos as instruções de recuperação.")
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Voltar para o login" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bem-vindo de volta");
  });

  /* ------------------------------------------------------------- */
  /* 5. GUEST MODE REMOVED                                         */
  /* ------------------------------------------------------------- */
  it("should not render visitor/guest mode button from Entry screen", () => {
    renderLoginView();

    const guestBtn = screen.queryByRole("button", { name: /Explorar como visitante/i });
    expect(guestBtn).not.toBeInTheDocument();
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
