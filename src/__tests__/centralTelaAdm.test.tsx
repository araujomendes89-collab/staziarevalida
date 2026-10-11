/**
 * Administração › Central de IAs (jsdom, servidor simulado): textos e avisos desta rodada de correções.
 *  - IA03: a frase "Uma IA só é chamada se estiver ligada aqui" não era verdade para todos os usos. O interruptor de cada IA vale para
 *    as funções da Central (e para o que passa por elas); o Tutor (conversa, avaliação, voz ao vivo, transcrição do microfone), a voz
 *    do professor, o áudio dos Podcasts, a busca por significado e as rotas antigas usam a chave direto no servidor, cada um com a
 *    trava própria. A tela passa a dizer isso, com a lista.
 *  - IA09: chamada de modelo pago sem preço cadastrado não aparece com gasto US$ 0.
 * Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminAI } from "../novo/app/admin/ai/AdminAI.jsx";

const provider = (id: string) => ({ id, enabled: false, enabled_by: null, enabled_by_email: null, enabled_at: null, models: [], models_refreshed_at: null, last_status: null, last_status_detail: null });
const OVERVIEW: any = {
  providers: ["anthropic", "openai", "gemini", "ollama"].map(provider),
  functions: [],
  settings: { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false },
  prices: [],
  spend_by_provider: [],
  spend_by_function: [],
  month_spend: 0,
  tutor_month_spend: 0,
  recent_calls: [],
  history: [],
  checks: Object.fromEntries(["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar"].map((k) => [k, { source: "variaveis", ready: false, ref: null, problems: [], warnings: [] }])),
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  (globalThis as any).fetch = vi.fn(async (url: string) => (url === "/api/ai-central/overview" ? json(structuredClone(OVERVIEW)) : json({ ok: true })));
});
afterEach(cleanup);

describe("IA03: o texto do interruptor diz a verdade", () => {
  it("não afirma mais que toda IA só é chamada se estiver ligada aqui", async () => {
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    expect(screen.queryByText(/Uma IA só é chamada se estiver ligada aqui\./)).toBeNull();
    // a regra que vale: as funções da Central (e o que passa por elas)
    const section = screen.getByTestId("providers-intro");
    expect(section.textContent).toMatch(/As chaves ficam só no servidor\./);
    expect(section.textContent).toMatch(/Uma IA só é chamada pelas funções abaixo se estiver ligada aqui/);
    expect(section.textContent).toMatch(/Aulas e roteiro dos Podcasts/);
  });

  it("lista os usos que não passam pelo interruptor, cada um com a IA que usa", async () => {
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    const lista = screen.getByTestId("fora-do-interruptor");
    expect(screen.getByTestId("providers-intro").textContent).toMatch(/Desligar uma IA aqui não desliga estes usos/);
    const itens = within(lista).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(itens).toHaveLength(5);
    expect(itens[0]).toMatch(/^Tutor: conversa e avaliação \(Claude, por padrão\), transcrição do microfone \(OpenAI\) e voz ao vivo \(Gemini ou OpenAI\)/);
    expect(itens[1]).toMatch(/^Voz do professor do Tutor: ElevenLabs/);
    expect(itens[2]).toMatch(/^Áudio dos Podcasts: OpenAI \(a voz do Gemini existe, mas fica desligada por padrão no servidor\)/);
    expect(itens[3]).toMatch(/^Busca por significado da Central de Conteúdo: Gemini/);
    expect(itens[4]).toMatch(/^Rotas antigas de IA da Administração: Claude e Gemini/);
  });
});

describe("IA09: chamada de modelo pago sem preço não aparece com gasto US$ 0", () => {
  const call = (id: number, extra: any = {}) => ({ id, created_at: "2026-10-11T12:00:00Z", function_key: "criacao", role: "principal", provider: "anthropic", model: "claude-opus-5", input_tokens: 1000, output_tokens: 50, cost_usd: 0, outcome: "ok", ...extra });

  it("tokens gastos e custo zero em IA paga vira \"sem preço\"; com custo mostra o valor; Ollama e chamada sem tokens seguem US$ 0", async () => {
    (globalThis as any).fetch = vi.fn(async (url: string) =>
      url === "/api/ai-central/overview"
        ? json({
            ...structuredClone(OVERVIEW),
            recent_calls: [
              call(1, { model: "claude-sem-preco" }),
              call(2, { model: "claude-com-preco", cost_usd: 0.0123 }),
              call(3, { provider: "ollama", model: "qwen3" }),
              call(4, { model: "claude-teto", input_tokens: 0, output_tokens: 0, outcome: "teto" }),
            ],
          })
        : json({ ok: true }),
    );
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    const row = (model: string) => screen.getByText(model).closest("tr") as HTMLElement;
    expect(within(row("claude-sem-preco")).getByText("sem preço")).toBeTruthy();
    expect(within(row("claude-sem-preco")).queryByText("US$ 0")).toBeNull();
    expect(within(row("claude-com-preco")).getByText("US$ 0,0123")).toBeTruthy();
    expect(within(row("qwen3")).getByText("US$ 0")).toBeTruthy();
    expect(within(row("claude-teto")).getByText("US$ 0")).toBeTruthy();
  });
});
