/**
 * Treinamento em Dupla · etapa 5 · tarefa 17a: sala do avaliador — rodapé, cronômetro do servidor, "Ajustar tempo", apito e início.
 * Servidor simulado (helpers/duplaSala). Pessoas e estação de teste.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NOW, STATION, advance, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
const whistle = vi.hoisted(() => ({ n: 0 }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => (whistle.n += 1), installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const ROOT = path.resolve(__dirname, "../..");
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
let srv: Srv;

/** Avaliador já dentro da sala do avaliador (sessionStorage), com a sala em "setup" no servidor. */
async function mountEvaluatorRoom(over: Record<string, any> = {}) {
  window.sessionStorage.setItem("smn-dupla-sala-avaliador:r1:1", "1");
  srv.room = baseRoom(over);
  const view = render(<RoomScreen roomId="r1" go={vi.fn()} />);
  await advance(0);
  await advance(0);
  return view;
}
const startSteps = () => ({
  app_dupla_start: () => ({ phase: "running", started_at: NOW, ends_at: at(srv.room.duration_ms) }),
  app_dupla_pause: () => ({ paused_left_ms: 400000, paused_at: NOW, ends_at: null }),
  app_dupla_resume: () => ({ paused_left_ms: null, paused_at: null, ends_at: at(400000) }),
  app_dupla_set_duration: (a: any) => ({ duration_ms: a.p_duration_ms }),
  app_dupla_adjust: (a: any) => ({ ends_at: new Date(Date.parse(srv.room.ends_at) + a.p_delta_ms).toISOString() }),
});

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  delete backend.subscribeRoom;
  window.localStorage.clear();
  window.sessionStorage.clear();
  whistle.n = 0;
  srv = { room: baseRoom(), content: contentOf("evaluator"), marks: [], result: null, steps: startSteps() };
  serve(rpc, srv);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const footer = () => screen.getByRole("region", { name: "Controles da estação" });
const timeButton = () => within(footer()).getByRole("button", { name: /^Ajustar tempo, / });

