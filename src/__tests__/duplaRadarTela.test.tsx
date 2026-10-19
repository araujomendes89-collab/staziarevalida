/**
 * Treinamento em Dupla · radar de quem está online (jsdom): RadarScreen e o atalho do Praticar (a lista é a tela padrão; o baralho fica em `?modo=baralho`).
 * O banco é simulado pelo contrato de app_dupla_radar / app_dupla_invite / app_dupla_save_profile; todas as pessoas abaixo são de
 * TESTE (nenhuma pessoa real). O tempo real do radar e o aviso de convite ficam em duplaRadarTempoReal.test.tsx.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const backend: any = { rpc: vi.fn() };
const session: any = { backend, boot: { role: "student" }, user: { id: "u-eu" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, playMatchSound: vi.fn(), installAudioWake: vi.fn() };
});

import { RadarScreen } from "../novo/app/dupla/RadarScreen.jsx";
import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";

const SAVED = {
  public_name: "Eu Teste", handle: "eu.teste", school: "Faculdade Teste", city: "Cidade Teste · TS", goal: "Treinar", exam: "2026/2", bio: "",
  areas: ["GO"], role_pref: "any", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"],
  radar_visible: true, allow_direct_invites: true, show_school: true, show_stats: true,
};
const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  user_id: id, public_name: name, handle: null, school: "Faculdade Teste", city: "Cidade Teste · TS", areas: ["GO"], role_pref: "ator",
  state: "livre", compat: 80, can_invite: true, why_not: null, near: null, ...extra,
});
const UM = person("u-um", "Colega Teste Um", { handle: "colega.um", compat: 91 });
const DOIS = person("u-dois", "Colega Teste Dois", { handle: "colega.dois", state: "em_sala", compat: 70, can_invite: false, why_not: "Está em uma sala." });
const TRES = person("u-tres", "Colega Teste Três", { handle: "colega.tres", state: "sozinho", compat: 65, can_invite: false, why_not: "Está treinando sozinho." });
const QUATRO = person("u-quatro", "Colega Teste Quatro", { handle: "colega.quatro", compat: 55, can_invite: false, why_not: "Não recebe convites." });
const STATION = { id: "est-teste-3", number: 3, area: "Ginecologia e Obstetrícia" };

let radarByAba: Record<string, any>;
let radarError: Error | null;
let inviteResult: any;
let inviteError: Error | null;
let go: any;
let profile: any;
let clipboardWrite: any;

const radarBody = (people: any[], extra: Record<string, unknown> = {}) => ({ people, online: people.length, needs_city: false, open_room: null, me: { radar_visible: true }, ...extra });
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

beforeEach(() => {
  go = vi.fn();
  profile = { setData: vi.fn() };
  session.boot = { role: "student" };
  radarByAba = { online: radarBody([UM, DOIS, TRES, QUATRO]) };
  radarError = null;
  inviteResult = { room_id: "sala-teste-1", partner: { user_id: "u-um" }, expires_at: new Date(Date.now() + 60000).toISOString() };
  inviteError = null;
  sessionStorage.clear();
  delete backend.subscribeInvites;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_radar") {
      if (radarError) throw radarError;
      return radarByAba[args.p_aba] ?? radarBody([]);
    }
    if (fn === "app_dupla_invite") {
      if (inviteError) throw inviteError;
      return inviteResult;
    }
    if (fn === "app_dupla_save_profile") return { profile: { ...SAVED, ...args.p_profile } };
    if (fn === "app_dupla_profile") return { profile: SAVED, defaults: null, stats: { done: 0, avg: null } };
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: [], server_now: new Date().toISOString() };
    if (fn === "app_dupla_requests") return { requests: [] };
    if (fn === "app_dupla_stations") return [{ ...STATION, name: "Estação de teste" }];
    if (fn === "app_dupla_deck") return { cards: [], hidden_by_role: 0, online: 0, matches_today: 0, open_room: null, server_now: new Date().toISOString() };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  clipboardWrite = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, writable: true, value: { writeText: clipboardWrite } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openRadar(props: Record<string, unknown> = {}) {
  render(
    <MemoryRouter>
      <RadarScreen go={go} profile={profile} saved={SAVED} station={null} stationId={null} {...props} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByText("Carregando…")).toBeNull());
}
const rows = () => screen.queryAllByTestId("radar-pessoa");
const rowOf = (name: string) => {
  const li = rows().find((r) => within(r).queryByText(name));
  if (!li) throw new Error(`linha não encontrada: ${name}`);
  return li;
};

describe("Radar · lista", () => {
  it("mostra nome, @, compatibilidade e situação de cada pessoa", async () => {
    await openRadar();
    expect(rows()).toHaveLength(4);
    const um = rowOf("Colega Teste Um");
    expect(within(um).getByText("@colega.um")).toBeTruthy();
    expect(within(um).getByText("91%")).toBeTruthy();
    expect(within(um).getByText("Livre")).toBeTruthy();
    expect(within(um).getByText(/Faculdade Teste/)).toBeTruthy();
    expect(within(rowOf("Colega Teste Dois")).getByText("Em sala")).toBeTruthy();
    expect(within(rowOf("Colega Teste Três")).getByText("Treinando sozinho")).toBeTruthy();
    expect(screen.getByText("4 colegas online", { selector: "span" })).toBeTruthy();
  });

  it("Convidar chama app_dupla_invite com p_to e p_station_id e leva à sala", async () => {
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    fireEvent.click(within(rowOf("Colega Teste Um")).getByRole("button", { name: "Convidar Colega Teste Um" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-teste-1" }));
    expect(rpcCalls("app_dupla_invite")).toEqual([["app_dupla_invite", { p_to: "u-um", p_station_id: "est-teste-3" }]]);
  });

  it("sem estação escolhida, Convidar abre a lista de estações e nenhum convite sai antes da escolha", async () => {
    await openRadar();
    fireEvent.click(screen.getByRole("button", { name: "Convidar Colega Teste Um" }));
    expect(await screen.findByRole("dialog", { name: /Escolha a estação para treinar com Colega Teste Um/ })).toBeTruthy();
    expect(rpcCalls("app_dupla_invite")).toHaveLength(0);
  });

  it("'Em sala' e 'Treinando sozinho' ficam sem botão; 'Não recebe convites.' mostra o texto sem botão", async () => {
    await openRadar();
    expect(within(rowOf("Colega Teste Dois")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Colega Teste Três")).queryByRole("button")).toBeNull();
    const quatro = rowOf("Colega Teste Quatro");
    expect(within(quatro).queryByRole("button")).toBeNull();
    expect(within(quatro).getByText("Não recebe convites")).toBeTruthy();
    // os outros motivos do servidor não viram texto na linha
    expect(within(rowOf("Colega Teste Dois")).queryByText(/Está em uma sala/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Convidar / })).toHaveLength(1);
  });

  it("nenhuma pessoa de exemplo: só aparece o que o servidor devolve", async () => {
    radarByAba.online = radarBody([UM]);
    await openRadar();
    expect(rows()).toHaveLength(1);
    const text = document.body.textContent ?? "";
    for (const banned of ["Gabriela", "Tiago", "Colega Teste Dois", "Colega Teste Quatro"]) expect(text, banned).not.toContain(banned);
  });

  it("não existem busca automática, salas abertas, convite rápido nem botão de WhatsApp", async () => {
    await openRadar();
    const text = document.body.textContent ?? "";
    for (const banned of ["Busca automática de duplas", "Salas abertas", "Convite rápido"]) expect(text, banned).not.toContain(banned);
    expect(text).not.toContain("WhatsApp");
    for (const b of screen.getAllByRole("button")) expect(b.textContent ?? "", "botão").not.toMatch(/WhatsApp/i);
    expect(screen.queryByRole("button", { name: /WhatsApp/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /WhatsApp/i })).toBeNull();
  });

  it("a estação escolhida aparece na faixa e 'Trocar estação' leva ao banco de estações", async () => {
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    expect(screen.getByText(/Estação 3 · Ginecologia e Obstetrícia/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trocar estação" }));
    expect(go).toHaveBeenCalledWith("estacoes");
  });

  it("sala aberta vira aviso com 'Abrir sala agora'", async () => {
    radarByAba.online = radarBody([UM], { open_room: { id: "sala-aberta-9", partner_name: "Colega Teste Um" } });
    await openRadar();
    expect(await screen.findByText("Sala aberta com Colega Teste Um")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir sala agora" }));
    expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-aberta-9" });
  });
});

describe("Radar · interruptores", () => {
  it("'Aparecer no radar' grava radar_visible", async () => {
    await openRadar();
    const sw = screen.getByRole("switch", { name: /Aparecer no radar/ });
    expect((sw as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sw);
    await waitFor(() => expect(rpcCalls("app_dupla_save_profile")).toHaveLength(1));
    expect(rpcCalls("app_dupla_save_profile")[0][1]).toEqual({ p_profile: { radar_visible: false } });
    await waitFor(() => expect(profile.setData).toHaveBeenCalled());
  });

  it("'Permitir convites diretos' grava allow_direct_invites", async () => {
    await openRadar();
    const sw = screen.getByRole("switch", { name: /Permitir convites diretos/ });
    expect((sw as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sw);
    await waitFor(() => expect(rpcCalls("app_dupla_save_profile")).toHaveLength(1));
    expect(rpcCalls("app_dupla_save_profile")[0][1]).toEqual({ p_profile: { allow_direct_invites: false } });
  });

  it("com o radar desligado a tela avisa e o interruptor volta a ligar", async () => {
    await openRadar({ saved: { ...SAVED, radar_visible: false } });
    expect(screen.getByText("Você não aparece para outros alunos")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Aparecer no radar/ }));
    await waitFor(() => expect(rpcCalls("app_dupla_save_profile")[0][1]).toEqual({ p_profile: { radar_visible: true } }));
  });

  it("falha ao gravar mostra o aviso e a tela continua funcionando", async () => {
    await openRadar();
    const base = backend.rpc.getMockImplementation();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_dupla_save_profile") throw new Error("Não foi possível salvar agora.");
      return base(fn, args);
    });
    fireEvent.click(screen.getByRole("switch", { name: /Permitir convites diretos/ }));
    expect(await screen.findByText("Não foi possível salvar agora.")).toBeTruthy();
    expect(rows()).toHaveLength(4);
  });
});

describe("Radar · abas", () => {
  it("cada aba chama app_dupla_radar com o p_aba certo", async () => {
    radarByAba.perto = radarBody([person("u-perto", "Colega Teste Perto", { handle: "colega.perto", near: "cidade" })]);
    await openRadar();
    expect(rpcCalls("app_dupla_radar")[0][1]).toEqual({ p_station_id: null, p_aba: "online" });
    const group = screen.getByRole("radiogroup", { name: "Lista" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Online", "Perto de você"]);
    fireEvent.click(within(group).getByRole("radio", { name: "Perto de você" }));
    expect(await screen.findByText("Colega Teste Perto")).toBeTruthy();
    expect(rpcCalls("app_dupla_radar").some((c) => c[1].p_aba === "perto")).toBe(true);
    fireEvent.click(within(group).getByRole("radio", { name: "Online" }));
    expect(await screen.findByText("Colega Teste Um")).toBeTruthy();
  });

  it("a estação escolhida vai em p_station_id", async () => {
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    expect(rpcCalls("app_dupla_radar")[0][1]).toEqual({ p_station_id: "est-teste-3", p_aba: "online" });
  });

  it("'Perto de você' mostra 'Mesma cidade' ou 'Mesmo estado'; nas outras abas não", async () => {
    radarByAba.online = radarBody([person("u-a", "Colega Teste Um", { near: "cidade" })]);
    radarByAba.perto = radarBody([
      person("u-a", "Colega Teste Um", { near: "cidade" }),
      person("u-b", "Colega Teste Dois", { near: "estado" }),
    ]);
    await openRadar();
    expect(screen.queryByText("Mesma cidade")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Perto de você" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rowOf("Colega Teste Um")).getByText("Mesma cidade")).toBeTruthy();
    expect(within(rowOf("Colega Teste Dois")).getByText("Mesmo estado")).toBeTruthy();
  });

  it("sem cidade no perfil: pede a cidade e o botão leva ao perfil de estudo", async () => {
    radarByAba.perto = radarBody([], { needs_city: true });
    await openRadar();
    fireEvent.click(screen.getByRole("radio", { name: "Perto de você" }));
    expect(await screen.findByText("Informe sua cidade no perfil para ver quem está perto")).toBeTruthy();
    expect(screen.queryByText("Ninguém online agora")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Meu perfil de estudo" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(go).toHaveBeenCalledWith("dupla-perfil");
  });

  it("'Perto de você' vazio (com cidade) tem título próprio", async () => {
    radarByAba.perto = radarBody([]);
    await openRadar();
    fireEvent.click(screen.getByRole("radio", { name: "Perto de você" }));
    expect(await screen.findByText("Ninguém perto de você online agora")).toBeTruthy();
  });
});

describe("Radar · busca", () => {
  const FULL = [
    person("u-1", "José Ângelo Teste", { handle: "jose.angelo", school: "Universidade Fictícia", areas: ["GO"] }),
    person("u-2", "Colega Teste Pediatra", { handle: "pedi.teste", school: "Instituto Exemplo", areas: ["PED"] }),
    person("u-3", "Colega Teste Clínico", { handle: "clinico.t", school: "Faculdade Teste", areas: ["CM"] }),
  ];
  const type = (text: string) => fireEvent.change(screen.getByPlaceholderText("Buscar nome, @ ou área"), { target: { value: text } });
  const names = () => rows().map((r) => within(r).getAllByText(/Teste|Ângelo/)[0].textContent);

  beforeEach(() => {
    radarByAba.online = radarBody(FULL);
  });

  it("acha por nome, sem diferença de acento nem de maiúscula", async () => {
    await openRadar();
    await screen.findByText("José Ângelo Teste");
    type("jose angelo");
    expect(rows()).toHaveLength(1);
    type("ÂNGELO");
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("José Ângelo Teste")).toBeTruthy();
  });

  it("acha por @, com e sem o @", async () => {
    await openRadar();
    await screen.findByText("José Ângelo Teste");
    type("@pedi.teste");
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Colega Teste Pediatra")).toBeTruthy();
    type("pedi.teste");
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Colega Teste Pediatra")).toBeTruthy();
  });

  it("acha por instituição e por área", async () => {
    await openRadar();
    await screen.findByText("José Ângelo Teste");
    type("fictícia");
    expect(rows()).toHaveLength(1);
    type("ficticia");
    expect(rows()).toHaveLength(1);
    type("instituto");
    expect(within(rows()[0]).getByText("Colega Teste Pediatra")).toBeTruthy();
    type("obstetricia");
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("José Ângelo Teste")).toBeTruthy();
    type("clinica");
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Colega Teste Clínico")).toBeTruthy();
  });

  it("sem resultado: aviso próprio e 'Limpar busca' devolve a lista", async () => {
    await openRadar();
    await screen.findByText("José Ângelo Teste");
    type("zzzz");
    expect(screen.getByText("Ninguém com esse nome, @ ou área")).toBeTruthy();
    expect(screen.queryByText("Ninguém online agora")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(rows()).toHaveLength(3);
    expect(names().length).toBe(3);
  });
});

describe("Radar · lista vazia", () => {
  beforeEach(() => {
    radarByAba.online = radarBody([]);
  });

  it("'Ninguém online agora' com 'Procurar dupla'; aluno não vê 'Treinar sozinho'", async () => {
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    expect(await screen.findByText("Ninguém online agora")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Treinar sozinho" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Procurar dupla" }));
    expect(go).toHaveBeenCalledWith("dupla", { estacao: "est-teste-3", modo: "baralho" });
  });

  it("sem estação, 'Procurar dupla' vai ao baralho sem estação", async () => {
    await openRadar();
    await screen.findByText("Ninguém online agora");
    fireEvent.click(screen.getByRole("button", { name: "Procurar dupla" }));
    expect(go).toHaveBeenCalledWith("dupla", { modo: "baralho" });
  });

  it("equipe com estação vê 'Treinar sozinho' e ele abre a estação", async () => {
    session.boot = { role: "admin" };
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    await screen.findByText("Ninguém online agora");
    fireEvent.click(screen.getByRole("button", { name: "Treinar sozinho" }));
    expect(go).toHaveBeenCalledWith("estacao", { id: "est-teste-3" });
  });

  it("equipe sem estação não vê 'Treinar sozinho'", async () => {
    session.boot = { role: "admin" };
    await openRadar();
    await screen.findByText("Ninguém online agora");
    expect(screen.queryByRole("button", { name: "Treinar sozinho" })).toBeNull();
  });
});

describe("Radar · erros", () => {
  it("erro de limite do servidor vira aviso e a tela continua funcionando", async () => {
    inviteError = new Error("Muitos convites seguidos. Tente de novo em 12 min.");
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    fireEvent.click(screen.getByRole("button", { name: "Convidar Colega Teste Um" }));
    expect(await screen.findByText("Muitos convites seguidos. Tente de novo em 12 min.")).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(4);
    // o botão volta a funcionar
    await waitFor(() => expect((screen.getByRole("button", { name: "Convidar Colega Teste Um" }) as HTMLButtonElement).disabled).toBe(false));
    inviteError = null;
    fireEvent.click(screen.getByRole("button", { name: "Convidar Colega Teste Um" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-teste-1" }));
  });

  it("erro ao atualizar mantém a lista anterior ('Mostrando a última')", async () => {
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    expect(rows()).toHaveLength(4);
    radarError = new Error("Falha de rede.");
    // o convite que falha também reconsulta o radar
    inviteError = new Error("Sem conexão.");
    fireEvent.click(screen.getByRole("button", { name: "Convidar Colega Teste Um" }));
    expect(await screen.findByText(/Mostrando a última/)).toBeTruthy();
    expect(screen.getByText("Não foi possível atualizar a lista agora. Mostrando a última.")).toBeTruthy();
    expect(rows()).toHaveLength(4);
    expect(screen.getByText("Colega Teste Um")).toBeTruthy();
  });

  it("erro na primeira consulta mostra a mensagem com 'Tentar de novo'", async () => {
    radarError = new Error("Falha de rede.");
    render(
      <MemoryRouter>
        <RadarScreen go={go} profile={profile} saved={SAVED} station={null} stationId={null} />
      </MemoryRouter>,
    );
    const retry = await screen.findByRole("button", { name: "Tentar de novo" });
    radarError = null;
    fireEvent.click(retry);
    expect(await screen.findByText("Colega Teste Um")).toBeTruthy();
  });
});

describe("Radar · sem link de convite", () => {
  it("o convite por link do @ saiu: não há botão para copiar o link", async () => {
    await openRadar({ station: STATION, stationId: "est-teste-3" });
    expect(screen.queryByRole("button", { name: "Copiar link de convite" })).toBeNull();
  });
});
