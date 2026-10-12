/**
 * Fase 1, grupo A (telas, jsdom): estimativa de custo e "Tirar marcas de terceiros" na tela do documento (só administrador), situação
 * "Sem rascunhos", aviso depois do envio (CC10) e teto por documento na Configuração. Banco e servidor simulados.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t", uploadToSignedUrl: vi.fn(async () => undefined) };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("react-router-dom", async () => ({ ...(await vi.importActual<any>("react-router-dom")), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));

import { DocumentDetail } from "../novo/app/admin/content/DocumentDetail.jsx";
import { Documents } from "../novo/app/admin/content/Documents.jsx";
import { HubSettings } from "../novo/app/admin/content/HubSettings.jsx";
import { DOC_STATUS, PROCESSING_START_NOTICE } from "../novo/app/admin/content/labels.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NO_DRAFTS_TEXT = "Sem rascunhos para revisar: nenhuma das 3 afirmações ficou compatível com uma fonte oficial, então nenhum rascunho foi gerado.";
const DETAIL = (over: Record<string, unknown> = {}) => ({
  document: { id: "d1", name: "Apostila de teste", status: "no_drafts", failure: NO_DRAFTS_TEXT, purpose: "study", sha256: "a".repeat(64), page_count: 2, text_kind: "text", provenance: {} , ...over },
  inventory: { complete: true, pages: 2, expected_pages: 2, unresolved: [], pages_without_blocks: [], by_status: { extracted: 4 }, by_type: { paragraph: 4 }, flagged: 0 },
  pages: [],
  jobs: [{ id: "j1", step: "draft", status: "succeeded", attempts: 1, max_attempts: 3, metrics: {} }],
  claims: [],
  ai_runs: [],
});
const ESTIMATE = {
  document_id: "d1", pages: 2, text_chars: 4200, claims: null, themes: null, total_usd: 0.1234, partial: true, missing_prices: [], no_model: [], spent_usd: 0.0151, cap: { enabled: false, usd: null },
  lines: [
    { step: "classify", label: "Classificar o texto por tema", function: "criacao", model: "m", calls: 2, input_tokens: 10, output_tokens: 20, usd: 0.1, per_call_usd: 0.05 },
    { step: "claims", label: "Extrair as afirmações clínicas", function: "criacao", model: "m", calls: 1, input_tokens: 10, output_tokens: 20, usd: 0.0234, per_call_usd: 0.0234 },
    { step: "evidence", label: "Conferir cada afirmação nas fontes oficiais", function: "verificacao", model: "m", calls: null, input_tokens: null, output_tokens: null, usd: null, per_call_usd: 0.03 },
  ],
  notes: ["É o pior caso (cada chamada usando o máximo que a IA pode devolver)."],
};
const calls: { url: string; body: any }[] = [];

beforeEach(() => {
  calls.length = 0;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_ch_document") return DETAIL();
    if (fn === "app_ch_documents") return [];
    if (fn === "app_ch_processing_settings") return { document_cap_enabled: false, document_cap_usd: null };
    if (fn === "app_ch_set_processing_settings") return { document_cap_enabled: true, document_cap_usd: 5 };
    if (fn === "app_ch_flags") return {};
    if (fn === "app_ch_prompt_versions") return [];
    if (fn === "app_ch_ai_usage") return { by_step: [], jobs: {} };
    if (fn === "app_ch_reviewers") return [];
    if (fn === "app_ai_summary") return { functions: [], providers_enabled: [], month_spend: 0 };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url.endsWith("/cost-estimate")) return json(ESTIMATE);
    if (url.endsWith("/clean-references")) {
      if (body.action === "preview") return json({ terms: body.terms, edited: 1, excluded: 1, total: 2, shown: 2, changes: [{ block_id: "b1", page: 1, before: "Conduta inicial (Curso Modelo).", after: "Conduta inicial.", exclude: false, removed: ["Curso Modelo"] }, { block_id: "b2", page: 2, before: "Curso Modelo", after: null, exclude: true, removed: ["Curso Modelo"] }] });
      if (body.action === "apply") return json({ edited: 1, excluded: 1, skipped: 0, planned: 2 });
      return json({ undone: 2, skipped: 0 });
    }
    return json({});
  });
});
afterEach(cleanup);

const detail = (isAdmin = true) => render(<DocumentDetail id="d1" go={() => undefined} isAdmin={isAdmin} params={new URLSearchParams()} />);

describe("Documento sem rascunhos (CC03)", () => {
  it("a situação tem nome próprio e o motivo aparece como aviso (não como falha)", async () => {
    expect(DOC_STATUS.no_drafts).toEqual(["Sem rascunhos para revisar", "warning"]);
    detail();
    expect(await screen.findByText(NO_DRAFTS_TEXT)).toBeTruthy();
    expect(screen.getByText("Sem rascunhos para revisar")).toBeTruthy(); // o selo da situação
    expect(screen.getByText("Sem rascunhos")).toBeTruthy(); // o título do aviso
    expect(screen.queryByText("Falha")).toBeNull();
  });
});

describe("Estimativa de custo da IA (CC05)", () => {
  it("só o administrador vê; o botão calcula sem gastar e mostra chamadas, custo no pior caso e o aviso", async () => {
    detail(false);
    await screen.findByText(NO_DRAFTS_TEXT);
    expect(screen.queryByText("Estimativa de custo da IA")).toBeNull();
    expect(screen.queryByText("Tirar marcas de terceiros")).toBeNull();
    cleanup();

    detail(true);
    fireEvent.click(await screen.findByRole("button", { name: /Calcular estimativa/ }));
    expect(await screen.findByText("Classificar o texto por tema")).toBeTruthy();
    expect(calls.filter((c) => c.url.includes("cost-estimate")).map((c) => c.url)).toEqual(["/api/content-hub/documents/d1/cost-estimate"]);
    expect(screen.getByText("depende das afirmações")).toBeTruthy();
    expect(screen.getByText(/Total conhecido: US\$ 0,1234/)).toBeTruthy();
    expect(screen.getByText("parcial")).toBeTruthy();
    expect(screen.getByText(/já gasto neste documento: US\$ 0,0151/)).toBeTruthy();
    expect(screen.getByText("teto por documento: desligado")).toBeTruthy();
    expect(screen.getByText(/É o pior caso/)).toBeTruthy();
  });
});

describe("Tirar marcas de terceiros (CC09)", () => {
  it("digita os nomes (um por linha), vê a prévia sem alterar nada, aplica e desfaz", async () => {
    detail();
    fireEvent.change(await screen.findByLabelText("Nomes, marcas e endereços a tirar"), { target: { value: "Curso Modelo\n\n  www.cursomodelo.com.br  " } });
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    expect(await screen.findByText("Conduta inicial.")).toBeTruthy();
    expect(screen.getByText("Este bloco só tinha a marca e será excluído.")).toBeTruthy();
    expect(calls.at(-1)).toEqual({ url: "/api/content-hub/documents/d1/clean-references", body: { action: "preview", terms: ["Curso Modelo", "www.cursomodelo.com.br"] } });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar em 2 bloco/ }));
    await waitFor(() => expect(calls.at(-1)?.body.action).toBe("apply"));
    expect(calls.at(-1)?.body.terms).toEqual(["Curso Modelo", "www.cursomodelo.com.br"]);
    expect(await screen.findByText(/O texto original continua guardado/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Desfazer o que foi tirado/ }));
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ action: "undo", terms: ["Curso Modelo", "www.cursomodelo.com.br"] }));
  });

  it("a recusa do servidor aparece em português na própria tela", async () => {
    (globalThis as any).fetch = vi.fn(async () => json({ error: 'O termo "ab" é curto demais (mínimo de 3 letras): tiraria palavras comuns do texto.' }, 400));
    detail();
    fireEvent.change(await screen.findByLabelText("Nomes, marcas e endereços a tirar"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    expect(await screen.findByText(/é curto demais/)).toBeTruthy();
  });
});

describe("Aviso depois do envio (CC10)", () => {
  it("diz que o arquivo entrou na fila e quando o processamento passa (1 minuto), sem prometer que já começou", async () => {
    expect(PROCESSING_START_NOTICE).not.toMatch(/processamento começou/i);
    expect(PROCESSING_START_NOTICE).toMatch(/na fila/);
    expect(PROCESSING_START_NOTICE).toMatch(/a cada 1 minuto/);
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/upload")) return json({ mode: "signed", bucket: "content-hub", key: "uploads/x.pdf", path: "uploads/x.pdf", token: "tk" });
      return json({ id: "d9", duplicate: false, sha256: "f".repeat(64), job: { id: "j" } }, 201);
    });
    render(<Documents params={new URLSearchParams()} go={() => undefined} isAdmin />);
    const file = new File([new Uint8Array([37, 80, 68, 70, 45])], "a.pdf", { type: "application/pdf" });
    fireEvent.change(await screen.findByLabelText("Arquivo PDF"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar e processar/ }));
    expect(await screen.findByText(PROCESSING_START_NOTICE)).toBeTruthy();
    expect(screen.getByText(/A leitura do PDF não usa IA \(sem custo de IA\)/)).toBeTruthy();
  });
});

describe("Teto de gasto por documento na Configuração (CC05)", () => {
  it("aparece desligado, só para o administrador, e salva ligado com o valor", async () => {
    render(<HubSettings isAdmin status={{ storage: "supabase", brand: { pending: [] } }} />);
    const check = (await screen.findByLabelText("Ligar o teto por documento")) as HTMLInputElement;
    expect(check.checked).toBe(false);
    expect(screen.getByText(/Fica desligado por enquanto/)).toBeTruthy();
    fireEvent.click(check);
    fireEvent.change(screen.getByLabelText("Valor do teto (US$)"), { target: { value: "5,00" } });
    const save = screen.getAllByRole("button", { name: "Salvar" }).at(-1)!;
    fireEvent.click(save);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_set_processing_settings", { p_document_cap_enabled: true, p_document_cap_usd: 5 }));
    cleanup();
    render(<HubSettings isAdmin={false} status={{ storage: "supabase", brand: { pending: [] } }} />);
    await screen.findByText("Situação do servidor");
    expect(screen.queryByLabelText("Ligar o teto por documento")).toBeNull();
  });

  it("banco ainda sem a atualização: a tela avisa em vez de quebrar", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_processing_settings") throw new Error("Could not find the function public.app_ch_processing_settings");
      if (fn === "app_ch_flags") return {};
      if (fn === "app_ch_prompt_versions") return [];
      if (fn === "app_ch_ai_usage") return { by_step: [], jobs: {} };
      if (fn === "app_ch_reviewers") return [];
      if (fn === "app_ai_summary") return { functions: [], providers_enabled: [], month_spend: 0 };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<HubSettings isAdmin status={{ storage: "supabase", brand: { pending: [] } }} />);
    expect(await screen.findByText(/Disponível depois que a atualização do banco for aplicada/)).toBeTruthy();
  });
});
