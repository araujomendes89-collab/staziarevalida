/**
 * Treinamento em Dupla · etapa 6 · tarefa 18 (tela): resultado com revisão da nota, "Nova estação" (mesmo papel ou trocar de papel; 013380: sem
 * inverter papéis na mesma estação), encerrar e "Uso do mês".
 * Servidor simulado (helpers/duplaSala). Pessoas, estação e notas de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NOW, STATION, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => undefined, installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";
import { DuplaUsage } from "../novo/app/admin/AdminDupla.jsx";

const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
let srv: Srv;
const review = (o: Record<string, any> = {}) => ({ requested_at: null, reason: null, revised_at: null, score_before_review: null, ...o });
function result(viewer: "candidate" | "evaluator", rev: Record<string, any> = {}) {
  return {
    round: 1, viewer, station: STATION, score: 7.5, max_score: 10, pct: 75, previous_pct: null,
    items: [{ id: "i1", order: 1, content: "Item um", max_points: 2.5, grade: "correct", points: 2.5 }],
    evaluator: { user_id: "u-ana", public_name: "Ana Souza" }, candidate: { user_id: "u-bruno", public_name: "Bruno Lima" },
    finished_at: NOW, used_ms: 452000, feedback: { pos: "", neg: "", gen: "Boa escuta." }, review: review(rev),
  };
}
async function mount(go = vi.fn()) {
  const view = render(<RoomScreen roomId="r1" go={go} />);
  await advance(0);
  await advance(0);
  await advance(0);
  return { ...view, go };
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  srv = { room: baseRoom({ phase: "result", finished_at: NOW }), content: contentOf("evaluator"), marks: [], result: result("evaluator"), steps: {} };
  serve(rpc, srv);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Resultado: revisão da nota", () => {
  it("candidato pede revisão com motivo e o botão desliga", async () => {
    srv.room = asCandidate(srv.room);
    srv.result = result("candidate");
    srv.content = contentOf("candidate");
    srv.steps.app_dupla_request_review = () => {
      srv.result = result("candidate", { requested_at: NOW, reason: "O item 3 foi feito." });
      return {};
    };
    await mount();
    // no resultado o candidato vê o nome da estação
    expect(screen.getByRole("heading", { name: STATION.name })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar revisão da nota" }));
    const dialog = screen.getByRole("dialog");
    const send = within(dialog).getByRole("button", { name: "Solicitar revisão da nota" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true); // sem motivo
    fireEvent.change(within(dialog).getByLabelText("Motivo"), { target: { value: "  O item 3 foi feito.  " } });
    expect(within(dialog).getByText("23/500")).toBeTruthy();
    fireEvent.click(send);
    await advance(0);
    await advance(0);
    expect(calls("app_dupla_request_review")[0][1]).toEqual({ p_room_id: "r1", p_round: 1, p_reason: "O item 3 foi feito." });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("button", { name: "Solicitar revisão da nota" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("avaliador vê '{nome} pediu revisão da nota' e 'Rever a nota'; depois, 'Nota revisada'", async () => {
    srv.result = result("evaluator", { requested_at: NOW, reason: "O item 3 foi feito." });
    srv.steps.app_dupla_redo_review = () => ({ phase: "review" });
    await mount();
    expect(screen.getByText("Bruno Lima pediu revisão da nota")).toBeTruthy();
    expect(screen.getByText("O item 3 foi feito.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rever a nota" }));
    await advance(0);
    expect(calls("app_dupla_redo_review")[0][1]).toEqual({ p_room_id: "r1", p_round: 1 });
    await advance(0);
    expect(screen.getByText("Conferência da avaliação")).toBeTruthy();
    // a conferência reabre com o feedback já enviado
    expect((screen.getByLabelText("Comentário (opcional)") as HTMLTextAreaElement).value).toBe("Boa escuta.");
    cleanup();

    srv.room = { ...srv.room, phase: "result", rev: srv.room.rev + 1 };
    srv.result = result("evaluator", { requested_at: NOW, reason: "x", revised_at: NOW, score_before_review: 6.5 });
    await mount();
    expect(screen.getByText("Nota revisada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rever a nota" })).toBeNull();
  });

  it("Nova estação · mesmo papel: uma chamada só (clique duplo não duplica) e volta à escolha da estação; Sair com confirmação", async () => {
    // a rodada 2 começa na preparação, sem estação (app_dupla_next_station)
    srv.steps.app_dupla_next_station = () => ({ phase: "setup", round: 2, station: null, station_ready: false, finished_at: null, duration_ms: null });
    srv.content = () => ({ role: null, station: null, pressing_count: 0, pressings: [] });
    await mount();
    expect(screen.queryByRole("button", { name: /Inverter papéis/ })).toBeNull();
    const next = screen.getByRole("button", { name: "Nova estação · mesmo papel" });
    fireEvent.click(next);
    fireEvent.click(next);
    await advance(0);
    expect(calls("app_dupla_next_station")).toHaveLength(1);
    expect(calls("app_dupla_next_station")[0][1]).toEqual({ p_room_id: "r1", p_papel: "mesmo" });
    expect(calls("app_dupla_swap")).toHaveLength(0);
    await advance(0);
    expect(screen.getByText("Escolher estação")).toBeTruthy();
    expect(document.body.textContent).not.toContain(STATION.name);
    cleanup();

    srv.room = baseRoom({ phase: "result", finished_at: NOW });
    srv.steps.app_dupla_leave = () => ({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: "u-ana", public_name: "Ana Souza", me: true } });
    const { go } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Encerrar treino?")).toBeTruthy();
    expect(within(dialog).getByText("O treino termina para os dois.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Encerrar treino" }));
    await advance(0);
    expect(calls("app_dupla_leave")).toHaveLength(1);
    expect(go).toHaveBeenCalledWith("dupla");
  });
});

describe("Administração: Uso do mês", () => {
  it("painel: Uso do mês com os quatro números e '—' sem dado", async () => {
    vi.useRealTimers();
    rpc.mockResolvedValueOnce({ month: "2026-10", salas: 12, rodadas_avaliadas: 9, alunos: 7, impressos_por_rodada: 1.5 });
    render(<DuplaUsage />);
    expect(await screen.findByText("Uso do mês")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("app_admin_dupla_usage", {});
    for (const [label, value] of [["Salas", "12"], ["Rodadas avaliadas", "9"], ["Alunos que treinaram", "7"], ["Impressos por rodada", "1,5"]]) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(value)).toBeTruthy();
    }
    cleanup();
    rpc.mockResolvedValueOnce({ month: "2026-10", salas: 0, rodadas_avaliadas: 0, alunos: 0, impressos_por_rodada: null });
    render(<DuplaUsage />);
    // o '—' da dupla (impressos por rodada) e as quatro linhas do treino sozinho, que vêm à parte e também sem dado
    expect((await screen.findAllByText("—")).length).toBe(5);
    expect(within(screen.getByTestId("uso-sozinho")).getAllByText("—")).toHaveLength(4);
  });
});
