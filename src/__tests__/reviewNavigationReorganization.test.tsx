import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { RevisarView } from '../components/revisar/RevisarView';
import { STUDENT_NAVIGATION_CONFIG } from '../config/navigation';
import { tabToPath, pathToTab } from '../services/routeMapping';

describe('Review Navigation Reorganization (Etapa 1.20B)', () => {
  it('should have exactly 3 sub-items in the student Sidebar for REVISAR', () => {
    const revisarSection = STUDENT_NAVIGATION_CONFIG.find((s) => s.id === 'revisar');
    expect(revisarSection).toBeDefined();
    expect(revisarSection?.subItems?.length).toBe(3);

    const subIds = revisarSection?.subItems?.map((item) => item.id);
    expect(subIds).toEqual(['revisar-erros', 'revisar-flashcards', 'revisar-atualizacoes']);
  });

  it('should not contain duplicate top navigation tabs inside RevisarView container', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <RevisarView initialSubTab="FLASHCARDS" />
        </AppProvider>
      </BrowserRouter>
    );

    // The old top horizontal tabs bar with 5 buttons is removed
    expect(screen.queryByRole('button', { name: /Radar de Diretrizes/i })).toBeNull();
    // The main content of Flashcards is rendered cleanly
    expect(screen.getByText(/Revisão espaçada dos conteúdos clínicos/i)).toBeInTheDocument();
  });

  it('should preserve all routes and direct access for all review submodules', () => {
    expect(tabToPath('revisar')).toBe('/revisar');
    expect(tabToPath('revisar-flashcards')).toBe('/revisar/flashcards');
    expect(tabToPath('revisar-erros')).toBe('/revisar/erros');
    expect(tabToPath('revisar-atualizacoes')).toBe('/revisar/atualizacoes');
    expect(tabToPath('revisar-radar')).toBe('/revisar/radar');
    expect(tabToPath('revisar-audio')).toBe('/revisar/audio');

    // Reverse resolution
    expect(pathToTab('/revisar/flashcards')).toBe('revisar-flashcards');
    expect(pathToTab('/revisar/erros')).toBe('revisar-erros');
    expect(pathToTab('/revisar/atualizacoes')).toBe('revisar-atualizacoes');
    expect(pathToTab('/revisar/radar')).toBe('revisar-radar');
    expect(pathToTab('/revisar/audio')).toBe('revisar-audio');
  });

  it('should render ErrorNotebookView when initialSubTab is ERRORS', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <RevisarView initialSubTab="ERRORS" />
        </AppProvider>
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Caderno de Erros' })).toBeInTheDocument();
    expect(screen.getByText(/Revise os pontos que mais estão custando questões/i)).toBeInTheDocument();
  });

  it('should render ProtocolUpdatesHubView when initialSubTab is ATUALIZACOES', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <RevisarView initialSubTab="ATUALIZACOES" />
        </AppProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/ATUALIZAÇÕES REVALIDA 2025–2026/i)).toBeInTheDocument();
  });
});
