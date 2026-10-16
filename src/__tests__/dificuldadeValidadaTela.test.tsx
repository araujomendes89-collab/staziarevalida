/** Administração › Questões › Dificuldade validada (jsdom, banco simulado). Só cadastro humano; nada calculado. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionDifficulty } from "../novo/app/admin/QuestionDifficulty.jsx";
import { AdminQuestions } from "../novo/app/admin/AdminQuestions.jsx";

const item = (n: number, over: any = {}) => ({
  id: `q${n}`, code: `REV-2024.1-Q00${n}`, area: "PEDIATRIA", topic: `Tema ${n}`, subtopic: "", origin: "official", status: "valid", excerpt: `Enunciado ${n}`,
  level: null, note: null, validated_at: null, validated_by: null, ...over,
});
let rows: any[];
beforeEach(() => {
  rows = [item(1), item(2, { level: 4, note: "conferida", validated_at: "2026-10-10T12:00:00Z", validated_by: "Dra. Ana" }), item(3)];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_question_difficulties") {
      const f = args.p_filters ?? {};
      const items = rows.filter((r) => (f.level === "none" ? r.level == null : f.level ? String(r.level) === f.level : true) && (!f.search || r.topic.includes(f.search) || r.code.includes(f.search)));
      return { total: items.length, validated_total: rows.filter((r) => r.level != null).length, questions_total: rows.length, items };
    }
    if (fn === "app_admin_set_question_difficulty") {
      const r = rows.find((x) => x.id === args.p_question_id)!;
      r.level = args.p_level; r.note = args.p_note; r.validated_at = args.p_level ? "2026-10-15T10:00:00Z" : null;
      return { question_id: r.id, level: args.p_level };
    }
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Dificuldade validada", () => {
  it("abre já no filtro 'sem dificuldade validada' e mostra os totais", async () => {
    render(<QuestionDifficulty onBack={vi.fn()} />);
    expect(await screen.findByText("REV-2024.1-Q001")).toBeTruthy();
    expect(screen.getByText("REV-2024.1-Q003")).toBeTruthy();
    expect(screen.queryByText("REV-2024.1-Q002")).toBeNull();
    expect(screen.getByText("1 com dificuldade validada")).toBeTruthy();
    expect(screen.getByText("2 sem dificuldade validada")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_question_difficulties", expect.objectContaining({ p_filters: expect.objectContaining({ level: "none" }) }));
  });

  it("grava o nível e a nota pelo RPC de cadastro, sem cálculo", async () => {
    render(<QuestionDifficulty onBack={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("Definir dificuldade de REV-2024.1-Q001"));
    const group = screen.getByRole("group", { name: "Dificuldade de REV-2024.1-Q001" });
    expect((within(group).getByText("Salvar dificuldade").closest("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(group).getByRole("radio", { name: /3 · Média/ }));
    fireEvent.change(within(group).getByLabelText("Nota (opcional)"), { target: { value: "  validada pelo grupo  " } });
    fireEvent.click(within(group).getByText("Salvar dificuldade"));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_question_difficulty", { p_question_id: "q1", p_level: 3, p_note: "validada pelo grupo" }));
    await waitFor(() => expect(screen.queryByText("REV-2024.1-Q001")).toBeNull()); // saiu de 'sem dificuldade'
  });

  it("limita a nota a 500 caracteres e só oferece 'Remover' para quem já tem nível", async () => {
    render(<QuestionDifficulty onBack={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("Definir dificuldade de REV-2024.1-Q001"));
    expect(screen.queryByText("Remover dificuldade")).toBeNull();
    expect((screen.getByLabelText("Nota (opcional)") as HTMLTextAreaElement).maxLength).toBe(500);
  });

  it("remove a dificuldade (nível nulo)", async () => {
    render(<QuestionDifficulty onBack={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Dificuldade"), { target: { value: "" } });
    fireEvent.click(await screen.findByLabelText("Definir dificuldade de REV-2024.1-Q002"));
    expect(screen.getByText(/Validada em .* por Dra\. Ana · conferida/)).toBeTruthy();
    fireEvent.click(screen.getByText("Remover dificuldade"));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_question_difficulty", { p_question_id: "q2", p_level: null, p_note: null }));
  });

  it("mostra a frase do banco quando gravar falha (aluno ou erro)", async () => {
    render(<QuestionDifficulty onBack={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("Definir dificuldade de REV-2024.1-Q001"));
    backend.rpc.mockImplementationOnce(async () => { throw new Error("Só a equipe pode validar a dificuldade de uma questão."); });
    fireEvent.click(screen.getByRole("radio", { name: /5 · Muito difícil/ }));
    fireEvent.click(screen.getByText("Salvar dificuldade"));
    expect(await screen.findByText(/Só a equipe pode validar/)).toBeTruthy();
  });

  it("a aba Questões tem o botão que abre a tela", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_questions") return { total: 0, exams: [], items: [] };
      return { total: 0, validated_total: 0, questions_total: 0, items: [] };
    });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByText("Dificuldade validada"));
    expect(await screen.findByText(/o sistema não calcula nem sugere nada/)).toBeTruthy();
  });

  it("não usa IA nem cálculo: o código da tela só chama as duas funções de cadastro/leitura", () => {
    const fs = require("fs");
    const src = fs.readFileSync(require("path").resolve(__dirname, "../novo/app/admin/QuestionDifficulty.jsx"), "utf8");
    const calls = [...src.matchAll(/rpc\("([a-z_]+)"/g)].map((m: any) => m[1]);
    expect([...new Set(calls)].sort()).toEqual(["app_admin_question_difficulties", "app_admin_set_question_difficulty"]);
    expect(src).not.toMatch(/gemini|openai|claude|\/api\/ai|Math\.random/i);
  });
});
