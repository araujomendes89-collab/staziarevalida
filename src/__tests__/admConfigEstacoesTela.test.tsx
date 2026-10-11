// @vitest-environment jsdom
/**
 * Administração: abas Configurações, Visão geral e Estações na tela (jsdom, banco simulado).
 * CF05: a voz Kore, Sulafat ou Orus salva volta escolhida (não "Outra").
 * CF06: os interruptores dos professores dizem por que estão travados.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => null };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminTutor } from "../novo/app/admin/AdminPanels.jsx";

const TUTOR = {
  enabled: true, requires_pro: true, daily_message_limit: 40, max_profanity: "moderate", voice_enabled: true, trial_text_daily: 40, trial_questions_daily: 30,
  trial_voice_daily_seconds: 600, trial_voice_total_seconds: 2400, paid_voice_daily_seconds: 3600, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800,
  save_transcripts: true, transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [],
  tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
  tts_price_per_1k_chars_usd: 0, stt_price_per_min_usd: 0,
  usage_30d: { students: 0, requests: 0, cost_usd: 0, voice_minutes: 0 }, cost_by_feature: {}, cost_by_persona: {}, sessions: 0,
};
const PERSONAS = [
  { id: "amigavel", name: "Amigável", emoji: "🙂", active: true, default: true, tagline: "x", voice: null },
  { id: "durona", name: "Durona", emoji: "🔥", active: true, default: false, tagline: "y", voice: null },
];
let tutor: any;
beforeEach(() => {
  tutor = { ...TUTOR };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_admin_tutor_config") return tutor;
    if (fn === "app_admin_tutor_personalities") return PERSONAS;
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Configurações (CF05): a voz salva volta como estava", () => {
  it.each([["kore"], ["sulafat"], ["orus"], ["marin"], ["cedar"]])("a voz %s aparece escolhida e sem o campo Outra", async (voz) => {
    tutor.voice_name = voz;
    render(<AdminTutor />);
    const select = (await screen.findByLabelText("Voz")) as HTMLSelectElement;
    expect(select.value).toBe(voz);
    expect(screen.queryByLabelText("Nome da voz")).toBeNull();
  });

  it("uma voz que não está na lista continua aparecendo em Outra, com o nome", async () => {
    tutor.voice_name = "alloy";
    render(<AdminTutor />);
    const select = (await screen.findByLabelText("Voz")) as HTMLSelectElement;
    expect(select.value).toBe("__outra");
    expect((screen.getByLabelText("Nome da voz") as HTMLInputElement).value).toBe("alloy");
  });
});

describe("Configurações (CF06): interruptores dos professores", () => {
  it("sem o motivo, os interruptores ficam travados e a tela diz por quê", async () => {
    render(<AdminTutor />);
    const durona = (await screen.findByRole("switch", { name: /^🔥 Durona/ })) as HTMLInputElement;
    expect(durona.disabled).toBe(true);
    expect(screen.getByText(/Para ligar ou desligar um professor, escreva primeiro o motivo da mudança \(pelo menos 10 letras\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Teste de liberar o professor." } });
    expect(durona.disabled).toBe(false);
    expect(screen.queryByText(/Para ligar ou desligar um professor, escreva primeiro o motivo/)).toBeNull();
  });
});
