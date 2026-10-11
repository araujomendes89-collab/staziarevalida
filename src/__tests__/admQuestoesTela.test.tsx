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

import { AdminQuestions, QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";
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

describe("Q06 — a lista da aba pagina de verdade", () => {
  const TOTAL = 230;
  const item = (n: number) => ({
    id: `q${n}`, code: `REV-2023.1-Q${String(n).padStart(3, "0")}`, exam_id: "revalida-2023-1", number: n, area: "PEDIATRIA", topic: `Tema ${n}`,
    status: "valid", needs_image: false, images: 0, correct_option: "B", excerpt: `Enunciado ${n}`, explanations_review: false,
  });
  /** O banco de verdade: devolve no máximo 200 por chamada, na posição pedida. */
  const serve = () => {
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn !== "app_admin_questions") throw new Error(`rpc não simulada: ${fn}`);
      const offset = args.p_offset ?? 0;
      const limit = Math.min(args.p_limit ?? 50, 200);
      return { total: TOTAL, exams: [], items: Array.from({ length: Math.max(Math.min(limit, TOTAL - offset), 0) }, (_, k) => item(offset + k + 1)) };
    });
  };
  const rows = () => screen.queryAllByRole("button", { name: /^Editar REV-/ });
  const more = () => screen.queryByRole("button", { name: "Carregar mais" });

  it("'Carregar mais' junta as páginas até a última questão (passa de 200) e depois o botão some", async () => {
    serve();
    render(<AdminQuestions />);
    expect(await screen.findByText("230 questões")).toBeTruthy();
    expect(rows()).toHaveLength(50);
    for (const expected of [100, 150, 200, 230]) {
      fireEvent.click(more()!);
      await waitFor(() => expect(rows()).toHaveLength(expected));
    }
    expect(more()).toBeNull();
    // sem repetir: a última é a 230 e a lista segue a ordem
    expect(rows().map((r) => r.getAttribute("aria-label"))).toEqual(Array.from({ length: TOTAL }, (_, k) => `Editar REV-2023.1-Q${String(k + 1).padStart(3, "0")}`));
    // cada pedido ao banco traz só a página nova, a partir de onde a lista parou
    const asked = backend.rpc.mock.calls.map((c: any[]) => [c[1].p_offset, c[1].p_limit]);
    expect(asked).toEqual([[0, 50], [50, 50], [100, 50], [150, 50], [200, 50]]);
  });

  it("salvar uma questão recarrega a lista sem perder as páginas já abertas (as 100 de antes, não só as 50 primeiras)", async () => {
    serve();
    const listCalls = backend.rpc.getMockImplementation()!;
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question") return { ...ROW, id: args.p_id, code: "REV-2023.1-Q004" };
      if (fn === "app_admin_save_question") return { ...ROW, id: "q4", code: "REV-2023.1-Q004", ...args.p_question };
      return listCalls(fn, args);
    });
    render(<AdminQuestions />);
    await screen.findByText("230 questões");
    fireEvent.click(more()!);
    await waitFor(() => expect(rows()).toHaveLength(100));

    fireEvent.click(rows()[3]);
    fireEvent.click(await screen.findByRole("button", { name: "Salvar questão" }));
    await screen.findByText("Questão salva.");
    // o recarregamento pede as 100 de uma vez, desde a primeira
    await waitFor(() => expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_questions").at(-1)![1]).toMatchObject({ p_offset: 0, p_limit: 100 }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à lista" }));
    await waitFor(() => expect(rows()).toHaveLength(100));
  });

  it("mudar o filtro de área recomeça na primeira página", async () => {
    serve();
    render(<AdminQuestions />);
    await screen.findByText("230 questões");
    fireEvent.click(more()!);
    await waitFor(() => expect(rows()).toHaveLength(100));
    fireEvent.change(screen.getByLabelText("Área"), { target: { value: "PEDIATRIA" } });
    await waitFor(() => expect(rows()).toHaveLength(50));
    expect(backend.rpc.mock.calls.at(-1)![1]).toMatchObject({ p_limit: 50, p_offset: 0, p_filters: { area: "PEDIATRIA" } });
  });
});

