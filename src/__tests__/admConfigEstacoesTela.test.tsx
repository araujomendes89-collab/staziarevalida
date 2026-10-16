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

import { AdminOverview, AdminTutor } from "../novo/app/admin/AdminPanels.jsx";

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

const OVERVIEW = {
  users: { total: 40, new_7d: 3, active_7d: 12, by_role: { admin: 1, student: 39 }, by_plan: { "trial:trialing": 5, "trial:expired": 8, "pro:active": 4, "elite:active": 2, "pro:past_due": 1, "elite:past_due": 2 } },
  questions: { total: 900, annulled: 4, needs_image: 7, exams: 6 },
  activity: { attempts: 5000, attempts_7d: 300, flashcard_reviews: 100 },
  stations: { pending: 3, approved: 5, reports: 0 },
  pending_review: { stations: 3, lessons_draft: 2, podcasts: 1, updates: 19, content: 0 },
  ai_month: { central_usd: 12.5, tutor_usd: 3.2 },
};
const textOf = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const cardOf = (label: HTMLElement) => label.closest(".sm-card") as HTMLElement;

describe("Visão geral (GE01, GE02, GE04, GE05, GE06)", () => {
  beforeEach(() => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_overview") return OVERVIEW;
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });

  it("GE01: 'Em teste' mostra só os testes dentro do prazo (o banco separa os vencidos como expirados)", async () => {
    render(<AdminOverview isAdmin />);
    const card = cardOf(await screen.findByText("Em teste"));
    expect(textOf(card)).toMatch(/Em teste5/);
    expect(textOf(card)).toMatch(/dentro do prazo/);
    expect(screen.getByText(/Teste grátis · Expirado: 8/)).toBeTruthy();
  });

  it("GE02: 'Planos pagos' soma só os ativos e diz quantos estão com pagamento pendente", async () => {
    render(<AdminOverview isAdmin />);
    const card = cardOf(await screen.findByText("Planos pagos"));
    expect(textOf(card)).toMatch(/Planos pagos6/);
    expect(textOf(card)).toMatch(/3 com pagamento pendente/);
  });

  it("GE04: 'Ativos' diz o que conta como estudar", async () => {
    render(<AdminOverview isAdmin />);
    expect(textOf(cardOf(await screen.findByText("Ativos")))).toMatch(/questões, flashcards, aulas ou Nexus/);
  });

  it("GE05: mostra o que espera revisão por aba e o gasto de IA do mês", async () => {
    render(<AdminOverview isAdmin />);
    await screen.findByText("Esperando revisão");
    for (const t of ["Estações: 3", "Aulas em rascunho: 2", "Podcasts com roteiro para aprovar: 1", "Atualizações pendentes: 19", "Central de Conteúdo: 0"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText("Central de IAs: US$ 12,50")).toBeTruthy();
    expect(screen.getByText("Nexus: US$ 3,20")).toBeTruthy();
  });

  it("GE05: sem nenhuma das somas de gasto, o bloco some em vez de ficar só com o título", async () => {
    backend.rpc.mockImplementation(async () => ({ ...OVERVIEW, ai_month: {} }));
    render(<AdminOverview isAdmin />);
    await screen.findByText("Esperando revisão");
    expect(screen.queryByText(/Gasto de IA/)).toBeNull();
  });

  it("GE03: o editor recebe só questões, atividade e estações; a tela não quebra sem os números de usuários", async () => {
    const { users: _u, ...paraEditor } = OVERVIEW;
    backend.rpc.mockImplementation(async () => paraEditor);
    render(<AdminOverview isAdmin={false} />);
    expect(await screen.findByText("Questões")).toBeTruthy();
    expect(screen.queryByText("Usuários")).toBeNull();
    expect(screen.getByText("Gasto de IA neste mês (estimado)")).toBeTruthy(); // o editor vê o gasto de IA
    expect(screen.getByText("Central de IAs: US$ 12,50")).toBeTruthy();
    expect(screen.getByText("Aulas em rascunho: 2")).toBeTruthy();
  });

  it("GE03: mesmo que o banco antigo ainda mande os números, o editor não os vê", async () => {
    render(<AdminOverview isAdmin={false} />);
    await screen.findByText("Questões");
    expect(screen.queryByText("Usuários")).toBeNull();
    expect(screen.queryByText("Planos pagos")).toBeNull();
  });

  it("GE06: o cartão 'Sem figura' manda enviar a figura em Questões (o envio já existe na tela)", async () => {
    render(<AdminOverview isAdmin />);
    const texto = textOf(cardOf(await screen.findByText("Sem figura")));
    expect(texto).toMatch(/citam figura sem imagem vinculada e ficam fora dos treinos; envie a figura em Questões/);
    expect(texto).not.toMatch(/ainda não está na tela/);
  });
});
