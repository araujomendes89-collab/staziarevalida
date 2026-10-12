/**
 * CF02 + VZ03 (Fase 1 objetiva, 2026-10-12) em Administração > Configurações > Nexus: "Microfone só para a equipe" ligado por padrão, os
 * três tetos diários da transcrição VAZIOS (os números são do dono) e a tela não deixa abrir o microfone aos alunos sem eles; a voz do
 * professor só é liberada com o preço da voz preenchido.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: { role: "admin" }, user: { id: "eu", email: "dono@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminTutor } from "../novo/app/admin/AdminPanels.jsx";
import { auditSummary } from "../novo/app/admin/auditLog.js";

const CONFIG = {
  enabled: true, requires_pro: true, daily_message_limit: 40, max_profanity: "moderate", voice_enabled: true, trial_text_daily: 40, trial_questions_daily: 30,
  trial_voice_daily_seconds: 600, trial_voice_total_seconds: 2400, paid_voice_daily_seconds: 3600, voice_provider: "auto", voice_name: null, voice_session_max_seconds: 1800,
  save_transcripts: true, transcript_retention_days: 180, emotion_engine: true, inside_jokes: true, durona_level: "forte", pronunciations: [],
  tts_team_only: true, tts_trial_daily_chars: 4500, tts_paid_daily_chars: 4500, tts_account_daily_chars: 4500, tts_account_monthly_chars: 30000,
  tts_price_per_1k_chars_usd: 0.3, stt_price_per_min_usd: 0.003,
  stt_team_only: true, stt_trial_daily_seconds: null, stt_paid_daily_seconds: null, stt_account_daily_seconds: null,
  usage_30d: { students: 0, requests: 0, cost_usd: 0, voice_minutes: 0 }, cost_by_feature: {}, cost_by_persona: {}, sessions: 0,
};
const PENDENTE = "Pendente: definir os tetos diários da transcrição antes de liberar o microfone aos alunos";
const AVISO_MIC = "Para liberar o microfone aos alunos, preencha antes o teto diário de transcrição (teste grátis, plano pago e a plataforma toda) e o preço da transcrição.";
const AVISO_VOZ = "Para liberar a voz do professor aos alunos, preencha antes o preço da voz (US$ por mil caracteres). Sem o preço, o gasto aparece como zero.";

const abrir = (config: any = CONFIG, saved: any[] = []) => {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_tutor_config") return config;
    if (fn === "app_admin_tutor_save_config") return (saved.push(args), { ...config });
    if (fn === "app_admin_tutor_personalities") return [];
    throw new Error(`rpc inesperada: ${fn}`);
  });
  return render(<AdminTutor />);
};
const mic = async () => (await screen.findByRole("switch", { name: /^Microfone só para a equipe/ })) as HTMLInputElement;
const voz = async () => (await screen.findByRole("switch", { name: /^Voz do professor só para a equipe/ })) as HTMLInputElement;
const motivo = () => fireEvent.change(screen.getByLabelText(/Motivo da mudança/), { target: { value: "Teste do microfone dos alunos." } });
const salvar = () => screen.getByText("Salvar Tutor").closest("button") as HTMLButtonElement;
const campo = (re: RegExp) => screen.getByLabelText(re) as HTMLInputElement;

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("CF02 — Configurações do Tutor", () => {
  it("padrão: microfone só da equipe, três tetos vazios, aviso de pendência e nenhum número inventado", async () => {
    abrir();
    expect((await mic()).checked).toBe(true);
    for (const re of [/^Microfone por dia — teste grátis/, /^Microfone por dia — plano pago/, /^Teto da plataforma por dia \(minutos/]) expect(campo(re).value).toBe("");
    expect(screen.getByText(PENDENTE)).toBeTruthy();
    expect(screen.queryByText(AVISO_MIC)).toBeNull();
  });

  it("não deixa abrir o microfone aos alunos sem os tetos: mostra o motivo e trava o salvar", async () => {
    abrir();
    const chave = await mic();
    motivo();
    expect(salvar().disabled).toBe(false);
    fireEvent.click(chave);
    expect(chave.checked).toBe(false);
    expect(screen.getByText(AVISO_MIC)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    // só dois tetos não bastam
    fireEvent.change(campo(/^Microfone por dia — teste grátis/), { target: { value: "5" } });
    fireEvent.change(campo(/^Microfone por dia — plano pago/), { target: { value: "30" } });
    expect(screen.getByText(AVISO_MIC)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
  });

  it("com os três tetos e o preço, abre o microfone e manda os tetos em segundos", async () => {
    const saved: any[] = [];
    abrir(CONFIG, saved);
    const chave = await mic();
    motivo();
    fireEvent.change(campo(/^Microfone por dia — teste grátis/), { target: { value: "5" } });
    fireEvent.change(campo(/^Microfone por dia — plano pago/), { target: { value: "30" } });
    fireEvent.change(campo(/^Teto da plataforma por dia \(minutos/), { target: { value: "600" } });
    fireEvent.click(chave);
    expect(screen.queryByText(AVISO_MIC)).toBeNull();
    expect(screen.queryByText(PENDENTE)).toBeNull();
    expect(salvar().disabled).toBe(false);
    fireEvent.click(salvar());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].p_config).toMatchObject({ stt_team_only: false, stt_trial_daily_seconds: "300", stt_paid_daily_seconds: "1800", stt_account_daily_seconds: "36000" });
  });

  it("preço da transcrição zerado também trava a abertura", async () => {
    abrir({ ...CONFIG, stt_price_per_min_usd: 0, stt_trial_daily_seconds: 300, stt_paid_daily_seconds: 1800, stt_account_daily_seconds: 36000 });
    const chave = await mic();
    fireEvent.click(chave);
    expect(screen.getByText(AVISO_MIC)).toBeTruthy();
    fireEvent.change(campo(/^Preço da transcrição/), { target: { value: "0,003" } });
    expect(screen.queryByText(AVISO_MIC)).toBeNull();
  });

  it("salvar sem mexer mantém os tetos vazios e o microfone fechado (nada muda)", async () => {
    const saved: any[] = [];
    abrir(CONFIG, saved);
    await mic();
    motivo();
    fireEvent.click(salvar());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].p_config).toMatchObject({ stt_team_only: true, stt_trial_daily_seconds: "", stt_paid_daily_seconds: "", stt_account_daily_seconds: "" });
  });

  it("mostra em minutos o que o banco guarda em segundos, e fechar o microfone é sempre possível", async () => {
    abrir({ ...CONFIG, stt_team_only: false, stt_trial_daily_seconds: 300, stt_paid_daily_seconds: 90, stt_account_daily_seconds: 36000 });
    const chave = await mic();
    expect(chave.checked).toBe(false);
    expect(campo(/^Microfone por dia — teste grátis/).value).toBe("5");
    expect(campo(/^Microfone por dia — plano pago/).value).toBe("1.5");
    expect(campo(/^Teto da plataforma por dia \(minutos/).value).toBe("600");
    fireEvent.click(chave);
    expect(chave.checked).toBe(true);
    expect(screen.queryByText(AVISO_MIC)).toBeNull();
  });
});

describe("CF02 — banco ainda sem a atualização (site novo, SQL antigo)", () => {
  const { stt_team_only, stt_trial_daily_seconds, stt_paid_daily_seconds, stt_account_daily_seconds, ...ANTIGO } = CONFIG;

  it("avisa que falta a atualização, trava os campos e não manda as chaves novas ao salvar", async () => {
    const saved: any[] = [];
    abrir(ANTIGO, saved);
    const chave = await mic();
    expect(screen.getByText(/O microfone dos alunos continua só para a equipe e ainda não pode ser liberado: falta uma atualização do banco/)).toBeTruthy();
    expect(chave.disabled).toBe(true);
    expect(campo(/^Microfone por dia — plano pago/).disabled).toBe(true);
    expect(screen.queryByText(PENDENTE)).toBeNull();
    motivo();
    expect(salvar().disabled).toBe(false);
    fireEvent.click(salvar());
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(Object.keys(saved[0].p_config).filter((k) => k.startsWith("stt_") && k !== "stt_price_per_min_usd")).toEqual([]);
  });
});

describe("VZ03 — voz do professor só com o preço preenchido", () => {
  it("liberar a voz aos alunos com preço zerado mostra o aviso e trava o salvar; com preço, libera", async () => {
    abrir({ ...CONFIG, tts_price_per_1k_chars_usd: 0 });
    const chave = await voz();
    motivo();
    fireEvent.click(chave);
    expect(chave.checked).toBe(false);
    expect(screen.getByText(AVISO_VOZ)).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    fireEvent.change(campo(/^Preço da voz do professor/), { target: { value: "0,30" } });
    expect(screen.queryByText(AVISO_VOZ)).toBeNull();
    expect(salvar().disabled).toBe(false);
  });

  it("quem já estava liberado (voz aberta com preço zerado) continua podendo salvar outras coisas", async () => {
    abrir({ ...CONFIG, tts_team_only: false, tts_price_per_1k_chars_usd: 0 });
    await voz();
    motivo();
    expect(screen.queryByText(AVISO_VOZ)).toBeNull();
    expect(salvar().disabled).toBe(false);
  });
});

describe("CF02 — Registro", () => {
  it("a mudança do Tutor continua no Registro só com o motivo (nenhum termo técnico novo)", () => {
    const resumo = auditSummary({ action: "tutor.config", details: { reason: "Liberar o microfone", to: { stt_team_only: false, stt_trial_daily_seconds: 300 } }, target: "tutor" } as any);
    expect(String(resumo)).toContain("Liberar o microfone");
    expect(String(resumo)).not.toMatch(/stt_|_seconds/);
  });
});
