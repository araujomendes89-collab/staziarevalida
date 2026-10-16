// Aulas fechadas ao aluno por enquanto (decisão do dono, 14/10/2026). O menu lateral do aluno não tem "Aulas";
// ligar VITE_AULAS_ALUNO=1 (e publicar) é o caminho para abrir de novo. A equipe (Administração) não é afetada.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "../novo/app/Shell.jsx";
import { aulasParaAluno } from "../novo/app/features.js";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const mount = () =>
  render(
    <AppShell route="home" go={() => {}} phase={1} setPhase={() => {}} theme="light" setTheme={() => {}} info={{ isStaff: false }}>
      <div />
    </AppShell>
  );

describe("Aulas fechadas ao aluno", () => {
  it("o interruptor começa desligado e só o valor 1 liga", () => {
    expect(aulasParaAluno()).toBe(false);
    vi.stubEnv("VITE_AULAS_ALUNO", "true");
    expect(aulasParaAluno()).toBe(false);
    vi.stubEnv("VITE_AULAS_ALUNO", "1");
    expect(aulasParaAluno()).toBe(true);
  });
  it("o menu do aluno não tem Aulas, mas mantém Temas Essenciais e Diretrizes e Atualizações", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Aprender/ })); // a sanfona abre o grupo
    expect(screen.queryByRole("button", { name: /^Aulas$/ })).toBeNull();
    expect(screen.getAllByText("Temas Essenciais").length).toBeGreaterThan(0);
  });
  it("com o interruptor ligado o menu volta a ter Aulas", () => {
    vi.stubEnv("VITE_AULAS_ALUNO", "1");
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Aprender/ }));
    expect(screen.getAllByText("Aulas").length).toBeGreaterThan(0);
  });
});
