/** Baralho/revisão: cartão da Central com imagem mostra a imagem (protegida); sem imagem ou sem a função, o texto de sempre. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));
import { FlashcardsScreen } from "../novo/app/review/FlashcardsScreen.jsx";

const CARD = (id: string, mine: boolean) => ({ id, area: "CLINICA_MEDICA", topic: "Tuberculose pulmonar", front: `Pergunta ${id}`, back: `Resposta ${id}`, mine, source_question_id: null, schedule: null });
let ilus: any;
beforeEach(() => {
  ilus = { c1: { tema: "GR-001", n: 1 } };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_flashcards") return { counts: { total: 2, new: 2, learning: 0, consolidated: 0, next_due: null }, queue: [CARD("c1", false), CARD("c2", true)] };
    if (fn === "app_flashcards_ilustrados") { if (ilus instanceof Error) throw ilus; return ilus; }
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }));
  (URL as any).createObjectURL = () => "blob:t"; (URL as any).revokeObjectURL = () => {};
});
afterEach(cleanup);

describe("flashcard ilustrado no baralho", () => {
  it("cartão com imagem: pede só os cartões da Central, mostra a imagem pela rota protegida, sem arrastar nem menu, e vira", async () => {
    render(<FlashcardsScreen go={vi.fn()} />);
    const botao = await screen.findByRole("button", { name: "Mostrar resposta", pressed: false });
    await waitFor(() => expect(document.querySelectorAll("img").length).toBeGreaterThan(0));
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_flashcards_ilustrados")[1]).toEqual({ p_ids: ["c1"] });
    const img = document.querySelector("img")!;
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.getAttribute("alt")).toBe("Pergunta: Pergunta c1");
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    img.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect((globalThis as any).fetch.mock.calls.map((c: any[]) => c[0])).toEqual(["/api/content-hub/aula-aluno/GR-001/frente/1"]);
    fireEvent.click(botao);
    await waitFor(() => expect((globalThis as any).fetch.mock.calls.map((c: any[]) => c[0])).toContain("/api/content-hub/aula-aluno/GR-001/verso/1"));
    expect(screen.getByRole("group", { name: "Como foi lembrar?" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GR-\d{3}|\bPDF\b|baixar/i);
    expect(document.querySelectorAll("a[download]").length).toBe(0);
  });

  it("sem imagem (mapa vazio) ou função ausente no banco: o cartão de texto de sempre", async () => {
    ilus = {};
    render(<FlashcardsScreen go={vi.fn()} />);
    expect(await screen.findByText("Pergunta c1")).toBeTruthy();
    expect(document.querySelectorAll("img").length).toBe(0);
    cleanup();
    ilus = new Error("não existe");
    render(<FlashcardsScreen go={vi.fn()} />);
    expect(await screen.findByText("Pergunta c1")).toBeTruthy();
    expect(document.querySelectorAll("img").length).toBe(0);
  });

  it("cartão de texto: frente e verso na cor da área (paleta v2), sem mostrar o código da cor", async () => {
    ilus = {};
    render(<FlashcardsScreen go={vi.fn()} />);
    await screen.findByText("Pergunta c1");
    const flash = document.querySelector(".sm-flash") as HTMLElement;
    expect(flash.classList.contains("sm-flash--tema")).toBe(true);
    expect(flash.style.getPropertyValue("--gt-p")).toBe("#087A63"); // Clínica Médica
    expect(document.body.textContent).not.toMatch(/#[0-9A-F]{6}/i);
  });

  it("cartão pessoal nunca vai para a função de imagens", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_flashcards") return { counts: { total: 1, new: 1, learning: 0, consolidated: 0, next_due: null }, queue: [CARD("p1", true)] };
      throw new Error("não deveria chamar " + fn);
    });
    render(<FlashcardsScreen go={vi.fn()} />);
    expect(await screen.findByText("Pergunta p1")).toBeTruthy();
  });
});
