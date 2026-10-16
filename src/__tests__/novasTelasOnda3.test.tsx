// @vitest-environment jsdom
/** Novas telas, onda 3: A−/A+ e "Ver caso completo" da questão, arte das áreas e botões de pausa do cabeçalho. */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend: { rpc: vi.fn() }, boot: {}, user: { id: "u" } }) }));

import { QuestionSheet } from "../novo/app/practice/tela/QuestionSheet.jsx";
import { AreaArtTile } from "../novo/ds/area-icons/AreaArtTile.jsx";
import { QuestionHeader } from "../novo/app/practice/tela/QuestionHeader.jsx";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const question = {
  id: "q1",
  number: 5,
  area: "PEDIATRIA",
  exam: { kind: "REVALIDA", year: 2024, semester: 1 },
  statement: "Criança de 3 anos com febre há 2 dias. Qual a conduta?",
  options: [],
  images: [],
  support: null,
  preliminary: null,
};
const sheet = (revealed: boolean) => (
  <MemoryRouter>
    <QuestionSheet question={question} revealed={revealed} alternatives={<div />} />
  </MemoryRouter>
);

describe("Onda 3 · tela de questão", () => {
  it("A− e A+ mudam o tamanho do texto e guardam a escolha só neste aparelho", () => {
    const { container } = render(sheet(false));
    const root = container.querySelector(".tq-sheet") as HTMLElement;
    expect(root.dataset.fs).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Aumentar texto" }));
    expect(root.dataset.fs).toBe("2");
    expect((screen.getByRole("button", { name: "Aumentar texto" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Diminuir texto" }));
    fireEvent.click(screen.getByRole("button", { name: "Diminuir texto" }));
    expect(root.dataset.fs).toBe("0");
    expect(window.localStorage.getItem("stazia-tq-tamanho-texto")).toBe("0");
  });

  it("antes de responder não há 'Ver caso completo'; depois, ele abre e fecha o caso", () => {
    const { rerender } = render(sheet(false));
    expect(screen.queryByText("Ver caso completo")).toBeNull();
    rerender(sheet(true));
    const toggle = screen.getByRole("button", { name: "Ver caso completo" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Mostrar menos" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("a arte da área é decorativa e cada área tem a sua", () => {
    const { container } = render(
      <div>
        <AreaArtTile area="" />
        <AreaArtTile area="PEDIATRIA" />
        <AreaArtTile area="MEDICINA_FAMILIA_COMUNIDADE" />
      </div>
    );
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(3);
    expect(new Set(imgs.map((i) => i.getAttribute("src"))).size).toBe(3);
    expect(imgs.every((i) => i.getAttribute("alt") === "")).toBe(true);
  });

  it("o simulado pausa e continua com os botões de pausa cheios e rótulos claros", () => {
    const timer = { mainLabel: "Restante", mainValue: 600, level: "ok", fraction: 0.5, paused: false, questionSeconds: 5, aria: "Tempo" };
    const { rerender } = render(<QuestionHeader label="Simulado" index={0} total={5} segments={null} timer={timer} onExit={() => {}} pause={{ paused: false, onToggle: () => {} }} onEnd={() => {}} />);
    expect(screen.getByRole("button", { name: "Pausar o simulado" }).querySelector("svg[fill='currentColor']")).toBeTruthy();
    rerender(<QuestionHeader label="Simulado" index={0} total={5} segments={null} timer={{ ...timer, paused: true }} onExit={() => {}} pause={{ paused: true, onToggle: () => {} }} onEnd={() => {}} />);
    expect(screen.getByRole("button", { name: "Continuar o simulado" })).toBeTruthy();
  });
});
