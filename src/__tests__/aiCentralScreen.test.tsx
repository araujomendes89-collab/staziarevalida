/**
 * Tela Administração > Central de IAs (jsdom, servidor simulado): ligar IA com confirmação, atualizar lista,
 * problemas de uma função, tetos, aviso de não independente, voltar às variáveis e a aba só para administrador.
 * Textos de teste, sem conteúdo clínico.
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
import { HubSettings } from "../novo/app/admin/content/HubSettings.jsx";
import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";

const provider = (id: string, extra: any = {}) => ({ id, enabled: false, enabled_by: null, enabled_by_email: null, enabled_at: null, models: [], models_refreshed_at: null, last_status: null, last_status_detail: null, ...extra });
const OVERVIEW: any = {
  providers: [
    provider("anthropic", { models: [{ id: "claude-a", label: "Claude A" }], last_status: "pronta" }),
    provider("openai", { models: [{ id: "gpt-x", label: "GPT X" }] }),
    provider("gemini"),
    provider("ollama", { last_status: "so_no_mac" }),
  ],
  functions: [],
  settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false },
  prices: [{ provider: "anthropic", model: "claude-a", input_per_mtok: 3, output_per_mtok: 15, source_url: "https://exemplo.test/p", checked_on: "2026-10-01" }],
  spend_by_provider: [],
  spend_by_function: [],
  month_spend: 0,
  tutor_month_spend: 0.5,
  recent_calls: [],
  history: [],
  checks: Object.fromEntries(["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar"].map((k) => [k, { source: "variaveis", ready: false, ref: null, problems: ["Nenhuma IA definida: configure a função."], warnings: [] }])),
};

let calls: { url: string; method: string; body: any }[] = [];
let overview: any;
let handlers: Record<string, (body: any) => Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
    if (method === "GET" && url === "/api/ai/overview") return json(overview);
    return json({ ok: true, warnings: [] });
  });
  window.confirm = vi.fn(() => true);
});
afterEach(cleanup);

const savedFn = (extra: any = {}) => ({ key: "criacao", mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-a" }, fallback_ref: null, reviewers: [], care: "caprichado", ...extra });
const savedCheck = { source: "banco", ready: true, ref: { provider: "anthropic", model: "claude-a" }, problems: [], warnings: [] };

describe("Central de IAs (painel do administrador)", () => {
  it("mostra as 4 IAs desligadas e liga uma com confirmação", async () => {
    render(<AdminAI />);
    expect(await screen.findByTestId("provider-anthropic")).toBeTruthy();
    for (const id of ["openai", "gemini", "ollama"]) expect(screen.getByTestId(`provider-${id}`)).toBeTruthy();
    expect(screen.getByText("roda só no Mac")).toBeTruthy();
    const sw = within(screen.getByTestId("provider-anthropic")).getByRole("switch") as HTMLInputElement;
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    expect((window.confirm as any).mock.calls[0][0]).toBe("Ligar Claude? A partir de agora o servidor pode enviar trechos do material da equipe para Claude. Fica registrado quem ligou e quando.");
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/ai/providers/anthropic/enabled")).toBe(true));
    expect(calls.find((c) => c.url === "/api/ai/providers/anthropic/enabled")!.body).toEqual({ enabled: true });
  });

  it("não liga se a confirmação for recusada", async () => {
    (window.confirm as any).mockReturnValue(false);
    render(<AdminAI />);
    const card = await screen.findByTestId("provider-anthropic");
    fireEvent.click(within(card).getByRole("switch"));
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("atualizar lista mostra os modelos e a situação", async () => {
    handlers["POST /api/ai/providers/gemini/refresh"] = () => json({ status: "pronta", detail: "2 modelos", models: [{ id: "g1", label: "G1" }], prices_added: 2 });
    render(<AdminAI />);
    const card = await screen.findByTestId("provider-gemini");
    fireEvent.click(within(card).getByRole("button", { name: "Atualizar lista" }));
    expect(await within(card).findByText(/2 preços preenchidos pela tabela oficial/)).toBeTruthy();
    expect(within(card).getByText("pronta")).toBeTruthy();
    expect(within(card).getByText(/1 modelo/)).toBeTruthy();
  });

  it("linha de produção com mesma família mostra o problema e não salva", async () => {
    handlers["PUT /api/ai/functions/criacao"] = () => json({ error: "A função tem problemas: Conferente da mesma família.", problems: ["Conferente da mesma família que a criadora."], warnings: [] }, 400);
    overview.functions = [savedFn()];
    overview.checks.criacao = savedCheck;
    render(<AdminAI />);
    const box = await screen.findByTestId("function-criacao");
    fireEvent.change(within(box).getByLabelText("Modo — Criação"), { target: { value: "linha" } });
    fireEvent.change(within(box).getByLabelText("Conferente 1: IA — Criação"), { target: { value: "anthropic" } });
    fireEvent.change(within(box).getByLabelText("Conferente 1: modelo — Criação"), { target: { value: "claude-a" } });
    fireEvent.click(within(box).getByRole("button", { name: "Salvar" }));
    expect(await within(box).findByText("Conferente da mesma família que a criadora.")).toBeTruthy();
    const put = calls.find((c) => c.method === "PUT" && c.url === "/api/ai/functions/criacao")!;
    expect(put.body.config.mode).toBe("linha");
    expect(put.body.config.reviewers).toEqual([{ provider: "anthropic", model: "claude-a" }]);
    // nada mudou na tela salva: não recarregou o painel depois do erro
    expect(calls.filter((c) => c.url === "/api/ai/overview").length).toBe(1);
  });

  it("conferente incompleto trava o Salvar com mensagem", async () => {
    overview.functions = [savedFn()];
    overview.checks.criacao = savedCheck;
    render(<AdminAI />);
    const box = await screen.findByTestId("function-criacao");
    fireEvent.change(within(box).getByLabelText("Modo — Criação"), { target: { value: "linha" } });
    const save = within(box).getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(within(box).getByText("Linha de produção precisa de pelo menos 1 conferente.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(within(box).getByLabelText("Conferente 1: IA — Criação"), { target: { value: "openai" } });
    expect(within(box).getByText("Complete ou remova o conferente/membro incompleto.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(within(box).getByLabelText("Conferente 1: modelo — Criação"), { target: { value: "gpt-x" } });
    expect(save.disabled).toBe(false);
  });

  it("mostra quem ligou e quem mudou, pelo e-mail", async () => {
    overview.providers[0] = provider("anthropic", { enabled: true, enabled_by_email: "ad@t.dev", enabled_at: "2026-10-07T12:00:00Z" });
    overview.history = [{ id: 1, actor_id: "x", actor_email: "ad@t.dev", action: "ai.provider", target: "anthropic", created_at: "2026-10-07T12:00:00Z" }];
    render(<AdminAI />);
    expect(await screen.findByText(/Ligada por ad@t\.dev em/)).toBeTruthy();
    expect(screen.getByText("ad@t.dev")).toBeTruthy();
  });

  it("salvar função com aviso de não independente mostra o aviso", async () => {
    handlers["PUT /api/ai/functions/verificacao"] = () => json({ ok: true, warnings: ["Membros do comitê: não é independente (mesma família)."] });
    overview.functions = [savedFn({ key: "verificacao", mode: "comite", reviewers: [{ provider: "anthropic", model: "claude-a" }] })];
    overview.checks.verificacao = savedCheck;
    render(<AdminAI />);
    const box = await screen.findByTestId("function-verificacao");
    fireEvent.click(within(box).getByRole("button", { name: "Salvar" }));
    expect(await within(box).findByText(/não é independente/)).toBeTruthy();
  });

  it("voltar às variáveis pede confirmação e manda config null", async () => {
    overview.functions = [savedFn()];
    overview.checks.criacao = savedCheck;
    render(<AdminAI />);
    const box = await screen.findByTestId("function-criacao");
    fireEvent.click(within(box).getByRole("button", { name: "Voltar às variáveis do servidor" }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url === "/api/ai/functions/criacao")).toBe(true));
    expect(calls.find((c) => c.url === "/api/ai/functions/criacao")!.body).toEqual({ config: null });
  });

  it("função sem configuração salva diz que usa as variáveis do servidor", async () => {
    overview.checks.criacao = { source: "variaveis", ready: true, ref: { provider: "gemini", model: "g1" }, problems: [], warnings: [] };
    render(<AdminAI />);
    expect(await screen.findByText("Sem configuração salva: usa as variáveis do servidor (Gemini g1)")).toBeTruthy();
  });

  it("tetos: ligar exige os dois valores", async () => {
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    expect(screen.getByText("Duas execuções ao mesmo tempo podem passar do teto em até o custo de uma execução.")).toBeTruthy();
    expect(screen.getByText("Tutor (fora do teto, só informação)")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Tetos ligados/ }));
    expect(screen.getByText("Preencha os dois tetos para ligar")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Salvar tetos" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Teto mensal (US$)"), { target: { value: "50" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Teto por execução (US$)"), { target: { value: "2" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url === "/api/ai/settings")).toBe(true));
    expect(calls.find((c) => c.url === "/api/ai/settings")!.body).toEqual({ monthly_cap_usd: 50, per_run_cap_usd: 2, caps_enabled: true });
  });

  it("seletor nas abas grava tab_override_enabled", async () => {
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    fireEvent.click(screen.getByRole("switch", { name: /Permitir trocar a IA nas abas/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url === "/api/ai/settings")).toBe(true));
    expect(calls.find((c) => c.url === "/api/ai/settings")!.body).toEqual({ tab_override_enabled: true });
  });

  it("aba Central de IAs só aparece para administrador", async () => {
    role = "admin";
    const a = render(
      <MemoryRouter>
        <AdminScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("tab", { name: /Central de IAs/ })).toBeTruthy();
    a.unmount();
    role = "editor";
    render(
      <MemoryRouter>
        <AdminScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("tab", { name: /Central de Conteúdo/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Central de IAs/ })).toBeNull();
  });

  it("Central de Conteúdo mostra o resumo das IAs e o botão só para administrador", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_ch_flags" ? {} : fn === "app_ch_ai_usage" ? { by_step: [], jobs: {} } : []));
    handlers["GET /api/ai/summary"] = () => json({ functions: [{ key: "criacao", configured: true }, { key: "verificacao", configured: false }], providers_enabled: ["anthropic"], month_spend: 1.5 });
    const a = render(
      <MemoryRouter>
        <HubSettings isAdmin={true} status={{}} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Funções configuradas: 1 de 6 · IAs ligadas: Claude · Gasto do mês: US$ 1,50")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir a Central de IAs" })).toBeTruthy();
    a.unmount();
    render(
      <MemoryRouter>
        <HubSettings isAdmin={false} status={{}} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Funções configuradas: 1 de 6/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abrir a Central de IAs" })).toBeNull();
  });
});
