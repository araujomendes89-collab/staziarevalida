/**
 * Telas da Biblioteca de fontes oficiais com IA (Central de Conteúdo > Fontes), jsdom com banco e servidor simulados:
 * pedir a busca, buscas recentes, sites oficiais e (Candidatos) conferir, aprovar e rejeitar. Nenhuma IA nem internet reais.
 * Textos de teste, sem conteúdo clínico além de nomes de temas.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
let mobile = false;
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => mobile, useMQ: () => mobile }));

import { Sources } from "../novo/app/admin/content/Sources.jsx";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const STATUS_READY = { ready: true, problems: [], warnings: [], max_searches: 5 };
const DOMAINS = [
  { id: "d1", address: "gov.br/saude", institution: "Ministério da Saúde", kind: "governo", active: true },
  { id: "d2", address: "who.int", institution: "Organização Mundial da Saúde", kind: "internacional", active: true },
  { id: "d3", address: "sbp.com.br", institution: "Sociedade Brasileira de Pediatria", kind: "sociedade", active: false },
];
const SEARCH = {
  id: "s1", theme: "Bronquiolite", area: "PEDIATRIA", free_text: "PCDT mais recente", origin: "tema", status: "concluida", message: null,
  provider: "anthropic", model: "claude-a", web_searches: 4, cost_usd: 0.047, found_count: 3, verified_count: 2, discarded_count: 1,
  discarded: [{ link: "https://www.gov.br/saude/x.pdf", titulo: "Documento repetido", motivo: "Repetido: fonte já cadastrada." }],
  created_at: "2026-10-10T15:00:00Z", finished_at: "2026-10-10T15:05:00Z", job_status: "succeeded", job_error: null,
};

let fetchCalls: { url: string; method: string; body: any }[] = [];
let status: any;
let searches: any[];
let domains: any[];
let candidates: any;
let fetchHandlers: Record<string, (body: any) => Response>;

beforeEach(() => {
  mobile = false;
  fetchCalls = [];
  status = STATUS_READY;
  searches = [SEARCH];
  domains = structuredClone(DOMAINS);
  candidates = { items: [], counts: { aguardando: 0, aprovado: 0, rejeitado: 0 } };
  fetchHandlers = {};
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_ch_sources") return [];
    if (fn === "app_ch_source_searches") return searches;
    if (fn === "app_ch_official_domains") return domains;
    if (fn === "app_ch_source_candidates") return candidates;
    if (fn === "app_incidence") return { rows: [{ key: "Bronquiolite", total: 10 }, { key: "Asma", total: 8 }] };
    if (fn === "app_ch_source_search_start") return { searches: [{ id: "s2", theme: args.p_request.theme ?? "Asma", duplicate: false }] };
    if (fn === "app_ch_save_official_domain") return { ...args.p_domain, id: args.p_domain.id ?? "d9" };
    if (fn === "app_ch_source_candidate_save") return { ...candidates.items.find((c: any) => c.id === args.p_candidate_id), edited: args.p_fields };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    fetchCalls.push({ url, method, body });
    const h = fetchHandlers[`${method} ${url}`];
    if (h) return h(body);
    if (method === "GET" && url === "/api/content-hub/source-search/status") return json(status);
    return json({ ok: true });
  });
  window.confirm = vi.fn(() => true);
});
afterEach(cleanup);

const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

describe("Fontes: pedir busca, buscas recentes e sites oficiais", () => {
  it("pedido com um tema: área, tema e texto livre chegam ao banco e aparece o aviso dos 10 minutos", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    await waitFor(() => expect(within(panel).getByText("pronta")).toBeTruthy());
    fireEvent.change(within(panel).getByLabelText("Área"), { target: { value: "PEDIATRIA" } });
    fireEvent.change(within(panel).getByLabelText("Tema"), { target: { value: "Bronquiolite" } });
    fireEvent.change(within(panel).getByLabelText("Texto livre (opcional)"), { target: { value: "PCDT mais recente" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1]).toEqual({ p_request: { area: "PEDIATRIA", theme: "Bronquiolite", top_themes: null, free_text: "PCDT mais recente" } });
    expect(await within(panel).findByText("A busca roda no processamento da Central (até ~10 minutos); pode sair da tela.")).toBeTruthy();
  });

  it("sugestões de tema vêm da incidência da área escolhida", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    fireEvent.change(within(panel).getByLabelText("Área"), { target: { value: "PEDIATRIA" } });
    await waitFor(() => expect(rpcCalls("app_incidence").some((c: any[]) => c[1].p_dimension === "topic" && c[1].p_area === "PEDIATRIA")).toBe(true));
    await waitFor(() => expect(panel.querySelectorAll("datalist option")).toHaveLength(2));
  });

  it("busca igual na fila avisa em vez de repetir", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_source_search_start") return { searches: [{ id: "s1", theme: "Bronquiolite", duplicate: true }] };
      if (fn === "app_ch_sources") return [];
      if (fn === "app_ch_source_searches") return [];
      if (fn === "app_ch_official_domains") return [];
      if (fn === "app_incidence") return { rows: [] };
      return { items: [], counts: {} };
    });
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    fireEvent.change(within(panel).getByLabelText("Tema"), { target: { value: "Bronquiolite" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Buscar" }));
    expect(await within(panel).findByText(/Já havia uma busca igual na fila: Bronquiolite/)).toBeTruthy();
  });

  it("temas mais cobrados: 5 por padrão, até 10", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    fireEvent.change(within(panel).getByLabelText("O que buscar"), { target: { value: "top" } });
    const qty = within(panel).getByLabelText("Quantos temas (1 a 10)") as HTMLInputElement;
    expect(qty.value).toBe("5");
    fireEvent.click(within(panel).getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1].p_request).toEqual({ area: null, theme: null, top_themes: 5, free_text: null });
    fireEvent.change(qty, { target: { value: "11" } });
    expect(qty.value).toBe("10");
    fireEvent.change(qty, { target: { value: "0" } });
    expect(qty.value).toBe("1");
  });

  it("Buscar fica travado sem tema", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    await waitFor(() => expect(within(panel).getByText("pronta")).toBeTruthy());
    expect((within(panel).getByRole("button", { name: "Buscar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("função desligada: aviso e Buscar travado", async () => {
    status = { ready: false, problems: ["Desligada: configure esta função na Central de IAs."], warnings: [], max_searches: 5 };
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    expect(await within(panel).findByText("desligada — configure na Central de IAs")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Tema"), { target: { value: "Asma" } });
    expect((within(panel).getByRole("button", { name: "Buscar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getByText("Desligada: configure esta função na Central de IAs.")).toBeTruthy();
  });

  it("buscas recentes: estado, IA e modelo, buscas, custo, conferidos e descartados com os motivos", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const box = await screen.findByTestId("recent-searches");
    expect(await within(box).findByText("Bronquiolite")).toBeTruthy();
    expect(within(box).getByText("Concluída")).toBeTruthy();
    expect(within(box).getByText(/Claude · claude-a/)).toBeTruthy();
    expect(within(box).getByText(/4 buscas/)).toBeTruthy();
    expect(within(box).getByText(/US\$ 0,047/)).toBeTruthy();
    expect(within(box).getByText(/2 conferidos/)).toBeTruthy();
    expect(within(box).queryByText("Repetido: fonte já cadastrada.")).toBeNull();
    fireEvent.click(within(box).getByRole("button", { name: /1 descartado/ }));
    expect(within(box).getByText("Repetido: fonte já cadastrada.")).toBeTruthy();
    expect(within(box).getByText("Documento repetido")).toBeTruthy();
  });

  it("buscas recentes: pendente e falhou mostram o motivo", async () => {
    searches = [
      { ...SEARCH, id: "s2", status: "pendente", message: "A função está desligada na Central de IAs.", discarded: [], discarded_count: 0 },
      { ...SEARCH, id: "s3", theme: "Asma", status: "falhou", message: null, job_status: "dead", job_error: "A IA não respondeu.", discarded: [], discarded_count: 0 },
    ];
    render(<Sources isAdmin go={() => {}} />);
    const box = await screen.findByTestId("recent-searches");
    expect(await within(box).findByText("Pendente")).toBeTruthy();
    expect(within(box).getByText("A função está desligada na Central de IAs.")).toBeTruthy();
    expect(within(box).getByText("Falhou")).toBeTruthy();
    expect(within(box).getByText("A IA não respondeu.")).toBeTruthy();
  });

  it("sites oficiais: lista, acrescentar e desativar", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const box = await screen.findByTestId("official-domains");
    expect(await within(box).findByText("gov.br/saude")).toBeTruthy();
    expect(within(within(box).getByTestId("domain-d1")).getByText("Governo")).toBeTruthy();
    expect(within(within(box).getByTestId("domain-d2")).getByText("Internacional")).toBeTruthy();
    expect(within(within(box).getByTestId("domain-d3")).getByText("Sociedade médica")).toBeTruthy();
    expect(within(within(box).getByTestId("domain-d3")).getByText("desativado")).toBeTruthy();
    // desativar o primeiro
    fireEvent.click(within(box).getByRole("switch", { name: "Ativo — gov.br/saude" }));
    await waitFor(() => expect(rpcCalls("app_ch_save_official_domain")).toHaveLength(1));
    expect(rpcCalls("app_ch_save_official_domain")[0][1].p_domain).toEqual({ id: "d1", address: "gov.br/saude", institution: "Ministério da Saúde", kind: "governo", active: false });
    // acrescentar
    fireEvent.change(within(box).getByLabelText("Endereço do site"), { target: { value: "https://Exemplo.gov.br/Saude/" } });
    fireEvent.change(within(box).getByLabelText("Instituição"), { target: { value: "Exemplo" } });
    fireEvent.change(within(box).getByLabelText("Tipo do site"), { target: { value: "sociedade" } });
    fireEvent.click(within(box).getByRole("button", { name: "Acrescentar site" }));
    await waitFor(() => expect(rpcCalls("app_ch_save_official_domain")).toHaveLength(2));
    expect(rpcCalls("app_ch_save_official_domain")[1][1].p_domain).toEqual({ address: "https://Exemplo.gov.br/Saude/", institution: "Exemplo", kind: "sociedade", active: true });
  });

  it("sites oficiais: erro do banco aparece em português", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_save_official_domain") throw new Error("Endereço do site: use só letras sem acento, números, ponto, hífen e barra.");
      if (fn === "app_ch_official_domains") return [];
      if (fn === "app_ch_sources") return [];
      if (fn === "app_ch_source_searches") return [];
      if (fn === "app_incidence") return { rows: [] };
      return { items: [], counts: {} };
    });
    render(<Sources isAdmin go={() => {}} />);
    const box = await screen.findByTestId("official-domains");
    fireEvent.change(await within(box).findByLabelText("Endereço do site"), { target: { value: "saúde.gov.br" } });
    fireEvent.change(within(box).getByLabelText("Instituição"), { target: { value: "Teste" } });
    fireEvent.click(within(box).getByRole("button", { name: "Acrescentar site" }));
    expect(await within(box).findByText(/use só letras sem acento/)).toBeTruthy();
  });

  it("editor vê só Fontes cadastradas", async () => {
    render(<Sources isAdmin={false} go={() => {}} />);
    expect(await screen.findByText("Fontes cadastradas")).toBeTruthy();
    expect(screen.queryByTestId("source-search")).toBeNull();
    expect(screen.queryByTestId("recent-searches")).toBeNull();
    expect(screen.queryByTestId("official-domains")).toBeNull();
    expect(screen.queryByTestId("source-candidates")).toBeNull();
    expect(rpcCalls("app_ch_source_searches")).toHaveLength(0);
    expect(rpcCalls("app_ch_official_domains")).toHaveLength(0);
    expect(rpcCalls("app_ch_source_candidates")).toHaveLength(0);
  });

  it("ordem para administrador: buscar, buscas recentes, candidatos, sites oficiais, cadastrar fonte, fontes cadastradas", async () => {
    render(<Sources isAdmin go={() => {}} />);
    await screen.findByTestId("official-domains");
    const titles = Array.from(document.querySelectorAll("h3")).map((h) => h.textContent);
    const order = ["Buscar fontes com IA", "Buscas recentes", "Sites oficiais", "Cadastrar fonte", "Fontes cadastradas"].map((t) => titles.findIndex((x) => x?.startsWith(t)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("celular: uma coluna", async () => {
    mobile = true;
    render(<Sources isAdmin go={() => {}} />);
    const panel = await screen.findByTestId("source-search");
    const grid = panel.querySelector('[data-testid="source-search-form"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("1fr");
  });
});
