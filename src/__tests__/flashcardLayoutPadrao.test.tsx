/**
 * Layout padrão do flashcard em TEXTO (15/10/2026, pedido do dono): todo cartão sem imagem ilustrada segue o padrão das aulas —
 * faixa com selos (área; Essencial; Atualizado mm/aaaa; Meu cartão), título do tema, rótulo Pergunta/Resposta, "toque para virar",
 * logo StaziaMed — na cor do tema/área (paleta v2, sem mostrar código de cor). Vale no baralho (plataforma e do aluno),
 * nas Atualizações e na prévia ao criar. Texto longo não é cortado: fonte menor e rolagem dentro do cartão.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));

import { CartaoFlashcard, mesAno, tamanhoTexto } from "../novo/app/review/CartaoFlashcard.jsx";
import { FlashcardsScreen } from "../novo/app/review/FlashcardsScreen.jsx";
import { FlashcardForm } from "../novo/app/review/FlashcardForm.jsx";
import { UpdatesScreen } from "../novo/app/study/UpdatesScreen.jsx";

afterEach(cleanup);
const HEX = /#[0-9A-F]{6}/i;
const frenteDe = (el: ParentNode = document) => el.querySelector(".fcp-frente") as HTMLElement;
const cartao = () => screen.getByRole("button", { name: /Mostrar (resposta|pergunta)/, pressed: false }) as HTMLElement;

describe("regras do layout", () => {
  it("tamanho da letra pelo comprimento (frente até 2000, verso até 4000) e data mm/aaaa", () => {
    expect(tamanhoTexto("Agente mais comum?")).toBe("xl");
    expect(tamanhoTexto("x".repeat(150))).toBe("lg");
    expect(tamanhoTexto("x".repeat(400))).toBe("md");
    expect(tamanhoTexto("x".repeat(2000))).toBe("sm");
    expect(tamanhoTexto("x".repeat(100), "verso")).toBe("xl");
    expect(tamanhoTexto("x".repeat(4000), "verso")).toBe("sm");
    expect(mesAno("2026-10-06T12:00:00Z")).toBe("10/2026");
    expect(mesAno(null)).toBeNull();
    expect(mesAno("não é data")).toBeNull();
  });
});

describe("CartaoFlashcard", () => {
  it("cartão da plataforma: selo da área, título do tema, Pergunta, toque para virar, logo nova e cor da área", () => {
    render(<CartaoFlashcard area="CLINICA_MEDICA" topic="Tuberculose pulmonar" front="Qual o tratamento?" back="RIPE por 6 meses." />);
    const c = cartao();
    expect(c.classList.contains("fcp")).toBe(true);
    expect(c.classList.contains("sm-flash--tema")).toBe(true);
    expect(c.style.getPropertyValue("--gt-p")).toBe("#087A63"); // Clínica Médica
    const frente = c.querySelector(".fcp-frente") as HTMLElement;
    expect(within(frente).getByText("Clínica Médica")).toBeTruthy();
    expect(within(frente).getByText("Tuberculose pulmonar")).toBeTruthy();
    expect(within(frente).getByText("Pergunta")).toBeTruthy();
    expect(within(frente).getByText(/toque para virar/)).toBeTruthy();
    expect(within(frente).queryByText("Meu cartão")).toBeNull();
    expect(frente.querySelector(".fcp-rodape .fcp-logo")).toBeTruthy(); // logo nova (fundo de CSS, /brand/horizontal-escuro-320w.png)
    expect(frente.querySelectorAll("img").length).toBe(0);
    expect(c.getAttribute("aria-describedby")).toBe(screen.getByText("Qual o tratamento?").id);
    expect(document.body.textContent).not.toMatch(HEX);
  });

  it("cartão do aluno: selo Meu cartão e a cor da área escolhida; sem área, a cor padrão e sem selo de área", () => {
    render(<CartaoFlashcard area="PEDIATRIA" topic="Bronquiolite" front="Agente?" back="VSR." selos={{ meu: true }} />);
    expect(within(frenteDe()).getByText("Meu cartão")).toBeTruthy();
    expect(within(frenteDe()).getByText("Pediatria").closest(".fcp-chip")).toBeTruthy();
    expect(cartao().style.getPropertyValue("--gt-p")).toBe("#086DA8"); // Pediatria
    cleanup();
    render(<CartaoFlashcard area="" topic="" front="Agente?" back="VSR." selos={{ meu: true }} />);
    expect(cartao().style.getPropertyValue("--gt-p")).toBe("#087A63"); // padrão
    expect(document.querySelectorAll(".fcp-frente .fcp-chip").length).toBe(1);
    expect(screen.getByText("Meus cartões", { selector: ".fcp-frente .fcp-titulo" })).toBeTruthy();
  });

  it("selos Essencial e Atualizado mm/aaaa só quando existem; cor do Grande Tema recebida", () => {
    render(<CartaoFlashcard area="GINECOLOGIA_OBSTETRICIA" topic="Pré-natal" front="F?" back="V." selos={{ essencial: true, atualizado: "10/2026" }} cores={{ "--gt-p": "#A94136", "--gt-e": "#791F18", "--gt-c": "#FFEEEB", "--gt-b": "#FEC2B8" }} />);
    const frente = document.querySelector(".fcp-frente") as HTMLElement;
    expect(within(frente).getByText("Essencial")).toBeTruthy();
    expect(within(frente).getByText("Atualizado 10/2026")).toBeTruthy();
    expect(cartao().style.getPropertyValue("--gt-p")).toBe("#A94136");
    cleanup();
    render(<CartaoFlashcard area="GINECOLOGIA_OBSTETRICIA" topic="Pré-natal" front="F?" back="V." selos={{ essencial: false, atualizado: null }} />);
    expect(screen.queryByText("Essencial")).toBeNull();
    expect(screen.queryByText(/Atualizado/)).toBeNull();
  });

  it("verso: vira por clique, espaço e Enter; o lado escondido sai da leitura de tela", () => {
    render(<CartaoFlashcard area="CIRURGIA_GERAL" topic="Trauma" front="Primeira prioridade?" back="Via aérea com proteção cervical." />);
    const c = cartao();
    const [frente, verso] = [c.querySelector(".fcp-frente")!, c.querySelector(".fcp-verso")!];
    expect(verso.getAttribute("aria-hidden")).toBe("true");
    expect(within(verso as HTMLElement).getByText("Resposta")).toBeTruthy();
    fireEvent.click(c);
    expect(c.getAttribute("aria-pressed")).toBe("true");
    expect(c.getAttribute("aria-label")).toBe("Mostrar pergunta");
    expect(c.getAttribute("aria-describedby")).toBe(screen.getByText("Via aérea com proteção cervical.").id);
    expect(frente.getAttribute("aria-hidden")).toBe("true");
    expect(verso.getAttribute("aria-hidden")).toBe("false");
    fireEvent.keyDown(c, { key: " " });
    expect(c.getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(c, { key: "Enter" });
    expect(c.getAttribute("aria-pressed")).toBe("true");
    expect(c.tabIndex).toBe(0);
  });

  it("texto longo (2000 / 4000): inteiro, letra de leitura e rolagem pelo teclado dentro do cartão", () => {
    const longoF = "Pergunta longa. ".repeat(125).slice(0, 2000);
    const longoV = "Resposta longa. ".repeat(250).slice(0, 4000);
    render(<CartaoFlashcard area="CLINICA_MEDICA" topic="Tema" front={longoF} back={longoV} />);
    const c = cartao();
    const pf = c.querySelector(".fcp-frente .fcp-t")!;
    const pv = c.querySelector(".fcp-verso .fcp-t")!;
    expect(pf.textContent).toBe(longoF);
    expect(pv.textContent).toBe(longoV);
    expect(pf.className).toContain("fcp-t--sm");
    expect(pv.className).toContain("fcp-t--sm");
    const rola = c.querySelector(".fcp-frente .fcp-rola") as HTMLElement;
    Object.defineProperty(rola, "scrollHeight", { value: 1200 });
    Object.defineProperty(rola, "clientHeight", { value: 300 });
    rola.scrollBy = vi.fn() as any;
    fireEvent.keyDown(c, { key: "ArrowDown" });
    expect(rola.scrollBy).toHaveBeenCalledWith({ top: 40 });
    fireEvent.keyDown(c, { key: "PageDown" });
    expect((rola.scrollBy as any).mock.calls[1][0].top).toBeCloseTo(255);
    expect(c.getAttribute("aria-pressed")).toBe("false"); // rolar não vira
  });
});

describe("texto maior que a caixa", () => {
  it("avisa 'role o texto para ler tudo' só quando o texto passa da caixa", () => {
    const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return this.classList?.contains("fcp-rola") && this.textContent.length > 500 ? 1200 : 100; } });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 300; } });
    try {
      render(<CartaoFlashcard area="CLINICA_MEDICA" topic="Tema" front="Curta?" back={"Resposta longa. ".repeat(100)} />);
      expect(document.querySelector(".fcp-frente .fcp-mais")).toBeNull();
      expect(document.querySelector(".fcp-verso .fcp-mais")!.textContent).toMatch(/role o texto para ler tudo/);
      expect(document.querySelector(".fcp-verso .fcp-rola")!.className).toContain("fcp-rola--mais");
    } finally {
      if (sh) Object.defineProperty(HTMLElement.prototype, "scrollHeight", sh);
      if (ch) Object.defineProperty(HTMLElement.prototype, "clientHeight", ch);
    }
  });
});

const CARD = (id: string, mine: boolean, area = "CLINICA_MEDICA") => ({ id, area, topic: "Tuberculose pulmonar", front: `Pergunta ${id}`, back: `Resposta ${id}`, mine, source_question_id: null, schedule: null });

describe("baralho e revisão", () => {
  beforeEach(() => {
    backend.rpc.mockReset();
  });

  it("cartão da plataforma sem imagem e cartão do aluno usam o layout padrão; só o do aluno tem Meu cartão", async () => {
    let queue = [CARD("c1", false), CARD("p1", true, "PEDIATRIA")];
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_flashcards") return { counts: { total: queue.length, new: queue.length, learning: 0, consolidated: 0, next_due: null }, queue };
      if (fn === "app_flashcards_ilustrados") return {};
      if (fn === "app_review_flashcard") return { due: null };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<FlashcardsScreen go={vi.fn()} />);
    await screen.findByText("Pergunta c1");
    expect(document.querySelector(".fcp")).toBeTruthy();
    expect(document.querySelectorAll(".al-flip").length).toBe(0); // não é o ilustrado
    expect(screen.queryByText("Meu cartão")).toBeNull();
    expect(within(document.querySelector(".fcp-frente") as HTMLElement).getByText("Tuberculose pulmonar")).toBeTruthy();
    // avaliar não muda: vira pelo botão, avalia e vai para o próximo cartão
    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar resposta" }).find((b) => !b.hasAttribute("aria-pressed"))!);
    fireEvent.click(await screen.findByRole("button", { name: /Bom/ }));
    expect(await screen.findByText("Pergunta p1")).toBeTruthy();
    expect(within(frenteDe()).getByText("Meu cartão")).toBeTruthy();
    expect((document.querySelector(".fcp") as HTMLElement).style.getPropertyValue("--gt-p")).toBe("#086DA8");
    expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_review_flashcard")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(HEX);
  });

  it("Novo flashcard: prévia no layout padrão com Meu cartão, na cor da área escolhida, virando para o verso", () => {
    render(<FlashcardForm initial={{}} onSaved={vi.fn()} />);
    const previa = screen.getByRole("group", { name: "Prévia do cartão" });
    expect(within(frenteDe(previa)).getByText("Meu cartão")).toBeTruthy();
    expect(within(previa).getByText("Sua pergunta aparece aqui.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Grande área"), { target: { value: "GINECOLOGIA_OBSTETRICIA" } });
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Pré-natal" } });
    fireEvent.change(screen.getByLabelText("Pergunta (frente)"), { target: { value: "Quando começar?" } });
    fireEvent.change(screen.getByLabelText("Resposta (verso)"), { target: { value: "Até a 12ª semana." } });
    const c = within(previa).getByRole("button", { name: "Mostrar resposta" });
    expect(c.style.getPropertyValue("--gt-p")).toBe("#A94136"); // Gineco & Obstetrícia
    expect(within(previa).getByText("Quando começar?")).toBeTruthy();
    expect(within(previa).getAllByText("Pré-natal").length).toBeGreaterThan(0);
    fireEvent.click(c);
    expect(c.getAttribute("aria-pressed")).toBe("true");
    expect(within(previa).getByText("Até a 12ª semana.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Salvar flashcard/ })).toBeTruthy();
  });

  it("Criar flashcard da correção (compacto): prévia recolhida em Ver como o cartão vai ficar", () => {
    render(<FlashcardForm compact initial={{ area: "PEDIATRIA" }} onSaved={vi.fn()} />);
    expect(screen.getByText("Ver como o cartão vai ficar").closest("details")).toBeTruthy();
  });
});

describe("Atualizações (aba Flashcards)", () => {
  it("layout padrão com Essencial, Atualizado mm/aaaa, título do tema e cor do Grande Tema", async () => {
    const ASMA = {
      id: "1", slug: "atual-2026-10-14-gr-016", area: "CLINICA_MEDICA", topic: "Asma no adulto", subtopic: "Pneumologia", years: [2026], priority: 1,
      publication_label: "2026", institution: "MS (teste)", document_title: "PCDT", source_url: "https://www.gov.br/teste", before_text: "Antes.", current_conduct: "Agora.",
      reviewed: true, reviewed_at: "2026-10-06T12:00:00Z", published: true,
    };
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_guideline_updates") return { total: 1, by_area: { CLINICA_MEDICA: 1 }, years: [2026], items: [ASMA] };
      if (fn === "app_guideline_update") return { ...ASMA, flashcards: [{ front: "Pergunta da asma?", back: "Resposta da asma." }], practice_questions: [] };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    window.localStorage.clear();
    render(<UpdatesScreen go={vi.fn()} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Ver o que mudou: Asma no adulto/ }))[0]);
    await screen.findByRole("heading", { name: "Asma no adulto" });
    fireEvent.click(screen.getByRole("tab", { name: "Flashcards" }));
    const c = screen.getByRole("button", { name: "Mostrar resposta" });
    expect(c.classList.contains("fcp")).toBe(true);
    expect(c.style.getPropertyValue("--gt-p")).toBe("#075A49"); // GR-016
    const frente = c.querySelector(".fcp-frente") as HTMLElement;
    expect(within(frente).getByText("Essencial")).toBeTruthy();
    expect(within(frente).getByText("Atualizado 10/2026")).toBeTruthy();
    expect(within(frente).getByText("Asma no adulto")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/#[0-9A-F]{6}|GR-\d{3}/i);
  });
});
