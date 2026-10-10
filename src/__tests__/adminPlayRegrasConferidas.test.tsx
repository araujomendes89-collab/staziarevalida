/**
 * Administração > Stazia Arena (jsdom, banco simulado), correção AR01:
 * aviso de regra com valor inválido e de cálculos de XP que falharam (as ações dos alunos foram gravadas),
 * e a mensagem do banco ao recusar uma regra aparece em português embaixo da regra.
 * Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminPlay } from "../novo/app/admin/AdminPlay.jsx";

const BASE: any = {
  rules: [
    { key: "flags.coins_enabled", value: true, enabled: true, description: "Moedas e loja de recompensas." },
    { key: "xp.question_correct", value: 8, enabled: true, description: "Acertar questão." },
  ],
  rule_problems: [],
  levels: [],
  leagues: [],
  achievements: [],
  missions: [],
  rewards: [],
  metrics: {
    users_active: 1, users_total: 2, xp_today: 10, xp_7d: 20, coins_issued: 3, missions_completed_7d: 0, achievements_7d: 0, avg_streak: 0,
    suspicious_7d: 0, suspicious_by_reason: {}, by_league: {}, top10: [], events_24h: 4, season: null, jobs: [],
    xp_failures_7d: 0, xp_failures_recent: [],
  },
};
let data: any;

beforeEach(() => {
  data = structuredClone(BASE);
  backend.rpc = vi.fn(async (fn: string) => {
    if (fn === "app_admin_gamification") return data;
    throw new Error(`rpc inesperada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Stazia Arena na Administração: regras conferidas", () => {
  it("sem regra ruim nem falha, não mostra aviso", async () => {
    render(<AdminPlay />);
    expect(await screen.findByText("XP hoje")).toBeTruthy();
    expect(screen.queryByText("Regra com valor inválido")).toBeNull();
    expect(screen.queryByText(/cálculos? de XP/)).toBeNull();
  });

  it("avisa a regra com valor inválido e os cálculos de XP que falharam, dizendo que as ações foram gravadas", async () => {
    data.rule_problems = [{ key: "xp.question_correct", problem: "A regra xp.question_correct precisa ser um número, sem aspas (por exemplo: 8)." }];
    data.metrics.xp_failures_7d = 3;
    data.metrics.xp_failures_recent = [{ created_at: "2026-10-10T12:00:00Z", step: "question_attempt", bad_rules: ["xp.question_correct"], detail: "x" }];
    render(<AdminPlay />);
    expect(await screen.findByText("Regra com valor inválido")).toBeTruthy();
    expect(screen.getByText("A regra xp.question_correct precisa ser um número, sem aspas (por exemplo: 8).")).toBeTruthy();
    expect(screen.getByText(/3 cálculos de XP falharam nos últimos 7 dias/)).toBeTruthy();
    expect(screen.getByText(/O que os alunos fizeram foi gravado; só o XP dessas ações ficou de fora\./)).toBeTruthy();
    expect(screen.getByText(/Corrija na aba Regras\./)).toBeTruthy();
  });

  it("falha sem regra ruim: diz que a causa não foi uma regra", async () => {
    data.metrics.xp_failures_7d = 1;
    data.metrics.xp_failures_recent = [{ created_at: "2026-10-10T12:00:00Z", step: "after_activity", bad_rules: [], detail: "x" }];
    render(<AdminPlay />);
    expect(await screen.findByText(/1 cálculo de XP falhou nos últimos 7 dias/)).toBeTruthy();
    expect(screen.getByText(/A última falha não veio de uma regra: avise o suporte técnico\./)).toBeTruthy();
  });

  it("valor recusado pelo banco: a mensagem em português aparece embaixo da regra", async () => {
    backend.rpc = vi.fn(async (fn: string) => {
      if (fn === "app_admin_gamification") return data;
      if (fn === "app_admin_gamification_save_rule") throw new Error("A regra xp.question_correct precisa ser um número, sem aspas (por exemplo: 8).");
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<AdminPlay />);
    fireEvent.click(await screen.findByText("Regras"));
    fireEvent.click(screen.getByText("XP por evento"));
    const field = screen.getByLabelText("xp.question_correct");
    fireEvent.change(field, { target: { value: '"dez"' } });
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByText("A regra xp.question_correct precisa ser um número, sem aspas (por exemplo: 8).")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: "dez", p_enabled: true });
  });

  it("regra gravada com o tipo errado antes da conferência: a aba Regras deixa corrigir", async () => {
    data.rules = [
      { key: "flags.coins_enabled", value: "sim", enabled: true, description: "Moedas e loja de recompensas." },
      { key: "xp.question_correct", value: true, enabled: true, description: "Acertar questão." },
    ];
    backend.rpc = vi.fn(async (fn: string) => {
      if (fn === "app_admin_gamification" || fn === "app_admin_gamification_save_rule") return data;
      throw new Error(`rpc inesperada: ${fn}`);
    });
    render(<AdminPlay />);
    fireEvent.click(await screen.findByText("Regras"));
    // interruptor com texto gravado: aparece como interruptor desligado; ligar grava true
    const sw = screen.getByRole("switch") as HTMLInputElement;
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_save_rule", { p_key: "flags.coins_enabled", p_value: true, p_enabled: true }));
    // regra de número com true gravado: aparece o campo para digitar o número
    fireEvent.click(screen.getByText("XP por evento"));
    const field = screen.getByLabelText("xp.question_correct");
    fireEvent.change(field, { target: { value: "8" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gamification_save_rule", { p_key: "xp.question_correct", p_value: 8, p_enabled: true }));
  });
});
