/**
 * 2ª fase · celular e acessibilidade (19/10/2026). Etapa de tela, sem regra de negócio nem banco:
 *  - alvo de toque de 44 px nas telas da 2ª fase (só com dedo ou tela estreita; escopo pelo <main data-fase="2">);
 *  - sala: rodapé do ator em duas linhas no celular (o rótulo "Cronômetro" sai, o botão do tempo segue com nome para o leitor de
 *    tela), roteiro do ator empilhado, tabela do resultado legível (antes: uma palavra por linha), foco visível nos filtros e notas
 *    da conferência;
 *  - contraste: cartão "Continue sua estação" no modo noite e dica do baralho no modo noite;
 *  - Banco de estações: barra de filtros solta no celular; treino sozinho acima da área segura do iPhone.
 * Servidor simulado (helpers/duplaSala). Pessoas e estação de TESTE.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NOW, STATION, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true, equipe: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => undefined, installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";
import { ActorScript } from "../novo/app/dupla/room/parts.jsx";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TOKENS = ["base", "colors", "dupla", "effects", "fonts", "semantic", "spacing", "typography"].map((n) => read(`src/novo/ds/tokens/${n}.css`)).join("\n");
const definido = (v: string) => new RegExp(`${v.replace(/[-]/g, "\\-")}\\s*:`).test(TOKENS);

let srv: Srv;
async function mount() {
  const view = render(<RoomScreen roomId="r1" go={vi.fn()} />);
  await advance(0);
  await advance(0);
  await advance(0);
  return view;
}
const review = { requested_at: null, reason: null, revised_at: null, score_before_review: null };
const resultado = (viewer: "candidate" | "evaluator") => ({
  round: 1, viewer, station: STATION, score: 2.5, max_score: 5, pct: 50, previous_pct: null,
  items: [
    { id: "i1", order: 1, content: "Apresenta-se ao paciente e pergunta o nome (item de teste)", max_points: 2.5, grade: "correct", points: 2.5 },
    { id: "i2", order: 2, content: "Explica a conduta (item de teste)", max_points: 2.5, grade: "incorrect", points: 0 },
  ],
  evaluator: { user_id: "u-ana", public_name: "Ana Souza" }, candidate: { user_id: "u-bruno", public_name: "Bruno Lima" },
  finished_at: NOW, used_ms: 452000, feedback: { pos: "", neg: "", gen: "Boa escuta." }, review,
});

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  srv = { room: baseRoom({ phase: "setup", station_ready: true, porta: 1 }), content: contentOf("evaluator"), marks: [], result: null, steps: {} };
  serve(rpc, srv);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toque de 44 px nas telas da 2ª fase", () => {
  const toque = read("src/novo/app/fase2/toque.css");

  it("a casca marca a fase no <main> e o App carrega o CSS de toque", () => {
    expect(read("src/novo/app/Shell.jsx")).toMatch(/<main id="conteudo" tabIndex=\{-1\} data-fase=\{phase\}/);
    expect(read("src/novo/app/App.jsx")).toMatch(/import "\.\/fase2\/toque\.css";/);
  });

  it("vale só com dedo ou tela estreita, só na 2ª fase (casca, treino sozinho e janelas abertas sobre eles), e leva os controles a 44 px", () => {
    expect(toque).toMatch(/@media \(pointer: coarse\), \(max-width: 640px\)/);
    const semEscopo = toque
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/[{}]/)
      .filter((_, i) => i % 2 === 1) // seletores dentro do @media
      .flatMap((sel) => sel.split(","))
      .map((s) => s.trim())
      .filter((s) => s && !/^(#conteudo\[data-fase="2"\]|\.f2-player|body:has\(#conteudo\[data-fase="2"\])/.test(s) && !s.startsWith("--") && !/^(min-|height|justify|align)/.test(s));
    expect(semEscopo).toEqual([]);
    expect(toque).toMatch(/--control-sm: 44px;/);
    expect(toque).toMatch(/\.f2-player,\s*body:has\(#conteudo\[data-fase="2"\], \.f2-player\) \.sm-dialog-overlay \{\s*--control-sm: 44px;/);
    for (const cls of [".sm-seg__opt", ".sm-chip", ".dst__tab", ".dupla-time__btn", ".f2-pep-radio", ".f2-toque", ".osce-print__toggle", ".f2-toque-q"]) {
      expect(toque, cls).toContain(cls);
    }
    expect(toque).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it("os botões desenhados à mão levam a classe de toque (voltar do perfil, chips de área, Ver todas, X da dica, som do match, lista de estações, notas e filtro da conferência)", () => {
    expect(read("src/novo/app/dupla/StudyProfileScreen.jsx").match(/className="f2-toque"/g)?.length).toBe(2);
    expect(read("src/novo/app/fase2/Fase2Home.jsx")).toMatch(/<Button variant="link" className="f2-toque"/);
    expect(read("src/novo/app/dupla/PracticeScreen.jsx")).toMatch(/className="f2-toque-q" aria-label="Fechar dica"/);
    const match = read("src/novo/app/dupla/MatchModal.jsx");
    expect(match).toMatch(/className="f2-toque-q"\s+onClick=\{toggleSound\}/);
    expect(match).toMatch(/className="f2-toque"\s+onClick=\{handleClose\}/);
    expect(read("src/novo/app/dupla/room/StationPicker.jsx")).toMatch(/className="f2-toque"/);
    expect(read("src/novo/app/dupla/room/CandidateSheet.jsx")).toMatch(/className="f2-toque"\s+aria-expanded=\{open\}/);
    expect(read("src/novo/app/dupla/room/ReviewPhase.jsx").match(/className="f2-toque dupla-foco"/g)?.length).toBe(2);
  });
});

describe("Sala no celular", () => {
  const sala = read("src/novo/app/dupla/room/sala.css");

  it("rodapé do ator: 'Cronômetro' só como texto escondível; o botão do tempo tem nome; Iniciar é o último botão (estica no celular)", async () => {
    await mount();
    const foot = screen.getByRole("region", { name: "Controles da estação" });
    const rotulo = within(foot).getByText("Cronômetro");
    expect(rotulo.className).toBe("dupla-time__text");
    expect(within(foot).getByRole("button", { name: "Ajustar tempo, 10:00" })).toBeTruthy();
    const botoes = Array.from(foot.children).filter((n) => n.tagName === "BUTTON");
    expect(botoes.at(-1)?.textContent).toContain("Iniciar estação");
    expect(sala).toMatch(/@media \(max-width:900px\)\{\s*\.dupla-time__text\{display:none\}/);
    expect(sala).toMatch(/\.dupla-foot > \.sm-btn:last-child\{flex:1 1 auto\}/);
    // o rodapé continua respeitando a área segura em todas as regras dele
    for (const r of sala.match(/\.dupla-foot\{[^}]*\}/g) ?? []) expect(r).toContain("env(safe-area-inset-bottom, 0px)");
  });

  it("roteiro do ator: lista com a classe que empilha rótulo e texto no celular", () => {
    const { container } = render(<ActorScript script={[["Dados pessoais", "Marcelo, 30 anos (teste)"]]} fallback="" />);
    const dl = container.querySelector("dl")!;
    expect(dl.className).toBe("dupla-roteiro");
    expect(dl.getAttribute("style")).toBeNull();
    expect(sala).toMatch(/\.dupla-roteiro\{margin:0;display:grid;grid-template-columns:minmax\(96px,120px\) 1fr/);
    expect(sala).toMatch(/@media \(max-width:600px\)\{\s*\.dupla-roteiro\{grid-template-columns:minmax\(0,1fr\)/);
  });

  it("resultado: linhas da tabela com a classe de três colunas que vira duas linhas no celular (critério em cima)", async () => {
    srv.room = asCandidate(baseRoom({ phase: "result", finished_at: NOW }));
    srv.content = contentOf("candidate");
    srv.result = resultado("candidate");
    await mount();
    const tabela = screen.getByRole("table", { name: "Critérios do PEP" });
    const linhas = within(tabela).getAllByRole("row");
    expect(linhas.length).toBe(3); // cabeçalho + 2 critérios
    for (const l of linhas) {
      expect(l.className).toBe("dupla-res__row");
      expect((l as HTMLElement).style.gridTemplateColumns).toBe("");
    }
    expect(sala).toMatch(/\.dupla-res__row\{display:grid;grid-template-columns:minmax\(0,1fr\) 120px 96px;gap:12px\}/);
    expect(sala).toMatch(/\.dupla-res__row > :first-child\{grid-column:1 \/ -1\}/);
  });

  it("conferência: notas e filtro com foco visível (a sombra escrita no botão apagava o anel)", async () => {
    srv.room = baseRoom({ phase: "review", finished_at: NOW });
    await mount();
    const filtro = screen.getByRole("radiogroup", { name: "Filtro" });
    for (const b of within(filtro).getAllByRole("radio")) expect(b.className).toContain("dupla-foco");
    const nota = screen.getAllByRole("radio").find((b) => /ponto/.test(b.getAttribute("aria-label") ?? ""));
    expect(nota?.className).toContain("dupla-foco");
    expect(sala).toMatch(/\.dupla-foco:focus-visible\{outline:none;box-shadow:var\(--focus-ring\)!important\}/);
  });
});

describe("Contraste e celular nas outras telas", () => {
  it("Início da 2ª fase: o cartão azul-marinho usa texto claro fixo (no modo noite o título sumia: 1,1:1)", () => {
    const css = read("src/novo/app/fase2/fase2.css");
    const bloco = (sel: string) => css.match(new RegExp(`\\${sel} \\{[^}]*\\}`))?.[0] ?? "";
    expect(bloco(".f2-hero-card")).toMatch(/background: var\(--navy-900\);\s*color: var\(--gray-0\);/);
    expect(bloco(".f2-hero-title")).toMatch(/color: var\(--gray-0\);/);
    expect(bloco(".f2-hero-overline")).toMatch(/color: var\(--violet-50\);/);
    expect(read("src/novo/app/fase2/Fase2Home.jsx")).not.toMatch(/text-inverse/);
    for (const v of ["--navy-900", "--gray-0", "--violet-50"]) expect(definido(v), v).toBe(true);
  });

  it("dica do baralho e selo de matches: fundo azul-marinho/azul fixo com texto claro (no modo noite a superfície inversa fica branca)", () => {
    const src = read("src/novo/app/dupla/PracticeScreen.jsx");
    expect(src).not.toMatch(/surface-inverse/);
    expect(src).toMatch(/background: "var\(--navy-900\)", color: "var\(--gray-0\)"/);
    expect(src).toMatch(/color: matches \? "var\(--gray-0\)"/);
  });

  it("Banco de estações: no celular a barra de busca e filtros não gruda no topo; letras de 12 px no mínimo", () => {
    const src = read("src/novo/app/dupla/StationsScreen.jsx");
    expect(src).toMatch(/@media \(max-width:640px\)\{[\s\S]*?\.dst__bar\{position:static\}/);
    expect(src).not.toMatch(/font:\d+ 1[01]px/);
    expect(read("src/novo/ds/components/osce/osce.css")).toMatch(/\.osce-station__k\{font:600 12px/);
  });

  it("treino sozinho: a barra de baixo e o fim do conteúdo ficam acima da área segura do iPhone", () => {
    const css = read("src/novo/app/fase2/fase2.css");
    expect(css).toMatch(/\.f2-player-toolbar \{[^}]*bottom: calc\(var\(--space-6\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(css.match(/140px \+ env\(safe-area-inset-bottom, 0px\)/g)?.length).toBe(2);
  });
});

describe("Casca comum às duas fases: área segura e toque", () => {
  const shell = read("src/novo/app/shell/shell.css");

  it("novo.html com viewport-fit=cover (o iPhone passa a informar a área segura)", () => {
    expect(read("novo.html")).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover" \/>/);
  });

  it("embaixo a barra de abas e o conteúdo já somam a área segura; nas laterais o conteúdo, o menu do tablet e as abas se afastam do recorte", () => {
    expect(shell).toMatch(/\.smn-tabs\{position:fixed;[^}]*height:calc\(var\(--smn-tabs-h\) \+ env\(safe-area-inset-bottom\)\);padding:8px 6px calc\(8px \+ env\(safe-area-inset-bottom\)\)/);
    expect(read("src/novo/app/Shell.jsx")).toMatch(/mobile: "24px 18px calc\(104px \+ env\(safe-area-inset-bottom\)\)"/);
    expect(shell).toContain(".smn{padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)}");
    expect(shell).toContain(".smn-rail{left:calc(12px + env(safe-area-inset-left,0px))}");
    expect(shell).toContain(".smn-side{left:calc(16px + env(safe-area-inset-left,0px))}");
    expect(shell).toContain(".smn-tabs{left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px)}");
    expect(read("src/novo/app/fase2/fase2.css")).toMatch(/\.f2-player \{[^}]*padding-left: env\(safe-area-inset-left, 0px\);\s*padding-right: env\(safe-area-inset-right, 0px\);/);
  });

  it("toque de 44 px: logotipo do menu do tablet; seletor de fase do celular (34 por dentro da borda + 5 + 5) e contador de dias (32 + 6 + 6) pela área estendida", () => {
    expect(shell).toContain(".smn-rail .smn-logo{min-width:44px;min-height:44px;align-items:center}");
    expect(shell).toMatch(/\.smn-mtop-phase\{position:relative;min-height:36px;height:36px;[^}]*\}\s*\.smn-mtop-phase::after\{content:"";position:absolute;inset:-5px 0\}/);
    expect(shell).toMatch(/\.smn-streak\{position:relative;[^}]*min-height:32px;[^}]*\}\s*\.smn-streak::after\{content:"";position:absolute;inset:-6px 0\}/);
  });
});

describe("Ativar som do apito (espera do candidato)", () => {
  class AudioFalso {
    state = "suspended";
    sampleRate = 44100;
    destination = {};
    createBuffer() { return {}; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() { this.state = "running"; return Promise.resolve(); }
  }
  const w = window as any;
  const esperando = () => {
    srv.room = { ...asCandidate(baseRoom({ phase: "setup" })), station: null, duration_ms: null, station_ready: true, porta: 1 };
    srv.content = { role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true } as any;
  };
  beforeEach(() => {
    delete w.__szAudio;
    w.AudioContext = AudioFalso;
    esperando();
  });
  afterEach(() => {
    delete w.__szAudio;
    delete w.AudioContext;
  });

  it("som bloqueado: aparece o botão com a dica ligada (aria-describedby); tocar destrava o áudio, o botão some e o status avisa", async () => {
    await mount();
    const botao = screen.getByRole("button", { name: "Ativar som do apito" });
    expect(botao.getAttribute("aria-describedby")).toBe("dupla-som-apito-dica");
    expect(document.getElementById("dupla-som-apito-dica")?.textContent).toMatch(/só toca o apito depois de um toque/);
    fireEvent.click(botao);
    await advance(100);
    expect(w.__szAudio?.state).toBe("running");
    expect(screen.queryByRole("button", { name: "Ativar som do apito" })).toBeNull();
    expect(screen.getByText("Som do apito ativado.").getAttribute("role")).toBe("status");
  });

  it("som já liberado (contexto rodando): não aparece", async () => {
    w.__szAudio = { state: "running" };
    await mount();
    expect(screen.queryByRole("button", { name: "Ativar som do apito" })).toBeNull();
  });

  it("som desligado neste aparelho (sz-sound = off): não aparece", async () => {
    window.localStorage.setItem("sz-sound", "off");
    await mount();
    expect(screen.queryByRole("button", { name: "Ativar som do apito" })).toBeNull();
  });

  it("aparelho sem áudio: não aparece", async () => {
    delete w.AudioContext;
    await mount();
    expect(screen.queryByRole("button", { name: "Ativar som do apito" })).toBeNull();
  });

  it("um toque em qualquer lugar da página que libere o som também tira o botão", async () => {
    await mount();
    expect(screen.getByRole("button", { name: "Ativar som do apito" })).toBeTruthy();
    w.__szAudio = { state: "running" }; // o que installAudioWake faz no primeiro toque
    fireEvent.pointerDown(document.body);
    await advance(100);
    expect(screen.queryByRole("button", { name: "Ativar som do apito" })).toBeNull();
  });

  it("o ator não vê o botão (só a espera do candidato)", async () => {
    srv.room = baseRoom({ phase: "setup", station_ready: true, porta: 1 });
    srv.content = contentOf("evaluator");
    await mount();
    expect(screen.queryByRole("button", { name: "Ativar som do apito" })).toBeNull();
  });
});
