/**
 * Aba Aulas da Administração, correções de 11/10/2026 (A03, A09, A10 e as demais deste arquivo): jsdom, banco simulado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminLessons } from "../novo/app/admin/AdminLessons.jsx";

const SAVED_AT = "2026-10-06T12:00:00Z";
const base = () => ({ lessons: [] as any[] });
let store: { lessons: any[] };

beforeEach(() => {
  store = base();
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_lessons") return store;
    if (fn === "app_lesson_topics") return [];
    // a função real devolve a aula SEM started_by/completed_by (só a lista da equipe traz as contagens)
    if (fn === "app_admin_save_lesson") return { id: "l1", ...args.p_lesson, key_points: [], materials: [], updated_at: SAVED_AT };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

async function createLesson(title = "Aula de teste") {
  fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
  fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Bronquiolite" } });
  fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: title } });
  fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
  expect(await screen.findByText("Aula salva.")).toBeTruthy();
}

describe("A03 - Nova aula abre formulário em branco", () => {
  it("depois de criar uma aula, clicar em Nova aula abre um formulário em branco (não edita a aula recém-criada)", async () => {
    render(<AdminLessons />);
    await createLesson();
    expect(screen.getByRole("heading", { name: "Editar aula" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nova aula" }));
    expect(screen.getByRole("heading", { name: "Nova aula" })).toBeTruthy();
    expect((screen.getByLabelText("Título da aula") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Tema") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Outro" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Segunda aula" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_lesson").length).toBe(2));
    const second = backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_lesson")[1][1].p_lesson;
    expect(second.id).toBeUndefined(); // criou outra aula, não escreveu por cima da primeira
  });
});
