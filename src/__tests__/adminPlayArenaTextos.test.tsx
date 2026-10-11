/**
 * Administração > Stazia Arena (jsdom, banco simulado), correções AR07 e AR08:
 *  AR07: a regra do feed social (que nada usa) não aparece para editar;
 *  AR08: tela em português simples: regras com nome (e não o código), valores sem aspas nem colchetes técnicos,
 *        motivos de suspeita em português e auditoria por aluno com busca por nome ou e-mail.
 * Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminPlay } from "../novo/app/admin/AdminPlay.jsx";

const BASE: any = {
  rules: [
    { key: "flags.coins_enabled", value: true, enabled: true, description: "Moedas e loja de recompensas." },
    { key: "flags.social_feed_enabled", value: false, enabled: true, description: "Feed de conquistas (fase futura)." },
    { key: "names.score", value: "Stazia Score", enabled: true, description: "Nome do índice de desempenho." },
    { key: "xp.question_correct", value: 8, enabled: true, description: "Acertar questão." },
    { key: "repeat.multipliers", value: [1, 0.3, 0.1, 0], enabled: true, description: "Fração do XP por tentativa da mesma questão (1ª, 2ª, 3ª, depois)." },
  ],
  rule_problems: [],
  levels: [],
  leagues: [],
  achievements: [],
  missions: [{ slug: "daily_correct", title: "Acerte %s questões", period: "daily", target_default: 15, xp_reward: 15, coins_reward: 5, active: true }],
  rewards: [],
  metrics: {
    users_active: 1, users_total: 2, xp_today: 10, xp_7d: 20, coins_issued: 3, missions_completed_7d: 0, achievements_7d: 0, avg_streak: 0,
    suspicious_7d: 4, suspicious_by_reason: { too_fast: 3, rate_limit: 1 }, by_league: { bronze: 2, "sem liga": 1 }, top10: [], events_24h: 4, season: null, jobs: [],
    xp_failures_7d: 0, xp_failures_recent: [],
  },
};
let data: any;

beforeEach(() => {
  data = structuredClone(BASE);
  backend.rpc = vi.fn(async (fn: string) => {
    if (fn === "app_admin_gamification" || fn === "app_admin_gamification_save_rule" || fn === "app_admin_gamification_save_mission") return data;
    throw new Error(`rpc inesperada: ${fn}`);
  });
});
afterEach(cleanup);

async function openRules() {
  render(<AdminPlay />);
  fireEvent.click(await screen.findByText("Regras"));
}

describe("AR07: regra sem efeito não aparece", () => {
  it("o feed social não aparece na lista de interruptores, mesmo que o banco ainda a mande", async () => {
    await openRules();
    expect(screen.getByText("Moedas e loja de recompensas.")).toBeTruthy();
    expect(screen.queryByText(/Feed de conquistas/)).toBeNull();
    expect(screen.queryByText("flags.social_feed_enabled")).toBeNull();
  });
});

describe("AR08: regras em português simples", () => {
  it("cada regra aparece com o nome em português, sem o código técnico", async () => {
    await openRules();
    fireEvent.click(screen.getByText("XP por evento"));
    expect(screen.getByText("Acertar questão.")).toBeTruthy();
    expect(screen.queryByText("xp.question_correct")).toBeNull();
    expect(screen.queryByLabelText("xp.question_correct")).toBeNull();
  });

  it("número: aparece o número puro; texto que não é número é recusado na tela, em português, sem chamar o banco", async () => {
    await openRules();
    fireEvent.click(screen.getByText("XP por evento"));
    const field = screen.getByLabelText("Acertar questão.") as HTMLInputElement;
    expect(field.value).toBe("8");
    fireEvent.change(field, { target: { value: "dez" } });
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByText("Digite só um número, por exemplo 8.")).toBeTruthy();
    expect(backend.rpc).not.toHaveBeenCalledWith("app_admin_gamification_save_rule", expect.anything());
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: 9, p_enabled: true }));
  });

  it("nome: aparece o texto puro, sem aspas, e grava como texto", async () => {
    await openRules();
    fireEvent.click(screen.getByText("Nomes"));
    const field = screen.getByLabelText("Nome do índice de desempenho.") as HTMLInputElement;
    expect(field.value).toBe("Stazia Score");
    fireEvent.change(field, { target: { value: "Pontos da Arena" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_save_rule", { p_key: "names.score", p_value: "Pontos da Arena", p_enabled: true }));
  });

  it("lista de repetição: aparece em porcentagens e grava como frações; lista inválida é recusada na tela", async () => {
    await openRules();
    fireEvent.click(screen.getByText("Repetição"));
    const field = screen.getByLabelText(/Fração do XP por tentativa/) as HTMLInputElement;
    expect(field.value).toBe("100, 30, 10, 0");
    fireEvent.change(field, { target: { value: "100, abc" } });
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByText(/Digite as porcentagens separadas por vírgula/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "100, 50, 0" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_save_rule", { p_key: "repeat.multipliers", p_value: [1, 0.5, 0], p_enabled: true }));
  });
});

describe("AR08: métricas e missões em português", () => {
  it("motivos de suspeita e ligas aparecem por extenso", async () => {
    data.leagues = [{ slug: "bronze", name: "Bronze", position: 1, icon: "medal" }];
    render(<AdminPlay />);
    expect(await screen.findByText(/rápido demais: 3/)).toBeTruthy();
    expect(screen.getByText(/muitas respostas por minuto: 1/)).toBeTruthy();
    expect(screen.queryByText(/too_fast/)).toBeNull();
    expect(screen.getByText("Bronze: 2")).toBeTruthy();
    expect(screen.getByText("Sem liga: 1")).toBeTruthy();
  });

  it("rotinas aparecem como frases, não como JSON", async () => {
    data.metrics.jobs = [{ id: 1, ran_at: "2026-10-10T03:05:00Z", job: "close_week", period_key: "7", result: { closed: 12, promoted: 3, relegated: 2, next_season: 8 } }];
    render(<AdminPlay />);
    expect(await screen.findByText(/Fechamento da semana/)).toBeTruthy();
    expect(screen.getByText(/3 subiram de liga, 2 desceram/)).toBeTruthy();
    expect(screen.queryByText(/next_season/)).toBeNull();
  });

  it("missões: o campo do alvo explica que vale para as próximas missões", async () => {
    render(<AdminPlay />);
    fireEvent.click(await screen.findByText("Missões e loja"));
    expect(screen.getByText(/Meta: 15/)).toBeTruthy();
    fireEvent.click(screen.getByText("Editar"));
    expect(screen.getByLabelText("Meta (vale para as próximas missões)")).toBeTruthy();
    expect(screen.queryByLabelText("Alvo padrão")).toBeNull();
  });
});

describe("AR08: auditoria por aluno com busca por nome ou e-mail", () => {
  const ANA = "00000000-0000-4000-8000-00000000000a";
  const AUDIT = {
    stats: { total_xp: 120, stazia_score: 400, provisional: false, coins: 7, questions_answered: 30, current_streak: 2, current_league: "bronze" },
    preferences: { leaderboard_visibility: "abbreviated" },
    events: [{ id: 1, created_at: "2026-10-10T12:00:00Z", xp_awarded: 0, is_valid: false, fraud_reason: "too_fast", event_type: "QUESTION_CORRECT", metadata: {} }],
  };
  beforeEach(() => {
    backend.rpc = vi.fn(async (fn: string, args: any) => {
      if (fn === "app_admin_gamification") return data;
      if (fn === "app_admin_users") return { total: 1, items: [{ id: ANA, name: "Ana Souza", email: "ana@teste.dev" }] };
      if (fn === "app_admin_gamification_user") return AUDIT;
      throw new Error(`rpc inesperada: ${fn} ${JSON.stringify(args)}`);
    });
  });

  it("busca pelo nome ou e-mail, escolhe o aluno e vê a auditoria sem digitar o código interno", async () => {
    render(<AdminPlay />);
    fireEvent.click(await screen.findByText("Auditoria"));
    expect(screen.queryByLabelText(/UUID/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar aluno por nome ou e-mail"), { target: { value: "ana" } });
    const found = await screen.findByText(/Ana Souza/, undefined, { timeout: 3000 });
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_users", expect.objectContaining({ p_search: "ana" }));
    fireEvent.click(found);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_user", { p_user_id: ANA, p_limit: 100 }));
    expect(await screen.findByText("XP 120")).toBeTruthy();
    expect(screen.getByText("Liga Bronze")).toBeTruthy();
    expect(screen.getByText("rápido demais")).toBeTruthy();
    expect(screen.queryByText("too_fast")).toBeNull();
  });
});
