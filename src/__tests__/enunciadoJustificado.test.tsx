/**
 * O texto da questão (enunciado e pergunta) aparece justificado, com hifenização em português, no treino.
 * (Pedido do dono, 2026-10-12.) As alternativas e o painel de correção não mudam.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { PracticeSession } from "../novo/app/practice/PracticeSession.jsx";

const Q = {
  id: "q1", number: 1, area: "PEDIATRIA", exam: { id: "e", kind: "REVALIDA", year: 2024, semester: 1 },
  statement: "Um menino com 8 anos de idade comparece à Unidade Básica de Saúde, acompanhado de sua mãe, para consulta anual. Qual é a conduta?",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}` })), images: [], bookmarked: false, selected: null, active_ms: 0, correction: null,
};
const now = Date.now();

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_get_session") return { id: "s1", kind: "treino", filters: {}, started_at: new Date(now).toISOString(), finished_at: null, result: null, questions: [Q], timer: null };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Enunciado justificado", () => {
  it("o enunciado e a pergunta ficam justificados e hifenizados em português", async () => {
    render(<MemoryRouter initialEntries={["/sessao?s=s1"]}><PracticeSession go={vi.fn()} /></MemoryRouter>);
    const stem = await screen.findByText(/Um menino com 8 anos/);
    expect(stem.tagName).toBe("P");
    expect(stem.style.textAlign).toBe("justify");
    expect(stem.style.hyphens).toBe("auto");
    expect(stem.getAttribute("lang")).toBe("pt-BR");
  });
});
