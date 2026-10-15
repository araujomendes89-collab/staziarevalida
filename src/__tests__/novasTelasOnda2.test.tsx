// @vitest-environment jsdom
/**
 * Novas telas, onda 2 (15/10/2026): Início (Visão Geral), Plano de Hoje com a janela "Personalizar plano", páginas Mais e Preferências
 * e os ícones que mudaram. Tudo com dados de teste no formato do banco; nenhuma chamada de rede.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const backend: any = { rpc: vi.fn() };
const updateProfile = vi.fn(async () => {});
const bootRef: any = { role: "student", profile: { name: "João Paulo Mendes", daily_minutes: 60, exam_date: null }, play: { enabled: true } };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend, refresh: async () => {}, updateProfile, boot: bootRef, user: { id: "u1" } }),
  useOptionalSession: () => ({ backend, boot: bootRef }),
}));
const SUMMARY = {
  enabled: true,
  score: 383,
  level: { name: "Explorador" },
  names: { score: "Stazia Score" },
  streak: { today: { questions: 3, min_questions: 10, min_minutes: 20 }, today_done: false },
  missions: { done: 1, total: 3, items: [{ slug: "m1", title: "Acerte 15 questões", progress: 3, target: 15, done: false, xp: 20 }] },
  weekly_rank: null,
  recent_achievements: [],
  flags: { leaderboard: true },
};
vi.mock("../novo/app/play/PlayDashboard.jsx", () => ({
  PlayError: () => null,
  usePlayHome: () => ({ summary: { data: SUMMARY, error: null, reload: () => {} }, busy: false, startNode: vi.fn(), error: null }),
}));
vi.mock("../novo/app/admin/radar/useRadarAvisos.js", () => ({ useRadarAvisos: () => [] }));

import { HomeScreen } from "../novo/app/home/HomeScreen.jsx";
import { TodayPlan } from "../novo/app/home/TodayPlan.jsx";
import { maisSections } from "../novo/app/shell/navModel.js";
import { AppRealIcon } from "../novo/app/AppIcons.jsx";

const TASKS = [
  { id: "t1", kind: "praticar", title: "20 questões de Pediatria", minutes: 40, progress: 0, target: 20, done: false, ref: { area: "PEDIATRIA", reason: "untrained", attempts: 0 } },
  { id: "t2", kind: "revisar", title: "Rever 5 questões erradas", minutes: 10, progress: 0, target: 5, done: false, ref: { reason: "errors" } },
];
const PLAN = { tasks: TASKS, done: 0, total: 2 };
const HOME = {
  attempts: 20,
  correct: 11,
  wrong_pending: 5,
  trial: null,
  open_session: { id: "s1", kind: "treino", status: "all", area: null, total: 20, answered: 2, paused: false, remaining_seconds: null },
  week: { attempts: 9, correct: 5, days_active: 3 },
  previous_week: { attempts: 0, correct: 0 },
  today: { attempts: 0 },
  priority_topics: [
    { area: "CIRURGIA_GERAL", topic: "Cirurgia geral e trauma", questions: 30, ineditas: 0, correct: 0, attempts: 0 },
    { area: "CLINICA_MEDICA", topic: "Cardiologia", questions: 12, ineditas: 0, correct: 3, attempts: 8 },
  ],
};
const TRAIL = { enabled: true, areas: [{ area: "CIRURGIA_GERAL", label: "Cirurgia", done: 0, total: 60, nodes: [{ topic: "Coloproctologia", state: "in_progress", answered: 1, goal: 8 }] }] };
const rpcs = (over: Record<string, any> = {}) =>
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn in over) return typeof over[fn] === "function" ? over[fn](args) : over[fn];
    const base: any = { app_home: HOME, app_today: PLAN, app_announcement: null, app_my_ineditas: { total: 74, released: 74, answered: 0, limited: false, locked: false }, app_trail: TRAIL, app_start_plan_task: { session_id: "s9" }, app_set_plan_task: PLAN };
    if (fn in base) return base[fn];
    throw new Error("rpc inesperada: " + fn);
  });

beforeEach(() => {
  backend.rpc.mockReset();
  updateProfile.mockClear();
});
afterEach(cleanup);

describe("Início (Visão Geral)", () => {
  it("mostra o cartão 'Continue de onde parou', o plano de hoje, a faixa de números, a trilha e o tema prioritário, tudo com dados do banco", async () => {
    rpcs();
    const go = vi.fn();
    render(<MemoryRouter><HomeScreen go={go} mobile={false} /></MemoryRouter>);
    expect(await screen.findByText("Continue de onde parou")).toBeTruthy();
    expect(screen.getByText("20 questões · Todas as áreas")).toBeTruthy();
    expect(screen.getByText(/Faltam 18/)).toBeTruthy();
    expect(screen.getByText("Meta de hoje")).toBeTruthy();
    expect(screen.getByText("3/10 · 20 min")).toBeTruthy();
    const plan = screen.getByRole("region", { name: "Plano de hoje" });
    expect(within(plan).getByText("0 de 2")).toBeTruthy();
    expect(within(plan).getByText("20 questões de Pediatria")).toBeTruthy();
    const kpis = screen.getByRole("region", { name: "Seu desempenho" });
    expect(kpis.textContent).toContain("5para revisar");
    expect(kpis.textContent).toContain("383Stazia Score");
    expect(kpis.textContent).toContain("55%acurácia");
    expect(kpis.textContent).toContain("9itens na semana");
    expect(await screen.findByText("Coloproctologia")).toBeTruthy();
    expect(screen.getByText("Cirurgia geral e trauma")).toBeTruthy();
    expect(screen.getByText("Ver os 2 temas prioritários")).toBeTruthy();
    // regra do projeto: nada de código, fonte ou gabarito nesta tela
    expect(document.body.textContent).not.toMatch(/GR-\d|gabarito/i);
  });

  it("os botões levam aonde o Início sempre levou: continuar a sessão, abrir a tarefa do plano e os temas", async () => {
    rpcs();
    const go = vi.fn();
    render(<MemoryRouter><HomeScreen go={go} mobile={false} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    expect(go).toHaveBeenCalledWith("sessao", { s: "s1" });
    fireEvent.click(screen.getByRole("button", { name: /20 questões de Pediatria/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s9" }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo tema prioritário/ }));
    expect(go).toHaveBeenCalledWith("questoes", { tema: "Cirurgia geral e trauma", area: "CIRURGIA_GERAL", status: "all" });
    fireEvent.click(screen.getByRole("button", { name: "Ver os 2 temas prioritários" }));
    expect(go).toHaveBeenCalledWith("questoes");
  });

  it("sem sessão aberta o cartão vira 'Próximo passo' com a primeira tarefa pendente", async () => {
    rpcs({ app_home: { ...HOME, open_session: null } });
    render(<MemoryRouter><HomeScreen go={vi.fn()} mobile={false} /></MemoryRouter>);
    expect(await screen.findByText("Próximo passo")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "20 questões de Pediatria" })).toBeTruthy();
  });
});

describe("Plano de Hoje", () => {
  it("etapas numeradas, a primeira marcada 'Agora', progresso e botões do jeito de antes; marcar como concluída continua possível", async () => {
    const done = { ...PLAN, tasks: [{ ...TASKS[0], done: true, progress: 20 }, TASKS[1]], done: 1 };
    rpcs({ app_set_plan_task: done });
    const go = vi.fn();
    render(<MemoryRouter><TodayPlan go={go} /></MemoryRouter>);
    expect(await screen.findByText("Foco de hoje: Pediatria")).toBeTruthy();
    expect(screen.getByText("0% concluído")).toBeTruthy();
    expect(screen.getByText(/Agora/)).toBeTruthy();
    expect(screen.getByText("0 de 20 respondidas hoje")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resolver questões/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s9" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Marcar 20 questões de Pediatria como concluída" }));
    expect(await screen.findByText("Concluída")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_set_plan_task", { p_task_id: "t1", p_done: true });
    expect(screen.getByRole("button", { name: /Resolver inéditas/ })).toBeTruthy();
  });

  it("'Personalizar plano': janela com data da prova e tempo por dia, valida a data, salva no perfil e refaz o plano", async () => {
    rpcs({ app_today: (args: any) => (args?.p_rebuild ? { ...PLAN, rebuilt: true } : PLAN) });
    render(<MemoryRouter initialEntries={["/hoje?ajustar=1"]}><TodayPlan go={vi.fn()} /></MemoryRouter>);
    const dialog = await screen.findByRole("dialog", { name: "Personalizar plano" });
    expect(within(dialog).getByRole("radio", { name: /1 h/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("radio", { name: /2 h/ }));
    const date = within(dialog).getByLabelText("Data da prova") as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2020-01-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText("A data da prova precisa ser hoje ou depois.")).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
    fireEvent.change(date, { target: { value: "2099-05-10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ exam_date: "2099-05-10", daily_minutes: 120 }));
    expect(backend.rpc).toHaveBeenCalledWith("app_today", { p_rebuild: true });
    expect(await screen.findByText("Plano atualizado: 2 h por dia · prova em 10/05/2099.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc fecha a janela e 'Ainda não sei a data' limpa a data da prova", async () => {
    rpcs();
    render(<MemoryRouter initialEntries={["/hoje?ajustar=1"]}><TodayPlan go={vi.fn()} /></MemoryRouter>);
    const dialog = await screen.findByRole("dialog", { name: "Personalizar plano" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Ainda não sei a data da prova" }));
    expect((within(dialog).getByLabelText("Data da prova") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ exam_date: null, daily_minutes: 60 }));
    cleanup();
    rpcs();
    render(<MemoryRouter initialEntries={["/hoje?ajustar=1"]}><TodayPlan go={vi.fn()} /></MemoryRouter>);
    await screen.findByRole("dialog", { name: "Personalizar plano" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Mais e ícones", () => {
  it("seções do 'Mais' (1ª fase): as quatro do pacote mais a de praticar e revisar; Aulas só quando liberadas; 2ª fase usa os grupos próprios", () => {
    const s = maisSections(1, { staff: false });
    expect(s.map((x) => x.label)).toEqual(["Estudar", "Aprender", "Stazia Arena", "Minha evolução", "Praticar e revisar"]);
    expect(s[0].items.map((i) => i[2])).toEqual(["Plano de Hoje", "Minha Trilha", "Simulados"]);
    expect(s[1].items.map((i) => i[2])).not.toContain("Aulas");
    expect(maisSections(1, { staff: true })[1].items.map((i) => i[2])).toContain("Aulas");
    expect(maisSections(2, {}).some((x) => x.items.some((i) => i[0] === "estacoes"))).toBe(true);
  });

  it("ícones novos do pacote: trilha, mapas mentais, coroa, plano de hoje, missões e análise", () => {
    const svg = (name: string) => renderToStaticMarkup(AppRealIcon({ name, size: 28 })!);
    expect(svg("route")).toContain("ri-trilha-road");
    expect(svg("network")).toContain("ri-mm-core");
    expect(svg("crown")).toContain("ri-crown-a");
    expect(svg("list-checks")).toContain("#12A79B");
    expect(svg("target")).toContain("#6CDDD2");
    expect(svg("chart-pie")).toContain("#6CDDD2");
    expect(svg("house")).toContain("ri-house"); // os que não mudaram seguem iguais
  });
});
