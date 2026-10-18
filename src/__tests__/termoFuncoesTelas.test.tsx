/**
 * Telas do ramo termo-funcoes (Contrato 3.0):
 *   - Criar conta: "Mínimo de 8 caracteres." ao sair da Senha e "As senhas não são iguais." enquanto a pessoa digita o Conferir senha
 *     (depois de sair do campo ou quando o tamanho já bate), sem atrapalhar quem está digitando certo;
 *   - marketing FORA do cadastro (decisão do dono, 17/10): pergunta do onboarding (MarketingPergunta) e chave em Minha Conta;
 *   - Ajuda: telefone/WhatsApp e horário do contrato, e o e-mail de privacidade;
 *   - link do e-mail (?secao=docs) abre Minha Conta → Documentos.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state: { session: any } = { session: null };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), useSession: () => state.session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));
vi.mock("../novo/data", async (importOriginal) => {
  const actual: any = await importOriginal();
  const semFuncao = async () => {
    throw new Error("Could not find the function public.app_legal_current without parameters in the schema cache");
  };
  return { ...actual, getBackend: async () => ({ rpc: semFuncao }) };
});

import { AuthFlow, avisosDasSenhas } from "../novo/app/AuthScreens.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { MARKETING_EXPLICACAO, MARKETING_PERGUNTA, MARKETING_TEXTO_GUARDADO, MarketingPergunta } from "../novo/app/account/MarketingPergunta.jsx";
import { PRIVACY_EMAIL, SUPPORT_HOURS, SUPPORT_PHONE } from "../novo/app/support/supportContact.jsx";

const FRASE = "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais.";
const CURTA = "Mínimo de 8 caracteres.";
const DIFERENTE = "As senhas não são iguais.";

const backend: any = { signUp: vi.fn(), signInWithGoogle: vi.fn(), signIn: vi.fn(), rpc: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };

beforeEach(() => {
  backend.signUp.mockReset().mockResolvedValue({});
  backend.signInWithGoogle.mockReset().mockResolvedValue(undefined);
  backend.rpc.mockReset().mockResolvedValue(null);
  state.session = { backend };
  localStorage.clear();
  window.scrollTo = vi.fn() as any;
});
afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

const abrirCadastro = () => {
  render(<AuthFlow />);
  fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
};
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;
const digitar = (rotulo: string, value: string) => fireEvent.change(campo(rotulo), { target: { value } });
const erroDe = (rotulo: string) => {
  const id = campo(rotulo).id;
  return document.getElementById(`${id}-error`)?.textContent ?? null;
};

describe("Criar conta: avisos das senhas enquanto a pessoa preenche", () => {
  it("regra (avisosDasSenhas)", () => {
    const r = (prev: any, pw: string, pw2: string, evento: any, visto2 = false) => avisosDasSenhas(prev, { pw, pw2, evento, visto2 });
    expect(r({}, "abc", "", "pw-change")).toEqual({ pw: undefined, pw2: undefined }); // digitando: nada
    expect(r({}, "abc", "", "pw-blur")).toEqual({ pw: CURTA, pw2: undefined });
    expect(r({}, "", "", "pw-blur")).toEqual({ pw: undefined, pw2: undefined }); // vazio: só no envio
    expect(r({ pw: CURTA }, "abcdefgh", "", "pw-change").pw).toBeUndefined(); // some ao chegar a 8
    expect(r({}, "senha-segura", "senha", "pw2-change").pw2).toBeUndefined(); // digitando certo
    expect(r({}, "senha-segura", "senhx", "pw2-change").pw2).toBeUndefined(); // errado, mas ainda curto e sem ter saído
    expect(r({}, "senha-segura", "senha-segurx", "pw2-change").pw2).toBe(DIFERENTE); // o tamanho bate
    expect(r({}, "senha-segura", "senhx", "pw2-change", true).pw2).toBe(DIFERENTE); // já saiu do campo: o começo não confere
    expect(r({}, "senha-segura", "senha", "pw2-change", true).pw2).toBeUndefined(); // já saiu, mas o começo confere
    expect(r({}, "senha-segura", "senha", "pw2-blur").pw2).toBe(DIFERENTE);
    expect(r({ pw2: DIFERENTE }, "senha-segura", "senha-segura", "pw2-change").pw2).toBeUndefined();
    // mudou a Senha depois: confere de novo
    expect(r({}, "senha-nova-1", "senha-segura", "pw-change").pw2).toBe(DIFERENTE);
  });

  it("'Mínimo de 8 caracteres.' ao sair da Senha; some ao completar", () => {
    abrirCadastro();
    digitar("Senha", "abc");
    expect(erroDe("Senha")).toBeNull();
    fireEvent.blur(campo("Senha"));
    expect(erroDe("Senha")).toBe(CURTA);
    expect(campo("Senha").getAttribute("aria-invalid")).toBe("true");
    digitar("Senha", "abcdefgh");
    expect(erroDe("Senha")).toBeNull();
  });

  it("'As senhas não são iguais.' quando o tamanho bate ou ao sair do campo; some quando ficam iguais", () => {
    abrirCadastro();
    digitar("Senha", "senha-segura");
    fireEvent.blur(campo("Senha"));
    digitar("Conferir senha", "senha-seg");
    expect(erroDe("Conferir senha")).toBeNull();
    digitar("Conferir senha", "senha-segurx");
    expect(erroDe("Conferir senha")).toBe(DIFERENTE);
    digitar("Conferir senha", "senha-segura");
    expect(erroDe("Conferir senha")).toBeNull();
    digitar("Conferir senha", "outra");
    expect(erroDe("Conferir senha")).toBeNull();
    fireEvent.blur(campo("Conferir senha"));
    expect(erroDe("Conferir senha")).toBe(DIFERENTE);
    // mesmo visual do aviso do envio
    expect(document.getElementById(`${campo("Conferir senha").id}-error`)?.className).toBe("rc-field-error");
  });

  it("o envio continua conferindo tudo", () => {
    abrirCadastro();
    digitar("Nome completo", "Ana Lima");
    digitar("E-mail", "ana@teste.dev");
    digitar("Senha", "senha-segura");
    fireEvent.click(campo(FRASE));
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    expect(erroDe("Conferir senha")).toBe(DIFERENTE);
    expect(backend.signUp).not.toHaveBeenCalled();
  });
});

describe("Marketing fora do cadastro (decisão do dono, 17/10)", () => {
  it("Criar conta tem só a caixa do aceite; nada de marketing no cadastro nem no Google", async () => {
    abrirCadastro();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/novidades e ofertas/i);
    digitar("Nome completo", "Ana Lima");
    digitar("E-mail", "ana@teste.dev");
    digitar("Senha", "senha-segura");
    digitar("Conferir senha", "senha-segura");
    fireEvent.click(campo(FRASE));
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0][3]).not.toHaveProperty("marketing");
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(JSON.parse(localStorage.getItem("smn-aceite-google")!)).not.toHaveProperty("marketing");
  });
});

describe("Pergunta de marketing do onboarding (MarketingPergunta)", () => {
  const abrir = () => {
    const onRespondido = vi.fn();
    state.session = { backend };
    render(<MarketingPergunta onRespondido={onRespondido} />);
    return onRespondido;
  };

  it("mostra a pergunta, o texto e os dois botões; nada marcado", () => {
    abrir();
    expect(screen.getByRole("heading", { name: MARKETING_PERGUNTA })).toBeTruthy();
    expect(screen.getByText(MARKETING_EXPLICACAO)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sim, quero receber" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(MARKETING_TEXTO_GUARDADO).toBe(`${MARKETING_PERGUNTA} ${MARKETING_EXPLICACAO} Resposta: Sim, quero receber.`);
  });

  it("\"Sim, quero receber\" grava com a origem onboarding e segue", async () => {
    backend.rpc.mockResolvedValue({ opt_in: true });
    const onRespondido = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Sim, quero receber" }));
    await waitFor(() => expect(onRespondido).toHaveBeenCalledWith({ opt_in: true }));
    expect(backend.rpc).toHaveBeenCalledWith("app_marketing_set", { p_opt_in: true, p_origin: "onboarding" });
  });

  it("\"Agora não\" não grava nada", () => {
    const onRespondido = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(onRespondido).toHaveBeenCalledWith({ opt_in: false });
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it("falha do banco: avisa e deixa tentar de novo; banco sem a função: segue sem gravar", async () => {
    backend.rpc.mockRejectedValueOnce(new Error("falha de rede"));
    const onRespondido = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Sim, quero receber" }));
    expect(await screen.findByText(/Não foi possível salvar sua escolha agora/)).toBeTruthy();
    expect(onRespondido).not.toHaveBeenCalled();
    cleanup();
    backend.rpc.mockRejectedValueOnce(new Error("Could not find the function public.app_marketing_set(p_opt_in, p_origin) in the schema cache"));
    const r2 = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Sim, quero receber" }));
    await waitFor(() => expect(r2).toHaveBeenCalledWith({ opt_in: false }));
  });
});

const boot = {
  role: "student",
  profile: { name: "Pessoa", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light", phone: null },
  subscription: null,
  legal: { termo_uso: { current: "3.0", accepted: "3.0", accepted_at: "2026-10-17T17:05:00Z" }, tutor_ia: { current: "2.0" }, gate_required: false },
};
const abrirConta = (rpc: (fn: string, args?: any) => any) => {
  backend.rpc.mockImplementation(async (fn: string, args?: any) => rpc(fn, args));
  state.session = { boot, user: { email: "pessoa@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() };
  render(<AccountScreen go={vi.fn()} />);
};

describe("Minha Conta: chave de marketing, Ajuda e link de Documentos", () => {
  it("Privacidade e dados: a chave começa como o banco diz e liga/desliga", async () => {
    let atual = { opt_in: false, updated_at: null as string | null, origin: null as string | null };
    abrirConta((fn, args) => {
      if (fn === "app_marketing_get") return atual;
      if (fn === "app_marketing_set") return (atual = { opt_in: args.p_opt_in, updated_at: "2026-10-17T18:00:00Z", origin: "minha_conta" });
      return null;
    });
    fireEvent.click(screen.getByRole("button", { name: /Privacidade e dados/ }));
    const chave = (await screen.findByRole("switch", { name: /Novidades e ofertas por e-mail/ })) as HTMLInputElement;
    await waitFor(() => expect(chave.disabled).toBe(false));
    expect(chave.checked).toBe(false);
    fireEvent.click(chave);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_marketing_set", { p_opt_in: true, p_origin: "minha_conta" }));
    await waitFor(() => expect(chave.checked).toBe(true));
    expect(screen.getByText("Ligado em 17/10/2026 às 15:00.")).toBeTruthy();
    fireEvent.click(chave);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_marketing_set", { p_opt_in: false, p_origin: "minha_conta" }));
    await waitFor(() => expect(chave.checked).toBe(false));
  });

  it("banco sem a função: a chave não aparece (nada é prometido sem poder guardar)", async () => {
    abrirConta(async (fn) => {
      if (fn === "app_marketing_get") throw new Error("Could not find the function public.app_marketing_get without parameters in the schema cache");
      return null;
    });
    fireEvent.click(screen.getByRole("button", { name: /Privacidade e dados/ }));
    await act(async () => {});
    expect(screen.queryByRole("switch", { name: /Novidades e ofertas/ })).toBeNull();
  });

  it("Ajuda: telefone/WhatsApp e horário do contrato, e o e-mail de privacidade", () => {
    abrirConta(() => null);
    fireEvent.click(screen.getByRole("button", { name: /Ajuda e suporte/ }));
    expect(screen.getByRole("link", { name: SUPPORT_PHONE }).getAttribute("href")).toBe("tel:+5541999031074");
    expect(screen.getByRole("link", { name: "Abrir no WhatsApp" }).getAttribute("href")).toBe("https://wa.me/5541999031074");
    expect(screen.getByText(`${SUPPORT_HOURS}.`)).toBeTruthy();
    expect(screen.getByRole("link", { name: PRIVACY_EMAIL }).getAttribute("href")).toBe(`mailto:${PRIVACY_EMAIL}`);
    expect(screen.getByRole("link", { name: "suporte@staziamed.com.br" })).toBeTruthy();
  });

  it("o telefone, o horário e o e-mail de privacidade são os mesmos do Contrato 3.0", () => {
    const contrato = fs.readFileSync(path.resolve(__dirname, "../novo/app/legal/textos/contrato-v3.0.md"), "utf8");
    expect(contrato).toContain(`Telefone/WhatsApp: ${SUPPORT_PHONE}, de segunda a sexta, das 9h às 18h`);
    expect(SUPPORT_HOURS.toLowerCase()).toBe("de segunda a sexta, das 9h às 18h");
    expect(contrato).toContain(`${PRIVACY_EMAIL} (dados pessoais)`);
  });

  it("?secao=docs (link do e-mail da cópia do contrato) abre Documentos", async () => {
    window.history.pushState({}, "", "/novo/perfil?secao=docs");
    abrirConta((fn) => (fn === "app_my_legal_documents" ? [] : null));
    expect(await screen.findByText("Nenhum aceite registrado nesta conta.")).toBeTruthy();
  });
});
