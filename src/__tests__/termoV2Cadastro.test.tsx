/**
 * Cadastro depois de trocar TERMO_VERSAO para "2.0" (o passo do site na ativação do Termo 2.0): as declarações de maioridade e de
 * formação em Medicina são obrigatórias, vão nos metadados da conta e no registro do Google. Texto: docs/voice-tutor/04-termo-voz.md.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../novo/app/legal/versions.js", () => ({ TERMO_VERSAO: "2.0", TUTOR_IA_VERSAO: "1.0" }));
const backend: any = { signUp: vi.fn(), signInWithGoogle: vi.fn(), signIn: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => ({ backend }) }));

import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { takeGoogleAcceptanceFull } from "../novo/app/legal/googleAcceptance.js";

const FRASE = "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais.";
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function open() {
  render(<AuthFlow />);
  fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
  type("Nome completo", "Ana Lima");
  type("E-mail", "ana@teste.dev");
  type("Senha", "senha-segura");
  type("Conferir senha", "senha-segura");
  fireEvent.click(screen.getByLabelText(FRASE));
}
const criar = () => fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));

beforeEach(() => {
  backend.signUp.mockReset().mockResolvedValue({});
  backend.signInWithGoogle.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});
afterEach(cleanup);

describe("Cadastro com o Termo 2.0 (caixa única com a maioridade, 17/10/2026)", () => {
  it("sem a caixa do aceite não cria a conta nem segue para o Google", () => {
    open();
    fireEvent.click(screen.getByLabelText(FRASE)); // desmarca
    criar();
    expect(backend.signUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    expect(backend.signInWithGoogle).not.toHaveBeenCalled();
    expect(screen.queryByText(/sou médico/i)).toBeNull();
  });

  it("com a caixa: signUp leva a versão 2.0 e a maioridade (sem a declaração de médico)", async () => {
    open();
    criar();
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0][3]).toEqual({ termsVersion: "2.0", userAgent: expect.any(String), declaresAdult: true, marketing: false });
  });

  it("Google: com a caixa, o registro guarda a maioridade para a volta", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(takeGoogleAcceptanceFull("2.0")).toEqual({ adult: true, physician: false, marketing: false });
  });
});
