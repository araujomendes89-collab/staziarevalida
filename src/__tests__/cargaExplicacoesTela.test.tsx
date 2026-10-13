/**
 * Carga das explicações nas telas (jsdom, banco simulado), com os textos REAIS dos agentes (fixtures/carga-explicacoes):
 *  - anulada: as explicações de estudo com o aviso exato, "Defensável."/"Incorreta." e nunca "Correta."; fora de acertos e erros;
 *  - nota "O que mudou desde a prova" só quando o banco a manda (aprovada) e sem repetir o cartão de atualização;
 *  - "Aprovar a prova inteira" só aparece para quem pode aprovar, com a nota obrigatória e a impressão digital da lista;
 *  - a nota na Administração: aprovar manda o texto que a pessoa leu.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "student", profile: { name: "Ana" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));

import { ANNULLED_NOTICE, Correction } from "../novo/app/practice/Correction.jsx";
import { ExamApproval, UpdateNoteCard } from "../novo/app/admin/QuestionCommentReview.jsx";

const FIX = path.join(__dirname, "fixtures/carga-explicacoes/revisao");
const P_ANULADA = JSON.parse(fs.readFileSync(path.join(FIX, "revalida_2023_1/prof-anuladas.json"), "utf8"))[0];
const P_NOTA = JSON.parse(fs.readFileSync(path.join(FIX, "revalida_2021_1/prof-01.json"), "utf8"))[0];
const limpa = (t: string) => t.replace(/\s+/g, " ").trim();
const NOTES = ["A", "B", "C", "D"].map((id) => ({ id, text: limpa(P_ANULADA.explicacao[id]) }));
// a nota como o banco a guarda: sem o título do bloco
const NOTA = limpa(P_NOTA.nota_atualizacao).replace(/^O que mudou desde a prova:\s*/, "").replace(/^./, (c) => c.toUpperCase());
const ANULADA = { is_correct: null, correct_option: "A", annulled: true, explanation: null, option_notes: [], expected_conduct: limpa(P_ANULADA.conduta_esperada), sources: [] };

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async () => null);
  session.boot = { role: "student", profile: { name: "Ana" } };
});
afterEach(cleanup);

describe("anulada com as explicações de estudo (texto real do Professor)", () => {
  it("mostra o aviso exato e as quatro letras com Defensável/Incorreta, nunca 'Correta.', sem Tutor e sem 'A correta é'", async () => {
    const { container } = render(<Correction selected="B" correction={{ ...ANULADA, annulled_notes: NOTES }} question={{ id: "revalida_2023_1_q007", area: "CLINICA_MEDICA" }} />);
    const block = screen.getByRole("region", { name: "Explicações para estudo" });
    expect(block.textContent).toContain(ANNULLED_NOTICE);
    expect(ANNULLED_NOTICE).toBe("Questão anulada pela banca do Inep. As explicações abaixo servem para estudo; nenhuma alternativa conta como gabarito.");
    for (const n of NOTES) expect(block.textContent).toContain(n.text.replace(/^(Defensável|Incorreta)\.\s*/, ""));
    expect(block.textContent).toMatch(/B\.\s*Defensável\./);
    expect(container.textContent).not.toMatch(/Correta\./);
    expect(container.textContent).toContain("Questão anulada pela banca. Não conta como acerto nem erro.");
    expect(container.textContent).not.toContain("Nenhuma alternativa conta como correta, por isso não há explicação");
    expect(container.textContent).not.toMatch(/A correta é|Explicação clínica|Por que não as outras/);
    expect(screen.queryByRole("button", { name: /Tutor/ })).toBeNull();
    await waitFor(() => expect(backend.rpc).toHaveBeenCalled());
  });

  it("conjunto incompleto ou com 'Correta.' (texto antigo): nada de explicação de estudo, volta o aviso de antes", () => {
    const ruim = NOTES.map((n) => (n.id === "A" ? { ...n, text: "Correta. Texto antigo escrito para a letra guardada." } : n));
    const { container } = render(<Correction selected="B" correction={{ ...ANULADA, annulled_notes: ruim }} question={{ id: "q", area: "CLINICA_MEDICA" }} />);
    expect(screen.queryByRole("region", { name: "Explicações para estudo" })).toBeNull();
    expect(container.textContent).toContain("Nenhuma alternativa conta como correta, por isso não há explicação de cada alternativa.");
    expect(container.textContent).not.toContain("Texto antigo escrito");
  });
});

