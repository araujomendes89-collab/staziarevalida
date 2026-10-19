/**
 * Treinamento em Dupla · etapa 4 · tarefa 13: baralho, "Deu match!" e convite no Praticar e no Perfil de estudo (jsdom).
 * O banco é simulado pelo contrato da Tarefa 11 (app_dupla_deck, app_dupla_swipe, app_dupla_invites, app_dupla_answer_invite,
 * app_dupla_leave, app_dupla_heartbeat); o som é o de verdade, com o AudioContext simulado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeFakeAudio } from "./helpers/fakeAudio";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u1" } }) }));
vi.mock("../novo/app/dupla/sound.js", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, playSkipSound: vi.fn(real.playSkipSound), playMatchSound: vi.fn(real.playMatchSound) };
});

import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";
import { StudyProfileScreen } from "../novo/app/dupla/StudyProfileScreen.jsx";
import { mergeDeck } from "../novo/app/dupla/deck.js";
import * as sound from "../novo/app/dupla/sound.js";

const PROFILE = {
  public_name: "Maria Souza", school: "UFPR", city: "Curitiba · PR", goal: "Treinar GO", exam: "2026/2", bio: "",
  areas: ["GO"], role_pref: "any", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"],
  radar_visible: true, show_school: true, show_stats: true,
};
const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  user_id: id, public_name: name, school: "UFPR", city: "Curitiba · PR", exam: "2026/2", bio: `Bio de ${name}.`, goal: "Treinar GO",
  areas: ["GO"], role_pref: "ator", pace: "cronometrado", days: ["Seg", "Qua"], shifts: ["Noite"], stats: { done: 3, avg: 7.8 },
  compat: 92, reasons: [{ icon: "check", text: "Clínica Médica em comum", strong: true }], online: true, ...extra,
});
const CARLA = person("u-carla", "Carla Dias");
const BRUNO = person("u-bruno", "Bruno Lima", { compat: 78 });
const DIEGO = person("u-diego", "Diego Reis", { compat: 63 });
const EVA = person("u-eva", "Eva Prado", { compat: 41 });
const deckOf = (cards: any[], extra: Record<string, unknown> = {}) => ({
  cards, hidden_by_role: 2, online: 5, matches_today: 1, open_room: null, server_now: new Date().toISOString(), ...extra,
});
const invite = (id: string, roomId: string, name: string, inMs = 60000) => ({
  id, room_id: roomId, from: { user_id: "u-" + name.toLowerCase().split(" ")[0], public_name: name }, expires_at: new Date(Date.now() + inMs).toISOString(),
});

let loaded: any;
let deckNow: any;
let invitesNow: any[];
let swipeResult: any;
let swipeError: Error | null;
let go: any;
let audio: ReturnType<typeof makeFakeAudio>;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

beforeEach(() => {
  go = vi.fn();
  localStorage.clear();
  loaded = { profile: PROFILE, defaults: null, stats: { done: 3, avg: 7.8 } };
  deckNow = deckOf([CARLA, BRUNO, DIEGO]);
  invitesNow = [];
  swipeResult = { matched: false };
  swipeError = null;
  delete backend.subscribeInvites;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_profile") return loaded;
    if (fn === "app_dupla_save_profile") return { ...loaded, profile: { ...loaded.profile, ...args.p_profile } };
    if (fn === "app_dupla_stations") return [{ id: "teste-inep2020-e03", name: "Cefaleia na gestante", number: 3, area: "Ginecologia e Obstetrícia", area_code: "GO" }];
    if (fn === "app_dupla_deck") return deckNow;
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: invitesNow, server_now: new Date().toISOString() };
    if (fn === "app_dupla_swipe") {
      if (swipeError) throw swipeError;
      return swipeResult;
    }
    if (fn === "app_dupla_answer_invite") return { room_id: args.p_accept ? "sala-aceita" : null };
    if (fn === "app_dupla_leave") return { id: args.p_room_id, phase: "closed" };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  audio = makeFakeAudio();
  (window as any).AudioContext = audio.Ctor;
  delete (window as any).__szAudio;
  Object.defineProperty(navigator, "vibrate", { configurable: true, writable: true, value: vi.fn() });
  vi.mocked(sound.playSkipSound).mockClear();
  vi.mocked(sound.playMatchSound).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.querySelectorAll("input.fora-do-baralho").forEach((n) => n.remove());
});

async function openPractice(url = "/dupla") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <PracticeScreen go={go} />
    </MemoryRouter>,
  );
  await screen.findByText("Como a compatibilidade é calculada");
}
/** Com relógio falso o findBy do Testing Library não anda: deixa as promessas e os relógios correrem à mão. */
async function openPracticeFake(url = "/dupla") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <PracticeScreen go={go} />
    </MemoryRouter>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}
