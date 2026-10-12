/**
 * Treinamento em Dupla · etapa 1 · tarefa 3 (parte A): Timer, PrintItem, PrintImage, StatTile e StationCard.
 * Comportamento e textos copiados do pacote de design (components/osce/*, Room.jsx:51-65) com os tokens do app.
 * O CSS e os componentes são lidos do arquivo real: sem cor hexadecimal nem rgba().
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PrintImage, PrintItem, StatTile, StationCard, Timer } from "../novo/ds/components/osce/index.js";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const DIR = "src/novo/ds/components/osce";
const NAMES = ["Timer", "PrintItem", "PrintImage", "StatTile", "StationCard"];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Timer", () => {
  it("02:05 sem tom; 120 s warn; 30 s danger; 0 expirado", () => {
    const { rerender } = render(<Timer seconds={125} state="running" />);
    const el = () => screen.getByRole("timer");
    expect(el().textContent).toBe("02:05");
    expect(el().getAttribute("aria-live")).toBe("off");
    expect(el().getAttribute("data-tone")).toBeNull();
    expect(el().getAttribute("data-state")).toBe("running");

    rerender(<Timer seconds={121} state="running" />);
    expect(el().getAttribute("data-tone")).toBeNull();
    rerender(<Timer seconds={120} state="running" />);
    expect(el().getAttribute("data-tone")).toBe("warn");
    expect(el().textContent).toBe("02:00");
    rerender(<Timer seconds={31} state="running" />);
    expect(el().getAttribute("data-tone")).toBe("warn");
    rerender(<Timer seconds={30} state="running" />);
    expect(el().getAttribute("data-tone")).toBe("danger");
    expect(el().textContent).toBe("00:30");
    rerender(<Timer seconds={0} state="expired" />);
    expect(el().getAttribute("data-tone")).toBe("danger");
    expect(el().getAttribute("data-state")).toBe("expired");
    expect(el().textContent).toBe("00:00");
  });

  it("limites configuráveis, tempo negativo vira 00:00, fração é descartada e pausado mantém o tom", () => {
    const { rerender } = render(<Timer seconds={59.9} state="running" warnAt={60} dangerAt={10} />);
    expect(screen.getByRole("timer").textContent).toBe("00:59");
    expect(screen.getByRole("timer").getAttribute("data-tone")).toBe("warn");
    rerender(<Timer seconds={-5} state="running" />);
    expect(screen.getByRole("timer").textContent).toBe("00:00");
    rerender(<Timer seconds={600} state="paused" size={14} />);
    expect(screen.getByRole("timer").textContent).toBe("10:00");
    expect(screen.getByRole("timer").getAttribute("data-state")).toBe("paused");
    expect((screen.getByRole("timer") as HTMLElement).style.fontSize).toBe("14px");
  });

  it("parado (idle) não tem tom, mesmo com pouco tempo", () => {
    render(<Timer seconds={10} />);
    expect(screen.getByRole("timer").getAttribute("data-state")).toBe("idle");
    expect(screen.getByRole("timer").getAttribute("data-tone")).toBeNull();
  });
});

describe("StationCard", () => {
  it("'—' sem nota, '72%' e '61,4%', sem dificuldade", () => {
    const { rerender, container } = render(<StationCard areaCode="PED" number={7} title="Bronquiolite viral aguda" />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Sua última nota—");
    expect(btn.textContent).toContain("Média geral—");
    expect(screen.queryByTitle("Já realizada")).toBeNull();
    expect(container.querySelector(".osce-station__bar")).toBeNull();

    rerender(<StationCard areaCode="PED" number={7} title="Bronquiolite viral aguda" myScorePct={72} averagePct={61.4} />);
    const b2 = screen.getByRole("button");
    expect(b2.textContent).toContain("Sua última nota72%");
    expect(b2.textContent).toContain("Média geral61,4%");
    expect(screen.getByTitle("Já realizada")).toBeTruthy();
    const fill = container.querySelector(".osce-station__bar > span") as HTMLElement;
    expect(fill.style.width).toBe("72%");
    // sem dificuldade: nem texto nem rótulo
    expect(b2.textContent).not.toMatch(/Fácil|Médio|Difícil/);
    expect(container.querySelector("[aria-label^='Dificuldade']")).toBeNull();
  });

  it("zero é nota (0%), não ausência; valor fora de 0-100 não estoura a barra", () => {
    const { container, rerender } = render(<StationCard areaCode="CM" title="X" myScorePct={0} averagePct={0} />);
    expect(screen.getByRole("button").textContent).toContain("Sua última nota0%");
    expect(screen.getByRole("button").textContent).toContain("Média geral0,0%");
    expect((container.querySelector(".osce-station__bar > span") as HTMLElement).style.width).toBe("0%");
    rerender(<StationCard areaCode="CM" title="X" myScorePct={130} />);
    expect((container.querySelector(".osce-station__bar > span") as HTMLElement).style.width).toBe("100%");
  });

  it("área, número, origem, tags, clique e cores da área (selo usa o tom .solid)", () => {
    const onClick = vi.fn();
    const { container } = render(
      <StationCard areaCode="CR" number={3} title="Apendicite" tags={["Dor abdominal", "Febre"]} source="INEP 2020" onClick={onClick} />,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.textContent).toContain("Cirurgia");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Apendicite");
    expect(screen.getByText("Dor abdominal")).toBeTruthy();
    expect(screen.getByText("Febre")).toBeTruthy();
    expect(screen.getByText("INEP 2020")).toBeTruthy();
    const num = container.querySelector(".osce-station__num") as HTMLElement;
    expect(num.textContent).toBe("3");
    expect(btn.style.getPropertyValue("--osce-solid")).toBe("var(--area-cirurgia-solid)");
    expect(btn.style.getPropertyValue("--osce-base")).toBe("var(--area-cirurgia)");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("sem número não desenha o selo; sem origem e sem tags não desenha as linhas; nomes das cinco áreas", () => {
    const { container, rerender } = render(<StationCard areaCode="MFC" number={null} title="Pré-natal" />);
    expect(container.querySelector(".osce-station__num")).toBeNull();
    expect(container.querySelector(".osce-station__tags")).toBeNull();
    expect(container.querySelector(".osce-station__source")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("Medicina de Família");
    rerender(<StationCard areaCode="GO" title="a" />);
    expect(screen.getByRole("button").textContent).toContain("Ginecologia e Obstetrícia");
    rerender(<StationCard areaCode="CM" title="a" />);
    expect(screen.getByRole("button").textContent).toContain("Clínica Médica");
  });
});

describe("PrintItem", () => {
  it("título 'Impresso {n} · {título}'; sem canRelease e não liberado mostra só o título trancado", () => {
    render(<PrintItem index={1} title="Exame físico">PA 130x80</PrintItem>);
    expect(screen.getByText("Impresso 1 · Exame físico")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("PA 130x80")).toBeNull();
  });

  it("Liberar / Ocultar chamam onToggleRelease", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<PrintItem index={2} title="Exames" canRelease released={false} onToggleRelease={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Liberar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<PrintItem index={2} title="Exames" canRelease released onToggleRelease={onToggle} />);
    expect(screen.queryByRole("button", { name: "Liberar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("Ver conteúdo com aria-expanded abre e fecha o corpo", () => {
    render(
      <PrintItem index={1} title="Exame físico" canRelease released>
        PA 130x80
      </PrintItem>,
    );
    const toggle = screen.getByRole("button", { name: "Ver conteúdo" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("PA 130x80")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("PA 130x80")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("PA 130x80")).toBeNull();
  });

  it("candidato com impresso liberado vê o conteúdo; avaliador vê o botão mesmo não liberado; sem filhos não há Ver conteúdo", () => {
    const { rerender } = render(<PrintItem index={1} title="A" released>texto</PrintItem>);
    expect(screen.getByRole("button", { name: "Ver conteúdo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Liberar" })).toBeNull();
    rerender(<PrintItem index={1} title="A" canRelease>texto</PrintItem>);
    expect(screen.getByRole("button", { name: "Ver conteúdo" })).toBeTruthy();
    rerender(<PrintItem index={1} title="A" canRelease released />);
    expect(screen.queryByRole("button", { name: "Ver conteúdo" })).toBeNull();
  });
});

describe("PrintImage", () => {
  it("Ampliar abre a tela cheia, Esc fecha e o foco volta ao botão", () => {
    render(<PrintImage src="/impresso.png" alt="Radiografia de tórax" />);
    const open = screen.getByRole("button", { name: "Ampliar impresso" });
    expect(open.textContent).toContain("Ampliar");
    expect(screen.queryByRole("dialog")).toBeNull();
    open.focus();
    fireEvent.click(open);
    const dlg = screen.getByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-label")).toBe("Radiografia de tórax");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.getAllByAltText("Radiografia de tórax")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("Fechar e clique no fundo fecham; clique na imagem não; Tab não sai do botão Fechar", () => {
    render(<PrintImage src="/impresso.png" alt="ECG" />);
    const open = screen.getByRole("button", { name: "Ampliar impresso" });
    fireEvent.click(open);
    const imgs = screen.getAllByAltText("ECG");
    fireEvent.click(imgs[1]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false); // preventDefault: foco preso
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("StatTile", () => {
  it("rótulo, valor, dica e ícone", () => {
    const { container, rerender } = render(<StatTile icon="radio" label="Disponíveis agora" value={12} hint="na última hora" />);
    expect(screen.getByText("Disponíveis agora")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("na última hora")).toBeTruthy();
    expect(container.querySelector(".sm-icon")).not.toBeNull();
    rerender(<StatTile label="Estações" value="—" />);
    expect(container.querySelector(".sm-icon")).toBeNull();
    expect(container.querySelector(".osce-stat__hint")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("arquivos", () => {
  it("osce.css e componentes osce (parte A) sem cor hexadecimal nem rgba(), cada um com .d.ts", () => {
    for (const n of NAMES) {
      const jsx = read(`${DIR}/${n}.jsx`);
      expect(jsx, n).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(jsx, n).not.toMatch(/rgba?\(|hsla?\(/);
      expect(jsx, `${n} não usa lucide-react`).not.toMatch(/lucide-react/);
      expect(fs.existsSync(path.join(ROOT, `${DIR}/${n}.d.ts`)), `${n}.d.ts`).toBe(true);
    }
    const css = read(`${DIR}/osce.css`);
    expect(css.length).toBeGreaterThan(500);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(|hsla?\(/);
    const idx = read(`${DIR}/index.js`);
    for (const n of NAMES) expect(idx).toMatch(new RegExp(`\\b${n}\\b`));
    expect(idx).not.toMatch(/MatchCard|PepTable/);
  });

  it("osce.css só tem classes dos cinco componentes (nada de match nem pep)", () => {
    const css = read(`${DIR}/osce.css`);
    expect(css).not.toMatch(/osce-(match|pep)/);
    for (const c of ["osce-timer", "osce-print", "osce-printimg", "osce-stat", "osce-station"]) expect(css).toContain(`.${c}`);
  });

  it("o pulso do cronômetro respeita 'reduzir movimento'", () => {
    const css = read(`${DIR}/osce.css`);
    expect(css).toMatch(/@media \(prefers-reduced-motion: ?reduce\)/);
  });
});
