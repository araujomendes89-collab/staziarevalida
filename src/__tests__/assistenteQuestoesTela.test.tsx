/**
 * Questões + assistente (jsdom, banco e rotas simulados): o botão abre o painel ao lado, "Usar" só muda o formulário,
 * o motivo "assistente de IA" vai só depois de Usar, e nada digitado no painel envia o formulário.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";

const LINE = { ready: true, label: "Gemini", model: "gemini-2.5-pro", pending: null };
const S = (o: any) => ({ id: "s1", before: null, sources: [{ label: "p. 3", kind: "material" }], warnings: [], append: false, reason: null, ...o });
const R = (o: any) => ({ mode: "preencher", suggestions: [], findings: [], missing: [], reply: null, no_source: [], warnings: [], usage: null, ...o });
const ROW = {
  id: "q1", code: "REV-2024-1-001", attempts: 3, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: "Lactente com desconforto respiratório.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: "" })),
  correct_option: "B", status: "valid", expected_conduct: "", inep_intent: "", needs_image: false, images: [],
};
const textarea = (label: string) => screen.getAllByLabelText(label).find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
const saveCalls = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_question");
const runCall = () => (globalThis.fetch as any).mock.calls.find((c: any[]) => c[0] === "/api/admin-assistant/run");

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_question") return ROW;
    if (fn === "app_admin_save_question") return { ...ROW, ...args.p_question, exam: ROW.exam, number: 1 };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const json = (b: any) => ({ ok: true, status: 200, json: async () => b });
    if (url.startsWith("/api/admin-assistant/status")) return json({ tab: "questoes", modes: { preencher: LINE, conferir: LINE, conversar: LINE } });
    if (url === "/api/admin-assistant/run")
      return json(R({ suggestions: [S({ id: "s1", field: "expected_conduct", value: "Suporte com oxigênio." }), S({ id: "s2", field: "explanation_A", value: "A é errada." }), S({ id: "s3", field: "explanation_B", value: "B é a certa." })] }));
    throw new Error(`fetch não simulado: ${url}`);
  });
});
afterEach(cleanup);

describe("Questões: assistente", () => {
  it("o botão abre o painel com o aviso; Usar preenche sem gravar; o motivo vai só depois de Usar", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Assistente" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("O que você salvar aparece na hora para o aluno.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    const card = await screen.findByRole("region", { name: "Sugestão: Conduta esperada" });
    const body = JSON.parse(runCall()[1].body);
    expect(body).toMatchObject({ tab: "questoes", mode: "preencher", form: { id: "q1", correct_option: "B" } });
    expect(body.form.images).toBeUndefined();
    expect(body.form.attempts).toBeUndefined();
    fireEvent.click(within(card).getByRole("button", { name: "Usar" }));
    expect(textarea("Conduta esperada").value).toBe("Suporte com oxigênio.");
    expect(saveCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_question", { p_question: expect.objectContaining({ expected_conduct: "Suporte com oxigênio." }), p_reason: "assistente de IA" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect("p_reason" in saveCalls()[1][1]).toBe(false);
  });

  it("salvar sem Usar não manda motivo", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect("p_reason" in saveCalls()[0][1] ? saveCalls()[0][1].p_reason : null).toBeNull();
  });

  it("Usar tudo aplica as explicações da A e da B; nenhuma se perde", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar tudo" }));
    expect(textarea("Explicação da A (opcional)").value).toBe("A é errada.");
    expect(textarea("Explicação da B (opcional)").value).toBe("B é a certa.");
    expect(textarea("Conduta esperada").value).toBe("Suporte com oxigênio.");
  });

  it("Enter no campo de endereço do material não salva a questão (o painel fica fora do formulário)", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Link" }));
    const url = await screen.findByLabelText("Endereço (https)");
    expect(url.closest("form")).toBeNull();
    fireEvent.change(url, { target: { value: "https://exemplo.gov.br/x" } });
    fireEvent.keyDown(url, { key: "Enter", code: "Enter" });
    fireEvent.submit(url);
    expect(saveCalls()).toHaveLength(0);
  });

  it("mostra a recusa do servidor (gabarito e situação só pelo registro do gabarito oficial)", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "Sugestão: Conduta esperada" })).getByRole("button", { name: "Usar" }));
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_save_question")
        throw Object.assign(new Error("Gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial (administrador, com fonte e motivo)."), { code: "22023" });
      return ROW;
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    expect(await screen.findByText(/Gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial/)).toBeTruthy();
  });

  it("fechar o painel desmonta o resultado", async () => {
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Assistente" });
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    await screen.findByRole("region", { name: "Sugestão: Conduta esperada" });
    fireEvent.click(button);
    expect(screen.queryByRole("region", { name: "Sugestão: Conduta esperada" })).toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("sem servidor, avisa que o assistente não funciona no banco local", async () => {
    const saved = backend.accessToken;
    backend.accessToken = undefined;
    try {
      render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
      fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
      expect(await screen.findByText("O assistente precisa do servidor (não funciona no banco local do navegador).")).toBeTruthy();
    } finally {
      backend.accessToken = saved;
    }
  });

  it("com 900 px ou mais, abrir o painel mantém o mesmo botão no documento e com o foco", async () => {
    const OldRO = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = class { cb: any; constructor(cb: any) { this.cb = cb; } observe() {} disconnect() {} };
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as any);
    try {
      render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
      const button = await screen.findByRole("button", { name: "Assistente" });
      button.focus();
      fireEvent.click(button);
      await screen.findByText("O que você salvar aparece na hora para o aluno.");
      const after = screen.getByRole("button", { name: "Assistente" });
      expect(after).toBe(button);
      expect(document.body.contains(button)).toBe(true);
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(document.body.contains(button)).toBe(true);
      expect(document.activeElement).toBe(button);
    } finally {
      spy.mockRestore();
      (globalThis as any).ResizeObserver = OldRO;
    }
  });

  it("registrar outro gabarito oficial descarta as sugestões antigas (o gabarito não muda mais pelo formulário, …7700)", async () => {
    let row: any = ROW;
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question") return row;
      if (fn === "app_admin_set_official_answer") {
        row = { ...ROW, correct_option: "C" };
        return { id: "x", version: 2, recorrected: 0, review: null };
      }
      if (fn === "app_admin_save_question") return { ...row, ...args.p_question, exam: ROW.exam, number: 1 };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    await screen.findByRole("region", { name: "Sugestão: Explicação da B" });
    expect((within(screen.getByRole("radiogroup", { name: "Gabarito" })).getByRole("radio", { name: "C" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Registrar gabarito oficial" }));
    const panel = screen.getByRole("region", { name: "Registro do gabarito oficial" });
    fireEvent.click(within(within(panel).getByRole("radiogroup", { name: "Letra do gabarito oficial" })).getByRole("radio", { name: "C" }));
    fireEvent.change(within(panel).getByLabelText("Fonte (documento e data)"), { target: { value: "Gabarito definitivo (teste)" } });
    fireEvent.change(within(panel).getByLabelText("Motivo da mudança"), { target: { value: "Conferido no edital." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Sugestão: Explicação da B" })).toBeNull());
    expect(screen.queryByRole("region", { name: "Sugestão: Conduta esperada" })).toBeNull();
    expect(saveCalls()).toHaveLength(0);
  });

  it("Usar tudo não apaga o que a pessoa digitou enquanto o Preencher rodava (decisão D2c)", async () => {
    const plain = (globalThis as any).fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      if (url === "/api/admin-assistant/run") await gate;
      return plain(url, init);
    });
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    await waitFor(() => expect(runCall()).toBeTruthy());
    expect(JSON.parse(runCall()[1].body).form.options[0].explanation).toBe("");
    fireEvent.change(textarea("Explicação da A (opcional)"), { target: { value: "Texto que eu digitei." } });
    release();
    fireEvent.click(await screen.findByRole("button", { name: "Usar tudo" }));
    expect(textarea("Explicação da A (opcional)").value).toBe("Texto que eu digitei.");
    expect(textarea("Explicação da B (opcional)").value).toBe("B é a certa.");
    expect(textarea("Conduta esperada").value).toBe("Suporte com oxigênio.");
    expect(within(screen.getByRole("region", { name: "Sugestão: Explicação da A" })).getByText("O campo mudou depois da proposta: peça de novo")).toBeTruthy();
  });

  it("o primeiro salvamento de questão nova não desmonta o painel: material, pedido e sugestões ficam (decisão D3a)", async () => {
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assistente" }));
    fireEvent.change(textarea("Texto"), { target: { value: "Trecho do material sobre bronquiolite." } });
    fireEvent.change(textarea("Pedido (opcional)"), { target: { value: "Seja breve." } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await screen.findByRole("region", { name: "Sugestão: Explicação da B" });
    fireEvent.click(within(screen.getByRole("region", { name: "Sugestão: Conduta esperada" })).getByRole("button", { name: "Descartar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar questão" }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(await screen.findByRole("button", { name: "Salvar questão" })).toBeTruthy();
    expect(textarea("Texto").value).toBe("Trecho do material sobre bronquiolite.");
    expect(textarea("Pedido (opcional)").value).toBe("Seja breve.");
    expect(screen.getByRole("region", { name: "Sugestão: Explicação da B" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Sugestão: Conduta esperada" })).toBeNull();
    // já gravada, salvar de novo com o mesmo gabarito e a mesma situação também não desmonta
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(textarea("Texto").value).toBe("Trecho do material sobre bronquiolite.");
    expect(screen.getByRole("region", { name: "Sugestão: Explicação da B" })).toBeTruthy();
  });
});
