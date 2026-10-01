import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { ProtocolUpdatesHubView } from '../components/materiais/ProtocolUpdatesHubView';
import { PROTOCOL_UPDATES_2025_2026 } from '../data/protocolUpdatesData';

describe('Protocol Updates Pedagogical & Visual Redesign (Etapa 1.20E)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.scrollTo = vi.fn();
  });

  it('preserves all protocol records in the authoritative dataset', () => {
    expect(PROTOCOL_UPDATES_2025_2026.length).toBe(19);
    const affectedQuestionsCount = PROTOCOL_UPDATES_2025_2026.reduce(
      (acc, p) => acc + (p.affected_exam_questions?.length || 0),
      0
    );
    expect(affectedQuestionsCount).toBe(3);

    const flashcardsCount = PROTOCOL_UPDATES_2025_2026.reduce(
      (acc, p) => acc + (p.flashcards?.length || 0),
      0
    );
    expect(flashcardsCount).toBe(5);

    const ineditasCount = PROTOCOL_UPDATES_2025_2026.reduce(
      (acc, p) => acc + (p.ineditas?.length || 0),
      0
    );
    expect(ineditasCount).toBe(1);
  });

  it('renders the compact home list with zero confusing top sub-tabs', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <ProtocolUpdatesHubView />
        </AppProvider>
      </BrowserRouter>
    );

    // Old sub-tabs are no longer in top navigation
    expect(screen.queryByRole('button', { name: /Visão Geral/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /⚠️ O QUE MUDOU EM 2025/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /🔥 O QUE MUDOU EM 2026/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /📚 Provas Antigas/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /✨ Questões Inéditas/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /🗂️ Flashcards/i })).toBeNull();

    // Clean header and update count
    expect(screen.getByRole('heading', { level: 1, name: /Atualizações & Diretrizes/i })).toBeInTheDocument();
    expect(screen.getByText(/atualizações catalogadas/i)).toBeInTheDocument();

    // Protocol card titles are displayed directly
    expect(screen.getByText(/Rastreamento do Câncer de Colo do Útero por Teste Molecular DNA-HPV no SUS/i)).toBeInTheDocument();
  });

  it('filters updates by search query and area', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <ProtocolUpdatesHubView />
        </AppProvider>
      </BrowserRouter>
    );

    const searchInput = screen.getByPlaceholderText(/Buscar por tema, conduta, fármaco/i);
    fireEvent.change(searchInput, { target: { value: 'Pré-Eclâmpsia' } });

    expect(screen.getByText(/Prevenção da Pré-Eclâmpsia com AAS e Cálcio em Gestantes de Alto Risco/i)).toBeInTheDocument();
    expect(screen.queryByText(/Rastreamento do Câncer de Colo do Útero por Teste Molecular DNA-HPV/i)).toBeNull();
  });

  it('opens detailed view for a protocol showing Antes x Agora, Revalida, Fonte, Questões Históricas and Prática', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <ProtocolUpdatesHubView />
        </AppProvider>
      </BrowserRouter>
    );

    // Click on first "Ver atualização"
    const viewButtons = screen.getAllByRole('button', { name: /Ver atualização/i });
    fireEvent.click(viewButtons[0]);

    // Detail view heading
    expect(screen.getByRole('heading', { level: 1, name: /Rastreamento do Câncer de Colo do Útero por Teste Molecular DNA-HPV no SUS/i })).toBeInTheDocument();

    // Protagonist: O que mudou? (Antes x Agora)
    expect(screen.getByText(/O que mudou na conduta médica\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Conduta Anterior \(Antes de 2025\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^Conduta Vigente$/i)).toBeInTheDocument();
    expect(screen.getByText(/Rastreamento exclusivamente por citopatologia convencional/i)).toBeInTheDocument();

    // Para o Revalida
    expect(screen.getByText(/^O que lembrar para o Revalida$/i)).toBeInTheDocument();
    expect(screen.getByText(/Como isso pode aparecer no Revalida:/i)).toBeInTheDocument();
    expect(screen.getByText(/Alerta de Pegadinha da Banca:/i)).toBeInTheDocument();

    // Fonte e Classificação
    expect(screen.getByText(/Fonte Governamental \(SUS \/ MS\)/i)).toBeInTheDocument();
    expect(screen.getByText(/PCDT para Prevenção e Rastreamento do Câncer do Colo do Útero/i)).toBeInTheDocument();
    expect(screen.getByText(/Abrir fonte original/i)).toBeInTheDocument();

    // Questões Históricas da Prova Afetadas (Accordion)
    const historicalAccordionBtn = screen.getByRole('button', { name: /Questões Históricas da Prova Afetadas/i });
    expect(historicalAccordionBtn).toBeInTheDocument();
    fireEvent.click(historicalAccordionBtn);

    expect(screen.getByText(/Aviso de Atualização:/i)).toBeInTheDocument();
    expect(screen.getByText(/Gabarito Original Oficial da Prova:/i)).toBeInTheDocument();
    expect(screen.getByText(/Alternativa B \(Papanicolaou a cada 3 anos após dois normais anuais\)/i)).toBeInTheDocument();

    // Revisão Ativa & Prática (Inéditas e Flashcards)
    expect(screen.getByText(/✨ Questão Inédita Comentada/i)).toBeInTheDocument();
    expect(screen.getByText(/Flashcard de Fixação/i)).toBeInTheDocument();

    // Can go back to list
    const backBtn = screen.getByRole('button', { name: /Voltar para todas as atualizações/i });
    fireEvent.click(backBtn);
    expect(screen.getByRole('heading', { level: 1, name: /Atualizações & Diretrizes/i })).toBeInTheDocument();
  });

  it('allows toggling to Tabela Comparativa mode and returning to List mode', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <ProtocolUpdatesHubView />
        </AppProvider>
      </BrowserRouter>
    );

    const tableToggleBtn = screen.getByRole('button', { name: /Modo Tabela Comparativa/i });
    fireEvent.click(tableToggleBtn);

    expect(screen.getByText(/Matriz Comparativa de Atualizações \(Antes × Agora\)/i)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /Voltar para Lista de Atualizações/i });
    fireEvent.click(returnBtn);

    expect(screen.getByRole('heading', { level: 1, name: /Atualizações & Diretrizes/i })).toBeInTheDocument();
  });
});
