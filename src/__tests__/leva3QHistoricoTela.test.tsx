/**
 * Leva 3, aba Questões, Q12, na tela (jsdom, banco simulado): o editor mostra o histórico de mudanças da questão (quem, quando,
 * motivo, antes e depois) para a equipe toda, e "Voltar para este texto" só COPIA o texto antigo para o formulário (não salva).
 * As regras de verdade estão em leva3QHistoricoBanco.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "editor", profile: { name: "Ed" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";

const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 0, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite aguda", subtopic: "",
  statement: "Lactente com desconforto respiratório há três dias.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: id === "B" ? "B é a correta: suporte e oxigênio." : "" })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte e oxigênio.", inep_intent: "", needs_image: false, images: [], explanations_review: null,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito", source_url: null, published_at: null },
};
const opts = (map: Record<string, [string, string]>) => ["A", "B", "C", "D"].map((id) => ({ id, text: map[id]?.[0] ?? `Alt ${id}`, explanation: map[id]?.[1] ?? "" }));
const ITEMS = [
  { id: 30, at: "2026-10-11T15:30:00Z", by: "Editora", reason: "assistente de IA", changes: { topic: { de: "Bronquiolite", para: "Bronquiolite aguda" }, expected_conduct: { de: "Suporte.", para: "Suporte e oxigênio." } } },
  { id: 29, at: "2026-10-10T12:00:00Z", by: "Master", reason: null, changes: { statement: { de: "Lactente com desconforto respiratório há dois dias.", para: "Lactente com desconforto respiratório há três dias." }, options: { de: opts({ B: ["Alt B", ""] }), para: opts({ B: ["Alt B", "B é a correta: suporte e oxigênio."], C: ["Alt C reescrita", ""] }) } } },
  { id: 28, at: "2026-10-09T09:00:00Z", by: null, reason: null, changes: { subtopic: { de: null, para: "Manejo" } } },
  { id: 27, at: "2026-10-08T09:00:00Z", by: "Master", reason: "Gabarito oficial: FINAL (INEP). Motivo: recurso", changes: { correct_option: { de: "C", para: "B" }, status: { de: "valid", para: "valid" } } },
  { id: 26, at: "2026-10-07T09:00:00Z", by: "Editora", reason: null, changes: { figura: { de: null, para: "Eletrocardiograma com supradesnivelamento de ST" }, needs_image: { de: false, para: true } } },
];
let page: (args: any) => any;
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const open = async (row: any = ROW, history: (args: any) => any = () => ({ total: ITEMS.length, items: ITEMS })) => {
  page = history;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_question") return row;
    if (fn === "app_admin_question_history") return page(args);
    throw new Error(`rpc não simulada: ${fn}`);
  });
  render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByRole("button", { name: "Salvar questão" });
};
const panel = () => screen.getByRole("region", { name: "Histórico de mudanças" });

beforeEach(() => {
  session.boot = { role: "editor", profile: { name: "Ed" } };
});
afterEach(cleanup);

describe("Q12 — histórico de mudanças no editor", () => {
  it("o histórico só é pedido quando a pessoa abre o painel; mostra data, quem mudou, motivo e o que mudou, da mais nova para a mais antiga", async () => {
    await open();
    expect(calls("app_admin_question_history")).toHaveLength(0);
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    const first = await within(panel()).findByRole("button", { name: /Ver o que mudou em 11\/10\/2026/ });
    expect(calls("app_admin_question_history")).toEqual([["app_admin_question_history", { p_question_id: "q1", p_limit: 50, p_offset: 0 }]]);
    const rows = within(panel()).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toMatch(/Editora/);
    expect(rows[0].textContent).toMatch(/assistente de IA/);
    expect(rows[0].textContent).toMatch(/Tema, Conduta esperada/);
    expect(rows[1].textContent).toMatch(/Master/);
    expect(rows[1].textContent).toMatch(/Enunciado, Alternativas/);
    expect(rows[2].textContent).toMatch(/Alteração feita direto no banco/); // sem pessoa logada: não finge que foi alguém da equipe
    expect(rows[3].textContent).toMatch(/Gabarito oficial: FINAL \(INEP\)\. Motivo: recurso/);
    expect(rows[4].textContent).toMatch(/Figura, Marca “Cita figura”/);
    expect(first).toBeTruthy();
    expect(panel().textContent).not.toMatch(/expected_conduct|statement|options|needs_image|correct_option|p_question_id/);
  });

  it("mostra o antes e o depois, com o texto de cada alternativa e de cada explicação que mudou", async () => {
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    fireEvent.click(await within(panel()).findByRole("button", { name: /Ver o que mudou em 10\/10\/2026/ }));
    const detail = within(panel()).getByRole("group", { name: "O que mudou em 10/10/2026" });
    expect(within(detail).getByText("Enunciado")).toBeTruthy();
    expect(within(detail).getByText("Lactente com desconforto respiratório há dois dias.")).toBeTruthy(); // antes
    expect(within(detail).getByText("Lactente com desconforto respiratório há três dias.")).toBeTruthy(); // depois
    expect(within(detail).getByText("Explicação da B")).toBeTruthy();
    expect(within(detail).getByText("Alternativa C")).toBeTruthy();
    expect(within(detail).getByText("Alt C reescrita")).toBeTruthy();
    expect(within(detail).queryByText("Alternativa A")).toBeNull(); // a A não mudou
    expect(within(detail).getAllByText("(vazio)").length).toBeGreaterThan(0);
  });

  it("'Voltar para este texto' copia o texto antigo para o formulário e NÃO salva nada", async () => {
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    fireEvent.click(await within(panel()).findByRole("button", { name: /Ver o que mudou em 10\/10\/2026/ }));
    const detail = within(panel()).getByRole("group", { name: "O que mudou em 10/10/2026" });
    fireEvent.click(within(detail).getByRole("button", { name: "Voltar para este texto: Enunciado" }));
    expect((screen.getByLabelText("Enunciado") as HTMLTextAreaElement).value).toBe("Lactente com desconforto respiratório há dois dias.");
    expect(within(panel()).getByText(/Texto copiado para o formulário\. Confira e clique em “Salvar questão”: nada foi salvo ainda\./)).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Voltar para este texto: Alternativa C" }));
    expect((screen.getByLabelText("Alternativa C") as HTMLTextAreaElement).value).toBe("Alt C");
    fireEvent.click(within(detail).getByRole("button", { name: "Voltar para este texto: Explicação da B" }));
    expect((screen.getByLabelText("Explicação da B (opcional)") as HTMLTextAreaElement).value).toBe("");
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_admin_save_question")).toBe(false);
    // o texto voltou ao formulário, mas a questão gravada continua a mesma: o editor avisa que há mudança não salva ao fechar? (não há) e o botão de salvar segue valendo
    expect(screen.getByRole("button", { name: "Salvar questão" })).toBeTruthy();
  });

  it("tema, subtema, conduta e 'o que avalia' também voltam (inclusive para vazio); gabarito, situação e figura não têm botão", async () => {
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    fireEvent.click(await within(panel()).findByRole("button", { name: /Ver o que mudou em 11\/10\/2026/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Voltar para este texto: Tema" }));
    expect((screen.getByLabelText("Tema") as HTMLInputElement).value).toBe("Bronquiolite");
    fireEvent.click(within(panel()).getByRole("button", { name: "Voltar para este texto: Conduta esperada" }));
    expect((screen.getByLabelText("Conduta esperada") as HTMLTextAreaElement).value).toBe("Suporte.");
    fireEvent.click(within(panel()).getByRole("button", { name: /Ver o que mudou em 09\/10\/2026/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Voltar para este texto: Subtema" }));
    expect((screen.getByLabelText("Subtema") as HTMLInputElement).value).toBe("");
    fireEvent.click(within(panel()).getByRole("button", { name: /Ver o que mudou em 08\/10\/2026/ }));
    const answer = within(panel()).getByRole("group", { name: "O que mudou em 08/10/2026" });
    expect(within(answer).getByText("Gabarito")).toBeTruthy();
    expect(within(answer).getByText(/só mudam pelo registro do gabarito oficial/)).toBeTruthy();
    expect(within(answer).queryByRole("button", { name: /Voltar para este texto/ })).toBeNull();
    fireEvent.click(within(panel()).getByRole("button", { name: /Ver o que mudou em 07\/10\/2026/ }));
    const figure = within(panel()).getByRole("group", { name: "O que mudou em 07/10/2026" });
    expect(within(figure).getByText("Eletrocardiograma com supradesnivelamento de ST")).toBeTruthy();
    expect(within(figure).queryByRole("button", { name: /Voltar para este texto/ })).toBeNull();
  });

  it("carrega mais páginas quando há mais mudanças que as mostradas", async () => {
    await open(ROW, (args) => ({ total: 7, items: ITEMS.slice(args.p_offset, args.p_offset + (args.p_offset === 0 ? 5 : 2)).concat(args.p_offset === 0 ? [] : [{ id: 20 + args.p_offset, at: "2026-10-01T09:00:00Z", by: "Master", reason: null, changes: { topic: { de: "A", para: "B" } } }]) }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    await within(panel()).findAllByRole("listitem");
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(panel()).getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(within(panel()).getAllByRole("listitem").length).toBeGreaterThan(5));
    expect(calls("app_admin_question_history").map((c: any[]) => c[1].p_offset)).toEqual([0, 5]);
  });

  it("sem mudança nenhuma, diz isso; erro aparece em português com 'Tentar de novo'", async () => {
    await open(ROW, () => ({ total: 0, items: [] }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    expect(await within(panel()).findByText("Esta questão ainda não foi alterada depois de criada.")).toBeTruthy();
    cleanup();
    let n = 0;
    await open(ROW, () => {
      if (++n === 1) throw new Error("falha de rede");
      return { total: 1, items: [ITEMS[0]] };
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    fireEvent.click(await within(panel()).findByRole("button", { name: "Tentar de novo" }));
    expect(await within(panel()).findAllByRole("listitem")).toHaveLength(1);
  });

  it("questão nova não tem histórico; o administrador e o editor veem o mesmo painel", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    backend.rpc.mockReset();
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole("button", { name: "Criar questão" });
    expect(screen.queryByRole("region", { name: "Histórico de mudanças" })).toBeNull();
    cleanup();
    await open();
    expect(panel()).toBeTruthy();
    cleanup();
    session.boot = { role: "admin", profile: { name: "Adm" } };
    await open();
    expect(panel()).toBeTruthy();
  });
});
