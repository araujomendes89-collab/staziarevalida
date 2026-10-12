/**
 * Fase 1 do gerenciamento, grupo C, telas (jsdom, banco e servidor simulados): CC18 (Reanalisar agora), CC19 (aviso do modo sombra),
 * CC23 (Conferir fontes monitoradas), CC27 (Apelidos em português), CC29 (só chaves que fazem algo) e CC30 (Configuração sem inglês
 * nem termo técnico). Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
let role = "admin";
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role, profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));

import { HubSettings } from "../novo/app/admin/content/HubSettings.jsx";
import { Taxonomy } from "../novo/app/admin/content/Taxonomy.jsx";
import { Sources, checkMessage } from "../novo/app/admin/content/Sources.jsx";
import { UpdatedQuestions, friendlyPending } from "../novo/app/admin/content/UpdatedQuestions.jsx";
import { ReleaseNotice } from "../novo/app/admin/content/ReleaseNotice.jsx";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const FLAGS = { enabled: true, ai_enabled: true, publish_enabled: false, notebook_provider_enabled: false, auto_analysis_enabled: false, shadow_mode: true };
let flags: any;
let reanalysis: any;
let fetchCalls: { url: string; method: string }[];
let fetchHandlers: Record<string, () => Response>;

const nodes = [
  { id: "a1", parent_id: null, level: "area", code: "PED", name: "Pediatria", status: "active" },
  { id: "t1", parent_id: "a1", level: "theme", code: null, name: "Bronquiolite", status: "active" },
];

beforeEach(() => {
  role = "admin";
  flags = { ...FLAGS };
  reanalysis = { waiting: 3, auto: false, requested_at: null, last_started_at: null, last_finished_at: null, last_manual: false, last_summary: {} };
  fetchCalls = [];
  fetchHandlers = {};
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_ch_flags") return flags;
    if (fn === "app_ch_prompt_versions") return [{ prompt_id: "qanalysis", version: "1.0.0", content_hash: "0123456789abcdef" }, { prompt_id: "outro_novo", version: "2", content_hash: "fedcba9876543210" }];
    if (fn === "app_ch_ai_usage") return { by_step: [{ step: "claims", model: "claude-x", calls: 2, ok: 2, rejected_by_check: 0, invalid_output: 0, failed: 0, input_tokens: 10, output_tokens: 20, cost_known: 2, cost_usd: 0.01, avg_latency_ms: 1200 }], jobs: { queued: 2, succeeded: 5 } };
    if (fn === "app_ch_reviewers") return [];
    if (fn === "app_ch_taxonomy") return { version: 1, status: "published", note: null, versions: [{ version: 1, status: "published" }], nodes };
    if (fn === "app_ch_taxonomy_aliases") return [{ id: "al1", alias: "BVA", node_id: "t1", path: "Pediatria > Bronquiolite", orphan: false }, { id: "al2", alias: "Antigo", node_id: null, path: null, orphan: true }];
    if (fn === "app_ch_taxonomy_find") return [{ node_id: "t1", path: "Pediatria > Bronquiolite", level: "theme", via: "alias", alias: "BVA", score: 1 }];
    if (fn === "app_ch_taxonomy_add_alias") return { id: "al9" };
    if (fn === "app_ch_sources") return [];
    if (fn === "app_ch_source_audiences") return {};
    if (fn === "app_ch_source_searches") return [];
    if (fn === "app_ch_official_domains") return [];
    if (fn === "app_ch_source_candidates") return { items: [], counts: { aguardando: 0, aprovado: 0, rejeitado: 0 } };
    if (fn === "app_incidence") return { rows: [] };
    if (fn === "app_updated_questions") return { items: [], total: 0 };
    if (fn === "app_ch_reanalysis_status") {
      if (reanalysis === "sem-banco") throw new Error("function public.app_ch_reanalysis_status does not exist");
      return reanalysis;
    }
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    fetchCalls.push({ url, method });
    const h = fetchHandlers[`${method} ${url}`];
    if (h) return h();
    if (url === "/api/ai-central/summary") return json({ functions: [{ configured: true }, { configured: false }], providers_enabled: ["anthropic"], month_spend: 0 });
    if (url === "/api/content-hub/source-search/status") return json({ ready: true, problems: [], warnings: [], max_searches: 5 });
    return json({ ok: true });
  });
});
afterEach(cleanup);

const WORDS_BANNED = /Content Lab|Prompts? em uso|hash|NotebookLM|Reservado|Sinalizador|pgvector|Chromium|\bOCR\b/;

describe("CC30 e CC29: Configuração e custos em português simples, só com chaves que fazem algo", () => {
  it("nenhum texto da tela usa 'Content Lab', 'prompt', 'hash' nem fala em chave reservada; os nomes das instruções da IA vêm em português", async () => {
    const { container } = render(<HubSettings isAdmin status={{ storage: "supabase", renderer: true, worker: true, brand: { version: "1" }, embeddings: { ready: true, model: "m", passages: 10, embedded: 4, vector_index: false } }} />);
    await screen.findByText("Chaves liga e desliga da Central de Conteúdo");
    await screen.findByText("Instruções da IA em uso");
    await screen.findByText("Análise de questões (versão 1.0.0)");
    expect(screen.getByText("outro_novo (versão 2)")).toBeTruthy(); // instrução ainda sem nome em português aparece como veio
    expect(screen.getAllByText(/código de conferência/).length).toBe(2);
    await screen.findByText("Certas");
    expect(screen.getByText("Texto lido / escrito")).toBeTruthy();
    expect(screen.getByText("Na fila: 2")).toBeTruthy();
    expect(screen.getByText("Configurações do servidor (para quem cuida da parte técnica)")).toBeTruthy();
    expect(screen.getByText(/10 trechos|4 de 10 trechos preparados para a busca/)).toBeTruthy();
    expect(container.textContent).not.toMatch(WORDS_BANNED);
  });

  it("a chave 'Provedor NotebookLM' saiu da tela; 'Análise automática' explica o que faz de verdade", async () => {
    render(<HubSettings isAdmin status={null} />);
    await screen.findByText("Análise automática");
    expect(screen.queryByText(/NotebookLM/)).toBeNull();
    expect(screen.getByText("Central de Conteúdo ligada")).toBeTruthy();
    expect(screen.getByText(/a IA reanalisa sozinha as questões cuja fonte oficial mudou/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^(Ligar|Desligar)$/ })).toHaveLength(5);
  });

  it("ligar a Análise automática pede o motivo e chama a chave certa", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_ch_flags") return flags;
      if (fn === "app_ch_set_flag") return true;
      if (["app_ch_prompt_versions", "app_ch_reviewers"].includes(fn)) return [];
      if (fn === "app_ch_ai_usage") return { by_step: [], jobs: {} };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<HubSettings isAdmin status={null} />);
    const row = (await screen.findByText("Análise automática")).closest("div")!.parentElement!;
    const button = within(row).getByRole("button", { name: "Ligar" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Ligar para o piloto de reanálise." } });
    await waitFor(() => expect((within(row).getByRole("button", { name: "Ligar" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(row).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_set_flag", { p_key: "auto_analysis_enabled", p_value: true, p_reason: "Ligar para o piloto de reanálise." }));
  });
});

describe("CC27: Apelidos em português na Taxonomia", () => {
  it("a tela fala em apelido (nunca alias) e mostra o apelido sem tema como 'tema não existe mais'", async () => {
    const { container } = render(<Taxonomy isAdmin />);
    await screen.findByText("Apelidos e busca de temas parecidos");
    await screen.findByText("Apelidos cadastrados");
    expect(screen.getByText("tema não existe mais")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Procurar tema"), { target: { value: "BVA" } });
    fireEvent.click(screen.getByRole("button", { name: "Procurar" }));
    await screen.findByText("apelido “BVA”");
    expect(screen.getByPlaceholderText("novo apelido (ex.: HAS)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adicionar apelido" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/[Aa]lias|órfão/);
  });
});

describe("CC23: Conferir fontes monitoradas", () => {
  it("no site publicado o servidor responde que deixou o pedido; a tela explica em português, sem erro", async () => {
    fetchHandlers["POST /api/content-hub/sources/check"] = () => json({ requested: 2 });
    render(<Sources isAdmin go={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Conferir fontes monitoradas" }));
    expect(await screen.findByText(/Pedido enviado: 2 fonte\(s\) monitorada\(s\) serão conferidas na próxima rodada do processamento \(até 10 minutos\)/)).toBeTruthy();
    expect(fetchCalls.some((c) => c.url === "/api/content-hub/sources/check" && c.method === "POST")).toBe(true);
  });

  it("o texto de cada resposta: pedido, nenhuma fonte monitorada e conferência na hora", () => {
    expect(checkMessage({ requested: 0 })).toBe("Nenhuma fonte está sendo monitorada: não há o que conferir.");
    expect(checkMessage({ requested: 1 })).toMatch(/Pedido enviado: 1 fonte/);
    expect(checkMessage({ checked: 3, changed: 1, unreachable: 1 })).toBe("Conferência concluída: 3 fonte(s) conferida(s), 1 mudaram e 1 não abriram.");
  });

  it("se o banco ainda não recebeu a atualização, o aviso é em português simples (sem nome de função)", async () => {
    fetchHandlers["POST /api/content-hub/sources/check"] = () => json({ error: "Esta função ainda não está disponível: falta concluir uma atualização do banco de dados. Peça ao suporte técnico." }, 503);
    render(<Sources isAdmin go={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Conferir fontes monitoradas" }));
    expect(await screen.findByText(/falta concluir uma atualização do banco de dados/)).toBeTruthy();
  });
});

describe("CC18: Reanalisar agora (Questões atualizadas)", () => {
  it("mostra quantas esperam; o administrador pede e a tela explica que o processamento atende na próxima rodada", async () => {
    fetchHandlers["POST /api/content-hub/questions/reanalysis"] = () => json({ waiting: 3, already: false, now: false });
    render(<UpdatedQuestions />);
    expect(await screen.findByText("3 questão(ões) esperando reanálise")).toBeTruthy();
    expect(screen.getByText("Análise automática desligada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reanalisar agora" }));
    expect(await screen.findByText(/Pedido enviado: o processamento reanalisa na próxima rodada \(até 10 minutos\)/)).toBeTruthy();
    expect(fetchCalls.filter((c) => c.url === "/api/content-hub/questions/reanalysis")).toHaveLength(1);
  });

  it("no desenvolvimento a rodada começa na hora", async () => {
    fetchHandlers["POST /api/content-hub/questions/reanalysis"] = () => json({ waiting: 3, already: false, now: true });
    render(<UpdatedQuestions />);
    fireEvent.click(await screen.findByRole("button", { name: "Reanalisar agora" }));
    expect(await screen.findByText("A reanálise começou. Volte em alguns minutos para ver as propostas.")).toBeTruthy();
  });

  it("com pedido já enviado ou nada esperando, o botão fica desligado; editor não vê o botão", async () => {
    reanalysis = { ...reanalysis, requested_at: "2026-10-12T10:00:00Z" };
    const { unmount } = render(<UpdatedQuestions />);
    await screen.findByText(/Pedido enviado em/);
    expect((screen.getByRole("button", { name: "Reanalisar agora" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    reanalysis = { ...reanalysis, requested_at: null, waiting: 0 };
    const second = render(<UpdatedQuestions />);
    await screen.findByText("Nenhuma questão esperando reanálise");
    expect((screen.getByRole("button", { name: "Reanalisar agora" }) as HTMLButtonElement).disabled).toBe(true);
    second.unmount();
    role = "editor";
    reanalysis = { ...reanalysis, waiting: 2 };
    render(<UpdatedQuestions />);
    await screen.findByText("2 questão(ões) esperando reanálise");
    expect(screen.queryByRole("button", { name: "Reanalisar agora" })).toBeNull();
  });

  it("mostra o resultado da última rodada e o motivo de parada em português (sem nome de chave nem variável)", async () => {
    reanalysis = { ...reanalysis, auto: true, last_manual: false, last_started_at: "2026-10-12T10:00:00Z", last_finished_at: "2026-10-12T10:05:00Z", last_summary: { considered: 3, saved: 1, skipped: 2, pending: "Content Lab desligado no servidor (CONTENT_LAB_ENABLED=false)." } };
    const { container } = render(<UpdatedQuestions />);
    await screen.findByText("Análise automática ligada");
    expect(await screen.findByText(/Última rodada \(automática\)/)).toBeTruthy();
    expect(container.textContent).toMatch(/1 proposta\(s\) gravada\(s\) · 2 pulada\(s\)/);
    expect(container.textContent).toMatch(/Parou porque: Central de Conteúdo desligado no servidor\./);
    expect(container.textContent).not.toMatch(/Content Lab|CONTENT_LAB/);
    expect(friendlyPending("IA desligada pelo administrador (sinalizador ai_enabled).")).toBe("IA desligada pelo administrador.");
  });

  it("banco ainda sem a atualização (SQL colado depois do site): a caixa some, sem erro na tela, e a lista continua", async () => {
    reanalysis = "sem-banco";
    render(<UpdatedQuestions />);
    await screen.findByText("Questões atualizadas");
    expect(screen.queryByText("Reanálise por IA")).toBeNull();
    expect(screen.queryByText(/does not exist/)).toBeNull();
  });
});

describe("CC19: aviso do modo sombra nas Análises de questões", () => {
  it("modo sombra ligado: avisa que o aluno ainda não recebe; liberado: o aviso some", async () => {
    const { container, unmount } = render(<ReleaseNotice />);
    await screen.findByText("O aluno ainda não recebe estas análises");
    expect(container.textContent).toMatch(/O modo sombra está ligado: as análises e as atualizações que o revisor médico aprova ficam guardadas/);
    unmount();
    flags = { ...FLAGS, shadow_mode: false, publish_enabled: false };
    const second = render(<ReleaseNotice />);
    await screen.findByText("O aluno ainda não recebe estas análises");
    expect(second.container.textContent).toMatch(/A publicação está desligada/);
    second.unmount();
    flags = { ...FLAGS, shadow_mode: false, publish_enabled: true };
    const third = render(<ReleaseNotice />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_flags"));
    expect(third.container.textContent).toBe("");
  });
});
