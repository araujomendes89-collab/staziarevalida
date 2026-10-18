// @vitest-environment jsdom
/**
 * Administração › Vendas e pagamentos: "Pagamentos sem nota / nota com erro" (013860). Aparece só quando há pendência; some sem a
 * função no banco (antes da 013860) e não atrapalha a lista de vendas.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend, refresh: async () => {}, boot: { role: "admin" }, user: { id: "eu", email: "admin@teste.dev" } }),
  useOptionalSession: () => ({ backend }),
}));

import { NotasPendentes, VendasPagamentos } from "../novo/app/admin/planos/VendasPagamentos.jsx";

const hoje = new Date().toISOString();
const LISTA = { de: "2026-09-17", ate: "2026-10-17", totais: { recebido_centavos: 0, devolvido_centavos: 0, liquido_centavos: 0, pagamentos: 0, por_situacao: {} }, linhas: [] };

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("Administração › pagamentos sem nota / nota com erro", () => {
  it("mostra cada pendência: aluno, produto, valor, pedidos, se o app ainda vai tentar e o último erro", async () => {
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_admin_billing_notas_pendencias"
        ? [
            { cobranca_id: 9, email: "ana@t.dev", nome: "Ana Souza", produto: "IA Boost", valor_centavos: 2490, pago_em: hoje, nota_pedidos: 4, nota_erro: "Asaas 503: fora do ar", situacao: "sem_nota", vai_tentar_de_novo: false },
            { cobranca_id: 10, email: "bia@t.dev", nome: null, produto: "PRO mensal", valor_centavos: 9990, pago_em: hoje, nota_pedidos: 1, nota_erro: null, situacao: "erro", vai_tentar_de_novo: true },
          ]
        : LISTA
    );
    render(<VendasPagamentos />);
    const card = await screen.findByTestId("notas-pendentes");
    expect(card.textContent).toContain("Pagamentos sem nota / nota com erro (2)");
    const ana = screen.getByTestId("nota-pendente-9");
    expect(ana.textContent).toContain("Ana Souza");
    expect(ana.textContent).toContain("Sem nota");
    expect(ana.textContent).toContain("R$ 24,90");
    expect(ana.textContent).toContain("4 pedido(s) de nota");
    expect(ana.textContent).toContain("não vai tentar de novo");
    expect(ana.textContent).toContain("Último erro: Asaas 503: fora do ar");
    const bia = screen.getByTestId("nota-pendente-10");
    expect(bia.textContent).toContain("bia@t.dev");
    expect(bia.textContent).toContain("Nota com erro");
    expect(bia.textContent).toContain("o app vai tentar de novo");
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_billing_vendas_lista", expect.anything());
  });

  it("sem pendência ou sem a 013860 no banco: nada aparece", async () => {
    backend.rpc.mockResolvedValue([]);
    const { container, unmount } = render(<NotasPendentes />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_billing_notas_pendencias"));
    expect(container.textContent).toBe("");
    unmount();
    backend.rpc.mockRejectedValue(new Error("Could not find the function public.app_admin_billing_notas_pendencias in the schema cache"));
    const r2 = render(<NotasPendentes />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(2));
    expect(r2.container.textContent).toBe("");
  });
});
