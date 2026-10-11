/**
 * Tela de Aulas do aluno, correções de 11/10/2026 (A05, e as demais deste arquivo): jsdom, banco simulado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
const boot: any = { profile: { name: "Ana" }, play: { enabled: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { LessonsScreen } from "../novo/app/study/LessonsScreen.jsx";

const baseLesson = (over: any = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", title: "Bronquiolite viral aguda",
  duration_minutes: 45, instructor: "Dra. Teste", specialty: "Pneumologia pediátrica", video_url: "https://www.youtube.com/watch?v=abc123",
  summary: "Diagnóstico clínico e suporte.", key_points: ["Ponto"], guideline_title: null, guideline_url: null, published: true, position: 0,
  materials: [], progress: null, ...over,
});
let lesson: any;

async function openLesson() {
  render(<LessonsScreen go={vi.fn()} />);
  const cards = await screen.findAllByRole("button", { name: /Bronquiolite viral aguda/ });
  fireEvent.click(cards[cards.length - 1]);
  await screen.findByRole("heading", { name: "Bronquiolite viral aguda" });
}

beforeEach(() => {
  lesson = baseLesson();
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_lessons") return { total: 1, by_area: { PEDIATRIA: 1 }, completed: 0, lessons: [lesson] };
    if (fn === "app_lesson") return { ...lesson, questions_topic: 5, questions_area: 120 };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async () => new Response("{}", { status: 404 }));
});
afterEach(cleanup);

describe("A05 - o nome do arquivo enviado não aparece para o aluno", () => {
  it("PDF e áudio mostram só o rótulo neutro e o tamanho, não o nome do arquivo", async () => {
    lesson = baseLesson({
      materials: [
        { id: "m1", kind: "slides", title: "CURSINHO-X apostila final v3.pdf", has_file: true, content_type: "application/pdf", size_bytes: 2_400_000, url: null },
        { id: "m2", kind: "flashcast", title: "Flashcast: Flashcast: Bronquiolite", has_file: true, content_type: "audio/mpeg", size_bytes: 31_000_000, url: null },
      ],
    });
    await openLesson();
    expect(screen.getByText("Material complementar (PDF)")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/CURSINHO-X|apostila final/);
    expect(document.body.textContent).not.toMatch(/Flashcast: Flashcast/);
    expect(screen.getByText("2,3 MB")).toBeTruthy();
  });
});

describe("A04 - áudio Flashcast renova o endereço quando o player falha", () => {
  const audioLesson = () => baseLesson({ materials: [{ id: "m2", kind: "flashcast", title: "Flashcast", has_file: true, content_type: "audio/mpeg", size_bytes: 31_000_000, url: null }] });

  it("endereço vencido: pede outro uma vez e continua do mesmo ponto; se falhar de novo, avisa em português", async () => {
    lesson = audioLesson();
    let n = 0;
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith("/materials/m2/link")) {
        n++;
        return new Response(JSON.stringify({ url: `https://deposito.test/flashcast-${n}.mp3` }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    });
    await openLesson();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    const audio = (await screen.findByLabelText("Áudio Flashcast")) as HTMLAudioElement;
    expect(audio.getAttribute("src")).toBe("https://deposito.test/flashcast-1.mp3");
    Object.defineProperty(audio, "currentTime", { value: 1500, writable: true, configurable: true });
    fireEvent.error(audio); // o endereço venceu no meio da aula
    await waitFor(() => expect((screen.getByLabelText("Áudio Flashcast") as HTMLAudioElement).getAttribute("src")).toBe("https://deposito.test/flashcast-2.mp3"));
    const renewed = screen.getByLabelText("Áudio Flashcast") as HTMLAudioElement;
    renewed.currentTime = 0;
    fireEvent.loadedMetadata(renewed);
    expect(renewed.currentTime).toBe(1500);
    fireEvent.error(renewed); // falhou de novo sem tocar: não fica em ciclo
    expect(await screen.findByText(/Não foi possível tocar o áudio/)).toBeTruthy();
    expect(n).toBe(2);
  });
});

describe("A11 - vídeos que não tocam", () => {
  it("m3u8 não toca no Chrome nem no Firefox: vira link para abrir fora; Vimeo não listado (com código) toca embutido", async () => {
    const { videoEmbed } = await import("../novo/app/study/lessonsApi.js");
    expect(videoEmbed("https://cdn.test/aula.m3u8")).toEqual({ kind: "link", src: "https://cdn.test/aula.m3u8" });
    expect(videoEmbed("https://cdn.test/aula.mp4?x=1")).toEqual({ kind: "file", src: "https://cdn.test/aula.mp4?x=1" });
    expect(videoEmbed("https://vimeo.com/123456/abcdef0123")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456?h=abcdef0123" });
    expect(videoEmbed("https://vimeo.com/channels/staff/123456")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456" });
    expect(videoEmbed("https://vimeo.com/showcase/abc")).toEqual({ kind: "link", src: "https://vimeo.com/showcase/abc" });
  });
});
