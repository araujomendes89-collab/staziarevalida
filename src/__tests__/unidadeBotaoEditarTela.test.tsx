/**
 * Central › Unidade: botão "Editar" no texto da unidade (pedido do dono, 14/10/2026). O texto abre em modo leitura; "Editar" liga a
 * edição (só equipe e só versão editável); "Cancelar" descarta; "Salvar texto" grava como antes. Versão no ar: "Editar (criar versão
 * nova)" pede confirmação e chama app_ch_new_version (migração 20261003009864, só published/needs_update). Textos de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Units } from "../novo/app/admin/content/Units.jsx";

const VERSAO = (status: string) => ({
  version: { id: "v1", unit_id: "u1", version: 1, status, content: { sections: [{ heading: "Caso", paragraphs: [{ text: "Texto original.", clinical: false, claim_ids: [] }] }] }, content_hash: "h", generated_by_model: null, review_flags: [] },
  title: "Unidade de teste",
  area_code: "CLINICA_MEDICA",
  problems: [],
  claims: [],
  materials: [],
  approvals: [],
  publications: [],
});

let versao: any;
const chamadas: { fn: string; args: any }[] = [];
beforeEach(() => {
  chamadas.length = 0;
  versao = VERSAO("draft");
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    chamadas.push({ fn, args });
    if (fn === "app_ch_unit_version") return versao;
    if (fn === "app_ch_new_version") return "v2";
    return null;
  });
});
afterEach(() => cleanup());

const ctx = (extra: any = {}) => ({ params: new URLSearchParams({ versao: "v1" }), go: vi.fn(), isAdmin: true, isStaff: true, reviewerAreas: [], ...extra });
const chamou = (fn: string) => chamadas.filter((c) => c.fn === fn);
const secaoTexto = async () => (await screen.findByText("Texto da unidade (base revisada)")).closest(".sm-card") as HTMLElement;

describe("Texto da unidade: botão Editar", () => {
  it("abre em modo leitura; Editar liga os campos, Parágrafo, Seção e Remover", async () => {
    render(<Units {...ctx()} />);
    const sec = await secaoTexto();
    expect(within(sec).getByText("Texto original.")).toBeTruthy();
    expect(within(sec).queryByRole("textbox")).toBeNull();
    expect(within(sec).queryByRole("button", { name: /Parágrafo/ })).toBeNull();
    expect(within(sec).queryByRole("button", { name: /Salvar texto/ })).toBeNull();
    fireEvent.click(within(sec).getByRole("button", { name: "Editar" }));
    expect(within(sec).getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(within(sec).getByRole("button", { name: /Parágrafo/ })).toBeTruthy();
    expect(within(sec).getByRole("button", { name: /Seção/ })).toBeTruthy();
    expect(within(sec).getByRole("button", { name: /Remover/ })).toBeTruthy();
    expect(sec.textContent).toMatch(/Salvar invalida as aprovações/);
    expect(within(sec).queryByRole("button", { name: "Editar" })).toBeNull();
  });

  it("Cancelar descarta a mudança e volta para leitura, sem chamar o banco", async () => {
    render(<Units {...ctx()} />);
    const sec = await secaoTexto();
    fireEvent.click(within(sec).getByRole("button", { name: "Editar" }));
    fireEvent.change(within(sec).getByDisplayValue("Texto original."), { target: { value: "Texto mudado." } });
    fireEvent.click(within(sec).getByRole("button", { name: "Cancelar" }));
    expect(within(sec).getByText("Texto original.")).toBeTruthy();
    expect(sec.textContent).not.toMatch(/Texto mudado/);
    expect(within(sec).queryByRole("textbox")).toBeNull();
    expect(chamou("app_ch_save_unit_version")).toHaveLength(0);
  });

  it("Salvar texto grava o conteúdo novo e avisa que as aprovações deixaram de valer", async () => {
    versao = VERSAO("approved");
    render(<Units {...ctx()} />);
    const sec = await secaoTexto();
    fireEvent.click(within(sec).getByRole("button", { name: "Editar" }));
    fireEvent.change(within(sec).getByDisplayValue("Texto original."), { target: { value: "Texto acrescentado." } });
    fireEvent.click(within(sec).getByRole("button", { name: /Salvar texto/ }));
    await waitFor(() => expect(chamou("app_ch_save_unit_version")).toHaveLength(1));
    const { p_version_id, p_content } = chamou("app_ch_save_unit_version")[0].args;
    expect(p_version_id).toBe("v1");
    expect(p_content.sections[0].paragraphs[0].text).toBe("Texto acrescentado.");
    expect(await within(sec).findByText(/As aprovações desta versão deixaram de valer/)).toBeTruthy();
  });

  it("quem não é da equipe (revisor) não vê Editar", async () => {
    render(<Units {...ctx({ isAdmin: false, isStaff: false, reviewerAreas: ["CLINICA_MEDICA"] })} />);
    const sec = await secaoTexto();
    expect(within(sec).queryByRole("button", { name: /Editar/ })).toBeNull();
  });
});

describe("Versão no ar: Editar (criar versão nova)", () => {
  it("pede confirmação em texto claro, chama app_ch_new_version e abre a versão nova", async () => {
    versao = VERSAO("published");
    const go = vi.fn();
    render(<Units {...ctx({ go })} />);
    const sec = await secaoTexto();
    expect(within(sec).queryByRole("button", { name: "Editar" })).toBeNull();
    fireEvent.click(within(sec).getByRole("button", { name: "Editar (criar versão nova)" }));
    expect(sec.textContent).toMatch(/A versão no ar continua como está; a edição vai numa versão nova, que precisa ser aprovada de novo\./);
    expect(chamou("app_ch_new_version")).toHaveLength(0);
    fireEvent.click(within(sec).getByRole("button", { name: /Criar versão nova e editar/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("unidades", { versao: "v2" }));
    expect(chamou("app_ch_new_version")[0].args).toEqual({ p_from_version_id: "v1" });
  });

  it("Cancelar na confirmação não cria nada", async () => {
    versao = VERSAO("needs_update");
    render(<Units {...ctx()} />);
    const sec = await secaoTexto();
    fireEvent.click(within(sec).getByRole("button", { name: "Editar (criar versão nova)" }));
    fireEvent.click(within(sec).getByRole("button", { name: "Cancelar" }));
    expect(sec.textContent).not.toMatch(/A versão no ar continua como está/);
    expect(chamou("app_ch_new_version")).toHaveLength(0);
  });

  it("versão retirada não tem botão de editar (o banco só cria versão nova a partir da que está no ar)", async () => {
    versao = VERSAO("retired");
    render(<Units {...ctx()} />);
    const sec = await secaoTexto();
    expect(within(sec).queryByRole("button", { name: /Editar/ })).toBeNull();
  });

  it("revisor sem papel de equipe não vê o botão na versão no ar", async () => {
    versao = VERSAO("published");
    render(<Units {...ctx({ isAdmin: false, isStaff: false, reviewerAreas: ["CLINICA_MEDICA"] })} />);
    const sec = await secaoTexto();
    expect(within(sec).queryByRole("button", { name: /Editar/ })).toBeNull();
  });
});
