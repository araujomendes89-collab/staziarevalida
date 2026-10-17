// @vitest-environment jsdom
/**
 * Treino em Dupla · convite por link do @ (InviteLinkScreen). `backend.rpc` simulado por função; pessoas e estações SÓ de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
const session: any = { backend, boot: { role: "student" }, dupla: { permitido: true, aberto: true }, user: { id: "u-eu" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/live.js", () => ({
  useHeartbeat: () => undefined,
  useDuplaChannel: () => ({ inviteTick: 0, live: false }),
}));
vi.mock("../novo/app/dupla/sound.js", () => ({ installAudioWake: () => undefined }));
vi.mock("../novo/app/dupla/MatchModal.jsx", () => ({ InviteWatcher: () => null }));

import { InviteLinkScreen } from "../novo/app/dupla/InviteLinkScreen.jsx";

const PERSON = {
  public_name: "Colega Teste Um", handle: "colega.teste", school: "Faculdade de Teste", city: "Cidade Teste · TT", exam: "2026/2",
  bio: "Bio de teste.", goal: "Treinar de teste", areas: ["CM"], role_pref: "any", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"], stats: null,
};
const STATION = { id: "teste-estacao-secreta", name: "Nome secreto da estação", label: "Estação 7", area: "Clínica Médica", duration_ms: 600000 };

let lookup: any;
let myProfile: any;
let go: any;
let requestImpl: (args: any) => any;

const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

beforeEach(() => {
  go = vi.fn();
  session.boot = { role: "student" };
  session.dupla = { permitido: true, aberto: true };
  lookup = { found: true, self: false, mode: "convite", pending: false, incoming: false, person: PERSON, station: null };
  myProfile = { profile: { public_name: "Eu Teste", handle: "eu.teste" }, defaults: null, stats: null };
  requestImpl = () => ({ kind: "convite", room_id: "sala-1", partner: { public_name: "Colega Teste Um" } });
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_link_lookup") return lookup;
    if (fn === "app_dupla_profile") return myProfile;
    if (fn === "app_dupla_link_request") return requestImpl(args);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const open = (props: Record<string, any> = {}) => render(<InviteLinkScreen go={go} handle="colega.teste" {...props} />);
const askButton = () => screen.findByRole("button", { name: "Pedir para treinar com Colega" });

describe("InviteLinkScreen · indisponível", () => {
  it("@ inexistente ou bloqueado: mensagem neutra, sem dizer o motivo", async () => {
    lookup = { found: false };
    open();
    expect(await screen.findByText("Este convite não está disponível.")).toBeTruthy();
    expect(screen.getByText("O link pode ter sido trocado pela pessoa, ou não vale mais.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/bloque|inexistente|não existe/i);
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ir para o início" }));
    expect(go).toHaveBeenCalledWith("home");
  });

  it("sem acesso ao módulo: mensagem própria e nem consulta o servidor", async () => {
    session.dupla = { permitido: false, aberto: false };
    open();
    expect(await screen.findByText("Este convite não está disponível para a sua conta.")).toBeTruthy();
    expect(calls("app_dupla_link_lookup")).toHaveLength(0);
    expect(calls("app_dupla_profile")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Ver planos" }));
    expect(go).toHaveBeenCalledWith("planos");
  });

  it("erro de acesso devolvido pelo servidor também vira a mensagem de conta sem acesso", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_dupla_link_lookup") throw new Error("Sem acesso ao Treinamento em Dupla.");
      return myProfile;
    });
    open();
    expect(await screen.findByText("Este convite não está disponível para a sua conta.")).toBeTruthy();
  });
});

describe("InviteLinkScreen · o próprio link", () => {
  it("mostra o aviso e nenhum botão de pedir", async () => {
    lookup = { ...lookup, self: true };
    open();
    expect(await screen.findByText(/Este é o seu link de convite/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
  });
});

describe("InviteLinkScreen · dono online (convite)", () => {
  it("mostra o cartão, o aviso de online e consulta com @ e estação", async () => {
    open({ stationId: "teste-estacao-1" });
    expect(await askButton()).toBeTruthy();
    expect(screen.getByText("Colega Teste Um")).toBeTruthy();
    expect(screen.getByText(/@colega\.teste/)).toBeTruthy();
    expect(screen.getByText(/Colega está online agora/)).toBeTruthy();
    expect(calls("app_dupla_link_lookup")[0][1]).toEqual({ p_handle: "colega.teste", p_station_id: "teste-estacao-1" });
  });

  it("sem estação no link, p_station_id vai nulo", async () => {
    open();
    await askButton();
    expect(calls("app_dupla_link_lookup")[0][1]).toEqual({ p_handle: "colega.teste", p_station_id: null });
  });

  it("pedir chama app_dupla_link_request e, com kind 'convite', vai à sala", async () => {
    open({ stationId: "teste-estacao-1" });
    fireEvent.click(await askButton());
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-1" }));
    expect(calls("app_dupla_link_request")).toHaveLength(1);
    expect(calls("app_dupla_link_request")[0][1]).toEqual({ p_handle: "colega.teste", p_station_id: "teste-estacao-1" });
    expect(screen.queryByText(/Pedido enviado/)).toBeNull();
  });
});

describe("InviteLinkScreen · dono offline (pedido de 24 h)", () => {
  beforeEach(() => {
    lookup = { ...lookup, mode: "pedido" };
    requestImpl = () => ({ kind: "pedido", partner: { public_name: "Colega Teste Um" }, expires_at: "2026-10-18T12:00:00Z" });
  });

  it("explica que o pedido vale por 24 horas; ao pedir mostra 'Pedido enviado a …' e não navega", async () => {
    open();
    const button = await askButton();
    expect(screen.getByText(/Colega não está online agora\. O pedido vale por 24 horas/)).toBeTruthy();
    fireEvent.click(button);
    expect(await screen.findByText("Pedido enviado a Colega")).toBeTruthy();
    expect(screen.getByText(/O pedido vale por 24 horas e aparece quando Colega abrir o app/)).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    expect(calls("app_dupla_link_request")).toHaveLength(1);
  });

  it("depois do pedido a tela é recarregada (nova consulta ao servidor)", async () => {
    open();
    fireEvent.click(await askButton());
    await screen.findByText("Pedido enviado a Colega");
    await waitFor(() => expect(calls("app_dupla_link_lookup").length).toBeGreaterThanOrEqual(2));
  });
});

describe("InviteLinkScreen · outros estados", () => {
  it("mode 'indisponivel' com 'Não recebe convites.': aviso sem botão de pedir", async () => {
    lookup = { ...lookup, mode: "indisponivel", why_not: "Não recebe convites." };
    open();
    expect(await screen.findByText("Colega não recebe convites no momento.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
  });

  it("mode 'indisponivel' com outro motivo do servidor mostra esse motivo", async () => {
    lookup = { ...lookup, mode: "indisponivel", why_not: "Está em outra sala agora." };
    open();
    expect(await screen.findByText("Está em outra sala agora.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
  });

  it("pedido já enviado (pending): 'Pedido enviado' sem botão", async () => {
    lookup = { ...lookup, mode: "pedido", pending: true };
    open();
    expect(await screen.findByText("Pedido enviado a Colega")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
  });

  it("o colega já pediu a mim (incoming): aviso e botão 'Ver em Praticar'", async () => {
    lookup = { ...lookup, incoming: true };
    open();
    expect(await screen.findByText("Colega já pediu para treinar com você.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver em Praticar" }));
    expect(go).toHaveBeenCalledWith("dupla");
  });

  it("quem não tem perfil de estudo vê 'Criar meu perfil de estudo' e não o botão de pedir", async () => {
    myProfile = { profile: null, defaults: { public_name: "Eu Teste" }, stats: null };
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Criar meu perfil de estudo" }));
    expect(go).toHaveBeenCalledWith("dupla-perfil");
    expect(screen.queryByRole("button", { name: /Pedir para treinar/ })).toBeNull();
  });

  it("o servidor recusar por falta de perfil de estudo troca o botão por 'Criar meu perfil de estudo'", async () => {
    requestImpl = () => {
      throw new Error("Crie seu perfil de estudo antes de pedir.");
    };
    open();
    fireEvent.click(await askButton());
    expect(await screen.findByRole("button", { name: "Criar meu perfil de estudo" })).toBeTruthy();
    expect(await screen.findByText("Crie seu perfil de estudo antes de pedir.")).toBeTruthy();
  });
});

describe("InviteLinkScreen · estação e privacidade", () => {
  it("a estação aparece só como 'Estação N', área e minutos (nunca o nome nem o id)", async () => {
    lookup = { ...lookup, station: STATION };
    open({ stationId: STATION.id });
    await askButton();
    expect(screen.getByText("Estação 7")).toBeTruthy();
    expect(screen.getAllByText("Clínica Médica").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("10 min")).toBeTruthy();
    expect(document.body.textContent).not.toContain(STATION.name);
    expect(document.body.textContent).not.toContain(STATION.id);
  });

  it("sem estação no link não há faixa da estação", async () => {
    open();
    await askButton();
    expect(screen.queryByText(/min$/)).toBeNull();
    expect(screen.queryByText(/Estação \d/)).toBeNull();
  });

  it("erro do servidor ao pedir aparece como aviso e a tela continua pronta para nova tentativa", async () => {
    requestImpl = () => {
      throw new Error("Você já tem um convite aguardando resposta.");
    };
    open();
    fireEvent.click(await askButton());
    expect(await screen.findByText("Você já tem um convite aguardando resposta.")).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pedir para treinar com Colega" })).toBeTruthy();
  });

  it("nunca mostra e-mail", async () => {
    lookup = { ...lookup, person: { ...PERSON, email: "colega@teste.invalid" }, station: STATION };
    open();
    await askButton();
    expect(document.body.textContent).not.toMatch(/@teste\.invalid|e-mail/i);
  });
});
