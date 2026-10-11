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
