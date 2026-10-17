/**
 * Planos · ETAPA 1 nas telas (migração …013640): Administração > Planos > "Planos por fase e cadeados" (chaves, amostra, créditos,
 * planos com preço mensal/trimestral e franquias, recursos), o diagnóstico "o que este aluno teria" e o chip de SALDO no Início
 * (ao lado da sequência): modo sombra mostra a cota que vale hoje (mensagens do Tutor e voz), chave ligada mostra créditos, equipe
 * vê "IA ilimitada", e sem Tutor/sem função o chip some.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: { role: "admin" }, user: { id: "eu", email: "admin@teste.dev" }, backend }),
  useOptionalSession: () => ({ backend }),
}));

import { PlanosPorFase, montarSalvar, reaisParaCentavos } from "../novo/app/admin/planos/DireitosPorFase.jsx";
import { SaldoChip, SaldoChipView } from "../novo/app/home/SaldoChip.jsx";
import { modeloSaldo } from "../novo/app/home/saldo.js";

const DADOS = {
  config: { cadeados_ligados: false, fase2_aberta_alunos: false, amostra_creditos_dia: 5, amostra_voz_minutos_total: 2, credito_valor_centavos: 10, cotacao_dolar: null, teste_dias: 7, teste_no_cadastro: true },
  planos: [
    { codigo: "pro", nome: "PRO", descricao: "1ª fase", fases: ["teoria"], preco_mensal_centavos: 9990, preco_trimestral_centavos: 26970, creditos_dia: 8, creditos_mes: 180, voz_minutos_mes: 10 },
    { codigo: "pratica", nome: "PRÁTICA", descricao: "2ª fase", fases: ["pratica"], preco_mensal_centavos: 16990, preco_trimestral_centavos: 45870, creditos_dia: 12, creditos_mes: 270, voz_minutos_mes: 20 },
    { codigo: "elite", nome: "ELITE", descricao: "As duas", fases: ["teoria", "pratica"], preco_mensal_centavos: 19990, preco_trimestral_centavos: 53970, creditos_dia: 20, creditos_mes: 450, voz_minutos_mes: 40 },
  ],
  recursos: [
    { codigo: "questoes", nome: "Questões teóricas (Inep e StaziaMed)", fase: "teoria", tipo: "conteudo", amostra_modo: "por_dia", amostra_limite: 20, unidade: "questões por dia", decidido: true, existe: true },
    { codigo: "estacoes", nome: "Estações práticas", fase: "pratica", tipo: "conteudo", amostra_modo: "por_dia", amostra_limite: 1, unidade: "estação por dia", decidido: false, existe: true },
    { codigo: "tutor_texto", nome: "Tutor por texto", fase: "comum", tipo: "credito", amostra_modo: "creditos", amostra_limite: null, unidade: "créditos de IA", decidido: true, existe: true },
  ],
  resumo: { alunos: 12, por_perfil: { teste: 9, pro: 2, vencido: 1 }, perderiam_algo: 10, ganhariam_algo: 0, teste_repetido_telefone: 1 },
};

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("Administração › Planos por fase e cadeados", () => {
  const abrir = (saved: any[] = [], fail?: string) => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_direitos") return DADOS;
      if (fn === "app_admin_direitos_salvar") {
        saved.push(args.p_dados);
        if (fail) throw new Error(fail);
        return { ...DADOS, config: { ...DADOS.config, ...args.p_dados.config } };
      }
      throw new Error(`rpc inesperada: ${fn}`);
    });
    return render(<PlanosPorFase />);
  };

  it("mostra o modo sombra, os 3 planos com preços e franquias (fora de venda), a matriz e o resumo", async () => {
    abrir();
    expect(await screen.findByText("Modo sombra: nada é trancado")).toBeTruthy();
    expect((screen.getByRole("switch", { name: /^Cadeados ligados/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Mensal (R$) · PRO") as HTMLInputElement).value).toBe("99,90");
    expect((screen.getByLabelText("Trimestral (R$) · ELITE") as HTMLInputElement).value).toBe("539,70");
    expect((screen.getByLabelText("Créditos por mês · PRÁTICA") as HTMLInputElement).value).toBe("270");
    expect((screen.getByLabelText("Voz ao vivo (min/mês) · ELITE") as HTMLInputElement).value).toBe("40");
    expect(screen.getAllByText("Fora de venda")).toHaveLength(3);
    expect(screen.getByText("Proposta: confirme")).toBeTruthy();
    expect(screen.getByText("Perderiam algo: 10")).toBeTruthy();
    expect(screen.getByText(/Pendente: sem cotação/)).toBeTruthy();
  });

  it("salva o que mudou (preço em reais vira centavos; recurso só se mudou ou foi confirmado)", async () => {
    const saved: any[] = [];
    abrir(saved);
    fireEvent.change(await screen.findByLabelText("Mensal (R$) · PRO"), { target: { value: "109,90" } });
    fireEvent.change(screen.getByLabelText("Por dia · Questões teóricas (Inep e StaziaMed)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Cotação do dólar (R$)"), { target: { value: "5,40" } });
    fireEvent.click(screen.getByText("Salvar planos por fase"));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].planos[0]).toMatchObject({ codigo: "pro", preco_mensal_centavos: 10990, preco_trimestral_centavos: 26970, creditos_dia: 8 });
    expect(saved[0].recursos).toEqual([{ codigo: "questoes", amostra_modo: "por_dia", amostra_limite: 25 }]);
    expect(saved[0].config).toMatchObject({ cadeados_ligados: false, cotacao_dolar: "5.4", credito_valor_centavos: 10 });
    expect(await screen.findByText("Planos por fase salvos.")).toBeTruthy();
  });

  it("ligar a chave mostra o aviso com quantos alunos perderiam algo; confirmar a proposta manda o recurso", async () => {
    const saved: any[] = [];
    abrir(saved);
    fireEvent.click(await screen.findByRole("switch", { name: /^Cadeados ligados/ }));
    expect(screen.getByText(/10 aluno\(s\) teriam algo trancado/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Confirmo esta amostra"));
    fireEvent.click(screen.getByText("Salvar planos por fase"));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].config.cadeados_ligados).toBe(true);
    expect(saved[0].recursos).toEqual([{ codigo: "estacoes", amostra_modo: "por_dia", amostra_limite: 1 }]);
  });

  it("recusa número errado antes de mandar e mostra o erro do banco", async () => {
    const saved: any[] = [];
    abrir(saved, "Algum número do plano PRO está fora do permitido.");
    fireEvent.change(await screen.findByLabelText("Créditos por dia · PRO"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Salvar planos por fase"));
    expect(await screen.findByText("No plano PRO, os créditos por dia não podem passar dos créditos por mês.")).toBeTruthy();
    expect(saved).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Créditos por dia · PRO"), { target: { value: "8" } });
    fireEvent.click(screen.getByText("Salvar planos por fase"));
    expect(await screen.findByText("Algum número do plano PRO está fora do permitido.")).toBeTruthy();
  });

  it("banco sem a migração: aviso discreto, sem erro", async () => {
    backend.rpc.mockRejectedValue(new Error("Could not find the function public.app_admin_direitos without parameters in the schema cache"));
    render(<PlanosPorFase />);
    expect(await screen.findByText("Ainda não estão no banco (migração 013640).")).toBeTruthy();
  });

  it("ajudantes: preço em reais e montagem", () => {
    expect(reaisParaCentavos("99,90")).toBe(9990);
    expect(reaisParaCentavos("1.299,90")).toBe(129990);
    expect(Number.isNaN(reaisParaCentavos("abc"))).toBe(true);
    const form = { config: { ...DADOS.config, amostra_creditos_dia: "5", amostra_voz_minutos_total: "2", credito_valor: "0,10", cotacao_dolar: "" }, planos: [], recursos: Object.fromEntries(DADOS.recursos.map((r) => [r.codigo, { modo: r.amostra_modo, limite: r.amostra_limite == null ? "" : String(r.amostra_limite), confirmar: false }])) };
    expect(montarSalvar(DADOS, form).dados?.recursos).toEqual([]);
    expect(montarSalvar(DADOS, { ...form, config: { ...form.config, cotacao_dolar: "90" } }).erro).toMatch(/Cotação do dólar/);
  });
});

describe("Administração › diagnóstico de um aluno", () => {
  const DIAG = {
    aluno: { id: "a", email: "aluno@teste.dev", nome: "Ana", papel: "student", assinatura: { plano: "trial", situacao: "trialing" } },
    regra_nova: {
      modo: "sombra", perfil: "teste", equipe: false,
      fases: { teoria: { situacao: "teste", motivo: "teste", aberta: true }, pratica: { situacao: "sem_acesso", motivo: "sem_acesso", aberta: false } },
      teste: { repetido_telefone: false },
      creditos: { usados_hoje: 1, franquia_dia: 5, franquia_mes: null, base: "mensagens" },
      voz: { usado_s: 30, limite_s: 120, periodo: "teste_total" },
      recursos: {
        questoes: { nome: "Questões teóricas (Inep e StaziaMed)", acesso: "amostra", amostra: { limite: 20, unidade: "questões por dia" }, mensagem: "Teste grátis: você usa uma amostra deste recurso.", ofertas: [{ tipo: "assinar", plano: "pro", nome: "PRO" }, { tipo: "assinar", plano: "elite", nome: "ELITE" }] },
        estacoes: { nome: "Estações práticas", acesso: "trancado", mensagem: "A 2ª fase ainda não está aberta aos alunos.", ofertas: [] },
      },
    },
    regra_atual: { questoes: "liberado", estacoes: "trancado" },
    diferencas: [{ recurso: "questoes", nome: "Questões teóricas (Inep e StaziaMed)", hoje: "liberado", regra_nova: "amostra" }],
  };

  it("busca por e-mail e mostra hoje × regra nova, as diferenças, o convite e o saldo", async () => {
    const pedidos: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_direitos") return DADOS;
      if (fn === "app_admin_direitos_aluno") return pedidos.push(args), DIAG;
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<PlanosPorFase />);
    fireEvent.change(await screen.findByLabelText("E-mail do aluno"), { target: { value: " aluno@teste.dev " } });
    fireEvent.click(screen.getByText("Ver direitos"));
    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(pedidos[0]).toEqual({ p_busca: "aluno@teste.dev" });
    expect(screen.getByText("Em teste grátis")).toBeTruthy();
    expect(screen.getByText("1 diferença(s) entre hoje e a regra nova")).toBeTruthy();
    const linha = screen.getByRole("table", { name: "Recursos do aluno" }).querySelector('[data-recurso="questoes"]') as HTMLElement;
    expect(within(linha).getByText("Liberado")).toBeTruthy();
    expect(within(linha).getByText("Amostra")).toBeTruthy();
    expect(within(linha).getByText("Convite: assinar PRO, assinar ELITE")).toBeTruthy();
    expect(screen.getByText(/Créditos de IA: 1\/5 hoje/)).toBeTruthy();
  });

  it("e-mail não encontrado: mostra a mensagem do banco", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_direitos") return DADOS;
      throw new Error("Nenhum usuário com esse e-mail.");
    });
    render(<PlanosPorFase />);
    fireEvent.change(await screen.findByLabelText("E-mail do aluno"), { target: { value: "x@y.z" } });
    fireEvent.click(screen.getByText("Ver direitos"));
    expect(await screen.findByText("Nenhum usuário com esse e-mail.")).toBeTruthy();
  });
});

describe("Início › chip do saldo ao lado da sequência", () => {
  const SOMBRA = { fonte: "tutor_atual", ilimitado: false, tutor_ligado: true, mensagens_hoje: 38, mensagens_limite_hoje: 40, voz_ligada: true, voz_restante_s: 610, voz_periodo: "dia" };

  it("modo sombra: mensagens do Tutor de hoje e minutos de voz (o que vale hoje)", () => {
    const m = modeloSaldo(SOMBRA)!;
    expect(m).toMatchObject({ ia: 38, iaRotulo: "mensagens", voz: 10, esgotado: false });
    expect(m.aria).toBe("Seu saldo: 38 mensagens do Tutor hoje e 10 min de voz ao vivo hoje. Abrir planos.");
    expect(modeloSaldo({ ...SOMBRA, voz_ligada: false })!.voz).toBeNull();
    expect(modeloSaldo({ ...SOMBRA, voz_periodo: "teste_total" })!.aria).toMatch(/no teste/);
  });

  it("chave ligada: créditos de hoje, do mês e a voz do mês", () => {
    const m = modeloSaldo({ fonte: "creditos", ilimitado: false, creditos_hoje: 6, creditos_limite_hoje: 8, creditos_mes: 170, creditos_limite_mes: 180, voz_restante_s: 540, voz_limite_s: 600, voz_periodo: "mes" })!;
    expect(m).toMatchObject({ ia: 6, iaRotulo: "créditos", voz: 9 });
    expect(m.detalhe).toBe("6 créditos de IA hoje · 170 no mês · 9 min de voz ao vivo no mês");
  });

  it("some sem Tutor, sem resposta ou com resposta ilegível; equipe vê IA ilimitada", () => {
    expect(modeloSaldo(null)).toBeNull();
    expect(modeloSaldo({ ...SOMBRA, tutor_ligado: false })).toBeNull();
    expect(modeloSaldo({ fonte: "outra" })).toBeNull();
    expect(modeloSaldo({ ...SOMBRA, mensagens_hoje: "x" })).toBeNull();
    expect(modeloSaldo({ fonte: "equipe", ilimitado: true })).toMatchObject({ ilimitado: true });
  });

  it("o chip lê app_my_entitlements, mostra os números e o toque abre Planos", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_my_entitlements") return { saldo: SOMBRA };
      throw new Error(`rpc inesperada: ${fn}`);
    });
    const go = vi.fn();
    render(<SaldoChip go={go} />);
    const chip = await screen.findByTestId("saldo-chip");
    expect(within(chip).getByTestId("saldo-ia").textContent).toBe("38");
    expect(within(chip).getByTestId("saldo-voz").textContent).toBe("10");
    expect(chip.getAttribute("aria-label")).toMatch(/^Seu saldo: 38 mensagens/);
    fireEvent.click(chip);
    expect(go).toHaveBeenCalledWith("planos");
  });

  it("erro do banco (função ainda não publicada): o chip não aparece", async () => {
    backend.rpc.mockRejectedValue(new Error("Could not find the function public.app_my_entitlements"));
    render(<SaldoChip go={vi.fn()} />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalled());
    expect(screen.queryByTestId("saldo-chip")).toBeNull();
  });

  it("saldo zerado fica com o tom de aviso; equipe mostra 'IA ilimitada'", () => {
    const { rerender } = render(<SaldoChipView modelo={modeloSaldo({ ...SOMBRA, mensagens_hoje: 0, voz_restante_s: 0 })} go={vi.fn()} />);
    expect(screen.getByTestId("saldo-chip").className).toContain("is-esgotado");
    rerender(<SaldoChipView modelo={modeloSaldo({ fonte: "equipe", ilimitado: true })} go={vi.fn()} />);
    expect(screen.getByText("IA ilimitada")).toBeTruthy();
  });
});
