/**
 * Novas telas, onda 7: Conquistas e "Medalhas e ligas" (padrão 3D). Confere o progresso real das medalhas bloqueadas,
 * o mapa slug -> arte do pacote (41 medalhas + 7 ligas), a flag VITE_MEDALHAS_ARTE_PACOTE (LIGADA por padrão desde 16/10/2026,
 * o dono confirmou que a arte é dele; =0 volta aos ícones Lucide), a arte com no mínimo 64 px e os três desenhos (computador, tablet, celular).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { conquistas, LIGAS } from "../../scripts/previa-novas-telas-onda2/dadosConquistas.js";

const backend: any = { rpc: vi.fn() };
let boot: any;
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "u1" } }) }));
vi.mock("../novo/ds/medalhas-pacote/index.js", async (orig) => {
  const real: any = await orig();
  // no teste o glob do Vite fica vazio (flag desligada no build); simula as URLs para ver a arte quando forçada
  const nomes = fs.readdirSync(path.resolve(__dirname, "../novo/ds/medalhas-pacote")).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, ""));
  return { ...real, carregarArtesDoPacote: async () => Object.fromEntries(nomes.map((n) => [n, `/arte/${n}.svg`])) };
});

import { progressoDaMedalha, criterioDa } from "../novo/app/play/progressoMedalha.js";
import { arteDaLiga, arteDaMedalha, MEDALHAS_COM_ARTE } from "../novo/ds/medalhas-pacote/index.js";
import { medalhasArtePacote } from "../novo/app/features.js";
import { AchievementsScreen, ordenarMedalhas } from "../novo/app/play/AchievementsScreen.jsx";
import { MedalhasPadrao } from "../novo/app/play/MedalhasPadrao.jsx";

const PASTA = path.resolve(__dirname, "../novo/ds/medalhas-pacote");
const RESUMO = { questions: 23, accuracy: 55, streak: { longest: 2 }, evolution_pts: null };
const item = (slug: string, extra: any = {}) => ({ ...conquistas().items.find((i: any) => i.slug === slug), ...extra });
let rpcImpl: Record<string, (a: any) => any>;

function largura(narrow: boolean, mid: boolean) {
  window.matchMedia = ((q: string) => ({ matches: q.includes("719") ? narrow : q.includes("1179") ? mid : false, addEventListener() {}, removeEventListener() {} })) as any;
}

beforeEach(() => {
  boot = { play: { enabled: true, flags: { coins: true }, names: { coins: "Stazia Coins" } } };
  rpcImpl = {
    app_gamification_achievements: () => conquistas(),
    app_gamification_summary: () => RESUMO,
    app_league_current: () => ({ enabled: true, joined: false, leagues: LIGAS }),
    app_gamification_rewards: () => ({ enabled: true, coins: 0, freezes: 0, freeze_max: 3, catalog: [] }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, a: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc não simulada: ${fn}`);
    return rpcImpl[fn](a);
  });
  largura(false, false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("progresso real das medalhas bloqueadas", () => {
  it("questões, acerto, sequência e evolução com os números do resumo", () => {
    expect(progressoDaMedalha(item("aquecendo_motores"), RESUMO)).toEqual({ pct: 23, texto: "23 de 100 questões" });
    expect(progressoDaMedalha(item("mira_boa"), RESUMO)?.texto).toBe("23 de 50 questões · acerto 55% (meta 80%)");
    expect(progressoDaMedalha(item("mira_boa"), { ...RESUMO, questions: 60 })).toEqual({ pct: 68, texto: "Acerto 55% de 80% · 60 questões" });
    expect(progressoDaMedalha(item("streak_7"), RESUMO)?.texto).toBe("Maior sequência: 2 de 7 dias");
    expect(progressoDaMedalha(item("virada_de_jogo"), RESUMO)).toBeNull(); // sem evolução medida
    expect(progressoDaMedalha(item("virada_de_jogo"), { ...RESUMO, evolution_pts: 4 })?.texto).toBe("Evolução atual: +4 de +10 pontos");
  });
  it("número já batido e medalha trancada: avisa que libera na próxima atividade", () => {
    expect(progressoDaMedalha(item("primeiros_passos"), RESUMO)).toEqual({ pct: 100, texto: "10 de 10 questões · libera na próxima atividade" });
  });
  it("sem número confiável não há barra: áreas, secretas, desbloqueadas, descrição editada pela equipe, sem resumo", () => {
    expect(progressoDaMedalha(item("pediatria_interno"), RESUMO)).toBeNull();
    expect(progressoDaMedalha(item("corujao"), RESUMO)).toBeNull();
    expect(progressoDaMedalha(item("insano", { unlocked_at: "2026-10-01" }), RESUMO)).toBeNull();
    expect(criterioDa(item("insano", { description: "Outra regra." }))).toBeNull();
    expect(progressoDaMedalha(item("insano"), null)).toBeNull();
    // se o banco passar a mandar o critério, ele vale (mesmo com descrição editada)
    expect(progressoDaMedalha(item("insano", { description: "x", criteria: { type: "questions_total", n: 50 } }), RESUMO)?.texto).toBe("23 de 50 questões");
  });
});

describe("arte do pacote (41 medalhas + 7 ligas)", () => {
  it("toda medalha e liga semeada no banco tem arquivo, e nada além disso", () => {
    const itens = conquistas().items;
    expect(itens).toHaveLength(41);
    const nomes = itens.map((i: any) => arteDaMedalha(i));
    expect(nomes.every(Boolean)).toBe(true);
    expect(MEDALHAS_COM_ARTE.size).toBe(37);
    for (const n of [...nomes, ...LIGAS.map((l) => arteDaLiga(l.slug)), "moeda"]) expect(fs.existsSync(path.join(PASTA, `${n}.svg`))).toBe(true);
    expect(fs.readdirSync(PASTA).filter((f) => f.endsWith(".svg"))).toHaveLength(49); // 41 + 7 + moeda
    expect(arteDaMedalha({ slug: "medalha_nova", secret: false })).toBeNull();
    expect(arteDaMedalha({ slug: "secreta_nova", secret: true, rarity: "lendaria" })).toBe("secreta-epica-1");
    expect(arteDaLiga("safira")).toBeNull();
  });
  it("os SVG são estáticos (sem script, evento ou endereço externo)", () => {
    for (const f of fs.readdirSync(PASTA).filter((x) => x.endsWith(".svg"))) {
      const s = fs.readFileSync(path.join(PASTA, f), "utf8");
      expect(s).not.toMatch(/<script|\son[a-z]+=|https?:\/\/(?!www\.w3\.org)|<foreignObject|<image/i);
    }
  });
  it("o app carrega artes.js só sob demanda (import dinâmico em medalhas-pacote/index.js); nenhuma tela importa direto", () => {
    const quem: string[] = [];
    const varrer = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) { if (f.name !== "__tests__") varrer(p); }
        else if (/\.(jsx?|tsx?)$/.test(f.name) && /medalhas-pacote\/artes(\.js)?["']|from "\.\/artes\.js"|import\("\.\/artes/.test(fs.readFileSync(p, "utf8"))) quem.push(p);
      }
    };
    varrer(path.resolve(__dirname, ".."));
    expect(quem.map((q) => path.relative(path.resolve(__dirname, ".."), q))).toEqual([path.join("novo", "ds", "medalhas-pacote", "index.js")]);
    expect(fs.readFileSync(path.resolve(__dirname, "../../scripts/previa-novas-telas-onda2/main.jsx"), "utf8")).toContain("medalhas-pacote/artes.js");
  });
  it("flag ligada por padrão; desliga só com VITE_MEDALHAS_ARTE_PACOTE=0", () => {
    expect(medalhasArtePacote()).toBe(true);
    vi.stubEnv("VITE_MEDALHAS_ARTE_PACOTE", "0");
    expect(medalhasArtePacote()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("tela Conquistas", () => {
  it("computador: ordem do pacote, critério e progresso reais, sem arte (arte desligada), secretas sem critério", async () => {
    const { container } = render(<AchievementsScreen arte={false} />);
    expect(await screen.findByText("Primeiros Passos")).toBeTruthy();
    expect(screen.getByText(/de/, { selector: ".cq-summary__title" }).textContent).toBe("0 de 41 medalhas");
    const nomes = [...container.querySelectorAll(".cq-card .cq-name")].map((n) => n.textContent);
    expect(nomes[0]).toBe("Primeiros Passos"); // o banco manda Áreas primeiro (ordem do texto); a tela segue o pacote
    expect(nomes.slice(-4)).toEqual(Array(4).fill("Conquista secreta"));
    expect(await screen.findByText("23 de 100 questões")).toBeTruthy();
    expect(screen.getAllByText("Continue estudando para descobrir.")).toHaveLength(4);
    expect(screen.queryByText(/Corujão|madrugada/)).toBeNull();
    expect(container.querySelector("img.cq-medal__art")).toBeNull();
    expect(container.querySelectorAll(".cq-medal__pin")).toHaveLength(41);
    fireEvent.click(screen.getByRole("tab", { name: "Áreas" }));
    expect(container.querySelectorAll(".cq-card")).toHaveLength(20);
    fireEvent.click(screen.getByRole("tab", { name: "Secretas" }));
    expect(container.querySelectorAll(".cq-card")).toHaveLength(4);
    fireEvent.click(screen.getByRole("tab", { name: "Todas" }));
    fireEvent.click(screen.getByRole("button", { name: "Insano, bloqueada" }));
    const dialog = await screen.findByRole("dialog", { name: "Insano" });
    expect(within(dialog).getByText("23 de 5.000 questões")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("arte forçada (prévia): SVG do pacote por slug, secreta com a medalha genérica", async () => {
    const { container } = render(<AchievementsScreen arte />);
    await screen.findByText("Primeiros Passos");
    await vi.waitFor(() => expect(container.querySelectorAll("img.cq-medal__art")).toHaveLength(41));
    const srcs = [...container.querySelectorAll("img.cq-medal__art")].map((i) => i.getAttribute("src"));
    expect(srcs[0]).toBe("/arte/primeiros_passos.svg");
    expect(srcs.filter((s) => s?.includes("secreta-"))).toHaveLength(4);
  });

  it("arte ligada por padrão no app, nunca menor que 64 px (celular pede 46)", async () => {
    largura(true, true);
    const { container } = render(<AchievementsScreen />);
    await screen.findAllByText("Primeiros Passos");
    await vi.waitFor(() => expect(container.querySelectorAll("img.cq-medal__art").length).toBeGreaterThan(0));
    for (const img of container.querySelectorAll("img.cq-medal__art")) expect(Number(img.getAttribute("width"))).toBeGreaterThanOrEqual(64);
  });

  it("tablet: detalhe da selecionada + grade de miniaturas", async () => {
    largura(false, true);
    const { container } = render(<AchievementsScreen />);
    await screen.findAllByText("Primeiros Passos");
    expect(container.querySelectorAll(".cq-tile")).toHaveLength(41);
    fireEvent.click(screen.getByRole("button", { name: "Mira Boa, bloqueada" }));
    expect(within(container.querySelector(".cq-detail") as HTMLElement).getByText("80% de acerto em pelo menos 50 questões.")).toBeTruthy();
  });

  it("celular: 12 primeiras e 'Ver todas as 41 medalhas'", async () => {
    largura(true, true);
    const { container } = render(<AchievementsScreen />);
    await screen.findAllByText("Primeiros Passos");
    expect(container.querySelectorAll(".cq-tile")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Ver todas as 41 medalhas" }));
    expect(container.querySelectorAll(".cq-tile")).toHaveLength(41);
    expect(screen.getByRole("button", { name: "Mostrar menos" })).toBeTruthy();
  });

  it("Recompensas sem itens: estado vazio do pacote; moedas desligadas escondem a aba; Arena desligada avisa", async () => {
    render(<AchievementsScreen aba="loja" />);
    expect(await screen.findByText("Nenhuma recompensa ainda")).toBeTruthy();
    cleanup();
    boot.play.flags.coins = false;
    render(<AchievementsScreen />);
    await screen.findByText("Primeiros Passos");
    expect(screen.queryByRole("tab", { name: /Recompensas/ })).toBeNull();
    cleanup();
    boot.play.enabled = false;
    render(<AchievementsScreen />);
    expect(screen.getByText(/Stazia Arena, que está desligada/)).toBeTruthy();
  });

  it("ordenarMedalhas mantém a ordem do banco dentro da categoria (desbloqueadas antes)", () => {
    const l = ordenarMedalhas([
      { slug: "a", category: "areas" },
      { slug: "s", category: "especiais", secret: true },
      { slug: "e2", category: "estudo", unlocked_at: "x" },
      { slug: "e1", category: "estudo" },
    ]);
    expect(l.map((i: any) => i.slug)).toEqual(["e2", "e1", "a", "s"]);
  });
});

describe("folha Medalhas e ligas (só prévia)", () => {
  it("ligas e medalhas do banco por categoria", async () => {
    render(<MedalhasPadrao />);
    expect(await screen.findByText("Revalida Master")).toBeTruthy();
    expect(screen.getByText(/41 medalhas e 7 ligas/)).toBeTruthy();
    for (const t of ["Estudo", "Precisão", "Sequência", "Áreas", "Evolução", "Especiais", "Secretas"]) expect(screen.getByRole("heading", { name: new RegExp(`^${t}`) })).toBeTruthy();
  });
});
