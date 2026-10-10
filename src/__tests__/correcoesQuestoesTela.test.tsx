/**
 * Correções da aba Questões, nas telas (jsdom, banco simulado). As regras de verdade estão em correcoesQuestoesBanco.test.ts.
 *   Q01: a recusa "Essa questão já existe" aparece no editor de questão nova.
 *   Q02: gabarito e situação de questão já gravada ficam travados; o administrador muda pelo registro do gabarito oficial
 *        (fonte e motivo obrigatórios); a marca "explicações a revisar" aparece e sai com "Marcar como revisadas".
 *   Q03: a importação mostra antes quantas são novas, quantas perderiam comentário e quantas têm gabarito diferente.
 *   Q04/Q05: questão anulada aparece como "Questão anulada pela banca", fora de acertos e erros.
 *   Q14: Preencher sem fonte em todos os campos pedidos mostra o aviso da biblioteca de fontes.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminQuestions, QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";
import { Verdict, answerState } from "../novo/app/practice/Correction.jsx";
import { SessionResult } from "../novo/app/practice/SessionResult.jsx";
import { AssistantPanel } from "../novo/app/admin/assistant/AssistantPanel.jsx";

const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 3, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: "Lactente com desconforto respiratório há dois dias.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: id === "B" ? "B é a correta." : "" })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false, images: [], explanations_review: null,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito definitivo INEP 2024/1", source_url: null, published_at: null },
};
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const radio = (group: string, name: string) => within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name }) as HTMLButtonElement;

beforeEach(() => {
  session.boot = { role: "admin", profile: { name: "Adm" } };
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("Q01 — Nova questão que já existe", () => {
  it("o editor mostra a recusa do banco e não diz 'Questão salva'", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_save_question") throw Object.assign(new Error("Essa questão já existe: abra-a para editar."), { code: "22023" });
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} />);
    // questão nova: gabarito e situação ficam livres
    expect(radio("Gabarito", "C").disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Criar questão" }));
    expect(await screen.findByText("Essa questão já existe: abra-a para editar.")).toBeTruthy();
    expect(screen.queryByText("Questão salva.")).toBeNull();
  });
});

describe("Q02 — gabarito e situação travados; registro do gabarito oficial", () => {
  const routes = (row: any = ROW) => {
    let current = row;
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question") return current;
      if (fn === "app_admin_save_question") return { ...current, ...args.p_question };
      if (fn === "app_admin_set_official_answer") {
        current = {
          ...current, correct_option: args.p_answer, status: "changed_after_appeal",
          official: { answer: args.p_answer, answer_status: args.p_status, version: 2, source: args.p_source },
          explanations_review: { de: "B", para: args.p_answer, campos: ["expected_conduct", "explanation_B"], motivo: args.p_reason },
        };
        return { id: "x", version: 2, recorrected: 2, review: current.explanations_review };
      }
      if (fn === "app_admin_question_review_done") return (current = { ...current, explanations_review: null });
      throw new Error(`rpc não simulada: ${fn}`);
    });
  };

  it("editor (sem ser administrador): gabarito e situação travados, com o aviso de quem muda", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    routes();
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole("button", { name: "Salvar questão" });
    for (const l of ["A", "B", "C", "D"]) expect(radio("Gabarito", l).disabled).toBe(true);
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText("Gabarito e situação só mudam pelo registro do gabarito oficial (administrador, com fonte e motivo).")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar gabarito oficial" })).toBeNull();
    // salvar manda o gabarito e a situação gravados, sem mudança
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(calls("app_admin_save_question")).toHaveLength(1));
    expect(calls("app_admin_save_question")[0][1].p_question).toMatchObject({ correct_option: "B", status: "valid" });
  });

  it("administrador: registra o gabarito oficial com fonte e motivo; o editor recarrega e mostra o que revisar", async () => {
    routes();
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText(/Gabarito oficial atual: B/);
    expect(radio("Gabarito", "C").disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Registrar gabarito oficial" }));
    const panel = screen.getByRole("region", { name: "Registro do gabarito oficial" });
    fireEvent.change(within(panel).getByLabelText("Situação do gabarito oficial"), { target: { value: "CHANGED_AFTER_APPEAL" } });
    fireEvent.click(within(within(panel).getByRole("radiogroup", { name: "Letra do gabarito oficial" })).getByRole("radio", { name: "C" }));
    const send = within(panel).getByRole("button", { name: "Registrar" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true); // falta fonte e motivo
    fireEvent.change(within(panel).getByLabelText("Fonte (documento e data)"), { target: { value: "Gabarito pós-recurso INEP 2024/1, 30/09/2026" } });
    expect(send.disabled).toBe(true); // falta o motivo
    // Enter no campo da fonte não salva a questão
    fireEvent.keyDown(within(panel).getByLabelText("Fonte (documento e data)"), { key: "Enter", code: "Enter" });
    fireEvent.change(within(panel).getByLabelText("Motivo da mudança"), { target: { value: "Recurso aceito pela banca." } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(calls("app_admin_set_official_answer")).toHaveLength(1));
    expect(calls("app_admin_set_official_answer")[0][1]).toEqual({
      p_question_id: "q1", p_answer: "C", p_status: "CHANGED_AFTER_APPEAL", p_source: "Gabarito pós-recurso INEP 2024/1, 30/09/2026",
      p_source_url: null, p_published_at: null, p_reason: "Recurso aceito pela banca.",
    });
    expect(await screen.findByText("Gabarito oficial registrado. 2 respostas de alunos foram corrigidas de novo.")).toBeTruthy();
    expect(calls("app_admin_save_question")).toHaveLength(0);
    // o formulário passa a mostrar o gabarito novo (recarregado do banco)
    await waitFor(() => expect(radio("Gabarito", "C").getAttribute("aria-checked")).toBe("true"));
    // marca "explicações a revisar"
    const review = screen.getByText(/O gabarito mudou de B para C/);
    expect(review.textContent).toContain("Explicação da B");
    expect(review.textContent).toContain("Conduta esperada");
    expect(review.textContent).toContain("o aluno não vê esses textos");
    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisadas" }));
    await waitFor(() => expect(calls("app_admin_question_review_done")).toEqual([["app_admin_question_review_done", { p_question_id: "q1" }]]));
    await waitFor(() => expect(screen.queryByText(/O gabarito mudou de B para C/)).toBeNull());
  });

  it("administrador: anular não pede letra", async () => {
    routes();
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar gabarito oficial" }));
    const panel = screen.getByRole("region", { name: "Registro do gabarito oficial" });
    fireEvent.change(within(panel).getByLabelText("Situação do gabarito oficial"), { target: { value: "ANNULLED" } });
    expect(within(panel).queryByRole("radiogroup", { name: "Letra do gabarito oficial" })).toBeNull();
    fireEvent.change(within(panel).getByLabelText("Fonte (documento e data)"), { target: { value: "Edital de anulação" } });
    fireEvent.change(within(panel).getByLabelText("Motivo da mudança"), { target: { value: "A banca anulou." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(calls("app_admin_set_official_answer")[0][1]).toMatchObject({ p_answer: null, p_status: "ANNULLED" }));
  });
});

describe("Q03 — prévia da importação", () => {
  const CSV = [
    "prova;numero;area;tema;enunciado;A;B;C;D;gabarito;explicacao",
    "Revalida 2024/1;20;Pediatria;Bronquiolite;Lactente de 4 meses com sibilância e coriza há 2 dias.;a;b;c;d;B;Nova explicação da B.",
    "Revalida 2024/1;22;Pediatria;Bronquiolite;Lactente de 4 meses com sibilância e coriza há 2 dias.;a;b;c;d;D;",
    "Revalida 2024/1;23;Pediatria;Bronquiolite;Lactente de 4 meses com sibilância e coriza há 2 dias.;a;b;c;d;B;",
  ].join("\n");

  it("antes de importar mostra novas e já existentes; com 'atualizar', quantas perderiam comentário e quantas têm gabarito diferente", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_questions") return { total: 0, exams: [], items: [] };
      if (fn === "app_admin_import_preview")
        return { new: 1, existing: 2, lose_comment: [{ index: 1, code: "REV-2024.1-Q020" }], answer_differs: [{ index: 2, code: "REV-2024.1-Q022", stored: "B", file: "D" }] };
      if (fn === "app_admin_import_questions") return { ok: true, inserted: 1, updated: 1, skipped: 0, answer_differs: 1 };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Carregar questões" }));
    const file = new File([CSV], "questoes.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => CSV });
    fireEvent.change(screen.getByLabelText("Arquivo de questões"), { target: { files: [file] } });
    expect(await screen.findByText("1 nova · 2 já existem (mesma prova e número)")).toBeTruthy();
    expect(calls("app_admin_import_preview")[0][1].p_questions).toHaveLength(3);
    expect(screen.getByText(/As 2 que já existem serão puladas/)).toBeTruthy();
    expect(screen.queryByText(/perderia o comentário gravado/)).toBeNull();

    fireEvent.click(screen.getByLabelText(/Atualizar as questões que já existem/));
    expect(screen.getByText("1 perderia o comentário gravado")).toBeTruthy();
    expect(screen.getByText(/REV-2024\.1-Q020/)).toBeTruthy();
    expect(screen.getByText("1 tem gabarito ou situação diferente do arquivo")).toBeTruthy();
    expect(screen.getByText(/REV-2024\.1-Q022 \(gravado B, no arquivo D\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Importar 3 questões" }));
    expect(await screen.findByText(/1 novas · 1 atualizadas · 0 já existiam \(puladas\) · 1 com gabarito ou situação diferente \(não mudaram\)/)).toBeTruthy();
  });
});

describe("Q04/Q05 — questão anulada para o aluno", () => {
  const ANNULLED = { is_correct: null, correct_option: null, annulled: true, explanation: null, option_notes: [], sources: [] };

  it("a correção diz 'Questão anulada pela banca', nunca 'A correta é null'", () => {
    const { container, rerender } = render(<Verdict selected="B" correction={ANNULLED} />);
    expect(container.textContent).toContain("Questão anulada pela banca");
    expect(container.textContent).not.toMatch(/null|A correta/);
    rerender(<Verdict selected={null} correction={ANNULLED} />);
    expect(container.textContent).toContain("Questão anulada pela banca");
    // servidor antigo (sem 'annulled'), mas sem gabarito: também não mostra "null"
    rerender(<Verdict selected="B" correction={{ is_correct: false, correct_option: null }} />);
    expect(container.textContent).toContain("Questão anulada pela banca");
    expect(container.textContent).not.toMatch(/null/);
  });

  it("anulada: nenhuma alternativa aparece como correta ou incorreta", () => {
    expect(["A", "B", "C", "D"].map((id) => answerState(id, "B", ANNULLED))).toEqual(["dimmed", "selected", "dimmed", "dimmed"]);
    expect(["A", "B", "C", "D"].map((id) => answerState(id, "C", { correct_option: "B", is_correct: false }))).toEqual(["dimmed", "correct", "incorrect", "dimmed"]);
  });

  it("resultado: a anulada fica fora de acertos, erros e em branco, com o filtro 'Anuladas'", () => {
    backend.rpc.mockImplementation(async () => null); // comentário publicado: nenhum
    const q = (n: number, selected: string | null, correction: any) => ({
      id: `q${n}`, number: n, area: "PEDIATRIA", exam: { kind: "REVALIDA", year: 2024, semester: 1, title: "Revalida 2024/1" },
      statement: `Caso clínico ${n}. Qual a conduta?`, options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}` })), images: [], selected, correction,
    });
    const sessionRow = {
      id: "s1", kind: "simulado", filters: { area: "" }, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      questions: [q(1, "B", { is_correct: true, correct_option: "B", annulled: false, option_notes: [], sources: [] }), q(2, "A", ANNULLED)],
      result: { total: 1, answered: 1, correct: 1, annulled: 1, active_seconds: 30, elapsed_seconds: 60, paused_seconds: 0, by_area: [{ area: "PEDIATRIA", total: 1, answered: 1, correct: 1 }] },
    };
    render(<SessionResult session={sessionRow} go={vi.fn()} />);
    expect(screen.getByText("100%")).toBeTruthy();
    const tabs = screen.getByRole("tablist", { name: "Filtrar questões" });
    expect(within(tabs).getByRole("tab", { name: /Todas.*2/ })).toBeTruthy();
    expect(within(tabs).getByRole("tab", { name: /Erradas.*0/ })).toBeTruthy();
    fireEvent.click(within(tabs).getByRole("tab", { name: /Anuladas.*1/ }));
    fireEvent.click(screen.getByRole("button", { name: /Caso clínico 2/ }));
    expect(screen.getByText(/Questão anulada pela banca/)).toBeTruthy();
    expect(screen.queryByLabelText("Correta")).toBeNull();
    expect(screen.queryByLabelText("Incorreta")).toBeNull();
  });
});

describe("Q14 — Preencher sem fonte em todos os campos pedidos", () => {
  const FIELDS = [{ name: "resumo", label: "Resumo", kind: "text", ai: "editar" }, { name: "passos", label: "Passos", kind: "text", ai: "editar" }];
  const LINE = { ready: true, label: "IA", model: "m", pending: null };
  const STATUS = { preencher: LINE, conferir: LINE, conversar: LINE };
  const R = (o: any) => ({ mode: "preencher", suggestions: [], findings: [], missing: [], reply: null, no_source: [], warnings: [], usage: null, ...o });
  const AVISO = "A biblioteca de fontes oficiais ainda não tem trecho sobre este tema. Cole o trecho da diretriz ou envie o PDF ou o link.";

  it("todos os campos pedidos voltaram 'Sem fonte': aviso claro no painel", async () => {
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: "" }} run={async () => R({ no_source: ["resumo", "passos"] })} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(AVISO)).toBeTruthy();
    expect(screen.getByText("Faltou fonte para este tema")).toBeTruthy();
  });

  it("só parte dos campos sem fonte: sem o aviso geral (cada campo diz o seu)", async () => {
    const S = { id: "s1", field: "passos", value: "Texto.", before: null, sources: [{ label: "p. 3", kind: "material" }], warnings: [], append: false, reason: null };
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: "" }} run={async () => R({ no_source: ["resumo"], suggestions: [S] })} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await screen.findByRole("region", { name: "Sugestão: Passos" });
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});
