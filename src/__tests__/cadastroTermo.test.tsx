/**
 * Cadastro (src/novo/app/AuthScreens.jsx): WhatsApp, conferir senha e aceite obrigatório do Termo, também no Google.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { signUp: vi.fn(), signInWithGoogle: vi.fn(), signIn: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => ({ backend }) }));

import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { takeGoogleAcceptance } from "../novo/app/legal/googleAcceptance.js";

const FRASE = "Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições.";
const ACEITE = "Para criar a conta, é preciso aceitar o Termo de Aceite e Uso e a Política de Privacidade.";

const open = () => {
  render(<AuthFlow />);
  fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillAll = (over: Record<string, string> = {}) => {
  type("Nome completo", over.name ?? "Ana Lima");
  type("E-mail", over.email ?? "ana@teste.dev");
  type("WhatsApp", over.phone ?? "(41) 99999-8888");
  type("Senha", over.pw ?? "senha-segura");
  type("Conferir senha", over.pw2 ?? "senha-segura");
};
const submitBtn = () => screen.getByRole("button", { name: /^CRIAR CONTA/ });

beforeEach(() => {
  backend.signUp.mockReset();
  backend.signInWithGoogle.mockReset();
  backend.signUp.mockResolvedValue({});
  backend.signInWithGoogle.mockResolvedValue(undefined);
  localStorage.clear();
});
afterEach(cleanup);

describe("Cadastro com Termo", () => {
  it("mostra os campos na ordem e a frase do §33, sem a frase passiva", () => {
    open();
    const labels = ["Nome completo", "E-mail", "WhatsApp", "Senha", "Conferir senha", FRASE].map((l) => screen.getByLabelText(l));
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1].compareDocumentPosition(labels[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect((labels[5] as HTMLInputElement).type).toBe("checkbox");
    expect(document.body.textContent).not.toContain("Ao continuar, você concorda");
    expect(screen.getByRole("button", { name: "Criar conta com Google" })).toBeTruthy();
  });

  it("cada erro aparece no próprio campo e nada é enviado", () => {
    open();
    fillAll({ phone: "999998888", pw2: "outra-senha" });
    fireEvent.click(submitBtn());
    expect(screen.getByText("As senhas não são iguais.")).toBeTruthy();
    expect(screen.getByText("Informe o WhatsApp com DDD.")).toBeTruthy();
    expect(screen.getByText(ACEITE)).toBeTruthy();
    expect(backend.signUp).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Conferir senha").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("WhatsApp").getAttribute("aria-invalid")).toBe("true");
  });

  it("em Outro, número preenchido e código vazio mostra o erro na caixa do código", () => {
    open();
    fireEvent.change(screen.getByLabelText("País do WhatsApp"), { target: { value: "outro" } });
    fillAll({ phone: "7911123456" });
    fireEvent.click(screen.getByLabelText(FRASE));
    fireEvent.click(submitBtn());
    expect(screen.getByLabelText("Código do país").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Informe o WhatsApp com código do país.")).toBeTruthy();
    expect(backend.signUp).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Código do país"), { target: { value: "+44" } });
    fireEvent.click(submitBtn());
    return waitFor(() => expect(backend.signUp.mock.calls[0][3].phone).toBe("+447911123456"));
  });

  it("tudo certo: signUp com WhatsApp normalizado, versão 1.0 e navegador", async () => {
    open();
    fillAll();
    fireEvent.click(screen.getByLabelText(FRASE));
    fireEvent.click(submitBtn());
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0]).toEqual(["Ana Lima", "ana@teste.dev", "senha-segura", { phone: "+5541999998888", termsVersion: "1.0", userAgent: expect.any(String) }]);
  });

  it("Google só com a caixa marcada e guarda o aceite por 30 min", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    expect(screen.getByText(ACEITE)).toBeTruthy();
    expect(backend.signInWithGoogle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(FRASE));
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(JSON.parse(localStorage.getItem("smn-aceite-google")!).version).toBe("1.0");
    expect(takeGoogleAcceptance("1.0")).toBe(true);
    expect(localStorage.getItem("smn-aceite-google")).toBeNull();
  });

  it("o link do termo abre a janela e o que foi digitado continua", () => {
    open();
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Termos de Aceite e Uso" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // fora do cartão com backdrop-filter, direto no body: o "fixed" vale para a tela toda
    const overlay = screen.getByRole("dialog").parentElement!;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.closest(".lg-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe("Ana Lima");
    expect((screen.getByLabelText("Conferir senha") as HTMLInputElement).value).toBe("senha-segura");
    expect((screen.getByLabelText("WhatsApp") as HTMLInputElement).value).toBe("(41) 99999-8888");
    fireEvent.click(screen.getByRole("button", { name: "Política de Privacidade" }));
    expect(screen.getByRole("dialog", { name: "Política de Privacidade" })).toBeTruthy();
  });

  it("o foco vai para o primeiro campo com erro", () => {
    open();
    fillAll({ name: "", pw2: "x" });
    fireEvent.click(submitBtn());
    expect(document.activeElement).toBe(screen.getByLabelText("Nome completo"));
  });
});

describe("googleAcceptance", () => {
  it("recusa registro velho, de outra versão ou quebrado, e sempre apaga", () => {
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "1.0", at: Date.now() - 31 * 60 * 1000 }));
    expect(takeGoogleAcceptance("1.0")).toBe(false);
    expect(localStorage.getItem("smn-aceite-google")).toBeNull();
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "0.9", at: Date.now() }));
    expect(takeGoogleAcceptance("1.0")).toBe(false);
    localStorage.setItem("smn-aceite-google", "{lixo");
    expect(takeGoogleAcceptance("1.0")).toBe(false);
    expect(takeGoogleAcceptance("1.0")).toBe(false);
  });
});
