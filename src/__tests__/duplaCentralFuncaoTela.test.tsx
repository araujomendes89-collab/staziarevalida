// @vitest-environment jsdom
/**
 * Tela da Central de IAs · função "Avaliação do treino sozinho" (treino_avaliacao, grupo dupla-sozinho-ia).
 * Servidor simulado (fetch). A função aparece com os mesmos controles das outras, nasce desligada, exige o comitê com empresas
 * diferentes; só o administrador abre a Central; editor e aluno não a veem. Textos de teste, sem conteúdo clínico.
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

const savedTreino = (extra: any = {}) => ({ key: "treino_avaliacao", mode: "comite", primary_ref: { provider: "anthropic", model: "claude-a" }, fallback_ref: null, reviewers: [{ provider: "openai", model: "gpt-x" }], care: "caprichado", ...extra });
const readyCheck = { source: "banco", ready: true, ref: { provider: "anthropic", model: "claude-a" }, problems: [], warnings: [] };
const pick = (box: HTMLElement, name: string, value: string) => fireEvent.change(within(box).getByLabelText(name), { target: { value } });

describe("Central de IAs · Avaliação do treino sozinho (tela)", () => {
  it("lista a função com os mesmos controles das outras, nasce desligada e avisa que precisa de empresas diferentes", async () => {
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect(within(box).getByText("Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByText("não está pronta")).toBeTruthy();
    expect(within(box).getByText("Desligada: configure esta função na Central de IAs.")).toBeTruthy();
    expect(within(box).getByText("Esta função precisa de dois membros de empresas diferentes.")).toBeTruthy();
    expect(within(box).getByText("Nasce desligada: sem configuração salva, a avaliação por IA do treino sozinho não roda.")).toBeTruthy();
    // modelos, cuidado e salvar como nas outras; o modo é fixo no comitê
    expect(within(box).getByLabelText("Principal: IA — Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByLabelText("Reserva: IA — Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByLabelText("Membro 1: IA — Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByLabelText("Cuidado — Avaliação do treino sozinho")).toBeTruthy();
    expect(within(box).getByText("Modo: comitê (obrigatório)")).toBeTruthy();
    expect(within(box).queryByLabelText("Modo — Avaliação do treino sozinho")).toBeNull();
    expect(within(box).getByText("Todos os membros avaliam o treino; a principal também participa.")).toBeTruthy();
    expect(within(box).queryByText(/não são chamados/)).toBeNull();
    expect(within(box).queryByRole("button", { name: "Desligar a função" })).toBeNull();
    // as outras 9 funções continuam na tela
    for (const k of KEYS) expect(screen.getByTestId(`function-${k}`)).toBeTruthy();
  });

  it("duas IAs da mesma empresa travam o Salvar com a mensagem; empresas diferentes salvam em comitê", async () => {
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    pick(box, "Principal: IA — Avaliação do treino sozinho", "anthropic");
    pick(box, "Principal: modelo — Avaliação do treino sozinho", "claude-a");
    pick(box, "Membro 1: IA — Avaliação do treino sozinho", "anthropic");
    pick(box, "Membro 1: modelo — Avaliação do treino sozinho", "claude-b");
    const save = within(box).getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(within(box).getByText("O comitê da avaliação do treino sozinho precisa de membros de pelo menos duas empresas diferentes.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    pick(box, "Membro 1: IA — Avaliação do treino sozinho", "openai");
    pick(box, "Membro 1: modelo — Avaliação do treino sozinho", "gpt-x");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))).toBe(true));
    const put = calls.find((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))!;
    expect(put.body.config).toEqual({
      mode: "comite",
      care: "caprichado",
      primary: { provider: "anthropic", model: "claude-a" },
      fallback: null,
      reviewers: [{ provider: "openai", model: "gpt-x" }],
    });
  });

  it("recusa do servidor aparece em português e nada some da tela", async () => {
    handlers[PUT] = () => json({ error: "A função tem problemas: x", problems: ["A avaliação do treino sozinho usa o modo comitê, com IAs de empresas diferentes."], warnings: [] }, 400);
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    pick(box, "Principal: IA — Avaliação do treino sozinho", "anthropic");
    pick(box, "Principal: modelo — Avaliação do treino sozinho", "claude-a");
    pick(box, "Membro 1: IA — Avaliação do treino sozinho", "openai");
    pick(box, "Membro 1: modelo — Avaliação do treino sozinho", "gpt-x");
    fireEvent.click(within(box).getByRole("button", { name: "Salvar" }));
    expect(await within(box).findByText("A avaliação do treino sozinho usa o modo comitê, com IAs de empresas diferentes.")).toBeTruthy();
    expect(screen.getByTestId("function-treino_avaliacao")).toBeTruthy();
  });

  it("função salva e pronta: mostra 'pronta', o comitê salvo e 'Desligar a função' apaga a configuração", async () => {
    overview.functions = [savedTreino()];
    overview.checks.treino_avaliacao = readyCheck;
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect(within(box).getByText("pronta")).toBeTruthy();
    expect(within(box).queryByText("Nasce desligada: sem configuração salva, a avaliação por IA do treino sozinho não roda.")).toBeNull();
    expect((within(box).getByLabelText("Principal: modelo — Avaliação do treino sozinho") as HTMLSelectElement).value).toBe("claude-a");
    expect((within(box).getByLabelText("Membro 1: modelo — Avaliação do treino sozinho") as HTMLSelectElement).value).toBe("gpt-x");
    expect(within(box).queryByText("Voltar às variáveis do servidor")).toBeNull();
    fireEvent.click(within(box).getByRole("button", { name: "Desligar a função" }));
    expect((window.confirm as any).mock.calls[0][0]).toBe('Desligar "Avaliação do treino sozinho"? A configuração salva será apagada e a função para de rodar.');
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))).toBe(true));
    expect(calls.find((c) => c.method === "PUT" && c.url.endsWith("/functions/treino_avaliacao"))!.body).toEqual({ config: null });
  });

  it("função salva com o mesmo problema do servidor aparece como 'não está pronta' com a mensagem", async () => {
    overview.functions = [savedTreino({ reviewers: [{ provider: "anthropic", model: "claude-b" }] })];
    overview.checks.treino_avaliacao = { ...readyCheck, ready: false, problems: ["O comitê da avaliação do treino sozinho precisa de membros de pelo menos duas empresas diferentes."] };
    render(<AdminAI />);
    const box = await screen.findByTestId("function-treino_avaliacao");
    expect(within(box).getByText("não está pronta")).toBeTruthy();
    expect(within(box).getAllByText("O comitê da avaliação do treino sozinho precisa de membros de pelo menos duas empresas diferentes.").length).toBeGreaterThan(0);
  });

  it("o gasto da função aparece com o nome em português na Central e o Registro conhece o nome", async () => {
    overview.spend_by_function = [{ function_key: "treino_avaliacao", cost_usd: 0.42 }];
    overview.recent_calls = [{ id: 1, function_key: "treino_avaliacao", mode: "comite", role: "membro", provider: "openai", model: "gpt-x", cost_usd: 0.2, outcome: "ok", created_at: "2026-10-17T12:00:00Z" }];
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
