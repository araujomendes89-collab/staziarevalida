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

const CAND: any = {
  id: "c1", search_id: "s1", status: "aguardando", site_address: "gov.br/saude", site_kind: "governo", site_institution: "Ministério da Saúde",
  requested_url: "https://www.gov.br/saude/pedido.pdf", final_url: "https://www.gov.br/saude/final.pdf",
  ai_title: "PCDT de teste", ai_institution: "Ministério da Saúde", ai_published: "2024-05-10", ai_nature: "PCDT", ai_kind: "final", ai_level: "A",
  ai_reason: "Documento oficial vigente do tema.", file_title: "Protocolo de teste (título no arquivo)", file_date: "2024-05-09",
  quote: "Trecho de teste copiado do documento.", quote_page: 12, seen_in_search: true, file_kind: "pdf", sha256: "abcdef0123456789abcdef0123456789",
  size_bytes: 2621440, page_count: 48, preview: "Texto de prévia <b>sem HTML</b> do documento.", suggested_level: "A", suggested_kind: "final", suggested_nature: "PCDT",
  edited: {}, created_at: "2026-10-10T15:05:00Z", decision_reason: null, source_id: null, document_id: null,
  search: { theme: "Bronquiolite", area: "PEDIATRIA", created_at: "2026-10-10T15:00:00Z", provider: "anthropic", model: "claude-a" }, replaces: null,
};
const withCands = (items: any[], counts?: any) => {
  candidates = { items, counts: counts ?? { aguardando: items.filter((i) => i.status === "aguardando").length, aprovado: 0, rejeitado: 0 } };
};
const card = async (id = "c1") => screen.findByTestId(`candidate-${id}`);
const approveBtn = (c: HTMLElement) => within(c).getByRole("button", { name: "Aprovar" }) as HTMLButtonElement;

