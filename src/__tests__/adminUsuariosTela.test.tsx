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
