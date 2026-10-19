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

import { InviteWatcher } from "../novo/app/dupla/MatchModal.jsx";

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
