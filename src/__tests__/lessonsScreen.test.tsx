/**
 * Tela de Aulas (jsdom) com o banco simulado: catálogo vazio, catálogo com aulas, aula aberta com a estrutura padrão
 * (vídeo, professor, especialidade, duração, "Treinar questões deste tema", materiais, resumo, pontos-chave) e conclusão com XP.
 * As regras de verdade estão em supabaseLessonsApi.test.ts e lessonsRoutes.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { durationLabel, videoEmbed } from "../novo/app/study/lessonsApi.js";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
const boot: any = { profile: { name: "Ana" }, play: { enabled: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { LessonsScreen } from "../novo/app/study/LessonsScreen.jsx";

const LESSON = {
  id: "11111111-1111-4111-8111-111111111111", area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", title: "Bronquiolite viral aguda",
  duration_minutes: 45, instructor: "Dra. Teste", specialty: "Pneumologia pediátrica", video_url: "https://www.youtube.com/watch?v=abc123",
  summary: "Diagnóstico clínico e suporte.", key_points: ["Não usar broncodilatador de rotina", "Oxigênio se saturação baixa"],
  guideline_title: "PCDT Bronquiolite", guideline_url: "https://www.gov.br/saude/pcdt", published: true, position: 0,
  materials: [
    { id: "m1", kind: "slides", title: "Slides da aula", has_file: true, content_type: "application/pdf", size_bytes: 2_400_000, url: null },
    { id: "m2", kind: "flashcast", title: "Flashcast", has_file: true, content_type: "audio/mpeg", size_bytes: 31_000_000, url: null },
  ],
  progress: null,
};
let catalog: any;

beforeEach(() => {
  catalog = { total: 1, by_area: { PEDIATRIA: 1 }, completed: 0, lessons: [LESSON] };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_lessons") return catalog;
    if (fn === "app_lesson") return { ...LESSON, questions_topic: 5, questions_area: 120 };
    if (fn === "app_start_lesson_questions") return { session_id: "s-9", count: 5 };
    if (fn === "app_lesson_progress") return { seconds_watched: 0, completed_at: "2026-10-06T18:00:00Z", xp: 20 };
    throw new Error(`rpc não simulada: ${fn} ${JSON.stringify(args)}`);
  });
  // links assinados dos materiais
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    if (String(url).endsWith("/materials/m2/link")) return new Response(JSON.stringify({ url: "https://deposito.test/flashcast.mp3" }), { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/materials/m1/link")) return new Response(JSON.stringify({ url: "https://deposito.test/slides.pdf" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 404 });
  });
});
afterEach(cleanup);

describe("Catálogo", () => {
  it("sem aulas publicadas: aviso honesto e atalho para treinar", async () => {
    catalog = { total: 0, by_area: {}, completed: 0, lessons: [] };
    const go = vi.fn();
    render(<LessonsScreen go={go} />);
    expect(await screen.findByText("As aulas estão sendo preparadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Montar um treino" }));
    expect(go).toHaveBeenCalledWith("questoes");
  });

  it("filtra por área e busca pelo servidor", async () => {
    render(<LessonsScreen go={vi.fn()} />);
    expect((await screen.findAllByText("Bronquiolite viral aguda")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: /Pediatria/ }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_lessons", { p_area: "PEDIATRIA", p_search: null }));
    fireEvent.change(screen.getByLabelText("Buscar aula"), { target: { value: "sibilância" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_lessons", { p_area: "PEDIATRIA", p_search: "sibilância" }));
  });
});

describe("Aula aberta", () => {
  it("mostra a estrutura padrão, treina o tema, toca o Flashcast e conclui com XP", async () => {
    const go = vi.fn();
    render(<LessonsScreen go={go} />);
    const cards = await screen.findAllByRole("button", { name: /Bronquiolite viral aguda/ });
    fireEvent.click(cards[cards.length - 1]);
    expect(await screen.findByRole("heading", { name: "Bronquiolite viral aguda" })).toBeTruthy();
    expect(screen.getByTitle("Vídeo da aula").getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/abc123\?enablejsapi=1/); // A08: liga o aviso do player
    expect(screen.getByText(/Professor: Dra\. Teste · Pneumologia pediátrica · 45 min/)).toBeTruthy();
    expect(screen.getByText("Resumo & racionalidade clínica")).toBeTruthy();
    expect(screen.getByText("Não usar broncodilatador de rotina")).toBeTruthy();
    expect(screen.getByText("PCDT Bronquiolite")).toBeTruthy();
    // as três linhas fixas do app anterior: PDF complementar, áudio e diretriz, todas disponíveis aqui
    expect(screen.getByText("Material complementar (PDF)")).toBeTruthy();
    expect(screen.getByText("Áudio Flashcast (MP3)")).toBeTruthy();
    expect(screen.getByText("Diretriz SUS / PCDT")).toBeTruthy();
    expect(screen.getAllByText("Disponível").length).toBe(3);
    expect(screen.getByText("5 questões do tema")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    const audio = await screen.findByLabelText("Áudio Flashcast");
    expect(audio.getAttribute("src")).toBe("https://deposito.test/flashcast.mp3");

    fireEvent.click(screen.getByRole("button", { name: /Marcar como concluída/ }));
    expect(await screen.findByText("+20 XP")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Aula concluída/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Treinar questões deste tema/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-9" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_start_lesson_questions", { p_id: LESSON.id, p_count: 20 });
  });
});

describe("Vídeo e textos", () => {
  it("reconhece YouTube, Vimeo e MP4; o resto vira link", () => {
    expect(videoEmbed("https://youtu.be/xyz")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/xyz" });
    expect(videoEmbed("https://vimeo.com/123456")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456" });
    expect(videoEmbed("https://cdn.test/aula.mp4")).toEqual({ kind: "file", src: "https://cdn.test/aula.mp4" });
    expect(videoEmbed("https://drive.test/aula")).toEqual({ kind: "link", src: "https://drive.test/aula" });
    expect(videoEmbed(null)).toBeNull();
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(90)).toBe("1h30");
  });
});

describe("Materiais que faltam", () => {
  it("sem áudio e sem diretriz: as linhas aparecem como não disponíveis", async () => {
    const only = { ...LESSON, guideline_url: null, guideline_title: null, materials: [LESSON.materials[0]] };
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_lessons") return { ...catalog, lessons: [only] };
      if (fn === "app_lesson") return { ...only, questions_topic: 5, questions_area: 120 };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<LessonsScreen go={vi.fn()} />);
    const cards = await screen.findAllByRole("button", { name: /Bronquiolite viral aguda/ });
    fireEvent.click(cards[cards.length - 1]);
    await screen.findByText("Material complementar (PDF)");
    expect(screen.getAllByText("Disponível").length).toBe(1);
    expect(screen.getAllByText("Não disponível").length).toBe(2);
  });
});
