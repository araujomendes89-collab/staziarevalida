/**
 * Tela de Aulas do aluno, correções de 11/10/2026 (A05, e as demais deste arquivo): jsdom, banco simulado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
