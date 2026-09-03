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

describe("Video Lessons Prototype Integrity (Etapa 1.18B)", () => {
  it("A: preserves all 8 sample video lessons and displays correct header", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    expect(screen.getByText(/Aulas Teórico-Práticas/i)).toBeDefined();
    expect(screen.getAllByText(/8/i).length).toBeGreaterThan(0);
    expect(SAMPLE_VIDEO_LESSONS.length).toBe(8);
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

  it("D: does not render fake watch progress or 35% fixed timer in the catalog", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    // Fake progress metrics should not be rendered
    expect(screen.queryByText(/Tempo Assistido/i)).toBeNull();
    expect(screen.queryByText(/Aulas Concluídas/i)).toBeNull();
    expect(screen.queryByText(/35%/i)).toBeNull();
    expect(screen.queryByText(/Continuar Assistindo/i)).toBeNull();
  });

  it("E: opens lesson preview and navigates back cleanly", () => {
    renderWithProviders(<VideoLessonsCatalogView />);

    const lessonCard = screen.getByText(/Síndromes Hipertensivas na Gestação/i);
    fireEvent.click(lessonCard);

    // Should show lesson preview
    expect(screen.getByText(/Preview teórico-prático orientado ao Revalida INEP/i)).toBeDefined();
    expect(screen.getByText(/Resumo & Racionalidade Clínica/i)).toBeDefined();

    // Navigate back
    const backBtn = screen.getByText(/Voltar para o Catálogo de Aulas/i);
    fireEvent.click(backBtn);

    expect(screen.getByText(/Aulas Teórico-Práticas/i)).toBeDefined();
  });
});
