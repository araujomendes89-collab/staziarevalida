/**
 * Anotação POR SEÇÃO na aula do Grande Tema (tela do aluno), jsdom com banco simulado (forma da migração 9994).
 * Regras (dono, 14/10/2026): cada seção tem a sua caixa; grava sozinha depois de uma pausa (uma chamada por seção, não por tecla);
 * mostra "Salvo"; tudo volta ao reabrir; a anotação geral antiga continua visível (acima das seções) se existir.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));
import { ThemesScreen } from "../novo/app/study/ThemesScreen.jsx";

const TEMAS = {
  method: "Seleção.", official_total: 5, annulled: 0, linked: 5, unlinked: 0,
  areas: [{ id: "cm", name: "Clínica Médica", themes: 1, questions: 5 }],
  themes: [{ id: "GR-001", order: 1, title: "Tuberculose pulmonar", area: "cm", area_name: "Clínica Médica", subarea: "Infectologia", status: "aula_pronta", total: 5, by_exam: { a: 5 } }],
};
const LID = "11111111-1111-4111-8111-111111111111";
const AULA = {
  lesson_id: LID, titulo: "Tuberculose pulmonar: da tosse ao controle", atualizado_em: "2026-10-14T12:00:00Z",
  secoes: [
    { titulo: "Caso clínico de abertura", paragrafos: ["Marcos, 34 anos."] },
    { titulo: "Bloco 1 · Suspeita clínica", paragrafos: ["Sintomático respiratório."] },
    { titulo: "Erros frequentes na prova", paragrafos: ["Esperar três semanas."] },
  ],
  tabelas: [], midias: [], revisao_aula: null, flashcards: { cartoes: [] }, questoes: { itens: [] },
};

let notas: any; let falhar: boolean;
beforeEach(() => {
  notas = { note: "anotação antiga do bloco único", notas: { geral: "anotação antiga do bloco único", "sec-2": "lembrar do TRM" }, checks: { "sec-1": true } };
  falhar = false;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_grandes_temas") return TEMAS;
    if (fn === "app_temas_com_aula") return ["GR-001"];
    if (fn === "app_tema_aula") return AULA;
    if (fn === "app_lesson_notes") return notas;
    if (fn === "app_lesson_section_note_save" || fn === "app_lesson_checks_save") {
      if (falhar) throw new Error("Sem conexão.");
      return { ok: true };
    }
    throw new Error(`rpc não simulada: ${fn}`);
  });
  window.scrollTo = vi.fn() as any;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn).map((c: any[]) => c[1]);
const abrir = async () => {
  render(<ThemesScreen go={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Abrir a aula/ }));
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect((screen.getByRole("textbox", { name: /seção 1/ }) as HTMLTextAreaElement).disabled).toBe(false));
};
const caixa = (re: RegExp) => screen.getByRole("textbox", { name: re }) as HTMLTextAreaElement;
const esperar = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("uma caixa de anotação por seção", () => {
  it("cada seção tem a sua caixa, com o texto que estava guardado", async () => {
    await abrir();
    expect(screen.getAllByRole("textbox", { name: /^Minha anotação da seção \d/ })).toHaveLength(3);
    expect(caixa(/seção 1: Caso clínico de abertura/).value).toBe("");
    expect(caixa(/seção 2: Suspeita clínica/).value).toBe("lembrar do TRM");
    expect(caixa(/seção 3: Erros frequentes na prova/).value).toBe("");
    for (const n of [1, 2, 3]) expect(within(screen.getByRole("region", { name: AULA.secoes[n - 1].titulo.replace(/^Bloco 1 · /, "") })).getByRole("textbox", { name: new RegExp(`seção ${n}`) })).toBeTruthy();
  });

  it("a anotação geral antiga aparece acima das seções e continua editável", async () => {
    await abrir();
    const geral = caixa(/Anotação geral desta aula/);
    expect(geral.value).toBe("anotação antiga do bloco único");
    expect(geral.compareDocumentPosition(caixa(/seção 1/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: /Minhas anotações de antes/ })).toBeTruthy();
  });

  it("sem anotação antiga, não aparece a caixa geral", async () => {
    notas = { note: "", notas: {}, checks: {} };
    await abrir();
    expect(screen.queryByRole("textbox", { name: /Anotação geral/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Minhas anotações de antes/ })).toBeNull();
  });

  it("banco ainda antigo (sem 'notas'): a anotação única aparece como geral", async () => {
    notas = { note: "só no formato antigo", checks: {} };
    await abrir();
    expect(caixa(/Anotação geral desta aula/).value).toBe("só no formato antigo");
  });

  it("anotação de uma seção que não existe mais na aula continua visível", async () => {
    notas = { note: "", notas: { "sec-7": "nota de seção que saiu" }, checks: {} };
    await abrir();
    expect(caixa(/Anotação da antiga seção 7/).value).toBe("nota de seção que saiu");
  });
});

describe("salvamento automático", () => {
  it("grava cada seção depois de uma pausa: uma chamada por seção, não por tecla; mostra Salvo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrir();
    fireEvent.change(caixa(/seção 1/), { target: { value: "a" } });
    fireEvent.change(caixa(/seção 1/), { target: { value: "ab" } });
    fireEvent.change(caixa(/seção 1/), { target: { value: "abc" } });
    fireEvent.change(caixa(/seção 3/), { target: { value: "erro que eu cometo" } });
    await esperar(300);
    expect(calls("app_lesson_section_note_save")).toHaveLength(0);
    await esperar(1200);
    const save = calls("app_lesson_section_note_save");
    expect(save).toHaveLength(2);
    expect(save).toContainEqual({ p_lesson_id: LID, p_secao: "sec-1", p_note: "abc" });
    expect(save).toContainEqual({ p_lesson_id: LID, p_secao: "sec-3", p_note: "erro que eu cometo" });
    const sec1 = screen.getByRole("region", { name: "Caso clínico de abertura" });
    await waitFor(() => expect(within(sec1).getByText("Salvo")).toBeTruthy());
  });

  it("a geral também grava, na chave 'geral'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrir();
    fireEvent.change(caixa(/Anotação geral desta aula/), { target: { value: "geral nova" } });
    await esperar(1200);
    expect(calls("app_lesson_section_note_save")).toEqual([{ p_lesson_id: LID, p_secao: "geral", p_note: "geral nova" }]);
  });

  it("sair da caixa grava na hora; sair da aula não perde o que estava pendente", async () => {
    await abrir();
    fireEvent.change(caixa(/seção 2/), { target: { value: "lembrar do TRM e da cultura" } });
    fireEvent.blur(caixa(/seção 2/));
    await waitFor(() => expect(calls("app_lesson_section_note_save")).toEqual([{ p_lesson_id: LID, p_secao: "sec-2", p_note: "lembrar do TRM e da cultura" }]));
    fireEvent.change(caixa(/seção 3/), { target: { value: "pendente" } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos temas" }));
    await waitFor(() => expect(calls("app_lesson_section_note_save")).toContainEqual({ p_lesson_id: LID, p_secao: "sec-3", p_note: "pendente" }));
  });

  it("sair da caixa sem mudar nada não grava", async () => {
    await abrir();
    fireEvent.blur(caixa(/seção 2/));
    await act(async () => { await Promise.resolve(); });
    expect(calls("app_lesson_section_note_save")).toHaveLength(0);
  });

  it("se falhar, avisa em português e não mostra Salvo", async () => {
    falhar = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrir();
    fireEvent.change(caixa(/seção 1/), { target: { value: "x" } });
    await esperar(1200);
    expect(await screen.findByText(/Sem conexão|Não foi possível salvar/)).toBeTruthy();
    const sec1 = screen.getByRole("region", { name: "Caso clínico de abertura" });
    expect(within(sec1).queryByText("Salvo")).toBeNull();
    expect(within(sec1).getByText("Não salvo")).toBeTruthy();
  });

  it("caixas marcadas gravam à parte, sem mexer nas anotações", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrir();
    fireEvent.click(screen.getAllByLabelText("Marcar esta seção como estudada")[1]);
    await esperar(1200);
    expect(calls("app_lesson_checks_save")).toEqual([{ p_lesson_id: LID, p_checks: { "sec-1": true, "sec-2": true } }]);
    expect(calls("app_lesson_section_note_save")).toHaveLength(0);
    expect(calls("app_lesson_notes_save")).toHaveLength(0);
  });
});
