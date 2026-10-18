/**
 * Treinamento em Dupla · etapa 3 · tarefa 8 (atualizado na tarefa 13): tela Praticar com o baralho vazio (jsdom, banco simulado
 * pelo contrato: app_dupla_profile, app_dupla_save_profile, app_dupla_stations, app_dupla_deck, app_dupla_heartbeat e
 * app_dupla_invites). O baralho com colegas, o "Deu match!" e os convites ficam em duplaMatchTela.test.tsx.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u1" } }) }));

import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";

const PROFILE = {
  public_name: "Maria Souza", school: "UFPR", city: "Curitiba · PR", goal: "Treinar GO", exam: "2026/2", bio: "",
  areas: ["GO"], role_pref: "med", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"],
  radar_visible: true, show_school: true, show_stats: true,
};
const STATIONS = [
  { id: "teste-inep2020-e03", name: "Cefaleia na gestante", number: 3, area: "Ginecologia e Obstetrícia", area_code: "GO" },
  { id: "teste-inep2020-e04", name: "Dor torácica", number: 4, area: "Clínica Médica", area_code: "CM" },
];
let loaded: any;
let go: any;

function Where() {
  const l = useLocation();
  return <div data-testid="onde">{l.pathname + l.search}</div>;
}
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
async function open(url = "/dupla") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <PracticeScreen go={go} />
      <Where />
    </MemoryRouter>,
  );
  await screen.findByText("Como a compatibilidade é calculada");
}

beforeEach(() => {
  go = vi.fn();
  loaded = { profile: PROFILE, defaults: null, stats: { done: 0, avg: null } };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_profile") return loaded;
    if (fn === "app_dupla_save_profile") return { ...loaded, profile: { ...loaded.profile, ...args.p_profile } };
    if (fn === "app_dupla_stations") return STATIONS;
    if (fn === "app_dupla_deck") return { cards: [], hidden_by_role: 0, online: 0, matches_today: 0, open_room: null, server_now: new Date().toISOString() };
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: [], server_now: new Date().toISOString() };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Praticar (baralho vazio)", () => {
  it("primeira linha com a frase do protótipo e o botão 'Meu perfil de estudo'", async () => {
    await open();
    expect(screen.getByText("Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Meu perfil de estudo" })[0]);
    expect(go).toHaveBeenCalledWith("dupla-perfil");
  });

  it("sem perfil: pede para criar e leva ao perfil", async () => {
    loaded = { profile: null, defaults: { public_name: "Maria", exam: null }, stats: { done: 0, avg: null } };
    await open();
    expect(screen.getByText("Encontrar dupla")).toBeTruthy();
    expect(screen.getAllByText("Os seus dados vêm do perfil de estudo.").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("radiogroup", { name: "Papel desejado" })).toBeNull();
    expect(screen.queryByText("Nenhum colega compatível agora")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Meu perfil de estudo" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(go).toHaveBeenCalledWith("dupla-perfil");
  });

  it("com perfil: painel 'Encontrar dupla' com o seletor de papel no valor do perfil", async () => {
    await open();
    expect(screen.getByText("Encontrar dupla")).toBeTruthy();
    // decisão do dono (12/10): o texto do arraste volta com o baralho (Etapa 4)
    expect(screen.getByText(/Arraste para a direita para estudar junto, para a esquerda para pular\./)).toBeTruthy();
    const group = screen.getByRole("radiogroup", { name: "Papel desejado" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Qualquer papel", "Quero ser médico", "Quero ser ator/avaliador"]);
    expect(within(group).getByRole("radio", { name: "Quero ser médico" }).getAttribute("aria-checked")).toBe("true");
  });

  it("seletor de papel grava role_pref", async () => {
    await open();
    fireEvent.click(screen.getByRole("radio", { name: "Quero ser ator/avaliador" }));
    await waitFor(() => expect(rpcCalls("app_dupla_save_profile")).toHaveLength(1));
    expect(rpcCalls("app_dupla_save_profile")[0][1]).toEqual({ p_profile: { role_pref: "ator" } });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Quero ser ator/avaliador" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("papel sem complemento: vazio com a dica e 'Aceitar qualquer papel'; com 'Qualquer papel', só o título", async () => {
    await open();
    expect(await screen.findByText("Nenhum colega compatível agora")).toBeTruthy();
    expect(screen.getByText('Ninguém online quer o papel complementar ao seu. Tente "Qualquer papel".')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar qualquer papel" }));
    await waitFor(() => expect(rpcCalls("app_dupla_save_profile")[0][1]).toEqual({ p_profile: { role_pref: "any" } }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Aceitar qualquer papel" })).toBeNull());
    expect(screen.getByText("Nenhum colega compatível agora")).toBeTruthy();
    expect(screen.queryByText(/Ninguém online quer o papel/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/busca automática/i);
  });

  it("falha ao gravar o papel mostra a mensagem e mantém o valor", async () => {
    await open();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_dupla_save_profile") throw new Error("Papel inválido.");
      return loaded;
    });
    fireEvent.click(screen.getByRole("radio", { name: "Qualquer papel" }));
    expect(await screen.findByText("Papel inválido.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Quero ser médico" }).getAttribute("aria-checked")).toBe("true");
  });

  it("radar desligado: aviso sem a frase de convidar colegas", async () => {
    loaded = { ...loaded, profile: { ...PROFILE, radar_visible: false } };
    await open();
    expect(screen.getByText("Com o radar desligado, ninguém vê seu cartão.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/convidar colegas/);
  });

  it("radar ligado: sem o aviso", async () => {
    await open();
    expect(screen.queryByText(/ninguém vê seu cartão/)).toBeNull();
  });

  it("faixa da estação escolhida; remover tira o parâmetro", async () => {
    await open("/dupla?estacao=teste-inep2020-e03&outro=1");
    expect(await screen.findByText("Estação 3 · Cefaleia na gestante")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover estação escolhida" }));
    await waitFor(() => expect(screen.queryByText("Estação 3 · Cefaleia na gestante")).toBeNull());
    expect(screen.getByTestId("onde").textContent).toBe("/dupla?outro=1");
  });

  it("estação que não existe: sem faixa", async () => {
    await open("/dupla?estacao=nao-existe");
    await waitFor(() => expect(rpcCalls("app_dupla_stations")).toHaveLength(1));
    expect(screen.queryByText(/^Estação \d/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Remover estação escolhida" })).toBeNull();
  });

  it("sem o parâmetro não consulta as estações", async () => {
    await open();
    expect(rpcCalls("app_dupla_stations")).toHaveLength(0);
  });

  it("painel da compatibilidade com Papel 40%, Áreas em comum 25%, Disponibilidade 20%, Ritmo 10%, Prova 5% e os textos do protótipo", async () => {
    await open();
    expect(screen.getByText("0 compatíveis")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Como a compatibilidade é calculada/ }));
    const body = screen.getByRole("region", { name: /Como a compatibilidade é calculada/ });
    const rows: [string, string, string][] = [
      ["Papel", "40%", "complementar 100% · um flexível 85% · os dois flexíveis 70%"],
      ["Áreas em comum", "25%", "proporção das suas áreas que o colega também quer treinar"],
      ["Disponibilidade", "20%", "turno em comum e dias da semana em comum"],
      ["Ritmo", "10%", "treino livre, cronometrado ou simulação de prova"],
      ["Prova", "5%", "mesma edição do Revalida"],
    ];
    for (const [label, weight, hint] of rows) {
      expect(within(body).getByText(label)).toBeTruthy();
      expect(within(body).getByText(weight)).toBeTruthy();
      expect(within(body).getByText(hint)).toBeTruthy();
    }
    expect(body.textContent).toContain("Papel é eliminatório.");
    expect(body.textContent).toContain('Quem quer ser médico(a) só encontra quem quer ser ator/avaliador, e vice-versa. Quem escolhe "Qualquer papel" combina com todos. Dois colegas que querem o mesmo papel não aparecem um para o outro.');
    expect(body.textContent).toContain("Os seus dados vêm do perfil de estudo.");
    fireEvent.click(within(body).getByRole("button", { name: "perfil de estudo" }));
    expect(go).toHaveBeenCalledWith("dupla-perfil");
  });

  it("nada do que ficou fora nem contador inventado: os números vêm do baralho do servidor", async () => {
    await open();
    expect(await screen.findByText("0 colegas online")).toBeTruthy();
    expect(screen.getByText("0 matches hoje")).toBeTruthy();
    const text = document.body.textContent ?? "";
    for (const banned of ["Convite rápido", "Agendar sessão", "Enviar mensagem", "Busca automática", "WhatsApp", "Salas abertas", "Permitir convites", "Atores", "Gabriela", "Tiago"]) {
      expect(text, banned).not.toContain(banned);
    }
    expect(text).not.toContain("11 colegas"); // o número do protótipo
  });

  it("erro ao carregar mostra a mensagem com 'Tentar de novo'", async () => {
    backend.rpc.mockImplementation(async () => {
      throw new Error("Falha de rede.");
    });
    render(
      <MemoryRouter>
        <PracticeScreen go={go} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });
});