const topCard = () => screen.getByRole("article");
async function press(key: "ArrowLeft" | "ArrowRight") {
  fireEvent.keyDown(window, { key });
}
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
function refreshByVisibility() {
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("mergeDeck", () => {
  const a = person("a", "Ana"), b = person("b", "Beto"), c = person("c", "Caio"), d = person("d", "Duda");
  it("mantém a ordem dos que continuam e põe os novos no fim", () => {
    expect(mergeDeck([a, b, c], [d, c, b, a]).map((p: any) => p.user_id)).toEqual(["a", "b", "c", "d"]);
  });
  it("quem saiu some, menos o de cima, que fica até ser escolhido", () => {
    expect(mergeDeck([a, b, c], [c, d]).map((p: any) => p.user_id)).toEqual(["a", "c", "d"]);
    expect(mergeDeck([a, b, c], []).map((p: any) => p.user_id)).toEqual(["a"]);
  });
  it("atualiza os dados de quem continua, sem trocar a posição, e ignora repetidos", () => {
    const novo = { ...b, compat: 99 };
    const out = mergeDeck([a, b], [novo, a, novo]);
    expect(out.map((p: any) => p.user_id)).toEqual(["a", "b"]);
    expect((out[1] as any).compat).toBe(99);
  });
  it("sem cartões na tela, vale o que veio; entradas nulas viram lista vazia", () => {
    expect(mergeDeck([], [b, a]).map((p: any) => p.user_id)).toEqual(["b", "a"]);
    expect(mergeDeck(null as any, undefined as any)).toEqual([]);
  });
});

describe("Praticar com baralho", () => {
  it("cabeçalho com colegas online e matches de hoje; pilha com 'Próximo: Bruno'", async () => {
    await openPractice();
    expect(await screen.findByText("5 colegas online")).toBeTruthy();
    expect(screen.getByText("1 match hoje")).toBeTruthy();
    expect(within(topCard()).getByText("Carla Dias")).toBeTruthy();
    expect(screen.getByText("Próximo: Bruno")).toBeTruthy();
    // resumo do painel "Como a compatibilidade é calculada" (Match.jsx:171)
    expect(screen.getByText("3 compatíveis · 2 ocultos pelo papel")).toBeTruthy();
    // dica de arraste e botões (Match.jsx:21-29, 166, 168)
    expect(screen.getByText("Arraste o cartão")).toBeTruthy();
    expect(screen.getByText("Recusar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pular" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Estudar junto" })).toBeTruthy();
  });

  it("singular e plural do cabeçalho e do resumo", async () => {
    deckNow = deckOf([CARLA], { online: 1, matches_today: 2, hidden_by_role: 1 });
    await openPractice();
    expect(await screen.findByText("1 colega online")).toBeTruthy();
    expect(screen.getByText("2 matches hoje")).toBeTruthy();
    expect(screen.getByText("1 compatível · 1 oculto pelo papel")).toBeTruthy();
    expect(screen.queryByText(/^Próximo:/)).toBeNull();
  });

  it("matches hoje zerado e sem ocultos", async () => {
    deckNow = deckOf([CARLA], { matches_today: 0, hidden_by_role: 0 });
    await openPractice();
    expect(await screen.findByText("0 matches hoje")).toBeTruthy();
    expect(screen.getByText("1 compatível")).toBeTruthy();
  });

  it("sinal 'livre' na entrada e 'fora' ao sair", async () => {
    await openPractice();
    await waitFor(() => expect(rpcCalls("app_dupla_heartbeat")[0]).toEqual(["app_dupla_heartbeat", { p_status: "livre", p_room_id: null }]));
    cleanup();
    expect(rpcCalls("app_dupla_heartbeat").at(-1)).toEqual(["app_dupla_heartbeat", { p_status: "fora", p_room_id: null }]);
  });

  it("← pula com o som de pular e → estuda; teclas ignoradas em campo de texto e com diálogo aberto", async () => {
    await openPractice();
    await screen.findByText("5 colegas online");
    // campo de texto: nada acontece
    const input = document.createElement("input");
    input.className = "fora-do-baralho";
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    await new Promise((r) => setTimeout(r, 350));
    expect(rpcCalls("app_dupla_swipe")).toHaveLength(0);
    expect(sound.playSkipSound).not.toHaveBeenCalled();

    await press("ArrowLeft");
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(1));
    expect(rpcCalls("app_dupla_swipe")[0][1]).toEqual({ p_to: "u-carla", p_direction: "left", p_station_id: null });
    expect(sound.playSkipSound).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(topCard()).getByText("Bruno Lima")).toBeTruthy());
    expect(screen.getByText("Próximo: Diego")).toBeTruthy();

    await press("ArrowRight");
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(2));
    expect(rpcCalls("app_dupla_swipe")[1][1]).toEqual({ p_to: "u-bruno", p_direction: "right", p_station_id: null });
    expect(sound.playSkipSound).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(topCard()).getByText("Diego Reis")).toBeTruthy());
    expect(screen.queryByText("Deu match!")).toBeNull();
  });

  it("os botões Pular e Estudar junto escolhem o cartão de cima", async () => {
    await openPractice();
    await screen.findByText("5 colegas online");
    fireEvent.click(screen.getByRole("button", { name: "Estudar junto" }));
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(1));
    expect(rpcCalls("app_dupla_swipe")[0][1]).toMatchObject({ p_to: "u-carla", p_direction: "right" });
    await waitFor(() => expect(within(topCard()).getByText("Bruno Lima")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pular" }));
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(2));
    expect(rpcCalls("app_dupla_swipe")[1][1]).toMatchObject({ p_to: "u-bruno", p_direction: "left" });
  });

  it("Estudar junto repetido no mesmo cartão (clique duplo, tecla repetida) escolhe uma pessoa só", async () => {
    // R15 do pacote de 11/10 (Etapa P, Tarefa P6)
    await openPractice();
    await screen.findByText("5 colegas online");
    const botao = screen.getByRole("button", { name: "Estudar junto" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 600));
    expect(rpcCalls("app_dupla_swipe").map((c: any) => c[1].p_to)).toEqual(["u-carla"]);
    // tecla repetida (auto-repetição do teclado) no cartão seguinte
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 600));
    expect(rpcCalls("app_dupla_swipe").map((c: any) => c[1].p_to)).toEqual(["u-carla", "u-bruno"]);
  });

  it("a estação escolhida no Banco vai junto no 'Estudar junto'", async () => {
    await openPractice("/dupla?estacao=teste-inep2020-e03");
    await screen.findByText("Estação 3 · Cefaleia na gestante");
    await press("ArrowRight");
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(1));
    expect(rpcCalls("app_dupla_swipe")[0][1]).toEqual({ p_to: "u-carla", p_direction: "right", p_station_id: "teste-inep2020-e03" });
  });

  it("quem completa: 'Deu match!' com o texto do protótipo; Abrir sala agora vai à sala; Continuar buscando sai da sala", async () => {
    swipeResult = { matched: true, room_id: "sala-1", partner: { user_id: "u-carla", public_name: "Carla Dias" } };
    await openPractice();
    await screen.findByText("5 colegas online");
    await press("ArrowRight");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Deu match!")).toBeTruthy();
    expect(within(dialog).getByText("Você e Carla querem treinar a 2ª fase. Combinem a primeira sessão.")).toBeTruthy();
    expect(sound.playMatchSound).toHaveBeenCalledTimes(1);
    // nada de agendar ou convite rápido; "Enviar mensagem" abre o chat (Etapa C, duplaChatTela.test.tsx)
    for (const banned of ["Agendar sessão", "Convite rápido"]) expect(document.body.textContent).not.toContain(banned);
    expect(within(dialog).getByRole("button", { name: "Enviar mensagem" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir sala agora" }));
    expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-1" });

    // "Continuar buscando" sai da sala e o baralho volta
    deckNow = deckOf([BRUNO, DIEGO]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar buscando" }));
    await waitFor(() => expect(rpcCalls("app_dupla_leave")).toEqual([["app_dupla_leave", { p_room_id: "sala-1" }]]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(topCard()).getByText("Bruno Lima")).toBeTruthy());
  });

  it("Esc no 'Deu match!' também sai da sala", async () => {
    swipeResult = { matched: true, room_id: "sala-2", partner: { user_id: "u-carla", public_name: "Carla Dias" } };
    await openPractice();
    await screen.findByText("5 colegas online");
    await press("ArrowRight");
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(rpcCalls("app_dupla_leave")).toEqual([["app_dupla_leave", { p_room_id: "sala-2" }]]));
  });

  it("com o 'Deu match!' aberto, as setas não escolhem ninguém e a sala que o baralho traz não vira aviso por baixo", async () => {
    swipeResult = { matched: true, room_id: "sala-3", partner: { user_id: "u-carla", public_name: "Carla Dias" } };
    await openPractice();
    await screen.findByText("5 colegas online");
    await press("ArrowRight");
    await screen.findByRole("dialog");
    deckNow = deckOf([], { open_room: { id: "sala-3", phase: "roles", partner_name: "Carla Dias" }, matches_today: 2, online: 6 });
    refreshByVisibility();
    await waitFor(() => expect(screen.getByText("2 matches hoje")).toBeTruthy());
    expect(screen.queryByText("Sala aberta com Carla Dias")).toBeNull();
    await press("ArrowLeft");
    await new Promise((r) => setTimeout(r, 350));
    expect(rpcCalls("app_dupla_swipe")).toHaveLength(1);
  });

  it("erro ao escolher: o cartão volta e aparece o aviso", async () => {
    swipeError = new Error("Colega não encontrado.");
    await openPractice();
    await screen.findByText("5 colegas online");
    await press("ArrowRight");
    expect(await screen.findByText("Colega não encontrado.")).toBeTruthy();
    await waitFor(() => expect(within(topCard()).getByText("Carla Dias")).toBeTruthy());
    expect(screen.getByText("Próximo: Bruno")).toBeTruthy();
  });

  it("quem escolheu primeiro: convite abre o modal; aceitar abre a sala; recusar responde false", async () => {
    invitesNow = [invite("inv-1", "sala-9", "Bruno Lima")];
    await openPractice();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Você e Bruno querem treinar a 2ª fase. Combinem a primeira sessão.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir sala agora" }));
    await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "inv-1", p_accept: true }]]));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-aceita" }));
  });

  it("convite recusado: 'Continuar buscando' responde false e fecha o modal", async () => {
    invitesNow = [invite("inv-2", "sala-8", "Bruno Lima")];
    await openPractice();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar buscando" }));
    await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "inv-2", p_accept: false }]]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(go).not.toHaveBeenCalled();
    // o convite respondido não reaparece, mesmo que a lista demore a esvaziar
    refreshByVisibility();
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("convite vencido não abre o modal; o mais novo no prazo é o que aparece", async () => {
    invitesNow = [invite("velho", "sala-v", "Diego Reis", -5000), invite("a", "sala-a", "Carla Dias", 20000), invite("b", "sala-b", "Bruno Lima", 50000)];
    await openPractice();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Você e Bruno querem treinar/)).toBeTruthy();
  });

  it("erro ao aceitar o convite: aviso do servidor e o modal fecha", async () => {
    invitesNow = [invite("inv-3", "sala-7", "Bruno Lima")];
    await openPractice();
    const dialog = await screen.findByRole("dialog");
    const base = backend.rpc.getMockImplementation();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_dupla_answer_invite") throw new Error("Convite expirado (60 s).");
      return base(fn, args);
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir sala agora" }));
    expect(await screen.findByText("Convite expirado (60 s).")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(go).not.toHaveBeenCalled();
  });

  it("baralho atualizado não troca o cartão de cima; novos entram no fim", async () => {
    await openPractice();
    await screen.findByText("5 colegas online");
    // Bruno saiu, Eva chegou com compatibilidade maior e a ordem mudou
    deckNow = deckOf([{ ...EVA, compat: 99 }, DIEGO, CARLA], { online: 7 });
    refreshByVisibility();
    await screen.findByText("7 colegas online");
    expect(within(topCard()).getByText("Carla Dias")).toBeTruthy();
    expect(screen.getByText("Próximo: Diego")).toBeTruthy();
    await press("ArrowLeft");
    await waitFor(() => expect(within(topCard()).getByText("Diego Reis")).toBeTruthy());
    expect(screen.getByText("Próximo: Eva")).toBeTruthy();
  });

  it("quem acabou de ser escolhido não volta se uma atualização atrasada ainda o trouxer", async () => {
    await openPractice();
    await screen.findByText("5 colegas online");
    await press("ArrowLeft");
    await waitFor(() => expect(rpcCalls("app_dupla_swipe")).toHaveLength(1));
    await waitFor(() => expect(within(topCard()).getByText("Bruno Lima")).toBeTruthy());
    deckNow = deckOf([CARLA, BRUNO, DIEGO]);
    refreshByVisibility();
    await flush();
    await flush();
    expect(within(topCard()).getByText("Bruno Lima")).toBeTruthy();
    expect(screen.queryByText("Carla Dias")).toBeNull();
  });

  it("sala aberta: 'Sala aberta com Bruno Lima' sem baralho; Sair da sala volta ao baralho", async () => {
    deckNow = deckOf([], { hidden_by_role: 0, open_room: { id: "sala-5", phase: "roles", partner_name: "Bruno Lima" } });
    await openPractice();
    expect(await screen.findByText("Sala aberta com Bruno Lima")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText("Nenhum colega compatível agora")).toBeNull();
    expect(screen.queryByRole("button", { name: "Estudar junto" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir sala agora" }));
    expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-5" });
    deckNow = deckOf([CARLA]);
    fireEvent.click(screen.getByRole("button", { name: "Sair da sala" }));
    await waitFor(() => expect(rpcCalls("app_dupla_leave")).toEqual([["app_dupla_leave", { p_room_id: "sala-5" }]]));
    await waitFor(() => expect(within(topCard()).getByText("Carla Dias")).toBeTruthy());
    expect(screen.queryByText(/Sala aberta com/)).toBeNull();
  });

  it("a dica de arraste fecha pelo botão 'Fechar dica' e na primeira escolha", async () => {
    await openPractice();
    await screen.findByText("5 colegas online");
    fireEvent.click(screen.getByRole("button", { name: "Fechar dica" }));
    expect(screen.queryByText("Arraste o cartão")).toBeNull();
    cleanup();
    await openPractice();
    await screen.findByText("Arraste o cartão");
    await press("ArrowLeft");
    await waitFor(() => expect(screen.queryByText("Arraste o cartão")).toBeNull());
  });

  it("sem colegas: mensagem de vazio, botões sem clique e o resumo zerado", async () => {
    deckNow = deckOf([], { hidden_by_role: 0, online: 0, matches_today: 0 });
    await openPractice();
    expect(await screen.findByText("0 colegas online")).toBeTruthy();
    expect(screen.getByText("Nenhum colega compatível agora")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pular" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Estudar junto" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("0 compatíveis")).toBeTruthy();
  });

  it("trocar o papel pede o baralho de novo e recomeça a pilha", async () => {
    loaded = { ...loaded, profile: { ...PROFILE, role_pref: "med" } };
    await openPractice();
    await screen.findByText("5 colegas online");
    deckNow = deckOf([EVA, DIEGO]);
    fireEvent.click(screen.getByRole("radio", { name: "Qualquer papel" }));
    await waitFor(() => expect(within(topCard()).getByText("Eva Prado")).toBeTruthy());
    expect(screen.queryByText("Carla Dias")).toBeNull();
  });

  it("falha ao carregar o baralho: mensagem com 'Tentar de novo'; o resto da tela continua", async () => {
    const base = backend.rpc.getMockImplementation();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_dupla_deck") throw new Error("Falha de rede.");
      return base(fn, args);
    });
    await openPractice();
    const retry = await screen.findByRole("button", { name: "Tentar de novo" });
    backend.rpc.mockImplementation(base);
    fireEvent.click(retry);
    await waitFor(() => expect(within(topCard()).getByText("Carla Dias")).toBeTruthy());
  });

  it("o baralho é consultado a cada 20 s no banco local", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    await openPracticeFake();
    const before = rpcCalls("app_dupla_deck").length;
    expect(before).toBeGreaterThanOrEqual(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19000);
    });
    expect(rpcCalls("app_dupla_deck")).toHaveLength(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(rpcCalls("app_dupla_deck")).toHaveLength(before + 1);
  });

  it("com tempo real: radar na Presença, colegas online da Presença e baralho a cada 30 s", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    let handlers: any;
    const handle = { track: vi.fn(), untrack: vi.fn(), close: vi.fn() };
    backend.subscribeInvites = vi.fn((_uid: string, h: any) => {
      handlers = h;
      return handle;
    });
    await openPracticeFake();
    await act(async () => {
      handlers.onStatus("SUBSCRIBED");
      handlers.onPresence([{ user_id: "x" }, { user_id: "y" }]);
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(handle.track).toHaveBeenCalledWith({ user_id: "u1", status: "livre" });
    expect(screen.getByText("2 colegas online")).toBeTruthy();
    const before = rpcCalls("app_dupla_deck").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });
    expect(rpcCalls("app_dupla_deck")).toHaveLength(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(rpcCalls("app_dupla_deck")).toHaveLength(before + 1);
  });

  it("som desligado em sz-sound não toca; o botão do modal alterna", async () => {
    localStorage.setItem("sz-sound", "off");
    swipeResult = { matched: true, room_id: "sala-6", partner: { user_id: "u-carla", public_name: "Carla Dias" } };
    await openPractice();
    await screen.findByText("5 colegas online");
    await press("ArrowRight");
    const dialog = await screen.findByRole("dialog");
    expect(sound.playMatchSound).toHaveBeenCalledTimes(1);
    expect(audio.of("osc")).toHaveLength(0); // com o som desligado nenhum tom é criado
    fireEvent.click(within(dialog).getByRole("button", { name: "Ativar som" }));
    expect(localStorage.getItem("sz-sound")).toBe("on");
    expect(audio.of("osc").length).toBeGreaterThan(0); // ao ligar, toca a fanfarra
    expect(sound.playMatchSound).toHaveBeenCalledTimes(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Desativar som" }));
    expect(localStorage.getItem("sz-sound")).toBe("off");
    expect(sound.playMatchSound).toHaveBeenCalledTimes(2);
    expect(within(dialog).getByRole("button", { name: "Ativar som" })).toBeTruthy();
  });

  it("nada do que ficou fora: Convite rápido, Agendar sessão, busca automática, lista de colegas (e 'Enviar mensagem' só no 'Deu match!')", async () => {
    await openPractice();
    await screen.findByText("5 colegas online");
    const text = document.body.textContent ?? "";
    for (const banned of ["Convite rápido", "Agendar sessão", "Enviar mensagem", "Busca automática", "WhatsApp", "Salas abertas", "Permitir convites", "Gabriela", "Tiago"]) {
      expect(text, banned).not.toContain(banned);
    }
  });
});

