/**
 * Recuperar senha (src/novo/app/AuthScreens.jsx): mesmo visual do login e do cadastro ("Acesso seguro REVALIDA"),
 * com a mesma resposta neutra de antes (não revela se o e-mail tem conta).
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

describe("Recuperar senha no visual do login", () => {
  it("usa o cartão, o título, o rodapé e as classes do login (não o layout antigo)", () => {
    open();
    expect(document.querySelector(".lg-root")).toBeTruthy();
    expect(document.querySelector(".lg-card.lg-auth-card")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Acesso seguro");
    expect(screen.getByRole("region", { name: "Recuperar senha" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recuperar senha" })).toBeTruthy();
    expect(screen.getByLabelText("E-mail cadastrado").className).toContain("lg-input");
    expect(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }).className).toContain("lg-btn-primary");
    expect(screen.getByText("© 2026 StaziaMed Revalida")).toBeTruthy();
    expect(document.querySelector(".sm-card")).toBeNull();
  });

  it("e-mail inválido mostra o erro no campo e não envia", () => {
    open();
    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: "sem-arroba" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }));
    expect(screen.getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(screen.getByLabelText("E-mail cadastrado").getAttribute("aria-invalid")).toBe("true");
    expect(backend.resetPassword).not.toHaveBeenCalled();
  });

  it("e-mail válido envia e mostra a resposta neutra, mesmo se o envio falhar", async () => {
    backend.resetPassword.mockRejectedValue(new Error("falhou"));
    open();
    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: "ana@teste.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIAR INSTRUÇÕES" }));
    await waitFor(() => expect(backend.resetPassword).toHaveBeenCalledWith("ana@teste.dev"));
    expect(await screen.findByText(/Se houver uma conta com este e-mail, as instruções chegam em instantes/)).toBeTruthy();
  });

  it("os dois caminhos de volta levam ao login", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para o login" }));
    expect(screen.queryByRole("region", { name: "Recuperar senha" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /esqueci minha senha/i }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.queryByRole("region", { name: "Recuperar senha" })).toBeNull();
    expect(screen.getByRole("button", { name: /esqueci minha senha/i })).toBeTruthy();
  });

  it("o cadastro continua igual (título e painel 'Já tem conta?')", () => {
    render(<AuthFlow />);
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    expect(screen.getByRole("region", { name: "Criar conta" })).toBeTruthy();
    expect(screen.getByText("Já tem conta?")).toBeTruthy();
  });
});
