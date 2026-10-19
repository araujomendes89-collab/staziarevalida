/**
 * Treino em Dupla · telas da cota de matches do aluno (jsdom): faixa do Praticar, aviso "Sua cota de matches acabou", erro ao aceitar
 * convite, linha da preparação da sala e leitura dos erros do banco. O banco é simulado pelo contrato de app_credit_state,
 * app_dupla_swipe (reason 'quota'), app_dupla_answer_invite e app_dupla_start. A tela nunca calcula saldo: só mostra o que o servidor devolve.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BackendError } from "../novo/data/backend";
import { messageOf } from "../novo/app/admin/common.jsx";

const backend: any = { rpc: vi.fn() };
const session: any = { backend, boot: { role: "student" }, user: { id: "u1" }, dupla: { aberto: true, permitido: true, equipe: false } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({
  playSkipSound: vi.fn(), playMatchSound: vi.fn(), playWhistle: vi.fn(), installAudioWake: vi.fn(), setSoundOn: vi.fn(), soundOn: () => false,
}));

import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";
import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";
import {
  ALREADY_IN_ROOM, CREDIT_LABEL, OWN_QUOTA_EMPTY, PAIR_UNAVAILABLE_TEXT, QUOTA_NOTE, QUOTA_TEXT, QUOTA_TITLE, START_REFUSED_TEXT, creditKind, renewLabel,
} from "../novo/app/dupla/credits.js";

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
const deckOf = (cards: any[], extra: Record<string, unknown> = {}) => ({
  cards, hidden_by_role: 0, online: 5, matches_today: 1, open_room: null, server_now: new Date().toISOString(), ...extra,
});
const invite = (id: string, roomId: string, name: string) => ({
  id, room_id: roomId, from: { user_id: "u-" + name.toLowerCase().split(" ")[0], public_name: name }, expires_at: new Date(Date.now() + 60000).toISOString(),
});
/** Valores distintos de propósito: nada além de `disponivel` pode aparecer na tela. */
const credit = (extra: Record<string, unknown> = {}) => ({
  ativa: true, ilimitado: false, limite_dia: 41, usados_hoje: 34, bonus: 17, comprados: 23, disponivel: 29, pool: "match", renova_em: "2026-10-18T03:00:00.000Z", ...extra,
});
const HIDDEN_NUMBERS = /\b(41|34|17|23)\b/;

let creditNow: any;
let creditError: boolean;
let deckNow: any;
let invitesNow: any[];
let swipeResult: any;
let answerError: any;
let go: any;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

function practiceServer() {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_credit_state") {
      if (creditError) throw new Error("falhou");
      return typeof creditNow === "function" ? creditNow() : creditNow;
    }
    if (fn === "app_dupla_profile") return { profile: PROFILE, defaults: null, stats: { done: 3, avg: 7.8 } };
    if (fn === "app_dupla_stations") return [];
    if (fn === "app_dupla_deck") return deckNow;
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: invitesNow, server_now: new Date().toISOString() };
    if (fn === "app_dupla_swipe") return swipeResult;
    if (fn === "app_dupla_answer_invite") {
      if (answerError) throw answerError;
      return { room_id: args.p_accept ? "sala-aceita" : null };
    }
    if (fn === "app_dupla_leave") return { id: args.p_room_id, phase: "closed" };
    throw new Error(`rpc não simulada: ${fn}`);
  });
}

