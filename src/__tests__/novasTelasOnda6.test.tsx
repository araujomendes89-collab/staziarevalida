/**
 * Novas telas, onda 6 (15/10/2026): Minha Trilha, Missões e Ranking e Liga com o visual do pacote.
 * Confere o que importa: tudo vem das funções do banco (app_trail, app_gamification_missions, app_leaderboard, app_league_current),
 * o interruptor da Stazia Arena continua mandando, o ranking vazio nunca inventa alunos, as ligas são as do banco
 * e o celular usa o desenho próprio (áreas com arte, abas Hoje/Semana, abas Ranking/Liga).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
const session: { boot: any } = { boot: null };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: session.boot, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false, ShellActions: ({ children }: any) => children }));

import { TrailScreen } from "../novo/app/play/TrailScreen.jsx";
import { MissionsScreen } from "../novo/app/play/MissionsScreen.jsx";
import { LeaderboardScreen } from "../novo/app/play/LeaderboardScreen.jsx";

const node = (topic: string, state: string, extra: any = {}) => ({ topic, position: 1, questions: 20, goal: 10, answered: 0, attempts: 0, correct: 0, accuracy: null, state, ...extra });
const TRAIL = {
  enabled: true, goal: 10, mastery_accuracy: 80,
  areas: [
    { area: "PEDIATRIA", label: "Pediatria", total: 6, done: 1, mastered: 1,
      nodes: [node("Puericultura", "mastered", { answered: 10, accuracy: 90 }), node("Neonatologia", "in_progress", { answered: 4, accuracy: 75 }), node("Asma na infância", "locked"), node("Aleitamento materno", "locked"), node("Pneumologia pediátrica", "locked"), node("Nefrologia pediátrica", "locked")],
      simulado: { state: "locked", done: 0, unlock_pct: 70 } },
    { area: "CLINICA_MEDICA", label: "Clínica Médica", total: 1, done: 0, mastered: 0, nodes: [node("Sepse", "available")], simulado: { state: "locked", done: 0, unlock_pct: 70 } },
  ],
};
const mission = (slug: string, title: string, kind: string, progress: number, target: number, extra: any = {}) => ({ slug, title, kind, icon: "target", progress, target, done: false, xp: 15, coins: 5, ...extra });
const MISSIONS = {
  today: "2026-10-15", week_start: "2026-10-12", week_end: "2026-10-18",
  daily_bonus: { xp: 50, coins: 25, done: false },
  daily: [mission("daily_correct", "Acerte 15 questões", "correct", 3, 15), mission("daily_areas", "Estude 2 áreas diferentes", "areas", 2, 2, { done: true })],
  weekly: [mission("weekly_accuracy", "Mantenha 75% de precisão na semana", "accuracy", 0, 75, { xp: 60, coins: 20 }), mission("weekly_simulado", "Complete 1 simulado", "simulados", 0, 1, { xp: 50, coins: 20 })],
};
const LEAGUES = [
  { slug: "bronze", name: "Bronze", position: 1, icon: "medal", color_token: "--league-bronze" },
  { slug: "prata", name: "Prata", position: 2, icon: "medal", color_token: "--league-prata" },
  { slug: "revalida_master", name: "Revalida Master", position: 7, icon: "trophy", color_token: "--league-master" },
];
let rpc: Record<string, (a: any) => any>;

/** jsdom não tem matchMedia: simula a largura (celular = 390, tablet = 834, computador = 1440). */
const setWidth = (px: number) =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 99999);
      return { matches: px <= max, media: query, addEventListener: () => {}, removeEventListener: () => {} };
    },
  });

beforeEach(() => {
  localStorage.clear();
  setWidth(1440);
  session.boot = { profile: { name: "Ana Maria Souza" }, play: { enabled: true, flags: { leaderboard: true, leagues: true, coins: true, trail: true } } };
  rpc = {
    app_trail: () => TRAIL,
    app_start_trail_node: () => ({ session_id: "s-9" }),
    app_gamification_missions: () => MISSIONS,
    app_leaderboard: () => ({ enabled: true, total: 0, rows: [], me: null }),
    app_leaderboard_near_me: () => ({ rows: [], me: null }),
    app_league_current: () => ({ enabled: true, joined: false, leagues: LEAGUES }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpc[fn]) throw new Error(`rpc não simulada: ${fn}`);
    return rpc[fn](args);
  });
});
afterEach(cleanup);

