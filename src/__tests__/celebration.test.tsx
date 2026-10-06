/**
 * Animação de conquista (play/Celebration.jsx), no estilo do vídeo de referência da sequência diária: o que o aluno vê no fim
 * (número, rótulo, semana marcada, medalha com XP, nível com nome de verdade), a ordem da fila (sequência, nível, medalhas),
 * pular tocando na tela, fechar com Esc ou "Continuar" e o modo de menos movimento.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionConfig } from "motion/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));

import { Celebration, useCelebrations } from "../novo/app/play/Celebration.jsx";
import { useTurnFeedback } from "../novo/app/play/PlayFeedback.jsx";

const WEEK = {
  today: "2026-10-08",
  streak: 30,
  days: [
    { date: "2026-10-05", state: "done" },
    { date: "2026-10-06", state: "frozen" },
    { date: "2026-10-07", state: "missed" },
    { date: "2026-10-08", state: "done" },
    { date: "2026-10-09", state: "future" },
    { date: "2026-10-10", state: "future" },
    { date: "2026-10-11", state: "future" },
  ],
};

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_play_streak_week") return WEEK;
    if (fn === "app_gamification_summary") return { level: { slug: "explorador", name: "Explorador", icon: "compass", color_token: "--teal-500", description: "Você está explorando as grandes áreas." } };
    return null;
  });
});
afterEach(() => cleanup());

const still = (ui: React.ReactElement) => render(<MotionConfig reducedMotion="always">{ui}</MotionConfig>);

describe("Sequência do dia", () => {
  it("menos movimento: mostra direto o fim, com a semana marcada dia a dia e o foco em Continuar", async () => {
    const onClose = vi.fn();
    still(<Celebration item={{ type: "streak", streak: 30 }} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Sequência de 30 dias!" })).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("dias de sequência")).toBeTruthy();
    expect(await screen.findByRole("listitem", { name: "Seg: estudou" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Ter: protegido" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Qua: não estudou" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Qui: hoje, estudou" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Sex: ainda não chegou" })).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_play_streak_week");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Continuar"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("com animação: começa no número anterior; tocar na tela pula para o fim; a página atrás não rola enquanto está aberta", async () => {
    const onClose = vi.fn();
    render(<Celebration item={{ type: "streak", streak: 30 }} onClose={onClose} />);
    expect(screen.getByText("29")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("dialog"));
    expect(await screen.findByText("30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    expect(document.body.style.overflow).toBe("");
  });

  it("primeiro dia: singular", () => {
    still(<Celebration item={{ type: "streak", streak: 1 }} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Sequência de 1 dia!" })).toBeTruthy();
    expect(screen.getByText("dia de sequência")).toBeTruthy();
  });
});

describe("Medalha e nível", () => {
  it("medalha: nome, descrição e XP ganho", () => {
    still(<Celebration item={{ type: "achievement", achievement: { slug: "x", name: "Primeiros Passos", description: "Respondeu 10 questões.", icon: "footprints", rarity: "comum", xp: 10, coins: 5 } }} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Medalha desbloqueada: Primeiros Passos" })).toBeTruthy();
    expect(screen.getByText("Medalha desbloqueada")).toBeTruthy();
    expect(screen.getByText("Respondeu 10 questões.")).toBeTruthy();
    expect(screen.getByText((_, el) => el?.className === "cel-reward" && /\+10 XP/.test(el.textContent ?? ""))).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Compartilhar/ })).toBeNull();
  });

  it("nível: quando a resposta só traz o código, busca o nome, a descrição e a cor de verdade", async () => {
    still(<Celebration item={{ type: "level", level: { slug: "explorador", name: "explorador" } }} onClose={vi.fn()} />);
    expect(await screen.findByText("Explorador")).toBeTruthy();
    expect(screen.getByText("Você está explorando as grandes áreas.")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_gamification_summary");
  });
});

describe("Fila depois de uma resposta", () => {
  function Harness({ play, levels }: { play: any; levels?: any[] }) {
    const f = useTurnFeedback();
    return (
      <MotionConfig reducedMotion="always">
        <button type="button" onClick={() => f.push(play, levels)}>
          disparar
        </button>
        {f.modal}
      </MotionConfig>
    );
  }

  it("sequência, depois o nível, depois cada medalha; Continuar passa para a próxima", async () => {
    render(
      <Harness
        play={{ streak_incremented: true, stats: { streak: 4 }, level_up: { from: "iniciante", to: "explorador" }, achievements_unlocked: [{ slug: "x", name: "Primeiros Passos", description: "10 questões.", icon: "footprints", rarity: "comum", xp: 10, coins: 5 }] }}
        levels={[{ slug: "explorador", name: "Explorador", icon: "compass", color_token: "--teal-500", description: "Explorando." }]}
      />
    );
    fireEvent.click(screen.getByText("disparar"));
    // durante o esmaecer de saída, a anterior ainda está na tela: cada clique vai no botão da celebração da vez
    const next = async (name: string) => {
      const dialog = await screen.findByRole("dialog", { name });
      fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" })); // segundo clique não pula a próxima
    };
    await next("Sequência de 4 dias!");
    await next("Novo nível: Explorador");
    await next("Medalha desbloqueada: Primeiros Passos");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("");
  });

  it("resposta sem conquista não abre nada", async () => {
    render(<Harness play={{ xp: { total: 5, valid: true }, streak_incremented: false }} />);
    fireEvent.click(screen.getByText("disparar"));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
