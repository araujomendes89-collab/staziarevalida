// @vitest-environment jsdom
/**
 * Tela da Central de IAs · função "Avaliação do treino sozinho" (treino_avaliacao, grupo dupla-sozinho-ia).
 * Servidor simulado (fetch). A função aparece com os mesmos controles das outras, nasce desligada, usa UMA IA por padrão (sugestão: o
 * Gemini mais forte do Vertex) e tem a segunda IA como opção (comitê, de qualquer empresa); só o administrador abre a Central; editor e
 * aluno não a veem. Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
let role = "admin";
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role, profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => <div>visao geral</div>, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null, AdminTutor: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));

import { AdminAI } from "../novo/app/admin/ai/AdminAI.jsx";
import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";

const provider = (id: string, extra: any = {}) => ({ id, enabled: true, enabled_by: null, enabled_by_email: null, enabled_at: null, models: [], models_refreshed_at: null, last_status: null, last_status_detail: null, ...extra });
const KEYS = ["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes", "similaridade", "analise_mudancas", "treino_avaliacao"];
const SEM_CONFIG = (k: string) => ({ source: "variaveis", ready: false, ref: null, problems: ["Desligada: configure esta função na Central de IAs."], warnings: [] });
const OVERVIEW: any = {
  providers: [
    provider("anthropic", { models: [{ id: "claude-a", label: "Claude A" }, { id: "claude-b", label: "Claude B" }] }),
    provider("openai", { models: [{ id: "gpt-x", label: "GPT X" }] }),
    provider("gemini"),
    provider("ollama", { enabled: false, last_status: "so_no_mac" }),
  ],
  functions: [],
  settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false },
  prices: [],
  spend_by_provider: [],
  spend_by_function: [],
  month_spend: 0,
  tutor_month_spend: 0,
  recent_calls: [],
  history: [],
  checks: Object.fromEntries(KEYS.map((k) => [k, SEM_CONFIG(k)])),
};

let calls: { url: string; method: string; body: any }[] = [];
let overview: any;
let handlers: Record<string, (body: any) => Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const PUT = "PUT /api/ai-central/functions/treino_avaliacao";

beforeEach(() => {
  calls = [];
  role = "admin";
  overview = structuredClone(OVERVIEW);
  handlers = {};
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const h = handlers[`${method} ${url}`];
    if (h) return h(body);
    if (method === "GET" && url === "/api/ai-central/overview") return json(overview);
    return json({ ok: true, warnings: [] });
  });
  window.confirm = vi.fn(() => true);
});
afterEach(cleanup);

const savedTreino = (extra: any = {}) => ({ key: "treino_avaliacao", mode: "sozinha", primary_ref: { provider: "gemini", model: "gemini-3.1-pro-preview" }, fallback_ref: null, reviewers: [], care: "caprichado", ...extra });
const readyCheck = { source: "banco", ready: true, ref: { provider: "gemini", model: "gemini-3.1-pro-preview" }, problems: [], warnings: [] };
const pick = (box: HTMLElement, name: string, value: string) => fireEvent.change(within(box).getByLabelText(name), { target: { value } });
const MODO = "Modo — Avaliação do treino sozinho";

describe("Central de IAs · Avaliação do treino sozinho (tela)", () => {
  it("lista a função com os mesmos controles das outras, nasce desligada, com uma IA por padrão e a sugestão do Gemini mais forte", async () => {
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect(within(box).getByText("Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByText("não está pronta")).toBeTruthy();
    expect(within(box).getByText("Desligada: configure esta função na Central de IAs.")).toBeTruthy();
    expect(within(box).getByText("Nasce desligada: sem configuração salva, a avaliação por IA do treino sozinho não roda.")).toBeTruthy();
    expect(within(box).getByText("Uma IA avalia o treino. Sugestão: Gemini pelo Vertex, o modelo mais forte da lista (gemini-3.1-pro-preview).")).toBeTruthy();
    // modelos, cuidado e salvar como nas outras; uma IA por padrão, sem linha de produção
    expect(within(box).getByLabelText("Principal: IA — Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByLabelText("Reserva: IA — Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByLabelText("Cuidado — Avaliação do treino sozinho")).toBeTruthy();
    const modo = within(box).getByLabelText(MODO) as HTMLSelectElement;
    expect(modo.value).toBe("sozinha");
    expect(Array.from(modo.options).map((o) => o.text)).toEqual(["Uma IA (padrão)", "Comitê de duas IAs (opcional)"]);
    // a segunda IA só aparece quando a equipe liga o comitê
    expect(within(box).queryByLabelText("Segunda IA: IA — Avaliação do treino sozinho")).toBeNull();
    expect(within(box).getByText(/A segunda IA é opcional e fica desligada por padrão/)).toBeTruthy();
    expect(within(box).queryByText(/empresas diferentes/)).toBeNull();
    expect(within(box).queryByText(/não são chamados/)).toBeNull();
    expect(within(box).queryByRole("button", { name: "Desligar a função" })).toBeNull();
    for (const k of KEYS) expect(screen.getByTestId(`function-${k}`)).toBeTruthy();
  });

  it("'Usar a sugestão' põe o Gemini mais forte como principal e salva em modo de uma IA", async () => {
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    fireEvent.click(within(box).getByRole("button", { name: "Usar a sugestão" }));
    expect((within(box).getByLabelText("Principal: IA — Avaliação do treino sozinho") as HTMLSelectElement).value).toBe("gemini");
    fireEvent.click(within(box).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))).toBe(true));
    const put = calls.find((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))!;
    expect(put.body.config).toEqual({ mode: "sozinha", care: "caprichado", primary: { provider: "gemini", model: "gemini-3.1-pro-preview" }, fallback: null, reviewers: [] });
  });

  it("o Gemini mais forte da lista da Central é o sugerido", async () => {
    overview.providers = overview.providers.map((p: any) => (p.id === "gemini" ? { ...p, models: [{ id: "gemini-2.5-pro", label: "2.5 Pro" }, { id: "gemini-3.1-pro-preview", label: "3.1 Pro" }, { id: "gemini-2.5-flash", label: "2.5 Flash" }] } : p));
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect(within(box).getByText(/o modelo mais forte da lista \(gemini-3\.1-pro-preview\)/)).toBeTruthy();
  });

  it("a segunda IA é opcional: ligar o comitê pede exatamente mais uma IA, de qualquer empresa (inclusive da mesma)", async () => {
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    pick(box, "Principal: IA — Avaliação do treino sozinho", "anthropic");
    pick(box, "Principal: modelo — Avaliação do treino sozinho", "claude-a");
    pick(box, MODO, "comite");
    const save = within(box).getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(within(box).getByText("O comitê da avaliação do treino sozinho tem exatamente duas IAs: a principal e mais uma.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    // a mesma empresa vale (a conferência por outra empresa NÃO é exigida)
    pick(box, "Segunda IA: IA — Avaliação do treino sozinho", "anthropic");
    pick(box, "Segunda IA: modelo — Avaliação do treino sozinho", "claude-b");
    expect(save.disabled).toBe(false);
    expect(within(box).queryByRole("button", { name: "Adicionar a segunda IA" })).toBeNull(); // só uma
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))).toBe(true));
    const put = calls.find((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))!;
    expect(put.body.config).toEqual({
      mode: "comite",
      care: "caprichado",
      primary: { provider: "anthropic", model: "claude-a" },
      fallback: null,
      reviewers: [{ provider: "anthropic", model: "claude-b" }],
    });
  });

  it("recusa do servidor aparece em português e nada some da tela", async () => {
    handlers[PUT] = () => json({ error: "A função tem problemas: x", problems: ["A avaliação do treino sozinho usa uma IA ou, opcionalmente, o comitê de duas IAs."], warnings: [] }, 400);
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    pick(box, "Principal: IA — Avaliação do treino sozinho", "anthropic");
    pick(box, "Principal: modelo — Avaliação do treino sozinho", "claude-a");
    fireEvent.click(within(box).getByRole("button", { name: "Salvar" }));
    expect(await within(box).findByText("A avaliação do treino sozinho usa uma IA ou, opcionalmente, o comitê de duas IAs.")).toBeTruthy();
    expect(screen.getByTestId("function-treino_avaliacao")).toBeTruthy();
  });

  it("função salva e pronta: mostra 'pronta', a IA salva e 'Desligar a função' apaga a configuração", async () => {
    overview.functions = [savedTreino()];
    overview.checks.treino_avaliacao = readyCheck;
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect(within(box).getByText("pronta")).toBeTruthy();
    expect(within(box).queryByText("Nasce desligada: sem configuração salva, a avaliação por IA do treino sozinho não roda.")).toBeNull();
    expect((within(box).getByLabelText("Principal: IA — Avaliação do treino sozinho") as HTMLSelectElement).value).toBe("gemini");
    expect((within(box).getByLabelText(MODO) as HTMLSelectElement).value).toBe("sozinha");
    expect(within(box).queryByText("Voltar às variáveis do servidor")).toBeNull();
    fireEvent.click(within(box).getByRole("button", { name: "Desligar a função" }));
    expect((window.confirm as any).mock.calls[0][0]).toBe('Desligar "Avaliação do treino sozinho"? A configuração salva será apagada e a função para de rodar.');
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))).toBe(true));
    expect(calls.find((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))!.body).toEqual({ config: null });
  });

  it("função salva em comitê mostra as duas IAs; com problema do servidor aparece 'não está pronta' com a mensagem", async () => {
    overview.functions = [savedTreino({ mode: "comite", reviewers: [{ provider: "openai", model: "gpt-x" }] })];
    overview.checks.treino_avaliacao = { ...readyCheck, ready: false, problems: ["OpenAI está desligada na Central de IAs."] };
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect((within(box).getByLabelText(MODO) as HTMLSelectElement).value).toBe("comite");
    expect((within(box).getByLabelText("Segunda IA: modelo — Avaliação do treino sozinho") as HTMLSelectElement).value).toBe("gpt-x");
    expect(within(box).getByText("não está pronta")).toBeTruthy();
    expect(within(box).getAllByText("OpenAI está desligada na Central de IAs.").length).toBeGreaterThan(0);
  });

  it("o gasto da função aparece com o nome em português na Central e o Registro conhece o nome", async () => {
    overview.spend_by_function = [{ function_key: "treino_avaliacao", cost_usd: 0.42 }];
    overview.recent_calls = [{ id: 1, function_key: "treino_avaliacao", mode: "sozinha", role: "principal", provider: "gemini", model: "gemini-3.1-pro-preview", cost_usd: 0.2, outcome: "ok", created_at: "2026-10-17T12:00:00Z" }];
    render(<AdminAI />);
    await screen.findByTestId("function-treino_avaliacao");
    expect(await screen.findByText(/Avaliação do treino sozinho: US\$ 0,42/)).toBeTruthy();
    const { AI_FUNCTION_NAME } = await import("../novo/app/admin/auditLog.js");
    expect(AI_FUNCTION_NAME.treino_avaliacao).toBe("Avaliação do treino sozinho");
  });
});

describe("Quem abre a Central de IAs", () => {
  const abrir = (aba: string) => (
    <MemoryRouter initialEntries={[`/admin?aba=${aba}`]}>
      <AdminScreen />
    </MemoryRouter>
  );

  it("administrador vê a aba e a função", async () => {
    render(abrir("ias"));
    expect(await screen.findByRole("tab", { name: /Central de IAs/ })).toBeTruthy();
    expect(await screen.findByTestId("function-treino_avaliacao")).toBeTruthy();
  });

  it("editor e aluno não veem a aba e, mesmo pelo endereço, não abrem a Central nem chamam o servidor", async () => {
    for (const r of ["editor", "student"]) {
      role = r;
      calls = [];
      const view = render(abrir("ias"));
      // o aluno nem chega aqui no app (a rota exige a equipe); se chegasse, a tela não mostra a Central
      await waitFor(() => expect(screen.queryByTestId("function-treino_avaliacao")).toBeNull());
      expect(screen.queryByRole("tab", { name: /Central de IAs/ })).toBeNull();
      expect(calls.filter((c) => c.url.includes("/api/ai-central"))).toEqual([]);
      view.unmount();
    }
  });
});
