/**
 * Cadastro (src/novo/app/AuthScreens.jsx): conferir senha e aceite obrigatório do Termo, também no Google. Sem WhatsApp desde
 * 17/10/2026 (decisão do dono; migração …13660_cadastro_sem_whatsapp). Visual novo (moldura de auth/RecoveryLayout.jsx).
 * Uma caixa só (17/10/2026): "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais." (ACEITE_TEXTO);
 * a maioridade vai junto (declaresAdult) e a declaração de médico(a) não existe mais (migração …13661_aceite_com_maioridade).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { signUp: vi.fn(), signInWithGoogle: vi.fn(), signIn: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => ({ backend }) }));

import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { takeGoogleAcceptance, takeGoogleAcceptanceFull } from "../novo/app/legal/googleAcceptance.js";
import { ACEITE_TEXTO } from "../novo/app/legal/documentos.js";

const FRASE = "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais.";
const ACEITE = "Para criar a conta, é preciso aceitar os Termos de Uso e a Política de Privacidade e declarar ter 18 anos ou mais.";

const open = () => {
  render(<AuthFlow />);
  fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillAll = (over: Record<string, string> = {}) => {
  type("Nome completo", over.name ?? "Ana Lima");
  type("E-mail", over.email ?? "ana@teste.dev");
  type("Senha", over.pw ?? "senha-segura");
  type("Conferir senha", over.pw2 ?? "senha-segura");
};
/** O aceite completo do Termo 2.0: a frase do §33 e as duas declarações. */
const aceitarTudo = () => fireEvent.click(screen.getByLabelText(FRASE));
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
  it("mostra os campos na ordem e a caixa única do aceite, sem a frase passiva", () => {
    open();
    const labels = ["Nome completo", "E-mail", "Senha", "Conferir senha", FRASE].map((l) => screen.getByLabelText(l));
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1].compareDocumentPosition(labels[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect((labels[4] as HTMLInputElement).type).toBe("checkbox");
    // sem WhatsApp (decisão do dono, 17/10/2026)
    expect(screen.queryByLabelText("WhatsApp")).toBeNull();
    expect(screen.queryByLabelText("País do WhatsApp")).toBeNull();
    // visual novo: selo, título e o caminho de volta para o login dentro do cartão
    expect(screen.getByText("Acesso seguro · Revalida", { exact: false })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Criar conta" })).toBeTruthy();
    expect(document.querySelector(".rc-root .ln-card")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Ao continuar, você concorda");
    expect(screen.getByRole("button", { name: "Criar conta com Google" })).toBeTruthy();
  });

  it("cada erro aparece no próprio campo e nada é enviado", () => {
    open();
    fillAll({ email: "ana@teste", pw2: "outra-senha" });
    fireEvent.click(submitBtn());
    expect(screen.getByText("As senhas não são iguais.")).toBeTruthy();
    expect(screen.getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(screen.getByText(ACEITE)).toBeTruthy();
    expect(backend.signUp).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Conferir senha").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("E-mail").getAttribute("aria-invalid")).toBe("true");
    // o erro fica ligado ao campo (leitor de tela)
    expect(document.getElementById(screen.getByLabelText("Conferir senha").getAttribute("aria-describedby")!)!.textContent).toBe("As senhas não são iguais.");
    expect(document.getElementById(screen.getByLabelText(FRASE).getAttribute("aria-describedby")!)!.textContent).toBe(ACEITE);
    expect(screen.getByLabelText(FRASE).getAttribute("aria-invalid")).toBe("true");
  });

  it("e-mail que já tem conta: o aviso fica no campo E-mail, com o foco nele, e o que foi digitado continua", async () => {
    backend.signUp.mockRejectedValue(Object.assign(new Error("User already registered"), { code: "email_taken" }));
    open();
    fillAll();
    aceitarTudo();
    fireEvent.click(submitBtn());
    expect(await screen.findByText("Já existe uma conta com este e-mail.")).toBeTruthy();
    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    expect(email.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(email.value).toBe("ana@teste.dev");
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe("Ana Lima");
  });

  it("enviando: o botão mostra CRIANDO CONTA… e fica ocupado; o Google espera", async () => {
    let soltar: (v: unknown) => void = () => {};
    backend.signUp.mockReturnValue(new Promise((r) => (soltar = r)));
    open();
    fillAll();
    aceitarTudo();
    fireEvent.click(submitBtn());
    const ocupado = await screen.findByRole("button", { name: "CRIANDO CONTA…" });
    expect(ocupado.getAttribute("aria-busy")).toBe("true");
    expect((ocupado as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Criar conta com Google" }) as HTMLButtonElement).disabled).toBe(true);
    soltar({});
    await waitFor(() => expect(screen.getByRole("button", { name: "CRIAR CONTA" })).toBeTruthy());
  });

  it("falha de conexão: aviso no alto do cartão, em português", async () => {
    backend.signUp.mockRejectedValue(Object.assign(new Error("fetch failed"), { code: "network" }));
    open();
    fillAll();
    aceitarTudo();
    fireEvent.click(submitBtn());
    expect((await screen.findByRole("alert")).textContent).toContain("Falha de conexão. Verifique sua internet e tente de novo.");
  });

  it("'Voltar para o login' e 'Já tem conta? Entrar' levam ao login", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para o login" }));
    expect(screen.getByRole("button", { name: "ENTRAR" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByRole("button", { name: "ENTRAR" })).toBeTruthy();
  });

  it("uma caixa só: sem as caixas separadas de 18+ e de médico(a); o texto é o combinado e a caixa nasce desmarcada", () => {
    open();
    expect(FRASE).toBe(ACEITE_TEXTO);
    // a caixa do aceite e, separada, a de marketing (Contrato 3.0, cláusula 6.2): as duas nascem desmarcadas
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect((screen.getByLabelText(FRASE) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Quero receber novidades e ofertas por e-mail/) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/sou médico/i)).toBeNull();
    expect(screen.queryByText("Declaro que tenho 18 anos ou mais.")).toBeNull();
    // sem marcar a caixa, nada é enviado
    fillAll();
    fireEvent.click(submitBtn());
    expect(backend.signUp).not.toHaveBeenCalled();
  });

  it("tudo certo: signUp com versão 2.0, maioridade e navegador (sem telefone e sem médico)", async () => {
    open();
    fillAll();
    aceitarTudo();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0]).toEqual(["Ana Lima", "ana@teste.dev", "senha-segura",
      { termsVersion: "2.0", userAgent: expect.any(String), declaresAdult: true, marketing: false }]);
    expect(backend.signUp.mock.calls[0][3]).not.toHaveProperty("phone");
  });

  it("Google só com a caixa marcada e guarda o aceite (com a maioridade) por 30 min", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    expect(screen.getByText(ACEITE)).toBeTruthy();
    expect(backend.signInWithGoogle).not.toHaveBeenCalled();
    aceitarTudo();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(JSON.parse(localStorage.getItem("smn-aceite-google")!).version).toBe("2.0");
    expect(takeGoogleAcceptanceFull("2.0")).toEqual({ adult: true, physician: false, marketing: false });
    expect(localStorage.getItem("smn-aceite-google")).toBeNull();
  });

  it("o link do termo abre a janela e o que foi digitado continua", () => {
    open();
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Termos de Uso" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // fora do cartão com backdrop-filter, direto no body: o "fixed" vale para a tela toda
    const overlay = screen.getByRole("dialog").parentElement!;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.closest(".ln-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe("Ana Lima");
    expect((screen.getByLabelText("Conferir senha") as HTMLInputElement).value).toBe("senha-segura");
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
