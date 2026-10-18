/**
 * Minha conta: WhatsApp editável (grava `phone` normalizado) e, em Privacidade e dados, os aceites do Termo e dos Tutores de IA
 * com data e hora no fuso de Brasília.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const session: { boot: any; updateProfile: any } = { boot: null, updateProfile: null };

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { email: "pessoa@teste.dev" }, backend: { rpc: vi.fn() }, signOut: vi.fn(), updateProfile: session.updateProfile }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));

import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";

const makeBoot = (over: any = {}) => ({
  role: "student",
  profile: { name: "Pessoa", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light", phone: "+5541999998888" },
  subscription: null,
  legal: {
    termo_uso: { current: "1.0", accepted: "1.0", accepted_at: "2026-10-07T21:05:00Z" },
    tutor_ia: { current: "1.0", accepted: null, accepted_at: null },
    phone_missing: false,
    gate_required: false,
  },
  ...over,
});

beforeEach(() => {
  session.boot = makeBoot();
  session.updateProfile = vi.fn(async () => {});
});
afterEach(() => cleanup());

describe("Minha conta: WhatsApp", () => {
  it("mostra e salva o WhatsApp", async () => {
    render(<AccountScreen go={vi.fn()} />);
    const number = screen.getByLabelText("WhatsApp") as HTMLInputElement;
    expect(number.value).toBe("41999998888");
    fireEvent.change(number, { target: { value: "(41) 98888-7777" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(session.updateProfile).toHaveBeenCalledWith({ phone: "+5541988887777" }));
  });

  it("WhatsApp inválido mostra o erro e não salva", async () => {
    render(<AccountScreen go={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Informe o WhatsApp com DDD.")).toBeTruthy();
    expect(session.updateProfile).not.toHaveBeenCalled();
  });

  it("país fora da lista abre o código e guarda o número completo", async () => {
    session.boot = makeBoot({ profile: { ...makeBoot().profile, phone: "+244923456789" } });
    render(<AccountScreen go={vi.fn()} />);
    expect((screen.getByLabelText("Código do país") as HTMLInputElement).value).toBe("+244");
    expect((screen.getByLabelText("WhatsApp") as HTMLInputElement).value).toBe("923456789");
  });

  it("depois de salvar com máscara o formulário não fica alterado (não reenvia o mesmo telefone)", async () => {
    const { rerender } = render(<AccountScreen go={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "(41) 98888-7777" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(session.updateProfile).toHaveBeenCalledTimes(1));
    // o servidor devolve o perfil com o telefone salvo
    session.boot = makeBoot({ profile: { ...makeBoot().profile, phone: "+5541988887777" } });
    rerender(<AccountScreen go={vi.fn()} />);
    await screen.findByText("Alterações salvas.");
    expect((screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Cancelar volta o seletor ao estado do telefone salvo (sai do modo Outro)", () => {
    render(<AccountScreen go={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("País do WhatsApp"), { target: { value: "outro" } });
    expect(screen.getByLabelText("Código do país")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Código do país")).toBeNull();
    expect((screen.getByLabelText("País do WhatsApp") as HTMLSelectElement).value).toBe("+55");
  });

  it("o resumo da seção diz Nome, e-mail, WhatsApp e aparência", () => {
    render(<AccountScreen go={vi.fn()} />);
    expect(screen.getByText("Nome, e-mail, WhatsApp e aparência")).toBeTruthy();
  });
});

describe("Minha conta: aceites", () => {
  const openPrivacy = () => fireEvent.click(screen.getByRole("button", { name: /Privacidade e dados/ }));

  it("mostra os aceites com data e hora de Brasília", () => {
    render(<AccountScreen go={vi.fn()} />);
    openPrivacy();
    expect(screen.getByText("Termo de Aceite e Uso v1.0 — aceito em 07/10/2026 às 18:05")).toBeTruthy();
    expect(screen.getByText("Aceite dos Tutores de IA v1.0 — ainda não aceito")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Termo de Aceite e Uso" }).getAttribute("href")).toBe("/novo/termos");
    expect(screen.getByRole("link", { name: "Política de Privacidade" }).getAttribute("href")).toBe("/novo/privacidade");
  });

  it("aceite dos Tutores com data", () => {
    session.boot = makeBoot({ legal: { ...makeBoot().legal, tutor_ia: { current: "1.0", accepted: "1.0", accepted_at: "2026-10-08T03:30:00Z" } } });
    render(<AccountScreen go={vi.fn()} />);
    openPrivacy();
    expect(screen.getByText("Aceite dos Tutores de IA v1.0 — aceito em 08/10/2026 às 00:30")).toBeTruthy();
  });

  it("sem boot.legal não quebra", () => {
    session.boot = makeBoot({ legal: null });
    render(<AccountScreen go={vi.fn()} />);
    openPrivacy();
    expect(screen.queryByText(/Termo de Aceite e Uso v/)).toBeNull();
    expect(screen.queryByText("Baixar meus dados")).toBeNull();
    // o e-mail da privacidade aparece nos direitos da LGPD e, desde 22bf8472, também no aviso de "Excluir conta"
    expect(screen.getByText(/Seus direitos pela LGPD.*privacidade@staziamed\.com\.br/)).toBeTruthy();
    expect(screen.getByText(/peça antes em privacidade@staziamed\.com\.br/)).toBeTruthy();
  });
});
