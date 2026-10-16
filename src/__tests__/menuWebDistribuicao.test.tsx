// @vitest-environment jsdom
/**
 * Menu lateral da web: distribuição pela altura da janela (frente menu-web, 16/10/2026).
 * O pedido do dono: "melhore a distribuição do menu lateral da versão web". Em janela alta o painel esticava e sobrava um vazio de
 * até 37% entre "Tutor com IA" e "Configurações". Agora linhas e espaços crescem com a altura (44 a 52 px), o painel para em 900 px
 * e o selo "IA" fica na mesma coluna dos outros selos. A medida em pixels só se confere em navegador (capturas em
 * .tmp-aulas/menu-web); aqui ficam o que o jsdom enxerga (marcação) e o contrato do CSS (valores do pacote e alvos de toque).
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "../novo/app/Shell.jsx";

afterEach(() => {
  cleanup();
  localStorage.removeItem("smf-col");
});

const INFO = { name: "Ana Souza", streakDays: 0, onSignOut: vi.fn(), isStaff: false, isReviewer: false, wrongPending: 7, planDone: 0, planTotal: 2, missionsDone: 0, missionsTotal: 3 };
const mount = () =>
  render(
    <AppShell route="medalhas" go={vi.fn()} theme="light" setTheme={() => {}} title="Medalhas" sub="" phase={1} setPhase={() => {}} phase2Locked info={INFO}>
      <div>corpo</div>
    </AppShell>
  );

describe("Menu lateral da web: selos na mesma coluna", () => {
  it("'Tutor com IA' tem o selo IA e o espaço da seta (vazio, escondido do leitor de tela), como os grupos com seta", () => {
    localStorage.removeItem("smf-col");
    mount();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const tutor = within(nav).getByRole("button", { name: "Tutor com IA" });
    const filhos = Array.from(tutor.children).map((c) => c.className);
    const ia = filhos.findIndex((c) => c.includes("smn-badge--ai"));
    const espaco = filhos.findIndex((c) => c.includes("smn-chev-slot"));
    expect(ia).toBeGreaterThan(-1);
    expect(espaco).toBe(ia + 1); // o espaço da seta vem logo depois do selo: o selo para onde param os de 0/2, 7 e 0/3
    const slot = tutor.querySelector(".smn-chev-slot");
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(slot?.textContent).toBe("");
    // os grupos com seta seguem com a seta e o selo antes dela
    const revisar = within(nav).getByRole("button", { name: "Revisar" });
    const f = Array.from(revisar.children).map((c) => c.className);
    expect(f.findIndex((c) => c.includes("smn-badge"))).toBeLessThan(f.findIndex((c) => c.includes("smn-chev")));
    expect(revisar.querySelector(".smn-chev-slot")).toBeNull();
  });

  it("recolhido, o Tutor vira a bolinha violeta e não leva o espaço da seta; os nomes dos itens e o selo IA não mudam", () => {
    mount();
    expect(within(screen.getByRole("button", { name: "Tutor com IA" })).getByText("IA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recolher menu" }));
    const tutor = screen.getByRole("button", { name: "Tutor com IA" });
    expect(tutor.querySelector(".smn-dot--ai")).not.toBeNull();
    expect(tutor.querySelector(".smn-chev-slot")).toBeNull();
  });
});

describe("Menu lateral da web: contrato do CSS (shell.css)", () => {
  const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../novo/app/shell/shell.css"), "utf8");
  const bloco = css.slice(css.indexOf("Menu lateral da web: distribuição pela altura da janela"));
  const semEspaco = (s: string) => s.replace(/\s+/g, "");

  it("a medida de partida é a do pacote (grupos e subitens de 44 px, espaço de 4 px) e o painel tem teto", () => {
    expect(bloco.length).toBeGreaterThan(500);
    const base = semEspaco(bloco);
    for (const v of ["--smn-row:44px", "--smn-sub:44px", "--smn-gap:4px", "--smn-logo-t:20px", "--smn-logo-b:12px"]) expect(base).toContain(v);
    expect(base).toContain("--smn-max:900px;max-height:var(--smn-max)");
  });

  it("no toque (pointer: coarse) as linhas nunca ficam abaixo de 44 px; com mouse o piso é 40 px (subitens 38 px, como no pacote)", () => {
    const base = semEspaco(bloco);
    expect(base).toContain("--smn-min:40px;--smn-sub-min:38px");
    expect(base).toContain("@media(pointer:coarse){.smn-side{--smn-min:44px;--smn-sub-min:44px}}");
    // as linhas só encolhem até o piso (min) e só crescem até 52 px (grupos) e 46 px (subitens)
    expect(base).toContain("--smn-row:round(down,clamp(var(--smn-min),");
    expect(base).toContain("--smn-sub:round(down,clamp(var(--smn-sub-min),");
    expect(base).toMatch(/--smn-row:round\(down,clamp\(44px,[^;]*,52px\),1px\)/);
    expect(base).toMatch(/--smn-sub:round\(down,clamp\(44px,[^;]*,46px\),1px\)/);
  });

  it("só usa round() com @supports (navegador sem round() fica com as medidas do pacote) e cada faixa tem a sua janela", () => {
    const suporte = bloco.indexOf("@supports (height:round(down,1.5px,1px))");
    expect(suporte).toBeGreaterThan(-1);
    expect(bloco.indexOf("--smn-row:round(")).toBeGreaterThan(suporte); // nenhuma variável usa round() fora do @supports
    const base = semEspaco(bloco.slice(suporte));
    expect(base).toContain("@media(min-height:800px)");
    expect(base).toContain("@media(max-height:799px)");
  });

  it("as linhas do menu usam as variáveis (grupos, rodapé e subitens) e o selo do Tutor tem o espaço da seta de 16 px", () => {
    const base = semEspaco(bloco);
    expect(base).toContain(".smn-side.smn-grp,.smn-side.smn-foot.smn-grp{min-height:var(--smn-row)}");
    expect(base).toContain(".smn-side.smn-item{min-height:var(--smn-sub)}");
    expect(base).toContain(".smn-chev-slot{flex:none;width:16px;height:16px}");
  });
});
