/**
 * Treinamento em Dupla · Créditos da Administração (tela, jsdom). O banco é simulado pelo contrato da migração 013530:
 * app_admin_credit_config, app_admin_save_credit_config, app_admin_credit_today, app_admin_users, app_admin_credit_grant,
 * app_admin_credit_statement, app_admin_credit_refund e app_admin_credit_reconcile. Pessoas e números de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" }, user: { id: "adm" } }) }));

import { AdminCreditos } from "../novo/app/admin/AdminCreditos.jsx";

const rpc: ReturnType<typeof vi.fn> = backend.rpc;
const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);

const CFG_VAZIA = { ativa: false, match: { cobra_rodada_extra: false }, ia: {} };
const ANA = { id: "u-ana", name: "Ana Souza", email: "ana@teste.dev" };
const BRUNO = { id: "u-bruno", name: "Bruno Lima", email: "bruno@teste.dev" };
const HOJE = "2026-10-17";

const row = (o: Record<string, any>) => ({
  id: 1, day: HOJE, kind: "consume", bucket: "daily", amount: 1, ref_type: "study_room", ref_id: "r1", reverses_id: null, reason: null,
  created_by: null, created_at: "2026-10-17T15:00:00Z", estornado: false, idem_key: "chave-secreta-nao-mostrar", ...o,
});
function statement(ledger: any[], extra: Record<string, any> = {}) {
  return {
    user: { id: ANA.id, name: ANA.name, email: ANA.email },
    pool: "match",
    dias: 30,
    state: { ativa: true, ilimitado: false, limite_dia: 5, usados_hoje: 2, bonus: 3, comprados: 0, disponivel: 6 },
    ledger,
    cobrancas: [{ room_id: "sala-1", round: 2, bucket: "bonus", usage_date: "2026-10-16", ledger_id: 9, created_at: "2026-10-16T12:00:00Z" }],
    ...extra,
  };
}

/** Servidor simulado; cada função pode ser trocada por teste. */
let srv: Record<string, (args: any) => any>;
beforeEach(() => {
  rpc.mockReset();
  srv = {
    app_admin_credit_config: () => CFG_VAZIA,
    app_admin_save_credit_config: (a) => a.p_config,
    app_admin_credit_today: () => ({ day: HOJE, ativa: false, match: { creditos: 4, alunos: 3, salas: 2 }, ia: { creditos: 0, alunos: 0 } }),
    app_admin_users: (a) => ({ total: 2, items: [ANA, BRUNO].filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(String(a.p_search).toLowerCase())) }),
    app_admin_credit_grant: () => ({ already: false, ledger_id: 50, bucket: "bonus" }),
    app_admin_credit_statement: () => statement([]),
    app_admin_credit_refund: () => ({ already: false, ledger_id: 60, bucket: "daily", same_day: false, compensacao: null }),
    app_admin_credit_reconcile: () => ({ pool: "match", ok: true, total: 0, problemas: [] }),
  };
  rpc.mockImplementation(async (fn: string, args: any) => {
    if (!srv[fn]) throw new Error(`rpc inesperada: ${fn}`);
    return srv[fn](args);
  });
});
afterEach(() => cleanup());

const sw = (name: string) => screen.getByRole("switch", { name });
async function mount() {
  render(<AdminCreditos />);
  await screen.findByRole("switch", { name: "Cota diária de matches" });
}
async function pickStudent(search = "ana", name = ANA.name) {
  fireEvent.change(screen.getByLabelText("Buscar aluno"), { target: { value: search } });
  fireEvent.click(await screen.findByRole("button", { name: `Escolher ${name}` }));
}
/** O card (pelo título) onde o teste mexe, para não confundir os dois seletores de aluno. */
const card = (title: string) => screen.getByRole("heading", { name: title }).closest(".sm-card") as HTMLElement;

