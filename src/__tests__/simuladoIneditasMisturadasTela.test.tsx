// @vitest-environment jsdom
/**
 * Inéditas misturadas nos simulados comuns (migração …012200), telas: o montador avisa que algumas questões podem ser Inéditas (e que o
 * TRI é só oficial), o resultado mostra à parte quantas eram inéditas e a Administração > Configurações guarda o percentual (0 a 50).
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: () => <button type="button">Conversar com o Tutor</button> }));

import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { SessionResult } from "../novo/app/practice/SessionResult.jsx";
import { AdminSettings } from "../novo/app/admin/AdminPanels.jsx";
import { auditSummary } from "../novo/app/admin/auditLog.js";

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

const ABERTA = { id: "staziamed", kind: "STAZIAMED", year: 2026, semester: null, title: "Questões Inéditas", total: 74, locked: false, lock_message: null, released: 20, answered: 0, limited: true };
const montador = (staz: any | null, mode: "q" | "sim" = "sim") => {
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_question_filters") return { total: 1200, exams: staz ? [staz] : [], topics: [] };
    if (fn === "app_count_questions") return { total: 100, by_area: { PEDIATRIA: 20 } };
    if (fn === "app_recent_sessions") return [];
    throw new Error(`rpc não simulada: ${fn}`);
  });
  render(
    <MemoryRouter>
      <QuestionBuilder go={vi.fn()} mode={mode} />
    </MemoryRouter>
  );
};
const opcoes = async () => ([...((await screen.findByLabelText("Prova / edição")) as HTMLSelectElement).options].map((o) => o.textContent));

describe("Montador do simulado", () => {
  it("com inéditas liberadas: a primeira opção diz que algumas são Inéditas e o aviso explica; o TRI volta a só oficiais", async () => {
    montador(ABERTA);
    expect(await opcoes()).toContain("Todas as provas (oficiais e algumas Inéditas)");
    expect(screen.getByText(/Algumas questões deste simulado podem ser Questões Inéditas liberadas no seu plano/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /TRI — estimativa StaziaMed/ }));
    expect(await opcoes()).toContain("Todas as provas oficiais");
    expect(screen.queryByText(/Algumas questões deste simulado podem ser/)).toBeNull();
  });

  it("sem inéditas liberadas, sem acesso ou sem inéditas publicadas: nada muda na tela (100% oficial)", async () => {
    for (const staz of [{ ...ABERTA, released: 0 }, { ...ABERTA, locked: true, released: 0 }, null]) {
      montador(staz);
      expect(await opcoes()).toContain("Todas as provas oficiais");
      expect(screen.queryByText(/Algumas questões deste simulado podem ser/)).toBeNull();
      cleanup();
    }
  });

  it("escolhida uma prova, o aviso some; no treino de questões a opção continua 'Todas as provas oficiais'", async () => {
    montador(ABERTA);
    fireEvent.change(await screen.findByLabelText("Prova / edição"), { target: { value: "staziamed" } });
    expect(screen.queryByText(/Algumas questões deste simulado podem ser/)).toBeNull();
    cleanup();
    montador(ABERTA, "q");
    expect(await opcoes()).toContain("Todas as provas oficiais");
    expect(screen.queryByText(/Algumas questões deste simulado podem ser/)).toBeNull();
  });
});

const Q = (n: number) => ({
  id: `q${n}`, number: n, area: "PEDIATRIA", exam: { id: "e", kind: "REVALIDA", year: 2025, semester: 1 }, statement: `Caso ${n}. Conduta?`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}` })), images: [], selected: "B",
  correction: { is_correct: true, correct_option: "B", explanation: null, option_notes: [], sources: [] },
});
const sessao = (ineditas: any, total = 30) => ({
  id: "s1", kind: "simulado", filters: { area: "" }, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
  questions: [Q(1), Q(2), Q(3)],
  result: { total, answered: total, correct: 20, active_seconds: 60, elapsed_seconds: 90, paused_seconds: 0, by_area: [{ area: "PEDIATRIA", total, answered: total, correct: 20 }], ineditas },
});
const resultado = (ineditas: any, total?: number) =>
  render(
    <MemoryRouter>
      <SessionResult session={sessao(ineditas, total)} go={vi.fn()} />
    </MemoryRouter>
  );

describe("Resultado do simulado", () => {
  it("mostra à parte quantas eram Questões Inéditas, quantas respondeu e quantas acertou", async () => {
    resultado({ total: 3, answered: 3, correct: 2 });
    expect(await screen.findByText(/Questões Inéditas: 3 questões neste simulado · 2 certas de 3 respondidas/)).toBeTruthy();
  });

  it("sem inéditas na sessão, ou simulado só de inéditas: nenhuma linha extra", async () => {
    resultado({ total: 0, answered: 0, correct: 0 });
    await screen.findByText("Aproveitamento");
    expect(screen.queryByText(/Questões Inéditas:/)).toBeNull();
    cleanup();
    resultado({ total: 30, answered: 30, correct: 20 }, 30);
    await screen.findByText("Aproveitamento");
    expect(screen.queryByText(/Questões Inéditas:/)).toBeNull();
    cleanup();
    resultado(undefined); // banco ainda sem a 012200
    await screen.findByText("Aproveitamento");
    expect(screen.queryByText(/Questões Inéditas:/)).toBeNull();
  });
});

describe("Administração > Configurações", () => {
  const SETTINGS = { trial_days: 7, simulado_ineditas_pct: 10, announcement: { active: false, tone: "info", title: "", text: "" } };
  const abrir = (settings: any = SETTINGS) => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_settings") return settings;
      if (fn === "app_admin_save_settings") return { ...settings, simulado_ineditas_pct: Number(args.p_settings.simulado_ineditas_pct) };
      if (fn === "app_admin_elite_benefits") return { elite_voice_daily_minutes: null, elite_station_feedback: false, pro_voice_daily_minutes: 60, voice_enabled: true };
      return null;
    });
    return render(<AdminSettings />);
  };

  it("mostra o padrão 10 e salva o número novo junto das outras configurações", async () => {
    abrir();
    const campo = (await screen.findByLabelText("Questões Inéditas nos simulados (%)")) as HTMLInputElement;
    expect(campo.value).toBe("10");
    expect(screen.getByText(/O simulado TRI é sempre só de questões oficiais/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_settings", { p_settings: expect.objectContaining({ trial_days: "7", simulado_ineditas_pct: "15" }) }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
  });

  it("banco ainda sem a 012200 (sem a chave): o campo abre com 10", async () => {
    abrir({ trial_days: 7, announcement: SETTINGS.announcement });
    expect(((await screen.findByLabelText("Questões Inéditas nos simulados (%)")) as HTMLInputElement).value).toBe("10");
  });

  it("o histórico de ações descreve a mudança em português", () => {
    expect(auditSummary({ action: "settings.save", details: { simulado_ineditas_pct: "15" } } as any)).toContain("Questões Inéditas nos simulados: até 15%");
  });
});
