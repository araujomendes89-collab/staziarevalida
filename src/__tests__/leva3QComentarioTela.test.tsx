/**
 * Leva 3, aba Questões, Q09, nas telas (jsdom, banco simulado): o editor mostra o comentário em revisão (quem mexeu, o que espera,
 * devolução do revisor), quem pode decidir aprova ou devolve com a nota, a lista marca e filtra as questões em revisão, e o
 * revisor médico sem papel de equipe vê só a fila das áreas dele. As regras de verdade estão em leva3QComentarioBanco.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "editor", profile: { name: "Ed" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
// editor profissional (013120): nos testes antigos o campo vira um textarea com o mesmo rótulo
vi.mock("../novo/app/editorPro/CampoRico.jsx", () => import("./helpers/campoRicoComoTexto"));

import { AdminQuestions, QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";

const EXPLAINED = { A: "A está errada.", B: "B é a correta: suporte.", C: "C está errada.", D: "D está errada." };
const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 0, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: "Lactente com desconforto respiratório há dois dias.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: (EXPLAINED as any)[id] })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo.", needs_image: false, images: [], explanations_review: null,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito", source_url: null, published_at: null },
  comment_review: null, comment_can_review: false, comment_review_by: null, comment_decision: null, comment_review_ready: true,
};
const IN_REVIEW = { ...ROW, comment_review: { campos: ["expected_conduct", "explanation_B"], desde: "2026-10-11T12:00:00Z", por: "u1", ia: false }, comment_review_by: "Editora" };
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

let current: any;
function routes(row: any, extra: Record<string, (args: any) => any> = {}) {
  current = row;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (extra[fn]) return extra[fn](args);
    if (fn === "app_admin_question") return current;
    throw new Error(`rpc não simulada: ${fn}`);
  });
}
const open = async (row: any, extra: Record<string, (args: any) => any> = {}, as = { role: "editor", profile: { name: "Ed" } }) => {
  session.boot = as;
  routes(row, extra);
  const onSaved = vi.fn();
  render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={onSaved} />);
  await screen.findByRole("button", { name: "Salvar questão" });
  return { onSaved };
};

beforeEach(() => {
  session.boot = { role: "editor", profile: { name: "Ed" } };
});
afterEach(cleanup);

describe("Q09 — editor: comentário em revisão", () => {
  it("questão sem comentário em revisão: sem aviso de revisão", async () => {
    await open(ROW);
    expect(screen.queryByText("Comentário em revisão")).toBeNull();
  });

  it("mostra o que espera revisão, quem mexeu e que o aluno não vê; para quem não decide, diz quem decide", async () => {
    await open(IN_REVIEW);
    const banner = (await screen.findByText("Comentário em revisão")).closest("[role=status]") as HTMLElement;
    expect(banner.textContent).toMatch(/Explicação da B, Conduta esperada/);
    expect(banner.textContent).toMatch(/Editora/);
    expect(banner.textContent).toMatch(/O aluno não vê esses textos até um revisor médico aprovar/);
    expect(banner.textContent).toMatch(/revisor médico cadastrado em Pediatria ou um administrador/);
    expect(within(banner).queryByRole("button", { name: /Aprovar comentário/ })).toBeNull();
  });

  it("texto vindo do assistente de IA diz que veio dele", async () => {
    await open({ ...IN_REVIEW, comment_review: { ...IN_REVIEW.comment_review, ia: true } });
    expect((await screen.findByText("Comentário em revisão")).closest("[role=status]")!.textContent).toMatch(/sugerido pelo assistente de IA/);
  });

  it("devolução do revisor aparece com a nota e quem devolveu", async () => {
    await open({ ...IN_REVIEW, comment_review: { ...IN_REVIEW.comment_review, devolvido: { por: "u2", em: "2026-10-11T13:00:00Z", nota: "A conduta cita um fármaco fora da diretriz." } }, comment_decision: { decision: "return", note: "A conduta cita um fármaco fora da diretriz.", at: "2026-10-11T13:00:00Z", by: "Dra. Revisora" } });
    const banner = (await screen.findByText("Comentário em revisão")).closest("[role=status]") as HTMLElement;
    expect(banner.textContent).toMatch(/Devolvido por Dra\. Revisora/);
    expect(banner.textContent).toMatch(/A conduta cita um fármaco fora da diretriz\./);
  });

  it("quem pode decidir aprova com a nota do que conferiu; o banco recebe os textos gravados que ele viu; a faixa some", async () => {
    const decide = vi.fn(() => ({ ...ROW, comment_review: null, comment_can_review: true }));
    const { onSaved } = await open({ ...IN_REVIEW, comment_can_review: true }, { app_admin_question_comment_decide: decide }, { role: "admin", profile: { name: "Adm" } });
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    const panel = screen.getByRole("region", { name: "Decisão sobre o comentário" });
    const confirm = within(panel).getByRole("button", { name: "Aprovar e liberar ao aluno" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText("O que você conferiu"), { target: { value: "curto" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText("O que você conferiu"), { target: { value: "Conferi a explicação e a conduta nas diretrizes vigentes." } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    const args = (decide.mock.calls[0] as any[])[0];
    expect(args).toEqual({
      p_question_id: "q1", p_decision: "approve", p_note: "Conferi a explicação e a conduta nas diretrizes vigentes.",
      p_seen_texts: { explanation_A: "A está errada.", explanation_B: "B é a correta: suporte.", explanation_C: "C está errada.", explanation_D: "D está errada.", expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo." },
    });
    expect(await screen.findByText("Comentário aprovado: o aluno já pode ver.")).toBeTruthy();
    expect(screen.queryByText("Comentário em revisão")).toBeNull();
    expect(onSaved).toHaveBeenCalled();
  });

  it("devolver exige o motivo, mantém a faixa e mostra a devolução", async () => {
    const decide = vi.fn((a: any) => ({ ...IN_REVIEW, comment_can_review: true, comment_review: { ...IN_REVIEW.comment_review, devolvido: { por: "u2", em: "2026-10-11T13:00:00Z", nota: a.p_note } }, comment_decision: { decision: "return", note: a.p_note, at: "2026-10-11T13:00:00Z", by: "Adm" } }));
    await open({ ...IN_REVIEW, comment_can_review: true }, { app_admin_question_comment_decide: decide }, { role: "admin", profile: { name: "Adm" } });
    fireEvent.click(await screen.findByRole("button", { name: "Devolver para ajustes" }));
    const panel = screen.getByRole("region", { name: "Decisão sobre o comentário" });
    const send = within(panel).getByRole("button", { name: "Devolver ao editor" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText("Motivo da devolução"), { target: { value: "A conduta precisa citar a oximetria." } });
    fireEvent.click(send);
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect((decide.mock.calls[0] as any[])[0]).toMatchObject({ p_decision: "return", p_note: "A conduta precisa citar a oximetria." });
    expect(await screen.findByText(/Devolvido por Adm/)).toBeTruthy();
    expect(screen.getByText("Comentário em revisão")).toBeTruthy();
  });

  it("com mudança não salva no formulário, a decisão fica travada (o revisor só aprova o que está gravado)", async () => {
    await open({ ...IN_REVIEW, comment_can_review: true }, {}, { role: "admin", profile: { name: "Adm" } });
    fireEvent.change(await screen.findByLabelText("Conduta esperada"), { target: { value: "Suporte ventilatório e oximetria." } });
    const button = screen.getByRole("button", { name: "Aprovar comentário" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Salve a questão antes de decidir/)).toBeTruthy();
  });

  it("a recusa do banco (texto mudou enquanto lia) aparece e o editor traz a questão de agora", async () => {
    const decide = vi.fn(() => {
      throw Object.assign(new Error("O comentário mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo."), { code: "22023" });
    });
    await open({ ...IN_REVIEW, comment_can_review: true }, { app_admin_question_comment_decide: decide }, { role: "admin", profile: { name: "Adm" } });
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi tudo nas diretrizes vigentes." } });
    const before = calls("app_admin_question").length;
    current = { ...IN_REVIEW, comment_can_review: true, expected_conduct: "Conduta reescrita por outra pessoa." };
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    expect(await screen.findByText(/O comentário mudou enquanto você revisava/)).toBeTruthy();
    await waitFor(() => expect(calls("app_admin_question").length).toBeGreaterThan(before));
    expect(((await screen.findByLabelText("Conduta esperada")) as HTMLTextAreaElement).value).toBe("Conduta reescrita por outra pessoa.");
    expect(screen.getByText("Comentário em revisão")).toBeTruthy();
  });

  it("antes de salvar, avisa que mudar a explicação, a conduta ou o 'o que avalia' manda o texto para revisão", async () => {
    await open(ROW);
    const WARNING = "O comentário vai para revisão";
    expect(screen.queryByText(WARNING)).toBeNull();
    // enunciado, tema e espaços não contam
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Bronquiolite aguda" } });
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "  Suporte ventilatório.  " } });
    expect(screen.queryByText(WARNING)).toBeNull();
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Suporte ventilatório e oximetria." } });
    const banner = screen.getByText(WARNING).closest("[role=status]") as HTMLElement;
    expect(banner.textContent).toMatch(/o aluno deixa de ver/i);
    expect(banner.textContent).toMatch(/Conduta esperada/);
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Suporte ventilatório." } });
    expect(screen.queryByText(WARNING)).toBeNull();
    fireEvent.change(screen.getByLabelText("Explicação da C (opcional)"), { target: { value: "C está errada, outro motivo." } });
    expect(screen.getByText(WARNING).closest("[role=status]")!.textContent).toMatch(/Explicação da C/);
  });

  it("questão nova com comentário também avisa; sem comentário, não", async () => {
    session.boot = { role: "editor", profile: { name: "Ed" } };
    routes(ROW);
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} commentReviewReady />);
    await screen.findByRole("button", { name: "Criar questão" });
    expect(screen.queryByText("O comentário vai para revisão")).toBeNull();
    fireEvent.change(screen.getByLabelText("O que a questão avalia"), { target: { value: "Avalia o manejo." } });
    expect(screen.getByText("O comentário vai para revisão")).toBeTruthy();
  });
});

describe("Q09 — lista da equipe", () => {
  const listRoutes = () => {
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_questions") {
        const only = args.p_filters?.comment_review;
        const items = [
          { id: "q1", code: "REV-2024.1-Q001", area: "PEDIATRIA", topic: "Bronquiolite", status: "valid", needs_image: false, images: 0, excerpt: "Lactente…", comment_review: true, explanations_review: false },
          { id: "q2", code: "REV-2024.1-Q002", area: "PEDIATRIA", topic: "Asma", status: "valid", needs_image: false, images: 0, excerpt: "Criança…", comment_review: false, explanations_review: false },
        ].filter((i) => !only || i.comment_review);
        return { total: items.length, exams: [], items, comment_review_ready: true };
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
  };

  it("marca a questão com comentário em revisão e filtra", async () => {
    listRoutes();
    render(<AdminQuestions />);
    const row = (await screen.findByRole("button", { name: "Editar REV-2024.1-Q001" })) as HTMLElement;
    expect(within(row).getByText("Comentário em revisão")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Editar REV-2024.1-Q002" })).queryByText("Comentário em revisão")).toBeNull();
    fireEvent.click(screen.getByLabelText("Só as com comentário em revisão (esperando o revisor médico)"));
    await waitFor(() => expect(calls("app_admin_questions").some((c: any[]) => c[1].p_filters.comment_review === true)).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Editar REV-2024.1-Q002" })).toBeNull());
    expect(screen.getByRole("button", { name: "Editar REV-2024.1-Q001" })).toBeTruthy();
  });
});

describe("Q09 — fila do revisor médico (sem papel de equipe)", () => {
  const ITEM = { id: "q1", code: "REV-2024.1-Q001", area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", status: "valid", excerpt: "Lactente com desconforto…", campos: ["expected_conduct", "explanation_B"], since: "2026-10-11T12:00:00Z", ia: false, returned: false, can_review: true };
  const VIEW = {
    id: "q1", code: "REV-2024.1-Q001", area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", subtopic: "Manejo", exam: "Revalida 2024/1", number: 1,
    statement: "Lactente com desconforto respiratório há dois dias.", correct_option: "B", status: "valid",
    options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: (EXPLAINED as any)[id] })),
    expected_conduct: "Suporte ventilatório e oximetria.", inep_intent: "Avalia o manejo.",
    comment_review: { campos: ["expected_conduct", "explanation_B"], desde: "2026-10-11T12:00:00Z", por: "u1", ia: true }, comment_review_by: "Editora", can_review: true, comment_decision: null,
  };
  let queue: any[];
  const reviewerRoutes = (extra: Record<string, (a: any) => any> = {}) => {
    session.boot = { role: "student", profile: { name: "Dra. Revisora" } };
    queue = [ITEM];
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (extra[fn]) return extra[fn](args);
      if (fn === "app_admin_comment_review_queue") return { total: queue.length, items: queue };
      if (fn === "app_admin_comment_review") return VIEW;
      throw new Error(`rpc não simulada: ${fn}`);
    });
  };

  it("mostra só a fila de comentários (nada de busca de questões, importação ou nova questão) e abre cada questão", async () => {
    reviewerRoutes();
    render(<AdminQuestions />);
    expect(await screen.findByText("Comentários a revisar")).toBeTruthy();
    expect(calls("app_admin_questions")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Nova questão" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Carregar questões" })).toBeNull();
    const row = screen.getByRole("button", { name: "Revisar REV-2024.1-Q001" });
    expect(row.textContent).toMatch(/Bronquiolite/);
    expect(row.textContent).toMatch(/Explicação da B, Conduta esperada/);
  });

  it("fila vazia diz que não há nada esperando", async () => {
    reviewerRoutes();
    queue = [];
    render(<AdminQuestions />);
    expect(await screen.findByText("Nenhum comentário esperando revisão")).toBeTruthy();
  });

  it("abre a questão, mostra o texto e o que está em revisão, e aprova com a nota; volta à fila já sem ela", async () => {
    const decide = vi.fn(() => {
      queue = [];
      return { ...VIEW, comment_review: null };
    });
    reviewerRoutes({ app_admin_question_comment_decide: decide });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar REV-2024.1-Q001" }));
    expect(await screen.findByText("Lactente com desconforto respiratório há dois dias.")).toBeTruthy();
    expect(screen.getByText(/sugerido pelo assistente de IA/)).toBeTruthy();
    const conduct = screen.getByText("Suporte ventilatório e oximetria.");
    expect(conduct.closest("[data-em-revisao]")).not.toBeNull(); // o que espera revisão vem marcado
    expect(screen.getByText("A está errada.").closest("[data-em-revisao]")).toBeNull();
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a conduta e a explicação da B nas diretrizes." } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect((decide.mock.calls[0] as any[])[0]).toMatchObject({
      p_question_id: "q1", p_decision: "approve",
      p_seen_texts: { explanation_B: "B é a correta: suporte.", expected_conduct: "Suporte ventilatório e oximetria.", inep_intent: "Avalia o manejo." },
    });
    expect(await screen.findByText("Nenhum comentário esperando revisão")).toBeTruthy();
    expect(screen.getByText("Comentário aprovado: o aluno já pode ver.")).toBeTruthy();
  });

  it("devolve com o motivo; a recusa do banco aparece e a questão é aberta de novo com o texto de agora", async () => {
    let n = 0;
    const decide = vi.fn(() => {
      throw Object.assign(new Error("O comentário mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo."), { code: "22023" });
    });
    reviewerRoutes({
      app_admin_question_comment_decide: decide,
      app_admin_comment_review: () => ({ ...VIEW, expected_conduct: ++n > 1 ? "Conduta nova depois da leitura." : VIEW.expected_conduct }),
    });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar REV-2024.1-Q001" }));
    await screen.findByText("Suporte ventilatório e oximetria.");
    fireEvent.click(screen.getByRole("button", { name: "Devolver para ajustes" }));
    fireEvent.change(screen.getByLabelText("Motivo da devolução"), { target: { value: "A oximetria precisa entrar na conduta." } });
    fireEvent.click(screen.getByRole("button", { name: "Devolver ao editor" }));
    expect(await screen.findByText(/O comentário mudou enquanto você revisava/)).toBeTruthy();
    expect(await screen.findByText("Conduta nova depois da leitura.")).toBeTruthy();
    expect((decide.mock.calls[0] as any[])[0]).toMatchObject({ p_decision: "return", p_note: "A oximetria precisa entrar na conduta." });
  });

  it("quem só pode ver (equipe sem poder de decidir) não tem os botões de decisão", async () => {
    reviewerRoutes({ app_admin_comment_review: () => ({ ...VIEW, can_review: false }) });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar REV-2024.1-Q001" }));
    await screen.findByText("Lactente com desconforto respiratório há dois dias.");
    expect(screen.queryByRole("button", { name: "Aprovar comentário" })).toBeNull();
    expect(screen.queryByLabelText("O que você conferiu")).toBeNull();
    expect(screen.getByText(/revisor médico cadastrado em Pediatria ou um administrador/)).toBeTruthy();
  });

  it("erro ao carregar a fila aparece em português com o botão de tentar de novo", async () => {
    reviewerRoutes();
    backend.rpc.mockImplementation(async () => {
      throw new Error("falha de rede");
    });
    render(<AdminQuestions />);
    expect(await screen.findByRole("button", { name: /Tentar de novo/i })).toBeTruthy();
  });
});
