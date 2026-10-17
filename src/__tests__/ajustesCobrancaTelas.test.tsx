// @vitest-environment jsdom
/**
 * Ajustes da cobrança (013850) nas telas: link da nota fiscal no histórico de Minha conta › Assinatura; Administração › ficha do
 * aluno › Pagamentos com o botão "Devolver pagamento" (motivo obrigatório, manter/encerrar, valor parcial, recusa do Asaas na tela);
 * Administração › Planos › Devoluções (o que o sistema entendeu da devolução feita no painel) e Carteira de IA › Alertas por e-mail.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend, refresh: async () => {}, boot: { role: "admin" }, user: { id: "eu", email: "admin@teste.dev" } }),
  useOptionalSession: () => ({ backend }),
}));

import { AssinaturaSection } from "../novo/app/plan/Assinatura.jsx";
import { DevolucoesRecentes, PagamentosAluno } from "../novo/app/admin/planos/PagamentosAluno.jsx";
import { AlertasDono } from "../novo/app/admin/planos/AlertasDono.jsx";

let calls: { url: string; body: any }[] = [];
function mockFetch(routes: Record<string, any>) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : undefined });
    const key = Object.keys(routes).find((k) => u.endsWith(k));
    const v = key ? routes[key] : {};
    return new Response(JSON.stringify(v), { status: v?.__status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as any;
}

// (bloco com chaves: uma função devolvida pelo beforeEach vira limpeza e seria chamada depois do teste)
beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

const hoje = new Date().toISOString();

describe("Minha conta › Assinatura: nota fiscal no histórico", () => {
  it("link da nota emitida (com o número) ao lado do recibo; nota cancelada sem link", async () => {
    mockFetch({ "/overview": { enabled: true, mode: "test", methods: { card: true, pix: true }, contrato: null, pedidos_abertos: [], devolucoes: [] } });
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_billing_historico"
        ? {
            pagamentos: [
              { id: 1, tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix", valor_centavos: 9990, status: "paga", pago_em: hoje, recibo_url: "https://asaas.test/r/1", nota_status: "autorizada", nota_numero: "123", nota_url: "https://asaas.test/nota/1.pdf" },
              { id: 2, tipo: "extra", codigo: "boost", ciclo: "avulso", metodo: "pix", valor_centavos: 2490, status: "devolvida", pago_em: hoje, recibo_url: null, nota_status: "cancelada", nota_numero: null, nota_url: null },
            ],
            aceite: null,
            contrato_url: "/novo/termos",
          }
        : { novos: [], recentes: [] }
    );
    render(<AssinaturaSection go={vi.fn()} />);
    const nota = await screen.findByTestId("nota-1");
    expect(nota.getAttribute("href")).toBe("https://asaas.test/nota/1.pdf");
    expect(nota.textContent).toContain("Nota fiscal nº 123");
    expect(screen.getByRole("link", { name: /Recibo/ }).getAttribute("href")).toBe("https://asaas.test/r/1");
    expect(screen.getByText("Nota cancelada")).toBeTruthy();
    expect(screen.queryByTestId("nota-2")).toBeNull();
    expect(screen.getByText(/ela chega no seu e-mail e o link aparece aqui/)).toBeTruthy();
  });
});

const PAGAMENTOS = {
  contrato: { plano: "pro", ciclo: "mensal", metodo: "cartao", renova: true, periodo_fim: new Date(Date.now() + 20 * 86400e3).toISOString() },
  pagamentos: [
    { id: 10, tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao", valor_centavos: 9990, devolvido_centavos: 0, status: "paga", pago_em: hoje, recibo_url: "https://asaas.test/r/10", nota_status: "autorizada", nota_url: "https://asaas.test/n/10.pdf", devolucoes: [] },
    {
      id: 9, tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix", valor_centavos: 9990, devolvido_centavos: 9990, status: "devolvida", pago_em: hoje, devolucoes: [
        { id: 3, valor_centavos: 9990, status: "feito", origem: "painel", classificacao: "duplicada", conferir: false, em: hoje, motivo: "Devolução feita no painel do fornecedor" },
      ],
    },
  ],
};

describe("Administração › ficha do aluno › Pagamentos", () => {
  it("lista os pagamentos, mostra o que o sistema entendeu da devolução do painel e só deixa devolver o que foi pago", async () => {
    backend.rpc.mockResolvedValue(PAGAMENTOS);
    render(<PagamentosAluno userId="aluno-1" />);
    const lista = await screen.findByTestId("admin-pagamentos");
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_billing_pagamentos", { p_user: "aluno-1" });
    expect(lista.textContent).toContain("cobrança repetida: o período já estava pago por outra cobrança; acesso mantido");
    expect(lista.textContent).toContain("Feita no painel do Asaas");
    expect(screen.getAllByRole("button", { name: "Devolver pagamento" })).toHaveLength(1);
  });

  it("devolver: motivo e escolha do acesso obrigatórios; manda ao servidor e mostra a resposta", async () => {
    backend.rpc.mockResolvedValue(PAGAMENTOS);
    mockFetch({ "/admin/devolver": { ok: true, status: "feito", valor_centavos: 9990, mensagem: "Devolução feita. O valor volta ao aluno pela mesma forma de pagamento." } });
    render(<PagamentosAluno userId="aluno-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Devolver pagamento" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar devolução" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo (obrigatório)"), { target: { value: "Desistência pedida por e-mail" } });
    expect(confirmar.disabled).toBe(true); // falta escolher o acesso
    fireEvent.click(screen.getByRole("radio", { name: "Devolver e encerrar acesso" }));
    expect(screen.getByText(/O acesso pago acaba quando o Asaas confirmar/)).toBeTruthy();
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);
    await screen.findByText("Devolução feita. O valor volta ao aluno pela mesma forma de pagamento.");
    expect(calls[0]).toEqual({ url: "/api/cobranca/admin/devolver", body: { cobranca_id: 10, valor_centavos: null, motivo: "Desistência pedida por e-mail", acesso: "encerrar" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(2)); // recarregou a lista
  });

  it("devolução parcial e manter acesso; a recusa do Asaas aparece na tela", async () => {
    backend.rpc.mockResolvedValue(PAGAMENTOS);
    mockFetch({ "/admin/devolver": { __status: 502, error: "A instituição de pagamento não aceitou a devolução: Esta cobrança só pode ser estornada parcialmente no próximo dia", code: "devolucao_recusada" } });
    render(<PagamentosAluno userId="aluno-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Devolver pagamento" }));
    fireEvent.change(screen.getByLabelText("Valor a devolver (R$)"), { target: { value: "10,00" } });
    fireEvent.change(screen.getByLabelText("Motivo (obrigatório)"), { target: { value: "Desconto combinado" } });
    fireEvent.click(screen.getByRole("radio", { name: "Devolver e manter acesso" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolução" }));
    await screen.findByText(/estornada parcialmente no próximo dia/);
    expect(calls[0].body).toEqual({ cobranca_id: 10, valor_centavos: 1000, motivo: "Desconto combinado", acesso: "manter" });
    // valor acima do que foi pago não deixa confirmar
    fireEvent.change(screen.getByLabelText("Valor a devolver (R$)"), { target: { value: "120,00" } });
    expect((screen.getByRole("button", { name: "Confirmar devolução" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sem a migração no banco: só um aviso discreto", async () => {
    backend.rpc.mockImplementation(async () => {
      throw new Error("Could not find the function public.app_admin_billing_pagamentos(p_user) in the schema cache");
    });
    render(<PagamentosAluno userId="aluno-1" />);
    expect(await screen.findByText(/migração 013850/)).toBeTruthy();
  });
});

describe("Administração › Planos › Devoluções", () => {
  it("lista as devoluções com o aluno, quem fez e o motivo; as para conferir ganham o selo", async () => {
    backend.rpc.mockResolvedValue([
      { id: 5, email: "aluno@t.dev", cobranca_id: 9, valor_centavos: 9990, total: true, status: "feito", origem: "painel", classificacao: "conferir", conferir: true, em: hoje, pagamento: { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao", valor_centavos: 9990 } },
      { id: 4, email: "outro@t.dev", cobranca_id: 8, valor_centavos: 4995, total: false, status: "feito", origem: "equipe", acesso: "manter", motivo: "Cortesia", feito_por: "admin@t.dev", em: hoje, pagamento: { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix", valor_centavos: 9990 } },
    ]);
    render(<DevolucoesRecentes />);
    const l = await screen.findByTestId("admin-devolucoes");
    expect(l.textContent).toContain("aluno@t.dev");
    expect(l.textContent).toContain("há renovação já paga depois deste período; acesso mantido, confira");
    expect(l.textContent).toContain("Conferir");
    expect(l.textContent).toContain("Equipe (admin@t.dev)");
    expect(l.textContent).toContain("acesso mantido");
    expect(l.textContent).toContain("Motivo: Cortesia");
  });
});

describe("Administração › Carteira de IA › Alertas por e-mail", () => {
  it("mostra o endereço e as chaves, salva e lista os últimos alertas", async () => {
    const dados = {
      config: { email: "suporte@staziamed.com.br", ligado: true, resumo_diario: true, aluno_limite_usd_dia: 1 },
      recentes: [{ id: 1, tipo: "teto_80", titulo: "Gasto de IA em 80% do teto de hoje", em: hoje, email_status: "enviado", email_para: "suporte@staziamed.com.br" }],
    };
    backend.rpc.mockImplementation(async (fn: string, args: any) => (fn === "app_admin_alertas_dono_salvar" ? { ...dados, config: { ...dados.config, ...args.p_dados, aluno_limite_usd_dia: 2.5 } } : dados));
    render(<AlertasDono />);
    const email = (await screen.findByLabelText("Mandar os alertas para")) as HTMLInputElement;
    expect(email.value).toBe("suporte@staziamed.com.br");
    expect(screen.getByText("Gasto de IA em 80% do teto de hoje")).toBeTruthy();
    expect(screen.getByText("Enviado")).toBeTruthy();
    fireEvent.change(email, { target: { value: "dono@staziamed.com.br" } });
    fireEvent.change(screen.getByLabelText(/Aluno fora do comum/), { target: { value: "2,50" } });
    fireEvent.click(screen.getByRole("switch", { name: /Resumo diário/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alertas" }));
    await screen.findByText("Salvo.");
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_alertas_dono_salvar", { p_dados: { email: "dono@staziamed.com.br", ligado: true, resumo_diario: false, aluno_limite_usd_dia: "2.50" } });
  });
});
