/**
 * Confirmação do cadastro por e-mail (Supabase com "Confirm email" ligado, 17/10/2026):
 *  - o cadastro sem sessão abre "Confirme seu e-mail" com o e-mail, reenviar (com espera) e "Usar outro e-mail";
 *  - entrar antes de confirmar mostra o aviso em português e o caminho para reenviar o link;
 *  - o link volta para /novo?confirmacao=1; vencido, abre a tela própria; válido, não é derrubado pelo "Lembrar de mim".
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const supabase = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signUp: supabase.signUp, signInWithPassword: supabase.signInWithPassword, resend: supabase.resend } }),
}));

const backend: any = {
  signUp: vi.fn(),
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  resendConfirmation: vi.fn(),
  masterSetup: { needed: vi.fn(async () => false) },
};
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => ({ backend }) }));

import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { readAuthLink } from "../novo/app/auth/authLink.js";
import { BackendError, confirmRedirect } from "../novo/data/backend";
import { createSupabaseBackend } from "../novo/data/supabaseBackend";

const FRASE = "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais.";
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function cadastrar(email = "ana@teste.dev") {
  render(<AuthFlow link={{ kind: null }} />);
  fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
  type("Nome completo", "Ana Lima");
  type("E-mail", email);
  type("Senha", "senha-segura");
  type("Conferir senha", "senha-segura");
  fireEvent.click(screen.getByLabelText(FRASE));
  fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
}

beforeEach(() => {
  for (const fn of [backend.signUp, backend.signIn, backend.resendConfirmation, supabase.signUp, supabase.signInWithPassword, supabase.resend]) fn.mockReset();
  backend.signUp.mockResolvedValue({ needsEmailConfirmation: true });
  backend.resendConfirmation.mockResolvedValue(undefined);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Supabase: cadastro, entrada e reenvio", () => {
  const sb = () => createSupabaseBackend("https://x.supabase.test", "chave-anonima", "https://app.exemplo.test/novo");

  it("o link do e-mail volta para /novo com a marca ?confirmacao=1", async () => {
    expect(confirmRedirect("https://app.exemplo.test/novo")).toBe("https://app.exemplo.test/novo?confirmacao=1");
    supabase.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: "u", identities: [{ id: "i" }] } }, error: null });
    expect(await sb().signUp("Ana", "ana@teste.dev", "senha-segura")).toEqual({ needsEmailConfirmation: true });
    expect(supabase.signUp.mock.lastCall![0].options.emailRedirectTo).toBe("https://app.exemplo.test/novo?confirmacao=1");
  });

  it("e-mail que já tem conta confirmada (conta sem identidades, sem erro) vira 'Já existe uma conta'", async () => {
    supabase.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: "falso", identities: [] } }, error: null });
    await expect(sb().signUp("Ana", "ana@teste.dev", "senha-segura")).rejects.toMatchObject({ code: "email_taken" });
  });

  it("'Email not confirmed' ao entrar vira o código email_not_confirmed", async () => {
    supabase.signInWithPassword.mockResolvedValueOnce({ error: { message: "Email not confirmed", code: "email_not_confirmed", status: 400 } });
    await expect(sb().signIn("ana@teste.dev", "senha-segura")).rejects.toMatchObject({ code: "email_not_confirmed" });
  });

  it("reenvia o e-mail de cadastro com o mesmo endereço de volta; pedido cedo demais vira rate_limited", async () => {
    supabase.resend.mockResolvedValueOnce({ error: null });
    await sb().resendConfirmation!("ana@teste.dev");
    expect(supabase.resend).toHaveBeenLastCalledWith({ type: "signup", email: "ana@teste.dev", options: { emailRedirectTo: "https://app.exemplo.test/novo?confirmacao=1" } });
    supabase.resend.mockResolvedValueOnce({ error: { message: "For security purposes, you can only request this after 42 seconds.", code: "over_email_send_rate_limit", status: 429 } });
    await expect(sb().resendConfirmation!("ana@teste.dev")).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("Tela Confirme seu e-mail depois do cadastro", () => {
  it("mostra o e-mail, as dicas e o reenviar esperando 60 s; não fica com o formulário", async () => {
    cadastrar();
    expect(await screen.findByRole("heading", { name: "Confirme seu e-mail" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Confirme seu e-mail" }).textContent).toContain("Enviamos um link para ana@teste.dev. Abra e confirme para entrar.");
    expect(screen.getByText(/ACESSO SEGURO · REVALIDA/i)).toBeTruthy();
    expect(screen.getByText(/Confira o spam/)).toBeTruthy();
    const reenviar = screen.getByRole("button", { name: /REENVIAR EM 60 s/ }) as HTMLButtonElement;
    expect(reenviar.disabled).toBe(true);
    expect(screen.queryByLabelText("Senha")).toBeNull();
    expect(backend.signUp.mock.calls[0][3]).toMatchObject({ declaresAdult: true });
    expect(backend.signUp.mock.calls[0][3]).not.toHaveProperty("phone");
  });

  it("depois da espera, reenvia para o mesmo e-mail e confirma o envio", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cadastrar();
    await screen.findByRole("heading", { name: "Confirme seu e-mail" });
    for (let i = 0; i < 61; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "REENVIAR E-MAIL" }));
    await waitFor(() => expect(backend.resendConfirmation).toHaveBeenCalledWith("ana@teste.dev"));
    expect(await screen.findByText(/Enviamos um novo link para/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /REENVIAR EM/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("'Usar outro e-mail' volta ao formulário com nome e e-mail preenchidos", async () => {
    cadastrar();
    await screen.findByRole("heading", { name: "Confirme seu e-mail" });
    fireEvent.click(screen.getByRole("button", { name: "Usar outro e-mail" }));
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe("Ana Lima");
    expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("ana@teste.dev");
    expect(screen.queryByLabelText("WhatsApp")).toBeNull();
    expect((screen.getByLabelText(FRASE) as HTMLInputElement).checked).toBe(true);
  });

  it("'Já confirmei, entrar' leva ao login", async () => {
    cadastrar();
    await screen.findByRole("heading", { name: "Confirme seu e-mail" });
    fireEvent.click(screen.getByRole("button", { name: "Já confirmei, entrar" }));
    expect(screen.getByRole("button", { name: "ENTRAR" })).toBeTruthy();
  });

  it("com a confirmação desligada (sessão na hora) não mostra a tela", async () => {
    backend.signUp.mockResolvedValue({ needsEmailConfirmation: false });
    cadastrar();
    await waitFor(() => expect(backend.signUp).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Confirme seu e-mail" })).toBeNull();
  });
});

describe("Entrar antes de confirmar", () => {
  async function entrar() {
    backend.signIn.mockRejectedValue(new BackendError("email_not_confirmed", "Email not confirmed"));
    render(<AuthFlow link={{ kind: null }} />);
    type("E-mail", "ana@teste.dev");
    type("Senha", "senha-segura");
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR" }));
    return screen.findByText(/Falta confirmar seu e-mail/);
  }

  it("mostra o aviso em português (sem marcar os campos como errados) e o botão de reenviar", async () => {
    await entrar();
    expect(screen.queryByText(/Email not confirmed/)).toBeNull();
    expect(screen.getByLabelText("Senha").getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByRole("button", { name: "Reenviar link de confirmação" })).toBeTruthy();
  });

  it("o botão abre Confirme seu e-mail com o e-mail digitado; o reenvio fica livre na hora", async () => {
    await entrar();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar link de confirmação" }));
    expect(screen.getByRole("region", { name: "Confirme seu e-mail" }).textContent).toContain("Seu e-mail ana@teste.dev ainda não foi confirmado.");
    fireEvent.click(screen.getByRole("button", { name: "REENVIAR E-MAIL" }));
    await waitFor(() => expect(backend.resendConfirmation).toHaveBeenCalledWith("ana@teste.dev"));
    expect(await screen.findByText(/Enviamos um novo link para/)).toBeTruthy();
  });

  it("pedido cedo demais mostra quantos segundos esperar", async () => {
    backend.resendConfirmation.mockRejectedValue(new BackendError("rate_limited", "For security purposes, you can only request this after 42 seconds."));
    await entrar();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar link de confirmação" }));
    fireEvent.click(screen.getByRole("button", { name: "REENVIAR E-MAIL" }));
    expect(await screen.findByText("Por segurança, espere 42 segundos antes de pedir outro e-mail.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /REENVIAR EM 42 s/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("senha errada continua com a mensagem de sempre, sem o botão de reenviar", async () => {
    backend.signIn.mockRejectedValue(new BackendError("invalid_credentials", "Invalid login credentials"));
    render(<AuthFlow link={{ kind: null }} />);
    type("E-mail", "ana@teste.dev");
    type("Senha", "errada");
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR" }));
    expect(await screen.findByText("Confira seu e-mail e sua senha.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reenviar link de confirmação" })).toBeNull();
  });
});

describe("Link do e-mail de confirmação", () => {
  const at = (hash = "", search = "") => readAuthLink({ hash, search });

  it("lê o link válido, o vencido de confirmação e mantém o de recuperar senha", () => {
    expect(at("#access_token=a&refresh_token=b&type=signup", "?confirmacao=1")).toEqual({ kind: "signup" });
    expect(at("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", "?confirmacao=1")).toEqual({ kind: "expired", signup: true });
    expect(at("#error=access_denied&error_code=otp_expired")).toEqual({ kind: "expired" });
    expect(at("#access_token=a&type=recovery")).toEqual({ kind: "recovery" });
    expect(at("", "?confirmacao=1")).toEqual({ kind: null });
  });

  it("vencido: tela própria; ENTRAR leva ao login; o novo link vai para o e-mail informado", async () => {
    render(<AuthFlow link={{ kind: "expired", signup: true }} />);
    expect(screen.getByRole("heading", { name: "Link de confirmação vencido" })).toBeTruthy();
    expect(screen.getByText("Esse link venceu ou já foi usado.")).toBeTruthy();
    type("E-mail do cadastro", "ana@teste.dev");
    fireEvent.click(screen.getByRole("button", { name: "ENVIAR NOVO LINK" }));
    await waitFor(() => expect(backend.resendConfirmation).toHaveBeenCalledWith("ana@teste.dev"));
    expect(await screen.findByText(/o novo link chega em instantes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR" }));
    expect(screen.getByRole("button", { name: "ENTRAR" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Link de confirmação vencido" })).toBeNull();
  });
});
