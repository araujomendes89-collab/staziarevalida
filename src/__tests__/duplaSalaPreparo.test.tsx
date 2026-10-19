/**
 * Treinamento em Dupla · etapa 5 · tarefa 16: sala ao vivo nos papéis, na conexão e na preparação (sem link; sala do avaliador).
 * Um "servidor" simulado guarda a sala e responde como as funções app_dupla_* (rev sobe a cada ação). Pessoas e estação de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true, equipe: false } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
const whistle = vi.hoisted(() => ({ n: 0 }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => (whistle.n += 1), installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const NOW = "2026-10-11T15:00:00.000Z";
const STATION = { id: "teste-dupla-e01", name: "Estação de teste", area: "Clínica Médica", area_code: "CM", number: 3, edition: "2020", reapplication: false, institution: "INEP", duration_ms: 600000, is_pro_only: false };
const { id: _i, name: _n, ...CAND_STATION } = STATION;

let room: any;
let content: any;
const fnCalls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);

function base(over: any = {}) {
  return {
    id: "r1", rev: 1, phase: "roles", round: 1, server_now: NOW, station: STATION, duration_ms: 600000,
    me: { user_id: "u-ana", public_name: "Ana Souza", role: "evaluator", confirmed: false, connected: false, ready: false, seen_station: false },
    partner: { user_id: "u-bruno", public_name: "Bruno Lima", role: "candidate", confirmed: false, connected: false, ready: false, seen_ms_ago: 1000 },
    match_note: null, invite_pending: false, call_link: null, started_at: null, ends_at: null, paused_left_ms: null, paused_at: null,
    finished_at: null, released_pressings: [], closed_reason: null, closed_by: null,
    ...over,
  };
}
const asCandidate = (r: any) => ({ ...r, station: CAND_STATION, me: { ...r.me, role: "candidate" }, partner: { ...r.partner, role: "evaluator" } });
const contentOf = (role: string | null) =>
  role === "evaluator"
    ? { role, station: { ...STATION, doctor_scene: "Cenário.", doctor_tasks: "1. Tarefa.", actor_script: "" }, pressing_count: 0, pressings: [], checklist_items: [] }
    : role === "candidate"
      ? { role, station: { ...CAND_STATION, label: "Estação 3", doctor_scene: "Cenário.", doctor_tasks: "1. Tarefa.", candidate_sheet: { has_image: false } }, pressing_count: 0, pressings: [] }
      : { role: null, station: { ...CAND_STATION, label: "Estação 3" }, pressing_count: 0, pressings: [] };

/** Servidor simulado: cada ação devolve o estado novo (rev + 1); `step` muda a sala como as funções do banco. */
function serve(steps: Record<string, (args: any) => any> = {}) {
  rpc.mockImplementation(async (fn: string, args: any = {}) => {
    if (fn === "app_dupla_room") return args.p_since_rev != null && args.p_since_rev === room.rev ? null : { ...room, server_now: NOW };
    if (fn === "app_dupla_room_content") return content;
    if (fn === "app_dupla_marks") return [];
    if (fn === "app_dupla_heartbeat") return { server_now: NOW };
    if (fn === "app_dupla_stations") return [{ id: "s9", name: "Outra estação", area: "Pediatria", area_code: "PED", number: 9 }];
    const step = steps[fn];
    const next = step ? step(args) : {};
    room = { ...room, ...next, rev: room.rev + 1 };
    return { ...room, server_now: NOW };
  });
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
async function mount(go = vi.fn()) {
  const view = render(<RoomScreen roomId="r1" go={go} />);
  await advance(0);
  await advance(0);
  return { ...view, go };
}
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  delete backend.subscribeRoom;
  window.localStorage.clear();
  window.sessionStorage.clear();
  whistle.n = 0;
  setVisibility("visible");
  session.dupla = { aberto: true, permitido: true, equipe: false };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Sala ao vivo: papéis", () => {
  it("papéis: escolher, sortear e trocar estação (só o avaliador) chamam as funções; sem 'Confirmar papéis e conectar' (fluxo simples)", async () => {
    room = base();
    content = contentOf(null);
    serve({
      app_dupla_set_roles: (a) => (a.p_candidate_id === "u-ana" ? asCandidate(room) : {}),
    });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Trocar estação" }));
    await advance(0);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Estação 9 · Outra estação"));
    await advance(0);
    expect(fnCalls("app_dupla_set_station")[0][1]).toEqual({ p_room_id: "r1", p_station_id: "s9" });

    fireEvent.click(screen.getByRole("button", { name: "Sortear" }));
    await advance(0);
    expect(fnCalls("app_dupla_draw_roles")).toHaveLength(1);

    expect(screen.queryByRole("button", { name: "Confirmar papéis e conectar" })).toBeNull();

    // escolher ser candidato: o servidor faz de mim o candidato; Trocar estação some (só o avaliador escolhe)
    fireEvent.click(screen.getByRole("button", { name: /^Candidato/ }));
    await advance(0);
    expect(fnCalls("app_dupla_set_roles")[0][1]).toEqual({ p_room_id: "r1", p_candidate_id: "u-ana" });
    expect(screen.queryByRole("button", { name: "Trocar estação" })).toBeNull();
    expect(document.body.textContent).not.toContain("Estação de teste");
  });

  it("erro do servidor aparece no aviso com a mensagem dele", async () => {
    room = asCandidate(base());
    content = contentOf(null);
    serve();
    rpc.mockImplementationOnce(async () => ({ ...room })); // 1ª leitura
    await mount();
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_dupla_draw_roles") throw new Error("Esta ação não vale nesta fase da sala.");
      return fn === "app_dupla_room" ? null : fn === "app_dupla_room_content" ? content : { server_now: NOW };
    });
    fireEvent.click(screen.getByRole("button", { name: "Sortear" }));
    await advance(0);
    expect(screen.getByText("Esta ação não vale nesta fase da sala.")).toBeTruthy();
  });
});