describe("nota 'O que mudou desde a prova' (texto real do Professor)", () => {
  const VALIDA = { is_correct: true, correct_option: "C", annulled: false, explanation: null, option_notes: [], sources: [] };
  it("aparece quando o banco a manda (aprovada), com o aviso de que o gabarito não muda", async () => {
    render(<Correction selected="C" correction={{ ...VALIDA, update_note: NOTA }} question={{ id: "revalida_2021_1_q064", area: "MEDICINA_FAMILIA_COMUNIDADE" }} />);
    const box = screen.getByRole("region", { name: "O que mudou desde a prova" });
    expect(box.textContent).toContain(NOTA);
    expect(box.textContent).toContain("O gabarito oficial da prova não muda.");
    await waitFor(() => expect(backend.rpc).toHaveBeenCalled());
  });

  it("sem nota no banco (em revisão), nada; com o cartão de atualização da Análise Stazia, a nota não se repete", async () => {
    render(<Correction selected="C" correction={VALIDA} question={{ id: "q1", area: "MEDICINA_FAMILIA_COMUNIDADE" }} />);
    expect(screen.queryByRole("region", { name: "O que mudou desde a prova" })).toBeNull();
    cleanup();
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_question_commentary" ? { question_id: "q2", options: [], update_card: { official_answer: "C", current_answer: "C", what_changed: "x", temporal_status: "UPDATED_BUT_SAME_ANSWER" } } : null);
    render(<Correction selected="C" correction={{ ...VALIDA, update_note: NOTA }} question={{ id: "q2", area: "MEDICINA_FAMILIA_COMUNIDADE" }} />);
    await screen.findByText(/Atualização de conduta/);
    expect(screen.queryByRole("region", { name: "O que mudou desde a prova" })).toBeNull();
  });
});

describe("Aprovar a prova inteira", () => {
  it("quem não pode aprovar nada não vê o botão", async () => {
    backend.rpc.mockImplementation(async () => ({ exam_id: "revalida-2020", title: "Revalida 2020", pendentes: 3, aprovaveis: 0, devolvidas: 0, outras_areas: 3, notas: 0, impressao: "x" }));
    render(<ExamApproval examId="revalida-2020" />);
    expect(await screen.findByText(/nenhum que você possa aprovar/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
  });

  it("revisor da área: nota obrigatória, manda a impressão digital da lista e avisa quantas foram aprovadas", async () => {
    const done = vi.fn();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_comment_review_exam") return { exam_id: "revalida-2020", title: "Revalida 2020", pendentes: 5, aprovaveis: 4, devolvidas: 1, outras_areas: 0, notas: 2, impressao: "abc123" };
      if (fn === "app_admin_comment_review_approve_exam") return { aprovadas: 4 };
      throw new Error(fn);
    });
    render(<ExamApproval examId="revalida-2020" onDone={done} />);
    const button = (await screen.findByRole("button", { name: "Aprovar 4 comentários desta prova" })) as HTMLButtonElement;
    expect(screen.getByText(/Ficam de fora: 1 devolvida/)).toBeTruthy();
    expect(screen.getByText(/não entram: aprove cada uma na questão/)).toBeTruthy();
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("O que você conferiu nesta prova"), { target: { value: "Li as explicações de Pediatria desta prova." } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(done).toHaveBeenCalledWith("4 comentários aprovados: o aluno já pode ver."));
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_comment_review_approve_exam")[1]).toEqual({ p_exam_id: "revalida-2020", p_note: "Li as explicações de Pediatria desta prova.", p_seen: "abc123" });
  });
});

describe("a nota na Administração", () => {
  it("revisor da área aprova mandando o texto que leu; sem a atualização do banco, o cartão some", async () => {
    let note: any = { question_id: "q", note: NOTA, status: "em_revisao", origin: "professor", can_decide: true, can_edit: false, student_sees: false };
    backend.rpc.mockImplementation(async (fn: string, a: any) => {
      if (fn === "app_admin_question_update_note") return note;
      if (fn === "app_admin_question_update_note_decide") return (note = { ...note, status: "aprovada", decided_by: "Dra. Revisora", decided_at: "2026-10-13T12:00:00Z", student_sees: true, decision_note: a.p_note });
      throw new Error(fn);
    });
    render(<UpdateNoteCard questionId="q" />);
    expect(await screen.findByText(NOTA)).toBeTruthy();
    expect(screen.getByText(/O aluno só vê esta nota depois/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar a nota" }));
    fireEvent.change(screen.getByLabelText("O que você conferiu"), { target: { value: "Conferi a mudança na referência atual." } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e liberar ao aluno" }));
    expect(await screen.findByText("Nota aprovada: o aluno já pode ver.")).toBeTruthy();
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_question_update_note_decide")[1]).toMatchObject({ p_decision: "approve", p_seen_text: NOTA });
    cleanup();
    backend.rpc.mockImplementation(async () => {
      throw new Error("function does not exist");
    });
    const { container } = render(<UpdateNoteCard questionId="q" />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
