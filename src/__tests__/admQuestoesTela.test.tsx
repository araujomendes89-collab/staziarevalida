/**
 * Administração, aba Questões (frente adm-questoes), nas telas (jsdom, banco simulado). As regras de verdade estão em
 * admQuestoesBanco.test.ts.
 *   Q10: o editor avisa, antes de salvar, que mudar o enunciado ou o texto de uma alternativa tira do ar a análise publicada.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";

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
