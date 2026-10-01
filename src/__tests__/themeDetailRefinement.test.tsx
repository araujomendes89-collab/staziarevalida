import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ThemeInteractiveLesson } from "../components/estudar/ThemeInteractiveLesson";
import { ALL_GRANDES_TEMAS } from "../data/grandesTemas";
import { AppProvider } from "../context/AppContext";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppProvider>{ui}</AppProvider>
    </BrowserRouter>
  );
};

describe("Theme Detail Refinement (Etapa 1.17D)", () => {
  const sampleTheme = ALL_GRANDES_TEMAS[0];

  it("A: renders compact header with title, area, and primary CTA", () => {
    const onBack = vi.fn();
    const onOpenQuestions = vi.fn();

    renderWithProviders(
      <ThemeInteractiveLesson
        tema={sampleTheme}
        onBack={onBack}
        onOpenQuestions={onOpenQuestions}
      />
    );

    expect(screen.getByText(sampleTheme.title)).toBeDefined();
    expect(screen.getByText(sampleTheme.areaName)).toBeDefined();
    expect(screen.getByText(/Começar Tema/i)).toBeDefined();
  });

  it("B: preserves all 16 micro-modules in the progressive stepper trail", () => {
    const onBack = vi.fn();
    const onOpenQuestions = vi.fn();

    renderWithProviders(
      <ThemeInteractiveLesson
        tema={sampleTheme}
        onBack={onBack}
        onOpenQuestions={onOpenQuestions}
      />
    );

    expect(screen.getByText(/Estrutura do Estudo/i)).toBeDefined();
    expect(screen.getByText(/0\/16 Concluídos/i)).toBeDefined();

    // Verify first module is active
    expect(screen.getAllByText(/1\. Enquadramento e Relevância no Revalida INEP/i).length).toBeGreaterThan(0);
  });

  it("C: allows free navigation across all 16 modules without blocking", () => {
    const onBack = vi.fn();
    const onOpenQuestions = vi.fn();

    renderWithProviders(
      <ThemeInteractiveLesson
        tema={sampleTheme}
        onBack={onBack}
        onOpenQuestions={onOpenQuestions}
      />
    );

    // Click on module 8 (Conduta Terapêutica)
    const mod8 = screen.getByText(/8\. Conduta Terapêutica de Primeira Linha/i);
    fireEvent.click(mod8);

    expect(screen.getByText(/Módulo 8 de 16/i)).toBeDefined();
    expect(screen.getAllByText(/Conduta Terapêutica de Primeira Linha/i).length).toBeGreaterThan(0);
  });

  it("D: toggles module completion and updates progress bar", () => {
    const onBack = vi.fn();
    const onOpenQuestions = vi.fn();

    renderWithProviders(
      <ThemeInteractiveLesson
        tema={sampleTheme}
        onBack={onBack}
        onOpenQuestions={onOpenQuestions}
      />
    );

    const markBtn = screen.getByText(/Marcar como Estudado/i);
    fireEvent.click(markBtn);

    expect(screen.getByText(/Módulo Concluído/i)).toBeDefined();
    expect(screen.getAllByText(/1 de 16/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Continuar Estudo/i)).toBeDefined();
  });

  it("E: renders complementary resource tabs (Mapa visual, Matriz, Fontes)", () => {
    const onBack = vi.fn();
    const onOpenQuestions = vi.fn();

    renderWithProviders(
      <ThemeInteractiveLesson
        tema={sampleTheme}
        onBack={onBack}
        onOpenQuestions={onOpenQuestions}
      />
    );

    // Click on Mapa Visual
    const mapaTab = screen.getByText(/Mapa Visual & Árvore Decisória/i);
    fireEvent.click(mapaTab);
    expect(screen.getByText(/Árvore de Decisão Clínica/i)).toBeDefined();

    // Click on Matriz Cognitiva
    const matrizTab = screen.getByText(/Matriz Cognitiva do Tema/i);
    fireEvent.click(matrizTab);
    expect(screen.getByText(/Diagnóstico Mais Cobrado/i)).toBeDefined();

    // Click on Fontes Oficiais
    const fontesTab = screen.getByText(/Fontes Oficiais do SUS/i);
    fireEvent.click(fontesTab);
    expect(screen.getByText(/Diretrizes Oficiais e Legislação do SUS/i)).toBeDefined();
  });
});
