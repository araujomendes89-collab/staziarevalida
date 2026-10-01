import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { OfficialMedicalSearchView } from "../components/materiais/OfficialMedicalSearchView";
import { OfficialSearchService } from "../services/officialSearchService";
import { AppProvider } from "../context/AppContext";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppProvider>{ui}</AppProvider>
    </BrowserRouter>
  );
};

describe("Official Materials Document-First View Refinement (Etapa 1.19C)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("A: renders Document-First compact header and protagonist search bar", () => {
    renderWithProviders(<OfficialMedicalSearchView />);

    expect(screen.getByText(/Materiais Oficiais & Diretrizes/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Buscar por PCDT, doença, portaria/i)).toBeDefined();
    expect(screen.getByText(/A vigência é indicada quando confirmada na fonte/i)).toBeDefined();
  });

  it("B: renders quick trending topics with document consultation CTA", () => {
    renderWithProviders(<OfficialMedicalSearchView />);

    expect(screen.getByText(/Atualizações Normativas & Clínicas em Destaque/i)).toBeDefined();
    expect(screen.getAllByText(/Consultar documento/i).length).toBeGreaterThan(0);
  });

  it("C: displays Document-First result card with primary source CTA and separated StaziaMed synthesis", async () => {
    // Test the fallback/grounding result card rendering
    renderWithProviders(<OfficialMedicalSearchView initialQuery="HPV" />);

    // Wait for result to appear
    const headerTitle = await screen.findByText(/Diretriz do Ministério da Saúde|Nota Técnica/i);
    expect(headerTitle).toBeDefined();

    // Provenance badge and primary source CTA
    expect(screen.getAllByText(/Fonte Governamental \(SUS \/ MS\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Abrir Fonte Original/i)).toBeDefined();
    expect(screen.getByText(/Copiar Ficha/i)).toBeDefined();

    // Separated StaziaMed synthesis
    expect(screen.getByText(/Síntese Analítica StaziaMed/i)).toBeDefined();
    expect(screen.getByText(/Mudança Relevante/i)).toBeDefined();
    expect(screen.getByText(/Aplicação no Revalida/i)).toBeDefined();
  });
});
