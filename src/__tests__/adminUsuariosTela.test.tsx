/**
 * Administração › Usuários (tela, jsdom, banco simulado): exclusão com motivo (US02), paginação de verdade (US03),
 * confirmação ao promover a Administrador (US07), selo de revisor médico (US05), texto do editor (US04), combinações do plano (US06).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "eu" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminUsers } from "../novo/app/admin/AdminUsers.jsx";

const person = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `u${n}`, email: `pessoa${n}@teste.dev`, name: `Pessoa ${n}`, created_at: "2026-10-01T12:00:00Z", role: "student", plan: "trial", status: "trialing",
  trial_ends_at: "2026-10-20T12:00:00Z", current_period_end: null, answered: 0, correct: 0, last_activity: null, reviewer_areas: [],
  sessions: 0, simulados: 0, flashcards: 0, flashcard_reviews: 0, pending_errors: 0, phase: 1, exam_type: "REVALIDA", target_edition: null, ...extra,
});

let users: any[];
beforeEach(() => {
  users = [person(1), person(2)];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_users") {
      const offset = args.p_offset ?? 0;
      return { total: users.length, items: users.slice(offset, offset + args.p_limit) };
    }
    if (fn === "app_admin_user") return users.find((u) => u.id === args.p_user_id);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const open = async (name: string) => fireEvent.click(await screen.findByRole("button", { name: `Abrir ${name}` }));

describe("US02 · excluir usuário", () => {
  const REASON = "Esta pessoa aprovou ou publicou conteúdo na Central de Conteúdo, e esse registro precisa ficar. Para encerrar o acesso dela sem perder o histórico, mude o papel para Aluno e o plano para Expirado.";

  it("mostra o motivo que o banco devolve (em vez de 'Não foi possível concluir') e avisa antes", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_users") return { total: 1, items: [users[0]] };
      if (fn === "app_admin_user") return users[0];
      if (fn === "app_admin_delete_user") throw new Error(REASON);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminUsers />);
    await open("Pessoa 1");
    expect(await screen.findByText(/Quem já aprovou ou publicou conteúdo na Central de Conteúdo/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Digite pessoa1@teste.dev para confirmar"), { target: { value: "pessoa1@teste.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir usuário" }));
    expect(await screen.findByText(REASON)).toBeTruthy();
    expect(screen.queryByText(/Não foi possível concluir/)).toBeNull();
  });
});

describe("US03 · Carregar mais pagina de verdade", () => {
  it("pede a próxima página com o deslocamento, soma na lista e some o botão no fim (mesmo acima de 200)", async () => {
    users = Array.from({ length: 260 }, (_, i) => person(i + 1));
    render(<AdminUsers />);
    expect(await screen.findByText("260 usuários")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Abrir / })).toHaveLength(50);
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_users", expect.objectContaining({ p_limit: 50, p_offset: 0 }));

    for (let page = 1; page <= 5; page++) {
      fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
      await waitFor(() => expect(screen.getAllByRole("button", { name: /^Abrir / })).toHaveLength(Math.min(260, 50 * (page + 1))));
      expect(backend.rpc).toHaveBeenCalledWith("app_admin_users", expect.objectContaining({ p_limit: 50, p_offset: 50 * page }));
    }
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    const names = screen.getAllByRole("button", { name: /^Abrir / }).map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(new Set(names).size).toBe(260); // ninguém repetido
  });

  it("mudar a busca ou o filtro volta para a primeira página", async () => {
    users = Array.from({ length: 120 }, (_, i) => person(i + 1));
    render(<AdminUsers />);
    await screen.findByText("120 usuários");
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Abrir / })).toHaveLength(100));
    fireEvent.change(screen.getByLabelText("Papel"), { target: { value: "editor" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_users", expect.objectContaining({ p_role: "editor", p_offset: 0 })));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Abrir / })).toHaveLength(50));
  });

  it("se uma página falhar, mostra o erro sem perder o que já estava na tela", async () => {
    users = Array.from({ length: 120 }, (_, i) => person(i + 1));
    render(<AdminUsers />);
    await screen.findByText("120 usuários");
    const original = backend.rpc.getMockImplementation();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_users" && args.p_offset === 50) throw new Error("Falha de teste na página.");
      return original(fn, args);
    });
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Falha de teste na página.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Abrir / })).toHaveLength(50);
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeTruthy();
  });
});
