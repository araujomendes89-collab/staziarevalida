import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { GrandesTemasView } from "../components/grandesTemas/GrandesTemasView";
import { ALL_GRANDES_TEMAS } from "../data/grandesTemas";
import { AppProvider } from "../context/AppContext";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppProvider>{ui}</AppProvider>
    </BrowserRouter>
  );
};

describe("Grandes Temas Home Refinement (Etapa 1.17E)", () => {
  it("A: preserves all 75 canonical topics and displays correct header metrics", () => {
    renderWithProviders(<GrandesTemasView />);

    expect(screen.getByText(/Grandes Temas do Revalida/i)).toBeDefined();
    expect(screen.getAllByText(/75/i).length).toBeGreaterThan(0);
    expect(ALL_GRANDES_TEMAS.length).toBe(75);
  });

  it("B: filters by 5 medical areas using compact filter pills", () => {
    renderWithProviders(<GrandesTemasView />);

    // Click on Pediatria filter pill
    const pedButtons = screen.getAllByRole("button");
    const pedButton = pedButtons.find((b) => b.textContent?.includes("Pediatria"));
    expect(pedButton).toBeDefined();
    if (pedButton) fireEvent.click(pedButton);

    expect(screen.getByText(/Exibindo/i)).toBeDefined();
    expect(screen.getAllByText(/15/i).length).toBeGreaterThan(0);
  });

  it("C: filters topics by search input dynamically", () => {
    renderWithProviders(<GrandesTemasView />);

    const searchInput = screen.getByPlaceholderText(/Buscar tema, doença ou conduta/i);
    fireEvent.change(searchInput, { target: { value: "Síndromes Hipertensivas" } });

    expect(screen.getByText(/Síndromes Hipertensivas da Gestação/i)).toBeDefined();
  });

  it("D: uses 'Estudar Tema' CTA and does not render 'Acessar Aula'", () => {
    renderWithProviders(<GrandesTemasView />);

    // "Estudar Tema" is the primary CTA
    expect(screen.getAllByText(/Estudar Tema/i).length).toBeGreaterThan(0);

    // "Acessar Aula" is removed from the theme list cards
    expect(screen.queryByText(/Acessar Aula/i)).toBeNull();
  });
});
