/**
 * Treinamento em Dupla · etapa 5 · tarefa 17c: conferência, finalização e queda na sala ao vivo.
 * Servidor simulado (helpers/duplaSala). Pessoas e estação de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NOW, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => undefined, installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
let srv: Srv;
const RESULT = {
  round: 1, viewer: "evaluator", station: { id: "teste-dupla-e01", name: "Estação de teste", area: "Clínica Médica", area_code: "CM", number: 3 },
  score: 2.5, max_score: 10, pct: 25, previous_pct: null, items: [], evaluator: { user_id: "u-ana", public_name: "Ana Souza" },
  candidate: { user_id: "u-bruno", public_name: "Bruno Lima" }, finished_at: NOW, used_ms: 300000,
  feedback: { pos: "", neg: "", gen: "" }, review: { requested_at: null, reason: null, revised_at: null, score_before_review: null },
};

async function mount(go = vi.fn()) {
  const view = render(<RoomScreen roomId="r1" go={go} />);
  await advance(0);
  await advance(0);
  return { ...view, go };
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  srv = {
    room: baseRoom({ phase: "review", started_at: NOW, finished_at: NOW }),
    content: contentOf("evaluator"),
    marks: [{ item_id: "i1", grade: "correct", subitems: [] }],
    result: RESULT,
    steps: {
      app_dupla_finalize: () => ({ phase: "result" }),
      app_dupla_leave: () => ({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: srv.room.me.user_id, public_name: srv.room.me.public_name, me: true } }),
    },
  };
  serve(rpc, srv);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("conferência e finalização", () => {
  it("conferência: filtro Pendentes, aviso de pendentes, confirmação com a contagem e finalize com o feedback", async () => {
    await mount();
    expect(screen.getByText("Conferência da avaliação")).toBeTruthy();
    expect(screen.getByText("1 de 3 critérios avaliados")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Pendentes/ }));
    expect(screen.queryByText("Item um")).toBeNull();
    expect(screen.getByText("Item dois")).toBeTruthy();
    expect(screen.getByText("2 critérios sem nota. Serão registrados como não avaliados.")).toBeTruthy();

    // mudar uma nota na conferência vai ao servidor
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Nota do critério 2" })).getAllByRole("radio")[0]);
    await advance(300);
    expect(calls("app_dupla_mark")[0][1]).toMatchObject({ p_item_id: "i2", p_grade: "correct" });
    expect(screen.getByText("1 critério sem nota. Será registrado como não avaliado.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), { target: { value: "Organize o exame." } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar nota" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Enviar nota?")).toBeTruthy();
    expect(within(dialog).getByText(/^1 critério\(s\) pendente\(s\) serão registrados como não avaliados\./)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar nota" }));
    await advance(0);
    expect(calls("app_dupla_finalize")).toHaveLength(1);
    expect(calls("app_dupla_finalize")[0][1]).toEqual({ p_room_id: "r1", p_feedback: { pos: "", neg: "", gen: "Organize o exame." } });
    await advance(0);
    expect(screen.queryByText("Conferência da avaliação")).toBeNull();
  });

  it("feedback e anotações sobrevivem ao recarregar e somem depois de finalizar", async () => {
    window.localStorage.setItem("smn-dupla-notas:r1:1", JSON.stringify("Anotação da estação."));
    await mount();
    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), { target: { value: "Pedir exames mais cedo." } });
    cleanup();
    await mount(); // recarregou (ou o celular descartou a aba)
    expect((screen.getByLabelText("Comentário (opcional)") as HTMLTextAreaElement).value).toBe("Pedir exames mais cedo.");
    fireEvent.click(screen.getByRole("button", { name: "Enviar nota" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar nota" }));
    await advance(0);
    expect(calls("app_dupla_finalize")[0][1].p_feedback.gen).toBe("Pedir exames mais cedo.");
    expect(window.localStorage.getItem("smn-dupla-feedback:r1:1")).toBeNull();
    expect(window.localStorage.getItem("smn-dupla-notas:r1:1")).toBeNull();
  });

  it("finalizar com erro do servidor mantém o rascunho e mostra o motivo", async () => {
    srv.steps.app_dupla_finalize = () => new Error("Feedback: máximo de 1000 caracteres em cada campo.");
    await mount();
    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar nota" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar nota" }));
    await advance(0);
    expect(screen.getByText("Feedback: máximo de 1000 caracteres em cada campo.")).toBeTruthy();
    expect(window.localStorage.getItem("smn-dupla-feedback:r1:1")).not.toBeNull();
  });
});

describe("queda e candidato", () => {
  it("avaliador some: 'Reconectando…' depois de 30 s e o candidato pode sair", async () => {
    srv.room = asCandidate(baseRoom({ phase: "review", finished_at: NOW }));
    srv.content = contentOf("candidate");
    const { go } = await mount();
    expect(screen.queryByText("Reconectando…")).toBeNull();
    // o sinal do avaliador para (a consulta completa de 10 s traz "visto há 31 s")
    srv.room = { ...srv.room, partner: { ...srv.room.partner, seen_ms_ago: 31000 } };
    await advance(10000);
    expect(screen.getByText("Reconectando…")).toBeTruthy();
    expect(screen.getByText("Aguardando avaliação")).toBeTruthy(); // nada reinicia
    // volta: o aviso some
    srv.room = { ...srv.room, partner: { ...srv.room.partner, seen_ms_ago: 2000 } };
    await advance(10000);
    expect(screen.queryByText("Reconectando…")).toBeNull();
    // e o candidato pode sair a qualquer momento
    srv.room = { ...srv.room, partner: { ...srv.room.partner, seen_ms_ago: 60000 } };
    await advance(10000);
    fireEvent.click(within(screen.getByRole("status", { name: "" }).parentElement!).getAllByRole("button", { name: "Sair da sala" })[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sair da sala" }));
    await advance(0);
    expect(calls("app_dupla_leave")).toHaveLength(1);
    expect(go).toHaveBeenCalledWith("dupla");
  });

  it("ao vivo: Presença some e só depois de 30 s aparece 'Reconectando…'", async () => {
    const handles: any[] = [];
    backend.subscribeRoom = vi.fn((_r: string, _u: string, h: any) => {
      const handle = { h, track: vi.fn(), untrack: vi.fn(), close: vi.fn() };
      handles.push(handle);
      return handle;
    });
    try {
      await mount();
      act(() => {
        handles[0].h.onStatus("SUBSCRIBED");
        handles[0].h.onPresence([{ user_id: "u-ana" }]);
      });
      await advance(29000);
      expect(screen.queryByText("Reconectando…")).toBeNull();
      await advance(1500);
      expect(screen.getByText("Reconectando…")).toBeTruthy();
      expect(screen.getByText("Conferência da avaliação")).toBeTruthy();
    } finally {
      delete backend.subscribeRoom;
    }
  });

  it("candidato em review: 'Aguardando avaliação', Sair da sala e nenhum botão de finalizar", async () => {
    srv.room = asCandidate(baseRoom({ phase: "review", finished_at: NOW }));
    srv.content = contentOf("candidate");
    await mount();
    expect(screen.getByText("Aguardando avaliação")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair da sala" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Finalizar/ })).toBeNull();
    expect(calls("app_dupla_marks")).toHaveLength(0);
  });
});
