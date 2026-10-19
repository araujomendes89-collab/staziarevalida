/**
 * Treino em Dupla · fluxo simples (desenho de 19/10) na SALA: preparação do ator com "Iniciar estação" (um toque), espera do
 * candidato sem nada da estação, papéis que vão direto à preparação, rodapé seguro no celular. Servidor simulado
 * (helpers/duplaSala). Pessoas e estação de TESTE.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CAND_STATION, NOW, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true, equipe: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
const apito = vi.hoisted(() => ({ n: 0 }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => (apito.n += 1), installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const STATIONS = [{ id: "s9", name: "Outra estação", area: "Pediatria", area_code: "PED", number: 9 }];
const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
let srv: Srv;
function ligar() {
  serve(rpc, srv);
  const base = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (fn: string, args: any = {}) => {
    if (fn === "app_dupla_stations") return STATIONS;
    if (fn === "app_dupla_room_done_stations") return [];
    return base(fn, args);
  });
}
async function mount(go = vi.fn()) {
  const view = render(<RoomScreen roomId="r1" go={go} />);
  await advance(0);
  await advance(0);
  await advance(0);
  return { ...view, go };
}
const candidatoEsperando = () => ({
  ...asCandidate(baseRoom({ phase: "setup" })), station: null, duration_ms: null, station_ready: true, porta: 1,
});
const conteudoEspera = { role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true };

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  apito.n = 0;
  srv = { room: baseRoom({ phase: "setup", station_ready: true, porta: 1 }), content: contentOf("evaluator"), marks: [], result: null, steps: {} };
  ligar();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Fluxo simples · preparação", () => {
  it("ator com a estação: entra direto na sala do avaliador; 'Iniciar estação' ligado sem prontidão; um toque inicia", async () => {
    srv.room = baseRoom({ phase: "setup", station_ready: true, me: { ...baseRoom().me, ready: false }, partner: { ...baseRoom().partner, ready: false } });
    srv.steps.app_dupla_start = () => ({ phase: "running", started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" });
    await mount();
    expect(screen.queryByRole("button", { name: "Estou pronto para iniciar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir sala do avaliador" })).toBeNull();
    expect(screen.getByText("Aguardando início")).toBeTruthy();
    const start = screen.getByRole("button", { name: "Iniciar estação" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await advance(0);
    expect(calls("app_dupla_start")).toHaveLength(1);
    // "Em andamento" aparece duas vezes (selo do cabeçalho e modo do rodapé)
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /Porta/ })).toBeNull(); // DONO-1: o ator nunca vê a porta
  });

  it("convite ainda não aceito: 'Iniciar estação' desligado e 'Aguardando Bruno aceitar'", async () => {
    srv.room = baseRoom({ phase: "setup", station_ready: true, invite_pending: true });
    await mount();
    expect((screen.getByRole("button", { name: "Iniciar estação" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Aguardando Bruno aceitar")).toBeTruthy();
  });

  it("ator troca a estação antes de iniciar pela lista do Banco de estações", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Trocar estação" }));
    await advance(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Outra estação/ }));
    await advance(0);
    expect(calls("app_dupla_set_station")[0][1]).toEqual({ p_room_id: "r1", p_station_id: "s9" });
    expect(document.body.textContent).not.toMatch(/Sortear estação/);
  });

  it("ator sem estação (match ou rodada nova): 'Escolher estação' abre a lista", async () => {
    srv.room = baseRoom({ phase: "setup", station: null, station_ready: false, duration_ms: null });
    srv.content = { role: null, station: null, pressing_count: 0, pressings: [] };
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Escolher estação" }));
    await advance(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Outra estação/ }));
    await advance(0);
    expect(calls("app_dupla_set_station")[0][1]).toEqual({ p_room_id: "r1", p_station_id: "s9" });
  });

  it("candidato de frente para a porta numerada ('Porta 1'), sem nada da estação; entra sozinho quando começa", async () => {
    srv.room = candidatoEsperando();
    srv.content = conteudoEspera;
    await mount();
    expect(screen.getByRole("img", { name: "Porta 1" })).toBeTruthy();
    // helpers/duplaSala: asCandidate troca também os nomes (eu = Bruno, candidato; parceira = Ana, atriz)
    expect(screen.getByText("Aguardando Ana iniciar a estação")).toBeTruthy();
    const texto = document.body.textContent ?? "";
    for (const proibido of ["Estação 3", "Clínica Médica", "INEP", "2020", "Escolher estação", "Iniciar estação"]) expect(texto, proibido).not.toContain(proibido);
    srv.room = { ...srv.room, rev: srv.room.rev + 1, phase: "running", station: CAND_STATION, duration_ms: 600000, started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" };
    srv.content = contentOf("candidate");
    await advance(2000);
    await advance(0);
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
  });

  it("candidato sem estação escolhida (match ou rodada nova): só 'O ator está escolhendo a estação', sem porta", async () => {
    srv.room = { ...candidatoEsperando(), station_ready: false, porta: null };
    srv.content = conteudoEspera;
    await mount();
    expect(screen.getByText("O ator está escolhendo a estação")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Porta/ })).toBeNull();
  });

  it("nunca há porta sem número: estação escolhida sem porta mostra só o texto de espera", async () => {
    srv.room = { ...candidatoEsperando(), porta: null };
    srv.content = conteudoEspera;
    await mount();
    expect(screen.getByText("Aguardando Ana iniciar a estação")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Porta/ })).toBeNull();
  });

  it("a porta: SVG acessível 'Porta N', só com tokens do design system", () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "../novo/app/dupla/room/Porta.jsx"), "utf8");
    expect(fonte).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    expect(fonte).toContain('role="img"');
    expect(fonte).toContain("aria-label={`Porta ${numero}`}");
    expect(fonte).toContain("width:min(220px,60vw)"); // cabe no celular sem rolar para o lado
  });

  it("papéis: escolher o papel vai direto à preparação, sem 'Confirmar papéis e conectar'", async () => {
    srv.room = baseRoom({
      phase: "roles", station: null, station_ready: false,
      me: { ...baseRoom().me, role: null }, partner: { ...baseRoom().partner, role: null },
    });
    srv.content = { role: null, station: null, pressing_count: 0, pressings: [] };
    srv.steps.app_dupla_set_roles = () => ({
      phase: "setup", me: { ...srv.room.me, role: "evaluator" }, partner: { ...srv.room.partner, role: "candidate" },
    });
    await mount();
    expect(screen.queryByRole("button", { name: "Confirmar papéis e conectar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Ator\/Avaliador/ }));
    await advance(0);
    await advance(0);
    expect(calls("app_dupla_set_roles")[0][1]).toEqual({ p_room_id: "r1", p_candidate_id: "u-bruno" });
    expect(screen.getByRole("button", { name: "Escolher estação" })).toBeTruthy();
  });

  it("sem link de chamada em nenhuma tela da preparação", async () => {
    await mount();
    expect(screen.queryByLabelText(/link/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Link da reunião|Meet|WhatsApp/);
  });

  it("celular: o rodapé da sala respeita a área segura de baixo (iPhone)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/dupla/room/sala.css"), "utf8");
    const regras = css.match(/\.dupla-foot\{[^}]*\}/g) ?? [];
    expect(regras.length).toBeGreaterThanOrEqual(2);
    for (const r of regras) expect(r).toContain("env(safe-area-inset-bottom, 0px)");
  });
});