describe("Minha Trilha", () => {
  it("computador: áreas em pílulas com a contagem, etapa atual em destaque, Próxima etapa N de M, Como funciona aberto", async () => {
    localStorage.setItem("smn-trail-area", "PEDIATRIA");
    const go = vi.fn();
    render(<TrailScreen go={go} />);
    await screen.findByText("Puericultura");
    const tabs = screen.getByRole("tablist", { name: "Grande área" });
    expect(within(tabs).getByRole("tab", { name: /Pediatria\s*1\/6/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Puericultura: Dominada" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Asma na infância: Bloqueada" })).toBeDisabled();
    // a etapa em andamento é a atual: o cartão azul diz a posição dela e quanto falta (dados do banco)
    const next = screen.getByRole("region", { name: "Próxima etapa" });
    expect(within(next).getByText("Próxima etapa · 2 de 6")).toBeInTheDocument();
    expect(within(next).getByRole("heading", { name: "Neonatologia" })).toBeInTheDocument();
    expect(next).toHaveTextContent("6 questões para concluir a etapa · cerca de 12 min");
    expect(screen.getByRole("button", { name: /Como funciona a trilha/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Uma etapa conclui com 10 questões do tema/)).toBeInTheDocument();
    expect(screen.getByText("Simulado de Pediatria")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver Grandes Temas por incidência/ }));
    expect(go).toHaveBeenCalledWith("temas");
    fireEvent.click(within(next).getByRole("button", { name: /Continuar estudando/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-9" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_start_trail_node", { p_area: "PEDIATRIA", p_topic: "Neonatologia" });
  });

  it("celular: áreas com arte, cartão azul antes das etapas, lista curta que abre todas, Como funciona fechado", async () => {
    setWidth(390);
    localStorage.setItem("smn-trail-area", "PEDIATRIA");
    render(<TrailScreen go={vi.fn()} />);
    await screen.findByText("Etapas da trilha");
    const tab = screen.getByRole("tab", { name: /Pediatria/ });
    expect(tab.querySelector("img")).not.toBeNull(); // arte da área (onda 5)
    const order = [screen.getByRole("region", { name: "Próxima etapa" }), screen.getByText("Etapas da trilha")];
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Nefrologia pediátrica")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver as 6 etapas \+ simulado/ }));
    expect(screen.getByText("Nefrologia pediátrica")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Como funciona a trilha/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("Stazia Arena desligada: aviso e nenhuma chamada ao banco", () => {
    session.boot.play.enabled = false;
    render(<TrailScreen go={vi.fn()} />);
    expect(screen.getByText(/A trilha faz parte da Stazia Arena, que está desligada/)).toBeInTheDocument();
    expect(backend.rpc).not.toHaveBeenCalledWith("app_start_trail_node", expect.anything());
  });
});

describe("Missões", () => {
  it("computador: dois quadros com contagem, precisão em %, moedas e bônus do banco; Estudar agora abre o Banco", async () => {
    const go = vi.fn();
    render(<MissionsScreen go={go} />);
    const hoje = await screen.findByRole("region", { name: "Missões de hoje" });
    expect(within(hoje).getByText("1 de 2")).toBeInTheDocument();
    expect(within(hoje).getByText("3/15")).toBeInTheDocument();
    expect(within(hoje).getByText("Concluída")).toBeInTheDocument();
    expect(within(hoje).getByText("+50 XP · +25 moedas")).toBeInTheDocument();
    const semana = screen.getByRole("region", { name: "Missões da semana" });
    expect(within(semana).getByText("12/10/2026 a 18/10/2026")).toBeInTheDocument();
    expect(within(semana).getByText("0% / 75%")).toBeInTheDocument();
    expect(within(semana).getByText("0 de 2")).toBeInTheDocument();
    expect(document.querySelectorAll("img.ar-coin").length).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: /Estudar agora/ }));
    expect(go).toHaveBeenCalledWith("questoes");
  });

  it("celular: resumo dourado, abas Hoje/Semana com a contagem e botão Estudar agora", async () => {
    setWidth(390);
    render(<MissionsScreen go={vi.fn()} />);
    expect(await screen.findByText("missões de hoje")).toBeInTheDocument();
    expect(screen.getByText(/Complete todas e ganhe/)).toHaveTextContent("Complete todas e ganhe +50 XP e +25 moedas");
    expect(screen.getByRole("tab", { name: "Hoje 1/2" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Semana 0/2" }));
    expect(screen.getByText("Complete 1 simulado")).toBeInTheDocument();
    expect(screen.queryByText("Acerte 15 questões")).toBeNull();
    expect(screen.getByText(/concluídas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Estudar agora/ })).toBeInTheDocument();
  });

  it("Stazia Arena desligada: aviso", () => {
    session.boot.play.enabled = false;
    render(<MissionsScreen go={vi.fn()} />);
    expect(screen.getByText(/As missões fazem parte da Stazia Arena/)).toBeInTheDocument();
  });
});

describe("Ranking e Liga", () => {
  it("computador, sem ninguém no ranking: estado vazio, nenhuma pessoa inventada, liga ao lado com as ligas do banco", async () => {
    const go = vi.fn();
    render(<LeaderboardScreen go={go} />);
    expect(await screen.findByText("Ninguém neste ranking ainda.")).toBeInTheDocument();
    expect(screen.getByText("Você ainda não aparece neste ranking.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem").filter((li) => li.closest(".ar-rows")).length).toBe(0);
    expect(document.body.textContent).not.toMatch(/🥇|🥈|🥉|🔥/);
    fireEvent.click(screen.getByRole("button", { name: /Responder questões/ }));
    expect(go).toHaveBeenCalledWith("questoes");
    const liga = screen.getByRole("region", { name: "Liga da semana" });
    expect(await within(liga).findByText("Entre na liga")).toBeInTheDocument();
    expect(within(liga).getByText("As 3 ligas")).toBeInTheDocument();
    const nomes = within(liga).getAllByRole("listitem").map((li) => li.textContent);
    expect(nomes).toEqual(["Revalida Master", "Prata", "Bronze"]); // da mais alta à inicial, só as do banco
  });

  it("liga com grupo: posição do aluno, zonas e 'Sua liga'", async () => {
    rpc.app_league_current = () => ({
      enabled: true, joined: true, season: { starts_on: "2026-10-12", ends_on: "2026-10-18" }, league: LEAGUES[0], leagues: LEAGUES, group_no: 3, promote: 1, relegate: 1, min_group_for_relegation: 3,
      rows: [
        { public_id: "a", name: "Carla D.", avatar: "Carla D.", position: 1, weekly_xp: 90, is_me: false },
        { public_id: "b", name: "Você", avatar: "Ana M.", position: 2, weekly_xp: 50, is_me: true },
        { public_id: "c", name: "Aluno anônimo", avatar: null, position: 3, weekly_xp: 10, is_me: false },
      ],
      history: [],
    });
    render(<LeaderboardScreen go={vi.fn()} />);
    const liga = screen.getByRole("region", { name: "Liga da semana" });
    expect(await within(liga).findByText("Liga Bronze")).toBeInTheDocument();
    expect(within(liga).getByText("Promoção")).toBeInTheDocument();
    expect(within(liga).getByText("Rebaixamento")).toBeInTheDocument();
    // G10.3 (D4, provisória): no computador, com grupo, "As N ligas" fica embaixo do ranking e abre ao tocar
    const ligas = screen.getByRole("button", { name: "As 3 ligas" });
    expect(ligas).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(ligas);
    expect(within(screen.getByRole("region", { name: "As 3 ligas" })).getByText("Sua liga")).toBeInTheDocument();
    expect(within(liga).getByRole("button", { name: /Você/ })).toHaveAttribute("aria-current", "true");
  });

  it("celular: abas Ranking | Liga da semana; a liga mostra os números do grupo", async () => {
    setWidth(390);
    render(<LeaderboardScreen go={vi.fn()} />);
    expect(await screen.findByText("Ninguém neste ranking ainda")).toBeInTheDocument();
    expect(screen.getByText("Ainda não aparece neste ranking")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Liga da semana" }));
    expect(await screen.findByText("alunos por grupo")).toBeInTheDocument();
    expect(screen.getByText("As 3 ligas, da mais alta à inicial")).toBeInTheDocument();
  });

  it("ligas desligadas no banco: só o ranking; Arena desligada: aviso", async () => {
    session.boot.play.flags.leagues = false;
    render(<LeaderboardScreen go={vi.fn()} />);
    await screen.findByText("Ninguém neste ranking ainda.");
    expect(screen.queryByRole("region", { name: "Liga da semana" })).toBeNull();
    cleanup();
    session.boot.play.enabled = false;
    render(<LeaderboardScreen go={vi.fn()} />);
    expect(screen.getByText(/A classificação faz parte da Stazia Arena/)).toBeInTheDocument();
  });
});
