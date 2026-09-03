import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { VideoLessonsCatalogView, SAMPLE_VIDEO_LESSONS } from "../components/lessons/VideoLessonsCatalogView";
import { AppProvider } from "../context/AppContext";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppProvider>{ui}</AppProvider>
    </BrowserRouter>
  );
};

describe("Video Lessons Prototype Honesty (Etapa 1.18C)", () => {
  it("A: preserves internal sample lessons while presenting an honest status badge in header", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    expect(screen.getByText(/Aulas Teórico-Práticas/i)).toBeDefined();
    expect(screen.getByText(/Módulo em Estruturação/i)).toBeDefined();
    expect(screen.getAllByText(/5/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Grandes Áreas/i)).toBeDefined();
    expect(SAMPLE_VIDEO_LESSONS.length).toBe(8);

    // Mock count should NOT be presented as published videos count
    expect(screen.queryByText(/8 Aulas Disponíveis/i)).toBeNull();
  });

  it("B: filters lessons by 5 medical areas using canonical labels", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    // Click on Pediatria filter pill
    const pedButton = screen.getByRole("button", { name: /Pediatria/i });
    fireEvent.click(pedButton);

    expect(screen.getByText(/Pneumonias Adquiridas na Comunidade na Infância/i)).toBeDefined();
  });

  it("C: filters lessons by search query", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    const searchInput = screen.getByPlaceholderText(/Buscar aula por título/i);
    fireEvent.change(searchInput, { target: { value: "Sepse" } });

    expect(screen.getByText(/Manejo da Sepse & Choque Séptico/i)).toBeDefined();
  });

  it("D: does not render fake watch progress, fake playback timers or continue watching in the catalog", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    // Fake progress metrics should not be rendered
    expect(screen.queryByText(/Tempo Assistido/i)).toBeNull();
    expect(screen.queryByText(/Aulas Concluídas/i)).toBeNull();
    expect(screen.queryByText(/35%/i)).toBeNull();
    expect(screen.queryByText(/Continuar Assistindo/i)).toBeNull();
    expect(screen.queryByText(/14:20/i)).toBeNull();
  });

  it("E: opens lesson preview with honest preview label and CTA 'Ver conteúdo'", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    expect(screen.getAllByText(/Ver conteúdo/i).length).toBeGreaterThan(0);

    const lessonCard = screen.getByText(/Síndromes Hipertensivas na Gestação/i);
    fireEvent.click(lessonCard);

    // Should show honest lesson preview
    expect(screen.getByText(/Estrutura e preview teórico-prático para o Revalida/i)).toBeDefined();
    expect(screen.getByText(/Resumo & Racionalidade Clínica/i)).toBeDefined();
    expect(screen.getByText(/Pontos-Chave para o Revalida/i)).toBeDefined();

    // Navigate back
    const backBtn = screen.getByText(/Voltar para o Catálogo de Aulas/i);
    fireEvent.click(backBtn);

    expect(screen.getByText(/Aulas Teórico-Práticas/i)).toBeDefined();
  });
});