describe("Sala ao vivo: conexão", () => {
  it("conexão: etapas andam com os eventos, connected é chamado uma vez e aparece 'Sala pronta' com 100%", async () => {
    room = base({ phase: "connecting", partner: { ...base().partner, seen_ms_ago: 60000 } });
    content = contentOf("evaluator");
    serve({ app_dupla_connected: () => ({ me: { ...room.me, connected: true } }) });
    await mount();
    // estação, acesso, conteúdo do papel e canal prontos; o parceiro ainda não chegou
    const states = () => screen.getAllByRole("listitem").map((s) => s.getAttribute("data-state"));
    expect(states()).toEqual(["done", "done", "done", "done", "run"]);
    expect(screen.getByText("80%")).toBeTruthy();
    expect(fnCalls("app_dupla_connected")).toHaveLength(0);

    // o parceiro dá sinal: a próxima consulta completa (10 s) traz a presença
    room = { ...room, partner: { ...room.partner, seen_ms_ago: 500 } };
    await advance(10000);
    expect(states()).toEqual(["done", "done", "done", "done", "done"]);
    expect(screen.getByText("Sala pronta")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(fnCalls("app_dupla_connected")).toHaveLength(1);
    await advance(10000);
    expect(fnCalls("app_dupla_connected")).toHaveLength(1);
  });

  it("conexão sem acesso para na 2ª etapa", async () => {
    session.dupla = { aberto: true, permitido: false, equipe: false };
    room = base({ phase: "connecting" });
    content = contentOf("evaluator");
    serve();
    await mount();
    expect(screen.getAllByRole("listitem").map((s) => s.getAttribute("data-state"))).toEqual(["done", "run", "todo", "todo", "todo"]);
    expect(fnCalls("app_dupla_connected")).toHaveLength(0);
  });

  it("conexão sem o parceiro: Sair da sala com confirmação", async () => {
    room = base({ phase: "connecting", partner: { ...base().partner, seen_ms_ago: 90000 } });
    content = contentOf("evaluator");
    serve({ app_dupla_leave: () => ({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: "u-ana", public_name: "Ana Souza", me: true } }) });
    const { go } = await mount();
    expect(screen.getAllByText("Reconectando…").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Sair da sala" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Sair da sala?")).toBeTruthy();
    expect(within(dialog).getByText("O treino termina para os dois.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fnCalls("app_dupla_leave")).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Sair da sala" })[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sair da sala" }));
    await advance(0);
    expect(fnCalls("app_dupla_leave")).toHaveLength(1);
    expect(go).toHaveBeenCalledWith("dupla");
  });
});

