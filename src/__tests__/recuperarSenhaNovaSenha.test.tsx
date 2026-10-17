/**
 * B2 (prontidão da Fase 1): recuperar senha. Depois do link do e-mail a pessoa cai na tela "Criar nova senha" (nova senha + conferir,
 * mínimo de caracteres do app, mensagem de sucesso e entrada no app) usando a sessão de recuperação; link vencido ou já usado mostra
 * "Esse link venceu. Peça um novo." com botão para pedir de novo. Tudo com backend simulado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readAuthLink } from "../novo/app/auth/authLink.js";

// ---------------------------------------------------------------- leitura do endereço
describe("authLink: o que o endereço conta sobre o link do e-mail", () => {
  const at = (hash = "", search = "") => readAuthLink({ hash, search });
  it("link de recuperação válido (tokens no endereço)", () => {
    expect(at("#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery").kind).toBe("recovery");
  });
  it("link vencido ou já usado (erro no endereço, em # ou em ?)", () => {
    expect(at("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired").kind).toBe("expired");
    expect(at("", "?error=access_denied&error_code=otp_expired").kind).toBe("expired");
    expect(at("", "?error_description=Email%20link%20is%20invalid%20or%20has%20expired&error=unauthorized_client").kind).toBe("expired");
  });
  it("outros erros (ex.: quem cancela o Google) e abertura comum não são link vencido", () => {
    expect(at("#error=access_denied&error_description=The+user+cancelled").kind).toBe(null);
    expect(at("", "").kind).toBe(null);
    expect(at("#access_token=a&type=signup").kind).toBe(null);
  });
});

// ---------------------------------------------------------------- a tela, com a sessão simulada
const session: any = { backend: null, finishRecovery: vi.fn(), signOut: vi.fn() };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => session }));

import { AuthFlow, NewPasswordScreen } from "../novo/app/AuthScreens.jsx";

const typeIn = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const send = () => fireEvent.click(screen.getByRole("button", { name: "SALVAR NOVA SENHA" }));

beforeEach(() => {
  session.backend = { updatePassword: vi.fn(async () => undefined), resetPassword: vi.fn(async () => undefined), masterSetup: { needed: vi.fn(async () => false) } };
  session.finishRecovery = vi.fn();
  session.signOut = vi.fn(async () => undefined);
  localStorage.clear();
});
afterEach(cleanup);

describe("Tela Criar nova senha", () => {
  it("usa o padrão do login no ar (cartão com o selo, campos do login) e pede nova senha e conferência", () => {
    render(<NewPasswordScreen />);
    expect(document.querySelector(".ln-root.rc-root")).toBeTruthy();
    expect(document.querySelector(".lg-root")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Criar nova senha");
    expect(screen.getByRole("region", { name: "Criar nova senha" })).toBeTruthy();
    expect(screen.getByText("Acesso seguro · Revalida")).toBeTruthy();
    expect(screen.getByText("Escreva a nova senha duas vezes para confirmar.")).toBeTruthy();
    expect(screen.getByText(/Escolha uma senha que só você conheça/)).toBeTruthy();
    expect(screen.getByLabelText("Nova senha").className).toContain("ln-input");
    expect(screen.getByLabelText("Conferir nova senha")).toBeTruthy();
    expect(screen.getByText("Mínimo de 8 caracteres.")).toBeTruthy();
    expect(screen.getByLabelText("Nova senha").getAttribute("aria-describedby")).toBe("secure-pw-hint");
  });

  it("o olho mostra e esconde a senha digitada", () => {
    render(<NewPasswordScreen />);
    const campo = screen.getByLabelText("Nova senha") as HTMLInputElement;
    expect(campo.type).toBe("password");
    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar senha" })[0]);
    expect(campo.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(campo.type).toBe("password");
  });

  it("senha curta ou senhas diferentes: mostra o erro no campo e não salva", () => {
    render(<NewPasswordScreen />);
    typeIn("Nova senha", "curta");
    typeIn("Conferir nova senha", "curta");
    send();
    expect(screen.getByText("Mínimo de 8 caracteres.", { selector: ".rc-field-error" })).toBeTruthy();
    expect(screen.getByLabelText("Nova senha").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Nova senha"));
    typeIn("Nova senha", "senha-boa-123");
    typeIn("Conferir nova senha", "senha-boa-124");
    send();
    expect(screen.getByText("As senhas não são iguais.")).toBeTruthy();
    expect(session.backend.updatePassword).not.toHaveBeenCalled();
  });

  it("salva, mostra o sucesso e só então o botão abre o app", async () => {
    render(<NewPasswordScreen />);
    typeIn("Nova senha", "senha-boa-123");
    typeIn("Conferir nova senha", "senha-boa-123");
    send();
    await waitFor(() => expect(session.backend.updatePassword).toHaveBeenCalledWith("senha-boa-123"));
    expect(await screen.findByText(/Senha alterada com sucesso/)).toBeTruthy();
    expect(screen.queryByText("Escreva a nova senha duas vezes para confirmar.")).toBeNull();
    expect(screen.queryByText(/Escolha uma senha que só você conheça/)).toBeNull();
    expect(session.finishRecovery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ENTRAR NO APP" }));
    expect(session.finishRecovery).toHaveBeenCalledTimes(1);
  });

  it("erros do servidor em português: senha fraca, igual à anterior e falha de conexão", async () => {
    const cases: [string, string][] = [
      ["weak_password", "A senha precisa ter pelo menos 8 caracteres."],
      ["same_password", "Escolha uma senha diferente da anterior."],
      ["network", "Falha de conexão. Verifique sua internet e tente de novo."],
    ];
    for (const [code, text] of cases) {
      cleanup();
      session.backend.updatePassword = vi.fn(async () => { throw Object.assign(new Error("x"), { code }); });
      render(<NewPasswordScreen />);
      typeIn("Nova senha", "senha-boa-123");
      typeIn("Conferir nova senha", "senha-boa-123");
      send();
      expect((await screen.findByRole("alert")).textContent).toBe(text);
      expect(screen.queryByText(/Senha alterada/)).toBeNull();
    }
  });

  it("sessão de recuperação vencida no meio do caminho: avisa e o botão sai e pede novo link", async () => {
    session.backend.updatePassword = vi.fn(async () => { throw Object.assign(new Error("Auth session missing"), { code: "link_expired" }); });
    render(<NewPasswordScreen />);
    typeIn("Nova senha", "senha-boa-123");
    typeIn("Conferir nova senha", "senha-boa-123");
    send();
    expect((await screen.findByRole("alert")).textContent).toBe("Esse link venceu. Peça um novo.");
    fireEvent.click(screen.getByRole("button", { name: "PEDIR NOVO LINK" }));
    await waitFor(() => expect(session.finishRecovery).toHaveBeenCalled());
    expect(session.signOut).toHaveBeenCalled();
  });
});

describe("Link do e-mail vencido (entrada sem sessão)", () => {
  it("mostra 'Esse link venceu. Peça um novo.' e o botão leva ao pedido de um novo link", () => {
    render(<AuthFlow link={{ kind: "expired" }} />);
    expect(screen.getByRole("region", { name: "Link vencido" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Esse link venceu. Peça um novo.");
    fireEvent.click(screen.getByRole("button", { name: "PEDIR NOVO LINK" }));
    expect(screen.getByRole("region", { name: "Recuperar senha" })).toBeTruthy();
    expect(screen.getByLabelText("E-mail cadastrado")).toBeTruthy();
  });
  it("também dá para voltar ao login", () => {
    render(<AuthFlow link={{ kind: "expired" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar para o login" }));
    expect(screen.getByRole("button", { name: /esqueci minha senha/i })).toBeTruthy();
  });
  it("abertura comum continua no login", () => {
    render(<AuthFlow link={{ kind: null }} />);
    expect(screen.getByRole("button", { name: /esqueci minha senha/i })).toBeTruthy();
  });
});
