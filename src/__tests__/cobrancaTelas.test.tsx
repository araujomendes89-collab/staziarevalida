// @vitest-environment jsdom
/**
 * Cobrança na tela Planos (013700): sem fornecedor ligado nada muda (nota "ainda não disponível" fica); ligada, só o PRO à venda
 * (ELITE "em breve"), Pix ou cartão à vista, CPF só quando ainda não há cliente, aceite obrigatório (caixa desmarcada) e o Pix
 * mostra o QR Code e o copia-e-cola.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", subscription: { plan: "trial", status: "trialing" } }, user: { id: "u1" } }) }));

import { PlansScreen } from "../novo/app/plan/PlansScreen.jsx";

const OVERVIEW = {
  enabled: true,
  provider: "asaas",
  mode: "test",
  methods: { card: true, pix: true },
  precisa_documento: true,
  vendas_ligadas: true,
  vitrine: {
    planos: [
      { codigo: "pro", nome: "PRO", descricao: "1ª fase", mensal_centavos: 9990, trimestral_centavos: 26970, a_venda: true },
      { codigo: "elite", nome: "ELITE", descricao: "tudo", mensal_centavos: 19990, trimestral_centavos: 53970, a_venda: false },
    ],
    extras: [{ codigo: "boost", nome: "IA Boost", valor_centavos: 2490, creditos: 100, voz_minutos: 10, validade_dias: 30 }],
  },
  contrato: null,
  pedidos_abertos: [],
  cobrancas: [],
  devolucoes: [],
};

let calls: { url: string; body: any }[] = [];
function mockFetch(overview: any, checkout?: any) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    const u = String(url);
    const ok = (o: any) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.endsWith("/overview")) return overview ? ok(overview) : new Response("{}", { status: 503 });
    if (u.endsWith("/checkout") || u.endsWith("/renewal/pix")) return ok(checkout);
    return ok({ status: "aberto" });
  }) as any;
}

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockResolvedValue({ plans: [{ code: "pro", name: "Pro", features: [] }] });
});
afterEach(cleanup);

describe("tela Planos com a cobrança", () => {
  it("desligada: nada de compra; a nota de 'ainda não disponível' continua", async () => {
    mockFetch(null);
    render(<PlansScreen go={vi.fn()} />);
    await screen.findByTestId("plano-pro");
    expect(screen.getByText(/A assinatura pelo app ainda não está disponível/)).toBeTruthy();
    expect(screen.queryByTestId("cobranca")).toBeNull();
  });

  it("ligada: PRO à venda, ELITE em breve, extra com preço; nota antiga some", async () => {
    mockFetch(OVERVIEW);
    render(<PlansScreen go={vi.fn()} />);
    await screen.findByTestId("cobranca");
    expect(screen.getByTestId("cobranca-plano-elite").textContent).toContain("Em breve");
    expect(screen.getByTestId("cobranca-plano-pro").textContent).toContain("R$ 269,70");
    expect(screen.getByTestId("cobranca-extra-boost").textContent).toContain("R$ 24,90");
    await waitFor(() => expect(screen.queryByText(/A assinatura pelo app ainda não está disponível/)).toBeNull());
    // ELITE não abre compra
    fireEvent.click(screen.getByTestId("cobranca-plano-elite").querySelectorAll("button")[0]);
    expect(screen.queryByTestId("cobranca-compra")).toBeNull();
  });

  it("compra por Pix: CPF e aceite obrigatórios; manda à vista, sem boleto; mostra o QR Code", async () => {
    mockFetch(OVERVIEW, { id: "11111111-1111-4111-8111-111111111111", status: "aberto", nome: "IA Boost", tipo: "extra", metodo: "pix", valor_centavos: 2490, url: "https://pagar/x", pix: { payload: "000201PIX", image: "iVBOR" } });
    render(<PlansScreen go={vi.fn()} />);
    await screen.findByTestId("cobranca");
    fireEvent.click(screen.getByTestId("cobranca-extra-boost").querySelector("button")!);
    // etapa 1: forma de pagamento e CPF (só aqui); sem CPF válido não avança
    const revisar = await screen.findByRole("button", { name: "Revisar e pagar" });
    expect((revisar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Aluno Teste" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "111.111.111-11" } });
    expect((revisar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "36638544691" } });
    expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("366.385.446-91");
    fireEvent.click(revisar);
    // etapa 2: resumo (CPF escondido) e aceite obrigatório
    expect(screen.getByTestId("cobranca-resumo").textContent).toContain("***.385.446-**");
    const pagar = screen.getByRole("button", { name: "Gerar o Pix" });
    expect((pagar as HTMLButtonElement).disabled).toBe(true); // falta o aceite
    fireEvent.click(screen.getByRole("checkbox"));
    expect((pagar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pagar);
    await screen.findByTestId("cobranca-aberta");
    expect(screen.getByAltText("QR Code do Pix")).toBeTruthy();
    expect(screen.getByText("000201PIX")).toBeTruthy();
    const body = calls.find((c) => c.url.endsWith("/checkout"))!.body;
    expect(body).toMatchObject({ tipo: "extra", codigo: "boost", metodo: "pix", aceite: true, documento: "366.385.446-91", nome: "Aluno Teste" });
    expect(body.idem).toMatch(/^c-/);
    expect(screen.queryByText(/boleto/i)).toBeNull();
  });

  it("renovação do cartão recusada: aviso de acesso pausado e Pix da mesma cobrança na hora", async () => {
    const ov = { ...OVERVIEW, precisa_documento: false, contrato: { plano: "pro", ciclo: "mensal", metodo: "cartao", valor_centavos: 9990, renova: true, periodo_fim: new Date(Date.now() + 3600e3).toISOString() }, renovacao_pendente: { valor_centavos: 9990, plano: "pro", ciclo: "mensal" } };
    mockFetch(ov, { id: "22222222-2222-4222-8222-222222222222", status: "aberto", nome: "Pro mensal (renovação)", tipo: "plano", metodo: "pix", valor_centavos: 9990, pix: { payload: "000201REN", image: "img" } });
    render(<PlansScreen go={vi.fn()} />);
    const aviso = await screen.findByTestId("cobranca-renovacao-falhou");
    expect(aviso.textContent).toContain("pausado");
    fireEvent.click(screen.getByRole("button", { name: "Pagar agora por Pix" }));
    await screen.findByText("000201REN");
    expect(calls.some((c) => c.url.endsWith("/renewal/pix"))).toBe(true);
  });
});
