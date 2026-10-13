/**
 * Correções da aba Questões, nas telas (jsdom, banco simulado). As regras de verdade estão em correcoesQuestoesBanco.test.ts.
 *   Q01: a recusa "Essa questão já existe" aparece no editor de questão nova.
 *   Q02: gabarito e situação de questão já gravada ficam travados; o administrador muda pelo registro do gabarito oficial
 *        (fonte e motivo obrigatórios); a marca "explicações a revisar" aparece e sai com "Marcar como revisadas", que salva
 *        antes o formulário mudado (rodada 2: tirar a marca nunca libera ao aluno o texto antigo).
 *   Q03: a importação mostra antes quantas são novas, quantas perderiam comentário e quantas têm gabarito diferente.
 *   Q04/Q05: questão anulada aparece como "Questão anulada pela banca", fora de acertos e erros, sem "Explicação clínica" nem
 *        "Por que não as outras?" (rodada 2).
 *   Q14: Preencher sem fonte em todos os campos pedidos mostra o aviso da biblioteca de fontes.
 *   Leva 2: anulada sem o botão do Tutor e com o texto certo no lugar das explicações; a marca de gabarito que voltou à
 *        letra de antes da troca; o aviso do Q14 no caso comum (Subtema ou Tema pedidos) e com material já enviado;
 *        importar só depois da prévia.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
// o botão do Tutor como aparece dentro do app (fora do app, sem o provedor, ele não aparece)
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));

import { AdminQuestions, QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";
import { Correction, Verdict, answerState } from "../novo/app/practice/Correction.jsx";
import { SessionResult } from "../novo/app/practice/SessionResult.jsx";
import { AssistantPanel } from "../novo/app/admin/assistant/AssistantPanel.jsx";
import { QUESTOES_SPEC } from "../shared/adminAssistant/questoes";
import { ASSIST_TEXTS } from "../shared/adminAssistant/types";

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
    // o banco só tira a marca que a pessoa viu (se outra pessoa mudou a marca ou um texto marcado enquanto isso, ele recusa)
    const SEEN = { explanation_A: "", explanation_B: "B é a correta.", explanation_C: "", explanation_D: "", expected_conduct: "Suporte." };
    await waitFor(() =>
      expect(calls("app_admin_question_review_done")).toEqual([
        ["app_admin_question_review_done", { p_question_id: "q1", p_seen: { de: "B", para: "C", campos: ["expected_conduct", "explanation_B"], motivo: "Recurso aceito pela banca." }, p_seen_texts: SEEN }],
      ])
    );
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

  it("marca com a análise publicada: diz que ela só volta com nova análise aprovada, depois de marcar como revisadas", async () => {
    routes({ ...ROW, correct_option: "C", status: "changed_after_appeal", explanations_review: { de: "B", para: "C", campos: ["analise", "explanation_B"] } });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const review = await screen.findByText(/O gabarito mudou de B para C\./);
    expect(review.textContent).toContain("Revise: Análise publicada (volta com nova análise aprovada, depois de marcar como revisadas), Explicação da B.");
  });

  it("anulada pelo registro: a marca diz que o gabarito mudou para anulada e que a análise não volta", async () => {
    routes({
      ...ROW, status: "annulled", official: { ...ROW.official, answer: null, answer_status: "ANNULLED", version: 2 },
      explanations_review: { de: "B", para: "ANULADA", campos: ["analise", "explanation_A", "explanation_B"] },
    });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const review = await screen.findByText(/O gabarito mudou de B para anulada pela banca\./);
    expect(review.textContent).toContain("Revise: Análise publicada (não aparece ao aluno em questão anulada), Explicação da A, Explicação da B.");
    // carga das explicações (12/10/2026): em anulada, o aluno só vê as explicações de estudo ("Defensável."/"Incorreta."), nunca "Correta."
    expect(screen.getByText(/Questão anulada: o aluno vê a explicação de cada alternativa só como estudo.*nunca “Correta\.”/)).toBeTruthy();
  });
});

describe("Rodada 2 — 'Marcar como revisadas' nunca libera ao aluno o texto antigo", () => {
  const FLAGGED = {
    ...ROW, correct_option: "C", status: "changed_after_appeal",
    official: { ...ROW.official, answer: "C", answer_status: "CHANGED_AFTER_APPEAL", version: 2 },
    explanations_review: { de: "B", para: "C", campos: ["expected_conduct", "explanation_B"] },
  };
  const routes = (saveError: Error | null = null) => {
    let current: any = FLAGGED;
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question") return current;
      if (fn === "app_admin_save_question") {
        if (saveError) throw saveError;
        return (current = { ...current, ...args.p_question });
      }
      if (fn === "app_admin_question_review_done") return (current = { ...current, explanations_review: null });
      throw new Error(`rpc não simulada: ${fn}`);
    });
  };
  const rewrite = async () => {
    await screen.findByText(/O gabarito mudou de B para C/);
    fireEvent.change(screen.getByLabelText("Explicação da B (opcional)"), { target: { value: "B era a do gabarito preliminar." } });
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Conduta da C." } });
  };
  const order = () => backend.rpc.mock.calls.map((c: any[]) => c[0]).filter((fn: string) => fn !== "app_admin_question");

  it("com o formulário mudado, salva a questão antes de tirar a marca", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    routes();
    const onSaved = vi.fn();
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={onSaved} />);
    expect(await screen.findByRole("button", { name: "Marcar como revisadas" })).toBeTruthy();
    await rewrite();
    // com mudança não salva, o botão diz que salva antes
    fireEvent.click(screen.getByRole("button", { name: "Salvar e marcar como revisadas" }));
    await waitFor(() => expect(calls("app_admin_question_review_done")).toHaveLength(1));
    expect(order()).toEqual(["app_admin_save_question", "app_admin_question_review_done"]);
    // a marca que a pessoa viu na tela (e não a que o salvar devolveu): é ela que o banco confere
    expect(calls("app_admin_question_review_done")[0][1]).toEqual({
      p_question_id: "q1", p_seen: FLAGGED.explanations_review,
      p_seen_texts: { explanation_A: "", explanation_B: "B era a do gabarito preliminar.", explanation_C: "", explanation_D: "", expected_conduct: "Conduta da C." },
    });
    const sent = calls("app_admin_save_question")[0][1].p_question;
    expect(sent.expected_conduct).toBe("Conduta da C.");
    expect(sent.options.find((o: any) => o.id === "B").explanation).toBe("B era a do gabarito preliminar.");
    await waitFor(() => expect(screen.queryByText(/O gabarito mudou de B para C/)).toBeNull());
    expect((screen.getByLabelText("Conduta esperada") as HTMLTextAreaElement).value).toBe("Conduta da C.");
  });

  it("se o salvar falhar, a marca fica e o aluno continua sem os textos antigos", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    routes(Object.assign(new Error("Preencha o tema da questão."), { code: "22023" }));
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await rewrite();
    fireEvent.click(screen.getByRole("button", { name: /marcar como revisadas/i }));
    expect(await screen.findByText(/Preencha o tema da questão\./)).toBeTruthy();
    expect(calls("app_admin_question_review_done")).toHaveLength(0);
    expect(screen.getByText(/O gabarito mudou de B para C/)).toBeTruthy();
  });
});

describe("Leva 2 — 'Marcar como revisadas' com a marca mudada por outra pessoa", () => {
  it("o banco recusa, a tela mostra o motivo e a marca de agora (com o texto novo a revisar) e nada é liberado", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    let current: any = {
      ...ROW, correct_option: "C", status: "changed_after_appeal",
      explanations_review: { de: "B", para: "C", campos: ["expected_conduct", "explanation_B"] },
    };
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_question") return current;
      if (fn === "app_admin_question_review_done") {
        // enquanto a pessoa revisava, outra registrou outra troca: a marca ganhou a explicação da D
        current = { ...current, correct_option: "D", explanations_review: { de: "B", para: "D", campos: ["expected_conduct", "explanation_B", "explanation_D"] } };
        throw Object.assign(new Error("A marca de revisão mudou enquanto você revisava: outra pessoa registrou uma troca de gabarito. Veja a marca de agora e revise o que mudou."), { code: "22023" });
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Marcar como revisadas" }));
    expect(await screen.findByText(/A marca de revisão mudou enquanto você revisava/)).toBeTruthy();
    expect(await screen.findByText(/O gabarito mudou de B para D\. Revise: Conduta esperada, Explicação da B, Explicação da D\./)).toBeTruthy();
    expect(calls("app_admin_question_review_done")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Marcar como revisadas" })).toBeTruthy();
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

  it("anulada com a letra guardada e textos antigos: sem 'Explicação clínica' nem 'Por que não as outras?' (rodada 2)", async () => {
    backend.rpc.mockImplementation(async () => null); // comentário publicado: nenhum
    const old = { ...ANNULLED, correct_option: "B", explanation: "B é a correta porque X.", option_notes: [{ id: "A", text: "A está errada." }, { id: "C", text: "C está errada." }], expected_conduct: "Suporte." };
    const { container } = render(<Correction selected="B" correction={old} question={{ id: "q9", area: "PEDIATRIA" }} />);
    expect(container.textContent).toContain("Questão anulada pela banca");
    await waitFor(() => expect(calls("app_question_commentary")).toHaveLength(1));
    expect(container.textContent).not.toContain("Explicação clínica");
    expect(container.textContent).not.toContain("B é a correta");
    expect(container.textContent).not.toContain("Por que não as outras?");
    expect(container.textContent).not.toContain("A está errada.");
    expect(container.textContent).toContain("Suporte.");
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
  // o painel pede essas propriedades (sem valor padrão); aqui não há aviso da aba, link do documento, descarte nem fechar
  const PANEL = { notice: undefined, materialLink: undefined, onDiscard: vi.fn(), onClose: undefined };

  it("todos os campos pedidos voltaram 'Sem fonte': aviso claro no painel", async () => {
    render(<AssistantPanel {...PANEL} status={STATUS} fields={FIELDS} values={{ resumo: "", passos: "" }} run={async () => R({ no_source: ["resumo", "passos"] })} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(AVISO)).toBeTruthy();
    expect(screen.getByText("Faltou fonte para este tema")).toBeTruthy();
  });

  it("só parte dos campos sem fonte: sem o aviso geral (cada campo diz o seu)", async () => {
    const S = { id: "s1", field: "passos", value: "Texto.", before: null, sources: [{ label: "p. 3", kind: "material" }], warnings: [], append: false, reason: null };
    render(<AssistantPanel {...PANEL} status={STATUS} fields={FIELDS} values={{ resumo: "", passos: "" }} run={async () => R({ no_source: ["resumo"], suggestions: [S] })} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await screen.findByRole("region", { name: "Sugestão: Passos" });
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});

describe("Leva 2 — anulada na correção do aluno", () => {
  const ANNULLED = { is_correct: null, correct_option: "B", annulled: true, explanation: null, option_notes: [], expected_conduct: null, sources: [] };

  it("anulada: sem o botão do Tutor (ele não abre questão anulada) e com o texto certo no lugar das explicações", async () => {
    backend.rpc.mockImplementation(async () => null);
    const { container } = render(<Correction selected="B" correction={ANNULLED} question={{ id: "q9", area: "PEDIATRIA" }} />);
    expect(container.textContent).toContain("Questão anulada pela banca. Não conta como acerto nem erro.");
    expect(screen.getByText("Nenhuma alternativa conta como correta, por isso não há explicação de cada alternativa.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tutor/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Criar flashcard" })).toBeTruthy();
  });

  it("questão que vale: o botão do Tutor continua, sem o texto da anulada", async () => {
    backend.rpc.mockImplementation(async () => null);
    render(<Correction selected="C" correction={{ is_correct: false, correct_option: "B", annulled: false, option_notes: [], sources: [] }} question={{ id: "q8", area: "PEDIATRIA" }} />);
    expect(screen.getByRole("button", { name: "Discutir com o Tutor" })).toBeTruthy();
    expect(screen.queryByText(/Nenhuma alternativa conta como correta/)).toBeNull();
    await waitFor(() => expect(calls("app_attempt_diagnosis")).toHaveLength(1));
  });
});

describe("Leva 2 — gabarito que voltou à letra de antes da troca", () => {
  it("a marca não diz 'mudou de B para B': diz que voltou e o que mudou durante a troca", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_question") return { ...ROW, explanations_review: { de: "B", para: "B", campos: ["explanation_A", "explanation_C"] } };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const review = await screen.findByText(/O gabarito voltou para B/);
    expect(review.textContent).toBe(
      "O gabarito voltou para B, o mesmo de antes da troca. Revise o que mudou durante a troca: Explicação da A, Explicação da C. Até lá, o aluno não vê esses textos."
    );
    expect(screen.queryByText(/mudou de B para B/)).toBeNull();
  });
});

describe("Leva 2 — Q14: aviso de falta de fonte no caso comum e quando já há material", () => {
  const LINE = { ready: true, label: "IA", model: "m", pending: null };
  const STATUS = { preencher: LINE, conferir: LINE, conversar: LINE };
  const R = (o: any) => ({ mode: "preencher", suggestions: [], findings: [], missing: [], reply: null, no_source: [], warnings: [], usage: null, ...o });
  const PANEL = { notice: undefined, materialLink: undefined, onDiscard: vi.fn(), onClose: undefined };
  // questão importada sem subtema e sem explicações (a conduta já está escrita): o Preencher já vem com as explicações, "O
  // que a questão avalia" e o Subtema marcados
  const VALUES = QUESTOES_SPEC.values({ ...ROW, options: ROW.options.map((o) => ({ ...o, explanation: "" })) });
  const FONTE = ["explanation_A", "explanation_B", "explanation_C", "explanation_D", "inep_intent"];
  const SUBTEMA = { id: "s1", field: "subtopic", value: "Manejo", before: null, sources: [{ label: "Item: Tema", kind: "item" }], warnings: [], append: false, reason: null };
  const panel = (result: any) => {
    const run = vi.fn(async () => R(result));
    render(<AssistantPanel {...PANEL} status={STATUS} fields={QUESTOES_SPEC.fields} values={VALUES} material="material" run={run} onUse={vi.fn()} />);
    return run;
  };

  it("questão sem subtema: o Subtema vai para a IA, as explicações voltam 'Sem fonte' e o aviso aparece", async () => {
    const run = panel({ no_source: FONTE, suggestions: [SUBTEMA], source_passages: { material: 0, official: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(ASSIST_TEXTS.noSourceAll)).toBeTruthy();
    expect(screen.getByText(ASSIST_TEXTS.noSourceAllTitle)).toBeTruthy();
    expect((run.mock.calls[0] as any[])[1].fields).toEqual([...FONTE.slice(0, 4), "inep_intent", "subtopic"]);
  });

  it("Tema pedido de propósito também não esconde o aviso", async () => {
    panel({ no_source: FONTE, suggestions: [SUBTEMA], source_passages: { material: 0, official: 0 } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Tema" }));
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(ASSIST_TEXTS.noSourceAll)).toBeTruthy();
  });

  it("com material enviado: diz que o material não sustentou os campos, não que a biblioteca não tem trecho", async () => {
    panel({ no_source: FONTE, suggestions: [SUBTEMA], source_passages: { material: 2, official: 0 } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Trecho da diretriz sobre outro assunto." } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(ASSIST_TEXTS.noSourceAllMaterial)).toBeTruthy();
    expect(screen.queryByText(ASSIST_TEXTS.noSourceAll)).toBeNull();
  });

  it("com trecho oficial encontrado e sem material: diz que os trechos da biblioteca não sustentam os campos", async () => {
    panel({ no_source: FONTE, suggestions: [SUBTEMA], source_passages: { material: 0, official: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(ASSIST_TEXTS.noSourceAllOfficial)).toBeTruthy();
    expect(screen.queryByText(ASSIST_TEXTS.noSourceAll)).toBeNull();
  });

  it("servidor sem a contagem de trechos: com material colado, também não diz que a biblioteca não tem trecho", async () => {
    panel({ no_source: FONTE, suggestions: [SUBTEMA] });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Trecho da diretriz sobre outro assunto." } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(ASSIST_TEXTS.noSourceAllMaterial)).toBeTruthy();
  });

  it("explicação recusada pela aba (questão anulada) não conta: o aviso sai pelos campos que ficaram sem fonte", async () => {
    const missing = FONTE.slice(0, 4).map((field) => ({ field, reason: ASSIST_TEXTS.annulled }));
    panel({ no_source: ["inep_intent"], missing, suggestions: [SUBTEMA], source_passages: { material: 0, official: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(ASSIST_TEXTS.noSourceAll)).toBeTruthy();
  });
});

describe("Leva 2 — Importar só depois da prévia", () => {
  const CSV = [
    "prova;numero;area;tema;enunciado;A;B;C;D;gabarito;explicacao",
    "Revalida 2024/1;20;Pediatria;Bronquiolite;Lactente de 4 meses com sibilância e coriza há 2 dias.;a;b;c;d;B;Nova explicação da B.",
  ].join("\n");

  it("o botão de importar fica travado enquanto a prévia carrega ou se ela falhar; 'Conferir de novo' tenta outra vez", async () => {
    let tries = 0;
    let finish: (value: unknown) => void = () => {};
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_questions") return { total: 0, exams: [], items: [] };
      if (fn === "app_admin_import_preview") {
        tries += 1;
        if (tries === 1) throw new Error("Falha de conexão.");
        return new Promise((resolve) => (finish = resolve));
      }
      if (fn === "app_admin_import_questions") return { ok: true, inserted: 0, updated: 1, skipped: 0, answer_differs: 0 };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Carregar questões" }));
    const file = new File([CSV], "questoes.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => CSV });
    fireEvent.change(screen.getByLabelText("Arquivo de questões"), { target: { files: [file] } });
    const importButton = () => screen.getByRole("button", { name: "Importar 1 questão" }) as HTMLButtonElement;

    // a prévia falhou: não dá para gravar sem ela
    expect(await screen.findByText(/Falha de conexão\./)).toBeTruthy();
    expect(screen.getByText(/A importação só fica liberada depois dessa conferência\./)).toBeTruthy();
    expect(importButton().disabled).toBe(true);

    // de novo: enquanto confere, continua travado
    fireEvent.click(screen.getByRole("button", { name: "Conferir de novo" }));
    expect(await screen.findByText("Conferindo o arquivo com o banco…")).toBeTruthy();
    expect(importButton().disabled).toBe(true);
    fireEvent.click(importButton());
    expect(calls("app_admin_import_questions")).toHaveLength(0);

    // com a prévia na tela, libera
    finish({ new: 0, existing: 1, lose_comment: [{ index: 1, code: "REV-2024.1-Q020" }], answer_differs: [] });
    expect(await screen.findByText("0 novas · 1 já existe (mesma prova e número)")).toBeTruthy();
    await waitFor(() => expect(importButton().disabled).toBe(false));
    fireEvent.click(screen.getByLabelText(/Atualizar as questões que já existem/));
    expect(screen.getByText("1 perderia o comentário gravado")).toBeTruthy();
    fireEvent.click(importButton());
    await waitFor(() => expect(calls("app_admin_import_questions")).toHaveLength(1));
  });
});
