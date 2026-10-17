// @vitest-environment jsdom
/**
 * Painel "Reações de voz por professor" (Administração › Vozes do Nexus): o dono marca, por professor e por nível da Durona
 * Explosiva, quais reações podem ser usadas e com que frequência máxima; vê o que cada serviço de voz entende; salva com motivo.
 * O navegador manda só a lista marcada (o banco confere o administrador e valida cada regra).
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { REACTIONS } from "../shared/tutor/voiceReactions";

const rpc = vi.fn();
const backend = { rpc };
// o mesmo objeto a cada render (como na sessão de verdade): useLoad recarrega quando o backend muda
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
import { VoiceReactionsPanel } from "../novo/app/admin/VoiceReactionsPanel.jsx";

let stored: any;
beforeEach(() => {
  stored = { explosiva_enabled: false, rules: [{ personality: "durona", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 2, max_per_10: 4 }] };
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_tutor_voice_reactions") return stored;
    if (fn === "app_admin_tutor_save_voice_reactions") {
      stored = { explosiva_enabled: args.p_explosiva_enabled, rules: args.p_rules };
      return stored;
    }
    throw new Error(`rpc inesperada ${fn}`);
  });
});
afterEach(cleanup);

describe("Reações de voz por professor", () => {
  it("lista as 16 reações do catálogo com o que cada serviço de voz entende; nada marcado no Tranquilo / Tranquila", async () => {
    render(<VoiceReactionsPanel />);
    const list = await screen.findByRole("list", { name: "Reações de Tranquilo / Tranquila" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(REACTIONS.length);
    for (const box of within(list).getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(within(list).getAllByText("ElevenLabs: [shouts]")).toHaveLength(1);
    expect(within(list).getAllByText("Gemini (voz gerada): <laugh>")).toHaveLength(1);
    expect(within(list).getAllByText("Gemini ao vivo: não")).toHaveLength(REACTIONS.length);
  });

  it("mostra o que já está salvo (N4 com risada, 2 por fala, 4 a cada 10)", async () => {
    render(<VoiceReactionsPanel />);
    fireEvent.click(await screen.findByRole("tab", { name: /Explosiva · N4 Explosiva/ }));
    const list = screen.getByRole("list", { name: "Reações de Explosiva · N4 Explosiva" });
    expect(within(list).getByRole("checkbox", { name: "Risada (Explosiva · N4 Explosiva)" })).toBeChecked();
    expect(within(list).getByLabelText("No máximo por fala")).toHaveValue("2");
    expect(within(list).getByLabelText("Frequência máxima")).toHaveValue("4");
    expect(screen.getByRole("note")).toHaveTextContent("A Durona Explosiva está desligada");
  });

  it("marcar, escolher a frequência, ligar a Explosiva e salvar manda só a lista marcada com o motivo", async () => {
    render(<VoiceReactionsPanel />);
    fireEvent.click(await screen.findByRole("tab", { name: /Explosiva · N3 Estressada/ }));
    const list = screen.getByRole("list", { name: "Reações de Explosiva · N3 Estressada" });
    fireEvent.click(within(list).getByRole("checkbox", { name: "Suspiro (Explosiva · N3 Estressada)" }));
    fireEvent.change(within(list).getByLabelText("Frequência máxima"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("switch", { name: /Durona Explosiva \(e Durão\) disponível/ }));
    // sem motivo não salva
    fireEvent.click(screen.getByRole("button", { name: "Salvar reações" }));
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("app_admin_tutor_save_voice_reactions", expect.anything());
    fireEvent.change(screen.getByLabelText("Motivo da mudança"), { target: { value: "Ouvi as vozes e aprovei" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar reações" }));
    expect(await screen.findByText(/Reações salvas/)).toBeInTheDocument();
    const call = rpc.mock.calls.find(([fn]) => fn === "app_admin_tutor_save_voice_reactions")!;
    expect(call[1]).toEqual({
      p_explosiva_enabled: true,
      p_reason: "Ouvi as vozes e aprovei",
      p_rules: [
        { personality: "durona", level: "n3", reaction: "sighs", allowed: true, max_per_reply: 1, max_per_10: 3 },
        { personality: "durona", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 2, max_per_10: 4 },
      ],
    });
    // o resumo mostra o que ficou marcado
    const resumo = screen.getByRole("table", { name: "Resumo: reações marcadas" });
    expect(within(resumo).getByRole("row", { name: /N3 Estressada Suspiro/ })).toBeInTheDocument();
  });

  it("desmarcar tira a reação da lista enviada", async () => {
    render(<VoiceReactionsPanel />);
    fireEvent.click(await screen.findByRole("tab", { name: /Explosiva · N4 Explosiva/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Risada (Explosiva · N4 Explosiva)" }));
    fireEvent.change(screen.getByLabelText("Motivo da mudança"), { target: { value: "Tirei a risada do N4" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar reações" }));
    await screen.findByText(/Reações salvas/);
    expect(rpc.mock.calls.find(([fn]) => fn === "app_admin_tutor_save_voice_reactions")![1].p_rules).toEqual([]);
  });

  it("erro do banco aparece em português", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_tutor_voice_reactions") return stored;
      throw new Error("Acesso restrito a administradores.");
    });
    render(<VoiceReactionsPanel />);
    await screen.findByRole("list", { name: "Reações de Tranquilo / Tranquila" });
    fireEvent.change(screen.getByLabelText("Motivo da mudança"), { target: { value: "Motivo de teste longo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar reações" }));
    expect(await screen.findByText("Acesso restrito a administradores.")).toBeInTheDocument();
  });
});
