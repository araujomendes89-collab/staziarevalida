/**
 * Administração › Questões (pedido do dono, 2026-10-12): no lugar de "Nova questão" fica "Questões inéditas", que abre a
 * Central de Conteúdo › Questões inéditas, onde a questão nova é montada a partir de fontes oficiais.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminQuestions } from "../novo/app/admin/AdminQuestions.jsx";

beforeEach(() => {
  session.boot = { role: "admin", profile: { name: "Adm" } };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_admin_questions") return { total: 0, exams: [], items: [] };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Questões inéditas no lugar de Nova questão", () => {
  it("a equipe vê 'Questões inéditas' (e não 'Nova questão'), e o botão abre a Central de Conteúdo", async () => {
    const onOpenIneditas = vi.fn();
    render(<AdminQuestions onOpenIneditas={onOpenIneditas} />);
    expect(await screen.findByText("Nenhuma questão encontrada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nova questão" })).toBeNull();
    expect(screen.getByRole("button", { name: "Carregar questões" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Questões inéditas" }));
    expect(onOpenIneditas).toHaveBeenCalledTimes(1);
    // nada de editor de questão nova aberto na própria aba
    expect(screen.queryByRole("button", { name: "Criar questão" })).toBeNull();
  });

  it("sem o caminho para a Central (fora da Administração), o botão fica desligado", async () => {
    render(<AdminQuestions />);
    await screen.findByText("Nenhuma questão encontrada");
    expect((screen.getByRole("button", { name: "Questões inéditas" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