beforeEach(() => {
  go = vi.fn();
  localStorage.clear();
  creditNow = credit();
  creditError = false;
  deckNow = deckOf([CARLA, BRUNO]);
  invitesNow = [];
  swipeResult = { matched: false };
  answerError = null;
  delete backend.subscribeInvites;
  practiceServer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openPractice() {
  render(
    <MemoryRouter initialEntries={["/dupla"]}>
      <PracticeScreen go={go} />
    </MemoryRouter>,
  );
  await screen.findByText("Como a compatibilidade é calculada");
  await screen.findByText("5 colegas online");
}
const pressRight = () => fireEvent.keyDown(window, { key: "ArrowRight" });
const readNumber = () => screen.getByTestId("credit-available").textContent;
const BUY = /compr|pagar|pagamento|assin|checkout|R\$/i;

describe("creditKind e hora da renovação", () => {
  it("decide pela dica do banco e, sem ela, pela mensagem", () => {
    expect(creditKind(new BackendError("unknown", "qualquer", "INSUFFICIENT_CREDITS"))).toBe("quota");
    expect(creditKind(new BackendError("unknown", "qualquer", "PAIR_UNAVAILABLE"))).toBe("pair");
    expect(creditKind(new Error("Sua cota de matches acabou"))).toBe("quota");
    expect(creditKind(new Error("Não foi possível formar a dupla agora."))).toBe("pair");
    expect(creditKind(new Error("Convite expirado (60 s)."))).toBeNull();
    expect(creditKind(new BackendError("network", "Failed to fetch"))).toBeNull();
    expect(creditKind(null)).toBeNull();
  });

  it("BackendError guarda a dica e continua igual sem ela; a dica-código não vaza para a mensagem da tela", () => {
    expect(new BackendError("unknown", "x", "H").hint).toBe("H");
    expect(new BackendError("unknown", "x").hint ?? null).toBeNull(); // no main a dica ausente é null
    expect(messageOf(new BackendError("unknown", QUOTA_TITLE, "INSUFFICIENT_CREDITS"))).toBe(QUOTA_TITLE);
    expect(messageOf(new BackendError("unknown", START_REFUSED_TEXT, "INSUFFICIENT_CREDITS"))).toBe(START_REFUSED_TEXT);
  });

  it("mostra a hora de Brasília: meia-noite ou 'às HHh'", () => {
    expect(renewLabel("2026-10-18T03:00:00.000Z")).toBe("Renova à meia-noite");
    expect(renewLabel("2026-10-18T08:00:00.000Z")).toBe("Renova às 05h");
    expect(renewLabel("2026-10-18T08:30:00.000Z")).toBe("Renova às 05h30");
    expect(renewLabel(null)).toBe("");
    expect(renewLabel("não é data")).toBe("");
  });
});

describe("Praticar: faixa da cota", () => {
  it("cota desligada: nada de cota na tela", async () => {
    creditNow = credit({ ativa: false });
    await openPractice();
    await waitFor(() => expect(rpcCalls("app_credit_state").length).toBeGreaterThan(0));
    expect(rpcCalls("app_credit_state")[0][1]).toEqual({ p_pool: "match" });
    expect(screen.queryByText(CREDIT_LABEL)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Renova/);
  });

  it("cota ligada: mostra só o número do servidor e a hora da renovação", async () => {
    await openPractice();
    await screen.findByText(CREDIT_LABEL);
    expect(readNumber()).toBe("29");
    expect(screen.getByText(/Renova à meia-noite/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(HIDDEN_NUMBERS);
  });

  it("usa a hora de renova_em quando não é meia-noite", async () => {
    creditNow = credit({ renova_em: "2026-10-18T08:00:00.000Z" });
    await openPractice();
    await screen.findByText(/Renova às 05h/);
  });

  it("ilimitado (equipe): nada de cota", async () => {
    creditNow = credit({ ilimitado: true, disponivel: 0 });
    await openPractice();
    await waitFor(() => expect(rpcCalls("app_credit_state").length).toBeGreaterThan(0));
    expect(screen.queryByText(CREDIT_LABEL)).toBeNull();
  });

  it("erro ao ler a cota: a tela segue normal e a cota não aparece", async () => {
    creditError = true;
    await openPractice();
    await waitFor(() => expect(rpcCalls("app_credit_state").length).toBeGreaterThan(0));
    expect(screen.queryByText(CREDIT_LABEL)).toBeNull();
    expect(within(screen.getByRole("article")).getByText("Carla Dias")).toBeTruthy();
  });

  it("com zero mostra o aviso no tom de atenção do app", async () => {
    creditNow = credit({ disponivel: 0 });
    await openPractice();
    await screen.findByText(CREDIT_LABEL);
    expect(readNumber()).toBe("0");
    expect(screen.getByTestId("credit-available").parentElement!.style.background).toBe("var(--warning-bg)");
  });

  it("o número só muda depois da resposta do servidor (nunca desconta antes)", async () => {
    let release: (v: any) => void = () => undefined;
    let reads = 0;
    creditNow = () => {
      reads += 1;
      if (reads === 1) return credit({ disponivel: 5 });
      return new Promise((resolve) => (release = resolve));
    };
    swipeResult = { matched: true, room_id: "sala-1", partner: { user_id: "u-carla", public_name: "Carla Dias" } };
    await openPractice();
    await screen.findByText(CREDIT_LABEL);
    expect(readNumber()).toBe("5");

    pressRight();
    await screen.findByText("Deu match!");
    await waitFor(() => expect(reads).toBe(2)); // a tela pediu a leitura nova...
    expect(readNumber()).toBe("5"); // ...mas sem a resposta o número não se mexe
    await act(async () => release(credit({ disponivel: 4 })));
    await waitFor(() => expect(readNumber()).toBe("4"));
  });

  it("relê ao voltar o foco da janela e uma leitura atrasada não sobrescreve a nova", async () => {
    let reads = 0;
    creditNow = () => credit({ disponivel: [8, 7][reads++] ?? 7 });
    await openPractice();
    await screen.findByText(CREDIT_LABEL);
    expect(readNumber()).toBe("8");
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(readNumber()).toBe("7"));
  });
});

describe("Praticar: sem cota ao escolher", () => {
  it("reason 'quota': abre o aviso, o cartão volta ao baralho, a cota é relida e não há compra nem preço", async () => {
    swipeResult = { matched: false, reason: "quota" };
    let reads = 0;
    creditNow = () => credit({ disponivel: [1, 0][reads++] ?? 0 });
    await openPractice();
    await screen.findByText(CREDIT_LABEL);
    pressRight();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(QUOTA_TITLE)).toBeTruthy();
    expect(within(dialog).getByText(QUOTA_TEXT)).toBeTruthy();
    expect(within(dialog).getByText(QUOTA_NOTE)).toBeTruthy();
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["Fechar"]);
    expect(dialog.textContent).not.toMatch(BUY);
    expect(dialog.querySelector("a")).toBeNull();
    // o cartão que foi escolhido volta ao topo e nada foi para o "Deu match!"
    expect(within(screen.getByRole("article")).getByText("Carla Dias")).toBeTruthy();
    await waitFor(() => expect(readNumber()).toBe("0"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.textContent).not.toMatch(/Deu match/);
  });

  it("sem cota o chat e 'Abrir sala agora' continuam funcionando", async () => {
    creditNow = credit({ disponivel: 0 });
    deckNow = deckOf([CARLA], { open_room: { id: "sala-9", partner_name: "Bruno Lima" } });
    await openPractice();
    await screen.findByText(CREDIT_LABEL);
    const chats = screen.getByRole("button", { name: "Conversas" }) as HTMLButtonElement;
    expect(chats.disabled).toBe(false);
    const open = screen.getByRole("button", { name: "Abrir sala agora" }) as HTMLButtonElement;
    expect(open.disabled).toBe(false);
    fireEvent.click(open);
    expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-9" });
  });
});

describe("Aceitar convite sem cota", () => {
  it("erro de cota (dica do banco): abre o aviso em vez de aviso curto", async () => {
    invitesNow = [invite("inv-1", "sala-7", "Bruno Lima")];
    answerError = new BackendError("unknown", "Sua cota de matches acabou", "INSUFFICIENT_CREDITS");
    await openPractice();
    const match = await screen.findByRole("dialog");
    fireEvent.click(within(match).getByRole("button", { name: "Abrir sala agora" }));
    await screen.findByText(QUOTA_TITLE);
    expect(screen.getByText(QUOTA_NOTE)).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: BUY })).toBeNull();
  });

  it("erro de cota sem dica (banco local): reconhece pela mensagem", async () => {
    invitesNow = [invite("inv-2", "sala-7", "Bruno Lima")];
    answerError = new Error("Sua cota de matches acabou");
    await openPractice();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abrir sala agora" }));
    await screen.findByText(QUOTA_TITLE);
  });

  it("PAIR_UNAVAILABLE: aviso neutro, sem diálogo de cota", async () => {
    invitesNow = [invite("inv-3", "sala-7", "Bruno Lima")];
    answerError = new BackendError("unknown", "mensagem interna qualquer", "PAIR_UNAVAILABLE");
    await openPractice();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abrir sala agora" }));
    expect(await screen.findByText(PAIR_UNAVAILABLE_TEXT)).toBeTruthy();
    expect(screen.queryByText(QUOTA_TITLE)).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });

  it("outros erros seguem como aviso do servidor", async () => {
    invitesNow = [invite("inv-4", "sala-7", "Bruno Lima")];
    answerError = new Error("Convite expirado (60 s).");
    await openPractice();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abrir sala agora" }));
    expect(await screen.findByText("Convite expirado (60 s).")).toBeTruthy();
    expect(screen.queryByText(QUOTA_TITLE)).toBeNull();
  });
});

