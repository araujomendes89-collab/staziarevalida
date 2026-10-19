// @vitest-environment jsdom
/**
 * Painel do Treino em Dupla · bloco "Avaliação por IA no treino sozinho" (A5) e "Uso do mês" com o treino sozinho à parte (S8b).
 * Banco simulado (rpc): app_admin_dupla_ia, app_admin_save_dupla_ia, app_admin_dupla_usage. Textos e números de teste.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const rpc = vi.fn();
let role = "admin";
const backend = { rpc }; // estável, como o da sessão de verdade (as telas recarregam quando o backend muda)
const user = { id: "u1" };
const session = () => ({ backend, boot: { role, profile: { name: "Pessoa" } }, user });
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session() }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => <div>visao geral</div>, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null, AdminTutor: () => null }));
vi.mock("../novo/app/admin/AdminSupport.jsx", () => ({ AdminReports: () => null, AdminSupportContact: () => null }));
vi.mock("../novo/app/admin/AdminDuplaChat.jsx", () => ({ AdminDuplaChatReports: () => null, AdminDuplaChatSettings: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => <div data-testid="central-de-ias" /> }));
vi.mock("../novo/app/admin/radar/RadarFila.jsx", () => ({ RadarFila: () => null }));
vi.mock("../novo/app/admin/radar/useRadarAvisos.js", () => ({ useRadarAvisos: () => ({ graves: 0 }) }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));
vi.mock("../novo/app/admin/VoiceReactionsPanel.jsx", () => ({ VoiceReactionsPanel: () => null }));

import { AdminDupla, DuplaIA, DuplaUsage } from "../novo/app/admin/AdminDupla.jsx";
import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";

const IA_VAZIA = { aberto: false, planos: [], limite_dia: null, limite_mes: null, funcao_pronta: false, funcao_motivo: "Desligada: configure esta função na Central de IAs.", elite_libera: false };
let ia: any;
let usage: any;
let steps: Record<string, (args: any) => any>;

beforeEach(() => {
  role = "admin";
  ia = structuredClone(IA_VAZIA);
  usage = { month: "2026-10", salas: 12, rodadas_avaliadas: 9, alunos: 7, impressos_por_rodada: 1.5, sozinho: { treinos: 31, ia: 20, autoavaliacao: 11, alunos: 14, gasto_ia_usd: 0.4235 } };
  steps = {};
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: any) => {
    if (steps[fn]) return steps[fn](args);
    if (fn === "app_admin_settings") return { trial_days: 7, treino_dupla: { aberto: true, planos: ["pro"] } };
    if (fn === "app_admin_dupla_ia") return ia;
    if (fn === "app_admin_dupla_usage") return usage;
    if (fn === "app_admin_save_dupla_ia") return { aberto: args.p_config.aberto, planos: args.p_config.planos, limite_dia: args.p_config.limite_dia, limite_mes: args.p_config.limite_mes };
    return null;
  });
});
afterEach(cleanup);

const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const FRASE_BLOQUEIO = "Sem limite preenchido, a avaliação por IA fica bloqueada.";
const planoIA = (nome: string) => screen.getByRole("checkbox", { name: `${nome} — avaliação por IA` }) as HTMLInputElement;
const interruptor = () => screen.getByRole("switch", { name: "Avaliação por IA no treino sozinho" }) as HTMLInputElement;
const dia = () => screen.getByLabelText("Limite por aluno por dia") as HTMLInputElement;
const mes = () => screen.getByLabelText("Limite por aluno por mês") as HTMLInputElement;
async function abrir(props: Record<string, unknown> = {}) {
  const view = render(<DuplaIA {...props} />);
  await screen.findByLabelText("Limite por aluno por dia");
  return view;
}

describe("Bloco: Avaliação por IA no treino sozinho", () => {
  it("começa fechado, sem planos, sem limites e sem números sugeridos", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Avaliação por IA no treino sozinho" })).toBeTruthy();
    expect(interruptor().checked).toBe(false);
    for (const nome of ["Teste grátis", "Pro", "Elite"]) expect(planoIA(nome).checked).toBe(false);
    expect(dia().value).toBe("");
    expect(mes().value).toBe("");
    expect(dia().placeholder).toBe("");
    expect(mes().placeholder).toBe("");
    expect(calls("app_admin_dupla_ia")[0][1]).toEqual({});
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
  });

  it("mostra o que está gravado", async () => {
    ia = { ...ia, aberto: true, planos: ["pro", "elite"], limite_dia: 3, limite_mes: 40 };
    await abrir();
    expect(interruptor().checked).toBe(true);
    expect(planoIA("Teste grátis").checked).toBe(false);
    expect(planoIA("Pro").checked).toBe(true);
    expect(planoIA("Elite").checked).toBe(true);
    expect(dia().value).toBe("3");
    expect(mes().value).toBe("40");
    expect(screen.queryByText(FRASE_BLOQUEIO)).toBeNull();
  });

  it("salvar manda sozinha.ia completo (app_admin_save_dupla_ia) e mostra 'Configurações salvas.'", async () => {
    await abrir();
    fireEvent.click(interruptor());
    fireEvent.click(planoIA("Teste grátis"));
    fireEvent.click(planoIA("Elite"));
    fireEvent.change(dia(), { target: { value: "2" } });
    fireEvent.change(mes(), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avaliação por IA" }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
    expect(calls("app_admin_save_dupla_ia")).toHaveLength(1);
    expect(calls("app_admin_save_dupla_ia")[0][1]).toEqual({ p_config: { aberto: true, planos: ["trial", "elite"], limite_dia: 2, limite_mes: 30 } });
    // o painel do módulo (aberto e planos) não foi tocado
    expect(calls("app_admin_save_dupla")).toHaveLength(0);
    expect(interruptor().checked).toBe(true);
    expect(dia().value).toBe("2");
    // mexer de novo apaga o aviso de salvo
    fireEvent.change(mes(), { target: { value: "31" } });
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
  });

  it("limite vazio mostra a frase de bloqueio e é enviado como nulo (nunca um número inventado)", async () => {
    ia = { ...ia, aberto: true, planos: ["pro"] };
    await abrir();
    expect(screen.getByText(FRASE_BLOQUEIO)).toBeTruthy();
    fireEvent.change(dia(), { target: { value: "2" } });
    expect(screen.getByText(FRASE_BLOQUEIO)).toBeTruthy(); // falta o do mês
    fireEvent.change(mes(), { target: { value: "20" } });
    expect(screen.queryByText(FRASE_BLOQUEIO)).toBeNull();
    fireEvent.change(dia(), { target: { value: "" } });
    expect(screen.getByText(FRASE_BLOQUEIO)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar avaliação por IA" }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
    expect(calls("app_admin_save_dupla_ia")[0][1]).toEqual({ p_config: { aberto: true, planos: ["pro"], limite_dia: null, limite_mes: 20 } });
  });

  it("função pronta e função não pronta (com o motivo), com atalho para a Central de IAs", async () => {
    const abrirCentral = vi.fn();
    const view = await abrir({ onOpenIAs: abrirCentral });
    expect(screen.getByTestId("funcao-estado").textContent).toBe("Função não pronta: Desligada: configure esta função na Central de IAs.");
    fireEvent.click(screen.getByRole("button", { name: "Abrir a Central de IAs" }));
    expect(abrirCentral).toHaveBeenCalledTimes(1);
    view.unmount();

    ia = { ...ia, funcao_pronta: true, funcao_motivo: null };
    await abrir({ onOpenIAs: abrirCentral });
    expect(screen.getByTestId("funcao-estado").textContent).toBe("Função pronta");
  });

  it("sem o atalho da tela, o botão não aparece; sem motivo, diz só 'Função não pronta'", async () => {
    ia = { ...ia, funcao_motivo: null };
    await abrir();
    expect(screen.queryByRole("button", { name: "Abrir a Central de IAs" })).toBeNull();
    expect(screen.getByTestId("funcao-estado").textContent).toBe("Função não pronta");
  });

  it("a linha do benefício Elite só aparece quando o benefício libera a IA", async () => {
    const LINHA = "O benefício Elite “correção de estação com devolutiva” também libera a avaliação por IA.";
    const view = await abrir();
    expect(screen.queryByText(LINHA)).toBeNull();
    view.unmount();
    ia = { ...ia, elite_libera: true };
    await abrir();
    expect(screen.getByText(LINHA)).toBeTruthy();
  });

  it("erro de limite inválido do servidor aparece em português e não quebra a tela", async () => {
    await abrir();
    steps.app_admin_save_dupla_ia = () => {
      throw new Error("Limites inválidos: use números inteiros de 1 em diante, com o do mês maior ou igual ao do dia.");
    };
    fireEvent.change(dia(), { target: { value: "5000" } });
    fireEvent.change(mes(), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avaliação por IA" }));
    expect(await screen.findByText("Limites inválidos: use números inteiros de 1 em diante, com o do mês maior ou igual ao do dia.")).toBeTruthy();
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
    // a tela segue inteira e o que foi digitado continua lá
    expect(dia().value).toBe("5000");
    expect(mes().value).toBe("20");
    expect((screen.getByRole("button", { name: "Salvar avaliação por IA" }) as HTMLButtonElement).disabled).toBe(false);
    // corrigido, salva
    steps.app_admin_save_dupla_ia = (args) => args.p_config;
    fireEvent.change(dia(), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avaliação por IA" }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
    expect(screen.queryByText(/Limites inválidos/)).toBeNull();
  });

  it("número que não é inteiro nem chega ao banco: o aviso aparece na hora", async () => {
    await abrir();
    fireEvent.change(dia(), { target: { value: "1.5" } });
    fireEvent.change(mes(), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avaliação por IA" }));
    expect(await screen.findByText(/Limites inválidos: use números inteiros de 1 em diante/)).toBeTruthy();
    expect(calls("app_admin_save_dupla_ia")).toHaveLength(0);
  });

  it("falha ao carregar mostra o erro com 'Tentar de novo' e o resto da tela segue", async () => {
    steps.app_admin_dupla_ia = () => {
      throw new Error("Acesso restrito à equipe.");
    };
    render(<DuplaIA />);
    expect(await screen.findByText("Acesso restrito à equipe.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(screen.queryByLabelText("Limite por aluno por dia")).toBeNull();
  });
});

describe("Uso do mês: a dupla como estava e o treino sozinho à parte", () => {
  it("os quatro números da dupla seguem intactos e as quatro linhas do sozinho aparecem separadas", async () => {
    render(<DuplaUsage />);
    expect(await screen.findByText("Uso do mês")).toBeTruthy();
    expect(calls("app_admin_dupla_usage")[0][1]).toEqual({});
    for (const [rotulo, valor] of [["Salas", "12"], ["Rodadas avaliadas", "9"], ["Alunos que treinaram", "7"], ["Impressos por rodada", "1,5"]]) {
      expect(screen.getByText(rotulo)).toBeTruthy();
      expect(screen.getByText(valor)).toBeTruthy();
    }
    const sozinho = screen.getByTestId("uso-sozinho");
    for (const [rotulo, valor] of [["Treinos sozinhos", "31"], ["Avaliações por IA", "20"], ["Autoavaliações", "11"], ["Gasto com IA do treino", "US$ 0,4235"]]) {
      expect(within(sozinho).getByText(rotulo)).toBeTruthy();
      expect(within(sozinho).getByText(valor)).toBeTruthy();
    }
    // separados: nenhum rótulo do sozinho entra no bloco da dupla e vice-versa
    for (const rotulo of ["Salas", "Rodadas avaliadas", "Alunos que treinaram", "Impressos por rodada"]) expect(within(sozinho).queryByText(rotulo)).toBeNull();
    // o bloco do sozinho vem DEPOIS dos números da dupla
    expect(screen.getByText("Impressos por rodada").compareDocumentPosition(sozinho) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem dado do sozinho (banco antigo, mês vazio ou sem preço) aparece '—', nunca zero inventado", async () => {
    usage = { month: "2026-10", salas: 0, rodadas_avaliadas: 0, alunos: 0, impressos_por_rodada: null };
    const view = render(<DuplaUsage />);
    await screen.findByText("Uso do mês");
    const sozinho = screen.getByTestId("uso-sozinho");
    expect(within(sozinho).getAllByText("—")).toHaveLength(4);
    // a dupla mostra os zeros reais e o '—' do que não tem dado
    expect(screen.getAllByText("0")).toHaveLength(3);
    view.unmount();

    usage = { month: "2026-10", salas: 1, rodadas_avaliadas: 1, alunos: 1, impressos_por_rodada: 2, sozinho: { treinos: 0, ia: 0, autoavaliacao: 0, alunos: 0, gasto_ia_usd: null } };
    render(<DuplaUsage />);
    await screen.findByText("Uso do mês");
    const s2 = screen.getByTestId("uso-sozinho");
    expect(within(s2).getAllByText("0")).toHaveLength(3);
    expect(within(s2).getByText("—")).toBeTruthy();
  });

  it("gasto zero com treinos aparece como 'US$ 0' (formato da Central de IAs)", async () => {
    usage = { ...usage, sozinho: { treinos: 2, ia: 0, autoavaliacao: 2, alunos: 2, gasto_ia_usd: 0 } };
    render(<DuplaUsage />);
    await screen.findByText("Uso do mês");
    expect(within(screen.getByTestId("uso-sozinho")).getByText("US$ 0")).toBeTruthy();
  });
});

describe("Painel completo e quem o vê", () => {
  const configuracoes = (aba = "config") => (
    <MemoryRouter initialEntries={[`/admin?aba=${aba}`]}>
      <AdminScreen />
    </MemoryRouter>
  );

  it("Configurações do administrador: bloco do módulo, bloco da IA e Uso do mês, nesta ordem, e o atalho abre a Central de IAs", async () => {
    render(configuracoes());
    expect(await screen.findByText("Treinamento em Dupla")).toBeTruthy();
    expect(await screen.findByText("Uso do mês")).toBeTruthy();
    const modulo = screen.getByRole("heading", { name: "Treinamento em Dupla" });
    const bloco = await screen.findByRole("heading", { name: "Avaliação por IA no treino sozinho" });
    const uso = screen.getByRole("heading", { name: "Uso do mês" });
    expect(modulo.compareDocumentPosition(bloco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bloco.compareDocumentPosition(uso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // o bloco de aberto e planos do módulo segue igual
    expect(screen.getByRole("switch", { name: /Abrir para os alunos/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Pro" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a Central de IAs" }));
    expect(await screen.findByTestId("central-de-ias")).toBeTruthy();
  });

  it("salvar o bloco do módulo continua mandando só aberto e planos", async () => {
    render(<AdminDupla />);
    await screen.findByText("Uso do mês");
    fireEvent.click(screen.getByRole("switch", { name: /Abrir para os alunos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
    expect(calls("app_admin_save_dupla")[0][1]).toEqual({ p_aberto: false, p_planos: ["pro"] });
    expect(calls("app_admin_save_dupla_ia")).toHaveLength(0);
  });

  it("editor e aluno não veem o bloco nem leem a configuração da IA (a aba Configurações é só do administrador)", async () => {
    for (const papel of ["editor", "student"]) {
      role = papel;
      rpc.mockClear();
      const view = render(configuracoes());
      await waitFor(() => expect(screen.getByRole("tablist", { name: "Administração" })).toBeTruthy());
      expect(screen.queryByRole("tab", { name: "Configurações" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Avaliação por IA no treino sozinho" })).toBeNull();
      expect(screen.queryByLabelText("Limite por aluno por dia")).toBeNull();
      expect(screen.queryByText("Uso do mês")).toBeNull();
      expect(calls("app_admin_dupla_ia")).toHaveLength(0);
      expect(calls("app_admin_save_dupla_ia")).toHaveLength(0);
      view.unmount();
    }
  });
});
