/**
 * Comemorações do Stazi ligadas ao app (play/celebracoes): tradução do que o banco devolve em eventos do catálogo,
 * e as regras da Stazia Arena no provedor — não interromper a questão (segura até o fim da sessão), não repetir o que já foi
 * comemorado, liga só depois do fechamento confirmado, histórico acessível, preferências (sons, voz da Durona, animações
 * reduzidas), Fechar/Esc dispensam na hora, Arena desligada = nada.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import catalogo from "../motion-studio/celebracoes/catalogo.json";

const backend: any = { rpc: vi.fn() };
const boot: any = { play: { enabled: true, flags: { leagues: true } } };
const user = { id: "aluno-1" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user }) }));

import {
  IMEDIATOS,
  LIGA_DIAS_MAX,
  PROMOCAO_POR_LIGA,
  completarComResumo,
  eventoDaAula,
  eventoDoSimulado,
  eventoDosFlashcards,
  eventosDaLiga,
  eventosDaResposta,
  juntarLote,
  precisaResumo,
  serieDeAcertos,
  textoCompartilhar,
} from "../novo/app/play/celebracoes/eventos.js";
import { CelebracoesProvider, useCelebracoesApp, useSegurarCelebracoes } from "../novo/app/play/celebracoes/CelebracoesProvider.jsx";
import { CelebracoesPreferencias } from "../novo/app/play/celebracoes/CelebracoesPreferencias.jsx";
import { CHAVE_MUDO } from "../novo/app/play/celebracoes/memoria.js";
import { useTurnFeedback } from "../novo/app/play/PlayFeedback.jsx";

const HOJE = "2026-10-16";
const EVENTOS = new Map((catalogo as any).eventos.map((e: any) => [e.id, e]));
const LIGAS = [
  { slug: "bronze", name: "Bronze", position: 1 },
  { slug: "prata", name: "Prata", position: 2 },
  { slug: "ouro", name: "Ouro", position: 3 },
  { slug: "platina", name: "Platina", position: 4 },
  { slug: "diamante", name: "Diamante", position: 5 },
  { slug: "elite", name: "Elite", position: 6 },
  { slug: "revalida_master", name: "Revalida Master", position: 7 },
];
const MEDALHA = { slug: "primeiros_passos", name: "Primeiros Passos", description: "10 questões.", icon: "footprints", rarity: "comum", xp: 10, coins: 5 };
let rpcImpl: Record<string, (args: any) => any>;

beforeEach(() => {
  localStorage.clear();
  boot.play = { enabled: true, flags: { leagues: true } };
  rpcImpl = {
    app_gamification_preferences: () => ({ show_streak: true }),
    app_gamification_summary: () => ({ level: { slug: "explorador", name: "Explorador", description: "Você está explorando as grandes áreas." }, streak: { current: 7, longest: 12 } }),
    app_league_current: () => ({ enabled: true, joined: true, leagues: LIGAS, history: [] }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (!rpcImpl[fn]) throw new Error(`rpc não simulada: ${fn}`);
    return rpcImpl[fn](args);
  });
});
afterEach(cleanup);

describe("Do banco para o catálogo (funções puras)", () => {
  it("todo evento que o app manda existe no catálogo; os imediatos são exatamente os 'micro' que o app usa", () => {
    for (const id of [...IMEDIATOS, ...Object.values(PROMOCAO_POR_LIGA)]) expect(EVENTOS.has(id), id).toBe(true);
    for (const id of IMEDIATOS) expect((EVENTOS.get(id) as any).intensidade, id).toBe("micro");
    const micros = (catalogo as any).eventos.filter((e: any) => e.intensidade === "micro").map((e: any) => e.id);
    expect(new Set(micros)).toEqual(IMEDIATOS);
  });

  it("resposta: marco da sequência sem recorde inventado, nível com o código, medalha com o nome, missões e meta do dia", () => {
    const play = {
      xp: { total: 17, valid: true },
      streak_incremented: true,
      stats: { streak: 7 },
      level_up: { from: "iniciante", to: "explorador" },
      achievements_unlocked: [MEDALHA],
      bonus: [
        { type: "SESSION_10", xp: 15 },
        { type: "MISSION_COMPLETED", xp: 15, meta: { mission: "daily_correct", period: "daily" } },
        { type: "MISSION_COMPLETED", xp: 60, meta: { mission: "weekly_questions", period: "weekly" } },
        { type: "DAILY_MISSIONS_COMPLETED", xp: 50 },
        { type: "DAILY_GOAL_COMPLETED", xp: 25 },
      ],
    };
    const ev = eventosDaResposta(play, { acertou: true, hoje: HOJE });
    const ids = ev.map((e) => e.id);
    expect(ids).toEqual(["streak-7", "novo-nivel", "conquista-desbloqueada", "missao-cumprida", "missao-cumprida", "missao-cumprida", "meta-diaria", "questao-correta"]);
    expect(ev[0]).toMatchObject({ dados: { n: 7 }, chave: `sequencia:${HOJE}`, importante: true, rotulo: "Sequência de 7 dias" });
    expect(ev[0].dados).not.toHaveProperty("recorde");
    expect(ev[1]).toMatchObject({ dados: {}, nivelSlug: "explorador", chave: "nivel:explorador", importante: true });
    expect(ev[2]).toMatchObject({ dados: { xp: 10 }, complemento: "Primeiros Passos", chave: "conquista:primeiros_passos" });
    expect(ev[4].complemento).toBe("Missão da semana");
    expect(ev[5]).toMatchObject({ complemento: "Todas as missões de hoje", chave: `missoes-do-dia:${HOJE}` });
    expect(ev[6]).toMatchObject({ id: "meta-diaria", chave: `meta:${HOJE}` });
  });

  it("dia comum é faixa pequena; erro consola; anulada não comemora nem consola; sem bloco play (Arena desligada) nada", () => {
    expect(eventosDaResposta({ streak_incremented: true, stats: { streak: 12 } }, { acertou: false, hoje: HOJE }).map((e) => e.id)).toEqual(["streak-dia-comum", "erro-encorajador"]);
    expect(eventosDaResposta({ streak_incremented: false }, { acertou: null, anulada: true, hoje: HOJE })).toEqual([]);
    expect(eventosDaResposta({}, { acertou: false, anulada: true, hoje: HOJE })).toEqual([]);
    expect(eventosDaResposta(null, { acertou: true, hoje: HOJE })).toEqual([]);
    // sem o recorde anterior no bloco, "novo recorde" fica de fora (nunca todo dia)
    expect(eventosDaResposta({ streak_incremented: true, stats: { streak: 9 } }, { hoje: HOJE }).map((e) => e.id)).toEqual(["streak-dia-comum"]);
  });

  it("série de acertos: 5 seguidas comemora; anulada não conta nem quebra; erro zera", () => {
    let s = { seguidas: 0 } as any;
    for (let i = 0; i < 4; i += 1) s = serieDeAcertos(s.seguidas, { acertou: true, sessao: "s1" });
    expect(s.evento).toBeUndefined();
    s = serieDeAcertos(s.seguidas, { acertou: null, anulada: true, sessao: "s1" });
    expect(s.seguidas).toBe(4);
    s = serieDeAcertos(s.seguidas, { acertou: true, sessao: "s1" });
    expect(s.evento).toMatchObject({ id: "serie-acertos-5", dados: { n: 5 }, chave: "serie:s1:5" });
    expect(serieDeAcertos(5, { acertou: false, sessao: "s1" }).seguidas).toBe(0);
  });

  it("simulado: placar do banco vira a faixa certa; treino não comemora placar", () => {
    const sim = (correct: number, total: number) => eventoDoSimulado({ id: "s9", kind: "simulado", result: { correct, total, answered: total } });
    expect(sim(7, 10)).toMatchObject({ id: "simulado-alto", dados: { pct: 70, acertos: 7, total: 10 }, complemento: "7 de 10 questões certas", chave: "simulado:s9" });
    expect(sim(5, 10)?.id).toBe("simulado-medio");
    expect(sim(3, 10)?.id).toBe("simulado-baixo");
    expect(eventoDoSimulado({ id: "t1", kind: "treino", result: { correct: 9, total: 10 } })).toBeNull();
    expect(eventoDoSimulado({ id: "s0", kind: "simulado", result: { correct: 0, total: 0 } })).toBeNull();
  });

  it("aula e flashcards: uma vez por aula / por dia", () => {
    expect(eventoDaAula({ id: "a1", title: "Sepse" }, 30)).toMatchObject({ id: "aula-concluida", dados: { xp: 30 }, complemento: "Sepse", chave: "aula:a1" });
    expect(eventoDaAula({ id: "a1", title: "Sepse" }, null)?.dados).toEqual({});
    expect(eventoDosFlashcards(12, HOJE)).toMatchObject({ id: "flashcards-dia", dados: { total: 12 }, chave: `flashcards:${HOJE}` });
    expect(eventoDosFlashcards(0, HOJE)).toBeNull();
  });

  it("liga: só temporada fechada e recente; promoção para a liga de cima, pódio, 1º lugar, permanência e rebaixamento", () => {
    const liga = (h: any) => ({ enabled: true, leagues: LIGAS, history: [h] });
    const promo = eventosDaLiga(liga({ starts_on: "2026-10-05", league: "prata", position: 2, outcome: "promoted" }), { hoje: HOJE });
    expect(promo.map((e) => e.id)).toEqual(["liga-promocao-ouro", "liga-podio"]);
    expect(promo[0]).toMatchObject({ dados: { liga: "Ouro", nivel_liga: 3 }, complemento: "Você fechou a semana em 2º lugar", chave: "liga:2026-10-05:resultado" });
    expect(promo[1]).toMatchObject({ dados: { liga: "Prata", posicao: 2 }, chave: "liga:2026-10-05:podio" });
    expect(eventosDaLiga(liga({ starts_on: "2026-10-05", league: "elite", position: 1, outcome: "promoted" }), { hoje: HOJE }).map((e) => e.id)).toEqual(["liga-promocao-master", "liga-primeiro-lugar"]);
    expect(eventosDaLiga(liga({ starts_on: "2026-10-05", league: "ouro", position: 9, outcome: "stayed" }), { hoje: HOJE }).map((e) => e.id)).toEqual(["liga-permanencia"]);
    const desce = eventosDaLiga(liga({ starts_on: "2026-10-05", league: "ouro", position: 28, outcome: "relegated" }), { hoje: HOJE });
    expect(desce).toHaveLength(1);
    expect(desce[0]).toMatchObject({ id: "liga-rebaixamento", dados: { liga: "Prata" } });
    // fechamento antigo: já passou; sem temporada fechada: nada
    expect(eventosDaLiga(liga({ starts_on: "2026-09-21", league: "prata", position: 1, outcome: "promoted" }), { hoje: HOJE })).toEqual([]);
    expect(LIGA_DIAS_MAX).toBe(14);
    expect(eventosDaLiga({ enabled: true, leagues: LIGAS, history: [] }, { hoje: HOJE })).toEqual([]);
    expect(eventosDaLiga({ enabled: false }, { hoje: HOJE })).toEqual([]);
  });

  it("lote do fim da sessão: só a maior série, missões numa só (XP somado), sem chave repetida", () => {
    const lote = juntarLote([
      { id: "serie-acertos-5", dados: { n: 5 }, chave: "serie:s:5" },
      { id: "missao-cumprida", dados: { xp: 15 }, chave: "missao:a" },
      { id: "serie-acertos-10", dados: { n: 10 }, chave: "serie:s:10" },
      { id: "missao-cumprida", dados: { xp: 60 }, chave: "missao:b" },
      { id: "conquista-desbloqueada", dados: {}, chave: "conquista:x" },
      { id: "conquista-desbloqueada", dados: {}, chave: "conquista:x" },
    ]);
    expect(lote.map((e) => e.id)).toEqual(["conquista-desbloqueada", "missao-cumprida", "serie-acertos-10"]);
    expect(lote[1]).toMatchObject({ dados: { xp: 75 }, complemento: "2 missões cumpridas" });
  });

  it("resumo do banco completa o nível e a maior sequência (sem recalcular); compartilhar só nos marcos", () => {
    const lote = [{ id: "novo-nivel", dados: {}, nivelSlug: "explorador" }, { id: "streak-7", dados: { n: 7 } }];
    expect(precisaResumo(lote)).toBe(true);
    const pronto = completarComResumo(lote, { level: { slug: "explorador", name: "Explorador", description: "Explorando." }, streak: { longest: 12 } });
    expect(pronto[0]).toMatchObject({ dados: { nivel: "Explorador" }, complemento: "Explorando.", rotulo: "Novo nível: Explorador" });
    expect(pronto[1].dados).toEqual({ n: 7, recorde: 12 });
    expect(completarComResumo(lote, { level: { slug: "outro", name: "Outro" } })[0].dados).toEqual({});
    expect(textoCompartilhar({ id: "streak-30", dados: { n: 30 } })).toBe("Estou há 30 dias seguidos estudando para o Revalida no StaziaMed!");
    expect(textoCompartilhar({ id: "conquista-desbloqueada", dados: {}, complemento: "Primeiros Passos" })).toContain("Primeiros Passos");
    expect(textoCompartilhar({ id: "meta-diaria", dados: {} })).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ provedor + motor
function Painel({ segurar = null as null | "atividade" | "simulado" }) {
  const cel = useCelebracoesApp();
  const [aberto, setAberto] = React.useState(Boolean(segurar));
  useSegurarCelebracoes("sessao:t1", segurar ?? "atividade", aberto);
  return (
    <>
      <button type="button" onClick={() => cel.enviarResposta({ achievements_unlocked: [MEDALHA] }, { acertou: true })}>
        medalha
      </button>
      <button type="button" onClick={() => cel.enviarResposta({ xp: { total: 10, valid: true } }, { acertou: true })}>
        acerto
      </button>
      <button type="button" onClick={() => cel.enviar(eventoDoSimulado({ id: "s9", kind: "simulado", result: { correct: 8, total: 10 } }))}>
        simulado
      </button>
      <button type="button" onClick={() => setAberto(false)}>
        terminar
      </button>
      <button type="button" onClick={() => void cel.verificarLiga({ forcar: true })}>
        liga
      </button>
      <span data-testid="historico">{cel.historico.map((h: any) => h.rotulo).join(" | ")}</span>
    </>
  );
}
const montar = (ui: React.ReactElement) => render(<CelebracoesProvider ligaAoAbrir={false}>{ui}</CelebracoesProvider>);
const achar = (evento: string) => waitFor(() => {
  const el = document.querySelector(`[data-evento="${evento}"]`);
  expect(el, evento).toBeTruthy();
  return el as HTMLElement;
}, { timeout: 6000 });

describe("Provedor das comemorações no app", { timeout: 25000 }, () => {
  it("medalha fora de atividade: comemoração cheia com o nome da medalha, no histórico; Fechar dispensa na hora", async () => {
    montar(<Painel />);
    fireEvent.click(screen.getByText("medalha"));
    const cel = await achar("conquista-desbloqueada");
    expect(cel.getAttribute("data-intensidade")).toBe("media");
    expect(within(cel).getAllByText("Primeiros Passos").length).toBeGreaterThan(0);
    expect(screen.getByTestId("historico").textContent).toContain("Medalha desbloqueada: Primeiros Passos");
    fireEvent.click(within(cel).getByRole("button", { name: "Fechar comemoração" }));
    await waitFor(() => expect(document.querySelector('[data-evento="conquista-desbloqueada"]')).toBeNull());
  });

  it("durante o treino só passa a faixa do acerto; a medalha espera o fim da sessão", async () => {
    montar(<Painel segurar="atividade" />);
    fireEvent.click(screen.getByText("medalha"));
    const micro = await achar("questao-correta");
    expect(micro.getAttribute("data-intensidade")).toBe("micro");
    expect(document.querySelector('[data-evento="conquista-desbloqueada"]')).toBeNull();
    fireEvent.click(screen.getByText("terminar"));
    await achar("conquista-desbloqueada");
  });

  it("simulado: nada aparece durante; o placar sai no fim", async () => {
    montar(<Painel segurar="simulado" />);
    fireEvent.click(screen.getByText("acerto"));
    fireEvent.click(screen.getByText("simulado"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(document.querySelector("[data-evento]")).toBeNull();
    fireEvent.click(screen.getByText("terminar"));
    const sim = await achar("simulado-alto");
    expect(within(sim).getAllByText("8 de 10 questões certas").length).toBeGreaterThan(0);
  });

  it("o que já foi comemorado não volta como novo (mesma medalha duas vezes = uma comemoração)", async () => {
    function Duas() {
      const cel = useCelebracoesApp();
      const [r, setR] = React.useState("");
      return (
        <button type="button" onClick={() => setR(`${cel.enviarResposta({ achievements_unlocked: [MEDALHA] }).length}-${cel.enviarResposta({ achievements_unlocked: [MEDALHA] }).length}`)}>
          duas {r}
        </button>
      );
    }
    montar(<Duas />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("duas 1-0");
    await achar("conquista-desbloqueada");
  });

  it("liga: comemora o fechamento confirmado uma vez só; temporada antiga não", async () => {
    rpcImpl.app_league_current = () => ({ enabled: true, joined: true, leagues: LIGAS, history: [{ starts_on: "2026-10-05", league: "prata", position: 4, outcome: "promoted" }] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 16, 10, 0, 0));
    try {
      montar(<Painel />);
      fireEvent.click(screen.getByText("liga"));
      const cel = await achar("liga-promocao-ouro");
      expect(within(cel).getAllByText("Você fechou a semana em 4º lugar").length).toBeGreaterThan(0);
      expect(screen.getByTestId("historico").textContent).toContain("Você subiu para a Liga Ouro");
      fireEvent.click(within(cel).getByRole("button", { name: "Fechar comemoração" }));
      fireEvent.click(screen.getByText("liga"));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });
      expect(document.querySelector("[data-evento]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Esc fecha; voz da Durona ligada por padrão e desligável; animações reduzidas encolhem a comemoração", async () => {
    const { unmount } = montar(<Painel />);
    fireEvent.click(screen.getByText("medalha"));
    let cel = await achar("conquista-desbloqueada");
    expect(cel.getAttribute("data-fala")).toBe("Tá bom, essa eu aplaudo.");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-evento]")).toBeNull());
    unmount();
    localStorage.clear();
    localStorage.setItem("stazia-celebracoes-preferencias-v1", JSON.stringify({ voz: false, reduzidas: true }));
    montar(<Painel />);
    fireEvent.click(screen.getByText("medalha"));
    cel = await achar("conquista-desbloqueada");
    expect(cel.getAttribute("data-fala")).toBe("");
    expect(cel.getAttribute("data-intensidade")).toBe("pequena");
  });

  it("Arena desligada: nenhuma comemoração (nem baixa a parte pesada)", async () => {
    boot.play = { enabled: false };
    montar(<Painel />);
    fireEvent.click(screen.getByText("medalha"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByTestId("celebracao-app")).toBeNull();
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it("useTurnFeedback (resposta do treino) entrega ao provedor: nível com o nome real do banco, a medalha depois", async () => {
    function Resposta() {
      const f = useTurnFeedback();
      return (
        <button type="button" onClick={() => f.push({ level_up: { from: "iniciante", to: "explorador" }, achievements_unlocked: [MEDALHA] }, { acertou: true })}>
          responder
        </button>
      );
    }
    montar(<Resposta />);
    fireEvent.click(screen.getByText("responder"));
    const nivel = await achar("novo-nivel");
    expect(nivel.getAttribute("data-intensidade")).toBe("grande");
    expect(within(nivel).getByText("Agora você é Explorador")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_gamification_summary");
    fireEvent.click(within(nivel).getByRole("button", { name: "Fechar comemoração" }));
    await achar("conquista-desbloqueada");
  });
});

describe("Conta → Comemorações e sons", () => {
  it("três escolhas guardadas no aparelho; o som é o mesmo mudo do botão dentro da comemoração; histórico visível", () => {
    localStorage.setItem("stazia-celebracoes-historico-v1:aluno-1", JSON.stringify([{ chave: "conquista:x", id: "conquista-desbloqueada", rotulo: "Medalha desbloqueada: Primeiros Passos", complemento: "Primeiros Passos", quando: Date.parse("2026-10-16T13:00:00Z") }]));
    montar(<CelebracoesPreferencias />);
    const sons = screen.getByRole("switch", { name: /Sons/ }) as HTMLInputElement;
    const voz = screen.getByRole("switch", { name: /Voz da Durona/ }) as HTMLInputElement;
    const reduzidas = screen.getByRole("switch", { name: /Animações reduzidas/ }) as HTMLInputElement;
    expect([sons.checked, voz.checked, reduzidas.checked]).toEqual([true, true, false]);
    fireEvent.click(sons);
    expect(localStorage.getItem(CHAVE_MUDO)).toBe("1");
    fireEvent.click(voz);
    fireEvent.click(reduzidas);
    expect(JSON.parse(localStorage.getItem("stazia-celebracoes-preferencias-v1") ?? "{}")).toEqual({ voz: false, reduzidas: true });
    expect(screen.getByText("Medalha desbloqueada: Primeiros Passos")).toBeTruthy();
  });
});
