/**
 * Planos · ETAPA 2 nas telas (migração …013680): Administração > Planos > "Carteira de IA": números reais de hoje e do mês
 * (modo sombra), ajustes (teto, reserva, pacotes, à venda), carteira de um aluno com cortesia e simulação de devolução.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: { role: "admin" }, user: { id: "eu", email: "admin@teste.dev" }, backend }),
  useOptionalSession: () => ({ backend }),
}));

import { CarteiraIA } from "../novo/app/admin/planos/CarteiraIA.jsx";

const PERIODO = { pedidos: 12, creditos: 14.3, custo_usd: 0.28, custo_brl: 1.42, devolvidos: 1, alunos: 4, teriam_sido_barrados: 3, alunos_que_seriam_barrados: 1, por_recurso: { tutor_texto: { pedidos: 10, creditos: 12.1, custo_usd: 0.24 } }, por_modo: { sombra: 12 }, voz_extras_min: 0 };
const DADOS = {
  modo: "sombra",
  config: { teto_custo_dia_usd: 20, cotacao_dolar: 5.08, credito_valor_centavos: 10, devolucao_desconto_pct: 10, devolucao_abuso_qtd: 2, devolucao_abuso_dias: 180 },
  teto: { teto_usd: 20, gasto_hoje_usd: 0.28, estourado: false },
  resumo: { hoje: PERIODO, mes: PERIODO },
  top_alunos_mes: [{ email: "a@teste.dev", creditos: 9, custo_usd: 0.2, pedidos: 7, teriam_sido_barrados: 3 }],
  recursos: [{ codigo: "tutor_texto", nome: "Tutor por texto", reserva_creditos: 3, existe: true }],
  pacotes: [{ codigo: "boost", nome: "IA Boost", preco_centavos: 2490, creditos: 100, voz_minutos: 10, validade_dias: 30 }],
  planos_a_venda: [
    { codigo: "pro", nome: "PRO", a_venda: true, fases: ["teoria"], vale_agora: true },
    { codigo: "elite", nome: "ELITE", a_venda: false, fases: ["teoria", "pratica"], vale_agora: false },
  ],
  extras: { ativos: 0, creditos_restantes: 0 },
  cortesias_recentes: [],
};
const ALUNO = {
  aluno: { id: "x", email: "aluno@teste.dev" }, modo: "sombra", perfil: "pro", saldo: {},
  creditos: { franquia_dia: 8, franquia_mes: 180, usado_dia: 2.2, usado_mes: 30, extras: 25, extras_valem: false },
  voz: { periodo: "mes", franquia_s: 600, usado_s: 120 },
  extras: [{ id: 7, pacote: null, origem: "cortesia", creditos: 25, creditos_usados: 0, voz_minutos: 5, voz_usados_min: 0, valido_ate: "2026-11-16T00:00:00Z", motivo: "Compensação", cancelado_em: null }],
  movimentos: [], avisos: [], devolucoes_integrais_recentes: 0,
};

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("Administração › Carteira de IA", () => {
  it("mostra o uso real em modo sombra e salva os ajustes (preço do pacote em reais vira centavos)", async () => {
    const saved: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_carteira") return DADOS;
      if (fn === "app_admin_carteira_salvar") return saved.push(args.p_dados), DADOS;
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<CarteiraIA />);
    expect(await screen.findByText(/Modo sombra: as cotas de hoje continuam valendo/)).toBeTruthy();
    expect(screen.getAllByText("Pedidos que a regra nova barraria").length).toBe(2);
    fireEvent.change(screen.getByLabelText("Preço (R$)"), { target: { value: "29,90" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar ajustes" }));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0].pacotes[0]).toMatchObject({ codigo: "boost", preco_centavos: 2990 });
    expect(saved[0].config.teto_custo_dia_usd).toBe("20");
    expect(saved[0].planos_a_venda).toEqual([{ codigo: "pro", a_venda: true }, { codigo: "elite", a_venda: false }]);
  });

  it("consulta a carteira de um aluno e dá cortesia com motivo", async () => {
    const chamadas: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      chamadas.push([fn, args]);
      if (fn === "app_admin_carteira") return DADOS;
      if (fn === "app_admin_carteira_aluno" || fn === "app_admin_carteira_cortesia") return ALUNO;
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<CarteiraIA />);
    await screen.findByText("Carteira de um aluno e cortesia");
    fireEvent.change(screen.getByLabelText("E-mail do aluno"), { target: { value: "aluno@teste.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver carteira" }));
    expect(await screen.findByText("aluno@teste.dev")).toBeTruthy();
    expect(screen.getByText("só valem com os cadeados ligados")).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText("Créditos").at(-1)!, { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Motivo (obrigatório)"), { target: { value: "Compensação" } });
    fireEvent.click(screen.getByRole("button", { name: "Dar cortesia" }));
    await waitFor(() => expect(chamadas.some(([fn]) => fn === "app_admin_carteira_cortesia")).toBe(true));
    const [, args] = chamadas.find(([fn]) => fn === "app_admin_carteira_cortesia");
    expect(args).toEqual({ p_busca: "aluno@teste.dev", p_creditos: 25, p_voz_minutos: 0, p_validade_dias: 30, p_motivo: "Compensação" });
  });

  it("simula a devolução (só cálculo)", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_carteira") return DADOS;
      if (fn === "app_admin_carteira_devolucao") return { regra: "trimestral_meses_nao_iniciados", meses_nao_iniciados: 1, desconto_pct: 10, valor_centavos: 8091, abuso: false };
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<CarteiraIA />);
    await screen.findByText("Simular devolução");
    fireEvent.click(screen.getByRole("button", { name: "Calcular" }));
    expect(await screen.findByText(/Devolução: R\$\s?80,91/)).toBeTruthy();
  });

  it("sem a migração 013680: só um aviso discreto", async () => {
    backend.rpc.mockRejectedValue(new Error("Could not find the function public.app_admin_carteira without parameters in the schema cache"));
    render(<CarteiraIA />);
    expect(await screen.findByText(/migração 013680/)).toBeTruthy();
  });
});

import { PlanoPorFaseUsuario, TestesComAlerta } from "../novo/app/admin/planos/PlanoPorFaseUsuario.jsx";

describe("Administração › Usuários › Plano por fase (etapa 3)", () => {
  const DIAG = { regra_nova: { perfil: "teste", modo: "sombra", fases: { teoria: { origem: "assinatura" }, pratica: {} } } };
  it("dá o PRÁTICA até uma data, com motivo, e mostra o aviso da 2ª fase fechada", async () => {
    const chamadas: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      chamadas.push([fn, args]);
      if (fn === "app_admin_direitos_aluno") return DIAG;
      if (fn === "app_admin_direitos_dar_plano") return { ...DIAG, aviso: "A 2ª fase ainda está fechada aos alunos: a parte prática só aparece quando ela abrir." };
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<PlanoPorFaseUsuario email="aluno@teste.dev" />);
    expect(await screen.findByText("Plano por fase (regra nova)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText("Motivo (obrigatório)"), { target: { value: "Conta de teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Dar plano por fase" }));
    expect(await screen.findByText(/2ª fase ainda está fechada/)).toBeTruthy();
    const [, args] = chamadas.find(([fn]) => fn === "app_admin_direitos_dar_plano");
    expect(args).toMatchObject({ p_busca: "aluno@teste.dev", p_plano: "pratica", p_motivo: "Conta de teste" });
    expect(args.p_ate).toMatch(/^2026-12-31T|^2027-01-01T/);
  });
  it("não aparece para quem não é administrador nem sem a migração", async () => {
    backend.rpc.mockRejectedValue(new Error("Só o administrador pode fazer isso."));
    const { container } = render(<PlanoPorFaseUsuario email="aluno@teste.dev" />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
  it("lista os testes com verificação pedida e marca como verificado", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_testes_alerta") return [{ email: "ip@teste.dev", verificacao: "pedida" }];
      if (fn === "app_admin_teste_verificado") return [{ email: "ip@teste.dev", verificacao: "feita" }];
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<TestesComAlerta />);
    fireEvent.click(await screen.findByRole("button", { name: "Marcar como verificado" }));
    expect(await screen.findByText("Verificado")).toBeTruthy();
  });
});
