/**
 * Atualizações & Diretrizes (jsdom) com o banco simulado: estado vazio honesto, lista com destaque e filtros, tabela
 * comparativa, detalhe com antes × agora, aviso quando não há conferência médica, fonte só com endereço, flashcard,
 * questão de treino e "Treinar questões deste tema". As regras estão em supabaseGuidelineUpdatesApi.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { UpdatesScreen } from "../novo/app/study/UpdatesScreen.jsx";

const ITEM = {
  id: "1", slug: "pe", area: "GINECOLOGIA_OBSTETRICIA", area_label: "Gineco & Obstetrícia", topic: "Prevenção da pré-eclâmpsia", subtopic: "Alto risco",
  years: [2025], priority: 1, publication_label: "05/2025", institution: "Instituição de teste", document_title: "Documento de teste",
  source_url: "https://www.gov.br/teste", before_text: "Conduta antiga de teste.", current_conduct: "Conduta vigente de teste.", reviewed: true,
  reviewed_at: "2026-10-06T12:00:00Z", published: true,
};
const OTHER = { ...ITEM, id: "2", slug: "has", area: "CLINICA_MEDICA", topic: "Hipertensão arterial", years: [2026], priority: 2, reviewed: false, reviewed_at: null, source_url: null };
let list: any;
let detail: any;

beforeEach(() => {
  list = { total: 2, by_area: { GINECOLOGIA_OBSTETRICIA: 1, CLINICA_MEDICA: 1 }, years: [2025, 2026], items: [ITEM, OTHER] };
  detail = {
    ...ITEM, timeline: [{ year: 2025, text: "Mudança de 2025 de teste." }], clinical_impact: "Impacto de teste.", exam_impact: "Como cai de teste.", trap: "Pegadinha de teste.",
    flashcards: [{ front: "Frente de teste?", back: "Verso de teste" }],
    practice_questions: [{ statement: "Enunciado de teste com mais de vinte caracteres.", answer: "B", commentary: "Comentário de teste.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}`, justification: `Justificativa ${id}` })) }],
    questions_count: 4,
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_guideline_updates") return list;
    if (fn === "app_guideline_update") return args.p_slug === "has" ? { ...detail, ...OTHER, flashcards: [], practice_questions: [] } : detail;
    if (fn === "app_start_guideline_questions") return { session_id: "s-7", count: 4 };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Lista", () => {
  it("sem nada publicado: explica a conferência médica (sem o quadro de fontes, retirado a pedido)", async () => {
    list = { total: 0, by_area: {}, years: [], items: [] };
    const go = vi.fn();
    render(<UpdatesScreen go={go} />);
    expect(await screen.findByText("As atualizações estão em conferência médica")).toBeTruthy();
    expect(screen.queryByText("Fontes aceitas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Montar um treino" }));
    expect(go).toHaveBeenCalledWith("questoes");
  });

  it("destaque, filtros por área e ano, busca e tabela comparativa", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    expect(await screen.findByText("Atualizações em destaque")).toBeTruthy();
    expect(screen.getAllByText("Prevenção da pré-eclâmpsia").length).toBe(2); // destaque + lista
    fireEvent.click(screen.getByRole("tab", { name: /Clínica Médica/ }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: null, p_search: null }));
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: 2026, p_search: null }));
    fireEvent.change(screen.getByLabelText("Buscar atualização"), { target: { value: "aas" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: 2026, p_search: "aas" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tabela comparativa" }));
    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("Conduta antiga de teste.").length).toBe(2);
    expect(within(table).getAllByText("Conduta vigente de teste.").length).toBeGreaterThan(0);
  });
});

describe("Detalhe", () => {
  it("antes × agora, o que lembrar, fonte conferida, flashcard, questão de treino e treino do tema", async () => {
    const go = vi.fn();
    render(<UpdatesScreen go={go} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Ver o que mudou: Prevenção da pré-eclâmpsia/ }))[0]);
    expect(await screen.findByRole("heading", { name: "Prevenção da pré-eclâmpsia" })).toBeTruthy();
    expect(screen.getByText(/Conferido por revisor médico no documento oficial em 06\/10\/2026/)).toBeTruthy();
    expect(screen.getByText("Conduta antiga de teste.")).toBeTruthy();
    expect(screen.getByText("Conduta vigente de teste.")).toBeTruthy();
    expect(screen.getByText("Mudança de 2025 de teste.")).toBeTruthy();
    expect(screen.getByText("Pegadinha de teste.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir documento oficial/ })).toBeTruthy();
    expect(screen.getByText("Frente de teste?")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa A/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(await screen.findByText(/Comentário de teste\./)).toBeTruthy();
    expect(screen.getByText("Justificativa B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Treinar questões deste tema/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-7" }));
  });

  it("sem conferência médica: aviso claro e sem link de fonte", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Ver o que mudou: Hipertensão arterial/ }))[0]);
    expect(await screen.findByText("Ainda sem conferência médica")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Abrir documento oficial/ })).toBeNull();
    expect(screen.getByText("Endereço oficial em conferência")).toBeTruthy();
  });
});