describe("Candidatos", () => {
  beforeEach(() => {
    withCands([CAND]);
    window.open = vi.fn() as any;
  });

  it("cartão mostra trecho com página, visto na busca, arquivo, prévia e o título/data do arquivo ao lado dos da IA", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    expect(within(c).getByText("Ministério da Saúde")).toBeTruthy();
    expect(within(c).getByText(/gov\.br\/saude · Governo/)).toBeTruthy();
    expect(within(c).getByText("Documento oficial vigente do tema.")).toBeTruthy();
    expect(within(c).getByText("Trecho de teste copiado do documento.")).toBeTruthy();
    expect(within(c).getByText("página 12")).toBeTruthy();
    expect(within(c).getByText("visto na busca: sim")).toBeTruthy();
    expect(within(c).getByText(/PDF · 48 páginas · 2,5 MB/)).toBeTruthy();
    expect(within(c).getByText("abcdef0123…")).toBeTruthy();
    expect(within(c).getAllByText("PCDT de teste").length).toBeGreaterThanOrEqual(2); // cabeçalho e "Título segundo a IA"
    expect(within(c).getByText("Protocolo de teste (título no arquivo)")).toBeTruthy();
    expect(within(c).getByText("10/05/2024")).toBeTruthy();
    expect(within(c).getByText("09/05/2024")).toBeTruthy();
    // prévia: só texto, nunca HTML
    expect(within(c).queryByText(/sem HTML/)).toBeNull();
    fireEvent.click(within(c).getByRole("button", { name: "Prévia do texto" }));
    const pre = within(c).getByText(/Texto de prévia/);
    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toContain("<b>sem HTML</b>");
    expect(pre.querySelector("b")).toBeNull();
    // o campo não é trocado sozinho: continua o dado da IA
    expect((within(c).getByLabelText("Título") as HTMLInputElement).value).toBe("PCDT de teste");
    const site = within(c).getByRole("link", { name: "Abrir no site oficial" }) as HTMLAnchorElement;
    expect(site.getAttribute("href")).toBe("https://www.gov.br/saude/final.pdf");
    expect(site.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("data só com ano aparece como Ano: AAAA", async () => {
    withCands([{ ...CAND, ai_published: "2023", file_date: null }]);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    expect(within(c).getByText("Ano: 2023")).toBeTruthy();
    expect((within(c).getByLabelText("Data de publicação") as HTMLInputElement).value).toBe("");
  });

  it("aviso de substituição quando há fonte vigente igual", async () => {
    withCands([{ ...CAND, replaces: { id: "src1", title: "PCDT antigo", version: "2021" } }]);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    expect(within(c).getByText("Vai substituir a fonte vigente: PCDT antigo (versão 2021).")).toBeTruthy();
  });

  it("Aprovar travado sem nível, sem título ou instituição e sem a caixa; nível E não aparece", async () => {
    withCands([{ ...CAND, suggested_level: null, ai_level: null }]);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    const level = within(c).getByLabelText("Nível") as HTMLSelectElement;
    expect(Array.from(level.options).map((o) => o.value)).toEqual(["", "A", "B", "C", "D"]);
    expect(level.value).toBe("");
    const box = within(c).getByLabelText("Conferi o documento no arquivo guardado");
    fireEvent.click(box);
    expect(approveBtn(c).disabled).toBe(true); // sem nível
    fireEvent.change(level, { target: { value: "B" } });
    expect(approveBtn(c).disabled).toBe(false);
    fireEvent.change(within(c).getByLabelText("Título"), { target: { value: "  " } });
    expect(approveBtn(c).disabled).toBe(true);
    fireEvent.change(within(c).getByLabelText("Título"), { target: { value: "Título" } });
    fireEvent.change(within(c).getByLabelText("Instituição"), { target: { value: "" } });
    expect(approveBtn(c).disabled).toBe(true);
    fireEvent.change(within(c).getByLabelText("Instituição"), { target: { value: "Órgão" } });
    expect(approveBtn(c).disabled).toBe(false);
    fireEvent.click(box);
    expect(approveBtn(c).disabled).toBe(true); // sem a caixa
  });

  it("nível começa pela sugestão (padrão do tipo de site) e mostra a sugestão da IA", async () => {
    withCands([{ ...CAND, suggested_level: "B", ai_level: "C" }]);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    expect((within(c).getByLabelText("Nível") as HTMLSelectElement).value).toBe("B");
    expect(within(c).getByText("sugestão da IA: C")).toBeTruthy();
  });

  it("salvar dados envia os campos editados ao banco", async () => {
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.change(within(c).getByLabelText("Versão"), { target: { value: "2024" } });
    fireEvent.change(within(c).getByLabelText("Tema"), { target: { value: "Asma" } });
    fireEvent.click(within(c).getByRole("button", { name: "Salvar dados" }));
    await waitFor(() => expect(rpcCalls("app_ch_source_candidate_save")).toHaveLength(1));
    const args = rpcCalls("app_ch_source_candidate_save")[0][1];
    expect(args.p_candidate_id).toBe("c1");
    expect(args.p_fields).toEqual({
      institution: "Ministério da Saúde", title: "PCDT de teste", version: "2024", published_on: "2024-05-10", kind: "final", nature: "PCDT",
      level: "A", area: "PEDIATRIA", theme: "Asma", valid_until: null,
    });
    expect(await within(c).findByText("Dados salvos.")).toBeTruthy();
  });

  it("aprovar envia os dados editados e a caixa", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ source_id: "src9", document_id: "doc9", superseded: false, candidate_versions: 0, file_kind: "pdf", job: { id: "j1" } }, 201);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.change(within(c).getByLabelText("Título"), { target: { value: "PCDT corrigido" } });
    fireEvent.change(within(c).getByLabelText("Nível"), { target: { value: "A" } });
    fireEvent.click(within(c).getByLabelText("Conferi o documento no arquivo guardado"));
    fireEvent.click(approveBtn(c));
    await waitFor(() => expect(fetchCalls.some((x) => x.url === "/api/content-hub/source-candidates/c1/approve")).toBe(true));
    const body = fetchCalls.find((x) => x.url === "/api/content-hub/source-candidates/c1/approve")!.body;
    expect(body.fields).toMatchObject({ title: "PCDT corrigido", institution: "Ministério da Saúde", level: "A", checked: true });
    expect(body.fields.confirm_replace).toBeUndefined();
    expect(await screen.findByText(/Fonte aprovada: PCDT corrigido\./)).toBeTruthy();
    expect(screen.getByText(/A leitura do documento entrou na fila/)).toBeTruthy();
  });

  it("substituição pede confirmação e reenvia com confirm_replace", async () => {
    let n = 0;
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => {
      n += 1;
      return n === 1 ? json({ error: 'Confirme a substituição: esta aprovação substitui a fonte vigente "PCDT antigo" (versão 2021).' }, 409) : json({ source_id: "s", document_id: "d", superseded: true }, 201);
    };
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.click(within(c).getByLabelText("Conferi o documento no arquivo guardado"));
    fireEvent.click(approveBtn(c));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith('Confirme a substituição: esta aprovação substitui a fonte vigente "PCDT antigo" (versão 2021).'));
    await waitFor(() => expect(fetchCalls.filter((x) => x.url.endsWith("/c1/approve"))).toHaveLength(2));
    expect(fetchCalls.filter((x) => x.url.endsWith("/c1/approve"))[1].body.fields.confirm_replace).toBe(true);
  });

  it("substituição recusada na confirmação não reenvia", async () => {
    (window.confirm as any).mockReturnValue(false);
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ error: "Confirme a substituição: esta aprovação substitui a fonte vigente \"X\" (versão 1)." }, 409);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.click(within(c).getByLabelText("Conferi o documento no arquivo guardado"));
    fireEvent.click(approveBtn(c));
    expect(await within(c).findByText(/substituição não foi confirmada/)).toBeTruthy();
    expect(fetchCalls.filter((x) => x.url.endsWith("/c1/approve"))).toHaveLength(1);
  });

  it("recusa do banco aparece em português no cartão", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ error: "O site gov.br/saude saiu da lista de sites oficiais ou foi desativado: reative-o ou rejeite este candidato." }, 400);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.click(within(c).getByLabelText("Conferi o documento no arquivo guardado"));
    fireEvent.click(approveBtn(c));
    expect(await within(c).findByText(/saiu da lista de sites oficiais/)).toBeTruthy();
  });

  it("rejeitar exige 10 caracteres", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/reject"] = () => json({ storage_path: null });
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    const reject = within(c).getByRole("button", { name: "Rejeitar" }) as HTMLButtonElement;
    const reason = within(c).getByLabelText("Motivo da rejeição");
    fireEvent.change(reason, { target: { value: "123456789" } });
    expect(reject.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: "1234567890" } });
    expect(reject.disabled).toBe(false);
    fireEvent.click(reject);
    await waitFor(() => expect(fetchCalls.some((x) => x.url === "/api/content-hub/source-candidates/c1/reject")).toBe(true));
    expect(fetchCalls.find((x) => x.url.endsWith("/c1/reject"))!.body).toEqual({ reason: "1234567890" });
    expect(await screen.findByText(/Candidato rejeitado/)).toBeTruthy();
  });

  it("abrir arquivo usa o link temporário; página web só tem Abrir no site oficial", async () => {
    fetchHandlers["GET /api/content-hub/source-candidates/c1/file"] = () => json({ url: "https://armazenamento.test/temporario" });
    withCands([CAND, { ...CAND, id: "c2", file_kind: "html", quote_page: null, page_count: null }]);
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.click(within(c).getByRole("button", { name: "Abrir arquivo guardado" }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("https://armazenamento.test/temporario", "_blank", "noopener"));
    const web = await card("c2");
    expect(within(web).queryByRole("button", { name: "Abrir arquivo guardado" })).toBeNull();
    expect(within(web).getByRole("link", { name: "Abrir no site oficial" })).toBeTruthy();
    expect(within(web).getByText("página web")).toBeTruthy();
    expect(within(web).getByText(/Página web · 2,5 MB/)).toBeTruthy();
  });

  it("abrir arquivo no banco local recebe os bytes e abre um endereço local", async () => {
    (URL as any).createObjectURL = vi.fn(() => "blob:local");
    fetchHandlers["GET /api/content-hub/source-candidates/c1/file"] = () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "content-type": "application/pdf" } });
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.click(within(c).getByRole("button", { name: "Abrir arquivo guardado" }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("blob:local", "_blank", "noopener"));
  });

  it("Ler de novo aparece quando a leitura não entrou na fila", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ source_id: "s", document_id: "d", read_error: "A leitura não entrou na fila: use Ler de novo." }, 201);
    fetchHandlers["POST /api/content-hub/source-candidates/c1/read"] = () => json({ job: { id: "j2" } });
    render(<Sources isAdmin go={() => {}} />);
    const c = await card();
    fireEvent.click(within(c).getByLabelText("Conferi o documento no arquivo guardado"));
    fireEvent.click(approveBtn(c));
    expect(await screen.findByText("A leitura não entrou na fila: use Ler de novo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ler de novo" }));
    await waitFor(() => expect(fetchCalls.some((x) => x.url === "/api/content-hub/source-candidates/c1/read" && x.method === "POST")).toBe(true));
    expect(await screen.findByText(/A leitura entrou na fila/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ler de novo" })).toBeNull();
  });

  it("filtro e contador", async () => {
    withCands([CAND], { aguardando: 3, aprovado: 1, rejeitado: 2 });
    render(<Sources isAdmin go={() => {}} />);
    expect(await screen.findByText("Fontes encontradas — aguardando sua conferência (3)")).toBeTruthy();
    expect(rpcCalls("app_ch_source_candidates")[0][1]).toEqual({ p_status: "aguardando" });
    candidates = { items: [{ ...CAND, id: "c7", status: "rejeitado", decision_reason: "Documento de outro assunto.", decided_at: "2026-10-10T16:00:00Z" }], counts: { aguardando: 3, aprovado: 1, rejeitado: 2 } };
    fireEvent.change(screen.getByLabelText("Mostrar"), { target: { value: "rejeitado" } });
    await waitFor(() => expect(rpcCalls("app_ch_source_candidates").some((c: any[]) => c[1].p_status === "rejeitado")).toBe(true));
    const c = await card("c7");
    expect(within(c).getByText("Rejeitado")).toBeTruthy();
    expect(within(c).getByText("Documento de outro assunto.")).toBeTruthy();
    expect(within(c).queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("sem candidatos: mensagem simples", async () => {
    withCands([]);
    render(<Sources isAdmin go={() => {}} />);
    expect(await screen.findByText("Nenhuma fonte aguardando a sua conferência.")).toBeTruthy();
  });

  it("Fontes cadastradas: selo encontrada pela busca e situação da leitura", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_sources") return [{ id: "x1", title: "Fonte achada", organ: "Órgão", kind: "final", status: "current", authority_level: "A", passages: 0, freshness: "UNKNOWN", changes: 0, diffs: 0, found_by_search: true, document_status: "extracting" }, { id: "x2", title: "Fonte à mão", organ: "Órgão", kind: "final", status: "current", authority_level: "A", passages: 0, freshness: "UNKNOWN", changes: 0, diffs: 0, found_by_search: false, document_status: null }];
      if (fn === "app_ch_source_candidates") return candidates;
      return [];
    });
    render(<Sources isAdmin go={() => {}} />);
    expect(await screen.findByText("Fonte achada")).toBeTruthy();
    expect(screen.getAllByText("encontrada pela busca")).toHaveLength(1);
    expect(screen.getByText("Extraindo")).toBeTruthy();
  });

  it("monitoramento da fonte: a situação da última conferência aparece em português", async () => {
    const watch = (last_status: string) => ({ url: "https://www.gov.br/saude/x", interval_days: 7, last_checked_at: null, next_check_at: null, last_status });
    const src = (id: string, last_status: string) => ({ id, title: `Fonte ${last_status}`, organ: "Órgão", kind: "final", status: "current", authority_level: "A", passages: 0, freshness: "UNKNOWN", changes: 0, diffs: 0, watch: watch(last_status) });
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_ch_sources" ? [src("w1", "changed"), src("w2", "unreachable"), src("w3", "ok")] : fn === "app_ch_source_candidates" ? candidates : []));
    render(<Sources isAdmin go={() => {}} />);
    for (const name of ["Fonte changed", "Fonte unreachable", "Fonte ok"]) fireEvent.click(await screen.findByText(name));
    const text = document.body.textContent ?? "";
    expect(text).toContain("(mudou)");
    expect(text).toContain("(não abriu)");
    expect(text).toContain("(igual)");
    expect(text).not.toMatch(/\((changed|unreachable|ok)\)/);
  });

  it("ordem para administrador com os candidatos entre as buscas recentes e os sites oficiais", async () => {
    render(<Sources isAdmin go={() => {}} />);
    await screen.findByTestId("official-domains");
    const titles = Array.from(document.querySelectorAll("h3")).map((h) => h.textContent);
    const order = ["Buscar fontes com IA", "Buscas recentes", "Fontes encontradas", "Sites oficiais", "Cadastrar fonte", "Fontes cadastradas"].map((t) => titles.findIndex((x) => x?.startsWith(t)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

