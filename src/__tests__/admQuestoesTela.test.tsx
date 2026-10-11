/**
 * Administração, aba Questões (frente adm-questoes), nas telas (jsdom, banco simulado). As regras de verdade estão em
 * admQuestoesBanco.test.ts.
 *   Q10: o editor avisa, antes de salvar, que mudar o enunciado ou o texto de uma alternativa tira do ar a análise publicada.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";
import { AdminAudit } from "../novo/app/admin/AdminPanels.jsx";

const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 3, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: "Lactente com desconforto respiratório há dois dias.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: id === "B" ? "B é a correta." : "" })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false, images: [], explanations_review: null,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito definitivo INEP 2024/1", source_url: null, published_at: null },
};

beforeEach(() => {
  session.boot = { role: "admin", profile: { name: "Adm" } };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_admin_question") return ROW;
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Q10 — aviso antes de salvar: mudar o texto tira a análise publicada do ar", () => {
  const WARNING = "A análise publicada sai do ar";

  it("só aparece quando o enunciado ou o texto de uma alternativa muda de verdade", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const statement = (await screen.findByLabelText("Enunciado")) as HTMLTextAreaElement;
    expect(screen.queryByText(WARNING)).toBeNull();

    // espaços repetidos, quebra de linha e espaços nas pontas não mudam o que a análise explica
    fireEvent.change(statement, { target: { value: `  Lactente   com desconforto respiratório\nhá dois dias.  ` } });
    expect(screen.queryByText(WARNING)).toBeNull();
    // explicação, conduta e tema também não
    fireEvent.change(screen.getByLabelText("Explicação da A (opcional)"), { target: { value: "A está errada." } });
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Suporte e observação." } });
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Bronquiolite aguda" } });
    expect(screen.queryByText(WARNING)).toBeNull();

    // o enunciado muda: o aviso aparece, com o que acontece ao salvar
    fireEvent.change(statement, { target: { value: "Lactente com desconforto respiratório há três dias." } });
    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(screen.getByText(/Ao salvar, a análise publicada desta questão \(se houver\) sai do ar para o aluno/)).toBeTruthy();
    // voltou ao texto de antes: o aviso some
    fireEvent.change(statement, { target: { value: ROW.statement } });
    expect(screen.queryByText(WARNING)).toBeNull();

    // o texto de uma alternativa muda: aparece de novo
    fireEvent.change(screen.getByLabelText("Alternativa C"), { target: { value: "Alt C reescrita" } });
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it("questão nova não tem análise: sem aviso", async () => {
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Enunciado"), { target: { value: "Enunciado da questão nova." } });
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});

describe("Q08 — apagar questão", () => {
  const delRoutes = (row: any = ROW, remove: (args: any) => any = () => ({ deleted: true, id: "q1", code: "REV-2024.1-Q001" })) => {
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question") return row;
      if (fn === "app_admin_delete_question") return remove(args);
      throw new Error(`rpc não simulada: ${fn}`);
    });
  };
  const deletes = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_delete_question");

  it("administrador, questão sem resposta: pede para digitar o código e só então apaga; volta para a lista", async () => {
    delRoutes({ ...ROW, attempts: 0 });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<QuestionEditor id="q1" onClose={onClose} onSaved={onSaved} />);
    const panel = await screen.findByRole("region", { name: "Apagar questão" });
    const button = within(panel).getByRole("button", { name: "Apagar questão" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const field = within(panel).getByLabelText("Digite REV-2024.1-Q001 para confirmar");
    // Enter no campo não salva a questão
    fireEvent.keyDown(field, { key: "Enter", code: "Enter" });
    fireEvent.change(field, { target: { value: "REV-2024.1-Q002" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "rev-2024.1-q001" } });
    expect(button.disabled).toBe(false);
    expect(deletes()).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(deletes()).toEqual([["app_admin_delete_question", { p_question_id: "q1" }]]));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalled();
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_admin_save_question")).toBe(false);
  });

  it("a recusa do banco aparece e a tela fica onde está", async () => {
    delRoutes({ ...ROW, attempts: 0 }, () => {
      throw Object.assign(new Error("Esta questão não pode ser apagada: tem 1 sessão de treino de aluno. Se ela não deve mais valer, anule a questão pelo registro do gabarito oficial."), { code: "22023" });
    });
    const onClose = vi.fn();
    render(<QuestionEditor id="q1" onClose={onClose} onSaved={vi.fn()} />);
    const panel = await screen.findByRole("region", { name: "Apagar questão" });
    fireEvent.change(within(panel).getByLabelText(/Digite REV-2024.1-Q001/), { target: { value: "REV-2024.1-Q001" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apagar questão" }));
    expect(await within(panel).findByText(/Esta questão não pode ser apagada: tem 1 sessão de treino de aluno/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("questão com resposta de aluno: sem botão, com a explicação e o caminho da anulação", async () => {
    delRoutes({ ...ROW, attempts: 3 });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const panel = await screen.findByRole("region", { name: "Apagar questão" });
    expect(within(panel).getByText(/Esta questão já tem 3 respostas de alunos e não pode ser apagada/)).toBeTruthy();
    expect(within(panel).getByText(/anule-a pelo registro do gabarito oficial/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Apagar questão" })).toBeNull();
  });

  it("só administrador vê; questão nova não tem o que apagar", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    delRoutes({ ...ROW, attempts: 0 });
    const { unmount } = render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole("button", { name: "Salvar questão" });
    expect(screen.queryByRole("region", { name: "Apagar questão" })).toBeNull();
    unmount();
    session.boot = { role: "admin", profile: { name: "Adm" } };
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole("button", { name: "Criar questão" });
    expect(screen.queryByRole("region", { name: "Apagar questão" })).toBeNull();
  });
});

describe("Q08 e Q10 — o Registro de ações escreve em português", () => {
  it("questão apagada e análise tirada do ar aparecem com nome e resumo, sem o código técnico", async () => {
    const at = "2026-10-11T12:00:00Z";
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit")
        return [
          { id: 2, action: "question.delete", target: "revalida_2024_1_q130", created_at: at, actor: "adm@t.dev", details: { code: "REV-2024.1-Q130", topic: "Bronquiolite", snapshot: {} } },
          { id: 1, action: "question.analysis_unpublished", target: "revalida_2024_1_q100", created_at: at, actor: "ed@t.dev", details: { analysis_ids: ["a1"] } },
        ];
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    expect(await screen.findByText("Questão apagada")).toBeTruthy();
    expect(screen.getByText("REV-2024.1-Q130 · Bronquiolite")).toBeTruthy();
    expect(screen.getByText("Análise da questão tirada do ar")).toBeTruthy();
    expect(container.textContent).not.toMatch(/question\.(delete|analysis_unpublished)/);
  });
});
