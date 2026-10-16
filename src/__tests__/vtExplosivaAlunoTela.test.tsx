// @vitest-environment jsdom
/**
 * Preferências do Tutor (aluno) — "Jeito da Durona". Decisão do dono de 16/10: ligado para todos, padrão N3 com gritos e palavrões;
 * o aluno baixa o nível e desliga gritos e/ou palavrões; N3/N4 dependem da declaração de 18+ e médico do aceite do Termo.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const rpc = vi.fn();
const backend = { rpc };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));
import { ExplosivaPreferences } from "../novo/app/tutor/ExplosivaPreferences.jsx";
import { NexusLobby } from "../novo/app/tutor/nexus/NexusLobby.jsx";

vi.mock("../novo/app/tutor/voice/StaziaVoiceOrb.jsx", () => ({ StaziaVoiceOrb: () => null }));

let stored: any;
const padrao = (adult: boolean) => ({ available: true, adult_declared: adult, choice: { level: "n3", shouts: true, profanity: true, is_default: true } });
beforeEach(() => {
  stored = padrao(true);
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_tutor_explosiva_preferences") return stored;
    if (fn === "app_tutor_save_explosiva_preferences") {
      stored = args.p_level ? { ...stored, choice: { level: args.p_level, shouts: args.p_shouts, profanity: args.p_profanity, is_default: false } } : padrao(stored.adult_declared);
      return stored;
    }
    throw new Error(fn);
  });
});
afterEach(cleanup);

describe("Jeito da Durona (aluno)", () => {
  it("padrão: N3 marcado, gritos e palavrões ligados, nada a salvar", async () => {
    render(<ExplosivaPreferences />);
    expect(await screen.findByRole("radio", { name: /N3 · Estressada/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Gritos/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Palavrões/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Voltar ao padrão" })).toBeNull();
    expect(screen.getByText(/nunca sobre você: sem ofensa pessoal, sem preconceito, sem ameaça/)).toBeInTheDocument();
  });

  it("baixar para N2 e desligar gritos e palavrões manda só a escolha do aluno", async () => {
    render(<ExplosivaPreferences />);
    fireEvent.click(await screen.findByRole("radio", { name: /N2 · Sarcástica/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Gritos/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Palavrões/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/a partir da próxima fala/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("app_tutor_save_explosiva_preferences", { p_level: "n2", p_shouts: false, p_profanity: false });
    // voltar ao padrão
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao padrão" }));
    expect(await screen.findByText(/Voltou ao padrão/)).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith("app_tutor_save_explosiva_preferences", { p_level: null, p_shouts: null, p_profanity: null });
    expect(screen.getByRole("radio", { name: /N3 · Estressada/ })).toBeChecked();
  });

  it("sem a declaração do Termo: N3 e N4 travados, aviso de que fala no N2", async () => {
    stored = padrao(false);
    render(<ExplosivaPreferences />);
    expect(await screen.findByRole("radio", { name: /N4 · Explosiva/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /N3 · Estressada/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /N1 · Direta/ })).toBeEnabled();
    expect(screen.getByRole("note")).toHaveTextContent(/declaração de que você é médico\(a\) e maior de 18/);
    expect(screen.getByText(/Agora:/)).toHaveTextContent("N2 · Sarcástica");
  });

  it("desligada no painel: só avisa, sem controles", async () => {
    stored = { available: false, adult_declared: true, choice: null };
    render(<ExplosivaPreferences />);
    expect(await screen.findByText(/estão desligados no momento/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("erro do banco aparece em português", async () => {
    render(<ExplosivaPreferences />);
    fireEvent.click(await screen.findByRole("radio", { name: /N4 · Explosiva/ }));
    rpc.mockImplementationOnce(async () => { throw new Error("Os níveis 3 e 4 ficam liberados depois do aceite do Termo com a declaração de maioridade e de médico."); });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/ficam liberados depois do aceite do Termo/)).toBeInTheDocument();
  });

  it("na entrada do Tutor, o Jeito da Durona só aparece com a Durona escolhida (e só quando a tela passar o quadro)", () => {
    const status = { personalities: [{ id: "tranquilo", name: "Tranquilo", emoji: "🙂", tagline: "calmo" }, { id: "durona", name: "Durona", emoji: "🔥", tagline: "exigente" }], preferences: { personality_id: "tranquilo" } };
    const props = { status, nexus: null, onStart: () => {}, onHistory: () => {}, onListen: () => {} };
    const { rerender } = render(<NexusLobby {...props} duronaSettings={<p>quadro da Durona</p>} />);
    expect(screen.queryByText("quadro da Durona")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Durona/ }));
    expect(screen.getByText("quadro da Durona")).toBeInTheDocument();
    rerender(<NexusLobby {...props} />);
    expect(screen.queryByText("quadro da Durona")).toBeNull();
  });
});