describe("Sala ao vivo: preparação", () => {
  it("candidato espera e entra sozinho quando a fase vira running (inclusive aba escondida e reconexão)", async () => {
    room = { ...asCandidate(base({ phase: "setup" })), station: null, duration_ms: null, station_ready: true, porta: 1 };
    content = { role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true };
    serve();
    await mount();
    expect(screen.getByText("Aguardando Bruno iniciar a estação")).toBeTruthy();
    // o avaliador inicia em outro aparelho; a aba do candidato está escondida e a rede caiu
    setVisibility("hidden");
    rpc.mockImplementation(async () => {
      throw new Error("Failed to fetch");
    });
    room = { ...room, rev: room.rev + 1, phase: "running", station: CAND_STATION, duration_ms: 600000, started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" };
    content = contentOf("candidate");
    await advance(4000);
    expect(screen.getByText("Aguardando Bruno iniciar a estação")).toBeTruthy(); // sem rede, nada muda (e nada quebra)
    serve();
    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await advance(0);
    expect(screen.queryByText("Aguardando Bruno iniciar a estação")).toBeNull();
    expect(screen.getByText("Em andamento")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toMatch(/10:00|09:59/);
    expect(screen.getByText("INSTRUÇÕES AO PARTICIPANTE")).toBeTruthy();
    expect(whistle.n).toBe(1); // apito ao ver a estação começar
  });

  it("sair: confirmação e volta ao Praticar; o parceiro vê 'Treino encerrado por Ana Souza.'", async () => {
    room = base({ phase: "setup" });
    content = contentOf("evaluator");
    serve({ app_dupla_leave: () => ({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: "u-ana", public_name: "Ana Souza", me: true } }) });
    const { go } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Sair da sala" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sair da sala" }));
    await advance(0);
    expect(go).toHaveBeenCalledWith("dupla");
    cleanup();

    // o parceiro (Bruno) recebe a sala fechada por Ana
    room = { ...asCandidate(room), me: { ...room.partner, role: "candidate" }, partner: { ...room.me, role: "evaluator" }, closed_by: { user_id: "u-ana", public_name: "Ana Souza", me: false } };
    await mount();
    expect(screen.getByText("Treino encerrado por Ana Souza.")).toBeTruthy();
  });

  it("sinal na sala a cada 10 s no banco local e 45 s com tempo real", async () => {
    room = base({ phase: "setup" });
    content = contentOf("evaluator");
    serve();
    await mount();
    const beats = () => fnCalls("app_dupla_heartbeat").filter((c: any[]) => c[1].p_status === "em_estacao");
    const n0 = beats().length;
    expect(n0).toBeGreaterThanOrEqual(1);
    expect(beats()[0][1]).toEqual({ p_status: "em_estacao", p_room_id: "r1" });
    await advance(10000);
    expect(beats().length).toBe(n0 + 1);
    cleanup();

    rpc.mockClear();
    const handles: any[] = [];
    backend.subscribeRoom = vi.fn((_r: string, _u: string, h: any) => {
      const handle = { h, track: vi.fn(), untrack: vi.fn(), close: vi.fn() };
      handles.push(handle);
      return handle;
    });
    await mount();
    act(() => handles[0].h.onStatus("SUBSCRIBED"));
    await advance(0);
    const m0 = beats().length;
    await advance(10000);
    expect(beats().length).toBe(m0);
    await advance(35000);
    expect(beats().length).toBe(m0 + 1);
  });
});
