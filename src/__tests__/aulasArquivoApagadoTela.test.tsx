/**
 * A07 na tela da equipe (aba Aulas): remover um material e apagar a aula passam pelo servidor, que também apaga o arquivo
 * do depósito; sem servidor (banco local do navegador) continua pelo banco; o Registro mostra a ação em português.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ACTION_LABEL, auditLabel, auditSummary } from "../novo/app/admin/auditLog.js";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminLessons } from "../novo/app/admin/AdminLessons.jsx";

const lesson = (materials: any[]) => ({
  id: "l9", area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite", published: true, key_points: [], updated_at: "2026-10-06T12:00:00Z", started_by: 0, completed_by: 0, materials,
});
const SLIDES = { id: "m1", kind: "slides", title: "Material complementar", file_title: "apostila.pdf", has_file: true, size_bytes: 2048, url: null, review_status: "approved" };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
let fetchMock: any;

beforeEach(() => {
  backend.accessToken = async () => "tok";
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_lessons") return { lessons: [lesson([SLIDES])] };
    if (fn === "app_lesson_topics") return [];
    if (fn === "app_admin_delete_lesson_material") return lesson([]);
    if (fn === "app_admin_delete_lesson") return true;
    throw new Error(`rpc não simulada: ${fn} ${JSON.stringify(args)}`);
  });
  fetchMock = vi.fn(async (url: string, init: any) => {
    if (init?.method === "DELETE" && url === "/api/lessons/materials/m1") return json(lesson([]));
    if (init?.method === "DELETE" && url === "/api/lessons/l9") return json({ deleted: true });
    return new Response("{}", { status: 404 });
  });
  (globalThis as any).fetch = fetchMock;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(cleanup);

describe("A07: tela da equipe", () => {
  it("avisa que o arquivo também é apagado do depósito, sem volta", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    expect(screen.getByText(/arquivo antigo também é apagado do depósito, sem volta/)).toBeTruthy();
  });

  it("Remover o material chama o servidor (que apaga o arquivo) e a lista fica sem o material", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/lessons/materials/m1", expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ Authorization: "Bearer tok" }) })));
    expect(await screen.findByText("Escolher PDF")).toBeTruthy();
    expect(backend.rpc).not.toHaveBeenCalledWith("app_admin_delete_lesson_material", expect.anything());
  });

  it("Apagar a aula chama o servidor e o aviso fala dos arquivos", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Apagar" }));
    expect((window.confirm as any).mock.calls[0][0]).toMatch(/arquivos deles também são apagados, sem volta/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/lessons/l9", expect.objectContaining({ method: "DELETE" })));
  });

  it("falha do servidor ao remover mostra o erro em português e não some com o material da tela", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Acesso restrito à equipe." }), { status: 403, headers: { "content-type": "application/json" } }));
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));
    expect(await screen.findByText("Acesso restrito à equipe.")).toBeTruthy();
    expect(screen.queryByText("Escolher PDF")).toBeNull();
  });

  it("sem servidor (banco local do navegador) continua removendo pelo banco", async () => {
    backend.accessToken = undefined;
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_delete_lesson_material", { p_id: "m1" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("A07: Registro da Administração", () => {
  it("a ação tem nome em português e mostra a aula e o caminho apagado", () => {
    expect((ACTION_LABEL as any)["lesson.file.delete"]).toBe("Arquivo de aula apagado do depósito");
    const entry = { action: "lesson.file.delete", target: "l9", title: "Bronquiolite", details: { path: "lessons/l9/slides-0123456789abcdef.pdf", kind: "slides" } };
    expect(auditLabel(entry)).toBe("Arquivo de aula apagado do depósito");
    expect(auditSummary(entry)).toBe("Aula: Bronquiolite · Arquivo apagado: lessons/l9/slides-0123456789abcdef.pdf");
  });
});
