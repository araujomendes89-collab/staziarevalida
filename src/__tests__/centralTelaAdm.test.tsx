/**
 * Administração › Central de IAs (jsdom, servidor simulado): textos e avisos desta rodada de correções.
 *  - IA03: a frase "Uma IA só é chamada se estiver ligada aqui" não era verdade para todos os usos. O interruptor de cada IA vale para
 *    as funções da Central (e para o que passa por elas); o Tutor (conversa, avaliação, voz ao vivo, transcrição do microfone), a voz
 *    do professor, o áudio dos Podcasts, a busca por significado e as rotas antigas usam a chave direto no servidor, cada um com a
 *    trava própria. A tela passa a dizer isso, com a lista.
 *  - IA09: chamada de modelo pago sem preço cadastrado não aparece com gasto US$ 0.
 *  - IA01: os tetos de gasto nascem desligados; enquanto o teto mensal ou o por chamada estiver desligado, aviso bem visível no alto, com
 *    o caminho para escolher os valores. Nenhum valor é inventado nem ligado pela tela.
 *  - IA02 (só leitura): painel único do gasto do mês de tudo o que já fica registrado; o que não tem registro aparece como "sem registro".
 *  - IA08: o "teto por execução" valia por chamada à IA (cada pedido ao maestro), não por trabalho: um documento com 50 chamadas podia
 *    gastar 50 vezes o teto. O nome passa a ser "Teto por chamada", com a explicação na tela.
 * Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

describe("IA08: o teto vale por chamada, e a tela diz isso", () => {
  it("o campo se chama Teto por chamada e a explicação diz que não é o limite de um trabalho inteiro", async () => {
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    expect(screen.getByLabelText("Teto por chamada (US$)")).toBeTruthy();
    expect(screen.queryByLabelText("Teto por execução (US$)")).toBeNull();
    const nota = screen.getByTestId("explicacao-tetos").textContent ?? "";
    expect(nota).toMatch(/O teto por chamada vale para cada chamada à IA/);
    expect(nota).toMatch(/principal, a nova tentativa e a reserva/);
    expect(nota).toMatch(/não para um trabalho inteiro/);
    expect(nota).toMatch(/várias vezes esse valor/);
    expect(nota).toMatch(/O teto mensal é o que limita o total/);
    expect(document.body.textContent).not.toMatch(/teto por execução/i);
  });
});

describe("IA01: aviso dos tetos desligados e o caminho para escolher os valores", () => {
  const load = (over: any) => {
    (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) =>
      url === "/api/ai-central/overview" && !init.method
        ? json({ ...structuredClone(OVERVIEW), ...over })
        : json({ ok: true }),
    );
  };
  const GUIA = { per_call_min_usd: 1.24, by_function: [{ key: "criacao", min_usd: 1.24 }, { key: "engenharia_reversa", min_usd: 0.62 }] };
  const ON = { monthly_cap_usd: 50, per_run_cap_usd: 2, caps_enabled: true, tab_override_enabled: false };

  it("tetos desligados: aviso no alto, dizendo que não há limite em dólares e o que fica de fora", async () => {
    load({ cap_guidance: GUIA });
    render(<AdminAI />);
    const aviso = await screen.findByTestId("aviso-tetos-desligados");
    expect(aviso.textContent).toMatch(/Os tetos de gasto estão desligados/);
    expect(aviso.textContent).toMatch(/não há limite em dólares para as IAs da Central/);
    expect(aviso.textContent).toMatch(/Tutor, as vozes e a busca por significado não entram nestes tetos/);
    expect(within(aviso).getByRole("button", { name: "Escolher os tetos" })).toBeTruthy();
    // vem antes da lista de IAs
    expect(aviso.compareDocumentPosition(screen.getByTestId("provider-anthropic")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o botão leva ao campo do teto mensal", async () => {
    load({ cap_guidance: GUIA });
    render(<AdminAI />);
    const aviso = await screen.findByTestId("aviso-tetos-desligados");
    (window as any).HTMLElement.prototype.scrollIntoView = vi.fn();
    fireEvent.click(within(aviso).getByRole("button", { name: "Escolher os tetos" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Teto mensal (US$)")));
  });

  it("os dois tetos com valor e ligados: sem aviso", async () => {
    load({ settings: ON, cap_guidance: GUIA });
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    expect(screen.queryByTestId("aviso-tetos-desligados")).toBeNull();
  });

  it("ligados, mas um teto sem valor (gravado direto no banco): o aviso diz qual falta", async () => {
    load({ settings: { ...ON, monthly_cap_usd: null }, cap_guidance: GUIA });
    render(<AdminAI />);
    const a = await screen.findByTestId("aviso-tetos-desligados");
    expect(a.textContent).toMatch(/O teto mensal está sem valor/);
    expect(a.textContent).not.toMatch(/O teto por chamada está sem valor/);
    cleanup();
    load({ settings: { ...ON, per_run_cap_usd: null }, cap_guidance: GUIA });
    render(<AdminAI />);
    const b = await screen.findByTestId("aviso-tetos-desligados");
    expect(b.textContent).toMatch(/O teto por chamada está sem valor/);
  });

  it("desligados com valores já preenchidos: avisa que falta ligar", async () => {
    load({ settings: { ...ON, caps_enabled: false }, cap_guidance: GUIA });
    render(<AdminAI />);
    const a = await screen.findByTestId("aviso-tetos-desligados");
    expect(a.textContent).toMatch(/Os tetos de gasto estão desligados/);
  });

  it("o guia na seção Gasto e tetos: o que escolher, o gasto do mês e o mínimo calculado por função; nenhum campo vem preenchido", async () => {
    load({ cap_guidance: GUIA, month_spend: 3.5 });
    render(<AdminAI />);
    const guia = await screen.findByTestId("guia-de-tetos");
    const t = guia.textContent ?? "";
    expect(t).toMatch(/Teto mensal: o máximo que as IAs da Central podem gastar no mês/);
    expect(t).toMatch(/Gasto do mês até agora: US\$ 3,50/);
    expect(t).toMatch(/Teto por chamada: .*não para um trabalho inteiro/);
    expect(t).toMatch(/pelo menos US\$ 1,24/);
    expect(t).toMatch(/Criação US\$ 1,24/);
    expect(t).toMatch(/Engenharia reversa US\$ 0,62/);
    expect(t).toMatch(/Abaixo desse valor, a função para no teto/);
    expect((screen.getByLabelText("Teto mensal (US$)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Teto por chamada (US$)") as HTMLInputElement).value).toBe("");
  });

  it("sem guia calculado (nenhuma função com preço), o guia não inventa um mínimo", async () => {
    load({ cap_guidance: { per_call_min_usd: null, by_function: [] } });
    render(<AdminAI />);
    const guia = await screen.findByTestId("guia-de-tetos");
    expect(guia.textContent).not.toMatch(/pelo menos US\$/);
    expect(guia.textContent).toMatch(/Cadastre o preço dos modelos para ver o valor mínimo/);
  });

  it("servidor antigo sem cap_guidance: a tela continua funcionando", async () => {
    load({});
    render(<AdminAI />);
    expect(await screen.findByTestId("aviso-tetos-desligados")).toBeTruthy();
    expect(screen.getByTestId("guia-de-tetos").textContent).not.toMatch(/pelo menos US\$/);
  });
});

describe("IA02: painel do gasto do mês de tudo (só leitura)", () => {
  const load = (over: any) => {
    (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) =>
      url === "/api/ai-central/overview" && !init.method ? json({ ...structuredClone(OVERVIEW), ...over }) : json({ ok: true }),
    );
  };
  const NO_RECORD = [
    { key: "rotas_antigas", note: "O contador das rotas antigas de IA fica só na memória do servidor e some quando ele reinicia." },
    { key: "perguntas_busca", note: "Cada pergunta da busca por significado custa frações de centavo e não é registrada." },
  ];
  const g = (key: string, cost_usd: number, records: number, unpriced_records = 0) => ({ key, cost_usd, records, unpriced_records });
  const SPEND = {
    available: true,
    month_start: "2026-10-01",
    groups: [g("tutor_conversa", 0.3, 2), g("tutor_voz_ao_vivo", 0.5, 1), g("tutor_transcricao", 0, 3, 3), g("tutor_voz_professor", 0.01, 4, 2), g("podcasts_audio", 0, 0), g("busca_significado", 0.001, 1)],
    no_record: NO_RECORD,
  };
  const row = (box: HTMLElement, label: string) => within(box).getByText(label).closest("tr") as HTMLElement;

  it("mostra cada lugar com o que tem registro, a Central à parte e a soma só do que tem registro", async () => {
    load({ month_spend: 1.5, all_spend: SPEND });
    render(<AdminAI />);
    const box = await screen.findByTestId("gasto-de-tudo");
    expect(row(box, "Central de IAs (entra nos tetos)").textContent).toMatch(/US\$ 1,50/);
    expect(row(box, "Tutor: conversa e avaliação").textContent).toMatch(/US\$ 0,30/);
    expect(row(box, "Tutor: voz ao vivo").textContent).toMatch(/US\$ 0,50/);
    expect(row(box, "Busca por significado (vetores dos trechos)").textContent).toMatch(/US\$ 0,001/);
    expect(row(box, "Podcasts: áudio").textContent).toMatch(/nenhum registro neste mês/);
    expect(within(box).getByTestId("soma-com-registro").textContent).toMatch(/US\$ 2,31/);
    expect(within(box).getByTestId("soma-com-registro").textContent).toMatch(/Não inclui o que está sem registro nem os registros sem preço/);
  });

  it("uso sem preço definido não vira US$ 0: aparece como sem preço; parcialmente sem preço soma e avisa", async () => {
    load({ month_spend: 0, all_spend: SPEND });
    render(<AdminAI />);
    const box = await screen.findByTestId("gasto-de-tudo");
    const stt = row(box, "Tutor: transcrição do microfone").textContent ?? "";
    expect(stt).toMatch(/sem preço/);
    expect(stt).toMatch(/3 registros/);
    expect(stt).not.toMatch(/US\$ 0\b/);
    const voz = row(box, "Tutor: voz do professor").textContent ?? "";
    expect(voz).toMatch(/US\$ 0,01/);
    expect(voz).toMatch(/2 registros sem preço/);
  });

  it("o que nem é gravado aparece como sem registro, com a explicação", async () => {
    load({ all_spend: SPEND });
    render(<AdminAI />);
    const box = await screen.findByTestId("gasto-de-tudo");
    const rotas = row(box, "Rotas antigas de IA da Administração").textContent ?? "";
    expect(rotas).toMatch(/sem registro/);
    expect(rotas).toMatch(/some quando ele reinicia/);
    expect(row(box, "Perguntas da busca por significado").textContent).toMatch(/sem registro/);
  });

  it("banco sem a atualização colada: diz o que falta e mantém a linha antiga do Tutor", async () => {
    load({ tutor_month_spend: 0.5, all_spend: { available: false, month_start: null, groups: [], no_record: NO_RECORD } });
    render(<AdminAI />);
    const box = await screen.findByTestId("gasto-de-tudo");
    expect(box.textContent).toMatch(/Falta colar no Supabase a atualização 20261003009520/);
    expect(screen.getByText("Tutor (fora do teto, só informação)")).toBeTruthy();
  });

  it("servidor antigo sem all_spend: sem painel novo, a linha antiga continua", async () => {
    load({ tutor_month_spend: 0.5 });
    render(<AdminAI />);
    await screen.findByTestId("provider-anthropic");
    expect(screen.queryByTestId("gasto-de-tudo")).toBeNull();
    expect(screen.getByText("Tutor (fora do teto, só informação)")).toBeTruthy();
  });

  it("com o painel novo a linha antiga do Tutor sai (não duplica o número)", async () => {
    load({ all_spend: SPEND });
    render(<AdminAI />);
    await screen.findByTestId("gasto-de-tudo");
    expect(screen.queryByText("Tutor (fora do teto, só informação)")).toBeNull();
  });
});
