import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { STUDENT_NAVIGATION_CONFIG } from "../config/navigation";
import { EstudarView } from "../components/estudar/EstudarView";
import { AppProvider } from "../context/AppContext";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppProvider>{ui}</AppProvider>
    </BrowserRouter>
  );
};

describe("Study Navigation Reorganization (Etapa 1.17B)", () => {
  it("A: verifies Sidebar has exactly 4 canonical items under ESTUDAR", () => {
    const estudarSection = STUDENT_NAVIGATION_CONFIG.find((s) => s.id === "estudar");
    expect(estudarSection).toBeDefined();
    expect(estudarSection?.subItems?.length).toBe(4);

    const subItemIds = estudarSection?.subItems?.map((item) => item.id);
    expect(subItemIds).toEqual([
      "estudar-plano-hoje",
      "estudar-aulas",
      "estudar-grandes-temas",
      "estudar-materiais",
    ]);
  });

  it("B: renders EstudarView without duplicate horizontal subtab buttons", () => {
    const { container } = renderWithProviders(<EstudarView initialSubTab="PLANO_HOJE" />);

    // Assert that the duplicate 4-button header bar is not rendered
    const subTabBar = container.querySelector(".overflow-x-auto.bg-slate-100\\/90");
    expect(subTabBar).toBeNull();
  });

  it("C: renders Plano de Hoje by default and shows the 3-step cycle", () => {
    renderWithProviders(<EstudarView initialSubTab="PLANO_HOJE" />);

    // Checks presence of cycle elements
    expect(screen.getAllByText(/ESTUDAR/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/PRATICAR/i)).toBeDefined();
    expect(screen.getAllByText(/REVIS/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Etapas do Ciclo de Hoje/i)).toBeDefined();
  });

  it("D: resolves canonical Aulas subtab correctly", () => {
    renderWithProviders(<EstudarView initialSubTab="AULAS" />);

    expect(screen.getByText(/Aulas Teórico-Práticas/i)).toBeDefined();
    expect(screen.getAllByText(/Aulas/i).length).toBeGreaterThan(0);
  });

  it("E: resolves canonical Grandes Temas subtab correctly", () => {
    renderWithProviders(<EstudarView initialSubTab="GRANDES_TEMAS" />);

    expect(screen.getByText(/Grandes Temas do Revalida/i)).toBeDefined();
    expect(screen.getAllByText(/75/i).length).toBeGreaterThan(0);
  });

  it("F: resolves canonical Materiais Oficiais subtab correctly", () => {
    renderWithProviders(<EstudarView initialSubTab="MATERIAIS" />);

    expect(screen.getByText(/Materiais Oficiais & Diretrizes/i)).toBeDefined();
  });
});
