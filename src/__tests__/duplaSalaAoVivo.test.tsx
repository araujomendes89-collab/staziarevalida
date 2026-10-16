/**
 * Treinamento em Dupla · etapa 5 · tarefa 15: estado da sala ao vivo. O tempo real só avisa (canal room:{id}, broadcast "sala"
 * e Presença); o estado vem sempre de app_dupla_room. Supabase e banco simulados; pessoas e salas só de teste.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

type Handler = (payload?: any) => void;
const fake = vi.hoisted(() => ({ channels: [] as any[], client: null as any }));

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

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, user: { id: "u-ana" } }) }));

import { createSupabaseBackend } from "../novo/data/supabaseBackend";
import { useRoomState } from "../novo/app/dupla/live.js";

const ROOM = "11111111-1111-4111-8111-111111111111";
function state(rev: number, seen = 2000) {
  return {
    id: ROOM, rev, phase: "setup", round: 1, server_now: new Date().toISOString(),
    me: { user_id: "u-ana", public_name: "Ana Souza", role: "evaluator" },
    partner: { user_id: "u-bruno", public_name: "Bruno Lima", role: "candidate", seen_ms_ago: seen },
  };
}
const roomCalls = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_dupla_room");
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

let current: any;
beforeEach(() => {
  vi.useFakeTimers();
  fake.channels.length = 0;
  fake.client.channel.mockClear();
  fake.client.removeChannel.mockClear();
  backend.rpc.mockReset();
  delete backend.subscribeRoom;
  current = state(3);
  // como o banco: com p_since_rev igual ao rev de agora, vazio (null)
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn !== "app_dupla_room") throw new Error("função não esperada: " + fn);
    return args.p_since_rev != null && args.p_since_rev === current.rev ? null : { ...current };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useRoomState (banco local, sem tempo real)", () => {
  it("banco local: consulta de 2 s só traz mudança quando o rev muda; completa a cada 10 s", async () => {
    const { result } = renderHook(() => useRoomState(ROOM));
    await advance(0);
    expect(result.current.room.rev).toBe(3);
    expect(result.current.channelReady).toBe(true);
    expect(result.current.live).toBe(false);
    expect(result.current.partnerPresent).toBe(true);
    expect(roomCalls()[0][1]).toEqual({ p_room_id: ROOM, p_since_rev: null });

    await advance(2000);
    expect(roomCalls().at(-1)[1]).toEqual({ p_room_id: ROOM, p_since_rev: 3 });
    expect(result.current.room.rev).toBe(3);

    current = state(4);
    await advance(2000);
    expect(result.current.room.rev).toBe(4);

    // completa (p_since_rev nulo) a cada 10 s: o sinal do parceiro muda sem mudar o rev
    current = { ...state(4, 45000) };
    const before = roomCalls().filter((c: any[]) => c[1].p_since_rev === null).length;
    await advance(6000);
    expect(roomCalls().filter((c: any[]) => c[1].p_since_rev === null).length).toBe(before + 1);
    expect(result.current.partnerPresent).toBe(false);
    expect(result.current.partnerAway).toBe(true);
  });

  it("resposta mais velha não vence a mais nova e apply troca pelo estado devolvido por uma ação", async () => {
    const { result } = renderHook(() => useRoomState(ROOM));
    await advance(0);
    act(() => result.current.apply(state(7)));
    expect(result.current.room.rev).toBe(7);
    act(() => result.current.apply(state(5)));
    expect(result.current.room.rev).toBe(7);
  });

  it("erro ao abrir a sala aparece; erro de rede depois da primeira leitura não derruba", async () => {
    backend.rpc.mockRejectedValueOnce(new Error("Sala não encontrada."));
    const { result } = renderHook(() => useRoomState(ROOM));
    await advance(0);
    expect(result.current.error?.message).toBe("Sala não encontrada.");
    await advance(2000);
    expect(result.current.room.rev).toBe(3);
    backend.rpc.mockRejectedValueOnce(new Error("Failed to fetch"));
    await advance(2000);
    expect(result.current.error).toBeNull();
    expect(result.current.room.rev).toBe(3);
  });
});

describe("useRoomState (Supabase, com tempo real)", () => {
  function liveBackend() {
    const handles: any[] = [];
    backend.subscribeRoom = vi.fn((roomId: string, userId: string, h: any) => {
      const handle = { roomId, userId, h, track: vi.fn(), untrack: vi.fn(), close: vi.fn() };
      handles.push(handle);
      return handle;
    });
    return handles;
  }

  it("Supabase: aviso agrupa 300 ms e busca de novo; presença do parceiro; consulta de segurança de 30 s", async () => {
    const handles = liveBackend();
    const { result, unmount } = renderHook(() => useRoomState(ROOM));
    await advance(0);
    const h = handles[0];
    expect(backend.subscribeRoom).toHaveBeenCalledTimes(1);
    expect(h.roomId).toBe(ROOM);
    expect(h.userId).toBe("u-ana");
    expect(h.track).toHaveBeenCalledWith({ user_id: "u-ana", status: "em_estacao" });
    act(() => h.h.onStatus("SUBSCRIBED"));
    await advance(0);
    expect(result.current.live).toBe(true);
    expect(result.current.channelReady).toBe(true);

    // sem consulta de 2 s com o tempo real ligado
    const n0 = roomCalls().length;
    await advance(5000);
    expect(roomCalls().length).toBe(n0);

    // dois avisos em menos de 300 ms → uma consulta com o rev atual
    current = state(4);
    act(() => {
      h.h.onChange();
      h.h.onChange();
    });
    await advance(299);
    expect(roomCalls().length).toBe(n0);
    await advance(1);
    expect(roomCalls().length).toBe(n0 + 1);
    expect(roomCalls().at(-1)[1]).toEqual({ p_room_id: ROOM, p_since_rev: 3 });
    expect(result.current.room.rev).toBe(4);

    // Presença: o parceiro sai do canal → ausente; só "Reconectando…" (partnerAway) depois de 30 s
    act(() => h.h.onPresence([{ user_id: "u-ana" }, { user_id: "u-bruno" }]));
    expect(result.current.partnerPresent).toBe(true);
    act(() => h.h.onPresence([{ user_id: "u-ana" }]));
    expect(result.current.partnerPresent).toBe(false);
    expect(result.current.partnerAway).toBe(false);
    await advance(30000);
    expect(result.current.partnerAway).toBe(true);
    act(() => h.h.onPresence([{ user_id: "u-ana" }, { user_id: "u-bruno" }]));
    expect(result.current.partnerAway).toBe(false);

    // consulta completa de segurança a cada 30 s
    const fulls = roomCalls().filter((c: any[]) => c[1].p_since_rev === null).length;
    await advance(30000);
    expect(roomCalls().filter((c: any[]) => c[1].p_since_rev === null).length).toBe(fulls + 1);

    unmount();
    expect(h.untrack).toHaveBeenCalled();
    expect(h.close).toHaveBeenCalled();
  });

  it("canal com erro passa a consultar a cada 2 s", async () => {
    const handles = liveBackend();
    const { result } = renderHook(() => useRoomState(ROOM));
    await advance(0);
    act(() => handles[0].h.onStatus("SUBSCRIBED"));
    await advance(0);
    act(() => handles[0].h.onStatus("CHANNEL_ERROR"));
    await advance(0);
    expect(result.current.live).toBe(false);
    const n0 = roomCalls().length;
    await advance(2000);
    expect(roomCalls().length).toBe(n0 + 1);
    expect(roomCalls().at(-1)[1].p_since_rev).toBe(3);
  });

  it("subscribeRoom: canal privado room:{id}, aviso 'sala' por broadcast, presença por usuário; close remove", async () => {
    vi.useRealTimers();
    const be = createSupabaseBackend("https://x.supabase.co", "anon", "http://localhost");
    const h = { onChange: vi.fn(), onPresence: vi.fn(), onStatus: vi.fn() };
    const handle = be.subscribeRoom!(ROOM, "u-ana", h);
    await Promise.resolve();
    await Promise.resolve();
    const ch = fake.channels[0];
    expect(ch.name).toBe(`room:${ROOM}`);
    expect(ch.opts).toEqual({ config: { private: true, presence: { key: "u-ana" } } });
    expect(fake.client.realtime.setAuth).toHaveBeenCalled();
    const broadcast = ch.handlers.find((x: any) => x.type === "broadcast");
    expect(broadcast.filter).toEqual({ event: "sala" });
    // nenhuma leitura direta da tabela (fechada na 013340)
    expect(ch.handlers.some((x: any) => x.type === "postgres_changes")).toBe(false);
    broadcast.cb({ payload: { rev: 9 } });
    expect(h.onChange).toHaveBeenCalledTimes(1);

    handle.track({ user_id: "u-ana", status: "em_estacao" });
    expect(ch.track).not.toHaveBeenCalled(); // só depois de assinar
    ch.statusCb("SUBSCRIBED");
    expect(h.onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    expect(ch.track).toHaveBeenCalledWith({ user_id: "u-ana", status: "em_estacao" });

    ch.presence = { "u-ana": [{ user_id: "u-ana" }], "u-bruno": [{ user_id: "u-bruno" }, { user_id: "u-bruno" }] };
    ch.handlers.find((x: any) => x.type === "presence").cb();
    expect(h.onPresence).toHaveBeenCalledWith([{ user_id: "u-ana", status: undefined }, { user_id: "u-bruno", status: undefined }]);

    handle.close();
    expect(fake.client.removeChannel).toHaveBeenCalledWith(ch);
    broadcast.cb({ payload: { rev: 10 } });
    expect(h.onChange).toHaveBeenCalledTimes(1);
  });
});