describe("Sala do avaliador: rodapé e cronômetro", () => {
  it("antes de iniciar: 'Aguardando início', duração escolhida, −/+ 30 s com mínimo 1 min e máximo oficial, Desafio de tempo e Iniciar desligado sem os dois prontos", async () => {
    await mountEvaluatorRoom({ duration_ms: 480000, partner: { ...baseRoom().partner, ready: false } });
    expect(screen.getByText("Aguardando início")).toBeTruthy();
    expect(screen.getByRole("heading", { name: STATION.name })).toBeTruthy();
    expect(timeButton().getAttribute("aria-label")).toBe("Ajustar tempo, 08:00");
    expect(within(footer()).getByText("Tempo reduzido")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Iniciar estação" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(timeButton());
    const panel = screen.getByRole("region", { name: "Ajustar tempo" });
    expect(within(panel).getByText("Desafio de tempo")).toBeTruthy();
    expect(within(panel).getByText("Tempo oficial: 10 min. Reduzir o tempo não altera a nota.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Aumentar 30 segundos" }));
    await advance(0);
    expect(calls("app_dupla_set_duration").at(-1)[1]).toEqual({ p_room_id: "r1", p_duration_ms: 510000 });
    fireEvent.click(within(screen.getByRole("region", { name: "Ajustar tempo" })).getByRole("radio", { name: "Oficial" }));
    await advance(0);
    expect(calls("app_dupla_set_duration").at(-1)[1].p_duration_ms).toBe(600000);
    expect((within(screen.getByRole("region", { name: "Ajustar tempo" })).getByRole("button", { name: "Aumentar 30 segundos" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    await mountEvaluatorRoom({ duration_ms: 60000 });
    fireEvent.click(timeButton());
    expect((screen.getByRole("button", { name: "Reduzir 30 segundos" }) as HTMLButtonElement).disabled).toBe(true);
    // −3 min de 10 min = 7 min: permitido; abaixo de 1 min fica desligado
    expect((screen.getByRole("radio", { name: "−3 min" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Iniciar chama start uma vez; depois: cronômetro do servidor '09:59', Pausar congela, Retomar volta, selos", async () => {
    await mountEvaluatorRoom();
    const start = screen.getByRole("button", { name: "Iniciar estação" });
    fireEvent.click(start);
    fireEvent.click(start);
    await advance(0);
    expect(calls("app_dupla_start")).toHaveLength(1);
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
    await advance(1000);
    expect(timeButton().getAttribute("aria-label")).toMatch(/^Ajustar tempo, 09:5[89]$/);

    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await advance(0);
    expect(calls("app_dupla_pause")).toHaveLength(1);
    expect(screen.getAllByText("Pausada").length).toBeGreaterThan(0);
    expect(timeButton().getAttribute("aria-label")).toBe("Ajustar tempo, 06:40");
    await advance(5000);
    expect(timeButton().getAttribute("aria-label")).toBe("Ajustar tempo, 06:40"); // pausado não anda

    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
    await advance(0);
    expect(calls("app_dupla_resume")).toHaveLength(1);
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
  });

  it("−/+ 1 min só no painel Ajustar tempo, com os avisos e piso de 30 s; escondido em 00:00", async () => {
    await mountEvaluatorRoom({ phase: "running", started_at: NOW, ends_at: at(300000) });
    expect(screen.queryByRole("button", { name: "Reduzir 1 minuto" })).toBeNull(); // fora do painel, nada
    fireEvent.click(timeButton());
    fireEvent.click(screen.getByRole("button", { name: "Reduzir 1 minuto" }));
    await advance(0);
    expect(calls("app_dupla_adjust")[0][1]).toEqual({ p_room_id: "r1", p_delta_ms: -60000 });
    expect(screen.getByText("Tempo reduzido em 1 minuto")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar 1 minuto" }));
    await advance(0);
    expect(calls("app_dupla_adjust")[1][1].p_delta_ms).toBe(60000);
    expect(screen.getByText("1 minuto adicionado")).toBeTruthy();
    expect(screen.getByText("Ajuste o tempo restante em intervalos de 1 minuto.")).toBeTruthy();
    cleanup();

    // com 1 minuto ou menos, reduzir fica desligado (o servidor ainda segura 30 s)
    await mountEvaluatorRoom({ phase: "running", started_at: NOW, ends_at: at(55000) });
    fireEvent.click(timeButton());
    expect((screen.getByRole("button", { name: "Reduzir 1 minuto" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    await mountEvaluatorRoom({ phase: "running", started_at: NOW, ends_at: at(-1000) });
    expect(screen.getAllByText("Tempo esgotado").length).toBeGreaterThan(0);
    fireEvent.click(timeButton());
    expect(screen.queryByRole("button", { name: "Reduzir 1 minuto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adicionar 1 minuto" })).toBeNull();
  });

  it("o painel fecha com Esc, clique fora e Fechar, e devolve o foco ao botão", async () => {
    await mountEvaluatorRoom();
    fireEvent.click(timeButton());
    expect(timeButton().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar ajustes de tempo");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Ajustar tempo" })).toBeNull();
    expect(document.activeElement).toBe(timeButton());

    fireEvent.click(timeButton());
    fireEvent.mouseDown(screen.getByRole("heading", { name: STATION.name }));
    expect(screen.queryByRole("region", { name: "Ajustar tempo" })).toBeNull();

    fireEvent.click(timeButton());
    fireEvent.click(screen.getByRole("button", { name: "Fechar ajustes de tempo" }));
    expect(screen.queryByRole("region", { name: "Ajustar tempo" })).toBeNull();
    expect(document.activeElement).toBe(timeButton());
  });

  it("liberar e marcar antes do início: desligados com a dica", async () => {
    await mountEvaluatorRoom();
    expect(screen.getAllByText("Disponível depois de iniciar a estação.").length).toBe(2);
    const releases = screen.getAllByRole("button", { name: "Liberar" }) as HTMLButtonElement[];
    expect(releases).toHaveLength(2);
    for (const b of releases) {
      expect(b.disabled).toBe(true);
      expect(b.title).toBe("Disponível depois de iniciar a estação.");
    }
    const item = screen.getByRole("radiogroup", { name: "Item 1" });
    fireEvent.click(within(item).getAllByRole("radio")[0]);
    await advance(400);
    expect(calls("app_dupla_mark")).toHaveLength(0);
  });

  it("apito ao começar e uma vez no 00:00; recarregar no meio não apita de novo", async () => {
    srv.steps.app_dupla_start = () => ({ phase: "running", started_at: NOW, ends_at: at(3000) });
    await mountEvaluatorRoom();
    expect(whistle.n).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar estação" }));
    await advance(0);
    expect(whistle.n).toBe(1);
    await advance(3500);
    expect(screen.getAllByText("Tempo esgotado").length).toBeGreaterThan(0);
    expect(whistle.n).toBe(2);
    await advance(5000);
    expect(whistle.n).toBe(2);
    cleanup();

    // recarregar no meio (já em andamento): não apita o início; apita uma vez ao chegar a 00:00
    srv.room = baseRoom({ phase: "running", started_at: NOW, ends_at: at(2000) });
    render(<RoomScreen roomId="r1" go={vi.fn()} />);
    await advance(0);
    expect(whistle.n).toBe(2);
    await advance(2500);
    expect(whistle.n).toBe(3);
    cleanup();

    // abrir já no 00:00: não apita
    srv.room = baseRoom({ phase: "running", started_at: NOW, ends_at: at(-60000) });
    render(<RoomScreen roomId="r1" go={vi.fn()} />);
    await advance(3000);
    expect(whistle.n).toBe(3);
  });

  it("avaliador em duas abas: o início de uma aparece na outra e nada se duplica", async () => {
    window.sessionStorage.setItem("smn-dupla-sala-avaliador:r1:1", "1");
    const a = render(<RoomScreen roomId="r1" go={vi.fn()} />);
    const b = render(<RoomScreen roomId="r1" go={vi.fn()} />);
    await advance(0);
    await advance(0);
    fireEvent.click(within(a.container).getByRole("button", { name: "Iniciar estação" }));
    await advance(0);
    expect(calls("app_dupla_start")).toHaveLength(1);
    await advance(2000); // a outra aba consulta a cada 2 s
    expect(within(b.container).queryByRole("button", { name: "Iniciar estação" })).toBeNull();
    expect(within(b.container).getByRole("button", { name: "Finalizar estação" })).toBeTruthy();
    expect(calls("app_dupla_start")).toHaveLength(1);
    expect(calls("app_dupla_set_roles")).toHaveLength(0);
  });

  it("o rodapé respeita a largura do menu recolhido e não cobre o PEP (altura da coluna desconta o rodapé)", async () => {
    await mountEvaluatorRoom({ phase: "running", started_at: NOW, ends_at: at(300000) });
    expect(footer().className).toContain("dupla-foot");
    const css = fs.readFileSync(path.join(ROOT, "src/novo/app/dupla/room/sala.css"), "utf8");
    // sticky dentro do conteúdo da casca: fica à direita do menu, sem largura fixa de menu
    expect(css).toMatch(/\.dupla-foot\{position:sticky;bottom:0/);
    expect(css).not.toMatch(/104px|left:\s*\d+px/);
    expect(css).toMatch(/\.dupla-aval__col\{height:calc\(100vh - var\(--dupla-head-h\) - var\(--dupla-foot-h\)/);
    expect(css).toMatch(/max-height:calc\(100dvh - 112px\)/);
    expect(screen.getByRole("region", { name: "Checklist PEP" }).tabIndex).toBe(0);
  });
});

describe("Sala do avaliador: arquivo", () => {
  it("sem cor escrita e sem IA no rodapé e na folha", () => {
    for (const f of ["EvaluatorFooter.jsx", "CandidateSheet.jsx", "sala.css"]) {
      const src = fs.readFileSync(path.join(ROOT, "src/novo/app/dupla/room", f), "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/\brgba?\(|\bhsla?\(/);
      expect(src, f).not.toMatch(/server\/ai|maestro|Sinalizar problema/);
    }
  });
});

void act;
