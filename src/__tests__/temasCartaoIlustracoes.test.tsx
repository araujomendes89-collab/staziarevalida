/**
 * Cartão dos Temas Essenciais no padrão de 15/10/2026 (docs/temas-card.md) e o sistema de ilustrações em vidro.
 * jsdom com o banco simulado (formas de app_grandes_temas, app_temas_com_aula, app_tema_aula e app_lesson_notes).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
const tutor: any[] = [];
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({
  TutorButton: ({ request, label, icon, className }: any) => (
    <button type="button" data-icon={icon} className={className} onClick={() => tutor.push(request)}>
      {label}
    </button>
  ),
}));

import { ThemesScreen } from "../novo/app/study/ThemesScreen.jsx";
import { IlustracaoTema } from "../novo/app/study/ilustracoes/IlustracaoTema.jsx";
import { DESENHOS } from "../novo/app/study/ilustracoes/motivos.jsx";
import { MAPA_TEMAS, MOTIVOS, motivoDesenhado, motivosQueFaltam } from "../novo/app/study/ilustracoes/mapa.js";
import { TemaCartao } from "../novo/app/study/TemaCartao.jsx";

const T = (id: string, order: number, title: string, area: string, area_name: string, subarea: string, status: string, total: number, provas: number) => ({
  id, order, title, area, area_name, subarea, status, total,
  by_exam: Object.fromEntries(Array.from({ length: provas }, (_, i) => [`prova-${i}`, 1])),
});
const DATA = {
  method: "Seleção pedagógica.", official_total: 10, annulled: 0, linked: 5, unlinked: 5,
  areas: [
    { id: "cm", name: "Clínica Médica", themes: 3, questions: 31 },
    { id: "cir", name: "Cirurgia Geral", themes: 1, questions: 12 },
    { id: "sm", name: "Saúde Mental", themes: 1, questions: 4 },
  ],
  themes: [
    T("GR-001", 1, "Tuberculose pulmonar", "cm", "Clínica Médica", "Infectologia", "aula_pronta_aguardando_revisao", 17, 10),
    T("GR-002", 2, "Diabetes mellitus tipo 2", "cm", "Clínica Médica", "Endocrinologia", "roteiro_em_validacao", 0, 0),
    T("GR-014", 14, "Acidente vascular cerebral agudo", "cm", "Clínica Médica", "Neurologia", "roteiro_em_validacao", 14, 7),
    T("GR-027", 27, "Apendicite aguda", "cir", "Cirurgia Geral", "Abdome agudo", "roteiro_em_validacao", 12, 9),
    T("GR-097", 97, "Psicoses e esquizofrenia", "sm", "Saúde Mental", "Psiquiatria / Psicoses", "roteiro_em_validacao", 4, 3),
  ],
};
const AULA = {
  lesson_id: "11111111-1111-4111-8111-111111111111", titulo: "Tuberculose pulmonar: da tosse ao controle", tema: "Tuberculose pulmonar", area: "cm", area_nome: "Clínica Médica",
  subarea: "Infectologia", cabecalho: "Material StaziaMed", atualizado_em: "2026-10-14T12:00:00Z", pontos_chave: [],
  secoes: Array.from({ length: 10 }, (_, i) => ({ titulo: `Bloco ${i + 1} · Seção`, paragrafos: ["Texto."] })), tabelas: [], midias: [],
  questoes: { itens: [] }, flashcards: { cartoes: [] },
};

let go: any;
let notas: any;
beforeEach(() => {
  go = vi.fn();
  tutor.length = 0;
  notas = { notas: {}, checks: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`sec-${i + 1}`, true])) };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_grandes_temas") return DATA;
    if (fn === "app_temas_com_aula") return ["GR-001", "GR-027"];
    if (fn === "app_tema_aula") return AULA;
    if (fn === "app_lesson_notes") {
      if (notas instanceof Error) throw notas;
      return notas;
    }
    if (fn === "app_start_session") return { session_id: "sess-1" };
    if (fn === "app_lesson_checks_save" || fn === "app_lesson_section_note_save") return { ok: true };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  window.scrollTo = vi.fn() as any;
});
afterEach(cleanup);
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const cartao = async (titulo: string) => (await screen.findByRole("heading", { name: titulo, level: 3 })).closest(".gt-card") as HTMLElement;
const comAulaCarregada = async () => {
  render(<ThemesScreen go={go} />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /Abrir a aula/ })).toHaveLength(2));
};

describe("cartão do tema: selo, pílula e título", () => {
  it("'Aula disponível' só no tema com aula publicada; os outros mantêm a situação do roteiro", async () => {
    await comAulaCarregada();
    const tb = await cartao("Tuberculose pulmonar");
    expect(within(tb).getByText("Aula disponível")).toBeTruthy();
    expect(within(tb).queryByText("Aula pronta, aguardando revisão médica")).toBeNull();
    const avc = await cartao("Acidente vascular cerebral agudo");
    expect(within(avc).getByText("Roteiro em validação")).toBeTruthy();
    expect(within(avc).queryByText("Aula disponível")).toBeNull();
    expect(screen.getAllByText("Aula disponível")).toHaveLength(2);
  });

  it("sem aula publicada, o tema 1 volta ao selo 'Aula pronta, aguardando revisão médica'", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_grandes_temas" ? DATA : []));
    render(<ThemesScreen go={go} />);
    const tb = await cartao("Tuberculose pulmonar");
    expect(within(tb).getByText("Aula pronta, aguardando revisão médica")).toBeTruthy();
  });

  it("título grande, 'Tema N · subárea' e nenhum código GR na tela", async () => {
    await comAulaCarregada();
    const tb = await cartao("Tuberculose pulmonar");
    expect(within(tb).getByText("Tema 1 · Infectologia")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GR-\d{3}/);
  });

  it("a pílula 'N questões · N provas' tem seta e abre o treino do tema (mesmo filtro de antes)", async () => {
    await comAulaCarregada();
    const tb = await cartao("Tuberculose pulmonar");
    const pilula = within(tb).getByRole("button", { name: /17 questões · 10 provas/ });
    expect(pilula.textContent).toBe("17 questões · 10 provas");
    fireEvent.click(pilula);
    await waitFor(() => expect(calls("app_start_session")).toHaveLength(1));
    expect(calls("app_start_session")[0][1]).toEqual({ p_kind: "questoes", p_filters: { grande_tema: "GR-001" }, p_count: 20 });
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "sess-1" }));
  });

  it("tema sem questão: pílula '0 questões' sem clique e sem treino", async () => {
    await comAulaCarregada();
    const dm = await cartao("Diabetes mellitus tipo 2");
    expect(within(dm).getByText("0 questões").closest("button")).toBeNull();
    expect(within(dm).queryByRole("button", { name: /Treinar este tema/ })).toBeNull();
    expect(within(dm).getByRole("button", { name: "Me teste" })).toBeTruthy();
  });

  it("não há botão de favoritar (não existe favoritar tema no sistema; pendência em docs/temas-card.md)", async () => {
    await comAulaCarregada();
    expect(screen.queryByRole("button", { name: /favorit|marcar|salvar tema/i })).toBeNull();
    expect(document.querySelector(".gt-card [data-icon='bookmark'], .gt-card .sm-icon[style*='bookmark']")).toBeNull();
  });
});

describe("cartão do tema: botões", () => {
  it("com aula: 'Abrir a aula' é o principal, 'Treinar este tema' o secundário e 'Me teste' o terciário (estrela)", async () => {
    await comAulaCarregada();
    const tb = await cartao("Tuberculose pulmonar");
    expect(within(tb).getByRole("button", { name: /Abrir a aula/ }).className).toMatch(/gt-btn--pri/);
    expect(within(tb).getByRole("button", { name: "Treinar este tema" }).className).toMatch(/gt-btn--sec/);
    const teste = within(tb).getByRole("button", { name: "Me teste" });
    expect(teste.className).toMatch(/gt-btn--ter/);
    expect(teste.getAttribute("data-icon")).toBe("sparkle");
  });

  it("sem aula e com questões: 'Treinar este tema' vira o principal e não há 'Abrir a aula'", async () => {
    await comAulaCarregada();
    const avc = await cartao("Acidente vascular cerebral agudo");
    expect(within(avc).queryByRole("button", { name: /Abrir a aula/ })).toBeNull();
    expect(within(avc).getByRole("button", { name: "Treinar este tema" }).className).toMatch(/gt-btn--pri/);
  });

  it("'Treinar este tema' abre o treino com o filtro grande_tema; 'Me teste' abre o Tutor com o tema", async () => {
    await comAulaCarregada();
    const avc = await cartao("Acidente vascular cerebral agudo");
    fireEvent.click(within(avc).getByRole("button", { name: "Treinar este tema" }));
    await waitFor(() => expect(calls("app_start_session")[0][1]).toEqual({ p_kind: "questoes", p_filters: { grande_tema: "GR-014" }, p_count: 20 }));
    fireEvent.click(within(avc).getByRole("button", { name: "Me teste" }));
    expect(tutor[0]).toEqual({ mode: "perguntas", topic: "Acidente vascular cerebral agudo", context: { type: "theme", id: "GR-014", label: "Acidente vascular cerebral agudo", area: "Clínica Médica" } });
  });

  it("'Abrir a aula' abre a aula do tema", async () => {
    await comAulaCarregada();
    fireEvent.click(within(await cartao("Apendicite aguda")).getByRole("button", { name: /Abrir a aula/ }));
    await waitFor(() => expect(calls("app_tema_aula")[0][1]).toEqual({ p_tema_id: "GR-027" }));
  });
});

describe("cartão do tema: progresso da aula", () => {
  it("sem dado não mostra progresso", async () => {
    await comAulaCarregada();
    expect(screen.queryByText("Progresso da aula")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("depois de abrir a aula (7 de 10 seções estudadas) e voltar, o cartão mostra 70% concluído", async () => {
    await comAulaCarregada();
    fireEvent.click(within(await cartao("Tuberculose pulmonar")).getByRole("button", { name: /Abrir a aula/ }));
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(calls("app_lesson_notes")).toHaveLength(1));
    await waitFor(() => expect(screen.getAllByRole("progressbar", { name: "Seções estudadas" })[0].getAttribute("aria-valuenow")).toBe("7"));
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos temas" }));
    const tb = await cartao("Tuberculose pulmonar");
    expect(within(tb).getByText("Progresso da aula")).toBeTruthy();
    const barra = within(tb).getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("70");
    expect(barra.getAttribute("aria-valuetext")).toBe("70% concluído");
    expect(within(tb).getByText("70%")).toBeTruthy();
    expect(within(tb).getByText(/concluído/)).toBeTruthy();
    // só no tema aberto
    expect(within(await cartao("Apendicite aguda")).queryByRole("progressbar")).toBeNull();
    expect(calls("app_grandes_temas")).toHaveLength(1);
  });

  it("se as caixas da aula não carregarem, o cartão não inventa 0%", async () => {
    notas = new Error("falhou");
    await comAulaCarregada();
    fireEvent.click(within(await cartao("Tuberculose pulmonar")).getByRole("button", { name: /Abrir a aula/ }));
    await screen.findByText("Não foi possível carregar as suas anotações.");
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos temas" }));
    const tb = await cartao("Tuberculose pulmonar");
    expect(within(tb).queryByRole("progressbar")).toBeNull();
  });
});

describe("ilustrações em vidro", () => {
  it("cada cartão mostra a ilustração do seu motivo (genérico quando o motivo ainda não foi desenhado), sempre decorativa", async () => {
    await comAulaCarregada();
    const motivo = async (t: string) => (await cartao(t)).querySelector("svg.il")!;
    expect((await motivo("Tuberculose pulmonar")).getAttribute("data-motivo")).toBe("pulmao");
    expect((await motivo("Acidente vascular cerebral agudo")).getAttribute("data-motivo")).toBe("cerebro");
    expect((await motivo("Apendicite aguda")).getAttribute("data-motivo")).toBe("intestino");
    expect((await motivo("Diabetes mellitus tipo 2")).getAttribute("data-motivo")).toBe("generico");
    expect((await motivo("Psicoses e esquizofrenia")).getAttribute("data-motivo")).toBe("generico");
    for (const svg of Array.from(document.querySelectorAll("svg.il"))) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.closest("[aria-hidden='true']")).toBeTruthy();
    }
  });

  it("os motivos pedidos estão desenhados e cada desenho é só forma (sem texto, sem imagem) e com ids únicos por cartão", () => {
    for (const m of ["pulmao", "coracao", "cerebro", "rim", "utero", "feto", "osso", "microrganismo", "intestino", "recem-nascido", "casa"]) {
      expect(MOTIVOS[m as keyof typeof MOTIVOS].desenhado, m).toBe(true);
      expect(DESENHOS[m as keyof typeof DESENHOS], m).toBeTruthy();
      const { container } = render(
        <div>
          <IlustracaoTema motivo={m} cor="#90E7CD" />
          <IlustracaoTema motivo={m} />
        </div>
      );
      const svgs = container.querySelectorAll("svg");
      expect(svgs).toHaveLength(2);
      expect(svgs[0].getAttribute("data-motivo")).toBe(m);
      expect(container.querySelectorAll("image, img, text, foreignObject")).toHaveLength(0);
      expect(container.textContent).toBe("");
      expect(svgs[0].querySelectorAll("path").length).toBeGreaterThan(5);
      const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect((svgs[0] as SVGElement).style.getPropertyValue("--il-halo")).toBe("#90E7CD");
      cleanup();
    }
  });

  it("motivo desconhecido cai no genérico", () => {
    const { container } = render(<IlustracaoTema motivo="nao-existe" area="go" />);
    expect(container.querySelector("svg")!.getAttribute("data-motivo")).toBe("generico");
  });

  it("o mapa cobre os 100 temas, só com motivos existentes, e a marca 'desenhado' bate com os desenhos", () => {
    expect(Object.keys(MAPA_TEMAS)).toHaveLength(100);
    for (let n = 1; n <= 100; n += 1) expect(MAPA_TEMAS[`GR-${String(n).padStart(3, "0")}` as keyof typeof MAPA_TEMAS]).toBeTruthy();
    for (const m of Object.values(MAPA_TEMAS)) expect(MOTIVOS[m as keyof typeof MOTIVOS], m).toBeTruthy();
    for (const [m, v] of Object.entries(MOTIVOS)) expect(Boolean(DESENHOS[m as keyof typeof DESENHOS]), m).toBe(v.desenhado);
    expect(Object.keys(MOTIVOS).length).toBeGreaterThanOrEqual(30);
    expect(motivosQueFaltam()).not.toContain("pulmao");
    expect(motivoDesenhado("GR-001")).toBe("pulmao");
    expect(motivoDesenhado("GR-002")).toBe("generico");
    expect(motivoDesenhado("GR-999")).toBe("generico");
  });
});

describe("foto do tema (opcional; docs/temas-card-fotos.md)", () => {
  const base = DATA.themes[0];
  const montar = (foto?: any) => render(<TemaCartao t={{ ...base, foto }} aula progresso={undefined} starting={false} onAbrir={() => {}} onTreinar={() => {}} />);

  it("sem foto, o cartão usa o desenho em vidro", () => {
    const { container } = montar();
    expect(container.querySelector(".gt-foto")).toBeNull();
    expect(container.querySelector("svg.il")!.getAttribute("data-motivo")).toBe("pulmao");
  });

  it("com foto: WebP (e AVIF quando houver), carregamento preguiçoso, decorativa, foco à direita; sem o desenho", () => {
    const { container } = montar({ webp: "https://cdn.exemplo/tema-1.webp", avif: "https://cdn.exemplo/tema-1.avif", foco: 80 });
    const img = container.querySelector(".gt-foto img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.exemplo/tema-1.webp");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.style.objectPosition).toBe("80% 50%");
    expect(container.querySelector(".gt-foto source")!.getAttribute("type")).toBe("image/avif");
    expect(container.querySelector(".gt-foto")!.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("svg.il")).toBeNull();
    expect(container.querySelector(".gt-card")!.className).toMatch(/com-foto/);
  });

  it("se a foto não carregar, volta ao desenho", () => {
    const { container } = montar({ webp: "/temas/tema-1.webp" });
    fireEvent.error(container.querySelector(".gt-foto img")!);
    expect(container.querySelector(".gt-foto")).toBeNull();
    expect(container.querySelector("svg.il")).toBeTruthy();
  });

  it("endereço estranho (sem https) é ignorado e fica o desenho", () => {
    const { container } = montar({ webp: "javascript:alert(1)" });
    expect(container.querySelector(".gt-foto")).toBeNull();
    expect(container.querySelector("svg.il")).toBeTruthy();
  });
});
