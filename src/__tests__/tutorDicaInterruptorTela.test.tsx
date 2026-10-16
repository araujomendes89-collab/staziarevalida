/** Interruptor da dica do Tutor no painel da Administração (Tutor): nasce desligado, manda a chave ao salvar e trava sem a atualização do banco. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: { role: "admin" }, user: { id: "eu", email: "dono@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminTutor } from "../novo/app/admin/AdminPanels.jsx";

const CONFIG: any = {
  enabled: true, requires_pro: true, daily_message_limit: 40, max_profanity: "moderate", voice_enabled: true, trial_text_daily: 40, trial_questions_daily: 30,
  trial_voice_daily_seconds: 600, trial_voice_total_seconds: 2400, paid_voice_daily_seconds: 3600, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800,
  save_transcripts: true, transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [],
  tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
  tts_price_per_1k_chars_usd: 0.3, stt_price_per_min_usd: 0.003, stt_team_only: true, stt_trial_daily_seconds: null, stt_paid_daily_seconds: null, stt_account_daily_seconds: null,
  question_hint_enabled: false,
  usage_30d: { students: 0, requests: 0, cost_usd: 0, voice_minutes: 0 }, cost_by_feature: {}, cost_by_persona: {}, sessions: 0,
};
const abrir = (config: any, saved: any[] = []) => {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_tutor_config") return config;
    if (fn === "app_admin_tutor_save_config") return (saved.push(args), { ...config });
    if (fn === "app_admin_tutor_personalities") return [];
    throw new Error(`rpc inesperada: ${fn}`);
  });
  return render(<AdminTutor />);
};
const chave = async () => (await screen.findByRole("switch", { name: /^Dica do Tutor nas questões do treino/ })) as HTMLInputElement;
const salvar = () => screen.getByText("Salvar Tutor").closest("button") as HTMLButtonElement;

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("Painel do Tutor — dica nas questões", () => {
  it("mostra a frase de explicação e nasce desligada", async () => {
    abrir(CONFIG);
    const c = await chave();
    expect(c.checked).toBe(false);
    expect(c.disabled).toBe(false);
    expect(screen.getByText("Dica do Tutor nas questões do treino (não revela a resposta; não aparece em simulados).")).toBeTruthy();
  });

  it("ligar e salvar manda question_hint_enabled: true", async () => {
    const saved: any[] = [];
    abrir(CONFIG, saved);
    const c = await chave();
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Liberar a dica do Tutor no treino." } });
    fireEvent.click(c);
    expect(c.checked).toBe(true);
    fireEvent.click(salvar());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].p_config.question_hint_enabled).toBe(true);
  });

  it("banco sem a atualização: chave travada, aviso e nada enviado sobre a dica", async () => {
    const velho = { ...CONFIG };
    delete velho.question_hint_enabled;
    const saved: any[] = [];
    abrir(velho, saved);
    expect((await chave()).disabled).toBe(true);
    expect(screen.getByText(/A dica do Tutor ainda não pode ser ligada por aqui/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Salvar sem a dica no banco." } });
    fireEvent.click(salvar());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect("question_hint_enabled" in saved[0].p_config).toBe(false);
  });
});
