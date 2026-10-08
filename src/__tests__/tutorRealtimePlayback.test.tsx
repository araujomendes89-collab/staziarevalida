import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealtimeVoice } from "../novo/app/tutor/useRealtimeVoice.js";

const play = vi.fn();
let peer: any;
let player: any;
let channel: any;
let inputTrack: any;
const sent: any[] = [];
const backend = { accessToken: async () => "test-session" };
const sessionId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  play.mockReset().mockResolvedValue(undefined);
  sent.length = 0;
  vi.stubGlobal("RTCPeerConnection", class {
    constructor() { peer = this; }
    createDataChannel() { return (channel = { readyState: "open", send: (message: string) => sent.push(JSON.parse(message)), close() {} }); }
    addTrack() {}
    createOffer() { return Promise.resolve({ type: "offer", sdp: "offer" }); }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    close() {}
  });
  vi.stubGlobal("Audio", class {
    volume = 1;
    muted = false;
    srcObject = null;
    constructor() { player = this; }
    play = play;
    pause() {}
    setAttribute() {}
  });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        const track = (inputTrack = { enabled: true, stop: vi.fn() });
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      }),
    },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/voice/start")) return new Response(JSON.stringify({
      provider: "realtime", voice_call_id: "33333333-3333-4333-8333-333333333333",
      client_secret: "temporary-test-token", lease_seconds: 120,
    }));
    if (String(url).includes("/realtime/calls")) return new Response("answer");
    return new Response("{}");
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("recupera áudio bloqueado pelo navegador no gesto do aluno, sem abrir outra chamada", async () => {
  const onWarning = vi.fn();
  const { result } = renderHook(() => useRealtimeVoice({ backend, sessionId, onWarning } as any));
  await act(async () => { await result.current.start(); });
  play.mockRejectedValueOnce(new DOMException("Autoplay blocked", "NotAllowedError"));
  const output = { id: "tutor-audio" };
  await act(async () => { peer.ontrack({ streams: [output] }); });
  expect(result.current.playbackBlocked).toBe(true);
  expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("Ativar som do Nexus"));
  expect(result.current.streams.output).toBe(output);

  await act(async () => { expect(await result.current.enablePlayback()).toBe(true); });
  expect(result.current.playbackBlocked).toBe(false);
  expect(play).toHaveBeenCalledTimes(2);
  expect(player.srcObject).toBe(output);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/voice/start"))).toHaveLength(1);
});

it("restaura volume zero e informa quando a nova tentativa de reprodução falha", async () => {
  const onWarning = vi.fn();
  const { result } = renderHook(() => useRealtimeVoice({ backend, sessionId, onWarning } as any));
  await act(async () => { await result.current.start(); });
  act(() => result.current.setVolume(0));
  player.muted = true;
  play.mockRejectedValueOnce(new DOMException("Blocked again", "NotAllowedError"));
  await act(async () => { expect(await result.current.enablePlayback()).toBe(false); });
  expect(player.volume).toBe(1);
  expect(player.muted).toBe(false);
  expect(result.current.playbackBlocked).toBe(true);
  expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("Não foi possível reproduzir"));
});

it("anexa a faixa de áudio mesmo quando WebRTC não entrega uma lista de streams", async () => {
  vi.stubGlobal("MediaStream", class { constructor(public tracks: unknown[]) {} });
  const { result } = renderHook(() => useRealtimeVoice({ backend, sessionId } as any));
  await act(async () => { await result.current.start(); });
  const track = { kind: "audio" };
  await act(async () => { peer.ontrack({ streams: [], track }); });
  expect(player.srcObject.tracks).toEqual([track]);
  expect(result.current.streams.output).toBe(player.srcObject);
  expect(play).toHaveBeenCalledTimes(1);
});

const emit = (event: unknown) => channel.onmessage({ data: JSON.stringify(event) });

it("confirma a pronúncia antes de abrir o microfone e falar, preservando as instruções do servidor", async () => {
  const { result } = renderHook(() => useRealtimeVoice({ backend, sessionId } as any));
  await act(async () => { await result.current.start(); });
  act(() => channel.onopen());
  expect(sent).toHaveLength(0);
  expect(inputTrack.enabled).toBe(false);
  const original = "Regras médicas: nunca invente doses. Professor: Durona. Contexto: questão aberta.";
  await act(async () => { emit({ type: "session.created", session: { instructions: original } }); });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ type: "session.update", session: { type: "realtime", instructions: expect.stringContaining("português brasileiro neutro") } });
  expect(sent[0].session.instructions).toContain(original);
  expect(Object.keys(sent[0].session).sort()).toEqual(["instructions", "type"]); // não muda voz, modelo ou ferramentas
  expect(inputTrack.enabled).toBe(false);
  await act(async () => { emit({ type: "session.updated", session: { instructions: "atualização não relacionada" } }); });
  expect(sent).toHaveLength(1);
  await act(async () => { emit({ type: "session.updated", session: sent[0].session }); });
  expect(inputTrack.enabled).toBe(true);
  expect(result.current.state).toBe("listening");
  expect(sent.at(-1)).toEqual({ type: "response.create" });
  await act(async () => { emit({ type: "session.updated", session: sent[0].session }); });
  expect(sent.filter((e) => e.type === "response.create")).toHaveLength(1);
});

it("não substitui instruções ausentes por um prompt só de sotaque", async () => {
  const { result } = renderHook(() => useRealtimeVoice({ backend, sessionId } as any));
  await act(async () => { await result.current.start(); });
  await act(async () => { emit({ type: "session.created", session: {} }); });
  expect(result.current.state).toBe("error");
  expect(result.current.error.message).toContain("instruções do professor");
  expect(sent).toHaveLength(0);
  expect(inputTrack.stop).toHaveBeenCalled();
});

it("informa falha ao aplicar a direção de voz, sem começar com o sotaque antigo", async () => {
  const { result } = renderHook(() => useRealtimeVoice({ backend, sessionId } as any));
  await act(async () => { await result.current.start(); });
  await act(async () => { emit({ type: "session.created", session: { instructions: "Instruções do professor" } }); });
  await act(async () => { emit({ type: "error", error: { event_id: sent[0].event_id, code: "invalid_request" } }); });
  expect(result.current.state).toBe("error");
  expect(result.current.error.message).toContain("aplicar o português brasileiro");
  expect(sent.some((e) => e.type === "response.create")).toBe(false);
  expect(inputTrack.stop).toHaveBeenCalled();
});
