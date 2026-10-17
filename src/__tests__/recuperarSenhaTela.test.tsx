/**
 * Recuperar senha (src/novo/app/AuthScreens.jsx): tela nova no mesmo padrão do login que está no ar (fundo azul-marinho, logo nova,
 * cartão branco com o selo "Acesso seguro · Revalida"), com a mesma resposta neutra de antes (não revela se o e-mail tem conta).
 * O cadastro segue com o visual dele.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { signUp: vi.fn(), signInWithGoogle: vi.fn(), signIn: vi.fn(), resetPassword: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => ({ backend }) }));

import { AuthFlow } from "../novo/app/AuthScreens.jsx";

const open = () => {
  render(<AuthFlow />);
  fireEvent.click(screen.getByRole("button", { name: /esqueci minha senha/i }));
};

beforeEach(() => {
  backend.resetPassword.mockReset();
  backend.resetPassword.mockResolvedValue(undefined);
  localStorage.clear();
});
afterEach(cleanup);

describe("Recuperar senha no padrão do login novo", () => {
  it("usa a moldura do login no ar (fundo azul, logo nova, cartão com o selo), não a do cadastro", () => {
    open();
    expect(document.querySelector(".ln-root.rc-root")).toBeTruthy();
    expect(document.querySelector(".lg-root")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Recuperar senha");
    expect(screen.getByRole("region", { name: "Recuperar senha" }).className).toContain("ln-card");
    expect(screen.getByText("Acesso seguro · Revalida")).toBeTruthy();
    expect(screen.getByText("Informe seu e-mail para receber as instruções de recuperação.")).toBeTruthy();
    expect(screen.getByLabelText("E-mail cadastrado").className).toContain("ln-input");
    expect(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }).className).toContain("ln-btn--primary");
    expect(screen.getByText("© 2026 StaziaMed Revalida")).toBeTruthy();
    const logo = screen.getByAltText("StaziaMed Revalida");
    expect(logo.getAttribute("src")).toBe("/brand/horizontal-escuro-480w.png");
  });

  it("enquanto envia: botão com 'ENVIANDO…', ocupado e travado", async () => {
    let solta: () => void = () => {};
    backend.resetPassword.mockImplementation(() => new Promise<void>((r) => { solta = r; }));
    open();
    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: "ana@teste.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }));
    const ocupado = await screen.findByRole("button", { name: "ENVIANDO…" });
    expect(ocupado.getAttribute("aria-busy")).toBe("true");
    expect((ocupado as HTMLButtonElement).disabled).toBe(true);
    solta();
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("e-mail inválido mostra o erro no campo e não envia", () => {
    open();
    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: "sem-arroba" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }));
    expect(screen.getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(screen.getByLabelText("E-mail cadastrado").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("E-mail cadastrado"));
    expect(backend.resetPassword).not.toHaveBeenCalled();
  });

  it("e-mail válido envia e mostra a resposta neutra, mesmo se o envio falhar", async () => {
    backend.resetPassword.mockRejectedValue(new Error("falhou"));
    open();
    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: "ana@teste.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }));
    await waitFor(() => expect(backend.resetPassword).toHaveBeenCalledWith("ana@teste.dev"));
    expect(await screen.findByText(/Se houver uma conta com este e-mail, as instruções chegam em instantes/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Confira também o spam.");
  });

  it("os dois caminhos de volta levam ao login (link do cartão e 'Entrar' do lado azul)", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para o login" }));
    expect(screen.queryByRole("region", { name: "Recuperar senha" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /esqueci minha senha/i }));
    expect(screen.getByText("Lembrou da senha?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.queryByRole("region", { name: "Recuperar senha" })).toBeNull();
    expect(screen.getByRole("button", { name: /esqueci minha senha/i })).toBeTruthy();
  });

  it("Termos de uso e Privacidade abrem por cima, sem sair da tela", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Termos de uso" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Recuperar senha" })).toBeTruthy();
  });

  it("o cadastro usa a mesma moldura (título e painel 'Já tem conta?')", () => {
    render(<AuthFlow />);
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    expect(screen.getByRole("region", { name: "Criar conta" })).toBeTruthy();
    expect(screen.getAllByText("Já tem conta?", { exact: false }).length).toBeGreaterThan(0);
    expect(document.querySelector(".rc-root")).toBeTruthy();
    expect(document.querySelector(".lg-root")).toBeNull();
  });
});
