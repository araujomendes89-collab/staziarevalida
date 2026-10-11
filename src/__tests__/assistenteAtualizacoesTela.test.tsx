/**
 * Atualizações + assistente (jsdom, banco e rotas simulados): o botão "Assistente" abre o painel ao lado do editor, "Usar" só muda
 * o formulário (a linha do tempo e os flashcards só recebem itens novos), quem grava é "Salvar alterações" e nada digitado no painel
 * envia o formulário.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminUpdates } from "../novo/app/admin/AdminUpdates.jsx";

const LINE = { ready: true, label: "Gemini", model: "gemini-2.5-pro", pending: null };
const S = (o: any) => ({ id: "s1", before: null, sources: [{ label: "p. 3", kind: "material" }], warnings: [], append: false, reason: null, ...o });
const R = (o: any) => ({ mode: "preencher", suggestions: [], findings: [], missing: [], reply: null, no_source: [], warnings: [], usage: null, ...o });
const LEGACY = {
  id: "u1", slug: "prot-x", area: "GINECOLOGIA_OBSTETRICIA", topic: "Atualização antiga de teste", subtopic: null, years: [2025], priority: 1,
  publication_label: "05/2025", institution: "Instituição", document_title: "Documento", source_url: null, before_text: "Antes.",
  timeline: [{ year: 2025, text: "Mudou." }], current_conduct: "Agora.", clinical_impact: null, exam_impact: null, trap: null, search_terms: "teste",
  flashcards: [], practice_questions: [{ statement: "Gestante com pressão alta.", answer: "B" }], reviewed: false, reviewed_at: null, published: false,
  review_status: "pending", review_note: null, reviewer: null, source_checked_at: null, origin: "legacy_app", position: 1, can_review: true,
  legacy: { status_label: "VALIDADO_OFICIAL_SUS", last_verification_claim: "2026-08-30", original_url: "https://site.test/antigo", original_url_check: { http_status: 404, checked_on: "2026-10-06" }, cited_questions: [] },
};
const ITEM = { ...LEGACY, source_url: "https://www.gov.br/saude/pcdt.pdf", timeline: [{ year: 2025, text: "Mudou." }] };
const CONDUCT = "AAS 150 mg a partir de 12 semanas.";
const TIMELINE_NEW = { year: 2024, text: "Passou a recomendar AAS." };
const ANSWER = () => R({ suggestions: [S({ id: "s1", field: "current_conduct", value: CONDUCT }), S({ id: "s2", field: "timeline", value: [TIMELINE_NEW], append: true })] });

let listed: any; // item que a lista devolve
let answer: any; // resposta do /run
let runFails: { status: number; error: string } | null; // o /run recusa assim
let statusFails: { status: number; error: string } | null; // o /status recusa assim
const textarea = (label: string) => screen.getAllByLabelText(label).find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
const saveCalls = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_guideline_update");
const runCalls = () => (globalThis.fetch as any).mock.calls.filter((c: any[]) => c[0] === "/api/admin-assistant/run");
const openItem = async () => fireEvent.click(await screen.findByRole("button", { name: /Atualização antiga de teste/ }));
const AI_LINE = "IA definida na Central de IAs: Gemini gemini-2.5-pro"; // o painel leu a situação da aba "atualizacoes"

beforeEach(() => {
  listed = ITEM;
  answer = ANSWER();
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [listed] };
    if (fn === "app_admin_save_guideline_update") return { ...listed, ...args.p_update, id: args.p_update.id ?? "u9" };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  statusFails = null;
  runFails = null;
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const json = (b: any) => ({ ok: true, status: 200, json: async () => b });
    const refuse = (f: { status: number; error: string }) => ({ ok: false, status: f.status, json: async () => ({ error: f.error }) });
    if (url === "/api/admin-assistant/status?tab=atualizacoes") return statusFails ? refuse(statusFails) : json({ tab: "atualizacoes", modes: { preencher: LINE, conferir: LINE, conversar: LINE } });
    if (url === "/api/admin-assistant/run") return runFails ? refuse(runFails) : json(answer);
    throw new Error(`fetch não simulado: ${url}`);
  });
});
afterEach(cleanup);

describe("Atualizações: assistente", () => {
  it("Usar na Conduta vigente e na linha do tempo (acrescenta); salvar leva os dois anos", async () => {
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: /Atualização antiga de teste/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    expect(await screen.findByText(AI_LINE)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Ler o documento oficial deste item" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "Sugestão: Conduta vigente" })).getByRole("button", { name: "Usar" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Sugestão: Linha do tempo" })).getByRole("button", { name: "Usar" }));
    expect(textarea("Conduta vigente").value).toBe(CONDUCT);
    expect(screen.getAllByLabelText("Ano")).toHaveLength(2);
    const body = JSON.parse(runCalls()[0][1].body);
    expect(body).toMatchObject({ tab: "atualizacoes", mode: "preencher", form: { id: "u1", area: "GINECOLOGIA_OBSTETRICIA", source_url: "https://www.gov.br/saude/pcdt.pdf" } });
    expect("legacy" in body.form).toBe(false);
    expect("practice_questions" in body.form).toBe(false);
    expect(saveCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_guideline_update", expect.objectContaining({ p_update: expect.objectContaining({ current_conduct: CONDUCT, timeline: [{ year: 2025, text: "Mudou." }, TIMELINE_NEW] }) })));
    expect(await screen.findByText("Atualização salva.")).toBeTruthy();
    expect(saveCalls()).toHaveLength(1);
  });

  it("Usar tudo aplica a conduta e a linha do tempo: uma não apaga a outra", async () => {
    render(<AdminUpdates />);
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar tudo" }));
    expect(textarea("Conduta vigente").value).toBe(CONDUCT);
    expect(screen.getAllByLabelText("Ano")).toHaveLength(2);
    expect(saveCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1].p_update).toMatchObject({ current_conduct: CONDUCT, timeline: [{ year: 2025, text: "Mudou." }, TIMELINE_NEW] });
    expect(await screen.findByText("Atualização salva.")).toBeTruthy();
  });

  it("o botão Assistente fica ao lado de Fechar e alterna o painel; fechar o painel apaga o resultado", async () => {
    render(<AdminUpdates />);
    await openItem();
    const button = screen.getByRole("button", { name: "Assistente" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.parentElement).toBe(screen.getByRole("button", { name: "Fechar" }).parentElement);
    expect(screen.queryByRole("complementary", { name: "Assistente" })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("complementary", { name: "Assistente" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    await screen.findByRole("region", { name: "Sugestão: Conduta vigente" });
    fireEvent.click(screen.getByRole("button", { name: "Fechar assistente" }));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("complementary", { name: "Assistente" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Sugestão: Conduta vigente" })).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("complementary", { name: "Assistente" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Sugestão: Conduta vigente" })).toBeNull();
    await screen.findByText(AI_LINE);
    expect(saveCalls()).toHaveLength(0);
  });

  it("o painel fica fora do formulário: Enter no endereço do material não salva a atualização", async () => {
    render(<AdminUpdates />);
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    await screen.findByText(AI_LINE);
    expect(saveCalls()).toHaveLength(0); // o botão Assistente está dentro do formulário e não o envia
    expect(textarea("Conduta vigente").closest("form")).not.toBeNull();
    expect(screen.getByRole("complementary", { name: "Assistente" }).closest("form")).toBeNull();
    fireEvent.click(await screen.findByRole("radio", { name: "Link" }));
    const url = await screen.findByLabelText("Endereço (https)");
    expect(url.closest("form")).toBeNull();
    fireEvent.change(url, { target: { value: "https://exemplo.gov.br/x" } });
    fireEvent.keyDown(url, { key: "Enter", code: "Enter" });
    fireEvent.submit(url);
    expect(saveCalls()).toHaveLength(0);
  });

  it("o botão do documento oficial só aparece com endereço https no formulário e leva o endereço aparado ao material", async () => {
    listed = { ...ITEM, source_url: null };
    render(<AdminUpdates />);
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    await screen.findByText(AI_LINE);
    const official = () => screen.queryByRole("button", { name: "Ler o documento oficial deste item" });
    expect(official()).toBeNull();
    const address = screen.getByLabelText("Endereço do documento oficial (https)");
    fireEvent.change(address, { target: { value: "http://exemplo.gov.br/pcdt.pdf" } });
    expect(official()).toBeNull();
    fireEvent.change(address, { target: { value: "  https://www.gov.br/saude/novo.pdf  " } });
    fireEvent.click(official()!);
    expect(((await screen.findByLabelText("Endereço (https)")) as HTMLInputElement).value).toBe("https://www.gov.br/saude/novo.pdf");
  });

  it("flashcards: Usar acrescenta ao fim e os existentes ficam com todas as chaves; clicar de novo não repete", async () => {
    const existing = { front: "Dose do AAS?", back: "100 mg", type: "basic" };
    const added = { front: "Quando iniciar o AAS?", back: "A partir de 12 semanas." };
    listed = { ...ITEM, flashcards: [existing] };
    answer = R({ suggestions: [S({ id: "s1", field: "flashcards", value: [added], append: true })] });
    render(<AdminUpdates />);
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    const card = await screen.findByRole("region", { name: "Sugestão: Flashcards" });
    expect(screen.getAllByPlaceholderText("Frente")).toHaveLength(1);
    fireEvent.click(within(card).getByRole("button", { name: "Usar" }));
    const used = within(card).getByRole("button", { name: "Usado" }) as HTMLButtonElement;
    expect(used.disabled).toBe(true);
    fireEvent.click(used);
    expect(screen.getAllByPlaceholderText("Frente")).toHaveLength(2);
    expect(saveCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1].p_update.flashcards).toEqual([existing, added]);
    expect(await screen.findByText("Atualização salva.")).toBeTruthy();
  });

  it("Usar apaga o aviso de salvo: o formulário voltou a ter mudança sem gravar", async () => {
    render(<AdminUpdates />);
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Atualização salva.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "Sugestão: Conduta vigente" })).getByRole("button", { name: "Usar" }));
    expect(textarea("Conduta vigente").value).toBe(CONDUCT);
    expect(screen.queryByText("Atualização salva.")).toBeNull();
    expect(saveCalls()).toHaveLength(1);
  });

  it("atualização nova: o assistente pede com id nulo e, depois do primeiro salvamento, com o id gravado, sem perder o painel", async () => {
    answer = R({ suggestions: [S({ id: "s1", field: "current_conduct", value: CONDUCT })] });
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova atualização" }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Pré-eclâmpsia" } });
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    await screen.findByText(AI_LINE);
    expect(screen.queryByRole("button", { name: "Ler o documento oficial deste item" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "Sugestão: Conduta vigente" })).getByRole("button", { name: "Usar" }));
    expect(JSON.parse(runCalls()[0][1].body).form).toMatchObject({ id: null, topic: "Pré-eclâmpsia" });
    fireEvent.click(screen.getByRole("button", { name: "Criar atualização" }));
    expect(await screen.findByRole("button", { name: "Salvar alterações" })).toBeTruthy();
    expect(saveCalls()[0][1].p_update).toMatchObject({ topic: "Pré-eclâmpsia", current_conduct: CONDUCT });
    expect(screen.getByRole("region", { name: "Sugestão: Conduta vigente" })).toBeTruthy(); // o painel continua e o cartão fica "Usado"
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(screen.queryByRole("region", { name: "Sugestão: Conduta vigente" })).toBeNull(); // pedido novo apaga o resultado anterior
    await screen.findByRole("region", { name: "Sugestão: Conduta vigente" });
    expect(runCalls()).toHaveLength(2);
    expect(JSON.parse(runCalls()[1][1].body).form).toMatchObject({ id: "u9", topic: "Pré-eclâmpsia" });
  });

  it("revisor de outra área: a recusa do servidor aparece no painel, em português, e nada é preenchido", async () => {
    runFails = { status: 403, error: "Você revisa outra área: o assistente vale só para as Atualizações da sua área." };
    render(<AdminUpdates />);
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText("Você revisa outra área: o assistente vale só para as Atualizações da sua área.")).toBeTruthy();
    expect(textarea("Conduta vigente").value).toBe("Agora.");
    expect(saveCalls()).toHaveLength(0);
  });

  it("falha por dentro (502 com texto do provedor em inglês): o painel mostra a frase padrão e o formulário não muda (Q13)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      runFails = { status: 502, error: "O assistente falhou: Gemini HTTP 503: The model is overloaded. Please try again later." };
      render(<AdminUpdates />);
      await openItem();
      fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
      fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
      expect(await screen.findByText("O assistente não conseguiu responder agora. Tente de novo em instantes.")).toBeTruthy();
      expect(screen.queryByText(/overloaded|Gemini HTTP/)).toBeNull();
      expect(spy.mock.calls.flat().map((a) => String((a as any)?.message ?? a)).join("\n")).toContain("The model is overloaded");
      expect(textarea("Conduta vigente").value).toBe("Agora.");
      expect(saveCalls()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("não foi possível ler a situação das IAs: aviso curto em português, sem o texto do servidor (Q13)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      statusFails = { status: 500, error: "Connection terminated unexpectedly." };
      render(<AdminUpdates />);
      await openItem();
      fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
      expect(await screen.findByText("Não foi possível ler a situação do assistente.")).toBeTruthy();
      expect(screen.queryByText(/Connection terminated/)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("atualização no ar: Usar não grava; ao salvar a tela pergunta antes porque sai do ar (AT02), cancelar não grava e confirmar grava", async () => {
    listed = { ...ITEM, published: true, review_status: "approved", reviewed: true, reviewer: "Dra. Revisora", reviewed_at: "2026-10-06T12:00:00Z" };
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [listed] };
      // como o banco: texto mudado numa publicada tira do ar e volta a conferência para pendente
      if (fn === "app_admin_save_guideline_update") return { ...listed, ...args.p_update, published: false, reviewed: false, review_status: "pending", review_note: "Conteúdo alterado depois da conferência: revisar de novo." };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<AdminUpdates />);
      await openItem();
      expect(screen.getByText(/Esta atualização está no ar/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Assistente" }));
      fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
      fireEvent.click(within(await screen.findByRole("region", { name: "Sugestão: Conduta vigente" })).getByRole("button", { name: "Usar" }));
      expect(textarea("Conduta vigente").value).toBe(CONDUCT);
      expect(saveCalls()).toHaveLength(0);
      expect(confirm).not.toHaveBeenCalled();
      // o aviso de que sai do ar continua na tela com o painel aberto
      expect(screen.getByText(/Esta atualização está no ar/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/sai do ar/));
      expect(saveCalls()).toHaveLength(0);
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(saveCalls()).toHaveLength(1));
      expect(saveCalls()[0][1].p_update).toMatchObject({ current_conduct: CONDUCT });
      expect(await screen.findByText("Atualização salva.")).toBeTruthy();
      expect(screen.queryByText(/Esta atualização está no ar/)).toBeNull();
      expect(screen.getByRole("complementary", { name: "Assistente" })).toBeTruthy(); // o painel continua aberto
    } finally {
      confirm.mockRestore();
    }
  });

  it("com 900 px ou mais, abrir o painel não refaz o editor: o texto digitado e o botão ficam no mesmo lugar", async () => {
    const OldRO = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = class { cb: any; constructor(cb: any) { this.cb = cb; } observe() {} disconnect() {} };
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as any);
    try {
      render(<AdminUpdates />);
      await openItem();
      const field = textarea("Conduta vigente");
      fireEvent.change(field, { target: { value: "Conduta que eu digitei." } });
      const button = screen.getByRole("button", { name: "Assistente" });
      button.focus();
      fireEvent.click(button);
      await screen.findByText(AI_LINE);
      expect(textarea("Conduta vigente")).toBe(field);
      expect(field.value).toBe("Conduta que eu digitei.");
      expect(document.body.contains(button)).toBe(true);
      expect(document.activeElement).toBe(button);
      expect(screen.getByRole("complementary", { name: "Assistente" }).closest("form")).toBeNull();
      fireEvent.click(button);
      expect(textarea("Conduta vigente")).toBe(field);
      expect(document.activeElement).toBe(button);
    } finally {
      spy.mockRestore();
      (globalThis as any).ResizeObserver = OldRO;
    }
  });
});
