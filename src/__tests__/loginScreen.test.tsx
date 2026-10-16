/**
 * Tela de login do app novo "Acesso seguro REVALIDA" (src/novo/app/auth/LoginScreen.jsx), ligada à mesma
 * autenticação de antes (backend simulado): textos oficiais, estados (normal, foco, carregando, erro e sucesso),
 * Google, "Lembrar de mim", recuperar senha, criar conta, links reais de Termos e Privacidade e senha nunca guardada
 * no navegador.
 * Novas telas (15/10/2026): a aparência nova do pacote (LoginNovo) é a padrão; a de antes fica guardada (LOGIN_VISUAL = "atual").
 * Os testes de antes rodam na aparência "atual"; os do fim conferem a nova com a MESMA lógica.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { signIn: vi.fn(), signInWithGoogle: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => ({ backend }) }));

import { LoginScreen, LOGIN_TEXT } from "../novo/app/auth/LoginScreen.jsx";
import { LOGIN_VISUAL, loginVisual } from "../novo/app/auth/loginVisual.js";

const fill = (email: string, password: string) => {
  fireEvent.input(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: password } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: /ENTRAR/ }));

beforeEach(() => {
  backend.signIn.mockReset();
  backend.signInWithGoogle.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("Login (aparência de antes): textos oficiais e links", () => {
  it("mostra os textos do pacote e os links reais de Termos de uso e Privacidade", () => {
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Acesso seguro REVALIDA");
    expect(screen.getByText("Acesse sua preparação para o Revalida.")).toBeTruthy();
    for (const [title, desc] of [["Identidade", "Informe seu e-mail"], ["Segurança", "Proteja seu acesso"], ["Acesso", "Entre para continuar"]]) {
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(desc)).toBeTruthy();
    }
    expect(document.querySelector(".lg-tagline")!.textContent!.replace(/\s+/g, " ").trim()).toBe("Foco no que cai • Memória no que fica • Confiança na prova");
    expect(screen.getByText("© 2026 StaziaMed Revalida")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Termos de uso" }).getAttribute("href")).toBe("/novo/termos");
    expect(screen.getByRole("link", { name: "Privacidade" }).getAttribute("href")).toBe("/novo/privacidade");
    expect((screen.getByRole("img", { name: "StaziaMed Revalida" }) as HTMLImageElement).getAttribute("src")).toBe("/brand/horizontal-escuro-480w.png");
    // o controle de demonstração do protótipo não entra na tela real
    expect(screen.queryByText("DEMO")).toBeNull();
  });
});

describe("Login (aparência de antes): estados", () => {
  it("foco: a etapa Identidade fica ativa e o e-mail válido ganha a marca de formato certo", () => {
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    fireEvent.focus(screen.getByLabelText("E-mail"));
    expect(screen.getByText("Identidade").closest("li")!.className).toContain("is-active");
    fireEvent.input(screen.getByLabelText("E-mail"), { target: { value: "aluno@teste.dev" } });
    expect(screen.getByRole("img", { name: "E-mail em formato válido" })).toBeTruthy();
  });

  it("carregando e sucesso: VERIFICANDO ACESSO… e depois Acesso autorizado / ACESSO AUTORIZADO", async () => {
    let finish: () => void = () => {};
    backend.signIn.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    fill("aluno@teste.dev", "senha-de-teste");
    submit();
    expect(await screen.findByText(LOGIN_TEXT.loading)).toBeTruthy();
    const button = screen.getByRole("button", { name: /VERIFICANDO…/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(backend.signIn).toHaveBeenCalledWith("aluno@teste.dev", "senha-de-teste");
    await act(async () => finish());
    expect(await screen.findByText("Acesso autorizado.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ACESSO AUTORIZADO/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Escudo desbloqueado" })).toBeTruthy();
    for (const t of ["Identidade", "Segurança", "Acesso"]) expect(screen.getByText(t).closest("li")!.className).toContain("is-done");
  });

  it("erro de credencial: Confira seu e-mail e sua senha. (com os campos marcados)", async () => {
    backend.signIn.mockRejectedValue(Object.assign(new Error("x"), { code: "invalid_credentials" }));
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    fill("aluno@teste.dev", "errada");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Confira seu e-mail e sua senha.");
    expect(screen.getByLabelText("Senha").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Senha").className).toContain("is-error");
  });

  it("outros erros mantêm a explicação de antes (ex.: falha de conexão)", async () => {
    backend.signIn.mockRejectedValue(Object.assign(new Error("x"), { code: "network" }));
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    fill("aluno@teste.dev", "qualquer");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Falha de conexão");
  });

  it("e-mail em formato inválido não chega ao backend", async () => {
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    fill("sem-arroba", "qualquer");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Informe um e-mail válido.");
    expect(backend.signIn).not.toHaveBeenCalled();
  });
});

describe("Login (aparência de antes): mesma autenticação de antes", () => {
  it("Google, recuperar senha e criar conta usam o que já existia", async () => {
    const go = vi.fn();
    render(<LoginScreen go={go} visual="atual" />);
    fireEvent.click(screen.getByRole("button", { name: /Continuar com Google/ }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(go).toHaveBeenCalledWith("forgot");
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(go).toHaveBeenCalledWith("signup");
  });

  it("'Lembrar de mim' desmarcado faz a sessão valer só com o navegador aberto; a senha nunca vai para o armazenamento", async () => {
    backend.signIn.mockResolvedValue(undefined);
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    fill("aluno@teste.dev", "senha-secreta-123");
    fireEvent.click(screen.getByLabelText("Lembrar de mim"));
    submit();
    await screen.findByText("Acesso autorizado.");
    expect(localStorage.getItem("smn-session-only")).toBe("1");
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain("senha-secreta-123");
  });

  it("mostrar/ocultar senha com rótulo acessível", () => {
    render(<LoginScreen go={vi.fn()} visual="atual" />);
    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    fireEvent.click(toggle);
    expect((screen.getByLabelText("Senha") as HTMLInputElement).type).toBe("text");
    expect(screen.getByRole("button", { name: "Ocultar senha" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Login novo (pacote Novas telas: LoginWeb, LoginTablet, LoginMobile)", () => {
  it("é o padrão deste ramo e pode voltar ao de antes pela configuração; o endereço só compara", () => {
    expect(LOGIN_VISUAL).toBe("novo");
    expect(loginVisual("")).toBe("novo");
    expect(loginVisual("?login=atual")).toBe("atual");
    expect(loginVisual("?login=qualquer")).toBe("novo");
  });

  it("mostra o selo, o título, a frase, as etapas e os links reais, sem o escudo de antes", () => {
    render(<LoginScreen go={vi.fn()} />);
    expect(screen.getByText("Acesso seguro · Revalida")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bem-vindo de volta");
    expect(document.querySelector(".ln-hero-h")!.textContent).toBe("Foco no que cai.Memória no que fica.Confiança na prova.");
    for (const [title, desc] of [["Identidade", "Informe seu e-mail"], ["Segurança", "Proteja seu acesso"], ["Acesso", "Entre para continuar"]]) {
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(desc)).toBeTruthy();
    }
    expect(screen.getByText("Identidade").closest("li")!.className).toContain("is-active"); // como no pacote, a 1ª etapa já acesa
    expect(screen.getByRole("link", { name: "Termos de uso" }).getAttribute("href")).toBe("/novo/termos");
    expect(screen.getByRole("link", { name: "Privacidade" }).getAttribute("href")).toBe("/novo/privacidade");
    expect(screen.getByRole("link", { name: "suporte@staziamed.com.br" }).getAttribute("href")).toBe("mailto:suporte@staziamed.com.br");
    expect(screen.getByLabelText("Senha").getAttribute("placeholder")).toBe("Sua senha");
    expect(screen.queryByRole("img", { name: /Escudo/ })).toBeNull();
  });

  it("mesma lógica: entra com e-mail e senha (VERIFICANDO… e ACESSO AUTORIZADO), erro de credencial e e-mail inválido", async () => {
    let finish: () => void = () => {};
    backend.signIn.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    render(<LoginScreen go={vi.fn()} />);
    fill("aluno@teste.dev", "senha-de-teste");
    submit();
    expect(await screen.findByText(LOGIN_TEXT.loading)).toBeTruthy();
    expect((screen.getByRole("button", { name: /VERIFICANDO…/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(backend.signIn).toHaveBeenCalledWith("aluno@teste.dev", "senha-de-teste");
    await act(async () => finish());
    expect(await screen.findByText("Acesso autorizado.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ACESSO AUTORIZADO/ })).toBeTruthy();
    for (const t of ["Identidade", "Segurança", "Acesso"]) expect(screen.getByText(t).closest("li")!.className).toContain("is-done");
    cleanup();

    backend.signIn.mockRejectedValue(Object.assign(new Error("x"), { code: "invalid_credentials" }));
    render(<LoginScreen go={vi.fn()} />);
    fill("aluno@teste.dev", "errada");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Confira seu e-mail e sua senha.");
    expect(screen.getByLabelText("Senha").getAttribute("aria-invalid")).toBe("true");
    cleanup();

    backend.signIn.mockReset();
    render(<LoginScreen go={vi.fn()} />);
    fill("sem-arroba", "qualquer");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Informe um e-mail válido.");
    expect(backend.signIn).not.toHaveBeenCalled();
  });

  it("Google, Esqueci minha senha e Criar conta usam o que já existia; 'Lembrar de mim' e senha fora do armazenamento", async () => {
    const go = vi.fn();
    backend.signIn.mockResolvedValue(undefined);
    render(<LoginScreen go={go} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuar com Google/ }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(go).toHaveBeenCalledWith("forgot");
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(go).toHaveBeenCalledWith("signup");
    fill("aluno@teste.dev", "senha-secreta-123");
    fireEvent.click(screen.getByLabelText("Lembrar de mim"));
    submit();
    await screen.findByText("Acesso autorizado.");
    expect(localStorage.getItem("smn-session-only")).toBe("1");
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain("senha-secreta-123");
  });

  it("mostrar/ocultar senha com rótulo acessível", () => {
    render(<LoginScreen go={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect((screen.getByLabelText("Senha") as HTMLInputElement).type).toBe("text");
    expect(screen.getByRole("button", { name: "Ocultar senha" }).getAttribute("aria-pressed")).toBe("true");
  });
});
