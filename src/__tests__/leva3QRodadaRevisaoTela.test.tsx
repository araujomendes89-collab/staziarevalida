/**
 * Leva 3, aba Questões, rodada de correções da revisão independente, nas telas (jsdom, banco simulado): achados 4 (a tela só
 * promete a revisão quando o banco a pratica), 8 (decisão trava com formulário mudado e não apaga o que a pessoa digitou),
 * 9 (o revisor médico vê a figura), 10 (fila em páginas), 11 (nota de aprovação não vira devolução) e 12 (histórico aberto
 * recarrega depois de uma mudança feita no editor).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "editor", profile: { name: "Ed" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminQuestions, QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";

const EXPLAINED = { A: "A está errada.", B: "B é a correta: suporte.", C: "C está errada.", D: "D está errada." };
const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 0, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: "Lactente com desconforto respiratório há dois dias.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: (EXPLAINED as any)[id] })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte ventilatório.", inep_intent: "Avalia o manejo.", needs_image: false, images: [], explanations_review: null,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito", source_url: null, published_at: null },
  comment_review: null, comment_can_review: false, comment_review_by: null, comment_decision: null, comment_review_ready: true,
};
const IN_REVIEW = { ...ROW, comment_can_review: true, comment_review: { campos: ["expected_conduct"], desde: "2026-10-11T12:00:00Z", por: "u1", ia: false }, comment_review_by: "Editora" };
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const ADMIN = { role: "admin", profile: { name: "Adm" } };

let current: any;
const routes = (row: any, extra: Record<string, (a: any) => any> = {}) => {
  current = row;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (extra[fn]) return extra[fn](args);
    if (fn === "app_admin_question") return current;
    throw new Error(`rpc não simulada: ${fn}`);
  });
};
const open = async (row: any, extra: Record<string, (a: any) => any> = {}, as: any = { role: "editor", profile: { name: "Ed" } }) => {
  session.boot = as;
  routes(row, extra);
  render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByRole("button", { name: "Salvar questão" });
};

beforeEach(() => {
  session.boot = { role: "editor", profile: { name: "Ed" } };
});
afterEach(cleanup);

describe("achado 4 — site novo com banco antigo: a tela não promete a revisão", () => {
  const OLD = (({ comment_review_ready: _r, ...rest }) => rest)(ROW);

  it("sem comment_review_ready (banco sem a atualização): mudar o comentário avisa que vai direto ao aluno, e o assistente não promete aprovação", async () => {
    await open(OLD);
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Suporte ventilatório e oximetria." } });
    expect(screen.queryByText("O comentário vai para revisão")).toBeNull();
    const aviso = screen.getByText("A revisão de comentários ainda não está ativa no banco").closest("[role=status]") as HTMLElement;
    expect(aviso.textContent).toMatch(/aparece na hora para o aluno/);
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    expect(await screen.findByText("O que você salvar aparece na hora para o aluno.")).toBeTruthy();
    expect(screen.queryByText(/esperam a aprovação do revisor médico/)).toBeNull();
  });

  it("banco com a parte incompleta (comment_review_ready false): mesmo aviso, nenhuma promessa", async () => {
    await open({ ...ROW, comment_review_ready: false });
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Outra conduta." } });
    expect(screen.queryByText("O comentário vai para revisão")).toBeNull();
    expect(screen.getByText("A revisão de comentários ainda não está ativa no banco")).toBeTruthy();
  });

  it("com o banco completo (true) a promessa aparece", async () => {
    await open(ROW);
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Outra conduta." } });
    expect(screen.getByText("O comentário vai para revisão")).toBeTruthy();
    expect(screen.queryByText("A revisão de comentários ainda não está ativa no banco")).toBeNull();
  });

  it("a lista só oferece o filtro 'comentário em revisão' quando o banco o pratica", async () => {
    const list = (ready: boolean) => {
      backend.rpc.mockReset();
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_admin_questions") return { total: 0, exams: [], items: [], ...(ready ? { comment_review_ready: true } : {}) };
        throw new Error(`rpc não simulada: ${fn}`);
      });
    };
    list(false);
    const first = render(<AdminQuestions />);
    await screen.findByLabelText("Só as que citam figura sem imagem vinculada");
    expect(screen.queryByLabelText("Só as com comentário em revisão (esperando o revisor médico)")).toBeNull();
    first.unmount();
    list(true);
    render(<AdminQuestions />);
    expect(await screen.findByLabelText("Só as com comentário em revisão (esperando o revisor médico)")).toBeTruthy();
  });
});

describe("achado 8 — decisão do revisor com o formulário mudado", () => {
  const typeConduct = async (value: string) => fireEvent.change(await screen.findByLabelText("Conduta esperada"), { target: { value } });

  it("depois de abrir o painel, mudar o formulário trava a decisão (nada é enviado) e avisa; desfazer a mudança destrava", async () => {
    const decide = vi.fn(() => ({ ...ROW }));
    await open(IN_REVIEW, { app_admin_question_comment_decide: decide }, ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    const note = screen.getByLabelText("O que você conferiu");
    fireEvent.change(note, { target: { value: "Conferi a conduta nas diretrizes vigentes." } });
    const confirm = screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    await typeConduct("Suporte ventilatório e oximetria, texto novo.");
    expect(confirm.disabled).toBe(true);
    expect(screen.getAllByText(/Salve a questão \(ou desfaça a mudança\)/).length).toBeGreaterThan(0);
    fireEvent.click(confirm);
    expect(decide).not.toHaveBeenCalled();
    await typeConduct("Suporte ventilatório.");
    expect((screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("o banco recebe exatamente o texto que a tela mostra (o formulário), não outra versão", async () => {
    const decide = vi.fn(() => ({ ...ROW }));
    await open(IN_REVIEW, { app_admin_question_comment_decide: decide }, ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a conduta nas diretrizes vigentes." } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect((decide.mock.calls[0] as any[])[0].p_seen_texts.expected_conduct).toBe("Suporte ventilatório.");
  });

  it("erro que NÃO é 'o texto mudou' não recarrega a questão por cima do que a pessoa digitou", async () => {
    const decide = vi.fn(() => {
      throw new Error("Não foi possível salvar a decisão agora. Tente de novo.");
    });
    await open(IN_REVIEW, { app_admin_question_comment_decide: decide }, ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a conduta nas diretrizes vigentes." } });
    const before = calls("app_admin_question").length;
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    expect(await screen.findByText(/Não foi possível salvar a decisão agora/)).toBeTruthy();
    expect(calls("app_admin_question").length).toBe(before);
  });

  it("recusa 'o texto mudou' com mudança não salva: mostra o erro e mantém o que a pessoa digitou", async () => {
    let release: (v?: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    const decide = vi.fn(async () => {
      await gate; // a resposta chega depois de a pessoa mexer no formulário
      throw new Error("O comentário mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo.");
    });
    await open(IN_REVIEW, { app_admin_question_comment_decide: decide }, ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a conduta nas diretrizes vigentes." } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    await typeConduct("Texto que a pessoa estava digitando agora.");
    const before = calls("app_admin_question").length;
    release();
    expect(await screen.findByText(/O comentário mudou enquanto você revisava/)).toBeTruthy();
    expect(calls("app_admin_question").length).toBe(before); // não trouxe a questão do banco por cima
    expect((screen.getByLabelText("Conduta esperada") as HTMLTextAreaElement).value).toBe("Texto que a pessoa estava digitando agora.");
  });

  it("a questão de agora chega DEPOIS de a pessoa começar a digitar: não troca o formulário e avisa", async () => {
    let release: (v?: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    let reads = 0;
    const decide = vi.fn(() => {
      throw new Error("O comentário mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo.");
    });
    await open(IN_REVIEW, {
      app_admin_question_comment_decide: decide,
      app_admin_question: async () => {
        if (++reads === 1) return current;
        await gate; // a recarga demora; a pessoa digita nesse intervalo
        return { ...current, expected_conduct: "Texto que outra pessoa salvou." };
      },
    }, ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a conduta nas diretrizes vigentes." } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    await waitFor(() => expect(reads).toBe(2)); // a recarga saiu quando não havia nada digitado
    await typeConduct("Texto que a pessoa digitou durante a espera.");
    release();
    expect(await screen.findByText(/você tem texto digitado que ainda não foi salvo/)).toBeTruthy();
    expect((screen.getByLabelText("Conduta esperada") as HTMLTextAreaElement).value).toBe("Texto que a pessoa digitou durante a espera.");
  });

  it("recarga que chega sem nada digitado continua trazendo a questão de agora", async () => {
    let reads = 0;
    const decide = vi.fn(() => {
      throw new Error("O comentário mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo.");
    });
    await open(IN_REVIEW, {
      app_admin_question_comment_decide: decide,
      app_admin_question: async () => (++reads === 1 ? current : { ...current, expected_conduct: "Texto que outra pessoa salvou." }),
    }, ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar comentário" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a conduta nas diretrizes vigentes." } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    await waitFor(() => expect((screen.getByLabelText("Conduta esperada") as HTMLTextAreaElement).value).toBe("Texto que outra pessoa salvou."));
  });
});

describe("achado 11 — a nota de uma aprovação não aparece como devolução", () => {
  it("aprovação anterior com nota + texto alterado de novo: a faixa não diz 'Devolvido'", async () => {
    await open({
      ...IN_REVIEW,
      comment_decision: { decision: "approve", note: "Conferido no protocolo atualizado", at: "2026-10-10T10:00:00Z", by: "Dra. Revisora" },
    });
    const banner = (await screen.findByText("Comentário em revisão")).closest("[role=status]") as HTMLElement;
    expect(banner.textContent).not.toMatch(/Devolvido/);
    expect(banner.textContent).not.toMatch(/Conferido no protocolo atualizado/);
  });

  it("devolução que ainda vale continua aparecendo, com o nome de quem devolveu", async () => {
    await open({
      ...IN_REVIEW,
      comment_review: { ...IN_REVIEW.comment_review, devolvido: { por: "u2", em: "2026-10-11T13:00:00Z", nota: "Falta citar a oximetria." } },
      comment_decision: { decision: "return", note: "Falta citar a oximetria.", at: "2026-10-11T13:00:00Z", by: "Dra. Revisora" },
    });
    const banner = (await screen.findByText("Comentário em revisão")).closest("[role=status]") as HTMLElement;
    expect(banner.textContent).toMatch(/Devolvido por Dra\. Revisora: “Falta citar a oximetria\.”/);
  });

  it("devolução antiga já atendida (o editor mexeu de novo, a marca nova não tem devolução): não aparece", async () => {
    await open({ ...IN_REVIEW, comment_decision: { decision: "return", note: "Falta citar a oximetria.", at: "2026-10-09T13:00:00Z", by: "Dra. Revisora" } });
    const banner = (await screen.findByText("Comentário em revisão")).closest("[role=status]") as HTMLElement;
    expect(banner.textContent).not.toMatch(/Devolvido/);
  });
});

describe("achados 9 e 10 — fila do revisor médico", () => {
  const PATH = "questoes/0123456789abcdef0123456789abcdef.png";
  const item = (n: number) => ({ id: `q${n}`, code: `REV-2024.1-Q${String(n).padStart(3, "0")}`, area: "PEDIATRIA", area_label: "Pediatria", topic: `Tema ${n}`, status: "valid", excerpt: "…", campos: ["expected_conduct"], since: "2026-10-11T12:00:00Z", ia: false, returned: false, can_review: true });
  const VIEW = {
    id: "q1", code: "REV-2024.1-Q001", area: "PEDIATRIA", area_label: "Pediatria", topic: "Radiografia", subtopic: "", exam: "Revalida 2024/1", number: 1,
    statement: "Interprete a radiografia de tórax.", images: [{ path: PATH, alt: "Radiografia de tórax em PA com infiltrado difuso" }],
    options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: "" })), correct_option: "B", status: "valid",
    expected_conduct: "Suporte ventilatório.", inep_intent: "", comment_review: { campos: ["expected_conduct"], desde: "2026-10-11T12:00:00Z", por: "u1", ia: false }, comment_review_by: "Editora", can_review: true, comment_decision: null,
  };

  it("achado 9: o revisor vê a figura da questão (endereço pedido ao servidor) com o texto alternativo, antes de aprovar", async () => {
    session.boot = { role: "student", profile: { name: "Dra. Revisora" } };
    const asked: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:figura" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked.push(url);
        return { ok: true, status: 200, json: async () => ({ url: "https://deposito.test/figura.png?expira=3600" }), blob: async () => new Blob(["x"]) };
      })
    );
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_comment_review_queue") return { total: 1, items: [item(1)] };
      if (fn === "app_admin_comment_review") return VIEW;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar REV-2024.1-Q001" }));
    const img = (await screen.findByAltText("Radiografia de tórax em PA com infiltrado difuso")) as HTMLImageElement;
    expect(img.src).toBe("https://deposito.test/figura.png?expira=3600");
    expect(asked.some((u) => /\/api\/question-figures\/q1\/0\/link$/.test(u))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("achado 10: a fila mostra 50 por vez, diz quantas faltam e 'Carregar mais' traz as próximas sem repetir", async () => {
    session.boot = { role: "student", profile: { name: "Dra. Revisora" } };
    const TOTAL = 120;
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn !== "app_admin_comment_review_queue") throw new Error(`rpc não simulada: ${fn}`);
      const items = Array.from({ length: Math.min(args.p_limit, TOTAL - args.p_offset) }, (_, k) => item(args.p_offset + k + 1));
      return { total: TOTAL, items };
    });
    render(<AdminQuestions />);
    await screen.findByRole("button", { name: "Revisar REV-2024.1-Q001" });
    expect(screen.getAllByRole("button", { name: /^Revisar / })).toHaveLength(50);
    expect(screen.getByText("Mostrando 50 de 120 comentários.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Revisar / })).toHaveLength(100));
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Revisar / })).toHaveLength(120));
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(screen.getByRole("button", { name: "Revisar REV-2024.1-Q120" })).toBeTruthy(); // o último, que antes ficava fora da tela
    expect(calls("app_admin_comment_review_queue").map((c: any[]) => [c[1].p_offset, c[1].p_limit])).toEqual([[0, 50], [50, 50], [100, 50]]);
  });
});

describe("achado 12 — o histórico aberto acompanha as mudanças do editor", () => {
  it("salvar a questão com o histórico aberto pede o histórico de novo e mostra a mudança nova", async () => {
    let entries: any[] = [{ id: 1, at: "2026-10-10T12:00:00Z", by: "Master", reason: null, changes: { topic: { de: "A", para: "Bronquiolite" } } }];
    await open(ROW, {
      app_admin_question_history: () => ({ total: entries.length, items: entries }),
      app_admin_save_question: (a: any) => {
        entries = [{ id: 2, at: "2026-10-11T12:00:00Z", by: "Ed", reason: null, changes: { expected_conduct: { de: "Suporte ventilatório.", para: a.p_question.expected_conduct } } }, ...entries];
        return { ...ROW, ...a.p_question };
      },
    });
    const panel = () => screen.getByRole("region", { name: "Histórico de mudanças" });
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    await waitFor(() => expect(within(panel()).getAllByRole("listitem")).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Suporte ventilatório e oximetria." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(within(panel()).getAllByRole("listitem")).toHaveLength(2));
    expect(within(panel()).getAllByRole("listitem")[0].textContent).toMatch(/Conduta esperada/);
    expect(calls("app_admin_question_history")).toHaveLength(2);
  });

  it("com o histórico fechado, a mudança só faz o histórico ser pedido de novo quando abrir (não pede à toa)", async () => {
    let entries: any[] = [{ id: 1, at: "2026-10-10T12:00:00Z", by: "Master", reason: null, changes: { topic: { de: "A", para: "Bronquiolite" } } }];
    await open(ROW, {
      app_admin_question_history: () => ({ total: entries.length, items: entries }),
      app_admin_save_question: (a: any) => {
        entries = [{ id: 2, at: "2026-10-11T12:00:00Z", by: "Ed", reason: null, changes: { expected_conduct: { de: "x", para: "y" } } }, ...entries];
        return { ...ROW, ...a.p_question };
      },
    });
    const panel = () => screen.getByRole("region", { name: "Histórico de mudanças" });
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    await waitFor(() => expect(within(panel()).getAllByRole("listitem")).toHaveLength(1));
    fireEvent.click(within(panel()).getByRole("button", { name: "Esconder histórico" }));
    fireEvent.change(screen.getByLabelText("Conduta esperada"), { target: { value: "Suporte ventilatório e oximetria." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await screen.findByText("Questão salva.");
    expect(calls("app_admin_question_history")).toHaveLength(1);
    fireEvent.click(within(panel()).getByRole("button", { name: "Ver histórico de mudanças" }));
    await waitFor(() => expect(within(panel()).getAllByRole("listitem")).toHaveLength(2));
  });
});