describe("Meu perfil de estudo com sinal e convite", () => {
  const openProfile = async () => {
    render(<StudyProfileScreen go={go} />);
    await screen.findByLabelText("Nome ou apelido");
  };

  it("sinal 'livre' na entrada e 'fora' ao sair; o convite abre o mesmo 'Deu match!' e aceitar abre a sala", async () => {
    invitesNow = [invite("inv-p", "sala-p", "Bruno Lima")];
    await openProfile();
    await waitFor(() => expect(rpcCalls("app_dupla_heartbeat")[0]).toEqual(["app_dupla_heartbeat", { p_status: "livre", p_room_id: null }]));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Deu match!")).toBeTruthy();
    expect(within(dialog).getByText("Você e Bruno querem treinar a 2ª fase. Combinem a primeira sessão.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir sala agora" }));
    await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "inv-p", p_accept: true }]]));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-aceita" }));
    cleanup();
    expect(rpcCalls("app_dupla_heartbeat").at(-1)).toEqual(["app_dupla_heartbeat", { p_status: "fora", p_room_id: null }]);
  });

  it("o radar do Perfil é o salvo, não o do rascunho", async () => {
    let handlers: any;
    const handle = { track: vi.fn(), untrack: vi.fn(), close: vi.fn() };
    backend.subscribeInvites = vi.fn((_uid: string, h: any) => {
      handlers = h;
      return handle;
    });
    await openProfile();
    await waitFor(() => expect(handle.track).toHaveBeenCalledWith({ user_id: "u1", status: "livre" }));
    handle.track.mockClear();
    handle.untrack.mockClear();
    // desligar o radar no formulário (sem salvar) não tira a pessoa da Presença
    fireEvent.click(screen.getByRole("switch", { name: /Aparecer no radar de duplas/ }));
    await flush();
    expect(handle.untrack).not.toHaveBeenCalled();
    expect(handlers).toBeTruthy();
  });

  it("sem perfil salvo: sem sinal, sem Presença e sem convite", async () => {
    loaded = { profile: null, defaults: { public_name: "Maria", exam: null }, stats: { done: 0, avg: null } };
    backend.subscribeInvites = vi.fn();
    await openProfile();
    await flush();
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(0);
    expect(rpcCalls("app_dupla_invites")).toHaveLength(0);
    expect(backend.subscribeInvites).not.toHaveBeenCalled();
  });
});