describe("Q11 — ajuda da importação completa e número de linha certo", () => {
  const CSV = [
    "prova;numero;area;tema;enunciado;A;B;C;D;gabarito;explicacao;situacao",
    "Revalida 2024/1;20;Pediatria;Bronquiolite;Lactente de 4 meses com coriza e sibilância há 2 dias. Qual a conduta?;a;b;c;d;B;;",
    "Revalida 2024/1;21;Pediatria;Bronquiolite;Lactente de 4 meses com coriza e sibilância há 2 dias. Qual a conduta?;a;b;c;d;ANULADA;Explicação geral.;",
    "Revalida 2024/1;22;Pediatria;Bronquiolite;Lactente de 4 meses com coriza e sibilância há 2 dias. Qual a conduta?;a;b;c;d;C;;",
  ].join("\n");
  const open = async () => {
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_questions") return { total: 0, exams: [], items: [] };
      if (fn === "app_admin_import_preview") return { new: 3, existing: 0, lose_comment: [], answer_differs: [] };
      if (fn === "app_admin_import_questions")
        return { ok: false, errors: [{ index: 2, number: "21", message: "Há alternativa sem texto." }, { index: 3, number: "22", message: "Questão repetida no arquivo." }] };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Carregar questões" }));
  };
  const pick = (name: string, text: string) => {
    const file = new File([text], name, { type: "text/plain" });
    Object.defineProperty(file, "text", { value: async () => text });
    fireEvent.change(screen.getByLabelText("Arquivo de questões"), { target: { files: [file] } });
  };

  it("a ajuda lista todas as colunas que o importador aceita e avisa da linha de exemplo", async () => {
    await open();
    const help = screen.getByTestId("ajuda-importacao").textContent ?? "";
    for (const column of ["prova", "numero", "area", "tema", "enunciado", "A, B, C, D", "gabarito", "subtema", "explicacao", "explicacao A", "conduta esperada", "o que avalia", "situacao", "fonte", "imagem"]) {
      expect(help, column).toContain(column);
    }
    expect(help).toMatch(/linha de exemplo/);
    expect(help).toMatch(/ANULADA/);
    expect(help).toMatch(/explicação geral/);
  });

  it("o erro do banco diz a linha do arquivo (não a posição na lista) e o aviso da anulada aparece sem travar", async () => {
    await open();
    pick("questoes.csv", CSV);
    expect(await screen.findByText("3 novas · 0 já existem (mesma prova e número)")).toBeTruthy();
    expect(screen.getByText(/1 questão anulada tem explicação geral no arquivo/)).toBeTruthy();
    expect(screen.getByText(/Linha 3 \(questão 21\): A explicação geral não é gravada/)).toBeTruthy(); // a questão 21 está na linha 3 da planilha
    fireEvent.click(screen.getByRole("button", { name: "Importar 3 questões" }));
    // posição 2 na lista = linha 3 da planilha (a linha 1 é o cabeçalho); posição 3 = linha 4
    expect(await screen.findByText(/Linha 3: Há alternativa sem texto\. · Linha 4: Questão repetida no arquivo\./)).toBeTruthy();
    expect(screen.queryByText(/Item 2/)).toBeNull();
  });

  it("com linha em branco na planilha, o erro do banco aponta a linha que a pessoa vê no Excel", async () => {
    await open();
    const [header, a, b, c] = CSV.split("\n");
    // a linha 1 é o cabeçalho; a questão 20 está na 2; depois vêm uma linha só de ;;; e uma vazia; a 21 está na 5 e a 22 na 6
    pick("questoes.csv", [header, a, ";;;;;;;;;;;;", "", b, c].join("\n"));
    expect(await screen.findByText("3 novas · 0 já existem (mesma prova e número)")).toBeTruthy();
    expect(screen.getByText(/Linha 5 \(questão 21\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Importar 3 questões" }));
    expect(await screen.findByText(/Linha 5: Há alternativa sem texto\. · Linha 6: Questão repetida no arquivo\./)).toBeTruthy();
  });

  it("em JSON o número continua sendo o do item", async () => {
    await open();
    const json = JSON.stringify([
      { prova: "Revalida 2024/1", numero: 20, area: "Pediatria", tema: "T", enunciado: "Lactente de 4 meses com coriza e sibilância há 2 dias.", A: "a", B: "b", C: "c", D: "d", gabarito: "B" },
      { prova: "Revalida 2024/1", numero: 21, area: "Pediatria", tema: "T", enunciado: "Lactente de 4 meses com coriza e sibilância há 2 dias.", A: "a", B: "b", C: "c", D: "d", gabarito: "B" },
      { prova: "Revalida 2024/1", numero: 22, area: "Pediatria", tema: "T", enunciado: "Lactente de 4 meses com coriza e sibilância há 2 dias.", A: "a", B: "b", C: "c", D: "d", gabarito: "B" },
    ]);
    pick("questoes.json", json);
    await screen.findByText("3 novas · 0 já existem (mesma prova e número)");
    fireEvent.click(screen.getByRole("button", { name: "Importar 3 questões" }));
    expect(await screen.findByText(/Item 2: Há alternativa sem texto\. · Item 3: Questão repetida no arquivo\./)).toBeTruthy();
  });
});

describe("Leva 2 — 'Marcar como revisadas' quando outra pessoa reescreveu um texto marcado", () => {
  it("o banco recusa, a tela mostra o motivo e já traz o texto de agora para a pessoa ler", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    const flagged = { ...ROW, correct_option: "C", status: "changed_after_appeal", explanations_review: { de: "B", para: "C", campos: ["expected_conduct"] } };
    let current: any = flagged;
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_question") return current;
      if (fn === "app_admin_question_review_done") {
        current = { ...current, expected_conduct: "Conduta reescrita pela outra pessoa." }; // a outra pessoa salvou enquanto esta revisava
        throw Object.assign(new Error("O texto desta questão mudou enquanto você revisava: outra pessoa salvou uma explicação ou a conduta esperada. Veja o texto de agora e revise de novo."), { code: "22023" });
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Marcar como revisadas" }));
    expect(await screen.findByText(/O texto desta questão mudou enquanto você revisava/)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Conduta esperada") as HTMLTextAreaElement).value).toBe("Conduta reescrita pela outra pessoa."));
    // a marca continua e o botão não pede para salvar (o formulário é o gravado)
    expect(screen.getByRole("button", { name: "Marcar como revisadas" })).toBeTruthy();
  });
});
