/**
 * Telas do Stazia Play (jsdom) com o banco simulado: trilha com estados e abertura de etapa, classificação
 * sanitizada com "perto de mim", missões, conquistas secretas, feedback de XP e modais. As regras de verdade
 * (XP, ranking, ligas) são cobertas em supabasePlayApi.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { gapText, levelProgress, movementText, topLabel, xpLines } from "../novo/app/play/format.js";

const backend: any = { rpc: vi.fn() };
const boot: any = { profile: { name: "Ana Maria Souza" }, play: { enabled: true, flags: { leaderboard: true, leagues: true, coins: true, trail: true }, names: { score: "Stazia Score", coins: "Stazia Coins" }, streak: 3 } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { TrailScreen } from "../novo/app/play/TrailScreen.jsx";
import { LeaderboardScreen } from "../novo/app/play/LeaderboardScreen.jsx";
import { MissionsScreen } from "../novo/app/play/MissionsScreen.jsx";
import { AchievementsScreen } from "../novo/app/play/AchievementsScreen.jsx";
import { XPToast, useTurnFeedback } from "../novo/app/play/PlayFeedback.jsx";

const TRAIL = {
  enabled: true, goal: 10, mastery_accuracy: 80,
  areas: [
    { area: "CLINICA_MEDICA", label: "Clínica Médica", total: 3, done: 1, mastered: 0, progress: 33,
      nodes: [
        { topic: "Sepse", position: 1, questions: 20, goal: 10, answered: 10, attempts: 12, correct: 8, accuracy: 67, state: "completed" },
        { topic: "Insuficiência cardíaca", position: 2, questions: 15, goal: 10, answered: 3, attempts: 3, correct: 3, accuracy: 100, state: "in_progress" },
        { topic: "Pneumonia", position: 3, questions: 12, goal: 10, answered: 0, attempts: 0, correct: 0, accuracy: null, state: "locked" },
      ],
      simulado: { state: "locked", done: 0, unlock_pct: 70 } },
    { area: "PEDIATRIA", label: "Pediatria", total: 1, done: 0, mastered: 0, progress: 0, nodes: [{ topic: "Bronquiolite", position: 1, questions: 9, goal: 9, answered: 0, attempts: 0, correct: 0, accuracy: null, state: "available" }], simulado: { state: "locked", done: 0, unlock_pct: 70 } },
  ],
};
const ROWS = [
  { rank: 1, public_id: "a1b2c3d4e5", name: "Carla D.", avatar: "Carla D.", level: "elite", score: 820, accuracy: 91, streak: 12, is_me: false, value: 820 },
  { rank: 2, public_id: "f6g7h8i9j0", name: "Você", avatar: "Ana M.", level: "expert", score: 700, accuracy: 80, streak: 3, is_me: true, value: 700 },
  { rank: 3, public_id: "k1l2m3n4o5", name: "Aluno anônimo", avatar: null, level: "avancado", score: 650, accuracy: null, streak: null, is_me: false, value: 650 },
];
let rpcImpl: Record<string, (args: any) => any>;

beforeEach(() => {
  localStorage.clear();
  rpcImpl = {
    app_trail: () => TRAIL,
    app_start_trail_node: () => ({ session_id: "s-123", count: 7 }),
    app_leaderboard: ({ p_kind }: any) => ({ enabled: true, kind: p_kind, total: 3, offset: 0, limit: 50, rows: ROWS, me: { rank: 2, total: 3, value: 700, percentile: 66.7, week_change: 4, next: [{ rank: 1, gap: 120 }] } }),
    app_leaderboard_near_me: () => ({ kind: "geral", rows: ROWS.slice(0, 3), me: { rank: 2, total: 3, percentile: 66.7, next: [] } }),
    app_public_profile: () => ({ name: "Carla D.", avatar: "Carla D.", level_info: { name: "Elite" }, score: 820, provisional: false, rank: 1, total: 3, questions: 400, accuracy: 91, streak: 12, achievements: [{ slug: "mira_boa", name: "Mira Boa", icon: "target", rarity: "comum" }] }),
    app_league_current: () => ({ enabled: true, joined: false, leagues: [{ slug: "bronze", name: "Bronze", icon: "medal", color_token: "--league-bronze" }] }),
    app_gamification_missions: () => ({
      today: "2026-10-06", week_start: "2026-10-05", week_end: "2026-10-11",
      daily_bonus: { xp: 50, coins: 25, done: false },
      daily: [
        { slug: "daily_correct", title: "Acerte 15 questões", icon: "target", kind: "correct", position: 1, progress: 12, target: 15, done: false, xp: 15, coins: 5 },
        { slug: "daily_areas", title: "Estude 2 áreas diferentes", icon: "layers", kind: "areas", position: 2, progress: 2, target: 2, done: true, xp: 10, coins: 5 },
      ],
      weekly: [{ slug: "weekly_questions", title: "Responda 150 questões na semana", icon: "file-question", kind: "questions", position: 1, progress: 40, target: 150, done: false, xp: 60, coins: 20 }],
    }),
    app_gamification_achievements: () => ({
      unlocked: 1, total: 3,
      items: [
        { slug: "primeiros_passos", category: "estudo", rarity: "comum", icon: "footprints", name: "Primeiros Passos", description: "10 questões respondidas.", secret: false, xp: 10, coins: 5, unlocked_at: "2026-10-01T12:00:00Z", seen: true },
        { slug: "insano", category: "estudo", rarity: "epica", icon: "zap", name: "Insano", description: "5.000 questões respondidas.", secret: false, xp: 300, coins: 150, unlocked_at: null, seen: false },
        { slug: "corujao", category: "especiais", rarity: "rara", icon: "lock", name: "Conquista secreta", description: "Continue estudando para descobrir.", secret: true, xp: 20, coins: 10, unlocked_at: null, seen: false },
      ],
    }),
    app_gamification_rewards: () => ({ enabled: true, coins: 70, freezes: 0, freeze_max: 3, catalog: [{ slug: "streak_freeze", name: "Proteção de sequência", description: "Protege um dia.", kind: "streak_freeze", cost: 60, icon: "snowflake", owned: false }], mine: [], transactions: [] }),
    app_claim_reward: () => ({ enabled: true, coins: 10, freezes: 1, freeze_max: 3, catalog: [{ slug: "streak_freeze", name: "Proteção de sequência", description: "Protege um dia.", kind: "streak_freeze", cost: 60, icon: "snowflake", owned: false }], mine: [], transactions: [] }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc não simulada: ${fn}`);
    return rpcImpl[fn](args);
  });
});
afterEach(cleanup);

describe("Trilha de aprendizado", () => {
  it("mostra as etapas com estado, bloqueia a trancada e abre o treino da etapa", async () => {
    const go = vi.fn();
    render(<TrailScreen go={go} />);
    await screen.findByText("Sepse");
    expect(screen.getByRole("button", { name: /Sepse: Concluída/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Insuficiência cardíaca: Em andamento/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Pneumonia: Bloqueada/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Simulado de Clínica Médica: Bloqueada/ }) as HTMLButtonElement).disabled).toBe(true);
    // próxima etapa é a em andamento
    expect(screen.getByRole("heading", { level: 3, name: "Insuficiência cardíaca" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Insuficiência cardíaca: Em andamento/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s-123" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_start_trail_node", { p_area: "CLINICA_MEDICA", p_topic: "Insuficiência cardíaca" });
  });

  it("troca de área e lembra a escolha", async () => {
    render(<TrailScreen go={vi.fn()} />);
    await screen.findByText("Sepse");
    fireEvent.click(screen.getByRole("tab", { name: /Pediatria/ }));
    expect((await screen.findAllByText("Bronquiolite")).length).toBeGreaterThan(0);
    expect(localStorage.getItem("smn-trail-area")).toBe("PEDIATRIA");
  });
});

describe("Classificação", () => {
  it("lista sanitizada, posição própria com percentil e movimento, perto de mim e perfil público", async () => {
    render(<LeaderboardScreen go={vi.fn()} />);
    await screen.findByText("Carla D.");
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("TOP 70%")).toBeTruthy(); // acima de 50% arredonda para a dezena, sem humilhar
    expect(screen.getByText("↑ 4 posições esta semana")).toBeTruthy();
    expect(screen.getByText("Faltam 121 pontos para #1")).toBeTruthy();
    expect(screen.getByText("Aluno anônimo")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/@|0000-4000/);
    fireEvent.click(screen.getByRole("button", { name: /Ver perto de mim/ }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_leaderboard_near_me", { p_kind: "geral", p_radius: 5 }));
    fireEvent.click(screen.getAllByText("Carla D.")[0]);
    expect(await screen.findByRole("dialog", { name: /Perfil de Carla D\./ })).toBeTruthy();
    expect(screen.getByText("Mira Boa")).toBeTruthy();
  });

  it("troca o tipo de ranking e abre a liga", async () => {
    render(<LeaderboardScreen go={vi.fn()} />);
    await screen.findByText("Carla D.");
    fireEvent.click(screen.getByRole("tab", { name: "Precisão" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_leaderboard", { p_kind: "precisao", p_offset: 0, p_limit: 50 }));
    fireEvent.click(screen.getByRole("tab", { name: /Liga da semana/ }));
    expect(await screen.findByText(/Você entra na liga com o primeiro XP/)).toBeTruthy();
  });
});

describe("Missões e conquistas", () => {
  it("missões do dia com progresso e bônus; semana à parte", async () => {
    render(<MissionsScreen go={vi.fn()} />);
    expect(await screen.findByText("Acerte 15 questões")).toBeTruthy();
    expect(screen.getByText("12/15")).toBeTruthy();
    expect(screen.getByText("Concluída")).toBeTruthy();
    expect(screen.getByText("+50 XP · +25 moedas")).toBeTruthy();
    expect(screen.getByText("Responda 150 questões na semana")).toBeTruthy();
  });

  it("medalhas: secreta escondida, filtro por categoria, detalhe; loja resgata com moedas", async () => {
    render(<AchievementsScreen />);
    expect(await screen.findByText("Primeiros Passos")).toBeTruthy();
    expect(screen.getByText("Conquista secreta")).toBeTruthy();
    expect(screen.queryByText("Corujão")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Secretas" }));
    expect(screen.queryByText("Primeiros Passos")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Todas/ }));
    fireEvent.click(screen.getByRole("button", { name: /Insano, bloqueada/ }));
    expect(await screen.findByRole("dialog", { name: "Insano" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("tab", { name: /Recompensas/ }));
    expect(await screen.findByText("Proteção de sequência")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resgatar" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_claim_reward", { p_slug: "streak_freeze" }));
    expect(await screen.findByText("Resgatada!")).toBeTruthy();
  });
});

describe("Feedback da resposta", () => {
  it("+XP com detalhe, bônus e sequência; resposta inválida explica o motivo", () => {
    const play = { xp: { total: 17, valid: true, base: 2, correct: 8, difficulty_bonus: 4, first_attempt_bonus: 3, multiplier: 1 }, bonus: [{ type: "SESSION_10", xp: 15 }], coins: 1, streak_incremented: true, stats: { streak: 4 } };
    render(<XPToast play={play} />);
    expect(screen.getByText("+17 XP")).toBeTruthy();
    expect(screen.getByText("+15 XP de bônus")).toBeTruthy();
    expect(screen.getByText(/Sequência: 4 dias/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhe" }));
    expect(screen.getByText("Questão difícil")).toBeTruthy();
    cleanup();
    render(<XPToast play={{ xp: { total: 0, valid: false, reason: "too_fast" } }} />);
    expect(screen.getByText("Resposta rápida demais para contar.")).toBeTruthy();
  });

  it("novo nível e medalha viram modais, um depois do outro", async () => {
    function Harness() {
      const f = useTurnFeedback();
      return (
        <>
          <button type="button" onClick={() => f.push({ level_up: { from: "iniciante", to: "explorador" }, achievements_unlocked: [{ slug: "x", name: "Primeiros Passos", description: "10 questões.", icon: "footprints", rarity: "comum", xp: 10, coins: 5 }] }, [{ slug: "explorador", name: "Explorador", icon: "compass", color_token: "--level-2", description: "Explorando." }])}>
            disparar
          </button>
          {f.modal}
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("disparar"));
    expect(screen.getByRole("dialog", { name: "Explorador" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("dialog", { name: "Primeiros Passos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Textos e contas do Play", () => {
  it("TOP, movimento, distância, progresso de nível e linhas de XP", () => {
    expect(topLabel(2.4)).toBe("TOP 2,4%");
    expect(topLabel(23.1)).toBe("TOP 24%");
    expect(topLabel(97.6)).toBe("TOP 100%");
    expect(movementText(34)).toBe("↑ 34 posições esta semana");
    expect(movementText(-1)).toBe("↓ 1 posição esta semana");
    expect(movementText(null)).toBeNull();
    expect(gapText({ rank: 436, gap: 12 })).toBe("Faltam 13 pontos para #436");
    expect(gapText({ rank: 10, gap: 40 }, "semana")).toBe("Faltam 41 XP para #10");
    expect(levelProgress(750, { min_score: 700, max_score: 799 }, { min_score: 800 })).toBe(50);
    expect(xpLines({ base: 2, correct: 8, fix_bonus: 10 }).map((l) => l.label)).toEqual(["Responder", "Acerto", "Erro corrigido"]);
  });
});
