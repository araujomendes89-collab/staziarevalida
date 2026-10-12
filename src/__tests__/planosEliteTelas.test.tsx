/**
 * PL04 (decisão do dono de 2026-10-11) nas telas: benefícios do plano Elite, SÓ A ESTRUTURA. Em Administração > Configurações o
 * dono vê os dois valores vazios/desligados com o aviso "Pendente: ..."; o aluno Elite só vê o benefício se o dono ligou/preencheu.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const session: { boot: any } = { boot: null };
const backend: any = { rpc: vi.fn() };

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: session.boot, user: { id: "eu", email: "pessoa@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));

import { AdminPlans, AdminSettings } from "../novo/app/admin/AdminPanels.jsx";
import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { ACTION_LABEL, auditLabel, auditSummary } from "../novo/app/admin/auditLog.js";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const SETTINGS = { trial_days: 7, announcement: { active: false, tone: "info", title: "", text: "" } };
const VAZIO = { elite_voice_daily_minutes: null, elite_station_feedback: false, pro_voice_daily_minutes: 60, voice_enabled: true };

// com chaves: o que o beforeEach devolve o vitest chama como limpeza depois do teste (mockReset devolve o próprio mock)
beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

describe("PL04 — Administração › Configurações", () => {
  const abrir = (benefits: any = VAZIO, saved: any[] = [], fail?: string) => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_settings") return SETTINGS;
      if (fn === "app_admin_plan_benefits") return benefits;
      if (fn === "app_admin_save_plan_benefits") {
        saved.push(args.p_benefits);
        if (fail) throw new Error(fail);
        return { ...benefits, elite_voice_daily_minutes: args.p_benefits.elite_voice_daily_minutes == null ? null : Number(args.p_benefits.elite_voice_daily_minutes), elite_station_feedback: args.p_benefits.elite_station_feedback };
      }
      throw new Error(`rpc inesperada: ${fn}`);
    });
    return render(<AdminSettings />);
  };

  it("sem valores: o Elite fica igual ao Pro, mostra os minutos do Pro e o aviso Pendente nos dois pontos", async () => {
    abrir();
    expect(await screen.findByText("Benefícios do plano Elite")).toBeTruthy();
    expect(screen.getByText(/Enquanto nada estiver preenchido, nada muda para ninguém: o Elite fica igual ao Pro\./)).toBeTruthy();
    expect(screen.getByText(/Pro: 60 min por dia/)).toBeTruthy();
    expect((screen.getByLabelText("Voz do Tutor por dia no Elite (minutos)") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Pendente: definir os minutos de voz do Elite")).toBeTruthy();
    expect(screen.getByText("Pendente: decidir se a correção de estação com devolutiva entra no Elite")).toBeTruthy();
    expect((screen.getByRole("switch", { name: /^Correção de estação com devolutiva/ }) as HTMLInputElement).checked).toBe(false);
    // nenhum número ou preço inventado no bloco
    expect(screen.queryByText(/R\$/)).toBeNull();
  });

  it("salvar sem mexer mantém tudo vazio (nada muda para ninguém)", async () => {
    const saved: any[] = [];
    abrir(VAZIO, saved);
    fireEvent.click(await screen.findByText("Salvar benefícios do Elite"));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({ elite_voice_daily_minutes: null, elite_station_feedback: false });
    expect(await screen.findByText("Benefícios do Elite salvos.")).toBeTruthy();
  });

  it("o dono preenche os minutos e liga a correção: manda os valores e os avisos Pendente saem", async () => {
    const saved: any[] = [];
    abrir(VAZIO, saved);
    fireEvent.change(await screen.findByLabelText("Voz do Tutor por dia no Elite (minutos)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("switch", { name: /^Correção de estação com devolutiva/ }));
    expect(screen.queryByText("Pendente: definir os minutos de voz do Elite")).toBeNull();
    expect(screen.queryByText("Pendente: decidir se a correção de estação com devolutiva entra no Elite")).toBeNull();
    fireEvent.click(screen.getByText("Salvar benefícios do Elite"));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({ elite_voice_daily_minutes: "120", elite_station_feedback: true });
  });

  it("recusa do banco aparece em português", async () => {
    abrir(VAZIO, [], "Os minutos de voz do Elite não podem ser menores que os do Pro (60 min por dia).");
    fireEvent.change(await screen.findByLabelText("Voz do Tutor por dia no Elite (minutos)"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Salvar benefícios do Elite"));
    expect(await screen.findByText("Os minutos de voz do Elite não podem ser menores que os do Pro (60 min por dia).")).toBeTruthy();
  });

  it("valores já salvos aparecem preenchidos", async () => {
    abrir({ ...VAZIO, elite_voice_daily_minutes: 90, elite_station_feedback: true });
    expect(((await screen.findByLabelText("Voz do Tutor por dia no Elite (minutos)")) as HTMLInputElement).value).toBe("90");
    expect((screen.getByRole("switch", { name: /^Correção de estação com devolutiva/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/Pendente:/)).toBeNull();
  });

  it("a aba Planos explica onde ficam os benefícios do Elite", async () => {
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_admin_plans" ? [{ code: "elite", name: "Elite", description: null, price_cents: null, billing_period: "monthly", features: [], active: false }] : null
    );
    render(<AdminPlans />);
    expect(await screen.findByText(/no bloco “Benefícios do plano Elite”/)).toBeTruthy();
  });
});

describe("PL04 — Conta do aluno", () => {
  const PROFILE = { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light" };
  const boot = (plan: string) => ({
    role: "student",
    profile: PROFILE,
    subscription: { plan, status: "active", trial_ends_at: null, current_period_end: iso(Date.now() + 20 * DAY) },
    has_pro: true,
  });
  const benefits = (b: any) =>
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_my_benefits") return b;
      return null;
    });

  it("Elite com valores ligados: mostra só o que o dono definiu", async () => {
    session.boot = boot("elite");
    benefits({ elite: true, voice_daily_minutes: 120, station_feedback: true });
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Benefícios do seu plano Elite")).toBeTruthy();
    expect(screen.getByText("Voz do Tutor: até 120 minutos por dia")).toBeTruthy();
    expect(screen.getByText("Correção de estação com devolutiva")).toBeTruthy();
  });

  it("Elite com só um benefício ligado mostra só ele", async () => {
    session.boot = boot("elite");
    benefits({ elite: true, voice_daily_minutes: null, station_feedback: true });
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Correção de estação com devolutiva")).toBeTruthy();
    expect(screen.queryByText(/Voz do Tutor: até/)).toBeNull();
  });

  it("Elite com nada ligado (padrão): nenhum benefício aparece", async () => {
    session.boot = boot("elite");
    benefits({ elite: true, voice_daily_minutes: null, station_feedback: false });
    render(<AccountScreen go={vi.fn()} />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_my_benefits"));
    expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull();
  });

  it("Elite com plano vencido (o banco diz elite: false) e plano Pro: sem benefícios; Pro nem chama o banco", async () => {
    session.boot = boot("elite");
    benefits({ elite: false, voice_daily_minutes: null, station_feedback: false });
    const a = render(<AccountScreen go={vi.fn()} />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalled());
    expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull();
    a.unmount();
    backend.rpc.mockClear();
    session.boot = boot("pro");
    render(<AccountScreen go={vi.fn()} />);
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull();
  });

  it("se o banco ainda não tem a função (migração por colar), a Conta funciona igual", async () => {
    session.boot = boot("elite");
    backend.rpc.mockRejectedValue(new Error("function public.app_my_benefits() does not exist"));
    render(<AccountScreen go={vi.fn()} />);
    expect(await screen.findByText("Plano Elite")).toBeTruthy();
    expect(screen.queryByText("Benefícios do seu plano Elite")).toBeNull();
  });
});

describe("PL04 — Registro", () => {
  it("a ação nova tem nome em português e resumo simples", () => {
    expect(ACTION_LABEL["plan.benefits"]).toBe("Benefícios do Elite alterados");
    const entry = { action: "plan.benefits", target: "elite", actor: "master@teste.dev", details: {} };
    expect(auditLabel(entry)).toBe("Benefícios do Elite alterados");
    expect(auditSummary({ ...entry, details: { to: { elite_voice_daily_minutes: 90, elite_station_feedback: true } } })).toBe(
      "Voz do Tutor no Elite: 90 min por dia · Correção de estação com devolutiva (só Elite): ligada"
    );
    expect(auditSummary({ ...entry, details: { to: { elite_voice_daily_minutes: null, elite_station_feedback: false } } })).toBe(
      "Voz do Tutor no Elite: igual ao Pro · Correção de estação com devolutiva (só Elite): desligada"
    );
  });
});
