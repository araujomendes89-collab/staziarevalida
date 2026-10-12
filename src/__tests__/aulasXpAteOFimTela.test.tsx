/**
 * A08 na tela do aluno (jsdom): o XP da conclusão só vem de quem assistiu a aula até o fim. A tela mede o fim pelo aviso do player
 * (YouTube, Vimeo e MP4 na página), grava por app_lesson_watch e escreve a regra em português simples. Link aberto em outra aba e
 * aula sem vídeo não permitem medir: concluir marca como feita, mas não dá XP, e a tela diz isso.
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canMeasureEnd, createWatchTracker, parsePlayerMessage, subscribeToPlayer, withPlayerApi, xpNote, XP_RULE } from "../novo/app/study/lessonWatch.js";
import { videoEmbed } from "../novo/app/study/lessonsApi.js";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
const boot: any = { profile: { name: "Ana" }, play: { enabled: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
import { LessonsScreen } from "../novo/app/study/LessonsScreen.jsx";

const ID = "11111111-1111-4111-8111-111111111111";
const lessonWith = (video_url: string | null, progress: any = null) => ({
  id: ID, area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", title: "Bronquiolite viral aguda", duration_minutes: 45, instructor: "Dra. Teste", specialty: "Pneumologia",
  video_url, summary: "Resumo.", key_points: [], guideline_title: null, guideline_url: null, published: true, position: 0, materials: [], progress,
});
let lesson: any;
let watchState: any;
let watchReply: any;

beforeEach(() => {
  boot.play = { enabled: true };
  watchState = null;
  watchReply = (args: any) => ({ seconds_watched: args.p_seconds, completed_at: null, watched_to_end_at: args.p_ended ? "2026-10-11T12:00:00Z" : null, xp: null });
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_lessons") return { total: 1, by_area: { PEDIATRIA: 1 }, completed: 0, lessons: [lesson] };
    if (fn === "app_lesson") return { ...lesson, questions_topic: 5, questions_area: 120 };
    if (fn === "app_lesson_watch_state") return watchState;
    if (fn === "app_lesson_watch") return watchReply(args);
    if (fn === "app_lesson_progress") return { seconds_watched: 0, completed_at: "2026-10-11T12:05:00Z", xp: null };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openLesson() {
  render(<LessonsScreen go={vi.fn()} />);
  const cards = await screen.findAllByRole("button", { name: /Bronquiolite viral aguda/ });
  fireEvent.click(cards[cards.length - 1]);
  return screen.findByRole("heading", { name: "Bronquiolite viral aguda" });
}
const send = (iframe: HTMLIFrameElement, origin: string, data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: typeof data === "string" ? data : JSON.stringify(data), origin, source: iframe.contentWindow }));
  });
const yt = (iframe: HTMLIFrameElement, currentTime: number, playerState = 1) => send(iframe, "https://www.youtube-nocookie.com", { event: "infoDelivery", info: { currentTime, playerState } });
const watchCalls = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_lesson_watch").map((c: any[]) => c[1]);

describe("A08: medidor do fim (funções puras)", () => {
  it("o fim vale quando a reprodução chegou andando; não vale sem leitura nenhuma nem depois de um salto para a frente", () => {
    const t = createWatchTracker();
    expect(t.end()).toBe(false); // nenhuma leitura: o aviso de fim sozinho não vale
    [0, 0.5, 1, 1.5, 120.2].forEach((x) => t.time(x)); // saltou de 1,5 para 120,2
    expect(t.end()).toBe(false);
    expect(t.ended).toBe(false);
    t.time(120.7);
    expect(t.end()).toBe(true);
    expect(t.ended).toBe(true);
    expect(t.max).toBe(120);
  });
  it("voltar na barra não atrapalha; só o salto para a frente invalida", () => {
    const t = createWatchTracker();
    [0, 0.5, 100, 100.5].forEach((x) => t.time(x));
    t.time(10); // voltou
    t.time(10.5);
    expect(t.end()).toBe(true);
    expect(t.max).toBe(100);
    const u = createWatchTracker();
    u.time(NaN);
    u.time(-3);
    expect(u.end()).toBe(false);
  });

  it("YouTube: lê o tempo e o fim (estado 0); Vimeo: lê timeupdate e ended; outras origens e lixo são ignorados", () => {
    const y = "https://www.youtube-nocookie.com";
    expect(parsePlayerMessage(y, JSON.stringify({ event: "infoDelivery", info: { currentTime: 12.5, playerState: 1 } }))).toEqual({ kind: "time", seconds: 12.5 });
    expect(parsePlayerMessage(y, { event: "infoDelivery", info: { currentTime: 3000, playerState: 0 } })).toEqual({ kind: "ended" });
    expect(parsePlayerMessage(y, { event: "onStateChange", info: 0 })).toEqual({ kind: "ended" });
    expect(parsePlayerMessage(y, { event: "onReady" })).toEqual({ kind: "ready" });
    expect(parsePlayerMessage(y, { event: "infoDelivery", info: { volume: 50 } })).toBeNull();
    const v = "https://player.vimeo.com";
    expect(parsePlayerMessage(v, JSON.stringify({ event: "timeupdate", data: { seconds: 7.25, percent: 0.1, duration: 70 } }))).toEqual({ kind: "time", seconds: 7.25 });
    expect(parsePlayerMessage(v, { event: "ended", data: { seconds: 70 } })).toEqual({ kind: "ended" });
    expect(parsePlayerMessage(v, { event: "ready" })).toEqual({ kind: "ready" });
    expect(parsePlayerMessage("https://evil.test", { event: "ended" })).toBeNull();
    expect(parsePlayerMessage(y, "não é json")).toBeNull();
    expect(parsePlayerMessage(v, null)).toBeNull();
  });

  it("pede ao player para avisar (Vimeo na origem dele; YouTube com 'listening'); enablejsapi só no YouTube", () => {
    const post = vi.fn();
    subscribeToPlayer("vimeo", { postMessage: post } as any);
    expect(post).toHaveBeenCalledWith(JSON.stringify({ method: "addEventListener", value: "timeupdate" }), "https://player.vimeo.com");
    expect(post).toHaveBeenCalledWith(JSON.stringify({ method: "addEventListener", value: "ended" }), "https://player.vimeo.com");
    post.mockClear();
    subscribeToPlayer("youtube", { postMessage: post } as any);
    expect(post.mock.calls[0][0]).toContain('"event":"listening"');
    expect(() => subscribeToPlayer("youtube", null as any)).not.toThrow();
    expect(withPlayerApi("youtube", "https://www.youtube-nocookie.com/embed/abc", "https://app.test")).toBe("https://www.youtube-nocookie.com/embed/abc?enablejsapi=1&origin=https%3A%2F%2Fapp.test");
    expect(withPlayerApi("vimeo", "https://player.vimeo.com/video/1", "https://app.test")).toBe("https://player.vimeo.com/video/1");
  });

  it("quais aulas permitem medir o fim, e o texto de cada caso", () => {
    expect(canMeasureEnd(videoEmbed("https://youtu.be/abc"))).toBe(true);
    expect(canMeasureEnd(videoEmbed("https://vimeo.com/123456"))).toBe(true);
    expect(canMeasureEnd(videoEmbed("https://cdn.test/aula.mp4"))).toBe(true);
    expect(canMeasureEnd(videoEmbed("https://cdn.test/aula.m3u8"))).toBe(false);
    expect(canMeasureEnd(videoEmbed("https://drive.test/aula"))).toBe(false);
    expect(canMeasureEnd(null)).toBe(false);
    const yt = videoEmbed("https://youtu.be/abc");
    expect(XP_RULE).toBe("Para ganhar o XP, assista a aula até o fim.");
    expect(xpNote({ embed: yt, measure: "ok", done: false, ended: false })).toBe(XP_RULE);
    expect(xpNote({ embed: yt, measure: "ok", done: false, ended: true })).toMatch(/Marque a aula como concluída para ganhar o XP/);
    expect(xpNote({ embed: yt, measure: "ok", done: true, ended: false })).toMatch(/Falta assistir até o fim/);
    expect(xpNote({ embed: yt, measure: "ok", done: true, ended: true })).toBeNull();
    expect(xpNote({ embed: yt, measure: "unavailable", done: false, ended: false })).toMatch(/não dá XP/);
    expect(xpNote({ embed: videoEmbed("https://cdn.test/aula.m3u8"), measure: "none", done: false, ended: false })).toMatch(/abre em outra aba e não dá para medir.*não dá XP/);
    expect(xpNote({ embed: null, measure: "none", done: false, ended: false })).toMatch(/ainda não tem vídeo.*não dá XP/);
  });
});

describe("A08: tela da aula com YouTube", () => {
  beforeEach(() => {
    lesson = lessonWith("https://www.youtube.com/watch?v=abc123");
  });

  it("mostra a regra em português simples e liga o aviso do player", async () => {
    await openLesson();
    expect(screen.getByRole("note").textContent).toBe("Para ganhar o XP, assista a aula até o fim.");
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toContain("enablejsapi=1");
    const post = vi.spyOn(iframe.contentWindow as Window, "postMessage");
    fireEvent.load(iframe);
    expect(post).toHaveBeenCalled();
  });

  it("assistir até o fim grava o fim (e até onde foi); depois de concluída, o XP aparece", async () => {
    boot.play = { enabled: true };
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    [0, 0.5, 1, 1.5, 2].forEach((t) => yt(iframe, t));
    expect(watchCalls()).toEqual([]); // ainda não acabou: nada a gravar
    yt(iframe, 2.4, 0);
    await waitFor(() => expect(watchCalls()).toEqual([{ p_id: ID, p_seconds: 2, p_ended: true }]));
    expect(await screen.findByText(/Você assistiu até o fim\. Marque a aula como concluída para ganhar o XP/)).toBeTruthy();
    // o fim chegando duas vezes não grava duas vezes
    yt(iframe, 2.4, 0);
    expect(watchCalls().length).toBe(1);
  });

  it("concluir ANTES do fim marca a aula como feita, sem XP, e a tela diz o que falta; o fim depois paga o XP que o banco devolver", async () => {
    await openLesson();
    fireEvent.click(screen.getByRole("button", { name: /Marcar como concluída/ }));
    expect(await screen.findByRole("button", { name: /Aula concluída/ })).toBeTruthy();
    expect(screen.queryByText(/\+20 XP/)).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/Aula concluída\. Falta assistir até o fim para ganhar o XP\./);
    watchReply = (a: any) => ({ seconds_watched: a.p_seconds, completed_at: "2026-10-11T12:05:00Z", watched_to_end_at: "2026-10-11T12:10:00Z", xp: 20 });
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    yt(iframe, 1);
    yt(iframe, 1.5, 0);
    expect(await screen.findByText("+20 XP")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull(); // concluída e assistida: nada mais a pedir
  });

  it("arrastar a barra direto para o fim NÃO vale como assistir; avisos de outra origem ou de outra janela são ignorados", async () => {
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    yt(iframe, 0);
    yt(iframe, 0.5);
    yt(iframe, 2700); // saltou
    yt(iframe, 2700, 0);
    send(iframe, "https://evil.test", { event: "infoDelivery", info: { currentTime: 1, playerState: 0 } });
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ event: "infoDelivery", info: { currentTime: 1, playerState: 0 } }), origin: "https://www.youtube-nocookie.com", source: window }));
    });
    expect(watchCalls()).toEqual([]);
    expect(screen.getByRole("note").textContent).toBe(XP_RULE);
  });

  it("falha ao gravar o fim: tenta de novo no próximo aviso", async () => {
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    const real = watchReply;
    watchReply = () => {
      throw new Error("sem rede");
    };
    yt(iframe, 1);
    yt(iframe, 1.5, 0);
    await waitFor(() => expect(watchCalls().length).toBe(1));
    watchReply = real;
    yt(iframe, 1.5, 0);
    await waitFor(() => expect(watchCalls().length).toBe(2));
    expect(await screen.findByText(/Você assistiu até o fim/)).toBeTruthy();
  });

  it("quem já tinha assistido até o fim volta à aula e vê que falta só concluir", async () => {
    watchState = { seconds_watched: 2700, completed_at: null, watched_to_end_at: "2026-10-10T10:00:00Z" };
    await openLesson();
    expect(await screen.findByText(/Você assistiu até o fim\. Marque a aula como concluída/)).toBeTruthy();
  });

  it("se o player nunca avisa, depois de um tempo a tela diz que não dá para medir neste aparelho (sem XP)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openLesson();
    expect(screen.getByRole("note").textContent).toBe(XP_RULE);
    await act(async () => {
      vi.advanceTimersByTime(15_100);
    });
    expect(screen.getByRole("note").textContent).toMatch(/Não conseguimos medir se você assistiu até o fim neste aparelho.*não dá XP/);
  });

  it("Arena desligada: nenhum texto de XP", async () => {
    boot.play = { enabled: false };
    await openLesson();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("A08: outros tipos de aula", () => {
  it("Vimeo: mede pelo player da Vimeo", async () => {
    lesson = lessonWith("https://vimeo.com/123456");
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe("https://player.vimeo.com/video/123456");
    const v = (data: unknown) => send(iframe, "https://player.vimeo.com", data);
    v({ event: "ready" });
    [0.25, 0.5, 0.75].forEach((seconds) => v({ event: "timeupdate", data: { seconds } }));
    v({ event: "ended", data: { seconds: 0.75 } });
    await waitFor(() => expect(watchCalls()).toEqual([{ p_id: ID, p_seconds: 0, p_ended: true }]));
  });

  it("MP4 na página: mede pelos eventos do próprio vídeo", async () => {
    lesson = lessonWith("https://cdn.test/aula.mp4");
    await openLesson();
    const video = document.querySelector("video") as HTMLVideoElement;
    for (const t of [0, 1, 2, 3]) {
      Object.defineProperty(video, "currentTime", { value: t, configurable: true });
      fireEvent.timeUpdate(video);
    }
    fireEvent.ended(video);
    await waitFor(() => expect(watchCalls()).toEqual([{ p_id: ID, p_seconds: 3, p_ended: true }]));
  });

  it("link .m3u8 ou outro endereço (abre em outra aba): não mede, o texto avisa e concluir não dá XP", async () => {
    lesson = lessonWith("https://cdn.test/aula.m3u8");
    await openLesson();
    expect(screen.getByRole("note").textContent).toMatch(/abre em outra aba e não dá para medir.*concluir marca a aula como feita, mas não dá XP/);
    fireEvent.click(screen.getByRole("button", { name: /Marcar como concluída/ }));
    expect(await screen.findByRole("button", { name: /Aula concluída/ })).toBeTruthy();
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
    expect(watchCalls()).toEqual([]);
  });

  it("aula sem vídeo: o texto avisa e concluir continua marcando como feita", async () => {
    lesson = lessonWith(null);
    await openLesson();
    expect(screen.getByRole("note").textContent).toMatch(/ainda não tem vídeo na página.*não dá XP/);
    fireEvent.click(screen.getByRole("button", { name: /Marcar como concluída/ }));
    expect(await screen.findByRole("button", { name: /Aula concluída/ })).toBeTruthy();
  });
});
