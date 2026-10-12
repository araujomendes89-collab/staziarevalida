/**
 * Treinamento em Dupla · etapa 4 · tarefa 12: tempo real do Praticar (canal dupla:online, convites e sinal).
 * O Supabase e o banco são simulados pelo contrato da Tarefa 11 (app_dupla_heartbeat e app_dupla_invites); aqui só se confere
 * o canal, os hooks e a reserva por consulta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

// ---------- Supabase simulado ----------
type Handler = (payload?: any) => void;
const fake = vi.hoisted(() => {
  const state: { channels: any[]; client: any } = { channels: [], client: null };
  return state;
});

vi.mock("@supabase/supabase-js", () => {
  function makeChannel(name: string, opts: any) {
    const ch: any = {
      name,
      opts,
      handlers: [] as { type: string; filter: any; cb: Handler }[],
      statusCb: null as null | ((s: string) => void),
      presence: {} as Record<string, any[]>,
      track: vi.fn(async () => "ok"),
      untrack: vi.fn(async () => "ok"),
      on: vi.fn((type: string, filter: any, cb: Handler) => {
        ch.handlers.push({ type, filter, cb });
        return ch;
      }),
      subscribe: vi.fn((cb: (s: string) => void) => {
        ch.statusCb = cb;
        return ch;
      }),
      presenceState: vi.fn(() => ch.presence),
    };
    return ch;
  }
  const client = {
    auth: {},
    realtime: { setAuth: vi.fn(async () => undefined) },
    channel: vi.fn((name: string, opts: any) => {
      const ch = makeChannel(name, opts);
      fake.channels.push(ch);
      return ch;
    }),
    removeChannel: vi.fn(async () => "ok"),
  };
  fake.client = client;
  return { createClient: vi.fn(() => client) };
});

// ---------- Sessão simulada para os hooks ----------
const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, user: { id: "eu" } }) }));

import { createSupabaseBackend } from "../novo/data/supabaseBackend";
import { useDuplaChannel, useHeartbeat, useInvites } from "../novo/app/dupla/live.js";

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  fake.channels.length = 0;
  fake.client.channel.mockClear();
  fake.client.removeChannel.mockClear();
  fake.client.realtime.setAuth.mockClear();
  backend.rpc.mockReset();
  backend.rpc.mockResolvedValue({ server_now: "2026-10-12T12:00:00Z", invites: [] });
  delete backend.subscribeInvites;
  setVisibility("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("subscribeInvites (Supabase)", () => {
  function open(handlers: Partial<{ onInvite: any; onPresence: any; onStatus: any }> = {}) {
    const h = { onInvite: vi.fn(), onPresence: vi.fn(), onStatus: vi.fn(), ...handlers };
    const be = createSupabaseBackend("https://x.supabase.co", "anon", "http://localhost");
    const handle = be.subscribeInvites!("eu", h);
    return { h, handle };
  }

  it("canal privado dupla:online com presença por usuário e convites filtrados por to_user; close remove o canal", async () => {
    const { h, handle } = open();
    expect(fake.client.channel).toHaveBeenCalledTimes(1);
    const [name, opts] = fake.client.channel.mock.calls[0];
    expect(name).toBe("dupla:online");
    expect(opts.config.private).toBe(true);
    expect(opts.config.presence.key).toBe("eu");

    const ch = fake.channels[0];
    const inv = ch.handlers.find((x: any) => x.type === "postgres_changes");
    expect(inv.filter).toEqual({ event: "INSERT", schema: "public", table: "study_invites", filter: "to_user=eq.eu" });
    inv.cb({});
    expect(h.onInvite).toHaveBeenCalledTimes(1);

    // a autenticação do canal é pedida antes de assinar, sem argumento (usa o token da sessão)
    await vi.waitFor(() => expect(ch.subscribe).toHaveBeenCalledTimes(1));
    expect(fake.client.realtime.setAuth).toHaveBeenCalledWith();
    expect(fake.client.realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(ch.subscribe.mock.invocationCallOrder[0]);

    handle.close();
    expect(fake.client.removeChannel).toHaveBeenCalledWith(ch);
  });

  it("presença: cada 'sync' entrega os membros do canal (um por pessoa, com a situação)", async () => {
    const { h } = open();
    const ch = fake.channels[0];
    await vi.waitFor(() => expect(ch.subscribe).toHaveBeenCalled());
    ch.presence = {
      eu: [{ user_id: "eu", status: "livre", presence_ref: "a" }],
      bia: [
        { user_id: "bia", status: "livre", presence_ref: "b" },
        { user_id: "bia", status: "em_estacao", presence_ref: "c" },
      ],
    };
    ch.handlers.find((x: any) => x.type === "presence").cb();
    expect(ch.handlers.find((x: any) => x.type === "presence").filter).toEqual({ event: "sync" });
    const members = h.onPresence.mock.calls.at(-1)[0];
    expect(members.map((m: any) => m.user_id).sort()).toEqual(["bia", "eu"]);
    expect(members.find((m: any) => m.user_id === "bia").status).toBe("livre");
  });

  it("track espera a conexão: guarda o que foi pedido e envia ao assinar; untrack tira", async () => {
    const { h, handle } = open();
    const ch = fake.channels[0];
    await vi.waitFor(() => expect(ch.subscribe).toHaveBeenCalled());
    handle.track({ user_id: "eu", status: "livre" });
    expect(ch.track).not.toHaveBeenCalled();

    act(() => ch.statusCb("SUBSCRIBED"));
    expect(h.onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    expect(ch.track).toHaveBeenCalledWith({ user_id: "eu", status: "livre" });

    // reconexão: o que estava marcado volta a ser enviado
    ch.track.mockClear();
    act(() => ch.statusCb("SUBSCRIBED"));
    expect(ch.track).toHaveBeenCalledTimes(1);

    handle.untrack();
    expect(ch.untrack).toHaveBeenCalledTimes(1);
    ch.track.mockClear();
    act(() => ch.statusCb("SUBSCRIBED"));
    expect(ch.track).not.toHaveBeenCalled();
  });

  it("repassa os estados de erro do canal", async () => {
    const { h } = open();
    const ch = fake.channels[0];
    await vi.waitFor(() => expect(ch.subscribe).toHaveBeenCalled());
    for (const s of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) act(() => ch.statusCb(s));
    expect(h.onStatus.mock.calls.map((c: any[]) => c[0])).toEqual(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);
  });

  it("fechar antes de a autenticação voltar não assina o canal; falha na autenticação vira CHANNEL_ERROR", async () => {
    let release: () => void = () => {};
    fake.client.realtime.setAuth.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const first = open();
    first.handle.close();
    release();
    await flush();
    expect(fake.channels[0].subscribe).not.toHaveBeenCalled();
    expect(fake.client.removeChannel).toHaveBeenCalledTimes(1);

    fake.client.realtime.setAuth.mockRejectedValueOnce(new Error("sem sessão"));
    const second = open();
    await vi.waitFor(() => expect(second.h.onStatus).toHaveBeenCalledWith("CHANNEL_ERROR"));
    expect(fake.channels[1].subscribe).not.toHaveBeenCalled();
  });

  it("depois de close nenhum aviso chega", async () => {
    const { h, handle } = open();
    const ch = fake.channels[0];
    await vi.waitFor(() => expect(ch.subscribe).toHaveBeenCalled());
    handle.close();
    ch.handlers.find((x: any) => x.type === "postgres_changes").cb({});
    act(() => ch.statusCb("SUBSCRIBED"));
    expect(h.onInvite).not.toHaveBeenCalled();
    expect(h.onStatus).not.toHaveBeenCalled();
    expect(ch.track).not.toHaveBeenCalled();
  });
});

describe("useHeartbeat", () => {
  beforeEach(() => vi.useFakeTimers());

  it("sinal na entrada, a cada 45 s, ao voltar a aba e 'fora' ao sair", async () => {
    const { unmount } = renderHook(() => useHeartbeat("livre"));
    await flush();
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(1);
    expect(rpcCalls("app_dupla_heartbeat")[0][1]).toEqual({ p_status: "livre", p_room_id: null });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(44_000);
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(2);

    // aba escondida não manda; ao voltar manda na hora
    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(2);
    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(3);

    unmount();
    const calls = rpcCalls("app_dupla_heartbeat");
    expect(calls).toHaveLength(4);
    expect(calls[3][1]).toEqual({ p_status: "fora", p_room_id: null });

    // depois de sair, o relógio não manda mais nada
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(4);
  });

  it("'fora' também ao fechar ou esconder a página (pagehide); a sala vai junto no sinal da sala", async () => {
    renderHook(() => useHeartbeat("em_estacao", "sala-1", 10_000));
    await flush();
    expect(rpcCalls("app_dupla_heartbeat")[0][1]).toEqual({ p_status: "em_estacao", p_room_id: "sala-1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(2);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const last = rpcCalls("app_dupla_heartbeat").at(-1)[1];
    expect(last).toEqual({ p_status: "fora", p_room_id: null });
  });

  it("mudar a situação manda o novo sinal sem passar por 'fora'", async () => {
    const { rerender } = renderHook(({ s }) => useHeartbeat(s), { initialProps: { s: "livre" as "livre" | "em_estacao" } });
    await flush();
    rerender({ s: "em_estacao" });
    await flush();
    expect(rpcCalls("app_dupla_heartbeat").map((c: any[]) => c[1].p_status)).toEqual(["livre", "em_estacao"]);
  });

  it("erro no sinal não derruba a tela nem o relógio", async () => {
    backend.rpc.mockRejectedValue(new Error("rede"));
    renderHook(() => useHeartbeat("livre"));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(rpcCalls("app_dupla_heartbeat")).toHaveLength(2);
  });
});

describe("useDuplaChannel", () => {
  function withChannel() {
    const handle = { track: vi.fn(), untrack: vi.fn(), close: vi.fn() };
    let h: any = null;
    backend.subscribeInvites = vi.fn((_uid: string, handlers: any) => {
      h = handlers;
      return handle;
    });
    return { handle, handlers: () => h };
  }

  it("sem os métodos de assinatura (banco local): nada de canal", () => {
    const { result } = renderHook(() => useDuplaChannel({ radar: true }));
    expect(result.current).toEqual({ onlineIds: null, inviteTick: 0, live: false });
  });

  it("track com radar, untrack sem radar", () => {
    const { handle } = withChannel();
    const { rerender } = renderHook(({ radar }) => useDuplaChannel({ radar }), { initialProps: { radar: true } });
    expect(backend.subscribeInvites).toHaveBeenCalledTimes(1);
    expect(backend.subscribeInvites.mock.calls[0][0]).toBe("eu");
    expect(handle.track).toHaveBeenCalledWith({ user_id: "eu", status: "livre" });
    rerender({ radar: false });
    expect(handle.untrack).toHaveBeenCalled();
    // ligar e desligar o radar não abre outro canal
    rerender({ radar: true });
    expect(backend.subscribeInvites).toHaveBeenCalledTimes(1);
    expect(handle.track).toHaveBeenCalledTimes(2);
  });

  it("onlineIds sem mim; live só com o canal ligado; convite sobe o inviteTick", () => {
    const { handlers } = withChannel();
    const { result } = renderHook(() => useDuplaChannel({ radar: true }));
    expect(result.current.onlineIds).toBeNull();
    expect(result.current.live).toBe(false);

    act(() => handlers().onStatus("SUBSCRIBED"));
    expect(result.current.live).toBe(true);
    act(() =>
      handlers().onPresence([
        { user_id: "eu", status: "livre" },
        { user_id: "bia", status: "livre" },
        { user_id: "caio", status: "em_estacao" },
      ]),
    );
    expect([...(result.current.onlineIds as Set<string>)].sort()).toEqual(["bia", "caio"]);

    expect(result.current.inviteTick).toBe(0);
    act(() => handlers().onInvite());
    act(() => handlers().onInvite());
    expect(result.current.inviteTick).toBe(2);
  });

  it("sair da tela fecha o canal", () => {
    const { handle } = withChannel();
    const { unmount } = renderHook(() => useDuplaChannel({ radar: true }));
    unmount();
    expect(handle.untrack).toHaveBeenCalled();
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it("canal com erro volta à consulta periódica (live falso)", () => {
    const { handlers } = withChannel();
    const { result } = renderHook(() => useDuplaChannel({ radar: true }));
    act(() => handlers().onStatus("SUBSCRIBED"));
    expect(result.current.live).toBe(true);
    for (const s of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"] as const) {
      act(() => handlers().onStatus("SUBSCRIBED"));
      act(() => handlers().onStatus(s));
      expect(result.current.live).toBe(false);
    }
  });
});

describe("useInvites", () => {
  const INVITE = { id: "c1", room_id: "r1", from: { user_id: "bia", public_name: "Bia Lima" }, expires_at: "2026-10-12T12:01:00Z" };
  beforeEach(() => {
    vi.useFakeTimers();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_dupla_invites") return { invites: [INVITE], server_now: "2026-10-12T12:00:00Z" };
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });

  it("banco local: consulta na entrada e a cada 5 s", async () => {
    const { result } = renderHook(() => useInvites(0, false));
    await flush();
    expect(rpcCalls("app_dupla_invites")).toHaveLength(1);
    expect(result.current.invites).toEqual([INVITE]);
    expect(result.current.serverNow).toBe("2026-10-12T12:00:00Z");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(rpcCalls("app_dupla_invites")).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(rpcCalls("app_dupla_invites")).toHaveLength(4);
  });

  it("com tempo real: consulta no aviso e a cada 30 s, não a cada 5 s", async () => {
    const { rerender } = renderHook(({ tick }) => useInvites(tick, true), { initialProps: { tick: 0 } });
    await flush();
    expect(rpcCalls("app_dupla_invites")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(rpcCalls("app_dupla_invites")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(rpcCalls("app_dupla_invites")).toHaveLength(2);

    rerender({ tick: 1 });
    await flush();
    expect(rpcCalls("app_dupla_invites")).toHaveLength(3);
  });

  it("ao voltar a aba e ao voltar a rede consulta de novo", async () => {
    renderHook(() => useInvites(0, true));
    await flush();
    const before = rpcCalls("app_dupla_invites").length;
    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rpcCalls("app_dupla_invites")).toHaveLength(before);
    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(rpcCalls("app_dupla_invites")).toHaveLength(before + 1);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();
    expect(rpcCalls("app_dupla_invites")).toHaveLength(before + 2);
  });

  it("refresh consulta na hora; erro mantém a lista anterior; resposta velha não vence a nova", async () => {
    const { result } = renderHook(() => useInvites(0, true));
    await flush();
    expect(result.current.invites).toHaveLength(1);

    backend.rpc.mockRejectedValueOnce(new Error("rede"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.invites).toHaveLength(1);

    let slow: (v: any) => void = () => {};
    backend.rpc.mockImplementationOnce(() => new Promise((r) => (slow = r)));
    backend.rpc.mockResolvedValueOnce({ invites: [], server_now: "2026-10-12T12:00:20Z" });
    let p1: Promise<void> = Promise.resolve();
    act(() => {
      p1 = result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.invites).toEqual([]);
    await act(async () => {
      slow({ invites: [INVITE], server_now: "2026-10-12T12:00:10Z" });
      await p1;
    });
    expect(result.current.invites).toEqual([]);
    expect(result.current.serverNow).toBe("2026-10-12T12:00:20Z");
  });

  it("sair da tela para o relógio", async () => {
    const { unmount } = renderHook(() => useInvites(0, false));
    await flush();
    unmount();
    const n = rpcCalls("app_dupla_invites").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(rpcCalls("app_dupla_invites")).toHaveLength(n);
  });
});
