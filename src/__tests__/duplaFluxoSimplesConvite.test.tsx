/**
 * Treino em Dupla · fluxo simples (desenho de 19/10): o aviso do convite ao candidato (Aceitar/Recusar, 60 s, sem nada da
 * estação) e o convite por link do @ fora das telas (decisão do dono, 2ª rodada). Pessoas de TESTE.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" }, user: { id: "u-eu" } }) }));
vi.mock("../novo/app/dupla/sound.js", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, playMatchSound: vi.fn(), installAudioWake: vi.fn() };
});

import { MemoryRouter } from "react-router-dom";
import { InviteWatcher } from "../novo/app/dupla/MatchModal.jsx";
import { RadarScreen } from "../novo/app/dupla/RadarScreen.jsx";
import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";
import { GROUPS_FASE2 } from "../novo/app/shell/navModel.js";

let invitesNow: any[];
let go: any;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const direto = (extra: Record<string, unknown> = {}) => ({
  id: "c1", room_id: "sala-c1", kind: "direto", role: "candidate", from: { user_id: "u-ana", public_name: "Ana Souza" }, station: null,
  expires_at: new Date(Date.now() + 60000).toISOString(), ...extra,
});

beforeEach(() => {
  go = vi.fn();
  invitesNow = [];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_invites") return { invites: invitesNow, server_now: new Date().toISOString() };
    if (fn === "app_dupla_requests") return { requests: [] };
    if (fn === "app_dupla_answer_invite") return { room_id: args.p_accept ? "sala-c1" : null };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(() => cleanup());

const montar = () => render(<InviteWatcher go={go} meName="Bruno Lima" inviteTick={0} live={false} />);

describe("Fluxo simples · convite ao candidato", () => {
  it("'Ana Souza te chamou para treinar como candidato', sem estação, área, porta ou origem; Aceitar e Recusar", async () => {
    invitesNow = [direto()];
    montar();
    const dialog = await screen.findByRole("dialog", { name: "Ana Souza te chamou para treinar como candidato" });
    expect(within(dialog).getByText("A estação aparece quando o atendimento começar.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Aceitar" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Recusar" })).toBeTruthy();
    expect(within(dialog).getByText(/O convite expira em/)).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/Estação \d|Porta|min\b|Clínica|INEP/);
  });

  it("Aceitar vai à sala; Recusar responde não e não vai", async () => {
    invitesNow = [direto()];
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-c1" }));
    cleanup();
    go.mockClear();
    backend.rpc.mockClear();
    invitesNow = [direto({ id: "c2" })];
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "c2", p_accept: false }]]));
    expect(go).not.toHaveBeenCalled();
  });

  it("o pedido de 24 h saiu: o aviso não consulta pedidos", async () => {
    montar();
    await waitFor(() => expect(rpcCalls("app_dupla_invites").length).toBeGreaterThan(0));
    expect(rpcCalls("app_dupla_requests")).toHaveLength(0);
  });

  it("o convite por link do @ saiu das telas: sem botão, sem tela, sem rota e sem pedido", () => {
    const raiz = path.resolve(__dirname, "../novo/app");
    for (const f of ["dupla/InviteLinkButton.jsx", "dupla/InviteLinkScreen.jsx"]) expect(fs.existsSync(path.join(raiz, f)), f).toBe(false);
    for (const f of ["App.jsx", "dupla/RadarScreen.jsx", "dupla/HandleField.jsx", "dupla/radarApi.js", "dupla/MatchModal.jsx", "dupla/live.js"]) {
      const txt = fs.readFileSync(path.join(raiz, f), "utf8");
      for (const proibido of ["InviteLink", "/convite/", "PendingInvite", "app_dupla_requests", "app_dupla_link_", "Copiar link de convite", "RequestDialog"]) {
        expect(txt, `${f}: ${proibido}`).not.toContain(proibido);
      }
    }
  });
});

const SAVED = {
  public_name: "Ana Souza", handle: "ana.teste", school: null, city: "Curitiba · PR", goal: "", exam: "2026/2", bio: "", areas: [], role_pref: "any",
  pace: "livre", days: [], shifts: [], radar_visible: true, allow_direct_invites: true, show_school: false, show_stats: false,
};
const COLEGA = { user_id: "u-bruno", public_name: "Bruno Lima", handle: "bruno.teste", school: null, city: "Curitiba · PR", areas: [], role_pref: "med", state: "livre", compat: 80, can_invite: true, why_not: null, near: "cidade" };
const ESTACOES = [{ id: "s9", name: "Outra estação", area: "Pediatria", area_code: "PED", number: 9 }];
function servidorDaLista() {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_radar") return { people: [COLEGA], online: 1, needs_city: false, open_room: null, me: { radar_visible: true } };
    if (fn === "app_dupla_invite") return { room_id: "sala-nova", partner: { user_id: args.p_to }, expires_at: new Date(Date.now() + 60000).toISOString() };
    if (fn === "app_dupla_stations") return ESTACOES;
    if (fn === "app_dupla_profile") return { profile: SAVED, defaults: null, stats: { done: 0, avg: null } };
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: [], server_now: new Date().toISOString() };
    if (fn === "app_dupla_requests") return { requests: [] };
    if (fn === "app_dupla_deck") return { cards: [], hidden_by_role: 0, online: 0, matches_today: 0, open_room: null, server_now: new Date().toISOString() };
    throw new Error(`rpc não simulada: ${fn}`);
  });
}

describe("Fluxo simples · lista de colegas", () => {
  it("duas abas: 'Online' e 'Perto de você' (a aba 'Ator/avaliador' saiu)", async () => {
    servidorDaLista();
    render(<MemoryRouter><RadarScreen go={go} profile={{ setData: vi.fn() }} saved={SAVED} station={null} stationId={null} /></MemoryRouter>);
    await screen.findByText("Bruno Lima");
    expect(screen.getByRole("radio", { name: "Online" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Perto de você" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Ator/ })).toBeNull();
  });

  it("pelo colega: sem estação escolhida, 'Convidar' abre a lista de estações e o convite leva a estação", async () => {
    servidorDaLista();
    render(<MemoryRouter><RadarScreen go={go} profile={{ setData: vi.fn() }} saved={SAVED} station={null} stationId={null} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: /Escolha a estação para treinar com Bruno Lima/ });
    expect(rpcCalls("app_dupla_invite")).toHaveLength(0);
    fireEvent.click(await within(dialog).findByRole("button", { name: /Outra estação/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-nova" }));
    expect(rpcCalls("app_dupla_invite")).toEqual([["app_dupla_invite", { p_to: "u-bruno", p_station_id: "s9" }]]);
    expect(document.body.textContent).not.toMatch(/Sortear estação/);
  });

  it("pela estação: com a estação escolhida, 'Convidar' manda direto", async () => {
    servidorDaLista();
    render(<MemoryRouter><RadarScreen go={go} profile={{ setData: vi.fn() }} saved={SAVED} station={ESTACOES[0]} stationId="s9" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar Bruno Lima" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-nova" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o Praticar abre a lista; o match fica como opção secundária ('Encontrar por perfil (match)')", async () => {
    servidorDaLista();
    render(<MemoryRouter initialEntries={["/dupla?estacao=s9"]}><PracticeScreen go={go} /></MemoryRouter>);
    expect(await screen.findByText("Quem está online")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Encontrar por perfil (match)" }));
    expect(go).toHaveBeenCalledWith("dupla", { estacao: "s9", modo: "baralho" });
    cleanup();
    render(<MemoryRouter initialEntries={["/dupla?modo=baralho"]}><PracticeScreen go={go} /></MemoryRouter>);
    expect(await screen.findByText("Encontrar dupla")).toBeTruthy();
  });

  it("menu da 2ª fase continua 'Praticar' (guarda: já passa; não renomear)", () => {
    const grupo = (GROUPS_FASE2 as any[]).find((g) => g.id === "menu2");
    expect(grupo.items.find((i: any[]) => i[0] === "dupla")[2]).toBe("Praticar");
  });
});
