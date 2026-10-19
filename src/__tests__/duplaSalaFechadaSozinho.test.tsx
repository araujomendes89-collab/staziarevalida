// @vitest-environment jsdom
/**
 * Treino em Dupla · sala encerrada (ClosedPhase) e o atalho "Treinar sozinho esta estação" (soloStationOf). Dados SÓ de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const session: any = { backend: { rpc: vi.fn() }, boot: { role: "admin" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));

import { ClosedPhase, closedMessage, soloStationOf } from "../novo/app/dupla/room/ClosedPhase.jsx";
import { rememberInvitedStation } from "../novo/app/dupla/radarApi.js";

const SOLO = "Treinar sozinho esta estação";
let go: any;

function room(over: Record<string, any> = {}) {
  return {
    id: "sala-1", phase: "closed", closed_reason: "convite_recusado", closed_by: null,
    station: { id: "teste-estacao-1", number: 3, area: "Clínica Médica" },
    me: { user_id: "u-eu", public_name: "Colega Teste Um" },
    partner: { user_id: "u-outro", public_name: "Colega Teste Dois" },
    ...over,
  };
}
const show = (r: any, role = "admin") => {
  session.boot = { role };
  return render(<ClosedPhase room={r} go={go} />);
};

beforeEach(() => {
  go = vi.fn();
  session.boot = { role: "admin" };
  sessionStorage.clear();
});
afterEach(cleanup);

describe("ClosedPhase · treinar sozinho", () => {
  it.each(["convite_recusado", "convite_expirado"])("equipe, motivo %s: o botão aparece e vai à estação da sala", (reason) => {
    show(room({ closed_reason: reason }));
    fireEvent.click(screen.getByRole("button", { name: SOLO }));
    expect(go).toHaveBeenCalledWith("estacao", { id: "teste-estacao-1" });
  });

  it.each(["convite_recusado", "convite_expirado"])("equipe, motivo %s, sala sem estação: usa a guardada por rememberInvitedStation", (reason) => {
    rememberInvitedStation("sala-1", "teste-estacao-guardada");
    show(room({ closed_reason: reason, station: null }));
    fireEvent.click(screen.getByRole("button", { name: SOLO }));
    expect(go).toHaveBeenCalledWith("estacao", { id: "teste-estacao-guardada" });
  });

  it("a estação da sala vale mais que a guardada", () => {
    rememberInvitedStation("sala-1", "teste-estacao-guardada");
    show(room());
    fireEvent.click(screen.getByRole("button", { name: SOLO }));
    expect(go).toHaveBeenCalledWith("estacao", { id: "teste-estacao-1" });
  });

  it("a estação guardada de outra sala não vale", () => {
    rememberInvitedStation("outra-sala", "teste-estacao-guardada");
    show(room({ station: null }));
    expect(screen.queryByRole("button", { name: SOLO })).toBeNull();
  });

  it("sala sem estação e nada guardado: o botão não aparece", () => {
    show(room({ station: null }));
    expect(screen.queryByRole("button", { name: SOLO })).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar para Praticar" })).toBeTruthy();
  });

  it("aluno (student): o botão não aparece, mesmo com estação", () => {
    show(room(), "student");
    expect(screen.queryByRole("button", { name: SOLO })).toBeNull();
  });

  it("aluno com estação guardada também não vê o botão", () => {
    rememberInvitedStation("sala-1", "teste-estacao-guardada");
    show(room({ station: null }), "student");
    expect(screen.queryByRole("button", { name: SOLO })).toBeNull();
  });

  it.each(["saiu", "sem_sinal"])("motivo %s: nunca aparece, nem para a equipe", (reason) => {
    rememberInvitedStation("sala-1", "teste-estacao-guardada");
    show(room({ closed_reason: reason, closed_by: { me: false, public_name: "Colega Teste Dois" } }));
    expect(screen.queryByRole("button", { name: SOLO })).toBeNull();
  });

  it("soloStationOf devolve null fora dos dois motivos e a estação nos dois motivos", () => {
    expect(soloStationOf(room({ closed_reason: "saiu" }))).toBeNull();
    expect(soloStationOf(room({ closed_reason: "sem_sinal" }))).toBeNull();
    expect(soloStationOf(room({ closed_reason: null }))).toBeNull();
    expect(soloStationOf(room({ closed_reason: "convite_recusado" }))).toBe("teste-estacao-1");
    expect(soloStationOf(room({ closed_reason: "convite_expirado" }))).toBe("teste-estacao-1");
    expect(soloStationOf(room({ closed_reason: "convite_expirado", station: null }))).toBeNull();
    rememberInvitedStation("sala-1", "teste-estacao-guardada");
    expect(soloStationOf(room({ closed_reason: "convite_expirado", station: null }))).toBe("teste-estacao-guardada");
  });
});

describe("ClosedPhase · o que continua igual", () => {
  it("'Voltar para Praticar' vai para 'dupla' (equipe e aluno)", () => {
    show(room());
    fireEvent.click(screen.getByRole("button", { name: "Voltar para Praticar" }));
    expect(go).toHaveBeenCalledWith("dupla");
    cleanup();
    go.mockReset();
    show(room(), "student");
    fireEvent.click(screen.getByRole("button", { name: "Voltar para Praticar" }));
    expect(go).toHaveBeenCalledWith("dupla");
  });

  it("convite recusado ou vencido: '{nome} não entrou na sala.'", () => {
    show(room({ closed_reason: "convite_recusado" }));
    expect(screen.getByText("Colega Teste Dois não entrou na sala.")).toBeTruthy();
    cleanup();
    show(room({ closed_reason: "convite_expirado" }));
    expect(screen.getByText("Colega Teste Dois não entrou na sala.")).toBeTruthy();
  });

  it("textos dos outros motivos", () => {
    expect(closedMessage(room({ closed_reason: "saiu", closed_by: { me: false, public_name: "Colega Teste Dois" } }))).toBe("Treino encerrado por Colega Teste Dois.");
    expect(closedMessage(room({ closed_reason: "saiu", closed_by: { me: true, public_name: "Colega Teste Um" } }))).toBe("Treino encerrado.");
    expect(closedMessage(room({ closed_reason: "sem_sinal" }))).toBe("Treino encerrado.");
    expect(closedMessage(room({ closed_reason: "convite_recusado", partner: null }))).toBe("Treino encerrado.");
  });
});
