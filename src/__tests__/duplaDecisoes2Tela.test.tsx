/**
 * Estações da 2ª fase · decisões do dono de 17/10 (2ª leva, migração 013560), nas telas da sala (servidor simulado):
 * - impresso visível desde o início (monitor e bandeja "em cima da maca"): aparece sozinho para o candidato, numerado com os
 *   liberáveis (1, 2, 3), sem liberação; o avaliador vê "já visível" e não "Liberar";
 * - "O que mudou desde a prova": só no resultado (sala e histórico), com título, sem mudar a nota; sem notas, nada na tela.
 * Pessoas, estação e notas de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NOW, STATION, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => undefined, installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";
import { ResultPhase } from "../novo/app/dupla/room/ResultPhase.jsx";

let srv: Srv;

// Estação tipo 2025-1/08: relato na folha (i1), monitor (v1), exame liberável (d2) e bandeja (v3).
const SHEET = { id: "i1", display_number: 1, initially_visible: true, in_sheet: true, name: "Relato do caso", content: "Relato da maca.", has_image: false };
const MONITOR = { id: "v1", display_number: 1, initially_visible: true, in_sheet: false, name: "Monitor da sala", content: "FC 120.", has_image: false };
const EXAME = { id: "d2", display_number: 2, initially_visible: false, in_sheet: false, name: "Exame físico", content: "Sibilos.", has_image: false };
const BANDEJA = { id: "v3", display_number: 3, initially_visible: true, in_sheet: false, name: "Bandeja de medicações", content: "Adrenalina.", has_image: false };

function candidateContent(released: string[] = []) {
  const base: any = contentOf("candidate");
  return { ...base, pressing_count: 3, pressings: [SHEET, MONITOR, EXAME, BANDEJA].filter((p) => p.initially_visible || released.includes(p.id)) };
}
function evaluatorContent() {
  const base: any = contentOf("evaluator");
  const comOrigem = (p: any, n: number, real: string) => ({ ...p, id: real, index: n, source_number: n });
  return {
    ...base,
    pressing_count: 3,
    pressings: [comOrigem(SHEET, 1, "m-p1"), comOrigem(MONITOR, 2, "m-p2"), comOrigem(EXAME, 3, "m-p3"), comOrigem(BANDEJA, 4, "m-p4")],
  };
}

async function mount() {
  const view = render(<RoomScreen roomId="r1" go={vi.fn()} />);
  await advance(0);
  await advance(0);
  await advance(0);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("impresso visível desde o início", () => {
  it("candidato: monitor e bandeja já abertos e numerados, o exame aguarda liberação; o relato fica na folha, sem número", async () => {
    srv = { room: asCandidate(baseRoom({ phase: "running", started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" })), content: candidateContent(), marks: [], result: null, steps: {} };
    serve(rpc, srv);
    await mount();
    const lista = screen.getByRole("heading", { name: "Impressos" }).parentElement!.parentElement!;
    // 1 e 3 abertos (visíveis desde o início); 2 aguardando
    expect(within(lista).getByRole("button", { name: "Fechar Impresso 1 · Monitor da sala" })).toBeTruthy();
    expect(within(lista).getByRole("button", { name: "Fechar Impresso 3 · Bandeja de medicações" })).toBeTruthy();
    expect(within(lista).getByText("Impresso 2 · Aguardando liberação")).toBeTruthy();
    expect(within(lista).getByText("FC 120.")).toBeTruthy();
    expect(within(lista).getByText("Adrenalina.")).toBeTruthy();
    expect(within(lista).getAllByText("disponível desde o início")).toHaveLength(2);
    expect(within(lista).getByText("2 liberados")).toBeTruthy();
    // o relato está na folha (texto, sem imagem), não na lista
    expect(screen.getByText("Relato da maca.")).toBeTruthy();
    expect(within(lista).queryByText("Relato da maca.")).toBeNull();
  });

  it("candidato: depois de liberado, o exame ocupa o número 2", async () => {
    srv = { room: asCandidate(baseRoom({ phase: "running", started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z", released_pressings: ["d2"] })), content: candidateContent(["d2"]), marks: [], result: null, steps: {} };
    serve(rpc, srv);
    await mount();
    expect(screen.getByRole("button", { name: "Fechar Impresso 2 · Exame físico" })).toBeTruthy();
    expect(screen.getByText("3 liberados")).toBeTruthy();
  });

  it("avaliador: o impresso visível desde o início vem numerado, sem botão de liberar e com o aviso; o exame tem Liberar", async () => {
    srv = { room: baseRoom({ phase: "running", started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" }), content: evaluatorContent(), marks: [], result: null, steps: {} };
    serve(rpc, srv);
    await mount();
    expect(screen.getAllByText("O candidato já vê este impresso, desde o início: não precisa liberar.")).toHaveLength(2);
    expect(screen.getByText("Impresso 1 · Monitor da sala")).toBeTruthy();
    expect(screen.getByText("Impresso 2 · Exame físico")).toBeTruthy();
    expect(screen.getByText("Impresso 3 · Bandeja de medicações")).toBeTruthy();
    // só o exame tem Liberar
    expect(screen.getAllByRole("button", { name: "Liberar" })).toHaveLength(1);
    // o relato continua sem número, na folha do candidato
    expect(screen.getByText("Relato do caso (na folha do candidato)")).toBeTruthy();
  });
});

describe("O que mudou desde a prova", () => {
  const result = (notes?: unknown) => ({
    round: 1, viewer: "candidate", station: { ...STATION }, score: 7.5, max_score: 10, pct: 75, previous_pct: null,
    items: [{ id: "i1", order: 1, content: "Item um", max_points: 2.5, grade: "correct", points: 2.5 }],
    evaluator: { user_id: "u-ana", public_name: "Ana Souza" }, candidate: { user_id: "u-bruno", public_name: "Bruno Lima" },
    finished_at: NOW, used_ms: 452000, feedback: { pos: "", neg: "", gen: "" },
    review: { requested_at: null, reason: null, revised_at: null, score_before_review: null },
    ...(notes === undefined ? {} : { conduct_notes: notes }),
  });

  it("resultado: título, texto curto de aviso, as notas com o número do item e a nota intacta", () => {
    render(<ResultPhase room={null} result={result([{ item_order: 6, text: "Hoje a via preferida é a intramuscular." }, { item_order: null, text: "Nota geral." }])} actions={null} readOnly onBack={() => undefined} />);
    const bloco = screen.getByRole("heading", { name: "O que mudou desde a prova" }).closest("section")!;
    expect(within(bloco).getByText(/não altera a nota/)).toBeTruthy();
    expect(within(bloco).getByText("Item 6")).toBeTruthy();
    expect(within(bloco).getByText("Hoje a via preferida é a intramuscular.")).toBeTruthy();
    expect(within(bloco).getByText("Nota geral.")).toBeTruthy();
    expect(within(bloco).getAllByRole("listitem")).toHaveLength(2);
    // a nota segue a do servidor
    expect(screen.getByText("7,50")).toBeTruthy();
  });

  it("sem notas (campo ausente, vazio ou com texto em branco): a seção não aparece", () => {
    for (const notes of [undefined, [], [{ item_order: 2, text: "   " }], [{ item_order: 2 }]]) {
      const view = render(<ResultPhase room={null} result={result(notes as any)} actions={null} readOnly onBack={() => undefined} />);
      expect(screen.queryByText("O que mudou desde a prova")).toBeNull();
      view.unmount();
    }
  });

  it("na sala, só na fase de resultado: a mesma tela mostra as notas que o servidor mandou", async () => {
    srv = { room: baseRoom({ phase: "result", finished_at: NOW }), content: contentOf("evaluator"), marks: [], result: result([{ item_order: 2, text: "Nota na sala." }]), steps: {} };
    serve(rpc, srv);
    await mount();
    expect(screen.getByRole("heading", { name: "O que mudou desde a prova" })).toBeTruthy();
    expect(screen.getByText("Nota na sala.")).toBeTruthy();
  });

  it("antes do resultado (sala em andamento) a tela não pede nem mostra nada disso", async () => {
    srv = { room: asCandidate(baseRoom({ phase: "running", started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" })), content: candidateContent(), marks: [], result: result([{ item_order: 2, text: "Nota escondida." }]), steps: {} };
    serve(rpc, srv);
    await mount();
    expect(screen.queryByText("O que mudou desde a prova")).toBeNull();
    expect(screen.queryByText("Nota escondida.")).toBeNull();
    expect(rpc.mock.calls.some((c: any[]) => c[0] === "app_dupla_result")).toBe(false);
  });
});