describe("Sala em preparação", () => {
  const NOW = "2026-10-11T15:00:00.000Z";
  const STATION = { id: "teste-dupla-e01", name: "Estação de teste", area: "Clínica Médica", area_code: "CM", number: 3, edition: "2020", reapplication: false, institution: "INEP", duration_ms: 600000, is_pro_only: false };
  let room: any;
  let content: any;
  let startError: any;
  const fnCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  function setup(role: "evaluator" | "candidate") {
    const { id: _i, name: _n, ...candStation } = STATION;
    room = {
      id: "r1", rev: 1, phase: "setup", round: 1, server_now: NOW, station: role === "evaluator" ? STATION : candStation, duration_ms: 600000,
      me: { user_id: "u-ana", public_name: "Ana Souza", role, confirmed: true, connected: true, ready: true, picked_station: true },
      partner: { user_id: "u-bruno", public_name: "Bruno Lima", role: role === "evaluator" ? "candidate" : "evaluator", confirmed: true, connected: true, ready: true, seen_ms_ago: 1000 },
      match_note: null, invite_pending: false, call_link: null, started_at: null, ends_at: null, paused_left_ms: null, paused_at: null,
      finished_at: null, released_pressings: [], closed_reason: null, closed_by: null,
    };
    content =
      role === "evaluator"
        ? { role, station: { ...STATION, doctor_scene: "Cenário.", doctor_tasks: "1. Tarefa.", actor_script: "" }, pressing_count: 0, pressings: [], checklist_items: [] }
        : { role, station: { ...candStation, label: "Estação 3", doctor_scene: "Cenário.", doctor_tasks: "1. Tarefa.", candidate_sheet: { has_image: false } }, pressing_count: 0, pressings: [] };
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any = {}) => {
      if (fn === "app_credit_state") return creditNow;
      if (fn === "app_dupla_room") return args.p_since_rev != null && args.p_since_rev === room.rev ? null : { ...room, server_now: NOW };
      if (fn === "app_dupla_room_content") return content;
      if (fn === "app_dupla_marks") return [];
      if (fn === "app_dupla_heartbeat") return { server_now: NOW };
      if (fn === "app_dupla_start") throw startError;
      throw new Error(`rpc não simulada: ${fn}`);
    });
  }
  async function mount() {
    render(<RoomScreen roomId="r1" go={go} />);
    await advance(0);
    await advance(0);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    startError = new BackendError("unknown", START_REFUSED_TEXT, "INSUFFICIENT_CREDITS");
  });

  it("sem crédito: 'Sua cota de hoje acabou.' só para quem está sem crédito", async () => {
    creditNow = credit({ disponivel: 0 });
    setup("candidate");
    await mount();
    expect(screen.getByText(OWN_QUOTA_EMPTY)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(HIDDEN_NUMBERS);
    // sem a linha de cota nada é bloqueado: "Cancelar"/"Sair da sala" seguem ali
    expect((screen.getByRole("button", { name: "Sair da sala" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("com crédito, cota desligada ou ilimitado: a linha não aparece e a tela não traz saldo", async () => {
    for (const state of [credit({ disponivel: 29 }), credit({ ativa: false, disponivel: 0 }), credit({ ilimitado: true, disponivel: 0 })]) {
      creditNow = state;
      setup("candidate");
      await mount();
      expect(screen.queryByText(OWN_QUOTA_EMPTY)).toBeNull();
      expect(document.body.textContent).not.toMatch(/cota|saldo|\b29\b/i);
      expect(document.body.textContent).not.toMatch(HIDDEN_NUMBERS);
      cleanup();
    }
  });

  it("a tela do colega nunca traz o saldo ou o motivo dele", async () => {
    creditNow = credit({ disponivel: 0 });
    // fluxo simples: o ator com a estação vai direto à sala de trabalho; a linha da cota está na espera do candidato
    setup("candidate");
    room = { ...room, station: null, duration_ms: null, station_ready: true, porta: 1 };
    content = { role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true };
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Bruno Lima");
    expect(screen.getAllByText(OWN_QUOTA_EMPTY)).toHaveLength(1); // uma linha só, sobre mim
    const own = screen.getByText(OWN_QUOTA_EMPTY);
    expect(own.textContent).toBe(OWN_QUOTA_EMPTY);
    expect(own.textContent).not.toContain("Bruno");
    expect(text).not.toMatch(/Bruno Lima\s*(?:\(|:|-|·)?\s*(?:sem|com|cota|saldo|limite|disponível)/i);
  });

  it("início recusado: mensagem neutra do servidor e a preparação continua para os dois", async () => {
    creditNow = credit({ ativa: false });
    setup("evaluator");
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar estação" }));
    await advance(0);
    expect(fnCalls("app_dupla_start")).toHaveLength(1);
    expect(screen.getByText(START_REFUSED_TEXT)).toBeTruthy();
    expect(START_REFUSED_TEXT).not.toMatch(/\d/);
    // a sala não saiu da preparação: a tela do avaliador segue em "Aguardando início"
    expect(screen.getByText("Aguardando início")).toBeTruthy();
    expect(room.phase).toBe("setup");
  });
});

it("texto reservado para a futura trava de sala existe como constante", () => {
  expect(ALREADY_IN_ROOM).toBe("Você já está em uma sala.");
});
