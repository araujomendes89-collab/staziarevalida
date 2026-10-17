/**
 * Telas do ramo termo-funcoes (Contrato 3.0):
 *   - Criar conta: "Mínimo de 8 caracteres." ao sair da Senha e "As senhas não são iguais." enquanto a pessoa digita o Conferir senha
 *     (depois de sair do campo ou quando o tamanho já bate), sem atrapalhar quem está digitando certo;
 *   - caixa SEPARADA e desmarcada de marketing no cadastro (e-mail e Google) e a chave em Minha Conta → Privacidade e dados;
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

import { AuthFlow, avisosDasSenhas, MARKETING_TEXTO } from "../novo/app/AuthScreens.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { AcceptanceScreen } from "../novo/app/legal/AcceptanceScreen.jsx";
import { takeGoogleAcceptanceFull } from "../novo/app/legal/googleAcceptance.js";
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

describe("Caixa opcional de marketing", () => {
  it("no cadastro é SEPARADA do aceite e nasce desmarcada; sem marcar, vai marketing: false", async () => {
    abrirCadastro();
    const mkt = campo(new RegExp(MARKETING_TEXTO) as any);
    expect(mkt.checked).toBe(false);
    expect(mkt).not.toBe(campo(FRASE));
    expect(mkt.closest(".cc-consent")).toBeNull(); // fora do quadro do aceite
    digitar("Nome completo", "Ana Lima");
    digitar("E-mail", "ana@teste.dev");
    digitar("Senha", "senha-segura");
    digitar("Conferir senha", "senha-segura");
    // sem o aceite, marcar só o marketing não cria a conta
    fireEvent.click(mkt);
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    expect(backend.signUp).not.toHaveBeenCalled();
    fireEvent.click(mkt);
    fireEvent.click(campo(FRASE));
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0][3].marketing).toBe(false);
  });

  it("marcada: vai no cadastro por e-mail e fica guardada para a volta do Google", async () => {
    abrirCadastro();
    fireEvent.click(campo(new RegExp(MARKETING_TEXTO) as any));
    fireEvent.click(campo(FRASE));
    fireEvent.click(screen.getByRole("button", { name: "Criar conta com Google" }));
    await waitFor(() => expect(backend.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(takeGoogleAcceptanceFull("2.0")).toEqual({ adult: true, physician: false, marketing: true });
    digitar("Nome completo", "Ana Lima");
    digitar("E-mail", "ana@teste.dev");
    digitar("Senha", "senha-segura");
    digitar("Conferir senha", "senha-segura");
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0][3].marketing).toBe(true);
  });

  it("volta do Google: grava o marketing só DEPOIS do aceite, e só se estava marcado", async () => {
    const acceptTerms = vi.fn(async () => {});
    const legal = { termo_uso: { current: "1.0", accepted: null, accepted_at: null }, tutor_ia: { current: "1.0" }, gate_required: true, phone_missing: false };
    state.session = { backend, boot: { legal }, acceptTerms, refresh: vi.fn(), signOut: vi.fn() };
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "1.0", at: Date.now(), adult: true, marketing: true }));
    render(<AcceptanceScreen />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_marketing_set", { p_opt_in: true, p_origin: "cadastro_google" }));
    expect(acceptTerms).toHaveBeenCalledTimes(1);
    cleanup();
    backend.rpc.mockClear();
    localStorage.setItem("smn-aceite-google", JSON.stringify({ version: "1.0", at: Date.now(), adult: true }));
    render(<AcceptanceScreen />);
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(backend.rpc).not.toHaveBeenCalledWith("app_marketing_set", expect.anything());
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