describe("Créditos · configuração", () => {
  it("carrega tudo vazio e desligado, com o aviso e a ordem do documento", async () => {
    await mount();
    expect(screen.getByRole("heading", { name: "Créditos" })).toBeTruthy();
    expect(sw("Cota diária de matches")).not.toBeChecked();
    expect(sw("Treinar outra estação gasta crédito")).not.toBeChecked();
    for (const plan of ["Teste grátis", "Pro", "Elite"]) expect(screen.getByLabelText(plan)).toHaveValue("");
    expect(screen.getByText("Plano sem número fica sem crédito quando a cota estiver ligada.")).toBeTruthy();
    expect(screen.getByText(/Ordem de débito: diária, bônus, comprados/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar configurações de créditos" })).toBeTruthy();
    expect(screen.queryByText("Configurações de créditos salvas.")).toBeNull();
  });

  it("mostra o que o banco já tem gravado", async () => {
    srv.app_admin_credit_config = () => ({ ativa: true, match: { trial: 0, pro: 5, cobra_rodada_extra: true, ordem: ["bonus", "daily", "purchased"] }, ia: {} });
    await mount();
    await waitFor(() => expect(sw("Cota diária de matches")).toBeChecked());
    expect(screen.getByLabelText("Teste grátis")).toHaveValue("0");
    expect(screen.getByLabelText("Pro")).toHaveValue("5");
    expect(screen.getByLabelText("Elite")).toHaveValue("");
    expect(sw("Treinar outra estação gasta crédito")).toBeChecked();
    expect(screen.getByText(/Ordem de débito: bônus, diária, comprados/)).toBeTruthy();
  });

  it("ligar sem plano mostra o erro do servidor", async () => {
    srv.app_admin_save_credit_config = () => {
      throw new Error("Preencha ao menos um plano antes de ligar a cota.");
    };
    await mount();
    fireEvent.click(sw("Cota diária de matches"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações de créditos" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Preencha ao menos um plano antes de ligar a cota.");
    expect(screen.queryByText("Configurações de créditos salvas.")).toBeNull();
  });

  it("salvar sem mexer em nada envia tudo vazio como null e a cota desligada", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações de créditos" }));
    expect(await screen.findByText("Configurações de créditos salvas.")).toBeTruthy();
    expect(calls("app_admin_save_credit_config")).toEqual([
      ["app_admin_save_credit_config", { p_config: { ativa: false, match: { trial: null, pro: null, elite: null, cobra_rodada_extra: false }, ia: {} } }],
    ]);
  });

  it("salva exatamente o objeto esperado (vazio = null) e devolve a moeda ia e a ordem como vieram", async () => {
    srv.app_admin_credit_config = () => ({ ativa: false, match: { cobra_rodada_extra: false, ordem: ["daily", "bonus", "purchased"] }, ia: { pro: 7, pesos: { a: 1 } } });
    await mount();
    fireEvent.change(screen.getByLabelText("Pro"), { target: { value: " 12 " } });
    fireEvent.change(screen.getByLabelText("Elite"), { target: { value: "0" } });
    fireEvent.click(sw("Cota diária de matches"));
    fireEvent.click(sw("Treinar outra estação gasta crédito"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações de créditos" }));
    expect(await screen.findByText("Configurações de créditos salvas.")).toBeTruthy();
    expect(calls("app_admin_save_credit_config")).toEqual([
      [
        "app_admin_save_credit_config",
        {
          p_config: {
            ativa: true,
            match: { trial: null, pro: 12, elite: 0, cobra_rodada_extra: true, ordem: ["daily", "bonus", "purchased"] },
            ia: { pro: 7, pesos: { a: 1 } },
          },
        },
      ],
    ]);
    // O que o servidor devolve vira o formulário.
    expect(screen.getByLabelText("Pro")).toHaveValue("12");
    expect(screen.getByLabelText("Teste grátis")).toHaveValue("");
  });

  it("número inválido (negativo, decimal, texto, grande demais) não envia e avisa no campo", async () => {
    await mount();
    for (const bad of ["-1", "1.5", "1,5", "abc", "100001"]) {
      fireEvent.change(screen.getByLabelText("Pro"), { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar configurações de créditos" }));
      expect(await screen.findByText("Use um número inteiro de 0 a 100000 ou deixe vazio.")).toBeTruthy();
      expect(screen.getByLabelText("Pro")).toHaveAttribute("aria-invalid", "true");
    }
    expect(calls("app_admin_save_credit_config")).toHaveLength(0);
    // Corrigir tira o aviso e libera o envio.
    fireEvent.change(screen.getByLabelText("Pro"), { target: { value: "3" } });
    expect(screen.queryByText("Use um número inteiro de 0 a 100000 ou deixe vazio.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações de créditos" }));
    await waitFor(() => expect(calls("app_admin_save_credit_config")).toHaveLength(1));
  });
});

describe("Créditos · uso de hoje", () => {
  it("mostra créditos, alunos e salas", async () => {
    await mount();
    const today = card("Uso de hoje");
    expect(await within(today).findByText("Créditos de matches usados")).toBeTruthy();
    expect(within(today).getByText("4")).toBeTruthy();
    expect(within(today).getByText("3")).toBeTruthy();
    expect(within(today).getByText("2")).toBeTruthy();
  });

  it("sem dado mostra traço", async () => {
    srv.app_admin_credit_today = () => ({ day: HOJE, match: {} });
    await mount();
    const today = card("Uso de hoje");
    await waitFor(() => expect(within(today).getAllByText("—")).toHaveLength(3));
  });
});

describe("Créditos · conceder", () => {
  async function fillGrant(qty = "5", reason = "Instabilidade no dia 16") {
    const grant = card("Conceder créditos");
    fireEvent.change(within(grant).getByLabelText("Buscar aluno"), { target: { value: "ana" } });
    fireEvent.click(await within(grant).findByRole("button", { name: "Escolher Ana Souza" }));
    fireEvent.change(within(grant).getByLabelText("Quantidade"), { target: { value: qty } });
    fireEvent.change(within(grant).getByLabelText("Motivo"), { target: { value: reason } });
    return grant;
  }

  it("busca por nome ou e-mail e mostra nome e e-mail do aluno", async () => {
    await mount();
    const grant = card("Conceder créditos");
    fireEvent.change(within(grant).getByLabelText("Buscar aluno"), { target: { value: "bruno@" } });
    const option = await within(grant).findByRole("button", { name: "Escolher Bruno Lima" });
    expect(option.textContent).toContain("Bruno Lima");
    expect(option.textContent).toContain("bruno@teste.dev");
    expect(within(grant).queryByText("Ana Souza")).toBeNull();
    expect(calls("app_admin_users")[0][1]).toMatchObject({ p_search: "bruno@", p_limit: 8, p_offset: 0 });
    expect(within(grant).getByText("A concessão entra como bônus e o motivo aparece no extrato do aluno.")).toBeTruthy();
  });

  it("concede com a chave única; duplo clique não concede duas vezes", async () => {
    let release: (v: any) => void = () => {};
    srv.app_admin_credit_grant = () => new Promise((resolve) => (release = resolve));
    await mount();
    const grant = await fillGrant();
    const button = within(grant).getByRole("button", { name: "Conceder créditos" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(grant.closest("form") as HTMLFormElement);
    await waitFor(() => expect(calls("app_admin_credit_grant")).toHaveLength(1));
    const args = calls("app_admin_credit_grant")[0][1];
    expect(args).toMatchObject({ p_user: "u-ana", p_pool: "match", p_n: 5, p_reason: "Instabilidade no dia 16" });
    expect(args.p_key).toMatch(/^[0-9a-f-]{36}$/);
    release({ already: false, ledger_id: 50, bucket: "bonus" });
    expect(await within(grant).findByText("Créditos concedidos.")).toBeTruthy();
    expect(calls("app_admin_credit_grant")).toHaveLength(1);
    // Depois do sucesso a quantidade e o motivo esvaziam, e o próximo envio usa outra chave.
    expect(within(grant).getByLabelText("Quantidade")).toHaveValue("");
    fireEvent.change(within(grant).getByLabelText("Quantidade"), { target: { value: "2" } });
    fireEvent.change(within(grant).getByLabelText("Motivo"), { target: { value: "Outro motivo" } });
    srv.app_admin_credit_grant = () => ({ already: false, ledger_id: 51, bucket: "bonus" });
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    await waitFor(() => expect(calls("app_admin_credit_grant")).toHaveLength(2));
    expect(calls("app_admin_credit_grant")[1][1].p_key).not.toBe(args.p_key);
  });

  it("depois de um erro, tentar de novo o mesmo pedido repete a mesma chave; mudar o pedido troca a chave", async () => {
    let fail = true;
    srv.app_admin_credit_grant = () => {
      if (fail) throw new Error("Aluno não encontrado.");
      return { already: false, ledger_id: 52, bucket: "bonus" };
    };
    await mount();
    const grant = await fillGrant();
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    expect((await within(grant).findByRole("alert")).textContent).toContain("Aluno não encontrado.");
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    await waitFor(() => expect(calls("app_admin_credit_grant")).toHaveLength(2));
    const [a, b] = calls("app_admin_credit_grant").map((c) => c[1].p_key);
    expect(a).toBe(b);
    fireEvent.change(within(grant).getByLabelText("Quantidade"), { target: { value: "6" } });
    fail = false;
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    await waitFor(() => expect(calls("app_admin_credit_grant")).toHaveLength(3));
    expect(calls("app_admin_credit_grant")[2][1].p_key).not.toBe(a);
  });

  it("exige aluno, quantidade válida e motivo", async () => {
    await mount();
    const grant = card("Conceder créditos");
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    expect(await within(grant).findByText("Escolha o aluno.")).toBeTruthy();
    expect(within(grant).getByText("Diga o motivo da concessão.")).toBeTruthy();
    expect(within(grant).getByText("Use um número inteiro de 1 a 10000.")).toBeTruthy();
    await fillGrant("0", "   ");
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    expect(await within(grant).findByText("Diga o motivo da concessão.")).toBeTruthy();
    expect(within(grant).getByText("Use um número inteiro de 1 a 10000.")).toBeTruthy();
    expect(calls("app_admin_credit_grant")).toHaveLength(0);
  });
});

describe("Créditos · extrato e estorno", () => {
  const LEDGER = [
    row({ id: 10, kind: "consume", bucket: "daily", day: HOJE, amount: 1 }),
    row({ id: 9, kind: "consume", bucket: "daily", day: "2026-10-15", amount: 2, created_at: "2026-10-15T15:00:00Z" }),
    row({ id: 8, kind: "consume", bucket: "bonus", day: HOJE, amount: 1, estornado: true }),
    row({ id: 7, kind: "refund", bucket: "bonus", day: HOJE, amount: 1, reverses_id: 8, reason: "Sala caiu" }),
    row({ id: 6, kind: "grant", bucket: "bonus", day: HOJE, amount: 5, reason: "Instabilidade", ref_type: null, ref_id: null }),
    row({ id: 5, kind: "purchase", bucket: "purchased", amount: 4 }),
    row({ id: 4, kind: "revoke", bucket: "bonus", amount: 1 }),
    row({ id: 3, kind: "adjust", bucket: "bonus", amount: -2 }),
  ];
  async function openStatement(ledger = LEDGER) {
    srv.app_admin_credit_statement = () => statement(ledger);
    await mount();
    const st = card("Extrato do aluno");
    fireEvent.change(within(st).getByLabelText("Buscar aluno"), { target: { value: "ana" } });
    fireEvent.click(await within(st).findByRole("button", { name: "Escolher Ana Souza" }));
    await within(st).findByText("Cobranças das salas");
    return st;
  }

  it("pede 30 dias por padrão e mostra o estado, os lançamentos em português e as cobranças das salas", async () => {
    const st = await openStatement();
    expect(calls("app_admin_credit_statement")[0][1]).toEqual({ p_user: "u-ana", p_pool: "match", p_days: 30 });
    expect(within(st).getByText("Cota do dia").parentElement?.textContent).toContain("2 de 5");
    expect(within(st).getAllByText("Bônus")[0].parentElement?.textContent).toContain("3");
    expect(within(st).getAllByText("Comprados")[0].parentElement?.textContent).toContain("0");
    const table = within(st).getByRole("table", { name: "Lançamentos" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(LEDGER.length);
    const text = rows.map((r) => r.textContent ?? "");
    expect(text[0]).toContain("Consumo");
    expect(text[0]).toContain("Diária");
    expect(text[0]).toContain("−1");
    expect(text[3]).toContain("Estorno");
    expect(text[3]).toContain("+1");
    expect(text[3]).toContain("Sala caiu");
    expect(text[4]).toContain("Concessão");
    expect(text[4]).toContain("Instabilidade");
    expect(text[5]).toContain("Compra");
    expect(text[5]).toContain("Comprados");
    expect(text[6]).toContain("Revogação");
    expect(text[7]).toContain("Ajuste");
    expect(text[7]).toContain("-2");
    const charges = within(st).getByRole("table", { name: "Cobranças das salas" });
    expect(charges.textContent).toContain("16/10/2026");
    expect(charges.textContent).toContain("Bônus");
  });

  it("troca o período e pede de novo", async () => {
    const st = await openStatement();
    fireEvent.change(within(st).getByLabelText("Período"), { target: { value: "90" } });
    await waitFor(() => expect(calls("app_admin_credit_statement")).toHaveLength(2));
    expect(calls("app_admin_credit_statement")[1][1]).toEqual({ p_user: "u-ana", p_pool: "match", p_days: 90 });
  });

  it("Estornar só aparece nos consumos ainda não estornados; o já estornado mostra Estornado", async () => {
    const st = await openStatement();
    expect(within(st).getAllByRole("button", { name: "Estornar" })).toHaveLength(2);
    expect(within(st).getAllByText("Estornado")).toHaveLength(1);
    const rows = within(within(st).getByRole("table", { name: "Lançamentos" })).getAllByRole("row").slice(1);
    expect(within(rows[2]).queryByRole("button", { name: "Estornar" })).toBeNull();
    expect(within(rows[2]).getByText("Estornado")).toBeTruthy();
    for (const i of [3, 4, 5, 6, 7]) expect(within(rows[i]).queryByRole("button", { name: "Estornar" })).toBeNull();
  });

  it("estorno pede motivo; compensar só aparece no diário de dia passado", async () => {
    const st = await openStatement();
    const [hoje, passado] = within(st).getAllByRole("button", { name: "Estornar" });
    // Diário de hoje: sem a opção de compensar.
    fireEvent.click(hoje);
    expect(within(st).queryByRole("checkbox", { name: "Compensar com bônus" })).toBeNull();
    fireEvent.click(within(st).getByRole("button", { name: "Confirmar estorno" }));
    expect(await within(st).findByText("Diga o motivo do estorno.")).toBeTruthy();
    expect(calls("app_admin_credit_refund")).toHaveLength(0);
    fireEvent.click(within(st).getByRole("button", { name: "Cancelar" }));
    // Diário de dia que já passou: a opção aparece.
    fireEvent.click(within(st).getAllByRole("button", { name: "Estornar" })[1]);
    expect(passado).toBeTruthy();
    fireEvent.click(within(st).getByRole("checkbox", { name: "Compensar com bônus" }));
    fireEvent.change(within(st).getByLabelText("Motivo do estorno"), { target: { value: "Sala não abriu" } });
    fireEvent.click(within(st).getByRole("button", { name: "Confirmar estorno" }));
    await waitFor(() => expect(calls("app_admin_credit_refund")).toHaveLength(1));
    expect(calls("app_admin_credit_refund")[0][1]).toEqual({ p_ledger_id: 9, p_reason: "Sala não abriu", p_compensar: true });
    // O extrato é lido de novo.
    await waitFor(() => expect(calls("app_admin_credit_statement")).toHaveLength(2));
    expect(await within(st).findByText("Estorno feito.")).toBeTruthy();
  });

  it("consumo de bônus estornado não oferece compensação e envia p_compensar falso", async () => {
    const st = await openStatement([row({ id: 20, kind: "consume", bucket: "bonus", day: "2026-10-01" })]);
    fireEvent.click(within(st).getByRole("button", { name: "Estornar" }));
    expect(within(st).queryByRole("checkbox", { name: "Compensar com bônus" })).toBeNull();
    fireEvent.change(within(st).getByLabelText("Motivo do estorno"), { target: { value: "Erro nosso" } });
    fireEvent.click(within(st).getByRole("button", { name: "Confirmar estorno" }));
    await waitFor(() => expect(calls("app_admin_credit_refund")).toHaveLength(1));
    expect(calls("app_admin_credit_refund")[0][1]).toEqual({ p_ledger_id: 20, p_reason: "Erro nosso", p_compensar: false });
  });

  it("erro do servidor no estorno aparece e o formulário continua aberto", async () => {
    srv.app_admin_credit_refund = () => {
      throw new Error("Lançamento não encontrado.");
    };
    const st = await openStatement();
    fireEvent.click(within(st).getAllByRole("button", { name: "Estornar" })[0]);
    fireEvent.change(within(st).getByLabelText("Motivo do estorno"), { target: { value: "Teste" } });
    fireEvent.click(within(st).getByRole("button", { name: "Confirmar estorno" }));
    expect((await within(st).findByRole("alert")).textContent).toContain("Lançamento não encontrado.");
    expect(within(st).getByLabelText("Motivo do estorno")).toBeTruthy();
  });

  it("extrato vazio e cota desligada", async () => {
    srv.app_admin_credit_statement = () => statement([], { cobrancas: [], state: { ativa: false, ilimitado: false, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null } });
    await mount();
    const st = card("Extrato do aluno");
    fireEvent.change(within(st).getByLabelText("Buscar aluno"), { target: { value: "ana" } });
    fireEvent.click(await within(st).findByRole("button", { name: "Escolher Ana Souza" }));
    expect(await within(st).findByText("Nenhum lançamento neste período.")).toBeTruthy();
    expect(within(st).getByText("Cota desligada")).toBeTruthy();
    expect(within(st).getByText("Nenhuma cobrança de sala neste período.")).toBeTruthy();
  });

  it("depois de conceder, o extrato do mesmo aluno é lido de novo", async () => {
    const st = await openStatement([]);
    const grant = card("Conceder créditos");
    fireEvent.change(within(grant).getByLabelText("Buscar aluno"), { target: { value: "ana" } });
    fireEvent.click(await within(grant).findByRole("button", { name: "Escolher Ana Souza" }));
    fireEvent.change(within(grant).getByLabelText("Quantidade"), { target: { value: "1" } });
    fireEvent.change(within(grant).getByLabelText("Motivo"), { target: { value: "Cortesia" } });
    fireEvent.click(within(grant).getByRole("button", { name: "Conceder créditos" }));
    await waitFor(() => expect(calls("app_admin_credit_statement")).toHaveLength(2));
    expect(st).toBeTruthy();
  });
});

describe("Créditos · conferir saldos", () => {
  it("tudo certo", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Conferir saldos" }));
    expect(await screen.findByText("Tudo certo.")).toBeTruthy();
    expect(calls("app_admin_credit_reconcile")).toEqual([["app_admin_credit_reconcile", { p_pool: "match" }]]);
  });

  it("mostra a quantidade e a lista de problemas", async () => {
    srv.app_admin_credit_reconcile = () => ({
      pool: "match",
      ok: false,
      total: 2,
      problemas: [
        { tipo: "uso_do_dia", user_id: "u-ana", day: "2026-10-16", no_resumo: 3, no_livro: 2 },
        { tipo: "cobranca_sem_lancamento", room_id: "sala-9", user_id: "u-bruno", round: 1 },
      ],
    });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Conferir saldos" }));
    expect(await screen.findByText("2 problemas encontrados")).toBeTruthy();
    expect(screen.queryByText("Tudo certo.")).toBeNull();
    const items = within(screen.getByRole("list", { name: "Problemas encontrados" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Uso do dia diferente do livro");
    expect(items[0].textContent).toContain("u-ana");
    expect(items[0].textContent).toContain("16/10/2026");
    expect(items[0].textContent).toContain("no resumo 3");
    expect(items[0].textContent).toContain("no livro 2");
    expect(items[1].textContent).toContain("Cobrança de sala sem lançamento");
    expect(items[1].textContent).toContain("sala-9");
  });

  it("um problema só, e erro do servidor", async () => {
    srv.app_admin_credit_reconcile = () => ({ pool: "match", ok: false, total: 1, problemas: [{ tipo: "saldo_bonus", user_id: "u-ana", no_resumo: 5, no_livro: 4 }] });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Conferir saldos" }));
    expect(await screen.findByText("1 problema encontrado")).toBeTruthy();
    cleanup();
    srv.app_admin_credit_reconcile = () => {
      throw new Error("Moeda inválida.");
    };
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Conferir saldos" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Moeda inválida.");
  });
});

describe("Créditos · segurança da tela", () => {
  it("nenhuma tela mostra a chave de repetição (idem_key)", async () => {
    srv.app_admin_credit_statement = () => statement([row({ id: 1 }), row({ id: 2, kind: "grant", bucket: "bonus", reason: "Cortesia" })]);
    await mount();
    const st = card("Extrato do aluno");
    fireEvent.change(within(st).getByLabelText("Buscar aluno"), { target: { value: "ana" } });
    fireEvent.click(await within(st).findByRole("button", { name: "Escolher Ana Souza" }));
    await within(st).findByRole("table", { name: "Lançamentos" });
    fireEvent.click(within(st).getByRole("button", { name: "Estornar" }));
    expect(document.body.textContent).not.toMatch(/idem_key|chave-secreta-nao-mostrar|admin-grant:/);
    expect(document.body.innerHTML).not.toContain("chave-secreta-nao-mostrar");
  });

  it("não chama nenhuma função do banco por conta própria além de ler (nada grava ao abrir)", async () => {
    await mount();
    const writers = ["app_admin_save_credit_config", "app_admin_credit_grant", "app_admin_credit_refund", "app_admin_credit_reconcile", "app_admin_credit_statement"];
    for (const fn of writers) expect(calls(fn)).toHaveLength(0);
  });
});
