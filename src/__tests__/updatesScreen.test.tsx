/**
 * Atualizações & Diretrizes (jsdom) com o banco simulado: estado vazio honesto, lista com destaque e filtros, tabela
 * comparativa, detalhe com antes × agora, aviso quando não há conferência médica, fonte só com endereço, flashcard,
 * questão de treino e "Treinar questões deste tema". As regras estão em supabaseGuidelineUpdatesApi.test.ts.
 * AT04 (10/10/2026): o selo "Sem conferência médica" aparece também no cartão da lista e na tabela comparativa (no
 * computador e no celular), não só dentro do detalhe.
 * Visual de 14/10/2026: filtros de área viram botões (aria-pressed) e o detalhe fica em abas; as interações novas
 * (filtro, busca, abas com teclado, marcar como lida, flashcards na cor do tema) estão em updatesScreenVisual.test.tsx.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
const env = vi.hoisted(() => ({ mobile: false }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => env.mobile, useMQ: () => false }));

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
  env.mobile = false;
  list = { total: 2, by_area: { GINECOLOGIA_OBSTETRICIA: 1, CLINICA_MEDICA: 1 }, years: [2025, 2026], items: [ITEM, OTHER] };
  detail = {
    ...ITEM, timeline: [{ year: 2025, text: "Mudança de 2025 de teste." }], clinical_impact: "Impacto de teste.", exam_impact: "Como cai de teste.", trap: "Pegadinha de teste.",
    flashcards: [{ front: "Frente de teste?", back: "Verso de teste" }],
    // o servidor manda só enunciado e alternativas; a correção vem de app_guideline_practice_check (013200)
    practice_questions: [{ statement: "Enunciado de teste com mais de vinte caracteres.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id}` })) }],
    questions_count: 4,
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_guideline_updates") return list;
    if (fn === "app_guideline_update") return args.p_slug === "has" ? { ...detail, ...OTHER, flashcards: [], practice_questions: [] } : detail;
    if (fn === "app_start_guideline_questions") return { session_id: "s-7", count: 4 };
    if (fn === "app_guideline_practice_check")
      return { index: args.p_index, selected: args.p_selected, answer: "B", correct: args.p_selected === "B", commentary: "Comentário de teste.", options: ["A", "B", "C", "D"].map((id) => ({ id, justification: `Justificativa ${id}` })) };
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
    // verdade desde 10/10/2026: o banco só deixa publicar o que um revisor médico aprovou (AT03, AT05)
    expect(screen.getByText(/Cada atualização só aparece aqui depois de conferida no documento oficial/)).toBeTruthy();
    expect(screen.queryByText("Fontes aceitas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Montar um treino" }));
    expect(go).toHaveBeenCalledWith("questoes");
  });

  it("destaque, filtros por área e ano, busca e tabela comparativa", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    expect(await screen.findByText("Atualizações em destaque")).toBeTruthy();
    expect(screen.getAllByText("Prevenção da pré-eclâmpsia").length).toBe(2); // destaque + lista
    fireEvent.click(screen.getByRole("button", { name: /Clínica Médica/ }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: null, p_search: null }));
    fireEvent.click(screen.getByRole("radio", { name: "2026" })); // ano: controle segmentado (onda 4)
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: 2026, p_search: null }));
    fireEvent.change(screen.getByLabelText("Buscar atualização"), { target: { value: "aas" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: 2026, p_search: "aas" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tabela comparativa" }));
    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("Conduta antiga de teste.").length).toBe(2);
    expect(within(table).getAllByText("Conduta vigente de teste.").length).toBeGreaterThan(0);
  });
});

describe("Selo de conferência (AT04)", () => {
  const SEAL = "Sem conferência médica";
  const card = async (topic: string, nth = 0) => (await screen.findAllByRole("button", { name: new RegExp(`Ver o que mudou: ${topic}`) }))[nth];

  it("lista: o cartão sem conferência mostra o selo; o conferido não (nem no destaque)", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    const sem = await card("Hipertensão arterial");
    expect(within(sem).getByText(SEAL)).toBeTruthy();
    // o conferido aparece no destaque e na lista: nenhum dos dois tem o selo
    expect((await screen.findAllByRole("button", { name: /Ver o que mudou: Prevenção da pré-eclâmpsia/ })).length).toBe(2);
    for (const c of screen.getAllByRole("button", { name: /Ver o que mudou: Prevenção da pré-eclâmpsia/ })) expect(within(c).queryByText(SEAL)).toBeNull();
    expect(screen.getAllByText(SEAL).length).toBe(1);
  });

  it("destaque: uma atualização sem conferência de prioridade muito alta também mostra o selo", async () => {
    list.items = [ITEM, { ...OTHER, id: "3", slug: "x", topic: "Tema sem conferência em destaque", priority: 1 }, { ...ITEM, id: "4", slug: "y", topic: "Outro tema conferido", priority: 2 }];
    list.total = 3;
    render(<UpdatesScreen go={vi.fn()} />);
    const featured = (await screen.findAllByRole("button", { name: /Ver o que mudou: Tema sem conferência em destaque/ }))[0];
    expect(within(featured).getByText(SEAL)).toBeTruthy();
  });

  it("tabela comparativa (computador): a linha sem conferência mostra o selo; a conferida não", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Tabela comparativa" }));
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // sem o cabeçalho
    expect(rows.length).toBe(2);
    const rowOf = (topic: string) => rows.find((r) => within(r).queryByText(topic))!;
    expect(within(rowOf("Hipertensão arterial")).getByText(SEAL)).toBeTruthy();
    expect(within(rowOf("Prevenção da pré-eclâmpsia")).queryByText(SEAL)).toBeNull();
  });

  it("tabela comparativa (celular): o cartão sem conferência mostra o selo; o conferido não", async () => {
    env.mobile = true;
    render(<UpdatesScreen go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Tabela comparativa" }));
    const sem = (await screen.findByText("Hipertensão arterial")).closest("div")!.parentElement!;
    expect(within(sem).getByText(SEAL)).toBeTruthy();
    const com = screen.getByText("Prevenção da pré-eclâmpsia").closest("div")!.parentElement!;
    expect(within(com).queryByText(SEAL)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
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
    expect(screen.getByRole("button", { name: /Abrir documento oficial/ })).toBeTruthy();
    // 14/10/2026: o resto fica em abas
    fireEvent.click(screen.getByRole("tab", { name: "Linha do tempo" }));
    expect(screen.getByText("Mudança de 2025 de teste.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Armadilha" }));
    expect(screen.getByText("Pegadinha de teste.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Flashcards" }));
    expect(screen.getByText("Frente de teste?")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Miniquiz" }));
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa A/ }));
    // antes de confirmar: nada de gabarito, justificativa ou comentário (nem pedido ao servidor)
    expect(screen.queryByText(/Comentário de teste\./)).toBeNull();
    expect(screen.queryByText(/Justificativa/)).toBeNull();
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_guideline_practice_check")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(await screen.findByText(/Comentário de teste\./)).toBeTruthy();
    expect(screen.getByText("Justificativa B")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_guideline_practice_check", { p_slug: ITEM.slug, p_index: 0, p_selected: "A" });
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
