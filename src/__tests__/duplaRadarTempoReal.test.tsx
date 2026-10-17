/**
 * Treinamento em Dupla · radar: tempo real e avisos (jsdom, relógio falso onde há tempo).
 *  - useRadar (live.js): consulta na entrada, a cada 20 s (30 s com canal ao vivo), ao voltar a aba e a rede, quando a Presença muda
 *    (no máximo 1 consulta a cada 5 s), erro mantém a lista, resposta atrasada não vence a nova, trocar a aba limpa a lista.
 *  - InviteWatcher (MatchModal.jsx): convite direto, "Deu match!" e pedido de treino por link.
 * Todas as pessoas são de TESTE.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u-eu" } }) }));
vi.mock("../novo/app/dupla/sound.js", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, playMatchSound: vi.fn(), installAudioWake: vi.fn() };
});

import { useRadar } from "../novo/app/dupla/live.js";
import { InviteWatcher } from "../novo/app/dupla/MatchModal.jsx";
import * as sound from "../novo/app/dupla/sound.js";

const FAKE = ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] as const;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const person = (id: string, name: string) => ({ user_id: id, public_name: name, state: "livre", compat: 80, can_invite: true });
const body = (people: any[], extra: Record<string, unknown> = {}) => ({ people, online: people.length, needs_city: false, open_room: null, me: { radar_visible: true }, ...extra });
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ------------------------------------------------------------------------------------------------------------ useRadar
describe("useRadar", () => {
  type Props = { stationId?: string | null; aba?: "online" | "atores" | "perto"; onlineIds?: Set<string> | null; live?: boolean };
  let answer: (args: any) => any;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    answer = () => body([person("u-um", "Colega Teste Um")]);
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_dupla_radar") return answer(args);
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });

  async function mount(initial: Props = {}) {
    const hook = renderHook((p: Props) => useRadar(p), { initialProps: initial });
    await flush(0);
    return hook;
  }
  const radarCalls = () => rpcCalls("app_dupla_radar");

  it("consulta na entrada, com a estação e a aba", async () => {
    const { result } = await mount({ stationId: "est-teste-1", aba: "atores" });
    expect(radarCalls()).toEqual([["app_dupla_radar", { p_station_id: "est-teste-1", p_aba: "atores" }]]);
    expect(result.current.loading).toBe(false);
    expect(result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Um"]);
    expect(result.current.online).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("sem canal ao vivo refaz a cada 20 s", async () => {
    await mount();
    expect(radarCalls()).toHaveLength(1);
    await flush(19000);
    expect(radarCalls()).toHaveLength(1);
    await flush(1500);
    expect(radarCalls()).toHaveLength(2);
    await flush(20000);
    expect(radarCalls()).toHaveLength(3);
  });

  it("com canal ao vivo refaz a cada 30 s", async () => {
    await mount({ live: true });
    await flush(25000);
    expect(radarCalls()).toHaveLength(1);
    await flush(5500);
    expect(radarCalls()).toHaveLength(2);
    await flush(30000);
    expect(radarCalls()).toHaveLength(3);
  });

  it("trocar de sem canal para ao vivo troca o relógio", async () => {
    const hook = await mount({ live: false });
    hook.rerender({ live: true });
    await flush(0);
    const base = radarCalls().length;
    await flush(21000);
    expect(radarCalls()).toHaveLength(base);
    await flush(10000);
    expect(radarCalls()).toHaveLength(base + 1);
  });

  it("refaz ao voltar a aba (visibilitychange), mas não enquanto ela está escondida", async () => {
    await mount();
    expect(radarCalls()).toHaveLength(1);
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(0);
    expect(radarCalls()).toHaveLength(2);
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(0);
    expect(radarCalls()).toHaveLength(2);
    spy.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(0);
    expect(radarCalls()).toHaveLength(3);
    spy.mockRestore();
  });

  it("refaz ao voltar a rede (online)", async () => {
    await mount();
    window.dispatchEvent(new Event("online"));
    await flush(0);
    expect(radarCalls()).toHaveLength(2);
  });

  it("quando a Presença muda refaz, agrupando: no máximo 1 consulta a cada 5 s", async () => {
    const hook = await mount({ onlineIds: new Set(["a"]), live: true }); // a 1ª Presença é só o ponto de partida
    expect(radarCalls()).toHaveLength(1);
    await flush(1000);
    hook.rerender({ onlineIds: new Set(["a", "b"]), live: true });
    await flush(1000);
    hook.rerender({ onlineIds: new Set(["a", "b", "c"]), live: true });
    await flush(1000);
    hook.rerender({ onlineIds: new Set(["b", "c"]), live: true });
    await flush(1500); // t = 4,5 s desde a última consulta
    expect(radarCalls()).toHaveLength(1);
    await flush(1000); // t = 5,5 s: uma só consulta para as três mudanças
    expect(radarCalls()).toHaveLength(2);
    await flush(3000);
    expect(radarCalls()).toHaveLength(2);
  });

  it("a mesma Presença (outro Set, mesmos ids) não consulta", async () => {
    const hook = await mount({ onlineIds: new Set(["a", "b"]), live: true });
    hook.rerender({ onlineIds: new Set(["b", "a"]), live: true });
    await flush(6000);
    expect(radarCalls()).toHaveLength(1);
  });

  it("Presença que muda depois de mais de 5 s sem consulta refaz na hora", async () => {
    const hook = await mount({ onlineIds: new Set(["a"]), live: true });
    await flush(8000);
    expect(radarCalls()).toHaveLength(1);
    hook.rerender({ onlineIds: new Set(["a", "b"]), live: true });
    await flush(10);
    expect(radarCalls()).toHaveLength(2);
  });

  it("sem Presença (onlineIds nulo) nada de consulta extra", async () => {
    const hook = await mount({ onlineIds: null });
    hook.rerender({ onlineIds: null });
    await flush(4000);
    expect(radarCalls()).toHaveLength(1);
  });

  it("erro mantém a lista anterior e guarda o erro; a próxima consulta boa limpa o erro", async () => {
    const { result } = await mount();
    expect(result.current.people).toHaveLength(1);
    answer = () => {
      throw new Error("Falha de rede.");
    };
    await flush(20500);
    expect(result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Um"]);
    expect(result.current.error?.message).toBe("Falha de rede.");
    expect(result.current.loading).toBe(false);
    answer = () => body([person("u-dois", "Colega Teste Dois")]);
    await flush(20000);
    expect(result.current.error).toBeNull();
    expect(result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Dois"]);
  });

  it("resposta atrasada de uma consulta antiga nunca vence a mais nova", async () => {
    const pending: Array<(v: any) => void> = [];
    backend.rpc.mockImplementation(
      (fn: string) =>
        new Promise((resolve) => {
          if (fn === "app_dupla_radar") pending.push(resolve);
        }),
    );
    const hook = renderHook((p: Props) => useRadar(p), { initialProps: {} as Props });
    await flush(0);
    expect(pending).toHaveLength(1); // consulta velha (a da entrada)
    await act(async () => {
      void hook.result.current.refresh();
    });
    expect(pending).toHaveLength(2); // consulta nova
    await act(async () => {
      pending[1](body([person("u-novo", "Colega Teste Novo")]));
    });
    expect(hook.result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Novo"]);
    await act(async () => {
      pending[0](body([person("u-velho", "Colega Teste Velho")]));
    });
    expect(hook.result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Novo"]);
    expect(hook.result.current.loading).toBe(false);
  });

  it("erro atrasado de uma consulta antiga também não derruba a lista nova", async () => {
    const pending: Array<{ resolve: (v: any) => void; reject: (e: Error) => void }> = [];
    backend.rpc.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    );
    const hook = renderHook((p: Props) => useRadar(p), { initialProps: {} as Props });
    await flush(0);
    await act(async () => {
      void hook.result.current.refresh();
    });
    await act(async () => {
      pending[1].resolve(body([person("u-novo", "Colega Teste Novo")]));
    });
    await act(async () => {
      pending[0].reject(new Error("Falha antiga."));
    });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.people).toHaveLength(1);
  });

  it("trocar a aba limpa a lista, mostra 'carregando' e consulta de novo com o novo p_aba", async () => {
    const pending: Array<(v: any) => void> = [];
    let hold = false;
    backend.rpc.mockImplementation((fn: string, args: any) => {
      if (fn !== "app_dupla_radar") return Promise.reject(new Error("rpc não simulada"));
      if (hold) return new Promise((resolve) => pending.push(resolve));
      return Promise.resolve(args.p_aba === "online" ? body([person("u-um", "Colega Teste Um")]) : body([person("u-ator", "Colega Teste Ator")]));
    });
    const hook = renderHook((p: Props) => useRadar(p), { initialProps: { aba: "online" } as Props });
    await flush(0);
    expect(hook.result.current.people).toHaveLength(1);
    hold = true;
    hook.rerender({ aba: "atores" });
    await flush(0);
    expect(hook.result.current.people).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
    expect(radarCalls().at(-1)).toEqual(["app_dupla_radar", { p_station_id: null, p_aba: "atores" }]);
    await act(async () => {
      pending[0](body([person("u-ator", "Colega Teste Ator")], { needs_city: false }));
    });
    expect(hook.result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Ator"]);
    expect(hook.result.current.loading).toBe(false);
  });

  it("resposta da aba antiga que chega depois da troca é ignorada", async () => {
    const pending: Array<(v: any) => void> = [];
    backend.rpc.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const hook = renderHook((p: Props) => useRadar(p), { initialProps: { aba: "online" } as Props });
    await flush(0);
    hook.rerender({ aba: "perto" });
    await flush(0);
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[1](body([person("u-perto", "Colega Teste Perto")]));
    });
    await act(async () => {
      pending[0](body([person("u-online", "Colega Teste Online")]));
    });
    expect(hook.result.current.people.map((p: any) => p.public_name)).toEqual(["Colega Teste Perto"]);
  });

  it("needs_city e sala aberta vêm da resposta", async () => {
    answer = () => body([], { needs_city: true, open_room: { id: "sala-1", partner_name: "Colega Teste Um" } });
    const { result } = await mount({ aba: "perto" });
    expect(result.current.needsCity).toBe(true);
    expect(result.current.openRoom).toEqual({ id: "sala-1", partner_name: "Colega Teste Um" });
    expect(result.current.people).toEqual([]);
  });

  it("ao sair da tela os relógios e ouvintes são desfeitos", async () => {
    const hook = await mount();
    hook.unmount();
    const before = radarCalls().length;
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(60000);
    expect(radarCalls()).toHaveLength(before);
  });
});

// ------------------------------------------------------------------------------------------------------- InviteWatcher
describe("InviteWatcher · convite direto, 'Deu match!' e pedido de treino", () => {
  let invitesNow: any[];
  let requestsNow: any[];
  let go: any;
  let answerInviteError: Error | null;
  let answerRequestError: Error | null;

  const station = (extra: Record<string, unknown> = {}) => ({ label: "Estação 7", name: "NOME-SECRETO-DA-ESTACAO", area: "Ginecologia e Obstetrícia", duration_ms: 600000, ...extra });
  const direct = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, room_id: `sala-${id}`, kind: "direto", from: { user_id: `u-${id}`, public_name: name }, station: station(), expires_at: new Date(Date.now() + 60000).toISOString(), ...extra,
  });
  const request = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, from: { user_id: `u-${id}`, public_name: name, handle: "colega.pedido" }, station: station({ label: "Estação 4" }), expires_at: new Date(Date.now() + 86400000).toISOString(), ...extra,
  });

  beforeEach(() => {
    go = vi.fn();
    invitesNow = [];
    requestsNow = [];
    answerInviteError = null;
    answerRequestError = null;
    vi.mocked(sound.playMatchSound).mockClear();
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_dupla_invites") return { invites: invitesNow, server_now: new Date().toISOString() };
      if (fn === "app_dupla_requests") return { requests: requestsNow };
      if (fn === "app_dupla_answer_invite") {
        if (answerInviteError) throw answerInviteError;
        return { room_id: args.p_accept ? "sala-aceita" : null };
      }
      if (fn === "app_dupla_answer_request") {
        if (answerRequestError) throw answerRequestError;
        return { room_id: args.p_accept ? "sala-do-pedido" : null };
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });

  const mountWatcher = () => render(<InviteWatcher go={go} meName="Eu Teste" inviteTick={0} live={false} />);

  describe("convite direto", () => {
    it("abre 'X convidou você para treinar' com Estação N, área e minutos, sem o nome da estação e sem 'Deu match!'", async () => {
      invitesNow = [direct("d1", "Colega Teste Um")];
      mountWatcher();
      const dialog = await screen.findByRole("dialog", { name: "Colega Teste Um convidou você para treinar" });
      expect(within(dialog).getByText("Estação 7")).toBeTruthy();
      expect(within(dialog).getByText("Ginecologia e Obstetrícia")).toBeTruthy();
      expect(within(dialog).getByText("10 min")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Aceitar" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Agora não" })).toBeTruthy();
      expect(document.body.textContent).not.toContain("NOME-SECRETO-DA-ESTACAO");
      expect(screen.queryByText("Deu match!")).toBeNull();
      expect(screen.queryByRole("dialog", { name: "Deu match!" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Abrir sala agora" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Continuar buscando" })).toBeNull();
      // o som é o do aviso (desligável), tocado uma vez
      expect(sound.playMatchSound).toHaveBeenCalledTimes(1);
    });

    it("sem estação no convite: 'A estação se escolhe na sala.'", async () => {
      invitesNow = [direct("d2", "Colega Teste Um", { station: null })];
      mountWatcher();
      expect(await screen.findByText("A estação se escolhe na sala.")).toBeTruthy();
    });

    it("'Aceitar' chama app_dupla_answer_invite com p_accept true e vai à sala", async () => {
      invitesNow = [direct("d3", "Colega Teste Um")];
      mountWatcher();
      fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
      await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-aceita" }));
      expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "d3", p_accept: true }]]);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("'Agora não' chama com p_accept false e não vai à sala", async () => {
      invitesNow = [direct("d4", "Colega Teste Um")];
      mountWatcher();
      fireEvent.click(await screen.findByRole("button", { name: "Agora não" }));
      await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "d4", p_accept: false }]]));
      expect(go).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("a tecla Esc vale 'Agora não'", async () => {
      invitesNow = [direct("d5", "Colega Teste Um")];
      mountWatcher();
      await screen.findByRole("dialog");
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "d5", p_accept: false }]]));
      expect(go).not.toHaveBeenCalled();
    });

    it("erro do servidor ao responder vira aviso e o convite sai da tela", async () => {
      invitesNow = [direct("d6", "Colega Teste Um")];
      answerInviteError = new Error("Convite expirado (60 s).");
      mountWatcher();
      fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
      expect(await screen.findByText("Convite expirado (60 s).")).toBeTruthy();
      expect(go).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("a contagem 'O convite expira em N s' diminui a cada segundo", async () => {
      vi.useFakeTimers({ toFake: [...FAKE] });
      invitesNow = [direct("d7", "Colega Teste Um")];
      mountWatcher();
      await flush(50);
      const bar = () => screen.getByRole("progressbar", { name: "O convite expira em" });
      expect(screen.getByText("O convite expira em")).toBeTruthy();
      const first = Number(bar().getAttribute("aria-valuenow"));
      expect(first).toBeGreaterThanOrEqual(59);
      expect(first).toBeLessThanOrEqual(60);
      await flush(10000);
      const later = Number(bar().getAttribute("aria-valuenow"));
      expect(later).toBeLessThan(first);
      expect(later).toBeGreaterThanOrEqual(49);
      expect(later).toBeLessThanOrEqual(51);
      expect(screen.getByText(`${later} s`)).toBeTruthy();
      await flush(20000);
      expect(Number(bar().getAttribute("aria-valuenow"))).toBeLessThan(later);
    });

    it("o convite que vence sai da tela sozinho", async () => {
      vi.useFakeTimers({ toFake: [...FAKE] });
      invitesNow = [direct("d8", "Colega Teste Um", { expires_at: new Date(Date.now() + 5000).toISOString() })];
      mountWatcher();
      await flush(50);
      expect(screen.getByRole("dialog")).toBeTruthy();
      await flush(5500);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(rpcCalls("app_dupla_answer_invite")).toHaveLength(0);
    });
  });

  describe("convite do match", () => {
    it("kind 'match' continua mostrando 'Deu match!' e não a janela do convite direto", async () => {
      invitesNow = [direct("m1", "Colega Teste Dois", { kind: "match", station: null })];
      mountWatcher();
      expect(await screen.findByRole("dialog", { name: "Deu match!" })).toBeTruthy();
      expect(screen.getByText("Deu match!")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Abrir sala agora" })).toBeTruthy();
      expect(screen.queryByText(/convidou você para treinar/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Abrir sala agora" }));
      await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-aceita" }));
      expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "m1", p_accept: true }]]);
    });

    it("convite sem kind (antigo) também é 'Deu match!'", async () => {
      const { kind: _kind, ...old } = direct("m2", "Colega Teste Dois") as any;
      invitesNow = [old];
      mountWatcher();
      expect(await screen.findByRole("dialog", { name: "Deu match!" })).toBeTruthy();
    });
  });

  describe("pedido de treino por link", () => {
    it("mostra '{nome} pediu para treinar com você' com @ e estação sem nome", async () => {
      requestsNow = [request("r1", "Colega Teste Pedido")];
      mountWatcher();
      const dialog = await screen.findByRole("dialog", { name: "Colega Teste Pedido pediu para treinar com você" });
      expect(within(dialog).getByText("@colega.pedido")).toBeTruthy();
      expect(within(dialog).getByText("Estação 4")).toBeTruthy();
      expect(within(dialog).getByText("Ginecologia e Obstetrícia")).toBeTruthy();
      expect(within(dialog).getByText("10 min")).toBeTruthy();
      expect(document.body.textContent).not.toContain("NOME-SECRETO-DA-ESTACAO");
      expect(screen.queryByText("Deu match!")).toBeNull();
    });

    it("'Aceitar' chama app_dupla_answer_request com p_accept true e vai à sala", async () => {
      requestsNow = [request("r2", "Colega Teste Pedido")];
      mountWatcher();
      fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
      await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-do-pedido" }));
      expect(rpcCalls("app_dupla_answer_request")).toEqual([["app_dupla_answer_request", { p_request_id: "r2", p_accept: true }]]);
      expect(rpcCalls("app_dupla_answer_invite")).toHaveLength(0);
    });

    it("'Agora não' chama com p_accept false", async () => {
      requestsNow = [request("r3", "Colega Teste Pedido")];
      mountWatcher();
      fireEvent.click(await screen.findByRole("button", { name: "Agora não" }));
      await waitFor(() => expect(rpcCalls("app_dupla_answer_request")).toEqual([["app_dupla_answer_request", { p_request_id: "r3", p_accept: false }]]));
      expect(go).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("Esc só fecha o aviso e NÃO responde ao pedido", async () => {
      requestsNow = [request("r4", "Colega Teste Pedido")];
      mountWatcher();
      await screen.findByRole("dialog");
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(rpcCalls("app_dupla_answer_request")).toHaveLength(0);
      expect(rpcCalls("app_dupla_answer_invite")).toHaveLength(0);
      expect(go).not.toHaveBeenCalled();
    });

    it("com um convite na tela o pedido espera; quando o convite sai, o pedido aparece", async () => {
      invitesNow = [direct("d9", "Colega Teste Um")];
      requestsNow = [request("r5", "Colega Teste Pedido")];
      mountWatcher();
      await screen.findByRole("dialog", { name: "Colega Teste Um convidou você para treinar" });
      expect(screen.queryByText(/pediu para treinar com você/)).toBeNull();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
      expect(await screen.findByRole("dialog", { name: "Colega Teste Pedido pediu para treinar com você" })).toBeTruthy();
      expect(rpcCalls("app_dupla_answer_request")).toHaveLength(0);
    });

    it("erro do servidor vira aviso e o pedido sai da tela", async () => {
      requestsNow = [request("r6", "Colega Teste Pedido")];
      answerRequestError = new Error("Este pedido já foi respondido.");
      mountWatcher();
      fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
      expect(await screen.findByText("Este pedido já foi respondido.")).toBeTruthy();
      expect(go).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("pedido vencido não aparece", async () => {
      requestsNow = [request("r7", "Colega Teste Pedido", { expires_at: new Date(Date.now() - 1000).toISOString() })];
      mountWatcher();
      await waitFor(() => expect(rpcCalls("app_dupla_requests").length).toBeGreaterThan(0));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
